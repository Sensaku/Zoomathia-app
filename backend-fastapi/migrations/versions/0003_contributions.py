"""Contributions behind accounts: author, review, codes, dates, version, anti-duplicate key.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-16

Rebuilds `staged_annotations` and `thesaurus_proposals` (RM-CTB-03, RM-CTB-04, RM-MOD-03):

- the French status labels become the codes `pending`, `validated` and `rejected`;
- `annotator_name` / `contributor_name` become `author_label` (a historical author, RM-CTB-06),
  next to `author_id`, the review columns and a `version` column;
- ISO text dates become naive UTC datetimes (`app.core.database.UtcDateTime`);
- the JSON columns are repaired, and `pref_label_key` plus a partial unique index make the
  anti-duplicate rule of proposals atomic (RM-THE-04).

Nothing is guessed: an unknown status, an unreadable date or historical pending duplicates
abort the migration, before any change, with the offending ids. `AUTOINCREMENT` and its
counter are kept, so that an id is never reused (RM-PUB-03). The downgrade restores the
revision 0002 shape without losing a row.

This file is self-contained on purpose: a migration must keep working when the application
code changes, so it does not import the models nor `label_key`.
"""

import json
import unicodedata
from collections import defaultdict
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.engine import Connection

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ANONYMOUS = "Chercheur anonyme"
STORAGE_FORMAT = "%Y-%m-%d %H:%M:%S.%f"
DEFAULT_SCOPE = "word_sequence"

# Status labels of revision 0002 and their codes (a NULL or empty value is the legacy default).
ANNOTATION_STATUSES = {
    "En attente de validation": "pending",
    "Validé": "validated",
    "Rejeté": "rejected",
}
PROPOSAL_STATUSES = {
    "En attente de révision": "pending",
    "Validé": "validated",
    "Rejeté": "rejected",
}


class UnmigratableDataError(RuntimeError):
    """A stored row cannot be converted without guessing; an admin must fix it by hand."""


# --- conversions (also used by the downgrade, in the other direction) ---


def label_key(label: str) -> str:
    """The anti-duplicate key of a label: NFKC, collapsed whitespace, case-folded."""
    return " ".join(unicodedata.normalize("NFKC", label).split()).casefold()


def storage_date(value: object) -> str:
    """An ISO text date as naive UTC text; a date without an offset is taken as UTC."""
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None).strftime(STORAGE_FORMAT)


def iso_date(value: object) -> str:
    """A naive UTC text date as the ISO text that revision 0002 wrote."""
    parsed = datetime.strptime(str(value), STORAGE_FORMAT).replace(tzinfo=timezone.utc)
    return parsed.isoformat()


def is_list_of_strings(raw: object) -> bool:
    """Whether `raw` is the JSON text of an array of strings."""
    try:
        value = json.loads(str(raw))
    except (TypeError, ValueError):
        return False
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def repaired_paragraphs(row: dict[str, Any]) -> str:
    """The covered paragraphs: the stored array, or the one `add_annotation` would have built."""
    raw = row["target_paragraphs"]
    if raw and is_list_of_strings(raw) and json.loads(raw):
        return str(raw)
    paragraphs = [row["paragraph_uri"]]
    end = row["end_paragraph_uri"]
    if end and end not in paragraphs:
        paragraphs.append(end)
    return json.dumps(paragraphs, ensure_ascii=False)


def repaired_alt_labels(raw: object) -> str:
    """The alternative labels: the stored array, or an empty one."""
    return str(raw) if raw and is_list_of_strings(raw) else "[]"


def historical_author(name: object) -> str:
    """The free-text author of a historical row; an empty one is the legacy default."""
    return str(name) if name and str(name).strip() else ANONYMOUS


def status_code(label: object, codes: dict[str, str]) -> str | None:
    """The code of a legacy status label, or None when the label is unknown."""
    return "pending" if not label else codes.get(str(label))


# --- SQL ---


def review_columns() -> str:
    return """
        author_id INTEGER,
        author_label TEXT,
        status VARCHAR(20) NOT NULL,
        reviewer_id INTEGER,
        reviewed_at DATETIME,
        rejection_reason TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME,
        version INTEGER NOT NULL DEFAULT 1"""


def review_constraints(table: str) -> str:
    def check(name: str, expression: str) -> str:
        return f"CONSTRAINT ck_{table}_{name} CHECK ({expression})"

    return ",\n        ".join(
        [
            f"CONSTRAINT fk_{table}_author_id_users FOREIGN KEY (author_id) REFERENCES users (id)",
            f"CONSTRAINT fk_{table}_reviewer_id_users FOREIGN KEY (reviewer_id)"
            " REFERENCES users (id)",
            check("author_xor_label", "(author_id IS NULL) <> (author_label IS NULL)"),
            check("status", "status IN ('pending', 'validated', 'rejected')"),
            check("reviewer_and_date", "(reviewer_id IS NULL) = (reviewed_at IS NULL)"),
            check("pending_not_reviewed", "status <> 'pending' OR reviewer_id IS NULL"),
            check(
                "rejection_reason",
                "status <> 'rejected' OR reviewer_id IS NULL OR rejection_reason IS NOT NULL",
            ),
        ]
    )


