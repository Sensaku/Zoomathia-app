"""
Tests d'intégration automatisés pour la Phase 4 :
- Autocomplétion OpenTheso
- Persistance et export RDF Turtle des annotations W3C (écritures avec un compte, RM-CTB-01)
- Gestion des propositions d'enrichissement du thésaurus et relecture par les pairs
- Sécurité et exécution du SPARQL Playground
"""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from tests.support.accounts import Member


@pytest.mark.asyncio
@pytest.mark.live
async def test_thesaurus_autocomplete():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/thesaurus/autocomplete?q=canis")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            assert "label" in data[0]
            assert "uri" in data[0]


@pytest.mark.asyncio
async def test_create_and_list_annotation(contributor: Member):
    test_para = "http://ns.inria.fr/zoomathia/corpus/test_para_42"

    # 1. Création
    create_payload = {
        "paragraph_uri": test_para,
        "target_text": "canis lupus",
        "start_offset": 5,
        "end_offset": 16,
        "concept_uri": "https://opentheso.huma-num.fr/?idc=107399&idt=th310",
        "concept_label": "canis",
    }
    res_create = await contributor.post("/annotations", json=create_payload)
    assert res_create.status_code == 201
    created = res_create.json()
    annot_id = created["id"]
    assert created["paragraph_uri"] == test_para
    assert created["target_text"] == "canis lupus"
    assert created["start_offset"] == 5
    assert created["author"]["display_name"] == "Ada Lovelace"

    # 2. Consultation par paragraphe
    res_list = await contributor.get(f"/annotations?paragraph_uri={test_para}")
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert len(items) >= 1
    assert any(it["id"] == annot_id for it in items)

    # 3. Export Turtle
    res_export = await contributor.get("/annotations/export-ttl")
    assert res_export.status_code == 200
    assert "oa:Annotation" in res_export.text
    assert "canis lupus" in res_export.text

    # 4. Suppression
    res_del = await contributor.delete(f"/annotations/{annot_id}")
    assert res_del.status_code == 204


@pytest.mark.asyncio
async def test_invalid_annotation_offset(contributor: Member):
    invalid_payload = {
        "paragraph_uri": "http://ns.inria.fr/zoomathia/corpus/test",
        "target_text": "invalide",
        "start_offset": 20,
        "end_offset": 10,  # Erreur : fin < début
        "concept_uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
        "concept_label": "test",
    }
    res = await contributor.post("/annotations", json=invalid_payload)
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_thesaurus_proposals(contributor: Member, second_contributor: Member):
    prop_payload = {
        "pref_label": "Cerf élaphe des forêts",
        "language": "fr",
        "alt_labels": ["Cervus elaphus", "Grand cerf"],
        "broader_concept_uri": "https://opentheso.huma-num.fr/?idc=107399&idt=th310",
        "definition": "Grand mammifère cervidé chassé dans l'Antiquité",
    }
    # 1. Création
    res_create = await contributor.post("/thesaurus/proposals", json=prop_payload)
    assert res_create.status_code == 201
    prop = res_create.json()
    prop_id = prop["id"]
    assert prop["pref_label"] == "Cerf élaphe des forêts"
    assert "Cervus elaphus" in prop["alt_labels"]

    # 2. Rejet anti-doublon si proposition identique déjà en attente
    res_dup = await contributor.post("/thesaurus/proposals", json=prop_payload)
    assert res_dup.status_code == 409

    # 3. Consultation avec filtre de statut
    res_list = await contributor.get("/thesaurus/proposals?status=pending")
    assert res_list.status_code == 200
    assert any(p["id"] == prop_id for p in res_list.json()["items"])

    # 4. Relecture par un pair (arbitrage scientifique)
    res_review = await second_contributor.post(
        f"/thesaurus/proposals/{prop_id}/review", json={"version": 1, "decision": "validated"}
    )
    assert res_review.status_code == 200
    assert res_review.json()["status"] == "validated"

    # 5. Export SKOS Turtle
    res_export = await contributor.get("/thesaurus/proposals/export-ttl")
    assert res_export.status_code == 200
    assert "skos:Concept" in res_export.text
    assert "Cerf élaphe des forêts" in res_export.text

    # 6. Une proposition validée ne se supprime plus : elle sera retirée (RM-PUB-04)
    res_delete = await contributor.delete(f"/thesaurus/proposals/{prop_id}")
    assert res_delete.status_code == 409


