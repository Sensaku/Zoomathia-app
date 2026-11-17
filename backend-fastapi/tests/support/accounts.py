"""Helpers for the tests that need accounts: a controllable clock, a cheap hasher, sign-in.

The hasher keeps Argon2id but with the smallest parameters, so that hundreds of hashes stay
fast; the tests of the real parameters build their own hasher. The fixtures that use these
helpers are in `tests/conftest.py`.
"""

from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.accounts.models import User

PASSWORD = "correct horse battery"

MakeAccount = Callable[..., Awaitable[User]]


class FakeClock:
    """A clock that only moves when the test says so."""

    def __init__(self) -> None:
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


class Member(httpx.AsyncClient):
    """An HTTP client signed in as an account: it sends its CSRF token on every request.

    `user` is the account, so a test can compare ids. Delete the `X-CSRF-Token` header to
    send an unsafe request without it.
    """

    user: User
    csrf_token: str


def cheap_password_hash() -> PasswordHash:
    """Argon2id with the smallest allowed cost."""
    return PasswordHash((Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),))


async def sign_in(
    client: httpx.AsyncClient, email: str = "member@example.org", password: str = PASSWORD
) -> str:
    """Log in, check that it worked, and return the CSRF token."""
    response = await client.post("/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    csrf_token: str = response.json()["csrf_token"]
    return csrf_token


def csrf(token: str) -> dict[str, str]:
    """The header that an unsafe request must carry."""
    return {"X-CSRF-Token": token}


def error_code(response: httpx.Response) -> Any:
    """The stable `code` of an error response."""
    return response.json()["code"]
