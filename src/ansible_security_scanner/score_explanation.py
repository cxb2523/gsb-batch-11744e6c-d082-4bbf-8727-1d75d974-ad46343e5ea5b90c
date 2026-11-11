#!/usr/bin/env python3
"""
Explainable security scoring for Ansible Security Scanner.

Pure-function companion to :class:`score_calculator.ScoreCalculator`.
``explain_security_score`` takes the same inputs as
``ScoreCalculator.calculate_security_score`` (a findings list and the number
of scanned files) and returns a :class:`ScoreExplanation` describing exactly
where every point was lost: per-severity deduction subtotals, the
extra-CRITICAL penalty, the file-coverage and density penalties, and a
per-category breakdown that traces each deduction back to the rule IDs
behind it.

The numeric results are identical to ``calculate_security_score`` by
construction: the canonical :class:`SecurityScore` is computed by the
calculator itself, and the deduction details reuse the same weight tables
and module-level constants. Nothing in this module mutates state, performs
I/O beyond the (cached) pattern catalog the calculator already reads, or
changes any existing behavior.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import SecurityFinding
from .patterns_manager import patterns_manager
from .score_calculator import (
    _DENSITY_CAP,
    _DENSITY_STEP,
    _DENSITY_THRESHOLD,
    _EXTRA_CRITICAL_PENALTY,
    _FILE_COVERAGE_WEIGHT,
    _OVERALL,
    _PER_CATEGORY,
    _SEVERITIES,
    ScoreCalculator,
    _bucket,
    _count_severities,
)

# Bucket name for findings whose rule_id is not present in any loaded
# category. They still count toward the overall score (the calculator
# already counts them there); they simply have no category to deduct from.
UNCATEGORIZED_CATEGORY = "uncategorized"


@dataclass
class SeverityDeduction:
    """One severity's contribution to a score deduction."""

    severity: str
    count: int
    penalty_per_finding: float
    subtotal: float  # count * penalty_per_finding


@dataclass
class CategoryExplanation:
    """A category's score plus the deduction trail that produced it."""

    category: str
    score: float
    findings_count: int
    severity_counts: dict[str, int]
    severity_deductions: list[SeverityDeduction]
    volume_penalty: float
    total_deduction: float
    rule_ids: list[str]  # sorted, de-duplicated rule IDs behind the findings
    reason: str  # human-readable summary of the deduction


@dataclass
class ScoreExplanation:
    """Structured, item-for-item explanation of a :class:`SecurityScore`."""

    scanned_files: int
    findings_count: int
    # Canonical results - identical to SecurityScore for the same input.
    overall_score: float
    risk_score: float
    category_scores: dict[str, float]
    file_scores: dict[str, float]
    severity_breakdown: dict[str, int]
    recommendations_count: int
    # Overall-score deduction trail.
    severity_counts: dict[str, int]
    severity_deductions: list[SeverityDeduction]
    extra_critical_penalty: float
    file_coverage_penalty: float
    density_penalty: float
    # Sum of every deduction component, before the 0..100 clamp/rounding.
    gross_deduction: float
    # Effective deduction actually applied: 100 - overall_score.
    total_deduction: float
    # Per-category detail, keyed by loaded category name.
    category_explanations: dict[str, CategoryExplanation]
    # Findings whose rule_id maps to no loaded category. Always present so
    # unknown rule IDs are visible instead of silently dropped.
    uncategorized: CategoryExplanation


def _severity_deductions(counts, weights) -> list[SeverityDeduction]:
    per_finding = {
        "CRITICAL": weights.critical,
        "HIGH": weights.high,
        "MEDIUM": weights.medium,
        "LOW": weights.low,
    }
    return [
        SeverityDeduction(
            severity=sev,
            count=counts[sev],
            penalty_per_finding=per_finding[sev],
            subtotal=counts[sev] * per_finding[sev],
        )
        for sev in _SEVERITIES
    ]


def _explain_category(category: str, group: list[SecurityFinding]) -> CategoryExplanation:
    counts = _count_severities(group)
    deductions = _severity_deductions(counts, _PER_CATEGORY)
    volume_penalty = 0.0
    if len(group) > _PER_CATEGORY.volume_threshold:
        volume_penalty = (len(group) - _PER_CATEGORY.volume_threshold) * (
            _PER_CATEGORY.volume_step
        )
    score = round(_PER_CATEGORY.deduct(counts, len(group)))
    if not group:
        reason = "no findings in this category; score stays at 100"
    else:
        parts = [
            f"{d.count}x {d.severity} (-{d.subtotal:g})" for d in deductions if d.count
        ]
        if volume_penalty:
            parts.append(
                f"volume penalty: {len(group)} finding(s) over threshold "
                f"{_PER_CATEGORY.volume_threshold} (-{volume_penalty:g})"
            )
        reason = f"{len(group)} finding(s): " + ", ".join(parts)
    return CategoryExplanation(
        category=category,
        score=score,
        findings_count=len(group),
        severity_counts=dict(counts),
        severity_deductions=deductions,
        volume_penalty=volume_penalty,
        total_deduction=100.0 - score,
        rule_ids=sorted({f.rule_id for f in group}),
        reason=reason,
    )


