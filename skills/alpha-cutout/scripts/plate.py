#!/usr/bin/env python3
"""Put a cut-out subject on a flat key plate, ready to animate with an image-to-video model.

    python3 plate.py subject.png plate.png [--key auto|magenta|green|blue] [--size 1350x1800]
                     [--fit 0.82] [--anchor bottom|center] [--margin 0.04]

subject.png must have alpha (cut it out first: rembg, Apple Vision, Photoshop, any tool).
The subject is scaled to --fit of the plate height and placed on a pure key colour with
room to move: a serve, a jump or a head turn needs headroom the still never had.

--key auto picks the key colour the subject collides with least, and every run prints the
collision report: the share of the subject's opaque pixels whose own key excess is close
to the plate's. Above about 0.5% the key will eat into the subject; pick another key or
recolour those details before generating anything.
"""
import argparse

import numpy as np
from PIL import Image

PLATES = {"magenta": (255, 0, 255), "green": (0, 255, 0), "blue": (0, 0, 255)}
EXCESS = {
    "magenta": lambda f: np.minimum(f[..., 0], f[..., 2]) - f[..., 1],
    "green": lambda f: f[..., 1] - np.maximum(f[..., 0], f[..., 2]),
    "blue": lambda f: f[..., 2] - np.maximum(f[..., 0], f[..., 1]),
}


def collisions(rgba):
    f = rgba[..., :3].astype(np.float32)
    opaque = rgba[..., 3] > 200
    out = {}
    for name, ex in EXCESS.items():
        e = ex(f)[opaque]
        out[name] = (float((e > 60).mean() * 100), float(np.percentile(e, 99.5)) if e.size else 0.0)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("subject")
    ap.add_argument("out")
    ap.add_argument("--key", choices=["auto", *PLATES], default="auto")
    ap.add_argument("--size", default="1350x1800", help="plate size WxH; match the video model's aspect")
    ap.add_argument("--fit", type=float, default=0.82, help="subject height as a share of the plate")
    ap.add_argument("--anchor", choices=["bottom", "center"], default="bottom")
    ap.add_argument("--margin", type=float, default=0.04, help="gap below the subject, share of height")
    args = ap.parse_args()

    im = Image.open(args.subject)
    if im.mode != "RGBA" or im.getchannel("A").getextrema()[0] == 255:
        raise SystemExit("subject has no transparency; cut it out first")
    im = im.crop(im.getchannel("A").getbbox())
    rgba = np.array(im)
    report = collisions(rgba)
    for name, (share, p995) in report.items():
        print(f"{name:8s} {share:5.2f}% of the subject would key out (99.5th pct excess {p995:.0f})")
    key = min(report, key=lambda k: report[k][0]) if args.key == "auto" else args.key
    if report[key][0] > 0.5:
        print(f"warning: {report[key][0]:.2f}% of the subject is close to {key}; the key will bite into it")

    W, H = (int(v) for v in args.size.lower().split("x"))
    s = args.fit * H / im.height
    if im.width * s > W * 0.94:
        s = W * 0.94 / im.width
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = (W - im.width) // 2
    y = H - im.height - round(args.margin * H) if args.anchor == "bottom" else (H - im.height) // 2
    plate = Image.new("RGBA", (W, H), PLATES[key] + (255,))
    # hard-edged alpha: soft edges pre-blended with the plate colour teach the model a fringe
    a = np.array(im.getchannel("A"))
    im.putalpha(Image.fromarray(np.where(a > 127, 255, 0).astype(np.uint8)))
    plate.alpha_composite(im, (x, y))
    plate.convert("RGB").save(args.out)
    print(f"key {key}: wrote {args.out} {W}x{H}, subject {im.width}x{im.height} at ({x},{y})")


if __name__ == "__main__":
    main()
