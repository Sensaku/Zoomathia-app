"""RDF exports of annotations and proposals are built by rdflib (RM-PUB-01, AGENTS.md rule 4).

Each export is parsed back and compared with the exact set of triples that it must hold: a
value sent by a client, or planted in the store, can never add a triple.
"""

import json
import logging
from typing import Any

import httpx
import pytest
from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.compare import isomorphic
from rdflib.namespace import DCTERMS, RDF, SKOS, XSD

from app.services.staging_store import staging_store

OA = Namespace("http://www.w3.org/ns/oa#")
ZOO = Namespace("http://ns.inria.fr/zoomathia/zoo#")

PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/1"
END_PARAGRAPH = "http://ns.inria.fr/zoomathia/Aelian/de_natura_animalium/4/24/text/2"
CONCEPT = "https://opentheso.huma-num.fr/?idc=107399&idt=th310"
CREATED = "2026-11-16T10:00:00+00:00"

# What a hostile client would send to add triples to the export.
INJECTION_NAME = 'x" ;\n    dcterms:creator "evil" .\n<http://evil/s> <http://evil/p> "o'
BAD_IRI = "http://ex.org/a> <http://evil/p> <http://evil/o> . <http://ex.org/b"


def parse(turtle: str) -> Graph:
    graph = Graph()
    graph.parse(data=turtle, format="turtle")
    return graph


def plant_annotation(**overrides: Any) -> int:
    """Insert a row directly in the store, the way a row stored before the validation exists."""
    row: dict[str, Any] = {
        "paragraph_uri": PARAGRAPH,
        "target_text": "canis",
        "start_offset": 0,
        "end_offset": 5,
        "concept_uri": CONCEPT,
        "concept_label": "canis",
        "concept_type": "http://www.w3.org/2004/02/skos/core#Concept",
        "annotator_name": "Chercheuse",
        "justification": None,
        "scope_type": "word",
        "end_paragraph_uri": None,
        "target_paragraphs": json.dumps([PARAGRAPH]),
        "status": "En attente de validation",
        "created_at": CREATED,
    }
    row.update(overrides)
    columns = ", ".join(row)
    placeholders = ", ".join("?" for _ in row)
    with staging_store._get_connection() as connection:
        cursor = connection.execute(
            f"INSERT INTO staged_annotations ({columns}) VALUES ({placeholders})",  # noqa: S608
            tuple(row.values()),
        )
        return int(cursor.lastrowid or 0)


def plant_proposal(**overrides: Any) -> int:
    row: dict[str, Any] = {
        "pref_label": "cerf",
        "language": "fr",
        "alt_labels": json.dumps(["biche"]),
        "broader_concept_uri": CONCEPT,
        "broader_concept_label": "cervidé",
        "definition": "Grand mammifère",
        "contributor_name": "Chercheuse",
        "status": "En attente de révision",
        "created_at": CREATED,
    }
    row.update(overrides)
    columns = ", ".join(row)
    placeholders = ", ".join("?" for _ in row)
    with staging_store._get_connection() as connection:
        cursor = connection.execute(
            f"INSERT INTO thesaurus_proposals ({columns}) VALUES ({placeholders})",  # noqa: S608
            tuple(row.values()),
        )
        return int(cursor.lastrowid or 0)


