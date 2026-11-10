"""The Calendars and Tasks pages, and the "Test link" button on both.

"Test" reads the link from the file, never from the browser.
"""
from __future__ import annotations

import copy
import datetime as dt
import threading
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

from flask import Blueprint, abort, make_response, redirect, render_template, request

from .. import check as checker
from .. import config, config_edit
from ..config import STYLES, is_configured
from . import forms, links
from .editing import Editor, confirm_page, confirmed, link_given, masked

# At most two link tests at a time across all browsers; a third gets "busy" (429) at once, so
# slow links can never take all of Waitress's threads away from /kindle.png.
TESTS = threading.BoundedSemaphore(2)
FRAGMENT_HEADER = "X-Inkdoor-Fragment"  # tells admin.js the answer is a result, not a full page


@dataclass
class TestResult:
    index: int | None                        # the tested calendar; None for the task list
    rows: list = field(default_factory=list)  # {"kind": "line"|"event", "level"|"when", "text"}
    message: str | None = None               # instead of rows: busy, not testable...
    level: str = "fail"


def _capitalized(text: str) -> str:
    return text[:1].upper() + text[1:]


def _calendar_entry(values: dict, link: str | None, old: dict) -> dict:
    """The calendar as written to the file: known keys first, unknown keys kept."""
    label = {"status_label": values["status_label"]} if values["status_label"] else {}
    entry = {"name": values["name"], "style": values["style"], "busy": values["busy"], **label,
             **forms.link_field(link, old)}
    return forms.keep_unknown(entry, old, managed={"status_label"})


def _tasks_entry(values: dict, link: str | None, old: dict) -> dict:
    """The task list as written to the file: known keys first, unknown keys kept."""
    entry = {"name": values["name"], **forms.link_field(link, old),
             "overdue_days": values["overdue_days"]}
    return forms.keep_unknown(entry, old)


