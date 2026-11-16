"""The single validation of every user-supplied or stored SPARQL query (RM-ACC-02).

A full query written by a user (SPARQL playground, saved queries, exports) is parsed
with rdflib instead of being filtered by keywords. Only `SELECT` and `ASK` are
accepted, `SERVICE` (server-side request forgery) and dataset clauses are refused, only
XSD casts can be called as functions (Corese extension functions can read files), and a
`SELECT` is bounded by a `LIMIT` so that it can never ask the shared Corese for an
unbounded result.

rdflib validates the query, but the text that is sent is read again by Corese. Both
must read the same text, so the validator refuses what the two parsers read
differently: line endings are normalized to LF (rdflib ends a `#` comment at LF only,
SPARQL and Corese also end it at CR), and backslash-u / backslash-U escapes and control
characters are refused.

Application code calls `prepare_query_async`, which parses in one dedicated thread.
`prepare_query` is the same function, synchronous, for unit tests.

Example:
    >>> prepare_query("SELECT * WHERE { ?s ?p ?o }")
    'SELECT * WHERE { ?s ?p ?o }\\nLIMIT 10000'
"""

import asyncio
import re
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from typing import Any, NoReturn

from rdflib.plugins.sparql.algebra import translateQuery, traverse
from rdflib.plugins.sparql.parser import parseQuery, parseUpdate
from rdflib.plugins.sparql.parserutils import CompValue

MAX_ROWS = 10_000
# Parsing is pure Python. It costs about 0.04 ms per character for real queries (the
# longest stored query is under 3,000 characters) and up to about 0.56 ms per character
# for pathological ones (`FILTER(1||1||...)`), so at most about 3 s per parse at this
# size. Parsing runs in a dedicated thread (`prepare_query_async`), not on the event loop.
MAX_QUERY_LENGTH = 5_000
_CACHE_SIZE = 256

_ALLOWED_FORMS = frozenset({"SelectQuery", "AskQuery"})
_SERVICE_NODES = frozenset({"ServiceGraphPattern", "Service"})
_XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema#"

_UPDATE_MESSAGE = "Update operations (INSERT, DELETE, DROP...) are not allowed."
_TOO_DEEP_MESSAGE = (
    "Invalid query: too deeply nested, or too many patterns in one group, for this validator."
)
_ESCAPE = re.compile(r"\\[uU]")
# TAB and LF are allowed; CR is already gone after normalization.
_CONTROL = re.compile("[\x00-\x08\x0b-\x1f\x7f-\x9f\u2028\u2029]")


class ForbiddenSparqlQuery(ValueError):  # noqa: N818 - the name reads as a domain error
    """A query is well formed but must never be run (update, `SERVICE`, dataset clause...).

    The message is short and safe to return to the client (it never echoes the query).
    """


class InvalidSparqlQuery(ValueError):  # noqa: N818 - the name reads as a domain error
    """A query cannot be accepted as written (syntax, unsupported form, `LIMIT` problem).

    The message is short and safe to return to the client (it never echoes the query).
    """


def prepare_query(text: str) -> str:
    """Validate a full SPARQL query and return the text to send to Corese.

    The query is parsed with rdflib, once. Line endings are normalized to LF first. A
    `SELECT` without a top-level `LIMIT` gets `LIMIT 10000` appended on a new line (so a
    trailing `#` comment cannot swallow it); every other accepted query is returned as
    written, apart from the line endings. A `LIMIT` inside a subquery does not count:
    the top-level query is the one that returns rows to the client.

    Application code calls `prepare_query_async`, which does the same work off the
    event loop.

    Args:
        text: The query written by a user or stored in the saved queries.

    Returns:
        The query to execute: `text` with LF line endings, followed by `LIMIT 10000` when
        it had no top-level `LIMIT`. It never contains a CR.

    Raises:
        ForbiddenSparqlQuery: If the text is a SPARQL Update (INSERT, DELETE, DROP...),
            contains a `SERVICE` clause at any depth, has a `FROM` / `FROM NAMED` dataset
            clause, or calls a function that is not an XSD cast (including a function
            whose prefix is not declared in the query).
        InvalidSparqlQuery: If the text is empty or longer than `MAX_QUERY_LENGTH`,
            contains a backslash-u or backslash-U escape or a control character, is not
            valid SPARQL for rdflib (Corese-specific extensions included), is too deeply
            nested for the parser, declares a prefix twice, is a `CONSTRUCT` or
            `DESCRIBE`, has a top-level `LIMIT` above 10000, or cannot be bounded
            automatically.
    """
    return _analyse(_screen(text))


