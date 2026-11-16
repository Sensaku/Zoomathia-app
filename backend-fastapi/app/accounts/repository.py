"""Database access of the accounts domain. No business rule lives here."""

from datetime import datetime, timedelta

from sqlalchemy import and_, case, delete, func, literal, not_, or_, select, update
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import (
    LoginThrottle,
    PasswordResetToken,
    Role,
    User,
    UserSession,
    UserStatus,
)
from app.core.database import UtcDateTime


class AccountRepository:
    """Reads and writes users, sessions, reset tokens and login counters.

    Methods only stage changes; the service decides when to `commit`, so that each service
    operation is one short transaction.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def commit(self) -> None:
        """Commit the current transaction."""
        await self._session.commit()

    async def rollback(self) -> None:
        """Roll the current transaction back."""
        await self._session.rollback()

    # --- users ---

    async def get_user(self, user_id: int) -> User | None:
        """The account with this id, if any."""
        return await self._session.get(User, user_id)

    async def get_user_by_email(self, email: str) -> User | None:
        """The account with this (normalized) email, if any."""
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def add_user(self, user: User) -> None:
        """Stage a new account and flush it, so that a duplicate email fails here."""
        self._session.add(user)
        await self._session.flush()

    async def list_users(
        self, status: UserStatus | None, limit: int, offset: int
    ) -> tuple[list[User], int]:
        """A page of accounts, newest first, and the total count under the same filter."""
        condition = [User.status == status] if status is not None else []
        page = await self._session.execute(
            select(User)
            .where(*condition)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(limit)
            .offset(offset)
        )
        total = await self._session.execute(
            select(func.count()).select_from(User).where(*condition)
        )
        return list(page.scalars()), total.scalar_one()

    async def delete_user(self, user: User) -> None:
        """Delete an account; its sessions and reset tokens go with it (foreign keys)."""
        await self._session.delete(user)
        await self._session.flush()

    async def deactivate_user_keeping_an_admin(self, user: User) -> bool:
        """Deactivate `user`, unless they are the last active admin.

        The "another active admin remains" check is part of the UPDATE itself, so two admins
        deactivating each other at the same moment cannot both succeed: SQLite runs the two
        statements one after the other, and the second finds no admin left. Returns whether
        the account was changed.
        """
        return await self._guarded_update(user, status=UserStatus.DEACTIVATED)

    async def demote_user_keeping_an_admin(self, user: User) -> bool:
        """Make `user` a contributor, unless they are the last active admin (see above)."""
        return await self._guarded_update(user, role=Role.CONTRIBUTOR)

    async def _guarded_update(self, user: User, **values: object) -> bool:
        other_active_admins = (
            select(func.count())
            .select_from(User)
            .where(User.role == Role.ADMIN, User.status == UserStatus.ACTIVE, User.id != user.id)
            .scalar_subquery()
        )
        is_active_admin = and_(User.role == Role.ADMIN, User.status == UserStatus.ACTIVE)
        result = await self._session.execute(
            update(User)
            .where(User.id == user.id, or_(not_(is_active_admin), other_active_admins >= 1))
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        if not result.rowcount:  # type: ignore[attr-defined]
            return False
        await self._session.refresh(user)
        return True

    # --- sessions ---

    async def add_session(self, session: UserSession) -> None:
        """Stage a new session."""
        self._session.add(session)
        await self._session.flush()

    async def get_session_with_user(self, token_hash: str) -> tuple[UserSession, User] | None:
        """The session stored under this token hash, with its account."""
        result = await self._session.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.token_hash == token_hash)
        )
        row = result.first()
        return (row[0], row[1]) if row is not None else None

    async def delete_session_by_hash(self, token_hash: str) -> None:
        """Delete the session stored under this token hash, if any."""
        await self._session.execute(delete(UserSession).where(UserSession.token_hash == token_hash))

    async def delete_user_sessions(self, user_id: int, keep_session_id: int | None = None) -> None:
        """Revoke every session of an account, except `keep_session_id`."""
        statement = delete(UserSession).where(UserSession.user_id == user_id)
        if keep_session_id is not None:
            statement = statement.where(UserSession.id != keep_session_id)
        await self._session.execute(statement)

    async def delete_expired_sessions(self, now: datetime, idle_limit: datetime) -> None:
        """Delete the sessions past their absolute expiry or idle for longer than allowed.

        `idle_limit` is `now` minus the idle duration: a session last seen before it is dead.
        """
        await self._session.execute(
            delete(UserSession).where(
                (UserSession.expires_at <= now) | (UserSession.last_seen_at <= idle_limit)
            )
        )

    # --- password reset tokens ---

    async def add_reset_token(self, token: PasswordResetToken) -> None:
        """Stage a new reset token."""
        self._session.add(token)
        await self._session.flush()

    async def get_reset_token(self, token_hash: str) -> PasswordResetToken | None:
        """The reset token stored under this hash, used or not."""
        result = await self._session.execute(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def claim_reset_token(self, token_id: int, now: datetime) -> bool:
        """Mark a reset token as used if it is not yet: True for the one caller that wins."""
        result = await self._session.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.id == token_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=now)
        )
        return bool(result.rowcount)  # type: ignore[attr-defined]

    async def delete_unused_reset_tokens(self, user_id: int) -> None:
        """Invalidate the reset tokens of an account that were never used."""
        await self._session.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None)
            )
        )

    # --- login throttle ---

    async def get_throttle_lock(self, key: str) -> datetime | None:
        """Until when this normalized email is locked, if it is."""
        result = await self._session.execute(
            select(LoginThrottle.locked_until).where(LoginThrottle.key == key)
        )
        return result.scalar_one_or_none()

    async def count_attempt(
        self,
        key: str,
        now: datetime,
        window: timedelta,
        lockout: timedelta,
        max_failures: int,
    ) -> bool:
        """Count one login attempt for `key` in a single atomic statement.

        Stale counters (window and lock both over) are deleted first, in the same short write.
        Then one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` increments the counter, or
        restarts it when its window is over, and sets the lock when it reaches `max_failures`:
        concurrent attempts are serialized by SQLite and none is lost. A key that is already
        locked is left untouched. Returns False if the key was locked (nothing was counted).
        """
        await self.delete_stale_throttles(now - window, now)
        window_over = LoginThrottle.window_started_at <= now - window
        lock_until = literal(now + lockout, UtcDateTime())
        insert = sqlite_insert(LoginThrottle).values(
            key=key, failure_count=1, window_started_at=now, locked_until=None
        )
        statement = insert.on_conflict_do_update(
            index_elements=[LoginThrottle.key],
            set_={
                "failure_count": case((window_over, 1), else_=LoginThrottle.failure_count + 1),
                "window_started_at": case(
                    (window_over, literal(now, UtcDateTime())),
                    else_=LoginThrottle.window_started_at,
                ),
                "locked_until": case(
                    (
                        and_(not_(window_over), LoginThrottle.failure_count + 1 >= max_failures),
                        lock_until,
                    ),
                    else_=None,
                ),
            },
            where=or_(LoginThrottle.locked_until.is_(None), LoginThrottle.locked_until <= now),
        ).returning(LoginThrottle.failure_count)
        counted = (await self._session.execute(statement)).first()
        return counted is not None

    async def delete_throttle(self, key: str) -> None:
        """Forget the failures of this normalized email."""
        await self._session.execute(delete(LoginThrottle).where(LoginThrottle.key == key))

    async def delete_stale_throttles(self, window_limit: datetime, now: datetime) -> None:
        """Delete the counters whose window ended and that are not locked any more."""
        await self._session.execute(
            delete(LoginThrottle).where(
                LoginThrottle.window_started_at <= window_limit,
                (LoginThrottle.locked_until.is_(None)) | (LoginThrottle.locked_until <= now),
            )
        )
