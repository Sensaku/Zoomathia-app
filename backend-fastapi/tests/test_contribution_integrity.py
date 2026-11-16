"""Integrity of contributions: server-side status (RM-CTB-04) and native questions (RM-QC-02)."""

from typing import Any

import httpx
import pytest

from app.services.staging_store import staging_store

PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/1"
ANNOTATION: dict[str, Any] = {
    "paragraph_uri": PARAGRAPH,
    "target_text": "leo",
    "start_offset": 0,
    "end_offset": 3,
    "concept_uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
    "concept_label": "leo",
}


@pytest.mark.parametrize("status", ["Validé", "Rejeté", "En attente de validation", "", None, 7])
async def test_rm_ctb_04_a_status_sent_with_a_new_annotation_is_ignored(
    client: httpx.AsyncClient, status: Any
) -> None:
    response = await client.post("/annotations", json={**ANNOTATION, "status": status})

    assert response.status_code == 200
    assert response.json()["status"] == "En attente de validation"
    stored = (await client.get("/annotations")).json()
    assert [item["status"] for item in stored] == ["En attente de validation"]


async def test_rm_ctb_04_an_annotation_without_status_is_pending(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post("/annotations", json=ANNOTATION)

    assert response.json()["status"] == "En attente de validation"


async def test_rm_ctb_04_the_status_can_still_be_changed_by_the_route_until_accounts_exist(
    client: httpx.AsyncClient,
) -> None:
    annotation_id = (await client.post("/annotations", json=ANNOTATION)).json()["id"]

    response = await client.patch(f"/annotations/{annotation_id}/status", json={"status": "Validé"})

    assert response.status_code == 200
    assert response.json()["status"] == "Validé"


async def test_rm_qc_02_a_native_question_cannot_be_modified(client: httpx.AsyncClient) -> None:
    before = (await client.get("/queries/1")).json()

    response = await client.put(
        "/queries/1",
        json={"title": "Overwritten", "query_text": "SELECT ?s WHERE { ?s ?p ?o } LIMIT 1"},
    )

    assert response.status_code == 403
    assert "administrateur" in response.json()["detail"]
    assert (await client.get("/queries/1")).json() == before


async def test_rm_qc_02_every_native_question_is_protected(client: httpx.AsyncClient) -> None:
    natives = [q for q in (await client.get("/queries")).json() if q["is_builtin"]]
    assert natives

    for query in natives:
        put = await client.put(f"/queries/{query['id']}", json={"category": "x"})
        delete = await client.delete(f"/queries/{query['id']}")
        assert put.status_code == 403, query["id"]
        assert delete.status_code == 403, query["id"]


async def test_rm_qc_02_the_store_refuses_to_modify_a_native_question() -> None:
    from app.models.annotation_models import UpdateSavedQueryRequest

    with pytest.raises(ValueError, match="native"):
        staging_store.update_saved_query(1, UpdateSavedQueryRequest(title="Overwritten"))


async def test_rm_qc_02_an_unknown_query_is_still_a_404(client: httpx.AsyncClient) -> None:
    response = await client.put("/queries/99999", json={"title": "Whatever"})

    assert response.status_code == 404


async def test_rm_qc_06_a_personal_query_stays_editable_until_accounts_exist(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/queries",
        json={"title": "Personal query", "query_text": "SELECT ?s WHERE { ?s ?p ?o } LIMIT 5"},
    )
    query_id = created.json()["id"]

    response = await client.put(f"/queries/{query_id}", json={"title": "Renamed"})

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"
