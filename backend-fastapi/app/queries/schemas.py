"""Pydantic request and response models of the saved queries.

The request models validate their input (RM-ACC-02): maximum lengths come from
`app.shared.validation` and `app.shared.sparql_guard`, so that the rules exist once. They
have no author: the author is the logged-in account (RM-QC-06), and a name sent by a client
is ignored. The response models do not validate: they must return rows stored before these
rules existed.

A query's author is public, as the display name and the affiliation of the account
(RM-CPT-05); the email is never in a response.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.accounts.schemas import PublicIdentity, identity_of
from app.accounts.viewer import Viewer
from app.queries.models import DEFAULT_CATEGORY, SavedQuery
from app.queries.policy import Action, allowed_actions
from app.shared.sparql_guard import MAX_QUERY_LENGTH
from app.shared.validation import Text100, Text200, Text2000

DEFAULT_PAGE_SIZE = 200
MAX_PAGE_SIZE = 500
MAX_PAGE_OFFSET = 100_000


class CreateSavedQueryRequest(BaseModel):
    """Request to save a SPARQL query (RM-QC-06): authored by the logged-in account."""

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
    category: Text100 | None = Field(default=DEFAULT_CATEGORY, description="Theme")


class UpdateSavedQueryRequest(BaseModel):
    """Request to update a saved SPARQL query: a field that is not sent is kept."""

    title: Text200 | None = Field(None, min_length=3)
    description: Text2000 | None = None
    query_text: str | None = Field(None, min_length=10, max_length=MAX_QUERY_LENGTH)
    query_spo_text: str | None = Field(None, max_length=MAX_QUERY_LENGTH)
    category: Text100 | None = None


class SavedQueryOut(BaseModel):
    """A saved SPARQL query, with its author and what the viewer may do with it."""

    id: int
    title: str
    description: str | None
    query_text: str
    query_spo_text: str | None
    category: str
    author: PublicIdentity | None
    author_label: str | None
    is_builtin: bool
    created_at: datetime
    updated_at: datetime
    allowed_actions: list[Action]


class SavedQueryPage(BaseModel):
    """One page of saved queries (native questions first) and the total under the filters."""

    items: list[SavedQueryOut]
    total: int


def saved_query_out(query: SavedQuery, viewer: Viewer | None) -> SavedQueryOut:
    """The response for `query`, as seen by `viewer` (None for an anonymous visitor)."""
    return SavedQueryOut(
        id=query.id,
        title=query.title,
        description=query.description,
        query_text=query.query_text,
        query_spo_text=query.query_spo_text,
        category=query.category,
        author=identity_of(query.author),
        author_label=query.author_label,
        is_builtin=query.is_builtin,
        created_at=query.created_at,
        updated_at=query.updated_at,
        allowed_actions=allowed_actions(query, viewer),
    )
