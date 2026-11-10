"""Admin pages for calendars and tasks: forms, link masking, link tests and secrecy."""
import datetime as dt
import logging
import os
import re
import threading

import pytest
from markupsafe import escape

from inkdoor import config_edit, net, server
from inkdoor.config_edit import read_raw
from inkdoor.i18n import Translator
from inkdoor.sources import SourceCache
from inkdoor.state import RenderInfo
from inkdoor.web import auth, links, pages
from helpers import fixture
from web_helpers import (BASE, PASSWORD, FakeClock, client, logged_in, login_token, make_app,
                         make_state)

EN = Translator("en-US")
CANARY = "c4n4ryT0K3Nzz"
LINK = f"https://calendar.example/ical/{CANARY}/private-{CANARY}/basic.ics?k={CANARY}"
TASKS_LINK = f"webcal://tasks.example/pub/{CANARY}/basic.ics?t={CANARY}"
XHR = {"X-Requested-With": "inkdoor"}


@pytest.fixture(autouse=True)
def no_lang_env(monkeypatch):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)


class Admin:
    """A logged-in browser with helpers for the admin forms."""

    def __init__(self, app, state):
        self.app = app
        self.state = state
        self.c = logged_in(app)

    def get(self, path, **kwargs):
        return self.c.get(path, base_url=BASE, **kwargs)

    def post(self, path, data=None, **kwargs):
        return self.c.post(path, base_url=BASE, data=data, **kwargs)

    def digest(self):
        return read_raw(self.state.config_path).digest

    def csrf_data(self, **fields):
        return {"csrf": self.c.csrf, "digest": self.digest(), **fields}

    def form(self, **fields):
        return self.csrf_data(**{"style": "solid", "busy": "1", **fields})

    def raw(self):
        return read_raw(self.state.config_path).data


@pytest.fixture
def state(tmp_path):
    return make_state(tmp_path)


@pytest.fixture
def app(state):
    return make_app(state, FakeClock())


@pytest.fixture
def logged(app, state):
    return Admin(app, state)


def ics(title="Planning", start=None, minutes=30):
    start = start or (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).replace(
        hour=15, minute=0, second=0, microsecond=0)
    end = start + dt.timedelta(minutes=minutes)
    fmt = "%Y%m%dT%H%M%SZ"
    return ("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VEVENT\r\n"
            f"UID:1@test\r\nDTSTART:{start.strftime(fmt)}\r\nDTEND:{end.strftime(fmt)}\r\n"
            f"SUMMARY:{title}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n").encode("utf-8")


def raise_fetch_error(url, **kwargs):
    raise net.FetchError("unreachable")


def body(response):
    return response.get_data(as_text=True)


def add(logged, **fields):
    r = logged.post("/calendars/new", data=logged.form(**fields))
    assert r.status_code == 303, body(r)
    return r


# --- links ------------------------------------------------------------------------------------

def test_mask_shows_host_and_first_segment_only():
    assert links.mask("https://calendar.google.com/calendar/ical/x%40y/private-abc/basic.ics") \
        == "calendar.google.com/calendar/…"
    assert links.mask("https://outlook.office365.com/owa/calendar/a/b/calendar.ics") \
        == "outlook.office365.com/owa/…"
    assert links.mask(LINK) == "calendar.example/ical/…"
    assert links.mask("WEBCAL://Tasks.example/pub/x/basic.ics") == "tasks.example/pub/…"


@pytest.mark.parametrize("url", [
    "https://x.example", "https://x.example/", "https://x.example/?k=secret",
    "https://x.example/secret-token.ics", "https://x.example/secret?k=v",
    "http://x.example#secret",
])
def test_mask_hides_a_single_segment_and_any_query(url):
    assert links.mask(url) == "x.example/…"


def test_mask_drops_user_info_and_keeps_the_port():
    assert links.mask("https://user:s3cretpw@x.example:8443/dav/cal/token/") == "x.example:8443/dav/…"
    assert links.mask("https://[fd00::1]:8443/dav/cal/") == "[fd00::1]:8443/dav/…"
    assert "s3cret" not in links.mask("https://user:s3cret/pw@x.example/dav/cal/")


@pytest.mark.parametrize("url", ["/etc/passwd", "tests/fixtures/work.ics", "file:///x",
                                 "C:\\cal.ics", "", "ftp://x.example/a/b", "https://"])
def test_mask_of_anything_else_is_an_ellipsis(url):
    assert links.mask(url) == "…"


def test_clean_trims_and_lowercases_only_the_scheme():
    assert links.clean("  HTTPS://x.example/a.ics?b=1&c=2\n") == "https://x.example/a.ics?b=1&c=2"
    assert links.clean("WebCal://X.example/A.ics") == "webcal://X.example/A.ics"
    assert links.clean("http://x.example") == "http://x.example"
    assert links.clean("") is None
    assert links.clean(" \t\n") is None


@pytest.mark.parametrize("value", ["/etc/passwd", "file:///x", "ftp://x", "https://",
                                   "http:x.example", "javascript:alert(1)", "x.example/a.ics",
                                   "https://x.example/a b", "https://x.example/\x00",
                                   "https://" + "a" * 5000])
def test_clean_rejects_everything_but_web_links(value):
    with pytest.raises(ValueError):
        links.clean(value)


@pytest.mark.parametrize("value", ["https:/calendar.example/a.ics", "https//calendar.example/a.ics",
                                   "mailto:someone@example.com", "webcal:/calendar.example/a.ics"])
def test_clean_rejects_mistyped_links(value):
    with pytest.raises(ValueError):
        links.clean(value)


def test_a_trailing_dot_in_the_host_is_accepted():
    assert links.clean("https://calendar.example./ical/a.ics") == "https://calendar.example./ical/a.ics"
    assert links.mask("https://calendar.example./ical/a.ics") == "calendar.example./ical/…"
    for url in ("https://calendar.example../a.ics", "https://./a.ics"):
        with pytest.raises(ValueError):
            links.clean(url)


BAD_HOSTS = [
    "https://cal.example\\SECRETTOKEN/a/b.ics", "https://cal.example;SECRETTOKEN/a/b.ics",
    "https://cal.example:99999/a/b", "https://cal.example:0/a/b", "https://cal.example:/a/b",
    "https://cal.example:8o/a/b", "https://cal_example.test/a/b", "https://-cal.example/a/b",
    "https://cal..example/a/b", "https://kalénder.example/a/b", "https://[fe80::1%25en0]/a/b",
    "https://[cal.example]/a/b", "https://fd00::1/a/b", "https://" + "a" * 64 + ".example/a",
    "https://user@/a/b",
]


@pytest.mark.parametrize("url", BAD_HOSTS)
def test_hosts_a_hostname_cannot_have_are_rejected_and_hidden(url):
    with pytest.raises(ValueError):
        links.clean(url)
    assert links.mask(url) == "…"
    assert not links.is_web(url)


@pytest.mark.parametrize("url, masked", [
    ("https://[FD00::1]:8443/dav/cal/x.ics", "[fd00::1]:8443/dav/…"),
    ("https://[::1]/dav/cal/x.ics", "[::1]/dav/…"),
    ("https://192.168.0.10:5232/radicale/user/cal/", "192.168.0.10:5232/radicale/…"),
    ("https://Cal.Example:65535/a/b?k=1", "cal.example:65535/a/…"),
    ("https://nas/a/b", "nas/a/…"),
    ("https://xn--kalnder-cya.example/a/b", "xn--kalnder-cya.example/a/…"),
    ("https://u:p@cal.example:1/a", "cal.example:1/…"),
])
def test_valid_hosts_and_ports_are_kept_in_the_mask(url, masked):
    assert links.clean(url) == url
    assert links.mask(url) == masked


def test_bad_host_from_the_form_is_a_field_error(logged):
    r = logged.post("/calendars/new",
                    data=logged.form(name="A", url="https://cal.example\\x/a/b.ics"))
    assert r.status_code == 200 and EN("admin.error_link_invalid") in body(r)
    assert logged.raw() == {}


# --- secrets ----------------------------------------------------------------------------------

