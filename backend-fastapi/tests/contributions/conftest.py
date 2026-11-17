"""Constants and helpers shared by the tests of the contributions domain."""

from typing import Any

import httpx

from tests.support.plant import CONCEPT, PARAGRAPH

OTHER_CONCEPT = "https://opentheso.huma-num.fr/?idc=105525&idt=th310"

ANNOTATION: dict[str, Any] = {
    "paragraph_uri": PARAGRAPH,
    "target_text": "canis lupus",
    "start_offset": 0,
    "end_offset": 11,
    "concept_uri": CONCEPT,
    "concept_label": "canis",
}
PROPOSAL: dict[str, Any] = {"pref_label": "Cerf élaphe", "language": "fr"}


async def post_annotation(client: httpx.AsyncClient, **changes: Any) -> httpx.Response:
    return await client.post("/annotations", json={**ANNOTATION, **changes})


async def post_proposal(client: httpx.AsyncClient, **changes: Any) -> httpx.Response:
    return await client.post("/thesaurus/proposals", json={**PROPOSAL, **changes})


async def create_annotation(client: httpx.AsyncClient, **changes: Any) -> dict[str, Any]:
    """Create an annotation, check that it worked, and return it."""
    response = await post_annotation(client, **changes)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def create_proposal(client: httpx.AsyncClient, **changes: Any) -> dict[str, Any]:
    """Create a proposal, check that it worked, and return it."""
    response = await post_proposal(client, **changes)
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


def review_body(
    version: int, decision: str = "validated", reason: str | None = None
) -> dict[str, Any]:
    body: dict[str, Any] = {"version": version, "decision": decision}
    if reason is not None:
        body["reason"] = reason
    return body


async def review(
    client: httpx.AsyncClient, annotation: dict[str, Any], decision: str = "validated"
) -> httpx.Response:
    """Review an annotation as `client`; a rejection comes with a reason."""
    reason = "Not convincing." if decision == "rejected" else None
    return await client.post(
        f"/annotations/{annotation['id']}/review",
        json=review_body(annotation["version"], decision, reason),
    )


async def approve(client: httpx.AsyncClient, proposal: dict[str, Any]) -> httpx.Response:
    """Validate a proposal as `client`."""
    return await client.post(
        f"/thesaurus/proposals/{proposal['id']}/review", json=review_body(proposal["version"])
    )
