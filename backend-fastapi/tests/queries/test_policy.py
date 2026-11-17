"""The permission table of the saved queries (RM-QC-02, RM-QC-06).

Pure functions: no database, no HTTP. The same rules are tested again through the API and
the guarded SQL statements; `test_the_sql_guards_agree_with_the_policy` links the two.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from itertools import product

import pytest

from app.accounts.models import Role
from app.accounts.viewer import Viewer
from app.core.database import Database
from app.queries.policy import Denial, allowed_actions, modify_denial
from app.queries.repository import QueryRepository
from tests.support.accounts import FakeClock, MakeAccount
from tests.support.plant import plant_query

AUTHOR = Viewer(id=1, role=Role.CONTRIBUTOR)
PEER = Viewer(id=2, role=Role.CONTRIBUTOR)
ADMIN = Viewer(id=3, role=Role.ADMIN)
ADMIN_AUTHOR = Viewer(id=4, role=Role.ADMIN)


@dataclass(frozen=True)
class Item:
    author_id: int | None
    is_builtin: bool


PERSONAL = Item(AUTHOR.id, False)
HISTORICAL = Item(None, False)  # saved before accounts existed
NATIVE = Item(None, True)


@pytest.mark.parametrize(
    ("viewer", "query", "denial"),
    [
        (AUTHOR, PERSONAL, None),
        (PEER, PERSONAL, Denial.NOT_AUTHOR),
        (ADMIN, PERSONAL, None),
        (ADMIN_AUTHOR, Item(ADMIN_AUTHOR.id, False), None),
        # RM-QC-06: a historical personal query has no author account, so only an admin handles it.
        (PEER, HISTORICAL, Denial.NOT_AUTHOR),
        (AUTHOR, HISTORICAL, Denial.NOT_AUTHOR),
        (ADMIN, HISTORICAL, None),
        # RM-QC-02: a native question is read-only for everyone until RM-QC-01, admins included.
        (AUTHOR, NATIVE, Denial.BUILTIN_QUERY),
        (PEER, NATIVE, Denial.BUILTIN_QUERY),
        (ADMIN, NATIVE, Denial.BUILTIN_QUERY),
    ],
)
def test_rm_qc_06_who_edits_or_deletes(viewer: Viewer, query: Item, denial: Denial | None) -> None:
    assert modify_denial(query, viewer) is denial


def test_an_anonymous_visitor_may_do_nothing() -> None:
    assert allowed_actions(PERSONAL, None) == []


@pytest.mark.parametrize(
    ("viewer", "query", "actions"),
    [
        (AUTHOR, PERSONAL, ["edit", "delete"]),
        (PEER, PERSONAL, []),
        (ADMIN, PERSONAL, ["edit", "delete"]),
        (ADMIN, HISTORICAL, ["edit", "delete"]),
        (PEER, HISTORICAL, []),
        (ADMIN, NATIVE, []),
        (AUTHOR, NATIVE, []),
    ],
)
def test_allowed_actions_are_the_actions_the_policy_accepts(
    viewer: Viewer, query: Item, actions: list[str]
) -> None:
    assert allowed_actions(query, viewer) == actions


# --- the SQL statements state the same rules ---

VIEWERS = ["author", "peer", "admin", "admin_author"]
KINDS = ["author", "admin_author", "historical", "native"]


@pytest.fixture
async def people(make_account: MakeAccount) -> dict[str, Viewer]:
    accounts = {
        "author": await make_account(email="a@example.org"),
        "peer": await make_account(email="p@example.org"),
        "admin": await make_account(email="m@example.org", role=Role.ADMIN),
        "admin_author": await make_account(email="n@example.org", role=Role.ADMIN),
    }
    return {name: Viewer(user.id, user.role) for name, user in accounts.items()}


def plant_of(kind: str, people: dict[str, Viewer]) -> int:
    """A personal query by `kind` of author, a historical one, or a native question."""
    if kind == "native":
        return plant_query(author_label="Équipe scientifique Zoomathia", is_builtin=1)
    if kind == "historical":
        return plant_query()
    return plant_query(author_id=people[kind].id, author_label=None)


Operation = Callable[[QueryRepository, int, Viewer], Awaitable[bool]]


async def try_edit(repository: QueryRepository, query_id: int, viewer: Viewer) -> bool:
    return await repository.edit(query_id, viewer, FakeClock()(), title="Changed")


async def try_delete(repository: QueryRepository, query_id: int, viewer: Viewer) -> bool:
    return await repository.delete(query_id, viewer)


@pytest.mark.parametrize("operation", [try_edit, try_delete], ids=["edit", "delete"])
async def test_the_sql_guards_agree_with_the_policy(
    database: Database, people: dict[str, Viewer], operation: Operation
) -> None:
    """Every combination of viewer and query goes through the policy and the statement."""
    for kind, viewer_name in product(KINDS, VIEWERS):
        query_id = plant_of(kind, people)
        viewer = people[viewer_name]
        async with database.session_maker() as session:
            repository = QueryRepository(session)
            row = await repository.get(query_id)
            assert row is not None
            expected = modify_denial(row, viewer) is None
            done = await operation(repository, query_id, viewer)
            await repository.commit()
        assert done is expected, (kind, viewer_name)
