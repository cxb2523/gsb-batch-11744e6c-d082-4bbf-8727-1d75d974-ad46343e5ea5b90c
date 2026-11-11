"""Pure-data flyover exposure audit report.

This module wraps the Doppler geolocation attack (``attack``), the physics
(``physics``) and the mitigation (``scrub``) into a single *pure* report:

  * inputs are in-memory arrays/numbers (no file or network access);
  * nothing outside the call is modified;
  * the output is plain ``dict``/``list``/``str``/``float``/``int``/``None``
    values, so it survives ``json.dumps`` (no numpy arrays, no ``Track``).

The verdict rules are copied line-for-line from :func:`flyover_scrub.audit.audit_flight`
(the same thresholds, including the ``strength`` is NaN -> "no usable chance
baseline" branch); this module must not invent its own cut-offs.

Degraded inputs never raise: an audio shorter than 40 s, a track with no finite
slant range inside the recording window, or a null hypothesis with fewer than 50
finite candidates yields a report whose ``status`` explains which rule fired.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from .attack import (
    Spectrogram,
    grid,
    locate,
    score_candidates,
    whitened_spectrogram,
)
from .physics import Track, received_doppler
from .scrub import ScrubConfig, scrub

#: minimum scored clip length, identical to audit_flight's crop guard
MIN_CLIP_S = 40.0
#: minimum finite null candidates needed for a chance baseline, identical to audit_flight
MIN_NULL_FINITE = 50
#: crop half-window around closest approach, identical to audit_flight
CROP_HALF_S = 75.0
#: time-axis step used to find closest approach, identical to audit_flight
T_AXIS_STEP_S = 0.5
#: verdict thresholds, copied verbatim from audit_flight
STRENGTH_REAL = 4.0
STRENGTH_POSSIBLE = 2.0
NEAR_ERROR_M = 300.0
PARTLY_RANK = 50
NEAR_RANK = 10

# Status strings --------------------------------------------------------------
STATUS_OK = "ok"
STATUS_AUDIO_TOO_SHORT = "degraded_audio_too_short"
STATUS_NO_FINITE_RANGE = "degraded_no_finite_slant_range"
STATUS_CLIP_TOO_SHORT = "degraded_clip_too_short"
STATUS_NULL_INSUFFICIENT = "degraded_null_baseline_insufficient"


def decide_verdict(top_error_m: float, truth_rank: int | None, n_candidates: int,
                   top_score: float, strength: float) -> str:
    """Verdict rules copied verbatim from ``audit_flight`` (no new thresholds)."""
    real = bool(np.isfinite(strength) and strength >= STRENGTH_REAL)
    near = top_error_m <= NEAR_ERROR_M or (truth_rank is not None and truth_rank <= NEAR_RANK)
    if real and top_error_m <= NEAR_ERROR_M:
        return "EXPOSED"
    if real and truth_rank and truth_rank <= PARTLY_RANK:
        return "partly exposed"
    if real:
        return "signal, but points elsewhere"
    if near and np.isfinite(strength) and strength >= STRENGTH_POSSIBLE:
        return "possibly exposed"
    if not np.isfinite(strength):
        return "not located (no usable chance baseline)"
    return "not located"


def _to_xyz(observer_enu: np.ndarray) -> np.ndarray:
    obs = np.asarray(observer_enu, dtype=float)
    if obs.shape == (2,):
        obs = np.array([obs[0], obs[1], 0.0])
    return obs


def closest_approach(track: Track, observer_enu: np.ndarray, t0: float, n_samples: int,
                     sr: int) -> dict[str, Any]:
    """Closest-point slant range and reception time over the recording window."""
    obs = _to_xyz(observer_enu)
    t_axis = t0 + np.arange(0.0, n_samples / sr, T_AXIS_STEP_S)
    _, r, _ = received_doppler(track, obs, t_axis)
    finite = np.isfinite(r)
    if not finite.any():
        return {"finite": False, "cpa_slant_range_m": None, "cpa_time": None}
    i = int(np.nanargmin(r))
    return {
        "finite": True,
        "cpa_slant_range_m": float(r[i]),
        "cpa_time": float(t_axis[i]),
        "n_finite_range_samples": int(finite.sum()),
    }


def _locate_timed(spec, tracks, t_clip, center, half_width, f0_range, offsets):
    """Copy of attack.locate's two stages, but timed and with per-stage counts."""
    t = time.perf_counter()
    coarse_pts = grid(center, half_width, 250.0)
    res = score_candidates(spec, tracks, t_clip, coarse_pts, f0_range=f0_range, offsets=offsets)
    coarse_s = time.perf_counter() - t

    t = time.perf_counter()
    seeds = coarse_pts[res.ranked()[:12]]
    fine_pts = np.concatenate([grid(tuple(s[:2]), 250.0, 50.0) for s in seeds])
    fine_pts = np.unique(np.round(fine_pts, 1), axis=0)
    res2 = score_candidates(spec, tracks, t_clip, fine_pts, f0_range=f0_range, offsets=offsets)
    fine_s = time.perf_counter() - t

    from dataclasses import replace as _replace

    combined = _replace(
        res,
        candidates=np.concatenate([res.candidates, res2.candidates]),
        scores=np.concatenate([res.scores, res2.scores]),
        best_f0=np.concatenate([res.best_f0, res2.best_f0]),
        best_offset=np.concatenate([res.best_offset, res2.best_offset]),
    )
    return combined, len(coarse_pts), len(fine_pts), coarse_s, fine_s


