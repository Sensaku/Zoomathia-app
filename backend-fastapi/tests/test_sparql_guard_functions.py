"""Only XSD casts can be called as functions in a user-supplied query (RM-ACC-02).

Corese has extension functions (for example one that reads a file) reachable through
an IRI call. The validator resolves every called IRI from the prefixes of the query
itself, before rdflib rewrites the parse tree with its own default prefixes.
"""

import httpx
import pytest

from app.shared.sparql_guard import ForbiddenSparqlQuery, InvalidSparqlQuery, prepare_query
from tests.conftest import FakeCorese

XSD = "http://www.w3.org/2001/XMLSchema#"
EXTENSION = "http://ns.inria.fr/sparql-extension/"
PROLOGUE = f"PREFIX xsd: <{XSD}>\nPREFIX f: <http://ex.org/f#>\n"


def test_rm_acc_02_an_xsd_cast_with_a_declared_prefix_is_accepted() -> None:
    query = f"PREFIX xsd: <{XSD}> SELECT (xsd:integer(?o) AS ?x) WHERE {{ ?s ?p ?o }} LIMIT 5"

    assert prepare_query(query) == query


def test_rm_acc_02_an_xsd_cast_written_with_its_full_iri_is_accepted() -> None:
    query = f"SELECT (<{XSD}integer>(?o) AS ?x) WHERE {{ ?s ?p ?o }} LIMIT 5"

    assert prepare_query(query) == query


def test_rm_acc_02_standard_built_ins_and_aggregates_stay_allowed() -> None:
    query = (
        "SELECT (COUNT(?o) AS ?n) (STR(?s) AS ?t) WHERE { ?s ?p ?o "
        "FILTER(REGEX(STR(?o), 'a') && BOUND(?s) && IF(true, true, false)) } GROUP BY ?s LIMIT 5"
    )

    assert prepare_query(query) == query


@pytest.mark.parametrize(
    "query",
    [
        f"PREFIX xsd: <{EXTENSION}> ASK {{ FILTER(xsd:read('x')) }}",
        "ASK { FILTER(xt:read('x')) }",
        "SELECT (xsd:integer(?o) AS ?x) WHERE { ?s ?p ?o }",
        f"BASE <{EXTENSION}> SELECT (<read>('/etc/passwd') AS ?x) WHERE {{}} LIMIT 1",
        "SELECT (<read>('/etc/passwd') AS ?x) WHERE {} LIMIT 1",
        f"BASE <{XSD}> SELECT (<integer>(?o) AS ?x) WHERE {{ ?s ?p ?o }} LIMIT 1",
        f"PREFIX : <{EXTENSION}> SELECT (:read('x') AS ?x) WHERE {{}}",
        f"PREFIX x: <{EXTENSION}> SELECT (x:read('x') AS ?x) WHERE {{}}",
        "SELECT (<http://ex.org/read>('x') AS ?x) WHERE {}",
    ],
    ids=[
        "prefix-redefined-to-the-extension-namespace",
        "undeclared-prefix",
        "xsd-prefix-undeclared-would-default-in-rdflib",
        "relative-iri-with-base",
        "relative-iri-without-base",
        "relative-iri-with-xsd-base",
        "empty-prefix",
        "other-prefix",
        "full-iri",
    ],
)
def test_rm_acc_02_a_function_that_is_not_an_xsd_cast_is_forbidden(query: str) -> None:
    with pytest.raises(ForbiddenSparqlQuery, match="XSD casts"):
        prepare_query(query)


@pytest.mark.parametrize(
    "prologue",
    [
        f"PREFIX xsd: <{XSD}> PREFIX xsd: <{EXTENSION}>",
        f"PREFIX xsd: <{EXTENSION}> PREFIX xsd: <{XSD}>",
        f"PREFIX : <{XSD}> PREFIX : <{EXTENSION}>",
    ],
)
def test_rm_acc_02_a_prefix_declared_twice_is_refused(prologue: str) -> None:
    query = prologue + " ASK { FILTER(xsd:read('x')) }"

    with pytest.raises(InvalidSparqlQuery, match="more than once"):
        prepare_query(query)


