#!/usr/bin/env python3
"""Key a generated clip shot on a flat colour plate into real alpha, frame by frame.

    python3 key.py clip.mp4 --stacked out.mp4 [--width 1080]          # H.264 colour over matte, any browser
    python3 key.py clip.mp4 --webm out.webm [--width 720]             # VP9 with alpha (Chrome, Firefox, Edge)
    python3 key.py clip.mp4 --frames out_dir [--width 960 --step 2]   # RGBA WebP sequence + manifest.json
    python3 key.py clip.mp4 --png out_dir --frame-list 0,30,60        # full-size RGBA PNGs to inspect
    python3 key.py image.png --png out_dir                            # stills work too

--key magenta (default) | green | blue. The plate colour is measured per frame from the
frame's own border (top band and upper side columns, where the subject rarely reaches),
because video models drift it: a #FF00FF plate can come back pale pink halfway through.

Matte: the key's "excess" e (magenta: min(R,B) - G; green: G - max(R,B); blue: B - max(R,G))
is high on the plate and low on the subject. With K the frame's plate colour:
    a = (0.97 e_K - e) / (0.97 e_K - solid)    clipped to 0..1
Edges are then unmixed against K, F = (C - (1 - a) K) / a, which recovers the real edge
colour instead of a tinted fringe; whatever spill survives is clamped.

Colour under fully transparent pixels is the subject's own edge colour pushed outward. Video
and lossy WebP subsample chroma, so whatever sits next to an edge bleeds into it: a flat fill
there draws a coloured line round the subject.

Needs: pip install numpy opencv-python-headless pillow; ffmpeg on PATH.
"""
import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

EXCESS = {
    "magenta": lambda f: np.minimum(f[..., 0], f[..., 2]) - f[..., 1],
    "green": lambda f: f[..., 1] - np.maximum(f[..., 0], f[..., 2]),
    "blue": lambda f: f[..., 2] - np.maximum(f[..., 0], f[..., 1]),
}
# channel a surviving spill shows up in, and the channels whose max caps it at the edge
SPILL = {"magenta": (2, (1, 1)), "green": (1, (0, 2)), "blue": (2, (0, 1))}


def frames(path):
    if Path(path).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
        yield np.array(Image.open(path).convert("RGB"))
        return
    cap = cv2.VideoCapture(str(path))
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        yield cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    cap.release()


def fps_of(path):
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    cap.release()
    return fps


def plate_colour(rgb):
    h, w, _ = rgb.shape
    b = max(4, w // 100)
    ring = np.concatenate([rgb[:b].reshape(-1, 3), rgb[: int(h * 0.7), :b].reshape(-1, 3),
                           rgb[: int(h * 0.7), -b:].reshape(-1, 3)])
    return np.median(ring, axis=0)


def key(rgb, opts):
    excess = EXCESS[opts.key]
    k = plate_colour(rgb)
    k_ex = float(excess(k[None, None].astype(np.float32))[0, 0])
    if k_ex < opts.solid + 8:
        raise SystemExit(f"plate colour {k.round().tolist()} is not a {opts.key} plate (excess {k_ex:.0f}); "
                         f"check --key, or the subject touches the top edge")
    high = 0.97 * k_ex
    f = rgb.astype(np.float32)
    a = np.clip((high - excess(f)) / max(high - opts.solid, 1.0), 0.0, 1.0)
    ka = np.maximum(a, 0.25)[..., None]  # floor keeps compression noise from exploding
    f = np.where((a < 0.999)[..., None], (f - (1 - ka) * k.astype(np.float32)) / ka, f)
    f = np.clip(f, 0, 255)
    a8 = (a * 255).astype(np.uint8)
    a8 = cv2.morphologyEx(a8, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    a8 = cv2.morphologyEx(a8, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    if opts.erode:
        a8 = cv2.erode(a8, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=opts.erode)
    a = cv2.GaussianBlur(a8, (0, 0), 0.6).astype(np.float32) / 255.0
    # spill that survives the unmix: magenta shows as excess blue (red is left alone so red
    # subjects keep their edges), green and blue as excess of their own channel
    c, others = SPILL[opts.key]
    cap = np.maximum(f[..., others[0]], f[..., others[1]]) + opts.solid * (2 if opts.key == "magenta" else 1)
    f[..., c] = np.where(a < 0.999, np.minimum(f[..., c], cap), f[..., c])
    return f.astype(np.uint8), a, k


def under_colour(col, a, fill):
    f = col.astype(np.float32)
    w = a.astype(np.float32)
    out = np.empty_like(f)
    out[:] = np.array(fill, np.float32)
    have = np.zeros(a.shape, bool)
    for sigma in (3, 10):
        den = cv2.GaussianBlur(w, (0, 0), sigma)
        num = cv2.GaussianBlur(f * w[..., None], (0, 0), sigma)
        ok = (den > 1e-3) & ~have
        out[ok] = num[ok] / den[ok][..., None]
        have |= ok
    near = cv2.dilate((a > 0.02).astype(np.uint8), np.ones((33, 33), np.uint8)) > 0
    out[~near] = np.array(fill, np.float32)
    return np.where((a > 0.02)[..., None], f, out).astype(np.uint8)


def resize(img, width):
    if not width or img.shape[1] == width:
        return img
    h = round(img.shape[0] * width / img.shape[1] / 2) * 2
    return cv2.resize(img, (width, h), interpolation=cv2.INTER_AREA)


def size_for(clip, width):
    first = next(frames(clip))
    w = (width or first.shape[1]) // 2 * 2
    return w, round(first.shape[0] * w / first.shape[1] / 2) * 2


def pipe(cmd):
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def write_stacked(clip, out, opts):
    w, h = size_for(clip, opts.width)
    fps = opts.fps or fps_of(clip)
    proc = pipe(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h * 2}",
                 "-r", str(fps), "-i", "-", "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p",
                 "-crf", str(opts.crf), "-preset", "slow", "-movflags", "+faststart", "-an", str(out)])
    n = 0
    for rgb in frames(clip):
        col, a, _ = key(rgb, opts)
        col = cv2.resize(under_colour(col, a, opts.fill_rgb), (w, h), interpolation=cv2.INTER_AREA)
        m = cv2.resize((a * 255).astype(np.uint8), (w, h), interpolation=cv2.INTER_AREA)
        proc.stdin.write(np.vstack([col, np.repeat(m[..., None], 3, axis=2)]).tobytes())
        n += 1
    proc.stdin.close()
    proc.wait()
    print(json.dumps({"out": str(out), "kind": "stacked", "frames": n, "width": w, "height": h, "fps": fps}))


def write_webm(clip, out, opts):
    w, h = size_for(clip, opts.width)
    fps = opts.fps or fps_of(clip)
    proc = pipe(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{w}x{h}",
                 "-r", str(fps), "-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0",
                 "-crf", str(opts.crf + 10), "-auto-alt-ref", "0", "-row-mt", "1", "-an", str(out)])
    n = 0
    for rgb in frames(clip):
        col, a, _ = key(rgb, opts)
        rgba = np.dstack([under_colour(col, a, opts.fill_rgb), (a * 255).astype(np.uint8)])
        proc.stdin.write(cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA).tobytes())
        n += 1
    proc.stdin.close()
    proc.wait()
    print(json.dumps({"out": str(out), "kind": "webm", "frames": n, "width": w, "height": h, "fps": fps}))


