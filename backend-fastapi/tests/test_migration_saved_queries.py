"""Revision 0004: saved queries behind accounts (RM-QC-06, RM-QC-02).

The tests start from a database as revision 0003 left it, fill it with the awkward rows that
the old application could write (ISO dates with an offset, an empty author, native questions,
a deleted highest id), and check what the migration does: convert without losing a row, keep
the id counter, refuse bad rows afterwards, abort on what it cannot convert without guessing,
and go back down without losing a row.
"""

import sqlite3
from pathlib import Path
from typing import Any

import pytest
from alembic import command

from app.core.migrations import alembic_config
from tests.test_migrations import column_names, recorded_revisions, sqlite_url

COLUMNS = (
    "title, description, query_text, query_spo_text, category, author_name, is_builtin,"
    " created_at, updated_at"
)
TEXT = "SELECT ?s WHERE { ?s ?p ?o } LIMIT 5"

LEGACY_QUERIES: list[tuple[Any, ...]] = [
    ("Native", "goal", TEXT, TEXT, "Question de compétence", "Équipe scientifique Zoomathia", 1,
     "2025-01-01T00:00:00+00:00", "2025-01-01T00:00:00+00:00"),
    ("Personal", None, TEXT, None, "Faune", "Ada", 0,
     "2025-03-04T10:00:00+02:00", "2025-03-05T10:00:00.500000"),
    ("No author", "d", TEXT, None, "Faune", "", 0,
     "2025-05-06T07:08:09.123456", "2025-05-06T07:08:09.123456"),
    ("Native no author", None, TEXT, None, "Question de compétence", "  ", 1,
     "2025-06-01T12:00:00Z", "2025-06-01T12:00:00Z"),
    ("Gone", None, TEXT, None, "Faune", "Gone", 0,
     "2025-06-02T12:00:00+00:00", "2025-06-02T12:00:00+00:00"),  # id 5, deleted
]  # fmt: skip


def legacy_database(path: Path) -> sqlite3.Connection:
    """A database as revision 0003 leaves it, with the rows above; id 5 was deleted."""
    command.upgrade(alembic_config(sqlite_url(path)), "0003")
    connection = sqlite3.connect(path)
    connection.executemany(
        f"INSERT INTO saved_queries ({COLUMNS}) VALUES ({', '.join('?' * 9)})",  # noqa: S608
        LEGACY_QUERIES,
    )
    connection.execute("DELETE FROM saved_queries WHERE id = 5")
    connection.commit()
    return connection


@pytest.fixture
def upgraded(tmp_path: Path) -> sqlite3.Connection:
    path = tmp_path / "upgraded.db"
    legacy_database(path).close()
    command.upgrade(alembic_config(sqlite_url(path)), "0004")
    return sqlite3.connect(path)


def rows(connection: sqlite3.Connection, sql: str) -> list[tuple[Any, ...]]:
    return connection.execute(sql).fetchall()


# --- upgrade ---


def test_the_names_become_labels_and_an_empty_name_gets_its_legacy_default(
    upgraded: sqlite3.Connection,
) -> None:
    result = rows(
        upgraded,
        "SELECT id, author_id, author_label, is_builtin FROM saved_queries ORDER BY id",
    )

    assert result == [
        (1, None, "Équipe scientifique Zoomathia", 1),
        (2, None, "Ada", 0),
        (3, None, "Chercheur Zoomathia", 0),
        (4, None, "Équipe scientifique Zoomathia", 1),
    ]


def test_the_dates_become_naive_utc_text(upgraded: sqlite3.Connection) -> None:
    dates = rows(upgraded, "SELECT created_at, updated_at FROM saved_queries ORDER BY id")

    assert dates == [
        ("2025-01-01 00:00:00.000000", "2025-01-01 00:00:00.000000"),
        ("2025-03-04 08:00:00.000000", "2025-03-05 10:00:00.500000"),  # +02:00 to UTC; no offset
        ("2025-05-06 07:08:09.123456", "2025-05-06 07:08:09.123456"),
        ("2025-06-01 12:00:00.000000", "2025-06-01 12:00:00.000000"),  # Z
    ]


