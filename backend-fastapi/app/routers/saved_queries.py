"""
Routeur FastAPI pour la gestion et la persistance des requêtes SPARQL.
Permet d'ajouter, éditer, lister et supprimer des requêtes personnalisées,
tout en protégeant les Questions de Compétence (CQs) natives du système.
"""

import re
import json
from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, Response
from app.services.staging_store import staging_store
from app.services.sparql_client import sparql_client
from app.models.annotation_models import (
    CreateSavedQueryRequest,
    UpdateSavedQueryRequest,
    SavedQueryResponse,
)
from app.routers.sparql_playground import MUTATION_KEYWORDS, FORBIDDEN_KEYWORDS

router = APIRouter(prefix="/queries", tags=["Saved SPARQL Queries"])


def validate_read_only_sparql(query: str):
    """Vérifie qu'une requête SPARQL est strictement en lecture seule et sans clause fédérée SERVICE."""
    for pattern, error_msg in FORBIDDEN_KEYWORDS:
        if re.search(pattern, query, re.IGNORECASE):
            raise HTTPException(status_code=403, detail=error_msg)
    if re.search(r"\b(CONSTRUCT|DESCRIBE)\b", query, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="Les requêtes CONSTRUCT et DESCRIBE ne sont pas autorisées. Seules les requêtes SELECT (ou ASK) sont permises."
        )
    if not re.search(r"\b(SELECT|ASK)\b", query, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="La requête doit comporter une clause valide (SELECT ou ASK)."
        )


@router.get("", response_model=List[SavedQueryResponse])
async def list_saved_queries(
    category: Optional[str] = Query(None, description="Filtrer par catégorie"),
    search: Optional[str] = Query(None, description="Recherche textuelle dans titre ou description")
):
    """Retourne la bibliothèque des requêtes SPARQL (natives et personnalisées)."""
    return staging_store.get_saved_queries(category=category, search=search)


@router.get("/{query_id}", response_model=SavedQueryResponse)
async def get_saved_query(query_id: int):
    """Récupère le détail et le code SPARQL d'une requête."""
    query = staging_store.get_saved_query_by_id(query_id)
    if not query:
        raise HTTPException(status_code=404, detail=f"Requête SPARQL introuvable : ID {query_id}")
    return query


@router.post("", response_model=SavedQueryResponse)
async def create_saved_query(payload: CreateSavedQueryRequest):
    """Enregistre une nouvelle requête SPARQL dans la bibliothèque."""
    validate_read_only_sparql(payload.query_text)
    if payload.query_spo_text:
        validate_read_only_sparql(payload.query_spo_text)
    return staging_store.add_saved_query(payload)


@router.put("/{query_id}", response_model=SavedQueryResponse)
async def update_saved_query(query_id: int, payload: UpdateSavedQueryRequest):
    """Met à jour les métadonnées ou le code d'une requête SPARQL."""
    existing = staging_store.get_saved_query_by_id(query_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Requête SPARQL introuvable : ID {query_id}")

    if payload.query_text:
        validate_read_only_sparql(payload.query_text)
    if payload.query_spo_text:
        validate_read_only_sparql(payload.query_spo_text)

    updated = staging_store.update_saved_query(query_id, payload)
    return updated


@router.delete("/{query_id}")
async def delete_saved_query(query_id: int):
    """Supprime une requête personnalisée. Interdit sur les requêtes natives de référence."""
    existing = staging_store.get_saved_query_by_id(query_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Requête introuvable : ID {query_id}")
    if existing.is_builtin:
        raise HTTPException(
            status_code=403,
            detail="Action interdite : impossible de supprimer une Question de Compétence native de référence."
        )

    staging_store.delete_saved_query(query_id)
    return {"message": "Requête supprimée avec succès", "id": query_id}


@router.post("/{query_id}/execute")
async def execute_saved_query(
    query_id: int,
    use_spo: bool = Query(False, description="Exécuter la variante SPO pour graphe VENUS si disponible")
):
    """Exécute directement une requête enregistrée sur Corese."""
    query = staging_store.get_saved_query_by_id(query_id)
    if not query:
        raise HTTPException(status_code=404, detail=f"Requête introuvable : ID {query_id}")

    sparql_code = query.query_spo_text if (use_spo and query.query_spo_text) else query.query_text
    validate_read_only_sparql(sparql_code)

    try:
        data = await sparql_client.query(sparql_code)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur d'exécution SPARQL sur Corese : {str(e)}"
        )

    bindings = data.get("results", {}).get("bindings", [])
    vars_list = data.get("head", {}).get("vars", [])

    return {
        "id": query.id,
        "title": query.title,
        "head": data.get("head", {}),
        "results": data.get("results", {}),
        "count": len(bindings),
        "spoReady": len(vars_list) >= 2 and len(bindings) > 0,
    }


@router.get("/export/json")
async def export_queries_json():
    """Télécharge l'intégralité de la bibliothèque de requêtes au format JSON."""
    queries = staging_store.get_saved_queries()
    content = json.dumps([q.model_dump() for q in queries], indent=2, ensure_ascii=False)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=zoomathia_sparql_queries.json"}
    )
