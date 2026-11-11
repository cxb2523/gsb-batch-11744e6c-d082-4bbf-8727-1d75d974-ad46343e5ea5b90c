"""Light promo sound effects, synthesized with numpy (48 kHz stereo WAV).
   python sfx.py <out-dir>
   ding.wav    pick up the thread: small music-box bell
   arp.wav     connect: rising music-box arpeggio (C pentatonic, matches the game)
   whoosh.wav  color spreading: soft airy swell with a few sparkles
   pop.wav     greeting bubble"""
import sys, wave
from pathlib import Path
import numpy as np

SR = 48000
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)

def bell(freq, dur=1.2, amp=0.5, decay=4.0):
    t = np.arange(int(SR * dur)) / SR
    env = np.exp(-t * decay) * np.minimum(1, t / 0.003)
    tone = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 3)
            + 0.18 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6) + 0.08 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t * 12))
    return amp * env * tone

def place(buffer, sound, at):
    i = int(at * SR)
    end = min(len(buffer), i + len(sound))
    buffer[i:end] += sound[:end - i]

def save(name, mono, pan=0.0, width=0.0):
    mono = mono / max(1e-6, np.max(np.abs(mono))) * 0.89
    left = mono * (1 - max(0, pan)) ; right = mono * (1 + min(0, pan))
    if width:  # tiny Haas widening
        d = int(SR * 0.004 * width)
        right = np.concatenate([np.zeros(d), right[:-d]])
    data = (np.stack([left, right], axis=1) * 32767).astype(np.int16)
    with wave.open(str(out / name), 'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes(data.tobytes())

midi = lambda m: 440 * 2 ** ((m - 69) / 12)

# ding: two quick bell notes (E6, A6)
d = np.zeros(int(SR * 1.4))
place(d, bell(midi(88), 1.2, 0.8, 5), 0.0)
place(d, bell(midi(93), 1.2, 0.55, 5), 0.07)
save('ding.wav', d, width=1)

# arp: C6 D6 E6 G6 A6 C7 E7, 75 ms apart, last note rings
a = np.zeros(int(SR * 2.4))
for k, m in enumerate([84, 86, 88, 91, 93, 96, 100]):
    place(a, bell(midi(m), 1.6, 0.55 + 0.05 * k, 3.2 if k == 6 else 4.5), k * 0.075)
save('arp.wav', a, width=1)

# whoosh: band-passed noise swell (FFT-shaped per block), plus sparkles
dur = 2.0; n = int(SR * dur); t = np.arange(n) / SR
noise = rng.standard_normal(n)
spec = np.fft.rfft(noise); f = np.fft.rfftfreq(n, 1 / SR)
spec *= np.exp(-((np.log(f + 1) - np.log(1400)) ** 2) / 0.9)
air = np.fft.irfft(spec, n)
env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2 * np.exp(-t * 0.6)
w = air / np.max(np.abs(air)) * env * 0.7
for k in range(9):
    place(w, bell(midi(rng.choice([96, 98, 100, 103, 105, 108])), 0.6, 0.12, 9), 0.25 + k * 0.13 + rng.random() * 0.05)
save('whoosh.wav', w, width=2)

# pop: quick pitch-drop blip with a soft click
n = int(SR * 0.18); t = np.arange(n) / SR
freq = 950 * np.exp(-t * 9) + 420
phase = 2 * np.pi * np.cumsum(freq) / SR
p = np.sin(phase) * np.exp(-t * 28) * np.minimum(1, t / 0.002)
p[:int(SR * 0.004)] += rng.standard_normal(int(SR * 0.004)) * 0.15
save('pop.wav', p)
print('ok', sorted(x.name for x in out.iterdir()))
