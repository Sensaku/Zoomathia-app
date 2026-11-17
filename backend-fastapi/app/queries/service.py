"""Use cases of the saved queries: save, edit, delete, list and seed (RM-QC-02, RM-QC-06).

No FastAPI import here: the service raises domain errors (`app/shared/domain_errors.py`), and
each public operation commits its own short transaction. The permission rules are those of
`app.queries.policy`; the repository enforces them again inside the SQL statement. The SPARQL
text of a query is validated before it is stored (RM-ACC-02); it is stored as written, and
`prepare_query_async` runs again when the query is executed.

The seeding of the native competency questions also lives here: until RM-QC-01 makes the
database their single source, they are copied from `app/core/qcs_data.py` and the `.rq` files
of `data/queries/` at startup.
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, NoReturn

from app.accounts.viewer import Viewer
from app.core.clock import Clock, utcnow
from app.core.config import settings
from app.core.database import Database
from app.core.qcs_data import QCS_DATA
from app.queries.models import BUILTIN_AUTHOR, DEFAULT_CATEGORY, SavedQuery
from app.queries.policy import Denial, modify_denial
from app.queries.repository import QueryRepository, matches_search
from app.queries.schemas import CreateSavedQueryRequest, UpdateSavedQueryRequest
from app.shared.domain_errors import DomainError, Forbidden, NotFound, Unprocessable
from app.shared.sparql_guard import prepare_query_async

logger = logging.getLogger(__name__)

# The JSON export of the library holds at most this many queries; beyond it the request
# fails, it never silently truncates (AGENTS.md, rule 9).
MAX_EXPORTED_QUERIES = 5_000
NATIVE_CATEGORY = "Question de compétence"

_DENIALS: dict[Denial, DomainError] = {
    Denial.NOT_AUTHOR: Forbidden("not_author", "You are not allowed to do this."),
    Denial.BUILTIN_QUERY: Forbidden(
        "builtin_query", "A native competency question cannot be modified or deleted."
    ),
}


def _refuse(denial: Denial) -> NoReturn:
    template = _DENIALS[denial]
    raise type(template)(template.code, template.message)


def _clean(text: str | None) -> str | None:
    """The text trimmed, or None when there is none."""
    return text.strip() if text else None


class QueryService:
    """Saved SPARQL queries (RM-QC-06)."""

    def __init__(self, repository: QueryRepository, clock: Clock) -> None:
        self.repository = repository
        self._clock = clock

    async def get(self, query_id: int) -> SavedQuery:
        """The query with this id.

        Raises:
            NotFound: `query_not_found`.
        """
        found = await self.repository.get(query_id)
        if found is None:
            raise NotFound("query_not_found", "No such query.")
        return found

    async def read_for_execution(self, query_id: int) -> SavedQuery:
        """The query to run, read in a transaction that ends before Corese is called.

        A long evaluation then never keeps a database connection (AGENTS.md, rule 10).

        Raises:
            NotFound: `query_not_found`.
        """
        found = await self.get(query_id)
        await self.repository.commit()
        return found

    async def create(self, viewer: Viewer, request: CreateSavedQueryRequest) -> SavedQuery:
        """Save a query, authored by `viewer` (RM-QC-06).

        Raises:
            InvalidSparqlQuery: The text is not a valid SELECT or ASK query (RM-ACC-02).
            ForbiddenSparqlQuery: The text uses a forbidden feature (`SERVICE`, an update).
        """
        await self._validate(request.query_text, request.query_spo_text)
        now = self._clock()
        query = SavedQuery(
            title=request.title.strip(),
            description=_clean(request.description),
            query_text=request.query_text.strip(),
            query_spo_text=_clean(request.query_spo_text),
            category=_clean(request.category) or DEFAULT_CATEGORY,
            author_id=viewer.id,
            is_builtin=False,
            created_at=now,
            updated_at=now,
        )
        await self.repository.add(query)
        await self.repository.commit()
        logger.info("query saved: id=%s by=%s", query.id, viewer.id)
        return await self.get(query.id)

    async def edit(
        self, viewer: Viewer, query_id: int, request: UpdateSavedQueryRequest
    ) -> SavedQuery:
        """Change the fields that `request` sends: the author or an admin, never a native one.

        Raises:
            NotFound: `query_not_found`.
            Forbidden: `builtin_query` (admins included, T7) or `not_author`.
            InvalidSparqlQuery: A new text is not a valid SELECT or ASK query.
            ForbiddenSparqlQuery: A new text uses a forbidden feature.
        """
        current = await self.get(query_id)
        if (denial := modify_denial(current, viewer)) is not None:
            _refuse(denial)
        await self._validate(request.query_text, request.query_spo_text)
        values = {
            name: value.strip()
            for name in ("title", "description", "query_text", "query_spo_text", "category")
            if (value := getattr(request, name)) is not None
        }
        if not await self.repository.edit(query_id, viewer, self._clock(), **values):
            await self._explain_failure(query_id, viewer)
        await self.repository.commit()
        logger.info("query edited: id=%s by=%s", query_id, viewer.id)
        return await self.get(query_id)

    async def delete(self, viewer: Viewer, query_id: int) -> None:
        """Delete a query: the author or an admin, never a native one.

        Raises:
            NotFound: `query_not_found`.
            Forbidden: `builtin_query` (admins included) or `not_author`.
        """
        current = await self.get(query_id)
        if (denial := modify_denial(current, viewer)) is not None:
            _refuse(denial)
        if not await self.repository.delete(query_id, viewer):
            await self._explain_failure(query_id, viewer)
        await self.repository.commit()
        if current.author_id != viewer.id:
            logger.info("query moderated: admin=%s id=%s", viewer.id, query_id)
        else:
            logger.info("query deleted: id=%s by=%s", query_id, viewer.id)

    async def page(
        self,
        viewer: Viewer | None,
        category: str | None,
        search: str | None,
        mine: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[SavedQuery], int]:
        """A page of queries, native questions first, with the total under the same filters."""
        conditions = []
        if category:
            conditions.append(SavedQuery.category == category)
        if search:
            conditions.append(matches_search(search))
        if mine and viewer is not None:
            conditions.append(SavedQuery.author_id == viewer.id)
        return await self.repository.page(conditions, limit, offset)

    async def export(self) -> list[SavedQuery]:
        """The whole library, for the JSON download.

        Raises:
            Unprocessable: `too_many_results` beyond `MAX_EXPORTED_QUERIES`.
        """
        rows = await self.repository.first(MAX_EXPORTED_QUERIES + 1)
        if len(rows) > MAX_EXPORTED_QUERIES:
            raise Unprocessable("too_many_results", "The library is too large to export at once.")
        return rows

    @staticmethod
    async def _validate(*texts: str | None) -> None:
        """Check each non-empty text with the SPARQL guard (RM-ACC-02); store nothing."""
        for text in texts:
            if text:
                await prepare_query_async(text)

    async def _explain_failure(self, query_id: int, viewer: Viewer) -> NoReturn:
        """Say why a guarded write touched no row: the query is gone, or the rules refuse it."""
        await self.repository.rollback()
        fresh = await self.get(query_id)
        if (denial := modify_denial(fresh, viewer)) is not None:
            _refuse(denial)
        raise NotFound("query_not_found", "No such query.")


# --- native competency questions ---


def _read_text(path: Path) -> str | None:
    """The text of a `.rq` file, or None if it is missing or unreadable (logged)."""
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except OSError:
        logger.warning("cannot read the query file %s", path.name, exc_info=True)
        return None


def _read_sources(ids: list[int], queries_dir: Path) -> dict[int, tuple[str, str | None]]:
    """The `.rq` text of each question and of its SPO variant; one without text is left out."""
    sources: dict[int, tuple[str, str | None]] = {}
    for qc_id in ids:
        text = _read_text(queries_dir / f"qc{qc_id}.rq")
        if text:
            sources[qc_id] = (text, _read_text(queries_dir / f"qc{qc_id}_spo.rq"))
    return sources


def _native_row(qc: dict[str, Any], text: str, spo: str | None, now: datetime) -> dict[str, Any]:
    qc_id = qc["id"]
    return {
        "id": qc_id,
        "title": qc.get("title", f"Question de recherche {qc_id}"),
        "description": qc.get("goal") or qc.get("vizuTitle") or "",
        "query_text": text,
        "query_spo_text": spo,
        "category": NATIVE_CATEGORY,
        "author_id": None,
        "author_label": BUILTIN_AUTHOR,
        "is_builtin": True,
        "created_at": now,
        "updated_at": now,
    }


async def seed_builtin_queries(
    database: Database, clock: Clock = utcnow, queries_dir: Path | None = None
) -> None:
    """Insert the native competency questions that the database does not hold yet.

    Idempotent, and safe when two processes start at once. The `.rq` files are read in a
    thread, so that startup never blocks the event loop on disk. The tables must exist: the
    caller has checked that the database is migrated.

    Args:
        database: The application database.
        clock: The source of the creation date.
        queries_dir: The folder of the `.rq` files; `settings.QUERIES_DIR` by default.
    """
    directory = queries_dir or Path(settings.QUERIES_DIR)
    async with database.session_maker() as session:
        repository = QueryRepository(session)
        present = await repository.builtin_ids()
        missing = [qc for qc in QCS_DATA if qc["id"] not in present]
        sources = await asyncio.to_thread(_read_sources, [qc["id"] for qc in missing], directory)
        now = clock()
        await repository.add_builtin(
            [_native_row(qc, *sources[qc["id"]], now) for qc in missing if qc["id"] in sources]
        )
        # The insert leaves an id that another row holds alone: say which native question
        # could not be seeded, instead of skipping it at every startup with no trace.
        blocked = await repository.non_builtin_among([qc["id"] for qc in QCS_DATA])
        await repository.commit()
    if blocked:
        logger.error(
            "native competency questions not seeded: ids %s are held by personal queries", blocked
        )