def _explain_uncategorized(group: list[SecurityFinding]) -> CategoryExplanation:
    counts = _count_severities(group)
    if group:
        reason = (
            f"{len(group)} finding(s) with rule IDs not present in any loaded "
            "category; they still count toward the overall score but no "
            "category score is deducted for them"
        )
    else:
        reason = "no findings with unknown rule IDs"
    return CategoryExplanation(
        category=UNCATEGORIZED_CATEGORY,
        score=100.0,
        findings_count=len(group),
        severity_counts=dict(counts),
        # Informational counts only: no category deduction is applied, so
        # every penalty here is explicitly zero.
        severity_deductions=[
            SeverityDeduction(severity=sev, count=counts[sev], penalty_per_finding=0.0, subtotal=0.0)
            for sev in _SEVERITIES
        ],
        volume_penalty=0.0,
        total_deduction=0.0,
        rule_ids=sorted({f.rule_id for f in group}),
        reason=reason,
    )


def explain_security_score(
    findings: list[SecurityFinding],
    scanned_files: int,
    *,
    include_suppressed: bool = False,
) -> ScoreExplanation:
    """Explain the security score for ``findings`` over ``scanned_files`` files.

    Mirrors ``scan_directory``'s default handling of inline suppressions:
    findings with a non-empty ``suppressed_by`` are excluded unless
    ``include_suppressed`` is true (the ``--show-suppressed`` mode, where
    they also remain in scoring).

    The returned ``overall_score``, ``risk_score``, ``category_scores``,
    ``file_scores`` and ``severity_breakdown`` are item-for-item identical
    to ``ScoreCalculator().calculate_security_score`` on the same
    (post-filter) input.
    """
    active = findings if include_suppressed else [f for f in findings if not f.suppressed_by]

    # Canonical score - the explanation must match this item for item.
    score = ScoreCalculator().calculate_security_score(active, scanned_files)

    counts = _count_severities(active)
    total = len(active)

    severity_deductions = _severity_deductions(counts, _OVERALL)

    extra_critical_penalty = 0.0
    file_coverage_penalty = 0.0
    density_penalty = 0.0
    if total > 0:
        extra_critical_penalty = max(0, counts["CRITICAL"] - 1) * _EXTRA_CRITICAL_PENALTY
        if scanned_files > 0:
            files_with_issues = len({f.file_path for f in active})
            file_coverage_penalty = (files_with_issues / scanned_files) * _FILE_COVERAGE_WEIGHT
        if total > _DENSITY_THRESHOLD:
            density_penalty = min(
                _DENSITY_CAP, (total - _DENSITY_THRESHOLD) * _DENSITY_STEP
            )

    gross_deduction = (
        sum(d.subtotal for d in severity_deductions)
        + extra_critical_penalty
        + file_coverage_penalty
        + density_penalty
    )

    pattern_data = patterns_manager.discover_and_load_patterns()
    rule_to_category = {
        pattern.id: category for category, patterns in pattern_data.items() for pattern in patterns
    }

    bucketed = _bucket(active, lambda f: rule_to_category.get(f.rule_id))
    category_explanations = {
        category: _explain_category(category, bucketed.get(category, []))
        for category in pattern_data
    }
    uncategorized = _explain_uncategorized(
        [f for f in active if f.rule_id not in rule_to_category]
    )

    return ScoreExplanation(
        scanned_files=scanned_files,
        findings_count=total,
        overall_score=score.overall_score,
        risk_score=score.risk_score,
        category_scores=dict(score.category_scores),
        file_scores=dict(score.file_scores),
        severity_breakdown=dict(score.severity_breakdown),
        recommendations_count=score.recommendations_count,
        severity_counts=dict(counts),
        severity_deductions=severity_deductions,
        extra_critical_penalty=extra_critical_penalty,
        file_coverage_penalty=file_coverage_penalty,
        density_penalty=density_penalty,
        gross_deduction=gross_deduction,
        total_deduction=100.0 - score.overall_score,
        category_explanations=category_explanations,
        uncategorized=uncategorized,
    )