def test_links_never_leave_the_server(logged, state, caplog, capsys, monkeypatch):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr("inkdoor.net.fetch", raise_fetch_error)    # a failing test, too
    add(logged, name="Work", url=LINK)
    r = logged.post("/tasks", data=logged.csrf_data(name="Tasks", url=TASKS_LINK, overdue_days="7"))
    assert r.status_code == 303
    responses = [logged.get(p) for p in ["/", "/calendars", "/calendars/0", "/calendars/new",
                                         "/tasks", "/calendars/9"]]
    responses += [
        logged.post("/calendars/0/test", data=logged.csrf_data()),
        logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR),
        logged.post("/tasks/test", data=logged.csrf_data()),
        logged.post("/tasks/test", data=logged.csrf_data(), headers=XHR),
        # a refused form must not echo the pasted link back
        logged.post("/calendars/new", data=logged.form(name="", url=LINK)),
        logged.post("/calendars/0", data=logged.form(name="Work", style="neon", url=LINK)),
        logged.post("/tasks", data=logged.csrf_data(name="T", url=LINK, overdue_days="x")),
    ]
    monkeypatch.setattr("inkdoor.net.fetch", lambda url, **kw: ics())  # and a working one
    responses.append(logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR))
    everything = "".join(body(r) + str(r.headers) for r in responses)
    everything += caplog.text + "".join(capsys.readouterr())
    for i in range(len(CANARY) - 7):
        assert CANARY[i:i + 8] not in everything
    assert "calendar.example/ical/…" in body(responses[1])
    assert logged.raw()["calendar"][0]["url"] == LINK
    assert logged.raw()["tasks"]["url"] == TASKS_LINK


# --- calendar forms ---------------------------------------------------------------------------

def test_new_calendar_is_saved_without_defaults_and_wakes_the_render_loop(logged, state):
    r = add(logged, name="Work", url="https://calendar.example/work.ics", status_label="Busy")
    assert r.headers["Location"] == "/calendars"
    assert logged.raw() == {"calendar": [{"name": "Work", "style": "solid", "busy": True,
                                          "status_label": "Busy",
                                          "url": "https://calendar.example/work.ics"}]}
    assert state.render_event.is_set()
    assert EN("admin.saved") in body(logged.get("/calendars"))


def test_link_field_is_empty_with_the_mask_as_placeholder(logged):
    add(logged, name="Work", url=LINK)
    page = body(logged.get("/calendars/0"))
    assert 'type="url"' in page and 'autocomplete="off"' in page
    assert 'placeholder="calendar.example/ical/…"' in page
    assert 'name="url" value=' not in page


def test_empty_link_keeps_the_current_one(logged):
    add(logged, name="Work", url=LINK)
    r = logged.post("/calendars/0", data=logged.form(name="Office", style="striped", url="  "))
    assert r.status_code == 303
    calendar = logged.raw()["calendar"][0]
    assert calendar == {"name": "Office", "style": "striped", "busy": True, "url": LINK}


def test_new_calendar_needs_a_link(logged):
    r = logged.post("/calendars/new", data=logged.form(name="Work", url=""))
    assert r.status_code == 200 and EN("admin.error_link_required") in body(r)
    assert logged.raw() == {}


def test_pasted_link_is_trimmed_and_scheme_case_insensitive(logged):          # Review Focus 2
    add(logged, name="A", url="  HTTPS://x.example/a.ics?b=1&c=2\n")
    assert logged.raw()["calendar"][0]["url"] == "https://x.example/a.ics?b=1&c=2"


@pytest.mark.parametrize("url", ["/etc/passwd", "file:///x", "ftp://x", "tests/fixtures/work.ics"])
def test_file_paths_and_other_schemes_rejected(logged, url):
    add(logged, name="Work", url="https://calendar.example/work.ics")
    before = read_raw(logged.state.config_path)
    r = logged.post("/calendars/new", data=logged.form(name="Other", url=url))
    assert r.status_code == 200
    page = body(r)
    assert EN("admin.error_link_invalid") in page and EN("admin.error_link_repaste") in page
    r = logged.post("/calendars/0", data=logged.form(name="Work", url=url))
    assert r.status_code == 200 and EN("admin.error_link_invalid") in body(r)
    assert read_raw(logged.state.config_path).digest == before.digest


def test_hand_edited_file_path_elsewhere_does_not_block_saves(logged, state):
    path = fixture("work.ics")
    with open(state.config_path, "w", encoding="utf-8") as f:
        f.write(f'[[calendar]]\nname = "Local"\nurl = "{path}"\n')
    add(logged, name="Web", url="https://calendar.example/web.ics")
    calendars = logged.raw()["calendar"]
    assert calendars[0] == {"name": "Local", "url": path}
    assert calendars[1]["url"] == "https://calendar.example/web.ics"
    r = logged.post("/calendars/0", data=logged.form(name="Local", style="outline", url=""))
    assert r.status_code == 303 and logged.raw()["calendar"][0]["url"] == path
    assert "…" in body(logged.get("/calendars"))


def test_hand_edited_file_path_is_not_tested_from_the_admin(logged, state, monkeypatch):
    with open(state.config_path, "w", encoding="utf-8") as f:
        f.write('[[calendar]]\nname = "Local"\nurl = "/etc/passwd"\n')
    monkeypatch.setattr("inkdoor.net.fetch", lambda url, **kw: pytest.fail("fetched"))
    r = logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR)
    assert r.status_code == 200 and EN("admin.test_not_web") in body(r)


def test_names_with_special_characters_round_trip_and_are_escaped(logged):    # Review Focus 1
    name = '<b>Empresa "Ltda" & Cia 🎯</b>'
    add(logged, name=name, url=LINK, status_label="Reunião 🎯 'x'")
    assert logged.raw()["calendar"][0]["name"] == name
    assert logged.raw()["calendar"][0]["status_label"] == "Reunião 🎯 'x'"
    page = body(logged.get("/calendars"))
    assert "&lt;b&gt;Empresa &#34;Ltda&#34; &amp; Cia 🎯&lt;/b&gt;" in page
    assert "<b>Empresa" not in page
    assert "&lt;b&gt;Empresa" in body(logged.get("/calendars/0"))


def test_event_titles_in_test_results_are_escaped(logged, monkeypatch):
    add(logged, name="Work", url=LINK)
    monkeypatch.setattr("inkdoor.net.fetch", lambda url, **kw: ics("<script>x()</script> & co"))
    r = logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR)
    assert r.status_code == 200 and r.headers["X-Inkdoor-Fragment"] == "1"
    fragment = body(r)
    assert "&lt;script&gt;x()&lt;/script&gt; &amp; co" in fragment and "<script>" not in fragment
    assert "<html" not in fragment and EN("check.events_found", n=1) in fragment


def test_a_test_result_does_not_take_pending_notices(logged, monkeypatch):
    add(logged, name="Work", url=LINK)
    monkeypatch.setattr("inkdoor.net.fetch", raise_fetch_error)
    r = logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR)
    assert EN("admin.saved") not in body(r)
    assert EN("admin.saved") in body(logged.get("/calendars"))


def test_form_fields_reference_existing_help_and_errors(logged):
    page = body(logged.post("/calendars/new", data=logged.form(name="", url="")))
    for ids in re.findall(r'aria-describedby="([^"]+)"', page):
        for id_ in ids.split():
            assert f'id="{id_}"' in page, id_


def test_test_without_javascript_shows_the_result_in_the_card(logged, monkeypatch):
    add(logged, name="Work", url=LINK)
    add(logged, name="Home", url="https://calendar.example/home.ics")
    monkeypatch.setattr("inkdoor.net.fetch", raise_fetch_error)
    r = logged.post("/calendars/1/test", data=logged.csrf_data())
    assert r.status_code == 200
    page = body(r)
    assert "<html" in page and page.count('class="test-result') == 1
    unreachable = EN("check.unreachable")
    assert page.index(unreachable[0].upper() + unreachable[1:]) > page.index("Home")


@pytest.mark.parametrize("fields, error, n", [
    ({"style": "neon"}, "admin.error_style", None),
    ({"name": ""}, "admin.error_name_required", None),
    ({"name": "   "}, "admin.error_name_required", None),
    ({"name": "x" * 61}, "admin.error_too_long", 60),
    ({"name": "a\nb"}, "admin.error_single_line", None),
    ({"status_label": "y" * 31}, "admin.error_too_long", 30),
])
def test_tampered_form_values_show_errors(logged, fields, error, n):           # Review Focus 3
    add(logged, name="Work", url=LINK)
    before = logged.digest()
    expected = EN(error, n=n) if n else EN(error)
    for path in ("/calendars/new", "/calendars/0"):
        data = logged.form(**{"name": "Other", "url": "https://calendar.example/o.ics", **fields})
        r = logged.post(path, data=data)
        assert r.status_code == 200, path
        assert expected in body(r) and 'class="field-error"' in body(r)
    assert logged.digest() == before


def test_missing_form_fields_are_errors_not_crashes(logged):
    add(logged, name="Work", url=LINK)
    before = logged.digest()
    for path in ("/calendars/new", "/calendars/0", "/tasks"):
        r = logged.post(path, data=logged.csrf_data())
        assert r.status_code == 200, path
    assert logged.digest() == before


