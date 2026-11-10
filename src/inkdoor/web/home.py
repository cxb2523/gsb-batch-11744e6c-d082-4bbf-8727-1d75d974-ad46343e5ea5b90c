"""The Home page: the door's preview, "Update now", the status the preview polls, and restoring
the previous config."""
from __future__ import annotations

import os

from flask import Blueprint, abort, g, jsonify, make_response, redirect, render_template, request

from .. import config, config_edit, kindle_files, net
from ..config import is_configured
from ..render import screen_size
from ..state import IMAGE_NAME
from . import add_notice
from .editing import Editor


def _nothing_configured(data: dict) -> bool:
    """True when no calendar and no task list has a link: the door shows the setup screen."""
    tasks = data.get("tasks") or {}
    return not any(is_configured(c.get("url")) for c in data.get("calendar", [])) and \
        not is_configured(tasks.get("url"))


def register(bp: Blueprint, ed: Editor) -> None:
    state, t = ed.state, ed.t

    def kindle_url() -> str | None:
        """The image address for other devices on the network, as Home shows it."""
        base = net.admin_url(state.cfg)
        return base + "/kindle.png" if base else None

    def preview_token(last) -> int | None:
        """The ``t`` of the preview's address: the last render time, so a new render shows."""
        try:
            mtime = os.stat(os.path.join(state.output_dir, IMAGE_NAME)).st_mtime_ns // 1_000_000
        except OSError:
            return None  # nothing drawn yet
        return int(last.at.timestamp() * 1000) if last is not None else mtime

    def updated_text(last) -> str | None:
        if last is None:
            return None
        return t()("admin.last_update", date=t().date_short(last.at), time=t().time(last.at))

    @bp.get("/")
    def home():
        last = state.last_render
        watch_render = "watch_render" in g.session.flags
        g.session.flags.discard("watch_render")
        raw, problem = ed.read()
        warning = ed.invalid(raw.data) if raw is not None else None
        # from the file as it is now: state.config_problem lags until the next render, so a
        # restore or a first save would otherwise still show the old banner
        missing = raw is not None and not raw.exists
        broken = bool(problem or warning) or (missing and state.config_problem == "broken")
        url = kindle_url()
        return render_template(
            "home.html", active="home", last=last, updated=updated_text(last),
            preview=preview_token(last), at=last.at.isoformat() if last is not None else "",
            # watch for the new screen after a save or "Update now", while a render is pending,
            # or while none happened yet
            poll=watch_render or state.render_event.is_set() or last is None,
            kindle_url=url, screen=screen_size(state.cfg),
            # the zip needs the address it writes into config.sh, and the scripts beside the code
            kindle_zip=url is not None and kindle_files.find_dir() is not None,
            port=state.cfg["server"]["port"], broken=broken, problem=problem or warning,
            using_defaults=state.using_defaults,
            # the door's own rule for its setup screen; a missing file is a first setup too
            first_setup=not broken and raw is not None and _nothing_configured(raw.data),
            restore=ed.restore_offer(raw, problem, warning))

    @bp.get("/kindle-files.zip")
    def kindle_zip():
        """The Kindle's scripts, with config.sh already pointing at this server."""
        url, folder = kindle_url(), kindle_files.find_dir()
        if url is None or folder is None:
            abort(404)
        docs = "docs/pt-BR/kindle.md" if t().language.startswith("pt") else "docs/kindle.md"
        readme = t()("kindle_zip.readme", url=url,
                     docs=f"https://github.com/frkey/inkdoor/blob/master/{docs}")
        response = make_response(kindle_files.build_zip(folder, url, t().language, readme))
        response.mimetype = "application/zip"
        response.headers["Content-Disposition"] = 'attachment; filename="inkdoor-kindle.zip"'
        return response

    @bp.get("/status.json")
    def status():
        last = state.last_render
        return jsonify(at=last.at.isoformat() if last is not None else None,
                       word=last.word if last is not None else None,
                       headline=last.headline if last is not None else None,
                       updated=updated_text(last),
                       errors=list(last.errors) if last is not None else [])

    @bp.post("/render")
    def render_now():
        requested = state.request_render(manual=True)
        if requested:
            g.session.flags.add("watch_render")
        key = "admin.update_requested" if requested else "admin.update_throttled"
        add_notice(g.session, t()(key))
        return redirect("/", 303)

    @bp.post("/restore")
    def restore():
        try:
            config_edit.restore_backup(state.config_path, request.form.get("digest"))
        except config_edit.ConfigChanged:
            return ed.changed("/")
        except config_edit.ConfigIsLink:
            add_notice(g.session, t()("admin.error_link"))
            return redirect("/", 303)
        except config.ConfigInvalid as ex:
            add_notice(g.session, t()("admin.restore_failed", message=ed.describe(ex)))
            return redirect("/", 303)
        except OSError as ex:
            add_notice(g.session, t()("admin.error_write", error=type(ex).__name__))
            return redirect("/", 303)
        state.request_render()
        g.session.flags.add("watch_render")
        add_notice(g.session, t()("admin.restored"))
        return redirect("/", 303)
