"""Annotations: edit, review and delete (RM-CTB-05, RM-MOD-01 to RM-MOD-03, RM-MOD-05).

The permission table is in `test_policy.py`; here every rule is checked through the API,
with the status codes and the stable error codes that the screens translate.
"""

from typing import Any

import httpx
import pytest

from tests.contributions.conftest import (
    OTHER_CONCEPT,
    create_annotation,
    review,
    review_body,
)
from tests.support.accounts import FakeClock, Member, error_code
from tests.support.plant import plant_annotation

OTHER_PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/2"


# --- edit (RM-CTB-05, D5) ---


async def test_rm_ctb_05_the_author_edits_the_concept_and_the_justification(
    contributor: Member,
) -> None:
    created = await create_annotation(contributor, justification="first")

    response = await contributor.patch(
        f"/annotations/{created['id']}",
        json={
            "version": 1,
            "concept_uri": OTHER_CONCEPT,
            "concept_label": "aquila",
            "justification": "second",
        },
    )

    assert response.status_code == 200
    edited = response.json()
    assert (edited["concept_uri"], edited["concept_label"]) == (OTHER_CONCEPT, "aquila")
    assert edited["justification"] == "second"
    assert edited["version"] == 2
    assert edited["updated_at"].startswith("2026-01-01T12:00:00")
    assert edited["status"] == "pending"
    for fixed in ("paragraph_uri", "target_text", "start_offset", "end_offset", "scope_type"):
        assert edited[fixed] == created[fixed]


async def test_a_justification_can_be_cleared_with_null(contributor: Member) -> None:
    created = await create_annotation(contributor, justification="first")

    response = await contributor.patch(
        f"/annotations/{created['id']}", json={"version": 1, "justification": None}
    )

    assert response.status_code == 200
    assert response.json()["justification"] is None
    assert response.json()["concept_label"] == created["concept_label"]


@pytest.mark.parametrize(
    "body",
    [
        {"version": 1},
        {"version": 1, "concept_uri": OTHER_CONCEPT},
        {"version": 1, "concept_label": "aquila"},
        {"version": 1, "concept_uri": None, "concept_label": None},
        {"version": 1, "concept_type": None},
        {"version": 1, "concept_uri": "http://ex.org/c", "concept_label": "x"},
        {"version": 1, "justification": "a" * 5001},
        {"justification": "no version"},
        {"version": 0, "justification": "x"},
        # The annotated passage is fixed: the client must delete and recreate (D5).
        {"version": 1, "paragraph_uri": OTHER_PARAGRAPH},
        {"version": 1, "target_text": "other"},
        {"version": 1, "start_offset": 1},
        {"version": 1, "scope_type": "word"},
        {"version": 1, "status": "validated"},
        {"version": 1, "author_id": 5},
    ],
)
async def test_an_invalid_edit_is_a_422_and_changes_nothing(
    contributor: Member, body: dict[str, Any]
) -> None:
    created = await create_annotation(contributor)

    response = await contributor.patch(f"/annotations/{created['id']}", json=body)

    assert response.status_code == 422
    assert (await contributor.get(f"/annotations/{created['id']}")).json() == created


async def test_only_the_author_edits(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)

    for other in (second_contributor, admin):
        response = await other.patch(
            f"/annotations/{created['id']}", json={"version": 1, "justification": "x"}
        )
        assert response.status_code == 403
        assert error_code(response) == "not_author"
    assert (await contributor.get(f"/annotations/{created['id']}")).json() == created


async def test_rm_ctb_06_an_admin_edits_a_historical_annotation(
    contributor: Member, admin: Member
) -> None:
    historical = plant_annotation()
    body = {"version": 1, "justification": "Checked by an admin"}

    refused = await contributor.patch(f"/annotations/{historical}", json=body)
    done = await admin.patch(f"/annotations/{historical}", json=body)

    assert (refused.status_code, error_code(refused)) == (403, "not_author")
    assert done.status_code == 200
    assert done.json()["author"] is None
    assert done.json()["author_label"] == "Chercheuse"


async def test_an_annotation_cannot_be_edited_once_reviewed(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)
    reviewed = (await review(second_contributor, created)).json()

    response = await contributor.patch(
        f"/annotations/{created['id']}", json={"version": reviewed["version"], "justification": "x"}
    )

    assert response.status_code == 409
    assert error_code(response) == "not_pending"


async def test_an_edit_made_on_a_stale_version_is_refused(contributor: Member) -> None:
    created = await create_annotation(contributor)
    await contributor.patch(
        f"/annotations/{created['id']}", json={"version": 1, "justification": "a"}
    )

    response = await contributor.patch(
        f"/annotations/{created['id']}", json={"version": 1, "justification": "b"}
    )

    assert response.status_code == 409
    assert error_code(response) == "version_conflict"
    assert (await contributor.get(f"/annotations/{created['id']}")).json()["justification"] == "a"


