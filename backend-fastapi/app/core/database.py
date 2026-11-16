"""The application database: SQLAlchemy 2 on SQLite, with the async engine (aiosqlite).

The schema belongs to Alembic (`migrations/`), never to the application code. SQLite accepts
one writer at a time (docs/architecture.md, "Performance and concurrency"): the engine runs
in WAL mode with a busy timeout, and a request keeps its transactions short (each service
operation commits as soon as it is done).

Datetimes are timezone-aware UTC in Python. SQLite has no timezone-aware type, so
`UtcDateTime` stores them as naive UTC text (`YYYY-MM-DD HH:MM:SS.ffffff`) and gives them
back as aware UTC values. Comparisons in SQL are therefore valid, because every stored value
is UTC.
"""

from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, Request
from sqlalchemy import DateTime, MetaData, TypeDecorator, event
from sqlalchemy.engine import Dialect
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# Named constraints: SQLite batch migrations (`render_as_batch`) need names to alter a table.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

SQLITE_PRAGMAS = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA busy_timeout=5000",
    "PRAGMA foreign_keys=ON",
)


class Base(DeclarativeBase):
    """Base of the typed SQLAlchemy models; `Base.metadata` is what Alembic compares."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UtcDateTime(TypeDecorator[datetime]):
    """A `datetime` column that only holds timezone-aware values, stored as naive UTC."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Convert an aware datetime to naive UTC; refuse a naive one."""
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("a naive datetime cannot be stored: use timezone-aware UTC")
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        """Give the stored naive UTC value back as an aware UTC datetime."""
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


def _apply_pragmas(dbapi_connection: Any, connection_record: Any) -> None:
    """Set the SQLite pragmas on every new connection of the engine."""
    cursor = dbapi_connection.cursor()
    try:
        for pragma in SQLITE_PRAGMAS:
            cursor.execute(pragma)
    finally:
        cursor.close()


class Database:
    """An async engine and its session maker, built for one database URL.

    The application builds one in its lifespan (`app.state.database`); tests build one per
    temporary database. Nothing in this module opens a connection at import time.
    """

    def __init__(self, url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(url)
        event.listen(self.engine.sync_engine, "connect", _apply_pragmas)
        self.session_maker = async_sessionmaker(self.engine, expire_on_commit=False)

    async def dispose(self) -> None:
        """Close every connection of the pool."""
        await self.engine.dispose()


def get_database(request: Request) -> Database:
    """FastAPI dependency giving the database that the lifespan (or a test) set up."""
    database: Database = request.app.state.database
    return database


async def get_db(database: Database = Depends(get_database)) -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding one session per request, closed when the request ends."""
    async with database.session_maker() as session:
        yield session
