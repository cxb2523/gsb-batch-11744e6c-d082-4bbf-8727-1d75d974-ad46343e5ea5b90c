"""Tests for score explainability (score_explanation.py).

Covers:
- normal path: multi-severity / multi-category / multi-file findings where
  the explanation must equal ScoreCalculator.calculate_security_score
  item for item;
- boundary path: empty findings with scanned_files=0 (score 100, no error);
- negative path: findings with unknown rule IDs land in a visible
  "uncategorized" bucket without changing existing category scores;
- suppression gate: findings flagged with ``suppressed_by`` are excluded
  from the explanation by default (mirroring scan_directory);
- ScanReport wiring: the field defaults to None, scan_directory fills it on
  both the normal and the empty-directory paths.

All samples are synthetic and local - no network, no real credentials.
"""

from __future__ import annotations

import pytest

from ansible_security_scanner.models import ScanReport, SecurityFinding, SecurityScore
from ansible_security_scanner.patterns_manager import SecurityPattern, patterns_manager
from ansible_security_scanner.score_calculator import ScoreCalculator
from ansible_security_scanner.score_explanation import (
    UNCATEGORIZED_CATEGORY,
    explain_security_score,
)


def _finding(
    rule_id: str,
    severity: str,
    file_path: str = "site.yml",
    line: int = 1,
    suppressed_by: str = "",
) -> SecurityFinding:
    return SecurityFinding(
        file_path=file_path,
        line_number=line,
        rule_id=rule_id,
        severity=severity,
        title=f"title for {rule_id}",
        description="synthetic finding",
        recommendation="fix it",
        code_snippet="snippet",
        remediation_example="remediation",
        suppressed_by=suppressed_by,
    )


def _pattern(rule_id: str, category: str) -> SecurityPattern:
    return SecurityPattern(
        id=rule_id,
        severity="HIGH",
        title=rule_id,
        description="synthetic pattern",
        regex="x",
        recommendation="rec",
        category=category,
        plugin_name="test_plugin",
        plugin_version="1.0",
    )


FAKE_PATTERNS: dict[str, list[SecurityPattern]] = {
    "credentials": [
        _pattern("cred_password", "credentials"),
        _pattern("cred_token", "credentials"),
    ],
    "network": [_pattern("net_open_port", "network")],
    "hygiene": [_pattern("hyg_latest", "hygiene")],
}


@pytest.fixture
def fake_patterns(monkeypatch):
    """Deterministic, self-contained rule_id -> category mapping."""
    monkeypatch.setattr(
        patterns_manager, "discover_and_load_patterns", lambda: FAKE_PATTERNS
    )
    return FAKE_PATTERNS


def _assert_matches_calculator(explanation, score) -> None:
    """The explanation must equal calculate_security_score item for item."""
    assert explanation.overall_score == score.overall_score
    assert explanation.risk_score == score.risk_score
    assert explanation.category_scores == score.category_scores
    assert explanation.file_scores == score.file_scores
    assert explanation.severity_breakdown == score.severity_breakdown
    assert explanation.recommendations_count == score.recommendations_count


