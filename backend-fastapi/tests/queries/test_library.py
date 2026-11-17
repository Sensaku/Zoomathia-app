"""The library of saved queries from the point of view of a researcher (RM-QC-06, RM-ACC-02).

Ported from the anonymous tests of the first version: every write now goes through an account.
"""

import httpx
import pytest

from tests.queries.conftest import QUERY, create_query
from tests.support.accounts import Member, error_code


async def test_the_whole_life_of_a_personal_query(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    created = await create_query(
        contributor, title="Wolves and dogs", category="Faune terrestre", description="Aristotle"
    )
    query_id = created["id"]
    assert created["is_builtin"] is False

    assert (await client.get(f"/queries/{query_id}")).json()["id"] == query_id
    updated = await contributor.put(
        f"/queries/{query_id}", json={"title": "Updated title", "category": "Canidés"}
    )
    assert updated.status_code == 200
    assert (updated.json()["title"], updated.json()["category"]) == ("Updated title", "Canidés")
    assert (await contributor.delete(f"/queries/{query_id}")).status_code == 204
    assert (await client.get(f"/queries/{query_id}")).status_code == 404


@pytest.mark.parametrize(
    "query_text",
    ["DROP SILENT ALL", "DELETE WHERE { ?s ?p ?o }", "INSERT DATA { <x> <p> <o> }"],
)
async def test_rm_acc_02_a_mutation_cannot_be_saved(contributor: Member, query_text: str) -> None:
    response = await contributor.post("/queries", json={**QUERY, "query_text": query_text})

    assert response.status_code == 403
    found = await contributor.get("/queries", params={"mine": "true"})
    assert found.json()["total"] == 0


async def test_rm_qc_02_a_native_question_cannot_be_deleted(contributor: Member) -> None:
    response = await contributor.delete("/queries/1")

    assert response.status_code == 403
    assert error_code(response) == "builtin_query"


async def test_a_text_search_still_finds_native_questions(client: httpx.AsyncClient) -> None:
    natives = [q for q in (await client.get("/queries")).json()["items"] if q["is_builtin"]]
    title = natives[0]["title"]

    found = await client.get("/queries", params={"search": title[:12].upper()})

    assert natives[0]["id"] in [q["id"] for q in found.json()["items"]]


@pytest.mark.live
async def test_a_query_of_the_library_runs_on_the_triplestore(client: httpx.AsyncClient) -> None:
    """Competency question 1 on the production Corese (bounded: the guard adds a LIMIT)."""
    response = await client.post("/queries/1/execute")

    assert response.status_code == 200
    data = response.json()
    assert {"head", "results", "count"} <= set(data)
