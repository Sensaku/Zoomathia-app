"""Alembic helpers: the configuration the application builds itself, and the head check.

Alembic owns the schema (AGENTS.md, rule 5). The application never creates tables: at
startup it only checks that the database is at the latest revision, and refuses to start
otherwise, with the command to run.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.database import Database

MIGRATION_COMMAND = "uv run alembic upgrade head"


class DatabaseNotMigratedError(RuntimeError):
    """The database is not at the latest Alembic revision."""


def alembic_config(database_url: str | None = None) -> Config:
    """The Alembic configuration for the application database.

    Built in code, so the application does not need `alembic.ini` (the file only serves the
    `alembic` command line). `database_url` defaults to the one of the settings.
    """
    config = Config()
    config.set_main_option("script_location", str(Path(settings.BASE_DIR) / "migrations"))
    url = database_url or settings.ALEMBIC_DATABASE_URL
    # ConfigParser interpolates `%`: double it so that a path containing one stays intact.
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def head_revisions() -> set[str]:
    """The revision identifiers that the migration scripts end with."""
    return set(ScriptDirectory.from_config(alembic_config()).get_heads())


async def current_revisions(database: Database) -> set[str]:
    """The revisions recorded in the database; empty when it was never migrated."""
    async with database.engine.connect() as connection:
        try:
            result = await connection.execute(text("SELECT version_num FROM alembic_version"))
        except OperationalError:
            return set()
        return {row[0] for row in result}


async def ensure_database_is_current(database: Database) -> None:
    """Raise `DatabaseNotMigratedError` unless the database is at the latest revision."""
    if await current_revisions(database) != head_revisions():
        raise DatabaseNotMigratedError(
            f'The database is not at the latest migration: run "{MIGRATION_COMMAND}" '
            "from backend-fastapi/ (or start the container, which migrates first), then restart."
        )
