"""Sessions, cookie, CSRF and expiry (RM-CPT-01, decision D4 of 2026-11-16)."""

import logging
from collections.abc import Callable

import httpx
import pytest

from app.accounts.models import Role, User, UserStatus
from app.accounts.tokens import hash_token
from app.core.database import Database
from tests.accounts.conftest import (
    PASSWORD,
    SESSION_COOKIE,
    FakeClock,
    MakeAccount,
    csrf,
    error_code,
    sign_in,
    stored_sessions,
)

PASSWORD_CHANGE = {"current_password": PASSWORD, "new_password": "x" * 20}


async def test_rm_cpt_01_login_sets_an_httponly_strict_secure_cookie(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()

    response = await client.post(
        "/auth/login", json={"email": "member@example.org", "password": PASSWORD}
    )

    cookie = response.headers["set-cookie"].lower()
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    for attribute in ("httponly", "secure", "samesite=strict", "path=/", f"max-age={30 * 86400}"):
        assert attribute in cookie


async def test_rm_cpt_01_the_session_token_is_stored_hashed(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)

    token = client.cookies[SESSION_COOKIE]
    (stored,) = await stored_sessions(database)

    assert stored.token_hash == hash_token(token)
    assert token not in (stored.token_hash, stored.csrf_token)


async def test_rm_cpt_01_me_returns_the_account_and_the_csrf_token(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    csrf_token = await sign_in(client)

    response = await client.get("/auth/me")

    assert response.status_code == 200
    assert response.json()["csrf_token"] == csrf_token
    assert response.json()["user"]["email"] == "member@example.org"
    assert "password" not in response.text


async def test_rm_cpt_01_me_refuses_an_anonymous_caller(client: httpx.AsyncClient) -> None:
    response = await client.get("/auth/me")

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


async def test_rm_cpt_01_login_rotates_the_session_and_drops_the_old_one(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)
    first_token = client.cookies[SESSION_COOKIE]

    await sign_in(client)

    assert client.cookies[SESSION_COOKIE] != first_token
    (only,) = await stored_sessions(database)
    assert only.token_hash == hash_token(client.cookies[SESSION_COOKIE])


async def test_rm_cpt_01_logout_revokes_the_session_on_the_server(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    await make_account()
    csrf_token = await sign_in(client)
    copy_of_the_cookie = new_client()
    copy_of_the_cookie.cookies.set(SESSION_COOKIE, client.cookies[SESSION_COOKIE])

    response = await client.post("/auth/logout", headers=csrf(csrf_token))

    assert response.status_code == 204
    assert (await copy_of_the_cookie.get("/auth/me")).status_code == 401
    assert "max-age=0" in response.headers["set-cookie"].lower()


async def test_rm_cpt_01_logout_without_a_session_only_clears_the_cookie(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post("/auth/logout")

    assert response.status_code == 204
    assert "max-age=0" in response.headers["set-cookie"].lower()


async def test_d4_a_session_expires_after_seven_days_without_activity(
    client: httpx.AsyncClient, clock: FakeClock, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)

    clock.advance(days=6, hours=23)
    assert (await client.get("/auth/me")).status_code == 200  # seen again: the idle clock restarts
    clock.advance(days=6, hours=23)
    assert (await client.get("/auth/me")).status_code == 200
    clock.advance(days=7)

    assert (await client.get("/auth/me")).status_code == 401


async def test_d4_a_session_expires_thirty_days_after_login_even_if_used(
    client: httpx.AsyncClient, clock: FakeClock, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)
    for _ in range(4):  # active every 6 days: never idle, 24 days in
        clock.advance(days=6)
        assert (await client.get("/auth/me")).status_code == 200
    clock.advance(days=5, hours=23)
    assert (await client.get("/auth/me")).status_code == 200  # 29 days 23 hours

    clock.advance(hours=2)

    assert (await client.get("/auth/me")).status_code == 401


async def test_d4_last_seen_is_refreshed_at_most_every_ten_minutes(
    client: httpx.AsyncClient, database: Database, clock: FakeClock, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)
    (created,) = await stored_sessions(database)

    clock.advance(minutes=9)
    await client.get("/auth/me")
    (after_nine,) = await stored_sessions(database)
    clock.advance(minutes=2)
    await client.get("/auth/me")
    (after_eleven,) = await stored_sessions(database)

    assert after_nine.last_seen_at == created.last_seen_at
    assert after_eleven.last_seen_at == clock()


async def test_d4_expired_sessions_are_purged_at_the_next_login(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    database: Database,
    clock: FakeClock,
    make_account: MakeAccount,
) -> None:
    await make_account()
    await sign_in(client)
    clock.advance(days=8)

    await sign_in(new_client())

    (remaining,) = await stored_sessions(database)
    assert remaining.created_at == clock()


async def test_rm_cpt_03_deactivation_revokes_the_sessions_at_once(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await sign_in(client)
    await make_account(email="admin@example.org", role=Role.ADMIN)
    admin = new_client()
    admin_csrf = await sign_in(admin, "admin@example.org")

    response = await admin.post(f"/admin/users/{member.id}/deactivate", headers=csrf(admin_csrf))

    assert response.json()["status"] == UserStatus.DEACTIVATED.value
    assert (await client.get("/auth/me")).status_code == 401


async def test_d4_a_session_of_an_account_that_is_no_longer_active_is_refused(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    member = await make_account()
    await sign_in(client)
    async with database.session_maker() as session:
        stored = await session.get(User, member.id)
        assert stored is not None
        stored.status = UserStatus.DEACTIVATED
        await session.commit()

    assert (await client.get("/auth/me")).status_code == 401


async def test_rm_cpt_01_an_unsafe_request_without_the_csrf_token_is_refused(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)

    response = await client.post("/auth/password", json=PASSWORD_CHANGE)

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"


async def test_rm_cpt_01_an_unsafe_request_with_a_wrong_csrf_token_is_refused(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    await sign_in(client)

    response = await client.post(
        "/auth/password", json=PASSWORD_CHANGE, headers=csrf("not-the-token")
    )

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"


async def test_rm_cpt_01_the_right_csrf_token_is_accepted_and_safe_requests_need_none(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    csrf_token = await sign_in(client)

    changed = await client.post("/auth/password", json=PASSWORD_CHANGE, headers=csrf(csrf_token))

    assert changed.status_code == 204
    assert (await client.get("/auth/me")).status_code == 200


async def test_rm_cpt_01_public_routes_require_a_json_body(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()

    response = await client.post(
        "/auth/login",
        content='{"email": "member@example.org", "password": "x"}',
        headers={"Content-Type": "text/plain"},
    )

    assert response.status_code == 415
    assert error_code(response) == "unsupported_media_type"


async def test_rm_cpt_01_account_events_are_logged_without_secrets_or_emails(
    client: httpx.AsyncClient,
    make_account: MakeAccount,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app.accounts")
    await make_account()
    await client.post("/auth/login", json={"email": "member@example.org", "password": "wrong one"})
    await client.post("/auth/login", json={"email": "nobody@example.org", "password": "wrong two"})
    await sign_in(client)

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "login succeeded: user_id=1" in logged
    for secret in (
        "member@example.org",
        "nobody@example.org",
        PASSWORD,
        "wrong one",
        "wrong two",
        client.cookies[SESSION_COOKIE],
    ):
        assert secret not in logged


async def test_rm_acc_02_credentials_are_not_allowed_on_cross_origin_requests_by_default(
    client: httpx.AsyncClient,
) -> None:
    response = await client.options(
        "/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in response.headers


async def test_rm_cpt_01_responses_that_carry_a_secret_are_not_cacheable(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    login = await client.post(
        "/auth/login", json={"email": "member@example.org", "password": PASSWORD}
    )
    me = await client.get("/auth/me")
    admin = new_client()
    admin_csrf = await sign_in(admin, "admin@example.org")
    reset = await admin.post(f"/admin/users/{member.id}/password-reset", headers=csrf(admin_csrf))

    assert login.headers["cache-control"] == "no-store"
    assert me.headers["cache-control"] == "no-store"
    assert reset.headers["cache-control"] == "no-store"
