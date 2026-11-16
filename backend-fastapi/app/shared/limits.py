"""Concurrency and size limits that protect the shared Corese (RM-ACC-02).

Heavy queries (free SPARQL, custom search, competency questions, exports, and the
creation and update of saved queries, which parse their text) run under
a concurrency limit so that they never starve reading and navigation. A request over
the limit is answered with 429 at once: it is never queued, because a queue of heavy
queries is exactly what would overload Corese.

The counters live in the memory of one worker, so the total limit is per worker.
Behind a reverse proxy, `request.client.host` is the real client address only if the
server trusts the proxy's forwarded headers (`--forwarded-allow-ips`).
"""

from collections.abc import AsyncIterator

from fastapi import HTTPException, Request

MAX_HEAVY_PER_CLIENT = 2
MAX_HEAVY_TOTAL = 4
MAX_CRITERIA = 30


class HeavyQueryLimiter:
    """Counts the heavy requests in progress, in total and per client address.

    The methods are synchronous and never await, so with a single event loop (one
    worker) the counters need no lock.
    """

    def __init__(
        self, max_per_client: int = MAX_HEAVY_PER_CLIENT, max_total: int = MAX_HEAVY_TOTAL
    ) -> None:
        self.max_per_client = max_per_client
        self.max_total = max_total
        self._per_client: dict[str, int] = {}
        self._total = 0

    def try_acquire(self, client: str) -> bool:
        """Take a slot for `client`; return False, taking nothing, if no slot is free."""
        if self._total >= self.max_total or self._per_client.get(client, 0) >= self.max_per_client:
            return False
        self._per_client[client] = self._per_client.get(client, 0) + 1
        self._total += 1
        return True

    def release(self, client: str) -> None:
        """Give back a slot taken by `try_acquire` for `client`."""
        remaining = self._per_client.get(client, 0) - 1
        if remaining > 0:
            self._per_client[client] = remaining
        else:
            self._per_client.pop(client, None)
        self._total = max(0, self._total - 1)


heavy_limiter = HeavyQueryLimiter()


def _client_address(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def limit_heavy_queries(request: Request) -> AsyncIterator[None]:
    """FastAPI dependency: hold one heavy-query slot for the duration of the request.

    It is an `async` generator so that it runs on the event loop, not in a thread: the
    counters are then only touched by one thread.

    Raises:
        HTTPException: 429 at once if the client or the worker has no free slot.
    """
    client = _client_address(request)
    if not heavy_limiter.try_acquire(client):
        raise HTTPException(
            status_code=429,
            detail="Too many concurrent heavy queries, retry shortly.",
            headers={"Retry-After": "1"},
        )
    try:
        yield
    finally:
        heavy_limiter.release(client)


def check_criteria_count(count: int) -> None:
    """Refuse a request that carries more than `MAX_CRITERIA` criteria (400)."""
    if count > MAX_CRITERIA:
        raise HTTPException(
            status_code=400,
            detail=f"Too many criteria: at most {MAX_CRITERIA} are accepted.",
        )
