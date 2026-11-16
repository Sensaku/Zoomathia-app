"""Heavy-query slots: a short wait, then retention until Corese answers (RM-ACC-02).

Corese has no query timeout of its own: a query the caller gave up on keeps running there.
The slot of such a query stays taken until Corese answers, so abandoned queries cannot pile
up on the shared endpoint. The timeouts are shortened, so no test takes more than about 1 s.
"""

import asyncio
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx
import pytest

from app.main import app
from app.services import sparql_client as sparql_client_module
from app.services.sparql_client import SPARQLClient, sparql_client
from app.shared import limits
from app.shared.limits import (
    MAX_HEAVY_PER_CLIENT,
    MAX_HEAVY_TOTAL,
    MAX_HEAVY_WAIT_SECONDS,
    MAX_HEAVY_WAITERS,
    MAX_HEAVY_WAITERS_PER_CLIENT,
    HeavyQueryLimiter,
    HeavySlot,
    heavy_limiter,
)
from tests.conftest import FakeCorese

CLIENT_ADDRESS = "127.0.0.1"  # the test client under the ASGI transport
CALLER_TIMEOUT = 0.2
RESULT = (["s"], [{"s": "a"}])


def unbounded(name: str) -> dict[str, str]:
    """A distinct playground query per name, so that the cache never answers for another."""
    return {"query": f"SELECT ?{name} ?p ?o WHERE {{ ?{name} ?p ?o }}"}


