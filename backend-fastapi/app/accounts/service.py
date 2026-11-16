"""Business rules of the accounts domain: registration, activation, sessions, passwords.

No FastAPI import here: the service raises domain errors (`app/shared/domain_errors.py`),
and each public operation commits its own short transactions. Account events are logged with
user ids only, never an email, a password or a token.

Transaction hygiene: hashing is slow and may wait up to ten seconds for a hashing slot, so
no operation hashes (or waits for a slot) while a transaction is open. SQLite has one
writer: a write transaction held during a hash would fail every other writer with "database
is locked", and a connection held by a read would drain the pool. Each operation therefore
reads what it needs, ends its transaction (`commit` keeps the loaded objects usable, the
session does not expire them), hashes, and only then writes.
"""

import logging
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.exc import IntegrityError

from app.accounts.models import PasswordResetToken, Role, User, UserSession, UserStatus
from app.accounts.passwords import PasswordHasher, check_password_policy
from app.accounts.repository import AccountRepository
from app.accounts.schemas import RegisterRequest
from app.accounts.throttle import LoginThrottler
from app.accounts.tokens import hash_token, new_token
from app.core.clock import Clock
from app.core.config import settings
from app.shared.domain_errors import (
    BadRequest,
    Conflict,
    Forbidden,
    NotAuthenticated,
    NotFound,
)

logger = logging.getLogger(__name__)

# *Proposed* (docs/security.md): an admin-issued reset token lives three days.
RESET_TOKEN_LIFETIME = timedelta(hours=72)
# *Proposed*: `last_seen_at` is written at most this often, because SQLite takes one write at a time.
LAST_SEEN_REFRESH = timedelta(minutes=10)

_INVALID_CREDENTIALS = "The email or the password is wrong."
_INVALID_RESET_TOKEN = "The reset token is invalid or has expired."  # noqa: S105
_LAST_ADMIN = "At least one other active administrator must remain."


@dataclass(frozen=True)
class AuthContext:
    """The account and the session that an authenticated request runs under."""

    user: User
    session: UserSession


@dataclass(frozen=True)
class LoginResult:
    """A fresh session: `token` is the raw cookie value, shown to the client only once."""

    user: User
    session: UserSession
    token: str


