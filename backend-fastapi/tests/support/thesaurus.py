"""An in-memory index of the TheZoo collections, for the tests that need no Corese answer."""

from typing import TYPE_CHECKING

from app.thesaurus.categories import collection_iri
from app.thesaurus.collections import CollectionIndex

if TYPE_CHECKING:
    from tests.conftest import FakeCorese

LION = "https://opentheso.huma-num.fr/?idc=1000001&idt=th310"
"""A concept of the Zoonyme collection (MT_7): `animal`."""
CONCEPT_IN_SUBJECT = "https://opentheso.huma-num.fr/?idc=1000002&idt=th310"
"""A concept of the Sujet collection (MT_6) only: `general`, but with a collection."""

LABELS = {
    collection_iri(7): {"fr": "Zoonyme", "en": "Zoonyms"},
    collection_iri(6): {"fr": "Sujet", "en": "Subject"},
}
DEFAULT_COLLECTION_INDEX = CollectionIndex(
    LABELS,
    {
        LION: frozenset({collection_iri(7)}),
        CONCEPT_IN_SUBJECT: frozenset({collection_iri(6)}),
    },
)


MEMBER_VARIABLES = ["collection", "member"]
LABEL_VARIABLES = ["collection", "collectionLabel", "labelLanguage"]


def answer_loads(
    corese: "FakeCorese",
    members: list[dict[str, str]],
    labels: list[dict[str, str]] | None = None,
    loads: int = 1,
) -> None:
    """Corese answers `loads` loads of the index: the members query, then the labels query.

    The loader sends the two queries one after the other, so the fake answers them in turn.
    """
    pair = [(MEMBER_VARIABLES, members), (LABEL_VARIABLES, labels or [])]
    corese.returns_in_turn(*(pair * loads))
