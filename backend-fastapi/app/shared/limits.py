"""Concurrency and size limits that protect the shared Corese (RM-ACC-02).

Heavy queries (free SPARQL, custom search and its export, competency questions, paragraph
searches by concept, and the creation and update of saved queries, which parse their text)
run under a concurrency limit so that they never starve reading and navigation.

A request that finds no free slot waits a short, bounded time for one
(`MAX_HEAVY_WAIT_SECONDS`), then is answered with 429. At most `MAX_HEAVY_WAITERS` requests
wait at once per worker and `MAX_HEAVY_WAITERS_PER_CLIENT` per client address; beyond that a
request is refused immediately. It is never an unbounded queue: Corese concurrency stays
capped by `MAX_HEAVY_TOTAL`, and a queue of heavy queries is exactly what would overload
Corese.

A slot is a `HeavySlot`. The SPARQL client keeps it, by detaching it from the request, until
Corese has actually answered a query that the caller stopped waiting for (timeout, closed
connection): Corese has no query timeout of its own, so the evaluation goes on and the slot
must keep counting it.

The counters live in the memory of one worker, so the total limit is per worker.
Behind a reverse proxy, `request.client.host` is the real client address only if the
server trusts the proxy's forwarded headers (`--forwarded-allow-ips`).
"""

import asyncio
from collections.abc import AsyncIterator, Callable

from fastapi import HTTPException, Request

MAX_HEAVY_PER_CLIENT = 2
MAX_HEAVY_TOTAL = 4
# RM-ACC-02: a request waits at most this long for a free slot before it gets a 429.
MAX_HEAVY_WAIT_SECONDS = 10.0
# Requests waiting for a slot, per worker. Each one only holds a parked coroutine.
MAX_HEAVY_WAITERS = 64
# Waiting places one client address can take (*proposed*): enough for a class of about 30
# behind one address, while one client can never take every waiting place of the worker.
MAX_HEAVY_WAITERS_PER_CLIENT = 32
MAX_CRITERIA = 30


class HeavySlot:
    """One heavy-query slot, handed out by `HeavyQueryLimiter.acquire`.

    The request that acquired it releases it with `release`, normally in a `finally`. A
    holder that has to keep the slot longer than the request calls `detach`.
    """

    def __init__(self, limiter: "HeavyQueryLimiter", client: str) -> None:
        self.client = client
        self._limiter = limiter
        self._released = False
        self._detached = False

    def release(self) -> None:
        """Give the slot back. Idempotent, and a no-op once the slot is detached."""
        if not self._detached:
            self._release_once()

    def detach(self) -> Callable[[], None]:
        """Take the slot away from the request and return the callable that releases it.

        Afterwards `release` does nothing, so the request ending (even by cancellation)
        no longer frees the slot. The returned callable is idempotent, and may be called
        again by `detach` callers: it is always the same one.
        """
        self._detached = True
        return self._release_once

    def _release_once(self) -> None:
        if not self._released:
            self._released = True
            self._limiter.release(self.client)


class HeavyQueryLimiter:
    """Counts the heavy requests in progress, in total and per client address.

    Everything runs on the event loop of the worker and never awaits between reading
    and changing a counter, so the counters need no lock.
    """

    def __init__(
        self,
        max_per_client: int = MAX_HEAVY_PER_CLIENT,
        max_total: int = MAX_HEAVY_TOTAL,
        max_waiters: int = MAX_HEAVY_WAITERS,
        max_waiters_per_client: int = MAX_HEAVY_WAITERS_PER_CLIENT,
    ) -> None:
        self.max_per_client = max_per_client
        self.max_total = max_total
        self.max_waiters = max_waiters
        self.max_waiters_per_client = max_waiters_per_client
        self._per_client: dict[str, int] = {}
        self._total = 0
        self._waiting = 0
        self._waiting_per_client: dict[str, int] = {}
        self._wakeups: set[asyncio.Future[None]] = set()

    def try_acquire(self, client: str) -> bool:
        """Take a slot for `client`; return False, taking nothing, if no slot is free."""
        if self._total >= self.max_total or self._per_client.get(client, 0) >= self.max_per_client:
            return False
        self._per_client[client] = self._per_client.get(client, 0) + 1
        self._total += 1
        return True

    def release(self, client: str) -> None:
        """Give back a slot taken by `try_acquire` for `client`, and wake the waiters."""
        remaining = self._per_client.get(client, 0) - 1
        if remaining > 0:
            self._per_client[client] = remaining
        else:
            self._per_client.pop(client, None)
        self._total = max(0, self._total - 1)
        self._wake_waiters()

    def _wake_waiters(self) -> None:
        # Every waiter re-checks both limits itself: a freed slot may be useless to a
        # client that has reached its own limit.
        wakeups, self._wakeups = self._wakeups, set()
        for wakeup in wakeups:
            if not wakeup.done():
                wakeup.set_result(None)

    async def acquire(self, client: str, wait: float = MAX_HEAVY_WAIT_SECONDS) -> HeavySlot | None:
        """Take a slot for `client`, waiting up to `wait` seconds for one to be freed.

        Returns None, taking nothing, if no slot became free in time, or at once if
        `max_waiters` requests are already waiting, or `max_waiters_per_client` for this
        client. Cancelling the waiting request leaves no count behind. A request arriving while others wait may take a freed slot
        first: the wait is bounded, so nobody is starved for long.
        """
        if self.try_acquire(client):
            return HeavySlot(self, client)
        if (
            wait <= 0
            or self._waiting >= self.max_waiters
            or self._waiting_per_client.get(client, 0) >= self.max_waiters_per_client
        ):
            return None
        loop = asyncio.get_running_loop()
        deadline = loop.time() + wait
        self._waiting += 1
        self._waiting_per_client[client] = self._waiting_per_client.get(client, 0) + 1
        try:
            while (remaining := deadline - loop.time()) > 0:
                wakeup: asyncio.Future[None] = loop.create_future()
                self._wakeups.add(wakeup)
                try:
                    await asyncio.wait({wakeup}, timeout=remaining)
                finally:
                    self._wakeups.discard(wakeup)
                    wakeup.cancel()
                if self.try_acquire(client):
                    return HeavySlot(self, client)
            return None
        finally:
            self._waiting -= 1
            if self._waiting_per_client[client] > 1:
                self._waiting_per_client[client] -= 1
            else:
                del self._waiting_per_client[client]


heavy_limiter = HeavyQueryLimiter()


def _client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def limit_heavy_queries(request: Request) -> AsyncIterator[HeavySlot]:
    """FastAPI dependency: hold one heavy-query slot for the duration of the request.

    It is an `async` generator so that it runs on the event loop, not in a thread: the
    counters are then only touched by one thread. It yields the `HeavySlot`; a route that
    calls Corese passes it to `sparql_client.query(..., slot=slot)`, which may keep it
    beyond the request.

    Raises:
        HTTPException: 429 (`Retry-After: 10`) if no slot was freed within
            `MAX_HEAVY_WAIT_SECONDS`, or at once if too many requests already wait.
    """
    client = _client_address(request)
    slot = await heavy_limiter.acquire(client, MAX_HEAVY_WAIT_SECONDS)
    if slot is None:
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent heavy queries, retry shortly.",
            headers={"Retry-After": "10"},
        )
    try:
        yield slot
    finally:
        slot.release()


def check_criteria_count(count: int) -> None:
    """Refuse a request that carries more than `MAX_CRITERIA` criteria (400)."""
    if count > MAX_CRITERIA:
        raise HTTPException(
            status_code=400,
            detail=f"Too many criteria: at most {MAX_CRITERIA} are accepted.",
        )
