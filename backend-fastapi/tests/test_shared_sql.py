"""`escape_like` makes user text match literally in a `LIKE` pattern (RM-ACC-02)."""

import pytest

from app.shared.sql import escape_like


@pytest.mark.parametrize(
    ("text", "escaped"),
    [
        ("plain", "plain"),
        ("50%", "50" + chr(92) + "%"),
        ("a_b", "a" + chr(92) + "_b"),
        (chr(92), chr(92) * 2),
        ("%_" + chr(92), chr(92) + "%" + chr(92) + "_" + chr(92) * 2),
    ],
)
def test_escape_like_escapes_the_wildcards_and_the_escape_character(
    text: str, escaped: str
) -> None:
    assert escape_like(text) == escaped