def test_duplicate_names_are_a_field_error(logged):
    add(logged, name="Work", url=LINK)
    add(logged, name="Home", url=LINK)
    r = logged.post("/calendars/1", data=logged.form(name="Work"))
    assert r.status_code == 200
    assert EN("config_error.calendar_duplicate", name="Work").replace("'", "&#39;") in body(r)
    r = logged.post("/calendars/0", data=logged.form(name="Work", style="outline"))
    assert r.status_code == 303     # keeping its own name is fine


def test_unknown_index_redirects_with_a_notice(logged):                        # Review Focus 3
    add(logged, name="Work", url=LINK)
    before = logged.digest()
    r = logged.get("/calendars/99")
    assert r.status_code == 303 and r.headers["Location"] == "/calendars"
    for path in ("/calendars/99", "/calendars/99/delete", "/calendars/99/move",
                 "/calendars/99/test"):
        r = logged.post(path, data=logged.form(name="X", direction="up"))
        assert r.status_code == 303 and r.headers["Location"] == "/calendars", path
    assert logged.digest() == before
    assert EN("admin.changed_elsewhere") in body(logged.get("/calendars"))


def test_stale_digest_is_refused(logged, state):
    add(logged, name="Work", url=LINK)
    stale = logged.form(name="Office")
    with open(state.config_path, "a", encoding="utf-8") as f:
        f.write("\n# edited by hand\n")
    edited = logged.digest()
    for path, extra in [("/calendars/0", {}), ("/calendars/new", {"url": LINK}),
                        ("/calendars/0/delete", {}), ("/calendars/0/move", {"direction": "down"}),
                        ("/tasks", {"url": LINK, "overdue_days": "7"}), ("/tasks/delete", {})]:
        r = logged.post(path, data={**stale, **extra})
        assert r.status_code == 303, path
    for digest in ("", "nothex", "0" * 64):
        r = logged.post("/calendars/0", data={**stale, "digest": digest})
        assert r.status_code == 303
    assert logged.digest() == edited
    assert EN("admin.changed_elsewhere") in body(logged.get("/calendars"))
    r = logged.post("/calendars/0/test", data=stale, headers=XHR)
    assert r.status_code == 409 and EN("admin.changed_elsewhere") in body(r)


def test_move_up_down_and_delete(logged, state):
    for name in ("A", "B", "C"):
        add(logged, name=name, url=f"https://calendar.example/{name}.ics")
    names = lambda: [c["name"] for c in logged.raw()["calendar"]]
    state.render_event.clear()
    r = logged.post("/calendars/2/move", data=logged.csrf_data(direction="up"))
    assert r.status_code == 303 and names() == ["A", "C", "B"] and state.render_event.is_set()
    logged.post("/calendars/0/move", data=logged.csrf_data(direction="down"))
    assert names() == ["C", "A", "B"]
    before = logged.digest()
    logged.post("/calendars/0/move", data=logged.csrf_data(direction="up"))     # already first
    logged.post("/calendars/2/move", data=logged.csrf_data(direction="down"))   # already last
    assert logged.digest() == before
    r = logged.post("/calendars/0/move", data=logged.csrf_data(direction="sideways"))
    assert r.status_code == 400 and logged.digest() == before
    r = logged.post("/calendars/1/delete", data=logged.csrf_data(confirmed="1"))
    assert r.status_code == 303 and names() == ["C", "B"]
    assert EN("admin.removed") in body(logged.get("/calendars"))


def test_unsafe_actions_need_the_csrf_token(logged):
    add(logged, name="Work", url=LINK)
    before = logged.digest()
    data = logged.form(name="X", direction="down")
    del data["csrf"]
    for path in ("/calendars/0", "/calendars/0/delete", "/calendars/0/move", "/calendars/0/test",
                 "/calendars/new", "/tasks", "/tasks/test", "/tasks/delete"):
        assert logged.post(path, data=data).status_code == 403, path
    assert logged.digest() == before


def test_calendars_page_lists_markers_and_masks(logged):
    add(logged, name="Work", url=LINK, style="striped")
    add(logged, name="Notes", url="https://calendar.example/notes.ics", busy="", style="outline")
    page = body(logged.get("/calendars"))
    assert "marker-striped" in page and "marker-outline" in page
    assert EN("admin.busy_no") in page and EN("admin.busy_yes") in page
    assert 'data-test-target="test-0"' in page and 'data-confirm=' in page
    assert logged.raw()["calendar"][1]["busy"] is False


def test_broken_file_shows_the_error_and_no_forms(logged, state):
    with open(state.config_path, "w", encoding="utf-8") as f:
        f.write("[[calendar]\n")
    for path in ("/calendars", "/tasks"):
        r = logged.get(path)
        assert r.status_code == 200 and "config.toml has a syntax error" in body(r)
        assert 'name="digest"' not in body(r)
    r = logged.post("/calendars/new", data={"csrf": logged.c.csrf, "digest": "0" * 64,
                                            "name": "A", "url": LINK, "style": "solid"})
    assert r.status_code == 303


# --- tasks ------------------------------------------------------------------------------------

def test_tasks_create_edit_and_remove(logged, state):
    page = body(logged.get("/tasks"))
    assert 'value="TickTick"' in page and 'value="7"' in page
    r = logged.post("/tasks", data=logged.csrf_data(name="", url="", overdue_days="7"))
    assert r.status_code == 200 and EN("admin.error_link_required") in body(r)
    r = logged.post("/tasks", data=logged.csrf_data(name="", url=TASKS_LINK, overdue_days="3"))
    assert r.status_code == 303 and state.render_event.is_set()
    assert logged.raw() == {"tasks": {"name": "TickTick", "url": TASKS_LINK, "overdue_days": 3}}
    r = logged.post("/tasks", data=logged.csrf_data(name="Chores", url="", overdue_days="0"))
    assert r.status_code == 303
    assert logged.raw()["tasks"] == {"name": "Chores", "url": TASKS_LINK, "overdue_days": 0}
    assert 'placeholder="tasks.example/pub/…"' in body(logged.get("/tasks"))
    r = logged.post("/tasks/delete", data=logged.csrf_data(confirmed="1"))
    assert r.status_code == 303 and logged.raw() == {}


@pytest.mark.parametrize("days", ["abc", "-1", "366", "1.5", "", "٣"])
def test_tasks_overdue_days_must_be_a_small_whole_number(logged, days):
    r = logged.post("/tasks", data=logged.csrf_data(url=TASKS_LINK, overdue_days=days))
    assert r.status_code == 200 and EN("admin.error_overdue_days") in body(r)
    assert logged.raw() == {}


def test_tasks_test_shows_the_result(logged, monkeypatch):
    logged.post("/tasks", data=logged.csrf_data(url=TASKS_LINK, overdue_days="7"))
    with open(fixture("tasks.ics"), "rb") as f:
        content = f.read()
    monkeypatch.setattr("inkdoor.net.fetch", lambda url, **kw: content)
    r = logged.post("/tasks/test", data=logged.csrf_data(), headers=XHR)
    assert r.status_code == 200 and "result-ok" in body(r)


def test_tasks_test_without_a_task_list_is_changed_elsewhere(logged):
    r = logged.post("/tasks/test", data=logged.csrf_data())
    assert r.status_code == 303 and r.headers["Location"] == "/tasks"


# --- the door after edits ---------------------------------------------------------------------

def test_removing_last_busy_calendar_never_shows_free(logged, state, monkeypatch):  # Review Focus 4
    monkeypatch.setattr(net, "lan_address", lambda: "192.168.1.20")
    contents = {"work": fixture("work.ics"), "notes": fixture("personal.ics"),
                "tasks": fixture("tasks.ics")}

    def fake_fetch(url, **kwargs):
        name = url.rsplit("/", 1)[1].split(".")[0]
        with open(contents[name], "rb") as f:
            return f.read()

    monkeypatch.setattr("inkdoor.net.fetch", fake_fetch)
    add(logged, name="Work", url="https://calendar.example/work.ics")
    add(logged, name="Notes", url="https://calendar.example/notes.ics", busy="")
    logged.post("/tasks", data=logged.csrf_data(url="https://tasks.example/tasks.ics",
                                                overdue_days="7"))
    server.run_cycle(state, SourceCache())
    assert state.cfg["calendar"][0]["name"] == "Work"

    assert logged.post("/calendars/0/delete", data=logged.csrf_data(confirmed="1")).status_code == 303
    server.run_cycle(state, SourceCache())
    assert state.last_render.word == EN("status.unknown")
    assert state.last_render.headline == EN("status.no_busy_headline")

    logged.post("/calendars/0/delete", data=logged.csrf_data(confirmed="1"))
    logged.post("/tasks/delete", data=logged.csrf_data(confirmed="1"))
    assert logged.raw() == {"calendar": []}
    server.run_cycle(state, SourceCache())
    assert state.last_render.word == EN("status.setup")


# --- concurrency ------------------------------------------------------------------------------

