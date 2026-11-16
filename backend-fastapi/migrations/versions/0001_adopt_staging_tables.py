"""Adopt the staging tables that the application used to create itself.

Revision ID: 0001
Revises:
Create Date: 2026-11-16

Until this revision `StagingStore._init_db` created the three tables of the staging store
(annotations, term proposals, saved queries) and added the columns that older databases
lacked. The schema now belongs to Alembic: this revision does the same work, idempotently,
so that it applies equally to an empty database and to one built by the old code (no
`alembic_version` table): rows are kept, a column that a legacy database still lacks is
added, and Alembic then records the revision.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STAGED_ANNOTATIONS = """
    CREATE TABLE IF NOT EXISTS staged_annotations (
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
    )
"""

THESAURUS_PROPOSALS = """
    CREATE TABLE IF NOT EXISTS thesaurus_proposals (
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
    )
"""

SAVED_QUERIES = """
    CREATE TABLE IF NOT EXISTS saved_queries (
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
    )
"""

# Columns that databases created by older versions of the application may still lack.
LEGACY_COLUMNS = {
    "staged_annotations": [
        ("justification", "TEXT"),
        ("scope_type", "TEXT NOT NULL DEFAULT 'word_sequence'"),
        ("end_paragraph_uri", "TEXT"),
        ("target_paragraphs", "TEXT"),
        ("status", "TEXT NOT NULL DEFAULT 'En attente de validation'"),
    ],
    "thesaurus_proposals": [("broader_concept_label", "TEXT")],
}


def upgrade() -> None:
    for statement in (STAGED_ANNOTATIONS, THESAURUS_PROPOSALS, SAVED_QUERIES):
        op.execute(statement)
    connection = op.get_bind()
    for table, columns in LEGACY_COLUMNS.items():
        existing = {column["name"] for column in sa.inspect(connection).get_columns(table)}
        for name, definition in columns:
            if name not in existing:
                op.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def downgrade() -> None:
    # These tables predate the migrations and hold the contributions: Alembic never drops them.
    pass
