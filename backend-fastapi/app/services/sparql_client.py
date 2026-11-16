import asyncio
import json
import logging
import time
from collections import OrderedDict
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.shared.limits import HeavySlot

logger = logging.getLogger("zoomathia.sparql")

# Guardrails of RM-ACC-02: a result larger than its cap is refused, and the cache never
# holds more than MAX_CACHE_BYTES of results in total.
# Default cap, for every query. The largest competency question result is 2.1 MB, and no
# reading endpoint is large today.
MAX_RESPONSE_BYTES = 10 * 1024 * 1024
# Cap only for the custom search and its export, which hold a heavy-query slot (so at most
# `MAX_HEAVY_TOTAL` such results per worker). The largest normal result measured is the
# author-only custom search for Diodorus Siculus, about 48 MB.
MAX_SEARCH_RESPONSE_BYTES = 64 * 1024 * 1024
MAX_CACHE_BYTES = 32 * 1024 * 1024
_ERROR_BODY_LOG_BYTES = 2048
# RM-ACC-02: Corese has no query timeout of its own, so a heavy query keeps evaluating after
# the caller gave up. Its slot is kept until Corese answers, but never longer than this cap.
HEAVY_UPSTREAM_TIMEOUT = 600.0
_CONNECT_TIMEOUT = 10.0

# Strong references to the running upstream exchanges: the event loop only keeps weak ones,
# and an exchange that outlives its caller must not be garbage-collected half-way.
_background_tasks: set[asyncio.Task[dict[str, Any]]] = set()


class _HeavyRun:
    """One upstream exchange of a heavy query, shared by the identical queries that overlap it."""

    task: asyncio.Task[dict[str, Any]]

    def __init__(self, query_length: int) -> None:
        self.started = time.monotonic()
        self.query_length = query_length
        # Set when the caller that started the exchange left before its end.
        self.abandoned = False


class _ResponseTooLargeError(Exception):
    """The response body went beyond the allowed size while it was being read."""


async def _read_body(response: httpx.Response, limit: int) -> bytearray:
    """Read the (decoded) body of a streamed response, stopping beyond `limit` bytes.

    The buffer is returned as built (no copy into `bytes`): `json.loads` and `.decode()`
    accept it, and a large result is not held twice in memory.
    """
    declared = response.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        raise _ResponseTooLargeError
    body = bytearray()
    async for chunk in response.aiter_bytes():
        body.extend(chunk)
        if len(body) > limit:
            raise _ResponseTooLargeError
    return body


async def _refuse_error_status(response: httpx.Response) -> None:
    """Map a non-2xx answer of the endpoint to a 502, logging the start of its body."""
    if response.is_success:
        return
    prefix = bytearray()
    async for chunk in response.aiter_bytes():
        prefix.extend(chunk)
        if len(prefix) >= _ERROR_BODY_LOG_BYTES:
            break
    logger.error(
        "Erreur HTTP retournée par SPARQL (%d): %s",
        response.status_code,
        bytes(prefix[:_ERROR_BODY_LOG_BYTES]).decode("utf-8", errors="replace"),
    )
    raise HTTPException(status_code=502, detail=f"SPARQL error: {response.status_code}")


def _too_large() -> HTTPException:
    return HTTPException(status_code=422, detail="SPARQL result too large")


