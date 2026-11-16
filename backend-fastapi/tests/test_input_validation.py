"""Input validation of the contribution and search requests (RM-ACC-02, RM-ANN-04, RM-THE-05).

Every limit is tested at its boundary: accepted at the limit, 422 just beyond it.
"""

from typing import Any

import httpx
import pytest

from app.shared.validation import (
    validate_annotation_concept_iri,
    validate_corpus_paragraph_iri,
    validate_iri,
    validate_language_tag,
    validate_text,
    validate_thezoo_concept_iri,
)
from tests.conftest import FakeCorese

PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/1"
CONCEPT = "https://opentheso.huma-num.fr/?idc=107399&idt=th310"
PROPOSAL_CONCEPT = "http://zoomathia.i3s.unice.fr/concept/proposal/12"

ANNOTATION: dict[str, Any] = {
    "paragraph_uri": PARAGRAPH,
    "target_text": "canis lupus",
    "start_offset": 0,
    "end_offset": 11,
    "concept_uri": CONCEPT,
    "concept_label": "canis",
}
PROPOSAL: dict[str, Any] = {"pref_label": "Cerf élaphe", "language": "fr"}
SAVED_QUERY: dict[str, Any] = {
    "title": "A valid title",
    "query_text": "SELECT ?s WHERE { ?s ?p ?o } LIMIT 5",
}


async def post_annotation(client: httpx.AsyncClient, **changes: Any) -> httpx.Response:
    return await client.post("/annotations", json={**ANNOTATION, **changes})


async def post_proposal(client: httpx.AsyncClient, **changes: Any) -> httpx.Response:
    return await client.post("/thesaurus/proposals", json={**PROPOSAL, **changes})


def repeated(length: int) -> str:
    return "a" * length


# --- Shared validators ---


@pytest.mark.parametrize(
    "value",
    [
        "http://ex.org/a>b",
        "http://ex.org/a<b",
        'http://ex.org/a"b',
        "http://ex.org/a{b}",
        "http://ex.org/a|b",
        "http://ex.org/a^b",
        "http://ex.org/a`b",
        "http://ex.org/a" + chr(92) + "b",
        "http://ex.org/a b",
        "http://ex.org/a\nb",
        "http://ex.org/a\x00b",
        "http://ex.org/a\u2028b",
        "http://ex.org/a\u0085b",
        "ftp://ex.org/a",
        "javascript:alert(1)",
        "http://",
        "",
        "http://ex.org/" + repeated(2048),
    ],
)
def test_an_unsafe_iri_is_refused(value: str) -> None:
    with pytest.raises(ValueError):
        validate_iri(value)


def test_an_iri_at_the_length_limit_is_accepted() -> None:
    value = "http://ex.org/" + repeated(2048 - len("http://ex.org/"))

    assert validate_iri(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "https://opentheso.huma-num.fr/?idc=107399&idt=th310",
        "https://opentheso.huma-num.fr/?idc=pcrt4v7jKE3TVw&idt=th310",
        "https://opentheso.huma-num.fr/?idc=" + repeated(64) + "&idt=th310",
    ],
)
def test_a_thezoo_concept_iri_is_accepted(value: str) -> None:
    assert validate_thezoo_concept_iri(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "http://opentheso.huma-num.fr/?idc=1&idt=th310",  # not https
        "https://opentheso.huma-num.fr/?idc=1&idt=th999",  # another thesaurus
        "https://opentheso.huma-num.fr/?idc=1",
        "https://opentheso.huma-num.fr/?idc=&idt=th310",
        "https://opentheso.huma-num.fr/?idc=1&idt=th310&x=1",
        "https://opentheso.huma-num.fr/?idc=1/../&idt=th310",
        "https://opentheso.huma-num.fr/?idc=" + repeated(65) + "&idt=th310",
        "https://evil.example/?idc=1&idt=th310",
        "https://opentheso.huma-num.fr.evil.example/?idc=1&idt=th310",
        "http://ex.org/concept/1",
    ],
)
def test_an_iri_that_is_not_a_thezoo_concept_is_refused(value: str) -> None:
    with pytest.raises(ValueError):
        validate_thezoo_concept_iri(value)


def test_a_concept_proposal_iri_can_be_annotated_but_is_not_a_thezoo_concept() -> None:
    assert validate_annotation_concept_iri(PROPOSAL_CONCEPT) == PROPOSAL_CONCEPT
    with pytest.raises(ValueError):
        validate_thezoo_concept_iri(PROPOSAL_CONCEPT)
    with pytest.raises(ValueError):
        validate_annotation_concept_iri("http://zoomathia.i3s.unice.fr/concept/proposal/abc")


