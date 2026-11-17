"""Helpers for SQL built from user text.

User text only ever reaches SQL as a bound parameter. A `LIKE` pattern needs one more step:
its own wildcards must lose their meaning (RM-ACC-02: a user value never changes the shape
of a query).
"""

# Escape character of the `LIKE` patterns built from user text (a backslash).
LIKE_ESCAPE = chr(92)
LIKE_ESCAPE_CLAUSE = f" ESCAPE '{LIKE_ESCAPE}'"


def escape_like(text: str) -> str:
    """Escape `%`, `_` and the escape character, so that `text` is matched literally by `LIKE`.

    The pattern must be used with `LIKE_ESCAPE_CLAUSE` (or `escape=LIKE_ESCAPE` in SQLAlchemy).
    Without it, a search for `50%` or `a_b` would match anything.

    Args:
        text: The text typed by a user.

    Returns:
        The text with each wildcard and each escape character preceded by the escape character.

    Example:
        >>> escape_like("50%")
        '50\\%'
    """
    return (
        text.replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", LIKE_ESCAPE + "%")
        .replace("_", LIKE_ESCAPE + "_")
    )
