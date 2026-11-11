# -----------------------------------------------------------------------------
#  Tests for audio_diag.py and HotVisualizer.audit_audio()
#  Self-contained: no network, no credentials, no audio hardware.
#  pyaudio / pygame / librosa are stubbed so audio.py, fileprocessor.py and
#  main.py can be imported on machines without audio devices.
# -----------------------------------------------------------------------------
import json
import sys
import time as time_module
import types
from collections import deque
from unittest import mock

import numpy as np
import pytest

# --- stub hardware-dependent third-party modules BEFORE importing repo code --
sys.modules.setdefault("pyaudio", mock.MagicMock())
sys.modules.setdefault("pygame", mock.MagicMock())
sys.modules.setdefault("librosa", mock.MagicMock())

import audio
import audio_diag
import fileprocessor
import main

# audio.py calls time.time() without importing time (latent repo bug, only hit
# when a beat fires). Inject the stdlib module from the test side so the real
# processor can run; audio.py itself is left untouched.
if not hasattr(audio, "time"):
    audio.time = time_module

TOL = 1e-6
CHUNK = 2048
RATE = 44100


# ------------------------------------------------------------------ helpers
def make_samples(chunk=CHUNK, freq_bin=5, amplitude=10000):
    """Deterministic low-frequency sine (lands inside the 250 Hz bass band)."""
    n = np.arange(chunk)
    return (amplitude * np.sin(2 * np.pi * freq_bin * n / chunk)).astype(np.int16)


def make_live_processor(samples, chunk=CHUNK, rate=RATE, sensitivity=1.5,
                        bass_hist=(1.0, 1.0, 1.0, 1.0), peak=0.0):
    """A real AudioProcessor with a fake stream (no PyAudio, no hardware)."""
    ap = audio.AudioProcessor.__new__(audio.AudioProcessor)
    ap.chunk_size = chunk
    ap.format = None
    ap.channels = 1
    ap.rate = rate
    ap.device_index = None
    ap.p = None
    ap.is_active = True
    ap.fft_history = deque(maxlen=10)
    ap.bass_history = deque(bass_hist, maxlen=5)
    ap.beat_sensitivity = sensitivity
    ap.current_level = 0
    ap.peak_level = peak
    ap.beats_detected = 0
    ap.last_beat_time = 0
    raw = np.asarray(samples, dtype=np.int16).tobytes()
    ap.stream = types.SimpleNamespace(
        read=lambda n, exception_on_overflow=False: raw)
    return ap


def make_file_processor(rows=1025, cols=100, duration=10.0,
                        beat_times=(1.0, 2.5, 4.0), beat_index=0,
                        beats_detected=0, pos_ms=0):
    """A real FileProcessor with fixed state (no pygame mixer, no librosa)."""
    fp = fileprocessor.FileProcessor.__new__(fileprocessor.FileProcessor)
    fp.is_analyzed = True
    fp.duration = duration
    fp.beat_times = list(beat_times)
    fp.beat_index = beat_index
    fp.beats_detected = beats_detected
    fp.playback_state = "playing"
    rng = np.random.RandomState(42)
    fp.log_spectrogram = -rng.rand(rows, cols) * 80.0  # dB-like values
    fileprocessor.pygame.mixer.music.get_pos.return_value = pos_ms
    return fp


def assert_checks_all_pass(result):
    failed = [c for c in result["checks"] if not c["passed"]]
    assert not failed, f"checks failed: {failed}"


