"""Alembic environment: a synchronous engine on the application database.

The URL comes from the `sqlalchemy.url` option when the caller sets it (tests, the
application), and from the settings otherwise (the `alembic` command line).
"""

from logging.config import fileConfig
from typing import Any

from alembic import context
from sqlalchemy import create_engine, pool

import app.accounts.models  # noqa: F401  (registers the account tables in Base.metadata)
import app.contributions.models  # noqa: F401  (registers the contribution tables too)
import app.queries.models  # noqa: F401  (and the saved queries table)
from app.core.config import settings
from app.core.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def include_object(
    obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any
) -> bool:
    """Leave out the tables that have no model.

    Every table of the application has a model since revision 0004; the guard stays so that
    autogenerate never proposes to drop a table that it does not know.
    """
    return not (type_ == "table" and reflected and compare_to is None)


def database_url() -> str:
    """The URL of the database to migrate."""
    return config.get_main_option("sqlalchemy.url") or settings.ALEMBIC_DATABASE_URL


def run_migrations_offline() -> None:
    """Emit the SQL of the migrations without a connection."""
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply the migrations through a connection."""
    engine = create_engine(database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
