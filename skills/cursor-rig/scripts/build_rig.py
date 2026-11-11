#!/usr/bin/env python3
"""Build a cursor-following head rig (a grid of head poses on one fixed body) from head-turn clips.

    python3 build_rig.py CLIPS_DIR OUT_DIR --box X,Y,W,H [--track dots|template] [--point X,Y]
                         [--cols 19] [--out-scale 0.6] [--prefix ""] [--poly "x,y;x,y;..."]

CLIPS_DIR holds locked-off clips where only the head and neck move, all starting from the
same forward-facing frame (the plate) and turning to one side:
    L.mp4, R.mp4     level row: forward -> image-left, forward -> image-right   (required)
    UL.mp4, UR.mp4   the same with the head tilted up                            (optional)
    HL.mp4, HR.mp4   half-way down                                               (optional)
    DL.mp4, DR.mp4   tilted down                                                 (optional)
(--prefix sw_ reads sw_L.mp4 and so on.) All coordinates are in plate pixels, i.e. pixels of
the clips' frames. --box is the head box the rig repaints: the whole head and hair at every
pose, plus a little neck.

How it works:
  1. Every clip is aligned to the plate (first frame of L) with ECC on the body region
     (rows below --body-y), so every head lands on one fixed body.
  2. Each frame's head position is measured: --track dots finds two dark round eyes (cartoon
     dot eyes); --track template follows a patch around --point (the nose bridge works) for
     any face. Columns are picked at evenly spaced positions of that measure, not evenly in
     time, so the steps are even even where the model eased in and out.
  3. Each picked frame is gain-matched to the plate, blended onto it through a feathered head
     mask (--poly, or an oval in the box) and cropped to the box.
  4. Missing pitch rows in between are filled by optical-flow morphs of the neighbours.
  5. Writes row_N.webp strips (one cell per yaw step) and rig.json (geometry, pitch per row,
     and with dot tracking the eye positions and skin tone per cell, for live blinks).

Needs: pip install numpy opencv-python-headless; ffmpeg on PATH.
"""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROWS = [("U", -1.0), ("M", 0.0), ("H", 0.5), ("D", 1.0)]   # pitch: -1 up .. +1 down


def clip_name(row, side):
    return side if row == "M" else row + side


def extract(clips, prefix, name, tmp):
    src = clips / f"{prefix}{name}.mp4"
    if not src.exists():
        return None
    out = tmp / name
    out.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), str(out / "%04d.png")], check=True)
    return sorted(out.glob("*.png"))


def ecc_align(plate_g, img_g, body_y):
    """Affine warp mapping plate coords to img coords, fitted on the body only."""
    s = 0.5
    a = cv2.resize(plate_g, None, fx=s, fy=s).astype(np.float32)
    b = cv2.resize(img_g, None, fx=s, fy=s).astype(np.float32)
    mask = np.zeros(a.shape, np.uint8)
    mask[int(body_y * s):, :] = 255
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE,
                                       (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), mask, 5)
    except cv2.error:
        warp = np.eye(2, 3, dtype=np.float32)
    warp[:, 2] /= s
    return warp


def to_plate(img, warp, w, h):
    return cv2.warpAffine(img, warp, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)


class DotEyes:
    """Two dark round dots side by side in the eye band. Sizes are relative to the box."""

    def __init__(self, box, band, dark):
        bx, by, bw, bh = box
        self.x0, self.x1 = bx, bx + bw
        self.y0, self.y1 = band
        a = bw * bh
        self.amin, self.amax = 0.00025 * a, 0.0018 * a
        self.dx = (0.05 * bw, 0.2 * bw)
        self.dy = 0.04 * bh
        self.dark = dark

    def __call__(self, img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)[self.y0:self.y1, self.x0:self.x1]
        n, _, st, cen = cv2.connectedComponentsWithStats((g < self.dark).astype(np.uint8), 8)
        c = []
        for i in range(1, n):
            x, y, w, h, a = st[i]
            if self.amin < a < self.amax and a / (w * h) > 0.6 and 0.5 < w / h < 1.4:
                c.append((cen[i][0] + self.x0, cen[i][1] + self.y0, (a / np.pi) ** 0.5, a))
        best, score = None, 1e9
        for i in range(len(c)):
            for j in range(i + 1, len(c)):
                p, q = c[i], c[j]
                dx, dy = abs(p[0] - q[0]), abs(p[1] - q[1])
                if self.dx[0] < dx < self.dx[1] and dy < self.dy:
                    sc = dy + abs(p[3] - q[3]) / 40
                    if sc < score:
                        best, score = sorted([p, q]), sc
        if best is None:
            return None, None
        eyes = [(float(x), float(y), float(r)) for x, y, r, _ in best]
        return ((eyes[0][0] + eyes[1][0]) / 2, (eyes[0][1] + eyes[1][1]) / 2), eyes