async def test_editing_an_unknown_annotation_is_a_404(contributor: Member) -> None:
    response = await contributor.patch(
        "/annotations/99999", json={"version": 1, "justification": "x"}
    )

    assert response.status_code == 404
    assert error_code(response) == "annotation_not_found"


# --- review (RM-MOD-01 to RM-MOD-03, RM-MOD-06) ---


async def test_rm_mod_03_a_validation_records_the_reviewer_and_the_date(
    contributor: Member, second_contributor: Member, clock: FakeClock
) -> None:
    created = await create_annotation(contributor)
    clock.advance(hours=2)

    response = await review(second_contributor, created)

    assert response.status_code == 200
    reviewed = response.json()
    assert reviewed["status"] == "validated"
    assert reviewed["reviewer"] == {
        "id": second_contributor.user.id,
        "display_name": "Grace Hopper",
        "affiliation": "Compiler Lab",
    }
    assert reviewed["reviewed_at"].startswith("2026-01-01T14:00:00")
    assert reviewed["rejection_reason"] is None
    assert reviewed["version"] == 2


async def test_rm_mod_03_a_rejection_is_stored_with_its_reason(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)

    response = await second_contributor.post(
        f"/annotations/{created['id']}/review",
        json=review_body(1, "rejected", "  The concept is too broad.  "),
    )

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert response.json()["rejection_reason"] == "The concept is too broad."


@pytest.mark.parametrize(
    "body",
    [
        {"version": 1, "decision": "rejected"},
        {"version": 1, "decision": "rejected", "reason": ""},
        {"version": 1, "decision": "rejected", "reason": "   "},
        {"version": 1, "decision": "rejected", "reason": "x" * 2001},
        {"version": 1, "decision": "validated", "reason": "why?"},
        {"version": 1, "decision": "pending"},
        {"version": 1, "decision": "Validé"},
        {"version": 1},
        {"decision": "validated"},
    ],
)
async def test_rm_mod_03_the_reason_is_required_to_reject_and_refused_to_validate(
    contributor: Member, second_contributor: Member, body: dict[str, Any]
) -> None:
    created = await create_annotation(contributor)

    response = await second_contributor.post(f"/annotations/{created['id']}/review", json=body)

    assert response.status_code == 422
    assert (await contributor.get(f"/annotations/{created['id']}")).json()["status"] == "pending"


async def test_rm_mod_03_a_reason_of_2000_characters_is_accepted(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)

    response = await second_contributor.post(
        f"/annotations/{created['id']}/review", json=review_body(1, "rejected", "x" * 2000)
    )

    assert response.status_code == 200


async def test_rm_mod_01_nobody_reviews_their_own_contribution_admins_included(
    contributor: Member, admin: Member
) -> None:
    mine = await create_annotation(contributor)
    admins = await create_annotation(admin)

    own = await review(contributor, mine)
    admin_own = await review(admin, admins)

    for response in (own, admin_own):
        assert response.status_code == 403
        assert error_code(response) == "own_contribution"
    assert (await admin.get(f"/annotations/{admins['id']}")).json()["status"] == "pending"


async def test_rm_mod_01_an_admin_reviews_the_work_of_a_contributor(
    contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)

    response = await review(admin, created)

    assert response.status_code == 200
    assert response.json()["reviewer"]["display_name"] == "Root Admin"


async def test_rm_mod_02_one_review_is_enough_and_final(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)
    first = (await review(second_contributor, created)).json()

    again = await admin.post(
        f"/annotations/{created['id']}/review", json=review_body(first["version"], "rejected", "no")
    )

    assert again.status_code == 409
    assert error_code(again) == "not_pending"
    final = (await admin.get(f"/annotations/{created['id']}")).json()
    assert final["status"] == "validated"
    assert final["reviewer"]["display_name"] == "Grace Hopper"


async def test_rm_mod_06_a_rejected_annotation_stays_rejected(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)
    rejected = (await review(second_contributor, created, "rejected")).json()

    response = await second_contributor.post(
        f"/annotations/{created['id']}/review", json=review_body(rejected["version"])
    )

    assert response.status_code == 409
    assert error_code(response) == "not_pending"


async def test_a_review_of_content_that_changed_since_it_was_read_is_refused(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)
    seen_by_the_reviewer = created["version"]
    await contributor.patch(
        f"/annotations/{created['id']}", json={"version": 1, "justification": "rewritten"}
    )

    response = await second_contributor.post(
        f"/annotations/{created['id']}/review", json=review_body(seen_by_the_reviewer)
    )

    assert response.status_code == 409
    assert error_code(response) == "version_conflict"
    assert (await contributor.get(f"/annotations/{created['id']}")).json()["status"] == "pending"


async def test_rm_ctb_06_any_account_reviews_a_pending_historical_annotation(
    second_contributor: Member,
) -> None:
    historical = plant_annotation()

    response = await second_contributor.post(
        f"/annotations/{historical}/review", json=review_body(1)
    )

    assert response.status_code == 200
    assert response.json()["author"] is None
    assert response.json()["author_label"] == "Chercheuse"


