"""Tests for the observability fields on rate-limited (429) responses.

Covers the upload and download buckets separately: the route name, the bucket's
configured limit and the retry wait appear both in the body and as the
Retry-After header, the wait follows the sliding window, and the 503 path for a
missing client identity keeps its old shape without any of the new fields.
"""

import json

from app.client_identity import LAMBDA_REQUEST_CONTEXT_HEADER
from app.config import ClientIdentitySource, settings
from app.main import app
from app.services.rate_limit import InMemoryRateLimiter
from fastapi.testclient import TestClient

from tests.rate_limiter_contract import FakeClock

SMALL_WAV = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 32


def _lambda_context_header(source_ip: str) -> dict[str, str]:
    """The request context header the Lambda Web Adapter sets, for one source address."""
    return {LAMBDA_REQUEST_CONTEXT_HEADER: json.dumps({"http": {"sourceIp": source_ip}})}


def _upload(client: TestClient, name: str = "t.wav", headers: dict[str, str] | None = None):
    """POST SMALL_WAV to the denoise endpoint."""
    return client.post(
        "/api/v1/denoise",
        headers=headers or {},
        files={"file": (name, SMALL_WAV, "audio/wav")},
    )


class _NullClientApp:
    """ASGI wrapper that strips the client from the request scope."""

    def __init__(self, wrapped_app) -> None:
        self._app = wrapped_app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] in ("http", "websocket"):
            scope = {**scope, "client": None}
        await self._app(scope, receive, send)


# --- Upload bucket 429 shape ---


def test_upload_429_reports_route_limit_retry_after_and_header(
    client, mock_denoiser, monkeypatch
) -> None:
    """An upload 429 keeps the old detail and adds route, limit, retry_after_seconds.

    The limit and window are non-default settings, proving the values come from
    the configured bucket rather than constants. CORS is still added last.
    """
    monkeypatch.setattr(settings, "max_jobs_per_ip", 100)
    monkeypatch.setattr(settings, "rate_limit_max_requests", 2)
    monkeypatch.setattr(settings, "rate_limit_window_seconds", 60)
    clock = FakeClock()
    app.state.rate_limiter = InMemoryRateLimiter(2, 60, clock=clock)
    origin = settings.cors_origins[0]

    for i in range(2):
        r = _upload(client, f"ok{i}.wav", headers={"Origin": origin})
        assert r.status_code == 200

    r = _upload(client, "over.wav", headers={"Origin": origin})
    assert r.status_code == 429
    body = r.json()
    assert body["detail"] == "Too many requests. Try again later."
    assert body["route"] == "upload"
    assert body["limit"] == 2
    assert body["retry_after_seconds"] == 60
    assert r.headers["retry-after"] == "60"
    assert r.headers["access-control-allow-origin"] == origin


def test_retry_after_follows_the_window_and_request_passes_after_expiry(
    client, mock_denoiser, monkeypatch
) -> None:
    """retry_after_seconds tracks the oldest counted request until it expires.

    Rejected uploads are not counted, so once the first counted request is one
    window old the next upload passes without any extra wait.
    """
    monkeypatch.setattr(settings, "max_jobs_per_ip", 100)
    clock = FakeClock()
    app.state.rate_limiter = InMemoryRateLimiter(2, 60, clock=clock)

    for i in range(2):
        assert _upload(client, f"ok{i}.wav").status_code == 200

    r = _upload(client, "over1.wav")
    assert r.status_code == 429
    assert r.json()["retry_after_seconds"] == 60
    assert r.headers["retry-after"] == "60"

    clock.advance(30)
    r = _upload(client, "over2.wav")
    assert r.status_code == 429
    assert r.json()["retry_after_seconds"] == 30
    assert r.headers["retry-after"] == "30"

    clock.advance(29)
    r = _upload(client, "over3.wav")
    assert r.status_code == 429
    # One second remains: the value is rounded up and never below 1
    assert r.json()["retry_after_seconds"] == 1
    assert r.headers["retry-after"] == "1"

    # The oldest counted request is now exactly one window old and stops counting;
    # the three rejected requests never extended the wait.
    clock.advance(1)
    assert _upload(client, "renewed.wav").status_code == 200


# --- Download bucket independence ---


def test_download_bucket_counts_independently_and_reports_its_own_limit(
    client, mock_denoiser, monkeypatch
) -> None:
    """The download bucket has its own counter, limit and window, separate from uploads."""
    monkeypatch.setattr(settings, "max_jobs_per_ip", 100)
    monkeypatch.setattr(settings, "rate_limit_max_requests", 3)
    monkeypatch.setattr(settings, "rate_limit_window_seconds", 60)
    monkeypatch.setattr(settings, "download_rate_limit_max_requests", 2)
    monkeypatch.setattr(settings, "download_rate_limit_window_seconds", 120)
    clock = FakeClock()
    app.state.rate_limiter = InMemoryRateLimiter(3, 60, clock=clock)
    app.state.download_rate_limiter = InMemoryRateLimiter(2, 120, clock=clock)

    job_id = _upload(client, "job.wav").json()["job_id"]
    url = f"/api/v1/download/{job_id}"

    for i in range(2):
        assert client.get(url).status_code == 200, f"Download {i + 1} should succeed"
    d = client.get(url)
    assert d.status_code == 429
    body = d.json()
    assert body["detail"] == "Too many requests. Try again later."
    assert body["route"] == "download"
    assert body["limit"] == 2
    assert body["retry_after_seconds"] == 120
    assert d.headers["retry-after"] == "120"

    # A full download bucket does not count against uploads
    assert _upload(client, "still_ok.wav").status_code == 200

    # Reach the upload bucket's own, different limit
    assert _upload(client, "third.wav").status_code == 200
    u = _upload(client, "upload_over.wav")
    assert u.status_code == 429
    assert u.json()["route"] == "upload"
    assert u.json()["limit"] == 3
    assert u.json()["retry_after_seconds"] == 60
    assert u.headers["retry-after"] == "60"

    # The upload 429 did not touch the download bucket
    assert client.get(url).status_code == 429


