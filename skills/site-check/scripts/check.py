#!/usr/bin/env python3
"""Check a 3D or animated page in real browsers: stills, frame time, errors, blank canvases,
overflow, reduced motion, phone layout and scroll states, plus a contact sheet.

    python3 check.py URL [--out shots] [--widths 1440,768,390] [--browser chromium|webkit|both]
                         [--query "view=front" "view=aerial&light=night"] [--scroll-steps 6]
                         [--ready "window.__ready === true"] [--wait 1.5]

Each query string is appended to URL and shot at every width. --scroll-steps N also shoots
the page at N evenly spaced scroll positions (for scroll-driven pages). Every shot records:
milliseconds per frame over 60 real frames, page errors and console errors, whether a
<canvas> came out blank (one flat colour), horizontal overflow, and WebGL renderer info
(draw calls and triangles when the page exposes window.__app.renderer). A reduced-motion
pass shoots the first query at the widest width with prefers-reduced-motion: reduce.

Writes OUT/report.json and OUT/sheet.jpg; exits 1 when any shot has errors, a blank canvas
or overflow. Frame times from headless runs are indicative: compare runs with each other,
not with a phone.

Needs: pip install playwright pillow; python3 -m playwright install chromium webkit.
"""
import argparse
import glob
import json
import os
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat
from playwright.sync_api import sync_playwright

FRAME_TIME = """() => new Promise(r => { let n = 0; const t0 = performance.now();
  const f = () => { if (++n < 60) requestAnimationFrame(f); else r((performance.now() - t0) / 60); };
  requestAnimationFrame(f); })"""

PROBE = """async () => {
  const out = { overflow: document.documentElement.scrollWidth > innerWidth + 1, canvases: [] };
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect();
    if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) continue;
    out.canvases.push({ x: r.left, y: r.top, w: r.width, h: r.height });
  }
  const gl = (() => { const c = document.querySelector('canvas'); if (!c) return null;
    const g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return null;
    const ext = g.getExtension('WEBGL_debug_renderer_info');
    return { lost: g.isContextLost(), renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER) }; })();
  out.gl = gl;
  const app = window.__app;
  if (app && app.renderer && app.renderer.info) {
    // a composer renders many passes per frame; count the whole frame, not the last pass
    const i = app.renderer.info;
    i.autoReset = false; i.reset();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.three = { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: (i.programs || []).length };
    i.autoReset = true;
  }
  if (performance.memory) out.heapMB = Math.round(performance.memory.usedJSHeapSize / 1e6);
  return out;
}"""


def cached_chromium():
    roots = [os.environ.get("PLAYWRIGHT_BROWSERS_PATH", ""), "~/Library/Caches/ms-playwright", "~/.cache/ms-playwright",
             os.path.join(os.environ.get("LOCALAPPDATA", ""), "ms-playwright")]
    pats = ["chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell*",
            "chromium-*/chrome-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
            "chromium-*/chrome-*/chrome", "chromium-*/chrome-*/chrome.exe"]
    found = [f for r in filter(None, roots) for pat in pats for f in glob.glob(os.path.join(os.path.expanduser(r), pat))]
    found = [f for f in found if os.path.isfile(f) and os.access(f, os.X_OK)]
    return sorted(found, key=lambda f: int(re.search(r"-(\d+)/", f).group(1)))[-1] if found else None


def launch(p, name):
    if name == "webkit":
        return p.webkit.launch()
    args = ["--enable-gpu", "--ignore-gpu-blocklist"] + (["--use-angle=metal"] if sys.platform == "darwin" else [])
    exe = os.environ.get("CHROME_PATH")
    try:
        return p.chromium.launch(args=args, executable_path=exe) if exe else p.chromium.launch(args=args)
    except Exception as e:
        exe = cached_chromium()
        if "Executable doesn't exist" not in str(e) or not exe:
            raise
        return p.chromium.launch(args=args, executable_path=exe)


def blank(img, box):
    x, y, w, h = (int(v) for v in (box["x"], box["y"], box["w"], box["h"]))
    crop = img.crop((max(x, 0), max(y, 0), min(x + w, img.width), min(y + h, img.height))).convert("L")
    return max(ImageStat.Stat(crop).stddev) < 1.5


