"""Pydantic request and response models of the contributions domain.

The request models validate their input (RM-ACC-02, RM-ANN-04, RM-THE-05): maximum lengths,
enumerations and IRI formats come from `app.shared.validation`, so that the rules exist once.
A value that breaks them gives a 422 before it reaches the service. The response models do
not validate: they must be able to return rows stored before these rules existed.

A creation request has no author and no status: the server decides both (RM-CTB-03,
RM-CTB-04), and a field that a client adds is ignored. An update request refuses unknown
fields, so that a client cannot believe it changed the annotated passage.

No response carries an email: a contributor's public identity is the display name and the
affiliation (RM-CPT-05).
"""

import json
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.accounts.schemas import PublicIdentity, identity_of
from app.accounts.viewer import Viewer
from app.contributions.models import Annotation, ContributionStatus, TermProposal
from app.contributions.policy import Action, allowed_actions
from app.shared.validation import (
    MAX_ALT_LABELS,
    MAX_OFFSET,
    MAX_TARGET_PARAGRAPHS,
    SKOS_CONCEPT,
    AnnotationConceptIri,
    ConceptType,
    CorpusParagraphIri,
    LanguageCode,
    ScopeType,
    Text200,
    Text5000,
    Text50000,
    TheZooConceptIri,
    validate_text,
)
from app.thesaurus.categories import Category
from app.thesaurus.collections import CollectionIndex
from app.thesaurus.schemas import ConceptCollectionOut

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
MAX_PAGE_OFFSET = 100_000
MAX_REASON_LENGTH = 2_000

RejectionReason = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_REASON_LENGTH),
    AfterValidator(validate_text),
]


class ReviewRequest(BaseModel):
    """A peer review (RM-MOD-01, RM-MOD-03): validate, or reject with a reason."""

    version: int = Field(..., ge=1, description="Version of the contribution that was reviewed")
    decision: Literal["validated", "rejected"]
    reason: RejectionReason | None = Field(
        default=None, description="Required to reject, refused to validate"
    )

    @model_validator(mode="after")
    def reason_goes_with_rejection(self) -> "ReviewRequest":
        """A rejection needs a reason (RM-MOD-03); a validation has none."""
        if self.decision == "rejected" and self.reason is None:
            raise ValueError("A rejection needs a reason.")
        if self.decision == "validated" and self.reason is not None:
            raise ValueError("A validation takes no reason.")
        return self


# --- annotations ---


