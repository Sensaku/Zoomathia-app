"""Database access of the contributions domain. No business rule is decided here.

Every edit, review and delete is one conditional statement: the conditions that make it legal
(still pending, same version, the right author) sit in the `WHERE` clause, so that two
requests racing for the same contribution cannot both win, whatever they read before. The
statement returns whether it touched a row; the service then classifies a failure with the
permission policy (`app.contributions.policy`), which states the same rules for the
messages and for `allowed_actions`.

Methods only stage changes; the service decides when to `commit`, so that each service
operation is one short transaction.
"""

from collections.abc import Sequence
from datetime import datetime
from typing import Any, Generic, TypeVar, cast

from sqlalchemy import ColumnElement, CursorResult, and_, delete, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.accounts.models import User
from app.accounts.viewer import Viewer
from app.contributions.models import Annotation, ContributionStatus, ReviewableMixin, TermProposal
from app.shared.sql import LIKE_ESCAPE, escape_like

Contribution = TypeVar("Contribution", bound=ReviewableMixin)


class ReviewableRepository(Generic[Contribution]):
    """The reads and the guarded writes that annotations and term proposals share."""

    model: type[Contribution]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def commit(self) -> None:
        """Commit the current transaction."""
        await self._session.commit()

    async def rollback(self) -> None:
        """Roll the current transaction back."""
        await self._session.rollback()

    async def get(self, contribution_id: int) -> Contribution | None:
        """The contribution with this id, read afresh from the database, with its accounts."""
        result = await self._session.execute(
            select(self.model)
            .where(self.model.id == contribution_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def add(self, contribution: Contribution) -> None:
        """Stage a new contribution and flush it, so that a constraint fails here."""
        self._session.add(contribution)
        await self._session.flush()

    async def page(
        self, conditions: Sequence[ColumnElement[bool]], limit: int, offset: int
    ) -> tuple[list[Contribution], int]:
        """A page of contributions, newest first, and the total count under the same filters."""
        rows = await self._session.execute(
            select(self.model)
            .where(*conditions)
            .order_by(self.model.id.desc())
            .limit(limit)
            .offset(offset)
        )
        total = await self._session.execute(
            select(func.count()).select_from(self.model).where(*conditions)
        )
        return list(rows.scalars()), total.scalar_one()

    async def first(self, limit: int) -> list[Contribution]:
        """At most `limit` contributions, oldest first: the source of the RDF exports (RM-PUB-01)."""
        rows = await self._session.execute(select(self.model).order_by(self.model.id).limit(limit))
        return list(rows.scalars())

    # --- guarded writes: each returns whether the statement touched a row ---

    async def edit(
        self, contribution_id: int, version: int, viewer: Viewer, now: datetime, **values: object
    ) -> bool:
        """Apply an edit if the contribution is pending, at this version, and editable by `viewer`.

        The author edits; an admin also edits a historical contribution (no author account).
        Raises `IntegrityError` if the new values break a constraint (RM-THE-04).
        """
        own = self.model.author_id == viewer.id
        may_edit = or_(own, self.model.author_id.is_(None)) if viewer.is_admin else own
        return await self._guarded_update(
            contribution_id,
            [self.model.version == version, may_edit],
            {**values, "updated_at": now, "version": self.model.version + 1},
        )

    async def review(
        self,
        contribution_id: int,
        version: int,
        viewer: Viewer,
        now: datetime,
        decision: ContributionStatus,
        reason: str | None,
    ) -> bool:
        """Record a review if the contribution is pending, at this version, and not `viewer`'s own."""
        not_own = or_(self.model.author_id.is_(None), self.model.author_id != viewer.id)
        return await self._guarded_update(
            contribution_id,
            [self.model.version == version, not_own],
            {
                "status": decision,
                "reviewer_id": viewer.id,
                "reviewed_at": now,
                "rejection_reason": reason,
                "updated_at": now,
                "version": self.model.version + 1,
            },
        )

    async def _guarded_update(
        self,
        contribution_id: int,
        conditions: list[ColumnElement[bool]],
        values: dict[str, object],
    ) -> bool:
        result = await self._session.execute(
            update(self.model)
            .where(
                self.model.id == contribution_id,
                self.model.status == ContributionStatus.PENDING,
                *conditions,
            )
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        return cast("CursorResult[Any]", result).rowcount > 0

    async def delete(self, contribution_id: int, viewer: Viewer) -> bool:
        """Delete a contribution if `viewer` may (RM-CTB-05, RM-MOD-05).

        Their own and still pending; or, for an admin, another person's pending or rejected one.
        """
        own = and_(
            self.model.author_id == viewer.id, self.model.status == ContributionStatus.PENDING
        )
        allowed: ColumnElement[bool] = own
        if viewer.is_admin:
            not_own = or_(self.model.author_id.is_(None), self.model.author_id != viewer.id)
            moderation = and_(not_own, self.model.status != ContributionStatus.VALIDATED)
            allowed = or_(own, moderation)
        result = await self._session.execute(
            delete(self.model)
            .where(self.model.id == contribution_id, allowed)
            .execution_options(synchronize_session=False)
        )
        return cast("CursorResult[Any]", result).rowcount > 0


def covers_paragraphs(paragraphs: Sequence[str]) -> ColumnElement[bool]:
    """Annotations whose first paragraph, or one of whose covered paragraphs, is in `paragraphs`.

    The match is exact, never a longer IRI that merely contains one (P0-3). The covered
    paragraphs are a JSON array, read with `json_each`; every value is a bound parameter.
    """
    covered = func.json_each(Annotation.target_paragraphs).table_valued("value")
    return or_(
        Annotation.paragraph_uri.in_(paragraphs),
        exists().where(covered.c.value.in_(paragraphs)).select_from(covered),
    )


class AnnotationRepository(ReviewableRepository[Annotation]):
    """Annotations (table `staged_annotations`)."""

    model = Annotation

    async def in_paragraphs(
        self, paragraphs: Sequence[str], statuses: Sequence[ContributionStatus], limit: int
    ) -> list[Annotation]:
        """The annotations of these statuses that cover one of `paragraphs`, newest first.

        Used by the reader (RM-ACC-03). At most `limit` rows: the caller asks for one more
        than it accepts, to know that the cap was exceeded.
        """
        if not paragraphs:
            return []
        rows = await self._session.execute(
            select(Annotation)
            .where(covers_paragraphs(paragraphs), Annotation.status.in_(statuses))
            .order_by(Annotation.id.desc())
            .limit(limit)
        )
        return list(rows.scalars())


def matches_text(search: str) -> ColumnElement[bool]:
    """Proposals whose text fields contain `search`, ignoring ASCII case, wildcards literal.

    Looks in the label, the alternative labels, the definition, the broader label, and the
    author (the display name of the account, or the historical `author_label`).
    """
    pattern = f"%{escape_like(search.strip().lower())}%"

    def like(column: Any) -> ColumnElement[bool]:
        return cast("ColumnElement[bool]", func.lower(column).like(pattern, escape=LIKE_ESCAPE))

    account_name = exists().where(User.id == TermProposal.author_id, like(User.display_name))
    return or_(
        like(TermProposal.pref_label),
        like(TermProposal.alt_labels),
        like(TermProposal.author_label),
        like(TermProposal.definition),
        like(TermProposal.broader_concept_label),
        account_name,
    )


class ProposalRepository(ReviewableRepository[TermProposal]):
    """Term proposals (table `thesaurus_proposals`)."""

    model = TermProposal
