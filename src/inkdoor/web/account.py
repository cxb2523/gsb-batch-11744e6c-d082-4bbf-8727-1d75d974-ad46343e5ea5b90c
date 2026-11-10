"""The Account page: changing the admin password (next to the login, in ``web/__init__``)."""
from __future__ import annotations

from flask import (Blueprint, abort, current_app, g, make_response, redirect, render_template,
                   request)

from . import (MAX_PASSWORD_LENGTH, SESSION_COOKIE, SESSION_LIFETIME, add_notice, auth,
               check_password, wait_text)
from .editing import Editor

PASSWORD_MIN = 12


def register(bp: Blueprint, ed: Editor) -> None:
    state, t = ed.state, ed.t

    def account_page(errors=None, form_error=None, generated=None, status=200):
        body = render_template("account.html", active="account", errors=errors or {},
                               form_error=form_error, generated=generated,
                               min_length=PASSWORD_MIN)
        return make_response(body, status)

    @bp.get("/account")
    def account():
        return account_page()

    @bp.post("/account/password")
    def account_password():
        inkdoor = current_app.extensions["inkdoor"]
        sessions, limiter = inkdoor["sessions"], inkdoor["limiter"]
        password_file = auth.password_path(state.config_path)
        generate = request.form.get("generate") == "1"
        current = request.form.get("current", "")
        new = auth.generate_password() if generate else request.form.get("new", "")
        if not generate:  # checked before scrypt: a refused new password costs nothing
            if len(new) > MAX_PASSWORD_LENGTH:
                return account_page({"new": t()("admin.error_too_long", n=MAX_PASSWORD_LENGTH)})
            if auth.password_length(new) < PASSWORD_MIN:
                return account_page({"new": t()("admin.error_password_short", n=PASSWORD_MIN)})
        generation = sessions.generation  # before the hash is read, as the login does
        encoded = auth.read_password_hash(password_file)
        if encoded is None:  # fail closed, as the login does
            return account_page(form_error=t()("admin.no_password"), status=503)
        ok, wait = check_password(limiter, current, encoded)  # the login's limit, before scrypt
        if wait > 0:
            return account_page(form_error=t()("admin.try_again", wait=wait_text(t(), wait)),
                                status=429)
        if not ok:
            return account_page({"current": t()("admin.wrong_current_password")})
        with inkdoor["password_lock"]:  # compare, write, log out and log in again as one step
            if inkdoor["watcher"].changed():  # changed while scrypt ran, e.g. `inkdoor password`
                sessions.drop_all()
            if sessions.generation != generation:  # everyone, this browser too, was logged out
                abort(401)  # e.g. another browser changed the password first
            try:
                auth.set_password(password_file, new)
            except OSError as ex:
                return account_page(form_error=t()("admin.error_password_write",
                                                   error=type(ex).__name__), status=500)
            # every browser is logged out; this one gets a fresh session. The watcher is told
            # about the new file first, or the next request would see the change and drop that
            # session too; drop_all also ends the generation, so a login still checking the old
            # password gets none
            inkdoor["watcher"].changed()
            sessions.drop_all()
            session = sessions.create()
        limiter.succeeded(request.remote_addr or "")
        g.session = session  # the page below carries the new session's CSRF token
        if generate:  # shown in this response only: never in a redirect, notice or log
            response = account_page(generated=new)
        else:
            add_notice(session, t()("admin.password_changed"))
            response = redirect("/account", 303)
        response.set_cookie(SESSION_COOKIE, session.sid, max_age=SESSION_LIFETIME, path="/",
                            httponly=True, samesite="Strict")
        return response
