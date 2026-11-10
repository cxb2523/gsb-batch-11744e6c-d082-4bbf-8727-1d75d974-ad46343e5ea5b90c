import os

import pytest
from helpers import FIXTURES, at

from inkdoor import check, net
from inkdoor.check import SourceReport, check_calendar, check_link, check_tasks, run
from inkdoor.i18n import Translator
from inkdoor.net import FetchError


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_check_output_matches_golden(cfg, capsys, language):
    cfg["display"]["language"] = language
    assert run(cfg, now=at("09:00")) is True
    expected = open(os.path.join(FIXTURES, f"check-golden-{language}.txt"), encoding="utf-8").read()
    assert capsys.readouterr().out == expected


def _write_ics(tmp_path, name, body):
    path = tmp_path / name
    path.write_text("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//inkdoor//tests//EN\r\n"
                    + body + "END:VCALENDAR\r\n", encoding="utf-8")
    return str(path)


def _ics(tmp_path, name, events):
    """Writes a tiny calendar. events: [(summary, start as YYYYMMDDTHHMMSS local to the display zone)]."""
    return _write_ics(tmp_path, name, "".join(
        f"BEGIN:VEVENT\r\nUID:{i}@test\r\nDTSTART;TZID=America/Sao_Paulo:{start}\r\n"
        f"DTEND;TZID=America/Sao_Paulo:{start[:9]}{int(start[9:11]) + 1:02d}{start[11:]}\r\n"
        f"SUMMARY:{summary}\r\nEND:VEVENT\r\n"
        for i, (summary, start) in enumerate(events)))


def _all_day_ics(tmp_path, name, events):
    """Writes a calendar of all-day events. events: [(summary, day as YYYYMMDD)]."""
    return _write_ics(tmp_path, name, "".join(
        f"BEGIN:VEVENT\r\nUID:{i}@test\r\nDTSTART;VALUE=DATE:{day}\r\n"
        f"SUMMARY:{summary}\r\nEND:VEVENT\r\n"
        for i, (summary, day) in enumerate(events)))


def failing_config(cfg, tmp_path):
    """Every failure and warning path of `inkdoor check`, with path-independent output."""
    cfg["calendar"] = [
        {"name": "Placeholder", "url": "PASTE_YOUR_LINK_HERE"},
        {"name": "Unreachable", "url": str(tmp_path / "missing.ics")},
        {"name": "Empty", "url": _ics(tmp_path, "empty.ics", [])},
        {"name": "Busy only", "url": _ics(tmp_path, "busy.ics", [
            ("Busy", "20261014T100000"), ("Tentative", "20261015T100000")])},
        {"name": "Night", "url": _ics(tmp_path, "night.ics", [
            ("Standup", "20261014T020000"), ("Review", "20261014T030000"),
            ("Planning", "20261015T140000")])},
        {"name": "Holidays", "url": _all_day_ics(tmp_path, "holidays.ics", [
            ("Public holiday", "20261015"), ("Another holiday", "20261020")])},
    ]
    cfg["tasks"]["url"] = str(tmp_path / "missing-tasks.ics")
    return cfg


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_check_failures_and_warnings_match_golden(cfg, tmp_path, capsys, language):
    cfg = failing_config(cfg, tmp_path)
    cfg["display"]["language"] = language
    assert run(cfg, now=at("09:00")) is False
    expected = open(os.path.join(FIXTURES, f"check-failures-golden-{language}.txt"), encoding="utf-8").read()
    assert capsys.readouterr().out == expected


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_check_reports_unreadable_sources(cfg, capsys, monkeypatch, language):
    def broken(*args, **kwargs):
        raise ValueError("secret detail")
    monkeypatch.setattr(check, "events_from", broken)
    monkeypatch.setattr(check, "tasks_from", broken)
    cfg["display"]["language"] = language
    assert run(cfg, now=at("09:00")) is False
    out = capsys.readouterr().out
    t = Translator(language)
    assert out.count(t("check.read_failed", error="ValueError")) == 4
    assert "secret detail" not in out


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
@pytest.mark.parametrize("error, key, kwargs", [
    (FetchError("http", 401), "check.denied", {"status": 401}),
    (FetchError("http", 403), "check.denied", {"status": 403}),
    (FetchError("http", 404), "check.not_found", {}),
    (FetchError("http", 500), "check.http_error", {"status": 500}),
    (FetchError("blocked"), "check.blocked", {}),
    (FetchError("too_large"), "check.too_large", {"mb": 5}),
    (FetchError("timeout"), "check.timeout", {"seconds": 30}),
    (FetchError("redirects"), "check.redirects", {}),
    (FetchError("bad_link"), "check.bad_link", {}),
    (FetchError("unreachable"), "check.unreachable", {}),
])
def test_check_link_maps_fetch_errors(monkeypatch, language, error, key, kwargs):
    def failing_fetch(url, **kw):
        raise error
    monkeypatch.setattr(check.net, "fetch", failing_fetch)
    t = Translator(language)
    ok, message = check_link("https://cal.example/secret.ics", t)
    assert (ok, message) == (False, t(key, **kwargs))
    assert "{" not in message                             # every placeholder was filled
    for reason in set(net.REASONS) - {"http"}:             # no raw identifiers ("HTTP 403" is fine)
        assert reason not in message.lower()


