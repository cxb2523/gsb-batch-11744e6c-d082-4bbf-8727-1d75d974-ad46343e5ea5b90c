"""QA for a rendered promo: stream info, full decode, loudness, SFX headroom,
and 390 px-wide phone previews of caption frames.
   python qa.py <video.mp4> <out-dir>"""
import json, re, subprocess, sys
from pathlib import Path

FF = 'ffmpeg'
video, out = sys.argv[1], Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
run = lambda *a: subprocess.run(a, capture_output=True, text=True)
info = json.loads(run('ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames,duration,r_frame_rate',
                      '-show_entries', 'format=size', '-of', 'json', video).stdout)
decode = run(FF, '-v', 'error', '-i', video, '-f', 'null', '-')
loud = run(FF, '-hide_banner', '-i', video, '-af', 'ebur128=peak=true', '-f', 'null', '-').stderr
summary = loud[loud.rfind('Summary'):]
def num(label):
    m = re.search(label + r'\s+(-?[\d.]+)', summary); return float(m.group(1)) if m else None
peaks = {}
for t in [10.5, 15.3, 16.6, 28.3, 28.6, 40.0, 42.9]:
    r = run(FF, '-hide_banner', '-ss', str(t), '-t', '0.6', '-i', video, '-af', 'volumedetect', '-f', 'null', '-').stderr
    m = re.search(r'max_volume: (-?[\d.]+)', r); peaks[t] = float(m.group(1)) if m else None
for k, t in enumerate([6.0, 12.0, 24.0, 29.5, 35.0, 40.0]):
    run(FF, '-y', '-loglevel', 'error', '-ss', str(t), '-i', video, '-frames:v', '1', '-vf', 'scale=390:-1', str(out / f'phone390-{k}.png'))
run(FF, '-y', '-loglevel', 'error', *sum([['-i', str(out / f'phone390-{k}.png')] for k in range(6)], []),
    '-filter_complex', 'xstack=inputs=6:layout=0_0|w0_0|0_h0|w0_h0|0_h0+h2|w0_h0+h2', str(out / 'phone390-sheet.png'))
print(json.dumps({'streams': info['streams'], 'bytes': int(info['format']['size']), 'decode_errors': decode.stderr.strip()[:300],
                  'integrated_lufs': num('I:'), 'lra': num('LRA:'), 'true_peak_dbfs': num('Peak:'), 'max_volume_at': peaks}, indent=1))
