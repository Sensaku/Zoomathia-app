"""Shared test fixtures.

Every test runs against a temporary SQLite database, and outgoing HTTP requests
are blocked: no test touches `data/staging.db` or the production Corese, except
the tests marked `live`, which are skipped unless `--live` is given.
"""

import atexit
import os
import shutil
import tempfile
from collections.abc import AsyncIterator, Iterator
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
        self._response = httpx.Response(200, json=sparql_json([], []))
        self._error: Exception | None = None
        router.route(host=_ENDPOINT.host, path=_ENDPOINT.path).side_effect = self._handle

    def returns(self, variables: list[str], rows: list[dict[str, str]]) -> None:
        """Answer every following query with these results."""
        self._response = httpx.Response(200, json=sparql_json(variables, rows))

    def raises(self, error: Exception) -> None:
        """Fail every following query with this transport error."""
        self._error = error

    def _handle(self, request: httpx.Request) -> httpx.Response:
        query = _extract_query(request)
        if query is None:
            self.malformed.append(request)
            return httpx.Response(400, text="no SPARQL query in the request")
        self.queries.append(query)
        if self._error is not None:
            raise self._error
        return self._response


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
def fresh_sparql_cache() -> Iterator[None]:
    """Start every test with an empty SPARQL cache."""
    sparql_client.clear_cache()
    yield
    sparql_client.clear_cache()


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
