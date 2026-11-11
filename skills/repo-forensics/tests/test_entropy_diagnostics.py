"""Tests for entropy_diagnostics.py - pure diagnostic mirror of scan_entropy.

All fixtures are local and synthetic: no network, no real credentials.
The consistency contract under test: for the same text + rel_path, the
diagnostic's visible findings equal scan_entropy.scan_file's own findings
(scanner == "entropy") item by item, and the diagnostic's exemption verdicts
match scan_entropy's private predicates on the same inputs.
"""

import base64
import hashlib
import json

import scan_entropy as scanner
import entropy_diagnostics as diag


def _scan_visible(findings):
    """scan_file findings emitted by scan_entropy itself (not scan_decode)."""
    return [(f.title, f.line, f.severity, f.category)
            for f in findings if f.scanner == "entropy"]


def _diag_visible(result):
    return [(f["title"], f["line"], f["severity"], f["category"])
            for f in result["visible_findings"]]


def _assert_parity(result, tmp_path, name, content):
    f = tmp_path / name
    f.write_text(content)
    real = scanner.scan_file(str(f), name)
    assert _diag_visible(result) == _scan_visible(real)
    return real


# A benign base64 blob in the 50-79 char band: routed to decode but under the
# 80-char visible "Base64 Encoded Block" gate.
_BENIGN_SHORT = base64.b64encode(
    b'the quick brown fox jumps over the lazy dog today'
).decode()


class TestShortBase64Routing:
    def test_50_to_79_char_base64_is_routed_only(self, tmp_path):
        assert 50 <= len(_BENIGN_SHORT) < 80, "fixture must be in the 50-79 band"
        content = 'x = "%s"\n' % _BENIGN_SHORT
        result = diag.diagnose_text(content, "short.txt")

        assert result["status"] == "ok"
        # The blob IS detected and routed to decode...
        assert result["routing"]["routed_blob_count"] >= 1
        assert any(_BENIGN_SHORT[:60] in b["preview"]
                   for b in result["routing"]["routed_blobs"])
        # ...but produces NO visible Base64 Encoded Block finding.
        titles = [f["title"] for f in result["visible_findings"]]
        assert "Base64 Encoded Block" not in titles
        # The line is flagged as a base64 block hit, decode-only.
        line1 = result["lines"][0]
        assert line1["base64_block"] is True
        assert line1["findings"] == []
        assert result["routing"]["decode_only_blocks"], \
            "a sub-80 base64 blob must be reported as decode-only routing"

        real = _assert_parity(result, tmp_path, "short.txt", content)
        # Benign payload: the real scan adds no decoded-payload findings, so
        # the visible set is the WHOLE real result here.
        assert "decoded-payload" not in [f.category for f in real]


class TestHexExemptions:
    DIGEST = "a" * 64

    def test_sha256_manifest_exempted_but_plain_file_reported(self, tmp_path):
        manifest_content = f"{self.DIGEST}  source.py\n"
        manifest = diag.diagnose_text(manifest_content, "CHECKSUMS.sha256")
        assert manifest["status"] == "ok"
        assert manifest["visible_findings"] == []
        hits = manifest["hex_exemptions"]
        assert len(hits) == 1
        assert hits[0]["deciding_rule"] == "sha256-manifest"
        assert hits[0]["exempted"] is True
        assert hits[0]["reported"] is False

        # The diagnostic's verdict matches the private predicate on the same
        # input.
        line = manifest_content.strip()
        m = scanner.HEX_PATTERN.search(line)
        assert scanner._is_sha256_manifest_hash("CHECKSUMS.sha256", line, m)

        # The same digest in an ordinary file is still a Long Hex String.
        plain_content = f"{self.DIGEST}\n"
        plain = diag.diagnose_text(plain_content, "payload.txt")
        assert plain["hex_exemptions"][0]["deciding_rule"] is None
        assert plain["hex_exemptions"][0]["reported"] is True
        assert [f["title"] for f in plain["visible_findings"]] == ["Long Hex String"]

        _assert_parity(manifest, tmp_path, "CHECKSUMS.sha256", manifest_content)
        _assert_parity(plain, tmp_path, "payload.txt", plain_content)

    def test_pinned_digest_rule_name_matches_predicate(self):
        digest = hashlib.sha256(b"pin").hexdigest()
        content = f"FROM python:3.11-slim@sha256:{digest} AS runtime\n"
        result = diag.diagnose_text(content, "Dockerfile")
        hit = result["hex_exemptions"][0]
        assert hit["deciding_rule"] == "pinned-digest"
        assert hit["exempted"] is True
        line = content.strip()
        m = scanner.HEX_PATTERN.search(line)
        assert scanner._is_pinned_digest(line, m)
        assert result["visible_findings"] == []


