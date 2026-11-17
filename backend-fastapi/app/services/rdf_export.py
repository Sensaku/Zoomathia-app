"""RDF exports of the staging data, built with rdflib (RM-PUB-01, AGENTS.md rule 4).

Annotations follow the W3C Web Annotation model and proposals follow SKOS. The graphs are
serialized by rdflib, never assembled by string concatenation, so a name, a label or a text
cannot add a triple to the export.

A row stored before the input validation existed may hold a value that cannot be exported
safely (an IRI with a `>`, a malformed language tag). Such a row is left out of the export,
logged by its identifier and counted in `RdfExport.skipped_rows`, so the loss is visible.
"""

import json
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import DCTERMS, RDF, SKOS, XSD

from app.contributions.models import Annotation, TermProposal
from app.shared.validation import (
    PROPOSAL_CONCEPT_BASE,
    validate_iri,
    validate_language_tag,
    validate_text,
)

logger = logging.getLogger(__name__)

OA = Namespace("http://www.w3.org/ns/oa#")
ZOO = Namespace("http://ns.inria.fr/zoomathia/zoo#")

# IRIs minted by the server for the staged resources.
ANNOTATION_BASE = "http://zoomathia.i3s.unice.fr/annotation/staging/"

_Row = TypeVar("_Row", Annotation, TermProposal)


@dataclass(frozen=True)
class RdfExport:
    """A Turtle document and the number of stored rows that had to be left out of it."""

    turtle: str
    skipped_rows: int


def _is_exportable(row: _Row, check: Callable[[_Row], None]) -> bool:
    """Whether `check` accepts the row; a refusal is logged by identifier only."""
    try:
        check(row)
    except ValueError:
        # Only the identifier is logged: the offending value could carry log-forging text.
        logger.warning("Row %s left out of the RDF export: it holds an unsafe value", row.id)
        return False
    return True


def _creator(row: Annotation | TermProposal) -> str:
    """The name that `dcterms:creator` carries: the account's display name, or the historical one.

    The email is never exported (RM-CPT-05).
    """
    if row.author is not None:
        return row.author.display_name
    return row.author_label or ""


def _check_annotation(annotation: Annotation) -> None:
    validate_iri(annotation.concept_uri)
    validate_iri(annotation.paragraph_uri)
    if annotation.end_paragraph_uri:
        validate_iri(annotation.end_paragraph_uri)
    for text in (
        annotation.target_text,
        _creator(annotation),
        annotation.scope_type,
        annotation.justification or "",
    ):
        validate_text(text)


def _check_proposal(proposal: TermProposal) -> None:
    validate_language_tag(proposal.language)
    if proposal.broader_concept_uri:
        validate_iri(proposal.broader_concept_uri)
    for text in (
        proposal.pref_label,
        *json.loads(proposal.alt_labels),
        proposal.definition or "",
        _creator(proposal),
    ):
        validate_text(text)


def _filter_exportable(
    rows: Sequence[_Row], check: Callable[[_Row], None]
) -> tuple[list[_Row], int]:
    """The rows that pass `check`, and how many were refused."""
    kept = [row for row in rows if _is_exportable(row, check)]
    return kept, len(rows) - len(kept)


