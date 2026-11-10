import datetime as dt

import pytest
from helpers import TZ, at, fixture

from inkdoor import sources
from inkdoor.demo import demo_config, demo_snapshot
from inkdoor.net import FetchError
from inkdoor.sources import SourceCache, collect


def rows(events):
    return [(e.start.strftime("%H:%M"), e.title, e.source) for e in events]


def write_ics(path, body):
    path.write_text("BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//inkdoor//tests//EN\n" + body + "END:VCALENDAR\n")
    return str(path)


def test_calendars_are_never_merged(cfg):
    snap = collect(cfg, at("12:00"))
    listed = rows(snap.today)
    # the same meeting in two calendars shows up in both
    assert ("13:30", "Roadmap review", "Company") in listed
    # but a repeat inside one calendar collapses into one
    assert sum(1 for _, title, src in listed if src == "Work" and title.lower() == "roadmap review") == 1


def test_windows_time_zone_names(cfg):
    snap = collect(cfg, at("12:00"))
    review = next(e for e in snap.today if e.source == "Work" and "roadmap" in e.title.lower())
    assert review.start.strftime("%H:%M") == "13:30"   # 10:30 in Denver
    assert review.location == ""                        # Teams links are hidden


def test_recurrence_and_cancellations(cfg):
    snap = collect(cfg, at("12:00"))
    assert ("09:00", "Daily", "Work") in rows(snap.today)
    assert ("09:00", "Daily", "Work") in rows(snap.tomorrow)
    assert not any("Old sync" in e.title for e in snap.today)


def test_free_and_all_day_events_do_not_block_the_door(cfg):
    snap = collect(cfg, at("12:00"))
    gym = next(e for e in snap.today if e.title == "Gym")
    birthday = next(e for e in snap.today if e.title == "Birthday")
    assert not gym.busy
    assert birthday.all_day and not birthday.busy


def test_tasks(cfg):
    snap = collect(cfg, at("12:00"))
    assert [t.title for t in snap.tasks] == ["Overdue task", "Call the bank"]
    assert snap.tasks[0].overdue and snap.tasks[0].priority == 3
    assert snap.tasks[1].time.strftime("%H:%M") == "17:00"


def test_unreachable_calendar_without_cache_is_unknown(cfg):
    cfg["calendar"][1]["url"] = "/does/not/exist.ics"
    snap = collect(cfg, at("12:00"))
    assert snap.errors and snap.errors[0].startswith("Company")
    assert snap.unknown == ["Company"]
    assert snap.today   # the other calendars still render


def test_unreachable_calendar_reuses_todays_cache(cfg, tmp_path):
    # the same link works first and fails later, so the cache entry for that link applies
    link = tmp_path / "work.ics"
    link.write_bytes(open(fixture("work.ics"), "rb").read())
    cfg["calendar"][0]["url"] = str(link)
    cache = SourceCache()
    collect(cfg, at("12:00"), cache=cache)
    link.unlink()
    snap = collect(cfg, at("13:45"), cache=cache)
    assert snap.errors and snap.unknown == []
    assert ("13:30", "Roadmap review", "Work") in rows(snap.today)
    # yesterday's data is never reused
    snap = collect(cfg, at("09:00", day=15), cache=cache)
    assert snap.unknown == ["Work"]


def test_configured_states(cfg):
    for c in cfg["calendar"]:
        c["url"] = "PASTE_X"
    cfg["tasks"]["url"] = "PASTE_Y"
    assert collect(cfg, now=at("10:00")).configured == "nothing"
    cfg["tasks"]["url"] = fixture("tasks.ics")
    assert collect(cfg, now=at("10:00")).configured == "no_busy"
    cfg["calendar"][0]["url"] = fixture("work.ics")
    assert collect(cfg, now=at("10:00")).configured == "busy"


def test_a_busy_calendar_that_fails_is_still_configured_busy(cfg):
    cfg["calendar"] = [{"name": "Work", "busy": True, "url": "/does/not/exist.ics"}]
    del cfg["tasks"]
    snap = collect(cfg, now=at("10:00"))
    assert snap.configured == "busy" and snap.unknown == ["Work"]   # "Knock first", never Free


