"""The seeding of the native competency questions (RM-QC-02, until RM-QC-01).

The questions are copied at startup from `app/core/qcs_data.py` and the `.rq` files of
`data/queries/`. The seeding is asynchronous, idempotent, and reads the files in a thread.
"""

import logging
import sqlite3
import threading
from pathlib import Path

import httpx
import pytest

from app.core.config import settings
from app.core.database import Database
from app.core.qcs_data import QCS_DATA
from app.queries import service as queries_service
from app.queries.service import seed_builtin_queries
from tests.support.accounts import FakeClock


def stored(query: str) -> list[tuple[object, ...]]:
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        return connection.execute(query).fetchall()


def empty_the_library() -> None:
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        connection.execute("DELETE FROM saved_queries")


async def test_the_library_holds_the_native_questions_with_their_two_variants(
    client: httpx.AsyncClient,
) -> None:
    page = (await client.get("/queries", params={"limit": 500})).json()
    natives = [q for q in page["items"] if q["is_builtin"]]

    assert {q["id"] for q in natives} == {qc["id"] for qc in QCS_DATA}
    assert all(q["query_text"] and q["category"] == "Question de compétence" for q in natives)
    assert any(q["query_spo_text"] for q in natives)
    assert all(q["author"] is None for q in natives)


async def test_seeding_twice_adds_nothing_and_changes_nothing(database: Database) -> None:
    before = stored("SELECT id, title, created_at, updated_at FROM saved_queries ORDER BY id")

    await seed_builtin_queries(database, FakeClock())
    await seed_builtin_queries(database, FakeClock())

    assert stored("SELECT id, title, created_at, updated_at FROM saved_queries ORDER BY id") == (
        before
    )


async def test_seeding_restores_a_missing_question_and_leaves_the_others_alone(
    database: Database,
) -> None:
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        connection.execute("DELETE FROM saved_queries WHERE id = 2")
        connection.execute("UPDATE saved_queries SET title = 'Edited by hand' WHERE id = 1")

    await seed_builtin_queries(database)

    assert stored("SELECT COUNT(*) FROM saved_queries WHERE id = 2") == [(1,)]
    assert stored("SELECT title FROM saved_queries WHERE id = 1") == [("Edited by hand",)]


async def test_the_seeded_rows_are_native_with_no_account_and_the_date_of_the_clock(
    database: Database,
) -> None:
    empty_the_library()
    clock = FakeClock()

    await seed_builtin_queries(database, clock)

    rows = stored(
        "SELECT DISTINCT is_builtin, author_id, author_label, created_at, updated_at"
        " FROM saved_queries"
    )
    assert rows == [
        (
            1,
            None,
            "Équipe scientifique Zoomathia",
            "2026-01-01 12:00:00.000000",
            "2026-01-01 12:00:00.000000",
        )
    ]


async def test_a_question_without_a_query_file_is_left_out(
    database: Database, tmp_path: Path
) -> None:
    empty_the_library()
    folder = tmp_path / "queries"
    folder.mkdir()
    (folder / "qc1.rq").write_text("SELECT ?s WHERE { ?s ?p ?o } LIMIT 1", encoding="utf-8")
    (folder / "qc1_spo.rq").write_text("SELECT ?s ?o WHERE { ?s ?p ?o } LIMIT 1", encoding="utf-8")
    (folder / "qc2.rq").write_text("", encoding="utf-8")  # an empty file is no query either

    await seed_builtin_queries(database, queries_dir=folder)

    assert stored("SELECT id, query_text, query_spo_text FROM saved_queries") == [
        (1, "SELECT ?s WHERE { ?s ?p ?o } LIMIT 1", "SELECT ?s ?o WHERE { ?s ?p ?o } LIMIT 1")
    ]


async def test_the_files_are_read_in_a_thread_not_on_the_event_loop(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    empty_the_library()
    readers: list[int] = []
    original = queries_service._read_text

    def spy(path: Path) -> str | None:
        readers.append(threading.get_ident())
        return original(path)

    monkeypatch.setattr(queries_service, "_read_text", spy)

    await seed_builtin_queries(database)

    assert readers
    assert threading.get_ident() not in readers


async def test_a_user_query_in_the_way_of_a_native_id_is_logged_and_does_not_stop_the_startup(
    database: Database, caplog: pytest.LogCaptureFixture
) -> None:
    """The insert leaves an occupied id alone, but never silently (AGENTS.md, rule 9)."""
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        connection.execute(
            "UPDATE saved_queries SET is_builtin = 0, author_label = 'secret author', "
            "title = 'secret title' WHERE id IN (3, 4)"
        )

    with caplog.at_level(logging.ERROR, logger=queries_service.logger.name):
        await seed_builtin_queries(database)

    assert stored("SELECT is_builtin, author_label FROM saved_queries WHERE id = 3") == [
        (0, "secret author")
    ]
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    message = errors[0].getMessage()
    assert "[3, 4]" in message
    # Ids only: neither a title, a query text nor an author reaches the log.
    assert "secret" not in message
    assert "SELECT" not in message


async def test_a_healthy_library_logs_no_error(
    database: Database, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger=queries_service.logger.name):
        await seed_builtin_queries(database)

    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