class Template:
    """Follows a patch around a facial point from frame to frame (frames come in order)."""

    def __init__(self, point, box):
        self.start = np.array(point, float)
        self.half = max(8, int(box[2] * 0.06))
        self.search = int(box[2] * 0.12)
        self.reset()

    def reset(self):
        self.pos, self.tpl = self.start.copy(), None

    def __call__(self, img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        x, y, h = int(self.pos[0]), int(self.pos[1]), self.half
        if self.tpl is None:
            self.tpl = g[y - h:y + h, x - h:x + h].copy()
            return (float(x), float(y)), None
        s = self.search
        y0, x0 = max(0, y - h - s), max(0, x - h - s)
        win = g[y0:y + h + s, x0:x + h + s]
        if win.shape[0] < self.tpl.shape[0] or win.shape[1] < self.tpl.shape[1]:
            return None, None
        r = cv2.matchTemplate(win, self.tpl, cv2.TM_CCOEFF_NORMED)
        _, conf, _, loc = cv2.minMaxLoc(r)
        if conf < 0.4:
            return None, None
        self.pos = np.array([x0 + loc[0] + h, y0 + loc[1] + h], float)
        nx, ny = int(self.pos[0]), int(self.pos[1])
        self.tpl = g[ny - h:ny + h, nx - h:nx + h].copy()   # follow the slowly changing view
        return (float(self.pos[0]), float(self.pos[1])), None


def bg_gain(img, plate):
    pts = [(slice(10, 60), slice(10, 110)), (slice(10, 60), slice(-110, -10))]
    a = np.mean([img[p].reshape(-1, 3).mean(0) for p in pts], 0)
    b = np.mean([plate[p].reshape(-1, 3).mean(0) for p in pts], 0)
    return b / np.maximum(a, 1)


def head_mask(w, h, box, poly, feather):
    m = np.zeros((h, w), np.float32)
    if poly:
        cv2.fillPoly(m, [np.array(poly, np.int32)], 1.0)
    else:
        bx, by, bw, bh = box
        cv2.ellipse(m, (int(bx + bw / 2), int(by + bh * 0.46)), (int(bw * 0.46), int(bh * 0.46)), 0, 0, 360, 1.0, -1)
    k = feather * 2 + 1
    return cv2.GaussianBlur(m, (k, k), feather / 2.5)


_DIS = None


def flow_morph(a, b, t):
    global _DIS
    if _DIS is None:
        _DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        _DIS.setFinestScale(0)
        _DIS.setPatchSize(12)
        _DIS.setGradientDescentIterations(25)
        _DIS.setVariationalRefinementIterations(10)
        _DIS.setVariationalRefinementAlpha(40)
    ga, gb = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    fab, fba = _DIS.calc(ga, gb, None), _DIS.calc(gb, ga, None)
    h, w = ga.shape
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    at = cv2.remap(a, gx + t * fba[..., 0], gy + t * fba[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    bt = cv2.remap(b, gx + (1 - t) * fab[..., 0], gy + (1 - t) * fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return cv2.addWeighted(at, 1 - t, bt, t, 0)


def skin_tone(img, eyes):
    """Skin colour in a ring round each eye (lashes and brows excluded), for painting lids."""
    h, w = img.shape[:2]
    out = []
    for x, y, r in eyes:
        x0, x1, y0, y1 = max(int(x - 3 * r), 0), min(int(x + 3 * r), w), max(int(y - 3 * r), 0), min(int(y + 3 * r), h)
        gy, gx = np.mgrid[y0:y1, x0:x1]
        d = np.hypot(gx - x, gy - y)
        px = img[y0:y1, x0:x1][(d > 1.6 * r) & (d < 2.5 * r)].astype(np.float32)
        if not len(px):
            out.append("#c08070")
            continue
        lum = px.mean(1)
        px = px[(lum > np.percentile(lum, 40)) & (lum < np.percentile(lum, 95))]
        b, g, rr = np.median(px, 0)
        out.append("#%02x%02x%02x" % (int(rr), int(g), int(b)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("clips", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--box", required=True, help="head box x,y,w,h in plate px")
    ap.add_argument("--prefix", default="")
    ap.add_argument("--track", choices=["dots", "template"], default="dots")
    ap.add_argument("--point", help="template tracking: x,y of a facial point at the forward pose")
    ap.add_argument("--eye-band", help="dots: y0,y1 band where the eyes can be (default: middle of the box)")
    ap.add_argument("--dark", type=int, default=70, help="dots: grey level below which a pixel can be an eye")
    ap.add_argument("--body-y", type=int, help="rows below this are body only, used for alignment (default: box bottom)")
    ap.add_argument("--cols", type=int, default=19, help="yaw steps per row (odd, so the centre is forward)")
    ap.add_argument("--out-scale", type=float, default=0.6)
    ap.add_argument("--between", type=int, default=3, help="rows per pitch unit; gaps are filled with morphs")
    ap.add_argument("--quality", type=int, default=82)
    ap.add_argument("--feather", type=int, default=28)
    ap.add_argument("--poly", default="", help="head mask polygon x,y;x,y;... (default: an oval in the box)")
    ap.add_argument("--debug", type=Path, help="write full-size cells here for inspection")
    a = ap.parse_args()

    bx, by, bw, bh = map(int, a.box.split(","))
    box = (bx, by, bw, bh)
    cols = a.cols if a.cols % 2 else a.cols + 1
    a.out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="rig-"))

    level = extract(a.clips, a.prefix, "L", tmp)
    if not level:
        raise SystemExit(f"need {a.prefix}L.mp4 and {a.prefix}R.mp4 in {a.clips}")
    plate = cv2.imread(str(level[0]))
    H, W = plate.shape[:2]
    plate_g = cv2.cvtColor(plate, cv2.COLOR_BGR2GRAY)
    body_y = a.body_y or min(H - 20, by + bh)
    if a.track == "dots":
        band = tuple(map(int, a.eye_band.split(","))) if a.eye_band else (by + int(bh * 0.2), by + int(bh * 0.65))
        tracker = DotEyes(box, band, a.dark)
    else:
        if not a.point:
            raise SystemExit("--track template needs --point x,y")
        tracker = Template(tuple(map(float, a.point.split(","))), box)
    poly = [tuple(map(int, p.split(","))) for p in a.poly.split(";")] if a.poly else None
    mask = head_mask(W, H, box, poly, a.feather)[..., None]
    if a.debug:
        a.debug.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(a.debug / "plate.png"), plate)
        cv2.imwrite(str(a.debug / "mask.png"), (mask[..., 0] * 255).astype(np.uint8))

    src = {}
    for row, pitch in ROWS:
        fl = level if row == "M" else extract(a.clips, a.prefix, clip_name(row, "L"), tmp)
        fr = extract(a.clips, a.prefix, clip_name(row, "R"), tmp)
        if not fl or not fr:
            if row == "M":
                raise SystemExit(f"need {a.prefix}R.mp4 too")
            continue
        seq = []   # (measure_x, path, warp, eyes)
        centre = None
        for frames, left in ((fl, True), (fr, False)):
            warp = ecc_align(plate_g, cv2.cvtColor(cv2.imread(str(frames[0])), cv2.COLOR_BGR2GRAY), body_y)
            drift = np.abs(warp - ecc_align(plate_g, cv2.cvtColor(cv2.imread(str(frames[-1])), cv2.COLOR_BGR2GRAY), body_y))[:, 2].max()
            print(f"{frames[0].parent.name}: body drift first->last {drift:.1f}px" + ("  (high: was the camera locked off?)" if drift > 6 else ""))
            if isinstance(tracker, Template):
                tracker.reset()
            for p in frames:
                m, eyes = tracker(to_plate(cv2.imread(str(p)), warp, W, H))
                if m is None:
                    continue
                if p == frames[0] and not left:
                    centre = m[0]
                if not (left and p == frames[0]):
                    seq.append((m[0], p, warp, eyes))
        if len(seq) < cols:
            print(f"row {row}: only {len(seq)} tracked frames, skipped")
            continue
        xs = np.array([s[0] for s in seq])
        cx = centre if centre is not None else float(np.median(xs))
        k = cols // 2
        targets = np.concatenate([np.linspace(xs.min(), cx, k + 1)[:-1], [cx], np.linspace(cx, xs.max(), k + 1)[1:]])
        cells = []
        for t in targets:
            s = seq[int(np.argmin(np.abs(xs - t)))]
            img = to_plate(cv2.imread(str(s[1])), s[2], W, H).astype(np.float32)
            img *= bg_gain(img, plate.astype(np.float32))
            comp = np.clip(img * mask + plate.astype(np.float32) * (1 - mask), 0, 255).astype(np.uint8)
            eyes = [(x - bx, y - by, r) for x, y, r in s[3]] if s[3] else None
            cells.append((comp[by:by + bh, bx:bx + bw].copy(), eyes))
        src[row] = (pitch, cells)
        print(f"row {row}: {len(seq)} tracked frames, swing {xs.min():.0f} .. {cx:.0f} .. {xs.max():.0f}")

    crop_mask = mask[by:by + bh, bx:bx + bw]
    plate_crop = plate[by:by + bh, bx:bx + bw].astype(np.float32)
    order = [r for r, _ in ROWS if r in src]
    grid, pitch = [], []
    for i, r in enumerate(order):
        p0, cells0 = src[r]
        grid.append(cells0)
        pitch.append(p0)
        if i + 1 < len(order):
            p1, cells1 = src[order[i + 1]]
            n = max(0, round(abs(p1 - p0) * a.between) - 1)
            for t in [j / (n + 1) for j in range(1, n + 1)]:
                row = []
                for (ca, ea), (cb, eb) in zip(cells0, cells1):
                    m = flow_morph(ca, cb, t).astype(np.float32) * crop_mask + plate_crop * (1 - crop_mask)
                    eyes = [tuple((1 - t) * np.array(u) + t * np.array(v)) for u, v in zip(ea, eb)] if ea and eb else None
                    row.append((np.clip(m, 0, 255).astype(np.uint8), eyes))
                grid.append(row)
                pitch.append(p0 + (p1 - p0) * t)

    sc = a.out_scale
    ow, oh = int(bw * sc), int(bh * sc)
    rig = {"version": 1, "plate": [W, H], "box": [bx, by, bw, bh], "frame": [ow, oh], "cols": cols, "center": cols // 2,
           "pitch": [round(p, 4) for p in pitch], "rows": []}
    for ri, row in enumerate(grid):
        strip = np.zeros((oh, ow * len(row), 3), np.uint8)
        cells = []
        for ci, (crop, eyes) in enumerate(row):
            strip[:, ci * ow:(ci + 1) * ow] = cv2.resize(crop, (ow, oh), interpolation=cv2.INTER_AREA)
            cell = {}
            if eyes:
                cell = {"eyes": [[round(x * sc, 1), round(y * sc, 1), round(r * sc, 1)] for x, y, r in eyes],
                        "skin": skin_tone(crop, eyes)}
            cells.append(cell)
            if a.debug:
                cv2.imwrite(str(a.debug / f"r{ri}_c{ci:02d}.jpg"), crop)
        name = f"row_{ri}.webp"
        cv2.imwrite(str(a.out / name), strip, [cv2.IMWRITE_WEBP_QUALITY, a.quality])
        rig["rows"].append({"src": name, "cells": cells})
        print(f"row {ri} (pitch {pitch[ri]:+.2f}): {len(cells)} cells -> {name}")
    cv2.imwrite(str(a.out / "plate.webp"), plate, [cv2.IMWRITE_WEBP_QUALITY, 88])   # the body the heads sit on
    (a.out / "rig.json").write_text(json.dumps(rig, separators=(",", ":")))
    total = sum(f.stat().st_size for f in a.out.glob("*.webp"))
    print(f"done: {len(grid)} rows x {cols} poses, {total / 1e6:.1f} MB -> {a.out}")


if __name__ == "__main__":
    main()
