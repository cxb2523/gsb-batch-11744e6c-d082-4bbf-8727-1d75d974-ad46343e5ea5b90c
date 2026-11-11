"""Pure-function audit of selector validation and of the HTTP retry loop.

This module is a read-only *observer* of the rules implemented in tools.py and
main.py. From plain data it re-derives what :func:`app.tools.validate_selector`
and :func:`app.tools.http_get_json` would do with the same input, without
spawning a process, opening a socket or writing a selector anywhere. Every
value it returns is built only from JSON-friendly types (str, int, float,
bool, None, list, dict), so the whole result survives ``json.dumps``.

Two entry points:

* :func:`audit_selector` mirrors ``validate_selector`` (same accept/reject
  decision and the same canonical value) and, when the selector is accepted,
  reproduces the cache-key tuple built in ``main.py``:
  ``(enricher, type, value.strip().lower())``.
* :func:`audit_http` replays the bounded retry loop of ``http_get_json`` from
  a pure-data snapshot of the attempts that *would* happen: per-attempt status
  code or failure category, presence of a ``Retry-After`` header, elapsed time,
  plus the timeout, budget, attempt cap and the retryable-status set.

The refused selector is never copied into an output field. Like
``validate_selector``'s own error message, rejection reasons name the rule
that failed and the STIX type, never the offending text (the "zero selector
logging" promise of config.py).
"""

from __future__ import annotations

import ipaddress
from typing import Any

from app import config
from app.tools import RETRYABLE_STATUS, ToolError, validate_selector

__all__ = [
    "ERROR_OTHER",
    "ERROR_RATE_LIMITED",
    "ERROR_SUCCESS",
    "audit_http",
    "audit_selector",
]

# ── Stable branch names (part of the audit contract) ──────────────────────
BRANCH_DOMAIN = "domain-name"
BRANCH_IPV4 = "ipv4-addr"
BRANCH_IPV6 = "ipv6-addr"
BRANCH_VULNERABILITY = "vulnerability"
BRANCH_UNKNOWN_TYPE = "rejected:unknown-type"
BRANCH_NON_STRING = "rejected:non-string"

# ── Final error classes, coarser than Python exceptions on purpose ────────
ERROR_SUCCESS = "success"
ERROR_RATE_LIMITED = "source-unavailable-rate-limited"
ERROR_OTHER = "source-unavailable-other"

# Outcome labels accepted inside an HTTP attempt snapshot.
_OUTCOME_SUCCESS = "success"
_OUTCOME_HTTP_STATUS = "http-status"
_OUTCOME_TIMEOUT = "timeout"
_OUTCOME_CONNECTION_FAILED = "connection-failed"
_OUTCOME_UNREADABLE = "unreadable-response"
_KNOWN_OUTCOMES = frozenset(
    {
        _OUTCOME_SUCCESS,
        _OUTCOME_HTTP_STATUS,
        _OUTCOME_TIMEOUT,
        _OUTCOME_CONNECTION_FAILED,
        _OUTCOME_UNREADABLE,
    }
)


def audit_selector(stix_type: str, value: Any, enricher: str | None = None) -> dict[str, Any]:
    """Audit one selector against ``validate_selector``'s rules.

    Returns a JSON-friendly dict with:

    * ``accepted``: whether ``validate_selector`` would accept it;
    * ``canonical_value``: the cleaned value the tool would use, or ``None``
      on rejection;
    * ``validation_branch``: the exact validation branch that was hit;
    * ``rejection_reason``: a human-readable, selector-free reason, or
      ``None`` when accepted;
    * ``cache_key``: the ``[enricher, type, stripped-lowercased-value]``
      triple the selector would get in main.py's cache, or ``None`` when no
      enricher is supplied or the selector was rejected.

    ``enricher`` is optional because validation itself does not depend on it;
    the cache key cannot be built without it, mirroring main.py where the key
    only exists inside an ``/enrich`` call.
    """
    if not isinstance(value, str):
        # The Pydantic schema guarantees a str upstream; the audit stays total
        # anyway instead of letting AttributeError escape.
        return {
            "stix_type": stix_type,
            "enricher": enricher,
            "accepted": False,
            "canonical_value": None,
            "validation_branch": BRANCH_NON_STRING,
            "rejection_reason": "selector value must be a string",
            "cache_key": None,
        }

    stripped = value.strip()
    try:
        # Calling the real validator is the strongest possible guarantee that
        # the audit's accept/reject decision and canonical value cannot drift:
        # validate_selector is pure (strip, regex, ipaddress), so this does no
        # I/O and spawns nothing.
        canonical = validate_selector(stix_type, value)
    except ToolError:
        branch, reason = _rejection_branch(stix_type, stripped)
        return {
            "stix_type": stix_type,
            "enricher": enricher,
            "accepted": False,
            "canonical_value": None,
            "validation_branch": branch,
            "rejection_reason": reason,
            "cache_key": None,
        }

    cache_key = [enricher, stix_type, stripped.lower()] if enricher is not None else None
    return {
        "stix_type": stix_type,
        "enricher": enricher,
        "accepted": True,
        "canonical_value": canonical,
        "validation_branch": stix_type,
        "rejection_reason": None,
        # NB: main.py keys on strip().lower() of the ORIGINAL value, not on the
        # canonical form - "2001:0DB8::0001" and "CVE-2024-3094" therefore keep
        # their lowered original spelling in the third element.
        "cache_key": cache_key,
    }


