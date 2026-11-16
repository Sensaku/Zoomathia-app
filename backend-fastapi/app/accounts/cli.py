"""Server command that creates the first administrator (decision D2, 2026-11-16).

    python -m app.accounts.cli create-admin --email E --name N --affiliation A

In Docker: `docker compose exec backend python -m app.accounts.cli create-admin ...`.

The password is typed twice at a prompt that does not echo it: it never goes through the
environment, the command line or the logs, and the command prints no secret. The database
must have been migrated (`alembic upgrade head`).
"""

import argparse
import asyncio
import getpass
import sys
from collections.abc import Callable, Sequence

from pydantic import TypeAdapter, ValidationError

from app.accounts.passwords import PasswordHasher
from app.accounts.repository import AccountRepository
from app.accounts.schemas import MAX_NAME_LENGTH, Email
from app.accounts.service import AccountService
from app.core.clock import utcnow
from app.core.config import settings
from app.core.database import Database
from app.core.migrations import DatabaseNotMigratedError, ensure_database_is_current
from app.shared.domain_errors import DomainError

PasswordPrompt = Callable[[str], str]


def build_parser() -> argparse.ArgumentParser:
    """The command line of the module."""
    parser = argparse.ArgumentParser(prog="python -m app.accounts.cli", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin", help="create an active administrator account")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True, help="display name")
    create.add_argument("--affiliation", required=True)
    return parser


def _ask_password(prompt: PasswordPrompt) -> str:
    """Ask for the password twice; both entries must match."""
    password = prompt("Password: ")
    if prompt("Repeat the password: ") != password:
        raise ValueError("The two passwords differ.")
    return password


def _clean_text(value: str, label: str) -> str:
    text = value.strip()
    if not text or len(text) > MAX_NAME_LENGTH:
        raise ValueError(f"The {label} must have 1 to {MAX_NAME_LENGTH} characters.")
    return text


async def create_admin(email: str, name: str, affiliation: str, password: str) -> int:
    """Create the admin in the database of the settings and return its id."""
    database = Database(settings.DATABASE_URL)
    try:
        await ensure_database_is_current(database)
        async with database.session_maker() as session:
            service = AccountService(AccountRepository(session), PasswordHasher(), utcnow)
            user = await service.create_admin(email, name, affiliation, password)
            return user.id
    finally:
        await database.dispose()


def main(argv: Sequence[str] | None = None, prompt: PasswordPrompt = getpass.getpass) -> int:
    """Run the command; returns the process exit code (0 on success)."""
    args = build_parser().parse_args(argv)
    try:
        email = TypeAdapter(Email).validate_python(args.email)
        name = _clean_text(args.name, "name")
        affiliation = _clean_text(args.affiliation, "affiliation")
        password = _ask_password(prompt)
        user_id = asyncio.run(create_admin(email, name, affiliation, password))
    except ValidationError:
        return _fail("The email address is not valid.")
    except (ValueError, DomainError, DatabaseNotMigratedError) as error:
        return _fail(error.message if isinstance(error, DomainError) else str(error))
    print(f"Administrator account created (id {user_id}).")
    return 0


def _fail(message: str) -> int:
    print(f"Error: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
