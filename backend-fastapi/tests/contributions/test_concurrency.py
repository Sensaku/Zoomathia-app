"""Two requests that race for one contribution: exactly one wins (RM-MOD-02, RM-MOD-06).

Two kinds of test, which prove different things:

- The HTTP tests (`..._over_http_...`, `an_edit_racing_a_review...`, `a_review_and_a_delete...`)
  check the outcome that a client sees when two requests are sent together. They do not prove
  the SQL guards: the requests may run one after the other, and then the permission policy
  refuses the second one before any guarded statement runs.
- The repository tests (`read_then_review`, `read_then_edit`) do prove the guards. Both
  sessions read the pending contribution, wait, then write: both pass the policy, so only the
  guarded statement can decide, and exactly one of them touches a row.

The last test shows that the same race goes wrong with an unguarded read-modify-write: it is
what the guards prevent.
"""

import asyncio
from collections.abc import Awaitable, Callable

import httpx
from sqlalchemy import select, update

from app.accounts.models import Role
from app.accounts.viewer import Viewer
from app.contributions.models import Annotation, ContributionStatus
from app.contributions.repository import AnnotationRepository
from app.core.database import Database
from tests.contributions.conftest import create_annotation, review_body
from tests.support.accounts import FakeClock, Member

READ_TO_WRITE_DELAY = 0.05


async def read_then_review(
    database: Database,
    annotation_id: int,
    viewer: Viewer,
    decision: ContributionStatus,
    reason: str | None,
) -> bool:
    """Read the annotation, wait for the other reviewer to read it too, then try to review."""
    async with database.session_maker() as session:
        repository = AnnotationRepository(session)
        seen = await repository.get(annotation_id)
        assert seen is not None and seen.status is ContributionStatus.PENDING
        await asyncio.sleep(READ_TO_WRITE_DELAY)
        done = await repository.review(annotation_id, 1, viewer, FakeClock()(), decision, reason)
        await repository.commit()
        return done


async def read_then_edit(
    database: Database, annotation_id: int, viewer: Viewer, justification: str
) -> bool:
    """Read the annotation, wait for the reviewer to read it too, then try to edit it."""
    async with database.session_maker() as session:
        repository = AnnotationRepository(session)
        seen = await repository.get(annotation_id)
        assert seen is not None and seen.status is ContributionStatus.PENDING
        await asyncio.sleep(READ_TO_WRITE_DELAY)
        done = await repository.edit(
            annotation_id, 1, viewer, FakeClock()(), justification=justification
        )
        await repository.commit()
        return done


async def test_two_reviewers_of_the_same_annotation_over_http_give_one_200_and_one_409(
    contributor: Member, second_contributor: Member, admin: Member
) -> None:
    """The outcome a client sees; the SQL guard itself is proved by the repository test below."""
    created = await create_annotation(contributor)

    first, second = await asyncio.gather(
        second_contributor.post(f"/annotations/{created['id']}/review", json=review_body(1)),
        admin.post(
            f"/annotations/{created['id']}/review", json=review_body(1, "rejected", "Too vague.")
        ),
    )

    assert sorted([first.status_code, second.status_code]) == [200, 409]
    final = (await contributor.get(f"/annotations/{created['id']}")).json()
    winner = first if first.status_code == 200 else second
    assert final["status"] == winner.json()["status"]
    assert final["version"] == 2


