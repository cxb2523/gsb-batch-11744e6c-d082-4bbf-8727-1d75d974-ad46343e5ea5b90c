"""The Security page: live login-security counters (limiter, sessions, login results).

Everything shown comes from the real ``auth.LoginLimiter``, ``auth.Sessions`` and
``auth.LoginStats`` objects; reading them changes nothing (no rate-limit slot is taken, no
result is counted), so watching the page cannot lock anyone out or skew the numbers.
"""
from __future__ import annotations

import math

from flask import Blueprint, current_app, render_template

from .editing import Editor


def register(bp: Blueprint, ed: Editor) -> None:
    @bp.route("/security", methods=["GET", "POST"])
    def security():
        # POST is accepted (and only renders the page) so that an unsafe method without the
        # session's CSRF token meets the guard's 403 here, as on every other admin page
        inkdoor = current_app.extensions["inkdoor"]
        waiting_ips, max_wait = inkdoor["limiter"].backoff()
        generation, active_sessions = inkdoor["sessions"].stats()
        counts = inkdoor["login_stats"].snapshot()
        return render_template("security.html", active="security", waiting_ips=waiting_ips,
                               max_wait=math.ceil(max_wait), generation=generation,
                               active_sessions=active_sessions, counts=counts)
