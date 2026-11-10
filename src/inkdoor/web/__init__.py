"""The admin web app and the public Kindle image route.

Every request goes through one guard (``_guard``), in this order:

1. unknown path, a known path with the wrong method, or OPTIONS -> 404, never a redirect;
2. admin disabled -> only ``/kindle.png`` exists;
3. Host allowlist (DNS rebinding): ``/kindle.png`` gets a 200 error image, anything else a 400;
4. public endpoints (``kindle``, ``login``, ``static``, and the KPM repository ``kpm_index``
   and ``kpm_package``) pass; any method other than GET/HEAD must pass the Origin check;
5. a changed password file logs everyone out;
6. a session is required: GET/HEAD redirect to the login page, anything else gets 401;
7. any method other than GET/HEAD: the Origin check and the session's CSRF token.

Session state lives on the server (``auth.Sessions``); Flask's signed-cookie session is never used
and the app has no secret key.
"""
from __future__ import annotations

import hmac
import io
import math
import os
import re
import secrets
import threading
import time
from collections import OrderedDict
from urllib.parse import urlencode

from flask import Flask, abort, g, redirect, render_template, request, send_from_directory
from markupsafe import Markup, escape
from werkzeug.exceptions import HTTPException

from .. import kindle_files
from ..i18n import Translator
from ..render import render_error, render_host_rejected
from ..render import screen_size as render_screen_size
from ..state import IMAGE_NAME, ServerState
from . import auth
from .hosts import host_allowed

SESSION_COOKIE = "inkdoor_session"
LOGIN_COOKIE = "inkdoor_login"
SESSION_LIFETIME = 7 * 86400
SAFE_METHODS = frozenset({"GET", "HEAD"})
# kpm_*: the KPM repository for the Kindle (no secrets: the Kindle scripts and this server's
# address), which KPM fetches without a login
PUBLIC_ENDPOINTS = frozenset({"kindle", "login", "static", "kpm_index", "kpm_package"})
HOST_IMAGE_CACHE = 16
# The Kindle comes back this long after the next render starts: time for that render to finish
# (the last one's duration) plus this margin. Header: "X-Inkdoor-Next: <seconds>".
NEXT_HEADER = "X-Inkdoor-Next"
NEXT_MARGIN = 5
NEXT_MAX = 86400
# Rejected hosts: renders of new names per second (the rest get one generic image per language),
# and log lines per minute (the rest are counted in the next line)
HOST_RENDERS_PER_SECOND = 2
HOST_LOGS_PER_MINUTE = 1
MAX_PASSWORD_LENGTH = 1024
MAX_REQUEST_BYTES = 1024 * 1024

CSP = ("default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; "
       "form-action 'self'; base-uri 'none'")
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "Cache-Control": "no-store",
}

_HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(_HERE, "static")
FONTS_DIR = os.path.join(os.path.dirname(_HERE), "fonts")
# only the bundled font files are served from /static/fonts/, never the rest of the folder
FONT_FILES = frozenset(f for f in os.listdir(FONTS_DIR) if f.endswith(".otf"))
_ERROR_CODES = frozenset({400, 401, 403, 404, 413, 500})


def translator(state: ServerState) -> Translator:
    display = state.cfg.get("display", {}) if isinstance(state.cfg, dict) else {}
    return Translator(state.language or display.get("language"), display.get("clock"))


def _allowed_hosts(state: ServerState) -> list:
    admin = state.cfg.get("admin") if isinstance(state.cfg, dict) else None
    hosts = admin.get("allowed_hosts") if isinstance(admin, dict) else None
    return hosts if isinstance(hosts, list) else []


def add_notice(session: auth.Session, message: str) -> None:
    """Queues a one-shot message shown on the next page this browser loads."""
    session.notices.append(message)


def pop_notices(session: auth.Session | None) -> list[str]:
    messages = []
    if session is not None:
        while session.notices:
            try:
                messages.append(session.notices.pop(0))
            except IndexError:  # another request of the same browser took it
                break
    return messages


