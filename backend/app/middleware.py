"""Custom middleware."""

from __future__ import annotations

import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.client_identity import client_identity
from app.config import settings
from app.services.rate_limit import RateLimiter, RateLimitRejectInfo

logger = logging.getLogger(__name__)


# The routes with a per-client limit
_UPLOAD_PATH = "/api/v1/denoise"
_DOWNLOAD_PATH_PREFIX = "/api/v1/download/"

_RATE_LIMITED_DETAIL = "Too many requests. Try again later."


def _limited_route(request: Request) -> tuple[str, RateLimiter] | None:
    """Return a name for the request's limited route and that route's limiter, or None."""
    path = request.url.path
    if request.method == "POST" and path == _UPLOAD_PATH:
        return "upload", request.app.state.rate_limiter
    if request.method == "GET" and path.startswith(_DOWNLOAD_PATH_PREFIX):
        return "download", request.app.state.download_rate_limiter
    return None


def _configured_window(route: str) -> int:
    """Return the configured window length for *route*'s bucket, in seconds."""
    if route == "upload":
        return settings.rate_limit_window_seconds
    return settings.download_rate_limit_window_seconds


async def _rejection(route: str, limiter: RateLimiter, client_ip: str) -> JSONResponse:
    """Build the 429 response for a request the limiter has just rejected.

    The limiter's own limit and retry time are used when it exposes the read-only
    RateLimitRejectInfo surface, so the values track the bucket actually counting
    this route. An adapter without that surface falls back to the route's settings.

    Args:
        route: "upload" or "download".
        limiter: The bucket that just returned False from allow().
        client_ip: The rejected client's identity.

    Returns:
        A 429 JSONResponse carrying the route, the bucket limit and the seconds to
        wait, both in the body and as the Retry-After header.
    """
    if isinstance(limiter, RateLimitRejectInfo):
        limit = limiter.limit
        retry_after = await limiter.retry_after_seconds(client_ip)
        if retry_after is None:
            # Only reachable if an adapter reports being full and then has no
            # counted request; the configured window is the safe upper bound.
            retry_after = _configured_window(route)
    else:
        limit = (
            settings.rate_limit_max_requests
            if route == "upload"
            else settings.download_rate_limit_max_requests
        )
        retry_after = _configured_window(route)
    return JSONResponse(
        status_code=429,
        content={
            "detail": _RATE_LIMITED_DETAIL,
            "route": route,
            "limit": limit,
            "retry_after_seconds": retry_after,
        },
        headers={"Retry-After": str(retry_after)},
    )


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-client rate limits for uploads and downloads.

    Rejects POST /api/v1/denoise with 429 when the client is over the limit kept
    by the RateLimiter on app.state.rate_limiter, and GET /api/v1/download/{job_id}
    when it is over the separate limit on app.state.download_rate_limiter. Both
    are installed by app.composition. Returns 503 when the request has no client
    address, which indicates a proxy misconfiguration rather than a client error.

    The 429 body keeps its original detail and additionally names the route
    (upload or download), the bucket's configured limit and the number of seconds
    to wait before retrying; the same value is sent as the Retry-After header.
    Those values come from the bucket that rejected the request, never from
    constants, and the two buckets do not affect each other.

    The client is identified by client_identity(). Behind a proxy, that is the
    real client only if Uvicorn trusts the proxy's forwarded headers (the
    forwarded-allow-ips setting in the Dockerfile CMD) and clients cannot
    reach the backend without passing through the proxy.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Rate limit uploads and downloads by client identity.

        Args:
            request: The incoming HTTP request.
            call_next: The next middleware or route handler in the stack.

        Returns:
            503 if the client address is absent (proxy misconfiguration).
            429 if the client has exceeded the route's rate limit.
            Otherwise the response from the next handler.
        """
        limited = _limited_route(request)
        if limited is not None:
            route, limiter = limited
            client_ip = client_identity(request)
            if client_ip is None:
                logger.warning(
                    "Rejecting %s request with no client address (proxy misconfiguration)", route
                )
                return JSONResponse(
                    status_code=503,
                    content={"detail": "Service unavailable: proxy misconfiguration."},
                )

            logger.debug("Rate-limit check for %s from client_ip=%s", route, client_ip)
            if not await limiter.allow(client_ip):
                return await _rejection(route, limiter, client_ip)

        return await call_next(request)