@pytest.mark.parametrize(
    "value",
    [
        "http://ns.inria.fr/zoomathia/Pliny/historia_naturalis/10/172",
        "http://ns.inria.fr/zoomathia/x",
    ],
)
def test_a_corpus_paragraph_iri_is_accepted(value: str) -> None:
    assert validate_corpus_paragraph_iri(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "http://ns.inria.fr/zoomathia/",  # the namespace itself
        "http://ns.inria.fr/zoomathia",  # without the trailing slash
        "https://ns.inria.fr/zoomathia/x",
        "http://ns.inria.fr/zoomathia-evil/x",
        "http://ex.org/http://ns.inria.fr/zoomathia/x",
        "http://zoomathia.i3s.unice.fr/corpus/x",
        "http://ns.inria.fr/zoomathia/x>",
    ],
)
def test_an_iri_outside_the_corpus_namespace_is_refused(value: str) -> None:
    with pytest.raises(ValueError):
        validate_corpus_paragraph_iri(value)


@pytest.mark.parametrize("value", ["fr", "grc", "zh-Hant", "en-US"])
def test_a_plain_language_tag_is_accepted_by_the_export_validator(value: str) -> None:
    assert validate_language_tag(value) == value


@pytest.mark.parametrize("value", ["fr ; <x> <y> <z>", "f r", "", "fr\n", "1fr", "a" * 36])
def test_a_malformed_language_tag_is_refused(value: str) -> None:
    with pytest.raises(ValueError):
        validate_language_tag(value)


@pytest.mark.parametrize("value", ["a\x00b", "a\x0bb", "a\x7fb", "a\ud800b"])
def test_text_with_control_characters_or_lone_surrogates_is_refused(value: str) -> None:
    with pytest.raises(ValueError):
        validate_text(value)


def test_text_with_quotes_line_breaks_and_greek_is_accepted() -> None:
    value = 'He said "ἄνθρωπος"\r\nsecond\tline \\ \u2028'

    assert validate_text(value) == value


# --- Annotation request ---


async def test_a_valid_annotation_is_created(client: httpx.AsyncClient) -> None:
    response = await post_annotation(client)

    assert response.status_code == 200


async def test_an_annotation_on_a_concept_proposal_is_accepted(client: httpx.AsyncClient) -> None:
    response = await post_annotation(client, concept_uri=PROPOSAL_CONCEPT)

    assert response.status_code == 200


@pytest.mark.parametrize(
    "changes",
    [
        {"concept_uri": "http://ex.org/concept/1"},
        {"concept_uri": "https://opentheso.huma-num.fr/?idc=1&idt=th310>"},
        {"paragraph_uri": "http://ex.org/p/1"},
        {"paragraph_uri": "http://ns.inria.fr/zoomathia/p> <x> <y> <z"},
        {"end_paragraph_uri": "http://ex.org/p/1"},
        {"target_paragraphs": ["http://ex.org/p/1"]},
        {"target_paragraphs": [PARAGRAPH, "http://ns.inria.fr/zoomathia/p>"]},
        {"concept_type": "http://www.w3.org/2004/02/skos/core#Other"},
        {"scope_type": "chapter"},
        {"scope_type": ""},
    ],
)
async def test_an_annotation_with_an_invalid_reference_or_enumeration_is_refused(
    client: httpx.AsyncClient, changes: dict[str, Any]
) -> None:
    response = await post_annotation(client, **changes)

    assert response.status_code == 422
    assert (await client.get("/annotations")).json() == []


@pytest.mark.parametrize(
    "scope_type", ["word", "word_sequence", "sentence", "paragraph", "multi_paragraph"]
)
async def test_every_scope_type_of_the_interface_is_accepted(
    client: httpx.AsyncClient, scope_type: str
) -> None:
    response = await post_annotation(client, scope_type=scope_type)

    assert response.status_code == 200


@pytest.mark.parametrize(
    "concept_type",
    [
        "http://www.w3.org/2004/02/skos/core#Concept",
        "http://www.w3.org/2004/02/skos/core#Collection",
    ],
)
async def test_both_skos_concept_types_are_accepted(
    client: httpx.AsyncClient, concept_type: str
) -> None:
    response = await post_annotation(client, concept_type=concept_type)

    assert response.status_code == 200
    assert response.json()["concept_type"] == concept_type


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("target_text", 50_000),
        ("concept_label", 200),
        ("annotator_name", 200),
        ("justification", 5_000),
    ],
)
async def test_an_annotation_text_field_is_bounded(
    client: httpx.AsyncClient, field: str, limit: int
) -> None:
    at_limit = await post_annotation(client, **{field: repeated(limit)})
    beyond = await post_annotation(client, **{field: repeated(limit + 1)})

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


