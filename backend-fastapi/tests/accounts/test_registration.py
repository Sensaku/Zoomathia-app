"""Registration, activation and the status of an account (RM-CPT-01, RM-CPT-02, RM-CPT-03)."""

from collections.abc import Callable

import httpx
from sqlalchemy import select

from app.accounts.models import Role, User, UserStatus
from app.core.database import Database
from tests.accounts.conftest import stored_user
from tests.support.accounts import PASSWORD, MakeAccount, csrf, error_code, sign_in

REGISTRATION = {
    "email": "  New.Person@Example.org ",
    "password": PASSWORD,
    "display_name": "New Person",
    "affiliation": "University of Somewhere",
    "accept_license": True,
}


async def test_rm_cpt_02_registration_creates_a_pending_contributor(
    client: httpx.AsyncClient, database: Database, registration_open: None
) -> None:
    response = await client.post("/auth/register", json=REGISTRATION)

    assert response.status_code == 202
    user = await stored_user(database, "new.person@example.org")
    assert (user.status, user.role) == (UserStatus.PENDING, Role.CONTRIBUTOR)
    assert user.license_accepted_at is not None  # RM-LIC-02


async def test_rm_cpt_02_registration_is_refused_while_registrations_are_closed(
    client: httpx.AsyncClient, database: Database
) -> None:
    response = await client.post("/auth/register", json=REGISTRATION)

    assert response.status_code == 403
    assert error_code(response) == "registration_closed"
    async with database.session_maker() as session:
        assert (await session.execute(select(User))).first() is None


async def test_rm_lic_02_registration_requires_the_licence_to_be_accepted(
    client: httpx.AsyncClient, registration_open: None
) -> None:
    response = await client.post("/auth/register", json={**REGISTRATION, "accept_license": False})

    assert response.status_code == 422


async def test_rm_cpt_02_a_duplicate_registration_answers_alike_and_changes_nothing(
    client: httpx.AsyncClient, database: Database, registration_open: None
) -> None:
    first = await client.post("/auth/register", json=REGISTRATION)
    before = await stored_user(database, "new.person@example.org")

    other = {**REGISTRATION, "display_name": "Someone Else", "password": "a different passphrase"}
    second = await client.post("/auth/register", json=other)

    assert (second.status_code, second.json()) == (first.status_code, first.json())
    after = await stored_user(database, "new.person@example.org")
    assert (after.display_name, after.password_hash) == (before.display_name, before.password_hash)


async def test_rm_cpt_01_the_password_is_stored_as_argon2id_and_never_returned(
    client: httpx.AsyncClient,
    database: Database,
    make_account: MakeAccount,
    registration_open: None,
) -> None:
    registered = await client.post("/auth/register", json=REGISTRATION)
    await make_account(email="admin@example.org", role=Role.ADMIN)
    await sign_in(client, "admin@example.org")
    listing = await client.get("/admin/users")

    assert registered.status_code == 202
    assert (await stored_user(database, "new.person@example.org")).password_hash.startswith(
        "$argon2id$"
    )
    assert PASSWORD not in registered.text + listing.text
    assert "password" not in listing.text and "$argon2" not in listing.text


async def test_rm_cpt_02_a_pending_account_cannot_log_in(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account(status=UserStatus.PENDING)

    response = await client.post(
        "/auth/login", json={"email": "member@example.org", "password": PASSWORD}
    )

    assert response.status_code == 403
    assert error_code(response) == "account_pending"
    assert "set-cookie" not in response.headers


async def test_rm_cpt_02_an_account_can_log_in_once_an_admin_activated_it(
    client: httpx.AsyncClient,
    new_client: Callable[[], httpx.AsyncClient],
    make_account: MakeAccount,
) -> None:
    pending = await make_account(status=UserStatus.PENDING)
    await make_account(email="admin@example.org", role=Role.ADMIN)
    csrf_token = await sign_in(client, "admin@example.org")

    activated = await client.post(f"/admin/users/{pending.id}/activate", headers=csrf(csrf_token))

    assert activated.status_code == 200
    assert activated.json()["status"] == "active"
    await sign_in(new_client())


async def test_rm_cpt_03_a_deactivated_account_cannot_log_in(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account(status=UserStatus.DEACTIVATED)

    response = await client.post(
        "/auth/login", json={"email": "member@example.org", "password": PASSWORD}
    )

    assert response.status_code == 403
    assert error_code(response) == "account_deactivated"


async def test_rm_cpt_02_the_status_of_an_account_is_not_revealed_without_its_password(
    client: httpx.AsyncClient, make_account: MakeAccount
) -> None:
    await make_account(status=UserStatus.PENDING)

    response = await client.post(
        "/auth/login", json={"email": "member@example.org", "password": "not the password"}
    )

    assert response.status_code == 401
    assert error_code(response) == "invalid_credentials"
