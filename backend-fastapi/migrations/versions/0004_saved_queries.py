"""Saved queries behind accounts: author, dates, integrity constraints.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-16

Rebuilds `saved_queries` (RM-QC-06):

- `author_name` becomes `author_label` (a historical or native author, with no account), next
  to `author_id`, the account that saved the query;
- ISO text dates become naive UTC datetimes (`app.core.database.UtcDateTime`);
- two CHECK constraints: exactly one of `author_id` and `author_label`, and no account for a
  native competency question.

Nothing is guessed: an unreadable date or an `is_builtin` that is neither 0 nor 1 aborts the
migration, before any change, with the offending ids. `AUTOINCREMENT` and its counter are
kept, so that an id is never reused. An empty name becomes the old default
"Chercheur Zoomathia" ("Équipe scientifique Zoomathia" for a native question). The downgrade
restores the revision 0001 shape without losing a row.

This file is self-contained on purpose, like revision 0003: a migration must keep working
when the application code changes, so it does not import the models.
"""

from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_AUTHOR = "Chercheur Zoomathia"
NATIVE_AUTHOR = "Équipe scientifique Zoomathia"
STORAGE_FORMAT = "%Y-%m-%d %H:%M:%S.%f"
TABLE = "saved_queries"
KEPT_COLUMNS = (
    "id",
    "title",
    "description",
    "query_text",
    "query_spo_text",
    "category",
    "is_builtin",
)


class UnmigratableDataError(RuntimeError):
    """A stored row cannot be converted without guessing; an admin must fix it by hand."""


# --- conversions (also used by the downgrade, in the other direction) ---


def storage_date(value: object) -> str:
    """An ISO text date as naive UTC text; a date without an offset is taken as UTC."""
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None).strftime(STORAGE_FORMAT)


def iso_date(value: object) -> str:
    """A naive UTC text date as the ISO text that revision 0001 wrote."""
    parsed = datetime.strptime(str(value), STORAGE_FORMAT).replace(tzinfo=timezone.utc)
    return parsed.isoformat()


def historical_author(name: object, is_builtin: bool) -> str:
    """The free-text author of a row without account; an empty name is the legacy default."""
    if name and str(name).strip():
        return str(name)
    return NATIVE_AUTHOR if is_builtin else DEFAULT_AUTHOR


# --- SQL ---


def new_table(name: str) -> str:
    return f"""
    CREATE TABLE {name} (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        query_text TEXT NOT NULL,
        query_spo_text TEXT,
        category TEXT NOT NULL,
        author_id INTEGER,
        author_label TEXT,
        is_builtin BOOLEAN NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        CONSTRAINT fk_saved_queries_author_id_users FOREIGN KEY (author_id)
            REFERENCES users (id),
        CONSTRAINT ck_saved_queries_author_xor_label
            CHECK ((author_id IS NULL) <> (author_label IS NULL)),
        CONSTRAINT ck_saved_queries_builtin_has_no_account
            CHECK (is_builtin = 0 OR author_id IS NULL)
    )"""


def old_table(name: str) -> str:
    return f"""
    CREATE TABLE {name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        query_text TEXT NOT NULL,
        query_spo_text TEXT,
        category TEXT NOT NULL,
        author_name TEXT NOT NULL,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )"""


def read_rows(connection: Connection) -> list[dict[str, Any]]:
    result = connection.exec_driver_sql(f"SELECT * FROM {TABLE} ORDER BY id")  # noqa: S608
    return [dict(row) for row in result.mappings()]


def insert_rows(connection: Connection, table: str, rows: list[dict[str, Any]]) -> None:
    """Insert `rows` (dicts with the same keys) with bound parameters."""
    if not rows:
        return
    columns = list(rows[0])
    placeholders = ", ".join(f":{column}" for column in columns)
    statement = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"  # noqa: S608
    connection.execute(sa.text(statement), rows)