class TestNormalPath:
    """Multi-severity, multi-category, cross-file findings."""

    @pytest.fixture
    def findings(self) -> list[SecurityFinding]:
        return [
            _finding("cred_password", "CRITICAL", "a.yml", 1),
            _finding("cred_password", "CRITICAL", "b.yml", 2),
            _finding("cred_token", "HIGH", "a.yml", 3),
            _finding("net_open_port", "MEDIUM", "b.yml", 4),
            _finding("net_open_port", "MEDIUM", "c.yml", 5),
            _finding("net_open_port", "MEDIUM", "c.yml", 6),
            _finding("hyg_latest", "LOW", "c.yml", 7),
        ]

    def test_explanation_equals_calculator_item_for_item(self, fake_patterns, findings):
        scanned_files = 4
        score = ScoreCalculator().calculate_security_score(findings, scanned_files)
        explanation = explain_security_score(findings, scanned_files)

        _assert_matches_calculator(explanation, score)

    def test_overall_deduction_components(self, fake_patterns, findings):
        explanation = explain_security_score(findings, scanned_files=4)

        # Per-severity subtotals under the overall weights (15/8/3/1).
        by_sev = {d.severity: d for d in explanation.severity_deductions}
        assert by_sev["CRITICAL"].count == 2
        assert by_sev["CRITICAL"].subtotal == 30
        assert by_sev["HIGH"].count == 1
        assert by_sev["HIGH"].subtotal == 8
        assert by_sev["MEDIUM"].count == 3
        assert by_sev["MEDIUM"].subtotal == 9
        assert by_sev["LOW"].count == 1
        assert by_sev["LOW"].subtotal == 1

        # Extra CRITICAL penalty: one CRITICAL beyond the first * 5.
        assert explanation.extra_critical_penalty == 5
        # File coverage: 3 files with issues out of 4 scanned * 10.
        assert explanation.file_coverage_penalty == pytest.approx(7.5)
        # Density: 7 findings, 5 tolerated -> (7 - 5) * 1.5.
        assert explanation.density_penalty == pytest.approx(3.0)

        assert explanation.gross_deduction == pytest.approx(30 + 8 + 9 + 1 + 5 + 7.5 + 3.0)
        assert explanation.total_deduction == pytest.approx(100 - explanation.overall_score)
        # The effective deduction is the gross deduction after the 0..100
        # clamp and integer rounding the calculator applies.
        assert explanation.overall_score == round(max(0.0, 100 - explanation.gross_deduction))

    def test_category_explanations_trace_rule_ids(self, fake_patterns, findings):
        explanation = explain_security_score(findings, scanned_files=4)

        credentials = explanation.category_explanations["credentials"]
        assert credentials.rule_ids == ["cred_password", "cred_token"]
        # 2x CRITICAL (-40) + 1x HIGH (-12), 3 findings over volume
        # threshold 2 -> -3.
        assert credentials.volume_penalty == 3
        assert credentials.score == 100 - 40 - 12 - 3
        assert explanation.category_scores["credentials"] == credentials.score
        assert "2x CRITICAL" in credentials.reason
        assert "volume penalty" in credentials.reason

        network = explanation.category_explanations["network"]
        assert network.rule_ids == ["net_open_port"]
        assert network.score == 100 - 3 * 5 - 3  # 3x MEDIUM + volume penalty

        hygiene = explanation.category_explanations["hygiene"]
        assert hygiene.score == 100 - 2  # 1x LOW, below volume threshold
        assert hygiene.volume_penalty == 0

        # Every loaded category is explained, even untouched ones.
        assert set(explanation.category_explanations) == set(FAKE_PATTERNS)

        # The uncategorized bucket exists but is empty here.
        assert explanation.uncategorized.category == UNCATEGORIZED_CATEGORY
        assert explanation.uncategorized.findings_count == 0
        assert explanation.uncategorized.rule_ids == []


class TestBoundaryPath:
    def test_empty_findings_zero_scanned_files(self, fake_patterns):
        explanation = explain_security_score([], 0)

        assert explanation.overall_score == 100
        assert explanation.risk_score == 0
        assert explanation.findings_count == 0
        assert explanation.scanned_files == 0
        assert explanation.extra_critical_penalty == 0
        assert explanation.file_coverage_penalty == 0
        assert explanation.density_penalty == 0
        assert explanation.gross_deduction == 0
        assert explanation.total_deduction == 0
        assert all(d.subtotal == 0 for d in explanation.severity_deductions)
        assert all(c.score == 100 for c in explanation.category_explanations.values())
        assert explanation.uncategorized.findings_count == 0

        score = ScoreCalculator().calculate_security_score([], 0)
        _assert_matches_calculator(explanation, score)

    def test_empty_findings_with_scanned_files(self, fake_patterns):
        explanation = explain_security_score([], 7)
        assert explanation.overall_score == 100
        assert explanation.risk_score == 0
        assert explanation.file_coverage_penalty == 0


class TestUnknownRuleIds:
    def test_unknown_rule_id_lands_in_uncategorized_bucket(self, fake_patterns):
        findings = [
            _finding("totally_unknown_rule", "HIGH", "a.yml"),
            _finding("cred_password", "CRITICAL", "a.yml", 2),
        ]
        explanation = explain_security_score(findings, scanned_files=1)

        uncategorized = explanation.uncategorized
        assert uncategorized.category == UNCATEGORIZED_CATEGORY
        assert uncategorized.findings_count == 1
        assert uncategorized.rule_ids == ["totally_unknown_rule"]
        assert uncategorized.severity_counts["HIGH"] == 1
        assert "totally_unknown_rule" not in {
            rid for cat in explanation.category_explanations.values() for rid in cat.rule_ids
        }

        # Existing category scores are untouched by the unknown rule ID:
        # only the known CRITICAL finding deducts from "credentials".
        assert explanation.category_scores["credentials"] == 100 - 20
        assert explanation.category_scores["network"] == 100
        assert explanation.category_scores["hygiene"] == 100
        assert UNCATEGORIZED_CATEGORY not in explanation.category_scores

        # The unknown finding still counts toward the overall score, exactly
        # as the calculator counts it.
        score = ScoreCalculator().calculate_security_score(findings, 1)
        _assert_matches_calculator(explanation, score)

    def test_only_unknown_rule_ids(self, fake_patterns):
        findings = [_finding("ghost_rule", "MEDIUM", "a.yml")]
        explanation = explain_security_score(findings, scanned_files=1)

        assert explanation.uncategorized.findings_count == 1
        assert all(score == 100 for score in explanation.category_scores.values())
        score = ScoreCalculator().calculate_security_score(findings, 1)
        _assert_matches_calculator(explanation, score)


