"""Constants and helpers shared by the tests of the saved queries."""

from typing import Any

import httpx

QUERY: dict[str, Any] = {
    "title": "Wolves and dogs",
    "description": "Joint mentions in Aristotle",
    "query_text": "SELECT ?s WHERE { ?s ?p ?o } LIMIT 10",
    "category": "Faune terrestre",
}
EMAIL_ADDRESSES = ("ada@example.org", "grace@example.org", "root@example.org")


async def create_query(client: httpx.AsyncClient, **changes: Any) -> dict[str, Any]:
    """Save a query, check that it worked, and return it."""
    response = await client.post("/queries", json={**QUERY, **changes})
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created