def test_third_concurrent_test_gets_429(app, state, monkeypatch):
    admins = [Admin(app, state) for _ in range(3)]
    add(admins[0], name="Work", url=LINK)
    release, entered, lock = threading.Event(), [], threading.Lock()
    both_in = threading.Event()

    def slow_fetch(url, **kwargs):
        with lock:
            entered.append(url)
            if len(entered) == 2:
                both_in.set()
        release.wait(10)
        raise net.FetchError("timeout")

    monkeypatch.setattr("inkdoor.net.fetch", slow_fetch)
    results = []
    threads = [threading.Thread(target=lambda a=a: results.append(
        a.post("/calendars/0/test", data=a.csrf_data(), headers=XHR).status_code))
        for a in admins[:2]]
    for thread in threads:
        thread.start()
    try:
        assert both_in.wait(10)
        r = admins[2].post("/calendars/0/test", data=admins[2].csrf_data(), headers=XHR)
        assert r.status_code == 429 and EN("admin.test_busy") in body(r)
        r = admins[2].post("/calendars/0/test", data=admins[2].csrf_data())
        assert r.status_code == 429 and EN("admin.test_busy") in body(r) and "<html" in body(r)
    finally:
        release.set()
        for thread in threads:
            thread.join(10)
    assert results == [200, 200]
    assert pages.TESTS.acquire(blocking=False) and pages.TESTS.acquire(blocking=False)
    pages.TESTS.release()
    pages.TESTS.release()


# --- pages in Portuguese ----------------------------------------------------------------------

def test_pages_follow_the_configured_language(tmp_path):
    state = make_state(tmp_path)
    state.cfg["display"]["language"] = "pt-BR"
    admin = Admin(make_app(state, FakeClock()), state)
    pt = Translator("pt-BR")
    assert pt("admin.add_calendar") in body(admin.get("/calendars"))
    assert pt("admin.tasks_title") in body(admin.get("/tasks"))
    r = admin.post("/calendars/new", data=admin.form(name="", url=""))
    assert pt("admin.error_name_required") in body(r)
    page = body(admin.get("/screen"))
    assert pt("admin.screen_title") in page and pt("admin.field_timezone") in page
    assert pt.get("weekdays")[0] in page
    assert pt("admin.password_title") in body(admin.get("/account"))
    assert pt("admin.update_now") in body(admin.get("/"))


# --- screen settings --------------------------------------------------------------------------

def screen_form(logged, **fields):
    data = {"screen": "1072x1448", "language": "en-US", "timezone": "America/Sao_Paulo", "clock": "",
            "workday_start": "8", "workday_end": "19", "workdays": ["0", "1", "2", "3", "4"],
            "min_gap_minutes": "30", "refresh_minutes": "5"}
    data.update(fields)
    return logged.csrf_data(**data)


def write_config(state, text):
    with open(state.config_path, "w", encoding="utf-8") as f:
        f.write(text)


def test_screen_shows_the_settings_and_the_port_read_only(logged, state):
    write_config(state, '[display]\ntimezone = "Europe/Lisbon"\nworkday_start = 9\n'
                        '[server]\nport = 8123\n')
    page = body(logged.get("/screen"))
    assert 'value="Europe/Lisbon"' in page and 'value="9"' in page
    assert '<datalist id="timezones">' in page and '<option value="America/New_York">' in page
    assert "8123" in page and 'name="port"' not in page
    assert EN("admin.port_note") in page
    assert EN("admin.nav.screen") in page


def test_screen_save_writes_only_what_changed(logged, state):
    write_config(state, '[display]\nlanguage = "en-US"\nclock = "12h"\nfavorite = "kept"\n')
    r = logged.post("/screen", data=screen_form(
        logged, timezone="  Europe/Lisbon ", workdays=["5", "1", "1"], workday_end="18",
        min_gap_minutes="0", refresh_minutes="10"))
    assert r.status_code == 303 and r.headers["Location"] == "/screen"
    assert logged.raw() == {
        "display": {"language": "en-US", "favorite": "kept", "timezone": "Europe/Lisbon",
                    "workday_end": 18, "workdays": [1, 5], "min_gap_minutes": 0},
        "server": {"refresh_minutes": 10},
    }
    assert state.render_event.is_set()
    assert EN("admin.saved") in body(logged.get("/screen"))


def test_screen_save_of_the_defaults_pins_nothing(logged):
    assert logged.post("/screen", data=screen_form(logged)).status_code == 303
    assert logged.raw() == {}


@pytest.mark.parametrize("fields, field, error", [                            # Review Focus 3
    ({"timezone": "Mars/Olympus_Mons"}, "timezone", "admin.error_timezone"),
    ({"timezone": ""}, "timezone", "admin.error_timezone"),
    ({"timezone": "../../etc/passwd"}, "timezone", "admin.error_timezone"),
    ({"workday_start": "abc"}, "workday_start", "admin.error_hour"),
    ({"workday_start": "8.5"}, "workday_start", "admin.error_hour"),
    ({"workday_end": "25"}, "workday_end", "admin.error_hour"),
    ({"workday_start": "-1"}, "workday_start", "admin.error_hour"),
    ({"workday_start": "19", "workday_end": "8"}, "workday_end", "admin.error_workday_order"),
    ({"workdays": ["9"]}, "workdays", "admin.error_workdays"),
    ({"workdays": ["1", "x"]}, "workdays", "admin.error_workdays"),
    ({"workdays": []}, "workdays", "admin.error_workdays_empty"),
    ({"min_gap_minutes": "241"}, "min_gap_minutes", "admin.error_min_gap"),
    ({"min_gap_minutes": "1e2"}, "min_gap_minutes", "admin.error_min_gap"),
    ({"refresh_minutes": "0"}, "refresh_minutes", "admin.error_refresh"),
    ({"refresh_minutes": "１０"}, "refresh_minutes", "admin.error_refresh"),  # full-width digits
    ({"clock": "13h"}, "clock", "admin.error_clock"),
    ({"language": "xx-YY"}, "language", "admin.error_language"),
    ({"screen": "1080x1440"}, "screen", "admin.error_screen"),
])
def test_screen_tampered_values_show_field_errors(logged, state, fields, field, error):
    write_config(state, '[display]\nlanguage = "en-US"\n')
    before = logged.digest()
    r = logged.post("/screen", data=screen_form(logged, **fields))
    assert r.status_code == 200
    page = body(r)
    expected = EN(error, low=0, high=0) if error != "admin.error_hour" else EN(error)
    assert f'id="{field}-error"' in page
    assert re.sub(r"\d+", "", expected) in re.sub(r"\d+", "", page)
    assert logged.digest() == before


def test_screen_missing_fields_are_errors_not_crashes(logged):
    r = logged.post("/screen", data=logged.csrf_data())
    assert r.status_code == 200 and EN("admin.error_timezone") in body(r)
    assert logged.raw() == {}


def test_screen_stale_form_is_refused(logged, state):
    stale = screen_form(logged, timezone="Europe/Lisbon")
    write_config(state, "# edited by hand\n")
    r = logged.post("/screen", data=stale)
    assert r.status_code == 303
    assert logged.raw() == {}
    assert EN("admin.changed_elsewhere") in body(logged.get("/screen"))


def test_screen_empty_clock_removes_the_key(logged, state):
    write_config(state, '[display]\nclock = "24h"\n')
    page = body(logged.get("/screen"))
    assert re.search(r'<option value="24h" selected>', page)
    logged.post("/screen", data=screen_form(logged, clock=""))
    assert logged.raw() == {"display": {}}
    logged.post("/screen", data=screen_form(logged, clock="12h"))
    assert logged.raw() == {"display": {"clock": "12h"}}


def test_screen_language_is_read_only_under_an_override(tmp_path):
    state = make_state(tmp_path)
    state.language = "pt-BR"
    admin = Admin(make_app(state, FakeClock()), state)
    write_config(state, '[display]\nlanguage = "en-US"\n')
    pt = Translator("pt-BR")
    page = body(admin.get("/screen"))
    assert pt("admin.language_overridden") in page
    assert not re.search(r'<select[^>]*name="language"', page)
    r = admin.post("/screen", data=screen_form(admin, language="pt-BR", refresh_minutes="7"))
    assert r.status_code == 303
    assert admin.raw() == {"display": {"language": "en-US"}, "server": {"refresh_minutes": 7}}


def test_screen_language_choice_is_saved(logged):
    page = body(logged.get("/screen"))
    assert "Português (Brasil)" in page
    logged.post("/screen", data=screen_form(logged, language="pt-BR"))
    assert logged.raw() == {"display": {"language": "pt-BR"}}


def test_screen_broken_file_shows_the_error_and_no_form(logged, state):
    write_config(state, "[display\n")
    r = logged.get("/screen")
    assert r.status_code == 200 and "config.toml has a syntax error" in body(r)
    assert 'name="digest"' not in body(r) or 'action="/restore"' in body(r)
    assert 'action="/screen"' not in body(r)


