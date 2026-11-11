# -----------------------------------------------------------------------------
#  Awesome-Audio-Visualizer - Audio pipeline diagnostics (pure functions)
#  File: audio_diag.py
#
#  Read-only diagnostics for the two audio chains:
#    * live : AudioProcessor.get_all_audio_data()  (audio.py)
#    * file : FileProcessor.get_all_audio_data()   (fileprocessor.py)
#
#  Every entry point is a pure function: no side effects, no hardware access,
#  and the returned value is a plain JSON-serializable dict (no numpy arrays,
#  no processor instances, no function references).
#
#  Consistency contract (verified by test_audio_diag.py):
#    * diagnose_live reproduces bass_end_index / bass_energy / avg_bass /
#      is_beat / current_level / peak_level of AudioProcessor bit-for-bit
#      (same numpy ops on the same inputs, float tolerance 1e-6).
#    * diagnose_file reproduces frame_index = clamp(int(t * cols / duration))
#      and is_beat = (beat_index in range and t >= beat_times[beat_index]).
# -----------------------------------------------------------------------------
import math

import numpy as np

# mirrors AudioProcessor: bass band ends at 250 Hz, history deque(maxlen=5)
BASS_CUTOFF_HZ = 250
BASS_HISTORY_MAXLEN = 5
# mirrors main.py: beat sensitivity is clamped to [0.5, 3.0] in the UI
BEAT_SENSITIVITY_MIN = 0.5
BEAT_SENSITIVITY_MAX = 3.0
# mirrors AudioProcessor: int16 full scale divisor for the level meter
INT16_LEVEL_DIVISOR = 327.67


def _check(name, passed, reason=None):
    return {"name": name, "passed": bool(passed),
            "reason": None if passed else str(reason)}


