"""Annotations behind accounts: authorship, edit, review and delete (RM-CTB, RM-MOD).

Every route is tested as an anonymous visitor, as a session without the CSRF token, and as
the people of the permission table (docs/regles-metier.md, section 1).
"""

from typing import Any

import httpx
import pytest

from app.accounts.models import UserStatus
from tests.contributions.conftest import (
    ANNOTATION,
    create_annotation,
    post_annotation,
    review,
)
from tests.support.accounts import MakeAccount, Member, error_code
from tests.support.plant import PARAGRAPH, plant_annotation

OTHER_PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/2"


# --- who may write at all (RM-CTB-01) ---


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/annotations", ANNOTATION),
        ("PATCH", "/annotations/1", {"version": 1, "justification": "x"}),
        ("POST", "/annotations/1/review", {"version": 1, "decision": "validated"}),
        ("DELETE", "/annotations/1", None),
    ],
)
async def test_rm_ctb_01_an_anonymous_visitor_cannot_write(
    client: httpx.AsyncClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    response = await client.request(method, path, json=body)

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/annotations", ANNOTATION),
        ("PATCH", "/annotations/{id}", {"version": 1, "justification": "x"}),
        ("POST", "/annotations/{id}/review", {"version": 1, "decision": "validated"}),
        ("DELETE", "/annotations/{id}", None),
    ],
)
async def test_rm_ctb_01_a_session_without_the_csrf_token_cannot_write(
    contributor: Member, method: str, path: str, body: dict[str, Any] | None
) -> None:
    created = await create_annotation(contributor)
    del contributor.headers["X-CSRF-Token"]

    response = await contributor.request(method, path.format(id=created["id"]), json=body)

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert (await contributor.get(f"/annotations/{created['id']}")).json()["version"] == 1


