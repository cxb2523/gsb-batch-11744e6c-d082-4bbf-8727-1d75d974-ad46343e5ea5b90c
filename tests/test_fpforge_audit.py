"""Tests for the sampling-stream audit (invisible_core._fpforge._audit).

The audit is a read-only lens over ``_sampler.Forge``: it attributes every
sampled field to the random stream that decided it, compares two samples field
by field, and reports every failure as structured data rather than raising.
These tests are hermetic - local data only, no network, no browser, no
credentials.

Coverage shape:

* happy path   - a full audit's structure, stream attribution and determinism;
* negative     - an illegal ``fixed_gpu_class`` yields a readable failure object;
* boundary     - seed 0 and a very large integer seed audit with the same
  field count as an ordinary seed;
* contract     - the audit and comparison objects survive ``json.dumps`` and
  contain only plain data, never rng/node/function objects.
"""
from __future__ import annotations

import json

import pytest

from invisible_core._fpforge import _audit, _sampler

pytestmark = pytest.mark.unit

# A representative ordinary seed and the extreme seeds the boundary tests use.
_NORMAL_SEED = 42
_BOUNDARY_SEEDS = (0, 2 ** 128, 2 ** 256)
_VALID_GPU_CLASS = "workstation"
_INVALID_GPU_CLASS = "totally_bogus_class"


# ── helpers ─────────────────────────────────────────────────────────────
def _field_stream_map(audit):
    """audit field name -> owning stream name."""
    return {entry["name"]: entry["stream"] for entry in audit["fields"]}