def test_only_non_busy_calendars_is_no_busy(cfg):
    for c in cfg["calendar"]:
        c["busy"] = False
    assert collect(cfg, now=at("10:00")).configured == "no_busy"


def test_missing_tasks_section_counts_as_not_configured(cfg):
    del cfg["tasks"]
    for c in cfg["calendar"]:
        c["url"] = "PASTE_X"
    assert collect(cfg, now=at("10:00")).configured == "nothing"


def test_new_link_does_not_reuse_old_links_cache(cfg, monkeypatch):
    cache = SourceCache()
    collect(cfg, now=at("10:00"), cache=cache)                    # fills the cache for work.ics
    real_fetch = sources.fetch

    def fake_fetch(url):
        if url.startswith("https://"):
            raise FetchError("unreachable")
        return real_fetch(url)

    monkeypatch.setattr(sources, "fetch", fake_fetch)
    cfg["calendar"][0]["url"] = "https://broken.calendar.example/new.ics"
    snap = collect(cfg, now=at("10:00"), cache=cache)
    assert "Work" in snap.unknown                                 # not the old link's events
    assert not any(e.source == "Work" for e in snap.today)


def test_new_tasks_link_does_not_reuse_old_links_cache(cfg, monkeypatch):
    cache = SourceCache()
    assert collect(cfg, now=at("12:00"), cache=cache).tasks
    monkeypatch.setattr(sources, "fetch", lambda url: (_ for _ in ()).throw(FetchError("unreachable")))
    cfg["tasks"]["url"] = "https://broken.calendar.example/tasks.ics"
    snap = collect(cfg, now=at("12:00"), cache=cache)
    assert snap.tasks == [] and snap.errors


def test_cache_is_keyed_by_kind_name_and_link():
    cache = SourceCache()
    day = dt.date(2026, 10, 14)
    cache.put(("calendar", "Work", "aaa"), day, [1])
    assert cache.get(("calendar", "Work", "aaa"), day) == [1]
    assert cache.get(("calendar", "Work", "bbb"), day) is None
    assert cache.get(("calendar", "Other", "aaa"), day) is None
    assert cache.get(("tasks", "Work", "aaa"), day) is None


def test_calendar_and_tasks_never_share_a_cache_entry(cfg, monkeypatch):
    # a calendar and the tasks with the same name and the same link
    cfg["calendar"] = [{"name": "__tasks__", "url": fixture("tasks.ics")}]
    cfg["tasks"] = {"name": "__tasks__", "url": fixture("tasks.ics"), "overdue_days": 7}
    cache = SourceCache()
    good = collect(cfg, now=at("12:00"), cache=cache)
    assert good.tasks
    monkeypatch.setattr(sources, "fetch", lambda url: (_ for _ in ()).throw(FetchError("unreachable")))
    snap = collect(cfg, now=at("12:00"), cache=cache)
    assert [t.title for t in snap.tasks] == [t.title for t in good.tasks]     # tasks, not events
    assert snap.today == good.today and snap.unknown == []


def test_replaced_and_removed_links_are_evicted(cfg):
    cache = SourceCache()
    collect(cfg, now=at("10:00"), cache=cache)
    assert len(cache._data) == 4                                    # three calendars and the tasks
    old_work = sources.cache_key("calendar", "Work", cfg["calendar"][0]["url"])
    cfg["calendar"][0]["url"] = fixture("company.ics")              # replaced link
    del cfg["calendar"][2]                                          # removed calendar
    del cfg["tasks"]
    collect(cfg, now=at("10:00"), cache=cache)
    assert old_work not in cache._data
    assert set(cache._data) == {sources.cache_key("calendar", c["name"], c["url"])
                                for c in cfg["calendar"]}


@pytest.mark.parametrize("lang", ["en-US", "pt-BR"])
@pytest.mark.parametrize("hour", ["7:30", "10:20", "15:20", "16:50", "21:10"])
def test_demo_snapshot_is_never_unconfigured(lang, hour):
    assert demo_snapshot(demo_config(lang), hour).configured == "busy"


