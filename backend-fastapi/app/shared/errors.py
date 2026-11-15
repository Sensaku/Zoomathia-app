"""Error handlers shared by every router."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.shared.sparql import InvalidSparqlValue


def register_error_handlers(app: FastAPI) -> None:
    """Map shared domain errors to HTTP responses on `app`.

    `InvalidSparqlValue` becomes a 400 whose body is `{"detail": <message>}`, the
    same shape as the other errors of the API.
    """

    @app.exception_handler(InvalidSparqlValue)
    async def handle_invalid_sparql_value(
        request: Request, exc: InvalidSparqlValue
    ) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})