def _named_digest_content(n):
    """n quoted, random-looking, digest-named sha256 pins (no hex decoder)."""
    return "".join(
        'checksum_%d = "%s"\n' % (i, hashlib.sha256(f"pin-{i}".encode()).hexdigest())
        for i in range(n)
    )


class TestNamedDigestLimit:
    def test_nine_named_digests_exceed_max_and_are_all_reported(self, tmp_path):
        content = _named_digest_content(scanner._MAX_NAMED_DIGESTS + 1)
        result = diag.diagnose_text(content, "pins.py")
        info = result["named_digests"]
        assert info["count"] == scanner._MAX_NAMED_DIGESTS + 1 == 9
        assert info["max"] == scanner._MAX_NAMED_DIGESTS
        assert info["exceeds_max"] is True
        assert info["reported_all"] is True
        long_hex = [f for f in result["visible_findings"]
                    if f["title"] == "Long Hex String"]
        assert len(long_hex) == 9
        assert all(h["reported"] for h in result["hex_exemptions"])
        _assert_parity(result, tmp_path, "pins.py", content)

    def test_eight_named_digests_are_exempted(self, tmp_path):
        content = _named_digest_content(scanner._MAX_NAMED_DIGESTS)
        result = diag.diagnose_text(content, "pins.py")
        info = result["named_digests"]
        assert info["count"] == scanner._MAX_NAMED_DIGESTS == 8
        assert info["exceeds_max"] is False
        assert info["reported_all"] is False
        assert not [f for f in result["visible_findings"]
                    if f["title"] == "Long Hex String"]
        hits = result["hex_exemptions"]
        assert len(hits) == 8
        assert all(h["deciding_rule"] == "named-digest" and h["exempted"]
                   for h in hits)
        _assert_parity(result, tmp_path, "pins.py", content)


class TestDegradedInputs:
    def test_empty_text(self):
        result = diag.diagnose_text("", "empty.txt")
        assert result["status"] == "degraded"
        assert result["degraded_reason"] == "empty-text"
        assert result["visible_findings"] == []

    def test_whitespace_only_text(self):
        result = diag.diagnose_text("   \n\t \n  \n", "blank.txt")
        assert result["status"] == "degraded"
        assert result["degraded_reason"] == "whitespace-only"

    def test_undecodable_bytes(self):
        result = diag.diagnose_text(b"\xff\xfe\x00\x01\x80abc", "blob.bin")
        assert result["status"] == "degraded"
        assert result["degraded_reason"] == "undecodable-bytes"

    def test_oversized_single_line(self):
        result = diag.diagnose_text("A" * (diag.MAX_DIAG_LINE_LENGTH + 1),
                                    "big.txt")
        assert result["status"] == "degraded"
        assert result["degraded_reason"] == "oversized-line"

    def test_degraded_results_are_json_serializable(self):
        for content in ("", "  \n ", b"\xff\xfe", "A" * 100001):
            json.dumps(diag.diagnose_text(content, "x.txt"))


class TestJsonAndBudgetSemantics:
    def test_ok_result_is_json_serializable(self):
        content = ('x = "%s"\n' % _BENIGN_SHORT) + _named_digest_content(2)
        result = diag.diagnose_text(content, "mix.py")
        assert result["status"] == "ok"
        json.dumps(result)  # must not raise

    def test_budget_semantics_reported(self):
        result = diag.diagnose_text('x = "%s"\n' % _BENIGN_SHORT, "b.txt")
        budget = result["budget"]
        assert budget["creates_budget"] is False
        assert budget["calls_decode"] is False
        assert budget["mutates_global_budget"] is False
        assert budget["note"]

    def test_repeated_calls_do_not_accumulate_state(self):
        content = 'x = "%s"\n' % _BENIGN_SHORT
        first = diag.diagnose_text(content, "b.txt")
        second = diag.diagnose_text(content, "b.txt")
        assert first == second
