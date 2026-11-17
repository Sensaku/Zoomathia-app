"""Use cases of the contributions domain: create, edit, review and delete (RM-CTB, RM-MOD).

No FastAPI import here: the service raises domain errors (`app/shared/domain_errors.py`), and
each public operation commits its own short transaction. The permission rules are those of
`app.contributions.policy`; the repository enforces them again, inside the SQL statement, so
that two racing requests cannot both win. Moderation deletions by an admin are logged with
ids only, never a name or an email.
"""

import json
import logging
from collections.abc import Callable
from typing import Any, Generic, NoReturn

from sqlalchemy.exc import IntegrityError

from app.accounts.viewer import Viewer
from app.contributions.models import Annotation, ContributionStatus, TermProposal, label_key
from app.contributions.policy import (
    Denial,
    Reviewable,
    delete_denial,
    edit_denial,
    review_denial,
)
from app.contributions.repository import (
    AnnotationRepository,
    Contribution,
    ProposalRepository,
    ReviewableRepository,
    covers_paragraphs,
    matches_text,
)
from app.contributions.schemas import (
    AnnotationUpdate,
    CreateAnnotationRequest,
    CreateProposalRequest,
    ProposalUpdate,
    ReviewRequest,
)
from app.core.clock import Clock
from app.shared.domain_errors import (
    BadRequest,
    Conflict,
    DomainError,
    Forbidden,
    NotFound,
    Unprocessable,
)
from app.shared.validation import SKOS_CONCEPT

logger = logging.getLogger(__name__)

# The reader shows at most this many staged annotations of a section (RM-ACC-03); beyond it
# the request fails, it never silently truncates (AGENTS.md, rule 9).
MAX_SECTION_ANNOTATIONS = 2_000
# A Turtle export holds at most this many rows; beyond it the request fails, it never silently
# truncates (AGENTS.md, rule 9), and the serialization stays bounded (rule 10).
MAX_EXPORTED_CONTRIBUTIONS = 10_000

_DENIALS: dict[Denial, DomainError] = {
    Denial.NOT_AUTHOR: Forbidden("not_author", "You are not allowed to do this."),
    Denial.OWN_CONTRIBUTION: Forbidden(
        "own_contribution", "A contribution is reviewed by another contributor."
    ),
    Denial.NOT_PENDING: Conflict("not_pending", "The contribution is not pending any more."),
    Denial.VALIDATED_CONTRIBUTION: Conflict(
        "validated_contribution", "A validated contribution cannot be deleted."
    ),
}


def _refuse(denial: Denial) -> NoReturn:
    template = _DENIALS[denial]
    raise type(template)(template.code, template.message)


async def _export_rows(repository: ReviewableRepository[Contribution]) -> list[Contribution]:
    """Every contribution of the repository for an RDF export, oldest first.

    Raises:
        Unprocessable: `too_many_results` beyond `MAX_EXPORTED_CONTRIBUTIONS`.
    """
    rows = await repository.first(MAX_EXPORTED_CONTRIBUTIONS + 1)
    if len(rows) > MAX_EXPORTED_CONTRIBUTIONS:
        raise Unprocessable("too_many_results", "There are too many rows to export at once.")
    return rows


