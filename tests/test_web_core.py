"""The admin app core: guards, login, sessions, headers and the public Kindle route."""
import io
import logging
import re
from pathlib import Path

import pytest
from PIL import Image

from inkdoor.config import with_defaults
from inkdoor.i18n import Translator
from inkdoor.state import RenderInfo, ServerState
from inkdoor.web import auth, create_app
from web_helpers import (BASE, CSP, EN, PASSWORD, FakeClock, client, cookie, get, logged_in,
                         login, login_token, make_app, make_state, post)

@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def state(tmp_path):
    return make_state(tmp_path)


@pytest.fixture
def app(state, clock):
    return make_app(state, clock)


@pytest.fixture
def app_disabled(tmp_path, clock):
    return make_app(make_state(tmp_path, admin_enabled=False), clock)


@pytest.fixture
def rendered(state):
    path = state.output_dir + "/kindle.png"
    Image.new("L", (8, 8), 255).save(path)
    return Path(path)


def rule_path(rule):
    path = rule.rule
    for arg in rule.arguments:
        path = re.sub(r"<(?:[^:<>]+:)?%s>" % arg, "1", path)
    return path


# --- routing ----------------------------------------------------------------------------------

def test_route_inventory_requires_session(app):
    public = {"kindle", "login", "static", "kpm_index", "kpm_package"}
    checked = 0
    for rule in app.url_map.iter_rules():
        if rule.endpoint in public:
            continue
        for method in rule.methods - {"HEAD", "OPTIONS"}:
            r = client(app).open(rule_path(rule), method=method, base_url=BASE)
            assert r.status_code in (302, 401), (rule, method)
            checked += 1
    assert checked >= 2  # at least / and /logout


def test_anonymous_get_redirects_to_login_with_next(app):
    r = get(client(app), "/")
    assert r.status_code == 302 and r.headers["Location"] == "/login?next=%2F"


def test_anonymous_post_is_401_with_a_translated_page(app):
    r = post(client(app), "/logout")
    assert r.status_code == 401 and EN("admin.error_401") in r.get_data(as_text=True)


def test_unknown_paths_are_404(app):
    for path in ["/config.toml", "/kindle.png/", "/../config.toml", "/output/kindle.png",
                 "/admin-password", "/static/../config.toml", "/static/fonts/OFL.txt",
                 "/static/fonts/../render.py", "//kindle.png"]:
        assert get(client(app), path).status_code == 404, path
    assert client(app).open("/kindle.png", method="OPTIONS", base_url=BASE).status_code == 404
    assert post(client(app), "/kindle.png").status_code == 404


def test_static_css_and_fonts_are_public(app):
    c = client(app)
    css = get(c, "/static/admin.css")
    assert css.status_code == 200 and "text/css" in css.headers["Content-Type"]
    font = get(c, "/static/fonts/Inter-Medium.otf")
    assert font.status_code == 200 and font.data[:4] == b"OTTO"


# --- /kindle.png ------------------------------------------------------------------------------

def test_kindle_contract(app, rendered):
    r = get(client(app), "/kindle.png?t=1")
    assert r.status_code == 200 and r.mimetype == "image/png"
    assert r.headers["Cache-Control"] == "no-store"
    assert r.data == rendered.read_bytes()
    assert "Content-Security-Policy" not in r.headers


def test_kindle_is_read_fresh_each_request(app, rendered):
    c = client(app)
    first = get(c, "/kindle.png").data
    Image.new("L", (8, 8), 0).save(rendered)
    assert get(c, "/kindle.png").data != first


def test_kindle_head_has_no_body(app, rendered):
    r = client(app).head("/kindle.png", base_url=BASE)
    assert r.status_code == 200 and r.data == b""
    assert int(r.headers["Content-Length"]) == len(rendered.read_bytes())


def test_kindle_is_503_before_the_first_render(app):
    r = get(client(app), "/kindle.png")
    assert r.status_code == 503 and r.headers["Cache-Control"] == "no-store"


def test_kindle_bad_host_gets_error_png(app, rendered, caplog):
    c = client(app)
    with caplog.at_level(logging.WARNING):
        r = get(c, "/kindle.png", headers={"Host": "evil.com"})
        again = get(c, "/kindle.png", headers={"Host": "evil.com"})
    assert r.status_code == 200 and r.mimetype == "image/png"
    assert r.data != rendered.read_bytes() and again.data == r.data
    assert Image.open(io.BytesIO(r.data)).size == (1072, 1448)
    assert r.headers["Cache-Control"] == "no-store"
    assert caplog.text.count("evil.com") == 1  # logged once