async def test_a_pending_account_cannot_log_in_to_write(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account(email="waiting@example.org", status=UserStatus.PENDING)

    response = await client.post(
        "/auth/login", json={"email": "waiting@example.org", "password": "correct horse battery"}
    )

    assert response.status_code == 403
    assert (await post_annotation(client)).status_code == 401


# --- creation (RM-CTB-03, RM-CTB-04) ---


async def test_rm_ctb_03_the_author_is_the_logged_in_account(contributor: Member) -> None:
    response = await post_annotation(contributor)

    assert response.status_code == 201
    created = response.json()
    assert created["author"] == {
        "id": contributor.user.id,
        "display_name": "Ada Lovelace",
        "affiliation": "Analytical Lab",
    }
    assert created["author_label"] is None
    assert created["reviewer"] is None
    assert created["version"] == 1


@pytest.mark.parametrize(
    "extra",
    [
        {"status": "validated"},
        {"status": "Validé"},
        {"status": "rejected"},
        {"status": "pending"},
        {"status": ""},
        {"status": None},
        {"status": 7},
        {"annotator_name": "Someone else"},
        {"author_id": 999, "author": {"id": 999}, "reviewer_id": 999, "version": 50},
        {"reviewed_at": "2020-01-01T00:00:00Z", "rejection_reason": "x", "allowed_actions": ["x"]},
    ],
)
async def test_rm_ctb_04_a_status_or_an_author_sent_by_the_client_is_ignored(
    contributor: Member, extra: dict[str, Any]
) -> None:
    response = await post_annotation(contributor, **extra)

    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "pending"
    assert created["author"]["id"] == contributor.user.id
    assert created["author_label"] is None
    assert created["version"] == 1
    assert created["reviewer"] is None
    assert created["allowed_actions"] == ["edit", "delete"]


async def test_the_created_annotation_is_stored_as_the_client_described_it(
    contributor: Member,
) -> None:
    created = await create_annotation(
        contributor,
        end_paragraph_uri=OTHER_PARAGRAPH,
        scope_type="multi_paragraph",
        justification="Explicit mention",
    )

    assert created["paragraph_uri"] == PARAGRAPH
    assert created["target_paragraphs"] == [PARAGRAPH, OTHER_PARAGRAPH]
    assert created["justification"] == "Explicit mention"
    assert created["created_at"].startswith("2026-01-01T12:00:00")  # the injected clock
    assert created["updated_at"] is None


async def test_rm_ann_01_the_end_of_a_single_paragraph_selection_follows_its_start(
    contributor: Member,
) -> None:
    response = await post_annotation(contributor, start_offset=20, end_offset=10)

    assert response.status_code == 400
    assert error_code(response) == "invalid_offsets"
    assert (await contributor.get("/annotations")).json()["total"] == 0


# --- reading (RM-ACC-01, RM-ACC-03, D9, RM-CPT-05) ---


async def test_rm_acc_03_everybody_reads_every_status_rejections_and_reasons_included(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    pending = await create_annotation(contributor, target_text="pending")
    validated = await create_annotation(contributor, target_text="validated")
    rejected = await create_annotation(contributor, target_text="rejected")
    assert (await review(second_contributor, validated)).status_code == 200
    assert (await review(second_contributor, rejected, "rejected")).status_code == 200

    page = (await client.get("/annotations")).json()

    by_id = {item["id"]: item for item in page["items"]}
    assert page["total"] == 3
    assert [by_id[a["id"]]["status"] for a in (pending, validated, rejected)] == [
        "pending",
        "validated",
        "rejected",
    ]
    assert by_id[rejected["id"]]["rejection_reason"] == "Not convincing."
    assert by_id[rejected["id"]]["reviewer"]["display_name"] == "Grace Hopper"
    assert by_id[rejected["id"]]["reviewer"]["affiliation"] == "Compiler Lab"
    assert all(item["allowed_actions"] == [] for item in page["items"])


async def test_the_list_is_newest_first_and_paged(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    ids = [(await create_annotation(contributor, target_text=f"t{n}"))["id"] for n in range(5)]

    first = (await client.get("/annotations", params={"limit": 2})).json()
    second = (await client.get("/annotations", params={"limit": 2, "offset": 2})).json()

    assert first["total"] == second["total"] == 5
    assert [i["id"] for i in first["items"]] == ids[::-1][:2]
    assert [i["id"] for i in second["items"]] == ids[::-1][2:4]


@pytest.mark.parametrize(
    "params",
    [{"limit": 0}, {"limit": 201}, {"offset": -1}, {"offset": 100_001}, {"limit": "x"}],
)
async def test_the_page_bounds_are_enforced(
    client: httpx.AsyncClient, params: dict[str, Any]
) -> None:
    assert (await client.get("/annotations", params=params)).status_code == 422


async def test_the_page_bounds_are_accepted_at_their_limit(client: httpx.AsyncClient) -> None:
    response = await client.get("/annotations", params={"limit": 200, "offset": 100_000})

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0}


@pytest.mark.parametrize("status", ["Validé", "En attente de validation", "published", ""])
async def test_the_status_filter_takes_the_codes_only(
    client: httpx.AsyncClient, status: str
) -> None:
    assert (await client.get("/annotations", params={"status": status})).status_code == 422


async def test_the_status_and_paragraph_filters_combine(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    first = await create_annotation(contributor)
    await create_annotation(contributor)
    await create_annotation(contributor, paragraph_uri=OTHER_PARAGRAPH)
    await review(second_contributor, first)

    response = await client.get(
        "/annotations", params={"paragraph_uri": PARAGRAPH, "status": "validated"}
    )

    assert [item["id"] for item in response.json()["items"]] == [first["id"]]
    assert response.json()["total"] == 1


async def test_mine_needs_a_session_and_keeps_the_own_annotations(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    mine = await create_annotation(contributor)
    await create_annotation(second_contributor)

    anonymous = await client.get("/annotations", params={"mine": "true"})
    own = (await contributor.get("/annotations", params={"mine": "true"})).json()

    assert anonymous.status_code == 401
    assert error_code(anonymous) == "not_authenticated"
    assert [item["id"] for item in own["items"]] == [mine["id"]]
    assert own["total"] == 1


async def test_an_unknown_annotation_is_a_404(client: httpx.AsyncClient) -> None:
    response = await client.get("/annotations/99999")

    assert response.status_code == 404
    assert error_code(response) == "annotation_not_found"


async def test_rm_cpt_05_no_response_carries_an_email(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)
    responses = [
        await review(second_contributor, created, "rejected"),
        await client.get("/annotations"),
        await client.get(f"/annotations/{created['id']}"),
        await admin.get("/annotations", params={"mine": "true"}),
        await client.get("/annotations/export-ttl"),
    ]

    for response in responses:
        assert "example.org" not in response.text
        assert "ada@" not in response.text
        assert "email" not in response.text


# --- allowed actions (T3) ---


async def test_allowed_actions_follow_the_viewer(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)
    url = f"/annotations/{created['id']}"

    async def actions(viewer: httpx.AsyncClient) -> list[str]:
        return list((await viewer.get(url)).json()["allowed_actions"])

    assert await actions(client) == []
    assert await actions(contributor) == ["edit", "delete"]
    assert await actions(second_contributor) == ["review"]
    assert await actions(admin) == ["delete", "review"]

    await review(second_contributor, created)

    for viewer in (client, contributor, second_contributor, admin):
        assert await actions(viewer) == []


async def test_an_admin_may_edit_a_historical_annotation_only(
    contributor: Member, admin: Member
) -> None:
    historical = plant_annotation()

    assert (await admin.get(f"/annotations/{historical}")).json()["allowed_actions"] == [
        "edit",
        "delete",
        "review",
    ]
    assert (await contributor.get(f"/annotations/{historical}")).json()["allowed_actions"] == [
        "review"
    ]
