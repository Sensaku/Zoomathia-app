"""The `create-admin` server command (decision D2, RM-CPT-01, RM-CPT-02).

These tests are synchronous: the command runs its own event loop, like a real invocation.
"""

import sqlite3
from collections.abc import Callable
from pathlib import Path

import pytest

from app.accounts.cli import main
from app.core.config import settings
from tests.accounts.conftest import PASSWORD

ARGV = [
    "create-admin",
    "--email",
    "Root@Example.org",
    "--name",
    "Root Admin",
    "--affiliation",
    "I3S",
]


def prompt_with(*answers: str) -> Callable[[str], str]:
    """A password prompt that answers from a script, instead of reading the terminal."""
    remaining = iter(answers)
    return lambda _label: next(remaining)


def accounts(fresh_database: None) -> list[tuple[str, str, str, str]]:
    with sqlite3.connect(Path(settings.STAGING_DB_PATH)) as connection:
        rows = connection.execute("SELECT email, role, status, password_hash FROM users")
        return [(row[0], row[1], row[2], row[3]) for row in rows]


def test_the_command_creates_an_active_admin_and_prints_no_secret(
    fresh_database: None, capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = main(ARGV, prompt=prompt_with(PASSWORD, PASSWORD))

    output = capsys.readouterr()
    ((email, role, status, password_hash),) = accounts(fresh_database)
    assert exit_code == 0
    assert (email, role, status) == ("root@example.org", "admin", "active")
    assert password_hash.startswith("$argon2id$")
    assert PASSWORD not in output.out + output.err
    assert password_hash not in output.out + output.err


def test_the_command_refuses_an_email_that_already_exists(
    fresh_database: None, capsys: pytest.CaptureFixture[str]
) -> None:
    main(ARGV, prompt=prompt_with(PASSWORD, PASSWORD))

    exit_code = main(ARGV, prompt=prompt_with("another long passphrase", "another long passphrase"))

    assert exit_code == 1
    assert "already" in capsys.readouterr().err
    assert len(accounts(fresh_database)) == 1


def test_the_command_refuses_two_different_passwords(
    fresh_database: None, capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = main(ARGV, prompt=prompt_with(PASSWORD, "something else entirely"))

    assert exit_code == 1
    assert "differ" in capsys.readouterr().err
    assert accounts(fresh_database) == []


def test_the_command_applies_the_password_policy(
    fresh_database: None, capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = main(ARGV, prompt=prompt_with("short", "short"))

    assert exit_code == 1
    assert "12 to 128" in capsys.readouterr().err
    assert accounts(fresh_database) == []


def test_the_command_refuses_a_database_that_is_not_migrated(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(settings, "STAGING_DB_PATH", str(tmp_path / "empty.db"))

    exit_code = main(ARGV, prompt=prompt_with(PASSWORD, PASSWORD))

    assert exit_code == 1
    assert "alembic upgrade head" in capsys.readouterr().err


def test_the_command_refuses_an_invalid_email(
    fresh_database: None, capsys: pytest.CaptureFixture[str]
) -> None:
    exit_code = main(["create-admin", "--email", "nobody", "--name", "N", "--affiliation", "A"])

    assert exit_code == 1
    assert "email" in capsys.readouterr().err
