"""The clock, injected so that tests control time (development guidelines, "Design principles").

Every timestamp of the application is timezone-aware UTC. Code that needs the current time
receives a `Clock` (through `get_clock` in a route, or as an argument in a service) instead
of calling `datetime.now` itself.
"""

from collections.abc import Callable
from datetime import datetime, timezone

Clock = Callable[[], datetime]


def utcnow() -> datetime:
    """The current time, timezone-aware, in UTC."""
    return datetime.now(timezone.utc)


def get_clock() -> Clock:
    """FastAPI dependency giving the clock; tests override it with a controllable one."""
    return utcnow
