"""
Tests critiques et failles de sécurité pour le système de stockage des requêtes SPARQL.
Vérifie la persistance, l'accès unifié, et la protection contre l'altération des données natives.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_saved_queries_seeding_and_list():
    """Vérifie que les 14 questions de compétence historiques sont bien initialisées et listées."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/queries")
        assert response.status_code == 200
        queries = response.json()
        assert len(queries) >= 10
        # Vérifie qu'il y a des requêtes natives marquées is_builtin = True
        builtins = [q for q in queries if q["is_builtin"]]
        assert len(builtins) >= 10


@pytest.mark.asyncio
async def test_saved_queries_crud_lifecycle():
    """Cycle de vie complet : création, lecture, mise à jour, suppression d'une requête utilisateur."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Création
        create_payload = {
            "title": "Requête Test Corrélation Loups & Chiens",
            "description": "Identifier les mentions conjointes dans Aristote",
            "query_text": "SELECT ?para WHERE { ?para a <http://example.org/Paragraph> } LIMIT 10",
            "category": "Faune terrestre",
            "author_name": "Chercheur Test"
        }
        res_create = await ac.post("/queries", json=create_payload)
        assert res_create.status_code == 200
        created = res_create.json()
        query_id = created["id"]
        assert created["title"] == "Requête Test Corrélation Loups & Chiens"
        assert created["is_builtin"] is False

        # 2. Consultation unitaire
        res_get = await ac.get(f"/queries/{query_id}")
        assert res_get.status_code == 200
        assert res_get.json()["id"] == query_id

        # 3. Mise à jour
        update_payload = {
            "title": "Titre Mis à Jour",
            "category": "Canidés"
        }
        res_put = await ac.put(f"/queries/{query_id}", json=update_payload)
        assert res_put.status_code == 200
        assert res_put.json()["title"] == "Titre Mis à Jour"
        assert res_put.json()["category"] == "Canidés"

        # 4. Suppression
        res_del = await ac.delete(f"/queries/{query_id}")
        assert res_del.status_code == 200

        # Vérification disparition
        res_get_after = await ac.get(f"/queries/{query_id}")
        assert res_get_after.status_code == 404


@pytest.mark.asyncio
async def test_security_flaw_prevent_sparql_mutations():
    """Faille critique : tentative d'injection de requêtes de mutation (DELETE, DROP, INSERT)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        malicious_payloads = [
            {"title": "Attaque Drop", "query_text": "DROP ALL GRAPHS ;"},
            {"title": "Attaque Delete", "query_text": "DELETE WHERE { ?s ?p ?o }"},
            {"title": "Attaque Insert", "query_text": "INSERT DATA { <x> <p> <o> }"},
        ]
        for payload in malicious_payloads:
            res = await ac.post("/queries", json=payload)
            assert res.status_code == 403, f"Échec de blocage pour: {payload['query_text']}"


@pytest.mark.asyncio
async def test_security_flaw_prevent_deleting_builtin_queries():
    """Faille critique : interdiction formelle de supprimer une Question de Compétence de référence."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # ID 1 est la première question native
        res_del = await ac.delete("/queries/1")
        assert res_del.status_code == 403
        assert "impossible de supprimer" in res_del.json()["detail"].lower()


@pytest.mark.asyncio
async def test_execute_saved_query_on_triplestore():
    """Vérifie l'exécution directe d'une requête de la bibliothèque sur Corese."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Exécution de la QC 1
        res = await ac.post("/queries/1/execute")
        assert res.status_code == 200
        data = res.json()
        assert "head" in data
        assert "results" in data
        assert "count" in data
