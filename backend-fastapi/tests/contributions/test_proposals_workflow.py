"""Term proposals: edit, review and delete (RM-CTB-05, RM-MOD-01 to RM-MOD-05, RM-THE-04).

The rules are the ones of annotations (`test_annotations_workflow.py`); this file checks that
the proposal routes apply them, and the edit of every field.
"""

from typing import Any

import httpx
import pytest

from tests.contributions.conftest import approve, create_proposal, review_body
from tests.support.accounts import Member, error_code
from tests.support.plant import CONCEPT, plant_proposal

PROPOSALS = "/thesaurus/proposals"


# --- edit (RM-CTB-05, D5: every field) ---


async def test_rm_ctb_05_the_author_edits_every_field(contributor: Member) -> None:
    created = await create_proposal(contributor, alt_labels=["a"])

    response = await contributor.patch(
        f"{PROPOSALS}/{created['id']}",
        json={
            "version": 1,
            "pref_label": "Cerf commun",
            "language": "la",
            "alt_labels": ["Cervus", "Cerf"],
            "broader_concept_uri": CONCEPT,
            "broader_concept_label": "cervidé",
            "definition": "Un cerf",
        },
    )

    assert response.status_code == 200
    edited = response.json()
    assert (edited["pref_label"], edited["language"], edited["alt_labels"]) == (
        "Cerf commun",
        "la",
        ["Cervus", "Cerf"],
    )
    assert edited["broader_concept_uri"] == CONCEPT
    assert edited["definition"] == "Un cerf"
    assert edited["version"] == 2
    assert edited["status"] == "pending"


async def test_a_field_that_is_not_sent_is_kept_and_null_clears_an_optional_one(
    contributor: Member,
) -> None:
    created = await create_proposal(contributor, definition="Keep me", broader_concept_uri=CONCEPT)

    response = await contributor.patch(
        f"{PROPOSALS}/{created['id']}",
        json={"version": 1, "broader_concept_uri": None, "alt_labels": []},
    )

    assert response.status_code == 200
    assert response.json()["broader_concept_uri"] is None
    assert response.json()["definition"] == "Keep me"
    assert response.json()["pref_label"] == "Cerf élaphe"


@pytest.mark.parametrize(
    "body",
    [
        {"version": 1},
        {"version": 1, "pref_label": None},
        {"version": 1, "pref_label": "a"},
        {"version": 1, "language": "de"},
        {"version": 1, "language": None},
        {"version": 1, "alt_labels": None},
        {"version": 1, "alt_labels": ["x"] * 21},
        {"version": 1, "broader_concept_uri": "http://ex.org/c"},
        {"version": 1, "status": "validated"},
        {"version": 1, "author_id": 4},
        {"definition": "no version"},
    ],
)
async def test_an_invalid_edit_is_a_422_and_changes_nothing(
    contributor: Member, body: dict[str, Any]
) -> None:
    created = await create_proposal(contributor)

    response = await contributor.patch(f"{PROPOSALS}/{created['id']}", json=body)

    assert response.status_code == 422
    assert (await contributor.get(f"{PROPOSALS}/{created['id']}")).json() == created


async def test_an_edit_that_makes_a_pending_duplicate_is_refused(contributor: Member) -> None:
    await create_proposal(contributor)
    other = await create_proposal(contributor, pref_label="Cerf commun")

    response = await contributor.patch(
        f"{PROPOSALS}/{other['id']}", json={"version": 1, "pref_label": "CERF ÉLAPHE"}
    )

    assert response.status_code == 409
    assert error_code(response) == "duplicate_proposal"
    stored = (await contributor.get(f"{PROPOSALS}/{other['id']}")).json()
    assert stored["pref_label"] == "Cerf commun"
    assert stored["version"] == 1


async def test_an_edit_that_keeps_the_term_is_not_a_duplicate_of_itself(
    contributor: Member,
) -> None:
    created = await create_proposal(contributor)

    response = await contributor.patch(
        f"{PROPOSALS}/{created['id']}", json={"version": 1, "pref_label": "CERF ÉLAPHE"}
    )

    assert response.status_code == 200