def _rejection_branch(stix_type: str, stripped: str) -> tuple[str, str]:
    """Name the failing branch and a selector-free reason for a rejection."""
    if stix_type == BRANCH_DOMAIN:
        return (
            f"rejected:{BRANCH_DOMAIN}",
            "value is not an ASCII domain name (letters, digits, hyphens, dots)",
        )
    if stix_type in (BRANCH_IPV4, BRANCH_IPV6):
        try:
            addr = ipaddress.ip_address(stripped)
        except ValueError:
            return (
                f"rejected:{stix_type}",
                "value is not a valid literal IP address",
            )
        if getattr(addr, "scope_id", None) is not None:
            # Same rule as tools.is_ip: an RFC 4007 scope id is local-only and
            # was a protocol-injection vector, never just odd formatting.
            return (
                f"rejected:{stix_type}",
                (
                    "IP address carries an RFC 4007 scope id, which is not "
                    "allowed for a CTI selector"
                ),
            )
        return (
            f"rejected:{stix_type}",
            "value is not a valid literal IP address",
        )
    if stix_type == BRANCH_VULNERABILITY:
        return (
            f"rejected:{BRANCH_VULNERABILITY}",
            (
                "expected CVE-YYYY-NNNN with four ASCII digits in the year and "
                "at least four ASCII digits in the sequence"
            ),
        )
    return (
        BRANCH_UNKNOWN_TYPE,
        f"no validation rule is registered for STIX type {stix_type}",
    )


