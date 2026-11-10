"""What every admin page that edits config.toml shares.

Every page reads config.toml fresh (``config_edit.read_raw``) and every form carries the digest
of the file as it was read, so a form opened before a hand edit (or in another tab) is refused
with "changed elsewhere" and writes nothing. Saves follow POST/redirect/GET and wake the render
loop. Links never leave the server: pages show ``masked``, and the link field is always empty.
"""
from __future__ import annotations

from flask import g, redirect, render_template, request

from .. import config, config_edit
from ..config import is_configured
from ..state import ServerState
from . import add_notice, links, translator


def masked(url) -> str | None:
    """The link as pages may show it, or None when there is no link yet."""
    return links.mask(url) if isinstance(url, str) and is_configured(url) else None


def link_given() -> bool:
    value = request.form.get("url", "")
    return isinstance(value, str) and bool(value.strip())


def confirmed() -> bool:
    return request.form.get("confirmed") == "1"


def confirm_page(question: str, label: str, back: str, active: str):
    """Asks before a removal when the browser did not (no JavaScript); posts back to the same
    address with ``confirmed=1``, under the same CSRF token and file digest."""
    return render_template("confirm.html", active=active, question=question, label=label,
                           back=back, action=request.path,
                           digest=request.form.get("digest", "")), 200


class Editor:
    """config.toml as the admin pages read and save it, with messages in the request's language."""

    def __init__(self, state: ServerState):
        self.state = state

    def t(self):
        if "t" not in g:
            g.t = translator(self.state)
        return g.t

    def describe(self, ex: config.ConfigInvalid) -> str:
        return self.t()(f"config_error.{ex.key}", **ex.details)

    def read(self):
        """(raw, None), or (None, the translated reason the file cannot be read)."""
        try:
            return config_edit.read_raw(self.state.config_path), None
        except config.ConfigInvalid as ex:
            return None, self.describe(ex)

    def invalid(self, data: dict) -> str | None:
        try:
            config_edit.check(data)
        except config.ConfigInvalid as ex:
            return self.describe(ex)
        return None

    def backup_loads(self) -> bool:
        try:
            data, _ = config.read_toml(self.state.config_path + config_edit.BACKUP_SUFFIX)
            config_edit.check(data)
        except (config.ConfigMissing, config.ConfigInvalid):
            return False
        return True

    def restore_offer(self, raw, problem: str | None, warning: str | None) -> str | None:
        """The digest for "Restore previous version", or None when it is not offered: only for
        a broken, invalid or deleted file whose backup would load."""
        if not (problem or warning or (raw is not None and not raw.exists)) \
                or not self.backup_loads():
            return None
        try:
            return config_edit.digest(config.read_bytes(self.state.config_path))
        except config.ConfigMissing:
            return config_edit.digest(b"")
        except config.ConfigInvalid:  # e.g. a permission problem: restoring cannot fix it
            return None

    def changed(self, target: str):
        add_notice(g.session, self.t()("admin.changed_elsewhere"))
        return redirect(target, 303)

    def fresh(self, target: str):
        """(raw, None) when the form was made from the file as it is now, else (None, redirect)."""
        raw, _ = self.read()
        if raw is None:
            return None, redirect(target, 303)  # the page explains what is wrong with the file
        if request.form.get("digest") != raw.digest:
            return None, self.changed(target)
        return raw, None

    def save(self, raw, data: dict, target: str, notice: str = "admin.saved"):
        """(redirect, None) after a save, or (None, a translated reason nothing was written)."""
        t = self.t()
        try:
            config_edit.save(self.state.config_path, data, raw.digest)
        except config_edit.ConfigChanged:
            return self.changed(target), None
        except config_edit.ConfigIsLink:
            return None, t("admin.error_link")
        except config.ConfigInvalid as ex:
            return None, t("admin.error_config", message=self.describe(ex))
        except OSError as ex:
            return None, t("admin.error_write", error=type(ex).__name__)
        self.state.request_render()
        g.session.flags.add("watch_render")
        add_notice(g.session, t(notice))
        return redirect(target, 303), None

    def save_action(self, raw, data: dict, target: str, notice: str):
        """Saves a form without fields (remove, move): a refusal becomes a notice."""
        response, error = self.save(raw, data, target, notice)
        if response is None:
            add_notice(g.session, error)
            response = redirect(target, 303)
        return response
