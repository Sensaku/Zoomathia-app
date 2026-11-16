"""
Asynchronous client of the OpenTheso REST API (Huma-Num) for the TheZoo thesaurus (th310).
Provides real-time autocompletion and the retrieval of SKOS concept records.

RM-ACC-02: every value that reaches an OpenTheso URL is percent-encoded or validated, and
the cache is bounded (least recently used entries are evicted beyond `MAX_CACHE_ENTRIES`).
"""

import logging
import re
import time
from collections import OrderedDict
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

OPENTHESO_BASE_URL = "https://opentheso.huma-num.fr"
DEFAULT_THESO_ID = "th310"  # OpenTheso identifier of the Zoomathia TheZoo thesaurus

# Length of the autocompletion text (RM-ACC-02).
MIN_AUTOCOMPLETE_LENGTH = 2
MAX_AUTOCOMPLETE_LENGTH = 100

# An OpenTheso concept identifier (seen: 107399, pcrt4v7jKE3TVw). It goes into a URL path.
CONCEPT_ID_PATTERN = r"^[A-Za-z0-9]{1,64}$"
_CONCEPT_ID = re.compile(CONCEPT_ID_PATTERN)

# In-memory LRU cache with a TTL (600 seconds = 10 minutes) and a bound on its size
# (*proposed* value: 1,000 entries, each at most one concept record or one suggestion list).
_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
CACHE_TTL_SECONDS = 600
MAX_CACHE_ENTRIES = 1000


def _cache_get(key: str, now: float) -> Any | None:
    """The cached data under `key` if it is still fresh (and mark it recently used), else None."""
    entry = _CACHE.get(key)
    if entry is None:
        return None
    if now - entry["timestamp"] >= CACHE_TTL_SECONDS:
        del _CACHE[key]
        return None
    _CACHE.move_to_end(key)
    return entry["data"]


def _cache_put(key: str, data: Any, now: float) -> None:
    """Store `data` under `key`, then evict the least recently used entries beyond the bound."""
    _CACHE[key] = {"data": data, "timestamp": now}
    _CACHE.move_to_end(key)
    while len(_CACHE) > MAX_CACHE_ENTRIES:
        _CACHE.popitem(last=False)


def clear_cache() -> None:
    """Empty the cache (tests, or a manual refresh)."""
    _CACHE.clear()


def _encode_path_segment(text: str) -> str:
    """Percent-encode `text` so that it stays one segment of a URL path.

    `/`, `?`, `#` and `%` are encoded. A text made only of dots (`.`, `..`) is encoded
    too, because an HTTP client removes such a segment from the path, which would move the
    request to another resource.
    """
    segment = quote(text, safe="")
    if segment and set(segment) == {"."}:
        return segment.replace(".", "%2E")
    return segment


class OpenThesoClient:
    """Resilient HTTP client for the Huma-Num OpenTheso server."""

    def __init__(self, timeout: float = 8.0):
        self.timeout = timeout

    async def autocomplete(
        self, query: str, theso_id: str = DEFAULT_THESO_ID
    ) -> list[dict[str, str]]:
        """
        Search TheZoo concept suggestions by autocompletion.

        The text is sent as one percent-encoded path segment, so it cannot change the path
        of the request. Returns a list such as
        `[{"label": "canis", "uri": "https://...", "identifier": "..."}]`; an OpenTheso
        failure gives an empty list (known gap: it should become an explicit 502).
        """
        query_clean = query.strip()
        if not query_clean or len(query_clean) < MIN_AUTOCOMPLETE_LENGTH:
            return []

        cache_key = f"autocomplete:{theso_id}:{query_clean.lower()}"
        now = time.time()

        cached = _cache_get(cache_key, now)
        if cached is not None:
            return cached

        url = (
            f"{OPENTHESO_BASE_URL}/openapi/v1/concept/{theso_id}/autocomplete/"
            f"{_encode_path_segment(query_clean)}"
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    raw_data = response.json()
                    # Normalize the OpenTheso results
                    results: list[dict[str, str]] = []
                    if isinstance(raw_data, list):
                        for item in raw_data:
                            if isinstance(item, dict) and "label" in item and "uri" in item:
                                results.append(
                                    {
                                        "label": item.get("label", ""),
                                        "uri": item.get("uri", ""),
                                        "identifier": str(item.get("identifier", "")),
                                    }
                                )
                    _cache_put(cache_key, results, now)
                    return results
        except Exception as e:
            # Huma-Num may be down for a while: log it without crashing the application.
            logger.warning("OpenTheso autocomplete failed (%s): %s", url, e)

        return []

    async def get_concept_details(
        self, concept_id: str, theso_id: str = DEFAULT_THESO_ID
    ) -> dict[str, Any] | None:
        """
        Retrieve the full semantic record of a concept as JSON-LD (multilingual labels, broader).

        Raises:
            ValueError: If `concept_id` is not an OpenTheso identifier (alphanumeric, at
                most 64 characters): it goes into the URL path, so it is never trusted.
        """
        if _CONCEPT_ID.fullmatch(concept_id) is None:
            raise ValueError("Invalid OpenTheso concept identifier.")

        cache_key = f"concept:{theso_id}:{concept_id}"
        now = time.time()

        cached = _cache_get(cache_key, now)
        if cached is not None:
            return cached

        url = f"{OPENTHESO_BASE_URL}/api/{theso_id}.{concept_id}.jsonld"

        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    _cache_put(cache_key, data, now)
                    return data
        except Exception as e:
            logger.warning("OpenTheso concept retrieval failed (%s): %s", url, e)

        return None


# Reusable singleton instance
opentheso_client = OpenThesoClient()