def _assert_json_native(value):
    """Every leaf is a JSON-native type. json.dumps is the hard guarantee;
    this also names the offending value if the shape ever drifts."""
    if isinstance(value, dict):
        for key, item in value.items():
            assert isinstance(key, str)
            _assert_json_native(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _assert_json_native(item)
    else:
        assert value is None or isinstance(
            value, (str, int, float, bool)
        ), f"non-JSON-native value: {value!r}"


# ── happy path: structure and stream attribution ────────────────────────
def test_audit_seed_returns_a_complete_field_audit():
    audit = _audit.audit_seed(_NORMAL_SEED)

    assert audit["ok"] is True
    assert audit["error"] is None
    # Every field the forge emits is represented, once, in audit order.
    bundle = _sampler.sample(_NORMAL_SEED)
    assert audit["field_count"] == len(bundle)
    assert [entry["name"] for entry in audit["fields"]] == list(bundle)
    # The values block mirrors the sampled bundle verbatim.
    assert audit["values"] == bundle


def test_every_field_is_attributed_to_a_known_stream():
    audit = _audit.audit_seed(_NORMAL_SEED)
    ownership = _field_stream_map(audit)

    known = set(_audit.ALL_STREAMS)
    assert set(ownership.values()) <= known

    # The three independent, seed-named streams own exactly their fields.
    assert ownership["max_touch_points"] == _audit.STREAM_MAX_TOUCH_POINTS
    assert ownership["media_enumeration_ms"] == (
        _audit.STREAM_MEDIA_ENUMERATION_MS
    )
    assert ownership["font_cleartype_gamma"] == (
        _audit.STREAM_CLEARTYPE_TUNING
    )
    assert ownership["font_cleartype_contrast"] == (
        _audit.STREAM_CLEARTYPE_TUNING
    )
    # Browsing history is its own step on the network's shared rng.
    assert ownership["browsing_history"] == _audit.STREAM_BROWSING_HISTORY
    # Locked identity is not sampled at all.
    for locked in ("stealth_seed", *_sampler._LOCKED.keys()):
        assert ownership[locked] == _audit.STREAM_LOCKED_CONSTANTS
    # A representative network node belongs to the shared stream.
    assert ownership["gpu_class"] == _audit.STREAM_NETWORK_SHARED
    assert ownership["screen_w"] == _audit.STREAM_NETWORK_SHARED
    assert ownership["dark_theme"] == _audit.STREAM_NETWORK_SHARED


def test_stream_groups_partition_every_field_without_overlap():
    audit = _audit.audit_seed(_NORMAL_SEED)
    grouped = [
        name
        for names in audit["stream_groups"].values()
        for name in names
    ]

    # No field is dropped or double-counted.
    assert sorted(grouped) == sorted(audit["values"].keys())
    assert len(grouped) == audit["field_count"]

    # The independent groups contain precisely the documented fields.
    assert audit["stream_groups"][_audit.STREAM_MAX_TOUCH_POINTS] == [
        "max_touch_points"
    ]
    assert audit["stream_groups"][_audit.STREAM_MEDIA_ENUMERATION_MS] == [
        "media_enumeration_ms"
    ]
    assert audit["stream_groups"][_audit.STREAM_CLEARTYPE_TUNING] == [
        "font_cleartype_gamma",
        "font_cleartype_contrast",
    ]
    assert audit["stream_groups"][_audit.STREAM_BROWSING_HISTORY] == [
        "browsing_history"
    ]


def test_independence_check_rederives_every_independent_field():
    audit = _audit.audit_seed(_NORMAL_SEED)
    independence = audit["independence"]

    assert independence[
        "all_independent_fields_rederived_from_named_streams"
    ] is True
    checked = {row["field"]: row for row in independence["rederivation_checks"]}
    for field in (
        "max_touch_points",
        "media_enumeration_ms",
        "font_cleartype_gamma",
        "font_cleartype_contrast",
    ):
        row = checked[field]
        assert row["matches"] is True
        assert row["sampled_value"] == row["rederived_value"]
    # The property the audit exists to support is spelled out in the data.
    assert "moves no existing field" in independence["property"]


def test_same_seed_twice_is_equal_field_by_field():
    """Two independent Forge draws of one seed: every row must compare equal,
    in both the independent and the shared stream groups."""
    report = _audit.compare_samples(_NORMAL_SEED)

    assert report["ok"] is True
    assert report["mode"] == "same_seed_repeat"
    assert report["all_fields_equal"] is True
    assert report["field_count"] == _audit.audit_seed(_NORMAL_SEED)[
        "field_count"
    ]
    assert all(row["equal"] for row in report["field_comparison"])
    assert report["independent_streams"]["all_equal"] is True
    assert report["shared_streams"]["all_equal"] is True
    assert report["independent_streams"]["unequal_fields"] == []
    assert report["shared_streams"]["unequal_fields"] == []


def test_two_distinct_seeds_report_differences_with_stream_ownership():
    report = _audit.compare_samples(1, 2)

    assert report["ok"] is True
    assert report["mode"] == "two_seeds"
    # At least one field actually moves between these seeds...
    assert report["all_fields_equal"] is False
    moved = [row for row in report["field_comparison"] if not row["equal"]]
    assert moved
    # ...and every moved row still names the stream that owns it, so the
    # independent-vs-shared distinction is visible in the report.
    for row in moved:
        assert row["stream"] in _audit.ALL_STREAMS
    # The summary blocks partition the fields by stream family.
    independent = report["independent_streams"]
    shared = report["shared_streams"]
    assert independent["streams"] == list(_audit.INDEPENDENT_STREAMS)
    assert shared["streams"] == list(_audit.SHARED_STREAMS)
    assert (
        independent["field_count"]
        + shared["field_count"]
        + report["locked_constants"]["field_count"]
    ) == report["field_count"]
    # The locked build identity can never move between seeds (the echoed
    # stealth_seed itself naturally differs and is excluded from that claim).
    identity_rows = [
        row
        for row in report["field_comparison"]
        if row["stream"] == _audit.STREAM_LOCKED_CONSTANTS
        and row["field"] != "stealth_seed"
    ]
    assert identity_rows
    assert all(row["equal"] for row in identity_rows)


def test_valid_fixed_gpu_class_is_honoured():
    audit = _audit.audit_seed(_NORMAL_SEED, _VALID_GPU_CLASS)

    assert audit["ok"] is True
    assert audit["fixed_gpu_class"] == _VALID_GPU_CLASS
    assert audit["values"]["gpu_class"] == _VALID_GPU_CLASS


def test_audit_does_not_touch_the_global_random_state():
    import random

    state = random.getstate()
    _audit.audit_seed(_NORMAL_SEED)
    _audit.compare_samples(3, 9)
    assert random.getstate() == state


# ── negative path: illegal fixed_gpu_class ──────────────────────────────
def test_invalid_fixed_gpu_class_returns_a_readable_failure_not_an_exception():
    result = _audit.audit_seed(_NORMAL_SEED, _INVALID_GPU_CLASS)

    assert isinstance(result, dict)          # structured data, no raise
    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_fixed_gpu_class"
    assert result["error"]["fixed_gpu_class_unavailable"] is True
    assert _INVALID_GPU_CLASS in result["error"]["reason"]
    # The reason names the classes that ARE valid, so it is actionable.
    for valid_class in _sampler._GPU_CLASSES:
        assert valid_class in result["error"]["reason"]
    # A failed audit still carries the empty-shape contract.
    assert result["field_count"] == 0
    assert result["fields"] == []


def test_non_string_fixed_gpu_class_is_a_structured_failure():
    result = _audit.audit_seed(_NORMAL_SEED, 12345)

    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_fixed_gpu_class"
    assert result["error"]["fixed_gpu_class_unavailable"] is True


def test_compare_samples_propagates_the_class_failure_as_data():
    report = _audit.compare_samples(
        1, 2, fixed_gpu_class=_INVALID_GPU_CLASS
    )

    assert report["ok"] is False
    assert report["error"]["code"] == "invalid_fixed_gpu_class"
    assert report["error"]["fixed_gpu_class_unavailable"] is True
    assert report["conclusion"] is None


def test_invalid_seed_is_reported_as_a_failure_result():
    result = _audit.audit_seed("not-an-int")

    assert result["ok"] is False
    assert result["error"]["code"] == "invalid_seed"
    assert result["error"]["reason"]


# ── boundary path: seed 0 and very large integer seeds ──────────────────
@pytest.mark.parametrize("seed", _BOUNDARY_SEEDS)
def test_boundary_seeds_produce_complete_audits(seed):
    baseline = _audit.audit_seed(_NORMAL_SEED)
    audit = _audit.audit_seed(seed)

    assert audit["ok"] is True
    assert audit["seed"] == int(seed)
    # Same field inventory as the ordinary path, nothing truncated.
    assert audit["field_count"] == baseline["field_count"]
    assert sorted(audit["values"].keys()) == sorted(
        baseline["values"].keys()
    )
    # Every field still has a stream and every group is non-empty where the
    # baseline had content.
    assert set(audit["stream_groups"]) == set(baseline["stream_groups"])
    for stream, names in baseline["stream_groups"].items():
        assert audit["stream_groups"][stream] is not None
        assert len(audit["stream_groups"][stream]) == len(names)


@pytest.mark.parametrize("seed", _BOUNDARY_SEEDS)
def test_boundary_seeds_remain_deterministic(seed):
    report = _audit.compare_samples(seed)

    assert report["ok"] is True
    assert report["all_fields_equal"] is True


# ── contract: JSON serialization and plain-data-only output ─────────────
def test_audit_object_is_json_serializable_and_contains_only_plain_data():
    audit = _audit.audit_seed(_NORMAL_SEED)

    encoded = json.dumps(audit)
    assert json.loads(encoded)["field_count"] == audit["field_count"]
    _assert_json_native(audit)


def test_comparison_object_is_json_serializable():
    repeat = _audit.compare_samples(_NORMAL_SEED)
    two_seeds = _audit.compare_samples(1, 2)
    failure = _audit.audit_seed(
        _NORMAL_SEED, _INVALID_GPU_CLASS
    )

    for obj in (repeat, two_seeds, failure):
        encoded = json.dumps(obj)
        assert json.loads(encoded)["ok"] == obj["ok"]
        _assert_json_native(obj)


def test_audit_holds_no_random_network_or_function_objects():
    """The serialized-shape check above rules these out transitively; assert
    it directly as well so the guarantee does not rely on json.dumps alone."""
    import random

    from invisible_core._fpforge._network import Node

    audit = _audit.audit_seed(_NORMAL_SEED)

    def walk(value):
        assert not isinstance(value, random.Random)
        assert not callable(value)
        assert not isinstance(value, Node)
        if isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    walk(audit)


def test_field_count_is_stable_across_a_range_of_seeds():
    expected = len(_sampler.sample(0))
    counts = {
        _audit.audit_seed(seed)["field_count"]
        for seed in (0, 1, 7, 42, 999, 45061, 2 ** 31 - 1, 2 ** 128)
    }
    assert counts == {expected}


def test_stream_ownership_covers_every_forge_field_without_overlap():
    """Drift guard: if the forge gains a field, the audit's explicit ownership
    table must gain an entry for it. A covered field carries no warning and the
    independent/shared partition still accounts for every field exactly once."""
    audit = _audit.audit_seed(_NORMAL_SEED)

    assert audit["warnings"] == []
    declared = {
        name
        for names in audit["stream_groups"].values()
        for name in names
    }
    assert declared == set(_sampler.sample(_NORMAL_SEED).keys())

    # Independent vs. shared is a real partition of the sampled (non-locked)
    # fields, and the two families never claim the same field.
    independent_fields = set(
        audit["independence"]["independent_fields"]
    )
    shared_fields = set(audit["independence"]["shared_fields"])
    sampled = declared - set(
        audit["stream_groups"][_audit.STREAM_LOCKED_CONSTANTS]
    )
    assert independent_fields & shared_fields == set()
    assert independent_fields | shared_fields == sampled


def test_failure_result_is_also_a_complete_json_contract():
    """A failed audit keeps the same top-level shape so callers can rely on it
    without branching on an exception type, and the failure stays JSON data."""
    result = _audit.audit_seed(_NORMAL_SEED, _INVALID_GPU_CLASS)

    for key in (
        "ok", "error", "seed", "fixed_gpu_class", "field_count", "fields",
        "values", "streams", "stream_groups", "independence", "warnings",
    ):
        assert key in result
    # The readable reason lists every class the audit would have accepted.
    reason = result["error"]["reason"]
    for valid_class in _sampler._GPU_CLASSES:
        assert valid_class in reason
    json.dumps(result)  # the failure envelope is JSON data, not an exception