def test_the_other_columns_are_kept(upgraded: sqlite3.Connection) -> None:
    result = rows(
        upgraded,
        "SELECT id, title, description, query_text, query_spo_text, category FROM saved_queries"
        " ORDER BY id",
    )

    assert result[0] == (1, "Native", "goal", TEXT, TEXT, "Question de compétence")
    assert result[1] == (2, "Personal", None, TEXT, None, "Faune")


def test_the_id_counter_is_kept_so_that_a_deleted_id_is_never_reused(
    upgraded: sqlite3.Connection,
) -> None:
    new_id = upgraded.execute(
        "INSERT INTO saved_queries (title, query_text, category, author_label, created_at,"
        " updated_at) VALUES ('t', 'q', 'c', 'x', '2026-01-01 00:00:00.000000',"
        " '2026-01-01 00:00:00.000000')"
    ).lastrowid

    assert new_id == 6  # the deleted id 5 stays burnt


def test_the_table_keeps_its_name_and_the_revision_is_recorded(
    upgraded: sqlite3.Connection, tmp_path: Path
) -> None:
    path = tmp_path / "upgraded.db"
    names = {r[0] for r in rows(upgraded, "SELECT name FROM sqlite_master")}

    assert not any(name.endswith("_rebuilt") for name in names)
    assert "ix_saved_queries_author_id" in names
    assert recorded_revisions(path) == {"0004"}
    assert "author_name" not in column_names(path, "saved_queries")
    assert {"author_id", "author_label"} <= column_names(path, "saved_queries")


# --- the constraints refuse bad rows ---

BASE = {
    "title": "t",
    "query_text": "q",
    "category": "c",
    "author_label": "x",
    "is_builtin": 0,
    "created_at": "2026-01-01 00:00:00.000000",
    "updated_at": "2026-01-01 00:00:00.000000",
}


def insert_query(connection: sqlite3.Connection, **changes: Any) -> None:
    row = {**BASE, **changes}
    connection.execute(
        f"INSERT INTO saved_queries ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",  # noqa: S608
        tuple(row.values()),
    )


@pytest.fixture
def with_account(upgraded: sqlite3.Connection) -> sqlite3.Connection:
    upgraded.execute(
        "INSERT INTO users (email, display_name, affiliation, password_hash, role, status,"
        " license_accepted_at, created_at) VALUES ('a@example.org', 'Ada Lovelace', 'Lab', 'h',"
        " 'contributor', 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000')"
    )
    upgraded.commit()  # the foreign key pragma is a no-op inside a transaction
    return upgraded


@pytest.mark.parametrize(
    "changes",
    [
        {"author_label": None},  # neither an account nor an author name
        {"author_id": 1},  # both
        {"author_label": None, "author_id": 999},  # an account that does not exist
        {
            "author_label": None,
            "author_id": 1,
            "is_builtin": 1,
        },  # a native question with an account
    ],
)
def test_the_constraints_refuse_a_bad_row(
    with_account: sqlite3.Connection, changes: dict[str, Any]
) -> None:
    with_account.execute("PRAGMA foreign_keys = ON")

    with pytest.raises(sqlite3.IntegrityError):
        insert_query(with_account, **changes)


@pytest.mark.parametrize(
    "changes",
    [{}, {"author_label": None, "author_id": 1}, {"is_builtin": 1}],
)
def test_the_constraints_accept_a_good_row(
    with_account: sqlite3.Connection, changes: dict[str, Any]
) -> None:
    with_account.execute("PRAGMA foreign_keys = ON")

    insert_query(with_account, **changes)


def test_an_account_that_saved_a_query_cannot_be_deleted(with_account: sqlite3.Connection) -> None:
    with_account.execute("PRAGMA foreign_keys = ON")
    insert_query(with_account, author_label=None, author_id=1)

    with pytest.raises(sqlite3.IntegrityError):
        with_account.execute("DELETE FROM users WHERE id = 1")


