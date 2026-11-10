"""
Draws the screen for the Kindle's resolution (``[display] screen``), in 16 shades of gray.

The layout is written for a screen 1072 wide (Kindle Paperwhite 3 and 4) and drawn through a
``Canvas`` that scales every coordinate, stroke and font size to the real screen, so text stays
sharp at any size. The height follows the screen's proportions.

Layout, top to bottom:
  1. Status, for whoever is at the door (read from 2 m away in 2 seconds): can I come in? until when?
  2. Today: events with the free gaps between them and a "now" marker.
  3. Tasks: overdue first.
  4. Footer: tomorrow at a glance + calendar legend.
"""
from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

from .config import DEFAULT_SCREEN, SCREENS, is_configured
from .i18n import Translator
from .sources import Event, Snapshot

W, H = 1072, 1448            # the layout's width, and the height of a 1072 x 1448 screen
M = 64                       # side margin
EVENT_ROW = 96               # height of an event row
# The current event sits in a rounded black box with 14 px above and below its text, so its row
# is taller; the text keeps the position it has in any other row.
CURRENT_ROW = 110
BLACK, DARK, GRAY, LIGHT, WHITE = 0, 68, 119, 187, 255
SOON_MINUTES = 15            # a busy event this close is "in 12 min" instead of "at 10:00"

_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
_font_cache: dict = {}


def font(weight: str, size: int, display: bool = False):
    name = f"{'InterDisplay' if display else 'Inter'}-{weight}.otf"
    return _truetype(os.path.join(_FONTS_DIR, name), size)


def _truetype(path: str, size: int):
    key = (path, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]


def screen_size(cfg: dict | None) -> tuple[int, int]:
    """(width, height) of the Kindle's screen in pixels, portrait."""
    name = ((cfg or {}).get("display") or {}).get("screen", DEFAULT_SCREEN)
    return SCREENS.get(name, SCREENS[DEFAULT_SCREEN])


class Canvas:
    """ImageDraw in layout units: a 1072-wide screen whose height follows the real one's
    proportions. Coordinates, strokes and fonts are scaled to the real screen when drawn, and
    text is measured with the font the screen gets, so what fits here fits there. At 1072 wide
    every call goes to ImageDraw unchanged."""

    def __init__(self, img: Image.Image):
        self._d = ImageDraw.Draw(img)
        self.scale = img.width / W
        self.height = round(img.height / self.scale)

    def _font(self, f):
        return f if self.scale == 1 else _truetype(f.path, round(f.size * self.scale))

    def _xy(self, xy):
        return xy if self.scale == 1 else [v * self.scale for v in xy]

    def _width(self, width):
        # 2 px at least: thinner lines fade on e-ink
        return width if self.scale == 1 else max(2, round(width * self.scale))

    def text(self, xy, text, font, fill):
        self._d.text(self._xy(xy), text, font=self._font(font), fill=fill)

    def textlength(self, text, font):
        return self._d.textlength(text, font=self._font(font)) / self.scale

    def textbbox(self, xy, text, font):
        box = self._d.textbbox(self._xy(xy), text, font=self._font(font))
        return box if self.scale == 1 else tuple(v / self.scale for v in box)

    def line(self, xy, fill, width):
        self._d.line(self._xy(xy), fill=fill, width=self._width(width))

    def rectangle(self, box, fill=None, outline=None, width=1):
        self._d.rectangle(self._xy(box), fill=fill, outline=outline, width=self._width(width))

    def rounded_rectangle(self, box, radius, fill=None, outline=None, width=1):
        self._d.rounded_rectangle(self._xy(box), radius * self.scale, fill=fill, outline=outline,
                                  width=self._width(width))

    def ellipse(self, box, fill):
        self._d.ellipse(self._xy(box), fill=fill)


def _blank(cfg: dict | None) -> tuple[Image.Image, Canvas]:
    img = Image.new("L", screen_size(cfg), WHITE)
    return img, Canvas(img)


def _snap(img: Image.Image) -> Image.Image:
    # the Kindle shows 16 shades: snap to them to avoid dithering
    return img.point(lambda v: min(255, round(v / 17) * 17))


def translator_for(cfg: dict) -> Translator:
    display = cfg.get("display", {})
    return Translator(display.get("language"), display.get("clock"))


