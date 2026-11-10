"""`inkdoor serve` against a real Waitress socket: Host parsing and the startup path."""
import http.client
import io
import os
import socket
import threading
import time

import pytest
from helpers import FAKE_LAN_ADDRESS
from PIL import Image

from inkdoor import net, server
from inkdoor.i18n import Translator

EN = Translator("en-US")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_port(port: int, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.05)
    raise AssertionError(f"server did not start on port {port}")


def request(port: int, path: str, host: str) -> tuple[int, dict, bytes]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.putrequest("GET", path, skip_host=True)
        conn.putheader("Host", host)
        conn.endheaders()
        response = conn.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        conn.close()


def raw_request(port: int, path: str, version: str = "HTTP/1.1") -> tuple[int, bytes]:
    """A request without any Host header (http.client always adds one)."""
    with socket.create_connection(("127.0.0.1", port), timeout=5) as sock:
        sock.sendall(f"GET {path} {version}\r\nConnection: close\r\n\r\n".encode("ascii"))
        data = b""
        while chunk := sock.recv(65536):
            data += chunk
    head, _, body = data.partition(b"\r\n\r\n")
    return int(head.split(b" ", 2)[1]), body


@pytest.fixture(scope="module")
def running(tmp_path_factory):
    """A real ``serve`` on 127.0.0.1 only, stopped when the module ends."""
    import waitress
    folder = tmp_path_factory.mktemp("serve")
    port = free_port()
    config_path = folder / "config.toml"
    config_path.write_text(f'[display]\nlanguage = "en-US"\n\n[server]\nport = {port}\n\n'
                           "[admin]\nenabled = true\n")
    out = folder / "out"
    servers, started, stopping = [], threading.Event(), threading.Event()
    real_create_server = waitress.create_server

    def loopback_server(app, **kwargs):
        httpd = real_create_server(app, **{**kwargs, "host": "127.0.0.1"})
        servers.append(httpd)
        return httpd

    def run_until_stopped(httpd):  # what httpd.run() does, but it can be told to stop
        started.set()
        while not stopping.is_set():
            httpd.asyncore.loop(timeout=0.05, map=httpd._map, count=1)
        httpd.task_dispatcher.shutdown()

    with pytest.MonkeyPatch.context() as mp:
        mp.delenv("INKDOOR_LANG", raising=False)
        mp.setattr(net, "lan_address", lambda: FAKE_LAN_ADDRESS)  # for the render thread
        # only while serve starts: the other tests in this module need the real ones
        with pytest.MonkeyPatch.context() as startup:
            startup.setattr(waitress, "create_server", loopback_server)
            startup.setattr(server, "_run", run_until_stopped)
            thread = threading.Thread(target=server.serve,
                                      args=(str(config_path), str(out), None), daemon=True)
            thread.start()
            assert started.wait(10), "serve did not start"
        try:
            wait_for_port(port)
            deadline = time.monotonic() + 10
            while request(port, "/kindle.png", f"127.0.0.1:{port}")[0] != 200:   # first render
                assert time.monotonic() < deadline, "no image rendered"
                time.sleep(0.05)
            yield port, out, servers[0]
        finally:
            stopping.set()             # serve() returns and closes the socket and the render loop
            thread.join(10)
            for other in threading.enumerate():
                if other.name == "inkdoor-render":
                    other.join(10)
    assert not thread.is_alive()
    with pytest.raises(OSError):                 # the socket is closed, nothing listens anymore
        socket.create_connection(("127.0.0.1", port), timeout=0.5).close()


def is_png(body: bytes) -> bool:
    return Image.open(io.BytesIO(body)).format == "PNG"


@pytest.mark.parametrize("host", ["[::1]:{port}", "inkdoor.lan.", "[fe80::1]", "localhost:{port}"])
def test_allowed_hosts(running, host):
    port, out, _ = running
    host = host.format(port=port)
    status, headers, body = request(port, "/kindle.png", host)
    assert status == 200 and headers["Content-Type"] == "image/png"
    assert body == (out / "kindle.png").read_bytes()
    status, headers, _ = request(port, "/", host)
    assert status == 302 and headers["Location"].endswith("/login?next=%2F")


