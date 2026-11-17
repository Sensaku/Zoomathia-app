"""
Routeur FastAPI pour l'interaction avec le thésaurus TheZoo (th310) et OpenTheso Huma-Num.

Les propositions de termes (création, relecture, export) sont dans `app.contributions.router`.
"""

from fastapi import APIRouter, HTTPException, Query

from app.services.opentheso_client import (
    CONCEPT_ID_PATTERN,
    MAX_AUTOCOMPLETE_LENGTH,
    MIN_AUTOCOMPLETE_LENGTH,
    opentheso_client,
)

router = APIRouter(prefix="/thesaurus", tags=["thesaurus"])


@router.get("/autocomplete")
async def autocomplete_thesaurus(
    q: str = Query(
        ...,
        min_length=MIN_AUTOCOMPLETE_LENGTH,
        max_length=MAX_AUTOCOMPLETE_LENGTH,
        description="Search prefix",
    ),
):
    """Real-time search of TheZoo (th310) concepts through the Huma-Num OpenTheso API."""
    results = await opentheso_client.autocomplete(q)
    return results


@router.get("/concept")
async def get_thesaurus_concept(
    id: str = Query(
        ...,
        pattern=CONCEPT_ID_PATTERN,
        description="OpenTheso identifier of the concept (alphanumeric, e.g. 105466)",
    ),
):
    """Return the JSON-LD record of a thesaurus concept."""
    data = await opentheso_client.get_concept_details(id)
    if not data:
        raise HTTPException(status_code=404, detail="Concept introuvable sur OpenTheso")
    return data
