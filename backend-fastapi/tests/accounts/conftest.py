"""Fixtures and helpers that only the accounts tests use.

The shared ones (clock, hasher, `make_account`, `new_client`, `sign_in`, `csrf`...) are in
`tests/conftest.py` and `tests/support/accounts.py`.
"""

from sqlalchemy import select

from app.accounts.models import User, UserSession
from app.core.database import Database

NEW_PASSWORD = "another long passphrase"
SESSION_COOKIE = "zoomathia_session"


async def stored_sessions(database: Database) -> list[UserSession]:
    async with database.session_maker() as session:
        return list((await session.execute(select(UserSession))).scalars())


async def stored_user(database: Database, email: str) -> User:
    async with database.session_maker() as session:
        return (await session.execute(select(User).where(User.email == email))).scalar_one()