def expected_annotation_graph(
    annotation_id: int,
    *,
    text: str = "canis",
    name: str = "Chercheuse",
    justification: str | None = None,
    end_source: str | None = None,
    start: int = 0,
    end: int = 5,
    scope: str = "word",
    status: str = "En attente de validation",
) -> Graph:
    graph = Graph()
    annotation = URIRef(f"http://zoomathia.i3s.unice.fr/annotation/staging/{annotation_id}")
    target, selector = BNode(), BNode()
    graph.add((annotation, RDF.type, OA.Annotation))
    graph.add((annotation, OA.hasBody, URIRef(CONCEPT)))
    graph.add((annotation, OA.hasTarget, target))
    graph.add((annotation, DCTERMS.creator, Literal(name)))
    graph.add((annotation, ZOO.proposalStatus, Literal(status)))
    graph.add((annotation, ZOO.scopeType, Literal(scope)))
    if justification:
        graph.add((annotation, DCTERMS.description, Literal(justification)))
    graph.add((annotation, DCTERMS.created, Literal(CREATED, datatype=XSD.dateTime)))
    graph.add((target, RDF.type, OA.SpecificResource))
    graph.add((target, OA.hasSource, URIRef(PARAGRAPH)))
    if end_source:
        graph.add((target, ZOO.endSource, URIRef(end_source)))
    graph.add((target, OA.hasSelector, selector))
    graph.add((selector, RDF.type, OA.TextPositionSelector))
    graph.add((selector, OA.exact, Literal(text)))
    graph.add((selector, OA.start, Literal(start)))
    graph.add((selector, OA.end, Literal(end)))
    return graph


# --- Annotations ---


async def test_the_annotation_export_holds_exactly_the_expected_triples(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/annotations",
        json={
            "paragraph_uri": PARAGRAPH,
            "end_paragraph_uri": END_PARAGRAPH,
            "target_text": "canis lupus",
            "start_offset": 4,
            "end_offset": 17,
            "concept_uri": CONCEPT,
            "concept_label": "canis",
            "annotator_name": "Chercheuse",
            "justification": "Mention explicite",
            "scope_type": "multi_paragraph",
        },
    )
    annotation_id = created.json()["id"]
    stored_at = created.json()["created_at"]

    response = await client.get("/annotations/export-ttl")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/turtle")
    assert response.headers["x-skipped-rows"] == "0"
    expected = expected_annotation_graph(
        annotation_id,
        text="canis lupus",
        justification="Mention explicite",
        end_source=END_PARAGRAPH,
        start=4,
        end=17,
        scope="multi_paragraph",
    )
    expected.remove((None, DCTERMS.created, None))
    annotation = URIRef(f"http://zoomathia.i3s.unice.fr/annotation/staging/{annotation_id}")
    expected.add((annotation, DCTERMS.created, Literal(stored_at, datatype=XSD.dateTime)))
    assert isomorphic(parse(response.text), expected)


async def test_offsets_are_integers_and_the_date_is_a_datetime(client: httpx.AsyncClient) -> None:
    plant_annotation(start_offset=3, end_offset=9)

    graph = parse((await client.get("/annotations/export-ttl")).text)

    start = next(graph.objects(None, OA.start))
    created = next(graph.objects(None, DCTERMS.created))
    assert isinstance(start, Literal) and start.datatype == XSD.integer
    assert isinstance(created, Literal) and created.datatype == XSD.dateTime


async def test_a_single_paragraph_annotation_has_no_end_source(client: httpx.AsyncClient) -> None:
    plant_annotation(end_paragraph_uri=PARAGRAPH)

    graph = parse((await client.get("/annotations/export-ttl")).text)

    assert list(graph.triples((None, ZOO.endSource, None))) == []


async def test_the_export_binds_readable_prefixes(client: httpx.AsyncClient) -> None:
    plant_annotation()

    text = (await client.get("/annotations/export-ttl")).text

    for prefix in ("oa", "dcterms", "xsd", "zoo"):
        assert f"@prefix {prefix}:" in text
    assert "oa:Annotation" in text


async def test_names_and_texts_with_quotes_and_line_breaks_cannot_add_a_triple(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/annotations",
        json={
            "paragraph_uri": PARAGRAPH,
            "target_text": INJECTION_NAME,
            "start_offset": 0,
            "end_offset": 5,
            "concept_uri": CONCEPT,
            "concept_label": INJECTION_NAME,
            "annotator_name": INJECTION_NAME,
            "justification": INJECTION_NAME,
            "scope_type": "word",
        },
    )
    assert created.status_code == 200
    annotation_id = created.json()["id"]

    graph = parse((await client.get("/annotations/export-ttl")).text)

    assert len(graph) == 8 + 3 + 4  # annotation, target, selector: nothing else
    annotation = URIRef(f"http://zoomathia.i3s.unice.fr/annotation/staging/{annotation_id}")
    assert list(graph.objects(annotation, DCTERMS.creator)) == [Literal(INJECTION_NAME)]
    assert list(graph.objects(None, OA.exact)) == [Literal(INJECTION_NAME)]
    assert not any(
        "evil" in str(term)
        for triple in graph
        for term in triple
        if term != Literal(INJECTION_NAME)
    )


