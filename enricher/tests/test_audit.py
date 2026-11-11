"""Tests for the pure-function audit module (app/audit.py).

Three families:

1. selector audit: the accept/reject decision and the canonical value must
   match validate_selector item by item, and the cache key must match the
   tuple main.py actually builds (including the strip/lower spelling that is
   deliberately NOT the canonical IP/CVE form);
2. HTTP audit: replayed against the REAL http_get_json on identical snapshots,
   so the attempt count, per-attempt timeout and final error class cannot
   drift from the loop they describe;
3. hygiene: every audit object round-trips through json.dumps, and no
   rejection reason ever carries the refused selector's text.

Nothing here opens a socket, spawns a binary or needs credentials: the real
loop is driven through a mocked urlopen and a synthetic clock, exactly like
test_http.py.
"""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from app import audit, config, main, tools
from app.audit import ERROR_OTHER, ERROR_RATE_LIMITED, ERROR_SUCCESS
from app.tools import (
    RETRYABLE_STATUS,
    SourceUnavailable,
    http_get_json,
    validate_selector,
)

# ── Selector audit: happy paths, item-by-item equality ────────────────────

POSITIVE_CASES = [
    # (stix_type, raw value, expected canonical, enricher)
    ("domain-name", "  Example.COM ", "example.com", "dig"),
    ("domain-name", "sub.domain.co.uk", "sub.domain.co.uk", "crtsh"),
    ("ipv4-addr", " 1.1.1.1 ", "1.1.1.1", "dig"),
    ("ipv6-addr", "2001:0DB8::0001", "2001:db8::1", "dig"),
    ("vulnerability", "cve-2024-3094", "CVE-2024-3094", "cve"),
]


@pytest.mark.parametrize("stix_type,value,canonical,enricher", POSITIVE_CASES)
def test_audit_selector_accepte_egalite_validate(stix_type, value, canonical, enricher):
    result = audit.audit_selector(stix_type, value, enricher)

    # the two sides agree on the decision...
    assert result["accepted"] is True
    assert validate_selector(stix_type, value) == canonical
    # ...and the audit's canonical value is the exact same string
    assert result["canonical_value"] == validate_selector(stix_type, value)
    assert result["rejection_reason"] is None
    assert result["validation_branch"] == stix_type


@pytest.mark.parametrize("stix_type,value,canonical,enricher", POSITIVE_CASES)
def test_cle_de_cache_identique_a_main_py(stix_type, value, canonical, enricher):
    result = audit.audit_selector(stix_type, value, enricher)

    # main.py line: key = (req.enricher, req.type, req.value.strip().lower())
    expected = [enricher, stix_type, value.strip().lower()]
    assert result["cache_key"] == expected

    # and the canonical value really can differ from the key's value element:
    # the cache keeps the ORIGINAL lowered spelling for IPs and CVEs
    if stix_type in ("ipv6-addr", "vulnerability"):
        assert result["cache_key"][2] != canonical


def test_cle_de_cache_vue_par_lapi(client, auth, monkeypatch):
    """End-to-end: the key main.py stores the response under IS the audit key."""
    # dig on an IPv6 reverse lookup with an empty answer: no binary, no network
    monkeypatch.setattr("app.enrichers.dig.run_tool", lambda *a, **k: "")
    body = {"enricher": "dig", "type": "ipv6-addr", "value": "  2001:0DB8::0001  "}
    assert client.post("/enrich", headers=auth, json=body).status_code == 200

    expected = audit.audit_selector("ipv6-addr", body["value"], "dig")["cache_key"]
    assert tuple(expected) in main._cache
    # and specifically NOT the canonical spelling
    assert ("dig", "ipv6-addr", "2001:db8::1") not in main._cache


def test_pas_denricher_pas_de_cle_mais_validation_complete():
    result = audit.audit_selector("domain-name", "example.com")
    assert result["accepted"] is True
    assert result["cache_key"] is None


# ── Selector audit: refusal paths, no selector text in the reason ─────────

NEGATIVE_CASES = [
    # IPv6 with an RFC 4007 scope id (the hardening test's exact vectors)
    ("ipv6-addr", "fe80::1%eth0"),
    ("ipv6-addr", "fe80::1%x\nbegin\nverbose\n1.1.1.1\nend"),
    ("ipv6-addr", "fe80::1%; ls"),
    # Unicode case folding that re.IGNORECASE (without re.ASCII) would accept.
    # Explicit escapes: an editor could normalise the literal glyphs.
    ("domain-name", "exa\u017fmple.com"),  # U+017F LONG S -> folds onto 's'
    ("domain-name", "\u212a.com"),  # U+212A KELVIN SIGN -> folds onto 'k'
    ("domain-name", "examp\u0131e.com"),  # U+0131 DOTLESS I -> folds onto 'i'
    # CVE written with Arabic-Indic digits: \d without re.ASCII would match
    ("vulnerability", "CVE-\u0662\u0660\u0662\u0663-\u0661\u0662\u0663\u0664"),
    ("vulnerability", "CVE-24-1"),
    ("vulnerability", "Log4Shell"),
    ("ipv4-addr", "not-an-ip"),
    ("domain-name", "not a domain at all"),
    ("malware", "anything"),
]


