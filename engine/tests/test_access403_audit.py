"""Tests for the attribution & verdict-chain audit (audit_verdict).

Layers:
  * pure unit tests — gate order, pass/fail/cap semantics, and a
    consistency sweep proving audit_verdict agrees with
    classify_outcome on classification and confidence for every input;
  * record integration — records produced by a validation run against
    the local mock application (tests/mock_acl_app.py) carry the audit
    field with a backwards-compatible default;
  * HTML — the record detail section renders the gate list and never
    leaks cookie / Authorization / token values.

Run:  python3 -m unittest discover -s tests -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_acl_app as mock                       # noqa: E402
from wscan import access403                       # noqa: E402
from wscan.client import Resp                     # noqa: E402

MARKER = mock.MARKER


def R(status, body="", headers=None, url="http://t/x"):
    h = {k.lower(): v for k, v in (headers or {}).items()}
    return Resp(status, h, list((headers or {}).items()), body, url,
                0.1, "GET /x HTTP/1.1")


def full(**over):
    """A verdict input that satisfies every gate (bypass_verified)."""
    kw = dict(resp=R(200, "real resource content"), base_status=403,
              proof=True, marker=True, guard_ok=True, verify_fetches=3,
              verify_matches=3, fingerprint_match=True,
              policy_expected="deny")
    kw.update(over)
    return kw


def gate(audit, name):
    return next(g for g in audit["gates"] if g["name"] == name)


class AuditGateTests(unittest.TestCase):
    def test_happy_path_all_gates_pass_and_match_classifier(self):
        a = access403.audit_verdict(**full())
        c = access403.classify_outcome(**full())
        self.assertEqual(a["classification"], "bypass_verified")
        self.assertEqual(a["classification"], c[0])
        self.assertEqual(a["confidence"], c[2])
        self.assertEqual(a["severity"], c[1])
        self.assertEqual([g["name"] for g in a["gates"]],
                         ["response_received", "method_proof_allowed",
                          "fingerprint_match", "marker_present",
                          "protected_baseline", "catch_all_guard",
                          "reproducibility_3of3"])
        self.assertTrue(all(g["passed"] for g in a["gates"]))
        self.assertTrue(all(g["cap"] is None for g in a["gates"]))
        # attribution of a plain application answer
        self.assertEqual(a["layer"], "application")
        self.assertIn("vendor", a)

    def test_no_response_caps_inconclusive(self):
        a = access403.audit_verdict(resp=None, base_status=403,
                                    proof=True)
        self.assertEqual(a["classification"], "inconclusive")
        g = gate(a, "response_received")
        self.assertFalse(g["passed"])
        self.assertEqual(g["cap"], "inconclusive")
        self.assertTrue(all(x["passed"] is None
                            for x in a["gates"][1:]))

    def test_fingerprint_mismatch_caps_misconfig_suspected(self):
        a = access403.audit_verdict(**full(fingerprint_match=False))
        c = access403.classify_outcome(**full(fingerprint_match=False))
        self.assertEqual(a["classification"], "misconfig_suspected")
        self.assertEqual((a["classification"], a["confidence"]),
                         (c[0], c[2]))
        g = gate(a, "fingerprint_match")
        self.assertFalse(g["passed"])
        self.assertEqual(g["cap"], "misconfig_suspected")
        # the chain short-circuits: later gates were never reached
        self.assertIsNone(gate(a, "marker_present")["passed"])
        self.assertIsNone(gate(a, "reproducibility_3of3")["passed"])

    def test_marker_absent_caps_misconfig_suspected(self):
        a = access403.audit_verdict(**full(marker=False))
        self.assertEqual(a["classification"], "misconfig_suspected")
        g = gate(a, "marker_present")
        self.assertFalse(g["passed"])
        self.assertEqual(g["cap"], "misconfig_suspected")

    def test_head_gate_forces_proof_false(self):
        a = access403.audit_verdict(**full(method="HEAD"))
        c = access403.classify_outcome(**full(method="HEAD"))
        self.assertEqual((a["classification"], a["confidence"]),
                         (c[0], c[2]))
        self.assertNotEqual(a["classification"], "bypass_verified")
        self.assertNotEqual(a["classification"], "weakness_verified")
        g = gate(a, "method_proof_allowed")
        self.assertFalse(g["passed"])
        self.assertIn("proof", g["detail"].lower())
        self.assertIn("false", g["detail"].lower())
        # with proof forced off, the content-proof gates are n/a
        self.assertTrue(all(x["passed"] is None
                            for x in a["gates"][2:]))

    def test_never_protected_caps_technique_but_not_identity(self):
        t = access403.audit_verdict(**full(never_protected=True))
        tc = access403.classify_outcome(**full(never_protected=True))
        self.assertEqual(t["classification"], "misconfig_suspected")
        self.assertEqual((t["classification"], t["confidence"]),
                         (tc[0], tc[2]))
        g = gate(t, "protected_baseline")
        self.assertFalse(g["passed"])
        self.assertEqual(g["cap"], "misconfig_suspected")
        i = access403.audit_verdict(**full(never_protected=True,
                                           kind="identity",
                                           test_type="auth-state"))
        ic = access403.classify_outcome(**full(never_protected=True,
                                               kind="identity",
                                               test_type="auth-state"))
        self.assertEqual(i["classification"], "weakness_verified")
        self.assertEqual((i["classification"], i["confidence"]),
                         (ic[0], ic[2]))
        gi = gate(i, "protected_baseline")
        self.assertTrue(gi["passed"])
        self.assertIn("WEAKNESS", gi["detail"])

    def test_guard_failure_caps_bypass_candidate(self):
        a = access403.audit_verdict(**full(guard_ok=False))
        self.assertEqual(a["classification"], "bypass_candidate")
        g = gate(a, "catch_all_guard")
        self.assertFalse(g["passed"])
        self.assertEqual(g["cap"], "bypass_candidate")

    def test_reproduction_short_of_3of3(self):
        a2 = access403.audit_verdict(**full(verify_matches=2))
        self.assertEqual(a2["classification"], "bypass_candidate")
        g2 = gate(a2, "reproducibility_3of3")
        self.assertFalse(g2["passed"])
        self.assertEqual(g2["cap"], "bypass_candidate")
        a1 = access403.audit_verdict(**full(verify_matches=1))
        self.assertEqual(a1["classification"], "misconfig_suspected")
        g1 = gate(a1, "reproducibility_3of3")
        self.assertFalse(g1["passed"])
        self.assertEqual(g1["cap"], "misconfig_suspected")

    def test_consistency_sweep_matches_classifier(self):
        """classification + confidence must equal classify_outcome
        for every combination, verified or not."""
        cases = [
            {},
            {"resp": None},
            {"method": "HEAD"},
            {"proof": False, "proof_why": "a login wall"},
            {"proof": False, "proof_why": "empty body"},
            {"proof": False, "proof_why": "the site's soft-404 page"},
            {"proof": False, "proof_why": "not the protected content"},
            {"fingerprint_match": False},
            {"marker": False},
            {"never_protected": True},
            {"never_protected": True, "kind": "identity",
             "test_type": "auth-state"},
            {"never_protected": True, "kind": "identity",
             "test_type": "auth-context"},
            {"guard_ok": False},
            {"verify_matches": 2},
            {"verify_matches": 1},
            {"verify_fetches": 2, "verify_matches": 2},
            {"kind": "identity"},
            {"policy_expected": "allow"},
            {"resp": R(403, "plain application denial"), "proof": False},
            {"resp": R(401, "", {"WWW-Authenticate": "Basic"}),
             "proof": False},
            {"resp": R(500, "boom"), "proof": False},
            {"resp": R(404, "nope"), "proof": False},
            {"resp": R(302, "", {"Location": "/login"}), "proof": False},
        ]
        for over in cases:
            kw = full(**over)
            a = access403.audit_verdict(**kw)
            c = access403.classify_outcome(**kw)
            self.assertEqual((a["classification"], a["confidence"]),
                             (c[0], c[2]),
                             f"audit/classifier mismatch for {over}")


class AuditRecordIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv, cls.base = mock.serve(mock.MockAclHandler)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def run_val(self, urls, **val):
        val.setdefault("role_a_cookie", "session=rolea")
        val.setdefault("role_b_cookie", "session=roleb")
        val.setdefault("marker", MARKER)
        return access403.analyze(
            urls, {"mode": "validation", "validation": val,
                   "concurrency": 1, "max_requests": 1500,
                   "min_interval_ms": 0})

    def test_every_record_carries_audit_field(self):
        run = self.run_val([self.base + "/canary"])
        self.assertTrue(run["records"])
        for r in run["records"]:
            self.assertIn("audit", r)   # defaulted field, always present
        judged = [r for r in run["records"] if r["audit"]]
        self.assertTrue(judged, "judged records must carry an audit")
        for r in judged:
            self.assertEqual(r["audit"]["classification"],
                             r["classification"])
            self.assertEqual(r["audit"]["confidence"], r["confidence"])
            self.assertEqual(len(r["audit"]["gates"]), 7)

    def test_verified_record_audit_all_gates_pass(self):
        run = self.run_val([self.base + "/canary"])
        ver = [r for r in run["records"]
               if r["classification"] == "bypass_verified"]
        self.assertTrue(ver)
        for r in ver:
            self.assertTrue(all(g["passed"]
                                for g in r["audit"]["gates"]))

    def test_html_renders_gates_without_leaking_cookie(self):
        run = self.run_val([self.base + "/canary"],
                           role_a_cookie="session=topsecretvalue")
        page = access403.to_html(run)
        self.assertIn("Verdict audit", page)
        self.assertIn("reproducibility_3of3", page)
        self.assertIn("protected_baseline", page)
        self.assertIn("Cap when failed", page)
        self.assertNotIn("topsecretvalue", page)


class AuditHtmlUnitTests(unittest.TestCase):
    def _run_with_record(self, rec):
        return {"module": "access403", "version": "3.14",
                "mode": "validation", "started_at": "now",
                "targets": ["http://t/x"], "profiles": [],
                "records": [rec],
                "summary": {rec["classification"]: 1},
                "rollup": {k: 0 for k in access403.ROLLUP},
                "requests_used": 1, "deduped_tests": 0,
                "stopped": False, "options": {}, "log": []}

    def _record(self, audit):
        return {"url": "http://t/x", "type": "method",
                "technique": "HEAD instead of GET", "group": "methods",
                "mode": "validation", "identity": "anon",
                "hypothesis": "", "expected": "",
                "original": access403._snapshot(None),
                "test": access403._snapshot(None),
                "similarity": None, "comparison": {},
                "layer": "", "vendor": "", "request_ids": {},
                "f5": None, "verify": {}, "fingerprint_match": None,
                "classification": "misconfig_suspected",
                "class_label": access403.CLASS_LABELS[
                    "misconfig_suspected"],
                "severity": "Low", "confidence": "LIKELY",
                "evidence": "synthetic", "reason": "", "policy": {},
                "about": "", "remediation": "none",
                "checked_at": "now", "audit": audit}

    def test_html_shows_gate_details_for_handbuilt_record(self):
        audit = access403.audit_verdict(
            **full(method="HEAD"))
        page = access403.to_html(self._run_with_record(
            self._record(audit)))
        self.assertIn("Verdict audit", page)
        self.assertIn("method_proof_allowed", page)
        self.assertIn("fail", page)

    def test_html_redacts_sensitive_values_in_audit(self):
        audit = access403.audit_verdict(**full())
        # simulate a gate detail that somehow captured a credential —
        # the renderer must mask it like every other snapshot
        audit["gates"][0]["detail"] = \
            "cookie session=topsecretvalue seen; Authorization: " \
            "Bearer abcdef123456"
        audit["vendor"] = "token=zzz999 vendor"
        page = access403.to_html(self._run_with_record(
            self._record(audit)))
        self.assertIn("Verdict audit", page)
        self.assertNotIn("topsecretvalue", page)
        self.assertNotIn("abcdef123456", page)
        self.assertNotIn("zzz999", page)

    def test_record_without_audit_still_renders(self):
        page = access403.to_html(self._run_with_record(
            self._record(None)))
        self.assertIn("ACCESS_CONTROL_MISCONFIGURATION_SUSPECTED", page)


if __name__ == "__main__":
    unittest.main()
