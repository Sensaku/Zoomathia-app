"""Revision 0003: contributions behind accounts (RM-CTB-03, RM-CTB-06, RM-MOD-03, RM-THE-04).

The tests start from a database as revision 0002 left it, fill it with the awkward rows that
the old application could write (French statuses, empty names, ISO dates with an offset,
invalid JSON, a deleted highest id, pending duplicates), and check what the migration does:
convert without losing a row, keep the id counters, refuse bad rows afterwards, abort on what
it cannot convert without guessing, and go back down without losing a row.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest
from alembic import command

from app.contributions.models import label_key
from app.core.migrations import alembic_config
from tests.test_migrations import column_names, recorded_revisions, sqlite_url

ANNOTATION_COLUMNS = (
    "paragraph_uri, target_text, start_offset, end_offset, concept_uri, concept_label,"
    " concept_type, annotator_name, justification, scope_type, end_paragraph_uri,"
    " target_paragraphs, status, created_at"
)
PROPOSAL_COLUMNS = (
    "pref_label, language, alt_labels, broader_concept_uri, broader_concept_label, definition,"
    " contributor_name, status, created_at"
)
P1 = "http://ns.inria.fr/zoomathia/p1"
P2 = "http://ns.inria.fr/zoomathia/p2"
P_END = "http://ns.inria.fr/zoomathia/pEnd"
CONCEPT = "https://opentheso.huma-num.fr/?idc=1&idt=th310"
SKOS = "http://www.w3.org/2004/02/skos/core#Concept"


def annotation(
    para: str, status: str, name: str | None, created: str, paragraphs: str | None, end: str | None
) -> tuple[Any, ...]:
    return (
        para,
        "text",
        0,
        4,
        CONCEPT,
        "label",
        SKOS,
        name,
        None,
        "word",
        end,
        paragraphs,
        status,
        created,
    )


LEGACY_ANNOTATIONS = [
    annotation(
        P1, "En attente de validation", "Ada", "2025-01-01T00:00:00+00:00", json.dumps([P1]), None
    ),
    annotation(P2, "Validé", "", "2025-03-04T10:00:00+02:00", "not json [", P_END),
    annotation(P1, "Rejeté", "Bob", "2025-05-06T07:08:09.123456", None, None),
    annotation(P1, "", "Eve", "2025-06-01T12:00:00Z", json.dumps([P1, P2]), None),
    annotation(P1, "Validé", "Gone", "2025-06-02T12:00:00+00:00", None, None),  # id 5, deleted
]
LEGACY_PROPOSALS = [
    ("Cerf élaphe", "fr", "[]", None, None, None, "Ada", "En attente de révision", "2025-01-01T00:00:00+00:00"),
    ("Cerf élaphe", "fr", "broken", CONCEPT, "cervidé", "Un cerf", "Bob", "Validé", "2025-02-01T00:00:00+00:00"),
    ("lynx", "la", '["lynx"]', None, None, None, "", "Rejeté", "2025-03-01T00:00:00+00:00"),
    ("Gone", "fr", "[]", None, None, None, "Gone", "Validé", "2025-04-01T00:00:00+00:00"),  # id 4
]  # fmt: skip


def legacy_database(path: Path) -> sqlite3.Connection:
    """A database as revision 0002 leaves it, with the rows above; ids 5 and 4 were deleted."""
    command.upgrade(alembic_config(sqlite_url(path)), "0002")
    connection = sqlite3.connect(path)
    connection.executemany(
        f"INSERT INTO staged_annotations ({ANNOTATION_COLUMNS}) VALUES ({', '.join('?' * 14)})",  # noqa: S608
        LEGACY_ANNOTATIONS,
    )
    connection.executemany(
        f"INSERT INTO thesaurus_proposals ({PROPOSAL_COLUMNS}) VALUES ({', '.join('?' * 9)})",  # noqa: S608
        LEGACY_PROPOSALS,
    )
    connection.execute("DELETE FROM staged_annotations WHERE id = 5")
    connection.execute("DELETE FROM thesaurus_proposals WHERE id = 4")
    connection.commit()
    return connection


@pytest.fixture
def upgraded(tmp_path: Path) -> sqlite3.Connection:
    path = tmp_path / "upgraded.db"
    legacy_database(path).close()
    command.upgrade(alembic_config(sqlite_url(path)), "0003")
    return sqlite3.connect(path)


def rows(connection: sqlite3.Connection, sql: str) -> list[tuple[Any, ...]]:
    return connection.execute(sql).fetchall()


# --- upgrade ---


def test_the_statuses_become_codes_and_an_empty_one_is_pending(
    upgraded: sqlite3.Connection,
) -> None:
    assert rows(upgraded, "SELECT id, status FROM staged_annotations ORDER BY id") == [
        (1, "pending"),
        (2, "validated"),
        (3, "rejected"),
        (4, "pending"),
    ]
    assert rows(upgraded, "SELECT id, status FROM thesaurus_proposals ORDER BY id") == [
        (1, "pending"),
        (2, "validated"),
        (3, "rejected"),
    ]


def test_rm_ctb_06_the_names_become_historical_authors_and_an_empty_name_is_anonymous(
    upgraded: sqlite3.Connection,
) -> None:
    annotations = rows(
        upgraded, "SELECT id, author_id, author_label FROM staged_annotations ORDER BY id"
    )
    proposals = rows(
        upgraded, "SELECT id, author_id, author_label FROM thesaurus_proposals ORDER BY id"
    )

    assert annotations == [
        (1, None, "Ada"),
        (2, None, "Chercheur anonyme"),
        (3, None, "Bob"),
        (4, None, "Eve"),
    ]
    assert proposals == [(1, None, "Ada"), (2, None, "Bob"), (3, None, "Chercheur anonyme")]


def test_the_dates_become_naive_utc_text(upgraded: sqlite3.Connection) -> None:
    created = [
        r[0] for r in rows(upgraded, "SELECT created_at FROM staged_annotations ORDER BY id")
    ]

    assert created == [
        "2025-01-01 00:00:00.000000",
        "2025-03-04 08:00:00.000000",  # +02:00 converted to UTC
        "2025-05-06 07:08:09.123456",  # no offset: the old code wrote UTC
        "2025-06-01 12:00:00.000000",  # Z
    ]


def test_the_review_columns_are_empty_and_the_version_is_one(upgraded: sqlite3.Connection) -> None:
    columns = "reviewer_id, reviewed_at, rejection_reason, updated_at, version"

    for table in ("staged_annotations", "thesaurus_proposals"):
        distinct = set(rows(upgraded, f"SELECT {columns} FROM {table}"))  # noqa: S608
        assert distinct == {(None, None, None, None, 1)}


def test_invalid_json_is_repaired_the_way_the_application_would_have_stored_it(
    upgraded: sqlite3.Connection,
) -> None:
    paragraphs = [
        json.loads(r[0])
        for r in rows(upgraded, "SELECT target_paragraphs FROM staged_annotations ORDER BY id")
    ]
    alt_labels = [
        json.loads(r[0])
        for r in rows(upgraded, "SELECT alt_labels FROM thesaurus_proposals ORDER BY id")
    ]

    assert paragraphs == [[P1], [P2, P_END], [P1], [P1, P2]]
    assert alt_labels == [[], [], ["lynx"]]


def test_the_anti_duplicate_key_is_the_one_of_the_application(upgraded: sqlite3.Connection) -> None:
    stored = rows(upgraded, "SELECT pref_label, pref_label_key FROM thesaurus_proposals")

    assert all(key == label_key(label) for label, key in stored)
    assert stored[0][1] == "cerf élaphe"


def test_rm_the_04_a_validated_duplicate_of_a_pending_term_is_kept(
    upgraded: sqlite3.Connection,
) -> None:
    keys = rows(
        upgraded, "SELECT status FROM thesaurus_proposals WHERE pref_label_key = 'cerf élaphe'"
    )

    assert sorted(keys) == [("pending",), ("validated",)]


def test_the_id_counters_are_kept_so_that_a_deleted_id_is_never_reused(
    upgraded: sqlite3.Connection,
) -> None:
    annotation_id = upgraded.execute(
        "INSERT INTO staged_annotations (paragraph_uri, target_text, start_offset, end_offset,"
        " concept_uri, concept_label, concept_type, scope_type, target_paragraphs, author_label,"
        " status, created_at) VALUES ('p', 't', 0, 1, 'c', 'l', 'k', 'word', '[]', 'x',"
        " 'pending', '2026-01-01 00:00:00.000000')"
    ).lastrowid
    proposal_id = upgraded.execute(
        "INSERT INTO thesaurus_proposals (pref_label, pref_label_key, language, alt_labels,"
        " author_label, status, created_at) VALUES ('n', 'n', 'fr', '[]', 'x', 'pending',"
        " '2026-01-01 00:00:00.000000')"
    ).lastrowid

    assert (annotation_id, proposal_id) == (6, 5)  # the deleted ids 5 and 4 stay burnt


def test_the_new_tables_keep_their_names_and_the_revision_is_recorded(
    upgraded: sqlite3.Connection, tmp_path: Path
) -> None:
    names = {r[0] for r in rows(upgraded, "SELECT name FROM sqlite_master WHERE type = 'table'")}

    assert not any(name.endswith("_rebuilt") for name in names)
    assert {"staged_annotations", "thesaurus_proposals", "saved_queries"} <= names
    assert recorded_revisions(tmp_path / "upgraded.db") == {"0003"}
    assert "annotator_name" not in column_names(tmp_path / "upgraded.db", "staged_annotations")


# --- the constraints refuse bad rows ---

BASE_ANNOTATION = {
    "paragraph_uri": "p",
    "target_text": "t",
    "start_offset": 0,
    "end_offset": 1,
    "concept_uri": "c",
    "concept_label": "l",
    "concept_type": "k",
    "scope_type": "word",
    "target_paragraphs": "[]",
    "author_label": "x",
    "status": "pending",
    "created_at": "2026-01-01 00:00:00.000000",
}


def insert_annotation(connection: sqlite3.Connection, **changes: Any) -> None:
    row = {**BASE_ANNOTATION, **changes}
    connection.execute(
        f"INSERT INTO staged_annotations ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",  # noqa: S608
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
        {"author_label": None},  # neither an account nor a historical author
        {"author_id": 1},  # both
        {"status": "Validé"},
        {"status": "published"},
        {"reviewer_id": 1},  # a reviewer without a date
        {"reviewed_at": "2026-01-01 00:00:00.000000"},  # a date without a reviewer
        {"reviewer_id": 1, "reviewed_at": "2026-01-01 00:00:00.000000"},  # a pending one reviewed
        {"status": "rejected", "reviewer_id": 1, "reviewed_at": "2026-01-01 00:00:00.000000"},
        {"target_paragraphs": "not json ["},
        {"target_paragraphs": '"a string"'},
        {"author_label": None, "author_id": 999},  # an account that does not exist
    ],
)
def test_the_constraints_refuse_a_bad_row(
    with_account: sqlite3.Connection, changes: dict[str, Any]
) -> None:
    with_account.execute("PRAGMA foreign_keys = ON")

    with pytest.raises(sqlite3.IntegrityError):
        insert_annotation(with_account, **changes)


@pytest.mark.parametrize(
    "changes",
    [
        {},
        {"author_label": None, "author_id": 1},
        {"status": "rejected"},  # a legacy rejection: no reviewer, no reason
        {"status": "validated", "reviewer_id": 1, "reviewed_at": "2026-01-01 00:00:00.000000"},
        {
            "status": "rejected",
            "reviewer_id": 1,
            "reviewed_at": "2026-01-01 00:00:00.000000",
            "rejection_reason": "No.",
        },
    ],
)
def test_the_constraints_accept_a_good_row(
    with_account: sqlite3.Connection, changes: dict[str, Any]
) -> None:
    with_account.execute("PRAGMA foreign_keys = ON")

    insert_annotation(with_account, **changes)


def test_rm_the_04_the_database_refuses_a_second_pending_proposal_of_the_same_term(
    upgraded: sqlite3.Connection,
) -> None:
    sql = (
        "INSERT INTO thesaurus_proposals (pref_label, pref_label_key, language, alt_labels,"
        " author_label, status, created_at) VALUES ('{label}', '{key}', '{lang}', '[]', 'x',"
        " '{status}', '2026-01-01 00:00:00.000000')"
    )
    with pytest.raises(sqlite3.IntegrityError):
        upgraded.execute(sql.format(label="Cerf", key="cerf élaphe", lang="fr", status="pending"))

    upgraded.execute(sql.format(label="Cerf", key="cerf élaphe", lang="la", status="pending"))
    upgraded.execute(sql.format(label="Cerf", key="cerf élaphe", lang="fr", status="rejected"))


# --- what the migration refuses to guess ---


def refuses(tmp_path: Path, break_it: str, message: str) -> Path:
    path = tmp_path / "refused.db"
    connection = legacy_database(path)
    connection.execute(break_it)
    connection.commit()
    connection.close()

    with pytest.raises(RuntimeError, match=message):
        command.upgrade(alembic_config(sqlite_url(path)), "0003")

    return path


@pytest.mark.parametrize(
    ("break_it", "message"),
    [
        ("UPDATE staged_annotations SET status = 'Publié' WHERE id = 3", r"annotation 3: unknown"),
        ("UPDATE staged_annotations SET status = 'validé' WHERE id = 1", r"annotation 1: unknown"),
        (
            "UPDATE thesaurus_proposals SET status = 'En attente de validation' WHERE id = 2",
            r"proposal 2: unknown status",
        ),
        (
            "UPDATE staged_annotations SET created_at = 'yesterday' WHERE id = 2",
            r"annotation 2: unreadable",
        ),
        ("UPDATE thesaurus_proposals SET created_at = '' WHERE id = 3", r"proposal 3: unreadable"),
        (
            "UPDATE thesaurus_proposals SET pref_label = ' CERF  Élaphe', status = 'En attente de"
            " révision' WHERE id = 2",
            r"proposals \[1, 2\]: the same term is pending",
        ),
    ],
)
def test_the_migration_aborts_with_the_ids_and_changes_nothing(
    tmp_path: Path, break_it: str, message: str
) -> None:
    path = refuses(tmp_path, break_it, message)

    assert recorded_revisions(path) == {"0002"}
    assert "annotator_name" in column_names(path, "staged_annotations")
    assert "contributor_name" in column_names(path, "thesaurus_proposals")
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM staged_annotations").fetchone() == (4,)
        assert connection.execute("SELECT COUNT(*) FROM thesaurus_proposals").fetchone() == (3,)


def test_a_fixed_database_can_then_be_migrated(tmp_path: Path) -> None:
    path = refuses(
        tmp_path, "UPDATE staged_annotations SET status = 'Publié' WHERE id = 3", "unknown"
    )
    with sqlite3.connect(path) as connection:
        connection.execute("UPDATE staged_annotations SET status = 'Rejeté' WHERE id = 3")

    command.upgrade(alembic_config(sqlite_url(path)), "0003")

    assert recorded_revisions(path) == {"0003"}


# --- downgrade ---


def test_the_downgrade_restores_revision_0002_without_losing_a_row(
    with_account: sqlite3.Connection, tmp_path: Path
) -> None:
    path = tmp_path / "upgraded.db"
    insert_annotation(
        with_account, author_label=None, author_id=1, created_at="2026-02-03 04:05:06.000007"
    )
    with_account.execute(
        "INSERT INTO thesaurus_proposals (pref_label, pref_label_key, language, alt_labels,"
        " author_id, status, created_at, reviewer_id, reviewed_at, rejection_reason)"
        " VALUES ('Nouveau', 'nouveau', 'fr', '[]', 1, 'rejected', '2026-02-03 04:05:06.000000',"
        " 1, '2026-02-04 00:00:00.000000', 'No.')"
    )
    with_account.commit()
    with_account.close()

    command.downgrade(alembic_config(sqlite_url(path)), "0002")

    with sqlite3.connect(path) as connection:
        annotations = connection.execute(
            "SELECT id, annotator_name, status, created_at, target_paragraphs"
            " FROM staged_annotations ORDER BY id"
        ).fetchall()
        proposals = connection.execute(
            "SELECT id, contributor_name, status, created_at FROM thesaurus_proposals ORDER BY id"
        ).fetchall()
        next_annotation = connection.execute(
            "SELECT seq FROM sqlite_sequence WHERE name = 'staged_annotations'"
        ).fetchone()
    assert recorded_revisions(path) == {"0002"}
    assert "annotator_name" in column_names(path, "staged_annotations")
    assert "author_id" not in column_names(path, "staged_annotations")
    assert [(r[0], r[1], r[2], r[3]) for r in annotations] == [
        (1, "Ada", "En attente de validation", "2025-01-01T00:00:00+00:00"),
        (2, "Chercheur anonyme", "Validé", "2025-03-04T08:00:00+00:00"),
        (3, "Bob", "Rejeté", "2025-05-06T07:08:09.123456+00:00"),
        (4, "Eve", "En attente de validation", "2025-06-01T12:00:00+00:00"),
        (6, "Ada Lovelace", "En attente de validation", "2026-02-03T04:05:06.000007+00:00"),
    ]
    assert json.loads(annotations[1][4]) == [P2, P_END]
    assert proposals == [
        (1, "Ada", "En attente de révision", "2025-01-01T00:00:00+00:00"),
        (2, "Bob", "Validé", "2025-02-01T00:00:00+00:00"),
        (3, "Chercheur anonyme", "Rejeté", "2025-03-01T00:00:00+00:00"),
        (5, "Ada Lovelace", "Rejeté", "2026-02-03T04:05:06+00:00"),
    ]
    assert next_annotation == (6,)  # the counter is kept going down too


def test_a_round_trip_gives_the_same_contributions_back(
    upgraded: sqlite3.Connection, tmp_path: Path
) -> None:
    path = tmp_path / "upgraded.db"
    before = rows(upgraded, "SELECT * FROM staged_annotations ORDER BY id")
    upgraded.close()

    config = alembic_config(sqlite_url(path))
    command.downgrade(config, "0002")
    command.upgrade(config, "0003")

    with sqlite3.connect(path) as connection:
        assert rows(connection, "SELECT * FROM staged_annotations ORDER BY id") == before
