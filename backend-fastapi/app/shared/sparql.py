"""Escaping helpers for request data that ends up inside a SPARQL query.

Request data must never be interpolated into a query as is (AGENTS.md, rule 1).
These helpers either return a safe SPARQL term or raise `InvalidSparqlValue`:
they never repair a value silently, so an attack attempt is refused instead of
being altered into something that might still do harm.

Example:
    >>> sparql_iri("http://ns.inria.fr/zoomathia/zoo#Oeuvre")
    '<http://ns.inria.fr/zoomathia/zoo#Oeuvre>'
"""

import re

MAX_IRI_LENGTH = 2048
MAX_LITERAL_LENGTH = 1000
MAX_LANGUAGE_TAG_LENGTH = 35

# Characters that the SPARQL 1.1 grammar forbids inside an IRIREF.
_FORBIDDEN_IRI_CHARACTERS = frozenset('<>"{}|^`\\')
_LANGUAGE_TAG = re.compile(r"[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*")


class InvalidSparqlValue(ValueError):  # noqa: N818 - the name reads as a domain error
    """A request value cannot be used safely in a SPARQL query.

    The message is short and safe to return to the client (it never echoes the value).
    """


def _is_surrogate(character: str) -> bool:
    # A lone surrogate (possible in a JSON body) cannot be encoded to UTF-8 later.
    return "\ud800" <= character <= "\udfff"


def sparql_iri(value: str) -> str:
    """Return `value` as a SPARQL IRI reference, `<...>`, or raise `InvalidSparqlValue`.

    The SPARQL grammar forbids `<`, `>`, `"`, `{`, `}`, `|`, `^`, the backtick, the
    backslash and every character from U+0000 to U+0020 inside an IRIREF. A value
    containing one of them could close the IRI early (`http://x> ?s ?p ?o } #`) and
    inject its own query text, so it is refused rather than cleaned. Only absolute
    `http` and `https` IRIs of at most 2048 characters are accepted.

    Args:
        value: The IRI sent by the client.

    Returns:
        The IRI wrapped in angle brackets.

    Raises:
        InvalidSparqlValue: If the value is not a safe absolute http(s) IRI.
    """
    if not isinstance(value, str):
        raise InvalidSparqlValue("Invalid IRI: a text value is expected.")
    if len(value) > MAX_IRI_LENGTH:
        raise InvalidSparqlValue(f"Invalid IRI: longer than {MAX_IRI_LENGTH} characters.")
    scheme_length = _http_scheme_length(value)
    if scheme_length == 0 or len(value) == scheme_length:
        raise InvalidSparqlValue("Invalid IRI: an absolute http or https IRI is expected.")
    for character in value:
        if character in _FORBIDDEN_IRI_CHARACTERS or character <= " " or _is_surrogate(character):
            raise InvalidSparqlValue("Invalid IRI: it contains a forbidden character.")
    return f"<{value}>"


def _http_scheme_length(value: str) -> int:
    """Length of the leading `http://` or `https://`, or 0 when there is none."""
    lowered = value[:8].lower()
    if lowered.startswith("https://"):
        return 8
    if lowered.startswith("http://"):
        return 7
    return 0


def sparql_literal(value: str) -> str:
    """Return `value` as a double-quoted SPARQL string literal, or raise `InvalidSparqlValue`.

    SPARQL processes `\\uXXXX` and `\\UXXXXXXXX` codepoint escapes before it parses the
    query, so `\\u0022` becomes a real double quote even inside a literal. Escaping the
    quote alone is therefore not enough: a backslash is refused outright, which also
    makes the escaping of `"` unambiguous. Control characters (U+0000 to U+001F and
    U+007F) are refused too, since a raw newline cannot appear in a short literal.
    This helper is for values supplied by users, not for trusted constants.

    Args:
        value: The text sent by the client, at most 1000 characters.

    Returns:
        The value between double quotes, with every `"` escaped.

    Raises:
        InvalidSparqlValue: If the value is too long or contains a backslash or a
            control character.
    """
    if not isinstance(value, str):
        raise InvalidSparqlValue("Invalid text: a text value is expected.")
    if len(value) > MAX_LITERAL_LENGTH:
        raise InvalidSparqlValue(f"Invalid text: longer than {MAX_LITERAL_LENGTH} characters.")
    for character in value:
        if character == "\\" or character < " " or character == "\x7f" or _is_surrogate(character):
            raise InvalidSparqlValue("Invalid text: it contains a forbidden character.")
    return '"' + value.replace('"', '\\"') + '"'


def sparql_lang(tag: str) -> str:
    """Return `tag` unchanged if it is a plain language tag, or raise `InvalidSparqlValue`.

    The accepted subset of BCP 47 is a primary language of 1 to 8 letters followed by
    any number of subtags of 1 to 8 letters or digits (`en`, `fr`, `grc`, `zh-Hant`).
    It contains no quote or backslash, so the result can sit between double quotes in
    a query, for example `FILTER(lang(?label) = "{sparql_lang(lang)}")`. A tag longer
    than 35 characters (the length RFC 5646 recommends supporting) is refused too.

    Args:
        tag: The language tag sent by the client, at most 35 characters.

    Returns:
        The same tag.

    Raises:
        InvalidSparqlValue: If the tag is longer than 35 characters or does not match
            the accepted subset.
    """
    if (
        not isinstance(tag, str)
        or len(tag) > MAX_LANGUAGE_TAG_LENGTH
        or _LANGUAGE_TAG.fullmatch(tag) is None
    ):
        raise InvalidSparqlValue("Invalid language tag.")
    return tag
