"""The index of the TheZoo collections: loading, cache, failures (RM-CON-01, RM-CON-02)."""

import asyncio
import logging
from collections.abc import Iterator

import httpx
import pytest
from fastapi import HTTPException
from rdflib.plugins.sparql import prepareQuery

from app.core.clock import utcnow
from app.core.config import settings
from app.main import app, lifespan
from app.thesaurus.categories import collection_iri
from app.thesaurus.collections import (
    FAILURE_MEMORY_SECONDS,
    INDEX_TTL_SECONDS,
    LABELS_QUERY,
    MEMBERS_LIMIT,
    MEMBERS_QUERY,
    RETRY_DELAY_SECONDS,
    ThesaurusCollections,
    thesaurus_collections,
)
from tests.conftest import FakeCorese
from tests.support.accounts import FakeClock
from tests.support.thesaurus import answer_loads

CONCEPT = "https://opentheso.huma-num.fr/?idc=107399&idt=th310"
OTHER = "https://opentheso.huma-num.fr/?idc=107400&idt=th310"


def member(number: int, concept: str = CONCEPT) -> dict[str, str]:
    return {"collection": collection_iri(number), "member": concept}


def label(number: int, text: str, language: str) -> dict[str, str]:
    return {
        "collection": collection_iri(number),
        "collectionLabel": text,
        "labelLanguage": language,
    }


ZOONYME_LABELS = [label(7, "Zoonyme", "fr"), label(7, "Zoonyms", "en")]


@pytest.fixture
def cache() -> Iterator[ThesaurusCollections]:
    """An empty cache of its own: the application one is not touched."""
    loader = ThesaurusCollections()
    yield loader
    loader.clear()


async def settle() -> None:
    """Let the background load of the cache run to its end."""
    await asyncio.sleep(0.05)


def test_the_queries_have_no_placeholder_and_select_what_the_index_reads() -> None:
    """Catches a query that stops matching what `build_index` reads, or takes a placeholder."""
    members = prepareQuery(MEMBERS_QUERY)
    labels = prepareQuery(LABELS_QUERY)

    assert {str(v) for v in members.algebra["PV"]} == {"collection", "member"}
    assert {str(v) for v in labels.algebra["PV"]} == {
        "collection",
        "collectionLabel",
        "labelLanguage",
    }
    assert "{{" not in MEMBERS_QUERY + LABELS_QUERY


def test_the_members_query_never_depends_on_a_label() -> None:
    """A fr/en label filter joined to the members would drop a collection that has none."""
    assert "prefLabel" not in MEMBERS_QUERY
    assert "lang(" not in MEMBERS_QUERY


def test_the_members_query_is_bounded_by_the_limit_the_loader_checks() -> None:
    """Catches a LIMIT edited in one place only: the loader would never see a full page."""
    assert f"LIMIT {MEMBERS_LIMIT}" in MEMBERS_QUERY
    assert MEMBERS_LIMIT == 50_000


@pytest.mark.parametrize("query", [MEMBERS_QUERY, LABELS_QUERY])
def test_each_query_states_its_expected_cost(query: str) -> None:
    assert query.startswith("#")
    assert "Expected cost" in query


