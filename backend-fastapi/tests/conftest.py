"""Shared test fixtures.

Every test runs against a temporary SQLite database, and outgoing HTTP requests
are blocked: no test touches `data/staging.db` or the production Corese, except
the tests marked `live`, which are skipped unless `--live` is given.
"""

import asyncio
import atexit
import os
import shutil
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

# The staging store opens its database when `app` is imported, so the temporary
# path must be set before the first `app` import below.
_TMP_DIR = Path(tempfile.mkdtemp(prefix="zoomathia-tests-"))
atexit.register(shutil.rmtree, _TMP_DIR, ignore_errors=True)
os.environ["STAGING_DB_PATH"] = str(_TMP_DIR / "staging.db")

import httpx  # noqa: E402
import pytest  # noqa: E402
import respx  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.services.sparql_client import sparql_client  # noqa: E402
from app.services.staging_store import staging_store  # noqa: E402
from app.shared import limits  # noqa: E402
from app.shared.sparql_guard import clear_prepared_queries  # noqa: E402

_ENDPOINT = httpx.URL(settings.SPARQL_ENDPOINT)


def sparql_json(variables: list[str], rows: list[dict[str, str]]) -> dict[str, Any]:
    """Build a SPARQL 1.1 JSON results document whose values are all literals."""
    bindings = [
        {var: {"type": "literal", "value": value} for var, value in row.items()} for row in rows
    ]
    return {"head": {"vars": variables}, "results": {"bindings": bindings}}


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--live",
        action="store_true",
        default=False,
        help="run the tests marked `live` against the production Corese and OpenTheso",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if config.getoption("--live"):
        return
    skip_live = pytest.mark.skip(reason="live test: run with --live")
    for item in items:
        if item.get_closest_marker("live"):
            item.add_marker(skip_live)


def unmatched_requests(router: respx.MockRouter) -> list[str]:
    """URLs of the requests that went through `router` without matching any route."""
    matched = {id(call) for route in router.routes for call in route.calls}
    return [str(call.request.url) for call in router.calls if id(call) not in matched]


def _extract_query(request: httpx.Request) -> str | None:
    """The SPARQL query of a request: URL parameter, form body or sparql-query body."""
    from_url = request.url.params.get_list("query")
    if from_url:
        return str(from_url[0])
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type == "application/x-www-form-urlencoded":
        values = parse_qs(request.content.decode(), keep_blank_values=True).get("query")
        return values[0] if values else None
    if content_type == "application/sparql-query":
        return request.content.decode()
    return None