def audit_variant(audio: np.ndarray, sr: int, track: Track, t0: float, observer_enu: np.ndarray,
                  clip_start_sample: int, clip_end_sample: int, *, half_width: float, seed: int,
                  label: str) -> dict[str, Any]:
    """Run one audit_flight-equivalent pipeline on one audio signal.

    Mirrors ``audit_flight`` exactly (same probes, sweeps, null construction and
    strength formula) while additionally recording per-stage evidence and timing.
    Returns either a full variant block or a degraded block (never raises).
    """
    timings: dict[str, float] = {}
    obs = _to_xyz(observer_enu)
    clip = audio[clip_start_sample:clip_end_sample]
    t_clip = t0 + clip_start_sample / sr

    t = time.perf_counter()
    spec = whitened_spectrogram(clip, sr)
    timings["spectrogram_seconds"] = time.perf_counter() - t

    offsets = np.arange(-4.0, 4.01, 0.25)
    # 3x3 probe spots spread over the search box, jittered with a seeded RNG,
    # exactly as audit_flight does.
    h = half_width / 2
    probes = np.array([[x, y, 0.0] for x in (-h, 0.0, h) for y in (-h, 0.0, h)])
    probes[:, :2] += np.random.default_rng(seed).uniform(-h / 2, h / 2, (len(probes), 2))

    t = time.perf_counter()
    wide = score_candidates(spec, [track], t_clip, probes, f0_range=(40.0, 400.0),
                            f0_step=0.5, offsets=offsets)
    timings["f0_sweep_seconds"] = time.perf_counter() - t
    f0 = float(wide.best_f0[int(np.argmax(wide.scores))])
    f0_range = (f0 - 3.0, f0 + 3.0)

    t = time.perf_counter()
    res, n_coarse, n_fine, coarse_s, fine_s = _locate_timed(
        spec, [track], t_clip, (float(obs[0]), float(obs[1])), half_width, f0_range, offsets
    )
    timings["locate_coarse_seconds"] = coarse_s
    timings["locate_fine_seconds"] = fine_s
    timings["locate_total_seconds"] = time.perf_counter() - t
    summary = res.summary(obs[:2])

    # Null hypothesis: same search on the time-reversed spectrogram.
    t = time.perf_counter()
    rev = Spectrogram(S=spec.S[:, ::-1].copy(), freqs=spec.freqs, times=spec.times)
    null_scores = locate(rev, [track], t_clip, (float(obs[0]), float(obs[1])),
                         half_width=half_width, f0_range=f0_range, offsets=offsets).scores
    null_scores = null_scores[np.isfinite(null_scores)]
    timings["null_hypothesis_seconds"] = time.perf_counter() - t

    null_count = int(null_scores.size)
    null_median = float(np.median(null_scores)) if null_count else None
    spread = float(null_scores.max()) - null_median if null_count else 0.0
    # audit_flight formula, unchanged:
    strength = ((summary["top_score"] - null_median) / spread
                if null_count >= MIN_NULL_FINITE and spread > 1e-6 else float("nan"))

    block: dict[str, Any] = {
        "status": STATUS_OK,
        "variant": label,
        "scored_duration_s": float(len(clip) / sr),
        "f0_hz": f0,
        "top_error_m": float(summary["top_error_m"]),
        "truth_rank": (int(summary["truth_rank"]) if summary["truth_rank"] is not None else None),
        "n_candidates": int(summary["n_candidates"]),
        "top_score": float(summary["top_score"]),
        "top_zscore": float(summary["top_zscore"]),
        "strength_vs_chance": float(strength),
        "evidence": {
            "coarse_grid_points": int(n_coarse),
            "fine_grid_points": int(n_fine),
            "null_finite_candidates": null_count,
            "null_median_score": null_median,
        },
        "timings": timings,
    }
    # audit_flight still emits a verdict in this case (NaN strength -> baseline
    # branch); compute it with the identical rules before flagging degradation.
    verdict = decide_verdict(
        block["top_error_m"], block["truth_rank"], block["n_candidates"],
        block["top_score"], strength,
    )
    block["verdict"] = verdict
    if null_count < MIN_NULL_FINITE:
        # Degraded, but never verdict-less: the verdict stays consistent with
        # audit_flight while ``status`` names the degradation explicitly.
        block["status"] = STATUS_NULL_INSUFFICIENT
        block["reason"] = (
            f"null hypothesis produced {null_count} finite candidate(s); "
            f"{MIN_NULL_FINITE} are required for a chance baseline"
        )
    return block


