"""
Tests d'intégration automatisés pour la Phase 4 :
- Autocomplétion OpenTheso
- Persistance et export RDF Turtle des annotations W3C
- Gestion des propositions d'enrichissement du thésaurus
- Sécurité et exécution du SPARQL Playground
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
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
async def test_create_and_list_annotation():
    transport = ASGITransport(app=app)
    test_para = "http://zoomathia.i3s.unice.fr/corpus/test_para_42"
    
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Création
        create_payload = {
            "paragraph_uri": test_para,
            "target_text": "canis lupus",
            "start_offset": 5,
            "end_offset": 16,
            "concept_uri": "https://opentheso.huma-num.fr/?idc=107399&idt=th310",
            "concept_label": "canis",
            "annotator_name": "Testeur Unitaire"
        }
        res_create = await ac.post("/annotations", json=create_payload)
        assert res_create.status_code == 200
        created = res_create.json()
        annot_id = created["id"]
        assert created["paragraph_uri"] == test_para
        assert created["target_text"] == "canis lupus"
        assert created["start_offset"] == 5

        # 2. Consultation par paragraphe
        res_list = await ac.get(f"/annotations?paragraph_uri={test_para}")
        assert res_list.status_code == 200
        items = res_list.json()
        assert len(items) >= 1
        assert any(it["id"] == annot_id for it in items)

        # 3. Export Turtle
        res_export = await ac.get("/annotations/export-ttl")
        assert res_export.status_code == 200
        assert "oa:Annotation" in res_export.text
        assert "canis lupus" in res_export.text

        # 4. Suppression
        res_del = await ac.delete(f"/annotations/{annot_id}")
        assert res_del.status_code == 200


@pytest.mark.asyncio
async def test_invalid_annotation_offset():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        invalid_payload = {
            "paragraph_uri": "http://zoomathia.i3s.unice.fr/corpus/test",
            "target_text": "invalide",
            "start_offset": 20,
            "end_offset": 10,  # Erreur : fin < début
            "concept_uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310",
            "concept_label": "test",
        }
        res = await ac.post("/annotations", json=invalid_payload)
        assert res.status_code == 400


@pytest.mark.asyncio
async def test_thesaurus_proposals():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        prop_payload = {
            "pref_label": "Cerf élaphe des forêts",
            "language": "fr",
            "alt_labels": ["Cervus elaphus", "Grand cerf"],
            "broader_concept_uri": "https://opentheso.huma-num.fr/?idc=107399&idt=th310",
            "definition": "Grand mammifère cervidé chassé dans l'Antiquité",
            "contributor_name": "Arnaud B."
        }
        # 1. Création
        res_create = await ac.post("/thesaurus/proposals", json=prop_payload)
        assert res_create.status_code == 200
        prop = res_create.json()
        prop_id = prop["id"]
        assert prop["pref_label"] == "Cerf élaphe des forêts"
        assert "Cervus elaphus" in prop["alt_labels"]

        # 2. Rejet anti-doublon si proposition identique déjà en attente
        res_dup = await ac.post("/thesaurus/proposals", json=prop_payload)
        assert res_dup.status_code == 409

        # 3. Consultation avec filtre de statut
        res_list = await ac.get("/thesaurus/proposals?status=En attente de révision")
        assert res_list.status_code == 200
        proposals = res_list.json()
        assert any(p["id"] == prop_id for p in proposals)

        # 4. Modification de statut (Arbitrage scientifique)
        res_status = await ac.patch(f"/thesaurus/proposals/{prop_id}/status", json={"status": "Validé"})
        assert res_status.status_code == 200
        assert res_status.json()["status"] == "Validé"

        # 5. Export SKOS Turtle
        res_export = await ac.get("/thesaurus/proposals/export-ttl")
        assert res_export.status_code == 200
        assert "skos:Concept" in res_export.text
        assert "Cerf élaphe des forêts" in res_export.text

        # 6. Suppression (Nettoyage post-test garanti)
        res_delete = await ac.delete(f"/thesaurus/proposals/{prop_id}")
        assert res_delete.status_code == 200
        assert res_delete.json()["success"] is True


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
async def test_annotation_status_and_justification():
    transport = ASGITransport(app=app)
    test_para = "http://zoomathia.i3s.unice.fr/corpus/test_para_validation"
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Création avec justification et statut par défaut
        payload = {
            "paragraph_uri": test_para,
            "target_text": "aquila chrysaetos",
            "start_offset": 0,
            "end_offset": 17,
            "concept_uri": "https://opentheso.huma-num.fr/?idc=105525&idt=th310",
            "concept_label": "aigle royal",
            "annotator_name": "Éthologue testeur",
            "justification": "Mention explicite de l'aigle doré chez Aristote",
            "scope_type": "word_sequence"
        }
        res = await ac.post("/annotations", json=payload)
        assert res.status_code == 200
        data = res.json()
        annot_id = data["id"]
        assert data["status"] == "En attente de validation"
        assert data["justification"] == "Mention explicite de l'aigle doré chez Aristote"
        assert data["scope_type"] == "word_sequence"

        # Mise à jour du statut -> Validé
        res_patch = await ac.patch(f"/annotations/{annot_id}/status", json={"status": "Validé"})
        assert res_patch.status_code == 200
        assert res_patch.json()["status"] == "Validé"

        # Vérification dans l'export Turtle
        res_export = await ac.get("/annotations/export-ttl")
        assert res_export.status_code == 200
        assert 'zoo:proposalStatus "Validé"' in res_export.text
        assert "Mention explicite de l'aigle doré" in res_export.text

        # Nettoyage
        await ac.delete(f"/annotations/{annot_id}")


@pytest.mark.asyncio
async def test_multi_paragraph_annotation():
    transport = ASGITransport(app=app)
    p1 = "http://zoomathia.i3s.unice.fr/corpus/p1"
    p2 = "http://zoomathia.i3s.unice.fr/corpus/p2"
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
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
            "justification": "Long passage éthologique"
        }
        res = await ac.post("/annotations", json=payload)
        assert res.status_code == 200
        data = res.json()
        annot_id = data["id"]
        assert data["scope_type"] == "multi_paragraph"
        assert data["end_paragraph_uri"] == p2
        assert p1 in data["target_paragraphs"]
        assert p2 in data["target_paragraphs"]

        # Doit être retourné lors de la recherche sur p2
        res_list = await ac.get(f"/annotations?paragraph_uri={p2}")
        assert res_list.status_code == 200
        assert any(it["id"] == annot_id for it in res_list.json())

        # Nettoyage
        await ac.delete(f"/annotations/{annot_id}")