class Workflow(Generic[Contribution]):
    """Edit, review and delete, which annotations and term proposals share (RM-MOD-01 to 03)."""

    def __init__(
        self,
        repository: ReviewableRepository[Contribution],
        clock: Clock,
        not_found: tuple[str, str],
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._not_found = not_found

    async def get(self, contribution_id: int) -> Contribution:
        """The contribution with this id, or 404."""
        found = await self._repository.get(contribution_id)
        if found is None:
            raise NotFound(*self._not_found)
        return found

    async def edit(
        self, viewer: Viewer, contribution_id: int, version: int, values: dict[str, Any]
    ) -> Contribution:
        """Apply `values` to a pending contribution (RM-CTB-05, RM-CTB-06).

        Raises:
            NotFound: No such contribution.
            Forbidden: `not_author`.
            Conflict: `not_pending`, `version_conflict` (it changed since the client read it),
                or what `translate_integrity_error` gives.
        """
        current = await self.get(contribution_id)
        if (denial := edit_denial(current, viewer)) is not None:
            _refuse(denial)
        try:
            done = await self._repository.edit(
                contribution_id, version, viewer, self._clock(), **values
            )
        except IntegrityError as error:
            await self._repository.rollback()
            raise self.translate_integrity_error(error) from error
        if not done:
            await self._explain_failure(contribution_id, viewer, edit_denial)
        await self._repository.commit()
        logger.info("contribution edited: id=%s by=%s", contribution_id, viewer.id)
        return await self.get(contribution_id)

    async def review(
        self, viewer: Viewer, contribution_id: int, request: ReviewRequest
    ) -> Contribution:
        """Validate or reject a pending contribution of someone else (RM-MOD-01 to RM-MOD-03).

        The review is final (RM-MOD-06): the contribution never leaves its new status.

        Raises:
            NotFound: No such contribution.
            Forbidden: `own_contribution`.
            Conflict: `not_pending`, or `version_conflict` if the author changed it after the
                reviewer loaded it.
        """
        current = await self.get(contribution_id)
        if (denial := review_denial(current, viewer)) is not None:
            _refuse(denial)
        done = await self._repository.review(
            contribution_id,
            request.version,
            viewer,
            self._clock(),
            ContributionStatus(request.decision),
            request.reason,
        )
        if not done:
            await self._explain_failure(contribution_id, viewer, review_denial)
        await self._repository.commit()
        logger.info(
            "contribution reviewed: id=%s by=%s decision=%s",
            contribution_id,
            viewer.id,
            request.decision,
        )
        return await self.get(contribution_id)

    async def delete(self, viewer: Viewer, contribution_id: int) -> None:
        """Delete a contribution: its author while it is pending, or an admin another
        person's pending or rejected one (RM-CTB-05, RM-MOD-05).

        Raises:
            NotFound: No such contribution.
            Forbidden: `not_author`.
            Conflict: `not_pending`, or `validated_contribution` for an admin.
        """
        current = await self.get(contribution_id)
        if (denial := delete_denial(current, viewer)) is not None:
            _refuse(denial)
        if not await self._repository.delete(contribution_id, viewer):
            await self._explain_failure(contribution_id, viewer, delete_denial)
        await self._repository.commit()
        if current.author_id != viewer.id:
            logger.info(
                "contribution moderated: admin=%s type=%s id=%s status=%s",
                viewer.id,
                type(current).__name__,
                contribution_id,
                current.status.value,
            )
        else:
            logger.info("contribution deleted: id=%s by=%s", contribution_id, viewer.id)

    async def _explain_failure(
        self,
        contribution_id: int,
        viewer: Viewer,
        rule: Callable[[Reviewable, Viewer], Denial | None],
    ) -> NoReturn:
        """Say why a guarded write touched no row: 404, 403, 409 `not_pending`, then the version."""
        await self._repository.rollback()
        fresh = await self.get(contribution_id)
        if (denial := rule(fresh, viewer)) is not None:
            _refuse(denial)
        raise Conflict("version_conflict", "The contribution changed since you loaded it.")

    def translate_integrity_error(self, error: IntegrityError) -> DomainError | IntegrityError:
        """The domain error for a constraint that an edit broke; unknown ones stay as they are."""
        return error


class AnnotationService:
    """Annotations (RM-ANN-01 to RM-ANN-04)."""

    def __init__(self, repository: AnnotationRepository, clock: Clock) -> None:
        self.repository = repository
        self._clock = clock
        self.workflow: Workflow[Annotation] = Workflow(
            repository, clock, ("annotation_not_found", "No such annotation.")
        )

    async def create(self, viewer: Viewer, request: CreateAnnotationRequest) -> Annotation:
        """Store a new annotation, authored by `viewer` and pending (RM-CTB-01, 03, 04).

        Raises:
            BadRequest: `invalid_offsets`, the end of a single-paragraph selection is not
                after its start (RM-ANN-01).
        """
        single_paragraph = (
            not request.end_paragraph_uri or request.end_paragraph_uri == request.paragraph_uri
        )
        if single_paragraph and request.end_offset <= request.start_offset:
            raise BadRequest(
                "invalid_offsets", "The end offset must be greater than the start offset."
            )
        paragraphs = list(request.target_paragraphs or [request.paragraph_uri])
        if request.end_paragraph_uri and request.end_paragraph_uri not in paragraphs:
            paragraphs.append(request.end_paragraph_uri)
        annotation = Annotation(
            paragraph_uri=request.paragraph_uri,
            target_text=request.target_text,
            start_offset=request.start_offset,
            end_offset=request.end_offset,
            concept_uri=request.concept_uri,
            concept_label=request.concept_label,
            concept_type=request.concept_type or SKOS_CONCEPT,
            justification=request.justification,
            scope_type=request.scope_type or "word_sequence",
            end_paragraph_uri=request.end_paragraph_uri,
            target_paragraphs=json.dumps(paragraphs, ensure_ascii=False),
            author_id=viewer.id,
            status=ContributionStatus.PENDING,
            created_at=self._clock(),
        )
        await self.repository.add(annotation)
        await self.repository.commit()
        logger.info("annotation created: id=%s by=%s", annotation.id, viewer.id)
        return await self.workflow.get(annotation.id)

    async def edit(
        self, viewer: Viewer, annotation_id: int, update: AnnotationUpdate
    ) -> Annotation:
        """Change the concept and the justification of a pending annotation (RM-CTB-05)."""
        sent = update.model_fields_set - {"version"}
        values = {name: getattr(update, name) for name in sent}
        return await self.workflow.edit(viewer, annotation_id, update.version, values)

    async def section(self, paragraphs: list[str], include_pending: bool) -> list[Annotation]:
        """The staged annotations that cover `paragraphs`, for the reader (RM-ACC-03).

        Validated ones, and pending ones when asked; a rejected one never appears. Newest
        first.

        Raises:
            Unprocessable: `too_many_results` beyond `MAX_SECTION_ANNOTATIONS`.
        """
        statuses = [ContributionStatus.VALIDATED]
        if include_pending:
            statuses.append(ContributionStatus.PENDING)
        rows = await self.repository.in_paragraphs(
            paragraphs, statuses, MAX_SECTION_ANNOTATIONS + 1
        )
        if len(rows) > MAX_SECTION_ANNOTATIONS:
            raise Unprocessable(
                "too_many_results", "This section has too many annotations to show at once."
            )
        return rows

    async def export(self) -> list[Annotation]:
        """Every annotation, whatever its status, for the Turtle download (RM-PUB-01).

        Raises:
            Unprocessable: `too_many_results` beyond `MAX_EXPORTED_CONTRIBUTIONS`.
        """
        return await _export_rows(self.repository)

    async def page(
        self,
        viewer: Viewer | None,
        paragraph_uri: str | None,
        status: ContributionStatus | None,
        mine: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Annotation], int]:
        """A page of annotations, newest first, with the total under the same filters."""
        conditions = []
        if paragraph_uri:
            conditions.append(covers_paragraphs([paragraph_uri]))
        if status is not None:
            conditions.append(Annotation.status == status)
        if mine and viewer is not None:
            conditions.append(Annotation.author_id == viewer.id)
        return await self.repository.page(conditions, limit, offset)


