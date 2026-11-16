"""Password policy and hashing (RM-CPT-01).

Hashing is Argon2id through pwdlib. An Argon2id hash uses about 64 MiB while it is computed,
so unbounded concurrency would let a burst of logins exhaust the memory of the server:
`PasswordHasher` runs the hashing off the event loop, under a per-worker semaphore, and a
request that waits too long for it gets a 429 `server_busy` (*proposed* values,
docs/security.md).

A caller that needs several hashing steps (verify, then hash a new password) takes the slot
once with `PasswordHasher.slot()`. It must hold no write transaction while it waits for the
slot or hashes: SQLite has one writer, and a held write lock would fail every other writer.
"""

import asyncio
import unicodedata
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from pwdlib import PasswordHash

from app.shared.domain_errors import TooManyAttempts, Unprocessable

# *Proposed* (docs/security.md): at most four hashes at a time per worker, a request waits at
# most ten seconds for its turn.
MAX_CONCURRENT_HASHES = 4
MAX_HASH_WAIT_SECONDS = 10.0
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
# Bound of the raw input of every password field, checked before any normalization work.
MAX_PASSWORD_INPUT_LENGTH = 1024

_DUMMY_PASSWORD = "a password that no account holds"  # noqa: S105


def normalize_password(password: str) -> str:
    """The NFKC form of `password`, which is what gets hashed and verified.

    Without it, the same visible password typed on two keyboards (composed or decomposed
    accents, full-width letters) would not match.
    """
    return unicodedata.normalize("NFKC", password)


def check_password_policy(password: str, email: str) -> None:
    """Raise `Unprocessable` (422, `invalid_password`) unless `password` follows the policy.

    *Proposed* policy: 12 to 128 characters after normalization, no composition rule, and
    not equal to the account's email (case-insensitive). Runs before any hashing, so an
    over-long value never costs an Argon2 computation.
    """
    normalized = normalize_password(password)
    if not MIN_PASSWORD_LENGTH <= len(normalized) <= MAX_PASSWORD_LENGTH:
        raise Unprocessable(
            "invalid_password",
            f"The password must have {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters.",
        )
    if normalized.casefold() == normalize_password(email).casefold():
        raise Unprocessable("invalid_password", "The password must not be the email address.")


class HashingSlot:
    """A held hashing slot (see `PasswordHasher.slot`): its methods never wait for another."""

    def __init__(self, owner: "PasswordHasher") -> None:
        self._owner = owner

    async def hash(self, password: str) -> str:
        """Hash `password` (normalized first)."""
        normalized = normalize_password(password)
        return await asyncio.to_thread(self._owner.password_hash.hash, normalized)

    async def verify(self, password: str, password_hash: str) -> tuple[bool, str | None]:
        """Check `password` against `password_hash`.

        Returns whether it matches and, when the hash parameters are outdated, the
        replacement hash to store (pwdlib's `verify_and_update`).
        """
        normalized = normalize_password(password)
        return await asyncio.to_thread(
            self._owner.password_hash.verify_and_update, normalized, password_hash
        )

    async def verify_unknown_account(self, password: str) -> None:
        """Spend the time of a real verification, for a login with an unknown email.

        Without it, an answer faster than for an existing account would reveal which emails
        have an account.
        """
        if self._owner.dummy_hash is None:
            self._owner.dummy_hash = await self.hash(_DUMMY_PASSWORD)
        await self.verify(password, self._owner.dummy_hash)


class PasswordHasher:
    """Argon2id hashing and verification, bounded in concurrency and off the event loop."""

    def __init__(
        self,
        password_hash: PasswordHash | None = None,
        max_concurrent: int = MAX_CONCURRENT_HASHES,
        max_wait_seconds: float = MAX_HASH_WAIT_SECONDS,
    ) -> None:
        self.password_hash = password_hash or PasswordHash.recommended()
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self.max_wait_seconds = max_wait_seconds
        self.dummy_hash: str | None = None

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[HashingSlot]:
        """Hold one of the concurrent hashing places for the duration of the block.

        Waits at most `max_wait_seconds`, then raises `TooManyAttempts` with the code
        `server_busy` (429, `Retry-After`): the server is saturated, which is not the
        caller's fault and must never be counted as a failed login.
        """
        try:
            await asyncio.wait_for(self._semaphore.acquire(), self.max_wait_seconds)
        except asyncio.TimeoutError:
            raise TooManyAttempts(
                "server_busy",
                "The server is busy: try again in a few seconds.",
                retry_after=int(self.max_wait_seconds),
            ) from None
        try:
            yield HashingSlot(self)
        finally:
            self._semaphore.release()

    async def hash(self, password: str) -> str:
        """Hash `password` in a slot of its own."""
        async with self.slot() as hashing:
            return await hashing.hash(password)

    async def verify(self, password: str, password_hash: str) -> tuple[bool, str | None]:
        """Verify `password` in a slot of its own (see `HashingSlot.verify`)."""
        async with self.slot() as hashing:
            return await hashing.verify(password, password_hash)


@lru_cache(maxsize=1)
def get_password_hasher() -> PasswordHasher:
    """FastAPI dependency: the hasher of this worker (one semaphore per process)."""
    return PasswordHasher()
