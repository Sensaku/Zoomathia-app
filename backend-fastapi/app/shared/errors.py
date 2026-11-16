"""Error handlers shared by every router."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from app.corpus.custom_search import PurelyNegativeSearchError
from app.shared.domain_errors import DomainError, TooManyAttempts
from app.shared.sparql import InvalidSparqlValue
from app.shared.sparql_guard import ForbiddenSparqlQuery, InvalidSparqlQuery


def _database_busy() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The server is busy: try again in a few seconds.",
            "code": "database_busy",
        },
        headers={"Retry-After": "5"},
    )


def register_error_handlers(app: FastAPI) -> None:
    """Map shared domain errors to HTTP responses on `app`.

    `InvalidSparqlValue`, `InvalidSparqlQuery` and `PurelyNegativeSearchError` become a
    400, `ForbiddenSparqlQuery` a 403. The body is `{"detail": <message>}`, the same shape
    as the other errors of the API. A `DomainError` (see `app/shared/domain_errors.py`)
    becomes its own status, with a body `{"detail": <message>, "code": <code>}` and, for
    `TooManyAttempts`, a `Retry-After` header. A database that cannot take the request in
    time (connection pool exhausted, or SQLite write lock still held after the busy timeout)
    becomes a 503 with `Retry-After` and the code `database_busy`, never an unmapped 500
    (AGENTS.md, rule 9).
    """

    @app.exception_handler(PoolTimeoutError)
    async def handle_pool_exhausted(request: Request, exc: PoolTimeoutError) -> JSONResponse:
        return _database_busy()

    @app.exception_handler(OperationalError)
    async def handle_operational_error(request: Request, exc: OperationalError) -> JSONResponse:
        if "database is locked" not in str(exc.orig):
            raise exc
        return _database_busy()

    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        headers = {}
        if isinstance(exc, TooManyAttempts):
            headers["Retry-After"] = str(exc.retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.message, "code": exc.code},
            headers=headers,
        )

    @app.exception_handler(InvalidSparqlValue)
    async def handle_invalid_sparql_value(
        request: Request, exc: InvalidSparqlValue
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(InvalidSparqlQuery)
    async def handle_invalid_sparql_query(
        request: Request, exc: InvalidSparqlQuery
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(ForbiddenSparqlQuery)
    async def handle_forbidden_sparql_query(
        request: Request, exc: ForbiddenSparqlQuery
    ) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    @app.exception_handler(PurelyNegativeSearchError)
    async def handle_purely_negative_search(
        request: Request, exc: PurelyNegativeSearchError
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})