# --- account ----------------------------------------------------------------------------------

GENERATED = re.compile(r"\b[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-[2-9a-hjkmnp-z]{4}-"
                       r"[2-9a-hjkmnp-z]{4}\b")


def password_hash(state):
    return auth.read_password_hash(auth.password_path(state.config_path))


def change_password(admin, **fields):
    admin.app.test_clock.advance(1)  # the one-attempt-per-second pace
    return admin.post("/account/password", data={"csrf": admin.c.csrf, **fields})


def test_account_page_has_the_password_form_and_logout(logged):
    page = body(logged.get("/account"))
    assert 'action="/account/password"' in page and 'name="current"' in page
    assert 'name="new"' in page and 'name="generate"' in page
    assert 'autocomplete="current-password"' in page and 'autocomplete="new-password"' in page
    assert page.count('action="/logout"') >= 2


def test_wrong_current_password_changes_nothing(logged, state):
    before = password_hash(state)
    r = change_password(logged, current="not-the-password", new="a-brand-new-password")
    assert r.status_code == 200 and EN("admin.wrong_current_password") in body(r)
    assert password_hash(state) == before
    assert logged.get("/").status_code == 200


def test_short_new_password_is_refused(logged, state):
    before = password_hash(state)
    # 12 characters, but dashes and spaces do not count
    r = change_password(logged, current=PASSWORD, new="abcd-efgh ijk")
    assert r.status_code == 200 and EN("admin.error_password_short", n=12) in body(r)
    assert password_hash(state) == before
    r = change_password(logged, current=PASSWORD, new="")
    assert r.status_code == 200 and EN("admin.error_password_short", n=12) in body(r)
    assert password_hash(state) == before


def test_password_change_keeps_this_browser_and_logs_out_the_others(app, state):
    me, other = Admin(app, state), Admin(app, state)
    old_csrf = me.c.csrf
    r = change_password(me, current=PASSWORD, new="correct horse battery")
    assert r.status_code == 303 and r.headers["Location"] == "/account"
    assert auth.verify_password("correct horse battery", password_hash(state))
    assert not auth.verify_password(PASSWORD, password_hash(state))
    assert other.get("/").status_code == 302
    page = me.get("/account")
    assert page.status_code == 200 and EN("admin.password_changed") in body(page)
    new_csrf = re.search(r'name="csrf" value="([^"]+)"', body(page)).group(1)
    assert new_csrf != old_csrf
    assert me.get("/").status_code == 200  # the watcher does not log this browser out later


def test_generated_password_is_shown_once(app, state, caplog, capsys):
    caplog.set_level(logging.DEBUG)
    me = Admin(app, state)
    r = change_password(me, current=PASSWORD, generate="1", new="ignored")
    assert r.status_code == 200 and r.headers["Cache-Control"] == "no-store"
    found = GENERATED.findall(body(r))
    assert len(set(found)) == 1
    assert auth.verify_password(found[0], password_hash(state))
    assert "Location" not in r.headers and found[0] not in str(r.headers)
    # the page's forms carry the new session's token
    me.c.csrf = re.search(r'name="csrf" value="([^"]+)"', body(r)).group(1)
    page = body(me.get("/account"))
    assert found[0] not in page
    assert me.get("/").status_code == 200
    logged = caplog.text + "".join(capsys.readouterr())
    assert found[0] not in logged and found[0].replace("-", "") not in logged


def test_password_change_is_rate_limited_before_scrypt(logged, monkeypatch):
    calls = []
    real = auth.verify_password
    monkeypatch.setattr(auth, "verify_password", lambda *a: calls.append(1) or real(*a))
    for _ in range(5):
        r = change_password(logged, current="wrong-wrong", new="a-brand-new-password")
        assert r.status_code == 200
    r = change_password(logged, current="wrong-wrong", new="a-brand-new-password")
    assert r.status_code == 429 and len(calls) == 5


def test_login_mid_scrypt_does_not_survive_a_password_change(app, state, monkeypatch):
    owner = Admin(app, state)
    attacker = client(app)
    token = login_token(attacker)
    real = auth.verify_password

    def racing(password, encoded):  # the owner changes the password while scrypt runs
        ok = real(password, encoded)
        monkeypatch.setattr(auth, "verify_password", real)
        assert change_password(owner, current=PASSWORD, new="a-brand-new-password") \
            .status_code == 303
        return ok

    monkeypatch.setattr(auth, "verify_password", racing)
    app.test_clock.advance(1)
    r = attacker.post("/login", base_url=BASE, data={"csrf": token, "password": PASSWORD})
    assert r.status_code == 409 and EN("admin.login_expired") in body(r)
    assert attacker.get("/", base_url=BASE).status_code == 302
    assert owner.get("/").status_code == 200


@pytest.mark.parametrize("noticed_by_another_request", [False, True])
def test_login_mid_scrypt_does_not_survive_a_password_file_change(
        app, state, monkeypatch, noticed_by_another_request):
    other = Admin(app, state)
    attacker = client(app)
    token = login_token(attacker)
    real = auth.verify_password

    def racing(password, encoded):  # `inkdoor password` runs in a shell while scrypt runs
        ok = real(password, encoded)
        auth.set_password(auth.password_path(state.config_path), "from-the-shell-123")
        if noticed_by_another_request:  # its guard sees the change and logs everyone out
            assert other.get("/").status_code == 302
        return ok

    monkeypatch.setattr(auth, "verify_password", racing)
    app.test_clock.advance(1)
    r = attacker.post("/login", base_url=BASE, data={"csrf": token, "password": PASSWORD})
    assert r.status_code == 409
    assert attacker.get("/", base_url=BASE).status_code == 302


def test_password_change_is_refused_when_the_file_changed_meanwhile(logged, state, monkeypatch):
    real = auth.verify_password

    def racing(password, encoded):  # `inkdoor password` runs while the current one is checked
        ok = real(password, encoded)
        auth.set_password(auth.password_path(state.config_path), "from-the-shell-123")
        return ok

    monkeypatch.setattr(auth, "verify_password", racing)
    r = change_password(logged, current=PASSWORD, new="a-brand-new-password")
    assert r.status_code == 401
    assert real("from-the-shell-123", password_hash(state))  # the shell's password stays
    assert logged.get("/").status_code == 302


@pytest.mark.parametrize("path", ["/restore", "/render", "/account/password"])
@pytest.mark.parametrize("problem", ["no token", "foreign origin"])
def test_new_actions_need_the_csrf_token_and_origin(logged, state, path, problem):
    add(logged, name="Work", url="https://calendar.example/work.ics")
    add(logged, name="Home", url="https://calendar.example/home.ics")
    write_config(state, "[[calendar]\n")   # restore would work with the right token

    def file_digest():
        with open(state.config_path, "rb") as f:
            return config_edit.digest(f.read())

    before = (file_digest(), password_hash(state))
    state.render_event.clear()
    data = {"digest": file_digest(), "current": PASSWORD, "new": "a-brand-new-password"}
    headers = {}
    if problem == "foreign origin":
        data["csrf"] = logged.c.csrf
        headers["Origin"] = "http://evil.example"
    r = logged.post(path, data=data, headers=headers)
    assert r.status_code == 403
    assert (file_digest(), password_hash(state)) == before
    assert not state.render_event.is_set()
    assert logged.get("/").status_code == 200


# --- home -------------------------------------------------------------------------------------

def test_update_now_is_throttled(logged, state):
    r = logged.post("/render", data={"csrf": logged.c.csrf})
    assert r.status_code == 303 and r.headers["Location"] == "/"
    assert state.render_event.is_set()
    assert EN("admin.update_requested") in body(logged.get("/"))
    state.render_event.clear()
    r = logged.post("/render", data={"csrf": logged.c.csrf})
    assert r.status_code == 303 and not state.render_event.is_set()
    assert EN("admin.update_throttled") in body(logged.get("/"))


def test_status_json_needs_a_session_and_reports_the_last_render(app, logged, state):
    r = client(app).get("/status.json", base_url=BASE)
    assert r.status_code == 302
    r = logged.get("/status.json")
    assert r.status_code == 200 and r.get_json()["at"] is None
    assert r.headers["Cache-Control"] == "no-store"
    at = dt.datetime(2026, 10, 14, 16, 30, tzinfo=dt.timezone.utc)
    state.last_render = RenderInfo(at, "In a meeting", "until 5:00 PM", ["Work: FetchError"])
    data = logged.get("/status.json").get_json()
    assert data["at"] == at.isoformat()
    assert data["word"] == "In a meeting" and data["headline"] == "until 5:00 PM"
    assert data["errors"] == ["Work: FetchError"] and data["updated"] == EN(
        "admin.last_update", date=EN.date_short(at), time=EN.time(at))