def new_annotations_table(name: str) -> str:
    return f"""
    CREATE TABLE {name} (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        paragraph_uri TEXT NOT NULL,
        target_text TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        concept_uri TEXT NOT NULL,
        concept_label TEXT NOT NULL,
        concept_type TEXT NOT NULL,
        justification TEXT,
        scope_type TEXT NOT NULL,
        end_paragraph_uri TEXT,
        target_paragraphs TEXT NOT NULL,{review_columns()},
        {review_constraints("staged_annotations")},
        CONSTRAINT ck_staged_annotations_target_paragraphs_json CHECK (
            json_valid(target_paragraphs) AND json_type(target_paragraphs) = 'array')
    )"""


def new_proposals_table(name: str) -> str:
    return f"""
    CREATE TABLE {name} (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        pref_label TEXT NOT NULL,
        pref_label_key TEXT NOT NULL,
        language TEXT NOT NULL,
        alt_labels TEXT NOT NULL,
        broader_concept_uri TEXT,
        broader_concept_label TEXT,
        definition TEXT,{review_columns()},
        {review_constraints("thesaurus_proposals")},
        CONSTRAINT ck_thesaurus_proposals_alt_labels_json CHECK (
            json_valid(alt_labels) AND json_type(alt_labels) = 'array')
    )"""


def old_annotations_table(name: str) -> str:
    return f"""
    CREATE TABLE {name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paragraph_uri TEXT NOT NULL,
        target_text TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        concept_uri TEXT NOT NULL,
        concept_label TEXT NOT NULL,
        concept_type TEXT NOT NULL,
        annotator_name TEXT NOT NULL,
        justification TEXT,
        scope_type TEXT NOT NULL DEFAULT 'word_sequence',
        end_paragraph_uri TEXT,
        target_paragraphs TEXT,
        status TEXT NOT NULL DEFAULT 'En attente de validation',
        created_at TEXT NOT NULL
    )"""


def old_proposals_table(name: str) -> str:
    return f"""
    CREATE TABLE {name} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pref_label TEXT NOT NULL,
        language TEXT NOT NULL,
        alt_labels TEXT NOT NULL,
        broader_concept_uri TEXT,
        broader_concept_label TEXT,
        definition TEXT,
        contributor_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
    )"""


INDEXES = """
    CREATE INDEX ix_staged_annotations_status ON staged_annotations (status);
    CREATE INDEX ix_staged_annotations_author_id ON staged_annotations (author_id);
    CREATE INDEX ix_staged_annotations_paragraph_uri ON staged_annotations (paragraph_uri);
    CREATE INDEX ix_thesaurus_proposals_status ON thesaurus_proposals (status);
    CREATE INDEX ix_thesaurus_proposals_author_id ON thesaurus_proposals (author_id);
    CREATE UNIQUE INDEX uq_thesaurus_proposals_pending_label
        ON thesaurus_proposals (pref_label_key, language) WHERE status = 'pending'
"""


def read_rows(connection: Connection, table: str) -> list[dict[str, Any]]:
    result = connection.exec_driver_sql(f"SELECT * FROM {table} ORDER BY id")  # noqa: S608
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
    connection: Connection,
    table: str,
    create_new: Callable[[str], str],
    rows: list[dict[str, Any]],
) -> None:
    """Replace `table` by a rebuilt one holding `rows`, keeping its `AUTOINCREMENT` counter."""
    seq = counter(connection, table)
    temporary = f"{table}_rebuilt"
    connection.exec_driver_sql(f"DROP TABLE IF EXISTS {temporary}")
    connection.exec_driver_sql(create_new(temporary))
    insert_rows(connection, temporary, rows)
    connection.exec_driver_sql(f"DROP TABLE {table}")
    connection.exec_driver_sql(f"ALTER TABLE {temporary} RENAME TO {table}")
    restore_counter(connection, table, seq)


# --- upgrade ---


def convert_annotations(rows: list[dict[str, Any]], problems: list[str]) -> list[dict[str, Any]]:
    converted = []
    for row in rows:
        code = status_code(row["status"], ANNOTATION_STATUSES)
        try:
            created_at = storage_date(row["created_at"])
        except ValueError:
            problems.append(f"annotation {row['id']}: unreadable date")
            continue
        if code is None:
            problems.append(f"annotation {row['id']}: unknown status")
            continue
        converted.append(
            {
                "id": row["id"],
                "paragraph_uri": row["paragraph_uri"],
                "target_text": row["target_text"],
                "start_offset": row["start_offset"],
                "end_offset": row["end_offset"],
                "concept_uri": row["concept_uri"],
                "concept_label": row["concept_label"],
                "concept_type": row["concept_type"],
                "justification": row["justification"],
                "scope_type": row["scope_type"] or DEFAULT_SCOPE,
                "end_paragraph_uri": row["end_paragraph_uri"],
                "target_paragraphs": repaired_paragraphs(row),
                "author_label": historical_author(row["annotator_name"]),
                "status": code,
                "created_at": created_at,
            }
        )
    return converted


