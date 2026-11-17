"""The acting account as the permission rules of other domains see it.

`Viewer` is an active account reduced to its id and role: the contributions and the queries
domains state their rules over it, and neither depends on the other. The helpers turn the
`AuthContext` of a request into a viewer; they are shared by the routers of those domains.
"""

from dataclasses import dataclass

from app.accounts.models import Role
from app.accounts.service import AuthContext
from app.shared.domain_errors import NotAuthenticated


@dataclass(frozen=True)
class Viewer:
    """The account that acts, reduced to what the rules need."""

    id: int
    role: Role

    @property
    def is_admin(self) -> bool:
        """Whether the account is an administrator."""
        return self.role is Role.ADMIN


def viewer_of(context: AuthContext | None) -> Viewer | None:
    """The acting account reduced to what the permission rules need; None if anonymous."""
    return None if context is None else Viewer(id=context.user.id, role=context.user.role)


def acting(context: AuthContext) -> Viewer:
    """The viewer of a route that requires a session."""
    return Viewer(id=context.user.id, role=context.user.role)


def check_mine(mine: bool, context: AuthContext | None) -> None:
    """`mine` needs a session: 401 for an anonymous visitor."""
    if mine and context is None:
        raise NotAuthenticated("not_authenticated", "Authentication is required.")
