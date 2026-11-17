"""Alembic migrations and the startup check (docs/architecture.md, "Technical decisions")."""

import shutil
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy.engine import URL

from app.core.config import settings
from app.core.database import Database
from app.core.migrations import (
    DatabaseNotMigratedError,
    alembic_config,
    ensure_database_is_current,
    head_revisions,
)
from app.main import app, lifespan
from tests.conftest import template_database

ACCOUNT_TABLES = {"users", "user_sessions", "password_reset_tokens", "login_throttle"}
STAGING_TABLES = {"staged_annotations", "thesaurus_proposals", "saved_queries"}

# The schema that the oldest versions of the application created, before the columns that
# the old synchronous staging store added one by one at startup.
LEGACY_SCHEMA = """
    CREATE TABLE staged_annotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paragraph_uri TEXT NOT NULL,
        target_text TEXT NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        concept_uri TEXT NOT NULL,
        concept_label TEXT NOT NULL,
        concept_type TEXT NOT NULL,
        annotator_name TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE thesaurus_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pref_label TEXT NOT NULL,
        language TEXT NOT NULL,
        alt_labels TEXT NOT NULL,
        broader_concept_uri TEXT,
        definition TEXT,
        contributor_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE saved_queries (
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
    );
    INSERT INTO staged_annotations
        (paragraph_uri, target_text, start_offset, end_offset, concept_uri, concept_label,
         concept_type, annotator_name, created_at)
        VALUES ('http://ns.inria.fr/zoomathia/p1', 'lion', 0, 4, 'c', 'lion', 'skos:Concept',
                'Ada', '2025-01-01T00:00:00+00:00');
    INSERT INTO thesaurus_proposals
        (pref_label, language, alt_labels, contributor_name, status, created_at)
        VALUES ('lynx', 'la', '[]', 'Ada', 'En attente de révision', '2025-01-01T00:00:00+00:00');
"""


def sqlite_url(path: Path) -> str:
    return URL.create("sqlite", database=str(path)).render_as_string(hide_password=False)


def table_names(path: Path) -> set[str]:
    with sqlite3.connect(path) as connection:
        rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        return {row[0] for row in rows}


def column_names(path: Path, table: str) -> set[str]:
    with sqlite3.connect(path) as connection:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}  # noqa: S608


def recorded_revisions(path: Path) -> set[str]:
    with sqlite3.connect(path) as connection:
        return {row[0] for row in connection.execute("SELECT version_num FROM alembic_version")}


def test_a_fresh_database_reaches_the_head_revision(tmp_path: Path) -> None:
    path = tmp_path / "fresh.db"

    command.upgrade(alembic_config(sqlite_url(path)), "head")

    assert table_names(path) >= ACCOUNT_TABLES | STAGING_TABLES
    assert recorded_revisions(path) == head_revisions()


def test_a_legacy_database_is_adopted_without_losing_a_row(tmp_path: Path) -> None:
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(LEGACY_SCHEMA)

    command.upgrade(alembic_config(sqlite_url(path)), "head")

    assert {"justification", "scope_type", "end_paragraph_uri", "target_paragraphs", "status"} <= (
        column_names(path, "staged_annotations")
    )
    assert "broader_concept_label" in column_names(path, "thesaurus_proposals")
    with sqlite3.connect(path) as connection:
        annotation = connection.execute(
            "SELECT target_text, scope_type, status, author_label FROM staged_annotations"
        ).fetchall()
        proposal = connection.execute(
            "SELECT pref_label, status, author_label FROM thesaurus_proposals"
        ).fetchall()
    assert annotation == [("lion", "word_sequence", "pending", "Ada")]
    assert proposal == [("lynx", "pending", "Ada")]
    assert recorded_revisions(path) == head_revisions()


def test_a_second_upgrade_changes_nothing(tmp_path: Path) -> None:
    path = tmp_path / "twice.db"
    config = alembic_config(sqlite_url(path))
    command.upgrade(config, "head")
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO saved_queries (title, query_text, category, author_label, created_at,"
            " updated_at) VALUES ('t', 'q', 'c', 'a', '2026-01-01 00:00:00.000000',"
            " '2026-01-01 00:00:00.000000')"
        )

    command.upgrade(config, "head")

    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM saved_queries").fetchone() == (1,)
    assert recorded_revisions(path) == head_revisions()


def test_the_models_and_the_migrations_describe_the_same_schema(tmp_path: Path) -> None:
    """Autogenerate finds nothing to do, and never proposes to drop a staging table."""
    path = tmp_path / "autogenerate.db"
    scripts = tmp_path / "migrations"
    shutil.copytree(
        Path(settings.BASE_DIR) / "migrations",
        scripts,
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    config = alembic_config(sqlite_url(path))
    config.set_main_option("script_location", str(scripts))
    command.upgrade(config, "head")

    command.revision(config, message="drift check", autogenerate=True, rev_id="9999")

    (generated,) = (scripts / "versions").glob("9999_*.py")
    body = generated.read_text(encoding="utf-8")
    assert "op." not in body, body  # no operation at all: nothing to create, alter or drop


async def test_startup_refuses_a_database_that_is_not_migrated(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "STAGING_DB_PATH", str(tmp_path / "never-migrated.db"))

    with pytest.raises(DatabaseNotMigratedError, match="alembic upgrade head"):
        async with lifespan(app):
            pass


async def test_startup_refuses_a_database_one_revision_behind(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "behind.db"
    command.upgrade(alembic_config(sqlite_url(path)), "0001")
    monkeypatch.setattr(settings, "STAGING_DB_PATH", str(path))

    with pytest.raises(DatabaseNotMigratedError):
        async with lifespan(app):
            pass


async def test_startup_accepts_a_migrated_database_and_seeds_the_native_questions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "migrated.db"
    command.upgrade(alembic_config(sqlite_url(path)), "head")
    monkeypatch.setattr(settings, "STAGING_DB_PATH", str(path))

    async with lifespan(app):
        database = app.state.database
        await ensure_database_is_current(database)
    async with lifespan(app):  # seeding twice adds nothing
        pass

    with sqlite3.connect(path) as connection:
        builtin = connection.execute("SELECT COUNT(*) FROM saved_queries WHERE is_builtin = 1")
        seeded = builtin.fetchone()[0]
    with sqlite3.connect(template_database()) as connection:
        expected = connection.execute(
            "SELECT COUNT(*) FROM saved_queries WHERE is_builtin = 1"
        ).fetchone()[0]
    assert seeded == expected > 0


async def test_the_application_database_url_follows_the_staging_path(tmp_path: Path) -> None:
    database = Database(settings.DATABASE_URL)
    try:
        assert Path(database.engine.url.database or "") == Path(settings.STAGING_DB_PATH)
    finally:
        await database.dispose()
