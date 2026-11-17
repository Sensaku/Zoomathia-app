"""Term proposals behind accounts: authorship, edit, review, delete and the anti-duplicate rule.

The permission rules are the ones of annotations (see `test_annotations.py` and
`test_policy.py`); this file checks that the proposal routes apply them, and what is specific
to proposals: the free text search, the edit of every field and RM-THE-04.
"""

from typing import Any

import httpx
import pytest

from tests.contributions.conftest import create_proposal, post_proposal, review_body
from tests.support.accounts import Member, error_code
from tests.support.plant import CONCEPT, plant_proposal

PROPOSALS = "/thesaurus/proposals"


# --- who may write at all (RM-CTB-01) ---


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", PROPOSALS, {"pref_label": "Cerf", "language": "fr"}),
        ("PATCH", f"{PROPOSALS}/1", {"version": 1, "definition": "x"}),
        ("POST", f"{PROPOSALS}/1/review", {"version": 1, "decision": "validated"}),
        ("DELETE", f"{PROPOSALS}/1", None),
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
        ("POST", PROPOSALS, {"pref_label": "Autre", "language": "fr"}),
        ("PATCH", f"{PROPOSALS}/{{id}}", {"version": 1, "definition": "x"}),
        ("POST", f"{PROPOSALS}/{{id}}/review", {"version": 1, "decision": "validated"}),
        ("DELETE", f"{PROPOSALS}/{{id}}", None),
    ],
)
async def test_rm_ctb_01_a_session_without_the_csrf_token_cannot_write(
    contributor: Member, method: str, path: str, body: dict[str, Any] | None
) -> None:
    created = await create_proposal(contributor)
    del contributor.headers["X-CSRF-Token"]

    response = await contributor.request(method, path.format(id=created["id"]), json=body)

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert (await contributor.get(f"{PROPOSALS}/{created['id']}")).json()["version"] == 1


# --- creation (RM-CTB-03, RM-CTB-04) ---


async def test_rm_ctb_03_the_author_is_the_account_and_the_proposal_is_pending(
    contributor: Member,
) -> None:
    response = await post_proposal(
        contributor,
        alt_labels=["Cervus elaphus"],
        broader_concept_uri=CONCEPT,
        definition="Grand cervidé",
    )

    assert response.status_code == 201
    created = response.json()
    assert created["status"] == "pending"
    assert created["author"] == {
        "id": contributor.user.id,
        "display_name": "Ada Lovelace",
        "affiliation": "Analytical Lab",
    }
    assert created["alt_labels"] == ["Cervus elaphus"]
    assert created["allowed_actions"] == ["edit", "delete"]
    assert created["version"] == 1


@pytest.mark.parametrize(
    "extra",
    [
        {"status": "validated"},
        {"status": "Validé"},
        {"status": "En attente de révision"},
        {"contributor_name": "Someone else"},
        {"author_id": 99, "reviewer_id": 99},
    ],
)
async def test_rm_ctb_04_a_status_or_a_name_sent_by_the_client_is_ignored(
    contributor: Member, extra: dict[str, Any]
) -> None:
    created = (await post_proposal(contributor, **extra)).json()

    assert created["status"] == "pending"
    assert created["author"]["id"] == contributor.user.id
    assert created["author_label"] is None
    assert created["reviewer"] is None


# --- RM-THE-04: no pending duplicate ---


async def test_rm_the_04_the_same_pending_term_in_the_same_language_is_refused(
    contributor: Member, second_contributor: Member
) -> None:
    await create_proposal(contributor)

    same = await post_proposal(second_contributor)

    assert same.status_code == 409
    assert error_code(same) == "duplicate_proposal"
    assert (await contributor.get(PROPOSALS)).json()["total"] == 1