def test_kindle_host_cache_is_bounded(app, rendered):
    c = client(app)
    for i in range(20):
        assert get(c, "/kindle.png", headers={"Host": f"evil{i}.com"}).status_code == 200
    from inkdoor import web
    assert len(app.extensions["inkdoor"]["host_images"]) <= web.HOST_IMAGE_CACHE


def test_rejected_host_renders_are_rate_limited(app, rendered, clock, monkeypatch):
    from inkdoor import web
    renders = []
    real = web.render_host_rejected

    def counting(cfg, host):
        renders.append(host)
        return real(cfg, host)
    monkeypatch.setattr(web, "render_host_rejected", counting)
    c = client(app)
    images = [get(c, "/kindle.png", headers={"Host": f"evil{i}.com"}).data for i in range(6)]
    assert renders == ["evil0.com", "evil1.com", None]       # two per second, then one generic
    assert images[2] == images[3] == images[5] != images[0]
    assert all(Image.open(io.BytesIO(png)).size == (1072, 1448) for png in images)
    clock.advance(1)
    get(c, "/kindle.png", headers={"Host": "evil6.com"})
    assert renders[-1] == "evil6.com"                         # a new second, a new render
    assert get(c, "/kindle.png", headers={"Host": "evil0.com"}).data == images[0]   # still cached


def test_rejected_host_log_lines_are_rate_limited(app, rendered, clock, caplog):
    c = client(app)
    with caplog.at_level(logging.WARNING):
        for i in range(5):
            get(c, "/kindle.png", headers={"Host": f"evil{i}.com"})
        assert caplog.text.count(EN("admin.log_host_rejected", host="evil0.com")) == 1
        assert "evil1.com" not in caplog.text and "evil4.com" not in caplog.text
        clock.advance(60)
        get(c, "/kindle.png", headers={"Host": "late.example"})
    assert EN("admin.log_host_rejected_more", n=4) in caplog.text
    assert EN("admin.log_host_rejected", host="late.example") in caplog.text


def test_the_kindles_own_host_keeps_its_image_during_a_flood(app, rendered, clock):
    c = client(app)
    kindle = get(c, "/kindle.png", headers={"Host": "door.example"}).data
    for i in range(10):
        get(c, "/kindle.png", headers={"Host": f"evil{i}.com"})
    assert get(c, "/kindle.png", headers={"Host": "door.example"}).data == kindle


def test_admin_bad_host_is_400_text(app):
    c = logged_in(app)
    r = get(c, "/", headers={"Host": "evil.com"})
    assert r.status_code == 400 and r.mimetype == "text/plain"
    assert r.get_data(as_text=True).strip() == EN("admin.bad_host")
    r = get(client(app), "/login", headers={"Host": "rebind.example"})
    assert r.status_code == 400


def test_allowed_hosts_from_config(tmp_path, clock):
    app = make_app(make_state(tmp_path, admin={"allowed_hosts": ["door.example"]}), clock)
    assert get(client(app), "/login", headers={"Host": "door.example:8000"}).status_code == 200


def test_missing_host_is_rejected(app):
    r = client(app).get("/login", base_url=BASE, environ_overrides={"HTTP_HOST": ""})
    assert r.status_code == 400


# --- login ------------------------------------------------------------------------------------

def test_login_page_sets_a_double_submit_cookie(app):
    c = client(app)
    r = get(c, "/login")
    assert r.status_code == 200
    token = cookie(c, "inkdoor_login", path="/login")
    assert token is not None and token.value in r.get_data(as_text=True)
    header = [h for h in r.headers.getlist("Set-Cookie") if h.startswith("inkdoor_login=")][0]
    assert "HttpOnly" in header and "SameSite=Strict" in header and "Path=/login" in header
    assert cookie(c, "session") is None  # Flask's signed cookie is never used