@pytest.mark.parametrize("stix_type,value", NEGATIVE_CASES)
def test_audit_refus_egalite_validate(stix_type, value):
    result = audit.audit_selector(stix_type, value, "dig")

    assert result["accepted"] is False
    assert result["canonical_value"] is None
    assert result["cache_key"] is None
    assert result["rejection_reason"]
    assert result["validation_branch"].startswith("rejected")
    # both sides refuse the same input
    with pytest.raises(tools.ToolError):
        validate_selector(stix_type, value)


@pytest.mark.parametrize("stix_type,value", NEGATIVE_CASES)
def test_raison_de_refus_ne_contient_pas_le_selecteur(stix_type, value):
    result = audit.audit_selector(stix_type, value, "dig")
    serialized = json.dumps(result)  # also proves JSON serialisability

    # No distinctive token of the refused selector may surface in any output
    # field. The reason templates may legitimately use generic vocabulary of
    # the rule itself ("domain", "not", "valid"...): those are not selector
    # fragments, so only tokens long enough to be identifying are checked.
    generic = {
        "domain",
        "value",
        "valid",
        "string",
        "not",
        "all",
        "the",
        "and",
        "for",
        "are",
    }
    fragments = {f for f in value.strip().split() if len(f) >= 3 and f not in generic}
    for fragment in fragments:
        assert fragment not in result["rejection_reason"]
        assert fragment not in serialized
    # multiline hostile payloads must not leak either of their lines whole
    for line in value.strip().splitlines():
        if len(line.strip()) >= 3:
            assert line.strip() not in serialized


def test_valeur_non_chainee_refusee_sans_exception():
    result = audit.audit_selector("domain-name", 12345, "dig")
    assert result["accepted"] is False
    assert result["canonical_value"] is None
    assert result["validation_branch"] == "rejected:non-string"
    json.dumps(result)


# ── HTTP audit: shared harness replaying the REAL loop ────────────────────


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
        return False


def _ok() -> _Resp:
    return _Resp(b"[]")


def _http_error(code: int, retry_after: str | None = None) -> urllib.error.HTTPError:
    # Same fixture convention as test_http.py: a plain dict stands in for the
    # response headers (http_get_json only calls .get() on it, which a dict
    # supports), fp=None. No real socket is involved anywhere.
    headers = {"Retry-After": retry_after} if retry_after is not None else {}
    return urllib.error.HTTPError("https://source.example/", code, "boom", headers, None)


def _observation(code_or_outcome, *, elapsed: float, retry_after: str | None = None):
    """Turn a test vector into both an audit observation and a real outcome."""
    if code_or_outcome == "success":
        return {"outcome": "success", "elapsed": elapsed}, _ok()
    if code_or_outcome == "timeout":
        return {"outcome": "timeout", "elapsed": elapsed}, TimeoutError("slow")
    if code_or_outcome == "connection":
        return (
            {"outcome": "connection-failed", "elapsed": elapsed},
            urllib.error.URLError("dns"),
        )
    if code_or_outcome == "unreadable":
        return (
            {"outcome": "unreadable-response", "elapsed": elapsed},
            _Resp(b"<html>not json</html>"),
        )
    obs = {
        "outcome": "http-status",
        "status": code_or_outcome,
        "elapsed": elapsed,
        "retry_after": retry_after,
    }
    return obs, _http_error(code_or_outcome, retry_after)


def _run_both_sides(monkeypatch, vectors, **kwargs):
    """Run audit_http and the real http_get_json on one identical snapshot.

    The real loop's clock is mocked to walk exactly the way the audit's
    synthetic clock does: each attempt costs its declared elapsed time and
    each backoff is the same min(2**(n-1), 8, remaining) the audit computes
    (sleep is patched to a no-op, so the clock alone marks the wait).
    """
    observations, outcomes = zip(*[_observation(v[0], elapsed=v[1], **v[2]) for v in vectors])
    snapshot = {"source": "src", "observations": list(observations), **kwargs}
    audit_result = audit.audit_http(snapshot)

    calls: list[int] = []
    state = {"clock": 0.0}

    def fake_monotonic():
        return state["clock"]

    def fake_sleep(seconds):
        state["clock"] += max(0.0, seconds)

    def fake_urlopen(_req, timeout=None):
        calls.append(timeout)
        index = len(calls) - 1
        state["clock"] += observations[index]["elapsed"]
        outcome = outcomes[index]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    monkeypatch.setattr(tools.time, "monotonic", fake_monotonic)
    monkeypatch.setattr(tools.time, "sleep", fake_sleep)
    monkeypatch.setattr(tools.urllib.request, "urlopen", fake_urlopen)

    raised = None
    try:
        http_get_json(
            "https://source.example/",
            source="src",
            timeout=kwargs.get("timeout", config.HTTP_TIMEOUT_SECONDS),
            budget=kwargs.get("budget", config.HTTP_BUDGET_SECONDS),
            attempts=kwargs.get("attempts", config.HTTP_MAX_ATTEMPTS),
            retry_status=frozenset(kwargs.get("retry_status", sorted(RETRYABLE_STATUS))),
        )
    except SourceUnavailable as exc:
        raised = exc

    return audit_result, calls, raised


