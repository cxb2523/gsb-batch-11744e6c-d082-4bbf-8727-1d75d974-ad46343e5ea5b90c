"""Tests for the structured flyover exposure audit report.

All samples are synthesised locally (make_track + synthesize_flyover plus
numpy noise); nothing here touches the network, real recordings or credentials.
"""

import json
import math

import numpy as np
import pytest

from flyover_scrub import exposure
from flyover_scrub.audit import audit_flight, exposure_audit_report
from flyover_scrub.physics import make_track, synthesize_flyover

SR = 16000
HW = 1500.0
T0 = 10.0  # recording start on the track clock


def _turning_heli_track(rng_seed=0):
    """Helicopter-style track: slow, banked turn window inside the recording."""
    return make_track(
        0.0, 200.0,
        start_xy=(-6000.0, -300.0), altitude=550.0, speed=70.0, heading_deg=5.0,
        turn_rate_deg_s=-1.2, turn_start=45.0, turn_duration=25.0,
    )


def _flyover_mix(duration_s, *, snr_db=-12.0, f0=90.0, seed=7, track=None):
    """A turning flyover mixed into Gaussian noise; returns (audio, track)."""
    rng = np.random.default_rng(seed)
    trk = track or _turning_heli_track()
    n = SR * duration_s
    plane = synthesize_flyover(trk, np.zeros(3), T0, n, SR, f0=f0, rng=rng)
    bg = rng.normal(size=n)
    plane *= 10 ** (snr_db / 20.0) * bg.std() / plane[plane != 0].std()
    return bg + plane, trk


def _check_jsonable(obj):
    """The whole report must survive json.dumps (no numpy types/arrays/NaN-only issues)."""
    text = json.dumps(obj)
    back = json.loads(text)
    return back


def test_report_matches_audit_flight_on_audible_flyover():
    """Normal path: turning helicopter flyover in noise -> EXPOSED, finite strength."""
    audio, trk = _flyover_mix(70)
    report = exposure_audit_report(
        audio, T0, trk, np.zeros(3), half_width=HW, seed=11,
        log=lambda *a, **k: None,
    )

    # Independent reference: the existing audit_flight on exactly the same input.
    ref = audit_flight(audio, T0, trk, half_width=HW, label="original",
                       log=lambda *a, **k: None)

    assert report["status"] == exposure.STATUS_OK
    orig = report["original"]
    assert orig["verdict"] == ref["verdict"]
    assert orig["top_error_m"] == ref["top_error_m"]
    assert orig["truth_rank"] == ref["truth_rank"]
    assert orig["n_candidates"] == ref["n_candidates"]
    assert orig["f0_hz"] == ref["f0_hz"]
    assert math.isfinite(orig["strength_vs_chance"])
    assert orig["strength_vs_chance"] == pytest.approx(ref["strength_vs_chance"], rel=1e-12)
    assert ref["verdict"] == "EXPOSED"
    assert orig["top_error_m"] <= 300.0

    # Required geometry / process evidence.
    cpa = report["closest_approach"]
    assert cpa["cpa_slant_range_m"] is not None and cpa["cpa_time"] is not None
    assert cpa["cpa_slant_range_m"] == pytest.approx(ref["cpa_horizontal_m"], rel=1e-9)
    assert report["clip"]["duration_s"] >= 40.0
    ev = orig["evidence"]
    assert ev["coarse_grid_points"] > 0 and ev["fine_grid_points"] > 0
    assert ev["null_finite_candidates"] >= 50
    assert ev["null_median_score"] is not None and math.isfinite(ev["null_median_score"])
    for key in ("spectrogram_seconds", "f0_sweep_seconds", "locate_total_seconds",
                "locate_coarse_seconds", "locate_fine_seconds", "null_hypothesis_seconds"):
        assert orig["timings"][key] >= 0.0

    # Scrubbed variant carries the same field set plus scrub metrics.
    scr = report["scrubbed"]
    assert scr is not None and scr["variant"] == "scrubbed"
    for key in ("top_error_m", "truth_rank", "strength_vs_chance", "verdict",
                "f0_hz", "scored_duration_s"):
        assert key in scr
    assert 0.0 <= scr["scrub"]["replaced_fraction"] <= 1.0
    assert scr["scrub"]["ridges_found"] >= 1
    assert scr["verdict"] != "EXPOSED"  # the mitigation is measured to break locating

    _check_jsonable(report)


def test_pure_report_blocks_have_full_schema():
    """The pure module alone (no audit.py wrapper) returns the complete structure."""
    audio, trk = _flyover_mix(70)
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11,
    )
    assert report["schema"] == "flyover-exposure-report/1"
    for block_name in ("original", "scrubbed"):
        block = report[block_name]
        for key in ("scored_duration_s", "f0_hz", "top_error_m", "truth_rank",
                    "strength_vs_chance", "verdict", "evidence", "timings"):
            assert key in block
        assert block["evidence"]["coarse_grid_points"] > 0
        assert block["evidence"]["fine_grid_points"] > 0
    assert report["timings"]["total_seconds"] > 0.0
    _check_jsonable(report)


