"""SQLAlchemy models of the contributions domain (revision `0003_contributions`).

Annotations and term proposals share one life cycle (RM-CTB-04, RM-MOD-01 to RM-MOD-03), so
they share the author and review columns and their integrity constraints. Statuses are codes
in the database (decided 2026-11-16); the screens translate them.

Dates are timezone-aware UTC (`app.core.database.UtcDateTime`). The JSON columns hold text
written with `ensure_ascii=False`, so that the proposal search can match accented labels.
"""

import unicodedata
from datetime import datetime
from enum import Enum

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Text, text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.accounts.models import User
from app.core.database import Base, UtcDateTime


class ContributionStatus(str, Enum):  # noqa: UP042 - Ruff still targets py310
    """Life cycle of a contribution. `suggested` and `retracted` arrive with their features."""

    PENDING = "pending"
    VALIDATED = "validated"
    REJECTED = "rejected"


def _codes(enumeration: type[Enum]) -> list[str]:
    """Store the enumeration values (`pending`), not the member names (`PENDING`)."""
    return [member.value for member in enumeration]


def label_key(label: str) -> str:
    """The key that makes two spellings of a label the same term (RM-THE-04).

    Unicode NFKC normalization, trimmed, inner whitespace collapsed, then case-folded: `Aigle
    Royal`, ` aigle  royal ` and `AIGLE ROYAL` share a key, and so do accented and Greek
    capitals and their lowercase forms. Revision 0003 computes the same key for stored rows.

    Example:
        >>> label_key("  Cerf   Élaphe ")
        'cerf élaphe'
    """
    return " ".join(unicodedata.normalize("NFKC", label).split()).casefold()


def _review_constraints() -> tuple[CheckConstraint, ...]:
    """The integrity rules of the author and review columns, named after the naming convention.

    A historical row (RM-CTB-06) has a free-text `author_label` and no account; any other row
    has an account and no label. Only a review sets the reviewer and the review date together,
    a pending row has no reviewer, and an account that rejects gives a reason (RM-MOD-03).
    """
    return (
        CheckConstraint("(author_id IS NULL) <> (author_label IS NULL)", name="author_xor_label"),
        CheckConstraint("status IN ('pending', 'validated', 'rejected')", name="status"),
        CheckConstraint("(reviewer_id IS NULL) = (reviewed_at IS NULL)", name="reviewer_and_date"),
        CheckConstraint("status <> 'pending' OR reviewer_id IS NULL", name="pending_not_reviewed"),
        CheckConstraint(
            "status <> 'rejected' OR reviewer_id IS NULL OR rejection_reason IS NOT NULL",
            name="rejection_reason",
        ),
    )


class ReviewableMixin:
    """Columns that annotations and term proposals share: author, status, review, version."""

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # NULL only for a historical contribution (RM-CTB-06). No `ON DELETE` action: an account
    # that has contributed is never deleted, and an attempt must fail loudly.
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, default=None)
    author_label: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[ContributionStatus] = mapped_column(
        SqlEnum(ContributionStatus, native_enum=False, length=20, values_callable=_codes),
        index=True,
    )
    reviewer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    rejection_reason: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime)
    updated_at: Mapped[datetime | None] = mapped_column(UtcDateTime, default=None)
    # Optimistic concurrency (T2): +1 on every edit and review.
    version: Mapped[int] = mapped_column(Integer, default=1, server_default=text("1"))


class Annotation(ReviewableMixin, Base):
    """A manual annotation of a passage (RM-ANN-01 to RM-ANN-04), table `staged_annotations`.

    The annotated passage (paragraph, text, offsets, scope) is fixed once created; only the
    concept and the justification can be edited while the annotation is pending (RM-CTB-05).
    """

    __tablename__ = "staged_annotations"
    __table_args__ = (
        *_review_constraints(),
        CheckConstraint(
            "json_valid(target_paragraphs) AND json_type(target_paragraphs) = 'array'",
            name="target_paragraphs_json",
        ),
        Index("ix_staged_annotations_paragraph_uri", "paragraph_uri"),
        {"sqlite_autoincrement": True},  # ids are never reused: they build the stable URIs
    )

    paragraph_uri: Mapped[str] = mapped_column(Text)
    target_text: Mapped[str] = mapped_column(Text)
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    concept_uri: Mapped[str] = mapped_column(Text)
    concept_label: Mapped[str] = mapped_column(Text)
    concept_type: Mapped[str] = mapped_column(Text)
    justification: Mapped[str | None] = mapped_column(Text, default=None)
    scope_type: Mapped[str] = mapped_column(Text)
    end_paragraph_uri: Mapped[str | None] = mapped_column(Text, default=None)
    # JSON array of the paragraph IRIs that the annotation covers (always a valid array).
    target_paragraphs: Mapped[str] = mapped_column(Text)

    author: Mapped[User | None] = relationship(
        foreign_keys="Annotation.author_id", lazy="joined", viewonly=True
    )
    reviewer: Mapped[User | None] = relationship(
        foreign_keys="Annotation.reviewer_id", lazy="joined", viewonly=True
    )


class TermProposal(ReviewableMixin, Base):
    """A proposed term for the TheZoo thesaurus (RM-THE-01 to RM-THE-05), table `thesaurus_proposals`.

    RM-THE-04: at most one pending proposal per normalized label and language, enforced by a
    partial unique index on `pref_label_key` (set by the service, see `label_key`).
    """

    __tablename__ = "thesaurus_proposals"
    __table_args__ = (
        *_review_constraints(),
        CheckConstraint(
            "json_valid(alt_labels) AND json_type(alt_labels) = 'array'", name="alt_labels_json"
        ),
        Index(
            "uq_thesaurus_proposals_pending_label",
            "pref_label_key",
            "language",
            unique=True,
            sqlite_where=text("status = 'pending'"),
        ),
        {"sqlite_autoincrement": True},
    )

    pref_label: Mapped[str] = mapped_column(Text)
    pref_label_key: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(Text)
    # JSON array of strings (always a valid array).
    alt_labels: Mapped[str] = mapped_column(Text)
    broader_concept_uri: Mapped[str | None] = mapped_column(Text, default=None)
    broader_concept_label: Mapped[str | None] = mapped_column(Text, default=None)
    definition: Mapped[str | None] = mapped_column(Text, default=None)

    author: Mapped[User | None] = relationship(
        foreign_keys="TermProposal.author_id", lazy="joined", viewonly=True
    )
    reviewer: Mapped[User | None] = relationship(
        foreign_keys="TermProposal.reviewer_id", lazy="joined", viewonly=True
    )
