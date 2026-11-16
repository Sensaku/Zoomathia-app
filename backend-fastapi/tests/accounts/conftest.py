"""Fixtures of the accounts tests: a controllable clock, a cheap password hasher, helpers.

The hasher keeps Argon2id but with the smallest parameters, so that hundreds of hashes stay
fast; the tests of the real parameters build their own hasher.
"""

from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pytest
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import select

from app.accounts.models import Role, User, UserSession, UserStatus
from app.accounts.passwords import PasswordHasher, get_password_hasher
from app.core.clock import get_clock
from app.core.config import settings
from app.core.database import Database
from app.main import app

PASSWORD = "correct horse battery"
NEW_PASSWORD = "another long passphrase"
SESSION_COOKIE = "zoomathia_session"

MakeAccount = Callable[..., Awaitable[User]]


class FakeClock:
    """A clock that only moves when the test says so."""

    def __init__(self) -> None:
        self.now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


def cheap_password_hash() -> PasswordHash:
    """Argon2id with the smallest allowed cost."""
    return PasswordHash((Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),))


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def hasher() -> PasswordHasher:
    return PasswordHasher(cheap_password_hash())


@pytest.fixture(autouse=True)
def account_dependencies(clock: FakeClock, hasher: PasswordHasher) -> Iterator[None]:
    """Replace the clock and the hasher of the application for the duration of a test."""
    app.dependency_overrides[get_clock] = lambda: clock
    app.dependency_overrides[get_password_hasher] = lambda: hasher
    yield
    app.dependency_overrides.pop(get_clock, None)
    app.dependency_overrides.pop(get_password_hasher, None)


@pytest.fixture
def registration_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", True)


@pytest.fixture
def make_account(database: Database, hasher: PasswordHasher, clock: FakeClock) -> MakeAccount:
    """Insert an account directly, without going through registration."""

    async def make(
        email: str = "member@example.org",
        password: str = PASSWORD,
        role: Role = Role.CONTRIBUTOR,
        status: UserStatus = UserStatus.ACTIVE,
    ) -> User:
        user = User(
            email=email,
            display_name="Test Person",
            affiliation="Test Lab",
            password_hash=await hasher.hash(password),
            role=role,
            status=status,
            license_accepted_at=clock(),
            created_at=clock(),
        )
        async with database.session_maker() as session:
            session.add(user)
            await session.commit()
        return user

    return make


@pytest.fixture
async def new_client(database: Database) -> AsyncIterator[Callable[[], httpx.AsyncClient]]:
    """Make more HTTP clients, each with its own cookie jar (another browser)."""
    clients: list[httpx.AsyncClient] = []

    def make() -> httpx.AsyncClient:
        http_client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://test"
        )
        clients.append(http_client)
        return http_client

    yield make
    for http_client in clients:
        await http_client.aclose()


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


async def stored_sessions(database: Database) -> list[UserSession]:
    async with database.session_maker() as session:
        return list((await session.execute(select(UserSession))).scalars())


async def stored_user(database: Database, email: str) -> User:
    async with database.session_maker() as session:
        return (await session.execute(select(User).where(User.email == email))).scalar_one()


def error_code(response: httpx.Response) -> Any:
    """The stable `code` of an error response."""
    return response.json()["code"]