def test_negative_40db_flyover_is_not_exposed():
    """A flyover pushed 40 dB under the noise must not yield EXPOSED."""
    audio, trk = _flyover_mix(70, snr_db=-40.0, seed=21)
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11,
    )
    assert report["status"] == exposure.STATUS_OK
    assert "EXPOSED" not in report["original"]["verdict"]
    _check_jsonable(report)


def test_negative_pure_noise_is_not_exposed():
    """No aircraft at all: the report still completes and never says EXPOSED."""
    rng = np.random.default_rng(31)
    audio = rng.normal(size=SR * 70)
    trk = _turning_heli_track()
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11,
    )
    assert report["status"] == exposure.STATUS_OK
    assert "EXPOSED" not in report["original"]["verdict"]
    assert report["original"]["evidence"]["null_finite_candidates"] >= 50
    _check_jsonable(report)


def test_boundary_30s_audio_returns_degraded_status():
    """Audio shorter than 40 s: explicit degraded result, no exception."""
    audio, trk = _flyover_mix(30)
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11,
    )
    assert report["status"] == exposure.STATUS_AUDIO_TOO_SHORT
    assert "40" in report["reason"]
    assert report["original"] is None and report["scrubbed"] is None
    _check_jsonable(report)


def test_boundary_no_finite_slant_range_returns_degraded_status():
    """Track never within audible coverage of the window: no finite range rule."""
    rng = np.random.default_rng(41)
    audio = rng.normal(size=SR * 60)
    # Track lives far away and only exists well after the recording ends.
    trk = make_track(T0 + 400.0, 120.0, start_xy=(40000.0, 40000.0),
                     altitude=9000.0, speed=70.0, heading_deg=0.0)
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11,
    )
    assert report["status"] == exposure.STATUS_NO_FINITE_RANGE
    assert report["reason"]
    _check_jsonable(report)


def test_boundary_null_candidates_below_50_returns_degraded_status(monkeypatch):
    """Null hypothesis with < 50 finite candidates: degraded, no exception, verdict kept.

    In normal geometry every scorer call returns a finite number (even an uncovered
    candidate gets 0.0), so audit_flight's ``null.size >= 50`` guard is a defensive
    branch for non-finite scorer placeholders. We exercise that exact branch by
    replacing only the *null* scorer (the real coarse/fine locate still runs) with
    a result whose scores are mostly non-finite, as a failed scorer would return.
    """
    from flyover_scrub.attack import AttackResult

    rng = np.random.default_rng(51)
    n = SR * 60
    trk = make_track(0.0, 200.0, start_xy=(-3000.0, 200.0), altitude=500.0,
                     speed=70.0, heading_deg=0.0)
    audio = rng.normal(size=n)

    real_locate = exposure.locate

    def sparse_null_locate(spec, tracks, t_clip, center, **kw):
        res = real_locate(spec, tracks, t_clip, center, **kw)
        # The standalone null-hypothesis locate is the only locate() call in the
        # pipeline (coarse/fine scoring is inlined); degrade just that result.
        scores = np.full_like(res.scores, -np.inf)
        scores[:3] = res.scores[:3]  # a handful finite, below the 50 threshold
        return AttackResult(candidates=res.candidates, scores=scores,
                            best_f0=res.best_f0, best_offset=res.best_offset)

    monkeypatch.setattr(exposure, "locate", sparse_null_locate)

    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11, include_scrub=False,
    )
    orig = report["original"]
    assert orig["status"] == exposure.STATUS_NULL_INSUFFICIENT
    assert orig["evidence"]["null_finite_candidates"] < 50
    assert orig["reason"]
    # audit_flight still assigns the NaN-strength baseline verdict in this branch.
    assert orig["verdict"] == "not located (no usable chance baseline)"
    assert not math.isfinite(orig["strength_vs_chance"])
    _check_jsonable(report)


def test_report_is_fully_json_serialisable_with_numpy_free_types():
    """json.dumps works and no numpy/Track objects leak into the output."""
    audio, trk = _flyover_mix(70)
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11,
    )

    def walk(o):
        assert not isinstance(o, (np.ndarray, np.generic))
        assert type(o).__name__ != "Track"
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(report)
    _check_jsonable(report)


def test_include_scrub_false_omits_scrubbed_block():
    audio, trk = _flyover_mix(70)
    report = exposure.build_exposure_report(
        audio, SR, trk, T0, np.zeros(3), half_width=HW, seed=11, include_scrub=False,
    )
    assert report["scrubbed"] is None
    assert "scrub_seconds" not in report["timings"]
    assert report["original"] is not None
    _check_jsonable(report)