async def test_annotation_offsets_are_bounded(client: httpx.AsyncClient) -> None:
    at_limit = await post_annotation(client, start_offset=49_999, end_offset=50_000)
    beyond = await post_annotation(client, start_offset=0, end_offset=50_001)
    negative = await post_annotation(client, start_offset=-1)

    assert at_limit.status_code == 200
    assert beyond.status_code == 422
    assert negative.status_code == 422


async def test_target_paragraphs_are_limited_to_fifty(client: httpx.AsyncClient) -> None:
    paragraphs = [f"{PARAGRAPH}/{n}" for n in range(51)]

    at_limit = await post_annotation(client, target_paragraphs=paragraphs[:50])
    beyond = await post_annotation(client, target_paragraphs=paragraphs)

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


async def test_an_annotation_text_with_a_control_character_is_refused(
    client: httpx.AsyncClient,
) -> None:
    response = await post_annotation(client, target_text="canis\x00lupus")

    assert response.status_code == 422


async def test_the_validation_error_does_not_break_the_inverted_offsets_rule(
    client: httpx.AsyncClient,
) -> None:
    response = await post_annotation(client, start_offset=20, end_offset=10)

    assert response.status_code == 400


# --- Proposal request ---


async def test_a_valid_proposal_is_created(client: httpx.AsyncClient) -> None:
    response = await post_proposal(client, broader_concept_uri=CONCEPT, alt_labels=["a", "b"])

    assert response.status_code == 200


@pytest.mark.parametrize("language", ["fr", "en", "la", "grc"])
async def test_every_language_of_the_interface_is_accepted(
    client: httpx.AsyncClient, language: str
) -> None:
    response = await post_proposal(client, language=language)

    assert response.status_code == 200
    assert response.json()["language"] == language


@pytest.mark.parametrize(
    "language", ["de", "fr ; <x> <y> <z>", "", "fr-FR", "FR", "fr\n@prefix x: <y> ."]
)
async def test_a_language_outside_the_allowed_list_is_refused(
    client: httpx.AsyncClient, language: str
) -> None:
    response = await post_proposal(client, language=language)

    assert response.status_code == 422
    assert (await client.get("/thesaurus/proposals")).json() == []


@pytest.mark.parametrize(
    "broader",
    [
        "http://ex.org/concept/1",
        "https://opentheso.huma-num.fr/?idc=1&idt=th310> <http://x> <http://y> <http://z",
    ],
)
async def test_a_broader_concept_that_is_not_in_thezoo_is_refused(
    client: httpx.AsyncClient, broader: str
) -> None:
    response = await post_proposal(client, broader_concept_uri=broader)

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "limit"),
    [
        ("pref_label", 200),
        ("broader_concept_label", 200),
        ("contributor_name", 200),
        ("definition", 5_000),
    ],
)
async def test_a_proposal_text_field_is_bounded(
    client: httpx.AsyncClient, field: str, limit: int
) -> None:
    at_limit = await post_proposal(client, **{field: repeated(limit), "pref_label": "at limit"})
    beyond = await post_proposal(client, **{field: repeated(limit + 1)})

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


async def test_a_preferred_label_needs_two_characters(client: httpx.AsyncClient) -> None:
    assert (await post_proposal(client, pref_label="a")).status_code == 422
    assert (await post_proposal(client, pref_label="ab")).status_code == 200


async def test_alternative_labels_are_bounded_in_number_and_length(
    client: httpx.AsyncClient,
) -> None:
    at_limit = await post_proposal(client, alt_labels=[repeated(200)] * 20)
    too_many = await post_proposal(client, pref_label="too many", alt_labels=["x"] * 21)
    too_long = await post_proposal(client, pref_label="too long", alt_labels=[repeated(201)])

    assert at_limit.status_code == 200
    assert too_many.status_code == 422
    assert too_long.status_code == 422


# --- Saved queries ---


