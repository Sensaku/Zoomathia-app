"""The single validation of user-supplied SPARQL (RM-ACC-02, AGENTS.md rule 2).

`prepare_query` parses the query instead of searching it for keywords: updates,
`SERVICE` and dataset clauses are refused, a `SELECT` is bounded by a `LIMIT`, and the
text is read the same way by rdflib and by Corese.
"""

from pathlib import Path

import pytest
from rdflib.plugins.sparql.algebra import translateQuery
from rdflib.plugins.sparql.parser import parseQuery

from app.core.config import settings
from app.shared.sparql_guard import (
    MAX_QUERY_LENGTH,
    MAX_ROWS,
    ForbiddenSparqlQuery,
    InvalidSparqlQuery,
    prepare_query,
)

SELECT = "SELECT ?s WHERE { ?s ?p ?o }"
BACKSLASH = chr(92)
NATIVE_QUERY_FILES = sorted(Path(settings.QUERIES_DIR).glob("qc*.rq"))


def lf(text: str) -> str:
    """`text` with LF line endings (a checkout may turn the query files into CRLF)."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def top_level_limit(query: str) -> int | None:
    """The LIMIT of the top-level SELECT of `query`, read with a fresh parse."""
    top = translateQuery(parseQuery(query)).algebra["p"]
    return int(top.length) if top.name == "Slice" and "length" in top else None


def test_a_select_is_accepted_and_bounded() -> None:
    assert prepare_query(SELECT) == SELECT + "\nLIMIT 10000"


def test_an_ask_is_accepted_and_left_as_written() -> None:
    query = "ASK { ?s ?p ?o }"

    assert prepare_query(query) == query


def test_a_trailing_comment_does_not_swallow_the_appended_limit() -> None:
    prepared = prepare_query(SELECT + " # no limit here")

    assert prepared.endswith("\nLIMIT 10000")
    # The limit is a real clause: parsing the result again must see it.
    assert prepare_query(prepared) == prepared


def test_a_limit_of_exactly_the_maximum_is_kept_as_written() -> None:
    query = SELECT + f" LIMIT {MAX_ROWS}"

    assert prepare_query(query) == query


def test_a_smaller_limit_is_kept_as_written() -> None:
    query = SELECT + " LIMIT 5"

    assert prepare_query(query) == query


def test_a_limit_above_the_maximum_is_refused() -> None:
    with pytest.raises(InvalidSparqlQuery):
        prepare_query(SELECT + f" LIMIT {MAX_ROWS + 1}")


def test_a_limit_inside_a_subquery_does_not_bound_the_top_level_query() -> None:
    query = "SELECT ?s WHERE { { SELECT ?s WHERE { ?s ?p ?o } LIMIT 3 } }"

    assert prepare_query(query) == query + "\nLIMIT 10000"


def test_an_offset_without_limit_still_gets_the_limit() -> None:
    assert prepare_query(SELECT + " OFFSET 20") == SELECT + " OFFSET 20\nLIMIT 10000"


def test_a_query_that_cannot_take_an_appended_limit_asks_for_an_explicit_one() -> None:
    query = "SELECT ?s WHERE { ?s ?p ?o } VALUES ?s { <http://ex.org/a> }"

    with pytest.raises(InvalidSparqlQuery, match="explicit LIMIT"):
        prepare_query(query)


@pytest.mark.parametrize(
    "query",
    [
        "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }",
        "DESCRIBE <http://ex.org/a>",
        "DESCRIBE ?s WHERE { ?s ?p ?o }",
    ],
)
def test_construct_and_describe_are_refused_as_invalid(query: str) -> None:
    with pytest.raises(InvalidSparqlQuery):
        prepare_query(query)


@pytest.mark.parametrize(
    "query",
    [
        "INSERT DATA { <http://ex.org/a> <http://ex.org/b> <http://ex.org/c> }",
        "DELETE WHERE { ?s ?p ?o }",
        "DROP ALL",
        "DROP GRAPH <http://example.org/g>",
        "# a comment first\nCLEAR GRAPH <http://ex.org/g>",
        "PREFIX ex: <http://ex.org/>\nLOAD <http://ex.org/data.ttl>",
        "WITH <http://ex.org/g> DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }",
    ],
)
def test_an_update_is_forbidden(query: str) -> None:
    with pytest.raises(ForbiddenSparqlQuery):
        prepare_query(query)


def test_rm_acc_02_an_invalid_text_that_looks_like_an_update_is_a_syntax_error() -> None:
    # Not valid SPARQL Update either: no keyword heuristic turns it into a 403.
    with pytest.raises(InvalidSparqlQuery):
        prepare_query("DROP ALL GRAPHS ;")


@pytest.mark.parametrize(
    "query",
    [
        "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }",
        "SELECT * WHERE { ?s ?p ?o OPTIONAL { SERVICE SILENT <http://ex.org/sparql> { ?s ?p ?x } } }",
        "SELECT * WHERE { { SELECT * WHERE { SERVICE <http://ex.org/sparql> { ?s ?p ?o } } LIMIT 3 } }",
        "SELECT * WHERE { ?s ?p ?o FILTER EXISTS { SERVICE <http://ex.org/sparql> { ?s ?p ?x } } }",
        "SELECT * WHERE { ?s ?p ?o MINUS { SERVICE <http://ex.org/sparql> { ?s ?p ?x } } }",
        "ASK { SERVICE <http://ex.org/sparql> { ?s ?p ?o } }",
    ],
)
def test_service_is_forbidden_at_any_depth(query: str) -> None:
    with pytest.raises(ForbiddenSparqlQuery):
        prepare_query(query)


@pytest.mark.parametrize(
    "query",
    [
        "SELECT * FROM <http://ex.org/g> WHERE { ?s ?p ?o }",
        "SELECT * FROM NAMED <http://ex.org/g> WHERE { ?s ?p ?o }",
        "ASK FROM <http://ex.org/g> { ?s ?p ?o }",
    ],
)
def test_dataset_clauses_are_forbidden(query: str) -> None:
    with pytest.raises(ForbiddenSparqlQuery):
        prepare_query(query)


@pytest.mark.parametrize(
    "query",
    ["SELEC * WHERE { ?s ?p ?o }", "SELECT * WHERE { ?s ?p", "hello", "# only a comment", "   "],
)
def test_a_syntax_error_is_invalid(query: str) -> None:
    with pytest.raises(InvalidSparqlQuery):
        prepare_query(query)


def test_corese_specific_syntax_is_refused_with_an_explanation() -> None:
    query = "SELECT * WHERE { ?s ?p ?o } @federate <http://ex.org/sparql>"

    with pytest.raises(InvalidSparqlQuery, match="Corese-specific"):
        prepare_query(query)


def test_a_query_longer_than_the_maximum_is_refused_without_being_parsed() -> None:
    with pytest.raises(InvalidSparqlQuery, match="longer than"):
        prepare_query("SELECT * WHERE { " + "?s ?p ?o . " * 5000 + "}")


@pytest.mark.parametrize(
    "query",
    [
        'SELECT ?add WHERE { ?add ?p "x" }',
        'SELECT ?s WHERE { ?s ?p "load" }',
        'SELECT ?s WHERE { ?s <http://ex.org/delete> "create copy move drop insert clear" }',
    ],
)
def test_words_that_look_like_update_keywords_are_not_false_positives(query: str) -> None:
    assert prepare_query(query) == query + "\nLIMIT 10000"


@pytest.mark.parametrize(
    ("query", "secret"),
    [
        ("SELECT * WHERE { SERVICE <http://secret.example/x> { ?s ?p ?o } }", "secret.example"),
        ("SELEC secret-token-123", "secret-token-123"),
        ("DROP GRAPH <http://secret.example/g>", "secret.example"),
        ("DROP ALL GRAPHS ; secret-token-123", "secret-token-123"),
        (f'SELECT * WHERE {{ ?s ?p "secret-token-123{BACKSLASH}u0041" }}', "secret-token-123"),
        ("SELECT * WHERE { ?s ?p ?o } secret-token-123\x00", "secret-token-123"),
        ("SELECT * WHERE { ?s ?p ?o # secret-token-123\r SERVICE <http://x/> {} }", "secret"),
        (
            "PREFIX x: <http://secret.example/> ASK { FILTER(x:read('secret-token-123')) }",
            "secret",
        ),
        (
            "PREFIX x: <http://a.example/> PREFIX x: <http://secret.example/> ASK {}",
            "secret.example",
        ),
        ("SELECT * WHERE " + "{ " * 60 + "secret-token-123", "secret-token-123"),
    ],
)
def test_error_messages_never_echo_the_query(query: str, secret: str) -> None:
    with pytest.raises((ForbiddenSparqlQuery, InvalidSparqlQuery)) as raised:
        prepare_query(query)

    assert secret not in str(raised.value)


def test_the_native_queries_are_all_found() -> None:
    assert len(NATIVE_QUERY_FILES) == 26


@pytest.mark.parametrize("path", NATIVE_QUERY_FILES, ids=lambda path: path.name)
def test_native_competency_questions_pass_the_guard(path: Path) -> None:
    text = path.read_text(encoding="utf-8")

    prepared = prepare_query(text)

    assert prepared == lf(text).rstrip() + "\nLIMIT 10000"
    assert top_level_limit(prepared) == MAX_ROWS


# --- one reading of the text for rdflib and Corese (RM-ACC-02) ----------------------------


def test_rm_acc_02_a_comment_ended_by_a_cr_cannot_hide_a_service() -> None:
    query = "SELECT * WHERE { ?s ?p ?o #\r SERVICE <http://evil/> { ?a ?b ?c } \n }"

    with pytest.raises(ForbiddenSparqlQuery):
        prepare_query(query)


def test_rm_acc_02_a_comment_ended_by_a_cr_cannot_hide_a_limit() -> None:
    query = "SELECT * WHERE #\r { { SELECT * WHERE\n { ?s ?p ?o } LIMIT 5 #\r } ?x ?y ?z }\n"

    prepared = prepare_query(query)

    assert "\r" not in prepared
    assert prepared == lf(query).rstrip() + "\nLIMIT 10000"
    assert top_level_limit(prepared) == MAX_ROWS


def test_rm_acc_02_an_escaped_quote_cannot_hide_a_service_inside_a_string() -> None:
    query = (
        'SELECT * WHERE { ?s ?p "X'
        + BACKSLASH
        + 'u00000022 . } #" . SERVICE <http://evil/> { ?a ?b ?c } }'
    )

    with pytest.raises(InvalidSparqlQuery, match="escape"):
        prepare_query(query)


@pytest.mark.parametrize("line_ending", ["\r\n", "\r"])
def test_rm_acc_02_crlf_and_lone_cr_line_endings_are_normalized_to_lf(line_ending: str) -> None:
    query = line_ending.join(["SELECT ?s", "WHERE { ?s ?p ?o }", "ORDER BY ?s", ""])

    prepared = prepare_query(query)

    assert "\r" not in prepared
    assert prepared == "SELECT ?s\nWHERE { ?s ?p ?o }\nORDER BY ?s\nLIMIT 10000"


@pytest.mark.parametrize("line_ending", ["\r\n", "\r"])
def test_rm_acc_02_an_ask_and_an_explicit_limit_are_also_returned_with_lf_only(
    line_ending: str,
) -> None:
    ask = f"ASK {{{line_ending}?s ?p ?o{line_ending}}}"
    limited = f"SELECT ?s WHERE {{ ?s ?p ?o }}{line_ending}LIMIT 5{line_ending}"

    assert prepare_query(ask) == "ASK {\n?s ?p ?o\n}"
    assert prepare_query(limited) == "SELECT ?s WHERE { ?s ?p ?o }\nLIMIT 5\n"


def test_rm_acc_02_the_length_limit_applies_to_the_normalized_text() -> None:
    query = "SELECT * WHERE {" + "\r\n" * 2600 + "?s ?p ?o }"
    assert len(query) > MAX_QUERY_LENGTH

    assert prepare_query(query).endswith("\nLIMIT 10000")


@pytest.mark.parametrize(
    "query",
    [
        f"SELECT * WHERE {{ ?s ?p ?o FILTER(?o = '{BACKSLASH}u0041') }}",
        f"SELECT * WHERE {{ ?s ?p ?o FILTER(?o = '{BACKSLASH}u00e9') }}",
        f"SELECT * WHERE {{ ?s ?p ?o FILTER(?o = '{BACKSLASH}u00E9') }}",
        f"SELECT * WHERE {{ ?s ?p ?o FILTER(?o = '{BACKSLASH}U0001f600') }}",
        f"SELECT * WHERE {{ ?s ?p ?o FILTER(?o = '{BACKSLASH}U0001F600') }}",
        f"SELECT * WHERE {{ S{BACKSLASH}u0045RVICE <http://ex.org/sparql> {{ ?s ?p ?o }} }}",
        f"SELECT * WHERE {{ S{BACKSLASH}U00000045RVICE <http://ex.org/sparql> {{ ?s ?p ?o }} }}",
        f"SELECT * WHERE {{ ?s ?p ?o }} # {BACKSLASH}u0041 in a comment",
    ],
)
def test_rm_acc_02_unicode_escapes_are_refused_inside_and_outside_strings(query: str) -> None:
    with pytest.raises(InvalidSparqlQuery, match="escape"):
        prepare_query(query)


@pytest.mark.parametrize(
    "character",
    ["\x00", "\x01", "\x08", "\x0b", "\x0c", "\x1f", "\x7f", "\x85", "\x9f", "\u2028", "\u2029"],
)
def test_rm_acc_02_control_characters_are_refused(character: str) -> None:
    with pytest.raises(InvalidSparqlQuery, match="control characters"):
        prepare_query(f"SELECT * WHERE {{ ?s ?p ?o }}{character} LIMIT 5")


def test_rm_acc_02_tab_and_line_feed_stay_allowed() -> None:
    query = "SELECT *\tWHERE {\n\t?s ?p ?o\n} LIMIT 5"

    assert prepare_query(query) == query


# --- the `LIMIT` is appended without a second parse (RM-ACC-02) ---------------------------

UNBOUNDED_QUERIES = {
    "order-by": "SELECT ?s WHERE { ?s ?p ?o } ORDER BY ?s",
    "group-by-having": (
        "SELECT ?s (COUNT(?o) AS ?n) WHERE { ?s ?p ?o } GROUP BY ?s HAVING (COUNT(?o) > 1)"
    ),
    "offset-only": "SELECT ?s WHERE { ?s ?p ?o } OFFSET 5",
    "order-by-and-offset": "SELECT ?s WHERE { ?s ?p ?o } ORDER BY DESC(?s) OFFSET 3",
    "trailing-comment": "SELECT ?s WHERE { ?s ?p ?o } # no newline after this comment",
    "crlf": "SELECT ?s\r\nWHERE { ?s ?p ?o }\r\nORDER BY ?s\r\n",
    "limit-in-subquery-only": "SELECT ?s WHERE { { SELECT ?s WHERE { ?s ?p ?o } LIMIT 3 } }",
}


@pytest.mark.parametrize("query", UNBOUNDED_QUERIES.values(), ids=UNBOUNDED_QUERIES.keys())
def test_rm_acc_02_the_appended_limit_is_always_the_top_level_limit(query: str) -> None:
    prepared = prepare_query(query)

    assert prepared.endswith("\nLIMIT 10000")
    assert top_level_limit(prepared) == MAX_ROWS


def test_rm_acc_02_a_trailing_values_clause_needs_an_explicit_limit() -> None:
    query = "SELECT ?s WHERE { ?s ?p ?o } ORDER BY ?s VALUES ?s { <http://ex.org/a> }"

    with pytest.raises(InvalidSparqlQuery, match="explicit LIMIT"):
        prepare_query(query)


def test_rm_acc_02_a_trailing_values_clause_is_fine_after_an_explicit_limit() -> None:
    query = "SELECT ?s WHERE { ?s ?p ?o } LIMIT 5 VALUES ?s { <http://ex.org/a> }"

    assert prepare_query(query) == query
