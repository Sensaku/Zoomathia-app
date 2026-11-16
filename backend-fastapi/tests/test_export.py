"""Exports of the custom search and CSV conversion (RM-EXP-01, RM-ACC-02).

The exports are built on the server from the criteria of the search: the client never
supplies the SPARQL text that Corese receives.
"""

import csv
import io
import json
from typing import Any

import httpx
import pytest

from app.routers.export import json_to_csv
from app.services.sparql_client import sparql_client
from tests.conftest import FakeCorese, sparql_json
from tests.test_sparql_injection import VALID_IRI

EXPORT_PATHS = ["/download-custom-search-json", "/download-custom-search-csv"]
SEARCH_COLUMNS = ["work", "author", "paragraph", "text"]
ROWS = [
    {"work": "http://ex.org/w1", "author": "Aelian", "paragraph": "p1", "text": "leo; ἆρα λέων;"},
    {"work": "http://ex.org/w1", "author": "Aelian", "paragraph": "p2", "text": "=1+1"},
]
CRITERIA: dict[str, Any] = {"author": ["Aelian"]}


def parse_csv(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text), delimiter=";"))


# --- the export routes ----------------------------------------------------------------------


@pytest.mark.parametrize("path", EXPORT_PATHS)
async def test_rm_exp_01_the_export_sends_the_query_of_the_search_without_a_limit(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    corese.returns(SEARCH_COLUMNS, ROWS)
    search = await client.post("/customSearch", json=CRITERIA)
    searched = corese.queries[-1]
    sparql_client.clear_cache()  # the export must reach Corese, not the cache

    response = await client.post(path, json=CRITERIA)

    assert search.status_code == response.status_code == 200
    assert corese.queries[-1] == searched
    assert "LIMIT" not in corese.queries[-1].upper()  # RM-EXP-01: no limit of its own


async def test_rm_exp_01_the_json_export_holds_the_raw_rows_as_an_attachment(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(SEARCH_COLUMNS, ROWS)

    response = await client.post("/download-custom-search-json", json=CRITERIA)

    assert response.headers["content-type"].startswith("application/json")
    assert 'filename="export_custom_search.json"' in response.headers["content-disposition"]
    assert json.loads(response.content) == sparql_json(SEARCH_COLUMNS, ROWS)


async def test_rm_exp_01_the_csv_export_has_one_line_per_row_and_the_variables_as_header(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(SEARCH_COLUMNS, ROWS)

    response = await client.post("/download-custom-search-csv", json=CRITERIA)

    assert response.headers["content-type"].startswith("text/csv")
    assert 'filename="export_custom_search.csv"' in response.headers["content-disposition"]
    rows = parse_csv(response.text)
    assert rows[0] == SEARCH_COLUMNS
    assert rows[1] == ["http://ex.org/w1", "Aelian", "p1", "leo; ἆρα λέων;"]
    assert len(rows) == 3


@pytest.mark.parametrize("path", EXPORT_PATHS)
async def test_rm_acc_02_the_export_only_accepts_post(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    query = "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }"

    response = await client.get(path, params={"sparql": query})

    assert response.status_code == 405
    assert corese.queries == []


@pytest.mark.parametrize("path", EXPORT_PATHS)
async def test_rm_acc_02_a_sparql_field_in_the_export_body_is_ignored(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    federated = "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }"

    response = await client.post(path, json={**CRITERIA, "sparql": federated})

    assert response.status_code == 200
    assert len(corese.queries) == 1
    assert "SERVICE" not in corese.queries[0]
    assert "169.254" not in corese.queries[0]
    assert "Aelian" in corese.queries[0]


@pytest.mark.parametrize("path", EXPORT_PATHS)
@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"excluded_works": [VALID_IRI]}, 400),  # purely negative search
        ({"author": [f"Author {n}" for n in range(31)]}, 400),  # more than MAX_CRITERIA
        ({"work": ["<http://ex.org/x> } UNION { ?s ?p ?o"]}, 400),  # IRI that cannot be escaped
        ({"author": "Aelian"}, 422),  # not the payload of a search
    ],
    ids=["purely-negative", "too-many-criteria", "invalid-iri", "invalid-body"],
)
async def test_rm_acc_02_the_export_refuses_what_the_search_refuses(
    client: httpx.AsyncClient, corese: FakeCorese, path: str, body: dict[str, Any], status: int
) -> None:
    response = await client.post(path, json=body)

    assert response.status_code == status
    assert "detail" in response.json()
    assert corese.queries == []


async def test_a_purely_negative_search_is_refused_with_a_400(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await client.post("/customSearch", json={"excluded_works": [VALID_IRI]})

    assert response.status_code == 400
    assert "exclusions" in response.json()["detail"]
    assert corese.queries == []


@pytest.mark.parametrize("path", EXPORT_PATHS)
async def test_the_export_answers_502_and_504_like_the_search(
    client: httpx.AsyncClient, corese: FakeCorese, path: str
) -> None:
    corese.raises(httpx.ConnectError("refused"))
    unreachable = await client.post(path, json=CRITERIA)
    corese.raises(httpx.ReadTimeout("slow"))
    slow = await client.post(path, json=CRITERIA)

    assert unreachable.status_code == 502
    assert slow.status_code == 504


# --- CSV conversion -------------------------------------------------------------------------


def test_csv_export_keeps_greek_question_marks_in_one_column() -> None:
    document = sparql_json(["text", "author"], [{"text": "ἆρα λέων; ἢ οὔ", "author": "Aelian"}])

    rows = parse_csv(json_to_csv(document))

    assert rows[1] == ["ἆρα λέων; ἢ οὔ", "Aelian"]


def test_csv_export_quotes_quotes_and_line_breaks() -> None:
    document = sparql_json(["text"], [{"text": 'he said "leo"\nthen left'}])

    assert parse_csv(json_to_csv(document))[1] == ['he said "leo"\nthen left']


@pytest.mark.parametrize("prefix", ["=", "+", "-", "@"])
def test_csv_export_neutralizes_cells_that_a_spreadsheet_would_run_as_formulas(
    prefix: str,
) -> None:
    formula = f'{prefix}HYPERLINK("http://evil.example/","x")'
    document = sparql_json(
        [f"{prefix}header", "text"], [{f"{prefix}header": formula, "text": "ok"}]
    )

    rows = parse_csv(json_to_csv(document))

    assert rows[0][0] == "'" + f"{prefix}header"
    assert rows[1][0] == "'" + formula
    assert rows[1][1] == "ok"


def test_csv_export_leaves_other_cells_alone() -> None:
    document = sparql_json(["a"], [{"a": "leo - panthera"}, {"a": "'already"}, {"a": ""}])

    assert parse_csv(json_to_csv(document))[1:] == [["leo - panthera"], ["'already"], [""]]


def test_csv_export_fills_missing_bindings_with_empty_cells() -> None:
    document = {
        "head": {"vars": ["a", "b"]},
        "results": {"bindings": [{"a": {"type": "literal", "value": "x"}}]},
    }

    assert parse_csv(json_to_csv(document)) == [["a", "b"], ["x", ""]]


def test_csv_export_of_an_empty_result_is_only_the_header() -> None:
    assert parse_csv(json_to_csv(sparql_json(["a", "b"], []))) == [["a", "b"]]
