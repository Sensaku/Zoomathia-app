"""Request data never reaches Corese as SPARQL text (AGENTS.md, non-negotiable rule 1).

Invalid values are refused with a 400 before any query is sent; valid values stay
inside one IRI or one literal of the query, which is checked by parsing the query
that Corese received with rdflib.
"""

import json
from typing import Any

import httpx
import pytest
from rdflib import Literal
from rdflib.plugins.sparql.algebra import translateQuery, traverse
from rdflib.plugins.sparql.parser import parseQuery
from rdflib.plugins.sparql.parserutils import CompValue

from tests.conftest import FakeCorese

IRI_BREAKOUT = "http://ex.org/x> ?s ?p ?o } #"
LITERAL_BREAKOUT = 'a" } UNION { ?s ?p ?o } #'
VALID_IRI = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium"

# Every GET route that takes an IRI, with the name of that query parameter.
IRI_GET_ROUTES = [
    ("/getWorkByUri", "uri"),
    ("/getTranslation", "uri"),
    ("/getWorkPart", "title"),
    ("/getMetadata", "uri"),
    ("/getSummary", "uri"),
    ("/getChildren", "uri"),
    ("/getChildrenType", "uri"),
    ("/getCurrentType", "uri"),
    ("/getParagraphs", "uri"),
    ("/getParagraphAlone", "uri"),
    ("/resolveUri", "uri"),
    ("/getConcepts", "uri"),
    ("/annotations/section", "section_uri"),
    ("/download-turtle", "uri"),
]

# Every GET route that takes a language, with the other required parameters.
LANG_GET_ROUTES = [
    ("/getConcepts", {"uri": VALID_IRI}),
    ("/searchConcepts", {"input": "canis"}),
    ("/getCollections", {}),
    ("/getTheso", {}),
    ("/annotations/section", {"section_uri": VALID_IRI}),
]

# Every POST body that carries an IRI, once per place where an IRI can come from.
IRI_POST_BODIES = [
    ("/getParagraphWithConcept", {"uri": IRI_BREAKOUT, "concepts": [{"value": VALID_IRI}]}),
    ("/getParagraphWithConcept", {"uri": VALID_IRI, "concepts": [{"value": IRI_BREAKOUT}]}),
    ("/getParagraphsWithConcepts", {"concepts": [{"value": IRI_BREAKOUT}]}),
    ("/getParagraphsWithConcepts", {"concepts": [IRI_BREAKOUT]}),
    ("/customSearch", {"work": [IRI_BREAKOUT]}),
    ("/customSearch", {"author": ["Aelian"], "excluded_works": [IRI_BREAKOUT]}),
    ("/customSearch", {"concepts": [{"uri": IRI_BREAKOUT}]}),
    ("/customSearch", {"concept_criteria": [{"uri": IRI_BREAKOUT}]}),
    ("/customSearch", {"concept_criteria": [{"uri": IRI_BREAKOUT, "include_subconcepts": True}]}),
    ("/customSearch", {"concept_criteria": [{"uri": IRI_BREAKOUT}], "match_mode": "AND"}),
    (
        "/customSearch",
        {"author": ["Aelian"], "concept_criteria": [{"uri": IRI_BREAKOUT, "polarity": "exclude"}]},
    ),
    ("/customSearch", {"collection_criteria": [{"uri": IRI_BREAKOUT}]}),
    ("/customSearch", {"collection_criteria": [{"uri": IRI_BREAKOUT}], "match_mode": "AND"}),
    (
        "/customSearch",
        {
            "author": ["Aelian"],
            "collection_criteria": [{"uri": IRI_BREAKOUT, "polarity": "exclude"}],
        },
    ),
]


def assert_not_echoed(response: httpx.Response, value: str) -> None:
    """An error response must not repeat the offending value, raw or JSON-escaped."""
    assert value not in response.text
    assert json.dumps(value)[1:-1] not in response.text


def algebra_nodes(query: str) -> list[Any]:
    """Every node of the SPARQL algebra of `query` (raises if the query does not parse)."""
    nodes: list[Any] = []
    translated = translateQuery(parseQuery(query))
    traverse(translated.algebra, visitPost=nodes.append)
    return nodes