def test_events_crossing_midnight_and_multi_day(cfg, tmp_path):
    cfg["calendar"] = [{"name": "Work", "style": "solid", "busy": True, "url": write_ics(tmp_path / "x.ics", (
        "BEGIN:VEVENT\nUID:late@test\nDTSTART:20261015T010000Z\nDTEND:20261015T040000Z\nSUMMARY:Late deploy\nEND:VEVENT\n"
        "BEGIN:VEVENT\nUID:trip@test\nDTSTART;VALUE=DATE:20261013\nDTEND;VALUE=DATE:20261018\nSUMMARY:Trip\nEND:VEVENT\n"))}]
    snap = collect(cfg, at("12:00"))
    late = [e for e in snap.today if e.title == "Late deploy"]
    assert late and late[0].start == dt.datetime(2026, 10, 14, 22, 0, tzinfo=TZ)
    # starts today, so it is not one of tomorrow's events
    assert not any(e.title == "Late deploy" for e in snap.tomorrow)
    # a multi-day all-day event shows up today and tomorrow
    assert any(e.title == "Trip" for e in snap.today)
    assert any(e.title == "Trip" for e in snap.tomorrow)


def test_a_calendar_with_endless_occurrences_is_a_failed_source(cfg):
    # one rule that repeats every second: 172,800 occurrences in the two days read
    cfg["calendar"] = [{"name": "Work", "style": "solid", "busy": True,
                        "url": fixture("every-second.ics")}]
    snap = collect(cfg, at("12:00"))
    assert snap.errors == ["Work: TooManyOccurrences"]
    assert snap.unknown == ["Work"] and snap.today == []          # "Knock first", never "Free"


def test_a_calendar_that_takes_too_long_is_a_failed_source(cfg, tmp_path, monkeypatch):
    from inkdoor import isolate
    monkeypatch.setattr(isolate, "TIMEOUT", 0.5)
    # a rule from long ago that repeats every second: the library walks every second until today
    cfg["calendar"] = [{"name": "Work", "style": "solid", "busy": True, "url": write_ics(
        tmp_path / "old.ics", "BEGIN:VEVENT\nUID:old@test\nDTSTART:20000101T000000Z\n"
        "DTEND:20000101T000001Z\nRRULE:FREQ=SECONDLY\nSUMMARY:Tick\nEND:VEVENT\n")}]
    cache = SourceCache()
    snap = collect(cfg, at("12:00"), cache=cache)
    assert snap.errors == ["Work: CalendarTimeout"]
    assert snap.unknown == ["Work"]


def test_endless_tasks_are_a_failed_source(cfg):
    cfg["tasks"] = {"name": "TickTick", "url": fixture("every-second.ics"), "overdue_days": 7}
    snap = collect(cfg, at("12:00"))
    assert "TickTick: TooManyOccurrences" in snap.errors and snap.tasks == []


def test_expansion_goes_past_the_window_before_stopping(tmp_path, monkeypatch):
    # the library may yield an occurrence that starts after the window before one inside it
    import icalendar
    path = write_ics(tmp_path / "t.ics", "BEGIN:VTODO\nUID:a@test\nDUE;VALUE=DATE:20261015\n"
                     "SUMMARY:Tomorrow\nEND:VTODO\nBEGIN:VTODO\nUID:b@test\n"
                     "DUE:20261015T010000Z\nSUMMARY:Tonight\nEND:VTODO\n")
    cal = icalendar.Calendar.from_ical(open(path, "rb").read())
    items = list(sources.recurring_ical_events.of(cal, components=["VTODO"]).all())
    items.sort(key=lambda i: str(i["SUMMARY"]) != "Tomorrow")         # "Tomorrow" first

    class Query:
        def after(self, start):
            return iter(items)

    monkeypatch.setattr(sources.recurring_ical_events, "of", lambda cal, components: Query())
    tasks = sources.parse_tasks(cal, {"overdue_days": 7}, dt.date(2026, 10, 14), TZ)
    assert [t.title for t in tasks] == ["Tonight"]                    # 22:00 on the 14th, local