# One thread, because rdflib's SPARQL parser is pure Python and not documented as
# thread-safe: confining it to a single thread avoids races, and the event loop keeps
# serving other requests while a query is parsed.
_PARSER_THREAD = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sparql-guard")
# Accepted results only, keyed by the raw text, read and written on the event loop only
# (no lock needed).
_ACCEPTED: OrderedDict[str, str] = OrderedDict()


async def prepare_query_async(text: str) -> str:
    """Same contract and exceptions as `prepare_query`, without blocking the event loop.

    The cheap checks (type, emptiness, line endings, length, escapes, control characters)
    run on the event loop first, so a refused text never waits in the parser queue.
    Parsing and analysis then run once, in a single dedicated thread. A parse cannot be
    interrupted, so a cancelled request still finishes its parse; the queue stays bounded
    because every caller holds a heavy-query slot (`limit_heavy_queries`). Accepted
    results are kept in a small LRU, so an identical query is not parsed again.

    Args:
        text: The query written by a user or stored in the saved queries.

    Returns:
        The query to execute, as `prepare_query` returns it.

    Raises:
        ForbiddenSparqlQuery: See `prepare_query`.
        InvalidSparqlQuery: See `prepare_query`.
    """
    normalized = _screen(text)
    cached = _ACCEPTED.get(text)
    if cached is not None:
        _ACCEPTED.move_to_end(text)
        return cached
    prepared = await asyncio.get_running_loop().run_in_executor(
        _PARSER_THREAD, _analyse, normalized
    )
    _ACCEPTED[text] = prepared
    while len(_ACCEPTED) > _CACHE_SIZE:
        _ACCEPTED.popitem(last=False)
    return prepared


def clear_prepared_queries() -> None:
    """Forget every cached result of `prepare_query_async` (used by the tests)."""
    _ACCEPTED.clear()


def _screen(text: str) -> str:
    """The cheap checks: return `text` with LF line endings, or raise the refusal."""
    if not isinstance(text, str) or not text.strip():
        raise InvalidSparqlQuery("Invalid query: a SPARQL SELECT or ASK query is expected.")
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(normalized) > MAX_QUERY_LENGTH:
        raise InvalidSparqlQuery(f"Invalid query: longer than {MAX_QUERY_LENGTH} characters.")
    if _ESCAPE.search(normalized):
        raise InvalidSparqlQuery(
            "Invalid query: \\u and \\U escape sequences are not accepted; "
            "write the characters themselves."
        )
    if _CONTROL.search(normalized):
        raise InvalidSparqlQuery("Invalid query: control characters are not accepted.")
    return normalized


def _analyse(normalized: str) -> str:
    """Parse and analyse a screened text (the work done in the parser thread)."""
    try:
        parsed = _parse(normalized)
        query = _query_node(parsed)
        _check_parse_tree(parsed, query)
        if query.name not in _ALLOWED_FORMS:
            raise InvalidSparqlQuery(
                "Only SELECT and ASK queries are allowed: CONSTRUCT and DESCRIBE are not."
            )
        if query.name == "AskQuery":
            return normalized

        limit = _top_level_limit(parsed)
        if limit is None:
            return _append_limit(normalized, query)
        if limit > MAX_ROWS:
            raise InvalidSparqlQuery(
                f"Invalid query: LIMIT is above the maximum of {MAX_ROWS} rows."
            )
        return normalized
    except RecursionError:
        raise InvalidSparqlQuery(_TOO_DEEP_MESSAGE) from None


def _parse(text: str) -> Any:
    """Parse `text` as a SPARQL query, or raise the right refusal."""
    try:
        return parseQuery(text)
    except RecursionError:
        raise
    except Exception:
        _refuse_unparsable(text)