async def wait_until(condition: Callable[[], bool], timeout: float = 2.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "condition not reached in time"
        await asyncio.sleep(0.01)


def nothing_in_progress() -> bool:
    return heavy_limiter._total == 0 and not sparql_client_module._background_tasks


@pytest.fixture
def short_caller_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """The caller of a heavy query gives up after 0.2 s instead of 30 s."""
    monkeypatch.setattr(sparql_client, "timeout", CALLER_TIMEOUT)


@pytest.fixture(autouse=True)
async def no_slot_left_behind() -> AsyncIterator[None]:
    """Every test must leave the worker without a taken slot or a running upstream exchange."""
    yield
    await wait_until(nothing_in_progress)


# --- the slot of a query the caller gave up on -----------------------------------------------


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_an_abandoned_query_keeps_its_slot_until_corese_answers(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(*RESULT)
    corese.hold()

    abandoned = await client.post("/sparql/execute", json=unbounded("a"))

    assert abandoned.status_code == 504
    assert heavy_limiter._total == 1  # Corese is still evaluating it
    corese.release_held()
    await wait_until(nothing_in_progress)  # the answer came: the slot is free again


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_the_late_answer_of_an_abandoned_query_is_cached(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(*RESULT)
    corese.hold()
    abandoned = await client.post("/sparql/execute", json=unbounded("a"))
    corese.release_held()
    await wait_until(nothing_in_progress)

    retried = await client.post("/sparql/execute", json=unbounded("a"))

    assert abandoned.status_code == 504
    assert retried.status_code == 200
    assert retried.json()["count"] == 1
    assert len(corese.queries) == 1  # served from the cache: Corese did not evaluate it again


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_a_client_with_abandoned_queries_waits_then_gets_a_429(
    client: httpx.AsyncClient, corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    corese.returns(*RESULT)
    corese.hold()
    for name in ("a", "b"):
        assert (await client.post("/sparql/execute", json=unbounded(name))).status_code == 504
    assert heavy_limiter._per_client == {CLIENT_ADDRESS: MAX_HEAVY_PER_CLIENT}
    monkeypatch.setattr(limits, "MAX_HEAVY_WAIT_SECONDS", 0.3)

    started = time.monotonic()
    refused = await client.post("/sparql/execute", json=unbounded("c"))
    waited = time.monotonic() - started

    assert refused.status_code == 429
    assert refused.headers["retry-after"] == "10"
    assert waited >= 0.25  # it waited for a slot before giving up
    assert len(corese.queries) == 2  # the refused request never reached Corese
    corese.release_held()


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_another_client_still_gets_a_slot_while_one_has_abandoned_queries(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(*RESULT)
    corese.hold()
    for name in ("a", "b"):
        await client.post("/sparql/execute", json=unbounded(name))
    other_transport = httpx.ASGITransport(app=app, client=("203.0.113.7", 4242))
    async with httpx.AsyncClient(transport=other_transport, base_url="http://test") as other:
        # Corese is still held: the other client gets a slot while the first one has none left.
        pending = asyncio.create_task(other.post("/sparql/execute", json=unbounded("c")))
        await wait_until(lambda: len(corese.queries) == 3)
        assert heavy_limiter._per_client == {CLIENT_ADDRESS: 2, "203.0.113.7": 1}

        corese.release_held()
        response = await pending

    assert response.status_code == 200


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_the_safety_cap_frees_the_slot_when_corese_never_answers(
    client: httpx.AsyncClient, corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sparql_client_module, "HEAVY_UPSTREAM_TIMEOUT", 0.6)
    corese.hold()  # never released

    abandoned = await client.post("/sparql/execute", json=unbounded("a"))

    assert abandoned.status_code == 504
    assert heavy_limiter._total == 1
    await wait_until(nothing_in_progress)  # freed by the cap, not by an answer


async def test_rm_acc_02_a_heavy_query_is_sent_with_the_upstream_read_timeout(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    await client.post("/sparql/execute", json=unbounded("a"))
    await client.get("/getAuthors")

    heavy, plain = corese.timeouts
    assert sparql_client_module.HEAVY_UPSTREAM_TIMEOUT == 600
    assert heavy["read"] == 600
    assert heavy["connect"] == 10
    assert plain["read"] == sparql_client.timeout  # not heavy: the plain timeout
    assert plain["read"] != 600


async def test_rm_acc_02_a_cancelled_caller_keeps_the_slot_until_corese_answers(
    corese: FakeCorese,
) -> None:
    corese.hold()
    slot = await heavy_limiter.acquire("203.0.113.9", 0)
    assert slot is not None
    caller = asyncio.create_task(sparql_client.query("SELECT ?s WHERE { ?s ?p ?o }", slot=slot))
    await wait_until(lambda: len(corese.queries) == 1)

    caller.cancel()  # the client closed its connection
    with pytest.raises(asyncio.CancelledError):
        await caller
    slot.release()  # what the request does when it ends: no effect, the slot was detached

    assert heavy_limiter._per_client == {"203.0.113.9": 1}
    corese.release_held()
    await wait_until(nothing_in_progress)


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_closing_the_client_does_not_wait_for_abandoned_queries(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.hold()  # never released
    await client.post("/sparql/execute", json=unbounded("a"))

    await asyncio.wait_for(sparql_client.close(), 1)

    await wait_until(nothing_in_progress)


async def test_rm_acc_02_a_query_without_a_slot_starts_no_background_task(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.hold()
    plain = asyncio.create_task(client.get("/getAuthors"))
    await wait_until(lambda: len(corese.queries) == 1)
    assert sparql_client_module._background_tasks == set()

    corese.release_held()
    assert (await plain).status_code == 200


async def test_rm_acc_02_a_heavy_query_runs_in_one_background_task_until_it_answers(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.hold()
    heavy = asyncio.create_task(client.post("/sparql/execute", json=unbounded("a")))
    await wait_until(lambda: len(corese.queries) == 1)
    assert len(sparql_client_module._background_tasks) == 1

    corese.release_held()
    assert (await heavy).status_code == 200
    await wait_until(nothing_in_progress)


async def test_rm_acc_02_a_failing_background_query_is_reported_and_frees_its_slot(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.raises(httpx.ConnectError("refused"))

    failed = await client.post("/sparql/execute", json=unbounded("a"))

    assert failed.status_code == 502
    await wait_until(nothing_in_progress)


async def test_rm_acc_02_the_logs_never_hold_the_text_of_the_query(
    client: httpx.AsyncClient, corese: FakeCorese, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO", logger="zoomathia.sparql")
    corese.hold()
    pending = asyncio.create_task(client.post("/sparql/execute", json=unbounded("secretvariable")))
    await wait_until(lambda: len(corese.queries) == 1)
    pending.cancel()  # abandoned: logs a warning too
    with pytest.raises(asyncio.CancelledError):
        await pending
    corese.release_held()
    await wait_until(nothing_in_progress)

    messages = " ".join(record.getMessage() for record in caplog.records)
    assert "query length" in messages
    assert "secretvariable" not in messages
    assert "SELECT" not in messages


@pytest.mark.usefixtures("short_caller_timeout")
@pytest.mark.parametrize(
    ("corese_setup", "outcome"),
    [("answers", "answered"), ("fails", "failed with 502")],
)
async def test_rm_acc_02_an_abandoned_query_is_logged_as_a_warning_when_it_ends(
    client: httpx.AsyncClient,
    corese: FakeCorese,
    caplog: pytest.LogCaptureFixture,
    corese_setup: str,
    outcome: str,
) -> None:
    caplog.set_level("WARNING", logger="zoomathia.sparql")
    if corese_setup == "fails":
        corese.raises(httpx.ConnectError("refused"))
    corese.hold()
    await client.post("/sparql/execute", json=unbounded("a"))
    corese.release_held()
    await wait_until(nothing_in_progress)

    warnings = [r.getMessage() for r in caplog.records if r.levelname == "WARNING"]
    assert any("abandoned by its caller (timed out) after 0." in m for m in warnings)
    assert any(f"heavy query {outcome} after 0." in m for m in warnings)


async def test_rm_acc_02_a_cancelled_caller_is_logged_as_abandoned(
    corese: FakeCorese, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("WARNING", logger="zoomathia.sparql")
    corese.hold()
    slot = await heavy_limiter.acquire("203.0.113.9", 0)
    assert slot is not None
    caller = asyncio.create_task(sparql_client.query("SELECT ?s WHERE { ?s ?p ?o }", slot=slot))
    await wait_until(lambda: len(corese.queries) == 1)
    caller.cancel()
    with pytest.raises(asyncio.CancelledError):
        await caller
    corese.release_held()
    await wait_until(nothing_in_progress)

    assert any("abandoned by its caller (cancelled)" in r.getMessage() for r in caplog.records)


async def test_rm_acc_02_a_query_that_ends_while_its_caller_waits_is_not_a_warning(
    client: httpx.AsyncClient, corese: FakeCorese, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO", logger="zoomathia.sparql")

    await client.post("/sparql/execute", json=unbounded("a"))

    assert [r.levelname for r in caplog.records] == ["INFO"]


# --- identical heavy queries share one evaluation -------------------------------------------

SHARED_QUERY = "SELECT ?s WHERE { ?s ?p ?o }"


async def acquire_slot(client: str) -> HeavySlot:
    slot = await heavy_limiter.acquire(client, 0)
    assert slot is not None
    return slot


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_a_retry_while_corese_still_evaluates_joins_that_evaluation(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(*RESULT)
    corese.hold()
    abandoned = await client.post("/sparql/execute", json=unbounded("a"))
    assert abandoned.status_code == 504

    retry = asyncio.create_task(client.post("/sparql/execute", json=unbounded("a")))
    await wait_until(lambda: heavy_limiter._per_client.get(CLIENT_ADDRESS) == 2)
    await asyncio.sleep(0.05)
    assert len(corese.queries) == 1  # the retry did not send the query again
    corese.release_held()
    response = await retry

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert len(corese.queries) == 1


async def test_rm_acc_02_a_joiner_never_detaches_its_slot(corese: FakeCorese) -> None:
    corese.returns(*RESULT)
    corese.hold()
    owner_slot = await acquire_slot("203.0.113.1")
    joiner_slot = await acquire_slot("203.0.113.2")
    owner = asyncio.create_task(sparql_client.query(SHARED_QUERY, slot=owner_slot))
    await wait_until(lambda: len(corese.queries) == 1)
    joiner = asyncio.create_task(sparql_client.query(SHARED_QUERY, slot=joiner_slot))
    await asyncio.sleep(0.05)

    joiner.cancel()
    with pytest.raises(asyncio.CancelledError):
        await joiner
    joiner_slot.release()  # with its request: it really frees the slot

    assert heavy_limiter._per_client == {"203.0.113.1": 1}  # the owner's slot is untouched
    assert not owner.done()
    assert len(sparql_client_module._background_tasks) == 1  # the shared task still runs
    corese.release_held()
    assert (await owner)["results"]["bindings"][0]["s"]["value"] == "a"
    owner_slot.release()
    assert len(corese.queries) == 1


@pytest.mark.usefixtures("short_caller_timeout")
async def test_rm_acc_02_a_joiner_that_times_out_leaves_the_shared_evaluation_and_the_owner_alone(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(*RESULT)
    corese.hold()
    await client.post("/sparql/execute", json=unbounded("a"))  # owner: times out, detaches

    joiner = await client.post("/sparql/execute", json=unbounded("a"))  # joins, times out too

    assert joiner.status_code == 504
    assert len(corese.queries) == 1
    # The joiner's slot went back with its request; the owner's slot is still counted.
    assert heavy_limiter._per_client == {CLIENT_ADDRESS: 1}
    assert len(sparql_client_module._background_tasks) == 1
    corese.release_held()
    await wait_until(nothing_in_progress)
    # The shared exchange was not cancelled: its answer is in the cache.
    again = await client.post("/sparql/execute", json=unbounded("a"))
    assert again.status_code == 200
    assert len(corese.queries) == 1


async def test_rm_acc_02_a_different_query_or_byte_cap_does_not_join(
    corese: FakeCorese,
) -> None:
    corese.returns(*RESULT)
    corese.hold()
    slots = [await acquire_slot(f"203.0.113.{n}") for n in range(3)]
    calls = [
        asyncio.create_task(sparql_client.query(SHARED_QUERY, slot=slots[0])),
        asyncio.create_task(sparql_client.query("SELECT ?x WHERE { ?x ?p ?o }", slot=slots[1])),
        asyncio.create_task(sparql_client.query(SHARED_QUERY, max_bytes=1234567, slot=slots[2])),
    ]
    await wait_until(lambda: len(corese.queries) == 3)

    corese.release_held()
    await asyncio.gather(*calls)
    for slot in slots:
        slot.release()

    assert len(corese.queries) == 3


async def _empty_result() -> dict[str, Any]:
    return {}


async def _never_ends() -> dict[str, Any]:
    await asyncio.sleep(30)
    return {}


def drain_loop(loop: asyncio.AbstractEventLoop, task: "asyncio.Task[dict[str, Any]]") -> None:
    """Cancel a task of a loop that is not running and let the loop finish it."""
    task.cancel()
    loop.run_until_complete(asyncio.gather(task, return_exceptions=True))


@pytest.mark.parametrize("stale", ["finished", "other-loop"])
async def test_rm_acc_02_a_stale_registered_run_is_replaced_not_joined(
    corese: FakeCorese, stale: str
) -> None:
    """A run whose task is done (its entry is about to go) or that belongs to another event
    loop cannot be awaited: the query is sent again and the new run takes the entry's place.
    """
    corese.returns(*RESULT)
    corese.hold()
    key = (SHARED_QUERY, sparql_client_module.MAX_RESPONSE_BYTES)
    other_loop = asyncio.new_event_loop()
    other_task: asyncio.Task[dict[str, Any]] | None = None
    planted = sparql_client_module._HeavyRun(len(SHARED_QUERY))
    try:
        if stale == "finished":
            planted.task = asyncio.create_task(_empty_result())
            await planted.task
            assert planted.task.done()
        else:
            other_task = other_loop.create_task(_never_ends())
            planted.task = other_task  # pending, on a loop that is not the running one
            assert not planted.task.done()
        sparql_client._inflight[key] = planted

        slot = await acquire_slot("203.0.113.1")
        call = asyncio.create_task(sparql_client.query(SHARED_QUERY, slot=slot))
        await wait_until(lambda: len(corese.queries) == 1)  # sent, not joined to the stale run

        replacement = sparql_client._inflight[key]
        assert replacement is not planted
        assert replacement.task is not planted.task
        assert replacement.task.get_loop() is asyncio.get_running_loop()
        corese.release_held()
        assert (await call)["results"]["bindings"][0]["s"]["value"] == "a"
        slot.release()
        await wait_until(lambda: key not in sparql_client._inflight)  # removed when it ends
    finally:
        sparql_client._inflight.pop(key, None)
        if other_task is not None:
            # A loop cannot run inside the running one: drain it from a worker thread.
            await asyncio.to_thread(drain_loop, other_loop, other_task)
        other_loop.close()


async def test_rm_acc_02_the_shared_evaluation_is_forgotten_when_it_ends(
    corese: FakeCorese,
) -> None:
    corese.returns(*RESULT)
    slot = await acquire_slot("203.0.113.1")

    await sparql_client.query(SHARED_QUERY, slot=slot)
    await wait_until(lambda: not sparql_client._inflight)
    slot.release()
    sparql_client.clear_cache()
    again = await acquire_slot("203.0.113.1")
    await sparql_client.query(SHARED_QUERY, slot=again)
    again.release()

    assert len(corese.queries) == 2  # evaluated again: nothing left to join, nothing cached


# --- waiting for a slot ------------------------------------------------------------------------


async def test_rm_acc_02_a_slot_freed_within_the_wait_serves_the_request(
    client: httpx.AsyncClient, corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limits, "MAX_HEAVY_WAIT_SECONDS", 1.0)
    for _ in range(MAX_HEAVY_PER_CLIENT):
        assert heavy_limiter.try_acquire(CLIENT_ADDRESS)
    asyncio.get_running_loop().call_later(0.1, heavy_limiter.release, CLIENT_ADDRESS)

    started = time.monotonic()
    response = await client.post("/sparql/execute", json=unbounded("a"))
    waited = time.monotonic() - started

    assert response.status_code == 200
    assert 0.05 < waited < 0.9
    heavy_limiter.release(CLIENT_ADDRESS)


async def test_rm_acc_02_no_slot_freed_within_the_wait_gives_a_429_with_retry_after(
    client: httpx.AsyncClient, corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limits, "MAX_HEAVY_WAIT_SECONDS", 0.3)
    for _ in range(MAX_HEAVY_PER_CLIENT):
        assert heavy_limiter.try_acquire(CLIENT_ADDRESS)

    started = time.monotonic()
    response = await client.post("/sparql/execute", json=unbounded("a"))
    waited = time.monotonic() - started
    for _ in range(MAX_HEAVY_PER_CLIENT):
        heavy_limiter.release(CLIENT_ADDRESS)

    assert response.status_code == 429
    assert response.headers["retry-after"] == "10"
    assert 0.25 <= waited < 1.0
    assert heavy_limiter._waiting == 0


async def test_rm_acc_02_beyond_the_waiter_cap_a_request_is_refused_at_once(
    client: httpx.AsyncClient, corese: FakeCorese, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(limits, "MAX_HEAVY_WAIT_SECONDS", 2.0)
    monkeypatch.setattr(heavy_limiter, "max_waiters", 1)
    for _ in range(MAX_HEAVY_PER_CLIENT):
        assert heavy_limiter.try_acquire(CLIENT_ADDRESS)
    first = asyncio.create_task(client.post("/sparql/execute", json=unbounded("a")))
    await wait_until(lambda: heavy_limiter._waiting == 1)

    started = time.monotonic()
    second = await client.post("/sparql/execute", json=unbounded("b"))
    waited = time.monotonic() - started

    assert second.status_code == 429
    assert waited < 0.5
    heavy_limiter.release(CLIENT_ADDRESS)
    heavy_limiter.release(CLIENT_ADDRESS)
    assert (await first).status_code == 200


def test_rm_acc_02_the_wait_and_waiter_limits() -> None:
    assert MAX_HEAVY_WAIT_SECONDS == 10
    assert MAX_HEAVY_WAITERS == 64
    assert MAX_HEAVY_WAITERS_PER_CLIENT == 32
    assert MAX_HEAVY_PER_CLIENT == 2
    assert MAX_HEAVY_TOTAL == 4


# --- the limiter and the slot, alone -----------------------------------------------------------


async def test_a_cancelled_waiter_leaves_no_count_behind() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=1)
    assert limiter.try_acquire("a")
    waiter = asyncio.create_task(limiter.acquire("b", 5))
    await wait_until(lambda: limiter._waiting == 1)

    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter

    assert limiter._waiting == 0
    assert limiter._wakeups == set()
    limiter.release("a")
    assert limiter.try_acquire("b")  # nothing was taken or left by the cancelled waiter


async def test_a_waiter_gets_the_slot_that_a_release_frees() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=1)
    assert limiter.try_acquire("a")
    waiter = asyncio.create_task(limiter.acquire("b", 5))
    await wait_until(lambda: limiter._waiting == 1)

    limiter.release("a")
    slot = await waiter

    assert slot is not None
    assert slot.client == "b"
    assert limiter._total == 1
    assert limiter._waiting == 0
    slot.release()
    assert limiter._total == 0


async def test_a_freed_slot_does_not_serve_a_client_that_has_reached_its_own_limit() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=2)
    assert limiter.try_acquire("a")
    assert limiter.try_acquire("b")
    waiter = asyncio.create_task(limiter.acquire("a", 0.3))
    await wait_until(lambda: limiter._waiting == 1)

    limiter.release("b")  # a worker slot is free, but not for "a"

    assert await waiter is None
    assert limiter._total == 1


async def test_the_waiter_cap_is_enforced_per_limiter() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=1, max_waiters=2)
    assert limiter.try_acquire("a")
    waiters = [asyncio.create_task(limiter.acquire(name, 0.3)) for name in ("b", "c")]
    await wait_until(lambda: limiter._waiting == 2)

    started = time.monotonic()
    assert await limiter.acquire("d", 5) is None
    assert time.monotonic() - started < 0.1

    assert await asyncio.gather(*waiters) == [None, None]
    assert limiter._waiting == 0


async def test_a_client_cannot_take_every_waiting_place() -> None:
    limiter = HeavyQueryLimiter(
        max_per_client=1, max_total=1, max_waiters=10, max_waiters_per_client=2
    )
    assert limiter.try_acquire("a")
    own_places = [asyncio.create_task(limiter.acquire("b", 0.4)) for _ in range(2)]
    await wait_until(lambda: limiter._waiting_per_client == {"b": 2})

    started = time.monotonic()
    assert await limiter.acquire("b", 5) is None  # its 2 places are taken: refused at once
    assert time.monotonic() - started < 0.1
    other = asyncio.create_task(limiter.acquire("c", 0.4))  # another client still gets one
    await wait_until(lambda: limiter._waiting_per_client == {"b": 2, "c": 1})

    limiter.release("a")
    results = await asyncio.gather(*own_places, other)
    assert sum(slot is not None for slot in results) == 1  # one slot only: one of them got it
    assert limiter._waiting == 0
    assert limiter._waiting_per_client == {}


async def test_a_cancelled_waiter_gives_its_client_place_back() -> None:
    limiter = HeavyQueryLimiter(
        max_per_client=1, max_total=1, max_waiters=10, max_waiters_per_client=1
    )
    assert limiter.try_acquire("a")
    waiter = asyncio.create_task(limiter.acquire("b", 5))
    await wait_until(lambda: limiter._waiting_per_client == {"b": 1})

    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter

    assert limiter._waiting_per_client == {}
    again = asyncio.create_task(limiter.acquire("b", 0.1))
    await wait_until(lambda: limiter._waiting_per_client == {"b": 1})
    assert await again is None
    assert limiter._waiting_per_client == {}


async def test_no_wait_means_no_waiting() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=1)
    assert limiter.try_acquire("a")

    assert await limiter.acquire("b", 0) is None
    assert limiter._waiting == 0


def test_release_of_a_slot_is_idempotent() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=2)
    first = HeavySlot(limiter, "a")
    assert limiter.try_acquire("a")
    assert limiter.try_acquire("b")

    first.release()
    first.release()

    assert limiter._total == 1  # only one slot was given back
    assert limiter._per_client == {"b": 1}


def test_a_detached_slot_is_released_by_the_returned_callable_only() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=2)
    slot = HeavySlot(limiter, "a")
    assert limiter.try_acquire("a")
    assert limiter.try_acquire("b")

    release = slot.detach()
    slot.release()  # the request ends: no effect
    assert limiter._total == 2

    release()
    release()  # idempotent
    slot.release()
    assert limiter._total == 1
    assert limiter._per_client == {"b": 1}
    assert slot.detach() == release


def test_a_slot_released_before_detaching_is_not_released_twice() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=2)
    slot = HeavySlot(limiter, "a")
    assert limiter.try_acquire("a")
    assert limiter.try_acquire("b")
    slot.release()

    slot.detach()()

    assert limiter._total == 1


async def test_acquire_returns_a_slot_that_gives_its_place_back() -> None:
    limiter = HeavyQueryLimiter(max_per_client=1, max_total=1)
    slot = await limiter.acquire("a", 0)
    assert slot is not None
    assert await limiter.acquire("a", 0) is None

    slot.release()

    assert await limiter.acquire("a", 0) is not None


async def test_the_sparql_client_without_a_slot_is_unchanged(corese: FakeCorese) -> None:
    plain = SPARQLClient()
    try:
        data = await plain.query("SELECT ?s WHERE { ?s ?p ?o }")
    finally:
        await plain.close()

    assert data["head"] == {"vars": []}
    assert sparql_client_module._background_tasks == set()
