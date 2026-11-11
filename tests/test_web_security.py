"""The /security page: live login-security status (limiter, sessions, login results)."""
import re

import pytest

from inkdoor.web import auth
from web_helpers import (BASE, CSP, EN, PASSWORD, FakeClock, client, cookie, get, logged_in,
                         login, login_token, make_app, make_state, post)


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def app(tmp_path, clock):
    return make_app(make_state(tmp_path), clock)


def stats(app):
    return app.extensions["inkdoor"]["login_stats"].snapshot()


def stat(page, name):
    """A number shown on the page, by its data-stat marker."""
    match = re.search(r'data-stat="%s">(\d+)<' % name, page)
    assert match, name
    return int(match.group(1))


# --- access -----------------------------------------------------------------------------------

def test_anonymous_get_redirects_to_login_with_next(app):
    r = get(client(app), "/security")
    assert r.status_code == 302 and r.headers["Location"] == "/login?next=%2Fsecurity"


def test_post_without_csrf_is_403(app):
    c = logged_in(app)
    assert post(c, "/security").status_code == 403
    assert post(c, "/security", data={"csrf": "wrong"}).status_code == 403
    assert post(c, "/security", data={"csrf": c.csrf}).status_code == 200


def test_security_headers_and_no_secrets_on_the_page(app):
    c = logged_in(app)
    r = get(c, "/security")
    assert r.status_code == 200
    assert r.headers["Content-Security-Policy"] == CSP
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["Cache-Control"] == "no-store"
    page = r.get_data(as_text=True)
    assert EN("admin.security_title") in page
    assert PASSWORD not in page and "scrypt$" not in page
    assert cookie(c, "inkdoor_session").value not in page
    # the only CSRF token on the page is the logout form's, as on every admin page: the
    # security counters add no form and no token of their own
    assert page.count(c.csrf) == 1


# --- the counters -----------------------------------------------------------------------------

def test_counts_follow_failed_and_successful_logins(app, clock):
    c = logged_in(app)  # one success already
    assert stats(app)["success"] == 1
    other = client(app)
    clock.advance(1)
    assert login(other, password="wrong").status_code == 401
    clock.advance(1)
    assert login(other).status_code == 302
    counts = stats(app)
    assert counts["wrong_password"] == 1 and counts["success"] == 2

    page = get(c, "/security").get_data(as_text=True)
    assert stat(page, "login-success") == 2
    assert stat(page, "login-wrong-password") == 1
    assert stat(page, "login-throttled") == 0


def test_throttled_logins_are_counted_and_backoff_is_shown(app, clock):
    c = logged_in(app)
    other = client(app)
    for _ in range(5):
        clock.advance(2)
        assert login(other, password="wrong").status_code == 401
    clock.advance(2)
    assert login(other, password="wrong").status_code == 429  # the IP is held back now
    counts = stats(app)
    assert counts["wrong_password"] == 5 and counts["throttled"] == 1

    page = get(c, "/security").get_data(as_text=True)
    assert stat(page, "waiting-ips") == 1
    assert stat(page, "login-throttled") == 1
    wait = re.search(r'data-stat="max-wait">([^<]+)<', page).group(1)
    assert wait == EN("admin.wait_seconds", n=58)  # a minute from the last failure, 2 s ago

    # watching the page while the limiter holds the IP back changes nothing
    for _ in range(3):
        assert get(c, "/security").status_code == 200
    assert stats(app) == counts
    assert app.extensions["inkdoor"]["limiter"].backoff()[0] == 1


def test_security_page_takes_no_login_slot(app, clock):
    c = logged_in(app)
    before = stats(app)
    clock.advance(1)
    for _ in range(3):
        assert get(c, "/security").status_code == 200
    assert stats(app) == before
    # the global one-per-second slot is still free: a login right now is not throttled
    assert login(client(app)).status_code == 302


def test_missing_password_file_is_counted(tmp_path, clock):
    app = make_app(make_state(tmp_path, password=None), clock)
    assert login(client(app), password="anything").status_code == 503
    assert stats(app)["no_password"] == 1


def test_generation_conflict_is_counted(app, monkeypatch):
    c = client(app)
    token = login_token(c)
    sessions = app.extensions["inkdoor"]["sessions"]
    real = auth.verify_password

    def changed_midway(password, encoded):
        sessions.drop_all()  # the password changed while scrypt ran
        return real(password, encoded)

    monkeypatch.setattr(auth, "verify_password", changed_midway)
    r = post(c, "/login", data={"csrf": token, "password": PASSWORD})
    assert r.status_code == 409
    assert stats(app)["generation_conflict"] == 1
    assert stats(app)["success"] == 0


# --- sessions and generations -----------------------------------------------------------------

def test_password_change_bumps_generation_and_sessions_fall_back(app, clock):
    a = logged_in(app)
    clock.advance(1)
    assert login(client(app)).status_code == 302  # a second browser
    sessions = app.extensions["inkdoor"]["sessions"]
    generation, active = sessions.stats()
    assert active == 2

    clock.advance(1)
    r = post(a, "/account/password",
             data={"csrf": a.csrf, "current": PASSWORD, "new": "brand-new-pass-1"})
    assert r.status_code == 303
    new_generation, active = sessions.stats()
    assert new_generation == generation + 1
    assert active == 1  # everyone was logged out; the changing browser has the one session

    page = get(a, "/security").get_data(as_text=True)  # a got the fresh session's cookie
    assert stat(page, "generation") == new_generation
    assert stat(page, "active-sessions") == 1
