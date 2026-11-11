"""Tests for SSRF reproduction (retest) evidence and the pure audit entry.

Covers the enhanced SSRFScanner behavior (a finding requires a confirmation
retest with the identical probe) and the pure audit function in
``isitsecure.engine.scanners.ssrf_evidence``, including that the audit's
report/no-report conclusion matches the scanner on the same snapshot.
"""

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from isitsecure.engine.constants import SSRFConfig
from isitsecure.engine.enums import EndpointMethod
from isitsecure.engine.models import DiscoveredEndpoint
from isitsecure.engine.scanners.ssrf_evidence import (
    SKIP_FIRST_PROBE_NO_HIT,
    SKIP_RETEST_NO_HIT,
    SKIP_STATUS_OUT_OF_RANGE,
    ProbeRecord,
    audit_probe_snapshot,
    baseline_indicators,
    response_indicates_ssrf,
)
from isitsecure.engine.scanners.ssrf_scanner import SSRFScanner

AWS_BODY = "ami-id: i-1234567890abcdef0\ninstance-id: i-abc"
CLEAN_BODY = "Nothing interesting here"


def _make_endpoint(
    url: str = "https://example.com/api/fetch?url=https://google.com",
    method: EndpointMethod = EndpointMethod.GET,
    query_param_names: list[str] | None = None,
) -> DiscoveredEndpoint:
    return DiscoveredEndpoint(
        url=url,
        method=method,
        query_param_names=query_param_names or [],
    )


def _make_response(body: str, status_code: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        headers={"content-type": "text/html"},
        text=body,
    )


class RecordingClient:
    """Fake HTTP client: records every GET and delegates to a handler.

    The handler receives (url, hit_count) where hit_count is how many times
    that exact URL has been requested before (0 = first request, 1 = retest).
    """

    def __init__(self, handler):
        self.handler = handler
        self.calls: list[str] = []

    async def get(self, url: str, **kwargs: object) -> httpx.Response:
        hit_count = self.calls.count(url)
        self.calls.append(url)
        return self.handler(url, hit_count)


async def _run_scanner(client: RecordingClient, endpoints: list[DiscoveredEndpoint]):
    """Run the scanner with the fake client patched in."""
    scanner = SSRFScanner()
    with patch(
        "isitsecure.engine.scanners.ssrf_scanner.RateLimitedClient"
    ) as MockClient:
        MockClient.return_value.__aenter__ = AsyncMock(return_value=client)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        return await scanner.scan(endpoints)


def _build_snapshot(client: RecordingClient) -> tuple[str, list[ProbeRecord]]:
    """Reconstruct a ProbeRecord snapshot from a RecordingClient's calls.

    Uses the same pure helpers the scanner uses, so the snapshot faithfully
    reflects what the scanner observed.
    """
    from isitsecure.engine.shared.url_utils import inject_query_param

    endpoint_url = "https://example.com/api/fetch?url=https://google.com"
    baseline_url = inject_query_param(
        endpoint_url, "url", SSRFConfig.SSRF_BASELINE_URL
    )
    # The baseline is fetched exactly once, before any probe.
    baseline_body = client.responses[baseline_url][0].text

    records: list[ProbeRecord] = []
    for probe_url, probe_label in SSRFConfig.SSRF_PROBES:
        injected = inject_query_param(endpoint_url, "url", probe_url)
        seen = client.responses.get(injected)
        if not seen:
            continue  # probe never reached (scanner broke earlier)
        first = seen[0]
        first_hit = response_indicates_ssrf(first.text, baseline_body)
        retest_hit = None
        if len(seen) > 1:
            retest_hit = response_indicates_ssrf(seen[1].text, baseline_body)
        records.append(
            ProbeRecord(
                probe_url=probe_url,
                probe_label=probe_label,
                status_code=first.status_code,
                body=first.text,
                first_hit=first_hit,
                retest_hit=retest_hit,
            )
        )
    return baseline_body, records


class TrackingClient(RecordingClient):
    """RecordingClient that also stores every response per URL."""

    def __init__(self, handler):
        super().__init__(handler)
        self.responses: dict[str, list[httpx.Response]] = {}

    async def get(self, url: str, **kwargs: object) -> httpx.Response:
        response = await super().get(url, **kwargs)
        self.responses.setdefault(url, []).append(response)
        return response


