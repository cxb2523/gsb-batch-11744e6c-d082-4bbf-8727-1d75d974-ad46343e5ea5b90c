import math

import pytest
from helpers import at
from PIL import Image

from inkdoor.config import SCREENS, with_defaults
from inkdoor.demo import demo_config, demo_snapshot
from inkdoor.i18n import Translator
from inkdoor.render import (H, W, M, Canvas, Row, compute_status, draw_rows, render, render_error,
                            render_host_rejected, render_setup, screen_size, translator_for)
from inkdoor.sources import Snapshot, collect

KINDLE_GRAYS = {i * 17 for i in range(16)}


def grays(img):
    return {v for v, count in enumerate(img.histogram()) if count}


def test_status_in_meeting_and_free(cfg):
    t = Translator("en-US")
    st = compute_status(collect(cfg, at("13:45")), cfg, t)
    assert st.busy and st.word == "In a meeting" and st.headline == "until 2:30 PM"

    st = compute_status(collect(cfg, at("10:00")), cfg, t)
    assert not st.busy and st.word == "Free" and st.headline == "until 1:30 PM"


def test_status_in_portuguese(cfg):
    t = Translator("pt-BR")
    st = compute_status(collect(cfg, at("13:45")), cfg, t)
    assert st.word == "Em reunião" and st.headline == "até 14:30"


def test_custom_status_label_wins(cfg):
    snap = collect(cfg, at("13:45"))
    for e in snap.today:
        e.status_label = "On a call"
    assert compute_status(snap, cfg, Translator("pt-BR")).word == "On a call"


def test_after_hours(cfg):
    st = compute_status(collect(cfg, at("21:30")), cfg, Translator("en-US"))
    assert not st.busy and st.headline == "after hours"


def test_never_free_when_a_busy_calendar_is_unreadable(cfg):
    cfg["calendar"][0]["url"] = "/does/not/exist.ics"   # Work fails, no cache
    st = compute_status(collect(cfg, at("10:00")), cfg, Translator("en-US"))
    assert st.busy and st.word == "Knock first" and "Work" in st.detail


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_gap_dashes_stay_inside_the_right_margin(language):
    # the dashes start right after the text, so where the last one ends depends on its width
    t = Translator(language)
    for minutes in range(30, 600, 7):
        img = Image.new("L", (W, H), 255)
        text = t("agenda.gap", duration=t.duration(minutes))
        draw_rows(Canvas(img), [Row("gap", 52, text=text)], 0, H, at("10:00"), t)
        right = img.point(lambda v: 255 - v).getbbox()[2] - 1   # last column that is not white
        assert right <= W - M, text


def test_workday_end_24_is_accepted(cfg):
    cfg["display"]["workday_end"] = 24
    assert render(collect(cfg, at("23:30")), cfg).size == (W, H)


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
@pytest.mark.parametrize("hour", ["7:30", "10:20", "15:20", "16:50", "21:10"])
def test_demo_renders_at_kindle_size(language, hour):
    cfg = demo_config(language)
    img = render(demo_snapshot(cfg, hour), cfg)
    assert img.size == (W, H) == (1072, 1448)
    assert img.mode == "L"
    assert grays(img) <= KINDLE_GRAYS


def test_long_labels_and_many_calendars_do_not_break_the_layout():
    cfg = demo_config("pt-BR")
    cfg["calendar"] += [{"name": f"Calendar number {i}", "style": "solid"} for i in range(5)]
    snap = demo_snapshot(cfg, "10:20")
    for e in snap.today:
        e.status_label = "Não perturbe, em ligação muito importante com o cliente"
    st = compute_status(snap, cfg, Translator("pt-BR"))
    assert st.word.startswith("Não perturbe")
    assert render(snap, cfg).size == (W, H)


def test_empty_day():
    cfg = with_defaults({"display": {"language": "en-US"}})
    snap = Snapshot(at("10:00"), [], [], [], [])
    assert grays(render(snap, cfg)) <= KINDLE_GRAYS


def test_error_screen():
    img = render_error(None, "ValueError: something went wrong " * 10)
    assert img.size == (W, H) and grays(img) <= KINDLE_GRAYS


def test_no_busy_never_says_free(cfg):
    snap = Snapshot(at("10:00"), [], [], [], configured="no_busy")
    st = compute_status(snap, cfg, translator_for(cfg))
    assert st.busy and st.word == "Knock first"


