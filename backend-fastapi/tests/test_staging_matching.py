"""Exact matches in the contributions and saved queries (RM-ACC-02: text never changes a query).

The paragraph filter is an exact match on IRIs, the proposal and saved query searches match
their text literally. The `LIKE` escaping itself is tested in `tests/test_shared_sql.py`.
"""

import json
from typing import Any

import httpx

from app.contributions.models import ContributionStatus
from app.contributions.repository import AnnotationRepository
from app.core.database import Database
from tests.support.accounts import Member
from tests.support.plant import plant_annotation, plant_proposal

BASE = "http://ns.inria.fr/zoomathia/Ex/work/text/"
CONCEPT = "https://opentheso.huma-num.fr/?idc=1&idt=th310"
EVERY_STATUS = list(ContributionStatus)


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
    assert response.status_code == 201
    result: dict[str, Any] = response.json()
    return result


async def ids_for(client: httpx.AsyncClient, paragraph: str) -> list[int]:
    response = await client.get("/annotations", params={"paragraph_uri": paragraph})
    assert response.status_code == 200
    return [item["id"] for item in response.json()["items"]]


async def test_listing_a_paragraph_does_not_return_the_annotations_of_a_longer_iri(
    contributor: Member,
) -> None:
    one = await annotate(contributor, f"{BASE}1")
    ten = await annotate(contributor, f"{BASE}10")
    await annotate(contributor, f"{BASE}1/extra")

    assert await ids_for(contributor, f"{BASE}1") == [one["id"]]
    assert await ids_for(contributor, f"{BASE}10") == [ten["id"]]


async def test_listing_a_paragraph_matches_a_covered_paragraph_exactly(
    contributor: Member,
) -> None:
    span = await annotate(
        contributor,
        f"{BASE}1",
        end_paragraph_uri=f"{BASE}2",
        target_paragraphs=[f"{BASE}1", f"{BASE}2"],
        scope_type="multi_paragraph",
    )

    assert await ids_for(contributor, f"{BASE}2") == [span["id"]]
    assert await ids_for(contributor, f"{BASE}20") == []
    assert await ids_for(contributor, f"{BASE}") == []


async def test_a_paragraph_filter_made_of_like_wildcards_matches_nothing(
    contributor: Member,
) -> None:
    await annotate(contributor, f"{BASE}1")

    assert await ids_for(contributor, "%") == []
    assert await ids_for(contributor, "_") == []
    assert await ids_for(contributor, f"{BASE}%") == []


async def test_the_status_and_paragraph_filters_combine(
    contributor: Member, second_contributor: Member
) -> None:
    first = await annotate(contributor, f"{BASE}1")
    await annotate(contributor, f"{BASE}1")
    await second_contributor.post(
        f"/annotations/{first['id']}/review", json={"version": 1, "decision": "validated"}
    )

    response = await contributor.get(
        "/annotations", params={"paragraph_uri": f"{BASE}1", "status": "validated"}
    )

    assert [item["id"] for item in response.json()["items"]] == [first["id"]]


async def test_a_section_filter_keeps_only_the_annotations_that_cover_its_paragraphs(
    database: Database, contributor: Member
) -> None:
    inside = await annotate(contributor, f"{BASE}1")
    spanning = await annotate(
        contributor,
        f"{BASE}5",
        target_paragraphs=[f"{BASE}5", f"{BASE}2"],
        scope_type="multi_paragraph",
    )
    await annotate(contributor, f"{BASE}10")

    async with database.session_maker() as session:
        kept = await AnnotationRepository(session).in_paragraphs(
            [f"{BASE}1", f"{BASE}2"], EVERY_STATUS, 100
        )

    assert sorted(a.id for a in kept) == sorted([inside["id"], spanning["id"]])


async def test_an_empty_section_matches_no_annotation(
    database: Database, contributor: Member
) -> None:
    await annotate(contributor, f"{BASE}1")

    async with database.session_maker() as session:
        assert await AnnotationRepository(session).in_paragraphs([], EVERY_STATUS, 100) == []


async def test_a_paragraph_covered_by_a_historical_row_is_found_by_its_json_array(
    client: httpx.AsyncClient,
) -> None:
    historical = plant_annotation(
        paragraph_uri=f"{BASE}1", target_paragraphs=json.dumps([f"{BASE}1", f"{BASE}2"])
    )

    assert await ids_for(client, f"{BASE}2") == [historical]
    assert await ids_for(client, f"{BASE}9") == []


# --- proposal search ---


async def test_the_proposal_search_matches_percent_and_underscore_literally(
    client: httpx.AsyncClient,
) -> None:
    percent = plant_proposal(pref_label="rate 50% sure")
    underscore = plant_proposal(pref_label="snake_case")
    plant_proposal(pref_label="rate 500 sure")
    plant_proposal(pref_label="snakeXcase")

    def ids(response: httpx.Response) -> list[int]:
        return [item["id"] for item in response.json()["items"]]

    assert ids(await client.get("/thesaurus/proposals", params={"q": "50%"})) == [percent]
    assert ids(await client.get("/thesaurus/proposals", params={"q": "e_c"})) == [underscore]
    assert ids(await client.get("/thesaurus/proposals", params={"q": "%"})) == [percent]
    assert ids(await client.get("/thesaurus/proposals", params={"q": "%%"})) == []
    assert ids(await client.get("/thesaurus/proposals", params={"q": "_"})) == [underscore]


async def test_the_proposal_search_still_ignores_case_and_looks_in_every_field(
    client: httpx.AsyncClient,
) -> None:
    by_label = plant_proposal(pref_label="Aigle royal")
    by_alt = plant_proposal(pref_label="x1", alt_labels=json.dumps(["Aquila"]))
    by_author = plant_proposal(pref_label="x2", author_label="Arnaud B.")
    by_definition = plant_proposal(pref_label="x3", definition="Rapace diurne")
    by_broader = plant_proposal(pref_label="x4", broader_concept_label="Accipitridé")

    async def ids(text: str) -> list[int]:
        response = await client.get("/thesaurus/proposals", params={"q": text})
        return sorted(item["id"] for item in response.json()["items"])

    assert await ids("AIGLE") == [by_label]
    assert await ids("aquila") == [by_alt]
    assert await ids("arnaud") == [by_author]
    assert await ids("rapace") == [by_definition]
    assert await ids("accipitr") == [by_broader]


# --- saved queries ---


async def test_the_saved_query_search_matches_wildcards_literally(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    async def save(title: str, description: str | None = None) -> int:
        body = {"title": title, "description": description, "query_text": "ASK { ?s ?p ?o }"}
        created = await contributor.post("/queries", json=body)
        assert created.status_code == 201
        return int(created.json()["id"])

    percent = await save("Coverage 100% done")
    underscore = await save("plain", "uses snake_case names")
    await save("Coverage 1000 done")
    await save("snakeXcase")

    async def titles(search: str) -> list[int]:
        response = await client.get("/queries", params={"search": search})
        return [q["id"] for q in response.json()["items"] if not q["is_builtin"]]

    assert await titles("100%") == [percent]
    assert await titles("snake_case") == [underscore]
    assert await titles("%%") == []
    assert len(await titles("%")) == 1  # only the title with a real percent sign
    assert await titles("coverage 100%") == [percent]  # LIKE ignores ASCII case
