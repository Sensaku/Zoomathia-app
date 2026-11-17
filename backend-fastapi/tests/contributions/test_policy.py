"""The permission table of the contributions domain (RM-CTB-05, RM-MOD-01, RM-MOD-05, RM-CTB-06).

Pure functions: no database, no HTTP. The same rules are tested again through the API and
the guarded SQL statements; `test_the_sql_guards_agree_with_the_policy` links the two.
"""

from dataclasses import dataclass

import pytest

from app.accounts.models import Role
from app.accounts.viewer import Viewer
from app.contributions.models import ContributionStatus
from app.contributions.policy import (
    Denial,
    allowed_actions,
    delete_denial,
    edit_denial,
    review_denial,
)

PENDING = ContributionStatus.PENDING
VALIDATED = ContributionStatus.VALIDATED
REJECTED = ContributionStatus.REJECTED

AUTHOR = Viewer(id=1, role=Role.CONTRIBUTOR)
PEER = Viewer(id=2, role=Role.CONTRIBUTOR)
ADMIN = Viewer(id=3, role=Role.ADMIN)
ADMIN_AUTHOR = Viewer(id=4, role=Role.ADMIN)


@dataclass(frozen=True)
class Item:
    author_id: int | None
    status: ContributionStatus


def by(author: Viewer | None, status: ContributionStatus) -> Item:
    return Item(None if author is None else author.id, status)


@pytest.mark.parametrize(
    ("viewer", "author", "status", "denial"),
    [
        (AUTHOR, AUTHOR, PENDING, None),
        (AUTHOR, AUTHOR, VALIDATED, Denial.NOT_PENDING),
        (AUTHOR, AUTHOR, REJECTED, Denial.NOT_PENDING),
        (PEER, AUTHOR, PENDING, Denial.NOT_AUTHOR),
        (PEER, AUTHOR, VALIDATED, Denial.NOT_AUTHOR),
        # 403 comes before 409: someone else's reviewed contribution is not theirs to edit.
        (ADMIN, AUTHOR, PENDING, Denial.NOT_AUTHOR),
        (ADMIN_AUTHOR, ADMIN_AUTHOR, PENDING, None),
        # RM-CTB-06: only an admin edits a historical row, and only while it is pending.
        (ADMIN, None, PENDING, None),
        (ADMIN, None, VALIDATED, Denial.NOT_PENDING),
        (ADMIN, None, REJECTED, Denial.NOT_PENDING),
        (PEER, None, PENDING, Denial.NOT_AUTHOR),
    ],
)
def test_rm_ctb_05_who_edits(
    viewer: Viewer, author: Viewer | None, status: ContributionStatus, denial: Denial | None
) -> None:
    assert edit_denial(by(author, status), viewer) is denial


@pytest.mark.parametrize(
    ("viewer", "author", "status", "denial"),
    [
        (PEER, AUTHOR, PENDING, None),
        (ADMIN, AUTHOR, PENDING, None),
        (AUTHOR, AUTHOR, PENDING, Denial.OWN_CONTRIBUTION),
        # RM-MOD-01: admins are included in the rule.
        (ADMIN_AUTHOR, ADMIN_AUTHOR, PENDING, Denial.OWN_CONTRIBUTION),
        # 403 comes before 409.
        (AUTHOR, AUTHOR, VALIDATED, Denial.OWN_CONTRIBUTION),
        # RM-MOD-06: a review is final.
        (PEER, AUTHOR, VALIDATED, Denial.NOT_PENDING),
        (PEER, AUTHOR, REJECTED, Denial.NOT_PENDING),
        (ADMIN, AUTHOR, VALIDATED, Denial.NOT_PENDING),
        # The author of a historical row is unknown: any account may review it.
        (PEER, None, PENDING, None),
        (ADMIN, None, PENDING, None),
        (PEER, None, VALIDATED, Denial.NOT_PENDING),
    ],
)
def test_rm_mod_01_who_reviews(
    viewer: Viewer, author: Viewer | None, status: ContributionStatus, denial: Denial | None
) -> None:
    assert review_denial(by(author, status), viewer) is denial


@pytest.mark.parametrize(
    ("viewer", "author", "status", "denial"),
    [
        (AUTHOR, AUTHOR, PENDING, None),
        (AUTHOR, AUTHOR, VALIDATED, Denial.NOT_PENDING),
        (AUTHOR, AUTHOR, REJECTED, Denial.NOT_PENDING),
        (PEER, AUTHOR, PENDING, Denial.NOT_AUTHOR),
        (PEER, AUTHOR, REJECTED, Denial.NOT_AUTHOR),
        # RM-MOD-05: an admin moderates pending and rejected contributions, never a validated one.
        (ADMIN, AUTHOR, PENDING, None),
        (ADMIN, AUTHOR, REJECTED, None),
        (ADMIN, AUTHOR, VALIDATED, Denial.VALIDATED_CONTRIBUTION),
        # An admin's own contribution follows the author rule: pending only (RM-CTB-05).
        (ADMIN_AUTHOR, ADMIN_AUTHOR, PENDING, None),
        (ADMIN_AUTHOR, ADMIN_AUTHOR, REJECTED, Denial.NOT_PENDING),
        (ADMIN_AUTHOR, ADMIN_AUTHOR, VALIDATED, Denial.NOT_PENDING),
        # RM-CTB-06: a historical row is moderated by an admin only.
        (ADMIN, None, PENDING, None),
        (ADMIN, None, REJECTED, None),
        (ADMIN, None, VALIDATED, Denial.VALIDATED_CONTRIBUTION),
        (PEER, None, PENDING, Denial.NOT_AUTHOR),
    ],
)
def test_rm_mod_05_who_deletes(
    viewer: Viewer, author: Viewer | None, status: ContributionStatus, denial: Denial | None
) -> None:
    assert delete_denial(by(author, status), viewer) is denial


def test_an_anonymous_visitor_may_do_nothing() -> None:
    assert allowed_actions(by(AUTHOR, PENDING), None) == []


@pytest.mark.parametrize(
    ("viewer", "author", "status", "actions"),
    [
        (AUTHOR, AUTHOR, PENDING, ["edit", "delete"]),
        (PEER, AUTHOR, PENDING, ["review"]),
        (ADMIN, AUTHOR, PENDING, ["delete", "review"]),
        (ADMIN, AUTHOR, REJECTED, ["delete"]),
        (ADMIN, AUTHOR, VALIDATED, []),
        (ADMIN_AUTHOR, ADMIN_AUTHOR, PENDING, ["edit", "delete"]),
        (ADMIN_AUTHOR, ADMIN_AUTHOR, REJECTED, []),
        (AUTHOR, AUTHOR, VALIDATED, []),
        (PEER, AUTHOR, REJECTED, []),
        (ADMIN, None, PENDING, ["edit", "delete", "review"]),
        (PEER, None, PENDING, ["review"]),
    ],
)
def test_allowed_actions_are_the_actions_the_policy_accepts(
    viewer: Viewer, author: Viewer | None, status: ContributionStatus, actions: list[str]
) -> None:
    assert allowed_actions(by(author, status), viewer) == actions


def test_a_deactivated_author_leaves_a_contribution_that_others_can_still_handle() -> None:
    """The policy does not look at the author's account status (RM-CPT-03)."""
    contribution = by(AUTHOR, PENDING)

    assert review_denial(contribution, PEER) is None
    assert delete_denial(contribution, ADMIN) is None
