"""The API reports Corese failures explicitly (AGENTS.md, non-negotiable rule 9)."""

import httpx

from tests.conftest import FakeCorese


async def test_authors_come_from_the_sparql_results(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.returns(["name"], [{"name": "Aelian"}, {"name": "Pliny"}])

    response = await client.get("/getAuthors")

    assert response.status_code == 200
    assert response.json() == [{"name": "Aelian"}, {"name": "Pliny"}]


async def test_unreachable_corese_returns_502(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    corese.raises(httpx.ConnectError("connection refused"))

    response = await client.get("/getAuthors")

    assert response.status_code == 502


async def test_corese_timeout_returns_504(client: httpx.AsyncClient, corese: FakeCorese) -> None:
    corese.raises(httpx.ReadTimeout("timed out"))

    response = await client.get("/getAuthors")

    assert response.status_code == 504
