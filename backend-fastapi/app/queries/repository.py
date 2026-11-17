"""Database access of the saved queries. No business rule is decided here.

Edits and deletions are one conditional statement: the conditions that make them legal (not a
native question, the right author or an admin) sit in the `WHERE` clause, so that a request
racing a deletion cannot act on a row that is gone. The statement returns whether it touched
a row; the service then classifies a failure with the permission policy
(`app.queries.policy`), which states the same rules.

Methods only stage changes; the service decides when to `commit`.
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any, cast

from sqlalchemy import ColumnElement, CursorResult, delete, func, or_, select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.viewer import Viewer
from app.queries.models import SavedQuery
from app.shared.sql import LIKE_ESCAPE, escape_like


def matches_search(search: str) -> ColumnElement[bool]:
    """Queries whose title or description contain `search`, ignoring ASCII case.

    The text is matched literally: its wildcards lose their meaning (RM-ACC-02).
    """
    pattern = f"%{escape_like(search.strip().lower())}%"
    return or_(
        func.lower(SavedQuery.title).like(pattern, escape=LIKE_ESCAPE),
        func.lower(SavedQuery.description).like(pattern, escape=LIKE_ESCAPE),
    )


class QueryRepository:
    """Saved queries (table `saved_queries`)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def commit(self) -> None:
        """Commit the current transaction."""
        await self._session.commit()

    async def rollback(self) -> None:
        """Roll the current transaction back."""
        await self._session.rollback()

    async def get(self, query_id: int) -> SavedQuery | None:
        """The query with this id, read afresh from the database, with its author."""
        result = await self._session.execute(
            select(SavedQuery)
            .where(SavedQuery.id == query_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def add(self, query: SavedQuery) -> None:
        """Stage a new query and flush it, so that a constraint fails here."""
        self._session.add(query)
        await self._session.flush()

    async def page(
        self, conditions: Sequence[ColumnElement[bool]], limit: int, offset: int
    ) -> tuple[list[SavedQuery], int]:
        """A page of queries, native questions first then by id, and the total count."""
        rows = await self._session.execute(
            select(SavedQuery)
            .where(*conditions)
            .order_by(SavedQuery.is_builtin.desc(), SavedQuery.id)
            .limit(limit)
            .offset(offset)
        )
        total = await self._session.execute(
            select(func.count()).select_from(SavedQuery).where(*conditions)
        )
        return list(rows.scalars()), total.scalar_one()

    async def first(self, limit: int) -> list[SavedQuery]:
        """At most `limit` queries in the order of `page`: the source of the JSON export."""
        rows = await self._session.execute(
            select(SavedQuery).order_by(SavedQuery.is_builtin.desc(), SavedQuery.id).limit(limit)
        )
        return list(rows.scalars())

    async def builtin_ids(self) -> set[int]:
        """The ids of the native competency questions that the database already holds."""
        rows = await self._session.execute(
            select(SavedQuery.id).where(SavedQuery.is_builtin.is_(True))
        )
        return set(rows.scalars())

    async def non_builtin_among(self, ids: Sequence[int]) -> list[int]:
        """The ids, among `ids`, that a personal (non-native) query holds."""
        rows = await self._session.execute(
            select(SavedQuery.id)
            .where(SavedQuery.id.in_(ids), SavedQuery.is_builtin.is_(False))
            .order_by(SavedQuery.id)
        )
        return list(rows.scalars())

    async def add_builtin(self, rows: list[dict[str, Any]]) -> None:
        """Insert native questions, leaving alone an id that another process just inserted."""
        if rows:
            await self._session.execute(insert(SavedQuery).values(rows).on_conflict_do_nothing())

    # --- guarded writes: each returns whether the statement touched a row ---

    @staticmethod
    def _may_modify(viewer: Viewer) -> list[ColumnElement[bool]]:
        """The `WHERE` conditions of `app.queries.policy.modify_denial`, as SQL."""
        conditions: list[ColumnElement[bool]] = [SavedQuery.is_builtin.is_(False)]
        if not viewer.is_admin:
            conditions.append(SavedQuery.author_id == viewer.id)
        return conditions

    async def edit(self, query_id: int, viewer: Viewer, now: datetime, **values: object) -> bool:
        """Apply an edit if `viewer` may modify the query (not native; the author or an admin)."""
        result = await self._session.execute(
            update(SavedQuery)
            .where(SavedQuery.id == query_id, *self._may_modify(viewer))
            .values(**values, updated_at=now)
            .execution_options(synchronize_session=False)
        )
        return cast("CursorResult[Any]", result).rowcount > 0

    async def delete(self, query_id: int, viewer: Viewer) -> bool:
        """Delete the query if `viewer` may modify it."""
        result = await self._session.execute(
            delete(SavedQuery)
            .where(SavedQuery.id == query_id, *self._may_modify(viewer))
            .execution_options(synchronize_session=False)
        )
        return cast("CursorResult[Any]", result).rowcount > 0
