"""
Pydantic models for W3C semantic annotations, TheZoo thesaurus proposals, saved SPARQL
queries and the interactive SPARQL playground.

The request models validate their input (RM-ACC-02, RM-ANN-04, RM-THE-05): maximum lengths,
enumerations and IRI formats come from `app.shared.validation`, so that the rules exist once.
A value that breaks them gives a 422 before it reaches the store. The response models do not
validate: they must be able to return rows stored before these rules existed.
"""

from pydantic import BaseModel, Field

from app.shared.sparql_guard import MAX_QUERY_LENGTH
from app.shared.validation import (
    MAX_ALT_LABELS,
    MAX_OFFSET,
    MAX_TARGET_PARAGRAPHS,
    SKOS_CONCEPT,
    AnnotationConceptIri,
    AnnotationStatus,
    ConceptType,
    CorpusParagraphIri,
    LanguageCode,
    ProposalStatus,
    ScopeType,
    Text100,
    Text200,
    Text2000,
    Text5000,
    Text50000,
    TheZooConceptIri,
)

# RM-CTB-04: the server alone decides the status of a new annotation.
INITIAL_ANNOTATION_STATUS = "En attente de validation"


class CreateAnnotationRequest(BaseModel):
    """Request to create a manual annotation on a passage of an ancient text.

    There is no `status` field: a new annotation is always pending validation, and a
    `status` sent by a client is ignored (RM-CTB-04).
    """

    paragraph_uri: CorpusParagraphIri = Field(
        ..., description="IRI of the annotated paragraph (corpus namespace)"
    )
    target_text: Text50000 = Field(
        ..., description="Exact text selected in the manuscript or witness"
    )
    start_offset: int = Field(
        ..., ge=0, le=MAX_OFFSET, description="Start character index in the paragraph text"
    )
    end_offset: int = Field(..., ge=0, le=MAX_OFFSET, description="End character index (excluded)")
    concept_uri: AnnotationConceptIri = Field(
        ...,
        description=(
            "IRI of the TheZoo concept (https://opentheso.huma-num.fr/?idc=<id>&idt=th310), "
            "or of a concept proposal"
        ),
    )
    concept_label: Text200 = Field(..., description="Label of the concept (e.g. canis, aigle)")
    concept_type: ConceptType | None = Field(default=SKOS_CONCEPT, description="RDF/SKOS type")
    annotator_name: Text200 | None = Field(
        default="Chercheur anonyme", description="Name or identifier of the contributor"
    )
    justification: Text5000 | None = Field(
        default=None, description="Scientific or philological justification of the annotator"
    )
    scope_type: ScopeType | None = Field(
        default="word_sequence",
        description="Granularity: word, word_sequence, sentence, paragraph, multi_paragraph",
    )
    end_paragraph_uri: CorpusParagraphIri | None = Field(
        default=None, description="IRI of the last paragraph of a multi-paragraph annotation"
    )
    target_paragraphs: list[CorpusParagraphIri] | None = Field(
        default=None,
        max_length=MAX_TARGET_PARAGRAPHS,
        description="IRIs of the paragraphs covered (at most 50)",
    )


class AnnotationResponse(BaseModel):
    """An annotation as stored in the staging database."""

    id: int
    paragraph_uri: str
    target_text: str
    start_offset: int
    end_offset: int
    concept_uri: str
    concept_label: str
    concept_type: str
    annotator_name: str
    justification: str | None = None
    scope_type: str = "word_sequence"
    end_paragraph_uri: str | None = None
    target_paragraphs: list[str] = []
    status: str = INITIAL_ANNOTATION_STATUS
    created_at: str


class UpdateAnnotationStatusRequest(BaseModel):
    """Update of the editorial status of an annotation."""

    status: AnnotationStatus = Field(
        ..., description="New status: 'En attente de validation', 'Validé', 'Rejeté'"
    )


class ThesaurusProposalRequest(BaseModel):
    """Request to propose a new term for the TheZoo thesaurus (th310)."""

    pref_label: Text200 = Field(..., min_length=2, description="Proposed preferred term")
    language: LanguageCode = Field(default="fr", description="Language code (fr, en, grc, la)")
    alt_labels: list[Text200] | None = Field(
        default_factory=list,
        max_length=MAX_ALT_LABELS,
        description="Synonyms or spelling variants (at most 20)",
    )
    broader_concept_uri: TheZooConceptIri | None = Field(
        None, description="IRI of the generic parent concept (TheZoo)"
    )
    broader_concept_label: Text200 | None = Field(
        None, description="Preferred label (prefLabel) of the generic parent concept"
    )
    definition: Text5000 | None = Field(
        None, description="Scientific definition or contextual justification"
    )
    contributor_name: Text200 | None = Field(
        default="Chercheur anonyme", description="Name of the contributor"
    )


class ThesaurusProposalResponse(BaseModel):
    """A thesaurus concept proposal as stored."""

    id: int
    pref_label: str
    language: str
    alt_labels: list[str]
    broader_concept_uri: str | None
    broader_concept_label: str | None = None
    definition: str | None
    contributor_name: str
    status: str = Field(default="En attente de révision", description="Editorial status")
    created_at: str


class UpdateProposalStatusRequest(BaseModel):
    """Update of the review status of a SKOS proposal."""

    status: ProposalStatus = Field(
        ..., description="New status: 'En attente de révision', 'Validé', 'Rejeté'"
    )


class SparqlQueryRequest(BaseModel):
    """Payload of the SPARQL playground."""

    query: str = Field(..., min_length=10, description="SPARQL SELECT or CONSTRUCT query")


class CreateSavedQueryRequest(BaseModel):
    """Request to save a SPARQL query."""

    title: Text200 = Field(..., min_length=3, description="Explicit title of the query")
    description: Text2000 | None = Field(
        None, description="Intent or scientific goal of the research"
    )
    query_text: str = Field(
        ...,
        min_length=10,
        max_length=MAX_QUERY_LENGTH,
        description="SPARQL code (SELECT or ASK)",
    )
    query_spo_text: str | None = Field(
        None, max_length=MAX_QUERY_LENGTH, description="SPO variant for the VENUS graph view"
    )
    category: Text100 | None = Field(default="Recherche personnalisée", description="Theme")
    author_name: Text200 | None = Field(
        default="Chercheur Zoomathia", description="Name of the query author"
    )


class UpdateSavedQueryRequest(BaseModel):
    """Request to update an existing saved SPARQL query."""

    title: Text200 | None = Field(None, min_length=3)
    description: Text2000 | None = None
    query_text: str | None = Field(None, min_length=10, max_length=MAX_QUERY_LENGTH)
    query_spo_text: str | None = Field(None, max_length=MAX_QUERY_LENGTH)
    category: Text100 | None = None
    author_name: Text200 | None = None


class SavedQueryResponse(BaseModel):
    """A saved SPARQL query as stored."""

    id: int
    title: str
    description: str | None
    query_text: str
    query_spo_text: str | None
    category: str
    author_name: str
    is_builtin: bool
    created_at: str
    updated_at: str
