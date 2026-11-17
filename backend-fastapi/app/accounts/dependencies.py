"""FastAPI dependencies of the accounts domain: current account, CSRF check, roles.

The CSRF check lives in `optional_auth`, which every authenticating dependency builds on,
so any route that requires a session gets it: the contribution routes do since P0-4b
(RM-CTB-01).
"""

from fastapi import Depends, Header, Request
from fastapi.security import APIKeyCookie
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import Role
from app.accounts.passwords import PasswordHasher, get_password_hasher
from app.accounts.repository import AccountRepository
from app.accounts.service import AccountService, AuthContext
from app.accounts.tokens import tokens_match
from app.core.clock import Clock, get_clock
from app.core.config import settings
from app.core.database import get_db
from app.shared.domain_errors import Forbidden, NotAuthenticated, UnsupportedMediaType

CSRF_HEADER = "X-CSRF-Token"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# `auto_error=False`: a missing cookie is answered by our own error (code `not_authenticated`).
# Declaring the cookie here makes it appear in the OpenAPI schema.
session_cookie = APIKeyCookie(
    name=settings.SESSION_COOKIE_NAME, scheme_name="SessionCookie", auto_error=False
)


def get_account_service(
    session: AsyncSession = Depends(get_db),
    hasher: PasswordHasher = Depends(get_password_hasher),
    clock: Clock = Depends(get_clock),
) -> AccountService:
    """The account service of this request (one database session per request)."""
    return AccountService(AccountRepository(session), hasher, clock)


async def require_json_content_type(request: Request) -> None:
    """Refuse a public request whose body is not declared as JSON (415).

    The public routes (login, registration, reset) carry no session, so CSRF cannot protect
    them. A cross-site HTML form can only send form or plain-text bodies: requiring JSON is
    a second barrier next to `SameSite=Strict`.
    """
    media_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if media_type != "application/json":
        raise UnsupportedMediaType(
            "unsupported_media_type", "The request body must be sent as application/json."
        )


async def optional_auth(
    request: Request,
    token: str | None = Depends(session_cookie),
    csrf_token: str | None = Header(default=None, alias=CSRF_HEADER),
    service: AccountService = Depends(get_account_service),
) -> AuthContext | None:
    """The context of the session cookie, or None when there is no valid session.

    With a valid session, an unsafe request (POST, PUT, PATCH, DELETE) must send the
    session's CSRF token in `X-CSRF-Token`: 403 `csrf_failed` otherwise.
    """
    context = await service.authenticate(token)
    if (
        context is not None
        and request.method in UNSAFE_METHODS
        and not _csrf_matches(context, csrf_token)
    ):
        raise Forbidden("csrf_failed", "The CSRF token is missing or wrong.")
    return context


def _csrf_matches(context: AuthContext, received: str | None) -> bool:
    return received is not None and tokens_match(context.session.csrf_token, received)


async def require_user(context: AuthContext | None = Depends(optional_auth)) -> AuthContext:
    """The account of the session; 401 `not_authenticated` for an anonymous caller."""
    if context is None:
        raise NotAuthenticated("not_authenticated", "Authentication is required.")
    return context


async def require_admin(context: AuthContext = Depends(require_user)) -> AuthContext:
    """The account of an admin session; 403 `admin_required` for any other role."""
    if context.user.role is not Role.ADMIN:
        raise Forbidden("admin_required", "This action is reserved to administrators.")
    return context
