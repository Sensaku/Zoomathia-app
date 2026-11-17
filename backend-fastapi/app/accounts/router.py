"""HTTP routes of the accounts domain: authentication and administration of accounts.

Thin on purpose: parse the request, call `AccountService`, return a response schema.
"""

from fastapi import APIRouter, Depends, Query, Response

from app.accounts.dependencies import (
    get_account_service,
    optional_auth,
    require_admin,
    require_json_content_type,
    require_user,
    session_cookie,
)
from app.accounts.models import UserStatus
from app.accounts.schemas import (
    DEFAULT_ADMIN_PAGE_SIZE,
    MAX_ADMIN_PAGE_SIZE,
    AuthConfigOut,
    LoginRequest,
    MessageOut,
    PasswordChangeRequest,
    PasswordResetRequest,
    RegisterRequest,
    ResetTokenOut,
    RoleUpdate,
    SessionOut,
    UserOut,
    UserPage,
)
from app.accounts.service import AccountService, AuthContext
from app.core.config import settings

# Routes without a session: login, registration and password reset require a JSON body.
public_router = APIRouter(
    prefix="/auth", tags=["Accounts"], dependencies=[Depends(require_json_content_type)]
)
auth_router = APIRouter(prefix="/auth", tags=["Accounts"])
admin_router = APIRouter(prefix="/admin", tags=["Administration"])

REGISTRATION_MESSAGE = (
    "If this address can be registered, an administrator will review the account "
    "before it is activated."
)


def _set_session_cookie(response: Response, token: str) -> None:
    """Attach the session cookie: HttpOnly, SameSite=Strict, Secure unless local development."""
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_MAX_DAYS * 24 * 3600,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="strict",
    )


def _no_store(response: Response) -> None:
    """Forbid any cache from keeping a response that carries a secret (CSRF or reset token)."""
    response.headers["Cache-Control"] = "no-store"


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        secure=settings.SESSION_COOKIE_SECURE,
        httponly=True,
        samesite="strict",
    )


def _session_out(context: AuthContext) -> SessionOut:
    return SessionOut(
        user=UserOut.model_validate(context.user), csrf_token=context.session.csrf_token
    )


# --- public ---


@public_router.post("/register", status_code=202, response_model=MessageOut)
async def register(
    body: RegisterRequest, service: AccountService = Depends(get_account_service)
) -> MessageOut:
    """Ask for an account (RM-CPT-02). The answer is the same whether or not the email is known."""
    await service.register(body)
    return MessageOut(message=REGISTRATION_MESSAGE)


@public_router.post("/login", response_model=SessionOut)
async def login(
    body: LoginRequest,
    response: Response,
    token: str | None = Depends(session_cookie),
    service: AccountService = Depends(get_account_service),
) -> SessionOut:
    """Open a session: sets the session cookie and returns the CSRF token."""
    result = await service.login(body.email, body.password, token)
    _set_session_cookie(response, result.token)
    _no_store(response)
    return SessionOut(
        user=UserOut.model_validate(result.user), csrf_token=result.session.csrf_token
    )


@public_router.post("/password-reset", status_code=204)
async def reset_password(
    body: PasswordResetRequest, service: AccountService = Depends(get_account_service)
) -> None:
    """Set a new password with the token that an administrator handed over."""
    await service.reset_password(body.token, body.new_password)


# --- no session needed ---


@auth_router.get("/config", response_model=AuthConfigOut)
async def auth_config() -> AuthConfigOut:
    """Whether the sign-up screen can offer registration (public, no personal data)."""
    return AuthConfigOut(registration_enabled=settings.REGISTRATION_ENABLED)


# --- authenticated ---


@auth_router.get("/me", response_model=SessionOut)
async def me(response: Response, context: AuthContext = Depends(require_user)) -> SessionOut:
    """The logged-in account and its CSRF token."""
    _no_store(response)
    return _session_out(context)


@auth_router.post("/logout", status_code=204)
async def logout(
    response: Response,
    token: str | None = Depends(session_cookie),
    context: AuthContext | None = Depends(optional_auth),
    service: AccountService = Depends(get_account_service),
) -> None:
    """End the session on the server and clear the cookie (also when there is no session)."""
    if context is not None and token:
        await service.logout(token)
    _clear_session_cookie(response)


@auth_router.post("/password", status_code=204)
async def change_password(
    body: PasswordChangeRequest,
    context: AuthContext = Depends(require_user),
    service: AccountService = Depends(get_account_service),
) -> None:
    """Change the password; the other sessions of the account are revoked."""
    await service.change_password(context, body.current_password, body.new_password)


# --- administration ---


@admin_router.get("/users", response_model=UserPage)
async def list_users(
    status: UserStatus | None = None,
    limit: int = Query(DEFAULT_ADMIN_PAGE_SIZE, ge=1, le=MAX_ADMIN_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    _: AuthContext = Depends(require_admin),
    service: AccountService = Depends(get_account_service),
) -> UserPage:
    """List the accounts, newest first, optionally of one status."""
    users, total = await service.list_users(status, limit, offset)
    return UserPage(items=[UserOut.model_validate(user) for user in users], total=total)


@admin_router.post("/users/{user_id}/activate", response_model=UserOut)
async def activate_user(
    user_id: int,
    admin: AuthContext = Depends(require_admin),
    service: AccountService = Depends(get_account_service),
) -> UserOut:
    """Activate a pending or deactivated account (RM-CPT-02)."""
    return UserOut.model_validate(await service.activate(admin.user, user_id))


@admin_router.post("/users/{user_id}/deactivate", response_model=UserOut)
async def deactivate_user(
    user_id: int,
    admin: AuthContext = Depends(require_admin),
    service: AccountService = Depends(get_account_service),
) -> UserOut:
    """Deactivate an account and revoke its sessions (RM-CPT-03)."""
    return UserOut.model_validate(await service.deactivate(admin.user, user_id))


@admin_router.put("/users/{user_id}/role", response_model=UserOut)
async def set_user_role(
    user_id: int,
    body: RoleUpdate,
    admin: AuthContext = Depends(require_admin),
    service: AccountService = Depends(get_account_service),
) -> UserOut:
    """Make an account a contributor or an administrator."""
    return UserOut.model_validate(await service.set_role(admin.user, user_id, body.role))


@admin_router.post("/users/{user_id}/password-reset", status_code=201, response_model=ResetTokenOut)
async def issue_password_reset(
    user_id: int,
    response: Response,
    admin: AuthContext = Depends(require_admin),
    service: AccountService = Depends(get_account_service),
) -> ResetTokenOut:
    """Issue a single-use reset token; it is shown once and the admin passes it on by hand."""
    token, record = await service.issue_reset_token(admin.user, user_id)
    _no_store(response)
    return ResetTokenOut(token=token, expires_at=record.expires_at)


@admin_router.delete("/users/{user_id}", status_code=204)
async def delete_pending_user(
    user_id: int,
    admin: AuthContext = Depends(require_admin),
    service: AccountService = Depends(get_account_service),
) -> None:
    """Delete an account that was never activated (RM-CPT-04)."""
    await service.delete_pending(admin.user, user_id)


router = APIRouter()
router.include_router(public_router)
router.include_router(auth_router)
router.include_router(admin_router)