class CreateAnnotationRequest(BaseModel):
    """Request to create a manual annotation on a passage of an ancient text.

    There is no `status`, no author and no name: the author is the logged-in account
    (RM-CTB-03) and a new annotation is always pending (RM-CTB-04). Such a field sent by a
    client is ignored.
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


class AnnotationUpdate(BaseModel):
    """Edit of a pending annotation (RM-CTB-05): the concept and the justification only.

    The annotated passage is fixed: to change it, delete the annotation and create another.
    `concept_uri` and `concept_label` change together. `justification: null` clears it.
    """

    model_config = ConfigDict(extra="forbid")

    version: int = Field(..., ge=1, description="Version of the annotation that was edited")
    concept_uri: AnnotationConceptIri | None = None
    concept_label: Text200 | None = None
    concept_type: ConceptType | None = None
    justification: Text5000 | None = None

    @model_validator(mode="after")
    def fields_are_consistent(self) -> "AnnotationUpdate":
        """The concept moves as a whole, a sent field is not null, something changes."""
        sent = self.model_fields_set - {"version"}
        if not sent:
            raise ValueError("Nothing to update.")
        for name in sent - {"justification"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null.")
        if ("concept_uri" in sent) != ("concept_label" in sent):
            raise ValueError("concept_uri and concept_label change together.")
        return self


class AnnotationOut(BaseModel):
    """An annotation, with its author, its review and what the viewer may do with it."""

    id: int
    paragraph_uri: str
    target_text: str
    start_offset: int
    end_offset: int
    concept_uri: str
    concept_label: str
    concept_type: str
    category: Category
    collections: list[ConceptCollectionOut]
    justification: str | None
    scope_type: str
    end_paragraph_uri: str | None
    target_paragraphs: list[str]
    status: ContributionStatus
    author: PublicIdentity | None
    author_label: str | None
    reviewer: PublicIdentity | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime | None
    version: int
    allowed_actions: list[Action]


class AnnotationPage(BaseModel):
    """One page of annotations, newest first, and the total under the same filters."""

    items: list[AnnotationOut]
    total: int


def annotation_out(
    annotation: Annotation, viewer: Viewer | None, thesaurus: CollectionIndex
) -> AnnotationOut:
    """The response for `annotation`, as seen by `viewer` (None for an anonymous visitor).

    The category and the collections of the concept come from `thesaurus` (RM-CON-02), for
    every status, pending included.
    """
    category, collections = thesaurus.classify(annotation.concept_uri)
    return AnnotationOut(
        id=annotation.id,
        paragraph_uri=annotation.paragraph_uri,
        target_text=annotation.target_text,
        start_offset=annotation.start_offset,
        end_offset=annotation.end_offset,
        concept_uri=annotation.concept_uri,
        concept_label=annotation.concept_label,
        concept_type=annotation.concept_type,
        category=category,
        collections=collections,
        justification=annotation.justification,
        scope_type=annotation.scope_type,
        end_paragraph_uri=annotation.end_paragraph_uri,
        target_paragraphs=json.loads(annotation.target_paragraphs),
        status=annotation.status,
        author=identity_of(annotation.author),
        author_label=annotation.author_label,
        reviewer=identity_of(annotation.reviewer),
        reviewed_at=annotation.reviewed_at,
        rejection_reason=annotation.rejection_reason,
        created_at=annotation.created_at,
        updated_at=annotation.updated_at,
        version=annotation.version,
        allowed_actions=allowed_actions(annotation, viewer),
    )


# --- term proposals ---


class CreateProposalRequest(BaseModel):
    """Request to propose a new term for the TheZoo thesaurus (th310).

    The author is the logged-in account and a new proposal is always pending (RM-CTB-03,
    RM-CTB-04): a name or a `status` sent by a client is ignored.
    """

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


class ProposalUpdate(BaseModel):
    """Edit of a pending proposal (RM-CTB-05): every field. A field that is not sent is kept."""

    model_config = ConfigDict(extra="forbid")

    version: int = Field(..., ge=1, description="Version of the proposal that was edited")
    pref_label: Text200 | None = Field(default=None, min_length=2)
    language: LanguageCode | None = None
    alt_labels: list[Text200] | None = Field(default=None, max_length=MAX_ALT_LABELS)
    broader_concept_uri: TheZooConceptIri | None = None
    broader_concept_label: Text200 | None = None
    definition: Text5000 | None = None

    @model_validator(mode="after")
    def fields_are_consistent(self) -> "ProposalUpdate":
        """Something changes, and a required field is not set to null."""
        sent = self.model_fields_set - {"version"}
        if not sent:
            raise ValueError("Nothing to update.")
        for name in sent & {"pref_label", "language", "alt_labels"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null.")
        return self


class ProposalOut(BaseModel):
    """A term proposal, with its author, its review and what the viewer may do with it."""

    id: int
    pref_label: str
    language: str
    alt_labels: list[str]
    broader_concept_uri: str | None
    broader_concept_label: str | None
    definition: str | None
    status: ContributionStatus
    author: PublicIdentity | None
    author_label: str | None
    reviewer: PublicIdentity | None
    reviewed_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime | None
    version: int
    allowed_actions: list[Action]


class ProposalPage(BaseModel):
    """One page of term proposals, newest first, and the total under the same filters."""

    items: list[ProposalOut]
    total: int


def proposal_out(proposal: TermProposal, viewer: Viewer | None) -> ProposalOut:
    """The response for `proposal`, as seen by `viewer` (None for an anonymous visitor)."""
    return ProposalOut(
        id=proposal.id,
        pref_label=proposal.pref_label,
        language=proposal.language,
        alt_labels=json.loads(proposal.alt_labels),
        broader_concept_uri=proposal.broader_concept_uri,
        broader_concept_label=proposal.broader_concept_label,
        definition=proposal.definition,
        status=proposal.status,
        author=identity_of(proposal.author),
        author_label=proposal.author_label,
        reviewer=identity_of(proposal.reviewer),
        reviewed_at=proposal.reviewed_at,
        rejection_reason=proposal.rejection_reason,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
        version=proposal.version,
        allowed_actions=allowed_actions(proposal, viewer),
    )
