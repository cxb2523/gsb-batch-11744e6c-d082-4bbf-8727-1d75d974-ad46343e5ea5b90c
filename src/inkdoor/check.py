"""`inkdoor check`: tests every link in the config and explains what is wrong."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

import icalendar

from . import net
from .config import is_configured
from .i18n import Translator
from .render import translator_for
from .sources import events_from, tasks_from

# Titles that mean the link only publishes free/busy, without details
FREE_BUSY_TITLES = {"busy", "ocupado", "tentative", "provisório", "free", "livre",
                    "away", "ausente", "working elsewhere", "trabalhando em outro lugar",
                    "out of office", "fora do escritório"}

PREFIXES = {"ok": "  ✔", "warn": "  ⚠", "fail": "  ✖"}

# net.FetchError reasons with a message of their own; the rest read "could not reach"
_FETCH_ERROR_KEYS = {"blocked": "check.blocked", "redirects": "check.redirects",
                     "bad_link": "check.bad_link"}


@dataclass
class SourceReport:
    """What the check found for one calendar or task list, in translated words only.

    Messages never contain the link, so a report is safe to show on a web page.
    """
    name: str
    kind: str                                   # "calendar" | "tasks"
    lines: list[tuple[str, str]] = field(default_factory=list)   # ("ok" | "warn" | "fail", message)
    upcoming: list[tuple[dt.datetime | None, str]] = field(default_factory=list)  # (start or None, title)
    ok: bool = True
    # Where `upcoming` is printed among `lines`; None means after all of them
    upcoming_at: int | None = None


def check_link(url: str, t: Translator) -> tuple[bool, str]:
    """Downloads the link and makes sure it is a calendar. Returns (ok, message)."""
    content, message = load_link(url, t)
    return content is not None, message


def load_link(url: str, t: Translator) -> tuple[bytes | None, str]:
    """Downloads the link once and makes sure it parses as a calendar. Returns (content,
    message); None when it failed."""
    if not is_configured(url):
        return None, t("check.not_configured")
    try:
        content = net.fetch(url)
    except net.FetchError as ex:
        if ex.reason == "http":
            if ex.status in (401, 403):
                return None, t("check.denied", status=ex.status)
            if ex.status == 404:
                return None, t("check.not_found")
            return None, t("check.http_error", status=ex.status)
        if ex.reason == "too_large":
            return None, t("check.too_large", mb=net.MAX_BYTES // 1_000_000)
        if ex.reason == "timeout":
            return None, t("check.timeout", seconds=int(net.DEADLINE))
        return None, t(_FETCH_ERROR_KEYS.get(ex.reason, "check.unreachable"))
    head = content[:2000]
    if b"BEGIN:VCALENDAR" not in head:
        return None, t("check.html_page") if b"<html" in head.lower() else t("check.not_ics")
    try:
        icalendar.Calendar.from_ical(content)
    except Exception:
        return None, t("check.invalid")
    return content, t("check.ok", kb=len(content) // 1024 or 1)


def check_calendar(calendar: dict, cfg: dict, now: dt.datetime) -> SourceReport:
    t = translator_for(cfg)
    tz = ZoneInfo(cfg["display"]["timezone"])
    start = dt.datetime.combine(now.date(), dt.time.min, tz)
    end = start + dt.timedelta(days=14)
    report = SourceReport(calendar["name"], "calendar")
    content, message = load_link(calendar.get("url", ""), t)
    report.lines.append(("fail" if content is None else "ok", message))
    if content is None:
        report.ok = False
        return report
    try:
        found = events_from(content, calendar, start, end, tz)
    except Exception as ex:
        report.lines.append(("fail", t("check.read_failed", error=ex.__class__.__name__)))
        report.ok = False
        return report
    events = [e for e in found if not e.all_day]
    all_day = len(found) - len(events)
    if not found:
        report.lines.append(("warn", t("check.no_events")))
        return report
    if events:
        report.lines.append(("ok", t("check.events_found", n=len(events))))
    if all_day:
        report.lines.append(("ok", t("check.all_day_found", n=all_day)))
    if not events:
        return report
    titles = {e.title.strip().lower() for e in events}
    if titles <= FREE_BUSY_TITLES:
        report.lines.append(("warn", t("check.busy_only")))
    report.upcoming = [(e.start, e.title or t("untitled")) for e in events if e.end > now][:3]
    report.upcoming_at = len(report.lines)
    # many events before 6 AM usually means a wrong time zone
    if len([e for e in events if e.start.hour < 6]) > len(events) / 3:
        report.lines.append(("warn", t("check.timezone")))
    return report


def check_tasks(tasks_cfg: dict, cfg: dict, now: dt.datetime) -> SourceReport:
    t = translator_for(cfg)
    tz = ZoneInfo(cfg["display"]["timezone"])
    report = SourceReport(tasks_cfg["name"], "tasks")
    content, message = load_link(tasks_cfg.get("url", ""), t)
    report.lines.append(("fail" if content is None else "ok", message))
    if content is None:
        report.ok = False
        return report
    try:
        tasks = tasks_from(content, tasks_cfg, now.date(), tz)
    except Exception as ex:
        report.lines.append(("fail", t("check.read_failed", error=ex.__class__.__name__)))
        report.ok = False
        return report
    report.lines.append(("ok", t("check.tasks_found", n=len(tasks))))
    report.upcoming = [(None, f"{t('check.overdue_prefix') if task.overdue else ''}{task.title or t('untitled')}")
                       for task in tasks[:3]]
    return report


def _print_upcoming(report: SourceReport, t: Translator) -> None:
    # "Oct 4" is shorter than "Oct 14": pad the dates to keep the times in one column
    width = max((len(t.date_short(start)) for start, _ in report.upcoming if start), default=0)
    for start, title in report.upcoming:
        if start is None:
            print(f"     {title}")
        else:
            print(f"     {t.date_short(start):<{width}} {t.time(start):>8}  {title}")


def _print_header(name: str) -> None:
    # flush: a slow link must show which source is being tested, even when output is piped
    print(f"\n■ {name}", flush=True)


def _print_report(report: SourceReport, t: Translator) -> None:
    upcoming_at = len(report.lines) if report.upcoming_at is None else report.upcoming_at
    for index, (level, message) in enumerate(report.lines):
        if index == upcoming_at:
            _print_upcoming(report, t)
        print(PREFIXES[level], message)
    if upcoming_at >= len(report.lines):
        _print_upcoming(report, t)
    print(end="", flush=True)


def run(cfg: dict, now: dt.datetime | None = None) -> bool:
    t = translator_for(cfg)
    tz = ZoneInfo(cfg["display"]["timezone"])
    now = now or dt.datetime.now(tz)
    reports = []
    # Header before the (possibly slow) check, report as soon as it is built
    for calendar in cfg.get("calendar", []):
        _print_header(calendar["name"])
        reports.append(check_calendar(calendar, cfg, now))
        _print_report(reports[-1], t)
    if cfg.get("tasks"):
        _print_header(cfg["tasks"]["name"])
        reports.append(check_tasks(cfg["tasks"], cfg, now))
        _print_report(reports[-1], t)
    all_ok = all(report.ok for report in reports)
    print("\n" + (t("check.all_good") if all_ok else t("check.fix_errors")))
    return all_ok
