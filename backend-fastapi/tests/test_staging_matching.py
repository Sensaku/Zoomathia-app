"""Exact matches in the staging store (RM-ACC-02: user text never changes a query's meaning)."""

import json
from typing import Any

import httpx
import pytest

from app.services.staging_store import escape_like, staging_store
from tests.test_rdf_exports import plant_annotation, plant_proposal

BASE = "http://ns.inria.fr/zoomathia/Ex/work/text/"
CONCEPT = "https://opentheso.huma-num.fr/?idc=1&idt=th310"


async def annotate(client: httpx.AsyncClient, paragraph: str, **changes: Any) -> dict[str, Any]:
    body = {
        "paragraph_uri": paragraph,
        "target_text": "leo",
        "start_offset": 0,
        "end_offset": 3,
        "concept_uri": CONCEPT,
        "concept_label": "leo",
        **changes,
    }
    response = await client.post("/annotations", json=body)
    assert response.status_code == 200
    result: dict[str, Any] = response.json()
    return result


async def ids_for(client: httpx.AsyncClient, paragraph: str) -> list[int]:
    response = await client.get("/annotations", params={"paragraph_uri": paragraph})
    assert response.status_code == 200
    return [item["id"] for item in response.json()]


async def test_listing_a_paragraph_does_not_return_the_annotations_of_a_longer_iri(
    client: httpx.AsyncClient,
) -> None:
    one = await annotate(client, f"{BASE}1")
    ten = await annotate(client, f"{BASE}10")
    await annotate(client, f"{BASE}1/extra")

    assert await ids_for(client, f"{BASE}1") == [one["id"]]
    assert await ids_for(client, f"{BASE}10") == [ten["id"]]


async def test_listing_a_paragraph_matches_a_covered_paragraph_exactly(
    client: httpx.AsyncClient,
) -> None:
    span = await annotate(
        client,
        f"{BASE}1",
        end_paragraph_uri=f"{BASE}2",
        target_paragraphs=[f"{BASE}1", f"{BASE}2"],
        scope_type="multi_paragraph",
    )

    assert await ids_for(client, f"{BASE}2") == [span["id"]]
    assert await ids_for(client, f"{BASE}20") == []
    assert await ids_for(client, f"{BASE}") == []


async def test_a_paragraph_filter_made_of_like_wildcards_matches_nothing(
    client: httpx.AsyncClient,
) -> None:
    await annotate(client, f"{BASE}1")

    assert await ids_for(client, "%") == []
    assert await ids_for(client, "_") == []
    assert await ids_for(client, f"{BASE}%") == []


async def test_a_legacy_row_with_invalid_json_does_not_break_the_listing(
    client: httpx.AsyncClient,
) -> None:
    broken = plant_annotation(paragraph_uri=f"{BASE}1", target_paragraphs="not json [")
    null_json = plant_annotation(paragraph_uri=f"{BASE}1", target_paragraphs=None)

    assert sorted(await ids_for(client, f"{BASE}1")) == sorted([broken, null_json])
    assert await ids_for(client, f"{BASE}9") == []


async def test_the_status_and_paragraph_filters_combine(client: httpx.AsyncClient) -> None:
    first = await annotate(client, f"{BASE}1")
    await annotate(client, f"{BASE}1")
    await client.patch(f"/annotations/{first['id']}/status", json={"status": "Validé"})

    response = await client.get(
        "/annotations", params={"paragraph_uri": f"{BASE}1", "status": "Validé"}
    )

    assert [item["id"] for item in response.json()] == [first["id"]]


async def test_a_section_filter_keeps_only_the_annotations_that_cover_its_paragraphs(
    client: httpx.AsyncClient,
) -> None:
    inside = await annotate(client, f"{BASE}1")
    spanning = await annotate(
        client, f"{BASE}5", target_paragraphs=[f"{BASE}5", f"{BASE}2"], scope_type="multi_paragraph"
    )
    await annotate(client, f"{BASE}10")

    kept = staging_store.get_annotations(section_paragraphs=[f"{BASE}1", f"{BASE}2"])

    assert sorted(a.id for a in kept) == sorted([inside["id"], spanning["id"]])


