"""The OpenTheso client encodes what it sends and bounds what it keeps (RM-ACC-02).

No test reaches the network: the HTTP layer is simulated with respx.
"""

import logging
from collections.abc import Iterator
from types import SimpleNamespace

import httpx
import pytest
import respx

from app.services import opentheso_client as module
from app.services.opentheso_client import OpenThesoClient

AUTOCOMPLETE_PATH = "/openapi/v1/concept/th310/autocomplete/"


@pytest.fixture(autouse=True)
def empty_cache() -> Iterator[None]:
    module.clear_cache()
    yield
    module.clear_cache()


@pytest.fixture
def opentheso(network_guard: respx.MockRouter | None) -> respx.Route:
    """Simulated OpenTheso server: answers every request with an empty suggestion list."""
    assert network_guard is not None
    return network_guard.route(host="opentheso.huma-num.fr").respond(200, json=[])


@pytest.mark.parametrize(
    ("text", "encoded"),
    [
        ("canis", "canis"),
        ("a/b", "a%2Fb"),
        ("a?b=c", "a%3Fb%3Dc"),
        ("a#b", "a%23b"),
        ("..", "%2E%2E"),
        ("../../../etc", "..%2F..%2F..%2Fetc"),
        ("a..b", "a..b"),
        ("100%", "100%25"),
        ("a b", "a%20b"),
        ("ἄνθρωπος", "%E1%BC%84%CE%BD%CE%B8%CF%81%CF%89%CF%80%CE%BF%CF%82"),
        ("x\\y", "x%5Cy"),
        ("x;y&z", "x%3By%26z"),
    ],
)
async def test_the_autocomplete_text_is_one_encoded_path_segment(
    opentheso: respx.Route, text: str, encoded: str
) -> None:
    await OpenThesoClient().autocomplete(text)

    assert opentheso.call_count == 1
    request = opentheso.calls.last.request
    assert request.url.raw_path == (AUTOCOMPLETE_PATH + encoded).encode()
    assert request.url.query == b""
    assert request.url.fragment == ""


async def test_the_autocomplete_route_encodes_the_text_it_receives(
    client: httpx.AsyncClient, opentheso: respx.Route
) -> None:
    response = await client.get("/thesaurus/autocomplete", params={"q": "a/b?c#d"})

    assert response.status_code == 200
    assert (
        opentheso.calls.last.request.url.raw_path == (AUTOCOMPLETE_PATH + "a%2Fb%3Fc%23d").encode()
    )


async def test_a_blank_or_one_letter_text_sends_no_request(opentheso: respx.Route) -> None:
    assert await OpenThesoClient().autocomplete("   ") == []
    assert await OpenThesoClient().autocomplete("a") == []

    assert opentheso.call_count == 0


async def test_suggestions_are_normalized_and_cached(
    network_guard: respx.MockRouter | None,
) -> None:
    assert network_guard is not None
    route = network_guard.route(host="opentheso.huma-num.fr").respond(
        200,
        json=[
            {
                "label": "canis",
                "uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
                "identifier": 1,
            },
            {"label": "no uri"},
            "garbage",
        ],
    )
    client = OpenThesoClient()

    first = await client.autocomplete("canis")
    second = await client.autocomplete("CANIS ")

    assert (
        first
        == second
        == [
            {
                "label": "canis",
                "uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
                "identifier": "1",
            }
        ]
    )
    assert route.call_count == 1


@pytest.mark.parametrize(
    "concept_id",
    ["../x", "1.jsonld", "a b", "", "a" * 65, "%2e%2e", "1/2", "1?x=2", "1#", "é", "1\n2"],
)
async def test_an_invalid_concept_id_gives_422_without_any_outgoing_request(
    client: httpx.AsyncClient, opentheso: respx.Route, concept_id: str
) -> None:
    response = await client.get("/thesaurus/concept", params={"id": concept_id})

    assert response.status_code == 422
    assert opentheso.call_count == 0


async def test_the_client_refuses_an_invalid_concept_id_too(opentheso: respx.Route) -> None:
    with pytest.raises(ValueError):
        await OpenThesoClient().get_concept_details("../x")

    assert opentheso.call_count == 0


