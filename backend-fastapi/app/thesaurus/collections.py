"""The index of the TheZoo collections: which concept belongs to which collection (RM-CON-01).

Two queries (`sparql/collection_members.rq` and `sparql/collection_labels.rq`, no placeholder)
load the members and the labels of every collection. The index is kept in memory for
`INDEX_TTL_SECONDS`, so that no reading route asks Corese for the collections of each concept.

Loading never queues requests (AGENTS.md, rule 10):

- One load runs at a time, as one `asyncio.Task` that every waiting request shares: they get
  the same index, or the same error. A request that leaves does not cancel it.
- With no index, a failure is remembered for `FAILURE_MEMORY_SECONDS`: the same 502 or 504 is
  raised at once instead of sending one more query per request to a Corese that is down. It
  stays an explicit failure, never an empty success (rule 9).
- With an index, an expired one is served at once and refreshed in the background. A failed
  refresh logs a warning, keeps the old index and waits `RETRY_DELAY_SECONDS`.

An answer that cannot be trusted counts as a failure: a members page that hits its safety
limit (the index would be truncated), or an index with no member in any mapped collection
(the thesaurus graph is probably not loaded, so everything would turn `general`).
"""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Final

from fastapi import Depends, HTTPException

from app.core.clock import Clock, get_clock
from app.services.sparql_client import sparql_client
from app.thesaurus.categories import CATEGORY_COLLECTIONS, Category, category_of
from app.thesaurus.schemas import ConceptCollectionOut

logger = logging.getLogger("zoomathia.thesaurus")

INDEX_TTL_SECONDS: Final = 1800.0  # like the SPARQL cache
RETRY_DELAY_SECONDS: Final = 60.0  # before refreshing again after a failed refresh
FAILURE_MEMORY_SECONDS: Final = 10.0  # before trying again after a failed first load
MEMBERS_LIMIT: Final = 50_000  # the LIMIT of collection_members.rq

# The files are read once, here: never from an async handler (rule 10).
_SPARQL_DIR: Final = Path(__file__).with_name("sparql")
MEMBERS_QUERY: Final = (_SPARQL_DIR / "collection_members.rq").read_text("utf-8")
LABELS_QUERY: Final = (_SPARQL_DIR / "collection_labels.rq").read_text("utf-8")

_MAPPED_COLLECTIONS: Final = frozenset(
    iri for iris in CATEGORY_COLLECTIONS.values() for iri in iris
)


class CollectionIndex:
    """An immutable snapshot of the collections: their labels and the members of each."""

    def __init__(
        self,
        labels: Mapping[str, Mapping[str, str]],
        memberships: Mapping[str, frozenset[str]],
    ) -> None:
        """`labels`: collection IRI -> labels by language. `memberships`: concept IRI -> collections."""
        self._labels = labels
        self._memberships = memberships

    def has_mapped_member(self) -> bool:
        """Whether any concept belongs to a collection of the category table."""
        return any(
            not _MAPPED_COLLECTIONS.isdisjoint(found) for found in self._memberships.values()
        )

    def collection(self, collection_iri: str) -> ConceptCollectionOut:
        """A collection with its labels (empty when the index holds none for it)."""
        return ConceptCollectionOut(
            iri=collection_iri, labels=dict(self._labels.get(collection_iri, {}))
        )

    def classify(self, concept_iri: str) -> tuple[Category, list[ConceptCollectionOut]]:
        """The category of a concept and its collections (RM-CON-01, RM-CON-02).

        The collections of the category come first, then the others, each group by IRI. A
        concept with no collection (a proposal, for instance) is `general` with none.
        """
        member_of = self._memberships.get(concept_iri, frozenset())
        category = category_of(member_of)
        own = set(CATEGORY_COLLECTIONS[category]) if category != "general" else set()
        ordered = sorted(member_of, key=lambda iri: (iri not in own, iri))
        return category, [self.collection(iri) for iri in ordered]


def build_index(
    member_rows: Iterable[Mapping[str, Any]], label_rows: Iterable[Mapping[str, Any]] = ()
) -> CollectionIndex:
    """Build the index from the rows of the two queries; a row with a missing part is skipped."""
    memberships: dict[str, set[str]] = defaultdict(set)
    for row in member_rows:
        collection = row.get("collection", {}).get("value")
        member = row.get("member", {}).get("value")
        if collection and member:
            memberships[member].add(collection)
    labels: dict[str, dict[str, str]] = defaultdict(dict)
    for row in label_rows:
        collection = row.get("collection", {}).get("value")
        label = row.get("collectionLabel", {}).get("value")
        language = row.get("labelLanguage", {}).get("value")
        if collection and label and language:
            labels[collection].setdefault(language, label)
    return CollectionIndex(
        labels, {member: frozenset(found) for member, found in memberships.items()}
    )