@pytest.mark.parametrize(
    ("first", "second"),
    [
        ("Cerf élaphe", "CERF ÉLAPHE"),
        ("Cerf élaphe", "  cerf   élaphe "),
        ("Aigle royal", "aigle" + chr(0xA0) + "royal"),
        ("ἀετός", "ἈΕΤΌΣ"),
    ],
)
async def test_rm_the_04_accents_greek_and_spacing_do_not_make_a_new_term(
    contributor: Member, first: str, second: str
) -> None:
    await create_proposal(contributor, pref_label=first, language="grc")

    response = await post_proposal(contributor, pref_label=second, language="grc")

    assert response.status_code == 409
    assert error_code(response) == "duplicate_proposal"


async def test_rm_the_04_another_language_or_another_term_is_accepted(contributor: Member) -> None:
    await create_proposal(contributor)

    other_language = await post_proposal(contributor, language="la")
    other_term = await post_proposal(contributor, pref_label="Cerf commun")

    assert other_language.status_code == other_term.status_code == 201


async def test_rm_the_04_a_reviewed_term_can_be_proposed_again(
    contributor: Member, second_contributor: Member
) -> None:
    first = await create_proposal(contributor)
    await second_contributor.post(
        f"{PROPOSALS}/{first['id']}/review", json=review_body(1, "rejected", "Too vague.")
    )

    again = await post_proposal(contributor)

    assert again.status_code == 201


# --- reading (D9, RM-CPT-05) ---


async def test_everybody_reads_every_status_with_the_reason_of_a_rejection(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    created = await create_proposal(contributor)
    await second_contributor.post(
        f"{PROPOSALS}/{created['id']}/review", json=review_body(1, "rejected", "Too vague.")
    )

    page = (await client.get(PROPOSALS, params={"status": "rejected"})).json()

    assert page["total"] == 1
    assert page["items"][0]["rejection_reason"] == "Too vague."
    assert page["items"][0]["reviewer"]["affiliation"] == "Compiler Lab"
    assert "example.org" not in str(page)


@pytest.mark.parametrize(
    "params", [{"limit": 0}, {"limit": 201}, {"offset": -1}, {"offset": 100_001}]
)
async def test_the_page_bounds_are_enforced(
    client: httpx.AsyncClient, params: dict[str, Any]
) -> None:
    assert (await client.get(PROPOSALS, params=params)).status_code == 422


@pytest.mark.parametrize("status", ["Validé", "En attente de révision", ""])
async def test_the_status_filter_takes_the_codes_only(
    client: httpx.AsyncClient, status: str
) -> None:
    assert (await client.get(PROPOSALS, params={"status": status})).status_code == 422


async def test_mine_needs_a_session_and_keeps_the_own_proposals(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    mine = await create_proposal(contributor)
    await create_proposal(second_contributor, pref_label="Autre terme")

    anonymous = await client.get(PROPOSALS, params={"mine": "true"})
    own = (await contributor.get(PROPOSALS, params={"mine": "true"})).json()

    assert anonymous.status_code == 401
    assert [item["id"] for item in own["items"]] == [mine["id"]]


async def test_an_unknown_proposal_is_a_404(client: httpx.AsyncClient) -> None:
    response = await client.get(f"{PROPOSALS}/99999")

    assert response.status_code == 404
    assert error_code(response) == "proposal_not_found"


async def test_the_search_looks_in_the_author_name_of_an_account_and_of_a_historical_row(
    client: httpx.AsyncClient, contributor: Member
) -> None:
    by_account = await create_proposal(contributor, pref_label="x1")
    by_history = plant_proposal(pref_label="x2", author_label="Arnaud B.")

    def ids(page: httpx.Response) -> list[int]:
        return sorted(item["id"] for item in page.json()["items"])

    assert ids(await client.get(PROPOSALS, params={"q": "lovelace"})) == [by_account["id"]]
    assert ids(await client.get(PROPOSALS, params={"q": "ARNAUD"})) == [by_history]
    assert ids(await client.get(PROPOSALS, params={"q": "nobody"})) == []
    assert (await client.get(PROPOSALS, params={"q": "lovelace"})).json()["total"] == 1
