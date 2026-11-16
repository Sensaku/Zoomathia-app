from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.corpus.custom_search import build_custom_search_query, criteria_count
from app.corpus.schemas import CustomSearchPayload
from app.services.sparql_client import MAX_SEARCH_RESPONSE_BYTES, sparql_client
from app.services.tree_builder import build_custom_search_tree
from app.shared.limits import HeavySlot, check_criteria_count, limit_heavy_queries

router = APIRouter(tags=["Search"])


@router.post("/customSearch")
async def custom_search(
    payload: CustomSearchPayload,
    slot: Annotated[HeavySlot, Depends(limit_heavy_queries)],
) -> dict[str, Any]:
    # RM-ACC-02: counted before anything is normalized or built.
    check_criteria_count(criteria_count(payload))
    build_request = build_custom_search_query(payload)

    # RM-ACC-02: this route holds a heavy-query slot, so it may hold a larger result.
    res = await sparql_client.query(build_request, max_bytes=MAX_SEARCH_RESPONSE_BYTES, slot=slot)
    bindings = res.get("results", {}).get("bindings", [])
    tree = build_custom_search_tree(bindings)

    return {"sparql": build_request, "tree": tree}