async def test_an_empty_section_matches_no_annotation(client: httpx.AsyncClient) -> None:
    await annotate(client, f"{BASE}1")

    assert staging_store.get_annotations(section_paragraphs=[]) == []
    assert len(staging_store.get_annotations(section_paragraphs=None)) == 1


# --- LIKE escaping ---


@pytest.mark.parametrize(
    ("text", "escaped"),
    [
        ("plain", "plain"),
        ("50%", "50" + chr(92) + "%"),
        ("a_b", "a" + chr(92) + "_b"),
        (chr(92), chr(92) * 2),
        ("%_" + chr(92), chr(92) + "%" + chr(92) + "_" + chr(92) * 2),
    ],
)
def test_escape_like_escapes_the_wildcards_and_the_escape_character(
    text: str, escaped: str
) -> None:
    assert escape_like(text) == escaped


async def test_the_proposal_search_matches_percent_and_underscore_literally(
    client: httpx.AsyncClient,
) -> None:
    percent = plant_proposal(pref_label="rate 50% sure")
    underscore = plant_proposal(pref_label="snake_case")
    plant_proposal(pref_label="rate 500 sure")
    plant_proposal(pref_label="snakeXcase")

    def ids(items: list[dict[str, Any]]) -> list[int]:
        return [item["id"] for item in items]

    assert ids((await client.get("/thesaurus/proposals", params={"q": "50%"})).json()) == [percent]
    assert ids((await client.get("/thesaurus/proposals", params={"q": "e_c"})).json()) == [
        underscore
    ]
    assert ids((await client.get("/thesaurus/proposals", params={"q": "%"})).json()) == [percent]
    assert ids((await client.get("/thesaurus/proposals", params={"q": "%%"})).json()) == []
    assert ids((await client.get("/thesaurus/proposals", params={"q": "_"})).json()) == [underscore]


async def test_the_proposal_search_still_ignores_case_and_looks_in_every_field(
    client: httpx.AsyncClient,
) -> None:
    by_label = plant_proposal(pref_label="Aigle royal")
    by_alt = plant_proposal(pref_label="x1", alt_labels=json.dumps(["Aquila"]))
    by_author = plant_proposal(pref_label="x2", contributor_name="Arnaud B.")

    def ids(items: list[dict[str, Any]]) -> list[int]:
        return sorted(item["id"] for item in items)

    assert ids((await client.get("/thesaurus/proposals", params={"q": "AIGLE"})).json()) == [
        by_label
    ]
    assert ids((await client.get("/thesaurus/proposals", params={"q": "aquila"})).json()) == [
        by_alt
    ]
    assert ids((await client.get("/thesaurus/proposals", params={"q": "arnaud"})).json()) == [
        by_author
    ]


async def test_the_saved_query_search_matches_wildcards_literally(
    client: httpx.AsyncClient,
) -> None:
    async def save(title: str, description: str | None = None) -> int:
        body = {"title": title, "description": description, "query_text": "ASK { ?s ?p ?o }"}
        created = await client.post("/queries", json=body)
        assert created.status_code == 200
        return int(created.json()["id"])

    percent = await save("Coverage 100% done")
    underscore = await save("plain", "uses snake_case names")
    await save("Coverage 1000 done")
    await save("snakeXcase")

    async def titles(search: str) -> list[int]:
        response = await client.get("/queries", params={"search": search})
        return [q["id"] for q in response.json() if not q["is_builtin"]]

    assert await titles("100%") == [percent]
    assert await titles("snake_case") == [underscore]
    assert await titles("%%") == []
    assert len(await titles("%")) == 1  # only the title with a real percent sign
    assert await titles("coverage 100%") == [percent]  # LIKE ignores ASCII case
