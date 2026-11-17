"""HTTP routes of the saved SPARQL queries (RM-QC-02, RM-QC-06).

Thin on purpose: parse the request, call the service, return a response schema. Reading,
executing and exporting are public (RM-ACC-01). Saving, editing and deleting need an active
account (RM-QC-06) and the CSRF token that `optional_auth` checks; the author is the account
of the session, never a field of the body. The session is checked before a heavy-query slot
is taken, so that an anonymous caller never uses one.
"""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.dependencies import optional_auth, require_user
from app.accounts.service import AuthContext
from app.accounts.viewer import acting, check_mine, viewer_of
from app.core.clock import Clock, get_clock
from app.core.database import get_db
from app.queries.repository import QueryRepository
from app.queries.schemas import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_OFFSET,
    MAX_PAGE_SIZE,
    CreateSavedQueryRequest,
    SavedQueryOut,
    SavedQueryPage,
    UpdateSavedQueryRequest,
    saved_query_out,
)
from app.queries.service import QueryService
from app.services.sparql_client import sparql_client
from app.shared.limits import HeavySlot, limit_heavy_queries
from app.shared.sparql_guard import prepare_query_async
from app.shared.validation import MAX_LABEL_LENGTH

router = APIRouter(prefix="/queries", tags=["Saved SPARQL Queries"])

# The account is required before the slot: an anonymous request never takes a heavy slot.
WRITE_DEPENDENCIES = [Depends(require_user), Depends(limit_heavy_queries)]


def get_query_service(
    session: AsyncSession = Depends(get_db), clock: Clock = Depends(get_clock)
) -> QueryService:
    """The saved-query service of this request (one database session per request)."""
    return QueryService(QueryRepository(session), clock)


@router.get("", response_model=SavedQueryPage)
async def list_saved_queries(
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE, description="Page size")] = (
        DEFAULT_PAGE_SIZE
    ),
    offset: Annotated[int, Query(ge=0, le=MAX_PAGE_OFFSET, description="Rows to skip")] = 0,
    mine: Annotated[bool, Query(description="Only the queries of the logged-in account")] = False,
    category: str | None = Query(None, max_length=100, description="Filter by category"),
    search: str | None = Query(
        None,
        max_length=MAX_LABEL_LENGTH,
        description="Text search in title or description (matched literally)",
    ),
    context: AuthContext | None = Depends(optional_auth),
    service: QueryService = Depends(get_query_service),
) -> SavedQueryPage:
    """The library of SPARQL queries, native and personal, native questions first."""
    check_mine(mine, context)
    viewer = viewer_of(context)
    rows, total = await service.page(viewer, category, search, mine, limit, offset)
    return SavedQueryPage(items=[saved_query_out(row, viewer) for row in rows], total=total)


@router.get("/export/json")
async def export_queries_json(service: QueryService = Depends(get_query_service)) -> Response:
    """Download the whole library of queries as JSON."""
    queries = [
        saved_query_out(query, None).model_dump(mode="json", exclude={"allowed_actions"})
        for query in await service.export()
    ]
    return Response(
        content=json.dumps(queries, indent=2, ensure_ascii=False),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=zoomathia_sparql_queries.json"},
    )


@router.get("/{query_id:int}", response_model=SavedQueryOut)
async def get_saved_query(
    query_id: int,
    context: AuthContext | None = Depends(optional_auth),
    service: QueryService = Depends(get_query_service),
) -> SavedQueryOut:
    """The detail and the SPARQL code of a query, with what the viewer may do with it."""
    return saved_query_out(await service.get(query_id), viewer_of(context))


@router.post("", status_code=201, response_model=SavedQueryOut, dependencies=WRITE_DEPENDENCIES)
async def create_saved_query(
    body: CreateSavedQueryRequest,
    context: AuthContext = Depends(require_user),
    service: QueryService = Depends(get_query_service),
) -> SavedQueryOut:
    """Save a SPARQL query in the library (RM-QC-06): authored by the account."""
    viewer = acting(context)
    return saved_query_out(await service.create(viewer, body), viewer)


@router.put("/{query_id:int}", response_model=SavedQueryOut, dependencies=WRITE_DEPENDENCIES)
async def update_saved_query(
    query_id: int,
    body: UpdateSavedQueryRequest,
    context: AuthContext = Depends(require_user),
    service: QueryService = Depends(get_query_service),
) -> SavedQueryOut:
    """Update a query: its author or an admin (RM-QC-06); a native question answers 403."""
    viewer = acting(context)
    return saved_query_out(await service.edit(viewer, query_id, body), viewer)


@router.delete("/{query_id:int}", status_code=204)
async def delete_saved_query(
    query_id: int,
    context: AuthContext = Depends(require_user),
    service: QueryService = Depends(get_query_service),
) -> Response:
    """Delete a query: its author or an admin (RM-QC-06); a native question answers 403."""
    await service.delete(acting(context), query_id)
    return Response(status_code=204)


@router.post("/{query_id:int}/execute")
async def execute_saved_query(
    query_id: int,
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
    use_spo: bool = Query(
        False, description="Exécuter la variante SPO pour graphe VENUS si disponible"
    ),
    service: QueryService = Depends(get_query_service),
) -> dict[str, object]:
    """Run a saved query on Corese. Public, like reading it (RM-ACC-01).

    The query is read, then the database transaction ends before Corese is called: a long
    evaluation never keeps a connection (AGENTS.md, rule 10).
    """
    query = await service.read_for_execution(query_id)
    sparql_code = query.query_spo_text if (use_spo and query.query_spo_text) else query.query_text
    sparql_code = await prepare_query_async(sparql_code)

    try:
        data = await sparql_client.query(sparql_code, slot=slot)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Erreur d'exécution SPARQL sur Corese : {str(e)}"
        ) from e

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
