#!/usr/bin/env python3
"""Put the original pixels back into an outpainted or AI-extended image.

    python3 paste_back.py original.png extended.png out.png [--feather 24] [--no-match]

Outpainting models re-render the whole image, not only the new margins: the original area
comes back softer, shifted by a few pixels, sometimes recoloured. This finds where the
original sits in the extended image (scale and position, by multi-scale template matching),
colour-matches the original to its surroundings, and pastes it back with a feathered edge,
so the middle is the untouched original and only the new margins are generated.

Prints the placement and a match score; under 0.9 means the model moved or changed the
subject too much to paste back cleanly.

Needs: pip install numpy opencv-python-headless.
"""
import argparse

import cv2
import numpy as np


def locate(orig, ext):
    """Best (scale, x, y, score) placing orig inside ext."""
    small = 640 / max(ext.shape[:2])
    e = cv2.cvtColor(cv2.resize(ext, None, fx=small, fy=small, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    best = (0, 1.0, 0, 0)
    base = min(ext.shape[0] / orig.shape[0], ext.shape[1] / orig.shape[1])
    for s in np.linspace(base * 0.5, base * 1.0, 26):
        w, h = round(orig.shape[1] * s * small), round(orig.shape[0] * s * small)
        if w < 16 or h < 16 or w > e.shape[1] or h > e.shape[0]:
            continue
        t = cv2.cvtColor(cv2.resize(orig, (w, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        r = cv2.matchTemplate(e, t, cv2.TM_CCOEFF_NORMED)
        _, score, _, loc = cv2.minMaxLoc(r)
        if score > best[0]:
            best = (score, s, loc[0] / small, loc[1] / small)
    score, s, x, y = best
    # refine at full resolution in a small window
    w, h = round(orig.shape[1] * s), round(orig.shape[0] * s)
    t = cv2.resize(orig, (w, h), interpolation=cv2.INTER_AREA)
    pad = 12
    x0, y0 = max(0, int(x) - pad), max(0, int(y) - pad)
    win = ext[y0:y0 + h + 2 * pad, x0:x0 + w + 2 * pad]
    if win.shape[0] >= h and win.shape[1] >= w:
        r = cv2.matchTemplate(cv2.cvtColor(win, cv2.COLOR_BGR2GRAY), cv2.cvtColor(t, cv2.COLOR_BGR2GRAY), cv2.TM_CCOEFF_NORMED)
        _, score, _, loc = cv2.minMaxLoc(r)
        x, y = x0 + loc[0], y0 + loc[1]
    return s, int(x), int(y), float(score), t


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("original")
    ap.add_argument("extended")
    ap.add_argument("out")
    ap.add_argument("--feather", type=int, default=24, help="px of soft edge inside the original's border")
    ap.add_argument("--no-match", action="store_true", help="skip colour matching")
    a = ap.parse_args()

    orig, ext = cv2.imread(a.original), cv2.imread(a.extended)
    if orig is None or ext is None:
        raise SystemExit("could not read the images")
    s, x, y, score, t = locate(orig, ext)
    h, w = t.shape[:2]
    print(f"original found at ({x},{y}), {w}x{h} (scale {s:.3f}), match {score:.3f}")
    if score < 0.9:
        print("warning: weak match; the model changed the original area a lot. Check the result closely.")
    region = ext[y:y + h, x:x + w].astype(np.float32)
    src = t.astype(np.float32)
    if not a.no_match:
        # per-channel gain and offset fitted on the border band, so the seam disappears
        band = np.zeros((h, w), bool)
        b = max(4, a.feather)
        band[:b], band[-b:], band[:, :b], band[:, -b:] = True, True, True, True
        for c in range(3):
            sv, rv = src[..., c][band], region[..., c][band]
            gain = rv.std() / max(sv.std(), 1e-3)
            gain = float(np.clip(gain, 0.9, 1.1))
            src[..., c] = (src[..., c] - sv.mean()) * gain + rv.mean()
    m = np.zeros((h, w), np.float32)
    f = a.feather
    m[f:h - f, f:w - f] = 1
    m = cv2.GaussianBlur(m, (0, 0), max(1, f / 2.5))[..., None]
    out = ext.astype(np.float32)
    out[y:y + h, x:x + w] = src * m + region * (1 - m)
    cv2.imwrite(a.out, np.clip(out, 0, 255).astype(np.uint8))
    print(f"wrote {a.out}")


if __name__ == "__main__":
    main()
