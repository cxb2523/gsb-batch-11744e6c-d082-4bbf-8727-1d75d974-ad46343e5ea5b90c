"""Regenerates every image in docs/img/ from the demo's fictional data.

    python scripts/docs_images.py            # everything
    python scripts/docs_images.py screens    # only screens-<lang>.png (no browser needed)
    python scripts/docs_images.py admin      # only admin-<page>-<theme>-<lang>.png

Run it from a clone with inkdoor installed (``pip install -e .``). Nothing is fetched: the door
screens come from ``inkdoor.demo``, and the admin pages are rendered by the real app with
fictional calendar links that are only ever shown masked.

The admin screenshots need a browser engine. On macOS the built-in Quick Look (``qlmanage``) is
used; elsewhere a headless Chromium-family browser (Chromium, Chrome, Edge or Brave on the PATH).
Set INKDOOR_BROWSER to a browser's executable to choose one.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from inkdoor import config_edit, demo, net
from inkdoor.config import with_defaults
from inkdoor.render import H, W, compute_status, render, translator_for
from inkdoor.state import IMAGE_NAME, RenderInfo, ServerState
from inkdoor.web import auth, create_app

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "img"
LANGUAGES = ("en-US", "pt-BR")

# screens-<lang>.png: three door screens in Kindle-like bezels
SCREEN_TIMES = ("10:20", "15:20", "21:10")    # in a meeting, free, after hours
BEZEL, BEZEL_COLOR, RADIUS, GAP = 28, (38, 38, 40), 28, 40

# admin-<page>-<theme>-<lang>.png
ADMIN_PAGES = {"home": "/", "calendars": "/calendars"}
FAKE_ADDRESS = "192.168.1.50"                 # fictional LAN address shown on the pages
VIEWPORT = (800, 1100)                        # CSS pixels, rendered at 2x


# --------------------------------------------------------------------------- door screens

def screens(language: str) -> Image.Image:
    cfg = demo.demo_config(language)
    sw, sh = W // 2, H // 2
    pw, ph = sw + 2 * BEZEL, sh + 2 * BEZEL
    sheet = Image.new("RGB", (len(SCREEN_TIMES) * pw + (len(SCREEN_TIMES) - 1) * GAP, ph), "white")
    draw = ImageDraw.Draw(sheet)
    for i, hour in enumerate(SCREEN_TIMES):
        x = i * (pw + GAP)
        draw.rounded_rectangle((x, 0, x + pw - 1, ph - 1), RADIUS, fill=BEZEL_COLOR)
        screen = render(demo.demo_snapshot(cfg, hour), cfg).resize((sw, sh), Image.LANCZOS)
        sheet.paste(screen.convert("RGB"), (x + BEZEL, BEZEL))
    return sheet


# --------------------------------------------------------------------------- admin pages

def _admin_pages(language: str, folder: Path) -> list[str]:
    """Writes static copies of the admin pages (light and dark) into ``folder``; returns names."""
    content = demo.CONTENT[language]
    names = content["calendars"]
    calendars = [
        {"name": names[0], "style": "solid", "busy": True,
         "url": "https://calendar.example/ical/fictional-work/basic.ics"},
        {"name": names[1], "style": "striped", "busy": True,
         "url": "https://outlook.example/owa/calendar/fictional/calendar.ics"},
        {"name": names[2], "style": "outline", "busy": True,
         "status_label": content["personal_label"],
         "url": "https://calendar.example/ical/fictional-personal/basic.ics"},
    ]
    work = Path(tempfile.mkdtemp())
    config_path = work / "config.toml"
    config_path.write_text(config_edit.dumps({
        "display": {"language": language, "timezone": "America/Sao_Paulo"},
        "admin": {"enabled": True},
        "calendar": calendars,
        "tasks": {"name": "TickTick", "url": "https://tasks.example/pub/fictional/basic.ics"},
    }), encoding="utf-8")
    password = "docs-images-only-1"
    auth.set_password(auth.password_path(str(config_path)), password)

    cfg = with_defaults({"display": {"language": language, "timezone": "America/Sao_Paulo"},
                         "admin": {"enabled": True}, "calendar": calendars})
    state = ServerState(str(config_path), str(work), None, cfg, None, True)
    demo_cfg = demo.demo_config(language)
    snap = demo.demo_snapshot(demo_cfg, "10:20")
    render(snap, demo_cfg).save(work / IMAGE_NAME)
    status = compute_status(snap, demo_cfg, translator_for(demo_cfg))
    state.last_render = RenderInfo(snap.now, status.word, status.headline, [])
    net.lan_address = lambda: FAKE_ADDRESS

    client = create_app(state).test_client()
    base = f"http://{FAKE_ADDRESS}:3667"
    login = client.get("/login", base_url=base).get_data(as_text=True)
    token = re.search(r'name="csrf" value="([^"]+)"', login).group(1)
    assert client.post("/login", base_url=base,
                       data={"csrf": token, "password": password}).status_code == 302

    web = Path(sys.modules["inkdoor.web"].__file__).parent
    shutil.copytree(web / "static", folder / "static")
    shutil.copytree(web.parent / "fonts", folder / "static" / "fonts")
    shutil.copy(work / IMAGE_NAME, folder / "kindle.png")
    # the stylesheet follows prefers-color-scheme; each copy pins one theme
    css = (folder / "static" / "admin.css").read_text(encoding="utf-8")
    start = css.index("@media (prefers-color-scheme: dark) {")
    end = css.index("\n}\n", css.index("  }\n", start)) + 3
    dark_vars = css[start:end].split("{", 1)[1].rsplit("}", 1)[0]
    (folder / "static" / "light.css").write_text(css[:start] + css[end:], encoding="utf-8")
    dark = css[:start] + css[end:] + dark_vars + "\n:root { color-scheme: dark; }\n"
    (folder / "static" / "dark.css").write_text(dark, encoding="utf-8")

    pages = []
    for page, path in ADMIN_PAGES.items():
        html = client.get(path, base_url=base).get_data(as_text=True)
        html = re.sub(r"<script [^>]*admin\.js[^>]*></script>", "", html)
        html = re.sub(r'src="/kindle\.png\?t=[^"]*"', 'src="kindle.png"', html)
        for theme in ("light", "dark"):
            name = f"{page}-{theme}"
            (folder / f"{name}.html").write_text(
                html.replace('href="/static/admin.css"', f'href="static/{theme}.css"')
                    .replace('content="light dark"', f'content="{theme}"'), encoding="utf-8")
            pages.append(name)
    shutil.rmtree(work)
    return pages


def _chromium() -> str | None:
    chosen = os.environ.get("INKDOOR_BROWSER")
    if chosen:
        return chosen
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable",
                 "microsoft-edge", "brave-browser"):
        if shutil.which(name):
            return shutil.which(name)
    return None


def _screenshot(html: Path, png: Path) -> None:
    browser = _chromium()
    if browser:
        width, height = VIEWPORT
        profile = tempfile.mkdtemp()
        subprocess.run([browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--no-first-run", f"--user-data-dir={profile}",
                        "--force-device-scale-factor=2", f"--window-size={width},{height}",
                        f"--screenshot={png}", html.as_uri()],
                       check=True, capture_output=True, timeout=120)
        shutil.rmtree(profile, ignore_errors=True)
    elif sys.platform == "darwin" and shutil.which("qlmanage"):
        subprocess.run(["qlmanage", "-t", "-s", str(VIEWPORT[0] * 2), "-o", str(png.parent),
                        str(html)], check=True, capture_output=True, timeout=120)
        (png.parent / f"{html.name}.png").replace(png)
    else:
        raise SystemExit("No browser engine found: set INKDOOR_BROWSER to a Chromium-family "
                         "browser (or run this on macOS, which has qlmanage).")


def _trim(image: Image.Image, margin: int = 48) -> Image.Image:
    """Cuts the empty page background below the content, keeping a small margin."""
    image = image.convert("RGB")
    background = Image.new("RGB", image.size, image.getpixel((image.width - 2, image.height - 2)))
    box = ImageChops.difference(image, background).getbbox()
    return image.crop((0, 0, image.width, min(image.height, box[3] + margin))) if box else image


def admin(language: str) -> dict[str, Image.Image]:
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        shots = {}
        for name in _admin_pages(language, folder):
            png = folder / f"{name}.png"
            _screenshot(folder / f"{name}.html", png)
            page, theme = name.split("-")
            shots[f"admin-{page}-{theme}-{language}.png"] = _trim(Image.open(png))
        return shots


# --------------------------------------------------------------------------- main

def main(argv: list[str]) -> None:
    which = set(argv) or {"screens", "admin"}
    unknown = which - {"screens", "admin"}
    if unknown:
        raise SystemExit(f"unknown target: {', '.join(sorted(unknown))} (use screens or admin)")
    OUT.mkdir(parents=True, exist_ok=True)
    for language in LANGUAGES:
        if "screens" in which:
            screens(language).save(OUT / f"screens-{language}.png", optimize=True)
            print(f"docs/img/screens-{language}.png")
        if "admin" in which:
            for name, image in admin(language).items():
                image.save(OUT / name, optimize=True)
                print(f"docs/img/{name}")


if __name__ == "__main__":
    main(sys.argv[1:])
