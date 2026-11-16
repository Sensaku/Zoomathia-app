"""Request models of the corpus domain."""

from typing import Any

from pydantic import BaseModel


class ConceptCriterion(BaseModel):
    uri: str
    label: str | None = None
    type: str | None = None
    include_subconcepts: bool = False  # skos:broader+ (taxonomie / sous-concepts)
    polarity: str = "include"  # "include" | "exclude"


class CollectionCriterion(BaseModel):
    uri: str
    label: str | None = None
    polarity: str = "include"  # "include" | "exclude"


class ConceptFilter(BaseModel):
    uri: str
    type: str | None = None


class CustomSearchPayload(BaseModel):
    """Criteria of a custom search; also the body of its CSV and JSON exports (RM-EXP-01)."""

    author: list[str] = []
    work: list[str] = []
    concepts: list[Any] = []
    checked: bool = False
    collectionMembers: bool = False  # noqa: N815 - public API field name
    subConcepts: bool = False  # noqa: N815 - public API field name

    # Fields of the advanced corpus builder
    excluded_works: list[str] = []
    concept_criteria: list[ConceptCriterion] | None = None
    collection_criteria: list[CollectionCriterion] | None = None
    match_mode: str | None = None  # "AND" | "OR"