class FakeCorese:
    """Simulated Corese endpoint that records every SPARQL query it receives."""

    def __init__(self, router: respx.MockRouter) -> None:
        self.queries: list[str] = []
        self.malformed: list[httpx.Request] = []
        # The timeouts (connect, read, write, pool) that each query was sent with.
        self.timeouts: list[dict[str, float | None]] = []
        self._gate: asyncio.Event | None = None
        self._response = httpx.Response(200, json=sparql_json([], []))
        self._factory: Callable[[], httpx.Response] | None = None
        self._turns: list[httpx.Response] = []
        self._error: Exception | None = None
        router.route(host=_ENDPOINT.host, path=_ENDPOINT.path).side_effect = self._handle

    def returns(self, variables: list[str], rows: list[dict[str, str]]) -> None:
        """Answer every following query with these results."""
        self._response = httpx.Response(200, json=sparql_json(variables, rows))
        self._factory = None
        self._turns = []

    def returns_in_turn(self, *results: tuple[list[str], list[dict[str, str]]]) -> None:
        """Answer the following queries one result after the other; the last one repeats."""
        self._turns = [httpx.Response(200, json=sparql_json(*result)) for result in results]

    def returns_large(self, size: int, declare_length: bool = True) -> None:
        """Answer every following query with a valid JSON document of `size` bytes.

        With `declare_length=False` the body is streamed in chunks without a
        `Content-Length`, so only reading it reveals its size.
        """
        head = b'{"head": {"vars": []}, "results": {"bindings": []}}'
        body = head + b" " * max(0, size - len(head))

        async def chunks() -> AsyncIterator[bytes]:
            for start in range(0, len(body), 64 * 1024):
                yield body[start : start + 64 * 1024]

        def build() -> httpx.Response:
            if declare_length:
                return httpx.Response(200, content=body)
            return httpx.Response(200, content=chunks())

        self._factory = build

    def hold(self) -> None:
        """Keep every following query unanswered, after recording it, until `release_held`."""
        self._gate = asyncio.Event()

    def release_held(self) -> None:
        """Answer the queries kept by `hold`, and every following one at once."""
        if self._gate is not None:
            self._gate.set()

    def raises(self, error: Exception) -> None:
        """Fail every following query with this transport error."""
        self._error = error

    def _handle(self, request: httpx.Request) -> httpx.Response | Awaitable[httpx.Response]:
        query = _extract_query(request)
        if query is None:
            self.malformed.append(request)
            return httpx.Response(400, text="no SPARQL query in the request")
        self.queries.append(query)
        self.timeouts.append(dict(request.extensions.get("timeout", {})))
        gate = self._gate
        if gate is None:
            return self._answer()
        return self._answer_when_released(gate)

    def _answer(self) -> httpx.Response:
        if self._error is not None:
            raise self._error
        if self._factory is not None:
            return self._factory()
        if self._turns:
            return self._turns.pop(0) if len(self._turns) > 1 else self._turns[0]
        return self._response

    async def _answer_when_released(self, gate: asyncio.Event) -> httpx.Response:
        await gate.wait()
        return self._answer()


@pytest.fixture(autouse=True)
def network_guard(request: pytest.FixtureRequest) -> Iterator[respx.MockRouter | None]:
    """Block every outgoing HTTP request, except in tests marked `live`.

    Application code may swallow the error of a blocked request, so the guard also
    fails the test at teardown if any request matched no route.
    """
    if request.node.get_closest_marker("live"):
        yield None
        return
    with respx.mock(assert_all_called=False, assert_all_mocked=False) as router:
        yield router
        stray = unmatched_requests(router)
    if stray:
        pytest.fail("request(s) matched no mocked route: " + ", ".join(stray))


@pytest.fixture(autouse=True)
def short_heavy_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    """Shorten the wait for a heavy-query slot (10 s), so that a refused request is quick.

    A test that checks the wait itself sets its own value, which replaces this one.
    """
    monkeypatch.setattr(limits, "MAX_HEAVY_WAIT_SECONDS", 0.05)


@pytest.fixture(autouse=True)
def fresh_sparql_cache() -> Iterator[None]:
    """Start every test with an empty SPARQL cache."""
    sparql_client.clear_cache()
    yield
    sparql_client.clear_cache()


@pytest.fixture(autouse=True)
def fresh_prepared_queries() -> Iterator[None]:
    """Start every test with an empty cache of validated queries."""
    clear_prepared_queries()
    yield
    clear_prepared_queries()


@pytest.fixture(autouse=True)
def fresh_database(tmp_path: Path) -> Iterator[None]:
    """Give every test its own empty staging database, built like a real one."""
    shared_path = staging_store.db_path
    staging_store.db_path = tmp_path / "staging.db"
    staging_store._init_db()
    yield
    staging_store.db_path = shared_path


@pytest.fixture
def corese(network_guard: respx.MockRouter | None) -> Iterator[FakeCorese]:
    """Simulated Corese for a test; not available in `live` tests."""
    assert network_guard is not None, "`corese` simulates Corese; live tests use the real one"
    fake = FakeCorese(network_guard)
    yield fake
    if fake.malformed:
        urls = ", ".join(str(request.url) for request in fake.malformed)
        pytest.fail("Corese received request(s) without a SPARQL query: " + urls)


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    """HTTP client calling the FastAPI application in process."""
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as http_client:
        yield http_client
