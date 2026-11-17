"""`GET /auth/config`: what the sign-up screen needs before anyone signs in."""

import httpx
import pytest

from app.core.config import settings


async def test_registration_is_reported_closed_by_default(client: httpx.AsyncClient) -> None:
    response = await client.get("/auth/config")

    assert response.status_code == 200
    assert response.json() == {"registration_enabled": False}


@pytest.mark.usefixtures("registration_open")
async def test_registration_is_reported_open_when_the_setting_says_so(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/auth/config")

    assert response.json() == {"registration_enabled": True}


async def test_the_configuration_is_public_and_follows_the_setting_live(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", True)
    assert (await client.get("/auth/config")).json()["registration_enabled"] is True
    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", False)
    assert (await client.get("/auth/config")).json()["registration_enabled"] is False


async def test_the_configuration_holds_nothing_else(client: httpx.AsyncClient) -> None:
    """No personal data and no other setting: the screens read this without a session."""
    response = await client.get("/auth/config")

    assert set(response.json()) == {"registration_enabled"}
    assert "set-cookie" not in response.headers