def build_exposure_report(
    audio: np.ndarray,
    sr: int,
    track: Track,
    recording_start: float,
    observer_enu: np.ndarray,
    *,
    half_width: float,
    seed: int = 11,
    include_scrub: bool = True,
) -> dict[str, Any]:
    """Structured, JSON-serialisable flyover exposure audit report.

    Parameters
    ----------
    audio:
        One-dimensional mono signal.
    sr:
        Sample rate in Hz.
    track:
        Flight track sampled in local ENU metres; its time epoch must agree with
        ``recording_start``.
    recording_start:
        Absolute time (seconds, any epoch shared with the track) of audio sample 0.
    observer_enu:
        True observer position in local ENU metres, shape (2,) or (3,).
    half_width:
        Search-box half-width in metres around the true position.
    seed:
        Seeds both the 3x3 probe jitter RNG and the scrub RNG.
    include_scrub:
        When false, only the original-audit block is produced.

    The function never raises on degenerate input; instead it returns a report
    with a non-``ok`` ``status`` and a human-readable ``reason``.
    """
    started = time.perf_counter()
    audio = np.asarray(audio, dtype=float)
    sr = int(sr)
    obs = _to_xyz(observer_enu)
    duration_s = float(len(audio) / sr)

    report: dict[str, Any] = {
        "schema": "flyover-exposure-report/1",
        "status": STATUS_OK,
        "reason": None,
        "inputs": {
            "sample_rate_hz": sr,
            "audio_duration_s": duration_s,
            "recording_start": float(recording_start),
            "observer_enu_m": [float(obs[0]), float(obs[1]), float(obs[2])],
            "search_half_width_m": float(half_width),
            "seed": int(seed),
        },
        "closest_approach": None,
        "clip": None,
        "original": None,
        "scrubbed": None,
        "timings": {"total_seconds": 0.0},
    }

    # Degraded rule 1: audio shorter than 40 s overall.
    if duration_s < MIN_CLIP_S:
        report["status"] = STATUS_AUDIO_TOO_SHORT
        report["reason"] = (
            f"audio is {duration_s:.1f} s long; at least {MIN_CLIP_S:.0f} s are required"
        )
        report["timings"]["total_seconds"] = time.perf_counter() - started
        return report

    # Closest approach over the recording window.
    cpa = closest_approach(track, obs, recording_start, len(audio), sr)
    report["closest_approach"] = {
        "cpa_slant_range_m": cpa["cpa_slant_range_m"],
        "cpa_time": cpa["cpa_time"],
    }

    # Degraded rule 2: no finite slant range inside the window.
    if not cpa["finite"]:
        report["status"] = STATUS_NO_FINITE_RANGE
        report["reason"] = "track has no finite slant range within the recording window"
        report["timings"]["total_seconds"] = time.perf_counter() - started
        return report

    t_cpa = cpa["cpa_time"]
    # Crop to +-75 s around closest approach, exactly like audit_flight.
    a = max(0, int((t_cpa - recording_start - CROP_HALF_S) * sr))
    b = min(len(audio), int((t_cpa - recording_start + CROP_HALF_S) * sr))
    clip_s = (b - a) / sr
    report["clip"] = {
        "start_sample": int(a),
        "end_sample": int(b),
        "duration_s": float(clip_s),
    }

    # Degraded rule 3: the cropped clip is shorter than 40 s.
    if clip_s < MIN_CLIP_S:
        report["status"] = STATUS_CLIP_TOO_SHORT
        report["reason"] = (
            f"cropped clip around closest approach is {clip_s:.1f} s; "
            f"at least {MIN_CLIP_S:.0f} s are required"
        )
        report["timings"]["total_seconds"] = time.perf_counter() - started
        return report

    report["original"] = audit_variant(
        audio, sr, track, recording_start, obs, a, b,
        half_width=half_width, seed=seed, label="original",
    )
    # Top-level degradation follows the original-audio variant.
    if report["original"]["status"] != STATUS_OK:
        report["status"] = report["original"]["status"]
        report["reason"] = report["original"]["reason"]

    if include_scrub:
        t = time.perf_counter()
        scrubbed_audio, rep = scrub(audio, sr, ScrubConfig(seed=seed))
        report["timings"]["scrub_seconds"] = time.perf_counter() - t
        scrub_block = audit_variant(
            scrubbed_audio, sr, track, recording_start, obs, a, b,
            half_width=half_width, seed=seed, label="scrubbed",
        )
        scrub_block["scrub"] = {
            "replaced_fraction": float(rep.replaced_fraction),
            "ridge_fraction": float(rep.ridge_fraction),
            "ridges_found": int(rep.ridges_found),
        }
        report["scrubbed"] = scrub_block

    report["timings"]["total_seconds"] = time.perf_counter() - started
    return report