# --- 503 path is unchanged ---


def test_503_without_client_identity_keeps_old_body_and_has_no_retry_fields(
    mock_denoiser,
) -> None:
    """An upload with no client address still returns the old 503 body and no retry fields."""
    from tests.conftest import _clear_rate_limiter

    origin = settings.cors_origins[0]
    _clear_rate_limiter(app)
    with TestClient(_NullClientApp(app)) as c:
        r = c.post(
            "/api/v1/denoise",
            headers={"Origin": origin},
            files={"file": ("none.wav", SMALL_WAV, "audio/wav")},
        )

    assert r.status_code == 503
    body = r.json()
    assert set(body) == {"detail"}
    assert "proxy misconfiguration" in body["detail"]
    assert "retry-after" not in r.headers
    # CORS still applies to the early 503 response
    assert r.headers["access-control-allow-origin"] == origin


def test_download_503_without_identity_has_no_retry_fields(
    client, mock_denoiser, monkeypatch
) -> None:
    """A download with no client identity fails closed with the old 503 shape."""
    monkeypatch.setattr(
        settings, "client_identity_source", ClientIdentitySource.LAMBDA_REQUEST_CONTEXT
    )
    job_id = _upload(client, "job.wav", _lambda_context_header("198.51.100.7")).json()["job_id"]

    d = client.get(f"/api/v1/download/{job_id}")

    assert d.status_code == 503
    assert set(d.json()) == {"detail"}
    assert "proxy misconfiguration" in d.json()["detail"]
    assert "retry-after" not in d.headers


# --- Adapter-level read-only query ---


async def test_retry_after_seconds_uses_oldest_request_with_ceil_and_minimum_one() -> None:
    """The wait is the oldest active request's remaining time, rounded up and floored at 1."""
    clock = FakeClock()
    limiter = InMemoryRateLimiter(2, 60, clock=clock)
    assert await limiter.allow("client-a")
    clock.advance(10)
    assert await limiter.allow("client-a")

    # Oldest request at t=1000 expires at t=1060; it is now t=1010
    assert await limiter.retry_after_seconds("client-a") == 50

    clock.advance(49.4)  # 0.6 s remains -> rounded up to 1
    assert await limiter.retry_after_seconds("client-a") == 1

    assert await limiter.retry_after_seconds("unknown-client") is None


async def test_retry_after_seconds_is_read_only_and_rejected_requests_are_not_counted() -> None:
    """Querying the wait changes nothing, and rejected allow() calls never extend the wait."""
    clock = FakeClock()
    limiter = InMemoryRateLimiter(1, 60, clock=clock)
    assert await limiter.allow("client-a")
    assert not await limiter.allow("client-a")  # rejected, must not be counted

    snapshot = {key: list(times) for key, times in limiter._requests.items()}
    for _ in range(3):
        assert await limiter.retry_after_seconds("client-a") == 60
    assert {key: list(times) for key, times in limiter._requests.items()} == snapshot
    assert not await limiter.allow("client-a")

    # Exactly one window after the one counted request: it no longer counts and
    # the earlier rejection did not push the expiry later.
    clock.advance(60)
    assert await limiter.allow("client-a")


async def test_limit_property_exposes_the_configured_bucket_limit() -> None:
    """The read-only limit property reports the limit the bucket was built with."""
    limiter = InMemoryRateLimiter(7, 90, clock=FakeClock())
    assert limiter.limit == 7


# --- Middleware fallback for an adapter without the reject-info surface ---


class _AllowOnlyLimiter:
    """Minimal RateLimiter: implements only the allow() contract."""

    async def allow(self, client_id: str) -> bool:
        return False


def test_middleware_falls_back_to_settings_when_limiter_has_no_reject_info(
    client, mock_denoiser, monkeypatch
) -> None:
    """Without the optional read-only surface, the 429 uses the route's configured values."""
    monkeypatch.setattr(settings, "max_jobs_per_ip", 100)
    monkeypatch.setattr(settings, "rate_limit_max_requests", 4)
    monkeypatch.setattr(settings, "rate_limit_window_seconds", 90)
    app.state.rate_limiter = _AllowOnlyLimiter()

    r = _upload(client, "over.wav")

    assert r.status_code == 429
    body = r.json()
    assert body["route"] == "upload"
    assert body["detail"] == "Too many requests. Try again later."
    assert body["limit"] == 4
    assert body["retry_after_seconds"] == 90
    assert r.headers["retry-after"] == "90"
