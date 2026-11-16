"""Login throttle: five failures in fifteen minutes lock an email for fifteen minutes.

*Proposed* values (docs/security.md). The key is the normalized email, kept whether or not an
account exists, so the answer never reveals which emails have one. An attempt is counted
before the password is verified and the counter is cleared when the password is right: a
burst of parallel guesses is therefore counted even while the slow verifications are still
running. The count itself is one atomic SQL statement (`AccountRepository.count_attempt`), so
concurrent attempts never lose an update.
"""

import logging
import math
from datetime import datetime, timedelta

from app.accounts.repository import AccountRepository
from app.core.clock import Clock
from app.shared.domain_errors import TooManyAttempts

logger = logging.getLogger(__name__)

MAX_FAILURES = 5
WINDOW = timedelta(minutes=15)
LOCKOUT = timedelta(minutes=15)


class LoginThrottler:
    """Counts the login attempts of each email and locks it after too many failures."""

    def __init__(self, repository: AccountRepository, clock: Clock) -> None:
        self._repository = repository
        self._clock = clock

    async def ensure_not_locked(self, key: str) -> None:
        """Raise `TooManyAttempts` while `key` is locked; count nothing.

        A cheap read made before a hashing slot is taken, so that a locked email never
        occupies one. It ends its read transaction, so no connection stays checked out.
        """
        locked_until = await self._repository.get_throttle_lock(key)
        await self._repository.commit()
        now = self._clock()
        if locked_until is not None and locked_until > now:
            raise self._locked(locked_until)

    async def reserve_attempt(self, key: str) -> None:
        """Count one attempt for `key`, or raise `TooManyAttempts` while it is locked.

        Commits the counter before returning (a short write), so that it survives the error
        that follows a failed verification. The fifth attempt of a window is still
        evaluated, and locks the key unless the password is right (`clear`). Counters whose
        window and lock are both over are deleted in the same write, so the table stays
        bounded by the attempts of the last fifteen minutes.
        """
        now = self._clock()
        counted = await self._repository.count_attempt(key, now, WINDOW, LOCKOUT, MAX_FAILURES)
        if counted:
            await self._repository.commit()
            return
        locked_until = await self._repository.get_throttle_lock(key)
        await self._repository.commit()
        raise self._locked(locked_until or now + LOCKOUT)

    async def clear(self, key: str) -> None:
        """Forget the failures of `key` (a correct password). The caller commits."""
        await self._repository.delete_throttle(key)

    def _locked(self, locked_until: datetime) -> TooManyAttempts:
        logger.warning("login refused: the key is locked")
        seconds = math.ceil((locked_until - self._clock()).total_seconds())
        return TooManyAttempts(
            "too_many_attempts", "Too many attempts: try again later.", retry_after=seconds
        )