def register(bp: Blueprint, ed: Editor) -> None:
    state, t = ed.state, ed.t

    # --- link tests ---------------------------------------------------------------------------

    def is_xhr() -> bool:
        return request.headers.get("X-Requested-With") == "inkdoor"

    def fragment(result: TestResult, status: int):
        response = make_response(render_template("_test_result.html", result=result), status)
        response.headers[FRAGMENT_HEADER] = "1"
        return response

    def test_config(raw) -> dict:
        """The file's settings with defaults, in the language and clock of the admin pages."""
        try:
            cfg = config_edit.check(raw.data)
        except config.ConfigInvalid:  # e.g. a bad time zone: test with what the door uses
            cfg = copy.deepcopy(state.cfg)
        cfg["display"]["language"] = t().language
        cfg["display"]["clock"] = t().clock
        return cfg

    def report_rows(report: checker.SourceReport) -> list:
        lines = [{"kind": "line", "level": level, "text": _capitalized(text)}
                 for level, text in report.lines]
        events = [{"kind": "event", "text": title,
                   "when": f"{t().date_short(start)} {t().time(start)}" if start else ""}
                  for start, title in report.upcoming]
        at = len(lines) if report.upcoming_at is None else report.upcoming_at
        return lines[:at] + events + lines[at:]

    def run_test(index: int | None, source: dict, raw, check):
        """(result, status) of testing one calendar or task list taken from the raw file."""
        source = dict(source)
        url = source.get("url")
        source["url"] = url if isinstance(url, str) else ""
        source["name"] = str(source.get("name", forms.DEFAULT_TASKS_NAME))
        if is_configured(source["url"]) and not links.is_web(source["url"]):
            # a local path set by hand: the admin never reads local files
            return TestResult(index, message=t()("admin.test_not_web"), level="warn"), 200
        if not TESTS.acquire(blocking=False):
            return TestResult(index, message=t()("admin.test_busy"), level="warn"), 429
        try:
            cfg = test_config(raw)
            now = dt.datetime.now(ZoneInfo(cfg["display"]["timezone"]))
            report = check(source, cfg, now)
        finally:
            TESTS.release()
        return TestResult(index, rows=report_rows(report)), 200

    def test_refused(target: str, problem: str | None):
        if is_xhr():
            message = problem or t()("admin.changed_elsewhere")
            return fragment(TestResult(None, message=message), 409)
        return redirect(target, 303) if problem else ed.changed(target)

    # --- calendars ----------------------------------------------------------------------------

    def calendar_cards(raw) -> list:
        cards = []
        for index, calendar in enumerate(raw.data.get("calendar", [])):
            style = calendar.get("style", "solid")
            cards.append({
                "index": index, "name": str(calendar.get("name", "")),
                "style": style if style in STYLES else "solid",
                "busy": bool(calendar.get("busy", True)),
                "status_label": str(calendar.get("status_label") or ""),
                "link": masked(calendar.get("url")),
            })
        return cards

    def calendars_page(raw=None, result: TestResult | None = None, status: int = 200):
        problem = None
        if raw is None:
            raw, problem = ed.read()
        context = {"problem": problem, "result": result, "default_label": t()("status.busy")}
        if raw is not None:
            context.update(cards=calendar_cards(raw), digest=raw.digest,
                           warning=ed.invalid(raw.data))
        context["restore"] = ed.restore_offer(raw, problem, context.get("warning"))
        return render_template("calendars.html", **context), status

    def calendar_form_page(raw, index, values, errors=None, form_error=None):
        old = raw.data["calendar"][index] if index is not None else {}
        return render_template(
            "calendar_form.html", index=index, values=values, errors=errors or {},
            link=masked(old.get("url")), digest=raw.digest, styles=STYLES,
            repaste=bool(errors) and link_given(), form_error=form_error,
            default_label=t()("status.busy"))

    def calendar_values(calendar: dict) -> dict:
        return {"name": str(calendar.get("name", "")), "style": calendar.get("style", "solid"),
                "busy": bool(calendar.get("busy", True)),
                "status_label": str(calendar.get("status_label") or "")}

    @bp.get("/calendars")
    def calendars():
        return calendars_page()

    @bp.route("/calendars/new", methods=["GET", "POST"])
    def calendar_new():
        if request.method != "POST":
            raw, _ = ed.read()
            if raw is None:
                return redirect("/calendars", 303)
            return calendar_form_page(raw, None, calendar_values({}))
        raw, response = ed.fresh("/calendars")
        if response:
            return response
        data = copy.deepcopy(raw.data)
        existing = data.get("calendar", [])
        values, link, errors = forms.calendar_form(
            request.form, t(), other_names=[c.get("name") for c in existing], new=True)
        form_error = None
        if not errors:
            data["calendar"] = existing + [_calendar_entry(values, link, {})]
            response, form_error = ed.save(raw, data, "/calendars")
            if response:
                return response
        return calendar_form_page(raw, None, values, errors, form_error)

    @bp.route("/calendars/<int:index>", methods=["GET", "POST"])
    def calendar_edit(index: int):
        if request.method != "POST":
            raw, _ = ed.read()
            if raw is None:
                return redirect("/calendars", 303)
            existing = raw.data.get("calendar", [])
            if index >= len(existing):
                return ed.changed("/calendars")
            return calendar_form_page(raw, index, calendar_values(existing[index]))
        raw, response = ed.fresh("/calendars")
        if response:
            return response
        data = copy.deepcopy(raw.data)
        existing = data.get("calendar", [])
        if index >= len(existing):
            return ed.changed("/calendars")
        others = [c.get("name") for i, c in enumerate(existing) if i != index]
        values, link, errors = forms.calendar_form(request.form, t(), other_names=others,
                                                   new=False)
        form_error = None
        if not errors:
            existing[index] = _calendar_entry(values, link, existing[index])
            response, form_error = ed.save(raw, data, "/calendars")
            if response:
                return response
        return calendar_form_page(raw, index, values, errors, form_error)

    @bp.post("/calendars/<int:index>/delete")
    def calendar_delete(index: int):
        raw, response = ed.fresh("/calendars")
        if response:
            return response
        data = copy.deepcopy(raw.data)
        existing = data.get("calendar", [])
        if index >= len(existing):
            return ed.changed("/calendars")
        if not confirmed():
            name = str(existing[index].get("name", ""))
            return confirm_page(t()("admin.confirm_remove_calendar", name=name),
                                t()("admin.remove"), "/calendars", "calendars")
        del existing[index]
        return ed.save_action(raw, data, "/calendars", "admin.removed")

    @bp.post("/calendars/<int:index>/move")
    def calendar_move(index: int):
        raw, response = ed.fresh("/calendars")
        if response:
            return response
        data = copy.deepcopy(raw.data)
        existing = data.get("calendar", [])
        if index >= len(existing):
            return ed.changed("/calendars")
        direction = request.form.get("direction")
        if direction not in ("up", "down"):
            abort(400)
        other = index - 1 if direction == "up" else index + 1
        if not 0 <= other < len(existing):
            return redirect("/calendars", 303)  # already first or last: nothing to do
        existing[index], existing[other] = existing[other], existing[index]
        return ed.save_action(raw, data, "/calendars", "admin.saved")

    @bp.post("/calendars/<int:index>/test")
    def calendar_test(index: int):
        raw, problem = ed.read()
        existing = raw.data.get("calendar", []) if raw is not None else []
        if raw is None or request.form.get("digest") != raw.digest or index >= len(existing):
            return test_refused("/calendars", problem)
        result, status = run_test(index, existing[index], raw, checker.check_calendar)
        if is_xhr():
            return fragment(result, status)
        return calendars_page(raw, result, status)

    # --- tasks --------------------------------------------------------------------------------

    def tasks_values(section: dict) -> dict:
        return {"name": str(section.get("name", forms.DEFAULT_TASKS_NAME)),
                "overdue_days": section.get("overdue_days", forms.DEFAULT_OVERDUE)}

    def tasks_page(raw=None, values=None, errors=None, form_error=None,
                   result: TestResult | None = None, status: int = 200):
        problem = None
        if raw is None:
            raw, problem = ed.read()
        context = {"problem": problem, "result": result}
        if raw is not None:
            section = raw.data.get("tasks")
            context.update(
                exists=section is not None, link=masked((section or {}).get("url")),
                name=str((section or {}).get("name", forms.DEFAULT_TASKS_NAME)),
                values=values or tasks_values(section or {}), errors=errors or {},
                digest=raw.digest, warning=ed.invalid(raw.data), form_error=form_error,
                repaste=bool(errors) and link_given())
        context["restore"] = ed.restore_offer(raw, problem, context.get("warning"))
        return render_template("tasks.html", **context), status

    @bp.route("/tasks", methods=["GET", "POST"])
    def tasks():
        if request.method != "POST":
            return tasks_page()
        raw, response = ed.fresh("/tasks")
        if response:
            return response
        data = copy.deepcopy(raw.data)
        old = data.get("tasks")
        values, link, errors = forms.tasks_form(request.form, t(), new=old is None)
        form_error = None
        if not errors:
            data["tasks"] = _tasks_entry(values, link, old or {})
            response, form_error = ed.save(raw, data, "/tasks")
            if response:
                return response
        return tasks_page(raw, values, errors, form_error)

    @bp.post("/tasks/delete")
    def tasks_delete():
        raw, response = ed.fresh("/tasks")
        if response:
            return response
        data = copy.deepcopy(raw.data)
        if "tasks" not in data:
            return redirect("/tasks", 303)
        if not confirmed():
            return confirm_page(t()("admin.confirm_remove_tasks"), t()("admin.remove_tasks"),
                                "/tasks", "tasks")
        del data["tasks"]
        return ed.save_action(raw, data, "/tasks", "admin.removed")

    @bp.post("/tasks/test")
    def tasks_test():
        raw, problem = ed.read()
        section = raw.data.get("tasks") if raw is not None else None
        if raw is None or request.form.get("digest") != raw.digest or section is None:
            return test_refused("/tasks", problem)
        result, status = run_test(None, section, raw, checker.check_tasks)
        if is_xhr():
            return fragment(result, status)
        return tasks_page(raw, result=result, status=status)