def _assert_matches_real_loop(audit_result, calls, raised):
    # number of started attempts, and the per-attempt timeout of each one
    assert audit_result["attempts_made"] == len(calls)
    assert [a["timeout_seconds"] for a in audit_result["attempts"]] == calls

    if raised is None:
        assert audit_result["succeeded"] is True
        assert audit_result["error_class"] == ERROR_SUCCESS
        assert audit_result["message"] is None
    else:
        assert audit_result["succeeded"] is False
        assert audit_result["error_class"] in (ERROR_RATE_LIMITED, ERROR_OTHER)
        assert audit_result["message"] == str(raised)


# ── HTTP audit: ordinary retry behaviour ──────────────────────────────────


def test_succes_premier_coup(monkeypatch):
    result, calls, raised = _run_both_sides(monkeypatch, [("success", 1.0, {})])
    _assert_matches_real_loop(result, calls, raised)
    assert result["attempts_made"] == 1
    assert result["stopped_for_budget"] is False


def test_502_puis_503_puis_succes(monkeypatch):
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [(502, 0.2, {}), (503, 0.3, {}), ("success", 2.0, {})],
    )
    _assert_matches_real_loop(result, calls, raised)
    assert result["attempts_made"] == 3
    # backoff grows 1s then 2s (none reaches the 8s cap)
    assert [a["backoff_seconds"] for a in result["attempts"]] == [1.0, 2.0, 0.0]


def test_echecs_transitoires_tous_rejoues(monkeypatch):
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [
            ("timeout", 5.0, {}),
            ("connection", 0.5, {}),
            ("unreadable", 0.5, {}),
            ("success", 1.0, {}),
        ],
    )
    _assert_matches_real_loop(result, calls, raised)
    assert result["attempts_made"] == 4


def test_epuisement_du_plafond_dessais(monkeypatch):
    result, calls, raised = _run_both_sides(monkeypatch, [(502, 1.0, {})] * 4, attempts=4)
    _assert_matches_real_loop(result, calls, raised)
    assert raised is not None
    assert result["error_class"] == ERROR_OTHER
    assert "saturated" in result["message"]
    # the generic message reports the real tried count
    assert "4 attempt(s)" in result["message"]


def test_404_elargi_peut_etre_rejoue(monkeypatch):
    # crt.sh's bend: the caller widens retry_status with 404
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [(404, 0.2, {}), ("success", 1.0, {})],
        retry_status=sorted(RETRYABLE_STATUS | {404}),
    )
    _assert_matches_real_loop(result, calls, raised)
    assert 404 in result["retry_status"]
    assert result["attempts_made"] == 2


# ── HTTP audit: required boundary and rate-limit paths ────────────────────


def test_budget_insuffisant_pas_de_deuxieme_tentative(monkeypatch):
    # first attempt burns 59 s of a 60 s budget: the audit, like the real
    # loop, must see remaining <= 1 and never start attempt #2
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [(502, 59.0, {}), (502, 1.0, {}), (502, 1.0, {})],
        timeout=45,
        budget=60,
        attempts=4,
    )
    _assert_matches_real_loop(result, calls, raised)
    assert result["attempts_made"] == 1
    assert result["stopped_for_budget"] is True
    assert len(calls) == 1
    # the backoff itself is clamped to the 1 s that remains, and nothing
    # afterwards gets started
    assert result["attempts"][0]["backoff_seconds"] == 1.0


def test_statut_non_rejouable_un_seul_essai(monkeypatch):
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [(400, 0.3, {}), ("success", 1.0, {}), ("success", 1.0, {})],
        attempts=4,
    )
    _assert_matches_real_loop(result, calls, raised)
    assert result["attempts_made"] == 1
    assert raised is not None
    assert result["error_class"] == ERROR_OTHER
    assert "refused the request" in result["message"]
    # no backoff after an immediate failure
    assert result["attempts"][0]["backoff_seconds"] == 0.0


