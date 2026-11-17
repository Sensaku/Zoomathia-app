"""Who may do what with a saved query: the single source of the permission rules.

Pure functions, like `app.contributions.policy`: the service uses them to refuse with the
right error, and the responses use them to compute `allowed_actions`. The guarded SQL
statements of the repository state the same conditions; the tests check that both agree.

Reading, executing and exporting are public. Saving needs an account (RM-QC-06). Only the
author or an admin edits or deletes a query, and a query saved before accounts existed has
no author account, so only an admin handles it. A native competency question answers
`builtin_query` to everyone, admins included: the database is not yet its single source
(RM-QC-01), so its editing (RM-QC-02) waits for it.
"""

from enum import Enum
from typing import Literal, Protocol

from app.accounts.viewer import Viewer

Action = Literal["edit", "delete"]


class Denial(str, Enum):  # noqa: UP042 - Ruff still targets py310
    """Why an action is refused; each value is the stable error code of the API."""

    NOT_AUTHOR = "not_author"
    BUILTIN_QUERY = "builtin_query"


class Saved(Protocol):
    """What the rules read of a saved query."""

    @property
    def author_id(self) -> int | None:
        """The account that saved it; None for a native or historical query."""

    @property
    def is_builtin(self) -> bool:
        """Whether it is a native competency question."""


def modify_denial(query: Saved, viewer: Viewer) -> Denial | None:
    """Why `viewer` cannot edit or delete `query`, or None if they can (RM-QC-02, RM-QC-06).

    403 `builtin_query` for a native question, whoever asks; otherwise the author or an admin.
    """
    if query.is_builtin:
        return Denial.BUILTIN_QUERY
    if viewer.is_admin or (query.author_id is not None and query.author_id == viewer.id):
        return None
    return Denial.NOT_AUTHOR


def allowed_actions(query: Saved, viewer: Viewer | None) -> list[Action]:
    """The actions that `viewer` may take on `query`; none for an anonymous visitor."""
    if viewer is None or modify_denial(query, viewer) is not None:
        return []
    return ["edit", "delete"]
