#!/usr/bin/env python3
"""Put two clips against each other, stacked or side by side, each with a label.

    python3 compare.py A.mp4 B.mp4 OUT.mp4 --labels "Model A" "Model B"
           [--layout stack|side] [--width 1080] [--fps 30] [--bg f1ece4] [--ink 1c1a17]
           [--radius 24] [--gap 40] [--margin 56] [--font /path/to/font.ttf]

Both clips are scaled to the same panel width, given rounded corners and laid on a flat
background with a label above each panel. The output runs as long as the longer clip; the
shorter one holds its last frame. Audio is dropped: a comparison should be judged on the
picture, and two soundtracks fight. Labels are drawn with Pillow, so ffmpeg needs no
drawtext/fontconfig build.

Needs: pip install pillow; ffmpeg and ffprobe on PATH.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_GUESSES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height:format=duration", "-of", "json", path],
                         check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return s["width"], s["height"], float(j["format"]["duration"])


def font(path, size):
    for p in [path] + FONT_GUESSES:
        if p and Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def rgb(hexstr):
    return tuple(int(hexstr[i:i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("out")
    ap.add_argument("--labels", nargs=2, default=["A", "B"])
    ap.add_argument("--layout", choices=["stack", "side"], default="stack")
    ap.add_argument("--width", type=int, default=1080, help="panel width in px")
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--bg", default="f1ece4")
    ap.add_argument("--ink", default="1c1a17")
    ap.add_argument("--radius", type=int, default=24)
    ap.add_argument("--gap", type=int, default=40)
    ap.add_argument("--margin", type=int, default=56)
    ap.add_argument("--font", default="")
    ap.add_argument("--crf", type=int, default=16)
    args = ap.parse_args()

    clips = [probe(args.a), probe(args.b)]
    pw = args.width // 2 * 2
    ph = [round(pw * h / w / 2) * 2 for w, h, _ in clips]
    label_h = round(pw * 0.075)
    duration = max(d for _, _, d in clips)
    m, g = args.margin, args.gap
    if args.layout == "stack":
        W = pw + 2 * m
        H = m + label_h + ph[0] + g + label_h + ph[1] + m
        slots = [(m, m + label_h), (m, m + label_h + ph[0] + g + label_h)]
    else:
        W = 2 * pw + 2 * m + g
        H = m + label_h + max(ph) + m
        slots = [(m, m + label_h), (m + pw + g, m + label_h)]
    W, H = W // 2 * 2, H // 2 * 2

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        base = Image.new("RGB", (W, H), rgb(args.bg))
        draw = ImageDraw.Draw(base)
        f = font(args.font, round(label_h * 0.5))
        for (x, y), text in zip(slots, args.labels):
            draw.text((x + 2, y - label_h * 0.22), text, font=f, fill=rgb(args.ink), anchor="ls")
        base.save(tmp / "base.png")
        masks = []
        for i, hgt in enumerate(ph):
            mk = Image.new("L", (pw, hgt), 0)
            ImageDraw.Draw(mk).rounded_rectangle([0, 0, pw - 1, hgt - 1], radius=args.radius, fill=255)
            mk.save(tmp / f"mask{i}.png")
            masks.append(str(tmp / f"mask{i}.png"))

        fc = []
        for i in range(2):
            fc.append(f"[{i}:v]fps={args.fps},scale={pw}:{ph[i]}:flags=lanczos,format=rgba,"
                      f"tpad=stop_mode=clone:stop_duration={duration}[v{i}]")
            fc.append(f"[{i + 3}:v]format=gray,loop=-1:1:0[m{i}]")
            fc.append(f"[v{i}][m{i}]alphamerge[p{i}]")
        fc.append("[2:v]loop=-1:1:0[bg]")
        fc.append(f"[bg][p0]overlay={slots[0][0]}:{slots[0][1]}:shortest=0[t0]")
        fc.append(f"[t0][p1]overlay={slots[1][0]}:{slots[1][1]}:shortest=0,format=yuv420p[out]")
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", args.a, "-i", args.b, "-i", str(tmp / "base.png"),
               "-i", masks[0], "-i", masks[1], "-filter_complex", ";".join(fc), "-map", "[out]",
               "-t", f"{duration:.3f}", "-r", str(args.fps), "-c:v", "libx264", "-preset", "slow",
               "-crf", str(args.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", args.out]
        subprocess.run(cmd, check=True)
    print(f"wrote {args.out}: {W}x{H}, {duration:.2f}s, {args.layout}")


if __name__ == "__main__":
    main()
