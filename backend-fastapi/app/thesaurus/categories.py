"""The table that turns TheZoo collections into concept categories (RM-CON-01, RM-CON-03).

This is the only copy of the table in the application (RM-CON-02): the frontend receives the
category from the API and never recomputes it. The table is *Proposé* until the managers of
TheZoo confirm it (`docs/regles-metier.md`, section 5).
"""

from collections.abc import Iterable
from typing import Final, Literal

Category = Literal["animal", "behavior", "anatomy", "place", "person", "general"]
MappedCategory = Literal["animal", "behavior", "anatomy", "place", "person"]

GENERAL: Final[Category] = "general"


def collection_iri(number: int) -> str:
    """The IRI of the TheZoo collection `MT_<number>` in OpenTheso."""
    return f"https://opentheso.huma-num.fr/?idg=MT_{number}&idt=th310"


# RM-CON-01: category -> collections of TheZoo. Any other collection, or none, is "general".
# MT_7 Zoonyme, MT_10 Archéotaxon, MT_13 Éthologie, MT_8 Anatomie, MT_11 Physiologie,
# MT_4 Lieu, MT_1 Anthroponyme, MT_5 Peuple.
CATEGORY_COLLECTIONS: Final[dict[MappedCategory, tuple[str, ...]]] = {
    "animal": (collection_iri(7), collection_iri(10)),
    "behavior": (collection_iri(13),),
    "anatomy": (collection_iri(8), collection_iri(11)),
    "place": (collection_iri(4),),
    "person": (collection_iri(1), collection_iri(5)),
}

# RM-CON-03: a concept in several collections takes the first category of this order.
CATEGORY_ORDER: Final[tuple[MappedCategory, ...]] = (
    "animal",
    "behavior",
    "anatomy",
    "place",
    "person",
)


def category_of(collection_iris: Iterable[str]) -> Category:
    """The category of a concept that belongs to these collections (RM-CON-01, RM-CON-03).

    The IRIs are compared whole: `MT_1` never matches inside `MT_15` or `MT_17`.
    """
    member_of = set(collection_iris)
    for category in CATEGORY_ORDER:
        if member_of.intersection(CATEGORY_COLLECTIONS[category]):
            return category
    return GENERAL
