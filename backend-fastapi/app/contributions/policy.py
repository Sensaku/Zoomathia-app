"""Who may do what with a contribution: the single source of the permission rules.

Pure functions over a contribution and the account that views it. The service uses them to
refuse with the right error (RM-CTB-05, RM-MOD-01, RM-MOD-05), and the responses use them to
compute `allowed_actions`: the screens show actions from that list and never re-implement
these rules. The guarded SQL statements of the repository state the same conditions, for the
case where two requests race; the tests check that both agree.

The viewer is an active account (a valid session implies one), with the role `contributor`
or `admin`. "Author" means that the contribution's `author_id` is the viewer's id; a
historical contribution (RM-CTB-06) has no author account.
"""

from collections.abc import Callable
from enum import Enum
from typing import Literal, Protocol

from app.accounts.viewer import Viewer
from app.contributions.models import ContributionStatus

Action = Literal["edit", "delete", "review"]


class Denial(str, Enum):  # noqa: UP042 - Ruff still targets py310
    """Why an action is refused; each value is the stable error code of the API."""

    NOT_AUTHOR = "not_author"
    OWN_CONTRIBUTION = "own_contribution"
    NOT_PENDING = "not_pending"
    VALIDATED_CONTRIBUTION = "validated_contribution"


class Reviewable(Protocol):
    """What the rules read of a contribution (annotation or term proposal)."""

    @property
    def author_id(self) -> int | None:
        """The account that created it; None for a historical row."""

    @property
    def status(self) -> ContributionStatus:
        """Where it stands in its life cycle."""


def _is_author(contribution: Reviewable, viewer: Viewer) -> bool:
    return contribution.author_id is not None and contribution.author_id == viewer.id


def edit_denial(contribution: Reviewable, viewer: Viewer) -> Denial | None:
    """Why `viewer` cannot edit `contribution`, or None if they can (RM-CTB-05, RM-CTB-06).

    Only the author may edit, and only while it is pending; an admin may also edit a
    historical contribution that has no author account. 403 `not_author` comes before 409
    `not_pending`.
    """
    may_edit = _is_author(contribution, viewer) or (
        viewer.is_admin and contribution.author_id is None
    )
    if not may_edit:
        return Denial.NOT_AUTHOR
    if contribution.status is not ContributionStatus.PENDING:
        return Denial.NOT_PENDING
    return None


def review_denial(contribution: Reviewable, viewer: Viewer) -> Denial | None:
    """Why `viewer` cannot review `contribution`, or None if they can (RM-MOD-01, RM-MOD-06).

    Any active account reviews a pending contribution, admins included, but never its own.
    A historical contribution has no author account, so any account may review it. A review
    is final: a reviewed contribution is never reviewed again.
    """
    if _is_author(contribution, viewer):
        return Denial.OWN_CONTRIBUTION
    if contribution.status is not ContributionStatus.PENDING:
        return Denial.NOT_PENDING
    return None


def delete_denial(contribution: Reviewable, viewer: Viewer) -> Denial | None:
    """Why `viewer` cannot delete `contribution`, or None if they can (RM-CTB-05, RM-MOD-05).

    The author deletes while it is pending, an admin author included: their own contribution
    follows the author rule. An admin deletes another person's pending or rejected
    contribution (moderation), a historical one included; a validated one is never deleted,
    it will be retracted (RM-PUB-04).
    """
    if _is_author(contribution, viewer):
        if contribution.status is not ContributionStatus.PENDING:
            return Denial.NOT_PENDING
        return None
    if not viewer.is_admin:
        return Denial.NOT_AUTHOR
    if contribution.status is ContributionStatus.VALIDATED:
        return Denial.VALIDATED_CONTRIBUTION
    return None


_RULES: tuple[tuple[Action, Callable[[Reviewable, Viewer], Denial | None]], ...] = (
    ("edit", edit_denial),
    ("delete", delete_denial),
    ("review", review_denial),
)


def allowed_actions(contribution: Reviewable, viewer: Viewer | None) -> list[Action]:
    """The actions that `viewer` may take on `contribution`; none for an anonymous visitor."""
    if viewer is None:
        return []
    return [action for action, rule in _RULES if rule(contribution, viewer) is None]