@pytest.mark.parametrize("concept_id", ["107399", "pcrt4v7jKE3TVw", "a" * 64, "7"])
async def test_a_valid_concept_id_reaches_opentheso(
    client: httpx.AsyncClient, network_guard: respx.MockRouter | None, concept_id: str
) -> None:
    assert network_guard is not None
    route = network_guard.route(host="opentheso.huma-num.fr").respond(200, json={"@id": concept_id})

    response = await client.get("/thesaurus/concept", params={"id": concept_id})

    assert response.status_code == 200
    assert response.json() == {"@id": concept_id}
    assert route.calls.last.request.url.raw_path == f"/api/th310.{concept_id}.jsonld".encode()


async def test_an_unknown_concept_is_a_404(
    client: httpx.AsyncClient, network_guard: respx.MockRouter | None
) -> None:
    assert network_guard is not None
    network_guard.route(host="opentheso.huma-num.fr").respond(404)

    response = await client.get("/thesaurus/concept", params={"id": "999"})

    assert response.status_code == 404


# --- Cache ---


def test_the_cache_is_bounded_to_one_thousand_entries() -> None:
    assert module.MAX_CACHE_ENTRIES == 1000


async def test_the_cache_evicts_the_least_recently_used_entry_beyond_its_bound(
    monkeypatch: pytest.MonkeyPatch, opentheso: respx.Route
) -> None:
    monkeypatch.setattr(module, "MAX_CACHE_ENTRIES", 3)
    client = OpenThesoClient()

    for text in ("aa", "bb", "cc"):
        await client.autocomplete(text)
    await client.autocomplete("aa")  # served from the cache: "aa" becomes the most recent
    await client.autocomplete("dd")  # evicts "bb", the least recently used

    assert len(module._CACHE) == 3
    assert sorted(module._CACHE) == [
        "autocomplete:th310:aa",
        "autocomplete:th310:cc",
        "autocomplete:th310:dd",
    ]
    assert opentheso.call_count == 4


def test_a_flood_of_distinct_keys_cannot_grow_the_cache_beyond_its_bound() -> None:
    for number in range(3 * module.MAX_CACHE_ENTRIES):
        module._cache_put(f"autocomplete:th310:text{number}", [], now=0.0)

    assert len(module._CACHE) == module.MAX_CACHE_ENTRIES
    assert "autocomplete:th310:text0" not in module._CACHE
    assert f"autocomplete:th310:text{3 * module.MAX_CACHE_ENTRIES - 1}" in module._CACHE


async def test_an_entry_expires_after_its_time_to_live(
    monkeypatch: pytest.MonkeyPatch, opentheso: respx.Route
) -> None:
    clock = {"now": 1_000.0}
    monkeypatch.setattr(module, "time", SimpleNamespace(time=lambda: clock["now"]))
    client = OpenThesoClient()

    await client.autocomplete("canis")
    clock["now"] += module.CACHE_TTL_SECONDS - 1
    await client.autocomplete("canis")
    assert opentheso.call_count == 1

    clock["now"] += 2
    await client.autocomplete("canis")
    assert opentheso.call_count == 2
    assert len(module._CACHE) == 1


# --- Failures ---


async def test_an_opentheso_failure_is_logged_and_gives_no_suggestion(
    network_guard: respx.MockRouter | None, caplog: pytest.LogCaptureFixture
) -> None:
    assert network_guard is not None
    network_guard.route(host="opentheso.huma-num.fr").mock(side_effect=httpx.ConnectError("down"))

    with caplog.at_level(logging.WARNING, logger="app.services.opentheso_client"):
        result = await OpenThesoClient().autocomplete("canis")

    assert result == []
    assert any("autocomplete failed" in record.getMessage() for record in caplog.records)
    assert module._CACHE == {}


async def test_a_failed_concept_retrieval_is_logged_and_not_cached(
    network_guard: respx.MockRouter | None, caplog: pytest.LogCaptureFixture
) -> None:
    assert network_guard is not None
    network_guard.route(host="opentheso.huma-num.fr").respond(500)

    with caplog.at_level(logging.WARNING, logger="app.services.opentheso_client"):
        result = await OpenThesoClient().get_concept_details("107399")
        failed = await OpenThesoClient().get_concept_details("1")

    assert result is None
    assert failed is None
    assert module._CACHE == {}