# ------------------------------------------------------------------ live chain
class TestLiveChain:
    def test_matches_real_processor_normal_path(self):
        samples = make_samples()
        bass_hist = [1.0, 1.0, 1.0, 1.0]
        ap = make_live_processor(samples, bass_hist=bass_hist, peak=12.5)

        _, real_beat, real_level, real_peak = ap.get_all_audio_data()
        real_bass_energy = float(ap.bass_history[-1])
        real_avg_bass = float(np.mean(list(ap.bass_history)[:-1]))

        diag = audio_diag.diagnose_live(samples, CHUNK, RATE, 1.5, bass_hist,
                                        prev_peak_level=12.5)

        assert diag["active"] is True and diag["degraded"] is False
        assert diag["fft_length"] == CHUNK // 2
        assert diag["bass_end_index"] == int(250 * CHUNK / RATE)
        assert diag["is_beat"] == bool(real_beat)
        assert diag["bass_energy"] == pytest.approx(real_bass_energy, abs=TOL)
        assert diag["avg_bass"] == pytest.approx(real_avg_bass, abs=TOL)
        assert diag["current_level"] == pytest.approx(real_level, abs=TOL)
        assert diag["peak_level"] == pytest.approx(real_peak, abs=TOL)
        assert_checks_all_pass(diag)

    def test_beat_actually_fires(self):
        # tiny history + strong bass sine -> energy rule must trigger
        samples = make_samples(amplitude=20000)
        ap = make_live_processor(samples, bass_hist=[1.0, 1.0, 1.0])
        _, real_beat, _, _ = ap.get_all_audio_data()
        diag = audio_diag.diagnose_live(samples, CHUNK, RATE, 1.5,
                                        [1.0, 1.0, 1.0])
        assert real_beat is True or real_beat == np.True_
        assert diag["is_beat"] is True

    @pytest.mark.parametrize("sensitivity", [0.5, 3.0])
    def test_beat_sensitivity_boundaries(self, sensitivity):
        samples = make_samples()
        bass_hist = [5000.0, 6000.0, 5500.0]
        ap = make_live_processor(samples, sensitivity=sensitivity,
                                 bass_hist=bass_hist)
        _, real_beat, real_level, real_peak = ap.get_all_audio_data()
        diag = audio_diag.diagnose_live(samples, CHUNK, RATE, sensitivity,
                                        bass_hist)
        assert diag["is_beat"] == bool(real_beat)
        assert diag["current_level"] == pytest.approx(real_level, abs=TOL)
        assert diag["peak_level"] == pytest.approx(real_peak, abs=TOL)
        # 0.5 and 3.0 are the inclusive bounds -> range check passes
        sens_check = next(c for c in diag["checks"]
                          if c["name"] == "beat_sensitivity_in_range")
        assert sens_check["passed"] is True

    def test_sensitivity_out_of_range_flagged_not_raised(self):
        diag = audio_diag.diagnose_live(make_samples(), CHUNK, RATE, 4.0,
                                        [1.0, 1.0, 1.0])
        sens_check = next(c for c in diag["checks"]
                          if c["name"] == "beat_sensitivity_in_range")
        assert sens_check["passed"] is False
        assert sens_check["reason"]
        assert diag["bass_energy"] is not None  # still computed

    def test_python_list_input_accepted(self):
        samples = make_samples().tolist()
        diag = audio_diag.diagnose_live(samples, CHUNK, RATE, 1.5, [1, 2, 3])
        assert diag["active"] is True
        assert diag["fft_length"] == CHUNK // 2

    def test_invalid_chunk_size_degrades(self):
        diag = audio_diag.diagnose_live(make_samples(), 0, RATE, 1.5, [1, 2, 3])
        assert diag["active"] is False and diag["degraded"] is True
        assert diag["bass_energy"] is None
        assert "bass_energy" in diag["affected_fields"]
        assert any(not c["passed"] and c["reason"] for c in diag["checks"])

    def test_invalid_rate_degrades(self):
        diag = audio_diag.diagnose_live(make_samples(), CHUNK, -1, 1.5, [1, 2, 3])
        assert diag["degraded"] is True
        assert diag["current_level"] is None


