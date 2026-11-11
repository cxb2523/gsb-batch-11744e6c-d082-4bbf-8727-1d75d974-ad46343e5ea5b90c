"""Assemble the promo from captured 4K frame sequences, transparent overlays,
music and sound effects with one ffmpeg graph.
   python compose.py timeline.json <variant: zh|en|clean> <out.mp4> [--scale 1920]
Shots are contiguous (hard cuts on bar lines); `hold` clones the last frame.
`{lang}` in paths resolves to the variant language (clean uses zh frames)."""
import json, os, shutil, subprocess, sys
from pathlib import Path

timeline_path, variant, out = sys.argv[1], sys.argv[2], sys.argv[3]
scale = int(sys.argv[sys.argv.index('--scale') + 1]) if '--scale' in sys.argv else 0
T = json.loads(Path(timeline_path).read_text())
# Relative paths in the timeline are relative to the repository root.
REPO = Path(__file__).resolve().parents[2]
root = REPO / T['root']
fps = T['fps']
lang = 'zh' if variant == 'clean' else variant
sub = lambda s: s.replace('{lang}', lang)

inputs, filters = [], []
def add_input(args):
    inputs.extend(args)
    return sum(1 for a in inputs if a == '-i') - 1

# ---- video: shots
labels, t = [], 0.0
for k, shot in enumerate(T['shots']):
    src = root / sub(shot['dir'])
    i = add_input(['-framerate', str(fps), '-start_number', str(shot['from']), '-i', str(src / '%05d.jpg')])
    frames, hold = shot['frames'], shot.get('hold', 0)
    chain = f"[{i}:v]trim=end_frame={frames},setpts=PTS-STARTPTS"
    if hold: chain += f",tpad=stop_mode=clone:stop={hold}"
    chain += f",fps={fps},format=rgb24[s{k}]"
    filters.append(chain)
    labels.append(f"[s{k}]")
    shot['_start'] = t
    t += (frames + hold) / fps
total = t
filters.append(f"{''.join(labels)}concat=n={len(labels)}:v=1:a=0[base0]")

# ---- overlays
cur = 'base0'
for k, ov in enumerate(T['overlays']):
    if variant == 'clean' and not ov.get('keep_clean'): continue
    if variant != 'clean' and ov.get('clean_only'): continue
    png = root / T.get('overlay_dir', 'overlays') / sub(ov['png'])
    start, end, fade = ov['start'], ov['end'], ov.get('fade', 0.3)
    dur = end - start
    i = add_input(['-loop', '1', '-framerate', str(fps), '-t', f'{dur:.3f}', '-i', str(png)])
    chain = f"[{i}:v]format=rgba"
    if ov.get('fade_in', True): chain += f",fade=t=in:st=0:d={fade}:alpha=1"
    if ov.get('fade_out', True): chain += f",fade=t=out:st={max(0, dur - fade):.3f}:d={fade}:alpha=1"
    chain += f",setpts=PTS+{start:.3f}/TB[o{k}]"
    filters.append(chain)
    filters.append(f"[{cur}][o{k}]overlay=eof_action=pass:enable='between(t,{start:.3f},{end:.3f})'[v{k}]")
    cur = f"v{k}"
vf = f"[{cur}]" + (f"scale={scale}:-2:flags=lanczos," if scale else '') + "format=yuv420p[vout]"
filters.append(vf)

# ---- audio: music + sfx
m = T['music']
music = os.environ.get('PROMO_MUSIC') or str(REPO / m['file'])
mi = add_input(['-ss', str(m['start']), '-t', f"{total + 0.5:.3f}", '-i', music])
fade_start = total - m['fade_out']
filters.append(f"[{mi}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={m.get('gain_db', 0)}dB,afade=t=in:st=0:d=0.15,afade=t=out:st={fade_start:.3f}:d={m['fade_out']},atrim=end={total:.3f}[mus]")
mix = ['[mus]']
for k, fx in enumerate(T['sfx']):
    fi = add_input(['-i', str(root / 'sfx' / fx['file'])])
    delay = int(fx['at'] * 1000)
    filters.append(f"[{fi}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={fx.get('gain_db', -8)}dB,adelay={delay}|{delay}[fx{k}]")
    mix.append(f"[fx{k}]")
filters.append(f"{''.join(mix)}amix=inputs={len(mix)}:normalize=0:dropout_transition=0,volume={T.get('master_gain_db', 0)}dB,alimiter=limit=0.93:level=false,atrim=end={total:.3f}[aout]")

crf = '20' if scale else '17'
cmd = [shutil.which('ffmpeg') or 'ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(filters),
       '-map', '[vout]', '-map', '[aout]', '-r', str(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', crf,
       '-profile:v', 'high', '-c:a', 'aac', '-b:a', '256k', '-t', f'{total:.3f}', '-movflags', '+faststart', out]
Path(out).parent.mkdir(parents=True, exist_ok=True)
subprocess.run(cmd, check=True)
print(json.dumps({'out': out, 'seconds': round(total, 3), 'shots': [(s['name'], round(s['_start'], 3)) for s in T['shots']]}))