class TestSSRFReproduction:
    """Scanner must confirm a first hit with an identical retest."""

    @pytest.mark.asyncio
    async def test_first_and_retest_hit_reports_with_marker(self) -> None:
        """First hit + retest hit -> finding flagged as reproduced."""

        def handler(url: str, n: int) -> httpx.Response:
            if "127.0.0.1" in url:
                return _make_response(AWS_BODY)
            return _make_response(CLEAN_BODY)

        client = RecordingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])

        assert len(findings) == 1
        detail = findings[0].technical_detail
        assert "Reproduced" in detail
        assert "复测通过" in detail
        # Original field behavior preserved.
        assert findings[0].evidence
        assert findings[0].response_preview == AWS_BODY[:300]
        assert findings[0].request_payload == "url=http://127.0.0.1"
        assert findings[0].confidence == SSRFConfig.CONFIDENCE_SSRF
        assert findings[0].http_method == "GET"

    @pytest.mark.asyncio
    async def test_retest_miss_continues_to_next_probe(self) -> None:
        """First hit but retest miss -> no finding for that probe; the
        scanner continues with the next probe and can confirm a later one."""

        def handler(url: str, n: int) -> httpx.Response:
            if "127.0.0.1" in url:
                # First request hits, the retest does not reproduce.
                return _make_response(AWS_BODY if n == 0 else CLEAN_BODY)
            if "localhost" in url:
                return _make_response(AWS_BODY)
            return _make_response(CLEAN_BODY)

        client = RecordingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])

        assert len(findings) == 1
        # The finding comes from the second probe (http://localhost), not
        # the flaky first one (http://127.0.0.1).
        assert "http://localhost" in findings[0].technical_detail
        assert "http://127.0.0.1" not in findings[0].request_payload

    @pytest.mark.asyncio
    async def test_retest_miss_on_all_probes_reports_nothing(self) -> None:
        """If every probe fails its retest, no finding is produced."""

        def handler(url: str, n: int) -> httpx.Response:
            if "example.invalid" in url:
                return _make_response(CLEAN_BODY)
            # Every probe hits once, then flakes on the retest.
            return _make_response(AWS_BODY if n == 0 else CLEAN_BODY)

        client = RecordingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])

        assert findings == []

    @pytest.mark.asyncio
    async def test_no_retest_request_when_first_probe_misses(self) -> None:
        """A probe whose first response misses must not be re-requested."""
        probed_urls: list[str] = []

        def handler(url: str, n: int) -> httpx.Response:
            probed_urls.append(url)
            return _make_response(CLEAN_BODY)

        client = RecordingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])

        assert findings == []
        # 1 baseline + 1 request per probe, never a second request.
        assert len(client.calls) == 1 + len(SSRFConfig.SSRF_PROBES)
        assert len(set(client.calls)) == len(client.calls)

    @pytest.mark.asyncio
    async def test_baseline_already_contains_indicator_no_report(self) -> None:
        """Indicator present in the baseline body is not differential
        evidence, even when the probe body also contains it."""

        def handler(url: str, n: int) -> httpx.Response:
            # Baseline (benign URL) and probes all contain the indicator.
            return _make_response("ami-id: always here")

        client = RecordingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])

        assert findings == []
        # No retests either: nothing ever counted as a first hit.
        assert len(client.calls) == 1 + len(SSRFConfig.SSRF_PROBES)

    @pytest.mark.asyncio
    async def test_baseline_fetched_exactly_once(self) -> None:
        """The baseline request must happen once, even with retests."""

        def handler(url: str, n: int) -> httpx.Response:
            if "127.0.0.1" in url:
                return _make_response(AWS_BODY)
            return _make_response(CLEAN_BODY)

        client = RecordingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])

        assert len(findings) == 1
        baseline_calls = [u for u in client.calls if "example.invalid" in u]
        assert len(baseline_calls) == 1