def _bindings(result: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = result.get("results", {}).get("bindings", [])
    return rows


async def fetch_index() -> CollectionIndex:
    """Load the index from Corese (two bounded queries, never cached by the SPARQL client).

    Raises:
        HTTPException: 502 or 504 from the SPARQL client, or 502 when the answer cannot be
            trusted (members page at its safety limit, no member in any mapped collection).
    """
    # The index has its own TTL: the SPARQL client must not cache it a second time.
    members = _bindings(await sparql_client.query(MEMBERS_QUERY, use_cache=False))
    if len(members) >= MEMBERS_LIMIT:
        logger.error(
            "TheZoo collection members reached the safety limit of %d rows: index refused",
            MEMBERS_LIMIT,
        )
        raise HTTPException(status_code=502, detail="TheZoo collections too large to index")
    labels = _bindings(await sparql_client.query(LABELS_QUERY, use_cache=False))
    index = build_index(members, labels)
    if not index.has_mapped_member():
        logger.error(
            "TheZoo collections hold no member in any mapped collection (%d rows): "
            "is the thesaurus graph loaded? Index refused",
            len(members),
        )
        raise HTTPException(status_code=502, detail="TheZoo collections are empty")
    return index


class ThesaurusCollections:
    """The cached index of the collections, loaded from Corese on demand."""

    def __init__(self, ttl_seconds: float = INDEX_TTL_SECONDS) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._retry_delay = timedelta(seconds=RETRY_DELAY_SECONDS)
        self._failure_memory = timedelta(seconds=FAILURE_MEMORY_SECONDS)
        self._index: CollectionIndex | None = None
        self._refresh_at: datetime | None = None  # the index is served as is until then
        self._failure: tuple[int, str] | None = None  # status and detail of the last first load
        self._failed_until: datetime | None = None
        self._load: asyncio.Task[CollectionIndex] | None = None
        # Strong references: the event loop only keeps weak ones to its tasks.
        self._tasks: set[asyncio.Task[CollectionIndex]] = set()

    def clear(self) -> None:
        """Forget the index and stop a running load (tests start from an empty cache)."""
        for task in self._tasks:
            if not task.done():
                task.cancel()
        self._tasks.clear()
        self._load = None
        self._index = None
        self._refresh_at = None
        self._failure = None
        self._failed_until = None

    def preload(self, clock: Clock) -> None:
        """Start loading the index in the background, unless it is loaded or loading.

        Never blocks and never raises: a Corese outage is logged by the load itself.
        """
        if self._index is None:
            self._start(clock)

    async def get(self, clock: Clock) -> CollectionIndex:
        """The index: loaded on the first call, refreshed in the background once expired.

        Raises:
            HTTPException: with no index, the 502 or 504 of the load in progress or of the
                last failed one (remembered for `FAILURE_MEMORY_SECONDS`).
        """
        now = clock()
        if self._index is not None:
            if self._refresh_at is not None and now >= self._refresh_at:
                self._start(clock)
            return self._index
        if self._failure is not None and self._failed_until and now < self._failed_until:
            raise HTTPException(status_code=self._failure[0], detail=self._failure[1])
        task = self._start(clock)
        # Shielded: a request that gives up must not cancel the load the others wait for.
        return await asyncio.shield(task)

    def _start(self, clock: Clock) -> asyncio.Task[CollectionIndex]:
        """The load in progress, or a new one."""
        if self._load is not None and not self._load.done():
            return self._load
        task = asyncio.create_task(self._run(clock))
        self._load = task
        self._tasks.add(task)
        task.add_done_callback(self._finished)
        return task

    def _finished(self, task: asyncio.Task[CollectionIndex]) -> None:
        self._tasks.discard(task)
        if self._load is task:
            self._load = None
        if not task.cancelled():
            task.exception()  # retrieved, so that a background failure is never "lost"

    async def _run(self, clock: Clock) -> CollectionIndex:
        try:
            index = await fetch_index()
        except HTTPException as error:
            self._failed_load(error, clock())
            raise
        except Exception as error:  # a malformed answer: handled like any failed load
            logger.exception("TheZoo collections unreadable")
            unreadable = HTTPException(status_code=502, detail="TheZoo collections unreadable")
            self._failed_load(unreadable, clock())
            raise unreadable from error
        self._index = index
        self._refresh_at = clock() + self._ttl
        self._failure = None
        self._failed_until = None
        return index

    def _failed_load(self, error: HTTPException, now: datetime) -> None:
        if self._index is None:
            logger.warning("TheZoo collections not loaded (%s)", error.detail)
            self._failure = (error.status_code, str(error.detail))
            self._failed_until = now + self._failure_memory
        else:
            logger.warning(
                "TheZoo collections not refreshed (%s): serving the previous index", error.detail
            )
            self._refresh_at = now + self._retry_delay


thesaurus_collections = ThesaurusCollections()


async def get_thesaurus_collections(clock: Clock = Depends(get_clock)) -> CollectionIndex:
    """FastAPI dependency: the index of the TheZoo collections (loaded or refreshed if needed).

    It resolves before the handler, so a write never succeeds with a response that then fails.
    Tests override it with an in-memory index.
    """
    return await thesaurus_collections.get(clock)