def test_setup_and_host_screens_use_kindle_grays(cfg):
    for img in [render_setup(cfg, "http://192.168.100.200:65535"), render_setup(cfg, None),
                render_host_rejected(cfg, "door.example.com"), render_host_rejected(cfg, None)]:
        assert img.size == (1072, 1448) and grays(img) <= KINDLE_GRAYS


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_host_screen_points_to_allowed_hosts_in_the_config_file(language):
    """The admin has no allowed-hosts field, and this screen shows even with the admin off."""
    detail = Translator(language)("status.host_detail", host="door.example.com")
    assert "allowed_hosts" in detail and "config.toml" in detail and "door.example.com" in detail
    generic = Translator(language)("status.host_detail_generic")
    assert "allowed_hosts" in generic and "config.toml" in generic


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_host_screen_fits_a_60_character_host(language):
    from PIL import Image, ImageDraw

    from inkdoor.render import M, _wrap, font
    host = "a" * 20 + ".very-long-subdomain." + "b" * 14 + ".example"
    assert len(host) == 63
    detail = Translator(language)("status.host_detail", host=host[:60])
    d = ImageDraw.Draw(Image.new("L", (W, H)))
    f = font("Medium", 36)
    lines = _wrap(d, detail, f, W - 2 * M)
    assert len(lines) <= 8                       # _render_notice draws at most 8 lines
    assert all(d.textlength(line, font=f) <= W - 2 * M for line in lines)


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_no_busy_has_its_own_headline(cfg, language):
    cfg["display"]["language"] = language
    t = Translator(language)
    st = compute_status(Snapshot(at("10:00"), [], [], [], configured="no_busy"), cfg, t)
    assert st.headline == t("status.no_busy_headline") != t("status.unknown_headline")


def test_status_box_has_no_empty_band_without_a_detail():
    from PIL import Image, ImageDraw
    from inkdoor.render import Status, draw_status
    heights = []
    for detail in ("a detail line", ""):
        img = Image.new("L", (W, H), 255)
        heights.append(draw_status(ImageDraw.Draw(img), Status(True, "Setup", "almost ready", detail), 0))
    assert heights[1] < heights[0] - 40


def test_notice_screens_do_not_change_the_status_they_are_given(cfg, monkeypatch):
    from inkdoor import render as r
    seen = []
    real = r.draw_status

    def spy(d, st, y):
        seen.append((st, repr(st)))
        return real(d, st, y)
    monkeypatch.setattr(r, "draw_status", spy)
    render_error(cfg, "RuntimeError")
    render_setup(cfg, None)
    for st, before in seen:
        assert repr(st) == before
    assert seen[0][0].detail == Translator("en-US")("status.error_detail")   # error keeps its box line


@pytest.mark.parametrize("label", ["Em reunião com cliente importa", "Out", "  "])
def test_status_word_fits_without_cutting_a_30_character_label(label):
    from PIL import Image, ImageDraw
    from inkdoor import render as r
    d = ImageDraw.Draw(Image.new("L", (W, H), 255))
    width = W - 2 * r.M - 104
    f, lines = r.fit_word(d, label.upper(), width)
    assert 1 <= len(lines) <= 2 and all(d.textlength(line, font=f) <= width for line in lines)
    assert "…" not in "".join(lines)


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_long_status_label_renders_in_kindle_grays(cfg, language):
    cfg["display"]["language"] = language
    cfg["calendar"][0]["status_label"] = "Em reunião com cliente importa"
    img = render(collect(cfg, at("09:10")), cfg)
    assert img.size == (W, H) and grays(img) <= KINDLE_GRAYS


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_current_event_box_has_even_padding_and_round_corners(language):
    from inkdoor import render as r
    cfg = demo_config(language)
    img = render(demo_snapshot(cfg, "10:20"), cfg)        # 10:00-11:00 is happening
    box = [y for y in range(H) if img.getpixel((r.M - 10, y)) == 0]
    top, bottom = box[0], box[-1]
    assert box == list(range(top, bottom + 1))            # one box
    text = [y for y in range(top, bottom + 1)
            if any(img.getpixel((x, y)) > 100 for x in range(r.M, W - r.M, 2))]
    above, below = text[0] - top, bottom - text[-1]
    assert above >= 12 and below >= 12 and abs(above - below) <= 2
    assert img.getpixel((r.M - 20, top)) == 255             # the corner is rounded
    assert grays(img) <= KINDLE_GRAYS


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
@pytest.mark.parametrize("link", ["PASTE_YOUR_LINK_HERE", "", None])
def test_legend_leaves_out_calendars_without_a_link(monkeypatch, language, link):
    from PIL import ImageDraw
    cfg = demo_config(language)
    names = [c["name"] for c in cfg["calendar"]]
    if link is None:
        del cfg["calendar"][1]["url"]
    else:
        cfg["calendar"][1]["url"] = link
    drawn = []
    real = ImageDraw.ImageDraw.text

    def spy(self, xy, text, *args, **kwargs):
        drawn.append(text)
        return real(self, xy, text, *args, **kwargs)
    monkeypatch.setattr(ImageDraw.ImageDraw, "text", spy)
    render(demo_snapshot(cfg, "21:10"), cfg)                  # after hours: tomorrow's list
    assert names[0] in drawn and names[2] in drawn            # the legend draws each name alone
    assert names[1] not in drawn