def _finite_or_none(value):
    """float() that never leaks NaN/inf into the (JSON-serializable) result."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


# ------------------------------------------------------------------ live chain
def diagnose_live(samples, chunk_size, rate, beat_sensitivity, bass_history,
                  prev_peak_level=0.0):
    """Diagnose the live (AudioProcessor) chain for one chunk of int16 samples.

    Parameters mirror the processor state at the moment of the call:
      samples          int16 samples (numpy array or plain Python list)
      chunk_size       frames per buffer (must be a positive even number)
      rate             sample rate in Hz (must be positive)
      beat_sensitivity AudioProcessor.beat_sensitivity
      bass_history     previous bass energies (oldest first; the deque's
                       maxlen=5 semantics are applied here)
      prev_peak_level  AudioProcessor.peak_level before this chunk

    Returns a pure-data dict; never raises for bad input, it degrades instead.
    """
    checks = []

    ok_chunk = isinstance(chunk_size, (int, np.integer)) \
        and not isinstance(chunk_size, bool) and chunk_size > 0 and chunk_size % 2 == 0
    checks.append(_check("chunk_size_positive_even", ok_chunk,
                         f"chunk_size={chunk_size!r} 必须为正偶数"))

    ok_rate = isinstance(rate, (int, float, np.integer, np.floating)) \
        and not isinstance(rate, bool) and math.isfinite(float(rate)) and float(rate) > 0
    checks.append(_check("rate_positive", ok_rate,
                         f"rate={rate!r} 必须为正数"))

    try:
        audio_data = np.asarray(list(samples) if not isinstance(samples, np.ndarray)
                                else samples, dtype=np.int16)
    except (TypeError, ValueError, OverflowError):
        audio_data = np.zeros(0, dtype=np.int16)
    ok_samples = audio_data.size > 0
    checks.append(_check("samples_non_empty", ok_samples,
                         "采样数组为空，无法计算 FFT"))

    ok_sens = isinstance(beat_sensitivity, (int, float, np.integer, np.floating)) \
        and math.isfinite(float(beat_sensitivity)) \
        and BEAT_SENSITIVITY_MIN <= float(beat_sensitivity) <= BEAT_SENSITIVITY_MAX
    checks.append(_check("beat_sensitivity_in_range", ok_sens,
                         f"beat_sensitivity={beat_sensitivity!r} 超出 "
                         f"[{BEAT_SENSITIVITY_MIN}, {BEAT_SENSITIVITY_MAX}]（越界但仍继续计算）"))

    active = ok_chunk and ok_rate and ok_samples
    if not active:
        checks.append(_check("inputs_sufficient", False,
                             "chunk_size/rate/samples 不合法，返回降级结果"))
        return {
            "chain": "live",
            "active": False,
            "degraded": True,
            "affected_fields": ["fft_length", "bass_end_index", "bass_energy",
                                "avg_bass", "is_beat", "current_level", "peak_level"],
            "fft_length": None,
            "bass_end_index": None,
            "bass_energy": None,
            "avg_bass": None,
            "is_beat": False,
            "current_level": None,
            "peak_level": None,
            "checks": checks,
        }

    chunk_size = int(chunk_size)
    rate = float(rate)
    beat_sensitivity = float(beat_sensitivity)

    # --- replicate AudioProcessor.get_all_audio_data() op for op -------------
    windowed_data = audio_data * np.hanning(len(audio_data))
    fft_raw = np.abs(np.fft.fft(windowed_data))[:chunk_size // 2]
    fft_length = chunk_size // 2

    bass_end_index = int(BASS_CUTOFF_HZ * chunk_size / rate)
    bass_energy = float(np.sum(fft_raw[:bass_end_index]))

    history = (list(bass_history) + [bass_energy])[-BASS_HISTORY_MAXLEN:]
    is_beat = False
    avg_bass = None
    if len(history) > 2:
        avg_bass = float(np.mean(history[:-1]))
        is_beat = bool(bass_energy > avg_bass * beat_sensitivity)

    rms = np.sqrt(np.mean(audio_data**2))
    current_level = float(min(100, rms / INT16_LEVEL_DIVISOR))

    prev_peak_level = float(prev_peak_level)
    if current_level > prev_peak_level:
        peak_level = current_level
    else:
        peak_level = prev_peak_level * 0.98
    # -------------------------------------------------------------------------

    checks.append(_check("bass_end_index_in_range", 0 <= bass_end_index <= fft_length,
                         f"bass_end_index={bass_end_index} 不在 [0, {fft_length}] 内"
                         f"（250Hz*chunk_size/rate 越界，bass_energy 退化为部分/空求和）"))
    checks.append(_check("bass_history_sufficient", len(history) > 2,
                         f"历史 bass 能量不足（追加后仅 {len(history)} 条，需 >2），"
                         "is_beat 恒为 False"))
    checks.append(_check("samples_match_chunk_size", audio_data.size == chunk_size,
                         f"采样数 {audio_data.size} 与 chunk_size {chunk_size} 不一致，"
                         "FFT 按实际采样数计算"))

    return {
        "chain": "live",
        "active": True,
        "degraded": False,
        "affected_fields": [],
        "fft_length": fft_length,
        "bass_end_index": bass_end_index,
        "bass_energy": _finite_or_none(bass_energy),
        "avg_bass": _finite_or_none(avg_bass) if avg_bass is not None else None,
        "is_beat": is_beat,
        "current_level": _finite_or_none(current_level),
        "peak_level": _finite_or_none(peak_level),
        "checks": checks,
    }


# ------------------------------------------------------------------ file chain
def diagnose_file(num_rows, num_cols, duration, current_time, beat_times, beat_index):
    """Diagnose the file (FileProcessor) chain for one playback instant.

    Parameters mirror the processor state:
      num_rows, num_cols  log_spectrogram.shape (fft_length == num_rows)
      duration            track duration in seconds
      current_time        current playback position in seconds
      beat_times          detected beat times (list of seconds)
      beat_index          FileProcessor.beat_index before this frame

    Returns a pure-data dict; duration <= 0 or num_cols == 0 yields a
    degraded result (no NaN, no division by zero) instead of raising.
    """
    checks = []

    ok_rows = isinstance(num_rows, (int, np.integer)) and num_rows > 0
    checks.append(_check("rows_positive", ok_rows,
                         f"log_spectrogram 行数={num_rows!r} 必须为正"))

    ok_cols = isinstance(num_cols, (int, np.integer)) and num_cols > 0
    checks.append(_check("columns_positive", ok_cols,
                         f"log_spectrogram 列数={num_cols!r} 必须为正，"
                         "否则 frame_index 无法计算"))

    ok_duration = isinstance(duration, (int, float, np.integer, np.floating)) \
        and math.isfinite(float(duration)) and float(duration) > 0
    checks.append(_check("duration_positive", ok_duration,
                         f"duration={duration!r} 必须为正，否则 frame_index 会除零"))

    ok_time = isinstance(current_time, (int, float, np.integer, np.floating)) \
        and math.isfinite(float(current_time)) and float(current_time) >= 0
    checks.append(_check("current_time_non_negative", ok_time,
                         f"current_time={current_time!r} 必须为非负有限值"))

    beat_times = [float(t) for t in (beat_times or [])]
    ok_beat_index = isinstance(beat_index, (int, np.integer)) \
        and 0 <= int(beat_index) <= len(beat_times)
    checks.append(_check("beat_index_in_range", ok_beat_index,
                         f"beat_index={beat_index!r} 不在 [0, {len(beat_times)}] 内"))

    degraded = not (ok_cols and ok_duration and ok_time)
    affected = []
    if degraded:
        # no NaN, no division by zero: frame_index is simply not computable
        frame_index = None
        affected.append("frame_index")
        if not ok_rows:
            affected.append("fft_length")
    else:
        # identical to FileProcessor.get_all_audio_data()
        frame_index = int(float(current_time) * int(num_cols) / float(duration))
        frame_index = min(max(0, frame_index), int(num_cols) - 1)

    fft_length = int(num_rows) if ok_rows else None

    # identical beat rule to FileProcessor.get_all_audio_data()
    beat_index = int(beat_index) if isinstance(beat_index, (int, np.integer)) else 0
    is_beat = bool(beat_index < len(beat_times)
                   and ok_time and float(current_time) >= beat_times[beat_index])
    new_beat_index = beat_index + 1 if is_beat else beat_index
    beats_detected_delta = 1 if is_beat else 0

    return {
        "chain": "file",
        "degraded": degraded,
        "affected_fields": affected,
        "frame_index": frame_index,
        "fft_length": fft_length,
        "is_beat": is_beat,
        "beat_index": new_beat_index,
        "beats_detected_delta": beats_detected_delta,
        "checks": checks,
    }
