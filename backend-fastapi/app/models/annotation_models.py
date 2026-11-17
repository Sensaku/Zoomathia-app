"""Pydantic model of the interactive SPARQL playground.

The annotation and term proposal models moved to `app.contributions.schemas`, and the saved
query models to `app.queries.schemas`.
"""

from pydantic import BaseModel, Field


class SparqlQueryRequest(BaseModel):
    """Payload of the SPARQL playground."""

    query: str = Field(..., min_length=10, description="SPARQL SELECT or CONSTRUCT query")