def test_login_flow_rotates_session_and_respects_next(app, clock):
    c = client(app)
    r = login(c, next_="/calendars")
    assert r.status_code == 302 and r.headers["Location"] == "/calendars"
    header = [h for h in r.headers.getlist("Set-Cookie") if h.startswith("inkdoor_session=")][0]
    for part in ("HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=604800"):
        assert part in header
    assert "Secure" not in header
    first = cookie(c, "inkdoor_session").value
    assert get(c, "/").status_code == 200

    clock.advance(1)  # log in again from the same, still logged-in browser (e.g. an old tab)
    c.set_cookie("inkdoor_login", "same-token", domain="192.168.0.50", path="/login")
    r = post(c, "/login", data={"csrf": "same-token", "password": PASSWORD, "next": "//evil.com"})
    assert r.headers["Location"] == "/"
    second = cookie(c, "inkdoor_session").value
    assert second != first
    sessions = app.extensions["inkdoor"]["sessions"]
    assert sessions.get(first) is None and sessions.get(second) is not None

    for bad in ["https://evil.com", "/\\evil.com", "\\\\evil.com", "/\t/evil.com", "evil", ""]:
        clock.advance(1)
        assert login(client(app), next_=bad).headers["Location"] == "/", bad


def test_login_next_is_carried_from_the_redirect(app):
    c = client(app)
    page = get(c, "/login?next=/tasks").get_data(as_text=True)
    assert 'name="next" value="/tasks"' in page


def test_login_without_matching_token_is_refused(app):
    c = client(app)
    login_token(c)
    r = post(c, "/login", data={"csrf": "forged", "password": PASSWORD})
    assert r.status_code == 400 and cookie(c, "inkdoor_session") is None
    r = post(client(app), "/login", data={"csrf": "x", "password": PASSWORD})
    assert r.status_code == 400


def test_login_checks_origin(app):
    c = client(app)
    data = {"csrf": login_token(c), "password": PASSWORD}
    assert post(c, "/login", data=data, headers={"Origin": "http://evil.com"}).status_code == 403
    assert post(c, "/login", data=data, headers={"Origin": "null"}).status_code == 403
    r = post(c, "/login", data=data, headers={"Origin": "http://192.168.0.50:8000"})
    assert r.status_code == 302


def test_wrong_password_shows_message(app):
    r = login(client(app), password="nope")
    assert r.status_code == 401 and EN("admin.wrong_password") in r.get_data(as_text=True)


def test_capitalized_generated_password_is_accepted(tmp_path, clock):
    app = make_app(make_state(tmp_path, password="k7mq-x3vt-9hwp-r2nd"), clock)
    assert login(client(app), password="K7mq-x3vt-9hwp-r2nd").status_code == 302


def test_wrong_password_backoff_and_check_before_scrypt(app, clock, monkeypatch):
    calls = []
    real = auth._scrypt
    monkeypatch.setattr(auth, "_scrypt", lambda *a, **k: calls.append(1) or real(*a, **k))
    c = client(app)
    for _ in range(5):
        assert login(c, password="wrong").status_code == 401
        clock.advance(2)
    assert len(calls) == 5

    r = login(c)  # sixth attempt, correct password, but this IP has to wait a minute
    assert r.status_code == 429 and len(calls) == 5
    wait = EN("admin.wait_seconds", n=58)  # a minute from the last failure, 2 s ago
    assert EN("admin.try_again", wait=wait) in r.get_data(as_text=True)

    clock.advance(60)
    assert login(c).status_code == 302 and len(calls) == 6


def test_global_pace_applies_before_scrypt(app, clock, monkeypatch):
    calls = []
    real = auth._scrypt
    monkeypatch.setattr(auth, "_scrypt", lambda *a, **k: calls.append(1) or real(*a, **k))
    a, b = client(app), client(app)
    a.environ_base["REMOTE_ADDR"] = "192.168.0.10"
    b.environ_base["REMOTE_ADDR"] = "192.168.0.11"
    ta, tb = login_token(a), login_token(b)
    assert post(a, "/login", data={"csrf": ta, "password": "x"}).status_code == 401
    r = post(b, "/login", data={"csrf": tb, "password": PASSWORD})
    assert r.status_code == 429 and len(calls) == 1
    assert EN("admin.wait_seconds", n=1) in r.get_data(as_text=True)
    clock.advance(1)
    assert login(b).status_code == 302


def test_missing_password_file_fails_closed(tmp_path, clock, monkeypatch):
    app = make_app(make_state(tmp_path, password=None), clock)
    calls = []
    monkeypatch.setattr(auth, "_scrypt", lambda *a, **k: calls.append(1))
    c = client(app)
    page = get(c, "/login").get_data(as_text=True)
    assert EN("admin.no_password") in page
    for pw in ["", PASSWORD, "anything"]:
        r = login(c, password=pw)
        assert r.status_code == 503 and EN("admin.no_password") in r.get_data(as_text=True)
    assert cookie(c, "inkdoor_session") is None and calls == []


