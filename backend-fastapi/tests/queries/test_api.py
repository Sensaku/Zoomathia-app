"""Saved queries behind accounts: authorship, edit and delete (RM-QC-02, RM-QC-06).

Every write route is tested as an anonymous visitor, as a session without the CSRF token, and
as the people of the permission table (docs/regles-metier.md, section 1).
"""

import logging
from typing import Any

import httpx
import pytest

from app.core.database import Database
from app.queries import service as queries_service
from app.services.sparql_client import sparql_client
from tests.conftest import FakeCorese
from tests.queries.conftest import EMAIL_ADDRESSES, QUERY, create_query
from tests.support.accounts import Member, error_code
from tests.support.plant import plant_query

SERVICE_QUERY = "SELECT * WHERE { SERVICE <http://169.254.169.254/> { ?s ?p ?o } }"


# --- who may write at all (RM-QC-06) ---


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/queries", QUERY),
        ("PUT", "/queries/1", {"title": "Overwritten"}),
        ("DELETE", "/queries/1", None),
    ],
)
async def test_rm_qc_06_nobody_writes_a_query_without_an_account(
    client: httpx.AsyncClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = await client.request(method, path, json=body)

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize(
    ("method", "body"),
    [("POST", QUERY), ("PUT", {"title": "Overwritten"}), ("DELETE", None)],
)
async def test_rm_qc_06_a_session_without_the_csrf_token_cannot_write(
    contributor: Member, method: str, body: dict[str, Any] | None
) -> None:
    created = await create_query(contributor)
    del contributor.headers["X-CSRF-Token"]
    path = "/queries" if method == "POST" else f"/queries/{created['id']}"

    response = await contributor.request(method, path, json=body)

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert (await contributor.get(f"/queries/{created['id']}")).json()["title"] == QUERY["title"]


# --- create ---


async def test_rm_qc_06_the_author_is_the_account_and_a_client_name_is_ignored(
    contributor: Member,
) -> None:
    response = await contributor.post(
        "/queries",
        json={
            **QUERY,
            "author_name": "Somebody else",
            "author_id": 999,
            "is_builtin": True,
            "author_label": "Forged",
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["author"] == {
        "id": contributor.user.id,
        "display_name": "Ada Lovelace",
        "affiliation": "Analytical Lab",
    }
    assert created["author_label"] is None
    assert created["is_builtin"] is False
    assert "author_name" not in created
    assert created["allowed_actions"] == ["edit", "delete"]


async def test_a_new_query_has_its_defaults_and_its_dates(contributor: Member) -> None:
    created = await create_query(contributor, category=None, description=None)

    assert created["category"] == "Recherche personnalisée"
    assert created["description"] is None
    assert created["created_at"] == created["updated_at"]
    assert created["created_at"].endswith("Z") or "+00:00" in created["created_at"]


# --- read ---


async def test_reading_is_public_and_the_page_has_the_shape_of_the_other_lists(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    created = await create_query(contributor)

    page = (await client.get("/queries")).json()
    one = await client.get(f"/queries/{created['id']}")

    assert set(page) == {"items", "total"}
    assert page["total"] == len(page["items"]) > 1
    assert page["items"][-1]["id"] == created["id"]  # native questions first, then by id
    assert one.status_code == 200
    assert one.json()["allowed_actions"] == []  # nothing for an anonymous visitor


async def test_an_unknown_query_is_a_404(client: httpx.AsyncClient) -> None:
    response = await client.get("/queries/99999")

    assert response.status_code == 404
    assert error_code(response) == "query_not_found"


async def test_mine_lists_the_queries_of_the_account_and_needs_a_session(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    own = await create_query(contributor, title="Mine")
    await create_query(second_contributor, title="Theirs")

    mine = await contributor.get("/queries", params={"mine": "true"})
    anonymous = await client.get("/queries", params={"mine": "true"})

    assert [q["id"] for q in mine.json()["items"]] == [own["id"]]
    assert mine.json()["total"] == 1
    assert anonymous.status_code == 401


async def test_the_page_is_bounded_and_can_be_cut(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    for number in range(3):
        await create_query(contributor, title=f"Query {number}")

    first = (await client.get("/queries", params={"limit": 2})).json()
    last = (await client.get("/queries", params={"limit": 2, "offset": first["total"] - 1})).json()

    assert len(first["items"]) == 2
    assert first["total"] > 2
    assert len(last["items"]) == 1
    for bad in ({"limit": 0}, {"limit": 501}, {"offset": -1}, {"offset": 100_001}):
        assert (await client.get("/queries", params=bad)).status_code == 422, bad
    assert (await client.get("/queries", params={"limit": 500})).status_code == 200


async def test_the_category_filter_keeps_the_total_of_the_filter(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    await create_query(contributor, category="Rapaces")
    await create_query(contributor, category="Rapaces", title="Another")

    page = (await client.get("/queries", params={"category": "Rapaces"})).json()

    assert page["total"] == 2
    assert {q["category"] for q in page["items"]} == {"Rapaces"}


async def test_rm_cpt_05_no_response_carries_an_email(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_query(contributor)
    responses = [
        await second_contributor.put(f"/queries/{created['id']}", json={"title": "Not mine"}),
        await client.get("/queries"),
        await client.get(f"/queries/{created['id']}"),
        await admin.get("/queries", params={"mine": "true"}),
        await client.get("/queries/export/json"),
    ]

    for response in responses:
        for address in EMAIL_ADDRESSES:
            assert address not in response.text
        assert "email" not in response.text


# --- allowed actions (T3) ---


async def test_allowed_actions_depend_on_who_looks(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_query(contributor)
    historical = plant_query()

    async def actions(viewer: httpx.AsyncClient, query_id: int) -> list[str]:
        return list((await viewer.get(f"/queries/{query_id}")).json()["allowed_actions"])

    assert await actions(client, created["id"]) == []
    assert await actions(contributor, created["id"]) == ["edit", "delete"]
    assert await actions(second_contributor, created["id"]) == []
    assert await actions(admin, created["id"]) == ["edit", "delete"]
    assert await actions(contributor, historical) == []
    assert await actions(admin, historical) == ["edit", "delete"]


async def test_rm_qc_02_a_native_question_offers_no_action_to_anyone(
    contributor: Member, admin: Member
) -> None:
    for viewer in (contributor, admin):
        assert (await viewer.get("/queries/1")).json()["allowed_actions"] == []


async def test_a_native_question_is_labelled_by_the_team_and_has_no_account(
    client: httpx.AsyncClient,
) -> None:
    native = (await client.get("/queries/1")).json()

    assert native["is_builtin"] is True
    assert native["author"] is None
    assert native["author_label"] == "Équipe scientifique Zoomathia"


# --- edit ---


async def test_the_author_edits_a_query_and_what_is_not_sent_is_kept(
    contributor: Member,
) -> None:
    created = await create_query(contributor)

    response = await contributor.put(f"/queries/{created['id']}", json={"title": "Renamed"})

    assert response.status_code == 200
    edited = response.json()
    assert edited["title"] == "Renamed"
    assert edited["query_text"] == QUERY["query_text"]
    assert edited["category"] == QUERY["category"]
    assert edited["author"] == created["author"]
    assert edited["created_at"] == created["created_at"]


async def test_someone_else_cannot_edit_or_delete_a_query(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_query(contributor)
    url = f"/queries/{created['id']}"

    edit = await second_contributor.put(url, json={"title": "Hijacked"})
    delete = await second_contributor.delete(url)

    for response in (edit, delete):
        assert response.status_code == 403
        assert error_code(response) == "not_author"
    assert (await contributor.get(url)).json()["title"] == QUERY["title"]


async def test_an_admin_edits_and_deletes_the_query_of_someone_else(
    client: httpx.AsyncClient, contributor: Member, admin: Member
) -> None:
    created = await create_query(contributor)
    url = f"/queries/{created['id']}"

    edit = await admin.put(url, json={"title": "Moderated"})
    delete = await admin.delete(url)

    assert edit.status_code == 200
    assert edit.json()["author"]["display_name"] == "Ada Lovelace"  # the author does not change
    assert delete.status_code == 204
    assert (await client.get(url)).status_code == 404


async def test_rm_qc_06_only_an_admin_handles_a_query_saved_before_accounts_existed(
    contributor: Member, admin: Member
) -> None:
    historical = plant_query()
    url = f"/queries/{historical}"

    refused_edit = await contributor.put(url, json={"title": "Mine now"})
    refused_delete = await contributor.delete(url)
    edit = await admin.put(url, json={"title": "Curated"})
    delete = await admin.delete(url)

    for refused in (refused_edit, refused_delete):
        assert (refused.status_code, error_code(refused)) == (403, "not_author")
    assert edit.status_code == 200
    assert edit.json()["author"] is None
    assert edit.json()["author_label"] == "Chercheuse"
    assert delete.status_code == 204


async def test_rm_qc_02_a_native_question_is_refused_to_everyone_admins_included(
    contributor: Member, admin: Member
) -> None:
    before = (await contributor.get("/queries/1")).json()

    for viewer in (contributor, admin):
        edit = await viewer.put("/queries/1", json={"title": "Overwritten"})
        delete = await viewer.delete("/queries/1")
        for response in (edit, delete):
            assert response.status_code == 403
            assert error_code(response) == "builtin_query"

    assert (await contributor.get("/queries/1")).json() == before


async def test_every_native_question_is_protected(contributor: Member, admin: Member) -> None:
    natives = [q for q in (await admin.get("/queries")).json()["items"] if q["is_builtin"]]
    assert natives

    for query in natives:
        put = await admin.put(f"/queries/{query['id']}", json={"category": "x"})
        delete = await admin.delete(f"/queries/{query['id']}")
        assert error_code(put) == error_code(delete) == "builtin_query", query["id"]


async def test_an_unknown_query_is_a_404_for_edit_and_delete(contributor: Member) -> None:
    edit = await contributor.put("/queries/99999", json={"title": "Whatever"})
    delete = await contributor.delete("/queries/99999")

    for response in (edit, delete):
        assert response.status_code == 404
        assert error_code(response) == "query_not_found"


async def test_a_refused_edit_does_not_leak_through_the_sparql_check(
    contributor: Member, second_contributor: Member
) -> None:
    """Who may edit is decided before the new text is parsed: 403, never a parse verdict."""
    created = await create_query(contributor)

    response = await second_contributor.put(
        f"/queries/{created['id']}", json={"query_text": SERVICE_QUERY}
    )

    assert (response.status_code, error_code(response)) == (403, "not_author")


# --- delete ---


async def test_the_author_deletes_a_query(client: httpx.AsyncClient, contributor: Member) -> None:
    created = await create_query(contributor)

    response = await contributor.delete(f"/queries/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert (await client.get(f"/queries/{created['id']}")).status_code == 404


async def test_an_admin_moderation_is_logged_with_ids_only(
    contributor: Member, admin: Member, caplog: pytest.LogCaptureFixture
) -> None:
    created = await create_query(contributor)

    with caplog.at_level(logging.INFO, logger=queries_service.logger.name):
        await admin.delete(f"/queries/{created['id']}")

    messages = [record.getMessage() for record in caplog.records]
    assert f"query moderated: admin={admin.user.id} id={created['id']}" in messages
    assert not any("Ada" in message or "example.org" in message for message in messages)


# --- execute and export stay public (RM-ACC-01) ---


async def test_a_visitor_runs_a_saved_query_without_an_account(
    client: httpx.AsyncClient, contributor: Member, corese: FakeCorese
) -> None:
    created = await create_query(contributor)
    corese.returns(["s"], [{"s": "http://ex.org/a"}])

    response = await client.post(f"/queries/{created['id']}/execute")

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert len(corese.queries) == 1


async def test_executing_an_unknown_query_is_a_404(client: httpx.AsyncClient) -> None:
    response = await client.post("/queries/99999/execute")

    assert (response.status_code, error_code(response)) == (404, "query_not_found")


async def test_a_query_is_executed_after_its_transaction_ended(
    client: httpx.AsyncClient,
    contributor: Member,
    database: Database,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Corese is called with no database connection held (AGENTS.md, rule 10)."""
    created = await create_query(contributor)
    checked_out: list[int] = []

    async def fake_query(code: str, slot: object = None) -> dict[str, Any]:
        pool: Any = database.engine.pool  # `checkedout` exists on the queue pool only
        checked_out.append(pool.checkedout())
        return {"head": {"vars": []}, "results": {"bindings": []}}

    monkeypatch.setattr(sparql_client, "query", fake_query)

    response = await client.post(f"/queries/{created['id']}/execute")

    assert response.status_code == 200
    assert checked_out == [0]


async def test_the_json_export_is_public_and_complete(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    created = await create_query(contributor)

    response = await client.get("/queries/export/json")

    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    exported = response.json()
    mine = next(q for q in exported if q["id"] == created["id"])
    assert mine["author"]["display_name"] == "Ada Lovelace"
    assert "allowed_actions" not in mine
    assert len(exported) == (await client.get("/queries")).json()["total"]


async def test_the_json_export_never_truncates_silently(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(queries_service, "MAX_EXPORTED_QUERIES", 2)

    response = await client.get("/queries/export/json")

    assert response.status_code == 422
    assert error_code(response) == "too_many_results"
