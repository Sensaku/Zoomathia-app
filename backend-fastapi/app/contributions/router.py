"""HTTP routes of the contributions domain: annotations and thesaurus term proposals.

Thin on purpose: parse the request, call the service, return a response schema. Reading is
public (RM-ACC-01, RM-ACC-03); every write needs an active account (RM-CTB-01) and the CSRF
token that `optional_auth` checks. The author of a contribution is the account of the
session, never a field of the body (RM-CTB-03).

`GET /annotations/section`, which mixes Corese and staged data, stays in
`app/routers/annotations.py` and calls `AnnotationService.section`.
"""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.dependencies import optional_auth, require_user
from app.accounts.service import AuthContext
from app.accounts.viewer import acting, check_mine, viewer_of
from app.contributions.models import ContributionStatus
from app.contributions.repository import AnnotationRepository, ProposalRepository
from app.contributions.schemas import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_OFFSET,
    MAX_PAGE_SIZE,
    AnnotationOut,
    AnnotationPage,
    AnnotationUpdate,
    CreateAnnotationRequest,
    CreateProposalRequest,
    ProposalOut,
    ProposalPage,
    ProposalUpdate,
    ReviewRequest,
    annotation_out,
    proposal_out,
)
from app.contributions.service import AnnotationService, ProposalService
from app.core.clock import Clock, get_clock
from app.core.database import get_db
from app.services.rdf_export import annotations_to_turtle, proposals_to_turtle
from app.shared.sparql import MAX_IRI_LENGTH
from app.shared.validation import MAX_LABEL_LENGTH
from app.thesaurus.collections import CollectionIndex, get_thesaurus_collections

annotations_router = APIRouter(prefix="/annotations", tags=["Annotations"])
proposals_router = APIRouter(prefix="/thesaurus/proposals", tags=["Thesaurus proposals"])

Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE, description="Page size")]
Offset = Annotated[int, Query(ge=0, le=MAX_PAGE_OFFSET, description="Rows to skip")]
Mine = Annotated[bool, Query(description="Only the contributions of the logged-in account")]
StatusFilter = Annotated[ContributionStatus | None, Query(description="Filter by status")]


def get_annotation_service(
    session: AsyncSession = Depends(get_db), clock: Clock = Depends(get_clock)
) -> AnnotationService:
    """The annotation service of this request (one database session per request)."""
    return AnnotationService(AnnotationRepository(session), clock)


def get_proposal_service(
    session: AsyncSession = Depends(get_db), clock: Clock = Depends(get_clock)
) -> ProposalService:
    """The proposal service of this request (one database session per request)."""
    return ProposalService(ProposalRepository(session), clock)


# --- annotations ---