@pytest.mark.parametrize("host", ["evil.com", "evil.com.", "inkdoor.lan.evil.com",
                                  "[fe80::1%25en0]"])
def test_rejected_hosts(running, host):
    port, out, _ = running
    status, headers, body = request(port, "/", host)
    assert status == 400 and headers["Content-Type"].startswith("text/plain")
    assert body.decode("utf-8").strip() == EN("admin.bad_host")
    status, headers, body = request(port, "/kindle.png", host)
    assert status == 200 and headers["Content-Type"] == "image/png" and is_png(body)
    assert body != (out / "kindle.png").read_bytes()               # the error image, not the door


def test_the_test_server_listens_on_loopback_only(running):
    _, _, httpd = running
    assert httpd.socket.getsockname()[0] == "127.0.0.1"


@pytest.mark.parametrize("version", ["HTTP/1.0", "HTTP/1.1"])
def test_missing_host(running, version):
    port, out, _ = running
    status, body = raw_request(port, "/", version)
    assert status == 400
    status, body = raw_request(port, "/kindle.png", version)
    assert status == 200 and is_png(body) and body != (out / "kindle.png").read_bytes()


def test_unknown_paths_are_404(running):
    port, _, _ = running
    for path in ("/config.toml", "/out/kindle.png", "/kindle.png/", "/../config.toml"):
        assert request(port, path, f"127.0.0.1:{port}")[0] == 404


def test_port_in_use(tmp_path, monkeypatch):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as busy:
        busy.bind(("0.0.0.0", 0))
        busy.listen()
        port = busy.getsockname()[1]
        (tmp_path / "config.toml").write_text(f"[server]\nport = {port}\n")
        with pytest.raises(server.PortInUse) as info:
            server.serve(str(tmp_path / "config.toml"), str(tmp_path / "out"), None)
    assert info.value.port == port
    assert not (tmp_path / "out" / "kindle.png").exists()   # nothing rendered for a dead server


class FakeServer:
    def close(self):
        pass


@pytest.fixture
def no_bind(monkeypatch):
    """serve without a socket (it would listen on 0.0.0.0, every interface of this machine)."""
    import waitress
    monkeypatch.setattr(waitress, "create_server", lambda app, **kwargs: FakeServer())


def test_serve_warns_when_the_admin_has_no_password(tmp_path, monkeypatch, capsys, no_bind):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    port = free_port()
    (tmp_path / "config.toml").write_text(f"[server]\nport = {port}\n\n[admin]\nenabled = true\n")
    monkeypatch.setattr(server, "_run", lambda httpd: None)        # do not block in the test
    monkeypatch.setattr(server, "render_loop", lambda *args: None)
    server.serve(str(tmp_path / "config.toml"), str(tmp_path / "out"), None)
    out = capsys.readouterr().out
    assert EN("cli.no_password") in out
    assert EN("cli.serving", address=FAKE_LAN_ADDRESS, port=port) in out


@pytest.mark.parametrize("language", ["en-US", "pt-BR"])
@pytest.mark.parametrize("address", [FAKE_LAN_ADDRESS, None])
def test_serve_prints_the_lan_address(tmp_path, monkeypatch, capsys, language, address,
                                      no_bind):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    monkeypatch.setattr(net, "lan_address", lambda: address)
    monkeypatch.setattr(server, "_run", lambda httpd: None)
    monkeypatch.setattr(server, "render_loop", lambda *args: None)
    port = free_port()
    (tmp_path / "config.toml").write_text(
        f'[display]\nlanguage = "{language}"\n\n[server]\nport = {port}\n')
    server.serve(str(tmp_path / "config.toml"), str(tmp_path / "out"), None)
    t = Translator(language)
    shown = address or t("cli.this_computer_ip")
    assert t("cli.serving", address=shown, port=port) in capsys.readouterr().out
    assert f"http://{shown}:{port}/kindle.png" in t("cli.serving", address=shown, port=port)