def shoot(browser, bname, url, width, out, args, reduced=False, scroll=None):
    mobile = width < 600
    height = {1440: 900, 768: 1024, 390: 844}.get(width, round(width * 0.62))
    ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2 if mobile else 1,
                              is_mobile=mobile and bname == "chromium", has_touch=mobile,
                              reduced_motion="reduce" if reduced else "no-preference")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: m.type == "error" and not m.text.startswith("Failed to load resource")
            and errors.append(f"console: {m.text}"))
    page.on("requestfailed", lambda r: "favicon" not in r.url and errors.append(f"failed: {r.url} {r.failure}"))
    page.on("response", lambda r: r.status >= 400 and "favicon" not in r.url and errors.append(f"HTTP {r.status}: {r.url}"))
    t0 = time.monotonic()
    page.goto(url, wait_until="load", timeout=90000)
    try:
        page.wait_for_function(args.ready, timeout=60000, polling=100)
    except Exception:
        errors.append(f"never ready: {args.ready}")
    ready_s = time.monotonic() - t0
    page.evaluate("document.fonts.ready")
    if scroll is not None:
        page.evaluate(f"window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * {scroll})")
    time.sleep(args.wait)
    ms = page.evaluate(FRAME_TIME)
    probe = page.evaluate(PROBE)
    tag = f"{bname}-{width}" + ("-reduced" if reduced else "") + (f"-scroll{round(scroll * 100):03d}" if scroll is not None else "")
    q = url.split("?", 1)[1] if "?" in url else "default"
    name = re.sub(r"[^a-z0-9]+", "-", f"{q}-{tag}".lower()).strip("-")
    path = out / f"{name}.png"
    page.screenshot(path=str(path))
    img = Image.open(path)
    scale = img.width / width
    blanks = [c for c in probe["canvases"] if blank(img, {k: v * scale for k, v in c.items()})]
    ctx.close()
    return {"name": name, "url": url, "browser": bname, "width": width, "reduced": reduced, "scroll": scroll,
            "ready_s": round(ready_s, 2), "ms_per_frame": round(ms, 1), "fps": round(1000 / ms, 1) if ms else None,
            "errors": sorted(set(e for e in errors if "favicon" not in e)), "blank_canvases": len(blanks),
            "overflow": probe["overflow"], "gl": probe.get("gl"), "three": probe.get("three"),
            "heapMB": probe.get("heapMB"), "file": str(path)}


def sheet(results, out):
    thumbs = []
    for r in results:
        im = Image.open(r["file"]).convert("RGB")
        im.thumbnail((480, 360))
        card = Image.new("RGB", (480, 400), "#111")
        card.paste(im, ((480 - im.width) // 2, 0))
        d = ImageDraw.Draw(card)
        bad = r["errors"] or r["blank_canvases"] or r["overflow"]
        d.text((8, 366), f"{r['name'][:58]}", fill="#ff7a6b" if bad else "#ddd")
        d.text((8, 382), f"{r['ms_per_frame']} ms/frame" + (f"  {r['three']['calls']} calls" if r.get("three") else ""), fill="#aaa")
        thumbs.append(card)
    cols = min(4, len(thumbs))
    rows = (len(thumbs) + cols - 1) // cols
    s = Image.new("RGB", (cols * 480, rows * 400), "#000")
    for i, t in enumerate(thumbs):
        s.paste(t, ((i % cols) * 480, (i // cols) * 400))
    s.save(out / "sheet.jpg", quality=86)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("url")
    ap.add_argument("--out", default="shots")
    ap.add_argument("--widths", default="1440,768,390")
    ap.add_argument("--browser", choices=["chromium", "webkit", "both"], default="chromium")
    ap.add_argument("--query", nargs="*", default=[""])
    ap.add_argument("--scroll-steps", type=int, default=0)
    ap.add_argument("--ready", default="document.readyState === 'complete'")
    ap.add_argument("--wait", type=float, default=1.5, help="seconds after ready before measuring")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    widths = [int(w) for w in args.widths.split(",")]
    browsers = ["chromium", "webkit"] if args.browser == "both" else [args.browser]
    join = lambda q: args.url if not q else args.url + ("&" if "?" in args.url else "?") + q
    results = []
    with sync_playwright() as p:
        for bname in browsers:
            b = launch(p, bname)
            for q in args.query:
                for w in widths:
                    results.append(shoot(b, bname, join(q), w, out, args))
                    r = results[-1]
                    flag = (" ERR" if r["errors"] else "") + (" BLANK" if r["blank_canvases"] else "") + (" OVERFLOW" if r["overflow"] else "")
                    print(f"{r['name']:60s} {r['ms_per_frame']:6.1f} ms/frame  ready {r['ready_s']:4.1f}s{flag}", flush=True)
            for i in range(args.scroll_steps):
                s = i / max(1, args.scroll_steps - 1)
                results.append(shoot(b, bname, join(args.query[0]), widths[0], out, args, scroll=s))
                print(f"{results[-1]['name']:60s} {results[-1]['ms_per_frame']:6.1f} ms/frame", flush=True)
            results.append(shoot(b, bname, join(args.query[0]), widths[0], out, args, reduced=True))
            print(f"{results[-1]['name']:60s} reduced motion", flush=True)
            b.close()
    (out / "report.json").write_text(json.dumps(results, indent=2))
    sheet(results, out)
    bad = [r for r in results if r["errors"] or r["blank_canvases"] or r["overflow"]]
    for r in bad:
        print(f"\nPROBLEM {r['name']}:" + "".join(f"\n  {e}" for e in r["errors"])
              + ("\n  blank canvas" if r["blank_canvases"] else "") + ("\n  horizontal overflow" if r["overflow"] else ""))
    gl = next((r["gl"] for r in results if r.get("gl")), None)
    if gl:
        print(f"\nWebGL renderer: {gl['renderer']}" + ("  (software: frame times are not representative)" if re.search("swiftshader|llvmpipe|software", gl["renderer"] or "", re.I) else ""))
    print(f"{len(results)} shots, {len(bad)} with problems -> {out / 'sheet.jpg'}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