def test_corrupt_password_file_fails_closed(state, app):
    with open(auth.password_path(state.config_path), "w") as f:
        f.write("plain-text-password\n")
    r = login(client(app), password="plain-text-password")
    assert r.status_code == 503


def test_logged_in_user_visiting_login_goes_home(app):
    c = logged_in(app)
    r = get(c, "/login")
    assert r.status_code == 302 and r.headers["Location"] == "/"


# --- sessions and CSRF ------------------------------------------------------------------------

def test_csrf_and_origin(app):
    s = logged_in(app)
    assert post(s, "/logout").status_code == 403                                     # no token
    assert post(s, "/logout", data={"csrf": "wrong"}).status_code == 403
    assert post(s, "/logout", data={"csrf": "ü"}).status_code == 403                 # never a 500
    assert post(s, "/logout", data={"csrf": s.csrf},
                headers={"Origin": "null"}).status_code == 403
    assert post(s, "/logout", data={"csrf": s.csrf},
                headers={"Origin": "http://evil.com"}).status_code == 403
    assert post(s, "/logout", data={"csrf": s.csrf},
                headers={"Origin": "http://192.168.0.50:8001"}).status_code == 403
    assert post(s, "/logout", data={"csrf": s.csrf},
                headers={"Origin": "https://192.168.0.50:8000"}).status_code == 403
    assert get(s, "/").status_code == 200  # still logged in after the refusals
    r = post(s, "/logout", data={"csrf": s.csrf}, headers={"Origin": "http://192.168.0.50:8000"})
    assert r.status_code == 302 and r.headers["Location"] == "/login"
    assert get(s, "/").status_code == 302


def test_origin_default_port_is_normalized(tmp_path, clock):
    app = make_app(make_state(tmp_path), clock)
    s = app.test_client()
    data = {"csrf": login_token_at(s, "http://inkdoor.lan"), "password": PASSWORD}
    r = s.post("/login", base_url="http://inkdoor.lan", data=data,
               headers={"Origin": "http://inkdoor.lan:80"})
    assert r.status_code == 302


def login_token_at(c, base):
    page = c.get("/login", base_url=base).get_data(as_text=True)
    return re.search(r'name="csrf" value="([^"]+)"', page).group(1)


def test_logout_requires_post(app):
    s = logged_in(app)
    assert get(s, "/logout").status_code == 404
    assert get(s, "/").status_code == 200


def test_csrf_field_is_in_logged_in_pages(app):
    s = logged_in(app)
    page = get(s, "/").get_data(as_text=True)
    assert f'name="csrf" value="{s.csrf}"' in page


def test_expired_session_post_is_refused_and_writes_nothing(tmp_path, clock):
    state = make_state(tmp_path)
    app = make_app(state, clock)
    target = tmp_path / "written"

    @app.post("/write-something")
    def write_something():
        target.write_text("x")
        return "ok"

    s = logged_in(app)
    clock.advance(7 * 86400 + 1)
    r = post(s, "/write-something", data={"csrf": s.csrf})
    assert r.status_code == 401 and not target.exists()
    assert get(s, "/").status_code == 302


def test_session_lasts_seven_days(app, clock):
    s = logged_in(app)
    clock.advance(7 * 86400 - 10)
    assert get(s, "/").status_code == 200


def test_password_file_change_logs_everyone_out(app, state):
    a, b = logged_in(app), logged_in(app)
    assert get(a, "/").status_code == 200
    auth.set_password(auth.password_path(state.config_path), "another-test-pass")
    assert get(a, "/").status_code == 302
    assert get(b, "/").status_code == 302
    app.test_clock.advance(1)
    assert login(client(app), password="another-test-pass").status_code == 302


def test_notices_are_shown_once(app):
    from inkdoor.web import add_notice
    s = logged_in(app)
    sid = cookie(s, "inkdoor_session").value
    session = app.extensions["inkdoor"]["sessions"].get(sid)
    with app.test_request_context():
        add_notice(session, "Saved <b>now</b>")
    assert "Saved &lt;b&gt;now&lt;/b&gt;" in get(s, "/").get_data(as_text=True)
    assert "Saved" not in get(s, "/").get_data(as_text=True)
    assert "notices" not in repr(session)


