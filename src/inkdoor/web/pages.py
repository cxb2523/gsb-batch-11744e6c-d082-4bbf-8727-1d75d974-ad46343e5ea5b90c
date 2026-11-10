"""The admin pages: one blueprint for home, calendars, tasks, screen settings and account.

Each page lives in its own module (``home``, ``calendars``, ``screen``, ``account``); what they
share about reading and saving config.toml is in ``editing``.
"""
from __future__ import annotations

from flask import Blueprint

from .. import check as checker
from ..state import ServerState
from . import account, calendars, home, screen
from .calendars import TESTS
from .editing import Editor

# the link-test slots and the checks, under the names they had when every page lived here
__all__ = ["TESTS", "blueprint", "checker"]


def blueprint(state: ServerState) -> Blueprint:
    bp = Blueprint("pages", __name__)
    editor = Editor(state)
    for module in (home, calendars, screen, account):
        module.register(bp, editor)
    return bp
