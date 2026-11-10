"""The render loop, one render cycle and the startup fallback of `inkdoor serve`."""
import datetime as dt
import os
import threading

import pytest
from PIL import Image

from inkdoor import net, server
from inkdoor.config import with_defaults
from inkdoor.i18n import Translator
from inkdoor.render import render, render_error, render_setup
from inkdoor.sources import SourceCache, collect
from inkdoor.state import IMAGE_NAME, ServerState

from helpers import TZ, at

EN = Translator("en-US")
CANARY = "c4n4ry7Zq9"


def make_state(tmp_path, cfg, problem=None, admin_enabled=False, **kwargs):
    out = tmp_path / "out"
    return ServerState(str(tmp_path / "config.toml"), str(out), None, cfg, problem, admin_enabled,
                       **kwargs)


@pytest.fixture
def state(tmp_path, cfg):
    return make_state(tmp_path, cfg)


@pytest.fixture(autouse=True)
def no_lang_env(monkeypatch):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)


def pixels(path_or_image) -> bytes:
    image = path_or_image if isinstance(path_or_image, Image.Image) else Image.open(path_or_image)
    return image.convert("L").tobytes()


def image_path(state) -> str:
    return os.path.join(state.output_dir, IMAGE_NAME)


# ------------------------------------------------------------ render loop

def test_event_during_render_triggers_another_cycle(state, monkeypatch):
    calls = []
    stop = threading.Event()

    def fake_cycle(st, cache):
        calls.append(1)
        if len(calls) == 1:
            st.render_event.set()          # a save lands mid-render
        if len(calls) == 2:
            stop.set()
            st.render_event.set()          # wakes the wait so the loop sees `stop`

    monkeypatch.setattr(server, "run_cycle", fake_cycle)
    state.cfg["server"]["refresh_minutes"] = 60
    t = threading.Thread(target=server.render_loop, args=(state, SourceCache(), stop), daemon=True)
    t.start()
    t.join(2)
    assert len(calls) == 2
    assert not t.is_alive()


def test_render_loop_survives_a_failing_cycle(state, monkeypatch, capsys):
    calls = []
    stop = threading.Event()

    def fake_cycle(st, cache):
        calls.append(1)
        st.render_event.set()
        if len(calls) == 1:
            raise OSError(f"disk full at /secret/{CANARY}")
        stop.set()

    monkeypatch.setattr(server, "run_cycle", fake_cycle)
    t = threading.Thread(target=server.render_loop, args=(state, SourceCache(), stop), daemon=True)
    t.start()
    t.join(2)
    assert len(calls) == 2 and not t.is_alive()
    out = capsys.readouterr()
    assert "OSError" in out.out + out.err
    assert CANARY not in out.out + out.err


# ------------------------------------------------------------ startup fallback

def test_startup_with_broken_missing_and_unreadable_config(tmp_path):
    path = tmp_path / "config.toml"

    cfg, problem = server.load_for_serve(str(path), None)               # missing
    assert problem == "missing" and cfg == with_defaults({})
    assert cfg["server"]["port"] == 3667 and cfg["admin"]["enabled"] is False

    path.write_text("[server\n")                                         # broken, no backup
    cfg, problem = server.load_for_serve(str(path), None)
    assert problem == "broken" and cfg == with_defaults({})

    (tmp_path / "config.toml.bak").write_text("[server]\nport = 8123\n")  # broken, good backup
    cfg, problem = server.load_for_serve(str(path), None)
    assert problem == "broken" and cfg["server"]["port"] == 8123

    (tmp_path / "config.toml.bak").write_text("[server]\nport = 70000\n")  # backup invalid too
    cfg, problem = server.load_for_serve(str(path), None)
    assert problem == "broken" and cfg["server"]["port"] == 3667

    path.write_text("[server]\nport = 8124\n")                          # fixed
    cfg, problem = server.load_for_serve(str(path), None)
    assert problem is None and cfg["server"]["port"] == 8124

    path.unlink()
    path.mkdir()                                                         # unreadable: a folder
    cfg, problem = server.load_for_serve(str(path), None)
    assert problem == "broken" and cfg["server"]["port"] == 3667


