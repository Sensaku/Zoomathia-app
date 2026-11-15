"""Checks the test doubles defined in conftest.py."""

import os
from pathlib import Path

import httpx
import pytest
import respx

from app.core.config import settings
from tests.conftest import FakeCorese, unmatched_requests


def make_router() -> tuple[respx.MockRouter, httpx.Client]:
    router = respx.MockRouter(assert_all_called=False, assert_all_mocked=False)
    return router, httpx.Client(transport=httpx.MockTransport(router.handler))


def test_unmatched_requests_lists_only_the_requests_matching_no_route() -> None:
    router, http = make_router()
    router.route(host="known.test").respond(200)

    http.get("http://known.test/ok")
    http.get("http://stray.test/oops?x=1")

    assert unmatched_requests(router) == ["http://stray.test/oops?x=1"]


def test_fake_corese_records_a_query_sent_as_url_parameter() -> None:
    router, http = make_router()
    corese = FakeCorese(router)

    response = http.get(settings.SPARQL_ENDPOINT, params={"query": "SELECT 1"})

    assert response.status_code == 200
    assert corese.queries == ["SELECT 1"]
    assert corese.malformed == []


def test_fake_corese_records_a_query_sent_as_form_body() -> None:
    router, http = make_router()
    corese = FakeCorese(router)

    response = http.post(settings.SPARQL_ENDPOINT, data={"query": "SELECT 2"})

    assert response.status_code == 200
    assert corese.queries == ["SELECT 2"]
    assert corese.malformed == []


def test_fake_corese_records_a_request_without_query_as_malformed() -> None:
    router, http = make_router()
    corese = FakeCorese(router)

    response = http.get(settings.SPARQL_ENDPOINT)

    assert response.status_code == 400
    assert corese.queries == []
    assert len(corese.malformed) == 1


def test_fake_corese_records_a_sparql_query_body_with_a_charset_suffix() -> None:
    router, http = make_router()
    corese = FakeCorese(router)

    response = http.post(
        settings.SPARQL_ENDPOINT,
        content=b"SELECT 3",
        headers={"content-type": "application/sparql-query; charset=utf-8"},
    )

    assert response.status_code == 200
    assert corese.queries == ["SELECT 3"]
    assert corese.malformed == []


INNER_CONFTEST = """
from tests.conftest import network_guard, fresh_sparql_cache, fresh_database, corese  # noqa: F401
"""


def run_inner(pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch) -> pytest.RunResult:
    """Run the inner tests in a fresh interpreter, so that they use the real fixtures.

    In process, the outer test's own network guard is already patching httpx, and the
    inner guard would never see the stray request.
    """
    backend = str(Path(__file__).resolve().parent.parent)
    existing = os.environ.get("PYTHONPATH")
    monkeypatch.setenv("PYTHONPATH", backend + (os.pathsep + existing if existing else ""))
    return pytester.runpytest_subprocess("-p", "no:cacheprovider")


def test_network_guard_fails_a_test_that_sends_an_unmocked_request(
    pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytester.makeconftest(INNER_CONFTEST)
    pytester.makepyfile(
        """
        import httpx

        def test_stray_request():
            try:
                httpx.get("http://stray.test/oops")
            except Exception:
                pass  # the application may swallow the error of a blocked request
        """
    )

    result = run_inner(pytester, monkeypatch)

    result.assert_outcomes(passed=1, errors=1)
    result.stdout.fnmatch_lines(["*request(s) matched no mocked route: http://stray.test/oops*"])


def test_corese_fixture_fails_a_test_that_sends_a_request_without_query(
    pytester: pytest.Pytester, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytester.makeconftest(INNER_CONFTEST)
    pytester.makepyfile(
        """
        import httpx
        from app.core.config import settings

        def test_no_query(corese):
            httpx.get(settings.SPARQL_ENDPOINT)
        """
    )

    result = run_inner(pytester, monkeypatch)

    result.assert_outcomes(passed=1, errors=1)
    result.stdout.fnmatch_lines(["*Corese received request(s) without a SPARQL query*"])