def write_frames(clip, out_dir, opts):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    picks = {int(x) for x in opts.picks.split(",")} if opts.picks else None
    picked = []
    for i, rgb in enumerate(frames(clip)):
        if picks is not None:
            if i not in picks:
                continue
        elif i < opts.start or (opts.end is not None and i > opts.end) or (i - opts.start) % opts.step:
            continue
        col, a, _ = key(rgb, opts)
        rgba = resize(np.dstack([under_colour(col, a, opts.fill_rgb), (a * 255).astype(np.uint8)]), opts.width)
        Image.fromarray(rgba).save(out_dir / f"{len(picked):03d}.webp", "WEBP", quality=opts.quality, method=6,
                                   alpha_quality=90)
        picked.append(i)
    w, h = Image.open(out_dir / "000.webp").size
    (out_dir / "manifest.json").write_text(json.dumps({"count": len(picked), "width": w, "height": h,
                                                      "pattern": "{i:03d}.webp", "source_frames": picked}))
    print(json.dumps({"out": str(out_dir), "kind": "frames", "count": len(picked), "width": w, "height": h}))


def write_png(clip, out_dir, opts):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    want = {int(x) for x in opts.frame_list.split(",")}
    for i, rgb in enumerate(frames(clip)):
        if i in want:
            col, a, k = key(rgb, opts)
            Image.fromarray(np.dstack([col, (a * 255).astype(np.uint8)])).save(out_dir / f"f{i:03d}.png")
            print(f"frame {i}: plate {k.round().astype(int).tolist()}, {100 * (a > 0.5).mean():.1f}% subject")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("clip")
    ap.add_argument("--stacked", help="H.264 mp4, colour on top, matte below")
    ap.add_argument("--webm", help="VP9 webm with an alpha channel")
    ap.add_argument("--frames", help="directory for an RGBA WebP sequence")
    ap.add_argument("--png", help="directory for full-size RGBA PNGs")
    ap.add_argument("--key", choices=list(EXCESS), default="magenta")
    ap.add_argument("--frame-list", default="0")
    ap.add_argument("--width", type=int)
    ap.add_argument("--fps", type=float)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int)
    ap.add_argument("--step", type=int, default=1)
    ap.add_argument("--picks", help="comma list of source frames for --frames")
    ap.add_argument("--quality", type=int, default=82, help="WebP quality")
    ap.add_argument("--crf", type=int, default=20)
    ap.add_argument("--solid", type=float, default=12, help="key excess at or below this is solid subject")
    ap.add_argument("--erode", type=int, default=0, help="shave N px off the matte edge")
    ap.add_argument("--fill", default="808080", help="hex colour far from the subject under alpha 0")
    opts = ap.parse_args()
    opts.fill_rgb = [int(opts.fill[i:i + 2], 16) for i in (0, 2, 4)]
    if not any([opts.stacked, opts.webm, opts.frames, opts.png]):
        ap.error("choose at least one of --stacked, --webm, --frames, --png")
    if opts.stacked:
        write_stacked(opts.clip, opts.stacked, opts)
    if opts.webm:
        write_webm(opts.clip, opts.webm, opts)
    if opts.frames:
        write_frames(opts.clip, opts.frames, opts)
    if opts.png:
        write_png(opts.clip, opts.png, opts)


if __name__ == "__main__":
    main()