# --- what the migration refuses to guess ---


def refuses(tmp_path: Path, break_it: str, message: str) -> Path:
    path = tmp_path / "refused.db"
    connection = legacy_database(path)
    connection.execute(break_it)
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match=message):
        command.upgrade(alembic_config(sqlite_url(path)), "0004")

    return path


@pytest.mark.parametrize(
    ("break_it", "message"),
    [
        ("UPDATE saved_queries SET created_at = 'yesterday' WHERE id = 2", r"query 2: unreadable"),
        ("UPDATE saved_queries SET updated_at = '' WHERE id = 3", r"query 3: unreadable"),
        ("UPDATE saved_queries SET is_builtin = 2 WHERE id = 4", r"query 4: is_builtin"),
    ],
)
def test_the_migration_aborts_with_the_ids_and_changes_nothing(
    tmp_path: Path, break_it: str, message: str
) -> None:
    path = refuses(tmp_path, break_it, message)

    assert recorded_revisions(path) == {"0003"}
    assert "author_name" in column_names(path, "saved_queries")
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM saved_queries").fetchone() == (4,)


def test_a_fixed_database_can_then_be_migrated(tmp_path: Path) -> None:
    path = refuses(
        tmp_path, "UPDATE saved_queries SET created_at = 'yesterday' WHERE id = 2", "unreadable"
    )
    with sqlite3.connect(path) as connection:
        connection.execute("UPDATE saved_queries SET created_at = '2025-01-01' WHERE id = 2")

    command.upgrade(alembic_config(sqlite_url(path)), "0004")

    assert recorded_revisions(path) == {"0004"}


# --- downgrade ---


def test_the_downgrade_restores_revision_0003_without_losing_a_row(
    with_account: sqlite3.Connection, tmp_path: Path
) -> None:
    path = tmp_path / "upgraded.db"
    insert_query(
        with_account,
        author_label=None,
        author_id=1,
        created_at="2026-02-03 04:05:06.000007",
        updated_at="2026-02-04 00:00:00.000000",
    )
    with_account.commit()
    with_account.close()

    command.downgrade(alembic_config(sqlite_url(path)), "0003")

    with sqlite3.connect(path) as connection:
        result = connection.execute(
            "SELECT id, author_name, is_builtin, created_at, updated_at FROM saved_queries"
            " ORDER BY id"
        ).fetchall()
        counter = connection.execute(
            "SELECT seq FROM sqlite_sequence WHERE name = 'saved_queries'"
        ).fetchone()
    assert recorded_revisions(path) == {"0003"}
    assert "author_id" not in column_names(path, "saved_queries")
    assert result == [
        (1, "Équipe scientifique Zoomathia", 1, "2025-01-01T00:00:00+00:00",
         "2025-01-01T00:00:00+00:00"),
        (2, "Ada", 0, "2025-03-04T08:00:00+00:00", "2025-03-05T10:00:00.500000+00:00"),
        (3, "Chercheur Zoomathia", 0, "2025-05-06T07:08:09.123456+00:00",
         "2025-05-06T07:08:09.123456+00:00"),
        (4, "Équipe scientifique Zoomathia", 1, "2025-06-01T12:00:00+00:00",
         "2025-06-01T12:00:00+00:00"),
        (6, "Ada Lovelace", 0, "2026-02-03T04:05:06.000007+00:00", "2026-02-04T00:00:00+00:00"),
    ]  # fmt: skip
    assert counter == (6,)  # the counter is kept going down too


def test_a_round_trip_gives_the_same_queries_back(
    upgraded: sqlite3.Connection, tmp_path: Path
) -> None:
    path = tmp_path / "upgraded.db"
    before = rows(upgraded, "SELECT * FROM saved_queries ORDER BY id")
    upgraded.close()

    config = alembic_config(sqlite_url(path))
    command.downgrade(config, "0003")
    command.upgrade(config, "0004")

    with sqlite3.connect(path) as connection:
        assert rows(connection, "SELECT * FROM saved_queries ORDER BY id") == before