async def test_the_selected_text_keeps_its_line_breaks(client: httpx.AsyncClient) -> None:
    plant_annotation(target_text="first\nsecond")

    graph = parse((await client.get("/annotations/export-ttl")).text)

    assert list(graph.objects(None, OA.exact)) == [Literal("first\nsecond")]


@pytest.mark.parametrize(
    "overrides",
    [
        {"concept_uri": BAD_IRI},
        {"paragraph_uri": BAD_IRI},
        {"end_paragraph_uri": BAD_IRI},
        {"concept_uri": "javascript:alert(1)"},
        {"concept_uri": "http://ex.org/a\nb"},
        {"concept_uri": "http://ex.org/" + "a" * 2100},
        {"annotator_name": "a\x00b"},
        {"target_text": "a\x0bb"},
    ],
)
async def test_a_stored_row_with_an_unsafe_value_is_left_out_and_counted(
    client: httpx.AsyncClient, overrides: dict[str, Any], caplog: pytest.LogCaptureFixture
) -> None:
    good_id = plant_annotation()
    bad_id = plant_annotation(**overrides)
    other_good_id = plant_annotation(target_text="leo")

    with caplog.at_level(logging.WARNING, logger="app.services.rdf_export"):
        response = await client.get("/annotations/export-ttl")

    assert response.status_code == 200
    assert response.headers["x-skipped-rows"] == "1"
    graph = parse(response.text)
    exported = {str(subject) for subject in graph.subjects(RDF.type, OA.Annotation)}
    prefix = "http://zoomathia.i3s.unice.fr/annotation/staging/"
    assert exported == {f"{prefix}{good_id}", f"{prefix}{other_good_id}"}
    assert not any("evil" in str(term) for triple in graph for term in triple)
    messages = [record.getMessage() for record in caplog.records]
    assert any(str(bad_id) in message for message in messages)
    assert not any("evil" in message for message in messages)


async def test_an_export_with_no_row_is_an_empty_valid_document(client: httpx.AsyncClient) -> None:
    response = await client.get("/annotations/export-ttl")

    assert response.status_code == 200
    assert response.headers["x-skipped-rows"] == "0"
    assert len(parse(response.text)) == 0


async def test_a_validated_annotation_keeps_its_status_in_the_export(
    client: httpx.AsyncClient,
) -> None:
    annotation_id = plant_annotation()
    await client.patch(f"/annotations/{annotation_id}/status", json={"status": "Validé"})

    graph = parse((await client.get("/annotations/export-ttl")).text)

    assert list(graph.objects(None, ZOO.proposalStatus)) == [Literal("Validé")]


# --- Proposals ---


async def test_the_proposal_export_holds_exactly_the_expected_triples(
    client: httpx.AsyncClient,
) -> None:
    created = await client.post(
        "/thesaurus/proposals",
        json={
            "pref_label": "Cerf élaphe",
            "language": "fr",
            "alt_labels": ["Cervus elaphus", 'Grand "cerf"'],
            "broader_concept_uri": CONCEPT,
            "definition": "Grand mammifère\ncervidé",
            "contributor_name": "Arnaud B.",
        },
    )
    proposal = created.json()

    response = await client.get("/thesaurus/proposals/export-ttl")

    assert response.status_code == 200
    assert response.headers["x-skipped-rows"] == "0"
    concept = URIRef(f"http://zoomathia.i3s.unice.fr/concept/proposal/{proposal['id']}")
    expected = Graph()
    expected.add((concept, RDF.type, SKOS.Concept))
    expected.add((concept, SKOS.prefLabel, Literal("Cerf élaphe", lang="fr")))
    expected.add((concept, SKOS.altLabel, Literal("Cervus elaphus", lang="fr")))
    expected.add((concept, SKOS.altLabel, Literal('Grand "cerf"', lang="fr")))
    expected.add((concept, SKOS.broader, URIRef(CONCEPT)))
    expected.add((concept, SKOS.definition, Literal("Grand mammifère\ncervidé", lang="fr")))
    expected.add((concept, DCTERMS.creator, Literal("Arnaud B.")))
    expected.add((concept, DCTERMS.created, Literal(proposal["created_at"], datatype=XSD.dateTime)))
    assert isomorphic(parse(response.text), expected)