def audit_http(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Replay what ``http_get_json`` would do, from a pure-data snapshot.

    ``snapshot`` keys:

    * ``timeout``: per-attempt timeout cap (defaults to the configured one);
    * ``budget``: total time budget in seconds (defaults to the configured one);
    * ``attempts``: maximum number of attempts (defaults to the configured one);
    * ``retry_status``: list of HTTP status codes worth retrying (defaults to
      :data:`app.tools.RETRYABLE_STATUS`, callers may widen it, e.g. crt.sh's
      404);
    * ``source``: label used in the human-readable messages;
    * ``observations``: one ordered entry per attempt that could be started:
      - ``{"outcome": "success", "elapsed": <seconds>}``;
      - ``{"outcome": "http-status", "status": <int>,
        "retry_after": <str|None>, "elapsed": <seconds>}``;
      - ``{"outcome": "timeout"|"connection-failed"|"unreadable-response",
        "elapsed": <seconds>}``.

    The replay drives a synthetic clock (elapsed times plus the same
    ``min(2**(n-1), 8, remaining-budget)`` backoff as tools._backoff), so the
    budget-cut decisions are identical to the real loop's. Nothing here
    performs I/O.
    """
    timeout, budget, attempts, retry_status, source, observations = _parse_snapshot(snapshot)

    # Synthetic wall clock: http_get_json starts with deadline = now + budget,
    # so anchoring the clock at 0.0 makes deadline == budget.
    clock = 0.0
    made: list[dict[str, Any]] = []
    # Mirror tools.py exactly: this is NOT a boolean. The real code stores the
    # Retry-After header value, so a 429 WITHOUT that header leaves it None
    # and the generic saturation message wins at the end.
    rate_limited: str | None = None
    last = "no response"
    succeeded = False
    stopped_for_budget = False
    error_class = ERROR_OTHER
    message: str | None = None

    for attempt in range(1, attempts + 1):
        remaining = budget - clock
        # tools.py: "if remaining <= 1: break" - never start a try the budget
        # could not carry to completion.
        if remaining <= 1:
            stopped_for_budget = True
            break
        if attempt - 1 >= len(observations):
            raise ValueError(
                f"http audit snapshot describes only {len(observations)} "
                f"attempt(s) but attempt {attempt} would be started"
            )
        obs = observations[attempt - 1]
        elapsed = float(obs["elapsed"])
        attempt_timeout = min(timeout, int(remaining))
        entry: dict[str, Any] = {
            "attempt": attempt,
            "timeout_seconds": attempt_timeout,
            "outcome": obs["outcome"],
            "status": obs.get("status"),
            "retry_after_present": bool(obs.get("retry_after")),
            "elapsed_seconds": elapsed,
            "backoff_seconds": 0.0,
        }
        made.append(entry)
        clock += elapsed

        outcome = obs["outcome"]
        if outcome == _OUTCOME_SUCCESS:
            succeeded = True
            error_class = ERROR_SUCCESS
            break

        if outcome == _OUTCOME_HTTP_STATUS:
            status = int(obs["status"])
            last = f"HTTP {status}"
            if status == 429:
                # Re-assigned on EVERY 429, exactly like tools.http_get_json:
                # a later bare 429 (no Retry-After) therefore overwrites an
                # earlier header value back to None, and the generic
                # saturated-source ending wins. Not a boolean, not sticky.
                rate_limited = str(obs["retry_after"]) if obs.get("retry_after") else None
            if status not in retry_status:
                # Non-retryable code: raised immediately, no backoff, one try.
                error_class = ERROR_OTHER
                message = f"{source} refused the request ({last})."
                break
        elif outcome == _OUTCOME_TIMEOUT:
            last = "timed out"
        elif outcome == _OUTCOME_CONNECTION_FAILED:
            last = "connection failed"
        else:  # _OUTCOME_UNREADABLE
            last = "unreadable response"

        # Same backoff formula as tools._backoff, bounded by what is left.
        delay = min(2 ** (attempt - 1), 8)
        backoff = max(0.0, min(delay, budget - clock))
        entry["backoff_seconds"] = backoff
        clock += backoff

    if not succeeded and message is None:
        # The loop ran out (attempt cap or budget): pick the ending message.
        if rate_limited:
            # 429 wins over the generic saturation wording, exactly like
            # http_get_json: the refusal is cached ~30 min on the exact URL,
            # so retrying the same item is pointless and another item will
            # most likely go through.
            error_class = ERROR_RATE_LIMITED
            # Worded identically to tools.http_get_json so the audit's message
            # can be compared byte for byte with the real exception: the
            # refusal is cached ~30 min on the exact request URL, so retrying
            # the same item is pointless and another item will most likely go
            # through.
            message = (
                f"{source} refused with a rate limit, and caches that refusal "
                "for about 30 minutes on this exact request. Retrying the same "
                "item now will not help; another one will most likely work."
            )
        else:
            error_class = ERROR_OTHER
            message = (
                f"{source} did not answer after {len(made)} attempt(s) in "
                f"{budget}s ({last}). This source is regularly saturated: "
                "try again in a few minutes."
            )

    return {
        "source": source,
        "timeout": timeout,
        "budget": budget,
        "attempts_planned": attempts,
        "retry_status": sorted(retry_status),
        "attempts_made": len(made),
        "attempts": made,
        "stopped_for_budget": stopped_for_budget,
        "succeeded": succeeded,
        "error_class": error_class,
        "message": message,
    }


def _parse_snapshot(
    snapshot: dict[str, Any],
) -> tuple[int, int, int, frozenset[int], str, list[dict[str, Any]]]:
    if not isinstance(snapshot, dict):
        raise TypeError("http audit snapshot must be an object")

    timeout = _positive_int(snapshot, "timeout", config.HTTP_TIMEOUT_SECONDS)
    budget = _positive_int(snapshot, "budget", config.HTTP_BUDGET_SECONDS)
    attempts = _positive_int(snapshot, "attempts", config.HTTP_MAX_ATTEMPTS)
    source = str(snapshot.get("source") or "source")

    raw_status = snapshot.get("retry_status", RETRYABLE_STATUS)
    try:
        retry_status = frozenset(int(code) for code in raw_status)
    except (TypeError, ValueError) as exc:
        raise ValueError("retry_status must be a list of integer codes") from exc

    observations = snapshot.get("observations")
    if not isinstance(observations, list) or not observations:
        raise ValueError("snapshot must carry a non-empty list of observations")
    for index, obs in enumerate(observations):
        if not isinstance(obs, dict):
            raise TypeError(f"observation {index} must be an object")
        outcome = obs.get("outcome")
        if outcome not in _KNOWN_OUTCOMES:
            raise ValueError(
                f"observation {index}: unknown outcome {outcome!r}; expected one "
                f"of {sorted(_KNOWN_OUTCOMES)}"
            )
        if not isinstance(obs.get("elapsed"), (int, float)) or obs["elapsed"] < 0:
            raise ValueError(f"observation {index}: elapsed must be a non-negative number")
        if outcome == _OUTCOME_HTTP_STATUS:
            status = obs.get("status")
            if not isinstance(status, int) or status < 400:
                # A 2xx never raises HTTPError in urllib: model it as "success".
                raise ValueError(
                    f"observation {index}: an http-status observation needs an "
                    "HTTP error status code (>= 400)"
                )
    return timeout, budget, attempts, retry_status, source, observations


def _positive_int(snapshot: dict[str, Any], key: str, default: int) -> int:
    value = snapshot.get(key, default)
    if not isinstance(value, int) or value < 1:
        raise ValueError(f"{key} must be a positive integer")
    return value
