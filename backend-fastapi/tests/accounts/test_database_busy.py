"""A database that cannot take a request in time answers 503, never an unmapped 500 (rule 9)."""

import sqlite3
from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from app.core.database import get_db
from app.main import app


def fail_with(error: Exception) -> None:
    async def broken() -> AsyncIterator[None]:
        raise error
        yield

    app.dependency_overrides[get_db] = broken


@pytest.fixture(autouse=True)
def restore_database_dependency() -> Iterator[None]:
    yield
    app.dependency_overrides.pop(get_db, None)


async def test_rm_acc_02_an_exhausted_connection_pool_answers_503_with_retry_after(
    client: httpx.AsyncClient,
) -> None:
    fail_with(PoolTimeoutError("QueuePool limit of size 5 overflow 10 reached"))

    response = await client.post(
        "/auth/login", json={"email": "member@example.org", "password": "irrelevant"}
    )

    assert response.status_code == 503
    assert response.json()["code"] == "database_busy"
    assert response.headers["retry-after"] == "5"


async def test_rm_acc_02_a_sqlite_write_lock_that_outlasts_the_busy_timeout_answers_503(
    client: httpx.AsyncClient,
) -> None:
    fail_with(OperationalError("UPDATE", {}, sqlite3.OperationalError("database is locked")))

    response = await client.get("/auth/me")

    assert (response.status_code, response.json()["code"]) == (503, "database_busy")
