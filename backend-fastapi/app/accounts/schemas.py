"""Pydantic request and response models of the accounts domain.

No response ever carries a password hash or a token hash. The email is shown to admins and to
the account's owner only.
"""

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.accounts.models import Role, UserStatus
from app.accounts.passwords import MAX_PASSWORD_INPUT_LENGTH

MAX_EMAIL_LENGTH = 254
MAX_NAME_LENGTH = 200
MAX_ADMIN_PAGE_SIZE = 100
DEFAULT_ADMIN_PAGE_SIZE = 50
# A deliberately simple check: something@something.tld, no whitespace. The address is really
# verified by the admin who activates the account (RM-CPT-02).
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    """Trim and lowercase an email, and check its shape."""
    email = value.strip().lower()
    if len(email) > MAX_EMAIL_LENGTH or not _EMAIL_PATTERN.fullmatch(email):
        raise ValueError("not a valid email address")
    return email


Email = Annotated[str, AfterValidator(_normalize_email)]
# The password policy is a business rule (checked by the service, with a stable error code);
# the schema only bounds the size of the input.
PasswordInput = Annotated[str, Field(min_length=1, max_length=MAX_PASSWORD_INPUT_LENGTH)]
PersonText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_NAME_LENGTH)
]
ResetTokenInput = Annotated[str, Field(min_length=1, max_length=256)]


class RegisterRequest(BaseModel):
    """Sign-up form (RM-CPT-02). The licence must be accepted (RM-LIC-02)."""

    email: Email
    password: PasswordInput
    display_name: PersonText
    affiliation: PersonText
    accept_license: Literal[True]


class LoginRequest(BaseModel):
    """Credentials of a login."""

    email: Email
    password: PasswordInput


class PasswordResetRequest(BaseModel):
    """Use of the token that an admin handed over (RM-CPT-02)."""

    token: ResetTokenInput
    new_password: PasswordInput


class PasswordChangeRequest(BaseModel):
    """Password change of the logged-in account."""

    current_password: PasswordInput
    new_password: PasswordInput


class RoleUpdate(BaseModel):
    """New role of an account."""

    role: Role


class UserOut(BaseModel):
    """An account, as shown to admins and to its owner."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    display_name: str
    affiliation: str
    role: Role
    status: UserStatus
    created_at: datetime
    activated_at: datetime | None


class SessionOut(BaseModel):
    """The logged-in account and the CSRF token to send in `X-CSRF-Token` on unsafe requests."""

    user: UserOut
    csrf_token: str


class UserPage(BaseModel):
    """One page of the administration list of accounts."""

    items: list[UserOut]
    total: int


class MessageOut(BaseModel):
    """A short, fixed message."""

    message: str


class ResetTokenOut(BaseModel):
    """A password reset token, returned once: only its hash is stored."""

    token: str
    expires_at: datetime
