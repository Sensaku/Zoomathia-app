"""Password policy, hashing and its concurrency bound (RM-CPT-01)."""

import asyncio
import threading
from typing import Any

import httpx
import pytest
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import select

from app.accounts.models import LoginThrottle, User
from app.accounts.passwords import PasswordHasher, check_password_policy, get_password_hasher
from app.core.database import Database
from app.main import app
from app.shared.domain_errors import TooManyAttempts, Unprocessable
from tests.accounts.conftest import (
    PASSWORD,
    MakeAccount,
    cheap_password_hash,
    error_code,
    sign_in,
)

EMAIL = "new.person@example.org"


def registration(password: str, email: str = EMAIL) -> dict[str, object]:
    return {
        "email": email,
        "password": password,
        "display_name": "New Person",
        "affiliation": "Somewhere",
        "accept_license": True,
    }


async def test_rm_cpt_01_a_password_of_eleven_characters_is_refused(
    client: httpx.AsyncClient, registration_open: None
) -> None:
    response = await client.post("/auth/register", json=registration("a" * 11))

    assert response.status_code == 422
    assert error_code(response) == "invalid_password"


async def test_rm_cpt_01_passwords_of_twelve_and_of_128_characters_are_accepted(
    client: httpx.AsyncClient, registration_open: None
) -> None:
    short = await client.post("/auth/register", json=registration("a" * 12, "a@example.org"))
    long = await client.post("/auth/register", json=registration("a" * 128, "b@example.org"))

    assert (short.status_code, long.status_code) == (202, 202)


async def test_rm_cpt_01_a_password_of_129_characters_is_refused(
    client: httpx.AsyncClient, registration_open: None
) -> None:
    response = await client.post("/auth/register", json=registration("a" * 129))

    assert response.status_code == 422
    assert error_code(response) == "invalid_password"


async def test_rm_cpt_01_a_password_equal_to_the_email_is_refused_whatever_its_case(
    client: httpx.AsyncClient, registration_open: None
) -> None:
    response = await client.post("/auth/register", json=registration("New.Person@EXAMPLE.org"))

    assert response.status_code == 422
    assert error_code(response) == "invalid_password"


def test_rm_cpt_01_the_length_is_counted_after_unicode_normalization() -> None:
    twelve_code_points = "e\u0301" * 6  # six characters once normalized

    with pytest.raises(Unprocessable):
        check_password_policy(twelve_code_points, EMAIL)


async def test_rm_cpt_01_the_same_password_in_another_unicode_form_still_matches() -> None:
    hasher = PasswordHasher(cheap_password_hash())
    stored = await hasher.hash("caf\u00e9 au lait chaud")

    matches, _ = await hasher.verify("cafe\u0301 au lait chaud", stored)

    assert matches


async def test_rm_cpt_01_the_recommended_hash_is_argon2id() -> None:
    stored = await PasswordHasher().hash(PASSWORD)

    assert stored.startswith("$argon2id$")


async def test_rm_cpt_01_an_outdated_hash_is_replaced_at_login(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    await make_account()
    old_parameters = PasswordHash((Argon2Hasher(time_cost=2, memory_cost=16, parallelism=1),))
    async with database.session_maker() as session:
        user = (await session.execute(select(User))).scalar_one()
        user.password_hash = old_parameters.hash(PASSWORD)
        outdated = user.password_hash
        await session.commit()

    await sign_in(client)

    async with database.session_maker() as session:
        refreshed = (await session.execute(select(User))).scalar_one()
    assert refreshed.password_hash != outdated
    assert "t=1,p=1" in refreshed.password_hash and "m=8" in refreshed.password_hash


class BlockingHash:
    """Stands in for pwdlib: a hash starts, then waits until the test lets it finish."""

    def __init__(self) -> None:
        self.started = threading.Event()
        self.release = threading.Event()

    def hash(self, password: str) -> str:
        self.started.set()
        self.release.wait(timeout=5)
        return "$argon2id$stub"

    def verify_and_update(self, password: str, password_hash: str) -> tuple[bool, str | None]:
        self.started.set()
        self.release.wait(timeout=5)
        return False, None


async def start_blocked_hash(blocking: BlockingHash, hasher: PasswordHasher) -> asyncio.Task[Any]:
    """Start a hash that holds the only slot of `hasher`, and wait until it is running."""
    task = asyncio.create_task(hasher.hash(PASSWORD))
    assert await asyncio.to_thread(blocking.started.wait, 5)
    return task


async def test_rm_cpt_01_a_request_that_waits_too_long_for_a_hash_slot_gets_429() -> None:
    blocking = BlockingHash()
    hasher = PasswordHasher(blocking, max_concurrent=1, max_wait_seconds=0.05)  # type: ignore[arg-type]
    running = await start_blocked_hash(blocking, hasher)

    with pytest.raises(TooManyAttempts) as raised:
        await hasher.hash(PASSWORD)

    blocking.release.set()
    await running
    assert (raised.value.status_code, raised.value.code, raised.value.retry_after) == (
        429,
        "server_busy",
        1,
    )


async def test_rm_cpt_01_a_saturated_login_answers_server_busy_and_counts_no_failure(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    blocking = BlockingHash()
    saturated = PasswordHasher(blocking, max_concurrent=1, max_wait_seconds=0.05)  # type: ignore[arg-type]
    app.dependency_overrides[get_password_hasher] = lambda: saturated
    await make_account()
    running = await start_blocked_hash(blocking, saturated)

    responses = [
        await client.post("/auth/login", json={"email": "member@example.org", "password": PASSWORD})
        for _ in range(6)  # more than the five failures that would lock the email
    ]

    blocking.release.set()
    await running
    assert {response.status_code for response in responses} == {429}
    assert {error_code(response) for response in responses} == {"server_busy"}
    assert {response.headers["retry-after"] for response in responses} == {"1"}
    async with database.session_maker() as session:
        assert (await session.execute(select(LoginThrottle))).first() is None
