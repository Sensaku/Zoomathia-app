"""Known gaps from the 2026-11-15 audit, written as executable specifications.

Each test states the expected behaviour and is marked `xfail(strict=True)`.
When the P0/P1 work fixes a gap, the test passes, pytest reports an unexpected
pass, and the marker must be removed: the test then guards against regressions.
"""

import csv
import io

import httpx
import pytest

from app.routers.export import json_to_csv
from tests.conftest import FakeCorese, sparql_json


def known_gap(reason: str) -> pytest.MarkDecorator:
    return pytest.mark.xfail(strict=True, reason=reason)


ANNOTATION = {
    "target_text": "leo",
    "start_offset": 0,
    "end_offset": 3,
    "concept_uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
    "concept_label": "leo",
}


@known_gap("RM-CTB-04: the client can set the status of a new annotation")
async def test_rm_ctb_04_client_cannot_create_a_validated_annotation(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post(
        "/annotations", json={**ANNOTATION, "paragraph_uri": "http://ex/p/1", "status": "Validé"}
    )

    assert response.status_code in (200, 201)
    assert response.json().get("status") != "Validé"


@known_gap("RM-QC-02: anyone can overwrite a native competency question")
async def test_rm_qc_02_native_question_cannot_be_overwritten_anonymously(
    client: httpx.AsyncClient,
) -> None:
    response = await client.put("/queries/1", json={"title": "Overwritten"})

    assert response.status_code in (401, 403)


@known_gap("LIKE '%uri%' matches paragraph 10 when listing paragraph 1")
async def test_listing_by_paragraph_matches_the_exact_uri(client: httpx.AsyncClient) -> None:
    paragraph_10 = "http://ex/work/text/10"
    await client.post(
        "/annotations",
        json={**ANNOTATION, "paragraph_uri": paragraph_10, "target_paragraphs": [paragraph_10]},
    )

    own = await client.get("/annotations", params={"paragraph_uri": paragraph_10})
    assert own.status_code == 200
    assert [item["paragraph_uri"] for item in own.json()] == [paragraph_10]

    response = await client.get("/annotations", params={"paragraph_uri": "http://ex/work/text/1"})

    assert response.status_code == 200
    assert all(item["paragraph_uri"] != paragraph_10 for item in response.json())


async def test_rm_acc_02_export_rejects_federated_queries(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    query = "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }"

    response = await client.get("/download-custom-search-json", params={"sparql": query})

    assert response.status_code in (400, 403, 422)
    assert corese.queries == []


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


@known_gap("CSV export does not quote values containing the separator")
def test_csv_export_keeps_greek_question_marks_in_one_column() -> None:
    document = sparql_json(["text", "author"], [{"text": "ἆρα λέων; ἢ οὔ", "author": "Aelian"}])

    rows = list(csv.reader(io.StringIO(json_to_csv(document)), delimiter=";"))

    assert rows[1] == ["ἆρα λέων; ἢ οὔ", "Aelian"]