@pytest.mark.asyncio
async def test_sparql_playground_security():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Tentative d'injection ou mutation interdite
        unsafe_query = "DELETE WHERE { ?s ?p ?o }"
        res = await ac.post("/sparql/execute", json={"query": unsafe_query})
        assert res.status_code == 403

        insert_query = "INSERT DATA { <http://example.org> a <http://example.org/Test> }"
        res2 = await ac.post("/sparql/execute", json={"query": insert_query})
        assert res2.status_code == 403


@pytest.mark.asyncio
@pytest.mark.live
async def test_sparql_playground_valid_query():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        valid_query = "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 5"
        res = await ac.post("/sparql/execute", json={"query": valid_query})
        assert res.status_code == 200
        data = res.json()
        assert "head" in data
        assert "results" in data
        assert data["count"] <= 5
        assert "spoReady" in data


@pytest.mark.asyncio
async def test_annotation_review_and_justification(contributor: Member, second_contributor: Member):
    test_para = "http://ns.inria.fr/zoomathia/corpus/test_para_validation"
    # Création avec justification et statut par défaut
    payload = {
        "paragraph_uri": test_para,
        "target_text": "aquila chrysaetos",
        "start_offset": 0,
        "end_offset": 17,
        "concept_uri": "https://opentheso.huma-num.fr/?idc=105525&idt=th310",
        "concept_label": "aigle royal",
        "justification": "Mention explicite de l'aigle doré chez Aristote",
        "scope_type": "word_sequence",
    }
    res = await contributor.post("/annotations", json=payload)
    assert res.status_code == 201
    data = res.json()
    annot_id = data["id"]
    assert data["status"] == "pending"
    assert data["justification"] == "Mention explicite de l'aigle doré chez Aristote"
    assert data["scope_type"] == "word_sequence"

    # Relecture par un pair -> validée
    res_review = await second_contributor.post(
        f"/annotations/{annot_id}/review", json={"version": 1, "decision": "validated"}
    )
    assert res_review.status_code == 200
    assert res_review.json()["status"] == "validated"

    # Vérification dans l'export Turtle
    res_export = await contributor.get("/annotations/export-ttl")
    assert res_export.status_code == 200
    assert 'zoo:proposalStatus "validated"' in res_export.text
    assert "Mention explicite de l'aigle doré" in res_export.text


@pytest.mark.asyncio
async def test_multi_paragraph_annotation(contributor: Member):
    p1 = "http://ns.inria.fr/zoomathia/corpus/p1"
    p2 = "http://ns.inria.fr/zoomathia/corpus/p2"
    payload = {
        "paragraph_uri": p1,
        "end_paragraph_uri": p2,
        "target_paragraphs": [p1, p2],
        "target_text": "Description étendue sur deux paragraphes",
        "start_offset": 0,
        "end_offset": 40,
        "concept_uri": "https://opentheso.huma-num.fr/?idc=105525&idt=th310",
        "concept_label": "aquila",
        "scope_type": "multi_paragraph",
        "justification": "Long passage éthologique",
    }
    res = await contributor.post("/annotations", json=payload)
    assert res.status_code == 201
    data = res.json()
    annot_id = data["id"]
    assert data["scope_type"] == "multi_paragraph"
    assert data["end_paragraph_uri"] == p2
    assert p1 in data["target_paragraphs"]
    assert p2 in data["target_paragraphs"]

    # Doit être retourné lors de la recherche sur p2
    res_list = await contributor.get(f"/annotations?paragraph_uri={p2}")
    assert res_list.status_code == 200
    assert any(it["id"] == annot_id for it in res_list.json()["items"])
