"""SQLAlchemy models of the accounts domain (revision `0002_accounts`).

Roles and statuses are enumerations in code and codes in the database. Every datetime is
timezone-aware UTC (see `app.core.database.UtcDateTime`).
"""

from datetime import datetime
from enum import Enum

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UtcDateTime


class Role(str, Enum):  # noqa: UP042 - Ruff still targets py310
    """What an account may do (docs/regles-metier.md, section 1)."""

    CONTRIBUTOR = "contributor"
    ADMIN = "admin"


class UserStatus(str, Enum):  # noqa: UP042
    """Life cycle of an account (RM-CPT-02, RM-CPT-03)."""

    PENDING = "pending"
    ACTIVE = "active"
    DEACTIVATED = "deactivated"


def _codes(enumeration: type[Enum]) -> list[str]:
    """Store the enumeration values (`pending`), not the member names (`PENDING`)."""
    return [member.value for member in enumeration]


class User(Base):
    """A local account (RM-CPT-01). The email is trimmed and lowercased before it is stored."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    display_name: Mapped[str] = mapped_column(String(200))
    affiliation: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(
        SqlEnum(Role, native_enum=False, length=20, values_callable=_codes)
    )
    status: Mapped[UserStatus] = mapped_column(
        SqlEnum(UserStatus, native_enum=False, length=20, values_callable=_codes)
    )
    # RM-LIC-02 (proposed): the contributor accepts the licence of the contributions at sign-up.
    license_accepted_at: Mapped[datetime] = mapped_column(UtcDateTime)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    activated_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    activated_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )


class UserSession(Base):
    """A server-side session. The cookie holds a random value; only its SHA-256 is stored."""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    last_seen_at: Mapped[datetime] = mapped_column(UtcDateTime)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime)


class PasswordResetToken(Base):
    """A single-use password reset token issued by an admin (RM-CPT-02). Only its hash is stored."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)


class LoginThrottle(Base):
    """Failed-login counter of one normalized email, kept whether or not an account exists."""

    __tablename__ = "login_throttle"

    key: Mapped[str] = mapped_column(String(254), primary_key=True)
    failure_count: Mapped[int] = mapped_column(Integer)
    window_started_at: Mapped[datetime] = mapped_column(UtcDateTime)
    locked_until: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