class ProposalService:
    """Term proposals for the TheZoo thesaurus (RM-THE-01 to RM-THE-05)."""

    def __init__(self, repository: ProposalRepository, clock: Clock) -> None:
        self.repository = repository
        self._clock = clock
        self.workflow = _ProposalWorkflow(
            repository, clock, ("proposal_not_found", "No such proposal.")
        )

    async def create(self, viewer: Viewer, request: CreateProposalRequest) -> TermProposal:
        """Store a new proposal, authored by `viewer` and pending (RM-CTB-01, 03, 04).

        Raises:
            Conflict: `duplicate_proposal`, the same term is already pending in this language
                (RM-THE-04), even when two requests arrive at the same moment.
        """
        label = request.pref_label.strip()
        proposal = TermProposal(
            pref_label=label,
            pref_label_key=label_key(label),
            language=request.language.strip().lower(),
            alt_labels=json.dumps(request.alt_labels or [], ensure_ascii=False),
            broader_concept_uri=request.broader_concept_uri,
            broader_concept_label=request.broader_concept_label,
            definition=request.definition,
            author_id=viewer.id,
            status=ContributionStatus.PENDING,
            created_at=self._clock(),
        )
        try:
            await self.repository.add(proposal)
        except IntegrityError as error:
            await self.repository.rollback()
            raise _duplicate_or(error) from error
        await self.repository.commit()
        logger.info("proposal created: id=%s by=%s", proposal.id, viewer.id)
        return await self.workflow.get(proposal.id)

    async def edit(self, viewer: Viewer, proposal_id: int, update: ProposalUpdate) -> TermProposal:
        """Change any field of a pending proposal (RM-CTB-05); a field not sent is kept."""
        sent = update.model_fields_set - {"version"}
        values: dict[str, Any] = {name: getattr(update, name) for name in sent}
        if "pref_label" in values:
            values["pref_label"] = values["pref_label"].strip()
            values["pref_label_key"] = label_key(values["pref_label"])
        if "alt_labels" in values:
            values["alt_labels"] = json.dumps(values["alt_labels"], ensure_ascii=False)
        if "language" in values:
            values["language"] = values["language"].strip().lower()
        return await self.workflow.edit(viewer, proposal_id, update.version, values)

    async def export(self) -> list[TermProposal]:
        """Every proposal, whatever its status, for the Turtle download (RM-PUB-01).

        Raises:
            Unprocessable: `too_many_results` beyond `MAX_EXPORTED_CONTRIBUTIONS`.
        """
        return await _export_rows(self.repository)

    async def page(
        self,
        viewer: Viewer | None,
        status: ContributionStatus | None,
        search: str | None,
        mine: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[TermProposal], int]:
        """A page of proposals, newest first, with the total under the same filters."""
        conditions = []
        if status is not None:
            conditions.append(TermProposal.status == status)
        if search:
            conditions.append(matches_text(search))
        if mine and viewer is not None:
            conditions.append(TermProposal.author_id == viewer.id)
        return await self.repository.page(conditions, limit, offset)


def _duplicate_or(error: IntegrityError) -> DomainError | IntegrityError:
    """`duplicate_proposal` when the partial unique index refused the row, else the error."""
    if "UNIQUE constraint failed" in str(error.orig):
        return Conflict(
            "duplicate_proposal", "The same term is already waiting for a review in this language."
        )
    return error


class _ProposalWorkflow(Workflow[TermProposal]):
    """The shared workflow, with the anti-duplicate rule of proposals (RM-THE-04)."""

    def translate_integrity_error(self, error: IntegrityError) -> DomainError | IntegrityError:
        return _duplicate_or(error)