def test_home_shows_the_kindle_url_with_a_copy_button(logged, monkeypatch):
    monkeypatch.setattr(net, "lan_address", lambda: "192.168.0.50")
    page = body(logged.get("/"))
    assert '>http://192.168.0.50:3667/kindle.png</code>' in page
    assert "data-copy=" in page
    monkeypatch.setattr(net, "lan_address", lambda: None)
    page = body(logged.get("/"))
    assert str(escape(EN("admin.kindle_url_unknown", port=3667))) in page


def test_home_preview_uses_the_last_render_time(logged, state):
    from PIL import Image
    Image.new("L", (8, 8), 255).save(state.output_dir + "/kindle.png")
    at = dt.datetime(2026, 10, 14, 16, 30, tzinfo=dt.timezone.utc)
    state.last_render = RenderInfo(at, "Free", "until 5:00 PM", ["Work"])
    page = body(logged.get("/"))
    assert f'src="/kindle.png?t={int(at.timestamp() * 1000)}"' in page
    assert f'data-at="{at.isoformat()}"' in page


def test_first_setup_banner_points_to_calendars(logged, state):
    state.config_problem = "missing"
    page = body(logged.get("/"))
    assert EN("admin.first_setup") in page and 'href="/calendars/new"' in page
    add(logged, name="Work", url="https://calendar.example/work.ics")
    assert EN("admin.first_setup") not in body(logged.get("/"))


def test_first_setup_banner_while_nothing_has_a_link(logged, state):
    write_config(state, '[admin]\nenabled = true\n[[calendar]]\nname = "Work"\n'
                        'url = "PASTE_YOUR_LINK"\n')
    assert EN("admin.first_setup") in body(logged.get("/"))
    logged.post("/tasks", data=logged.csrf_data(name="T", url=TASKS_LINK, overdue_days="7"))
    assert EN("admin.first_setup") not in body(logged.get("/"))


def test_deleted_file_is_broken_and_offers_the_backup(logged, state):
    add(logged, name="Work", url="https://calendar.example/work.ics")
    add(logged, name="Home", url="https://calendar.example/home.ics")
    os.remove(state.config_path)
    state.config_problem = "broken"
    page = body(logged.get("/"))
    assert EN("admin.config_broken") in page and 'action="/restore"' in page
    assert EN("admin.first_setup") not in page


def test_restore_previous_version_from_a_broken_file(logged, state):
    add(logged, name="Work", url="https://calendar.example/work.ics")
    add(logged, name="Home", url="https://calendar.example/home.ics")  # .bak holds "Work" only
    write_config(state, "[[calendar]\n")                               # a hand edit breaks it
    state.config_problem = "broken"
    page = body(logged.get("/"))
    assert EN("admin.config_broken") in page and "config.toml has a syntax error" in page
    assert 'action="/restore"' in page
    digest = re.search(r'action="/restore".*?name="digest" value="([0-9a-f]{64})"', page,
                       re.S).group(1)
    state.render_event.clear()
    r = logged.post("/restore", data={"csrf": logged.c.csrf, "digest": digest})
    assert r.status_code == 303 and r.headers["Location"] == "/"
    assert [c["name"] for c in logged.raw()["calendar"]] == ["Work"]
    assert state.render_event.is_set()
    with open(state.config_path + ".bak", encoding="utf-8") as f:
        assert f.read() == "[[calendar]\n"
    page = body(logged.get("/"))
    assert EN("admin.restored") in page
    assert EN("admin.config_broken") not in page  # before the render loop catches up, too


def test_restore_is_offered_on_the_settings_pages_too(logged, state):
    add(logged, name="Work", url="https://calendar.example/work.ics")
    add(logged, name="Home", url="https://calendar.example/home.ics")
    write_config(state, "[[calendar]\n")
    for path in ("/calendars", "/tasks", "/screen"):
        assert 'action="/restore"' in body(logged.get(path)), path


def test_restore_is_not_offered_when_the_backup_is_broken_too(logged, state):
    write_config(state, "[[calendar]\n")
    with open(state.config_path + ".bak", "w", encoding="utf-8") as f:
        f.write('[display]\ntimezone = "Mars/Base"\n')
    state.config_problem = "broken"
    page = body(logged.get("/"))
    assert EN("admin.config_broken") in page and 'action="/restore"' not in page
    digest = config_edit.digest(b"[[calendar]\n")
    r = logged.post("/restore", data={"csrf": logged.c.csrf, "digest": digest})
    assert r.status_code == 303
    with open(state.config_path, encoding="utf-8") as f:
        assert f.read() == "[[calendar]\n"


def test_restore_with_a_stale_digest_is_refused(logged, state):
    add(logged, name="Work", url="https://calendar.example/work.ics")
    add(logged, name="Home", url="https://calendar.example/home.ics")
    before = logged.digest()
    r = logged.post("/restore", data={"csrf": logged.c.csrf, "digest": "0" * 64})
    assert r.status_code == 303 and logged.digest() == before
    assert EN("admin.changed_elsewhere") in body(logged.get("/"))


# --- secrets on the new pages -----------------------------------------------------------------

def test_links_never_leave_the_server_on_home_screen_and_account(logged, state, caplog, capsys,
                                                                 monkeypatch):
    caplog.set_level(logging.DEBUG)
    monkeypatch.setattr(net, "lan_address", lambda: "192.168.0.50")
    add(logged, name="Work", url=LINK)
    logged.post("/tasks", data=logged.csrf_data(name="Tasks", url=TASKS_LINK, overdue_days="7"))
    responses = [logged.get(p) for p in ("/", "/screen", "/account", "/status.json")]
    # a link pasted into the time zone field is not echoed back
    responses.append(logged.post("/screen", data=screen_form(logged, timezone=LINK)))
    # a broken file whose backup holds the links
    write_config(state, "[[calendar]\n")
    with open(state.config_path + ".bak", encoding="utf-8") as f:
        assert CANARY in f.read()
    state.config_problem = "broken"
    state.last_render = RenderInfo(dt.datetime.now(dt.timezone.utc), "Busy", "until 5:00 PM",
                                   ["Work: FetchError"])
    responses += [logged.get(p) for p in ("/", "/screen", "/calendars", "/tasks", "/status.json")]
    digest = config_edit.digest(b"[[calendar]\n")
    responses.append(logged.post("/restore", data={"csrf": logged.c.csrf, "digest": digest}))
    responses += [logged.get(p) for p in ("/", "/screen")]
    responses.append(change_password(logged, current="wrong-wrong", new="a-brand-new-pw"))
    everything = "".join(body(r) + str(r.headers) for r in responses)
    everything += caplog.text + "".join(capsys.readouterr())
    for i in range(len(CANARY) - 7):
        assert CANARY[i:i + 8] not in everything


def test_home_explains_a_hand_edited_link_that_is_not_text(logged, state):
    write_config(state, '[[calendar]]\nname = "Work"\nurl = 5\n')
    r = logged.get("/")
    assert r.status_code == 200
    assert str(escape(EN("config_error.calendar_url", name="Work"))) in body(r)


@pytest.mark.skipif(os.name == "nt", reason="symbolic links need privileges on Windows")
def test_a_symlinked_config_is_never_replaced(logged, state, tmp_path):
    import pathlib
    real = tmp_path / "elsewhere.toml"
    real.write_text('[display]\nlanguage = "en-US"\n')
    link = pathlib.Path(state.config_path)
    link.symlink_to(real)
    r = logged.post("/screen", data=screen_form(logged, timezone="Europe/Lisbon"))
    assert r.status_code == 200 and str(escape(EN("admin.error_link"))) in body(r)
    assert link.is_symlink() and real.read_text() == '[display]\nlanguage = "en-US"\n'

    (tmp_path / "config.toml.bak").write_text('[display]\nlanguage = "pt-BR"\n')
    r = logged.post("/restore", data={"csrf": logged.c.csrf, "digest": logged.digest()})
    assert r.status_code == 303
    assert str(escape(EN("admin.error_link"))) in body(logged.get("/"))
    assert link.is_symlink() and real.read_text() == '[display]\nlanguage = "en-US"\n'


# --- dates ------------------------------------------------------------------------------------