class SPARQLClient:
    def __init__(
        self,
        endpoint: str = settings.SPARQL_ENDPOINT,
        timeout: float = settings.SPARQL_TIMEOUT,
        cache_ttl: float = 1800.0,
        max_cache_size: int = 500,
        max_cache_bytes: int = MAX_CACHE_BYTES,
    ):
        self.endpoint = endpoint
        self.timeout = timeout
        self.cache_ttl = cache_ttl
        self.max_cache_size = max_cache_size
        self.max_cache_bytes = max_cache_bytes
        # key -> (timestamp, result, size of the response in bytes)
        self._cache: OrderedDict[str, tuple[float, dict[str, Any], int]] = OrderedDict()
        self._cache_bytes = 0
        # (query, byte cap) -> the heavy exchange in progress for it (single flight).
        self._inflight: dict[tuple[str, int], _HeavyRun] = {}
        self._client: httpx.AsyncClient | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def get_client(self) -> httpx.AsyncClient:
        current_loop = asyncio.get_running_loop()
        if self._client is None or self._client.is_closed or self._loop != current_loop:
            self._loop = current_loop
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=10.0),
                headers={"User-Agent": "ZoomathiaFastAPI/1.0"},
            )
        return self._client

    async def close(self):
        # Exchanges that outlived their request must not keep the shutdown waiting.
        current_loop = asyncio.get_running_loop()
        for task in list(_background_tasks):
            if task.get_loop() is current_loop:
                task.cancel()
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
            self._loop = None

    def clear_cache(self):
        """Vide le cache des requêtes SPARQL."""
        self._cache.clear()
        self._cache_bytes = 0

    def _cache_pop(self, key: str) -> None:
        _, _, size = self._cache.pop(key)
        self._cache_bytes -= size

    def _cache_put(self, key: str, now: float, data: dict[str, Any], size: int) -> None:
        """Store a result, evicting the least recently used entries by count and by size."""
        if size > self.max_cache_bytes:
            return
        if key in self._cache:
            self._cache_pop(key)
        while self._cache and (
            len(self._cache) >= self.max_cache_size
            or self._cache_bytes + size > self.max_cache_bytes
        ):
            oldest = next(iter(self._cache))
            self._cache_pop(oldest)
        self._cache[key] = (now, data, size)
        self._cache_bytes += size

    async def query(
        self,
        sparql_query: str,
        use_cache: bool = True,
        *,
        max_bytes: int | None = None,
        slot: HeavySlot | None = None,
    ) -> dict[str, Any]:
        """Exécute une requête SPARQL SELECT et renvoie le JSON standardisé (avec mise en cache TTL).

        `max_bytes` is the size above which the result is refused (422); it defaults to
        `MAX_RESPONSE_BYTES` (10 MB), read at call time. The custom search and its export
        pass `MAX_SEARCH_RESPONSE_BYTES`.

        `slot` is the heavy-query slot of the calling request (RM-ACC-02). Without it, the
        exchange runs in the caller with the plain `timeout`. With it, the whole exchange
        (request, headers, status check, capped body read, JSON parse, cache put) runs in a
        background task with a read timeout of `HEAVY_UPSTREAM_TIMEOUT`, and the caller
        waits for it at most `timeout` seconds.

        Identical heavy queries (same text, same `max_bytes`) share one evaluation: a call
        made while the exchange of an identical query is running waits for that exchange
        instead of sending the query again. Only the caller that started the exchange owns
        it. If that caller times out (504) or is cancelled, its slot is detached and
        released only when the task ends, because Corese keeps evaluating the query. A
        caller that joined never detaches: it adds no load on Corese, and its slot is
        released with its request.

        The late answer is checked and cached like any other. A retry made after the
        exchange ended is served from the cache only if the result fits in it (at most
        `MAX_CACHE_BYTES`, and the entry is not evicted or expired); otherwise Corese
        evaluates the query again.
        """
        limit = MAX_RESPONSE_BYTES if max_bytes is None else max_bytes
        clean_query = " ".join(sparql_query.split())
        now = time.time()

        if use_cache and clean_query in self._cache:
            timestamp, data, _ = self._cache[clean_query]
            if now - timestamp < self.cache_ttl:
                # Déplacer à la fin pour simuler LRU
                self._cache.move_to_end(clean_query)
                return data
            else:
                self._cache_pop(clean_query)

        client = await self.get_client()
        if slot is None:
            return await self._exchange(client, sparql_query, clean_query, use_cache, now, limit)

        key = (clean_query, limit)
        run = self._inflight.get(key)
        if run is not None and (
            run.task.done() or run.task.get_loop() is not asyncio.get_running_loop()
        ):
            run = None  # finished (its entry is about to go) or left over by another loop
        owner = run is None
        if run is None:
            run = self._start_heavy(key, client, sparql_query, clean_query, use_cache, now, limit)
        task = run.task

        leaving = "cancelled"
        try:
            return await asyncio.wait_for(asyncio.shield(task), self.timeout)
        except asyncio.TimeoutError:
            leaving = "timed out"
            raise HTTPException(status_code=504, detail="SPARQL query timed out")
        finally:
            if owner and not task.done():
                # The owner leaves (timeout, closed connection) while Corese still works:
                # the slot follows the task, not the request.
                self._abandon(run, slot, leaving)

    def _start_heavy(
        self,
        key: tuple[str, int],
        client: httpx.AsyncClient,
        sparql_query: str,
        clean_query: str,
        use_cache: bool,
        now: float,
        limit: int,
    ) -> _HeavyRun:
        """Start the background exchange of a heavy query and register it for sharing."""
        run = _HeavyRun(len(clean_query))
        run.task = asyncio.create_task(
            self._heavy_exchange(run, client, sparql_query, clean_query, use_cache, now, limit)
        )
        self._inflight[key] = run
        _background_tasks.add(run.task)
        run.task.add_done_callback(lambda task: self._finish_heavy(key, run, task))
        return run

    def _finish_heavy(
        self, key: tuple[str, int], run: _HeavyRun, task: asyncio.Task[dict[str, Any]]
    ) -> None:
        """Forget a finished exchange and retrieve its exception, so it is never lost."""
        _background_tasks.discard(task)
        if self._inflight.get(key) is run:
            del self._inflight[key]
        if not task.cancelled():
            task.exception()

    @staticmethod
    def _abandon(run: _HeavyRun, slot: HeavySlot, reason: str) -> None:
        """The caller that owns a running exchange leaves: the slot waits for its end."""
        run.abandoned = True
        logger.warning(
            "SPARQL heavy query abandoned by its caller (%s) after %.1f s, "
            "still running upstream (query length %d)",
            reason,
            time.monotonic() - run.started,
            run.query_length,
        )
        release = slot.detach()
        run.task.add_done_callback(lambda _task: release())

    async def _heavy_exchange(
        self,
        run: _HeavyRun,
        client: httpx.AsyncClient,
        sparql_query: str,
        clean_query: str,
        use_cache: bool,
        now: float,
        limit: int,
    ) -> dict[str, Any]:
        """The upstream exchange of a heavy query: read timeout and total duration capped.

        Logs how it ended, with its duration and the length of the query, never its text:
        as a warning if its caller left before the end, otherwise as information.
        """
        outcome = "answered"
        try:
            return await asyncio.wait_for(
                self._exchange(
                    client,
                    sparql_query,
                    clean_query,
                    use_cache,
                    now,
                    limit,
                    timeout=httpx.Timeout(HEAVY_UPSTREAM_TIMEOUT, connect=_CONNECT_TIMEOUT),
                ),
                HEAVY_UPSTREAM_TIMEOUT,
            )
        except asyncio.TimeoutError:
            outcome = "safety cap reached"
            raise HTTPException(status_code=504, detail="SPARQL query timed out")
        except HTTPException as error:
            outcome = f"failed with {error.status_code}"
            raise
        except asyncio.CancelledError:
            outcome = "cancelled"
            raise
        finally:
            log = logger.warning if run.abandoned else logger.info
            log(
                "SPARQL heavy query %s after %.1f s (query length %d)",
                outcome,
                time.monotonic() - run.started,
                run.query_length,
            )

    async def _exchange(
        self,
        client: httpx.AsyncClient,
        sparql_query: str,
        clean_query: str,
        use_cache: bool,
        now: float,
        limit: int,
        timeout: Any = httpx.USE_CLIENT_DEFAULT,
    ) -> dict[str, Any]:
        """Send the query, check and read the answer, cache it; map failures to HTTP errors."""
        params = {"query": sparql_query, "format": "json"}
        headers = {"Accept": "application/sparql-results+json"}

        try:
            async with client.stream(
                "GET", self.endpoint, params=params, headers=headers, timeout=timeout
            ) as response:
                await _refuse_error_status(response)
                body = await _read_body(response, limit)
            data = json.loads(body)

            if use_cache:
                self._cache_put(clean_query, now, data, len(body))

            return data
        except HTTPException:
            raise
        except _ResponseTooLargeError:
            logger.error("SPARQL response above %d bytes, refused", limit)
            raise _too_large()
        except httpx.ConnectError as e:
            logger.error(f"Impossible de joindre l'endpoint SPARQL ({self.endpoint}): {e}")
            raise HTTPException(status_code=502, detail="SPARQL endpoint unreachable")
        except httpx.TimeoutException as e:
            logger.error(f"Timeout sur la requête SPARQL: {e}")
            raise HTTPException(status_code=504, detail="SPARQL query timed out")
        except Exception as e:
            logger.error(f"Erreur inattendue lors de la requête SPARQL: {e}")
            raise HTTPException(
                status_code=500, detail=f"Internal SPARQL processing error: {str(e)}"
            )

    async def construct(self, sparql_query: str) -> str:
        """Exécute une requête SPARQL CONSTRUCT ou DESCRIBE et renvoie du texte Turtle."""
        client = await self.get_client()
        params = {"query": sparql_query}
        headers = {"Accept": "text/turtle"}

        try:
            async with client.stream(
                "GET", self.endpoint, params=params, headers=headers
            ) as response:
                response.raise_for_status()
                body = await _read_body(response, MAX_RESPONSE_BYTES)
            return body.decode(response.encoding or "utf-8", errors="replace")
        except HTTPException:
            raise
        except _ResponseTooLargeError:
            logger.error("SPARQL response above %d bytes, refused", MAX_RESPONSE_BYTES)
            raise _too_large()
        except Exception as e:
            logger.error(f"Erreur CONSTRUCT SPARQL: {e}")
            raise HTTPException(status_code=502, detail=f"SPARQL query failed: {str(e)}")


sparql_client = SPARQLClient()