async def test_saved_query_fields_are_bounded(client: httpx.AsyncClient) -> None:
    for field, limit in (("title", 200), ("description", 2_000), ("category", 100)):
        at_limit = await client.post("/queries", json={**SAVED_QUERY, field: repeated(limit)})
        beyond = await client.post("/queries", json={**SAVED_QUERY, field: repeated(limit + 1)})
        assert at_limit.status_code == 200, field
        assert beyond.status_code == 422, field
    at_limit = await client.post("/queries", json={**SAVED_QUERY, "author_name": repeated(200)})
    beyond = await client.post("/queries", json={**SAVED_QUERY, "author_name": repeated(201)})
    assert at_limit.status_code == 200
    assert beyond.status_code == 422


async def test_saved_query_text_is_bounded_by_the_guard_limit(client: httpx.AsyncClient) -> None:
    padding = "#" + repeated(4_900)
    at_limit = SAVED_QUERY["query_text"] + "\n" + padding
    too_long = at_limit + repeated(200)

    ok = await client.post("/queries", json={**SAVED_QUERY, "query_text": at_limit})
    beyond = await client.post("/queries", json={**SAVED_QUERY, "query_text": too_long})
    spo_beyond = await client.post("/queries", json={**SAVED_QUERY, "query_spo_text": too_long})

    assert ok.status_code == 200
    assert beyond.status_code == 422
    assert spo_beyond.status_code == 422


async def test_updating_a_saved_query_is_bounded_too(client: httpx.AsyncClient) -> None:
    query_id = (await client.post("/queries", json=SAVED_QUERY)).json()["id"]

    ok = await client.put(f"/queries/{query_id}", json={"title": repeated(200)})
    beyond = await client.put(f"/queries/{query_id}", json={"title": repeated(201)})
    category = await client.put(f"/queries/{query_id}", json={"category": repeated(101)})

    assert ok.status_code == 200
    assert beyond.status_code == 422
    assert category.status_code == 422


# --- Query parameters ---


async def test_the_proposal_search_text_is_bounded(client: httpx.AsyncClient) -> None:
    at_limit = await client.get("/thesaurus/proposals", params={"q": repeated(200)})
    beyond = await client.get("/thesaurus/proposals", params={"q": repeated(201)})

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


async def test_the_saved_query_filters_are_bounded(client: httpx.AsyncClient) -> None:
    assert (await client.get("/queries", params={"search": repeated(200)})).status_code == 200
    assert (await client.get("/queries", params={"search": repeated(201)})).status_code == 422
    assert (await client.get("/queries", params={"category": repeated(100)})).status_code == 200
    assert (await client.get("/queries", params={"category": repeated(101)})).status_code == 422


async def test_the_annotation_paragraph_filter_is_bounded(client: httpx.AsyncClient) -> None:
    at_limit = await client.get("/annotations", params={"paragraph_uri": repeated(2048)})
    beyond = await client.get("/annotations", params={"paragraph_uri": repeated(2049)})

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


@pytest.mark.parametrize(
    ("path", "valid"),
    [
        ("/annotations", "En attente de validation"),
        ("/thesaurus/proposals", "En attente de révision"),
    ],
)
async def test_status_filters_accept_only_the_known_labels(
    client: httpx.AsyncClient, path: str, valid: str
) -> None:
    for status in (valid, "Validé", "Rejeté"):
        assert (await client.get(path, params={"status": status})).status_code == 200
    assert (await client.get(path, params={"status": "Publié"})).status_code == 422
    assert (await client.get(path, params={"status": ""})).status_code == 422


async def test_the_autocomplete_text_is_bounded_before_any_request(
    client: httpx.AsyncClient,
) -> None:
    too_short = await client.get("/thesaurus/autocomplete", params={"q": "a"})
    too_long = await client.get("/thesaurus/autocomplete", params={"q": repeated(101)})

    assert too_short.status_code == 422
    assert too_long.status_code == 422


# --- Custom search ---