# --- headers, errors, pages -------------------------------------------------------------------

def test_security_headers(app):
    s = logged_in(app)
    for r in [get(client(app), "/login"), get(client(app), "/nope"), get(s, "/"),
              post(client(app), "/logout"), get(client(app), "/static/admin.css")]:
        assert r.headers["Content-Security-Policy"] == CSP
        assert r.headers["X-Content-Type-Options"] == "nosniff"
        assert r.headers["Referrer-Policy"] == "same-origin"
        assert r.headers["Cache-Control"] == "no-store"


def test_404_page_is_translated(app):
    r = get(client(app), "/nope")
    assert r.status_code == 404 and EN("admin.error_404") in r.get_data(as_text=True)


def test_pages_have_no_inline_scripts_or_styles(app, rendered):
    s = logged_in(app)
    pages = [get(client(app), "/login"), get(s, "/"), get(client(app), "/nope"),
             get(s, "/calendars"), get(s, "/calendars/new"), get(s, "/tasks"),
             get(s, "/screen"), get(s, "/account")]
    for page in pages:
        html = page.get_data(as_text=True)
        scripts = re.findall(r"<script\b[^>]*>.*?</script>", html, re.S)
        assert scripts == ['<script src="/static/admin.js" defer></script>']
        assert html.count("<script") == 1
        assert "style=" not in html and "<style" not in html
        assert not re.search(r"<[^>]*\son[a-z]+=", html, re.I)  # no inline handlers
        # no external resources; the only outside links are anchors to the project's own docs
        for tag, url in re.findall(r"""<([a-z]+)\b[^>]*\s(?:src|href|action)=["']?(?:https?:)?//([^"' >]*)""",
                                   html, re.I):
            assert tag.lower() == "a" and url.startswith("github.com/frkey/inkdoor/blob/master/docs/"), url


def test_home_shows_status_and_preview(app, state, rendered):
    import datetime as dt
    state.last_render = RenderInfo(dt.datetime(2026, 10, 14, 16, 30), "In a meeting",
                                   "until 5:00 PM", ["Work"])
    page = get(logged_in(app), "/").get_data(as_text=True)
    assert "In a meeting" in page and "until 5:00 PM" in page and "Work" in page
    assert re.search(r'<img src="/kindle.png\?t=\d+"', page)
    for item in ("nav.home", "nav.calendars", "nav.tasks", "nav.screen", "nav.account"):
        assert EN(f"admin.{item}") in page


def test_pages_follow_the_configured_language(tmp_path, clock):
    app = make_app(make_state(tmp_path, display={"language": "pt-BR"}), clock)
    page = get(client(app), "/login").get_data(as_text=True)
    assert Translator("pt-BR")("admin.login_title") in page and 'lang="pt-BR"' in page


def test_language_override_wins(tmp_path, clock):
    state = make_state(tmp_path)
    state.language = "pt-BR"
    page = get(client(make_app(state, clock)), "/login").get_data(as_text=True)
    assert Translator("pt-BR")("admin.login_title") in page


def test_admin_disabled_serves_only_kindle(app_disabled, tmp_path):
    c = client(app_disabled)
    Image.new("L", (8, 8), 255).save(tmp_path / "out" / "kindle.png")
    assert get(c, "/kindle.png").status_code == 200
    for path in ["/", "/login", "/static/admin.css", "/static/fonts/Inter-Medium.otf", "/nope"]:
        assert get(c, path).status_code == 404, path
    assert post(c, "/login", data={"password": PASSWORD}).status_code == 404
    assert post(c, "/logout").status_code == 404
    r = get(c, "/kindle.png", headers={"Host": "evil.com"})
    assert r.status_code == 200 and r.data != (tmp_path / "out" / "kindle.png").read_bytes()
    # an admin that is off must not answer with the "open the admin by IP" text
    for path in ["/", "/login", "/static/admin.css", "/nope"]:
        r = get(c, path, headers={"Host": "evil.com"})
        assert r.status_code == 404 and EN("admin.bad_host") not in r.get_data(as_text=True)


