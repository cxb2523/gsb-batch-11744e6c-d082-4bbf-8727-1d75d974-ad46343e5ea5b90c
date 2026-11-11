#!/usr/bin/env python3
"""
entropy_diagnostics.py - Pure diagnostic mirror of scan_entropy.scan_file

Given a text content, a repo-relative path and an optional entropy threshold,
produce a STRUCTURED, JSON-serializable explanation of what the entropy scanner
would do with that input:

  * per line: whether it hits a Base64 block, a long hex string, or the
    high-entropy gate, plus the title/severity/category/line of every visible
    finding the line produces;
  * per long-hex hit: which exemption rule decided the outcome
    (sha256 manifest, image/pip pinned digest, lockfile integrity field,
    named digest, insufficient randomness, file contains a hex decoder),
    and whether the named-digest count exceeded scan_entropy._MAX_NAMED_DIGESTS
    so the whole set was reported after all;
  * the division of labor between encoded-blob DETECTION (every blob is routed
    to scan_decode for decoding) and the visible encoding findings (only
    >=80-char base64 blocks and non-exempt >=64-char hex runs);
  * the shared-budget semantics: this diagnostic does NOT mint, consume, or
    reset any scan_decode budget.

CONSISTENCY CONTRACT: for the same text and rel_path, `visible_findings`
equals the findings scan_entropy.scan_file emits itself (scanner == "entropy",
categories "encoding"/"obfuscation"), item by item in (title, line, severity,
category). Findings produced by the scan_decode routing (scanner == "decode",
category "decoded-payload") are NOT part of the visible set — this module never
decodes. Exemption verdicts are computed by calling scan_entropy's own private
predicates on the same inputs, so they cannot drift from real behavior.

PURITY: no file writes, no network, no global-state mutation. Degraded inputs
(empty text, all-whitespace text, oversized single line, non-UTF-8 bytes)
return a result with status="degraded" and an explicit degraded_reason instead
of raising.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import forensics_core as core
import scan_entropy as se

try:
    import scan_decode
except Exception:  # pragma: no cover - scan_decode is shipped beside us
    scan_decode = None

# A single line longer than this is reported as a degraded input instead of
# being scanned character by character (diagnostic-side resource bound; the
# real scanner has its own ReDoS bounds).
MAX_DIAG_LINE_LENGTH = 100000

_ROUTING_EXPLANATION = (
    "scan_entropy.scan_file 对整个文件调用 scan_decode.detect_encoded_blobs "
    "检测 base64/base85/base32/hex 编码块，所有检测到的块都经 feed_blobs 路由解码"
    "（解码命中的 payload 产生 scanner='decode' 的 decoded-payload finding，"
    "不属于本诊断的可见 finding 集合，本诊断也不执行解码）。可见 finding 只来自三处："
    "BASE64_PATTERN(>=50 字符) 中长度 >=80 且未被 data-URI/锁文件完整性/路径形态豁免的块 "
    "产生 'Base64 Encoded Block'；HEX_PATTERN(>=64) 未被任何豁免规则放行的命中产生 "
    "'Long Hex String'；香农熵超过阈值且本行尚无其他 finding 的行产生 "
    "'High Entropy Line'/'High-Confidence Secret'。因此 50-79 字符的 base64 块只路由解码、"
    "不产生可见 Base64 块 finding。"
)

_BUDGET_NOTE = (
    "本诊断不创建也不消耗任何 scan_decode 解码预算：不调用 new_budget/host_budget/"
    "feed_blobs/rescan_blob，因此多次调用之间不存在被累积或重置的全局解码预算。"
    "scan_entropy.main() 的共享 budget 语义（整次扫描只 mint 一个 budget 并传给每个文件）"
    "不受本诊断影响；本诊断的可重复运行不会改动任何解码期限或字节上限。"
)


def _budget_info():
    return {
        "creates_budget": False,
        "calls_decode": False,
        "mutates_global_budget": False,
        "note": _BUDGET_NOTE,
    }


def _empty_named_digest_info():
    return {
        "count": 0,
        "max": se._MAX_NAMED_DIGESTS,
        "exceeds_max": False,
        "reported_all": False,
    }


def _degraded(reason, rel_path, threshold, detail=""):
    """Degraded result for inputs that cannot be diagnosed; never raises."""
    return {
        "status": "degraded",
        "degraded_reason": reason,
        "detail": detail,
        "rel_path": rel_path,
        "threshold": threshold,
        "skipped": False,
        "skip_reason": "",
        "lines": [],
        "visible_findings": [],
        "hex_exemptions": [],
        "named_digests": _empty_named_digest_info(),
        "routing": {
            "detector": "scan_decode.detect_encoded_blobs",
            "explanation": _ROUTING_EXPLANATION,
            "routed_blobs": [],
            "routed_blob_count": 0,
            "decode_only_blocks": [],
            "visible_encoding_blocks": [],
        },
        "budget": _budget_info(),
    }


def _split_lines(text):
    """Mirror open(..., 'r').readlines() line splitting (universal newlines)."""
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def _routing_info(text, visible_encoding_blocks):
    """Which blobs are routed to decode vs. which additionally produce a
    visible encoding finding. Detection only — nothing is decoded here."""
    routed = []
    if scan_decode is not None:
        try:
            for blob in scan_decode.detect_encoded_blobs(text):
                routed.append({"length": len(blob), "preview": blob[:120]})
        except Exception:
            routed = []
    visible_matched = {b["matched"] for b in visible_encoding_blocks}
    decode_only = [b for b in routed if b["preview"] not in visible_matched]
    return {
        "detector": "scan_decode.detect_encoded_blobs",
        "explanation": _ROUTING_EXPLANATION,
        "routed_blobs": routed,
        "routed_blob_count": len(routed),
        "decode_only_blocks": decode_only,
        "visible_encoding_blocks": visible_encoding_blocks,
    }


def diagnose_text(content, rel_path, threshold=5.8):
    """Diagnose how scan_entropy.scan_file would treat `content` at `rel_path`.

    Args:
        content: str, or bytes (must decode as UTF-8; otherwise a degraded
            result is returned instead of raising).
        rel_path: repo-relative path; the basename drives the minified-file,
            lockfile and sha256-manifest rules exactly as in scan_file.
        threshold: Shannon entropy threshold (scan_file default 5.8).

    Returns:
        A plain-data dict (JSON-serializable) with a "status" of "ok" or
        "degraded". Never writes files, never touches the network, never
        mutates global state, never raises for the documented degraded inputs.
    """
    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        return _degraded("invalid-threshold", rel_path, 5.8,
                         detail="threshold is not a number: %r" % (threshold,))

    if isinstance(content, (bytes, bytearray)):
        try:
            content = bytes(content).decode("utf-8")
        except UnicodeDecodeError as exc:
            return _degraded("undecodable-bytes", rel_path, threshold,
                             detail=str(exc))
    if not isinstance(content, str):
        return _degraded("unsupported-input-type", rel_path, threshold,
                         detail="expected str or UTF-8 bytes, got %s"
                                % type(content).__name__)
    if content == "":
        return _degraded("empty-text", rel_path, threshold)
    if content.strip() == "":
        return _degraded("whitespace-only", rel_path, threshold)

    lines = _split_lines(content)
    for line in lines:
        if len(line) > MAX_DIAG_LINE_LENGTH:
            return _degraded("oversized-line", rel_path, threshold,
                             detail="line length %d exceeds diagnostic cap %d"
                                    % (len(line), MAX_DIAG_LINE_LENGTH))

    basename = os.path.basename(rel_path)

    # Whole-file skips, mirroring scan_file (minified files, then lockfiles).
    if se.is_minified(rel_path):
        return _skipped_result("minified", rel_path, threshold, content)
    if basename in core.LOCKFILES:
        return _skipped_result("lockfile", rel_path, threshold, content)

    try:
        return _diagnose_ok(content, lines, rel_path, basename, threshold)
    except Exception as exc:  # never leak an uncaught exception to callers
        return _degraded("internal-error", rel_path, threshold,
                         detail=repr(exc))


def _skipped_result(reason, rel_path, threshold, content):
    del content  # a skipped file is returned before any blob routing
    result = _degraded("skipped-file", rel_path, threshold)
    result["status"] = "ok"
    result["degraded_reason"] = ""
    result["skipped"] = True
    result["skip_reason"] = reason
    return result


def _diagnose_ok(content, lines, rel_path, basename, threshold):
    """Replicates scan_file's per-line visible-finding logic exactly, using
    scan_entropy's own patterns and private predicates so the verdicts cannot
    drift. Builds plain dicts instead of core.Finding objects."""
    findings = []            # visible finding dicts, in scan_file order
    hex_hits = []            # per HEX_PATTERN match disposition
    line_reports = []
    named_digests = []       # deferred (finding, hex_hit, line_entry) tuples
    named_shapes = 0
    visible_encoding_blocks = []
    decodes_hex = se._HEX_DECODER.search(content) is not None

    for i, line in enumerate(lines):
        stripped = line.strip()
        entry = {
            "line": i + 1,
            "base64_block": False,
            "long_hex": False,
            "high_entropy": False,
            "entropy": None,
            "findings": [],
        }
        line_reports.append(entry)
        if len(stripped) < 50:
            continue

        # Base64 block (visible finding gate: >=80 chars), one finding per line.
        for m in se.BASE64_PATTERN.finditer(stripped):
            matched = m.group(0)
            prefix = stripped[:m.start()]
            if 'data:' in prefix and prefix.rstrip().endswith(';base64,'):
                continue
            if se._is_lockfile_integrity(basename, stripped, m, False):
                continue
            if se._looks_like_path(matched):
                continue
            entry["base64_block"] = True
            if len(matched) >= 80:
                finding = {"title": "Base64 Encoded Block", "severity": "high",
                           "category": "encoding", "line": i + 1}
                findings.append(finding)
                entry["findings"].append(finding)
                visible_encoding_blocks.append(
                    {"kind": "base64", "line": i + 1, "matched": matched[:120]})
            break

        # Long hex string, with the full exemption chain.
        for m in se.HEX_PATTERN.finditer(stripped):
            matched = m.group(0)
            hit = {"line": i + 1,
                   "match_preview": matched[:120],
                   "match_length": len(matched),
                   "deciding_rule": None,
                   "exempted": False,
                   "reported": False,
                   "note": ""}
            hex_hits.append(hit)
            entry["long_hex"] = True
            if se._is_sha256_manifest_hash(rel_path, stripped, m):
                hit.update(deciding_rule="sha256-manifest", exempted=True)
                continue
            if se._is_pinned_digest(stripped, m):
                hit.update(deciding_rule="pinned-digest", exempted=True)
                continue
            if se._is_lockfile_integrity(basename, stripped, m, True):
                hit.update(deciding_rule="lockfile-integrity", exempted=True)
                continue
            hex_finding = {"title": "Long Hex String", "severity": "high",
                           "category": "encoding", "line": i + 1}
            if se._is_named_digest(lines, i, stripped, m):
                named_shapes += 1
                if not decodes_hex and se._looks_random_digest(matched):
                    hit.update(deciding_rule="named-digest", exempted=True)
                    named_digests.append((hex_finding, hit, entry))
                    continue
                hit.update(deciding_rule=("file-decodes-hex" if decodes_hex
                                          else "insufficient-randomness"),
                           reported=True)
            else:
                hit.update(reported=True)
            findings.append(hex_finding)
            entry["findings"].append(hex_finding)
            visible_encoding_blocks.append(
                {"kind": "hex", "line": i + 1, "matched": matched[:120]})
            break

        # Shannon entropy gate (per-string distribution).
        ent = se.shannon_entropy(stripped)
        entry["entropy"] = ent
        if ent > threshold:
            entry["high_entropy"] = True
            already_found = any(f["line"] == i + 1 for f in findings)
            if not already_found:
                matches_secret = any(p.search(stripped)
                                     for p in se.SECRET_FORMAT_PATTERNS)
                finding = {
                    "title": ("High-Confidence Secret" if matches_secret
                              else "High Entropy Line"),
                    "severity": "high" if matches_secret else "medium",
                    "category": "obfuscation",
                    "line": i + 1,
                }
                findings.append(finding)
                entry["findings"].append(finding)

    # More named digests than _MAX_NAMED_DIGESTS is a table, not a pin:
    # scan_file reports them all at the end.
    exceeds_max = named_shapes > se._MAX_NAMED_DIGESTS
    if exceeds_max:
        for hex_finding, hit, entry in named_digests:
            hit.update(exempted=False, reported=True,
                       note="named digest count %d exceeds _MAX_NAMED_DIGESTS "
                            "(%d); reported wholesale" % (named_shapes,
                                                          se._MAX_NAMED_DIGESTS))
            findings.append(hex_finding)
            entry["findings"].append(hex_finding)

    return {
        "status": "ok",
        "degraded_reason": "",
        "detail": "",
        "rel_path": rel_path,
        "threshold": threshold,
        "skipped": False,
        "skip_reason": "",
        "lines": line_reports,
        "visible_findings": findings,
        "hex_exemptions": hex_hits,
        "named_digests": {
            "count": named_shapes,
            "max": se._MAX_NAMED_DIGESTS,
            "exceeds_max": exceeds_max,
            "reported_all": bool(exceeds_max and named_digests),
        },
        "routing": _routing_info(content, visible_encoding_blocks),
        "budget": _budget_info(),
    }


# Convenience alias.
diagnose = diagnose_text


if __name__ == "__main__":  # pragma: no cover - manual inspection helper
    import json
    src = sys.stdin.read()
    path = sys.argv[1] if len(sys.argv) > 1 else "stdin.txt"
    print(json.dumps(diagnose_text(src, path), indent=2, ensure_ascii=False))