async def test_custom_search_author_names_and_work_iris_are_bounded(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    long_author = await client.post("/customSearch", json={"author": [repeated(201)]})
    long_work = await client.post(
        "/customSearch", json={"work": ["http://ns.inria.fr/zoomathia/" + repeated(2048)]}
    )
    long_excluded = await client.post(
        "/customSearch", json={"author": ["Aelian"], "excluded_works": [repeated(2049)]}
    )
    at_limit = await client.post("/customSearch", json={"author": [repeated(200)]})

    assert long_author.status_code == 422
    assert long_work.status_code == 422
    assert long_excluded.status_code == 422
    assert at_limit.status_code == 200
    assert len(corese.queries) == 1


@pytest.mark.parametrize(
    "concepts",
    [
        [{"uri": 5}],
        [{"uri": ["http://ex.org/c"]}],
        [{"value": {"x": 1}}],
        [{"uri": "http://ex.org/c", "type": 3}],
        [{"uri": "http://ex.org/c", "label": ["x"]}],
        [42],
        [None],
        [["http://ex.org/c"]],
    ],
)
async def test_a_malformed_legacy_concept_gives_422_instead_of_a_server_error(
    client: httpx.AsyncClient, corese: FakeCorese, concepts: list[Any]
) -> None:
    response = await client.post("/customSearch", json={"author": ["Aelian"], "concepts": concepts})

    assert response.status_code == 422
    assert corese.queries == []


@pytest.mark.parametrize(
    "concepts",
    [
        ["http://ex.org/concept/c1"],
        [{"uri": "http://ex.org/concept/c1"}],
        [{"value": "http://ex.org/concept/c1"}],
        [{"uri": "http://ex.org/concept/c1", "type": "collection", "label": "k"}],
        [{"uri": None, "value": "http://ex.org/concept/c1"}],
    ],
)
async def test_a_well_formed_legacy_concept_is_accepted(
    client: httpx.AsyncClient, corese: FakeCorese, concepts: list[Any]
) -> None:
    response = await client.post("/customSearch", json={"author": ["Aelian"], "concepts": concepts})

    assert response.status_code == 200
    assert "http://ex.org/concept/c1" in corese.queries[0]


# --- Status updates ---


@pytest.mark.parametrize("status", ["Publié", "", "validé", "VALIDÉ", None, 3, ["Validé"]])
async def test_an_unknown_annotation_status_gives_422_and_changes_nothing(
    client: httpx.AsyncClient, status: Any
) -> None:
    annotation_id = (await post_annotation(client)).json()["id"]

    response = await client.patch(f"/annotations/{annotation_id}/status", json={"status": status})

    assert response.status_code == 422
    assert (await client.get("/annotations")).json()[0]["status"] == "En attente de validation"


@pytest.mark.parametrize("status", ["Publié", "", "En attente de validation", None])
async def test_an_unknown_proposal_status_gives_422_and_changes_nothing(
    client: httpx.AsyncClient, status: Any
) -> None:
    proposal_id = (await post_proposal(client)).json()["id"]

    response = await client.patch(
        f"/thesaurus/proposals/{proposal_id}/status", json={"status": status}
    )

    assert response.status_code == 422
    assert (await client.get("/thesaurus/proposals")).json()[0]["status"] == (
        "En attente de révision"
    )


async def test_every_known_status_is_accepted_and_an_unknown_id_is_a_404(
    client: httpx.AsyncClient,
) -> None:
    annotation_id = (await post_annotation(client)).json()["id"]
    proposal_id = (await post_proposal(client)).json()["id"]

    for status in ("En attente de validation", "Validé", "Rejeté"):
        response = await client.patch(
            f"/annotations/{annotation_id}/status", json={"status": status}
        )
        assert response.status_code == 200
    for status in ("En attente de révision", "Validé", "Rejeté"):
        response = await client.patch(
            f"/thesaurus/proposals/{proposal_id}/status", json={"status": status}
        )
        assert response.status_code == 200
    missing = await client.patch("/annotations/99999/status", json={"status": "Validé"})
    assert missing.status_code == 404


# --- Custom search criteria ---

LONG_IRI = "http://ex.org/" + repeated(2048 - len("http://ex.org/"))


async def search(client: httpx.AsyncClient, **body: Any) -> httpx.Response:
    return await client.post("/customSearch", json={"author": ["Aelian"], **body})


@pytest.mark.parametrize("field", ["concept_criteria", "collection_criteria"])
async def test_a_criterion_iri_is_bounded_and_checked(
    client: httpx.AsyncClient, corese: FakeCorese, field: str
) -> None:
    other_form = "https://opentheso.huma-num.fr/?idg=12&idt=th310"
    at_limit = await search(client, **{field: [{"uri": LONG_IRI}]})
    other = await search(client, **{field: [{"uri": other_form}]})
    too_long = await search(client, **{field: [{"uri": LONG_IRI + "a"}]})
    unsafe = await search(client, **{field: [{"uri": "http://ex.org/a>b"}]})
    not_http = await search(client, **{field: [{"uri": "ftp://ex.org/a"}]})
    missing = await search(client, **{field: [{"label": "no uri"}]})

    assert at_limit.status_code == 200
    assert other.status_code == 200  # not restricted to the TheZoo concept form
    assert too_long.status_code == unsafe.status_code == not_http.status_code == 422
    assert missing.status_code == 422
    assert len(corese.queries) == 2


@pytest.mark.parametrize("field", ["concept_criteria", "collection_criteria"])
async def test_a_criterion_label_is_bounded(
    client: httpx.AsyncClient, field: str, corese: FakeCorese
) -> None:
    uri = "http://ex.org/c1"

    at_limit = await search(client, **{field: [{"uri": uri, "label": repeated(200)}]})
    beyond = await search(client, **{field: [{"uri": uri, "label": repeated(201)}]})

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


async def test_a_concept_criterion_type_is_bounded(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    uri = "http://ex.org/c1"

    at_limit = await search(client, concept_criteria=[{"uri": uri, "type": repeated(2048)}])
    beyond = await search(client, concept_criteria=[{"uri": uri, "type": repeated(2049)}])

    assert at_limit.status_code == 200
    assert beyond.status_code == 422


@pytest.mark.parametrize("field", ["concept_criteria", "collection_criteria"])
async def test_a_criterion_polarity_is_include_or_exclude(
    client: httpx.AsyncClient, field: str, corese: FakeCorese
) -> None:
    uri = "http://ex.org/c1"

    valid: tuple[Any, ...] = ("include", "exclude")
    for polarity in valid:
        response = await search(client, **{field: [{"uri": uri, "polarity": polarity}]})
        assert response.status_code == 200, polarity
    invalid: tuple[Any, ...] = ("Include", "", "negate", None)
    for polarity in invalid:
        response = await search(client, **{field: [{"uri": uri, "polarity": polarity}]})
        assert response.status_code == 422, polarity


async def test_the_match_mode_is_and_or_or(client: httpx.AsyncClient, corese: FakeCorese) -> None:
    for mode in ("AND", "OR", None):
        response = await search(client, match_mode=mode)
        assert response.status_code == 200, mode
    for mode in ("and", "XOR", ""):
        response = await search(client, match_mode=mode)
        assert response.status_code == 422, mode


async def test_the_fields_the_search_page_sends_are_accepted(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    # What ExploreCorpus.tsx sends: the criteria carry the extra `category` and `collection`.
    body = {
        "author": ["Aelian"],
        "work": [],
        "excluded_works": [],
        "concept_criteria": [
            {
                "uri": CONCEPT,
                "label": "canis",
                "type": "http://www.w3.org/2004/02/skos/core#Concept",
                "category": "animal",
                "collection": None,
                "include_subconcepts": False,
                "polarity": "include",
            }
        ],
        "collection_criteria": [
            {"uri": "http://ex.org/collection/k1", "label": "Chiens", "polarity": "exclude"}
        ],
        "match_mode": "AND",
    }

    response = await client.post("/customSearch", json=body)

    assert response.status_code == 200
    assert len(corese.queries) == 1


async def test_a_criterion_iri_with_surrounding_whitespace_is_still_accepted(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    response = await search(client, concept_criteria=[{"uri": " http://ex.org/c1\n"}])

    assert response.status_code == 200
    assert "<http://ex.org/c1>" in corese.queries[0]


@pytest.mark.parametrize(
    "item",
    [
        {"uri": repeated(2049)},
        {"value": repeated(2049)},
        {"uri": "http://ex.org/c", "type": repeated(2049)},
        {"uri": "http://ex.org/c", "label": repeated(201)},
        repeated(2049),
    ],
)
async def test_the_legacy_concept_fields_are_bounded(
    client: httpx.AsyncClient, corese: FakeCorese, item: Any
) -> None:
    response = await search(client, concepts=[item])

    assert response.status_code == 422
    assert corese.queries == []


async def test_the_legacy_concept_fields_are_accepted_at_their_limit(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    items: list[Any] = [
        {"uri": LONG_IRI},
        {"value": LONG_IRI},
        {"uri": "http://ex.org/c", "type": repeated(2048), "label": repeated(200)},
        LONG_IRI,
    ]

    for item in items:
        assert (await search(client, concepts=[item])).status_code == 200


async def test_an_unsafe_legacy_concept_iri_is_still_a_400_not_a_server_error(
    client: httpx.AsyncClient, corese: FakeCorese
) -> None:
    for item in ("http://ex.org/a>b", {"uri": "http://ex.org/a>b"}, {"value": "javascript:x"}):
        response = await search(client, concepts=[item])
        assert response.status_code == 400
    assert corese.queries == []
