"""Start the backend that the Playwright journeys use, never on `data/staging.db`.

    uv run python -m tests.e2e.stack --api-port 3101 --corese-port 3102 --fixtures ../frontend/e2e/fixtures

It builds a temporary SQLite database with the Alembic migrations, seeds the accounts of
`accounts.json`, starts a fake Corese (`corese.json`) and serves the real application with
uvicorn. OpenTheso is not simulated. Everything is removed at exit.
"""

import argparse
import asyncio
import atexit
import json
import os
import shutil
import sys
import tempfile
import threading
from collections.abc import Sequence
from pathlib import Path


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0] if __doc__ else None)
    parser.add_argument("--api-port", type=int, default=3101)
    parser.add_argument("--corese-port", type=int, default=3102)
    parser.add_argument("--fixtures", type=Path, required=True, help="folder of the fixture files")
    return parser.parse_args(argv)


def configure_environment(corese_port: int) -> Path:
    """Point the settings at a new temporary folder and a local Corese, before `app` loads."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="zoomathia-e2e-")).resolve()
    atexit.register(shutil.rmtree, tmp_dir, ignore_errors=True)
    os.environ["STAGING_DB_PATH"] = str(tmp_dir / "e2e.db")
    os.environ["SPARQL_ENDPOINT"] = f"http://127.0.0.1:{corese_port}/sparql"
    os.environ["SESSION_COOKIE_SECURE"] = "false"
    os.environ["REGISTRATION_ENABLED"] = "false"
    return tmp_dir


def check_isolation(tmp_dir: Path) -> None:
    """Refuse to go on unless the database is inside `tmp_dir` (a `.env` must never win)."""
    from app.core.config import settings

    database = Path(settings.STAGING_DB_PATH).resolve()
    if not database.is_relative_to(tmp_dir):
        sys.exit(f"Refusing to start: the database {database} is not inside {tmp_dir}.")
    if not settings.SPARQL_ENDPOINT.startswith("http://127.0.0.1:"):
        sys.exit(f"Refusing to start: the SPARQL endpoint is {settings.SPARQL_ENDPOINT}.")


def migrate() -> None:
    from alembic import command

    from app.core.migrations import alembic_config

    command.upgrade(alembic_config(), "head")


async def seed_accounts(accounts_file: Path) -> None:
    """Insert the accounts of the file, all active, with the real password hasher."""
    from app.accounts.models import Role, User, UserStatus
    from app.accounts.passwords import PasswordHasher
    from app.core.clock import utcnow
    from app.core.config import settings
    from app.core.database import Database

    accounts: dict[str, dict[str, str]] = json.loads(accounts_file.read_text(encoding="utf-8"))
    hasher = PasswordHasher()
    database = Database(settings.DATABASE_URL)
    try:
        async with database.session_maker() as session:
            for account in accounts.values():
                now = utcnow()
                session.add(
                    User(
                        email=account["email"].strip().lower(),
                        display_name=account["displayName"],
                        affiliation=account["affiliation"],
                        password_hash=await hasher.hash(account["password"]),
                        role=Role(account["role"]),
                        status=UserStatus.ACTIVE,
                        license_accepted_at=now,
                        created_at=now,
                        activated_at=now,
                    )
                )
            await session.commit()
    finally:
        await database.dispose()


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    fixtures: Path = args.fixtures.resolve()
    tmp_dir = configure_environment(args.corese_port)
    check_isolation(tmp_dir)

    import uvicorn

    from app.main import app
    from tests.e2e.fake_corese import load_rules, make_server

    migrate()
    asyncio.run(seed_accounts(fixtures / "accounts.json"))

    corese = make_server(args.corese_port, load_rules(fixtures / "corese.json"))
    threading.Thread(target=corese.serve_forever, daemon=True).start()
    try:
        uvicorn.run(app, host="127.0.0.1", port=args.api_port, log_level="warning")
    finally:
        corese.shutdown()


if __name__ == "__main__":
    main()