FORBIDDEN_CALL_POSITIONS = {
    "select-expression": "SELECT (f:g(?o) AS ?x) WHERE { ?s ?p ?o }",
    "bind": "SELECT ?x WHERE { ?s ?p ?o BIND(f:g(?o) AS ?x) }",
    "filter": "SELECT ?s WHERE { ?s ?p ?o FILTER(f:g(?o)) }",
    "filter-exists": "SELECT ?s WHERE { ?s ?p ?o FILTER EXISTS { ?s ?q ?z FILTER(f:g(?z)) } }",
    "filter-not-exists": (
        "SELECT ?s WHERE { ?s ?p ?o FILTER NOT EXISTS { ?s ?q ?z FILTER(f:g(?z)) } }"
    ),
    "exists-in-select-expression": (
        "SELECT (EXISTS { ?s ?p ?o FILTER(f:g(?o)) } AS ?x) WHERE { ?s ?p ?o }"
    ),
    "optional-filter": "SELECT ?s WHERE { ?s ?p ?o OPTIONAL { ?s ?q ?z FILTER(f:g(?z)) } }",
    "minus": "SELECT ?s WHERE { ?s ?p ?o MINUS { ?s ?q ?z FILTER(f:g(?z)) } }",
    "union-branch": "SELECT ?s WHERE { { ?s ?p ?o } UNION { ?s ?q ?z FILTER(f:g(?z)) } }",
    "graph": "SELECT ?s WHERE { GRAPH ?g { ?s ?p ?o FILTER(f:g(?o)) } }",
    "subquery": ("SELECT ?s WHERE { { SELECT ?s WHERE { ?s ?p ?o FILTER(f:g(?o)) } LIMIT 3 } }"),
    "group-by": "SELECT ?x WHERE { ?s ?p ?o } GROUP BY (f:g(?o) AS ?x)",
    "having": "SELECT ?s WHERE { ?s ?p ?o } GROUP BY ?s HAVING (f:g(?s))",
    "order-by": "SELECT ?s WHERE { ?s ?p ?o } ORDER BY f:g(?o)",
    "aggregate-argument": "SELECT (SUM(f:g(?o)) AS ?x) WHERE { ?s ?p ?o }",
    "ask-filter-exists": "ASK { ?s ?p ?o FILTER EXISTS { ?s ?q ?z FILTER(f:g(?z)) } }",
    "nested-call": "SELECT (xsd:string(f:g(?o)) AS ?x) WHERE { ?s ?p ?o }",
}


@pytest.mark.parametrize(
    "query", FORBIDDEN_CALL_POSITIONS.values(), ids=FORBIDDEN_CALL_POSITIONS.keys()
)
def test_rm_acc_02_a_non_xsd_function_is_forbidden_in_every_position(query: str) -> None:
    with pytest.raises(ForbiddenSparqlQuery, match="XSD casts"):
        prepare_query(PROLOGUE + query)


def test_rm_acc_02_an_xsd_cast_is_accepted_in_every_position_a_call_can_take() -> None:
    query = (
        PROLOGUE
        + "SELECT (xsd:string(?o) AS ?x) WHERE { ?s ?p ?o "
        + "FILTER EXISTS { ?s ?q ?z FILTER(xsd:integer(?z) > 1) } } "
        + "ORDER BY xsd:string(?o) LIMIT 5"
    )

    assert prepare_query(query) == query


def test_rm_acc_02_the_error_does_not_echo_the_called_iri() -> None:
    with pytest.raises(ForbiddenSparqlQuery) as raised:
        prepare_query("SELECT (<http://secret.example/read>('x') AS ?x) WHERE {}")

    assert "secret" not in str(raised.value)


# --- through the API ----------------------------------------------------------------


@pytest.mark.parametrize(
    "query",
    [
        f"PREFIX xsd: <{EXTENSION}> ASK {{ FILTER(xsd:read('/etc/passwd')) }}",
        "SELECT (xsd:integer(?o) AS ?x) WHERE { ?s ?p ?o }",
    ],
)
async def test_rm_acc_02_the_playground_refuses_a_non_xsd_function_with_403(
    client: httpx.AsyncClient, corese: FakeCorese, query: str
) -> None:
    response = await client.post("/sparql/execute", json={"query": query})

    assert response.status_code == 403
    assert "/etc/passwd" not in response.text
    assert corese.queries == []


async def test_rm_acc_02_the_playground_refuses_a_duplicate_prefix_with_400(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    query = f"PREFIX xsd: <{XSD}> PREFIX xsd: <{EXTENSION}> ASK {{ FILTER(xsd:read('x')) }}"

    response = await client.post("/sparql/execute", json={"query": query})

    assert response.status_code == 400
    assert corese.queries == []