async def test_rm_con_02_the_index_gives_the_category_and_the_labels_by_language(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches labels mixed between languages, or a category read from the labels."""
    answer_loads(corese, [member(7), member(6)], [*ZOONYME_LABELS, label(6, "Sujet", "fr")])

    index = await cache.get(clock)

    category, collections = index.classify(CONCEPT)
    assert category == "animal"
    assert [(c.iri, c.labels) for c in collections] == [
        (collection_iri(7), {"fr": "Zoonyme", "en": "Zoonyms"}),
        (collection_iri(6), {"fr": "Sujet"}),
    ]


async def test_rm_con_01_a_collection_without_fr_or_en_label_keeps_its_members(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches members lost with their labels: the labels are a separate query."""
    answer_loads(corese, [member(7)], [])

    index = await cache.get(clock)

    assert index.classify(CONCEPT) == ("animal", [index.collection(collection_iri(7))])
    assert index.collection(collection_iri(7)).labels == {}


async def test_rm_con_01_a_concept_of_mt_15_and_mt_17_is_general_when_loaded_from_corese(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Regression: the old text search found "MT_1" inside the IRIs of MT_15 and MT_17."""
    answer_loads(corese, [member(15), member(17), member(6, OTHER), member(7, OTHER)])

    index = await cache.get(clock)

    assert index.classify(CONCEPT)[0] == "general"


async def test_the_index_is_loaded_once_within_the_ttl(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches a load per request."""
    answer_loads(corese, [member(7)])

    await cache.get(clock)
    clock.advance(seconds=INDEX_TTL_SECONDS - 1)
    await cache.get(clock)

    assert len(corese.queries) == 2  # the members, then the labels: one load


async def test_a_stale_index_is_returned_at_once_while_one_refresh_runs(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches a request that waits for Corese when it already holds an index (rule 10)."""
    answer_loads(corese, [member(7)], loads=2)
    first = await cache.get(clock)
    clock.advance(seconds=INDEX_TTL_SECONDS)
    corese.hold()

    served = await asyncio.wait_for(asyncio.gather(*(cache.get(clock) for _ in range(5))), 1)

    assert all(index is first for index in served)
    await settle()
    assert len(corese.queries) == 3  # one refresh started, not five
    corese.release_held()
    await settle()
    assert len(corese.queries) == 4
    assert (await cache.get(clock)) is not first


async def test_the_refresh_replaces_the_index_after_the_ttl(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches an index that never expires, and the SPARQL cache hiding the reload."""
    answer_loads(corese, [member(7)])
    first = await cache.get(clock)
    answer_loads(corese, [member(8, OTHER), member(7, CONCEPT)])
    clock.advance(seconds=INDEX_TTL_SECONDS)

    assert await cache.get(clock) is first  # served at once, refreshed behind
    await settle()
    refreshed = await cache.get(clock)

    assert refreshed is not first
    assert refreshed.classify(OTHER)[0] == "anatomy"


async def test_a_failed_refresh_keeps_the_previous_index_and_logs_a_warning(
    cache: ThesaurusCollections,
    corese: FakeCorese,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catches a Corese outage that breaks every reading route once the TTL has passed."""
    answer_loads(corese, [member(7)])
    first = await cache.get(clock)
    corese.raises(httpx.ConnectError("down"))
    clock.advance(seconds=INDEX_TTL_SECONDS)

    with caplog.at_level(logging.WARNING, logger="zoomathia.thesaurus"):
        assert await cache.get(clock) is first
        await settle()

    assert "previous index" in caplog.text
    assert await cache.get(clock) is first


async def test_after_a_failed_refresh_corese_waits_for_the_retry_delay(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches a refresh attempt on every request during an outage."""
    answer_loads(corese, [member(7)])
    await cache.get(clock)
    corese.raises(httpx.ConnectError("down"))
    clock.advance(seconds=INDEX_TTL_SECONDS)
    await cache.get(clock)
    await settle()
    attempts = len(corese.queries)

    clock.advance(seconds=RETRY_DELAY_SECONDS - 1)
    await cache.get(clock)
    await settle()
    assert len(corese.queries) == attempts

    clock.advance(seconds=1)
    await cache.get(clock)
    await settle()
    assert len(corese.queries) == attempts + 1


async def test_concurrent_cold_requests_share_one_load(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches a stampede: ten simultaneous first requests must send one load."""
    answer_loads(corese, [member(7)])
    corese.hold()

    waiting = [asyncio.create_task(cache.get(clock)) for _ in range(10)]
    await asyncio.sleep(0.05)
    corese.release_held()
    indexes = await asyncio.gather(*waiting)

    assert len(corese.queries) == 2
    assert all(index is indexes[0] for index in indexes)


async def test_a_request_that_gives_up_does_not_cancel_the_load_the_others_wait_for(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches a client disconnect that makes every other waiting request fail."""
    answer_loads(corese, [member(7)])
    corese.hold()
    leaving = asyncio.create_task(cache.get(clock))
    staying = asyncio.create_task(cache.get(clock))
    await asyncio.sleep(0.05)

    leaving.cancel()
    corese.release_held()

    assert (await staying).classify(CONCEPT)[0] == "animal"


async def test_concurrent_cold_requests_with_a_failing_corese_send_one_query_and_all_fail(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Rule 10: with Corese down, request k must not wait k timeouts, nor send its own query."""
    corese.raises(httpx.ConnectError("down"))

    results = await asyncio.gather(*(cache.get(clock) for _ in range(10)), return_exceptions=True)

    assert len(corese.queries) == 1
    assert all(isinstance(r, HTTPException) and r.status_code == 502 for r in results)


async def test_a_failed_first_load_is_remembered_briefly_then_tried_again(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Rule 9 and 10: the same error at once, then a new attempt once the memory expires."""
    corese.raises(httpx.ReadTimeout("slow"))
    with pytest.raises(HTTPException) as first:
        await cache.get(clock)
    sent = len(corese.queries)

    clock.advance(seconds=FAILURE_MEMORY_SECONDS - 1)
    with pytest.raises(HTTPException) as remembered:
        await cache.get(clock)
    assert len(corese.queries) == sent
    assert remembered.value.status_code == first.value.status_code == 504

    clock.advance(seconds=1)
    corese.recovers()
    answer_loads(corese, [member(7)])
    index = await cache.get(clock)

    assert index.classify(CONCEPT)[0] == "animal"


@pytest.mark.parametrize(
    ("error", "status"),
    [(httpx.ConnectError("down"), 502), (httpx.ReadTimeout("slow"), 504)],
)
async def test_without_any_index_the_corese_error_propagates(
    cache: ThesaurusCollections,
    corese: FakeCorese,
    clock: FakeClock,
    error: httpx.TransportError,
    status: int,
) -> None:
    """AGENTS.md rule 9: with no index, an empty answer would classify everything `general`."""
    corese.raises(error)

    with pytest.raises(HTTPException) as raised:
        await cache.get(clock)

    assert raised.value.status_code == status


async def test_a_full_members_page_is_a_failure_not_a_truncated_index(
    cache: ThesaurusCollections,
    corese: FakeCorese,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catches an index cut at the safety LIMIT that would misclassify the missing members."""
    rows = [member(7, f"{CONCEPT}{n}") for n in range(MEMBERS_LIMIT)]
    answer_loads(corese, rows)

    with (
        caplog.at_level(logging.ERROR, logger="zoomathia.thesaurus"),
        pytest.raises(HTTPException) as raised,
    ):
        await cache.get(clock)

    assert raised.value.status_code == 502
    assert "safety limit" in caplog.text


async def test_a_full_members_page_keeps_the_stale_index(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    answer_loads(corese, [member(7)])
    first = await cache.get(clock)
    answer_loads(corese, [member(7, f"{CONCEPT}{n}") for n in range(MEMBERS_LIMIT)])
    clock.advance(seconds=INDEX_TTL_SECONDS)

    await cache.get(clock)
    await settle()

    assert await cache.get(clock) is first


@pytest.mark.parametrize("rows", [[], [member(6), member(15)]])
async def test_an_index_without_member_in_any_mapped_collection_is_refused(
    cache: ThesaurusCollections,
    corese: FakeCorese,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
    rows: list[dict[str, str]],
) -> None:
    """Catches a thesaurus graph that is not loaded: everything would silently be `general`."""
    answer_loads(corese, rows)

    with (
        caplog.at_level(logging.ERROR, logger="zoomathia.thesaurus"),
        pytest.raises(HTTPException) as raised,
    ):
        await cache.get(clock)

    assert raised.value.status_code == 502
    assert "Index refused" in caplog.text


async def test_an_empty_answer_keeps_the_stale_index(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    answer_loads(corese, [member(7)])
    first = await cache.get(clock)
    answer_loads(corese, [])
    clock.advance(seconds=INDEX_TTL_SECONDS)

    await cache.get(clock)
    await settle()

    assert await cache.get(clock) is first


async def test_preload_loads_in_the_background_without_blocking(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """The warm-up returns at once; the first request then finds the index loaded."""
    answer_loads(corese, [member(7)])

    cache.preload(clock)
    assert corese.queries == []  # nothing ran yet: the load is a task
    await settle()
    index = await cache.get(clock)

    assert len(corese.queries) == 2
    assert index.classify(CONCEPT)[0] == "animal"


async def test_preload_never_raises_when_corese_is_down(
    cache: ThesaurusCollections,
    corese: FakeCorese,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A Corese outage at startup is a warning, never a crash."""
    corese.raises(httpx.ConnectError("down"))

    with caplog.at_level(logging.WARNING, logger="zoomathia.thesaurus"):
        cache.preload(clock)
        await settle()

    assert "not loaded" in caplog.text


async def test_the_application_startup_preloads_the_index_when_the_setting_is_on(
    corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The lifespan starts the warm-up; with the setting off (tests) it sends nothing."""
    answer_loads(corese, [member(7)])
    monkeypatch.setattr(settings, "THESAURUS_PRELOAD", True)

    async with lifespan(app):
        await settle()
        index = await thesaurus_collections.get(utcnow)

    assert index.classify(CONCEPT)[0] == "animal"
    assert len(corese.queries) == 2


async def test_the_application_starts_while_corese_is_down(
    corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    corese.raises(httpx.ConnectError("down"))
    monkeypatch.setattr(settings, "THESAURUS_PRELOAD", True)

    async with lifespan(app):
        await settle()


async def test_the_application_startup_sends_nothing_by_default_in_tests(
    corese: FakeCorese,
) -> None:
    """The test environment switches the warm-up off: no test startup reaches Corese."""
    async with lifespan(app):
        await settle()

    assert corese.queries == []


MALFORMED = {"head": {"vars": []}, "results": {"bindings": None}}


async def test_a_malformed_answer_without_index_is_a_502_remembered_briefly(
    cache: ThesaurusCollections,
    corese: FakeCorese,
    clock: FakeClock,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Catches a TypeError that escaped as a 500 and left no failure memory."""
    corese.returns_document(MALFORMED)

    with caplog.at_level(logging.WARNING, logger="zoomathia.thesaurus"):
        with pytest.raises(HTTPException) as first:
            await cache.get(clock)
        sent = len(corese.queries)
        clock.advance(seconds=FAILURE_MEMORY_SECONDS - 1)
        with pytest.raises(HTTPException) as remembered:
            await cache.get(clock)

    assert first.value.status_code == remembered.value.status_code == 502
    assert len(corese.queries) == sent
    assert "unreadable" in caplog.text  # the original error is logged
    clock.advance(seconds=1)
    with pytest.raises(HTTPException):
        await cache.get(clock)
    assert len(corese.queries) == sent + 1


async def test_a_malformed_refresh_keeps_the_stale_index_and_waits_for_the_retry_delay(
    cache: ThesaurusCollections, corese: FakeCorese, clock: FakeClock
) -> None:
    """Catches refreshes chained one after another: `_refresh_at` stayed in the past."""
    answer_loads(corese, [member(7)])
    first = await cache.get(clock)
    corese.returns_document(MALFORMED)
    clock.advance(seconds=INDEX_TTL_SECONDS)
    await cache.get(clock)
    await settle()
    attempts = len(corese.queries)

    assert await cache.get(clock) is first
    await settle()
    assert len(corese.queries) == attempts  # no immediate second refresh

    clock.advance(seconds=RETRY_DELAY_SECONDS)
    assert await cache.get(clock) is first
    await settle()
    assert len(corese.queries) == attempts + 1