@annotations_router.post("", status_code=201, response_model=AnnotationOut)
async def create_annotation(
    body: CreateAnnotationRequest,
    context: AuthContext = Depends(require_user),
    service: AnnotationService = Depends(get_annotation_service),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> AnnotationOut:
    """Store a new annotation (RM-CTB-01): authored by the account, always pending."""
    viewer = acting(context)
    return annotation_out(await service.create(viewer, body), viewer, thesaurus)


@annotations_router.get("", response_model=AnnotationPage)
async def list_annotations(
    limit: Limit = DEFAULT_PAGE_SIZE,
    offset: Offset = 0,
    mine: Mine = False,
    status: StatusFilter = None,
    paragraph_uri: str | None = Query(
        None, max_length=MAX_IRI_LENGTH, description="IRI of the paragraph (exact match)"
    ),
    context: AuthContext | None = Depends(optional_auth),
    service: AnnotationService = Depends(get_annotation_service),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> AnnotationPage:
    """A page of annotations of every status, rejections included (RM-ACC-03), newest first."""
    check_mine(mine, context)
    viewer = viewer_of(context)
    rows, total = await service.page(viewer, paragraph_uri, status, mine, limit, offset)
    return AnnotationPage(
        items=[annotation_out(row, viewer, thesaurus) for row in rows], total=total
    )


@annotations_router.get("/export-ttl")
async def export_annotations_turtle(
    service: AnnotationService = Depends(get_annotation_service),
) -> Response:
    """Download every staged annotation, whatever its status, as W3C Web Annotation Turtle.

    `X-Skipped-Rows` counts the stored rows left out because they hold an unsafe value
    (RM-PUB-01). Beyond `MAX_EXPORTED_CONTRIBUTIONS` rows the answer is 422 `too_many_results`.
    The serialization runs in a thread, so that it never blocks the event loop.
    """
    export = await asyncio.to_thread(annotations_to_turtle, await service.export())
    return Response(
        content=export.turtle,
        media_type="text/turtle",
        headers={
            "Content-Disposition": "attachment; filename=zoomathia_staging_annotations.ttl",
            "X-Skipped-Rows": str(export.skipped_rows),
        },
    )


@annotations_router.get("/{annotation_id:int}", response_model=AnnotationOut)
async def get_annotation(
    annotation_id: int,
    context: AuthContext | None = Depends(optional_auth),
    service: AnnotationService = Depends(get_annotation_service),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> AnnotationOut:
    """One annotation, with what the viewer may do with it."""
    return annotation_out(await service.workflow.get(annotation_id), viewer_of(context), thesaurus)


@annotations_router.patch("/{annotation_id:int}", response_model=AnnotationOut)
async def update_annotation(
    annotation_id: int,
    body: AnnotationUpdate,
    context: AuthContext = Depends(require_user),
    service: AnnotationService = Depends(get_annotation_service),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> AnnotationOut:
    """Change the concept or the justification of a pending annotation (RM-CTB-05)."""
    viewer = acting(context)
    return annotation_out(await service.edit(viewer, annotation_id, body), viewer, thesaurus)


@annotations_router.post("/{annotation_id:int}/review", response_model=AnnotationOut)
async def review_annotation(
    annotation_id: int,
    body: ReviewRequest,
    context: AuthContext = Depends(require_user),
    service: AnnotationService = Depends(get_annotation_service),
    thesaurus: CollectionIndex = Depends(get_thesaurus_collections),
) -> AnnotationOut:
    """Validate or reject another contributor's annotation (RM-MOD-01 to RM-MOD-03)."""
    viewer = acting(context)
    reviewed = await service.workflow.review(viewer, annotation_id, body)
    return annotation_out(reviewed, viewer, thesaurus)


@annotations_router.delete("/{annotation_id:int}", status_code=204)
async def delete_annotation(
    annotation_id: int,
    context: AuthContext = Depends(require_user),
    service: AnnotationService = Depends(get_annotation_service),
) -> Response:
    """Delete an annotation: its pending author, or an admin if it is not validated."""
    await service.workflow.delete(acting(context), annotation_id)
    return Response(status_code=204)


# --- term proposals ---


@proposals_router.post("", status_code=201, response_model=ProposalOut)
async def create_proposal(
    body: CreateProposalRequest,
    context: AuthContext = Depends(require_user),
    service: ProposalService = Depends(get_proposal_service),
) -> ProposalOut:
    """Store a new term proposal (RM-CTB-01): authored by the account, always pending."""
    viewer = acting(context)
    return proposal_out(await service.create(viewer, body), viewer)


@proposals_router.get("", response_model=ProposalPage)
async def list_proposals(
    limit: Limit = DEFAULT_PAGE_SIZE,
    offset: Offset = 0,
    mine: Mine = False,
    status: StatusFilter = None,
    q: str | None = Query(
        None, max_length=MAX_LABEL_LENGTH, description="Free text search (matched literally)"
    ),
    context: AuthContext | None = Depends(optional_auth),
    service: ProposalService = Depends(get_proposal_service),
) -> ProposalPage:
    """A page of term proposals of every status, rejections included, newest first."""
    check_mine(mine, context)
    viewer = viewer_of(context)
    rows, total = await service.page(viewer, status, q, mine, limit, offset)
    return ProposalPage(items=[proposal_out(row, viewer) for row in rows], total=total)


@proposals_router.get("/export-ttl")
async def export_proposals_turtle(
    service: ProposalService = Depends(get_proposal_service),
) -> Response:
    """Download the term proposals, whatever their status, as SKOS Turtle (RM-PUB-01).

    `X-Skipped-Rows` counts the stored rows left out because they hold an unsafe value.
    Beyond `MAX_EXPORTED_CONTRIBUTIONS` rows the answer is 422 `too_many_results`.
    """
    export = await asyncio.to_thread(proposals_to_turtle, await service.export())
    return Response(
        content=export.turtle,
        media_type="text/turtle",
        headers={
            "Content-Disposition": "attachment; filename=thezoo_proposals.ttl",
            "X-Skipped-Rows": str(export.skipped_rows),
        },
    )


@proposals_router.get("/{proposal_id:int}", response_model=ProposalOut)
async def get_proposal(
    proposal_id: int,
    context: AuthContext | None = Depends(optional_auth),
    service: ProposalService = Depends(get_proposal_service),
) -> ProposalOut:
    """One term proposal, with what the viewer may do with it."""
    return proposal_out(await service.workflow.get(proposal_id), viewer_of(context))


@proposals_router.patch("/{proposal_id:int}", response_model=ProposalOut)
async def update_proposal(
    proposal_id: int,
    body: ProposalUpdate,
    context: AuthContext = Depends(require_user),
    service: ProposalService = Depends(get_proposal_service),
) -> ProposalOut:
    """Change any field of a pending proposal (RM-CTB-05)."""
    viewer = acting(context)
    return proposal_out(await service.edit(viewer, proposal_id, body), viewer)


@proposals_router.post("/{proposal_id:int}/review", response_model=ProposalOut)
async def review_proposal(
    proposal_id: int,
    body: ReviewRequest,
    context: AuthContext = Depends(require_user),
    service: ProposalService = Depends(get_proposal_service),
) -> ProposalOut:
    """Validate or reject another contributor's proposal (RM-MOD-01 to RM-MOD-03)."""
    viewer = acting(context)
    return proposal_out(await service.workflow.review(viewer, proposal_id, body), viewer)


@proposals_router.delete("/{proposal_id:int}", status_code=204)
async def delete_proposal(
    proposal_id: int,
    context: AuthContext = Depends(require_user),
    service: ProposalService = Depends(get_proposal_service),
) -> Response:
    """Delete a proposal: its pending author, or an admin if it is not validated."""
    await service.workflow.delete(acting(context), proposal_id)
    return Response(status_code=204)