def test_options_is_404_even_on_a_route_that_lists_it(tmp_path, clock):
    app = make_app(make_state(tmp_path), clock)

    @app.route("/with-options", methods=["GET", "OPTIONS"])
    def with_options():
        return "ok"

    s = logged_in(app)
    for c in (client(app), s):
        for path in ["/with-options", "/kindle.png", "/login", "/static/admin.css", "/"]:
            assert c.open(path, method="OPTIONS", base_url=BASE).status_code == 404, path


def test_every_unsafe_method_needs_origin_and_token(tmp_path, clock):
    app = make_app(make_state(tmp_path), clock)
    target = tmp_path / "written"

    @app.route("/change", methods=["PUT", "PATCH", "DELETE"])
    def change():
        target.write_text(request_method())
        return "ok"

    s = logged_in(app)
    for method in ("PUT", "PATCH", "DELETE"):
        send = lambda **kw: s.open("/change", method=method, base_url=BASE, **kw)
        assert send().status_code == 403
        assert send(data={"csrf": "wrong"}).status_code == 403
        assert send(data={"csrf": s.csrf}, headers={"Origin": "http://evil.com"}).status_code == 403
        assert not target.exists()
        assert send(data={"csrf": s.csrf}).status_code == 200
        assert target.read_text() == method
        target.unlink()
        assert client(app).open("/change", method=method, base_url=BASE).status_code == 401


def request_method():
    from flask import request
    return request.method


def test_failing_error_handler_still_logs_type_only(tmp_path, clock, caplog):
    app = make_app(make_state(tmp_path), clock)
    app.testing = False  # let Flask's last-resort handler run, as in production

    @app.get("/explode")
    def explode():
        raise ValueError("FIRSTCANARY")

    @app.errorhandler(ValueError)
    def broken_handler(e):
        raise RuntimeError("SECONDCANARY")

    s = logged_in(app)
    with caplog.at_level(logging.DEBUG):
        r = get(s, "/explode")
    assert r.status_code == 500
    assert "RuntimeError" in caplog.text
    for secret in ("FIRSTCANARY", "SECONDCANARY", "Traceback"):
        assert secret not in caplog.text and secret not in r.get_data(as_text=True)


def test_500_logs_type_only(tmp_path, clock, caplog):
    app = make_app(make_state(tmp_path), clock)

    @app.get("/explode")
    def explode():
        raise ValueError("SECRETCANARY")

    s = logged_in(app)
    with caplog.at_level(logging.DEBUG):
        r = get(s, "/explode")
    assert r.status_code == 500
    body = r.get_data(as_text=True)
    assert EN("admin.error_500") in body and "SECRETCANARY" not in body
    assert "ValueError" in caplog.text and "SECRETCANARY" not in caplog.text
    assert "Traceback" not in caplog.text
    assert r.headers["Content-Security-Policy"] == CSP


def test_oversized_post_is_refused(app):
    r = post(client(app), "/login", data={"password": "x" * (2 * 1024 * 1024)})
    assert r.status_code == 413


# --- state ------------------------------------------------------------------------------------

def test_request_render_throttles_manual_requests(tmp_path):
    clock = FakeClock()
    state = ServerState(str(tmp_path / "c.toml"), str(tmp_path), None, with_defaults({}),
                        None, True, clock=clock)
    assert state.request_render() and state.render_event.is_set()
    state.render_event.clear()
    assert state.request_render(manual=True) and state.render_event.is_set()
    state.render_event.clear()
    clock.advance(29)
    assert state.request_render(manual=True) is False and not state.render_event.is_set()
    assert state.request_render() is True  # saves are never throttled
    clock.advance(1)
    assert state.request_render(manual=True) is True


def test_server_state_repr_hides_the_config(tmp_path):
    state = make_state(tmp_path, calendar=[{"name": "W", "url": "https://calendar.example/SECRET"}])
    assert "SECRET" not in repr(state)


def test_login_limit_ignores_wall_clock_steps(state):
    """Sessions follow the wall clock, the login limit a monotonic one: setting the system clock
    back must not lock everyone out."""
    wall, mono = FakeClock(), FakeClock()
    app = create_app(state, clock=wall, monotonic=mono)
    app.testing = True
    c = client(app)
    assert login(c, password="wrong-password").status_code == 401
    wall.advance(-3600)                       # e.g. NTP corrects a clock that ran an hour ahead
    mono.advance(1)
    assert app.extensions["inkdoor"]["limiter"].retry_after("10.0.0.9") == 0
    mono.advance(1)
    assert login(c).status_code == 302


