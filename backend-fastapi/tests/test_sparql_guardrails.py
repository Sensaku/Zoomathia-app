"""Abuse and denial-of-service guardrails of the SPARQL endpoints (RM-ACC-02).

Every endpoint that runs a full query goes through `prepare_query`, the answers of
Corese are bounded in size, heavy queries run under a concurrency limit, and the
number of criteria of a request is capped.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import httpx
import pytest

from app.routers import concepts as concepts_router
from app.routers import search as search_router
from app.services import sparql_client as sparql_client_module
from app.services.sparql_client import (
    MAX_CACHE_BYTES,
    MAX_RESPONSE_BYTES,
    MAX_SEARCH_RESPONSE_BYTES,
    SPARQLClient,
)
from app.shared.limits import (
    MAX_CRITERIA,
    MAX_HEAVY_PER_CLIENT,
    MAX_HEAVY_TOTAL,
    HeavyQueryLimiter,
    heavy_limiter,
)
from app.shared.sparql_guard import prepare_query
from tests.conftest import FakeCorese
from tests.test_sparql_injection import VALID_IRI, literals

SERVICE_QUERY = "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }"
UNBOUNDED_QUERY = "SELECT ?s ?p ?o WHERE { ?s ?p ?o }"
# The address of the test client under the ASGI transport.
CLIENT_ADDRESS = "127.0.0.1"


def sent_with_limit(corese: FakeCorese) -> bool:
    return corese.queries[-1].rstrip().endswith("LIMIT 10000")


# --- the guard on every endpoint that runs a full query -----------------------------


async def test_rm_acc_02_playground_refuses_service_before_reaching_corese(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/sparql/execute", json={"query": SERVICE_QUERY})

    assert response.status_code == 403
    assert "169.254" not in response.text
    assert corese.queries == []


async def test_rm_acc_02_playground_bounds_an_unbounded_select(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(["s"], [{"s": "http://ex.org/a"}])

    response = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert sent_with_limit(corese)


async def test_rm_acc_02_playground_keeps_the_response_shape(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(["s", "p"], [{"s": "a", "p": "b"}])

    response = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})

    assert set(response.json()) == {"head", "results", "count", "spoReady"}
    assert response.json()["spoReady"] is True


@pytest.mark.parametrize(
    ("query", "status"),
    [
        ("DELETE WHERE { ?s ?p ?o }", 403),
        ("INSERT DATA { <http://ex.org/a> <http://ex.org/b> <http://ex.org/c> }", 403),
        ("DROP SILENT ALL", 403),
        ("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }", 400),
        ("SELECT * WHERE { ?s ?p", 400),
        ("SELECT * WHERE { ?s ?p ?o } LIMIT 10001", 400),
        ("SELECT * WHERE { S\\u0045RVICE <http://ex.org/sparql> { ?s ?p ?o } }", 400),
    ],
)
async def test_rm_acc_02_playground_refuses_what_the_guard_refuses(
    client: httpx.AsyncClient, corese: FakeCorese, query: str, status: int
) -> None:
    response = await client.post("/sparql/execute", json={"query": query})

    assert response.status_code == status
    assert corese.queries == []


async def test_rm_acc_02_playground_accepts_a_variable_named_like_a_keyword(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    query = 'SELECT ?add WHERE { ?add ?p "load" }'

    response = await client.post("/sparql/execute", json={"query": query})

    assert response.status_code == 200
    assert len(corese.queries) == 1


async def test_rm_acc_02_saved_query_with_service_is_refused(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {"title": "Federated query", "query_text": SERVICE_QUERY}

    response = await client.post("/queries", json=body)

    assert response.status_code == 403
    assert (await client.get("/queries", params={"search": "Federated query"})).json() == []


async def test_rm_acc_02_saved_query_spo_variant_is_validated_too(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {
        "title": "SPO variant",
        "query_text": UNBOUNDED_QUERY,
        "query_spo_text": "DROP ALL",
    }

    response = await client.post("/queries", json=body)

    assert response.status_code == 403


async def test_rm_acc_02_updating_a_saved_query_validates_its_new_text(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    created = await client.post(
        "/queries", json={"title": "To be updated", "query_text": UNBOUNDED_QUERY}
    )
    query_id = created.json()["id"]

    response = await client.put(f"/queries/{query_id}", json={"query_text": SERVICE_QUERY})

    assert response.status_code == 403
    assert (await client.get(f"/queries/{query_id}")).json()["query_text"] == UNBOUNDED_QUERY


async def test_rm_acc_02_saved_query_is_stored_as_written_and_bounded_when_executed(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    created = await client.post(
        "/queries", json={"title": "Unbounded on purpose", "query_text": UNBOUNDED_QUERY}
    )
    assert created.status_code == 200
    query_id = created.json()["id"]
    assert created.json()["query_text"] == UNBOUNDED_QUERY

    response = await client.post(f"/queries/{query_id}/execute")

    assert response.status_code == 200
    assert sent_with_limit(corese)


async def test_rm_acc_02_stored_query_with_service_is_not_executed(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    from app.services.staging_store import staging_store

    with staging_store._get_connection() as connection:
        connection.execute("UPDATE saved_queries SET query_text = ? WHERE id = 1", (SERVICE_QUERY,))

    response = await client.post("/queries/1/execute")

    assert response.status_code == 403
    assert corese.queries == []


async def test_rm_acc_02_every_stored_native_query_passes_the_guard(
    client: httpx.AsyncClient,
) -> None:
    stored = (await client.get("/queries")).json()
    native = [query for query in stored if query["is_builtin"]]
    assert native

    for query in native:
        prepare_query(query["query_text"])
        if query["query_spo_text"]:
            prepare_query(query["query_spo_text"])


@pytest.mark.parametrize("path", ["/getQC", "/getQCspo", "/download-qc-json", "/download-qc-csv"])
async def test_rm_acc_02_competency_questions_are_sent_with_a_limit(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    response = await client.get(path, params={"id": 1})

    assert response.status_code == 200
    assert sent_with_limit(corese)


async def test_rm_acc_02_get_qc_keeps_its_response_shape(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(["s"], [{"s": "a"}])

    response = await client.get("/getQC", params={"id": 1})

    assert set(response.json()) == {"query", "results", "titleVizu", "spo", "table"}
    assert response.json()["table"] == {"columns": ["s"], "data": [["a"]]}


@pytest.mark.parametrize("path", ["/download-custom-search-json", "/download-custom-search-csv"])
async def test_rm_acc_02_export_refuses_service_and_updates(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    federated = await client.get(path, params={"sparql": SERVICE_QUERY})
    update = await client.get(path, params={"sparql": "DROP ALL"})

    assert federated.status_code == 403
    assert update.status_code == 403
    assert corese.queries == []


@pytest.mark.parametrize("path", ["/download-custom-search-json", "/download-custom-search-csv"])
async def test_rm_acc_02_export_bounds_an_unbounded_select(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    corese.returns(["s"], [{"s": "a"}])

    response = await client.get(path, params={"sparql": UNBOUNDED_QUERY})

    assert response.status_code == 200
    assert sent_with_limit(corese)


# --- size of the answers of Corese -----------------------------------------------------


SMALL_DEFAULT_CAP = 5000
SMALL_SEARCH_CAP = 20000
CONCEPT_PARAGRAPH_REQUESTS: list[tuple[str, dict[str, Any]]] = [
    (
        "/getParagraphWithConcept",
        {"uri": VALID_IRI, "concepts": [{"value": "http://ex.org/c"}]},
    ),
    ("/getParagraphsWithConcepts", {"concepts": ["http://ex.org/c"]}),
]


@pytest.fixture
def small_default_cap(monkeypatch: pytest.MonkeyPatch) -> int:
    """Shrink the default cap (read at call time), to test it without 10 MB."""
    monkeypatch.setattr(sparql_client_module, "MAX_RESPONSE_BYTES", SMALL_DEFAULT_CAP)
    return SMALL_DEFAULT_CAP


@pytest.fixture
def small_search_cap(monkeypatch: pytest.MonkeyPatch, small_default_cap: int) -> int:
    """Shrink both caps, to test the searches without 64 MB.

    The routers bind `MAX_SEARCH_RESPONSE_BYTES` at import time, so the attribute is
    patched on each router module.
    """
    monkeypatch.setattr(search_router, "MAX_SEARCH_RESPONSE_BYTES", SMALL_SEARCH_CAP)
    monkeypatch.setattr(concepts_router, "MAX_SEARCH_RESPONSE_BYTES", SMALL_SEARCH_CAP)
    return SMALL_SEARCH_CAP


def test_rm_acc_02_the_caps_fit_the_measured_results() -> None:
    # Largest competency question: 2.1 MB. Author-only custom search for Diodorus
    # Siculus: about 48 MB, which only the searches (heavy-query slot) may hold.
    assert MAX_RESPONSE_BYTES == 10 * 1024 * 1024
    assert MAX_SEARCH_RESPONSE_BYTES == 64 * 1024 * 1024
    assert MAX_CACHE_BYTES == 32 * 1024 * 1024


@pytest.mark.parametrize("declare_length", [True, False])
async def test_rm_acc_02_a_user_query_result_above_10_mb_is_refused_with_422(
    client: httpx.AsyncClient, corese: FakeCorese, declare_length: bool
) -> None:
    corese.returns_large(MAX_RESPONSE_BYTES + 1, declare_length=declare_length)

    response = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})

    assert response.status_code == 422
    assert response.json() == {"detail": "SPARQL result too large"}


async def test_rm_acc_02_a_user_query_result_of_exactly_10_mb_is_accepted(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns_large(MAX_RESPONSE_BYTES, declare_length=False)

    response = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})

    assert response.status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "options"),
    [
        ("POST", "/queries/1/execute", {}),
        ("GET", "/getQC", {"params": {"id": 1}}),
        ("GET", "/getQCspo", {"params": {"id": 1}}),
        ("GET", "/download-qc-json", {"params": {"id": 1}}),
        ("GET", "/download-qc-csv", {"params": {"id": 1}}),
        ("GET", "/download-custom-search-json", {"params": {"sparql": UNBOUNDED_QUERY}}),
        ("GET", "/download-custom-search-csv", {"params": {"sparql": UNBOUNDED_QUERY}}),
    ],
)
async def test_rm_acc_02_every_route_that_validates_a_query_text_keeps_the_10_mb_cap(
    client: httpx.AsyncClient,
    corese: FakeCorese,
    method: str,
    path: str,
    options: dict[str, Any],
) -> None:
    corese.returns_large(MAX_RESPONSE_BYTES + 1, declare_length=False)

    response = await client.request(method, path, **options)

    assert response.status_code == 422


async def test_rm_acc_02_a_reading_endpoint_result_above_10_mb_is_refused_with_422(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    # No reading endpoint holds a heavy-query slot, so none may hold a large result.
    corese.returns_large(MAX_RESPONSE_BYTES + 1, declare_length=False)

    response = await client.get("/getAuthors")

    assert response.status_code == 422


@pytest.mark.parametrize("declare_length", [True, False])
async def test_rm_acc_02_a_server_built_query_result_above_the_default_cap_is_refused(
    client: httpx.AsyncClient, corese: FakeCorese, small_default_cap: int, declare_length: bool
) -> None:
    corese.returns_large(small_default_cap + 1, declare_length=declare_length)

    response = await client.get("/getAuthors")

    assert response.status_code == 422


async def test_rm_acc_02_a_server_built_query_result_of_exactly_the_default_cap_is_accepted(
    client: httpx.AsyncClient, corese: FakeCorese, small_default_cap: int
) -> None:
    corese.returns_large(small_default_cap, declare_length=False)

    response = await client.get("/getAuthors")

    assert response.status_code == 200


async def test_rm_acc_02_the_custom_search_accepts_a_result_above_the_default_cap(
    client: httpx.AsyncClient, corese: FakeCorese, small_search_cap: int
) -> None:
    corese.returns_large(SMALL_DEFAULT_CAP + 1, declare_length=False)

    response = await client.post("/customSearch", json={"author": ["Aelian"]})

    assert response.status_code == 200


@pytest.mark.parametrize("declare_length", [True, False])
async def test_rm_acc_02_the_custom_search_refuses_a_result_above_the_search_cap(
    client: httpx.AsyncClient, corese: FakeCorese, small_search_cap: int, declare_length: bool
) -> None:
    corese.returns_large(small_search_cap + 1, declare_length=declare_length)

    response = await client.post("/customSearch", json={"author": ["Aelian"]})

    assert response.status_code == 422


@pytest.mark.parametrize(("path", "body"), CONCEPT_PARAGRAPH_REQUESTS)
async def test_rm_acc_02_a_paragraph_search_accepts_a_result_above_the_default_cap(
    client: httpx.AsyncClient,
    corese: FakeCorese,
    small_search_cap: int,
    path: str,
    body: dict[str, Any],
) -> None:
    corese.returns_large(SMALL_DEFAULT_CAP + 1, declare_length=False)

    response = await client.post(path, json=body)

    assert response.status_code == 200


@pytest.mark.parametrize(("path", "body"), CONCEPT_PARAGRAPH_REQUESTS)
async def test_rm_acc_02_a_paragraph_search_refuses_a_result_above_the_search_cap(
    client: httpx.AsyncClient,
    corese: FakeCorese,
    small_search_cap: int,
    path: str,
    body: dict[str, Any],
) -> None:
    corese.returns_large(small_search_cap + 1, declare_length=False)

    response = await client.post(path, json=body)

    assert response.status_code == 422


async def test_rm_acc_02_an_oversized_result_is_not_cached(
    client: httpx.AsyncClient, corese: FakeCorese, small_default_cap: int
) -> None:
    corese.returns_large(small_default_cap + 1)
    await client.get("/getAuthors")
    corese.returns(["name"], [{"name": "Aelian"}])

    response = await client.get("/getAuthors")

    assert response.json() == [{"name": "Aelian"}]


async def test_rm_acc_02_the_error_mapping_of_the_endpoint_is_unchanged(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.raises(httpx.ConnectError("refused"))
    unreachable = await client.get("/getAuthors")
    corese.raises(httpx.ReadTimeout("slow"))
    slow = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})

    assert unreachable.status_code == 502
    assert slow.status_code == 504


async def test_rm_acc_02_the_cache_is_bounded_by_total_size_and_evicts_the_oldest(
    corese: FakeCorese,
) -> None:
    corese.returns_large(1000)
    small_cache = SPARQLClient(max_cache_bytes=2500)
    try:
        for name in ("A", "B", "C"):
            await small_cache.query(f"SELECT ?{name} WHERE {{ ?{name} ?p ?o }}")
        sent = len(corese.queries)

        await small_cache.query("SELECT ?C WHERE { ?C ?p ?o }")  # still cached
        assert len(corese.queries) == sent
        await small_cache.query("SELECT ?A WHERE { ?A ?p ?o }")  # evicted by size
        assert len(corese.queries) == sent + 1
    finally:
        await small_cache.close()


async def test_rm_acc_02_a_cached_result_is_the_same_for_every_caller(
    corese: FakeCorese,
) -> None:
    corese.returns(["s"], [{"s": "a"}])
    cached_client = SPARQLClient()
    try:
        first = await cached_client.query(UNBOUNDED_QUERY)
        second = await cached_client.query(UNBOUNDED_QUERY)
    finally:
        await cached_client.close()

    assert first == second
    assert len(corese.queries) == 1


# --- concurrency limit of heavy queries ---------------------------------------------


@contextmanager
def held_slots(client_address: str, count: int) -> Iterator[None]:
    """Occupy `count` heavy-query slots of a client, and always give them back."""
    taken = 0
    try:
        for _ in range(count):
            assert heavy_limiter.try_acquire(client_address)
            taken += 1
        yield
    finally:
        for _ in range(taken):
            heavy_limiter.release(client_address)


HEAVY_REQUESTS: list[tuple[str, str, dict[str, Any]]] = [
    ("POST", "/sparql/execute", {"json": {"query": UNBOUNDED_QUERY}}),
    ("POST", "/queries/1/execute", {}),
    ("POST", "/customSearch", {"json": {"author": ["Aelian"]}}),
    ("GET", "/getQC", {"params": {"id": 1}}),
    ("GET", "/getQCspo", {"params": {"id": 1}}),
    ("GET", "/download-qc-json", {"params": {"id": 1}}),
    ("GET", "/download-qc-csv", {"params": {"id": 1}}),
    ("GET", "/download-custom-search-json", {"params": {"sparql": UNBOUNDED_QUERY}}),
    ("GET", "/download-custom-search-csv", {"params": {"sparql": UNBOUNDED_QUERY}}),
    (
        "POST",
        "/getParagraphWithConcept",
        {"json": {"uri": VALID_IRI, "concepts": [{"value": "http://ex.org/c"}]}},
    ),
    ("POST", "/getParagraphsWithConcepts", {"json": {"concepts": ["http://ex.org/c"]}}),
]


@pytest.mark.parametrize(("method", "path", "options"), HEAVY_REQUESTS)
async def test_rm_acc_02_heavy_endpoints_answer_429_when_the_client_has_no_free_slot(
    client: httpx.AsyncClient,
    corese: FakeCorese,
    method: str,
    path: str,
    options: dict[str, Any],
) -> None:
    with held_slots(CLIENT_ADDRESS, MAX_HEAVY_PER_CLIENT):
        refused = await client.request(method, path, **options)
    allowed = await client.request(method, path, **options)

    assert refused.status_code == 429
    assert "retry" in refused.json()["detail"].lower()
    assert refused.headers["retry-after"]
    assert allowed.status_code == 200
    assert len(corese.queries) == 1  # the refused request never reached Corese


async def test_rm_acc_02_saved_query_create_and_update_are_heavy_requests_too(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post("/queries", json={"title": "Heavy", "query_text": UNBOUNDED_QUERY})
    query_id = created.json()["id"]
    body = {"title": "Heavy", "query_text": UNBOUNDED_QUERY}

    with held_slots(CLIENT_ADDRESS, MAX_HEAVY_PER_CLIENT):
        create_refused = await client.post("/queries", json=body)
        update_refused = await client.put(f"/queries/{query_id}", json=body)
    create_allowed = await client.post("/queries", json=body)
    update_allowed = await client.put(f"/queries/{query_id}", json=body)

    assert create_refused.status_code == update_refused.status_code == 429
    assert create_refused.headers["retry-after"]
    assert create_allowed.status_code == update_allowed.status_code == 200
    assert len((await client.get("/queries", params={"search": "Heavy"})).json()) == 2


async def test_rm_acc_02_a_free_slot_is_enough_to_run_a_heavy_query(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    with held_slots(CLIENT_ADDRESS, MAX_HEAVY_PER_CLIENT - 1):
        response = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})

    assert response.status_code == 200


async def test_rm_acc_02_reading_endpoints_are_not_limited(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(["name"], [{"name": "Aelian"}])

    with held_slots(CLIENT_ADDRESS, MAX_HEAVY_PER_CLIENT):
        response = await client.get("/getAuthors")

    assert response.status_code == 200


async def test_rm_acc_02_the_slot_is_given_back_when_a_heavy_request_fails(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.raises(httpx.ConnectError("refused"))
    for _ in range(MAX_HEAVY_PER_CLIENT + 1):
        failed = await client.post("/sparql/execute", json={"query": UNBOUNDED_QUERY})
        assert failed.status_code == 502  # never 429: no slot leaks after a failure


def test_rm_acc_02_the_limiter_caps_each_client_and_the_whole_worker() -> None:
    limiter = HeavyQueryLimiter()

    assert limiter.try_acquire("a")
    assert limiter.try_acquire("a")
    assert not limiter.try_acquire("a")  # per-client limit
    assert limiter.try_acquire("b")
    assert limiter.try_acquire("b")
    assert not limiter.try_acquire("c")  # worker limit: 4 in total
    assert MAX_HEAVY_TOTAL == 4

    limiter.release("a")
    assert limiter.try_acquire("c")
    assert not limiter.try_acquire("a")  # the worker is full again


def test_rm_acc_02_the_limiter_forgets_a_client_that_released_everything() -> None:
    limiter = HeavyQueryLimiter()
    limiter.try_acquire("a")
    limiter.release("a")

    assert limiter.try_acquire("b")
    assert limiter.try_acquire("b")
    assert limiter.try_acquire("a")
    assert limiter.try_acquire("a")


# --- caps on the number of criteria -----------------------------------------------------


def authors(count: int) -> list[str]:
    return [f"Author {number}" for number in range(count)]


def concept_uris(count: int) -> list[str]:
    return [f"http://ex.org/concept/{number}" for number in range(count)]


async def test_rm_acc_02_custom_search_accepts_exactly_the_maximum_number_of_criteria(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {"author": authors(10), "work": [VALID_IRI + str(n) for n in range(10)]}
    body["excluded_works"] = [VALID_IRI + "_x" + str(n) for n in range(10)]

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert len(corese.queries) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"author": authors(MAX_CRITERIA + 1)},
        {"work": [VALID_IRI + str(n) for n in range(MAX_CRITERIA + 1)]},
        {"author": ["a"], "excluded_works": [VALID_IRI + str(n) for n in range(MAX_CRITERIA)]},
        {"concept_criteria": [{"uri": uri} for uri in concept_uris(MAX_CRITERIA + 1)]},
        {"collection_criteria": [{"uri": uri} for uri in concept_uris(MAX_CRITERIA + 1)]},
        {"concepts": [{"uri": uri} for uri in concept_uris(MAX_CRITERIA + 1)]},
        {
            "author": authors(10),
            "concept_criteria": [{"uri": uri} for uri in concept_uris(11)],
            "collection_criteria": [{"uri": uri} for uri in concept_uris(10)],
        },
    ],
    ids=[
        "authors",
        "works",
        "excluded-works",
        "concept-criteria",
        "collection-criteria",
        "legacy-concepts",
        "mixed-total",
    ],
)
async def test_rm_acc_02_custom_search_refuses_more_than_the_maximum_number_of_criteria(
    client: httpx.AsyncClient, corese: FakeCorese, body: dict[str, Any]
) -> None:
    response = await client.post("/customSearch", json=body)

    assert response.status_code == 400
    assert str(MAX_CRITERIA) in response.json()["detail"]
    assert corese.queries == []


async def test_rm_acc_02_paragraph_with_concept_accepts_the_maximum_number_of_concepts(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    concepts = [{"value": uri} for uri in concept_uris(MAX_CRITERIA)]

    response = await client.post(
        "/getParagraphWithConcept", json={"uri": VALID_IRI, "concepts": concepts}
    )

    assert response.status_code == 200
    assert corese.queries[0].count("oa:hasBody") == MAX_CRITERIA


async def test_rm_acc_02_paragraph_with_concept_refuses_too_many_concepts(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    concepts = [{"value": uri} for uri in concept_uris(MAX_CRITERIA + 1)]

    response = await client.post(
        "/getParagraphWithConcept", json={"uri": VALID_IRI, "concepts": concepts}
    )

    assert response.status_code == 400
    assert corese.queries == []


async def test_rm_acc_02_paragraphs_with_concepts_refuses_too_many_concepts(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post(
        "/getParagraphsWithConcepts", json={"concepts": concept_uris(MAX_CRITERIA + 1)}
    )

    assert response.status_code == 400
    assert corese.queries == []


async def test_rm_acc_02_paragraphs_with_concepts_accepts_the_maximum_number_of_concepts(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post(
        "/getParagraphsWithConcepts", json={"concepts": concept_uris(MAX_CRITERIA)}
    )

    assert response.status_code == 200
    assert corese.queries[0].count("oa:hasBody") == MAX_CRITERIA


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/getParagraphWithConcept", {"uri": VALID_IRI, "concepts": []}),
        ("/getParagraphsWithConcepts", {"concepts": []}),
        ("/getParagraphsWithConcepts", {}),
        ("/getParagraphsWithConcepts", {"concepts": "http://ex.org/c"}),
    ],
)
async def test_rm_acc_02_a_paragraph_search_without_concepts_is_refused(
    client: httpx.AsyncClient, corese: FakeCorese, path: str, body: dict[str, Any]
) -> None:
    response = await client.post(path, json=body)

    assert response.status_code == 400
    assert corese.queries == []


# --- /getTranslation: the directory of a file never becomes a regular expression -------


def file_row(url: str) -> dict[str, str]:
    return {"file": url}


def candidate_row(work: str, title: str, url: str) -> dict[str, str]:
    return {"work": work, "title": title, "file": url}


async def test_get_translation_returns_the_matching_english_edition(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    directory = "http://ex.org/files/"
    corese.returns_in_turn(
        (["file"], [file_row(directory + "12a.xml")]),
        (
            ["work", "title", "file"],
            [
                candidate_row("http://ex.org/w/other", "Other", directory + "12e_2.xml"),
                candidate_row("http://ex.org/w/en", "English", directory + "12e.xml"),
            ],
        ),
    )

    response = await client.get("/getTranslation", params={"uri": VALID_IRI})

    assert response.json() == {"uri": "http://ex.org/w/en", "title": "English"}
    assert "STRSTARTS" in corese.queries[1].upper()
    assert "REGEX" not in corese.queries[1].upper()
    assert directory + "12e" in literals(corese.queries[1])


async def test_get_translation_follows_the_numbered_suffix_of_the_original(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    directory = "http://ex.org/files/"
    corese.returns_in_turn(
        (["file"], [file_row(directory + "12a_2.xml")]),
        (
            ["work", "title", "file"],
            [
                candidate_row("http://ex.org/w/en", "English", directory + "12e.xml"),
                candidate_row("http://ex.org/w/en2", "English 2", directory + "12e_2.xml"),
            ],
        ),
    )

    response = await client.get("/getTranslation", params={"uri": VALID_IRI})

    assert response.json() == {"uri": "http://ex.org/w/en2", "title": "English 2"}


async def test_get_translation_keeps_the_exact_file_name_check_in_python(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    directory = "http://ex.org/files/"
    corese.returns_in_turn(
        (["file"], [file_row(directory + "12a.xml")]),
        (
            ["work", "title", "file"],
            [
                # The prefix filter of Corese returns these, the exact pattern must not.
                candidate_row("http://ex.org/w/1", "Wrong 1", directory + "12e.xml.bak"),
                candidate_row("http://ex.org/w/2", "Wrong 2", directory + "12east.xml"),
                candidate_row("http://ex.org/w/3", "Wrong 3", directory + "12e_x.xml"),
            ],
        ),
    )

    response = await client.get("/getTranslation", params={"uri": VALID_IRI})

    assert response.status_code == 200
    assert response.json() is None


@pytest.mark.parametrize("directory", ['http://ex.org/a"b(c)+/', "http://ex.org/a.b/"])
async def test_get_translation_keeps_a_directory_with_special_characters_in_one_literal(
    client: httpx.AsyncClient, corese: FakeCorese, directory: str
) -> None:
    corese.returns_in_turn(
        (["file"], [file_row(directory + "12a.xml")]),
        (
            ["work", "title", "file"],
            [candidate_row("http://ex.org/w/en", "En", directory + "12e.xml")],
        ),
    )

    response = await client.get("/getTranslation", params={"uri": VALID_IRI})

    assert response.json() == {"uri": "http://ex.org/w/en", "title": "En"}
    assert literals(corese.queries[1]).count(directory + "12e") == 1


async def test_get_translation_refuses_a_directory_that_cannot_be_a_safe_literal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(["file"], [file_row("http://ex.org/a\\u0022 } #/12a.xml")])

    response = await client.get("/getTranslation", params={"uri": VALID_IRI})

    assert response.status_code == 200
    assert response.json() is None
    assert len(corese.queries) == 1  # no second query was built from that directory