async def test_reviewing_an_unknown_annotation_is_a_404(second_contributor: Member) -> None:
    response = await second_contributor.post("/annotations/99999/review", json=review_body(1))

    assert response.status_code == 404
    assert error_code(response) == "annotation_not_found"


async def test_a_deactivated_author_leaves_a_contribution_that_can_still_be_reviewed(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)
    deactivated = await admin.post(f"/admin/users/{contributor.user.id}/deactivate")
    assert deactivated.status_code == 200, deactivated.text

    assert (await contributor.delete(f"/annotations/{created['id']}")).status_code == 401
    reviewed = await review(second_contributor, created)

    assert reviewed.status_code == 200
    assert reviewed.json()["author"]["display_name"] == "Ada Lovelace"


# --- delete (RM-CTB-05, RM-MOD-05) ---


async def test_rm_ctb_05_the_author_deletes_a_pending_annotation(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    created = await create_annotation(contributor)

    response = await contributor.delete(f"/annotations/{created['id']}")

    assert response.status_code == 204
    assert response.content == b""
    assert (await client.get(f"/annotations/{created['id']}")).status_code == 404


async def test_someone_else_cannot_delete_a_contributors_annotation(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)

    response = await second_contributor.delete(f"/annotations/{created['id']}")

    assert response.status_code == 403
    assert error_code(response) == "not_author"
    assert (await contributor.get(f"/annotations/{created['id']}")).status_code == 200


async def test_an_author_cannot_delete_a_reviewed_annotation(
    contributor: Member, second_contributor: Member
) -> None:
    validated = await create_annotation(contributor)
    rejected = await create_annotation(contributor)
    await review(second_contributor, validated)
    await review(second_contributor, rejected, "rejected")

    for annotation in (validated, rejected):
        response = await contributor.delete(f"/annotations/{annotation['id']}")
        assert response.status_code == 409
        assert error_code(response) == "not_pending"


async def test_rm_mod_05_an_admin_moderates_pending_and_rejected_annotations(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    pending = await create_annotation(contributor)
    rejected = await create_annotation(contributor)
    await review(second_contributor, rejected, "rejected")

    for annotation in (pending, rejected):
        assert (await admin.delete(f"/annotations/{annotation['id']}")).status_code == 204
        assert (await client.get(f"/annotations/{annotation['id']}")).status_code == 404


async def test_rm_mod_05_a_validated_annotation_is_never_deleted_not_even_by_an_admin(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)
    await review(second_contributor, created)

    response = await admin.delete(f"/annotations/{created['id']}")

    assert response.status_code == 409
    assert error_code(response) == "validated_contribution"
    assert (await admin.get(f"/annotations/{created['id']}")).status_code == 200


async def test_an_admin_follows_the_author_rule_for_their_own_annotation(
    contributor: Member, admin: Member
) -> None:
    """RM-CTB-05: moderation (RM-MOD-05) covers other people's contributions only."""
    pending = await create_annotation(admin)
    rejected = await create_annotation(admin)
    validated = await create_annotation(admin)
    await review(contributor, rejected, "rejected")
    await review(contributor, validated)

    for annotation in (rejected, validated):
        response = await admin.delete(f"/annotations/{annotation['id']}")
        assert response.status_code == 409
        assert error_code(response) == "not_pending"
    assert (await admin.delete(f"/annotations/{pending['id']}")).status_code == 204


async def test_rm_ctb_06_only_an_admin_deletes_a_historical_annotation(
    contributor: Member, admin: Member
) -> None:
    historical = plant_annotation()

    refused = await contributor.delete(f"/annotations/{historical}")
    done = await admin.delete(f"/annotations/{historical}")

    assert (refused.status_code, error_code(refused)) == (403, "not_author")
    assert done.status_code == 204


async def test_deleting_an_unknown_annotation_is_a_404(contributor: Member) -> None:
    response = await contributor.delete("/annotations/99999")

    assert response.status_code == 404
    assert error_code(response) == "annotation_not_found"


# --- ids, removed routes ---


async def test_the_old_status_route_is_gone(
    contributor: Member, second_contributor: Member
) -> None:
    created = await create_annotation(contributor)

    response = await second_contributor.patch(
        f"/annotations/{created['id']}/status", json={"status": "validated"}
    )

    assert response.status_code in (404, 405)
    assert (await contributor.get(f"/annotations/{created['id']}")).json()["status"] == "pending"


async def test_an_id_is_never_reused_after_a_deletion(contributor: Member) -> None:
    first = await create_annotation(contributor)
    await contributor.delete(f"/annotations/{first['id']}")

    second = await create_annotation(contributor)

    assert second["id"] > first["id"]


@pytest.mark.parametrize("path", ["/annotations/section", "/annotations/export-ttl"])
async def test_the_fixed_routes_are_not_taken_for_an_id(
    client: httpx.AsyncClient, path: str
) -> None:
    response = await client.get(path)

    assert response.status_code != 404 or "annotation_not_found" not in response.text
    assert response.status_code in (200, 422)