class TestSuppressionGate:
    def test_suppressed_findings_excluded_by_default(self, fake_patterns):
        findings = [
            _finding("cred_password", "CRITICAL", "a.yml"),
            _finding("net_open_port", "HIGH", "a.yml", 2, suppressed_by="nosec: test"),
            _finding("hyg_latest", "LOW", "b.yml", 3, suppressed_by="nosec: test"),
        ]
        explanation = explain_security_score(findings, scanned_files=2)

        # Only the non-suppressed finding is counted anywhere.
        assert explanation.findings_count == 1
        assert explanation.severity_counts["CRITICAL"] == 1
        assert explanation.severity_counts["HIGH"] == 0
        assert explanation.severity_counts["LOW"] == 0
        assert explanation.category_explanations["network"].findings_count == 0
        assert explanation.category_explanations["hygiene"].findings_count == 0

        active = [f for f in findings if not f.suppressed_by]
        score = ScoreCalculator().calculate_security_score(active, 2)
        _assert_matches_calculator(explanation, score)

    def test_include_suppressed_matches_show_suppressed_scoring(self, fake_patterns):
        findings = [
            _finding("cred_password", "CRITICAL", "a.yml"),
            _finding("net_open_port", "HIGH", "a.yml", 2, suppressed_by="nosec: test"),
        ]
        explanation = explain_security_score(findings, 1, include_suppressed=True)

        assert explanation.findings_count == 2
        score = ScoreCalculator().calculate_security_score(findings, 1)
        _assert_matches_calculator(explanation, score)


class TestScanReportWiring:
    def test_score_explanation_defaults_to_none(self):
        report = ScanReport(
            scan_timestamp="2026-01-01T00:00:00",
            ansible_directory="/tmp/x",
            total_files_scanned=0,
            scanned_file_names=[],
            findings=[],
            summary={},
            security_score=SecurityScore(
                overall_score=100,
                risk_score=0,
                category_scores={},
                severity_breakdown={},
                file_scores={},
                recommendations_count=0,
            ),
        )
        assert report.score_explanation is None

    def test_empty_directory_report_carries_empty_explanation(self, tmp_path):
        from ansible_security_scanner import AnsibleSecurityScanner

        report = AnsibleSecurityScanner(directory=str(tmp_path)).scan_directory()

        explanation = report.score_explanation
        assert explanation is not None
        assert explanation.overall_score == 100
        assert explanation.risk_score == 0
        assert explanation.findings_count == 0
        assert explanation.scanned_files == 0
        assert explanation.gross_deduction == 0
        assert explanation.total_deduction == 0
        assert explanation.extra_critical_penalty == 0
        assert explanation.file_coverage_penalty == 0
        assert explanation.density_penalty == 0

    def test_scan_directory_populates_matching_explanation(self, tmp_path):
        from ansible_security_scanner import AnsibleSecurityScanner

        # Synthetic playbook with a clearly bogus, non-real password value.
        (tmp_path / "site.yml").write_text(
            "- hosts: all\n"
            "  vars:\n"
            "    ansible_become_pass: BOGUSPASS-NOT-REAL-123\n"
            "  tasks:\n"
            "    - ansible.builtin.debug:\n"
            "        msg: hello\n"
        )
        report = AnsibleSecurityScanner(directory=str(tmp_path)).scan_directory()

        explanation = report.score_explanation
        assert explanation is not None
        assert report.findings, "expected the synthetic playbook to trigger findings"

        score = report.security_score
        assert explanation.overall_score == score.overall_score
        assert explanation.risk_score == score.risk_score
        assert explanation.category_scores == score.category_scores
        assert explanation.severity_breakdown == score.severity_breakdown
        # The only scanned file produced findings, so the calculator's
        # per-file output already covers it and nothing was backfilled.
        assert explanation.file_scores == score.file_scores

        # Every finding's rule_id is traceable: either to a category or to
        # the visible uncategorized bucket.
        explained_rule_ids = {
            rid for cat in explanation.category_explanations.values() for rid in cat.rule_ids
        } | set(explanation.uncategorized.rule_ids)
        assert {f.rule_id for f in report.findings} <= explained_rule_ids

    def test_json_formatter_serializes_explanation(self, tmp_path):
        import json

        from ansible_security_scanner import AnsibleSecurityScanner, JSONFormatter

        (tmp_path / "site.yml").write_text(
            "- hosts: all\n"
            "  vars:\n"
            "    ansible_become_pass: BOGUSPASS-NOT-REAL-123\n"
            "  tasks:\n"
            "    - ansible.builtin.debug:\n"
            "        msg: hello\n"
        )
        report = AnsibleSecurityScanner(directory=str(tmp_path)).scan_directory()

        payload = json.loads(JSONFormatter(show_all=True).format(report))
        assert payload["score_explanation"]["overall_score"] == report.security_score.overall_score
        assert "category_explanations" in payload["score_explanation"]
        assert payload["score_explanation"]["uncategorized"]["category"] == "uncategorized"
