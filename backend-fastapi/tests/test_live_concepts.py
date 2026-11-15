"""Live contract of the concept search against the real Corese (run with `--live`)."""

import httpx
import pytest


@pytest.mark.live
async def test_concept_search_finds_canis_in_the_real_thesaurus(client: httpx.AsyncClient) -> None:
    """The CONTAINS filter of `/searchConcepts` works on the real Corese, not only on the double."""
    response = await client.get("/searchConcepts", params={"input": "canis", "limit": 5})

    assert response.status_code == 200
    assert response.json() != []
