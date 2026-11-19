"""The table of concept categories, published for readers and agents (RM-CON-02)."""

from fastapi import APIRouter, Depends

from app.thesaurus.categories import CATEGORY_COLLECTIONS, CATEGORY_ORDER, GENERAL
from app.thesaurus.collections import CollectionIndex, get_thesaurus_collections
from app.thesaurus.schemas import CategoryOut

router = APIRouter(prefix="/thesaurus", tags=["thesaurus"])


@router.get(
    "/categories",
    response_model=list[CategoryOut],
    summary="Concept categories and the TheZoo collections that give them",
)
async def list_categories(
    index: CollectionIndex = Depends(get_thesaurus_collections),
) -> list[CategoryOut]:
    """Publish the table that maps TheZoo collections to concept categories (RM-CON-01).

    A concept takes the first category whose collections contain it, in the order of this
    list; otherwise it is `general`. The mapped collections are always listed; their labels
    come from the cached SKOS data and are empty when it has none for them.
    """
    table = [
        CategoryOut(
            category=category,
            collections=[index.collection(iri) for iri in CATEGORY_COLLECTIONS[category]],
        )
        for category in CATEGORY_ORDER
    ]
    return [*table, CategoryOut(category=GENERAL, collections=[])]
