"""Shared test fixtures.

Every test runs against a temporary SQLite database built from the Alembic migrations,
with a controllable clock and a cheap password hasher in place of the real ones, and outgoing
HTTP requests are blocked: no test touches `data/staging.db` or the
production Corese, except the tests marked `live`, which are skipped unless `--live` is
given.
"""

import asyncio
import atexit
import os
import shutil
import tempfile
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

# The settings read the database path when `app` is imported, so the temporary
# path must be set before the first `app` import below.
_TMP_DIR = Path(tempfile.mkdtemp(prefix="zoomathia-tests-"))
atexit.register(shutil.rmtree, _TMP_DIR, ignore_errors=True)
_SHARED_DB = _TMP_DIR / "staging.db"
os.environ["STAGING_DB_PATH"] = str(_SHARED_DB)
# No startup of the application may send the warm-up of the TheZoo collections to Corese.
os.environ["THESAURUS_PRELOAD"] = "false"

import httpx  # noqa: E402
import pytest  # noqa: E402
import respx  # noqa: E402
from alembic import command  # noqa: E402
from sqlalchemy.engine import URL  # noqa: E402

from app.accounts.models import Role, User, UserStatus  # noqa: E402
from app.accounts.passwords import PasswordHasher, get_password_hasher  # noqa: E402
from app.core.clock import get_clock  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.database import Database  # noqa: E402
from app.core.migrations import alembic_config  # noqa: E402
from app.main import app  # noqa: E402
from app.queries.service import seed_builtin_queries  # noqa: E402
from app.services.sparql_client import sparql_client  # noqa: E402
from app.shared import limits  # noqa: E402
from app.shared.sparql_guard import clear_prepared_queries  # noqa: E402
from app.thesaurus.collections import (  # noqa: E402
    get_thesaurus_collections,
    thesaurus_collections,
)
from tests.support.accounts import (  # noqa: E402
    PASSWORD,
    FakeClock,
    MakeAccount,
    Member,
    cheap_password_hash,
    csrf,
    sign_in,
)
from tests.support.thesaurus import DEFAULT_COLLECTION_INDEX  # noqa: E402

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

    def returns_document(self, document: dict[str, Any]) -> None:
        """Answer every following query with this JSON document as is (even a malformed one)."""
        self._response = httpx.Response(200, json=document)
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

    def recovers(self) -> None:
        """Stop failing the queries: the next ones are answered again."""
        self._error = None

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
def in_memory_collection_index() -> Iterator[None]:
    """Give the API an in-memory index of the TheZoo collections instead of a Corese query.

    The tests of the loader itself (`tests/thesaurus/`) use their own `ThesaurusCollections`
    and the `corese` fake; a test of the real dependency removes this override.
    """
    thesaurus_collections.clear()
    app.dependency_overrides[get_thesaurus_collections] = lambda: DEFAULT_COLLECTION_INDEX
    yield
    app.dependency_overrides.pop(get_thesaurus_collections, None)
    thesaurus_collections.clear()


_template_database: Path | None = None


def _seed_native_questions(path: Path) -> None:
    """Seed the native competency questions of the database at `path`.

    The seeding is asynchronous like at startup. It runs on its own event loop in a thread,
    so that it works whether or not the caller is inside a running loop.
    """

    async def seed() -> None:
        url = URL.create("sqlite+aiosqlite", database=str(path)).render_as_string(
            hide_password=False
        )
        template = Database(url)
        try:
            await seed_builtin_queries(template)
        finally:
            await template.dispose()

    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(asyncio.run, seed()).result()


def template_database() -> Path:
    """A database migrated to the head revision and seeded, built once per test session.

    Every test gets a copy (`fresh_database`). The template is built by the migrations, like
    a real database, and no connection stays open on it, so copying the file loses nothing.
    """
    global _template_database
    if _template_database is None:
        template = _TMP_DIR / "template.db"
        url = URL.create("sqlite", database=str(template)).render_as_string(hide_password=False)
        command.upgrade(alembic_config(url), "head")
        _seed_native_questions(template)
        _template_database = template
    return _template_database


