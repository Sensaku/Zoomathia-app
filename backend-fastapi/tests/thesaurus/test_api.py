"""The category and the collections in the API responses (RM-CON-01, RM-CON-02)."""

import httpx
import pytest

from app.main import app
from app.thesaurus.categories import collection_iri
from app.thesaurus.collections import get_thesaurus_collections
from tests.conftest import FakeCorese
from tests.contributions.conftest import create_annotation, review_body
from tests.support.accounts import Member
from tests.support.thesaurus import CONCEPT_IN_SUBJECT, DEFAULT_COLLECTION_INDEX, LION

SECTION = "http://ns.inria.fr/zoomathia/Fictus/de_animalibus/1/1"
PARAGRAPH = f"{SECTION}/text/1"
MALFORMED_IRI = "http://x> ?s ?p ?o } #"
PROPOSAL = "http://zoomathia.i3s.unice.fr/concept/proposal/12"
CONCEPT_TYPE = "http://www.w3.org/2004/02/skos/core#Concept"
ZOONYME = {"iri": collection_iri(7), "labels": {"fr": "Zoonyme", "en": "Zoonyms"}}
SUBJECT = {"iri": collection_iri(6), "labels": {"fr": "Sujet", "en": "Subject"}}
ANNOTATION_ROW = {
    "paragraph": PARAGRAPH,
    "annotation": f"{PARAGRAPH}/annotation/1",
    "annotation_type": "http://ns.inria.fr/zoomathia/zoo#Annotation",
    "concept": LION,
    "label": "lion",
    "start": "15",
    "end": "18",
    "exact": "leo",
}
ANNOTATION_VARIABLES = list(ANNOTATION_ROW)
PARAGRAPH_ANNOTATION_VARIABLES = [v for v in ANNOTATION_VARIABLES if v != "paragraph"]


async def test_rm_con_02_the_categories_are_published_in_priority_order_with_general_last(
    client: httpx.AsyncClient,
) -> None:
    """Catches a table that is not published, or listed in another order than RM-CON-03."""
    response = await client.get("/thesaurus/categories")

    assert response.status_code == 200
    body = response.json()
    assert [item["category"] for item in body] == [
        "animal",
        "behavior",
        "anatomy",
        "place",
        "person",
        "general",
    ]
    assert [c["iri"] for c in body[0]["collections"]] == [collection_iri(7), collection_iri(10)]
    assert body[0]["collections"][0] == ZOONYME
    assert body[-1] == {"category": "general", "collections": []}


async def test_rm_con_02_a_mapped_collection_without_label_in_the_cache_is_listed_with_none(
    client: httpx.AsyncClient,
) -> None:
    """The table is always complete: a missing label is `{}`, never a missing collection."""
    response = await client.get("/thesaurus/categories")

    person = {item["category"]: item for item in response.json()}["person"]
    assert person["collections"] == [
        {"iri": collection_iri(1), "labels": {}},
        {"iri": collection_iri(5), "labels": {}},
    ]