def operator_names(query: str) -> set[str]:
    return {node.name for node in algebra_nodes(query) if isinstance(node, CompValue)}


def literals(query: str) -> list[str]:
    return [str(node) for node in algebra_nodes(query) if isinstance(node, Literal)]


@pytest.mark.parametrize(("path", "parameter"), IRI_GET_ROUTES)
async def test_injected_iri_is_refused_before_reaching_corese(
    client: httpx.AsyncClient, corese: FakeCorese, path: str, parameter: str
) -> None:
    params = {parameter: IRI_BREAKOUT}
    if path == "/getConcepts":
        params["lang"] = "en"

    response = await client.get(path, params=params)

    assert response.status_code == 400
    assert "detail" in response.json()
    assert_not_echoed(response, IRI_BREAKOUT)
    assert corese.queries == []


@pytest.mark.parametrize(("path", "body"), IRI_POST_BODIES)
async def test_injected_iri_in_a_post_body_is_refused_before_reaching_corese(
    client: httpx.AsyncClient, corese: FakeCorese, path: str, body: dict[str, Any]
) -> None:
    response = await client.post(path, json=body)

    assert response.status_code == 400
    assert_not_echoed(response, IRI_BREAKOUT)
    assert corese.queries == []


@pytest.mark.parametrize("bad_iri", ["javascript:alert(1)", "file:///etc/passwd", "not an iri"])
async def test_non_http_iri_is_refused(
    client: httpx.AsyncClient, corese: FakeCorese, bad_iri: str
) -> None:
    response = await client.get("/getChildren", params={"uri": bad_iri})

    assert response.status_code == 400
    assert_not_echoed(response, bad_iri)
    assert corese.queries == []


@pytest.mark.parametrize(("path", "parameter"), IRI_GET_ROUTES)
async def test_valid_iri_stays_one_iri_of_the_query(
    client: httpx.AsyncClient, corese: FakeCorese, path: str, parameter: str
) -> None:
    params = {parameter: VALID_IRI}
    if path == "/getConcepts":
        params["lang"] = "en"

    response = await client.get(path, params=params)

    assert response.status_code == 200
    assert f"<{VALID_IRI}>" in corese.queries[0]
    assert operator_names(corese.queries[0])  # the query parses


async def test_author_with_a_quote_and_a_union_stays_inside_one_literal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.get("/getWorksFromAuthors", params={"author": LITERAL_BREAKOUT})

    assert response.status_code == 200
    query = corese.queries[0]
    assert "Union" not in operator_names(query)
    assert LITERAL_BREAKOUT in literals(query)


@pytest.mark.parametrize(
    "author", ["a\\", "a\\u0022 } UNION { ?s ?p ?o } #", 'a\\" } UNION { ?s ?p ?o } #', "a\nb"]
)
async def test_author_with_a_backslash_or_a_newline_is_refused(
    client: httpx.AsyncClient, corese: FakeCorese, author: str
) -> None:
    response = await client.get("/getWorksFromAuthors", params={"author": author})

    assert response.status_code == 400
    assert_not_echoed(response, author)
    assert corese.queries == []


@pytest.mark.parametrize(("path", "params"), LANG_GET_ROUTES)
@pytest.mark.parametrize("lang", ['en") || true || lang(?x) = ("', 'fr"', "en\\u0022", "", "e n"])
async def test_invalid_language_tag_is_refused(
    client: httpx.AsyncClient,
    corese: FakeCorese,
    path: str,
    params: dict[str, str],
    lang: str,
) -> None:
    response = await client.get(path, params={**params, "lang": lang})

    assert response.status_code == 400
    if len(lang) > 2:  # a 1-2 character value could appear in the fixed message by chance
        assert_not_echoed(response, lang)
    assert corese.queries == []


async def test_valid_language_tag_is_used_as_a_literal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.get("/getTheso", params={"lang": "zh-Hant"})

    assert response.status_code == 200
    assert "zh-Hant" in literals(corese.queries[0])


