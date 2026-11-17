"""SQLAlchemy model of the saved SPARQL queries (revision `0004_saved_queries`).

A saved query is either a native competency question (`is_builtin`, no account, labelled
"Équipe scientifique Zoomathia") or the query of an account (RM-QC-06). A query saved before
accounts existed keeps its free-text author name (`author_label`, no account) and is handled
by administrators only, like the historical contributions (RM-CTB-06).

Dates are timezone-aware UTC (`app.core.database.UtcDateTime`).
"""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.accounts.models import User
from app.core.database import Base, UtcDateTime

BUILTIN_AUTHOR = "Équipe scientifique Zoomathia"
DEFAULT_CATEGORY = "Recherche personnalisée"


class SavedQuery(Base):
    """A saved SPARQL query (RM-QC-02, RM-QC-06), table `saved_queries`.

    Exactly one of `author_id` (an account) and `author_label` (a historical or native author)
    is set, and a native question never has an account.
    """

    __tablename__ = "saved_queries"
    __table_args__ = (
        CheckConstraint("(author_id IS NULL) <> (author_label IS NULL)", name="author_xor_label"),
        CheckConstraint("is_builtin = 0 OR author_id IS NULL", name="builtin_has_no_account"),
        Index("ix_saved_queries_author_id", "author_id"),
        {"sqlite_autoincrement": True},  # ids are never reused
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    query_text: Mapped[str] = mapped_column(Text)
    query_spo_text: Mapped[str | None] = mapped_column(Text, default=None)
    category: Mapped[str] = mapped_column(Text)
    # No `ON DELETE` action: an account that saved a query is never deleted (RM-CPT-04).
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    author_label: Mapped[str | None] = mapped_column(Text, default=None)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime)

    author: Mapped[User | None] = relationship(
        foreign_keys="SavedQuery.author_id", lazy="joined", viewonly=True
    )
