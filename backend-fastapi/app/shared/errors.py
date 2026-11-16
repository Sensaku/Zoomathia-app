"""Error handlers shared by every router."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.corpus.custom_search import PurelyNegativeSearchError
from app.shared.sparql import InvalidSparqlValue
from app.shared.sparql_guard import ForbiddenSparqlQuery, InvalidSparqlQuery


def register_error_handlers(app: FastAPI) -> None:
    """Map shared domain errors to HTTP responses on `app`.

    `InvalidSparqlValue`, `InvalidSparqlQuery` and `PurelyNegativeSearchError` become a
    400, `ForbiddenSparqlQuery` a 403. The body is `{"detail": <message>}`, the same shape
    as the other errors of the API.
    """

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