def test_each_reason_has_its_own_message():
    for language in ["en-US", "pt-BR"]:
        t = Translator(language)
        keys = ["check.blocked", "check.too_large", "check.timeout", "check.redirects",
                "check.bad_link", "check.unreachable"]
        messages = {t(key, mb=5, seconds=30) for key in keys}
        assert len(messages) == len(keys)


def test_check_link_reports_missing_file(tmp_path):
    t = Translator("en-US")
    ok, message = check_link(str(tmp_path / "missing.ics"), t)
    assert (ok, message) == (False, t("check.unreachable"))


def test_check_link_still_inspects_the_content(monkeypatch):
    t = Translator("en-US")
    monkeypatch.setattr(check.net, "fetch", lambda url, **kw: b"<HTML><body>sign in</body></HTML>")
    assert check_link("https://cal.example/x.ics", t) == (False, t("check.html_page"))
    monkeypatch.setattr(check.net, "fetch", lambda url, **kw: b"BEGIN:VCALENDAR\r\nnot really")
    assert check_link("https://cal.example/x.ics", t) == (False, t("check.invalid"))


def test_check_calendar_returns_a_structured_report(cfg):
    t = Translator("en-US")
    calendar = cfg["calendar"][0]
    report = check_calendar(calendar, cfg, at("09:00"))
    assert isinstance(report, SourceReport)
    assert (report.name, report.kind, report.ok) == ("Work", "calendar", True)
    assert report.lines == [("ok", t("check.ok", kb=1)), ("ok", t("check.events_found", n=12))]
    # the next three in order of start, whatever calendar entry they come from
    assert [title for _, title in report.upcoming] == ["Daily", "Roadmap review", "Roadmap Review"]
    assert report.upcoming[0][0] == at("09:00")


def test_check_calendar_reports_an_unconfigured_link(cfg):
    t = Translator("en-US")
    report = check_calendar({"name": "Work", "url": "PASTE_X"}, cfg, at("09:00"))
    assert (report.ok, report.upcoming) == (False, [])
    assert report.lines == [("fail", t("check.not_configured"))]


def test_check_calendar_warns_but_stays_ok(cfg, tmp_path):
    t = Translator("en-US")
    empty = _ics(tmp_path, "empty.ics", [])
    report = check_calendar({"name": "Empty", "url": empty}, cfg, at("09:00"))
    assert report.ok is True
    assert report.lines[-1] == ("warn", t("check.no_events"))
    busy = _ics(tmp_path, "busy.ics", [("Busy", "20261014T100000")])
    report = check_calendar({"name": "Busy", "url": busy}, cfg, at("09:00"))
    assert ("warn", t("check.busy_only")) in report.lines


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_check_calendar_reports_all_day_only_calendars(cfg, tmp_path, language):
    cfg["display"]["language"] = language
    t = Translator(language)
    holidays = _all_day_ics(tmp_path, "holidays.ics", [("Public holiday", "20261015")])
    report = check_calendar({"name": "Holidays", "url": holidays}, cfg, at("09:00"))
    assert report.ok is True
    assert report.lines == [("ok", t("check.ok", kb=1)), ("ok", t("check.all_day_found", n=1))]
    assert ("warn", t("check.no_events")) not in report.lines


def test_check_calendar_counts_timed_and_all_day_events_apart(cfg):
    t = Translator("en-US")
    personal = next(c for c in cfg["calendar"] if c["name"] == "Personal")
    report = check_calendar(personal, cfg, at("09:00"))
    assert report.lines == [("ok", t("check.ok", kb=1)), ("ok", t("check.events_found", n=1)),
                            ("ok", t("check.all_day_found", n=1))]
    assert [title for _, title in report.upcoming] == ["Gym"]