def safe_next(value: str | None) -> str:
    """A local path to go to after login; anything that could leave the site becomes "/"."""
    if not value or not value.startswith("/") or value.startswith("//"):
        return "/"
    if "\\" in value or any(ord(c) < 0x21 or ord(c) == 0x7F for c in value):
        return "/"  # browsers drop tabs and newlines and read "\" as "/": "/\t/evil.com"
    return value


def wait_text(t: Translator, seconds: float) -> str:
    """How long to wait before the next password attempt, for a message."""
    if seconds < 60:
        return t("admin.wait_seconds", n=max(1, math.ceil(seconds)))
    return t.duration(math.ceil(seconds / 60))


def check_password(limiter: auth.LoginLimiter, password, encoded: str) -> tuple[bool, float]:
    """Checks a password under the login limit: (ok, wait). ``wait`` > 0 means it was not checked.

    The attempt is reserved before scrypt runs (once per attempt: ``retry_after`` takes the global
    slot). A failure is always recorded, even if checking raises; a success is not: the caller
    calls ``limiter.succeeded`` once the login or change really went through, so a password that
    matched a hash replaced meanwhile (a 409) never resets the IP's backoff.
    """
    ip = request.remote_addr or ""
    wait = limiter.retry_after(ip)
    if wait > 0:
        return False, wait
    ok = False
    try:
        ok = (isinstance(password, str) and len(password) <= MAX_PASSWORD_LENGTH
              and auth.verify_password(password, encoded))
    finally:
        if not ok:
            limiter.failed(ip)
    return ok, 0.0


def _printable(text: str, limit: int = 60) -> str:
    """A Host header that is safe to put in a log line or on the screen."""
    cleaned = "".join(c if 0x20 < ord(c) < 0x7F else "?" for c in text[:limit])
    return cleaned or "?"


def _origin_matches(origin: str, scheme: str, host: str) -> bool:
    """True when an Origin header names this very scheme, host and port."""
    def normalize(s: str, h: str) -> str:
        s, h = s.lower(), h.lower()
        default = {"http": ":80", "https": ":443"}.get(s)
        if default and h.endswith(default):
            h = h[: -len(default)]
        return f"{s}://{h}"

    other_scheme, sep, other_host = origin.partition("://")
    if not sep or not other_host or "/" in other_host:
        return False
    return normalize(other_scheme, other_host) == normalize(scheme, host)


_BOLD = re.compile(r"\*\*(.+?)\*\*")
DOCS_BASE = "https://github.com/frkey/inkdoor/blob/master/"


def emphasis(text: str) -> Markup:
    """A catalog sentence for a page: escaped, with **menu names** in bold (and nothing else)."""
    return Markup(_BOLD.sub(lambda m: f"<strong>{m.group(1)}</strong>", str(escape(text))))


def docs_url(language: str, page: str) -> str:
    """A user guide on GitHub, in the page's language when it has one (``page`` like "kindle.md")."""
    return DOCS_BASE + ("docs/pt-BR/" if language.startswith("pt") else "docs/") + page


def _same_token(given, expected: str) -> bool:
    if not isinstance(given, str) or not given:
        return False
    return hmac.compare_digest(given.encode("utf-8"), expected.encode("utf-8"))


class _Budget:
    """At most ``limit`` events in each window of ``period`` seconds; counts the refused ones."""

    def __init__(self, limit: int, period: float, monotonic):
        self._limit, self._period, self._monotonic = limit, period, monotonic
        self._window_start: float | None = None
        self._used = 0
        self.refused = 0

    def take(self) -> bool:
        now = self._monotonic()
        if self._window_start is None or now - self._window_start >= self._period:
            self._window_start, self._used = now, 0
        if self._used < self._limit:
            self._used += 1
            return True
        self.refused += 1
        return False