@pytest.mark.parametrize("language, when, absent", [
    ("en-US", r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{1,2}:\d{2} [AP]M\b",
     r"\b\d{2}/\d{2}\b"),
    ("pt-BR", r"\b\d{2}/\d{2} \d{1,2}:\d{2}\b", r"\b(Oct|out) \d"),
])
def test_admin_dates_follow_the_language(tmp_path, monkeypatch, language, when, absent):
    state = make_state(tmp_path, display={"language": language})
    with open(state.config_path, "w", encoding="utf-8") as f:
        f.write(f'[display]\nlanguage = "{language}"\n\n[[calendar]]\nname = "Work"\nurl = "{LINK}"\n')
    logged = Admin(make_app(state, FakeClock()), state)
    t = Translator(language)
    state.last_render = RenderInfo(dt.datetime(2026, 10, 14, 16, 30, tzinfo=dt.timezone.utc),
                                   "Free", "", [])
    home = body(logged.get("/"))
    assert t("admin.last_update", date={"en-US": "Oct 14", "pt-BR": "14/10"}[language],
             time=t.time(dt.time(16, 30))) in home
    monkeypatch.setattr("inkdoor.net.fetch", lambda url, **kw: ics())
    fragment = body(logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR))
    assert re.search(when, fragment) and not re.search(absent, fragment)


# --- removal without JavaScript and preview polling --------------------------------------------

def test_remove_without_javascript_asks_on_a_page_first(logged):
    add(logged, name="Work", url=LINK)
    r = logged.post("/calendars/0/delete", data=logged.csrf_data())
    page = body(r)
    assert r.status_code == 200 and logged.raw()["calendar"][0]["name"] == "Work"   # not removed
    assert EN("admin.confirm_remove_calendar", name="Work") in page
    assert 'action="/calendars/0/delete"' in page and 'name="confirmed" value="1"' in page
    assert f'name="csrf" value="{logged.c.csrf}"' in page and logged.digest() in page
    assert 'href="/calendars"' in page                                   # cancel goes back
    r = logged.post("/calendars/0/delete", data=logged.csrf_data(confirmed="1"))
    assert r.status_code == 303 and logged.raw().get("calendar", []) == []


def test_remove_tasks_without_javascript_asks_first(logged):
    logged.post("/tasks", data=logged.form(url=LINK, overdue_days="7"))
    page = body(logged.post("/tasks/delete", data=logged.csrf_data()))
    assert EN("admin.confirm_remove_tasks") in page and "tasks" in logged.raw()
    assert logged.post("/tasks/delete", data=logged.csrf_data(confirmed="1")).status_code == 303
    assert "tasks" not in logged.raw()


def test_remove_buttons_carry_an_empty_confirmed_field_for_the_script(logged):
    add(logged, name="Work", url=LINK)
    page = body(logged.get("/calendars"))
    assert 'data-confirm="' in page and '<input type="hidden" name="confirmed" value="">' in page


def test_the_confirmation_post_needs_the_csrf_token(logged):
    add(logged, name="Work", url=LINK)
    r = logged.c.post("/calendars/0/delete", base_url=BASE,
                      data={"digest": logged.digest(), "confirmed": "1"})
    assert r.status_code == 403 and logged.raw()["calendar"][0]["name"] == "Work"


def rendered_once(state):
    state.render_event.clear()
    state.last_render = RenderInfo(dt.datetime(2026, 10, 14, 16, 30, tzinfo=dt.timezone.utc),
                                   "Free", "", [])


def test_home_polls_once_after_a_save_or_update_now(logged, state):
    rendered_once(state)
    assert "data-poll" not in body(logged.get("/"))                      # nothing asked for
    add(logged, name="Work", url=LINK)
    rendered_once(state)                                                 # rendered already
    assert "data-poll" in body(logged.get("/"))                          # still watches once
    assert "data-poll" not in body(logged.get("/"))
    logged.post("/render", data={"csrf": logged.c.csrf})
    rendered_once(state)
    assert "data-poll" in body(logged.get("/"))


def test_first_setup_banner_does_not_start_polling(logged, state):
    rendered_once(state)
    page = body(logged.get("/"))
    assert EN("admin.first_setup") in page and "data-poll" not in page
    script = open(os.path.join(os.path.dirname(pages.__file__), "static", "admin.js"),
                  encoding="utf-8").read()
    assert ".notice" not in script                                       # notices never start it


# --- password change atomicity ----------------------------------------------------------------

def test_two_password_changes_at_once_cannot_both_win(app, state, monkeypatch):
    first, second = Admin(app, state), Admin(app, state)
    lock = app.extensions["inkdoor"]["password_lock"]
    main, second_waits, results = threading.current_thread(), threading.Event(), {}

    class SpyLock:  # tells the test when the second change is waiting for the first
        def __enter__(self):
            if threading.current_thread() is not main:
                second_waits.set()
            lock.acquire()

        def __exit__(self, *exc_info):
            lock.release()

    app.extensions["inkdoor"]["password_lock"] = SpyLock()
    real_set = auth.set_password

    def set_password(path, password):
        if password == "first-new-password":  # the first change, inside its step
            worker = threading.Thread(target=lambda: results.update(second=change_password(
                second, current=PASSWORD, new="second-new-password")))
            worker.start()
            assert second_waits.wait(10)
            results["worker"] = worker
        real_set(path, password)

    monkeypatch.setattr(auth, "set_password", set_password)
    r = change_password(first, current=PASSWORD, new="first-new-password")
    results["worker"].join(10)
    assert r.status_code == 303 and results["second"].status_code == 401
    assert auth.verify_password("first-new-password", password_hash(state))
    assert first.get("/").status_code == 200 and second.get("/").status_code == 302


def test_a_409_login_is_neither_a_success_nor_a_failure(app, state, monkeypatch):
    owner = Admin(app, state)
    attacker = client(app)
    limiter = app.extensions["inkdoor"]["limiter"]
    ip = "192.168.0.66"
    for _ in range(3):
        limiter.failed(ip)
    token = login_token(attacker)
    real = auth.verify_password

    def racing(password, encoded):  # the owner changes the password while scrypt runs
        ok = real(password, encoded)
        monkeypatch.setattr(auth, "verify_password", real)
        assert change_password(owner, current=PASSWORD, new="a-brand-new-password") \
            .status_code == 303
        return ok

    monkeypatch.setattr(auth, "verify_password", racing)
    app.test_clock.advance(1)
    r = attacker.post("/login", base_url=BASE, data={"csrf": token, "password": PASSWORD},
                      environ_base={"REMOTE_ADDR": ip})
    assert r.status_code == 409
    assert limiter._failures[ip][0] == 3                  # the backoff was not reset


def test_a_successful_login_still_resets_the_backoff(app):
    limiter = app.extensions["inkdoor"]["limiter"]
    c = client(app)
    token = login_token(c)
    for _ in range(3):
        limiter.failed("127.0.0.1")
    app.test_clock.advance(1)
    r = c.post("/login", base_url=BASE, data={"csrf": token, "password": PASSWORD})
    assert r.status_code == 302 and "127.0.0.1" not in limiter._failures


# --- save errors and the test slots -----------------------------------------------------------

def test_a_problem_elsewhere_in_the_file_refuses_the_save(logged, state):
    with open(state.config_path, "w", encoding="utf-8") as f:
        f.write("[server]\nrefresh_minutes = 0\n")              # invalid, but not in this form
    before = open(state.config_path, "rb").read()
    r = logged.post("/calendars/new", data=logged.form(name="Home", url=LINK))
    page = body(r)
    assert r.status_code == 200
    assert str(escape(EN("admin.error_config", message=EN("config_error.refresh", value=0)))) in page
    assert open(state.config_path, "rb").read() == before


def test_a_write_error_is_reported_and_changes_nothing(logged, state, monkeypatch):
    add(logged, name="Work", url=LINK)
    before = open(state.config_path, "rb").read()

    def refuse(path, data):
        raise PermissionError("read-only folder")
    monkeypatch.setattr(config_edit, "write_private", refuse)
    r = logged.post("/calendars/new", data=logged.form(name="Home", url=LINK))
    assert r.status_code == 200 and EN("admin.error_write", error="PermissionError") in body(r)
    assert open(state.config_path, "rb").read() == before


def test_the_test_slot_is_released_when_a_check_crashes(logged, monkeypatch):
    add(logged, name="Work", url=LINK)

    def crash(*args, **kwargs):
        raise RuntimeError("not a fetch error")
    monkeypatch.setattr(pages.checker, "check_calendar", crash)
    for _ in range(3):                                          # more than the two slots
        r = logged.post("/calendars/0/test", data=logged.csrf_data(), headers=XHR)
        assert r.status_code == 500
    assert pages.TESTS.acquire(blocking=False) and pages.TESTS.acquire(blocking=False)
    pages.TESTS.release()
    pages.TESTS.release()


# --- Kindle files ----------------------------------------------------------------------------

KINDLE_URL = "http://192.168.0.50:3667/kindle.png"          # the fake LAN address from conftest


def kindle_zip(response):
    import io
    import zipfile
    return zipfile.ZipFile(io.BytesIO(response.data))


