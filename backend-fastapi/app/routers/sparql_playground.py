"""
Routeur FastAPI pour le SPARQL Playground.
Permet d'exécuter des requêtes de recherche ad-hoc sur le triplestore Corese avec contrôle de sécurité.
"""

import re
from fastapi import APIRouter, HTTPException
from app.services.sparql_client import sparql_client
from app.models.annotation_models import SparqlQueryRequest

router = APIRouter(prefix="/sparql", tags=["sparql"])

# Mots-clés interdits pour garantir un triplestore sécurisé (altérations et requêtes fédérées SSRF)
FORBIDDEN_KEYWORDS = [
    (r"\bINSERT\b", "Les opérations de modification (INSERT) sont strictement interdites."),
    (r"\bDELETE\b", "Les opérations de modification (DELETE) sont strictement interdites."),
    (r"\bDROP\b", "Les opérations DROP sont strictement interdites."),
    (r"\bCLEAR\b", "Les opérations CLEAR sont strictement interdites."),
    (r"\bLOAD\b", "Les opérations LOAD sont strictement interdites."),
    (r"\bCREATE\b", "Les opérations CREATE sont strictement interdites."),
    (r"\bCOPY\b", "Les opérations COPY sont strictement interdites."),
    (r"\bMOVE\b", "Les opérations MOVE sont strictement interdites."),
    (r"\bADD\b", "Les opérations ADD sont strictement interdites."),
    (r"\bSERVICE\b", "Les requêtes fédérées (clause SERVICE) sont strictement interdites pour des raisons de sécurité."),
]

MUTATION_KEYWORDS = [pattern for pattern, _ in FORBIDDEN_KEYWORDS]


@router.post("/execute")
async def execute_sparql_query(payload: SparqlQueryRequest):
    """
    Exécute une requête SPARQL personnalisée sur le triplestore Corese.
    Garantit la lecture seule, bloque les clauses SERVICE et prévient les crashs serveur.
    """
    clean_query = payload.query.strip()

    # 1. Vérification de sécurité : interdiction absolue des mutations et clauses SERVICE
    for pattern, error_msg in FORBIDDEN_KEYWORDS:
        if re.search(pattern, clean_query, re.IGNORECASE):
            raise HTTPException(status_code=403, detail=error_msg)

    # 2. Interdiction explicite des requêtes CONSTRUCT et DESCRIBE (génération de graphes non tabulaires)
    if re.search(r"\b(CONSTRUCT|DESCRIBE)\b", clean_query, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="Les requêtes CONSTRUCT et DESCRIBE ne sont pas autorisées dans le Playground. Seules les requêtes tabulaires SELECT (ou ASK) sont supportées."
        )

    # 3. Vérification de la présence d'une commande de lecture supportée
    if not re.search(r"\b(SELECT|ASK)\b", clean_query, re.IGNORECASE):
        raise HTTPException(
            status_code=400,
            detail="La requête doit comporter une clause SELECT ou ASK."
        )

    # 3. Exécution asynchrone sur Corese
    try:
        data = await sparql_client.query(clean_query)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur d'exécution SPARQL sur Corese : {str(e)}"
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