def _png(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


class _App(Flask):
    def log_exception(self, exc_info) -> None:
        """Flask's last resort (an error handler or after_request raised): the type only, never
        the message or traceback, which can carry calendar links."""
        self.logger.error("%s", exc_info[0].__name__ if exc_info[0] else "Exception")


def create_app(state: ServerState, *, clock=time.time, monotonic=time.monotonic) -> Flask:
    """The app. ``clock`` (wall time) dates sessions; ``monotonic`` paces logins, so setting the
    system clock back can never lock everyone out of the admin."""
    app = _App(__name__, static_folder=None, template_folder="templates")
    app.jinja_env.filters["emphasis"] = emphasis
    app.config.update(
        MAX_CONTENT_LENGTH=MAX_REQUEST_BYTES,
        PROVIDE_AUTOMATIC_OPTIONS=False,  # Flask 3.1+; the guard refuses OPTIONS on any version
    )
    sessions = auth.Sessions(clock, lifetime=SESSION_LIFETIME)
    limiter = auth.LoginLimiter(monotonic)
    password_file = auth.password_path(state.config_path)
    watcher = auth.PasswordWatcher(password_file)
    watcher.changed()  # record the file as it is now, so the first change is noticed
    host_images: OrderedDict[tuple, bytes] = OrderedDict()   # (language, size, host)
    # per language and screen size (a few of each), never evicted
    generic_host_images: dict[tuple, bytes] = {}
    stale_images: dict[tuple, bytes] = {}
    host_renders = _Budget(HOST_RENDERS_PER_SECOND, 1.0, monotonic)
    host_logs = _Budget(HOST_LOGS_PER_MINUTE, 60.0, monotonic)
    host_lock = threading.Lock()
    # a password change compares the session generation, writes the file, logs everyone out and
    # makes this browser's new session as one step, so two changes cannot both win
    password_lock = threading.Lock()
    app.extensions["inkdoor"] = {"sessions": sessions, "limiter": limiter, "watcher": watcher,
                                 "host_images": host_images, "password_lock": password_lock}

    def t() -> Translator:
        if "t" not in g:
            g.t = translator(state)
        return g.t

    def page(template: str, status: int = 200, **context):
        return render_template(template, **context), status

    # --- guards -------------------------------------------------------------------------------

    def host_image(raw_host: str) -> bytes:
        """The error image for a rejected host. A client cycling Host values gets at most
        HOST_RENDERS_PER_SECOND renders and HOST_LOGS_PER_MINUTE log lines; the Kindle's own
        host is cached after its first request, so what it receives does not change."""
        shown = _printable(raw_host)
        language = t().language
        # the image depends on the language and the screen size, both of which the admin changes
        look = (language, render_screen_size(state.cfg))
        key = (*look, shown)
        with host_lock:
            png = host_images.get(key)
            if png is not None:
                host_images.move_to_end(key)
                return png
            render = host_renders.take()
            log, skipped = host_logs.take(), host_logs.refused
            if log:
                host_logs.refused = 0
            generic = None if render else generic_host_images.get(look)
        if log:
            if skipped:
                app.logger.warning(t()("admin.log_host_rejected_more", n=skipped))
            app.logger.warning(t()("admin.log_host_rejected", host=shown))
        if generic is not None:
            return generic
        if not render:  # first generic image of this language
            png = _png(render_host_rejected(state.cfg, None))
            with host_lock:
                generic_host_images[look] = png
            return png
        png = _png(render_host_rejected(state.cfg, shown))
        with host_lock:
            host_images[key] = png
            while len(host_images) > HOST_IMAGE_CACHE:
                host_images.popitem(last=False)
        return png

    def stale_image() -> bytes:
        """The error screen served instead of an image that may show an old status."""
        look = (t().language, render_screen_size(state.cfg))
        with host_lock:
            png = stale_images.get(look)
        if png is None:
            png = _png(render_error(state.cfg, t()("status.stalled")))
            with host_lock:
                stale_images[look] = png
        return png

    def origin_ok() -> bool:
        origin = request.headers.get("Origin")
        if origin is None:
            return True
        return _origin_matches(origin.strip(), request.scheme, request.headers.get("Host", ""))

    @app.before_request
    def _guard():
        g.session = None
        # OPTIONS is never answered; checked here so it does not depend on the Flask version
        if request.url_rule is None or request.method == "OPTIONS":
            abort(404)
        if not state.admin_enabled and request.endpoint != "kindle":
            abort(404)  # the admin is off: nothing but the Kindle image exists
        raw_host = request.headers.get("Host")  # raw: Werkzeug's request.host is normalized
        if not host_allowed(raw_host, _allowed_hosts(state)):
            if request.endpoint == "kindle":
                return app.response_class(host_image(raw_host or ""), mimetype="image/png",
                                          headers={"Cache-Control": "no-store"})
            return app.response_class(t()("admin.bad_host") + "\n", status=400,
                                      mimetype="text/plain")
        unsafe = request.method not in SAFE_METHODS
        if request.endpoint in PUBLIC_ENDPOINTS:
            if unsafe and not origin_ok():
                abort(403)
            return None
        if watcher.changed():
            sessions.drop_all()
        session = sessions.get(request.cookies.get(SESSION_COOKIE))
        if session is None:
            if not unsafe:
                return redirect("/login?" + urlencode({"next": request.path}))
            abort(401)
        g.session = session
        if unsafe:
            if not origin_ok() or not _same_token(request.form.get("csrf"), session.csrf):
                abort(403)
        return None

    @app.after_request
    def _headers(response):
        if request.url_rule is not None and request.endpoint == "kindle":
            response.headers["Cache-Control"] = "no-store"
            return response
        for name, value in SECURITY_HEADERS.items():
            response.headers[name] = value
        return response

    @app.context_processor
    def _template_globals():
        session = g.get("session")

        def csrf_field():
            token = session.csrf if session is not None else ""
            return Markup(f'<input type="hidden" name="csrf" value="{escape(token)}">')

        # notices are taken only when a full page calls notices(), never by a fragment
        return {"t": t(), "csrf_field": csrf_field, "logged_in": session is not None,
                "notices": lambda: pop_notices(session),
                "docs_url": lambda page: docs_url(t().language, page)}

    # --- errors -------------------------------------------------------------------------------

    def error_page(code: int):
        key = f"admin.error_{code}" if code in _ERROR_CODES else "admin.error_other"
        try:
            return page("error.html", code, code=code, message=t()(key))
        except Exception:  # never let the error page itself fail with details
            return app.response_class(t()(key) + "\n", status=code, mimetype="text/plain")

    @app.errorhandler(HTTPException)
    def _http_error(e: HTTPException):
        if e.code is None or e.code < 400:
            return e
        return error_page(e.code)

    @app.errorhandler(Exception)
    def _unexpected(e: Exception):
        # only the type: messages and tracebacks can carry calendar links
        app.logger.error(t()("admin.log_error", error=type(e).__name__))
        return error_page(500)

    # --- routes -------------------------------------------------------------------------------

    @app.get("/kindle.png", endpoint="kindle")
    def kindle():
        try:
            with open(os.path.join(state.output_dir, IMAGE_NAME), "rb") as f:
                body = f.read()
                mtime = os.fstat(f.fileno()).st_mtime
        except OSError:
            return app.response_class(t()("admin.not_rendered") + "\n", status=503,
                                      mimetype="text/plain", headers={"Cache-Control": "no-store"})
        if state.image_stale(clock(), mtime):  # the door must not keep an old "Free"
            body = stale_image()
        headers = {"Cache-Control": "no-store"}
        if state.next_render_at is not None:
            wait = max(0.0, state.next_render_at - clock()) + state.render_seconds + NEXT_MARGIN
            headers[NEXT_HEADER] = str(min(NEXT_MAX, math.ceil(wait)))
        return app.response_class(body, mimetype="image/png", headers=headers)

    # --- KPM repository: ";kpm add-repo http://<server>/kpm.json" on the Kindle ----------------

    @app.get("/kpm.json", endpoint="kpm_index")
    def kpm_index():
        if kindle_files.find_dir() is None:
            abort(404)
        body = kindle_files.repository_index(t()("kpm.repo_name"), t()("kpm.description"))
        return app.response_class(body, mimetype="application/json")

    @app.get("/kpm/inkdoor.kpkg", endpoint="kpm_package")
    def kpm_package():
        """The package, with config.sh pointing at the address the Kindle used to reach this
        server (the guard has already checked that Host against the allowlist)."""
        folder = kindle_files.find_dir()
        if folder is None:
            abort(404)
        try:
            data = kindle_files.build_kpkg(folder, f"http://{request.host}/kindle.png",
                                           t().language, t()("kpm.description"))
        except ValueError:  # an address that cannot be written into config.sh
            abort(404)
        return app.response_class(data, mimetype="application/gzip")

    @app.get("/static/<path:filename>", endpoint="static")
    def static(filename: str):
        if filename.startswith("fonts/"):
            name = filename.removeprefix("fonts/")
            if name not in FONT_FILES:
                abort(404)
            return send_from_directory(FONTS_DIR, name)
        return send_from_directory(STATIC_DIR, filename)

    def login_page(status: int = 200, error: str | None = None, next_: str = "/"):
        token = secrets.token_urlsafe(32)
        no_password = auth.read_password_hash(password_file) is None
        body, status = page("login.html", status, token=token, error=error, next=next_,
                            no_password=no_password)
        response = app.make_response((body, status))
        response.set_cookie(LOGIN_COOKIE, token, path="/login", httponly=True, samesite="Strict")
        return response

    @app.route("/login", methods=["GET", "POST"], endpoint="login")
    def login():
        if watcher.changed():  # e.g. `inkdoor password` just ran: old sessions end here too
            sessions.drop_all()
        current = sessions.get(request.cookies.get(SESSION_COOKIE))
        if request.method != "POST":
            if current is not None:
                return redirect("/")
            return login_page(next_=safe_next(request.args.get("next")))

        next_ = safe_next(request.form.get("next"))
        if not _same_token(request.form.get("csrf"), request.cookies.get(LOGIN_COOKIE) or ""):
            return login_page(400, t()("admin.login_expired"), next_)
        generation = sessions.generation  # before the hash is read: see auth.Sessions
        encoded = auth.read_password_hash(password_file)
        if encoded is None:  # fail closed: no file means nobody gets in
            return login_page(503, None, next_)
        ok, wait = check_password(limiter, request.form.get("password", ""), encoded)
        if wait > 0:
            return login_page(429, t()("admin.try_again", wait=wait_text(t(), wait)), next_)
        if not ok:
            return login_page(401, t()("admin.wrong_password"), next_)

        if watcher.changed():  # the file changed while scrypt ran (e.g. `inkdoor password`)
            sessions.drop_all()
        if current is not None:
            sessions.drop(current.sid)  # this browser gets a fresh id
        session = sessions.create(expected_generation=generation)
        if session is None:  # the password changed meanwhile: the checked one may be the old one
            return login_page(409, t()("admin.login_expired"), next_)  # neither success nor failure
        limiter.succeeded(request.remote_addr or "")
        response = redirect(next_)
        response.set_cookie(SESSION_COOKIE, session.sid, max_age=SESSION_LIFETIME, path="/",
                            httponly=True, samesite="Strict")
        response.delete_cookie(LOGIN_COOKIE, path="/login", httponly=True, samesite="Strict")
        return response

    @app.post("/logout", endpoint="logout")
    def logout():
        sessions.drop(g.session.sid)
        response = redirect("/login")
        response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="Strict")
        return response

    from .pages import blueprint  # here: pages imports helpers from this module
    app.register_blueprint(blueprint(state))
    return app
