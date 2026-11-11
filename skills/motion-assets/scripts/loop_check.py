#!/usr/bin/env python3
"""Check and fix a generated clip that should loop seamlessly.

    python3 loop_check.py clip.mp4                       # score the loop, find the best cut
    python3 loop_check.py clip.mp4 --fix loop.mp4        # trim to the best loop point
    python3 loop_check.py clip.mp4 --fix loop.mp4 --blend 8   # and cross-fade the last 8 frames into the first

Video models given the same start and end frame rarely land exactly on it: the last frame is
close, but colour or position has drifted, and the motion often eases to a stop. Played as a
loop, that shows as a jump or a hitch once per cycle.

The score is the mean absolute difference (0..255) between the frame that would play last
and the first frame. Under ~3 is invisible, 3..8 is visible on flat backgrounds, over 8 jumps.
The script also searches the last --search seconds for the frame most like the first one
(the best loop point) and reports it. --fix cuts there; --blend N additionally cross-fades
the final N frames into the opening N and starts the loop after them, which hides small drift.

Needs: pip install numpy opencv-python-headless; ffmpeg on PATH for --fix.
"""
import argparse
import subprocess

import cv2
import numpy as np


def read(path, width=320):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    small, full = [], []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        full.append(f)
        h = round(f.shape[0] * width / f.shape[1])
        small.append(cv2.resize(f, (width, h), interpolation=cv2.INTER_AREA).astype(np.float32))
    cap.release()
    return fps, small, full


def diff(a, b):
    return float(np.abs(a - b).mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("clip")
    ap.add_argument("--fix", help="write a trimmed (and optionally blended) loop here")
    ap.add_argument("--blend", type=int, default=0, help="cross-fade this many final frames into the opening")
    ap.add_argument("--search", type=float, default=1.0, help="seconds at the end to search for the loop point")
    ap.add_argument("--crf", type=int, default=18)
    a = ap.parse_args()

    fps, small, full = read(a.clip)
    n = len(small)
    if n < 4:
        raise SystemExit("clip too short")
    as_is = diff(small[-1], small[0])
    # the frame that should play last is the one just before a frame matching frame 0
    lo = max(1, n - 1 - round(a.search * fps))
    scores = [(diff(small[i], small[0]), i) for i in range(lo, n)]
    best_d, best_i = min(scores)
    last = best_i - 1                      # frame best_i duplicates frame 0, so stop before it
    step = np.mean([diff(small[i], small[i + 1]) for i in range(min(n - 1, 12))])
    print(f"{n} frames at {fps:g} fps")
    print(f"as is:       last -> first {as_is:5.2f}   (typical frame-to-frame change {step:.2f})")
    print(f"best cut:    frame {best_i} matches frame 0 at {best_d:5.2f}; loop = frames 0..{last} ({(last + 1) / fps:.2f}s)")
    verdict = "seamless" if best_d < 3 else "visible on flat areas" if best_d < 8 else "jumps: regenerate, or --blend"
    print(f"verdict:     {verdict}")
    # a hitch: motion slowing to a stop before the loop point
    tail = np.mean([diff(small[i], small[i + 1]) for i in range(max(0, last - 6), last)]) if last > 6 else step
    if step > 0.5 and tail < step * 0.35:
        print(f"note:        motion slows to {tail:.2f} at the end (from {step:.2f}); the loop will hitch. Ask for constant motion.")

    if a.fix:
        frames = full[: last + 1]
        k = min(a.blend, len(frames) // 3)
        if k:
            # classic cross-fade loop: the tail fades into the opening frames 0..k-1, and the
            # loop restarts at frame k, the frame that follows them. The clip gets k frames shorter.
            body = frames[k:len(frames) - k]
            tail = frames[len(frames) - k:]
            mixed = [np.clip(tail[j].astype(np.float32) * (1 - (j + 1) / (k + 1)) + full[j].astype(np.float32) * ((j + 1) / (k + 1)),
                             0, 255).astype(np.uint8) for j in range(k)]
            frames = body + mixed
        h, w = frames[0].shape[:2]
        proc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}",
                                 "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf),
                                 "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", a.fix], stdin=subprocess.PIPE)
        for f in frames:
            proc.stdin.write(f.tobytes())
        proc.stdin.close()
        proc.wait()
        print(f"wrote {a.fix}: {len(frames)} frames" + (f", last {k} blended" if k else ""))


if __name__ == "__main__":
    main()