def _refuse_unparsable(text: str) -> NoReturn:
    """Tell an update (forbidden) from plain invalid syntax, for a text that is no query."""
    try:
        update = parseUpdate(text)
    except RecursionError:
        raise
    except Exception:
        update = None
    # A text with only comments is a valid, empty update: that is not an update request.
    if update is not None and update.request:
        raise ForbiddenSparqlQuery(_UPDATE_MESSAGE)
    raise InvalidSparqlQuery(
        "Invalid query: syntax error, or syntax this validator does not support "
        "(Corese-specific extensions are not accepted here)."
    )


def _query_node(parsed: Any) -> CompValue:
    """The query node (`SelectQuery`, `AskQuery`...) of a parse result, after the prologue."""
    node = parsed[1]
    if not isinstance(node, CompValue):
        raise InvalidSparqlQuery("Invalid query: a SPARQL SELECT or ASK query is expected.")
    return node


def _check_parse_tree(parsed: Any, query: CompValue) -> None:
    """Refuse datasets, `SERVICE` and non-XSD function calls, on the parse tree.

    This runs before `translateQuery`, which rewrites the tree in place (it resolves the
    prefixed names with rdflib's own default prefixes) and whose algebra does not expose
    a function called inside `FILTER EXISTS`.
    """
    prefixes = _declared_prefixes(parsed[0])
    names: set[str] = set()
    functions: list[CompValue] = []

    def record(node: Any) -> None:
        if isinstance(node, CompValue):
            names.add(node.name)
            if node.name == "Function":
                functions.append(node)

    traverse(query, visitPost=record)
    if "DatasetClause" in names:
        raise ForbiddenSparqlQuery("FROM and FROM NAMED dataset clauses are not allowed.")
    if _SERVICE_NODES.intersection(names):
        raise ForbiddenSparqlQuery("SERVICE (federated) queries are not allowed.")
    for call in functions:
        if not _called_iri(call, prefixes).startswith(_XSD_NAMESPACE):
            raise ForbiddenSparqlQuery(
                f"Only XSD casts ({_XSD_NAMESPACE}) can be called as functions; "
                "declare their prefix in the query."
            )


def _declared_prefixes(prologue: Any) -> dict[str, str]:
    """The prefixes declared by the query itself (the empty prefix is `""`)."""
    declared: dict[str, str] = {}
    for declaration in prologue:
        if isinstance(declaration, CompValue) and declaration.name == "PrefixDecl":
            prefix = declaration.prefix or ""  # the key is absent for the empty prefix
            if prefix in declared:
                # rdflib keeps the last declaration, another parser may keep the first.
                raise InvalidSparqlQuery("Invalid query: a prefix is declared more than once.")
            declared[prefix] = str(declaration.iri)
    return declared


def _called_iri(call: CompValue, prefixes: dict[str, str]) -> str:
    """The IRI of a called function, resolved from the query itself ('' if unknown)."""
    target = call.iri
    if isinstance(target, CompValue):  # a prefixed name
        namespace = prefixes.get(target.prefix or "")
        return "" if namespace is None else namespace + str(target.localname or "")
    return str(target)  # a full IRI, possibly relative (then it never matches)


def _top_level_limit(parsed: Any) -> int | None:
    """The `LIMIT` of the top-level `SELECT` of a parse result, or None when it has none."""
    try:
        algebra = translateQuery(parsed).algebra
    except RecursionError:
        raise
    except Exception:
        raise InvalidSparqlQuery("Invalid query: it cannot be analysed.") from None
    top = algebra.get("p")
    if not isinstance(top, CompValue) or top.name != "Slice":
        return None
    length = top.get("length")  # rdflib returns the key itself when there is no LIMIT
    return length if isinstance(length, int) else None


def _append_limit(normalized: str, query: CompValue) -> str:
    """Append `LIMIT 10000` to a text whose top-level `SELECT` has no `LIMIT`."""
    if "valuesClause" in query:  # `CompValue.get` would return the key itself
        raise InvalidSparqlQuery(
            f"The query cannot be bounded automatically: add an explicit LIMIT (at most {MAX_ROWS})."
        )
    # Safe without parsing the result again: after line-ending normalization a `#` comment
    # ends at LF for rdflib and Corese alike, so the appended line is always the top-level
    # LIMIT clause. The grammar accepts it after GROUP BY, HAVING, ORDER BY and OFFSET;
    # only a trailing VALUES clause can follow it, and that case is refused above.
    return f"{normalized.rstrip()}\nLIMIT {MAX_ROWS}"
