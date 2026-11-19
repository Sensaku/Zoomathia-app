"""The table of categories and the classification of a concept (RM-CON-01, RM-CON-03)."""

import pytest

from app.thesaurus.categories import (
    CATEGORY_COLLECTIONS,
    CATEGORY_ORDER,
    category_of,
    collection_iri,
)
from app.thesaurus.collections import CollectionIndex, build_index

CONCEPT = "https://opentheso.huma-num.fr/?idc=107399&idt=th310"
PROPOSAL = "http://zoomathia.i3s.unice.fr/concept/proposal/12"

# RM-CON-01, as decided on 2026-11-19: collection number -> category.
TABLE = {
    7: "animal",
    10: "animal",
    13: "behavior",
    8: "anatomy",
    11: "anatomy",
    4: "place",
    1: "person",
    5: "person",
}
OTHER_COLLECTIONS = (6, 3, 17, 23, 25, 15)


@pytest.mark.parametrize(("number", "category"), TABLE.items())
def test_rm_con_01_each_mapped_collection_gives_its_category(number: int, category: str) -> None:
    """Catches a collection mapped to the wrong category, or missing from the table."""
    assert category_of([collection_iri(number)]) == category


@pytest.mark.parametrize("number", OTHER_COLLECTIONS)
def test_rm_con_01_the_other_collections_are_general(number: int) -> None:
    """Catches an unmapped collection (Sujet, Période, MT_15, MT_17...) that gives a category."""
    assert category_of([collection_iri(number)]) == "general"


def test_rm_con_01_no_collection_is_general() -> None:
    """Catches a default other than `general` for a concept outside every collection."""
    assert category_of([]) == "general"


@pytest.mark.parametrize("number", [15, 17])
def test_rm_con_01_mt_1_is_not_found_inside_mt_15_or_mt_17(number: int) -> None:
    """The old code searched "idg=mt_1" in the text: MT_15 and MT_17 became `person`."""
    assert category_of([collection_iri(number)]) == "general"


def test_rm_con_03_a_concept_in_several_collections_takes_the_first_category_of_the_order() -> None:
    """Catches a wrong priority: animal beats behavior, anatomy, place and person."""
    for position, winner in enumerate(CATEGORY_ORDER):
        losers = CATEGORY_ORDER[position + 1 :]
        iris = [CATEGORY_COLLECTIONS[category][0] for category in (*losers, winner)]
        assert category_of(iris) == winner


def test_rm_con_03_the_priority_is_animal_behavior_anatomy_place_person() -> None:
    assert CATEGORY_ORDER == ("animal", "behavior", "anatomy", "place", "person")


def test_rm_con_01_every_mapped_collection_belongs_to_one_category_only() -> None:
    """Catches a collection listed under two categories (the priority would hide the error)."""
    iris = [iri for category in CATEGORY_ORDER for iri in CATEGORY_COLLECTIONS[category]]
    assert len(iris) == len(set(iris))


def index_of(memberships: dict[str, set[int]]) -> CollectionIndex:
    return build_index(
        [
            {"collection": {"value": collection_iri(number)}, "member": {"value": concept}}
            for concept, numbers in memberships.items()
            for number in numbers
        ]
    )


def test_rm_con_02_classify_gives_the_category_and_the_collections_of_a_concept() -> None:
    index = index_of({CONCEPT: {6, 7}})

    category, collections = index.classify(CONCEPT)

    assert category == "animal"
    assert [collection.iri for collection in collections] == [collection_iri(7), collection_iri(6)]


def test_rm_con_02_the_collections_of_the_category_come_first_then_the_others_by_iri() -> None:
    """Catches an order that depends on the data: the category's own collections lead."""
    index = index_of({CONCEPT: {17, 11, 6, 8, 15}})

    category, collections = index.classify(CONCEPT)

    assert category == "anatomy"
    # By IRI as text: MT_11 sorts before MT_8, and MT_15 and MT_17 before MT_6.
    assert [collection.iri for collection in collections] == [
        collection_iri(number) for number in (11, 8, 15, 17, 6)
    ]


def test_rm_con_02_a_proposal_or_an_unknown_concept_is_general_without_collection() -> None:
    """A proposal IRI is in no collection of TheZoo."""
    index = index_of({CONCEPT: {7}})

    assert index.classify(PROPOSAL) == ("general", [])
    assert index.classify("https://opentheso.huma-num.fr/?idc=1&idt=th310") == ("general", [])


def test_rm_con_01_a_concept_of_mt_15_and_mt_17_is_not_a_person_in_the_index() -> None:
    """Regression through the index: the old text search made these concepts `person`."""
    index = index_of({CONCEPT: {15, 17}})

    category, collections = index.classify(CONCEPT)

    assert category == "general"
    assert len(collections) == 2
