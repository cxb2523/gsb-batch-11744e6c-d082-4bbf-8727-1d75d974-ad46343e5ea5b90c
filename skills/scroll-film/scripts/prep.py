#!/usr/bin/env python3
"""Turn rendered clips into scroll-film assets: WebP frame sequences and scrub-ready MP4.

    python3 prep.py frames leg1.mp4 [leg2.mp4 ...] OUT_DIR [--width 1600] [--fps 24] [--quality 78]
    python3 prep.py video  leg1.mp4 [leg2.mp4 ...] OUT.mp4 [--width 1920] [--gop 4]
    python3 prep.py seams  leg1.mp4 leg2.mp4 [...]

frames: extracts every leg in order into one numbered sequence (000.webp ...) plus
manifest.json, dropping each later leg's first frame, which repeats the previous leg's last
frame when the legs were chained with start/end frames. Make two sets, lg and sm.
video: joins the legs into one MP4 with a short GOP and no B-frames, so setting currentTime
lands fast in every browser. A normal export (GOP 250) makes scrubbing stutter.
seams: measures how well each leg's last frame matches the next leg's first frame (mean
absolute difference, 0..255). Under ~4 is invisible, over ~10 shows as a jump; regenerate
the leg or re-anchor it on the exact previous frame.

Needs: ffmpeg + ffprobe on PATH; pillow for seams (pip install pillow numpy).
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path


def run(cmd):
    subprocess.run(cmd, check=True)


def last_frame(path, out):
    run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.25", "-i", str(path), "-update", "1", "-q:v", "1", str(out)])


def first_frame(path, out):
    run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-frames:v", "1", "-q:v", "1", str(out)])


def cmd_frames(a):
    # ffmpeg writes PNGs and Pillow encodes the WebP: many ffmpeg builds ship without libwebp
    from PIL import Image
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    with tempfile.TemporaryDirectory() as tmp:
        for li, leg in enumerate(a.legs):
            d = Path(tmp) / f"leg{li}"
            d.mkdir()
            vf = f"fps={a.fps},scale={a.width}:-2:flags=lanczos"
            run(["ffmpeg", "-v", "error", "-y", "-i", leg, "-vf", vf, "-start_number", "0", str(d / "%05d.png")])
            files = sorted(d.glob("*.png"))
            if li > 0 and not a.keep_joins:
                files = files[1:]
            for f in files:
                Image.open(f).save(out / f"{n:03d}.webp", "WEBP", quality=a.quality, method=6)
                n += 1
    w, h = Image.open(out / "000.webp").size
    size = sum(f.stat().st_size for f in out.glob("*.webp"))
    (out / "manifest.json").write_text(json.dumps({"count": n, "width": w, "height": h, "fps": a.fps,
                                                  "pattern": "{i:03d}.webp", "bytes": size}))
    print(f"{out}: {n} frames {w}x{h}, {size / 1e6:.1f} MB ({size / n / 1e3:.0f} kB a frame)")


def cmd_video(a):
    with tempfile.TemporaryDirectory() as tmp:
        lst = Path(tmp) / "list.txt"
        lst.write_text("".join(f"file '{Path(p).resolve()}'\n" for p in a.legs))
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-vf", f"scale={a.width}:-2:flags=lanczos,fps={a.fps}", "-c:v", "libx264", "-preset", "slow",
             "-crf", str(a.crf), "-g", str(a.gop), "-keyint_min", str(a.gop), "-bf", "0", "-sc_threshold", "0",
             "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", a.out])
    print(f"wrote {a.out} (GOP {a.gop}, no B-frames, {Path(a.out).stat().st_size / 1e6:.1f} MB)")


def cmd_seams(a):
    import numpy as np
    from PIL import Image
    worst = 0
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(len(a.legs) - 1):
            l, f = Path(tmp) / "l.png", Path(tmp) / "f.png"
            last_frame(a.legs[i], l)
            first_frame(a.legs[i + 1], f)
            A = np.asarray(Image.open(l).convert("RGB"), np.float32)
            B = Image.open(f).convert("RGB")
            if B.size != (A.shape[1], A.shape[0]):
                B = B.resize((A.shape[1], A.shape[0]), Image.LANCZOS)
            d = float(np.abs(A - np.asarray(B, np.float32)).mean())
            worst = max(worst, d)
            verdict = "clean" if d < 4 else "visible" if d > 10 else "check by eye"
            print(f"{Path(a.legs[i]).name} -> {Path(a.legs[i + 1]).name}: {d:.2f}  {verdict}")
    raise SystemExit(1 if worst > 10 else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("frames")
    f.add_argument("legs", nargs="+")
    f.add_argument("out")
    f.add_argument("--width", type=int, default=1600)
    f.add_argument("--fps", type=float, default=24)
    f.add_argument("--quality", type=int, default=78)
    f.add_argument("--keep-joins", action="store_true", help="keep each leg's first frame")
    v = sub.add_parser("video")
    v.add_argument("legs", nargs="+")
    v.add_argument("out")
    v.add_argument("--width", type=int, default=1920)
    v.add_argument("--fps", type=float, default=24)
    v.add_argument("--gop", type=int, default=4)
    v.add_argument("--crf", type=int, default=20)
    s = sub.add_parser("seams")
    s.add_argument("legs", nargs="+")
    a = ap.parse_args()
    if a.cmd in ("frames", "video") and len(a.legs) < 1:
        ap.error("give at least one clip")
    {"frames": cmd_frames, "video": cmd_video, "seams": cmd_seams}[a.cmd](a)


if __name__ == "__main__":
    main()