def test_check_calendar_fails_without_leaking_details(cfg, monkeypatch):
    def broken(*args, **kwargs):
        raise ValueError("https://cal.example/secret.ics")
    monkeypatch.setattr(check, "events_from", broken)
    report = check_calendar(cfg["calendar"][0], cfg, at("09:00"))
    t = Translator("en-US")
    assert report.ok is False
    assert report.lines[-1] == ("fail", t("check.read_failed", error="ValueError"))
    assert "secret" not in repr(report)


def test_check_report_never_contains_the_link(cfg, tmp_path):
    link = str(tmp_path / "secret-token.ics")
    report = check_calendar({"name": "Secret", "url": link}, cfg, at("09:00"))
    assert "secret-token" not in repr(report)


def counting_fetch(monkeypatch):
    """Counts the downloads per link while still reading the fixture files."""
    calls = []
    real_fetch = check.net.fetch

    def fake_fetch(url, **kwargs):
        calls.append(url)
        return real_fetch(url, **kwargs)
    monkeypatch.setattr(check.net, "fetch", fake_fetch)
    monkeypatch.setattr("inkdoor.sources.net.fetch", fake_fetch)
    return calls


def test_check_downloads_each_link_once(cfg, monkeypatch):
    calls = counting_fetch(monkeypatch)
    calendar = cfg["calendar"][0]
    assert check_calendar(calendar, cfg, at("09:00")).ok
    assert check_tasks(cfg["tasks"], cfg, at("09:00")).ok
    assert calls == [calendar["url"], cfg["tasks"]["url"]]


def test_check_tasks_returns_the_tasks(cfg):
    t = Translator("en-US")
    report = check_tasks(cfg["tasks"], cfg, at("09:00"))
    assert (report.name, report.kind, report.ok) == ("TickTick", "tasks", True)
    assert report.lines == [("ok", t("check.ok", kb=1)), ("ok", t("check.tasks_found", n=2))]
    assert [title for _, title in report.upcoming] == [
        t("check.overdue_prefix") + "Overdue task", "Call the bank"]


def test_check_tasks_reports_a_failing_link(cfg, tmp_path):
    tasks = dict(cfg["tasks"], url=str(tmp_path / "missing.ics"))
    report = check_tasks(tasks, cfg, at("09:00"))
    assert (report.ok, report.upcoming) == (False, [])
    assert report.lines == [("fail", Translator("en-US")("check.unreachable"))]


def test_check_prints_each_source_before_the_next_is_checked(cfg, capsys, monkeypatch):
    printed, seen = [], []

    def spy(real):
        def wrapper(source, *args):
            printed.append(capsys.readouterr().out)          # what the user can see right now
            seen.append((source["name"], "".join(printed)))
            return real(source, *args)
        return wrapper
    monkeypatch.setattr(check, "check_calendar", spy(check.check_calendar))
    monkeypatch.setattr(check, "check_tasks", spy(check.check_tasks))
    assert run(cfg, now=at("09:00")) is True
    assert "All good" in "".join(printed) + capsys.readouterr().out
    assert [name for name, _ in seen] == ["Work", "Company", "Personal", "TickTick"]
    for index, (name, visible) in enumerate(seen):
        assert visible.endswith(f"\n\u25a0 {name}\n"), name         # header is out before its check starts
        if index:
            previous = seen[index - 1][0]
            assert f"\u25a0 {previous}\n  \u2714" in visible          # previous source's result is out too


@pytest.mark.parametrize("language, key, one, other", [
    ("en-US", "check.events_found", "1 event in the next 14 days", "12 events in the next 14 days"),
    ("pt-BR", "check.events_found", "1 compromisso nos próximos 14 dias",
     "12 compromissos nos próximos 14 dias"),
    ("en-US", "check.tasks_found", "1 task due today or overdue", "12 tasks due today or overdue"),
    ("en-US", "check.all_day_found", "1 all-day event in the next 14 days",
     "12 all-day events in the next 14 days"),
    ("pt-BR", "check.all_day_found", "1 compromisso de dia inteiro nos próximos 14 dias",
     "12 compromissos de dia inteiro nos próximos 14 dias"),
    ("pt-BR", "check.tasks_found", "1 tarefa para hoje ou atrasada",
     "12 tarefas para hoje ou atrasadas"),
])
def test_counts_use_plurals(language, key, one, other):
    t = Translator(language)
    assert t(key, n=1) == one and t(key, n=12) == other


def test_upcoming_times_stay_in_one_column(capsys):
    report = SourceReport("Work", "calendar", upcoming=[(at("09:00", day=4), "A"), (at("14:00"), "B")])
    check._print_upcoming(report, Translator("en-US"))
    assert capsys.readouterr().out == "     Oct 4   9:00 AM  A\n     Oct 14  2:00 PM  B\n"