@pytest.mark.skipif(hasattr(os, "geteuid") and os.geteuid() == 0, reason="root reads anything")
def test_startup_with_a_config_without_permission(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text("[server]\nport = 8125\n")
    path.chmod(0)
    try:
        cfg, problem = server.load_for_serve(str(path), None)
    finally:
        path.chmod(0o600)
    assert problem == "broken" and cfg["server"]["port"] == 3667


def test_startup_defaults_honor_the_language_override(tmp_path, monkeypatch):
    cfg, _ = server.load_for_serve(str(tmp_path / "config.toml"), "pt-BR")
    assert cfg["display"]["language"] == "pt-BR"
    monkeypatch.setenv("INKDOOR_LANG", "pt-BR")
    cfg, _ = server.load_for_serve(str(tmp_path / "config.toml"), None)
    assert cfg["display"]["language"] == "pt-BR"


def test_defaults_with_a_missing_file_show_the_setup_screen(tmp_path):
    cfg, problem = server.load_for_serve(str(tmp_path / "config.toml"), None)
    st = make_state(tmp_path, cfg, problem, using_defaults=True)
    server.run_cycle(st, SourceCache())
    assert pixels(image_path(st)) == pixels(render_setup(cfg, None))
    assert st.config_problem == "missing"
    assert st.last_render.word == EN("status.setup")


def test_defaults_with_a_broken_file_show_the_error_screen(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text(f'[[calendar]]\nname = "Work"\nurl = "https://calendar.example/{CANARY}\n')
    cfg, problem = server.load_for_serve(str(path), None)
    st = make_state(tmp_path, cfg, problem, using_defaults=True)
    server.run_cycle(st, SourceCache())
    assert pixels(image_path(st)) == pixels(render_error(cfg, "ConfigInvalid"))
    assert st.config_problem == "broken"
    assert st.last_render.word == EN("status.unknown")


def test_a_backup_config_keeps_the_door_working(tmp_path, cfg):
    path = tmp_path / "config.toml"
    path.write_text("[server\n")
    st = make_state(tmp_path, cfg, "broken")         # cfg came from config.toml.bak
    server.run_cycle(st, SourceCache())
    assert st.cfg is cfg and st.config_problem == "broken"
    assert st.last_render.word not in (EN("status.setup"), EN("status.unknown"))


# ------------------------------------------------------------ one cycle

def test_nothing_configured_renders_setup_not_free(tmp_path, monkeypatch):
    path = tmp_path / "config.toml"
    path.write_text('[[calendar]]\nname = "Work"\nurl = "PASTE_YOUR_LINK_HERE"\n')
    cfg = with_defaults({})
    st = make_state(tmp_path, cfg)
    server.run_cycle(st, SourceCache())
    setup = pixels(render_setup(st.cfg, None))
    assert pixels(image_path(st)) == setup
    snap = collect(st.cfg, now=at("10:00"))
    assert setup != pixels(render(snap, st.cfg))                       # what "Free" would look like
    assert st.last_render.word == EN("status.setup") and st.last_render.errors == []
    assert st.config_problem is None

    monkeypatch.setattr(net, "lan_address", lambda: "192.168.1.20")
    st.admin_enabled = True
    server.run_cycle(st, SourceCache())
    assert pixels(image_path(st)) == pixels(render_setup(st.cfg, "http://192.168.1.20:3667"))


def test_cycle_logs_exception_type_only(state, monkeypatch, capsys):
    def boom(*args, **kwargs):
        raise RuntimeError(f"render exploded on https://calendar.example/{CANARY}")

    monkeypatch.setattr(server, "render", boom)
    server.run_cycle(state, SourceCache())
    out = capsys.readouterr()
    assert "RuntimeError" in out.out + out.err
    assert CANARY not in out.out + out.err
    assert pixels(image_path(state)) == pixels(render_error(state.cfg, "RuntimeError"))
    assert state.last_render.word == EN("status.unknown")


def test_cycle_logs_config_errors_without_their_content(state, capsys):
    path = state.config_path
    with open(path, "w") as f:   # unterminated string on the line with the link
        f.write(f'[[calendar]]\nname = "Work"\nurl = "https://calendar.example/{CANARY}\n')
    server.run_cycle(state, SourceCache())
    out = capsys.readouterr()
    assert EN("config_error.syntax", error="") in out.out              # the translated message
    assert CANARY not in out.out + out.err


def test_cycle_explains_config_problems_in_the_log(state, capsys):
    with open(state.config_path, "w") as f:
        f.write("[server]\nrefresh_minutes = 0\n")
    server.run_cycle(state, SourceCache())
    reason = EN("config_error.refresh", value=0)
    assert EN("cli.kept_last_config", message=reason) in capsys.readouterr().out

    os.remove(state.config_path)
    server.run_cycle(state, SourceCache())
    reason = EN("cli.config_missing", path=state.config_path)
    assert EN("cli.kept_last_config", message=reason) in capsys.readouterr().out


def test_defaults_log_explains_the_missing_file(tmp_path, capsys):
    cfg, problem = server.load_for_serve(str(tmp_path / "config.toml"), None)
    st = make_state(tmp_path, cfg, problem, using_defaults=True)
    server.run_cycle(st, SourceCache())
    reason = EN("cli.config_missing", path=st.config_path)
    assert EN("cli.config_defaults", message=reason) in capsys.readouterr().out


def test_other_reload_errors_are_logged_by_type_only(state, monkeypatch, capsys):
    def boom(*args, **kwargs):
        raise ValueError(f"weird https://calendar.example/{CANARY}")

    monkeypatch.setattr(server.config, "load", boom)
    server.run_cycle(state, SourceCache())
    out = capsys.readouterr()
    assert EN("cli.kept_last_config", message="ValueError") in out.out
    assert CANARY not in out.out + out.err


def test_render_info_lists_failing_sources_without_links(tmp_path, cfg, capsys, monkeypatch):
    from inkdoor import sources
    from inkdoor.net import FetchError
    real_fetch = sources.fetch

    def fake_fetch(url):
        if CANARY in url:
            raise FetchError("unreachable")
        return real_fetch(url)

    monkeypatch.setattr(sources, "fetch", fake_fetch)
    cfg["calendar"].append({"name": "Gone", "busy": False,
                            "url": f"https://calendar.example/{CANARY}.ics"})
    st = make_state(tmp_path, cfg)
    server.run_cycle(st, SourceCache())
    assert st.last_render.errors == ["Gone: FetchError"]
    assert CANARY not in repr(st.last_render)
    out = capsys.readouterr()
    assert CANARY not in out.out + out.err


def test_cycle_keeps_last_valid_config_and_never_leaves_a_stale_screen(state, monkeypatch, cfg):
    with open(state.config_path, "w") as f:
        f.write("[server]\nrefresh_minutes = 0\n")       # broken on purpose
    server.run_cycle(state, SourceCache())
    assert state.cfg is cfg and os.path.exists(image_path(state))
    assert state.config_problem == "broken"
    assert state.last_render is not None

    def boom(*args, **kwargs):
        raise RuntimeError("render exploded")

    monkeypatch.setattr(server, "render", boom)
    before = open(image_path(state), "rb").read()
    server.run_cycle(state, SourceCache())
    assert open(image_path(state), "rb").read() != before   # replaced by the error screen


def test_cycle_survives_a_non_utf8_config(state, cfg):
    with open(state.config_path, "wb") as f:
        f.write('[display]\nlanguage = "pt-BR"  # é\n'.encode("latin-1"))
    server.run_cycle(state, SourceCache())
    assert state.cfg is cfg and state.config_problem == "broken"


def test_cycle_picks_up_a_fixed_config(tmp_path):
    cfg, problem = server.load_for_serve(str(tmp_path / "config.toml"), None)
    st = make_state(tmp_path, cfg, problem, using_defaults=True)
    (tmp_path / "config.toml").write_text("[server]\nrefresh_minutes = 7\n")
    server.run_cycle(st, SourceCache())
    assert st.cfg["server"]["refresh_minutes"] == 7
    assert st.config_problem is None and st.using_defaults is False


def test_a_config_deleted_later_is_broken_not_missing(state, cfg):
    server.run_cycle(state, SourceCache())                   # no file, but a valid cfg in hand
    assert state.cfg is cfg and state.config_problem == "broken"


def test_render_once_shows_setup_when_nothing_is_configured(tmp_path):
    cfg = with_defaults({})
    path = server.render_once(cfg, str(tmp_path / "out"))
    assert pixels(path) == pixels(render_setup(cfg, None))


class BrokenStdout:
    def write(self, text):
        raise BrokenPipeError(32, "Broken pipe")

    def flush(self):
        raise BrokenPipeError(32, "Broken pipe")


def test_render_loop_keeps_cycling_when_logging_fails(tmp_path, monkeypatch):
    import sys
    st = make_state(tmp_path, with_defaults({}))      # nothing configured, no file: no fetches
    real_cycle = server.run_cycle
    calls = []
    stop = threading.Event()

    def counting_cycle(state, cache):
        calls.append(1)
        state.render_event.set()
        if len(calls) == 3:
            stop.set()
        real_cycle(state, cache)

    monkeypatch.setattr(server, "run_cycle", counting_cycle)
    monkeypatch.setattr(sys, "stdout", BrokenStdout())
    t = threading.Thread(target=server.render_loop, args=(st, SourceCache(), stop), daemon=True)
    t.start()
    t.join(5)
    monkeypatch.undo()
    assert len(calls) == 3 and not t.is_alive()
    # a failing log line is not a failing render: the door shows setup, not the error screen
    assert pixels(image_path(st)) == pixels(render_setup(st.cfg, None))
    assert st.last_render.word == EN("status.setup")


def test_last_render_is_the_error_even_when_the_error_screen_cannot_be_saved(state, monkeypatch):
    from inkdoor.state import RenderInfo
    state.last_render = RenderInfo(at("10:00"), EN("status.free"), "until 3:00 PM", [])

    def no_disk(*args, **kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(server, "save", no_disk)
    with pytest.raises(OSError):
        server.run_cycle(state, SourceCache())
    assert state.last_render.word == EN("status.unknown")
    assert state.last_render.headline == EN("status.error_headline")


def test_refresh_minutes_is_read_again_before_every_wait(state, monkeypatch):
    waits, stop = [], threading.Event()

    class RecordingEvent:
        def clear(self):
            pass

        def is_set(self):
            return False

        def set(self):
            pass

        def wait(self, timeout):
            waits.append(timeout)
            state.cfg["server"]["refresh_minutes"] = 2           # a save changes it meanwhile
            if len(waits) == 2:
                stop.set()

    monkeypatch.setattr(server, "run_cycle", lambda st, cache: None)
    # 7:00 sits on a tick of both intervals, so each wait is one whole interval
    monkeypatch.setattr(server, "_now", lambda cfg: dt.datetime(2026, 10, 14, 7, 0, tzinfo=TZ))
    state.render_event = RecordingEvent()
    state.cfg["server"]["refresh_minutes"] = 7
    server.render_loop(state, SourceCache(), stop)
    assert waits == [7 * 60, 2 * 60]


@pytest.mark.parametrize("language, n, expected", [
    ("en-US", 0, "(0 events, 0 tasks)"), ("en-US", 1, "(1 event, 1 task)"),
    ("en-US", 2, "(2 events, 2 tasks)"),
    ("pt-BR", 0, "(0 compromissos, 0 tarefas)"), ("pt-BR", 1, "(1 compromisso, 1 tarefa)"),
    ("pt-BR", 2, "(2 compromissos, 2 tarefas)"),
])
def test_render_log_line_uses_plurals(cfg, tmp_path, monkeypatch, capsys, language, n, expected):
    from inkdoor.sources import Snapshot
    cfg["display"]["language"] = language
    monkeypatch.setattr(server, "collect", lambda cfg, cache=None: Snapshot(
        at("10:00"), ["event"] * n, [], ["task"] * n))
    monkeypatch.setattr(server, "compose", lambda snap, cfg, url: (None, "word", "headline"))
    monkeypatch.setattr(server, "next_change", lambda snap, cfg: None)
    monkeypatch.setattr(server, "save", lambda img, path: None)
    server.render_once(cfg, str(tmp_path))
    assert expected in capsys.readouterr().out


# --- when the loop renders next ----------------------------------------------------------------

@pytest.mark.parametrize("now, minutes, expected", [
    ("10:00", 5, 300), ("10:02", 5, 180), ("10:04", 5, 60), ("23:58", 5, 120), ("23:57", 7, 180),
])
def test_ticks_follow_the_clock_from_midnight(now, minutes, expected):
    assert server._until_tick(at(now), minutes) == expected


def test_the_loop_wakes_just_after_a_meeting_starts(state, monkeypatch):
    from inkdoor.state import RenderInfo
    monkeypatch.setattr(server, "_now", lambda cfg: at("9:58"))
    state.last_render = RenderInfo(at("9:58"), "Free", "until 9:59 AM", [], at("9:59"))
    assert server._wait_seconds(state) == 60 + server.CHANGE_DELAY       # before the 10:00 tick
    state.last_render = RenderInfo(at("9:58"), "Free", "until 1:00 PM", [], at("13:00"))
    assert server._wait_seconds(state) == 120                             # the tick comes first
    state.last_render = RenderInfo(at("9:58"), "Free", "until 1:00 PM", [], at("9:57"))
    assert server._wait_seconds(state) == 1                               # never busy-loops


def test_a_render_records_the_next_change(cfg, tmp_path):
    from inkdoor.render import next_change
    info = server._render_snapshot(cfg, str(tmp_path / "kindle.png"), None, None)
    assert info.next_change == next_change(collect(cfg, info.at), cfg)


def test_the_loop_publishes_when_it_renders_next(state, monkeypatch):
    stop = threading.Event()

    class OneWait:
        def clear(self):
            pass

        def wait(self, timeout):
            OneWait.timeout = timeout
            stop.set()

    monkeypatch.setattr(server, "run_cycle", lambda st, cache: None)
    monkeypatch.setattr(server, "_now", lambda cfg: at("10:01"))
    monkeypatch.setattr(server, "_wall_clock", lambda: 5000.0)
    state.render_event = OneWait()
    server.render_loop(state, SourceCache(), stop)
    assert OneWait.timeout == 240 and state.next_render_at == 5240.0