# ---------------------------------------------------------------- status

@dataclass
class Status:
    busy: bool
    word: str        # "In a meeting" / "Free"
    headline: str    # "until 3:30 PM"
    detail: str      # smaller line


def compute_status(snap: Snapshot, cfg: dict, t: Translator) -> Status:
    display = cfg["display"]
    now = snap.now
    blocking = [e for e in snap.today if e.busy and not e.all_day]
    current = [e for e in blocking if e.start <= now < e.end]

    def end_of_block(moment):
        # back-to-back events (up to 5 min apart) count as one block
        changed = True
        while changed:
            changed = False
            for e in blocking:
                if e.start <= moment + dt.timedelta(minutes=5) and e.end > moment:
                    moment, changed = e.end, True
        return moment

    working_hours = (now.weekday() in display["workdays"] and
                     display["workday_start"] <= now.hour < display["workday_end"])

    if snap.unknown and not current:
        # a busy calendar could not be read at all: never claim "Free" without knowing
        return Status(True, t("status.unknown"), t("status.unknown_headline"),
                      t("status.unknown_detail", sources=", ".join(snap.unknown)))

    if snap.configured == "no_busy" and not current:
        # calendars exist but none marks the owner busy: "Free" would be a guess
        return Status(True, t("status.unknown"), t("status.no_busy_headline"),
                      t("status.no_busy_detail"))

    if current:
        main = min(current, key=lambda e: e.end)
        until = end_of_block(max(e.end for e in current))
        later = [e for e in blocking if e.start >= until]
        then = (t("status.then_free_until", time=t.time(later[0].start)) if later
                else t("status.then_free_rest"))
        return Status(True, main.status_label or t("status.busy"),
                      t("status.until", time=t.time(until)),
                      f"{main.title or t('untitled')} · {then}")

    upcoming = [e for e in blocking if e.start > now]
    if upcoming:
        nxt = upcoming[0]
        minutes = int((nxt.start - now).total_seconds() // 60)
        title = nxt.title or t("untitled")
        detail = (t("status.next_in", title=title, duration=t.duration(minutes)) if minutes <= SOON_MINUTES
                  else t("status.next_at", title=title, time=t.time(nxt.start)))
        return Status(False, t("status.free"), t("status.until", time=t.time(nxt.start)), detail)

    if not working_hours:
        tomorrow = [e for e in snap.tomorrow if e.busy and not e.all_day]
        detail = (t("status.tomorrow_first", time=t.time(tomorrow[0].start)) if tomorrow
                  else t("status.tomorrow_empty"))
        return Status(False, t("status.free"), t("status.after_hours"), detail)
    return Status(False, t("status.free"), t("status.rest_of_day"), t("status.no_more_today"))


def next_change(snap: Snapshot, cfg: dict) -> dt.datetime | None:
    """The next moment the screen changes with the clock alone, from what ``snap`` holds: an
    event starts or ends, a busy event comes within SOON_MINUTES, the workday starts or ends, or
    the day turns. None when nothing is ahead (calendar changes are caught by the refresh)."""
    now = snap.now
    moments = []
    for e in snap.today + snap.tomorrow:
        if not e.all_day:
            moments += [e.start, e.end]
            if e.busy:
                moments.append(e.start - dt.timedelta(minutes=SOON_MINUTES))
    midnight = dt.datetime.combine(now.date(), dt.time.min, now.tzinfo)
    display = cfg["display"]
    moments += [midnight + dt.timedelta(hours=display["workday_start"]),
                midnight + dt.timedelta(hours=display["workday_end"]),
                midnight + dt.timedelta(days=1)]
    return min((m for m in moments if m > now), default=None)


# ---------------------------------------------------------------- drawing helpers

def ellipsize(d: Canvas, text: str, f, width: int) -> str:
    if d.textlength(text, font=f) <= width:
        return text
    while text and d.textlength(text + "…", font=f) > width:
        text = text[:-1]
    return text.rstrip(" ·-–") + "…"


def tracked(d, xy, text, f, fill, tracking=3):
    """Text with letter spacing, for section labels."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + tracking
    return x


def marker(d, box, style, color=BLACK, background=WHITE):
    """Calendar marker. E-ink has no color, so calendars differ by pattern."""
    x0, y0, x1, y1 = box
    if style == "striped":
        d.rectangle(box, outline=color, width=3)
        y = y0 + 3
        while y < y1:
            d.line((x0, y, x1, y), fill=color, width=3)
            y += 9
    elif style == "outline":
        d.rectangle(box, outline=color, width=4, fill=background)
    else:
        d.rectangle(box, fill=color)


def section_header(d, y, title, right=""):
    tracked(d, (M, y), title.upper(), font("Bold", 24), BLACK, tracking=4)
    if right:
        f = font("Medium", 24)
        d.text((W - M - d.textlength(right, font=f), y), right, font=f, fill=GRAY)
    d.line((M, y + 42, W - M, y + 42), fill=BLACK, width=3)
    return y + 60


# ---------------------------------------------------------------- blocks

def draw_header(d, now, t: Translator):
    d.text((M, 44), t.date_header(now), font=font("Bold", 44, True), fill=BLACK)
    f = font("Medium", 26)
    text = t("updated_at", time=t.time(now))
    d.text((W - M - d.textlength(text, font=f), 58), text, font=f, fill=GRAY)


def fit_word(d, word: str, width: int):
    """(font, lines) for the status word: the largest size from 150 down to 80 that fits on one
    line; below that, two lines at 80 (the admin allows 30-character labels), ellipsized only
    when even two lines are not enough."""
    size = 150
    while d.textlength(word, font=font("Black", size, True)) > width and size > 80:
        size -= 4
    f = font("Black", size, True)
    lines = _wrap(d, word, f, width) or [word]     # a blank label still gets one line
    if len(lines) > 2:
        lines = [lines[0], ellipsize(d, " ".join(lines[1:]), f, width)]
    return f, lines


def draw_status(d, st: Status, y):
    pad = 52
    width = W - 2 * M - 2 * pad
    f1, words = fit_word(d, st.word.upper(), width)
    f2, f3 = font("Bold", 76, True), font("Medium", 32)
    while d.textlength(st.headline, font=f2) > width and f2.size > 48:
        f2 = font("Bold", f2.size - 4, True)
    b1 = d.textbbox((0, 0), "ÁGp" if len(words) > 1 else words[0], font=f1)
    b2 = d.textbbox((0, 0), "0:00gpé", font=f2)
    b3 = d.textbbox((0, 0), "Ágp", font=f3)
    top = 46
    y1 = y + top - b1[1]
    line_step = b1[3] - b1[1] + 12
    y2 = y1 + (len(words) - 1) * line_step + b1[3] + 22 - b2[1]
    y3 = y2 + b2[3] + 20 - b3[1]
    # without a detail line the box ends below the headline, with no empty band
    bottom = y3 + b3[3] if st.detail else y2 + b2[3]
    height = (bottom - y) + top
    box = (M, y, W - M, y + height)
    if st.busy:
        d.rounded_rectangle(box, 24, fill=BLACK)
        fg, soft = WHITE, LIGHT
    else:
        d.rounded_rectangle(box, 24, fill=WHITE, outline=BLACK, width=7)
        fg, soft = BLACK, DARK
    for i, line in enumerate(words):
        d.text((M + pad, y1 + i * line_step), line, font=f1, fill=fg)
    d.text((M + pad, y2), st.headline, font=f2, fill=fg)
    if st.detail:
        d.text((M + pad, y3), ellipsize(d, st.detail, f3, width), font=f3, fill=soft)
    return y + height


@dataclass
class Row:
    kind: str                 # event | gap | now | done
    height: int
    event: Event | None = None
    text: str = ""
    current: bool = False
    past: bool = False


def build_rows(events: list, now, cfg, t: Translator, mark_now=True) -> list[Row]:
    min_gap = cfg["display"]["min_gap_minutes"]
    events = [e for e in events if not e.all_day]
    rows: list[Row] = []
    cursor = None             # end of the last listed event
    now_marked = not mark_now

    for e in events:
        past = e.end <= now
        current = e.start <= now < e.end
        if not now_marked and now < e.start and (cursor is None or cursor <= now):
            minutes = int((e.start - now).total_seconds() // 60)
            rows.append(Row("now", 66, text=t("agenda.free_for", duration=t.duration(minutes))))
            now_marked = True
        elif cursor is not None and e.start > cursor:
            minutes = int((e.start - cursor).total_seconds() // 60)
            if minutes >= min_gap:
                rows.append(Row("gap", 52, text=t("agenda.gap", duration=t.duration(minutes)),
                                past=mark_now and e.start <= now))
        if current:
            now_marked = True
        rows.append(Row("event", CURRENT_ROW if current else EVENT_ROW, event=e, current=current,
                        past=mark_now and past))
        cursor = max(cursor, e.end) if cursor else e.end

    if events and not now_marked:
        rows.append(Row("now", 66, text=t("agenda.no_more")))
    return rows


def draw_rows(d, rows: list[Row], y, y_max, now, t: Translator):
    f_start, f_end = font("Bold", 36, True), font("Medium", 26)
    f_now = font("Bold", 32, True)
    # the time column fits the widest time on screen (12h times are wider)
    time_width = max([d.textlength(t.time(now), font=f_now)] +
                     [max(d.textlength(t.time(r.event.start), font=f_start),
                          d.textlength(t.time(r.event.end), font=f_end))
                      for r in rows if r.kind == "event"])
    col_time = M
    col_marker = M + max(150, int(time_width) + 26)
    col_text = col_marker + 42
    text_width = W - M - col_text

    # when it does not fit, collapse past events into a single line
    if sum(r.height for r in rows) > y_max - y:
        past = [r for r in rows if r.past]
        n = sum(1 for r in past if r.kind == "event")
        if n:
            rows = [Row("done", 52, text=t("agenda.done", n=n))] + [r for r in rows if r not in past]

    for i, r in enumerate(rows):
        remaining = len(rows) - i - 1
        nxt = rows[i + 1] if remaining else None
        if r.kind == "gap" and nxt is not None and y + r.height + nxt.height > y_max:
            continue   # a gap without the event after it is useless: skip
        if y + r.height > y_max or (remaining and y + r.height + 46 > y_max and
                                     sum(x.height for x in rows[i:]) > y_max - y):
            rest = sum(1 for x in rows[i:] if x.kind == "event")
            if rest:
                d.text((col_text, y + 6), t("agenda.more_later", n=rest),
                       font=font("SemiBold", 28), fill=DARK)
                y += 46
            break

        if r.kind == "event":
            e = r.event
            if r.current:
                d.rounded_rectangle((M - 20, y, W - M + 20, y + r.height - 8), 16, fill=BLACK)
            color = WHITE if r.current else (GRAY if r.past else BLACK)
            color2 = LIGHT if (r.current or r.past) else GRAY
            d.text((col_time, y + 14), t.time(e.start), font=f_start, fill=color)
            d.text((col_time, y + 56), t.time(e.end), font=f_end, fill=color2)
            marker(d, (col_marker, y + 14, col_marker + 16, y + EVENT_ROW - 22), e.style,
                   color=(WHITE if r.current else (LIGHT if r.past else BLACK)),
                   background=(BLACK if r.current else WHITE))
            f_title = font("SemiBold", 36)
            d.text((col_text, y + 10), ellipsize(d, e.title or t("untitled"), f_title, text_width),
                   font=f_title, fill=color)
            meta = " · ".join([t.duration(e.minutes), e.source] + ([e.location] if e.location else []))
            if r.current:
                meta = f"{t('agenda.now')} · {meta}"
            d.text((col_text, y + 58), ellipsize(d, meta, f_end, text_width), font=f_end, fill=color2)
        elif r.kind == "gap":
            mid = y + r.height // 2
            f = font("Medium", 26)
            d.text((col_text, mid - 17), r.text, font=f, fill=GRAY)
            x = col_text + d.textlength(r.text, font=f) + 18
            while x + 8 <= W - M:    # the whole dash inside the margin, not just its start
                d.line((x, mid, x + 8, mid), fill=LIGHT, width=3)
                x += 18
        elif r.kind == "now":
            mid = y + r.height // 2
            d.ellipse((col_marker - 4, mid - 12, col_marker + 20, mid + 12), fill=BLACK)
            d.line((col_marker + 20, mid, col_text - 14, mid), fill=BLACK, width=4)
            d.text((col_text, mid - 22), r.text, font=font("Bold", 32), fill=BLACK)
            d.text((col_time, mid - 22), t.time(now), font=f_now, fill=BLACK)
        elif r.kind == "done":
            d.text((col_text, y + 8), r.text, font=font("Medium", 28), fill=GRAY)
        y += r.height
    return y


def draw_all_day(d, events, y):
    all_day = [e for e in events if e.all_day]
    if not all_day:
        return y
    x = M
    f = font("SemiBold", 26)
    for e in all_day[:3]:
        text = ellipsize(d, e.title, f, 420)
        w = d.textlength(text, font=f) + 40
        if x + w > W - M:
            break
        d.rounded_rectangle((x, y, x + w, y + 46), 23, outline=BLACK, width=3)
        d.text((x + 20, y + 8), text, font=f, fill=BLACK)
        x += w + 14
    return y + 66


def draw_tasks(d, tasks, y, y_max, t: Translator):
    f = font("Medium", 32)
    f_tag = font("Bold", 22)
    f_time = font("Bold", 30, True)
    for i, task in enumerate(tasks):
        if y + 62 > y_max or (i < len(tasks) - 1 and y + 62 + 44 > y_max):
            d.text((M + 56, y + 2), t("tasks.more", n=len(tasks) - i), font=font("SemiBold", 28), fill=DARK)
            return y + 44
        d.rounded_rectangle((M, y + 8, M + 34, y + 42), 6, outline=BLACK, width=4)  # checkbox
        x_tag = W - M
        if task.overdue:
            tag = t("tasks.overdue_tag")
            x_tag = W - M - (d.textlength(tag, font=f_tag) + 28)
            d.rounded_rectangle((x_tag, y + 8, W - M, y + 44), 8, fill=BLACK)
            d.text((x_tag + 14, y + 13), tag, font=f_tag, fill=WHITE)
        elif task.time:
            tag = t.time(task.time)
            x_tag = W - M - d.textlength(tag, font=f_time)
            d.text((x_tag, y + 6), tag, font=f_time, fill=BLACK)
        priority = "!" * task.priority if task.priority >= 2 else ""
        x = M + 56
        if priority:
            d.text((x, y + 2), priority, font=font("Black", 34), fill=BLACK)
            x += d.textlength(priority, font=font("Black", 34)) + 10
        d.text((x, y + 4), ellipsize(d, task.title or t("untitled"), f, x_tag - x - 20), font=f, fill=BLACK)
        y += 62
    return y


def draw_footer(d, snap: Snapshot, cfg, t: Translator, showing_tomorrow: bool):
    y = d.height - 96
    d.line((M, y, W - M, y), fill=BLACK, width=3)

    # calendar legend (right side): at most half the width, otherwise it is left out. Only
    # calendars with a link: one without is never read, so it has nothing on the screen.
    calendars = [c for c in cfg.get("calendar", []) if is_configured(c.get("url"))]
    f = font("Medium", 24)
    legend_width = sum(d.textlength(c["name"], font=f) + 54 for c in calendars)
    x = W - M
    if calendars and legend_width <= (W - 2 * M) / 2:
        for calendar in reversed(calendars):
            x -= d.textlength(calendar["name"], font=f)
            d.text((x, y + 30), calendar["name"], font=f, fill=DARK)
            x -= 24
            marker(d, (x, y + 30, x + 14, y + 58), calendar.get("style", "solid"))
            x -= 30
    text_limit = x - 20

    today = [e for e in snap.today if not e.all_day]
    tomorrow = [e for e in snap.tomorrow if not e.all_day]
    fe = font("SemiBold", 28)
    if showing_tomorrow:
        text = t("footer.today_done", n=len(today)) if today else t("footer.today_empty")
    elif tomorrow:
        n, first = len(tomorrow), t.time(tomorrow[0].start)
        options = [t("footer.tomorrow_long", n=n, time=first),
                   t("footer.tomorrow_medium", n=n, time=first),
                   t("footer.tomorrow_short", n=n, time=first)]
        text = next((o for o in options if M + d.textlength(o, font=fe) <= text_limit), options[-1])
    else:
        text = t("footer.tomorrow_free")
    d.text((M, y + 26), ellipsize(d, text, fe, text_limit - M), font=fe, fill=BLACK)
    if snap.errors:
        fs = font("Medium", 20)
        d.text((M, y + 64), ellipsize(d, t("footer.unreachable", sources="; ".join(snap.errors)), fs, W - 2 * M),
               font=fs, fill=GRAY)


# ---------------------------------------------------------------- full screen

def render(snap: Snapshot, cfg: dict) -> Image.Image:
    t = translator_for(cfg)
    img, d = _blank(cfg)
    now = snap.now

    draw_header(d, now, t)
    y = draw_status(d, compute_status(snap, cfg, t), 130) + 44

    # after hours with nothing left today, the list switches to tomorrow
    today_timed = [e for e in snap.today if not e.all_day]
    remaining = [e for e in today_timed if e.end > now]
    workday_end = (dt.datetime.combine(now.date(), dt.time.min, now.tzinfo)
                   + dt.timedelta(hours=cfg["display"]["workday_end"]))
    showing_tomorrow = not remaining and now >= workday_end

    if showing_tomorrow:
        events = snap.tomorrow
        rows = build_rows(events, now, cfg, t, mark_now=False)
        n = len([e for e in events if not e.all_day])
        title = t("section.tomorrow", weekday=t.weekday(now + dt.timedelta(days=1)).lower())
        right = t("agenda.events", n=n) if n else ""
    else:
        events = snap.today
        rows = build_rows(events, now, cfg, t)
        title = t("section.today")
        right = t("agenda.remaining", left=len(remaining), total=len(today_timed)) if today_timed else ""

    limit = d.height - 120
    tasks = snap.tasks
    tasks_reserve = (60 + 62 * min(2, len(tasks)) + 44 + 26) if tasks else 0

    y = section_header(d, y, title, right)
    y = draw_all_day(d, events, y)
    if not rows:
        d.text((M, y + 4), t("agenda.none"), font=font("Medium", 32), fill=GRAY)
        y += 70
    else:
        y = draw_rows(d, rows, y, limit - tasks_reserve, now, t)
    y += 26

    if tasks:
        overdue = sum(1 for task in tasks if task.overdue)
        parts = []
        if len(tasks) - overdue:
            parts.append(t("tasks.for_today", n=len(tasks) - overdue))
        if overdue:
            parts.append(t("tasks.overdue_count", n=overdue))
        right = " · ".join(parts)
        y = section_header(d, y, t("section.tasks"), right)
        draw_tasks(d, tasks, y, limit, t)

    draw_footer(d, snap, cfg, t, showing_tomorrow)
    return _snap(img)


def render_error(cfg: dict | None, message: str) -> Image.Image:
    """Screen shown when inkdoor itself fails, so the door never keeps a stale status."""
    t = translator_for(cfg or {})
    st = Status(True, t("status.unknown"), t("status.error_headline"), t("status.error_detail"))
    return _render_notice(cfg, st, message, size=28, line_height=40, max_lines=12)


def _render_notice(cfg: dict | None, st: Status, text: str, size: int = 36, line_height: int = 52,
                   max_lines: int = 8) -> Image.Image:
    """The status box, then ``text`` wrapped below it, so long text and URLs stay readable."""
    img, d = _blank(cfg)
    y = draw_status(d, st, 130) + 60
    f = font("Medium", size)
    for line in _wrap(d, text, f, W - 2 * M)[:max_lines]:
        d.text((M, y), line, font=f, fill=DARK)
        y += line_height
    return _snap(img)


def render_setup(cfg: dict | None, admin_url: str | None) -> Image.Image:
    """Screen shown while no calendar or task link is configured yet."""
    t = translator_for(cfg or {})
    detail = (t("status.setup_admin", url=admin_url) if admin_url is not None
              else t("status.setup_file"))
    return _render_notice(cfg, Status(True, t("status.setup"), t("status.setup_headline"), ""),
                          detail)


def render_host_rejected(cfg: dict | None, host: str | None) -> Image.Image:
    """Screen shown when the Kindle reached the server through a host name that is not allowed.

    Without ``host``, the detail names no host (the image shared by many rejected names).
    """
    t = translator_for(cfg or {})
    detail = t("status.host_detail_generic") if host is None else t("status.host_detail", host=host[:60])
    return _render_notice(cfg, Status(True, t("status.unknown"), t("status.host_headline"), ""),
                          detail)


def _wrap(d, text: str, f, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if d.textlength(candidate, font=f) <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = ellipsize(d, word, f, width)
    return lines + ([line] if line else [])