class TestSSRFEvidenceAudit:
    """Pure audit function over a recorded probe snapshot."""

    def test_confirmed_probe_reports(self) -> None:
        records = [
            ProbeRecord(
                probe_url="http://127.0.0.1",
                probe_label="localhost",
                status_code=200,
                body=AWS_BODY,
                first_hit=True,
                retest_hit=True,
            )
        ]
        result = audit_probe_snapshot(CLEAN_BODY, records)

        assert result["should_report"] is True
        assert result["hit_probe_label"] == "localhost"
        assert result["hit_probe_url"] == "http://127.0.0.1"
        assert result["probes"][0]["confirmed"] is True
        assert result["probes"][0]["skip_reason"] is None
        assert result["snapshot_consistent"] is True
        json.dumps(result)  # must be JSON-serializable

    def test_retest_miss_skips_probe_and_continues(self) -> None:
        records = [
            ProbeRecord(
                probe_url="http://127.0.0.1",
                probe_label="localhost",
                status_code=200,
                body=AWS_BODY,
                first_hit=True,
                retest_hit=False,
            ),
            ProbeRecord(
                probe_url="http://localhost",
                probe_label="localhost",
                status_code=200,
                body=AWS_BODY,
                first_hit=True,
                retest_hit=True,
            ),
        ]
        result = audit_probe_snapshot(CLEAN_BODY, records)

        assert result["should_report"] is True
        assert result["hit_probe_url"] == "http://localhost"
        assert result["probes"][0]["skip_reason"] == SKIP_RETEST_NO_HIT
        assert result["probes"][0]["confirmed"] is False
        assert result["probes"][1]["confirmed"] is True

    def test_status_out_of_range_skips_probe(self) -> None:
        records = [
            ProbeRecord(
                probe_url="http://127.0.0.1",
                probe_label="localhost",
                status_code=500,
                body=AWS_BODY,
                first_hit=False,
            )
        ]
        result = audit_probe_snapshot(CLEAN_BODY, records)

        assert result["should_report"] is False
        assert result["probes"][0]["skip_reason"] == SKIP_STATUS_OUT_OF_RANGE
        assert result["probes"][0]["status_in_range"] is False

    def test_first_probe_miss_skips_without_retest(self) -> None:
        records = [
            ProbeRecord(
                probe_url="http://127.0.0.1",
                probe_label="localhost",
                status_code=200,
                body=CLEAN_BODY,
                first_hit=False,
                retest_hit=None,
            )
        ]
        result = audit_probe_snapshot(CLEAN_BODY, records)

        assert result["should_report"] is False
        entry = result["probes"][0]
        assert entry["skip_reason"] == SKIP_FIRST_PROBE_NO_HIT
        assert entry["first_hit"] is False
        assert entry["retest_hit"] is None

    def test_baseline_indicator_blocks_report(self) -> None:
        """Indicator already in the baseline -> not differential, no report,
        and the baseline indicators are listed in the audit output."""
        baseline = "ami-id: already in the benign response"
        records = [
            ProbeRecord(
                probe_url="http://127.0.0.1",
                probe_label="localhost",
                status_code=200,
                body="ami-id: also here",
                first_hit=False,  # scanner would not count this as a hit
                retest_hit=None,
            )
        ]
        result = audit_probe_snapshot(baseline, records)

        assert result["should_report"] is False
        assert "ami-id" in result["baseline_indicators"]
        assert result["probes"][0]["skip_reason"] == SKIP_FIRST_PROBE_NO_HIT
        assert result["snapshot_consistent"] is True
        json.dumps(result)

    def test_baseline_indicators_helper(self) -> None:
        assert baseline_indicators("ami-id: x\ncomputeMetadata") == [
            "ami-id",
            "computeMetadata",
        ]
        assert baseline_indicators(CLEAN_BODY) == []

    def test_inconsistent_snapshot_flagged(self) -> None:
        """A recorded first_hit that contradicts the body/baseline is
        flagged via snapshot_consistent = False."""
        records = [
            ProbeRecord(
                probe_url="http://127.0.0.1",
                probe_label="localhost",
                status_code=200,
                body=CLEAN_BODY,
                first_hit=True,  # contradicts the clean body
                retest_hit=True,
            )
        ]
        result = audit_probe_snapshot(CLEAN_BODY, records)
        assert result["snapshot_consistent"] is False


class TestAuditMatchesScanner:
    """The audit's report/no-report verdict must match the scanner's
    behavior on the same recorded snapshot."""

    @pytest.mark.asyncio
    async def test_audit_agrees_when_scanner_reports(self) -> None:
        def handler(url: str, n: int) -> httpx.Response:
            if "127.0.0.1" in url:
                return _make_response(AWS_BODY)
            return _make_response(CLEAN_BODY)

        client = TrackingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])
        baseline_body, records = _build_snapshot(client)
        audit = audit_probe_snapshot(baseline_body, records)

        assert len(findings) == 1
        assert audit["should_report"] is True
        assert audit["hit_probe_label"] == "localhost"
        assert audit["snapshot_consistent"] is True
        json.dumps(audit)

    @pytest.mark.asyncio
    async def test_audit_agrees_when_scanner_stays_silent(self) -> None:
        def handler(url: str, n: int) -> httpx.Response:
            if "example.invalid" in url:
                return _make_response(CLEAN_BODY)
            # Every probe hits once, then fails its retest.
            return _make_response(AWS_BODY if n == 0 else CLEAN_BODY)

        client = TrackingClient(handler)
        findings = await _run_scanner(client, [_make_endpoint()])
        baseline_body, records = _build_snapshot(client)
        audit = audit_probe_snapshot(baseline_body, records)

        assert findings == []
        assert audit["should_report"] is False
        assert audit["hit_probe_label"] is None
        assert all(
            p["skip_reason"] == SKIP_RETEST_NO_HIT for p in audit["probes"]
        )
        assert audit["snapshot_consistent"] is True