async def test_two_reviewers_that_both_read_a_pending_annotation_cannot_both_review_it(
    database: Database, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    created = await create_annotation(contributor)
    peer = Viewer(id=second_contributor.user.id, role=Role.CONTRIBUTOR)
    boss = Viewer(id=admin.user.id, role=Role.ADMIN)

    outcomes = await asyncio.gather(
        read_then_review(database, created["id"], peer, ContributionStatus.VALIDATED, None),
        read_then_review(database, created["id"], boss, ContributionStatus.REJECTED, "No."),
    )

    assert sorted(outcomes) == [False, True]


async def test_an_edit_that_read_a_pending_annotation_cannot_win_against_a_review_that_did(
    database: Database, contributor: Member, second_contributor: Member
) -> None:
    """Both pass the policy (pending, right version): only the guarded statement decides."""
    created = await create_annotation(contributor)
    author = Viewer(id=contributor.user.id, role=Role.CONTRIBUTOR)
    peer = Viewer(id=second_contributor.user.id, role=Role.CONTRIBUTOR)

    edited, reviewed = await asyncio.gather(
        read_then_edit(database, created["id"], author, "changed"),
        read_then_review(database, created["id"], peer, ContributionStatus.VALIDATED, None),
    )

    assert sorted([edited, reviewed]) == [False, True]
    async with database.session_maker() as session:
        final = await AnnotationRepository(session).get(created["id"])
    assert final is not None and final.version == 2
    if edited:  # the author won: the review never validated the old content
        assert (final.status, final.justification) == (ContributionStatus.PENDING, "changed")
    else:  # the reviewer won: the edit never reaches the validated content
        assert (final.status, final.justification) == (ContributionStatus.VALIDATED, None)


async def test_an_edit_racing_a_review_over_http_has_one_winner_and_a_409_for_the_other(
    contributor: Member, second_contributor: Member
) -> None:
    """The outcome a client sees; the SQL guard itself is proved by the repository test above."""
    created = await create_annotation(contributor)

    edit, review = await asyncio.gather(
        contributor.patch(
            f"/annotations/{created['id']}", json={"version": 1, "justification": "changed"}
        ),
        second_contributor.post(f"/annotations/{created['id']}/review", json=review_body(1)),
    )

    assert sorted([edit.status_code, review.status_code]) == [200, 409]
    final = (await contributor.get(f"/annotations/{created['id']}")).json()
    assert final["version"] == 2
    if edit.status_code == 200:  # the author won: the reviewer validated nothing
        assert (final["status"], final["justification"]) == ("pending", "changed")
    else:  # the reviewer won: the edit never reaches the validated content
        assert (final["status"], final["justification"]) == ("validated", None)


async def test_a_review_and_a_delete_racing_over_http_have_one_winner(
    client: httpx.AsyncClient, contributor: Member, second_contributor: Member
) -> None:
    """The outcome a client sees; a delete has no repository-level race test of its own."""
    created = await create_annotation(contributor)

    delete, review = await asyncio.gather(
        contributor.delete(f"/annotations/{created['id']}"),
        second_contributor.post(f"/annotations/{created['id']}/review", json=review_body(1)),
    )

    assert sorted([delete.status_code, review.status_code]) in ([204, 404], [200, 409])
    still_there = (await client.get(f"/annotations/{created['id']}")).status_code == 200
    assert still_there == (review.status_code == 200)


async def test_without_the_guards_the_same_race_lets_both_reviews_through(
    database: Database, contributor: Member, second_contributor: Member, admin: Member
) -> None:
    """A read-modify-write that only checks what it read: the lost update the guards prevent."""
    created = await create_annotation(contributor)
    now = FakeClock()()

    def unguarded_review(reviewer_id: int) -> Callable[[], Awaitable[bool]]:
        async def run() -> bool:
            async with database.session_maker() as session:
                query = select(Annotation).where(Annotation.id == created["id"])
                seen = (await session.execute(query)).scalar_one()
                believes_it_is_first = seen.status is ContributionStatus.PENDING
                await asyncio.sleep(READ_TO_WRITE_DELAY)
                if believes_it_is_first:
                    await session.execute(
                        update(Annotation)
                        .where(Annotation.id == created["id"])
                        .values(
                            status=ContributionStatus.VALIDATED,
                            reviewer_id=reviewer_id,
                            reviewed_at=now,
                        )
                    )
                await session.commit()
                return believes_it_is_first

        return run

    outcomes = await asyncio.gather(
        unguarded_review(second_contributor.user.id)(), unguarded_review(admin.user.id)()
    )

    assert list(outcomes) == [
        True,
        True,
    ]  # both believed they were first; the guarded route says 409
