"""Beat / downbeat / section analysis for the promo music (librosa 1.x).
   python beats.py <audio> <seconds> <out.json>"""
import json, sys
import numpy as np, librosa

path, limit, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
y, sr = librosa.load(path, sr=22050, mono=True, duration=limit)
onset = librosa.onset.onset_strength(y=y, sr=sr)
tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, units='frames')
beat_times = librosa.frames_to_time(beats, sr=sr)
# Downbeat candidates: for each of the 4 phases, mean low-frequency energy on those beats.
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[freqs < 200].sum(axis=0)
low = low / (low.max() + 1e-9)
phase_scores = []
for phase in range(4):
    idx = beats[phase::4]
    idx = idx[idx < len(low)]
    phase_scores.append(float(low[idx].mean()) if len(idx) else 0)
best = int(np.argmax(phase_scores))
bars = beat_times[best::4]
chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
rms = librosa.feature.rms(y=y)[0]
n = min(chroma.shape[1], len(rms))
bounds = librosa.segment.agglomerative(np.vstack([chroma[:, :n], rms[None, :n] * 4]), 10)
bound_times = librosa.frames_to_time(bounds, sr=sr)
rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
loud = [round(float(rms[(rms_t >= t) & (rms_t < t + 2)].mean()), 4) for t in np.arange(0, limit, 2)]
result = {
    'method': 'librosa 1.0 beat_track on onset strength; downbeat phase = beat phase (of 4) with highest mean <200 Hz energy; sections = agglomerative(chroma+rms, 10)',
    'tempo': float(np.atleast_1d(tempo)[0]), 'beats': [round(float(t), 3) for t in beat_times],
    'downbeat_phase': best, 'phase_scores': [round(s, 3) for s in phase_scores],
    'bars': [round(float(t), 3) for t in bars], 'sections': [round(float(t), 2) for t in bound_times],
    'rms_per_2s': loud,
}
json.dump(result, open(out, 'w'))
print('tempo', result['tempo'], 'phase', best, result['phase_scores'])
print('bars', result['bars'][:40])
print('sections', result['sections'])
print('rms', loud)
