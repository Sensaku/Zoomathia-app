"""Known gaps from the 2026-11-15 audit, written as executable specifications.

Each test states the expected behaviour. A gap that is still open is marked
`xfail(strict=True)`: when the P0/P1 work fixes it, pytest reports an unexpected pass and
the marker must be removed, so that the test then guards against regressions. Every gap of
the audit that was written here is fixed (RM-CTB-01, RM-CTB-04, RM-QC-02 and the exact
paragraph match by P0-3 and P0-4b), so the tests below are plain regression tests.
"""

import httpx

from tests.conftest import FakeCorese
from tests.support.accounts import Member

PARAGRAPH_1 = "http://ns.inria.fr/zoomathia/Ex/work/text/1"
PARAGRAPH_10 = "http://ns.inria.fr/zoomathia/Ex/work/text/10"

ANNOTATION = {
    "target_text": "leo",
    "start_offset": 0,
    "end_offset": 3,
    "concept_uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
    "concept_label": "leo",
}


async def test_rm_ctb_04_client_cannot_create_a_validated_annotation(
    contributor: Member,
) -> None:
    response = await contributor.post(
        "/annotations", json={**ANNOTATION, "paragraph_uri": PARAGRAPH_1, "status": "validated"}
    )

    assert response.status_code == 201
    assert response.json()["status"] == "pending"


async def test_rm_ctb_01_nobody_writes_annotations_without_an_account(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post("/annotations", json={**ANNOTATION, "paragraph_uri": PARAGRAPH_1})

    assert response.status_code == 401


async def test_rm_qc_02_native_question_cannot_be_overwritten_anonymously(
    client: httpx.AsyncClient,
) -> None:
    response = await client.put("/queries/1", json={"title": "Overwritten"})

    assert response.status_code in (401, 403)


async def test_listing_by_paragraph_matches_the_exact_uri(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    paragraph_10 = PARAGRAPH_10
    await contributor.post(
        "/annotations",
        json={**ANNOTATION, "paragraph_uri": paragraph_10, "target_paragraphs": [paragraph_10]},
    )

    own = await client.get("/annotations", params={"paragraph_uri": paragraph_10})
    assert own.status_code == 200
    assert [item["paragraph_uri"] for item in own.json()["items"]] == [paragraph_10]

    response = await client.get("/annotations", params={"paragraph_uri": PARAGRAPH_1})

    assert response.status_code == 200
    assert all(item["paragraph_uri"] != paragraph_10 for item in response.json()["items"])


async def test_rm_acc_02_unbounded_select_is_limited(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/sparql/execute", json={"query": "SELECT * WHERE { ?s ?p ?o }"})

    assert response.status_code in (200, 400)
    if response.status_code == 200:
        assert "LIMIT" in corese.queries[-1].upper()
    else:
        assert corese.queries == []


async def test_concept_search_does_not_use_user_input_as_regex(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.get("/searchConcepts", params={"input": "(a+)+$"})

    assert response.status_code == 200
    assert "regex(" not in corese.queries[-1].lower()
