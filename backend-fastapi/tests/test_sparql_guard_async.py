"""Parsing off the event loop, in one thread, and the heavy-query slot (RM-ACC-02)."""

import asyncio
import threading
from collections.abc import AsyncGenerator
from typing import Any, cast

import httpx
import pytest
from starlette.requests import Request

from app.shared import sparql_guard
from app.shared.limits import heavy_limiter, limit_heavy_queries
from app.shared.sparql_guard import (
    MAX_QUERY_LENGTH,
    ForbiddenSparqlQuery,
    InvalidSparqlQuery,
    prepare_query,
    prepare_query_async,
)
from tests.conftest import FakeCorese

SELECT = "SELECT ?s WHERE { ?s ?p ?o }"
NESTED = "SELECT * WHERE " + "{ " * 40 + "?s ?p ?o " + "} " * 40


@pytest.fixture
def analysed(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Record the name of the thread of every text that reaches the parser."""
    threads: list[str] = []
    real = sparql_guard._analyse

    def spy(text: str) -> str:
        threads.append(threading.current_thread().name)
        return real(text)

    monkeypatch.setattr(sparql_guard, "_analyse", spy)
    return threads


# --- too deeply nested for the parser ---------------------------------------------------


def test_rm_acc_02_a_recursion_error_is_reported_as_an_invalid_query() -> None:
    with pytest.raises(InvalidSparqlQuery, match="too deeply nested"):
        prepare_query(NESTED)


def test_rm_acc_02_a_long_group_of_patterns_is_reported_as_too_deep_too() -> None:
    query = "SELECT * WHERE { " + " . ".join(["?s ?p ?o"] * 100) + " }"

    with pytest.raises(InvalidSparqlQuery, match="too deeply nested"):
        prepare_query(query)


async def test_rm_acc_02_the_playground_answers_400_to_a_too_deep_query(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/sparql/execute", json={"query": NESTED})

    assert response.status_code == 400
    assert "too deeply nested" in response.json()["detail"]
    assert corese.queries == []


# --- prepare_query_async ----------------------------------------------------------------


@pytest.mark.parametrize(
    "query",
    [
        SELECT,
        "ASK { ?s ?p ?o }",
        SELECT + " LIMIT 5",
        "SELECT ?s\r\nWHERE { ?s ?p ?o }\r\n",
        NESTED,
        "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }",
        "DROP ALL",
        "SELEC nothing",
        "ASK { FILTER(f:g(1)) }",
        "SELECT * WHERE { ?s ?p ?o # \\u0041",
        "   ",
        "SELECT * WHERE { ?s ?p ?o } \x00",
    ],
)
async def test_rm_acc_02_the_async_version_gives_the_same_result_and_errors(query: str) -> None:
    try:
        expected: Any = prepare_query(query)
    except (ForbiddenSparqlQuery, InvalidSparqlQuery) as error:
        with pytest.raises(type(error)) as raised:
            await prepare_query_async(query)
        assert str(raised.value) == str(error)
    else:
        assert await prepare_query_async(query) == expected


async def test_rm_acc_02_parsing_runs_in_the_dedicated_thread(analysed: list[str]) -> None:
    await prepare_query_async(SELECT)

    assert len(analysed) == 1
    assert analysed[0].startswith("sparql-guard")
    assert threading.current_thread().name != analysed[0]


async def test_rm_acc_02_an_accepted_query_is_parsed_once_then_served_from_the_cache(
    analysed: list[str],
) -> None:
    first = await prepare_query_async(SELECT)
    second = await prepare_query_async(SELECT)

    assert first == second == SELECT + "\nLIMIT 10000"
    assert len(analysed) == 1


async def test_rm_acc_02_a_refused_query_is_not_cached(analysed: list[str]) -> None:
    query = "SELECT * WHERE { SERVICE <http://ex.org/sparql> { ?s ?p ?o } }"

    for _ in range(2):
        with pytest.raises(ForbiddenSparqlQuery):
            await prepare_query_async(query)

    assert len(analysed) == 2


@pytest.mark.parametrize(
    "query",
    [
        "SELECT * WHERE { ?s ?p ?o }" + " " * MAX_QUERY_LENGTH,
        "SELECT * WHERE { ?s ?p ?o } # \\u0041",
        "SELECT * WHERE { ?s ?p ?o } \x07",
        "",
    ],
    ids=["too-long", "escape", "control-character", "empty"],
)
async def test_rm_acc_02_a_text_refused_by_the_cheap_checks_never_reaches_the_parser(
    analysed: list[str], query: str
) -> None:
    with pytest.raises(InvalidSparqlQuery):
        await prepare_query_async(query)

    assert analysed == []


async def test_rm_acc_02_the_cache_keeps_at_most_256_queries_and_evicts_the_oldest(
    analysed: list[str],
) -> None:
    for number in range(257):
        await prepare_query_async(f"SELECT ?s WHERE {{ ?s ?p {number} }}")
    assert len(analysed) == 257

    await prepare_query_async("SELECT ?s WHERE { ?s ?p 256 }")  # still cached
    assert len(analysed) == 257
    await prepare_query_async("SELECT ?s WHERE { ?s ?p 0 }")  # evicted
    assert len(analysed) == 258


async def test_rm_acc_02_the_event_loop_keeps_running_while_a_query_is_parsed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = threading.Event()
    release = threading.Event()
    real = sparql_guard._analyse

    def blocked(text: str) -> str:
        started.set()
        release.wait(timeout=5)
        return real(text)

    monkeypatch.setattr(sparql_guard, "_analyse", blocked)
    parsing = asyncio.create_task(prepare_query_async(SELECT))
    while not started.is_set():
        await asyncio.sleep(0.01)

    # The parser thread is busy, yet the loop answers (and a cheap refusal is immediate).
    with pytest.raises(InvalidSparqlQuery):
        await prepare_query_async("")
    release.set()

    assert await parsing == SELECT + "\nLIMIT 10000"


# --- the heavy-query slot ---------------------------------------------------------------


def request_from(address: str) -> Request:
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "client": (address, 1)}
    return Request(scope)


async def test_rm_acc_02_a_cancelled_request_gives_its_slot_back() -> None:
    generator = cast(AsyncGenerator[None, None], limit_heavy_queries(request_from("203.0.113.9")))
    await generator.__anext__()
    assert heavy_limiter._total == 1

    with pytest.raises(asyncio.CancelledError):
        await generator.athrow(asyncio.CancelledError())

    assert heavy_limiter._total == 0
    assert heavy_limiter._per_client == {}