# ------------------------------------------------------------------ file chain
class TestFileChain:
    def test_matches_real_processor_normal_path(self):
        fp = make_file_processor(pos_ms=2500, beat_index=1)  # t == 2.5 s
        real_fft, real_beat, _, _ = fp.get_all_audio_data()

        diag = audio_diag.diagnose_file(1025, 100, 10.0, 2.5,
                                        [1.0, 2.5, 4.0], 1)

        expected_col = np.interp(fp.log_spectrogram[:, diag["frame_index"]],
                                 (fp.log_spectrogram[:, diag["frame_index"]].min(),
                                  fp.log_spectrogram[:, diag["frame_index"]].max()),
                                 (0, 100))
        assert np.allclose(real_fft, expected_col)
        assert diag["frame_index"] == min(max(0, int(2.5 * 100 / 10.0)), 99)
        assert diag["is_beat"] == bool(real_beat)
        assert diag["beat_index"] == fp.beat_index
        assert diag["beats_detected_delta"] == fp.beats_detected
        assert diag["fft_length"] == 1025
        assert_checks_all_pass(diag)

    def test_current_time_exactly_on_beat_time(self):
        fp = make_file_processor(pos_ms=4000, beat_index=2)  # t == beat_times[2]
        _, real_beat, _, _ = fp.get_all_audio_data()
        diag = audio_diag.diagnose_file(1025, 100, 10.0, 4.0,
                                        [1.0, 2.5, 4.0], 2)
        assert real_beat is True or real_beat == np.True_
        assert diag["is_beat"] is True
        assert diag["beat_index"] == 3 == fp.beat_index
        assert diag["beats_detected_delta"] == 1 == fp.beats_detected

    def test_no_beat_before_beat_time(self):
        diag = audio_diag.diagnose_file(1025, 100, 10.0, 3.999,
                                        [1.0, 2.5, 4.0], 2)
        assert diag["is_beat"] is False
        assert diag["beat_index"] == 2
        assert diag["beats_detected_delta"] == 0

    def test_zero_duration_degrades(self):
        diag = audio_diag.diagnose_file(1025, 100, 0.0, 2.0, [1.0], 0)
        assert diag["degraded"] is True
        assert diag["frame_index"] is None
        assert "frame_index" in diag["affected_fields"]
        assert diag["fft_length"] == 1025  # unaffected field still reported
        json.dumps(diag)  # no NaN / non-serializable values
        bad = [c for c in diag["checks"] if not c["passed"]]
        assert bad and all(c["reason"] for c in bad)

    def test_zero_columns_degrades(self):
        diag = audio_diag.diagnose_file(1025, 0, 10.0, 2.0, [1.0], 0)
        assert diag["degraded"] is True
        assert diag["frame_index"] is None
        assert "frame_index" in diag["affected_fields"]
        json.dumps(diag)

    def test_frame_index_clamped_to_last_column(self):
        diag = audio_diag.diagnose_file(1025, 100, 10.0, 10.0, [], 0)
        assert diag["frame_index"] == 99


# ------------------------------------------------------------- audit_audio()
class TestAuditAudio:
    def test_live_stream_inactive_not_diagnosable(self):
        fake = types.SimpleNamespace(
            audio_mode="live",
            audio_processor=types.SimpleNamespace(is_active=False, stream=None))
        out = main.HotVisualizer.audit_audio(fake)
        assert out == {"chain": "live", "diagnosable": False,
                       "reason": out["reason"], "result": None}
        assert out["reason"]
        json.dumps(out)

    def test_live_active_returns_diag_result(self):
        samples = make_samples()
        ap = make_live_processor(samples)
        fake = types.SimpleNamespace(audio_mode="live", audio_processor=ap)
        out = main.HotVisualizer.audit_audio(fake)
        assert out["diagnosable"] is True
        assert out["result"]["chain"] == "live"
        assert out["result"]["fft_length"] == CHUNK // 2
        json.dumps(out)

    def test_file_not_analyzed_not_diagnosable(self):
        fake = types.SimpleNamespace(
            audio_mode="file",
            file_processor=types.SimpleNamespace(is_analyzed=False,
                                                 log_spectrogram=None))
        out = main.HotVisualizer.audit_audio(fake)
        assert out["chain"] == "file" and out["diagnosable"] is False
        assert out["result"] is None and out["reason"]
        json.dumps(out)

    def test_file_analyzed_matches_pure_function(self):
        fp = make_file_processor(pos_ms=2500, beat_index=1)
        fp.get_position = lambda: 2.5
        fake = types.SimpleNamespace(audio_mode="file", file_processor=fp)
        out = main.HotVisualizer.audit_audio(fake)
        assert out["diagnosable"] is True
        expected = audio_diag.diagnose_file(1025, 100, 10.0, 2.5,
                                            [1.0, 2.5, 4.0], 1)
        assert out["result"] == expected
        assert fp.beat_index == 1  # audit must not advance the beat state
        json.dumps(out)


# ------------------------------------------------------------------ JSON
class TestJsonSerializable:
    def test_live_result_json_roundtrip(self):
        diag = audio_diag.diagnose_live(make_samples(), CHUNK, RATE, 1.5,
                                        [1.0, 2.0, 3.0], prev_peak_level=5.0)
        assert json.loads(json.dumps(diag)) == diag

    def test_file_result_json_roundtrip(self):
        diag = audio_diag.diagnose_file(1025, 100, 10.0, 2.5, [1.0, 2.5], 1)
        assert json.loads(json.dumps(diag)) == diag

    def test_degraded_results_json_roundtrip(self):
        for diag in (audio_diag.diagnose_live([], 0, 0, 9.9, []),
                     audio_diag.diagnose_file(0, 0, 0.0, -1.0, [], 0)):
            assert json.loads(json.dumps(diag)) == diag
