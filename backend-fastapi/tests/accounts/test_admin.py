"""Administration of accounts (RM-CPT-02, RM-CPT-03, RM-CPT-04)."""

import asyncio
from collections.abc import Callable

import httpx
import pytest
from sqlalchemy import select

from app.accounts.models import Role, User, UserStatus
from app.accounts.passwords import PasswordHasher
from app.accounts.repository import AccountRepository
from app.accounts.service import AccountService
from app.core.database import Database
from app.shared.domain_errors import Conflict
from tests.accounts.conftest import stored_user
from tests.support.accounts import FakeClock, MakeAccount, csrf, error_code, sign_in


async def admin_session(client: httpx.AsyncClient, make_account: MakeAccount) -> tuple[User, str]:
    admin = await make_account(email="admin@example.org", role=Role.ADMIN)
    return admin, await sign_in(client, "admin@example.org")


async def test_rm_cpt_02_an_anonymous_caller_is_refused_on_every_admin_route(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account()
    base = f"/admin/users/{member.id}"

    responses = [
        await client.get("/admin/users"),
        await client.post(f"{base}/activate"),
        await client.post(f"{base}/deactivate"),
        await client.put(f"{base}/role", json={"role": "admin"}),
        await client.post(f"{base}/password-reset"),
        await client.delete(base),
    ]

    assert [response.status_code for response in responses] == [401] * 6
    assert {error_code(response) for response in responses} == {"not_authenticated"}


async def test_rm_cpt_02_a_contributor_is_refused_on_every_admin_route(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account()
    headers = csrf(await sign_in(client))
    base = f"/admin/users/{member.id}"

    responses = [
        await client.get("/admin/users"),
        await client.post(f"{base}/activate", headers=headers),
        await client.post(f"{base}/deactivate", headers=headers),
        await client.put(f"{base}/role", json={"role": "admin"}, headers=headers),
        await client.post(f"{base}/password-reset", headers=headers),
        await client.delete(base, headers=headers),
    ]

    assert [response.status_code for response in responses] == [403] * 6
    assert {error_code(response) for response in responses} == {"admin_required"}


async def test_rm_cpt_02_the_admin_routes_enforce_csrf(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account(status=UserStatus.PENDING)
    await admin_session(client, make_account)

    response = await client.post(f"/admin/users/{member.id}/activate")

    assert (response.status_code, error_code(response)) == (403, "csrf_failed")


async def test_rm_cpt_02_activation_records_who_activated_and_when(
    client: httpx.AsyncClient,
    database: Database,
    make_account: MakeAccount,
) -> None:
    member = await make_account(status=UserStatus.PENDING)
    admin, csrf_token = await admin_session(client, make_account)

    response = await client.post(f"/admin/users/{member.id}/activate", headers=csrf(csrf_token))

    activated = await stored_user(database, member.email)
    assert response.status_code == 200
    assert activated.status is UserStatus.ACTIVE
    assert activated.activated_by_id == admin.id
    assert activated.activated_at is not None


async def test_rm_cpt_02_activating_an_active_account_is_an_invalid_transition(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account()
    _, csrf_token = await admin_session(client, make_account)

    response = await client.post(f"/admin/users/{member.id}/activate", headers=csrf(csrf_token))

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


async def test_rm_cpt_03_a_deactivated_account_can_be_activated_again(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account(status=UserStatus.DEACTIVATED)
    _, csrf_token = await admin_session(client, make_account)

    response = await client.post(f"/admin/users/{member.id}/activate", headers=csrf(csrf_token))

    assert response.json()["status"] == "active"


async def test_rm_cpt_03_deactivating_twice_is_an_invalid_transition(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account(status=UserStatus.DEACTIVATED)
    _, csrf_token = await admin_session(client, make_account)

    response = await client.post(f"/admin/users/{member.id}/deactivate", headers=csrf(csrf_token))

    assert (response.status_code, error_code(response)) == (409, "invalid_transition")


async def test_rm_cpt_02_an_admin_cannot_deactivate_demote_or_delete_their_own_account(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    admin, csrf_token = await admin_session(client, make_account)
    headers = csrf(csrf_token)
    base = f"/admin/users/{admin.id}"

    responses = [
        await client.post(f"{base}/deactivate", headers=headers),
        await client.put(f"{base}/role", json={"role": "contributor"}, headers=headers),
        await client.delete(base, headers=headers),
    ]

    assert [response.status_code for response in responses] == [409] * 3
    assert {error_code(response) for response in responses} == {"own_account"}


async def test_rm_cpt_02_an_admin_keeps_their_role_when_asked_to_stay_admin(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    admin, csrf_token = await admin_session(client, make_account)

    response = await client.put(
        f"/admin/users/{admin.id}/role", json={"role": "admin"}, headers=csrf(csrf_token)
    )

    assert (response.status_code, response.json()["role"]) == (200, "admin")


async def test_rm_cpt_02_a_role_change_grants_the_admin_routes(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    member = await make_account()
    member_browser = new_client()
    await sign_in(member_browser)
    assert (await member_browser.get("/admin/users")).status_code == 403
    _, admin_csrf = await admin_session(client, make_account)

    promoted = await client.put(
        f"/admin/users/{member.id}/role", json={"role": "admin"}, headers=csrf(admin_csrf)
    )

    assert promoted.json()["role"] == "admin"
    assert (await member_browser.get("/admin/users")).status_code == 200  # same session


async def test_rm_cpt_04_only_a_pending_account_can_be_deleted(
    client: httpx.AsyncClient, database: Database, make_account: MakeAccount
) -> None:
    pending = await make_account(email="pending@example.org", status=UserStatus.PENDING)
    active = await make_account(email="active@example.org")
    deactivated = await make_account(email="gone@example.org", status=UserStatus.DEACTIVATED)
    _, csrf_token = await admin_session(client, make_account)
    headers = csrf(csrf_token)

    refused = [
        await client.delete(f"/admin/users/{account.id}", headers=headers)
        for account in (active, deactivated)
    ]
    deleted = await client.delete(f"/admin/users/{pending.id}", headers=headers)

    assert [response.status_code for response in refused] == [409, 409]
    assert {error_code(response) for response in refused} == {"invalid_transition"}
    assert deleted.status_code == 204
    async with database.session_maker() as session:
        emails = {user.email for user in (await session.execute(select(User))).scalars()}
    assert "pending@example.org" not in emails and "active@example.org" in emails


async def test_rm_cpt_02_an_unknown_account_gives_404(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    _, csrf_token = await admin_session(client, make_account)

    response = await client.post("/admin/users/9999/activate", headers=csrf(csrf_token))

    assert response.status_code == 404


async def test_rm_cpt_02_the_list_is_filtered_paginated_and_newest_first(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    for number in range(3):
        await make_account(email=f"pending{number}@example.org", status=UserStatus.PENDING)
    await admin_session(client, make_account)

    everything = await client.get("/admin/users")
    pending = await client.get("/admin/users", params={"status": "pending", "limit": 2})
    second_page = await client.get(
        "/admin/users", params={"status": "pending", "limit": 2, "offset": 2}
    )

    assert everything.json()["total"] == 4
    assert pending.json()["total"] == 3
    assert [user["email"] for user in pending.json()["items"]] == [
        "pending2@example.org",
        "pending1@example.org",
    ]
    assert [user["email"] for user in second_page.json()["items"]] == ["pending0@example.org"]


async def test_rm_acc_02_the_list_page_size_is_bounded(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await admin_session(client, make_account)

    too_large = await client.get("/admin/users", params={"limit": 101})
    largest = await client.get("/admin/users", params={"limit": 100})

    assert (too_large.status_code, largest.status_code) == (422, 200)


async def test_rm_cpt_01_no_response_carries_a_hash_or_a_token(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account()
    _, csrf_token = await admin_session(client, make_account)

    listing = await client.get("/admin/users")
    reset = await client.post(f"/admin/users/{member.id}/password-reset", headers=csrf(csrf_token))

    assert "hash" not in listing.text and "argon2" not in listing.text
    assert set(reset.json()) == {"token", "expires_at"}


async def run_as_admin(
    database: Database, clock: FakeClock, action: str, admin: User, target: User
) -> str:
    """Run an admin action on a session of its own: "done", or the code of the conflict."""
    async with database.session_maker() as session:
        service = AccountService(AccountRepository(session), PasswordHasher(), clock)
        try:
            if action == "deactivate":
                await service.deactivate(admin, target.id)
            else:
                await service.set_role(admin, target.id, Role.CONTRIBUTOR)
        except Conflict as conflict:
            return conflict.code
        return "done"


@pytest.mark.parametrize("action", ["deactivate", "demote"])
async def test_rm_cpt_03_two_admins_removing_each_other_at_once_leave_one_active_admin(
    database: Database, clock: FakeClock, make_account: MakeAccount, action: str
) -> None:
    first = await make_account(email="first@example.org", role=Role.ADMIN)
    second = await make_account(email="second@example.org", role=Role.ADMIN)

    outcomes = await asyncio.gather(
        run_as_admin(database, clock, action, first, second),
        run_as_admin(database, clock, action, second, first),
    )

    assert sorted(outcomes) == ["done", "last_admin"]
    async with database.session_maker() as session:
        admins = (
            await session.execute(
                select(User).where(User.role == Role.ADMIN, User.status == UserStatus.ACTIVE)
            )
        ).scalars()
        assert len(list(admins)) == 1


@pytest.mark.parametrize("action", ["deactivate", "demote"])
async def test_rm_cpt_03_the_last_active_admin_cannot_be_removed_by_a_stale_admin(
    database: Database, clock: FakeClock, make_account: MakeAccount, action: str
) -> None:
    """The acting admin was deactivated a moment ago: the target is now the only one left."""
    acting = await make_account(email="acting@example.org", role=Role.ADMIN)
    last = await make_account(email="last@example.org", role=Role.ADMIN)
    async with database.session_maker() as session:
        stored = await session.get(User, acting.id)
        assert stored is not None
        stored.status = UserStatus.DEACTIVATED
        await session.commit()

    outcome = await run_as_admin(database, clock, action, acting, last)

    assert outcome == "last_admin"
    assert (await stored_user(database, last.email)).role is Role.ADMIN
    assert (await stored_user(database, last.email)).status is UserStatus.ACTIVE


async def test_rm_cpt_03_the_last_admin_guard_does_not_block_other_accounts(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    member = await make_account()
    deactivated_admin = await make_account(
        email="old@example.org", role=Role.ADMIN, status=UserStatus.DEACTIVATED
    )
    _, csrf_token = await admin_session(client, make_account)
    headers = csrf(csrf_token)

    first = await client.post(f"/admin/users/{member.id}/deactivate", headers=headers)
    second = await client.put(
        f"/admin/users/{deactivated_admin.id}/role", json={"role": "contributor"}, headers=headers
    )

    assert (first.status_code, second.status_code) == (200, 200)
