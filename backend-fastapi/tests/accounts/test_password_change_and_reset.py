"""Password change by the owner and reset by token (RM-CPT-01, RM-CPT-02, decision D4)."""

from collections.abc import Callable

import httpx
from sqlalchemy import select

from app.accounts.models import PasswordResetToken, Role
from app.accounts.tokens import hash_token
from app.core.database import Database
from tests.accounts.conftest import NEW_PASSWORD
from tests.support.accounts import PASSWORD, FakeClock, MakeAccount, csrf, error_code, sign_in

LOGIN = {"email": "member@example.org", "password": PASSWORD}


async def test_rm_cpt_01_a_password_change_revokes_the_other_sessions_and_keeps_this_one(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    await make_account()
    csrf_token = await sign_in(client)
    other_browser = new_client()
    await sign_in(other_browser)

    response = await client.post(
        "/auth/password",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        headers=csrf(csrf_token),
    )

    assert response.status_code == 204
    assert (await client.get("/auth/me")).status_code == 200
    assert (await other_browser.get("/auth/me")).status_code == 401
    new_login = await new_client().post("/auth/login", json={**LOGIN, "password": NEW_PASSWORD})
    assert new_login.status_code == 200


async def test_rm_cpt_01_a_wrong_current_password_gives_403_and_counts_for_the_throttle(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    csrf_token = await sign_in(client)
    attempt = {"current_password": "not my password", "new_password": NEW_PASSWORD}

    for _ in range(5):
        response = await client.post("/auth/password", json=attempt, headers=csrf(csrf_token))
        assert (response.status_code, error_code(response)) == (403, "invalid_credentials")

    locked = await client.post("/auth/password", json=attempt, headers=csrf(csrf_token))
    assert locked.status_code == 429


async def test_rm_cpt_01_the_new_password_must_follow_the_policy(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account()
    csrf_token = await sign_in(client)

    response = await client.post(
        "/auth/password",
        json={"current_password": PASSWORD, "new_password": "short"},
        headers=csrf(csrf_token),
    )

    assert response.status_code == 422
    assert error_code(response) == "invalid_password"


async def issue_token(admin: httpx.AsyncClient, admin_csrf: str, user_id: int) -> httpx.Response:
    return await admin.post(f"/admin/users/{user_id}/password-reset", headers=csrf(admin_csrf))


async def test_rm_cpt_02_an_admin_issues_a_reset_token_that_sets_a_new_password(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    admin_csrf = await sign_in(client, "admin@example.org")
    issued = await issue_token(client, admin_csrf, member.id)

    reset = await new_client().post(
        "/auth/password-reset",
        json={"token": issued.json()["token"], "new_password": NEW_PASSWORD},
    )

    assert issued.status_code == 201
    assert reset.status_code == 204
    login = await new_client().post("/auth/login", json={**LOGIN, "password": NEW_PASSWORD})
    assert login.status_code == 200


async def test_rm_cpt_02_a_reset_token_is_single_use(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    token = (
        await issue_token(client, await sign_in(client, "admin@example.org"), member.id)
    ).json()["token"]
    anonymous = new_client()
    first = await anonymous.post(
        "/auth/password-reset", json={"token": token, "new_password": NEW_PASSWORD}
    )

    second = await anonymous.post(
        "/auth/password-reset", json={"token": token, "new_password": "yet another passphrase"}
    )

    assert first.status_code == 204
    assert (second.status_code, error_code(second)) == (400, "invalid_reset_token")


async def test_rm_cpt_02_a_reset_token_expires_after_72_hours(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    clock: FakeClock,
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    token = (
        await issue_token(client, await sign_in(client, "admin@example.org"), member.id)
    ).json()["token"]
    anonymous = new_client()

    clock.advance(hours=72)
    expired = await anonymous.post(
        "/auth/password-reset", json={"token": token, "new_password": NEW_PASSWORD}
    )

    assert (expired.status_code, error_code(expired)) == (400, "invalid_reset_token")


async def test_rm_cpt_02_a_reset_token_works_just_before_it_expires(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    clock: FakeClock,
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    token = (
        await issue_token(client, await sign_in(client, "admin@example.org"), member.id)
    ).json()["token"]

    clock.advance(hours=71, minutes=59)
    response = await new_client().post(
        "/auth/password-reset", json={"token": token, "new_password": NEW_PASSWORD}
    )

    assert response.status_code == 204


async def test_rm_cpt_02_an_unknown_reset_token_gives_the_same_error(
    client: httpx.AsyncClient,
) -> None:
    response = await client.post(
        "/auth/password-reset", json={"token": "made-up", "new_password": NEW_PASSWORD}
    )

    assert (response.status_code, error_code(response)) == (400, "invalid_reset_token")


async def test_rm_cpt_02_a_reset_revokes_every_session_of_the_account(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    member_browser = new_client()
    await sign_in(member_browser)
    token = (
        await issue_token(client, await sign_in(client, "admin@example.org"), member.id)
    ).json()["token"]

    await new_client().post(
        "/auth/password-reset", json={"token": token, "new_password": NEW_PASSWORD}
    )

    assert (await member_browser.get("/auth/me")).status_code == 401


async def test_rm_cpt_02_only_admins_issue_reset_tokens(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account()
    csrf_token = await sign_in(client)

    response = await issue_token(client, csrf_token, member.id)

    assert (response.status_code, error_code(response)) == (403, "admin_required")


async def test_rm_cpt_02_the_reset_token_is_stored_hashed_and_a_new_one_cancels_the_old(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    database: Database,
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    admin_csrf = await sign_in(client, "admin@example.org")
    first = (await issue_token(client, admin_csrf, member.id)).json()["token"]
    second = (await issue_token(client, admin_csrf, member.id)).json()["token"]

    async with database.session_maker() as session:
        stored = list((await session.execute(select(PasswordResetToken))).scalars())
    old_use = await new_client().post(
        "/auth/password-reset", json={"token": first, "new_password": NEW_PASSWORD}
    )

    assert [record.token_hash for record in stored] == [hash_token(second)]
    assert first not in stored[0].token_hash and second not in stored[0].token_hash
    assert old_use.status_code == 400


async def test_rm_cpt_03_deactivation_cancels_the_unused_reset_tokens(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    await make_account(email="admin@example.org", role=Role.ADMIN)
    admin_csrf = await sign_in(client, "admin@example.org")
    token = (await issue_token(client, admin_csrf, member.id)).json()["token"]
    await client.post(f"/admin/users/{member.id}/deactivate", headers=csrf(admin_csrf))

    response = await new_client().post(
        "/auth/password-reset", json={"token": token, "new_password": NEW_PASSWORD}
    )

    assert response.status_code == 400