@pytest.fixture(autouse=True)
def fresh_database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Give every test its own copy of the migrated database.

    The settings (hence the SQLAlchemy engine and the Alembic URL) point at the copy for the
    duration of the test.
    """
    path = tmp_path / "staging.db"
    shutil.copyfile(template_database(), path)
    monkeypatch.setattr(settings, "STAGING_DB_PATH", str(path))
    yield


@pytest.fixture
async def database(fresh_database: None) -> AsyncIterator[Database]:
    """The SQLAlchemy engine of the application, on the database of the test."""
    test_database = Database(settings.DATABASE_URL)
    app.state.database = test_database
    yield test_database
    await test_database.dispose()


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
async def client(database: Database) -> AsyncIterator[httpx.AsyncClient]:
    """HTTP client calling the FastAPI application in process.

    It uses `https://` so that its cookie jar sends the `Secure` session cookie.
    """
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="https://test"
    ) as http_client:
        yield http_client


# --- accounts and signed-in clients ---


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def hasher() -> PasswordHasher:
    return PasswordHasher(cheap_password_hash())


@pytest.fixture(autouse=True)
def account_dependencies(clock: FakeClock, hasher: PasswordHasher) -> Iterator[None]:
    """Replace the clock and the hasher of the application for the duration of a test."""
    app.dependency_overrides[get_clock] = lambda: clock
    app.dependency_overrides[get_password_hasher] = lambda: hasher
    yield
    app.dependency_overrides.pop(get_clock, None)
    app.dependency_overrides.pop(get_password_hasher, None)


@pytest.fixture
def registration_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", True)


@pytest.fixture
def make_account(database: Database, hasher: PasswordHasher, clock: FakeClock) -> MakeAccount:
    """Insert an account directly, without going through registration."""

    async def make(
        email: str = "member@example.org",
        password: str = PASSWORD,
        role: Role = Role.CONTRIBUTOR,
        status: UserStatus = UserStatus.ACTIVE,
        display_name: str = "Test Person",
        affiliation: str = "Test Lab",
    ) -> User:
        user = User(
            email=email,
            display_name=display_name,
            affiliation=affiliation,
            password_hash=await hasher.hash(password),
            role=role,
            status=status,
            license_accepted_at=clock(),
            created_at=clock(),
        )
        async with database.session_maker() as session:
            session.add(user)
            await session.commit()
        return user

    return make


@pytest.fixture
async def new_client(database: Database) -> AsyncIterator[Callable[[], httpx.AsyncClient]]:
    """Make more HTTP clients, each with its own cookie jar (another browser)."""
    clients: list[httpx.AsyncClient] = []

    def make() -> httpx.AsyncClient:
        http_client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="https://test"
        )
        clients.append(http_client)
        return http_client

    yield make
    for http_client in clients:
        await http_client.aclose()


@pytest.fixture
async def make_member(
    database: Database, make_account: MakeAccount
) -> AsyncIterator[Callable[..., Awaitable[Member]]]:
    """Make an account and a client signed in as it, sending its CSRF token by default."""
    members: list[Member] = []

    async def make(
        email: str, display_name: str, affiliation: str, role: Role = Role.CONTRIBUTOR
    ) -> Member:
        user = await make_account(
            email=email, role=role, display_name=display_name, affiliation=affiliation
        )
        member = Member(transport=httpx.ASGITransport(app=app), base_url="https://test")
        members.append(member)
        member.user = user
        member.csrf_token = await sign_in(member, email)
        member.headers.update(csrf(member.csrf_token))
        return member

    yield make
    for member in members:
        await member.aclose()


@pytest.fixture
async def contributor(make_member: Callable[..., Awaitable[Member]]) -> Member:
    """A signed-in contributor."""
    return await make_member("ada@example.org", "Ada Lovelace", "Analytical Lab")


@pytest.fixture
async def second_contributor(make_member: Callable[..., Awaitable[Member]]) -> Member:
    """Another signed-in contributor, to review the first one's work."""
    return await make_member("grace@example.org", "Grace Hopper", "Compiler Lab")


@pytest.fixture
async def admin(make_member: Callable[..., Awaitable[Member]]) -> Member:
    """A signed-in administrator."""
    return await make_member("root@example.org", "Root Admin", "Admin Lab", Role.ADMIN)
