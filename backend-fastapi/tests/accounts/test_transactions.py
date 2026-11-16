"""No transaction and no pooled connection stays open while an account request hashes.

SQLite has one writer: a write transaction held while Argon2 runs (or while a request waits up
to ten seconds for a hashing slot) fails every other writer with "database is locked". A
connection held by a read drains the pool (size 5, overflow 10) and every other account
request then times out waiting for one. Each test parks a request inside the hash, then checks
that a second connection can write and that the pool has nothing checked out.
"""

import asyncio
import sqlite3
import threading
from collections.abc import Callable, Coroutine, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.accounts.models import Role
from app.accounts.passwords import PasswordHasher, get_password_hasher
from app.accounts.repository import AccountRepository
from app.accounts.service import AccountService
from app.core.config import settings
from app.core.database import Database
from app.main import app
from tests.accounts.conftest import (
    NEW_PASSWORD,
    PASSWORD,
    FakeClock,
    MakeAccount,
    cheap_password_hash,
    csrf,
    sign_in,
)

REGISTRATION = {
    "email": "newcomer@example.org",
    "password": PASSWORD,
    "display_name": "New Person",
    "affiliation": "Somewhere",
    "accept_license": True,
}


class GatedHash:
    """Real (cheap) Argon2id, except that the gated step waits until the test lets it go."""

    def __init__(self) -> None:
        self._inner = cheap_password_hash()
        self.gate: str | None = None
        self.started = threading.Event()
        self.release = threading.Event()

    def _wait(self, step: str) -> None:
        if self.gate == step:
            self.started.set()
            self.release.wait(timeout=10)

    def hash(self, password: str) -> str:
        self._wait("hash")
        return self._inner.hash(password)

    def verify_and_update(self, password: str, password_hash: str) -> tuple[bool, str | None]:
        self._wait("verify")
        return self._inner.verify_and_update(password, password_hash)


@pytest.fixture
def gated() -> Iterator[GatedHash]:
    stub = GatedHash()
    app.dependency_overrides[get_password_hasher] = lambda: PasswordHasher(stub)  # type: ignore[arg-type]
    yield stub
    stub.release.set()


def write_with_a_short_timeout() -> None:
    """A second writer: it fails with "database is locked" if a transaction holds the lock."""
    connection = sqlite3.connect(Path(settings.STAGING_DB_PATH), timeout=0.2)
    try:
        with connection:
            connection.execute(
                "INSERT INTO saved_queries (title, query_text, category, author_name,"
                " created_at, updated_at) VALUES ('t', 'q', 'c', 'a', 'now', 'now')"
            )
    finally:
        connection.close()


async def check_while_hash_is_pending(
    gated: GatedHash,
    database: Database,
    step: str,
    request: Callable[[], Coroutine[Any, Any, httpx.Response]],
) -> httpx.Response:
    """Park `request` inside the gated hashing step, check the database, then let it finish."""
    gated.gate = step
    pending = asyncio.create_task(request())
    assert await asyncio.to_thread(gated.started.wait, 5), "the request never reached the hash"
    try:
        write_with_a_short_timeout()
        assert database.engine.pool.checkedout() == 0  # type: ignore[attr-defined]
    finally:
        gated.release.set()
    return await pending


async def test_rm_cpt_01_a_password_change_holds_no_write_lock_while_it_hashes(
    client: httpx.AsyncClient, database: Database, gated: GatedHash, make_account: MakeAccount
) -> None:
    await make_account()
    csrf_token = await sign_in(client)

    response = await check_while_hash_is_pending(
        gated,
        database,
        "hash",
        lambda: client.post(
            "/auth/password",
            json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
            headers=csrf(csrf_token),
        ),
    )

    assert response.status_code == 204


async def test_rm_cpt_01_a_login_holds_no_connection_while_it_verifies(
    client: httpx.AsyncClient, database: Database, gated: GatedHash, make_account: MakeAccount
) -> None:
    await make_account()

    response = await check_while_hash_is_pending(
        gated,
        database,
        "verify",
        lambda: client.post(
            "/auth/login", json={"email": "member@example.org", "password": PASSWORD}
        ),
    )

    assert response.status_code == 200


async def test_rm_cpt_02_a_registration_holds_no_transaction_while_it_hashes(
    client: httpx.AsyncClient, database: Database, gated: GatedHash, registration_open: None
) -> None:
    response = await check_while_hash_is_pending(
        gated, database, "hash", lambda: client.post("/auth/register", json=REGISTRATION)
    )

    assert response.status_code == 202


async def test_rm_cpt_02_a_reset_holds_no_transaction_while_it_hashes(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    database: Database,
    gated: GatedHash,
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    admin_csrf = await sign_in(client, "admin@example.org")
    issued = await client.post(f"/admin/users/{member.id}/password-reset", headers=csrf(admin_csrf))
    token = issued.json()["token"]

    response = await check_while_hash_is_pending(
        gated,
        database,
        "hash",
        lambda: new_client().post(
            "/auth/password-reset", json={"token": token, "new_password": NEW_PASSWORD}
        ),
    )

    assert response.status_code == 204


async def test_rm_cpt_02_the_first_admin_command_holds_no_transaction_while_it_hashes(
    database: Database, gated: GatedHash, clock: FakeClock
) -> None:
    async def create() -> httpx.Response:
        async with database.session_maker() as session:
            service = AccountService(AccountRepository(session), PasswordHasher(gated), clock)  # type: ignore[arg-type]
            await service.create_admin("root@example.org", "Root", "I3S", PASSWORD)
        return httpx.Response(204)

    response = await check_while_hash_is_pending(gated, database, "hash", create)

    assert response.status_code == 204
