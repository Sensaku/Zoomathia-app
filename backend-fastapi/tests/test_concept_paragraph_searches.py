"""Paragraph searches by concept: the query sent to Corese (RM-ACC-02)."""

import httpx

from tests.conftest import FakeCorese


async def test_the_paragraphs_with_concepts_query_has_no_unconnected_label_pattern(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """`?concept skos:prefLabel ?label` joined nothing to the search, so Corese paired every
    matching paragraph with every English concept label before `DISTINCT` (measured on the
    live Corese, 25,910 English labels: 0.65 to 0.95 s with the pattern, 0.04 s without it,
    same rows).
    """
    corese.returns(["paragraph"], [{"paragraph": "http://ex.org/p/1"}])

    response = await client.post(
        "/getParagraphsWithConcepts", json={"concepts": ["http://ex.org/c1", "http://ex.org/c2"]}
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    query = corese.queries[0]
    assert "prefLabel" not in query
    assert "lang(" not in query
    assert query.count("oa:hasBody") == 2  # the criteria are still sent
    assert "?paragraph zoo:text ?text" in query