async def test_a_proposal_without_broader_or_definition_has_neither_triple(
    client: httpx.AsyncClient,
) -> None:
    plant_proposal(broader_concept_uri=None, definition=None, alt_labels=json.dumps([]))

    graph = parse((await client.get("/thesaurus/proposals/export-ttl")).text)

    assert list(graph.triples((None, SKOS.broader, None))) == []
    assert list(graph.triples((None, SKOS.definition, None))) == []
    assert list(graph.triples((None, SKOS.altLabel, None))) == []
    assert len(graph) == 4


async def test_proposal_labels_cannot_add_a_triple(client: httpx.AsyncClient) -> None:
    created = await client.post(
        "/thesaurus/proposals",
        json={
            "pref_label": INJECTION_NAME,
            "language": "grc",
            "alt_labels": [INJECTION_NAME],
            "definition": INJECTION_NAME,
            "contributor_name": INJECTION_NAME,
        },
    )
    assert created.status_code == 200

    graph = parse((await client.get("/thesaurus/proposals/export-ttl")).text)

    assert len(graph) == 6  # type, prefLabel, altLabel, definition, creator, created
    assert list(graph.objects(None, SKOS.prefLabel)) == [Literal(INJECTION_NAME, lang="grc")]
    assert list(graph.objects(None, DCTERMS.creator)) == [Literal(INJECTION_NAME)]


@pytest.mark.parametrize(
    "overrides",
    [
        {"language": "fr ; <http://evil/p> <http://evil/o> "},
        {"language": 'fr" ; <x> <y> <z>'},
        {"language": ""},
        {"language": "fr\n"},
        {"broader_concept_uri": BAD_IRI},
        {"broader_concept_uri": "http://ex.org/a b"},
        {"pref_label": "a\x00b"},
        {"alt_labels": json.dumps(["ok", "a\x0bb"])},
    ],
)
async def test_a_stored_proposal_with_an_unsafe_value_is_left_out_and_counted(
    client: httpx.AsyncClient, overrides: dict[str, Any], caplog: pytest.LogCaptureFixture
) -> None:
    good_id = plant_proposal()
    bad_id = plant_proposal(**overrides)

    with caplog.at_level(logging.WARNING, logger="app.services.rdf_export"):
        response = await client.get("/thesaurus/proposals/export-ttl")

    assert response.status_code == 200
    assert response.headers["x-skipped-rows"] == "1"
    graph = parse(response.text)
    base = "http://zoomathia.i3s.unice.fr/concept/proposal/"
    assert {str(subject) for subject in graph.subjects(RDF.type, SKOS.Concept)} == {
        f"{base}{good_id}"
    }
    assert not any("evil" in str(term) for triple in graph for term in triple)
    assert any(str(bad_id) in record.getMessage() for record in caplog.records)


@pytest.mark.parametrize("language", ["zh-Hant", "en-US"])
async def test_a_stored_proposal_with_a_plain_but_unlisted_language_is_still_exported(
    client: httpx.AsyncClient, language: str
) -> None:
    plant_proposal(language=language)

    response = await client.get("/thesaurus/proposals/export-ttl")

    assert response.headers["x-skipped-rows"] == "0"
    assert len(parse(response.text)) == 7
