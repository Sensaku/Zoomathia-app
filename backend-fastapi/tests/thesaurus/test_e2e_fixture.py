"""The recorded Corese of the end-to-end stack still answers the queries of the categories.

The Playwright journeys run the real application on `frontend/e2e/fixtures/corese.json`: a
query that no rule matches gets an empty result, which would hide a broken category there.
"""

from pathlib import Path

import httpx

from app.thesaurus.collections import LABELS_QUERY, MEMBERS_QUERY, build_index
from tests.conftest import FakeCorese
from tests.e2e.fake_corese import answer_for, load_rules
from tests.support.thesaurus import LION

FIXTURES = Path(__file__).resolve().parents[3] / "frontend" / "e2e" / "fixtures" / "corese.json"
SECTION = "http://ns.inria.fr/zoomathia/Fictus/de_animalibus/1/1"


def test_rm_con_02_the_fixture_answers_both_index_queries_with_lion_in_the_zoonyme_collection() -> (
    None
):
    """Catches a fixture that no longer matches the `.rq` files: lion would turn `general`."""
    rules = load_rules(FIXTURES)
    members = answer_for(rules, MEMBERS_QUERY)
    labels = answer_for(rules, LABELS_QUERY)

    assert members is not None
    assert labels is not None
    assert members is not labels
    index = build_index(members["results"]["bindings"], labels["results"]["bindings"])
    category, collections = index.classify(LION)
    assert category == "animal"
    assert [(c.labels["fr"], c.labels["en"]) for c in collections] == [("Zoonyme", "Zoonyms")]


async def test_the_fixture_still_answers_the_section_query_with_the_lion_annotation(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    """Catches a section query whose start no longer matches the "annotations of the chapter" rule."""
    await client.get("/annotations/section", params={"section_uri": SECTION})

    answer = answer_for(load_rules(FIXTURES), corese.queries[0])

    assert answer is not None
    labels = [b.get("label", {}).get("value") for b in answer["results"]["bindings"]]
    assert "lion" in labels