async def test_only_the_author_edits_and_only_while_pending(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_proposal(contributor)
    body = {"version": 1, "definition": "x"}

    for other in (second_contributor, admin):
        refused = await other.patch(f"{PROPOSALS}/{created['id']}", json=body)
        assert (refused.status_code, error_code(refused)) == (403, "not_author")
    await approve(second_contributor, created)
    late = await contributor.patch(f"{PROPOSALS}/{created['id']}", json={**body, "version": 2})
    assert (late.status_code, error_code(late)) == (409, "not_pending")


async def test_an_edit_made_on_a_stale_version_is_refused(contributor: Member) -> None:
    created = await create_proposal(contributor)
    await contributor.patch(f"{PROPOSALS}/{created['id']}", json={"version": 1, "definition": "a"})

    response = await contributor.patch(
        f"{PROPOSALS}/{created['id']}", json={"version": 1, "definition": "b"}
    )

    assert (response.status_code, error_code(response)) == (409, "version_conflict")


async def test_rm_ctb_06_an_admin_edits_a_historical_proposal(
    contributor: Member, admin: Member
) -> None:
    historical = plant_proposal()
    body = {"version": 1, "definition": "Fixed"}

    refused = await contributor.patch(f"{PROPOSALS}/{historical}", json=body)
    done = await admin.patch(f"{PROPOSALS}/{historical}", json=body)

    assert (refused.status_code, error_code(refused)) == (403, "not_author")
    assert done.status_code == 200
    assert done.json()["author_label"] == "Chercheuse"


# --- review and delete ---


async def test_rm_mod_03_a_peer_validates_and_the_review_is_recorded(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_proposal(contributor)

    response = await approve(second_contributor, created)

    assert response.status_code == 200
    assert response.json()["status"] == "validated"
    assert response.json()["reviewer"]["display_name"] == "Grace Hopper"
    assert response.json()["reviewed_at"] is not None


async def test_rm_mod_03_a_rejection_needs_a_reason(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_proposal(contributor)

    without = await second_contributor.post(
        f"{PROPOSALS}/{created['id']}/review", json={"version": 1, "decision": "rejected"}
    )
    with_reason = await second_contributor.post(
        f"{PROPOSALS}/{created['id']}/review", json=review_body(1, "rejected", "Duplicate of X.")
    )

    assert without.status_code == 422
    assert with_reason.json()["rejection_reason"] == "Duplicate of X."


async def test_rm_mod_01_nobody_reviews_their_own_proposal_and_a_review_is_final(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_proposal(contributor)

    own = await approve(contributor, created)
    first = await approve(second_contributor, created)
    again = await admin.post(
        f"{PROPOSALS}/{created['id']}/review", json=review_body(2, "rejected", "no")
    )

    assert (own.status_code, error_code(own)) == (403, "own_contribution")
    assert first.status_code == 200
    assert (again.status_code, error_code(again)) == (409, "not_pending")


async def test_a_review_of_a_proposal_that_changed_is_refused(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_proposal(contributor)
    await contributor.patch(
        f"{PROPOSALS}/{created['id']}", json={"version": 1, "definition": "new"}
    )

    response = await approve(second_contributor, created)

    assert (response.status_code, error_code(response)) == (409, "version_conflict")


async def test_delete_follows_the_same_rules_as_annotations(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    own = await create_proposal(contributor)
    pending = await create_proposal(contributor, pref_label="Pending")
    rejected = await create_proposal(contributor, pref_label="Rejected")
    validated = await create_proposal(contributor, pref_label="Validated")
    await second_contributor.post(
        f"{PROPOSALS}/{rejected['id']}/review", json=review_body(1, "rejected", "No.")
    )
    await approve(second_contributor, validated)

    stranger = await second_contributor.delete(f"{PROPOSALS}/{pending['id']}")
    late = await contributor.delete(f"{PROPOSALS}/{rejected['id']}")
    frozen = await admin.delete(f"{PROPOSALS}/{validated['id']}")

    assert (stranger.status_code, error_code(stranger)) == (403, "not_author")
    assert (late.status_code, error_code(late)) == (409, "not_pending")
    assert (frozen.status_code, error_code(frozen)) == (409, "validated_contribution")
    assert (await contributor.delete(f"{PROPOSALS}/{own['id']}")).status_code == 204
    assert (await admin.delete(f"{PROPOSALS}/{pending['id']}")).status_code == 204
    assert (await admin.delete(f"{PROPOSALS}/{rejected['id']}")).status_code == 204
    assert (await client.get(f"{PROPOSALS}/{own['id']}")).status_code == 404


async def test_allowed_actions_follow_the_viewer(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_proposal(contributor)
    url = f"{PROPOSALS}/{created['id']}"

    async def actions(viewer: httpx.AsyncClient) -> list[str]:
        return list((await viewer.get(url)).json()["allowed_actions"])

    assert await actions(client) == []
    assert await actions(contributor) == ["edit", "delete"]
    assert await actions(second_contributor) == ["review"]
    assert await actions(admin) == ["delete", "review"]


async def test_the_old_status_route_is_gone(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_proposal(contributor)

    response = await second_contributor.patch(
        f"{PROPOSALS}/{created['id']}/status", json={"status": "validated"}
    )

    assert response.status_code in (404, 405)


async def test_the_fixed_export_route_is_not_taken_for_an_id(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{PROPOSALS}/export-ttl")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/turtle")