class AccountService:
    """Accounts, sessions and passwords (RM-CPT-01 to RM-CPT-04)."""

    def __init__(self, repository: AccountRepository, hasher: PasswordHasher, clock: Clock) -> None:
        self._repository = repository
        self._hasher = hasher
        self._clock = clock
        self._throttle = LoginThrottler(repository, clock)

    # --- registration and first admin ---

    async def register(self, request: RegisterRequest) -> None:
        """Create a pending contributor (RM-CPT-02), or silently do nothing if the email is taken.

        The caller answers the same way in both cases, so that the form cannot be used to
        find out which emails have an account. The password is hashed in both cases too, so
        that the duration does not tell them apart either.
        """
        if not settings.REGISTRATION_ENABLED:
            raise Forbidden("registration_closed", "Registrations are closed.")
        check_password_policy(request.password, request.email)
        password_hash = await self._hasher.hash(request.password)
        if await self._repository.get_user_by_email(request.email) is not None:
            return
        user = self._new_user(request.email, request.display_name, request.affiliation)
        user.password_hash = password_hash
        try:
            await self._repository.add_user(user)
            await self._repository.commit()
        except IntegrityError:
            await self._repository.rollback()  # a concurrent registration of the same email
            return
        logger.info("account registered: user_id=%s", user.id)

    async def create_admin(
        self, email: str, display_name: str, affiliation: str, password: str
    ) -> User:
        """Create an active admin: the first one is made with a server command, not the API."""
        check_password_policy(password, email)
        password_hash = await self._hasher.hash(password)
        if await self._repository.get_user_by_email(email) is not None:
            raise Conflict("email_already_registered", "An account already uses this email.")
        user = self._new_user(email, display_name, affiliation)
        user.password_hash = password_hash
        user.role = Role.ADMIN
        user.status = UserStatus.ACTIVE
        user.activated_at = user.created_at
        await self._repository.add_user(user)
        await self._repository.commit()
        logger.info("admin account created: user_id=%s", user.id)
        return user

    def _new_user(self, email: str, display_name: str, affiliation: str) -> User:
        now = self._clock()
        return User(
            email=email,
            display_name=display_name,
            affiliation=affiliation,
            password_hash="",
            role=Role.CONTRIBUTOR,
            status=UserStatus.PENDING,
            license_accepted_at=now,  # RM-LIC-02
            created_at=now,
        )

    # --- login, sessions ---

    async def login(self, email: str, password: str, previous_token: str | None) -> LoginResult:
        """Check the credentials and open a new session.

        Raises 429 while the email is locked, 401 for a wrong password or an unknown email
        (same answer), 403 for a pending or deactivated account (only once the password is
        right, so the status of an account is never revealed to a stranger).
        """
        await self._throttle.ensure_not_locked(email)
        # The slot comes first: a saturated server (429 `server_busy`) must not count as a
        # failed attempt, or a user retrying could lock their own email.
        async with self._hasher.slot() as hashing:
            await self._throttle.reserve_attempt(email)
            user = await self._repository.get_user_by_email(email)
            await self._repository.commit()  # the connection goes back to the pool
            if user is None:
                await hashing.verify_unknown_account(password)
                logger.info("login failed: unknown account")
                raise NotAuthenticated("invalid_credentials", _INVALID_CREDENTIALS)
            matches, upgraded_hash = await hashing.verify(password, user.password_hash)
        if not matches:
            logger.info("login failed: user_id=%s", user.id)
            raise NotAuthenticated("invalid_credentials", _INVALID_CREDENTIALS)
        await self._throttle.clear(email)
        if upgraded_hash is not None:
            user.password_hash = upgraded_hash
        if user.status is not UserStatus.ACTIVE:
            await self._repository.commit()
            raise self._inactive_account_error(user)
        return await self._open_session(user, previous_token)

    @staticmethod
    def _inactive_account_error(user: User) -> Forbidden:
        logger.info("login refused: user_id=%s status=%s", user.id, user.status.value)
        if user.status is UserStatus.PENDING:
            return Forbidden("account_pending", "The account is waiting for an administrator.")
        return Forbidden("account_deactivated", "The account has been deactivated.")

    async def _open_session(self, user: User, previous_token: str | None) -> LoginResult:
        """Create a session (never reusing one: no fixation) and drop the one that was sent."""
        now = self._clock()
        await self._repository.delete_expired_sessions(
            now, now - timedelta(days=settings.SESSION_IDLE_DAYS)
        )
        if previous_token:
            await self._repository.delete_session_by_hash(hash_token(previous_token))
        token = new_token()
        session = UserSession(
            token_hash=hash_token(token),
            user_id=user.id,
            csrf_token=new_token(),
            created_at=now,
            last_seen_at=now,
            expires_at=now + timedelta(days=settings.SESSION_MAX_DAYS),
        )
        await self._repository.add_session(session)
        await self._repository.commit()
        logger.info("login succeeded: user_id=%s", user.id)
        return LoginResult(user, session, token)

    async def authenticate(self, token: str | None) -> AuthContext | None:
        """The context of a valid session cookie, or None.

        A session is valid while it has not reached its absolute expiry, has been seen
        within the idle duration, and its account is active (D4).
        """
        context = await self._find_session(token)
        await self._repository.commit()  # the connection goes back to the pool
        return context

    async def _find_session(self, token: str | None) -> AuthContext | None:
        if not token:
            return None
        found = await self._repository.get_session_with_user(hash_token(token))
        if found is None:
            return None
        session, user = found
        now = self._clock()
        idle = timedelta(days=settings.SESSION_IDLE_DAYS)
        if now >= session.expires_at or now - session.last_seen_at >= idle:
            return None
        if user.status is not UserStatus.ACTIVE:
            return None
        if now - session.last_seen_at >= LAST_SEEN_REFRESH:
            session.last_seen_at = now
            await self._repository.commit()
        return AuthContext(user, session)

    async def logout(self, token: str) -> None:
        """Delete the session behind this cookie value."""
        await self._repository.delete_session_by_hash(hash_token(token))
        await self._repository.commit()

    # --- passwords ---

    async def change_password(
        self, context: AuthContext, current_password: str, new_password: str
    ) -> None:
        """Change the password of the logged-in account and revoke its other sessions.

        A wrong current password counts as a failure for the login throttle.
        """
        user = context.user
        check_password_policy(new_password, user.email)
        await self._throttle.ensure_not_locked(user.email)
        async with self._hasher.slot() as hashing:
            await self._throttle.reserve_attempt(user.email)
            matches, _ = await hashing.verify(current_password, user.password_hash)
            if not matches:
                logger.info("password change refused: user_id=%s", user.id)
                raise Forbidden("invalid_credentials", "The current password is wrong.")
            new_hash = await hashing.hash(new_password)
        # Only now the write: no hashing happens while a write transaction is open.
        await self._throttle.clear(user.email)
        user.password_hash = new_hash
        await self._repository.delete_user_sessions(user.id, keep_session_id=context.session.id)
        await self._repository.commit()
        logger.info("password changed: user_id=%s", user.id)

    async def reset_password(self, token: str, new_password: str) -> None:
        """Set a new password with a reset token issued by an admin, and revoke every session.

        The token is single-use and expires after 72 hours; an unknown, used or expired
        token gives the same error.
        """
        now = self._clock()
        reset = await self._repository.get_reset_token(hash_token(token))
        user = await self._repository.get_user(reset.user_id) if reset is not None else None
        if reset is None or user is None or reset.used_at is not None or now >= reset.expires_at:
            raise BadRequest("invalid_reset_token", _INVALID_RESET_TOKEN)
        if user.status is not UserStatus.ACTIVE:
            raise BadRequest("invalid_reset_token", _INVALID_RESET_TOKEN)
        check_password_policy(new_password, user.email)
        await self._repository.commit()  # the connection goes back to the pool before hashing
        new_hash = await self._hasher.hash(new_password)
        # Claiming the token is one atomic UPDATE: two uses at once cannot both succeed.
        if not await self._repository.claim_reset_token(reset.id, now):
            raise BadRequest("invalid_reset_token", _INVALID_RESET_TOKEN)
        user.password_hash = new_hash
        await self._repository.delete_user_sessions(user.id)
        await self._throttle.clear(user.email)
        await self._repository.commit()
        logger.info("password reset used: user_id=%s", user.id)

    # --- administration ---

    async def list_users(
        self, status: UserStatus | None, limit: int, offset: int
    ) -> tuple[list[User], int]:
        """A page of accounts, newest first, and the total under the same filter."""
        return await self._repository.list_users(status, limit, offset)

    async def activate(self, admin: User, user_id: int) -> User:
        """Activate a pending or deactivated account (RM-CPT-02)."""
        user = await self._get_user(user_id)
        if user.status is UserStatus.ACTIVE:
            raise Conflict("invalid_transition", "The account is already active.")
        user.status = UserStatus.ACTIVE
        user.activated_at = self._clock()
        user.activated_by_id = admin.id
        await self._repository.commit()
        logger.info("account activated: user_id=%s by=%s", user.id, admin.id)
        return user

    async def deactivate(self, admin: User, user_id: int) -> User:
        """Deactivate an account, revoking its sessions and unused reset tokens (RM-CPT-03)."""
        user = await self._get_user(user_id)
        self._refuse_own_account(admin, user)
        if user.status is UserStatus.DEACTIVATED:
            raise Conflict("invalid_transition", "The account is already deactivated.")
        if not await self._repository.deactivate_user_keeping_an_admin(user):
            raise Conflict("last_admin", _LAST_ADMIN)
        await self._repository.delete_user_sessions(user.id)
        await self._repository.delete_unused_reset_tokens(user.id)
        await self._repository.commit()
        logger.info("account deactivated: user_id=%s by=%s", user.id, admin.id)
        return user

    async def set_role(self, admin: User, user_id: int, role: Role) -> User:
        """Make an account a contributor or an admin; an admin cannot change their own role."""
        user = await self._get_user(user_id)
        if user.role is role:
            return user
        self._refuse_own_account(admin, user)
        if role is Role.ADMIN:
            user.role = role
        elif not await self._repository.demote_user_keeping_an_admin(user):
            raise Conflict("last_admin", _LAST_ADMIN)
        await self._repository.commit()
        logger.info("role changed: user_id=%s role=%s by=%s", user.id, role.value, admin.id)
        return user

    async def issue_reset_token(self, admin: User, user_id: int) -> tuple[str, PasswordResetToken]:
        """Issue a password reset token for an active account (RM-CPT-02).

        Returns the raw token, which is shown once, and its stored record. Earlier unused
        tokens of the account stop working.
        """
        user = await self._get_user(user_id)
        if user.status is not UserStatus.ACTIVE:
            raise Conflict("invalid_transition", "Only an active account can get a reset token.")
        now = self._clock()
        token = new_token()
        record = PasswordResetToken(
            token_hash=hash_token(token),
            user_id=user.id,
            created_by_id=admin.id,
            created_at=now,
            expires_at=now + RESET_TOKEN_LIFETIME,
        )
        await self._repository.delete_unused_reset_tokens(user.id)
        await self._repository.add_reset_token(record)
        await self._repository.commit()
        logger.info("password reset issued: user_id=%s by=%s", user.id, admin.id)
        return token, record

    async def delete_pending(self, admin: User, user_id: int) -> None:
        """Delete an account that was never activated (RM-CPT-04, *proposed*)."""
        user = await self._get_user(user_id)
        self._refuse_own_account(admin, user)
        if user.status is not UserStatus.PENDING:
            raise Conflict("invalid_transition", "Only a pending account can be deleted.")
        await self._repository.delete_user(user)
        await self._repository.commit()
        logger.info("pending account deleted: user_id=%s by=%s", user_id, admin.id)

    async def _get_user(self, user_id: int) -> User:
        user = await self._repository.get_user(user_id)
        if user is None:
            raise NotFound("user_not_found", "No such account.")
        return user

    @staticmethod
    def _refuse_own_account(admin: User, user: User) -> None:
        """An admin cannot lock themselves out: another admin must do it."""
        if admin.id == user.id:
            raise Conflict("own_account", "An administrator cannot do this to their own account.")
