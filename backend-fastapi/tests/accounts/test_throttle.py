"""Login throttle: five failures in fifteen minutes lock the email for fifteen minutes."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from sqlalchemy import select

from app.accounts.models import LoginThrottle, UserStatus
from app.accounts.passwords import HashingSlot, PasswordHasher, get_password_hasher
from app.accounts.repository import AccountRepository
from app.accounts.throttle import LoginThrottler
from app.core.database import Database
from app.main import app
from app.shared.domain_errors import TooManyAttempts
from tests.support.accounts import PASSWORD, FakeClock, MakeAccount, cheap_password_hash, error_code

WRONG = "this is not the password"


async def attempt(client: httpx.AsyncClient, email: str, password: str) -> httpx.Response:
    return await client.post("/auth/login", json={"email": email, "password": password})


async def fail_times(client: httpx.AsyncClient, email: str, count: int) -> None:
    for _ in range(count):
        assert (await attempt(client, email, WRONG)).status_code == 401


async def test_rm_cpt_01_five_failures_lock_the_email_with_retry_after(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    await fail_times(client, "member@example.org", 5)

    locked = await attempt(client, "member@example.org", PASSWORD)

    assert locked.status_code == 429
    assert error_code(locked) == "too_many_attempts"
    assert locked.headers["retry-after"] == str(15 * 60)


async def test_rm_cpt_01_four_failures_do_not_lock_the_email(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    await fail_times(client, "member@example.org", 4)

    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 200


async def test_rm_cpt_01_an_unknown_email_is_locked_the_same_way(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await fail_times(client, "nobody@example.org", 5)

    locked = await attempt(client, "nobody@example.org", WRONG)

    assert locked.status_code == 429
    assert error_code(locked) == "too_many_attempts"


async def test_rm_cpt_01_a_correct_password_resets_the_counter(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    await fail_times(client, "member@example.org", 4)
    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 200

    await fail_times(client, "member@example.org", 4)

    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 200


async def test_rm_cpt_01_the_lock_ends_after_fifteen_minutes(
    client: httpx.AsyncClient, clock: FakeClock, make_account: MakeAccount
) -> None:
    await make_account()
    await fail_times(client, "member@example.org", 5)

    clock.advance(minutes=14, seconds=59)
    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 429
    clock.advance(seconds=2)

    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 200


async def test_rm_cpt_01_failures_older_than_the_window_are_forgotten(
    client: httpx.AsyncClient, clock: FakeClock, make_account: MakeAccount
) -> None:
    await make_account()
    await fail_times(client, "member@example.org", 4)
    clock.advance(minutes=16)

    await fail_times(client, "member@example.org", 4)

    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 200


async def test_rm_cpt_01_a_correct_password_resets_the_counter_of_a_pending_account(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    await make_account(status=UserStatus.PENDING)
    await fail_times(client, "member@example.org", 3)

    assert (await attempt(client, "member@example.org", PASSWORD)).status_code == 403

    async with database.session_maker() as session:
        assert (await session.execute(select(LoginThrottle))).first() is None


class CountingHasher(PasswordHasher):
    """A hasher that counts the hashing slots it hands out."""

    def __init__(self) -> None:
        super().__init__(cheap_password_hash())
        self.slots_taken = 0

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[HashingSlot]:
        self.slots_taken += 1
        async with super().slot() as hashing:
            yield hashing


async def test_rm_cpt_01_the_lock_is_checked_before_any_password_hashing(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    counting = CountingHasher()
    app.dependency_overrides[get_password_hasher] = lambda: counting
    await make_account()
    await fail_times(client, "member@example.org", 5)
    slots_before = counting.slots_taken

    locked = await attempt(client, "member@example.org", PASSWORD)

    assert locked.status_code == 429
    assert counting.slots_taken == slots_before


async def reserve(database: Database, clock: FakeClock, key: str) -> bool:
    """One reservation on a session of its own; True if the attempt was allowed."""
    async with database.session_maker() as session:
        try:
            await LoginThrottler(AccountRepository(session), clock).reserve_attempt(key)
        except TooManyAttempts:
            return False
        return True


async def stored_counters(database: Database) -> dict[str, tuple[int, bool]]:
    """The stored counters: failure count and whether the key is locked."""
    async with database.session_maker() as session:
        rows = (await session.execute(select(LoginThrottle))).scalars()
        return {row.key: (row.failure_count, row.locked_until is not None) for row in rows}


async def test_rm_cpt_01_parallel_attempts_allow_exactly_five_per_key_and_count_them_all(
    database: Database, clock: FakeClock
) -> None:
    """Twenty simultaneous attempts on each of ten keys, all interleaved at once.

    One key alone can pass by luck with a counter that reads, adds one and writes back; two
    hundred interleaved attempts over ten keys cannot, so every key must be exact.
    """
    keys = [f"race{number}@example.org" for number in range(10)]

    outcomes = await asyncio.gather(
        *(reserve(database, clock, key) for _ in range(20) for key in keys)
    )

    assert outcomes.count(True) == 5 * len(keys)
    assert await stored_counters(database) == {key: (5, True) for key in keys}


async def test_rm_cpt_01_parallel_attempts_on_different_keys_do_not_disturb_each_other(
    database: Database, clock: FakeClock
) -> None:
    keys = [f"user{number}@example.org" for number in range(4)]

    outcomes = await asyncio.gather(*(reserve(database, clock, key) for key in keys * 3))

    assert all(outcomes)
    assert await stored_counters(database) == {key: (3, False) for key in keys}


async def test_rm_acc_02_expired_counters_are_purged_at_each_reservation(
    database: Database, clock: FakeClock
) -> None:
    for _ in range(2):
        await reserve(database, clock, "old@example.org")  # window over after 15 minutes
    clock.advance(minutes=10)
    for _ in range(5):
        await reserve(database, clock, "locked@example.org")  # locked until minute 25
    clock.advance(minutes=6)  # minute 16: the first counter is expired, the lock is not

    await reserve(database, clock, "new@example.org")

    assert set(await stored_counters(database)) == {"locked@example.org", "new@example.org"}


async def test_rm_acc_02_a_lock_that_ended_is_purged_too(
    database: Database, clock: FakeClock
) -> None:
    for _ in range(5):
        await reserve(database, clock, "locked@example.org")
    clock.advance(minutes=16)

    await reserve(database, clock, "new@example.org")

    assert set(await stored_counters(database)) == {"new@example.org"}
