"""Domain errors shared by every domain package.

Services raise these errors and never `HTTPException` (development guidelines, "Backend").
`register_error_handlers` (`app/shared/errors.py`) maps them to HTTP responses whose body
is `{"detail": <English message>, "code": <stable code>}`: the screens translate the
message from the code.
"""


class DomainError(Exception):
    """A failure that the API reports with a status, a message and a stable code.

    Attributes:
        status_code: HTTP status of the response.
        code: stable, machine-readable identifier (for example `account_pending`).
        message: short English explanation, safe to show (no internal detail).
    """

    status_code = 500

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class BadRequest(DomainError):
    """The request cannot be honoured as sent (HTTP 400)."""

    status_code = 400


class NotAuthenticated(DomainError):
    """No valid credential or session (HTTP 401)."""

    status_code = 401


class Forbidden(DomainError):
    """The caller is known but not allowed (HTTP 403)."""

    status_code = 403


class NotFound(DomainError):
    """The resource does not exist (HTTP 404)."""

    status_code = 404


class Conflict(DomainError):
    """The request conflicts with the current state of the resource (HTTP 409)."""

    status_code = 409


class UnsupportedMediaType(DomainError):
    """The request body has a content type that the route does not accept (HTTP 415)."""

    status_code = 415


class Unprocessable(DomainError):
    """The request is well formed but a business rule refuses its content (HTTP 422)."""

    status_code = 422


class TooManyAttempts(DomainError):
    """Too many attempts, or the server is saturated: retry later (HTTP 429).

    Attributes:
        retry_after: seconds to wait, sent in the `Retry-After` header.
    """

    status_code = 429

    def __init__(self, code: str, message: str, retry_after: int) -> None:
        super().__init__(code, message)
        self.retry_after = max(1, retry_after)
