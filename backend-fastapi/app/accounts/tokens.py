"""Random tokens (session cookie, CSRF, password reset): creation, hashing, comparison.

Only the SHA-256 of a session or reset token reaches the database, so a copy of the
database cannot be used to open a session. The tokens carry 256 bits of randomness, which
makes a fast hash sufficient (a slow one such as Argon2 is for low-entropy passwords).
"""

import hashlib
import hmac
import secrets


def new_token() -> str:
    """A URL-safe random token with 256 bits of randomness."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """The SHA-256 hex digest under which `token` is stored."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(expected: str, received: str) -> bool:
    """Compare two tokens in constant time."""
    return hmac.compare_digest(expected.encode("utf-8"), received.encode("utf-8"))