def test_docs_images_script_draws_the_screens():
    """scripts/docs_images.py keeps working (the admin part needs a browser, so it is not run)."""
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parent.parent / "scripts" / "docs_images.py"
    spec = importlib.util.spec_from_file_location("docs_images", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    for language in ("en-US", "pt-BR"):
        sheet = module.screens(language)
        assert sheet.size == (3 * (W // 2 + 56) + 2 * 40, H // 2 + 56)


# --- when the screen changes next ------------------------------------------------------------

def test_next_change_is_the_next_start_end_or_soon_moment():
    from inkdoor.render import next_change
    from inkdoor.sources import Event
    cfg = with_defaults({"display": {"language": "en-US"}})
    meeting = Event(at("10:00"), at("11:00"), "Review", "Work")
    reminder = Event(at("10:20"), at("10:30"), "Stretch", "Personal", busy=False)
    all_day = Event(at("0:00"), at("0:00", 15), "Holiday", "Work", all_day=True)
    snap = lambda now: Snapshot(now, [meeting, reminder, all_day], [], [])
    assert next_change(snap(at("9:00")), cfg) == at("9:45")      # "in 15 min" starts
    assert next_change(snap(at("9:50")), cfg) == at("10:00")     # the meeting starts
    assert next_change(snap(at("10:05")), cfg) == at("10:20")    # a listed event starts
    assert next_change(snap(at("10:30")), cfg) == at("11:00")    # the meeting ends
    assert next_change(snap(at("11:00")), cfg) == at("19:00")    # the workday ends
    assert next_change(snap(at("19:00")), cfg) == at("0:00", 15)   # the day turns


def test_next_change_starts_with_the_workday():
    from inkdoor.render import next_change
    cfg = with_defaults({"display": {"language": "en-US", "workday_start": 9}})
    assert next_change(Snapshot(at("6:30"), [], [], []), cfg) == at("9:00")


# --- other Kindle screens --------------------------------------------------------------------

@pytest.mark.parametrize("screen", sorted(SCREENS))
@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
@pytest.mark.parametrize("hour", ["7:30", "10:20", "16:50"])
def test_demo_renders_at_every_kindle_screen(screen, language, hour):
    cfg = demo_config(language)
    cfg["display"]["screen"] = screen
    img = render(demo_snapshot(cfg, hour), cfg)
    assert img.size == SCREENS[screen] and img.mode == "L" and grays(img) <= KINDLE_GRAYS
    # nothing past the right edge of the current event's box, the widest thing on screen
    scale = img.width / W
    edge = img.crop((math.ceil((W - M + 24) * scale), 0, img.width, img.height))
    assert grays(edge) == {255}, screen


@pytest.mark.parametrize("screen", sorted(SCREENS))
def test_notice_screens_follow_the_screen(screen):
    cfg = with_defaults({"display": {"language": "pt-BR", "screen": screen}})
    for img in [render_setup(cfg, "http://192.168.100.200:65535"), render_error(cfg, "RuntimeError"),
                render_host_rejected(cfg, "door.example.com")]:
        assert img.size == SCREENS[screen] and grays(img) <= KINDLE_GRAYS


def test_text_is_drawn_with_fonts_sized_for_the_screen():
    # a small screen gets a smaller font, not a shrunk picture: the same text measures the same
    # in layout units, within the rounding of whole font sizes
    from inkdoor.render import Canvas, font
    big = Canvas(Image.new("L", (1072, 1448)))
    small = Canvas(Image.new("L", (600, 800)))
    f = font("SemiBold", 36)
    assert big.scale == 1 and big.height == 1448 and small.height == 1429
    assert abs(small.textlength("Q4 roadmap review", f) - big.textlength("Q4 roadmap review", f)) < 8


def test_unknown_screen_falls_back_to_the_default():
    assert screen_size({"display": {"screen": "1x1"}}) == screen_size(None) == (1072, 1448)
