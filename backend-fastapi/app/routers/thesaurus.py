"""
Routeur FastAPI pour l'interaction avec le thésaurus TheZoo (th310) et OpenTheso Huma-Num.
"""

from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, Response
from app.services.opentheso_client import opentheso_client
from app.services.staging_store import staging_store
from app.models.annotation_models import (
    ThesaurusProposalRequest,
    ThesaurusProposalResponse,
    UpdateProposalStatusRequest,
)

router = APIRouter(prefix="/thesaurus", tags=["thesaurus"])


@router.get("/autocomplete")
async def autocomplete_thesaurus(q: str = Query(..., min_length=2, description="Préfixe de recherche")):
    """Recherche temps réel de concepts dans TheZoo (th310) via l'API OpenTheso d'Huma-Num."""
    results = await opentheso_client.autocomplete(q)
    return results


@router.get("/concept")
async def get_thesaurus_concept(id: str = Query(..., description="Identifiant OpenTheso du concept (ex: 105466)")):
    """Récupère la notice sémantique JSON-LD d'un concept du thésaurus."""
    data = await opentheso_client.get_concept_details(id)
    if not data:
        raise HTTPException(status_code=404, detail="Concept introuvable sur OpenTheso")
    return data


@router.post("/proposals", response_model=ThesaurusProposalResponse)
async def submit_thesaurus_proposal(proposal: ThesaurusProposalRequest):
    """Enregistre une nouvelle proposition de terme ou synonyme pour TheZoo."""
    try:
        return staging_store.add_proposal(proposal)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/proposals", response_model=List[ThesaurusProposalResponse])
async def list_thesaurus_proposals(
    status: Optional[str] = Query(None, description="Filtrer par statut"),
    q: Optional[str] = Query(None, description="Recherche textuelle libre")
):
    """Liste les propositions de termes enregistrées avec filtrage optionnel."""
    return staging_store.get_proposals(status=status, search=q)


@router.patch("/proposals/{proposal_id}/status", response_model=ThesaurusProposalResponse)
async def update_thesaurus_proposal_status(proposal_id: int, req: UpdateProposalStatusRequest):
    """Met à jour le statut d'une proposition (Validé, Rejeté, En attente de révision)."""
    valid_statuses = {"En attente de révision", "Validé", "Rejeté"}
    if req.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Statut invalide '{req.status}'. Valeurs permises: {', '.join(valid_statuses)}"
        )
    updated = staging_store.update_proposal_status(proposal_id, req.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    return updated


@router.delete("/proposals/{proposal_id}")
async def delete_thesaurus_proposal(proposal_id: int):
    """Supprime définitivement une proposition de concept du registre."""
    success = staging_store.delete_proposal(proposal_id)
    if not success:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    return {"success": True, "deleted_id": proposal_id}


@router.get("/proposals/export-ttl")
async def export_proposals_turtle():
    """Télécharge les propositions de concepts au format SKOS Turtle."""
    ttl_content = staging_store.export_proposals_to_turtle()
    return Response(
        content=ttl_content,
        media_type="text/turtle",
        headers={"Content-Disposition": "attachment; filename=thezoo_proposals.ttl"}
    )
