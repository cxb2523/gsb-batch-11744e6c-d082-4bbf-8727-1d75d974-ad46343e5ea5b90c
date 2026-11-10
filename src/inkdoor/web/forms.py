"""Reads and checks the calendar and task forms of the admin.

Every value comes from a browser and may be missing or tampered with: the readers never raise,
they return the cleaned values plus a dict of translated errors keyed by field name. A pasted
link is never put back into the values, so a refused form cannot echo it to the browser.
"""
from __future__ import annotations

import unicodedata

from ..config import SCREENS, STYLES
from ..i18n import Translator
from . import links

NAME_MAX = 60
LABEL_MAX = 30
OVERDUE_MAX = 365
DEFAULT_OVERDUE = 7
DEFAULT_TASKS_NAME = "TickTick"


def link_field(link: str | None, old: dict) -> dict:
    """{"url": ...} with the new link, else the one already saved; {} when there is none."""
    url = link or old.get("url")
    return {} if url is None else {"url": url}


def keep_unknown(entry: dict, old: dict, managed=frozenset()) -> dict:
    """``entry`` as the form built it, plus every key of ``old`` the form does not manage, so keys
    added to config.toml by hand survive a save from the admin."""
    entry.update((k, v) for k, v in old.items() if k not in entry and k not in managed)
    return entry


def _text(form, key: str) -> str:
    value = form.get(key, "")
    return value.strip() if isinstance(value, str) else ""


def _check_text(value: str, limit: int, t: Translator) -> str | None:
    if any(unicodedata.category(c) == "Cc" for c in value):
        return t("admin.error_single_line")
    if len(value) > limit:
        return t("admin.error_too_long", n=limit)
    return None


def _name(form, key: str, errors: dict, t: Translator, default: str | None = None) -> str:
    name = _text(form, key) or (default or "")
    problem = t("admin.error_name_required") if not name else _check_text(name, NAME_MAX, t)
    if problem:
        errors[key] = problem
    return name


def _link(form, errors: dict, t: Translator, required: bool) -> str | None:
    """The cleaned link, or None to keep the current one (or on error)."""
    try:
        link = links.clean(form.get("url", "") if isinstance(form.get("url"), str) else "")
    except ValueError:
        errors["url"] = t("admin.error_link_invalid")
        return None
    if link is None and required:
        errors["url"] = t("admin.error_link_required")
    return link


def calendar_form(form, t: Translator, *, other_names: list, new: bool):
    """(values, link, errors) for the calendar form. ``link`` None means keep the current one."""
    errors: dict[str, str] = {}
    name = _name(form, "name", errors, t)
    if "name" not in errors and name in other_names:
        errors["name"] = t("config_error.calendar_duplicate", name=name)
    style = _text(form, "style")
    if style not in STYLES:
        errors["style"] = t("admin.error_style")
    label = _text(form, "status_label")
    problem = _check_text(label, LABEL_MAX, t)
    if problem:
        errors["status_label"] = problem
    values = {"name": name, "style": style, "busy": bool(form.get("busy")),
              "status_label": label}
    link = _link(form, errors, t, required=new)
    return values, link, errors


def tasks_form(form, t: Translator, *, new: bool):
    """(values, link, errors) for the task list form. ``link`` None means keep the current one."""
    errors: dict[str, str] = {}
    name = _name(form, "name", errors, t, default=DEFAULT_TASKS_NAME)
    raw_days = _text(form, "overdue_days")
    days = None
    if (len(raw_days) <= 3 and raw_days.isascii() and raw_days.isdigit()
            and int(raw_days) <= OVERDUE_MAX):
        days = int(raw_days)
    else:
        errors["overdue_days"] = t("admin.error_overdue_days")
    values = {"name": name, "overdue_days": days if days is not None else raw_days}
    link = _link(form, errors, t, required=new)
    return values, link, errors


# --- screen settings ---------------------------------------------------------------------------

MIN_GAP_MAX = 240
REFRESH_MIN, REFRESH_MAX = 1, 1440
CLOCKS = ("", "12h", "24h")  # "" leaves the clock to the language
WEEKDAYS = range(7)          # 0 = Monday ... 6 = Sunday
TIMEZONE_MAX = 64


def _whole(form, key: str, low: int, high: int):
    """The field as an int when it is a plain whole number in range, else None."""
    text = _text(form, key)
    if len(text) <= 4 and text.isascii() and text.isdigit() and low <= int(text) <= high:
        return int(text)
    return None


def _shown(text: str) -> str:
    """A refused time zone is shown back only when it looks like one: never a pasted link."""
    ok = len(text) <= TIMEZONE_MAX and all(c.isascii() and (c.isalnum() or c in "_+-/")
                                           for c in text)
    return text if ok else ""


def screen_form(form, t: Translator, *, languages, timezones, language: str | None):
    """(values, errors) for the screen settings form.

    ``language`` is the language to keep when it is set at startup (--lang or INKDOOR_LANG): the
    field is then ignored. On success every value has the type config.toml stores.
    """
    errors: dict[str, str] = {}
    values: dict = {}
    if language is None:
        values["language"] = _text(form, "language")
        if values["language"] not in languages:
            errors["language"] = t("admin.error_language")
    else:
        values["language"] = language

    timezone = _text(form, "timezone")
    values["timezone"] = timezone
    if timezone not in timezones:
        errors["timezone"] = t("admin.error_timezone")
        values["timezone"] = _shown(timezone)

    values["clock"] = _text(form, "clock")
    if values["clock"] not in CLOCKS:
        errors["clock"] = t("admin.error_clock")

    values["screen"] = _text(form, "screen")
    if values["screen"] not in SCREENS:
        errors["screen"] = t("admin.error_screen")

    for key in ("workday_start", "workday_end"):
        hour = _whole(form, key, 0, 24)
        values[key] = hour if hour is not None else _text(form, key)[:8]
        if hour is None:
            errors[key] = t("admin.error_hour")
    if not errors.keys() & {"workday_start", "workday_end"} and \
            values["workday_start"] >= values["workday_end"]:
        errors["workday_end"] = t("admin.error_workday_order")

    days = form.getlist("workdays") if hasattr(form, "getlist") else []
    picked = {int(d) for d in days if isinstance(d, str) and d in {str(i) for i in WEEKDAYS}}
    values["workdays"] = sorted(picked)
    if len(picked) != len(set(days)):
        errors["workdays"] = t("admin.error_workdays")
    elif not picked:
        errors["workdays"] = t("admin.error_workdays_empty")

    gap = _whole(form, "min_gap_minutes", 0, MIN_GAP_MAX)
    values["min_gap_minutes"] = gap if gap is not None else _text(form, "min_gap_minutes")[:8]
    if gap is None:
        errors["min_gap_minutes"] = t("admin.error_min_gap", high=MIN_GAP_MAX)

    refresh = _whole(form, "refresh_minutes", REFRESH_MIN, REFRESH_MAX)
    values["refresh_minutes"] = refresh if refresh is not None else \
        _text(form, "refresh_minutes")[:8]
    if refresh is None:
        errors["refresh_minutes"] = t("admin.error_refresh", low=REFRESH_MIN, high=REFRESH_MAX)
    return values, errors
