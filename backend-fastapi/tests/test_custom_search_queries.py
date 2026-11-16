"""The queries built by `/customSearch` are standard SPARQL that Corese accepts.

Corese refuses `{ ?x = <uri> } UNION { ?x skos:broader+ <uri> }` (a parse error that
turned every AND search with a sub-concept criterion into a 502). The standard
`?x skos:broader* <uri>` means the same thing: the concept itself or any narrower one.
"""

from typing import Any

import httpx
import pytest

from app.shared.sparql_guard import prepare_query
from tests.conftest import FakeCorese
from tests.test_sparql_injection import VALID_IRI

CONCEPT = "http://ex.org/concept/c1"
OTHER_CONCEPT = "http://ex.org/concept/c2"
COLLECTION = "http://ex.org/collection/k1"
OTHER_COLLECTION = "http://ex.org/collection/k2"


async def test_an_and_search_with_sub_concepts_uses_the_broader_star_path(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {
        "match_mode": "AND",
        "concept_criteria": [{"uri": CONCEPT, "include_subconcepts": True}],
    }

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert f"skos:broader* <{CONCEPT}>" in corese.queries[0]
    assert "= <" not in corese.queries[0]


async def test_an_excluded_concept_with_sub_concepts_uses_the_broader_star_path(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {
        "author": ["Aelian"],
        "concept_criteria": [{"uri": CONCEPT, "include_subconcepts": True, "polarity": "exclude"}],
    }

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert f"skos:broader* <{CONCEPT}>" in corese.queries[0]
    assert "= <" not in corese.queries[0]


PAYLOADS: dict[str, dict[str, Any]] = {
    "author-only": {"author": ["Aelian"]},
    "work-only": {"work": [VALID_IRI]},
    "author-and-work": {"author": ["Aelian"], "work": [VALID_IRI]},
    "excluded-work": {"author": ["Aelian"], "excluded_works": [VALID_IRI + "_2"]},
    "or-concepts": {
        "match_mode": "OR",
        "concept_criteria": [{"uri": CONCEPT}, {"uri": OTHER_CONCEPT}],
    },
    "or-concepts-with-sub-concepts": {
        "match_mode": "OR",
        "concept_criteria": [
            {"uri": CONCEPT, "include_subconcepts": True},
            {"uri": OTHER_CONCEPT},
        ],
    },
    "and-concepts": {
        "match_mode": "AND",
        "concept_criteria": [{"uri": CONCEPT}, {"uri": OTHER_CONCEPT}],
    },
    "and-concepts-with-sub-concepts": {
        "match_mode": "AND",
        "concept_criteria": [
            {"uri": CONCEPT, "include_subconcepts": True},
            {"uri": OTHER_CONCEPT, "include_subconcepts": True},
        ],
    },
    "excluded-concepts": {
        "author": ["Aelian"],
        "concept_criteria": [
            {"uri": CONCEPT, "polarity": "exclude"},
            {"uri": OTHER_CONCEPT, "include_subconcepts": True, "polarity": "exclude"},
        ],
    },
    "included-collections-or": {
        "match_mode": "OR",
        "collection_criteria": [{"uri": COLLECTION}, {"uri": OTHER_COLLECTION}],
    },
    "included-collections-and": {
        "match_mode": "AND",
        "collection_criteria": [{"uri": COLLECTION}, {"uri": OTHER_COLLECTION}],
    },
    "excluded-collections": {
        "author": ["Aelian"],
        "collection_criteria": [{"uri": COLLECTION, "polarity": "exclude"}],
    },
    "everything-in-and-mode": {
        "author": ["Aelian"],
        "work": [VALID_IRI],
        "excluded_works": [VALID_IRI + "_2"],
        "match_mode": "AND",
        "concept_criteria": [
            {"uri": CONCEPT, "include_subconcepts": True},
            {"uri": OTHER_CONCEPT, "include_subconcepts": True, "polarity": "exclude"},
        ],
        "collection_criteria": [
            {"uri": COLLECTION},
            {"uri": OTHER_COLLECTION, "polarity": "exclude"},
        ],
    },
    "legacy-concepts": {
        "author": ["Aelian"],
        "concepts": [{"uri": CONCEPT}, {"uri": OTHER_CONCEPT}],
    },
    "legacy-concepts-with-sub-concepts": {
        "author": ["Aelian"],
        "concepts": [{"uri": CONCEPT}],
        "subConcepts": True,
    },
    "legacy-concepts-with-collection-members": {
        "author": ["Aelian"],
        "concepts": [{"uri": COLLECTION, "type": "collection"}],
        "collectionMembers": True,
    },
    "legacy-concepts-with-both-options": {
        "concepts": [{"uri": CONCEPT}, {"uri": COLLECTION, "type": "collection"}],
        "subConcepts": True,
        "collectionMembers": True,
    },
}


@pytest.mark.parametrize("body", PAYLOADS.values(), ids=PAYLOADS.keys())
async def test_every_query_built_by_the_custom_search_is_standard_sparql(
    client: httpx.AsyncClient, corese: FakeCorese, body: dict[str, Any]
) -> None:
    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert len(corese.queries) == 1
    # RM-ACC-02: the query that is sent also passes the guard of user-supplied queries.
    assert prepare_query(corese.queries[0]).endswith("LIMIT 10000")