def counter(connection: Connection, table: str) -> int | None:
    """The `AUTOINCREMENT` counter of a table: the highest id that it ever gave."""
    row = connection.exec_driver_sql(
        "SELECT seq FROM sqlite_sequence WHERE name = ?", (table,)
    ).first()
    return None if row is None else int(row[0])


def restore_counter(connection: Connection, table: str, seq: int | None) -> None:
    """Never let the counter of a rebuilt table fall below the old one (ids are never reused)."""
    if seq is None:
        return
    current = counter(connection, table)
    if current is None:
        connection.exec_driver_sql(
            "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", (table, seq)
        )
    elif current < seq:
        connection.exec_driver_sql(
            "UPDATE sqlite_sequence SET seq = ? WHERE name = ?", (seq, table)
        )


def begin_atomic(connection: Connection) -> None:
    """Open a SQLite transaction now, so that the DDL below rolls back with the data.

    pysqlite only begins a transaction at the first DML statement; without this, a failure
    after a `DROP TABLE` could leave the database half converted.
    """
    raw: Any = connection.connection.dbapi_connection
    if not raw.in_transaction:
        connection.exec_driver_sql("BEGIN")


def swap_table(
    connection: Connection, create_new: Callable[[str], str], rows: list[dict[str, Any]]
) -> None:
    """Replace the table by a rebuilt one holding `rows`, keeping its `AUTOINCREMENT` counter."""
    seq = counter(connection, TABLE)
    temporary = f"{TABLE}_rebuilt"
    connection.exec_driver_sql(f"DROP TABLE IF EXISTS {temporary}")
    connection.exec_driver_sql(create_new(temporary))
    insert_rows(connection, temporary, rows)
    connection.exec_driver_sql(f"DROP TABLE {TABLE}")
    connection.exec_driver_sql(f"ALTER TABLE {temporary} RENAME TO {TABLE}")
    restore_counter(connection, TABLE, seq)


# --- upgrade ---


def convert(rows: list[dict[str, Any]], problems: list[str]) -> list[dict[str, Any]]:
    converted = []
    for row in rows:
        if row["is_builtin"] not in (0, 1):
            problems.append(f"query {row['id']}: is_builtin is neither 0 nor 1")
            continue
        try:
            created_at = storage_date(row["created_at"])
            updated_at = storage_date(row["updated_at"])
        except ValueError:
            problems.append(f"query {row['id']}: unreadable date")
            continue
        converted.append(
            {
                **{column: row[column] for column in KEPT_COLUMNS},
                "author_id": None,
                "author_label": historical_author(row["author_name"], bool(row["is_builtin"])),
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
    return converted


def upgrade() -> None:
    connection = op.get_bind()
    problems: list[str] = []
    rows = convert(read_rows(connection), problems)
    if problems:
        raise UnmigratableDataError(
            "Revision 0004 cannot convert the saved queries without guessing; "
            "fix these rows by hand, then run the migration again: " + "; ".join(problems)
        )
    begin_atomic(connection)
    swap_table(connection, new_table, rows)
    connection.exec_driver_sql(
        "CREATE INDEX ix_saved_queries_author_id ON saved_queries (author_id)"
    )


# --- downgrade ---


def downgrade() -> None:
    connection = op.get_bind()
    result = connection.exec_driver_sql("SELECT id, display_name FROM users")
    names = {int(row[0]): str(row[1]) for row in result}
    rows = []
    for row in read_rows(connection):
        author = row["author_label"]
        if author is None:
            author = names.get(int(row["author_id"]), DEFAULT_AUTHOR)
        rows.append(
            {
                **{column: row[column] for column in KEPT_COLUMNS},
                "author_name": author,
                "created_at": iso_date(row["created_at"]),
                "updated_at": iso_date(row["updated_at"]),
            }
        )
    begin_atomic(connection)
    swap_table(connection, old_table, rows)