async def test_rm_con_02_a_failing_corese_without_index_is_a_502_not_an_empty_table(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """AGENTS.md rule 9, through the real dependency."""
    app.dependency_overrides.pop(get_thesaurus_collections)
    corese.raises(httpx.ConnectError("down"))

    response = await client.get("/thesaurus/categories")

    assert response.status_code == 502


async def test_rm_con_02_get_concepts_carries_the_category_and_the_collections(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """Catches a leftover `collection` string, or a category read from Corese rows."""
    corese.returns(
        PARAGRAPH_ANNOTATION_VARIABLES,
        [
            ANNOTATION_ROW,
            {**ANNOTATION_ROW, "concept": CONCEPT_IN_SUBJECT, "label": "sujet"},
        ],
    )

    response = await client.get("/getConcepts", params={"uri": PARAGRAPH, "lang": "fr"})

    body = response.json()
    assert body["lion"]["category"] == "animal"
    assert body["lion"]["collections"] == [ZOONYME]
    assert body["sujet"]["category"] == "general"
    assert body["sujet"]["collections"] == [SUBJECT]
    assert "collection" not in body["sujet"]
    assert "?coll" not in corese.queries[0]


async def test_rm_con_02_a_label_that_sounds_like_an_animal_is_not_an_animal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """The old heuristics made "animal domestique" an animal whatever its collections."""
    corese.returns(
        PARAGRAPH_ANNOTATION_VARIABLES,
        [{**ANNOTATION_ROW, "concept": CONCEPT_IN_SUBJECT, "label": "animal domestique"}],
    )

    response = await client.get("/getConcepts", params={"uri": PARAGRAPH})

    assert response.json()["animal domestique"]["category"] == "general"


async def test_rm_con_02_search_concepts_carries_the_category_and_the_collections(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """A proposal IRI has no collection: it is general, with none."""
    corese.returns(
        ["concept", "label", "type"],
        [
            {"concept": LION, "label": "lion", "type": CONCEPT_TYPE},
            {"concept": PROPOSAL, "label": "lion bis", "type": "http://x.org/ns#Proposal"},
        ],
    )

    response = await client.get("/searchConcepts", params={"input": "lion"})

    assert response.json() == [
        {
            "uri": LION,
            "label": "lion",
            "type": "Concept",
            "category": "animal",
            "collections": [ZOONYME],
        },
        {
            "uri": PROPOSAL,
            "label": "lion bis",
            "type": "Proposal",
            "category": "general",
            "collections": [],
        },
    ]
    assert "?coll" not in corese.queries[0]


async def test_rm_con_02_the_section_carries_the_category_of_reference_annotations(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """Catches a leftover `collection` field, or a reference annotation without category."""
    corese.returns(ANNOTATION_VARIABLES, [ANNOTATION_ROW])

    response = await client.get("/annotations/section", params={"section_uri": SECTION})

    reference = response.json()["reference_annotations"][PARAGRAPH]["lion"]
    assert reference == {
        "concept": LION,
        "label": "lion",
        "type": "http://ns.inria.fr/zoomathia/zoo#Annotation",
        "category": "animal",
        "collections": [ZOONYME],
        "offset": [{"start": 15, "end": 18}],
    }
    query = " ".join(corese.queries[0].split())
    assert "SELECT DISTINCT ?paragraph ?annotation ?annotation_type ?concept ?label" in query
    assert "?coll" not in query


async def test_rm_con_02_pending_staged_annotations_carry_their_category(
    client: httpx.AsyncClient, corese: FakeCorese, contributor: Member
) -> None:
    """RM-CON-02: the category is computed for every annotation, pending included."""
    corese.returns(ANNOTATION_VARIABLES, [ANNOTATION_ROW])
    pending = await create_annotation(contributor, paragraph_uri=PARAGRAPH, concept_uri=LION)
    in_proposal = await create_annotation(
        contributor, paragraph_uri=PARAGRAPH, concept_uri=PROPOSAL, target_text="x"
    )

    response = await client.get(
        "/annotations/section", params={"section_uri": SECTION, "include_pending": "true"}
    )

    items = {item["id"]: item for item in response.json()["staged_annotations"]}
    assert items[pending["id"]]["status"] == "pending"
    assert items[pending["id"]]["category"] == "animal"
    assert items[pending["id"]]["collections"] == [ZOONYME]
    assert items[in_proposal["id"]]["category"] == "general"
    assert items[in_proposal["id"]]["collections"] == []


async def test_rm_con_02_every_contribution_route_returns_the_category(
    contributor: Member, second_contributor: Member
) -> None:
    """Catches a route that builds an `AnnotationOut` without the index."""
    created = await create_annotation(contributor, concept_uri=LION)
    page = await contributor.get("/annotations", params={"paragraph_uri": created["paragraph_uri"]})
    one = await contributor.get(f"/annotations/{created['id']}")
    edited = await contributor.patch(
        f"/annotations/{created['id']}",
        json={
            "version": created["version"],
            "concept_uri": CONCEPT_IN_SUBJECT,
            "concept_label": "sujet",
        },
    )
    reviewed = await second_contributor.post(
        f"/annotations/{created['id']}/review", json=review_body(edited.json()["version"])
    )

    assert created["category"] == "animal"
    assert created["collections"] == [ZOONYME]
    assert page.json()["items"][0]["category"] == "animal"
    assert one.json()["collections"] == [ZOONYME]
    assert edited.status_code == 200, edited.text
    assert edited.json()["category"] == "general"
    assert edited.json()["collections"] == [SUBJECT]
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["category"] == "general"


async def test_a_write_never_succeeds_while_its_response_fails(
    client: httpx.AsyncClient, corese: FakeCorese, contributor: Member
) -> None:
    """The index resolves before the handler: with no index, the POST is refused, stores nothing."""
    app.dependency_overrides.pop(get_thesaurus_collections)
    corese.raises(httpx.ConnectError("down"))

    refused = await contributor.post(
        "/annotations",
        json={
            "paragraph_uri": PARAGRAPH,
            "target_text": "leo",
            "start_offset": 0,
            "end_offset": 3,
            "concept_uri": LION,
            "concept_label": "lion",
        },
    )

    app.dependency_overrides[get_thesaurus_collections] = lambda: DEFAULT_COLLECTION_INDEX
    stored = await client.get("/annotations")
    assert refused.status_code == 502
    assert stored.json()["total"] == 0


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("/annotations/section", {"section_uri": MALFORMED_IRI}),
        ("/getConcepts", {"uri": MALFORMED_IRI}),
        ("/annotations/section", {"section_uri": SECTION, "lang": 'en"} #'}),
        ("/getConcepts", {"uri": PARAGRAPH, "lang": 'en"} #'}),
    ],
)
async def test_a_malformed_iri_or_language_is_a_400_even_when_the_index_cannot_load(
    client: httpx.AsyncClient, corese: FakeCorese, path: str, params: dict[str, str]
) -> None:
    """FastAPI resolves dependencies first: without a prior check, this was a 502."""
    app.dependency_overrides.pop(get_thesaurus_collections)
    corese.raises(httpx.ConnectError("down"))

    response = await client.get(path, params=params)

    assert response.status_code == 400
    assert corese.queries == []
