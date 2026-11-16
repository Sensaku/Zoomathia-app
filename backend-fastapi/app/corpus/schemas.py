"""Request models of the corpus domain."""

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, StringConstraints

from app.shared.sparql import MAX_IRI_LENGTH
from app.shared.validation import validate_iri

# RM-ACC-02: bounded values. `LongIri` only bounds the length: `sparql_iri` checks the IRI
# more closely when the query is built. The IRIs of the criteria go through the generic IRI
# validator instead (not the TheZoo rule: collections use other OpenTheso forms).
# The builder strips the IRIs of the criteria, so the model does too before it checks them.
CriterionIri = Annotated[
    str, StringConstraints(strip_whitespace=True), AfterValidator(validate_iri)
]
AuthorName = Annotated[str, StringConstraints(max_length=200)]
LongIri = Annotated[str, StringConstraints(max_length=MAX_IRI_LENGTH)]
Label = Annotated[str, StringConstraints(max_length=200)]
Polarity = Literal["include", "exclude"]
MatchMode = Literal["AND", "OR"]


class ConceptCriterion(BaseModel):
    uri: CriterionIri
    label: Label | None = None
    type: LongIri | None = None
    include_subconcepts: bool = False  # skos:broader+ (taxonomie / sous-concepts)
    polarity: Polarity = "include"


class CollectionCriterion(BaseModel):
    uri: CriterionIri
    label: Label | None = None
    polarity: Polarity = "include"


class ConceptFilter(BaseModel):
    uri: str
    type: str | None = None


class LegacyConcept(BaseModel):
    """An object of the legacy `concepts` list: the IRI is in `uri` or, failing that, `value`."""

    uri: LongIri | None = None
    value: LongIri | None = None
    type: LongIri | None = None
    label: Label | None = None


class CustomSearchPayload(BaseModel):
    """Criteria of a custom search; also the body of its CSV and JSON exports (RM-EXP-01).

    `concepts` is the legacy form: each item is an IRI or a `LegacyConcept`; any other item
    gives a 422 (RM-ACC-02).
    """

    author: list[AuthorName] = []
    work: list[LongIri] = []
    concepts: list[LongIri | LegacyConcept] = []
    checked: bool = False
    collectionMembers: bool = False  # noqa: N815 - public API field name
    subConcepts: bool = False  # noqa: N815 - public API field name

    # Fields of the advanced corpus builder
    excluded_works: list[LongIri] = []
    concept_criteria: list[ConceptCriterion] | None = None
    collection_criteria: list[CollectionCriterion] | None = None
    match_mode: MatchMode | None = None
