"""Response models of the thesaurus domain (RM-CON-02)."""

from pydantic import BaseModel, Field

from app.thesaurus.categories import Category


class ConceptCollectionOut(BaseModel):
    """A TheZoo collection, with its SKOS labels by language (`fr` and `en`, when they exist)."""

    iri: str
    labels: dict[str, str] = Field(
        default_factory=dict, description="Preferred labels by language code, e.g. fr and en."
    )


class CategoryOut(BaseModel):
    """A concept category and the collections of TheZoo that give it (RM-CON-01)."""

    category: Category
    collections: list[ConceptCollectionOut]
