"""Pure, reusable audit logic for SSRF differential evidence.

This module performs **no I/O** and holds **no scanner state**. It replays
the SSRFScanner decision procedure over a recorded snapshot of one
parameter-probe session (one baseline body + an ordered list of probe
records) and reports whether the scanner would have reported a finding,
which probe produced it, and why every other probe was skipped.

The scanner (:mod:`isitsecure.engine.scanners.ssrf_scanner`) uses the same
helper functions (:func:`status_in_range`, :func:`response_indicates_ssrf`)
for its live decisions, so an audit over a faithfully recorded snapshot
always reaches the same report/no-report conclusion as the scanner did.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from isitsecure.engine.constants import SSRFConfig

# Status window a probe response must fall into to be considered at all.
# Mirrors SSRFScanner.HTTP_STATUS_OK_LOWER / HTTP_STATUS_OK_UPPER.
HTTP_STATUS_OK_LOWER = 200
HTTP_STATUS_OK_UPPER = 400

# Skip reasons emitted per probe (stable strings, safe to assert on).
SKIP_STATUS_OUT_OF_RANGE = "status_code_out_of_range"
SKIP_FIRST_PROBE_NO_HIT = "first_probe_no_hit"
SKIP_RETEST_NOT_PERFORMED = "retest_not_performed"
SKIP_RETEST_NO_HIT = "retest_no_hit"
SKIP_NOT_EVALUATED = "not_evaluated_after_confirmed_hit"


def status_in_range(status_code: int) -> bool:
    """Whether a response status code falls in the [200, 400) window."""
    return HTTP_STATUS_OK_LOWER <= status_code < HTTP_STATUS_OK_UPPER


def indicators_present(text: str) -> list[str]:
    """SSRF success indicators (from SSRFConfig) present in ``text``."""
    text_lower = text.lower()
    return [
        ind for ind in SSRFConfig.SSRF_SUCCESS_INDICATORS
        if ind.lower() in text_lower
    ]


def baseline_indicators(baseline_body: str) -> list[str]:
    """Indicators already present in the baseline body.

    These can never count as differential evidence: a probe response that
    only shows indicators the benign baseline also shows proves nothing.
    """
    return indicators_present(baseline_body)


def response_indicates_ssrf(body: str, baseline: str = "") -> bool:
    """Differential check: an indicator appears in ``body`` but not baseline."""
    body_lower = body.lower()
    baseline_lower = baseline.lower()
    return any(
        ind.lower() in body_lower and ind.lower() not in baseline_lower
        for ind in SSRFConfig.SSRF_SUCCESS_INDICATORS
    )


@dataclass(frozen=True)
class ProbeRecord:
    """Recorded snapshot of one probe against one parameter.

    Attributes:
        probe_url: The injected SSRF probe URL.
        probe_label: Human label for the probe (e.g. ``aws_metadata``).
        status_code: Status code of the first (primary) probe response.
        body: Body of the first (primary) probe response.
        first_hit: Whether the scanner judged the first response a hit
            (status in range + differential indicator present).
        retest_hit: Whether the confirmation retest (same URL, same method)
            was also judged a hit. ``None`` means no retest was performed
            (the scanner only retests after a first hit).
    """

    probe_url: str
    probe_label: str
    status_code: int
    body: str
    first_hit: bool
    retest_hit: bool | None = None


def audit_probe_snapshot(
    baseline_body: str,
    probe_records: list[ProbeRecord],
) -> dict[str, Any]:
    """Replay the scanner's decision procedure over a recorded snapshot.

    Args:
        baseline_body: Body fetched once with the benign baseline URL.
        probe_records: Ordered probe records, in SSRFConfig.SSRF_PROBES order.

    Returns:
        A JSON-serializable dict with:

        - ``should_report``: whether the scanner would emit a finding.
        - ``hit_probe_label`` / ``hit_probe_url``: the confirmed probe, if any.
        - ``baseline_indicators``: indicators already in the baseline body
          (these explain why a matching probe body is *not* differential).
        - ``probes``: per-probe replay entries, each with the first-test and
          retest judgments and a ``skip_reason`` when the probe did not
          produce the finding.
        - ``snapshot_consistent``: False if any recorded ``first_hit`` flag
          disagrees with recomputing it from the recorded body vs. baseline
          (i.e. the snapshot does not faithfully reflect the scanner's rules).
    """
    baseline_hits = baseline_indicators(baseline_body)

    probes_out: list[dict[str, Any]] = []
    should_report = False
    hit_probe_label: str | None = None
    hit_probe_url: str | None = None
    snapshot_consistent = True

    for rec in probe_records:
        in_range = status_in_range(rec.status_code)
        recomputed_first = (
            response_indicates_ssrf(rec.body, baseline_body) if in_range else False
        )
        if in_range and recomputed_first != rec.first_hit:
            snapshot_consistent = False

        entry: dict[str, Any] = {
            "probe_url": rec.probe_url,
            "probe_label": rec.probe_label,
            "status_in_range": in_range,
            "first_hit": rec.first_hit if in_range else None,
            "first_hit_recomputed": recomputed_first if in_range else None,
            "retest_hit": rec.retest_hit if (in_range and rec.first_hit) else None,
            "skip_reason": None,
            "confirmed": False,
        }

        if should_report:
            # The scanner breaks after the first confirmed finding, so later
            # probes were never evaluated.
            entry["first_hit"] = None
            entry["first_hit_recomputed"] = None
            entry["retest_hit"] = None
            entry["skip_reason"] = SKIP_NOT_EVALUATED
        elif not in_range:
            entry["skip_reason"] = SKIP_STATUS_OUT_OF_RANGE
        elif not rec.first_hit:
            entry["skip_reason"] = SKIP_FIRST_PROBE_NO_HIT
        elif rec.retest_hit is None:
            # First hit but no confirmation retest recorded: the scanner
            # always retests after a first hit, so this snapshot is incomplete.
            snapshot_consistent = False
            entry["skip_reason"] = SKIP_RETEST_NOT_PERFORMED
        elif not rec.retest_hit:
            entry["skip_reason"] = SKIP_RETEST_NO_HIT
        else:
            entry["confirmed"] = True
            should_report = True
            hit_probe_label = rec.probe_label
            hit_probe_url = rec.probe_url

        probes_out.append(entry)

    return {
        "should_report": should_report,
        "hit_probe_label": hit_probe_label,
        "hit_probe_url": hit_probe_url,
        "baseline_indicators": baseline_hits,
        "probes": probes_out,
        "snapshot_consistent": snapshot_consistent,
    }