def test_serve_does_not_warn_with_a_password_or_without_the_admin(tmp_path, monkeypatch, capsys,
                                                                  no_bind):
    from inkdoor.web import auth
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    monkeypatch.setattr(server, "_run", lambda httpd: None)
    monkeypatch.setattr(server, "render_loop", lambda *args: None)
    config_path = tmp_path / "config.toml"
    config_path.write_text(f"[server]\nport = {free_port()}\n")               # admin disabled
    server.serve(str(config_path), str(tmp_path / "out"), None)
    assert EN("cli.no_password") not in capsys.readouterr().out

    config_path.write_text(f"[server]\nport = {free_port()}\n\n[admin]\nenabled = true\n")
    auth.set_password(auth.password_path(str(config_path)), "test-pass-not-real-1")
    server.serve(str(config_path), str(tmp_path / "out"), None)
    out = capsys.readouterr().out
    assert EN("cli.no_password") not in out and "test-pass-not-real-1" not in out


def started_state(monkeypatch, config_path, out):
    """Runs serve without blocking and returns the state it built."""
    seen = []
    monkeypatch.setattr(server, "_run", lambda httpd: None)
    monkeypatch.setattr(server, "render_loop", lambda state, *args: seen.append(state))
    server.serve(str(config_path), str(out), None)
    return seen[0]


def test_broken_config_keeps_the_admin_when_a_password_exists(tmp_path, monkeypatch, no_bind):
    from inkdoor.web import auth
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    config_path = tmp_path / "config.toml"
    config_path.write_text("[server\n")                                   # broken, no .bak
    auth.set_password(auth.password_path(str(config_path)), "test-pass-not-real-1")
    state = started_state(monkeypatch, config_path, tmp_path / "out")
    assert state.config_problem == "broken" and state.using_defaults
    assert state.admin_enabled is True


def test_broken_config_without_a_password_keeps_the_admin_off(tmp_path, monkeypatch, no_bind):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    config_path = tmp_path / "config.toml"
    config_path.write_text("[server\n")
    state = started_state(monkeypatch, config_path, tmp_path / "out")
    assert state.config_problem == "broken" and state.admin_enabled is False


def test_missing_config_keeps_the_admin_off_even_with_a_password(tmp_path, monkeypatch,
                                                                  no_bind):
    from inkdoor.web import auth
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    config_path = tmp_path / "config.toml"
    auth.set_password(auth.password_path(str(config_path)), "test-pass-not-real-1")
    state = started_state(monkeypatch, config_path, tmp_path / "out")
    assert state.config_problem == "missing" and state.admin_enabled is False


def test_a_good_backup_decides_the_admin(tmp_path, monkeypatch, no_bind):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    config_path = tmp_path / "config.toml"
    config_path.write_text("[server\n")
    (tmp_path / "config.toml.bak").write_text("[server]\nport = 8001\n")   # admin off
    (tmp_path / "admin-password").write_text("irrelevant")
    state = started_state(monkeypatch, config_path, tmp_path / "out")
    assert state.config_problem == "broken" and not state.using_defaults
    assert state.admin_enabled is False


def test_inkdoor_lang_locks_the_language_like_lang(tmp_path, monkeypatch, no_bind):
    """INKDOOR_LANG is an override like --lang: the Screen page must show the field locked."""
    monkeypatch.setenv("INKDOOR_LANG", "pt-BR")
    config_path = tmp_path / "config.toml"
    config_path.write_text('[display]\nlanguage = "en-US"\n')
    state = started_state(monkeypatch, config_path, tmp_path / "out")
    assert state.language == "pt-BR"


def test_lang_wins_over_inkdoor_lang(tmp_path, monkeypatch, no_bind):
    monkeypatch.setenv("INKDOOR_LANG", "pt-BR")
    config_path = tmp_path / "config.toml"
    config_path.write_text('[display]\nlanguage = "pt-BR"\n')
    seen = []
    monkeypatch.setattr(server, "_run", lambda httpd: None)
    monkeypatch.setattr(server, "render_loop", lambda state, *args: seen.append(state))
    server.serve(str(config_path), str(tmp_path / "out"), "en-US")
    assert seen[0].language == "en-US"


def test_no_language_override_leaves_the_field_editable(tmp_path, monkeypatch, no_bind):
    monkeypatch.delenv("INKDOOR_LANG", raising=False)
    config_path = tmp_path / "config.toml"
    config_path.write_text('[display]\nlanguage = "pt-BR"\n')
    state = started_state(monkeypatch, config_path, tmp_path / "out")
    assert state.language is None