def convert_proposals(rows: list[dict[str, Any]], problems: list[str]) -> list[dict[str, Any]]:
    converted = []
    pending: dict[tuple[str, str], list[int]] = defaultdict(list)
    for row in rows:
        code = status_code(row["status"], PROPOSAL_STATUSES)
        try:
            created_at = storage_date(row["created_at"])
        except ValueError:
            problems.append(f"proposal {row['id']}: unreadable date")
            continue
        if code is None:
            problems.append(f"proposal {row['id']}: unknown status")
            continue
        key = label_key(row["pref_label"])
        if code == "pending":
            pending[(key, row["language"])].append(row["id"])
        converted.append(
            {
                "id": row["id"],
                "pref_label": row["pref_label"],
                "pref_label_key": key,
                "language": row["language"],
                "alt_labels": repaired_alt_labels(row["alt_labels"]),
                "broader_concept_uri": row["broader_concept_uri"],
                "broader_concept_label": row["broader_concept_label"],
                "definition": row["definition"],
                "author_label": historical_author(row["contributor_name"]),
                "status": code,
                "created_at": created_at,
            }
        )
    for ids in pending.values():
        if len(ids) > 1:
            problems.append(f"proposals {ids}: the same term is pending several times")
    return converted


def with_review_defaults(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Add the review columns of a historical row: no account, no reviewer, version 1."""
    return [
        {
            **row,
            "author_id": None,
            "reviewer_id": None,
            "reviewed_at": None,
            "rejection_reason": None,
            "updated_at": None,
            "version": 1,
        }
        for row in rows
    ]


def upgrade() -> None:
    connection = op.get_bind()
    problems: list[str] = []
    annotations = convert_annotations(read_rows(connection, "staged_annotations"), problems)
    proposals = convert_proposals(read_rows(connection, "thesaurus_proposals"), problems)
    if problems:
        raise UnmigratableDataError(
            "Revision 0003 cannot convert the stored contributions without guessing; "
            "fix these rows by hand, then run the migration again: " + "; ".join(problems)
        )
    begin_atomic(connection)
    swap_table(
        connection,
        "staged_annotations",
        new_annotations_table,
        with_review_defaults(annotations),
    )
    swap_table(
        connection,
        "thesaurus_proposals",
        new_proposals_table,
        with_review_defaults(proposals),
    )
    for statement in INDEXES.split(";"):
        connection.exec_driver_sql(statement)


# --- downgrade ---


def author_names(connection: Connection) -> dict[int, str]:
    result = connection.exec_driver_sql("SELECT id, display_name FROM users")
    return {int(row[0]): str(row[1]) for row in result}


def old_author(row: dict[str, Any], names: dict[int, str]) -> str:
    """The free-text author of revision 0002: the historical label, or the account's name."""
    if row["author_label"] is not None:
        return str(row["author_label"])
    return names.get(int(row["author_id"]), ANONYMOUS)


def downgrade_annotation(row: dict[str, Any], names: dict[int, str]) -> dict[str, Any]:
    labels = {code: label for label, code in ANNOTATION_STATUSES.items()}
    return {
        **{
            key: row[key]
            for key in (
                "id",
                "paragraph_uri",
                "target_text",
                "start_offset",
                "end_offset",
                "concept_uri",
                "concept_label",
                "concept_type",
                "justification",
                "scope_type",
                "end_paragraph_uri",
                "target_paragraphs",
            )
        },
        "annotator_name": old_author(row, names),
        "status": labels[row["status"]],
        "created_at": iso_date(row["created_at"]),
    }


def downgrade_proposal(row: dict[str, Any], names: dict[int, str]) -> dict[str, Any]:
    labels = {code: label for label, code in PROPOSAL_STATUSES.items()}
    return {
        **{
            key: row[key]
            for key in (
                "id",
                "pref_label",
                "language",
                "alt_labels",
                "broader_concept_uri",
                "broader_concept_label",
                "definition",
            )
        },
        "contributor_name": old_author(row, names),
        "status": labels[row["status"]],
        "created_at": iso_date(row["created_at"]),
    }


def downgrade() -> None:
    connection = op.get_bind()
    names = author_names(connection)
    annotations = [
        downgrade_annotation(row, names) for row in read_rows(connection, "staged_annotations")
    ]
    proposals = [
        downgrade_proposal(row, names) for row in read_rows(connection, "thesaurus_proposals")
    ]
    begin_atomic(connection)
    swap_table(connection, "staged_annotations", old_annotations_table, annotations)
    swap_table(connection, "thesaurus_proposals", old_proposals_table, proposals)