def annotations_to_turtle(annotations: Sequence[Annotation]) -> RdfExport:
    """Serialize annotations as Turtle, in the W3C Web Annotation model (`oa:`).

    Each annotation has the IRI `http://zoomathia.i3s.unice.fr/annotation/staging/<id>`,
    the concept as `oa:hasBody`, and a target made of a specific resource (the paragraph,
    and `zoo:endSource` for a multi-paragraph annotation) and a text position selector
    (`oa:exact`, `oa:start` and `oa:end` as `xsd:integer`). `dcterms:created` is an
    `xsd:dateTime`.

    `dcterms:creator` is the display name of the author's account, or the historical author
    of a row stored before accounts existed (RM-CTB-06); `zoo:proposalStatus` is the status
    code (`pending`, `validated`, `rejected`).

    Args:
        annotations: The stored annotations, with their author loaded.

    Returns:
        The Turtle document, and the number of annotations left out because one of their
        IRIs or texts is unsafe (rows stored before the input validation).
    """
    kept, skipped = _filter_exportable(annotations, _check_annotation)
    graph = Graph()
    for prefix, namespace in (
        ("oa", OA),
        ("skos", SKOS),
        ("dcterms", DCTERMS),
        ("xsd", XSD),
        ("zoo", ZOO),
    ):
        graph.bind(prefix, namespace)

    for a in kept:
        annotation = URIRef(f"{ANNOTATION_BASE}{a.id}")
        target = BNode()
        selector = BNode()
        graph.add((annotation, RDF.type, OA.Annotation))
        graph.add((annotation, OA.hasBody, URIRef(a.concept_uri)))
        graph.add((annotation, OA.hasTarget, target))
        graph.add((annotation, DCTERMS.creator, Literal(_creator(a))))
        graph.add((annotation, ZOO.proposalStatus, Literal(a.status.value)))
        graph.add((annotation, ZOO.scopeType, Literal(a.scope_type)))
        if a.justification:
            graph.add((annotation, DCTERMS.description, Literal(a.justification)))
        graph.add(
            (annotation, DCTERMS.created, Literal(a.created_at.isoformat(), datatype=XSD.dateTime))
        )

        graph.add((target, RDF.type, OA.SpecificResource))
        graph.add((target, OA.hasSource, URIRef(a.paragraph_uri)))
        if a.end_paragraph_uri and a.end_paragraph_uri != a.paragraph_uri:
            graph.add((target, ZOO.endSource, URIRef(a.end_paragraph_uri)))
        graph.add((target, OA.hasSelector, selector))

        graph.add((selector, RDF.type, OA.TextPositionSelector))
        graph.add((selector, OA.exact, Literal(a.target_text)))
        graph.add((selector, OA.start, Literal(a.start_offset)))
        graph.add((selector, OA.end, Literal(a.end_offset)))

    return RdfExport(turtle=graph.serialize(format="turtle"), skipped_rows=skipped)


def proposals_to_turtle(proposals: Sequence[TermProposal]) -> RdfExport:
    """Serialize thesaurus proposals as Turtle, in SKOS.

    Each proposal is a `skos:Concept` with the IRI
    `http://zoomathia.i3s.unice.fr/concept/proposal/<id>`, its preferred label, alternative
    labels and definition tagged with the proposal language, an optional `skos:broader`,
    `dcterms:creator` and `dcterms:created` (`xsd:dateTime`).

    Args:
        proposals: The stored proposals, with their author loaded.

    Returns:
        The Turtle document, and the number of proposals left out because their language
        tag, IRI or texts are unsafe (rows stored before the input validation).
    """
    kept, skipped = _filter_exportable(proposals, _check_proposal)
    graph = Graph()
    for prefix, namespace in (("skos", SKOS), ("dcterms", DCTERMS), ("xsd", XSD)):
        graph.bind(prefix, namespace)

    for p in kept:
        concept = URIRef(f"{PROPOSAL_CONCEPT_BASE}{p.id}")
        graph.add((concept, RDF.type, SKOS.Concept))
        graph.add((concept, SKOS.prefLabel, Literal(p.pref_label, lang=p.language)))
        for alt in json.loads(p.alt_labels):
            graph.add((concept, SKOS.altLabel, Literal(alt, lang=p.language)))
        if p.broader_concept_uri:
            graph.add((concept, SKOS.broader, URIRef(p.broader_concept_uri)))
        if p.definition:
            graph.add((concept, SKOS.definition, Literal(p.definition, lang=p.language)))
        graph.add((concept, DCTERMS.creator, Literal(_creator(p))))
        graph.add(
            (concept, DCTERMS.created, Literal(p.created_at.isoformat(), datatype=XSD.dateTime))
        )

    return RdfExport(turtle=graph.serialize(format="turtle"), skipped_rows=skipped)