def test_default_clocks(state):
    import time
    app = create_app(state)
    assert app.extensions["inkdoor"]["limiter"]._clock is time.monotonic
    assert app.extensions["inkdoor"]["sessions"]._clock is time.time


def test_state_has_no_unused_write_lock():
    """Config writes are serialized inside config_edit (its own lock), not by the state."""
    import dataclasses
    assert "write_lock" not in {f.name for f in dataclasses.fields(ServerState)}


# --- KPM repository ---------------------------------------------------------------------------

def test_kpm_repository_is_public_and_points_at_the_address_the_kindle_used(app):
    import json
    import tarfile
    r = get(client(app), "/kpm.json")
    assert r.status_code == 200 and r.mimetype == "application/json"
    assert json.loads(r.data)["packages"]["inkdoor"]["artifacts"][0]["url"] == "kpm/inkdoor.kpkg"
    r = client(app).get("/kpm/inkdoor.kpkg", base_url="http://192.168.0.77:3667")
    assert r.status_code == 200 and r.mimetype == "application/gzip"
    assert r.headers["Cache-Control"] == "no-store"
    archive = tarfile.open(fileobj=io.BytesIO(r.data))
    config_sh = archive.extractfile("payload/inkdoor/config.sh").read().decode()
    assert 'URL="http://192.168.0.77:3667/kindle.png"' in config_sh


def test_kpm_repository_needs_an_allowed_host_and_the_admin(app, app_disabled):
    assert get(client(app), "/kpm.json", headers={"Host": "evil.example"}).status_code == 400
    for path in ("/kpm.json", "/kpm/inkdoor.kpkg"):
        assert get(client(app_disabled), path).status_code == 404


def test_kpm_repository_is_absent_without_the_kindle_scripts(app, monkeypatch):
    from inkdoor import kindle_files
    monkeypatch.setattr(kindle_files, "find_dir", lambda: None)
    for path in ("/kpm.json", "/kpm/inkdoor.kpkg"):
        assert get(client(app), path).status_code == 404


def test_kindle_png_says_when_to_come_back(app, state, clock, rendered):
    c = client(app)
    assert "X-Inkdoor-Next" not in get(c, "/kindle.png").headers     # nothing scheduled yet
    state.next_render_at, state.render_seconds = clock.now + 100, 2.4
    assert get(c, "/kindle.png").headers["X-Inkdoor-Next"] == "108"   # 100 + 2.4 + 5, rounded up
    state.next_render_at = clock.now - 50                               # a render running late
    assert get(c, "/kindle.png").headers["X-Inkdoor-Next"] == "8"
    state.next_render_at = clock.now + 10 ** 9
    assert get(c, "/kindle.png").headers["X-Inkdoor-Next"] == "86400"


def test_rejected_host_image_follows_the_screen_size(app, state, rendered):
    c = client(app)
    first = get(c, "/kindle.png", headers={"Host": "evil.com"}).data
    state.cfg["display"]["screen"] = "600x800"
    again = get(c, "/kindle.png", headers={"Host": "evil.com"}).data
    assert Image.open(io.BytesIO(first)).size == (1072, 1448)
    assert Image.open(io.BytesIO(again)).size == (600, 800)


def _is_stale_screen(data: bytes) -> bool:
    return Image.open(io.BytesIO(data)).size == (1072, 1448)          # not the 8x8 test image


def test_kindle_png_is_replaced_when_the_render_loop_is_stuck(app, state, clock, rendered):
    import os
    os.utime(rendered, (clock.now, clock.now))
    c = client(app)
    state.next_render_at = clock.now - state.STALE_AFTER + 60       # late, but within the margin
    assert not _is_stale_screen(get(c, "/kindle.png").data)
    state.next_render_at = clock.now - state.STALE_AFTER - 60       # far past its render
    assert _is_stale_screen(get(c, "/kindle.png").data)


def test_kindle_png_from_an_earlier_run_is_replaced_when_old(app, state, clock, rendered):
    import os
    c = client(app)
    refresh = state.cfg["server"]["refresh_minutes"] * 60
    os.utime(rendered, (clock.now - refresh, clock.now - refresh))   # a restart a while ago
    assert not _is_stale_screen(get(c, "/kindle.png").data)
    old = clock.now - refresh - state.STALE_AFTER - 60               # the server was down
    os.utime(rendered, (old, old))
    assert _is_stale_screen(get(c, "/kindle.png").data)
