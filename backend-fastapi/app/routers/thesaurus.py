"""
Routeur FastAPI pour l'interaction avec le thésaurus TheZoo (th310) et OpenTheso Huma-Num.
"""

from fastapi import APIRouter, HTTPException, Query, Response

from app.models.annotation_models import (
    ThesaurusProposalRequest,
    ThesaurusProposalResponse,
    UpdateProposalStatusRequest,
)
from app.services.opentheso_client import (
    CONCEPT_ID_PATTERN,
    MAX_AUTOCOMPLETE_LENGTH,
    MIN_AUTOCOMPLETE_LENGTH,
    opentheso_client,
)
from app.services.staging_store import staging_store
from app.shared.validation import MAX_LABEL_LENGTH, ProposalStatus

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


@router.post("/proposals", response_model=ThesaurusProposalResponse)
async def submit_thesaurus_proposal(proposal: ThesaurusProposalRequest):
    """Enregistre une nouvelle proposition de terme ou synonyme pour TheZoo."""
    try:
        return staging_store.add_proposal(proposal)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/proposals", response_model=list[ThesaurusProposalResponse])
async def list_thesaurus_proposals(
    status: ProposalStatus | None = Query(None, description="Filter by status"),
    q: str | None = Query(
        None, max_length=MAX_LABEL_LENGTH, description="Free text search (matched literally)"
    ),
):
    """List the stored term proposals, with optional filters."""
    return staging_store.get_proposals(status=status, search=q)


@router.patch("/proposals/{proposal_id}/status", response_model=ThesaurusProposalResponse)
async def update_thesaurus_proposal_status(proposal_id: int, req: UpdateProposalStatusRequest):
    """Update the review status of a proposal (an unknown status gives 422)."""
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
    """Download the concept proposals as SKOS Turtle (RM-PUB-01).

    `X-Skipped-Rows` counts the stored rows left out because they hold an unsafe value.
    """
    export = staging_store.export_proposals_to_turtle()
    return Response(
        content=export.turtle,
        media_type="text/turtle",
        headers={
            "Content-Disposition": "attachment; filename=thezoo_proposals.ttl",
            "X-Skipped-Rows": str(export.skipped_rows),
        },
    )
