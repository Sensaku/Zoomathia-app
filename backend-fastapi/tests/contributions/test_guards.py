"""The guarded SQL statements and the permission policy state the same rules.

The service refuses with the policy and the repository refuses inside the statement (so that
racing requests cannot both win). Here every combination of viewer, authorship and status is
run through both, and they must agree: a rule changed in one place only fails this test.
"""

from collections.abc import Awaitable, Callable
from itertools import product

import pytest

from app.accounts.models import Role
from app.accounts.viewer import Viewer
from app.contributions.models import ContributionStatus
from app.contributions.policy import delete_denial, edit_denial, review_denial
from app.contributions.repository import AnnotationRepository
from app.core.database import Database
from tests.support.accounts import FakeClock, MakeAccount
from tests.support.plant import plant_annotation

STATUSES = list(ContributionStatus)
VIEWERS = ["author", "peer", "admin", "admin_author"]
AUTHORS = ["author", "admin_author", "historical"]


@pytest.fixture
async def people(make_account: MakeAccount) -> dict[str, Viewer]:
    author = await make_account(email="a@example.org")
    peer = await make_account(email="p@example.org")
    admin = await make_account(email="m@example.org", role=Role.ADMIN)
    admin_author = await make_account(email="n@example.org", role=Role.ADMIN)
    return {
        "author": Viewer(author.id, author.role),
        "peer": Viewer(peer.id, peer.role),
        "admin": Viewer(admin.id, admin.role),
        "admin_author": Viewer(admin_author.id, admin_author.role),
    }


def plant_for(author: str, status: ContributionStatus, people: dict[str, Viewer]) -> int:
    """A row by `author` (or a historical one) in `status`, reviewed by the peer if it is."""
    fields: dict[str, object] = {"status": status.value}
    if author == "historical":
        fields.update(author_id=None, author_label="Chercheuse")
    else:
        fields.update(author_id=people[author].id, author_label=None)
    if status is not ContributionStatus.PENDING:
        fields.update(
            reviewer_id=people["peer"].id,
            reviewed_at="2026-01-01 12:00:00.000000",
            rejection_reason="No." if status is ContributionStatus.REJECTED else None,
        )
    return plant_annotation(**fields)


Operation = Callable[[AnnotationRepository, int, Viewer], Awaitable[bool]]


async def try_edit(repository: AnnotationRepository, annotation_id: int, viewer: Viewer) -> bool:
    return await repository.edit(annotation_id, 1, viewer, FakeClock()(), justification="x")


async def try_review(repository: AnnotationRepository, annotation_id: int, viewer: Viewer) -> bool:
    return await repository.review(
        annotation_id, 1, viewer, FakeClock()(), ContributionStatus.VALIDATED, None
    )


async def try_delete(repository: AnnotationRepository, annotation_id: int, viewer: Viewer) -> bool:
    return await repository.delete(annotation_id, viewer)


@pytest.mark.parametrize(
    ("operation", "denial_of"),
    [(try_edit, edit_denial), (try_review, review_denial), (try_delete, delete_denial)],
    ids=["edit", "review", "delete"],
)
async def test_the_sql_guards_agree_with_the_policy(
    database: Database,
    people: dict[str, Viewer],
    operation: Operation,
    denial_of: Callable[..., object],
) -> None:
    for author, status, viewer_name in product(AUTHORS, STATUSES, VIEWERS):
        annotation_id = plant_for(author, status, people)
        viewer = people[viewer_name]
        async with database.session_maker() as session:
            repository = AnnotationRepository(session)
            row = await repository.get(annotation_id)
            assert row is not None
            expected = denial_of(row, viewer) is None
            done = await operation(repository, annotation_id, viewer)
            await repository.commit()
        assert done is expected, (author, status.value, viewer_name)