def test_429_avec_retry_after_classe_limite(monkeypatch):
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [
            (429, 0.2, {"retry_after": "22"}),
            (429, 0.2, {"retry_after": "22"}),
            (429, 0.2, {"retry_after": "22"}),
        ],
        attempts=3,
    )
    _assert_matches_real_loop(result, calls, raised)
    assert result["error_class"] == ERROR_RATE_LIMITED
    assert raised is not None
    # the required semantics: the refusal is cached on the SAME URL (~30 min),
    # retrying the same item is pointless, switching item will most likely work
    message = result["message"]
    assert "rate limit" in message
    assert "exact request" in message and "30 minutes" in message
    assert "Retrying the same item now will not help" in message
    assert "another one" in message
    # 429 keeps priority over the generic saturation wording
    assert "regularly saturated" not in message
    # Retry-After presence is part of the snapshot audit
    assert all(a["retry_after_present"] for a in result["attempts"])


def test_429_nu_sans_en_tete_suit_le_message_generique(monkeypatch):
    # Locks the subtle tools.py behaviour: rate_limited holds the HEADER
    # VALUE, not a boolean - a bare 429 ends on the saturated-source message.
    result, calls, raised = _run_both_sides(monkeypatch, [(429, 0.1, {})], attempts=1)
    _assert_matches_real_loop(result, calls, raised)
    assert result["error_class"] == ERROR_OTHER
    assert "regularly saturated" in result["message"]


def test_un_429_nu_final_ecrase_le_temoignage_dun_en_tete(monkeypatch):
    # tools.py re-assigns rate_limited on every 429: a final bare one
    # overwrites the earlier Retry-After value back to None. The audit must
    # reproduce that, surprising as it is, rather than "remember" the header.
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [
            (429, 0.2, {"retry_after": "22"}),
            (429, 0.2, {"retry_after": "22"}),
            (429, 0.2, {}),
        ],
        attempts=3,
    )
    _assert_matches_real_loop(result, calls, raised)
    assert result["error_class"] == ERROR_OTHER
    assert "regularly saturated" in result["message"]


def test_timeout_chaque_tentative_egale_min_timeout_restant(monkeypatch):
    # mirrors test_http.test_timeout_reduit_au_budget_restant: 45 s asked,
    # only 10 s of budget left on the second attempt -> timeout 10
    result, calls, raised = _run_both_sides(
        monkeypatch,
        [(502, 49.0, {}), ("success", 1.0, {})],
        timeout=45,
        budget=60,
        attempts=4,
    )
    _assert_matches_real_loop(result, calls, raised)
    # after 49 s of work and a 1 s backoff, 10 s remain: the second attempt's
    # timeout is min(45, 10) on both sides
    assert calls == [45, 10]
    assert [a["timeout_seconds"] for a in result["attempts"]] == [45, 10]


# ── Hygiene: JSON-only data, malformed snapshots, no I/O surface ──────────


def test_audit_http_est_json_serialisable(monkeypatch):
    result, _, _ = _run_both_sides(
        monkeypatch,
        [(503, 1.0, {}), ("timeout", 2.0, {}), ("success", 1.0, {})],
        attempts=3,
    )
    restored = json.loads(json.dumps(result))
    assert restored == result
    # no exception/request/function object could survive a JSON round-trip;
    # assert the numeric field types explicitly as well (ints stay ints, the
    # computed timings are plain numbers)
    for entry in result["attempts"]:
        assert isinstance(entry["timeout_seconds"], int)
        assert isinstance(entry["backoff_seconds"], (int, float))
        assert isinstance(entry["elapsed_seconds"], (int, float))


def test_snapshot_malforme_est_refuse_en_donnees():
    # wrong *type* of input -> TypeError; wrong *value* of a well-typed input
    # -> ValueError. Both stay plain built-in exceptions (JSON-friendly, never
    # an exception object placed inside an audit result).
    with pytest.raises(TypeError):
        audit.audit_http("not an object")
    with pytest.raises(TypeError):
        audit.audit_http({"observations": ["not an object"]})
    with pytest.raises(ValueError):
        audit.audit_http({"observations": []})
    with pytest.raises(ValueError):
        audit.audit_http(
            {"observations": [{"outcome": "http-status", "status": 200, "elapsed": 1}]}
        )
    with pytest.raises(ValueError):
        audit.audit_http({"observations": [{"outcome": "mystery", "elapsed": 1}]})
    with pytest.raises(ValueError):
        audit.audit_http({"observations": [{"outcome": "success", "elapsed": -1}]})
    with pytest.raises(ValueError):
        audit.audit_http({"observations": [{"outcome": "success", "elapsed": 1}], "budget": 0})


def test_pas_dimport_dependance_reseau_du_module():
    # the audit surface exposes only data and the two pure functions
    assert not hasattr(audit, "urllib")
    assert not hasattr(audit, "subprocess")
    assert callable(audit.audit_selector)
    assert callable(audit.audit_http)
