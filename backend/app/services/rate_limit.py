"""The contract for counting requests per client, and how the configured counters are built."""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from typing import Protocol, assert_never, runtime_checkable

from app.config import RateLimiterBackend, settings


class RateLimiter(Protocol):
    """Decides whether one more upload from a client is allowed (ADR 010)."""

    async def allow(self, client_id: str) -> bool:
        """Count one request from *client_id* if it is within the limit.

        Args:
            client_id: The client's identity, from client_identity().

        Returns:
            True if the request is allowed and has been counted. False if the
            client is at its limit, in which case the request is not counted.
        """
        ...


@runtime_checkable
class RateLimitRejectInfo(Protocol):
    """Read-only observability an adapter can offer for the requests it rejects.

    This is a separate, optional surface from RateLimiter. The allow() contract
    is unchanged: nothing here may count a request or mutate the window. The
    middleware reads it only after allow() has already returned False, so the
    answer describes the window that rejected the request.
    """

    @property
    def limit(self) -> int:
        """The configured maximum number of requests counted per window."""
        ...

    async def retry_after_seconds(self, client_id: str) -> int | None:
        """Seconds until this client's oldest counted request leaves the window.

        Rounded up and never below 1, so it is directly usable as a Retry-After
        value. None means the client currently has no request in its window, in
        which case no request of theirs is being rejected and callers should not
        need this value.

        Args:
            client_id: The client's identity, from client_identity().
        """
        ...


class InMemoryRateLimiter:
    """Sliding-window rate limit counted inside this process.

    Keeps, per client, the times of its allowed requests. A request is allowed
    while fewer than max_requests of them are newer than one window ago. The
    count belongs to one process, so it is the whole limit only while one
    process serves uploads.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        """Initialize the limiter.

        Args:
            max_requests: Requests allowed per client within one window.
            window_seconds: Length of the sliding window.
            clock: Source of the current time in seconds; tests pass a fake one.
        """
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._clock = clock
        self._requests: dict[str, list[float]] = {}
        self._last_sweep = clock()

    async def allow(self, client_id: str) -> bool:
        """Count one request from *client_id* if it is within the limit.

        Args:
            client_id: The client's identity, from client_identity().

        Returns:
            True if the request is allowed and has been counted, otherwise False.
        """
        # Nothing below awaits, so on one event loop no other request can run
        # between reading this client's count and recording the new request
        now = self._clock()
        cutoff = now - self._window_seconds
        if now - self._last_sweep >= self._window_seconds:
            self._drop_idle_clients(cutoff)
            self._last_sweep = now
        active = [t for t in self._requests.get(client_id, []) if t > cutoff]
        if len(active) >= self._max_requests:
            self._requests[client_id] = active
            return False
        active.append(now)
        self._requests[client_id] = active
        return True

    @property
    def limit(self) -> int:
        """The configured maximum number of requests counted per window."""
        return self._max_requests

    async def retry_after_seconds(self, client_id: str) -> int | None:
        """Seconds until the client's oldest counted request is older than the window.

        Read-only: unlike allow(), this neither records the request nor changes
        any stored timestamp. The oldest timestamp still inside the window is
        what makes a full bucket reject requests; once it is one window old it
        stops counting and the client has room again. The result is rounded up
        and floored at 1, matching the Retry-After header semantics the
        middleware needs.

        Args:
            client_id: The client's identity, from client_identity().

        Returns:
            The whole number of seconds to wait, or None when the client has no
            request currently inside its window.
        """
        now = self._clock()
        cutoff = now - self._window_seconds
        active = [t for t in self._requests.get(client_id, []) if t > cutoff]
        if not active:
            return None
        # Timestamps are appended in clock order, so the first one is the oldest
        expires_at = active[0] + self._window_seconds
        return max(1, math.ceil(expires_at - now))

    def _drop_idle_clients(self, cutoff: float) -> None:
        """Forget clients whose newest request is older than *cutoff*.

        A client's entry is otherwise rewritten only when that client sends
        another request, so addresses that never return would stay forever.
        Called at most once per window, so the O(clients) scan is amortized
        over that window's requests. Times are appended in clock order, so
        the last one is the newest.
        """
        self._requests = {
            client_id: times for client_id, times in self._requests.items() if times[-1] > cutoff
        }


def build_rate_limiter(
    backend: RateLimiterBackend, max_requests: int, window_seconds: float
) -> RateLimiter:
    """Build a rate limiter for *backend* with the given limit.

    Args:
        backend: The configured rate limiter backend.
        max_requests: Requests allowed per client within one window.
        window_seconds: Length of the sliding window.

    Returns:
        A rate limiter allowing *max_requests* per client per *window_seconds*.
    """
    # match with assert_never lets mypy report a backend that has no branch here
    match backend:
        case RateLimiterBackend.MEMORY:
            return InMemoryRateLimiter(max_requests=max_requests, window_seconds=window_seconds)
        case _:
            assert_never(backend)


def build_upload_rate_limiter() -> RateLimiter:
    """Build the upload rate limiter from the current settings."""
    return build_rate_limiter(
        settings.rate_limiter, settings.rate_limit_max_requests, settings.rate_limit_window_seconds
    )


def build_download_rate_limiter() -> RateLimiter:
    """Build the download rate limiter from the current settings."""
    return build_rate_limiter(
        settings.rate_limiter,
        settings.download_rate_limit_max_requests,
        settings.download_rate_limit_window_seconds,
    )
