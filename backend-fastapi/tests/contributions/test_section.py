"""`GET /annotations/section`: Corese reference annotations plus staged ones (RM-ACC-03).

The reader shows validated annotations, pending ones only on request, and never a rejected
one. The staged part is filtered in SQL and capped; a section over the cap fails with 422
instead of being silently truncated (AGENTS.md, rule 9).
"""

import json
import sqlite3
from pathlib import Path
from typing import Any

import httpx
import pytest

from app.core.config import settings
from tests.conftest import FakeCorese
from tests.contributions.conftest import create_annotation, review_body
from tests.support.accounts import Member, error_code
from tests.support.plant import CONCEPT, CREATED, plant_annotation

BASE = "http://ns.inria.fr/zoomathia/Ex/work/text/"
SECTION = "http://ns.inria.fr/zoomathia/Ex/work/text"
PARAGRAPHS = [f"{BASE}1", f"{BASE}2"]


@pytest.fixture
def section_in_corese(corese: FakeCorese) -> None:
    """Corese says that the section holds two annotated paragraphs."""
    corese.returns(
        ["paragraph", "label"],
        [{"paragraph": paragraph, "label": "lion"} for paragraph in PARAGRAPHS],
    )


async def staged(client: httpx.AsyncClient, **params: Any) -> list[dict[str, Any]]:
    response = await client.get("/annotations/section", params={"section_uri": SECTION, **params})
    assert response.status_code == 200, response.text
    items: list[dict[str, Any]] = response.json()["staged_annotations"]
    return items


@pytest.fixture
async def one_of_each(contributor: Member, second_contributor: Member) -> dict[str, dict[str, Any]]:
    made: dict[str, dict[str, Any]] = {}
    for name in ("pending", "validated", "rejected"):
        made[name] = await create_annotation(
            contributor, paragraph_uri=PARAGRAPHS[0], target_text=name
        )
    await second_contributor.post(
        f"/annotations/{made['validated']['id']}/review", json=review_body(1)
    )
    await second_contributor.post(
        f"/annotations/{made['rejected']['id']}/review", json=review_body(1, "rejected", "No.")
    )
    return made


@pytest.mark.usefixtures("section_in_corese")
async def test_rm_acc_03_the_reader_shows_validated_annotations_by_default(
    client: httpx.AsyncClient, one_of_each: dict[str, dict[str, Any]]
) -> None:
    items = await staged(client)

    assert [item["id"] for item in items] == [one_of_each["validated"]["id"]]
    assert items[0]["status"] == "validated"


@pytest.mark.usefixtures("section_in_corese")
async def test_rm_acc_03_pending_annotations_appear_on_request_and_rejected_ones_never(
    client: httpx.AsyncClient, one_of_each: dict[str, dict[str, Any]]
) -> None:
    items = await staged(client, include_pending="true")

    assert {item["status"] for item in items} == {"validated", "pending"}
    assert one_of_each["rejected"]["id"] not in [item["id"] for item in items]


@pytest.mark.usefixtures("section_in_corese")
async def test_the_staged_items_carry_the_actions_of_the_viewer_and_no_email(
    client: httpx.AsyncClient, contributor: Member, one_of_each: dict[str, dict[str, Any]]
) -> None:
    as_anonymous = await staged(client, include_pending="true")
    as_author = await staged(contributor, include_pending="true")

    pending = {item["status"]: item for item in as_author}["pending"]
    assert pending["allowed_actions"] == ["edit", "delete"]
    assert pending["author"]["display_name"] == "Ada Lovelace"
    assert all(item["allowed_actions"] == [] for item in as_anonymous)
    assert "example.org" not in json.dumps(as_author)


@pytest.mark.usefixtures("section_in_corese")
async def test_an_annotation_is_found_through_any_paragraph_it_covers_and_only_there(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    spanning = await create_annotation(
        contributor,
        paragraph_uri=f"{BASE}9",
        target_paragraphs=[f"{BASE}9", PARAGRAPHS[1]],
        scope_type="multi_paragraph",
    )
    elsewhere = await create_annotation(contributor, paragraph_uri=f"{BASE}10")
    longer = await create_annotation(contributor, paragraph_uri=f"{BASE}1/extra")
    for annotation in (spanning, elsewhere, longer):
        await second_contributor.post(
            f"/annotations/{annotation['id']}/review", json=review_body(1)
        )

    items = await staged(client)

    assert [item["id"] for item in items] == [spanning["id"]]


@pytest.mark.usefixtures("section_in_corese")
async def test_the_reader_answers_when_the_section_has_no_staged_annotation(
    client: httpx.AsyncClient,
) -> None:
    response = await client.get("/annotations/section", params={"section_uri": SECTION})

    assert response.status_code == 200
    assert response.json()["staged_annotations"] == []
    assert response.json()["paragraph_count"] == 2


async def test_a_section_without_paragraph_has_no_staged_annotation(
    client: httpx.AsyncClient, corese: FakeCorese, contributor: Member
) -> None:
    await create_annotation(contributor, paragraph_uri=PARAGRAPHS[0])
    corese.returns(["uri"], [])

    response = await client.get(
        "/annotations/section", params={"section_uri": SECTION, "include_pending": "true"}
    )

    assert response.json()["staged_annotations"] == []
    assert response.json()["paragraph_count"] == 0


def bulk_plant(count: int) -> None:
    """Insert `count` validated annotations of the first paragraph, in one transaction."""
    row = (
        PARAGRAPHS[0],
        "t",
        0,
        1,
        CONCEPT,
        "c",
        "http://www.w3.org/2004/02/skos/core#Concept",
        "word",
        json.dumps([PARAGRAPHS[0]]),
        "Chercheuse",
        "validated",
        CREATED,
    )
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        connection.executemany(
            "INSERT INTO staged_annotations (paragraph_uri, target_text, start_offset, end_offset,"
            " concept_uri, concept_label, concept_type, scope_type, target_paragraphs,"
            " author_label, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [row] * count,
        )


@pytest.mark.usefixtures("section_in_corese")
async def test_a_section_at_the_cap_is_returned_whole(client: httpx.AsyncClient) -> None:
    bulk_plant(2000)

    assert len(await staged(client)) == 2000


@pytest.mark.usefixtures("section_in_corese")
async def test_a_section_over_the_cap_is_a_422_never_a_truncation(
    client: httpx.AsyncClient,
) -> None:
    bulk_plant(2001)

    response = await client.get("/annotations/section", params={"section_uri": SECTION})

    assert response.status_code == 422
    assert error_code(response) == "too_many_results"


@pytest.mark.usefixtures("section_in_corese")
async def test_a_historical_annotation_is_shown_with_its_label(client: httpx.AsyncClient) -> None:
    plant_annotation(paragraph_uri=PARAGRAPHS[1], status="validated")

    items = await staged(client)

    assert items[0]["author"] is None
    assert items[0]["author_label"] == "Chercheuse"
