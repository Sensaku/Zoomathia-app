"""
Routeur FastAPI pour le SPARQL Playground.
Permet d'exécuter des requêtes de recherche ad-hoc sur le triplestore Corese avec contrôle de sécurité.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.models.annotation_models import SparqlQueryRequest
from app.services.sparql_client import sparql_client
from app.shared.limits import HeavySlot, limit_heavy_queries
from app.shared.sparql_guard import prepare_query_async

router = APIRouter(prefix="/sparql", tags=["sparql"])


@router.post("/execute")
async def execute_sparql_query(
    payload: SparqlQueryRequest, slot: Annotated[HeavySlot, Depends(limit_heavy_queries)]
):
    """
    Exécute une requête SPARQL personnalisée sur le triplestore Corese.
    La requête est analysée par `prepare_query_async` : SELECT ou ASK uniquement, sans SERVICE,
    avec un LIMIT imposé (RM-ACC-02).
    """
    clean_query = await prepare_query_async(payload.query.strip())

    # Exécution asynchrone sur Corese
    try:
        data = await sparql_client.query(clean_query, slot=slot)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Erreur d'exécution SPARQL sur Corese : {str(e)}"
        )

    bindings = data.get("results", {}).get("bindings", [])
    vars_list = data.get("head", {}).get("vars", [])

    # Détection si les variables sont compatibles avec une visualisation en graphe Wimmics/VENUS
    # VENUS requiert idéalement au moins 2 variables pour relier source et cible
    spo_ready = len(vars_list) >= 2 and len(bindings) > 0

    return {
        "head": data.get("head", {}),
        "results": data.get("results", {}),
        "count": len(bindings),
        "spoReady": spo_ready,
    }