def test_kindle_zip_has_the_scripts_with_this_server_filled_in(logged):
    from inkdoor import kindle_files
    page = body(logged.get("/"))
    assert 'href="/kindle-files.zip"' in page and EN("admin.kindle_download") in page
    r = logged.get("/kindle-files.zip")
    assert r.status_code == 200 and r.mimetype == "application/zip"
    assert r.headers["Content-Disposition"] == 'attachment; filename="inkdoor-kindle.zip"'
    assert r.headers["Cache-Control"] == "no-store"
    archive = kindle_zip(r)
    assert sorted(archive.namelist()) == [
        "README.txt", "inkdoor/common.sh", "inkdoor/config.sh", "inkdoor/loop.sh",
        "scriptlets/inkdoor-kpm.sh", "scriptlets/inkdoor-start.sh", "scriptlets/inkdoor-test.sh"]
    folder = kindle_files.find_dir()
    for name in ("inkdoor/common.sh", "inkdoor/loop.sh"):
        assert archive.read(name) == (folder / name).read_bytes()
    assert archive.read("scriptlets/inkdoor-start.sh") == (folder / "documents/inkdoor-start.sh").read_bytes()
    config_sh = archive.read("inkdoor/config.sh").decode("utf-8")
    assert f'\nURL="{KINDLE_URL}"\n' in config_sh and '\nLANGUAGE="en-US"\n' in config_sh
    assert "\r" not in config_sh and "INTERVAL=300" in config_sh   # the rest is the template
    readme = archive.read("README.txt").decode("utf-8")
    assert KINDLE_URL in readme and "docs/kindle.md" in readme
    assert all(archive.getinfo(n).external_attr >> 16 == 0o100755 for n in archive.namelist()
               if n.endswith(".sh"))


def test_kindle_zip_follows_the_admin_language(tmp_path):
    state = make_state(tmp_path, display={"language": "pt-BR"})
    logged = Admin(make_app(state, FakeClock()), state)
    pt = Translator("pt-BR")
    assert pt("admin.kindle_download") in body(logged.get("/"))
    archive = kindle_zip(logged.get("/kindle-files.zip"))
    assert '\nLANGUAGE="pt-BR"\n' in archive.read("inkdoor/config.sh").decode("utf-8")
    readme = archive.read("README.txt").decode("utf-8")
    assert "Copie a pasta" in readme and "docs/pt-BR/kindle.md" in readme


def test_kindle_zip_needs_a_login(app):
    assert client(app).get("/kindle-files.zip", base_url=BASE).status_code == 302


@pytest.mark.parametrize("missing", ["address", "scripts"])
def test_no_kindle_zip_without_an_address_or_the_scripts(logged, monkeypatch, missing):
    from inkdoor import kindle_files
    if missing == "address":
        monkeypatch.setattr(net, "lan_address", lambda: None)
    else:
        monkeypatch.setattr(kindle_files, "find_dir", lambda: None)
    assert "/kindle-files.zip" not in body(logged.get("/"))
    assert logged.get("/kindle-files.zip").status_code == 404


@pytest.mark.parametrize("url", ['http://x"; rm -rf /; "', "http://x/$(id)", "http://x/`id`",
                                 "https://x/kindle.png", "http://x\\y"])
def test_config_sh_refuses_an_unsafe_address(url):
    from inkdoor import kindle_files
    with pytest.raises(ValueError):
        kindle_files.config_sh('URL="old"\nLANGUAGE="en-US"\n', url, "en-US")


def test_config_sh_only_changes_url_and_language():
    from inkdoor import kindle_files
    template = '# URL="not this"\nURL="old"\nINTERVAL=300\nLANGUAGE="en-US"\n'
    assert kindle_files.config_sh(template, KINDLE_URL, "pt-BR") == (
        f'# URL="not this"\nURL="{KINDLE_URL}"\nINTERVAL=300\nLANGUAGE="pt-BR"\n')


# --- step-by-step help -----------------------------------------------------------------------

def howto(page, title):
    """The <details> tag of the how-to with this title, or None."""
    match = re.search(r'(<details class="howto"[^>]*>)\s*<summary>' + re.escape(str(escape(title))), page)
    return match.group(1) if match else None


def test_calendar_form_explains_where_to_find_the_link(logged):
    page = body(logged.get("/calendars/new"))
    assert howto(page, EN("admin.howto_link_title")) == '<details class="howto" open>'
    assert "<strong>outlook.office.com</strong>" in page and EN("admin.howto_google_title") in page
    assert 'href="https://github.com/frkey/inkdoor/blob/master/docs/calendar-sources.md"' in page
    add(logged, name="Work", url=LINK)
    page = body(logged.get("/calendars/0"))
    assert howto(page, EN("admin.howto_link_title")) == '<details class="howto">'   # closed


def test_tasks_page_explains_the_ticktick_link_until_it_is_set_up(logged):
    page = body(logged.get("/tasks"))
    assert howto(page, EN("admin.howto_ticktick_title")) == '<details class="howto" open>'
    assert "<strong>Subscribe to TickTick</strong>" in page
    logged.post("/tasks", data=logged.form(url=LINK, overdue_days="7"))
    assert howto(body(logged.get("/tasks")), EN("admin.howto_ticktick_title")) == '<details class="howto">'


def test_home_explains_the_kindle_install_next_to_the_download(logged, monkeypatch):
    from inkdoor import kindle_files
    page = body(logged.get("/"))
    assert howto(page, EN("admin.howto_kindle_title")) == '<details class="howto">'
    assert "<strong>scriptlets</strong>" in page and 'href="https://github.com/frkey/inkdoor/blob/master/docs/kindle.md"' in page
    monkeypatch.setattr(kindle_files, "find_dir", lambda: None)
    assert howto(body(logged.get("/")), EN("admin.howto_kindle_title")) is None


def test_howtos_follow_the_language(tmp_path):
    state = make_state(tmp_path, display={"language": "pt-BR"})
    logged = Admin(make_app(state, FakeClock()), state)
    pt = Translator("pt-BR")
    page = body(logged.get("/calendars/new"))
    assert howto(page, pt("admin.howto_link_title")) and "docs/pt-BR/calendar-sources.md" in page
    assert "docs/pt-BR/kindle.md" in body(logged.get("/"))


def test_emphasis_escapes_everything_but_the_bold_markers():
    from inkdoor.web import emphasis
    assert str(emphasis("Open **Settings → <Calendar>** & copy")) == \
        "Open <strong>Settings → &lt;Calendar&gt;</strong> &amp; copy"
    assert str(emphasis("<script>x()</script>")) == "&lt;script&gt;x()&lt;/script&gt;"


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
def test_every_step_list_is_a_list_of_sentences(language):
    t = Translator(language)
    for key in ("admin.howto_outlook", "admin.howto_google", "admin.howto_ticktick", "admin.howto_kindle"):
        steps = t.get(key)
        assert isinstance(steps, list) and steps and all(isinstance(s, str) and s for s in steps)
        assert all(s.count("**") % 2 == 0 for s in steps), key            # bold markers pair up


def test_home_explains_kpm_updates_without_add_repo(logged):
    page = body(logged.get("/"))
    assert howto(page, EN("admin.howto_kpm_title")) == '<details class="howto">'
    assert "<strong>inkdoor - connect KPM</strong>" in page
    assert ";kpm update\n;kpm upgrade" in page and "add-repo" not in page


def test_screen_picks_the_kindle_model(logged, state):
    write_config(state, '[display]\nlanguage = "en-US"\n')
    page = body(logged.get("/screen"))
    assert '<option value="1072x1448" selected>' in page                 # the default
    assert EN("admin.screen_option", models=EN("screens.1860x2480"), width=1860,
              height=2480) in page
    r = logged.post("/screen", data=screen_form(logged, screen="600x800"))
    assert r.status_code == 303 and logged.raw()["display"]["screen"] == "600x800"
    assert '<option value="600x800" selected>' in body(logged.get("/screen"))


def test_screen_points_to_the_model_list_in_the_page_language(logged):
    page = body(logged.get("/screen"))
    assert "docs/kindle.md#which-kindle-do-i-have" in page


def test_home_preview_has_the_screen_size(logged, state):
    from PIL import Image
    Image.new("L", (8, 8), 255).save(state.output_dir + "/kindle.png")
    state.last_render = RenderInfo(dt.datetime(2026, 10, 14, 16, 30, tzinfo=dt.timezone.utc),
                                   "Free", "until 5:00 PM", ["Work"])
    state.cfg["display"]["screen"] = "1236x1648"
    assert 'width="1236" height="1648"' in body(logged.get("/"))


def test_screen_docs_anchor_is_encoded_in_portuguese(logged, state):
    write_config(state, '[display]\nlanguage = "pt-BR"\n')
    state.cfg["display"]["language"] = "pt-BR"
    page = body(logged.get("/screen"))
    assert "docs/pt-BR/kindle.md#qual-%C3%A9-o-meu-kindle" in page