async def test_custom_search_author_with_a_quote_stays_inside_one_literal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/customSearch", json={"author": [LITERAL_BREAKOUT]})

    assert response.status_code == 200
    query = corese.queries[0]
    assert "Union" not in operator_names(query)
    assert LITERAL_BREAKOUT in literals(query)


async def test_custom_search_author_with_a_backslash_is_refused(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    payload = "a\\u0022 } #"
    response = await client.post("/customSearch", json={"author": [payload]})

    assert response.status_code == 400
    assert_not_echoed(response, payload)
    assert corese.queries == []


async def test_custom_search_with_valid_criteria_builds_a_parsable_query(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {
        "author": ["Aelian"],
        "work": [VALID_IRI],
        "excluded_works": [VALID_IRI + "_2"],
        "concept_criteria": [
            {"uri": "http://ex.org/c1"},
            {"uri": "http://ex.org/c2", "polarity": "exclude"},
        ],
        "collection_criteria": [{"uri": "http://ex.org/coll"}],
    }

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert "Aelian" in literals(corese.queries[0])
    assert "<http://ex.org/c1>" in corese.queries[0]


@pytest.mark.parametrize("suffix", [" ", "\n", "\t", "  \n"])
async def test_custom_search_strips_whitespace_around_iris(
    client: httpx.AsyncClient, corese: FakeCorese, suffix: str
) -> None:
    other = "http://ex.org/other"
    body = {
        "work": [VALID_IRI + suffix],
        "excluded_works": [suffix + other],
        "concept_criteria": [
            {"uri": "http://ex.org/c1" + suffix},
            {"uri": suffix + "http://ex.org/c2", "polarity": "exclude"},
        ],
        "collection_criteria": [
            {"uri": "http://ex.org/coll1" + suffix},
            {"uri": "http://ex.org/coll2" + suffix, "polarity": "exclude"},
        ],
    }

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    query = corese.queries[0]
    for name in ("c1", "c2", "coll1", "coll2"):
        assert f"<http://ex.org/{name}>" in query
    assert f"<{VALID_IRI}>" in query
    assert f"<{other}>" in query
    assert operator_names(query)  # the query parses


async def test_custom_search_strips_whitespace_around_an_iri_in_and_mode(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    body = {"concept_criteria": [{"uri": "http://ex.org/c1\n"}], "match_mode": "AND"}

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert "<http://ex.org/c1>" in corese.queries[0]


async def test_custom_search_strips_whitespace_around_an_author(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/customSearch", json={"author": [" Aelian "]})

    assert response.status_code == 200
    query = corese.queries[0]
    assert '"Aelian"' in query
    assert '" Aelian "' not in query
    assert "Aelian" in literals(query)


async def test_custom_search_still_refuses_a_padded_iri_with_a_breakout(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/customSearch", json={"work": [" " + IRI_BREAKOUT + "\n"]})

    assert response.status_code == 400
    assert corese.queries == []


async def test_concept_search_sends_the_input_as_one_contains_literal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    payload = 'ca" ) || true || ("'

    response = await client.get("/searchConcepts", params={"input": payload})

    assert response.status_code == 200
    query = corese.queries[0]
    assert "contains(" in query.lower()
    assert "regex(" not in query.lower()
    assert 'ca\\" ) || true || (\\"' in query
    assert payload in literals(query)
    assert "Builtin_CONTAINS" in operator_names(query)


async def test_concept_search_keeps_regex_characters_literal(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.get("/searchConcepts", params={"input": "(a+)+$"})

    assert response.status_code == 200
    assert "(a+)+$" in literals(corese.queries[0])


@pytest.mark.parametrize("term", ["a\\", "a\\u0022", "a\nb", "a" * 1001])
async def test_concept_search_refuses_an_unsafe_input(
    client: httpx.AsyncClient, corese: FakeCorese, term: str
) -> None:
    response = await client.get("/searchConcepts", params={"input": term})

    assert response.status_code == 400
    if len(term) > 2:
        assert_not_echoed(response, term)
    assert corese.queries == []
