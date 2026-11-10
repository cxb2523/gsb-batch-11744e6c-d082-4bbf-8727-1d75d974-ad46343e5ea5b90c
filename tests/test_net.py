import io
import re
import shutil
import socket
import ssl
import subprocess
import threading
import time

import pytest
import requests
from urllib3.exceptions import ReadTimeoutError

from inkdoor import net
from inkdoor.net import FetchError, fetch, lan_address


# ------------------------------------------------------------ helpers (no network)

def resolve_to(monkeypatch, ip_or_map):
    """Makes every host resolve to one IP, or each host to its own IP when given a dict."""
    def fake_getaddrinfo(host, port, *args, **kwargs):
        ip = ip_or_map.get(host, "203.0.113.10") if isinstance(ip_or_map, dict) else ip_or_map
        family = socket.AF_INET6 if ":" in ip else socket.AF_INET
        return [(family, socket.SOCK_STREAM, 6, "", (ip, port or 0))]
    monkeypatch.setattr(net.socket, "getaddrinfo", fake_getaddrinfo)


def make_response(status, body=b"", headers=None, raw=None):
    response = requests.Response()
    response.status_code = status
    response.headers.update(headers or {})
    response.raw = raw if raw is not None else io.BytesIO(body)
    return response


def respond_sequence(monkeypatch, *responses):
    """Session.get returns the given responses in order and records the requested URLs."""
    calls = []
    queue = list(responses)

    def fake_get(self, url, **kwargs):
        calls.append((url, kwargs))
        return queue.pop(0)
    monkeypatch.setattr(requests.Session, "get", fake_get)
    return calls


def respond(monkeypatch, status, body=b"", headers=None):
    return respond_sequence(monkeypatch, make_response(status, body, headers))


def respond_raises(monkeypatch, exc):
    def fake_get(self, url, **kwargs):
        raise exc
    monkeypatch.setattr(requests.Session, "get", fake_get)


def redirect(location, status=302):
    return make_response(status, headers={"Location": location})


# ------------------------------------------------------------ address checks

def test_refuses_loopback_and_link_local(monkeypatch):
    for ip in ["127.0.0.1", "::1", "169.254.169.254", "0.0.0.0", "fe80::1", "::ffff:127.0.0.1"]:
        resolve_to(monkeypatch, ip)
        with pytest.raises(FetchError) as e:
            fetch("https://cal.example/x.ics")
        assert e.value.reason == "blocked"
        assert e.value.status is None
        assert str(e.value) == "blocked"


def test_allows_private_lan(monkeypatch):
    resolve_to(monkeypatch, "192.168.1.20")
    respond(monkeypatch, 200, b"BEGIN:VCALENDAR")
    assert fetch("https://nextcloud.lan/x.ics").startswith(b"BEGIN")


def test_allows_unique_local_ipv6(monkeypatch):
    resolve_to(monkeypatch, "fd12:3456:789a::5")
    respond(monkeypatch, 200, b"BEGIN:VCALENDAR")
    assert fetch("https://radicale.lan/x.ics") == b"BEGIN:VCALENDAR"


def test_request_options(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    calls = respond(monkeypatch, 200, b"BEGIN:VCALENDAR")
    fetch("https://cal.example/x.ics")
    (url, kwargs), = calls
    assert url == "https://cal.example/x.ics"
    assert kwargs["stream"] is True
    assert kwargs["allow_redirects"] is False
    assert kwargs["timeout"] == (5, 10)
    assert kwargs["headers"] == {"User-Agent": "inkdoor"}


# ------------------------------------------------------------ redirects

def test_follows_redirects_and_checks_every_hop(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    calls = respond_sequence(monkeypatch,
                             redirect("https://cdn.example/a.ics"),
                             redirect("/b.ics", status=301),
                             redirect("c.ics", status=307),
                             make_response(200, b"BEGIN:VCALENDAR"))
    assert fetch("https://cal.example/x.ics") == b"BEGIN:VCALENDAR"
    assert [url for url, _ in calls] == ["https://cal.example/x.ics", "https://cdn.example/a.ics",
                                         "https://cdn.example/b.ics", "https://cdn.example/c.ics"]


def test_blocked_on_redirect_hop(monkeypatch):      # public → 302 → 127.0.0.1
    resolve_to(monkeypatch, {"cal.example": "203.0.113.10", "evil.example": "127.0.0.1",
                             "127.0.0.1": "127.0.0.1"})
    for target in ["http://127.0.0.1/admin", "https://evil.example/x.ics"]:
        calls = respond_sequence(monkeypatch, redirect(target), make_response(200, b"secret"))
        with pytest.raises(FetchError) as e:
            fetch("https://cal.example/x.ics")
        assert e.value.reason == "blocked"
        assert len(calls) == 1          # the blocked hop was never requested


def test_redirect_to_other_scheme_is_bad_link(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond_sequence(monkeypatch, redirect("file:///etc/passwd"))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "bad_link"


def test_redirect_limit(monkeypatch):               # 4 redirects → reason "redirects"
    resolve_to(monkeypatch, "203.0.113.10")
    calls = respond_sequence(monkeypatch, *[redirect(f"https://cal.example/{i}") for i in range(4)],
                             make_response(200, b"BEGIN:VCALENDAR"))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "redirects"
    assert len(calls) == 4


# ------------------------------------------------------------ size and time

def test_size_cap(monkeypatch):                     # streamed 6 MB → reason "too_large"
    resolve_to(monkeypatch, "203.0.113.10")
    respond(monkeypatch, 200, b"x" * 6_000_000)
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "too_large"


def test_size_cap_from_content_length(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond(monkeypatch, 200, b"BEGIN:VCALENDAR", headers={"Content-Length": "6000000"})
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "too_large"


def test_body_at_the_cap_is_accepted(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond(monkeypatch, 200, b"x" * 1000)
    assert len(fetch("https://cal.example/x.ics", max_bytes=1000)) == 1000


def test_deadline(monkeypatch):                     # fake clock passes 31 s between chunks → "timeout"
    clock = [1000.0]
    monkeypatch.setattr(net.time, "monotonic", lambda: clock[0])

    class SlowBody(io.BytesIO):
        def read(self, *args):
            clock[0] += 31
            return super().read(*args)

    resolve_to(monkeypatch, "203.0.113.10")
    respond_sequence(monkeypatch, make_response(200, raw=SlowBody(b"x" * 200_000)))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "timeout"


def test_timeouts_clamped_to_remaining_budget(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(net.time, "monotonic", lambda: clock[0])
    resolve_to(monkeypatch, "203.0.113.10")
    responses = [redirect("https://cal.example/a"), redirect("https://cal.example/b"),
                 make_response(200, b"BEGIN:VCALENDAR")]
    seen = []

    def fake_get(self, url, **kwargs):
        seen.append(kwargs["timeout"])
        clock[0] += [22, 5, 0][len(seen) - 1]           # time spent on each hop
        return responses.pop(0)
    monkeypatch.setattr(requests.Session, "get", fake_get)
    assert fetch("https://cal.example/x.ics") == b"BEGIN:VCALENDAR"
    assert seen == [(5, 10), (5, 8), (3, 3)]


def test_no_request_once_the_budget_is_spent(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(net.time, "monotonic", lambda: clock[0])
    resolve_to(monkeypatch, "203.0.113.10")
    calls = []

    def fake_get(self, url, **kwargs):
        calls.append(url)
        clock[0] += 30
        return redirect("https://cal.example/next")
    monkeypatch.setattr(requests.Session, "get", fake_get)
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "timeout"
    assert len(calls) == 1


def test_the_deadline_runs_across_redirect_hops(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(net.time, "monotonic", lambda: clock[0])
    resolve_to(monkeypatch, "203.0.113.10")
    calls = []

    def fake_get(self, url, **kwargs):
        calls.append(url)
        clock[0] += 16                                      # each hop is slow, none is over 30 s
        return redirect(f"https://cal.example/hop{len(calls)}")
    monkeypatch.setattr(requests.Session, "get", fake_get)
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "timeout" and len(calls) == 2   # 32 s spent: no third request


class LateBody(io.RawIOBase):
    """A body that ends (empty read) only after the deadline, like a connection that was cut."""

    def read(self, *args):
        time.sleep(0.4)
        return b""


def test_a_body_that_ends_after_the_deadline_is_a_timeout(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond_sequence(monkeypatch, make_response(200, raw=LateBody()))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics", deadline=0.2)
    assert e.value.reason == "timeout"                  # an empty read after the deadline is not success


def test_watchdog_shuts_down_without_closing():
    ours, peer = socket.socketpair()
    with ours, peer:
        with net._Watchdog(0.05) as watchdog:
            watchdog.watch_socket(ours)
            time.sleep(0.3)
            assert watchdog.expired
            assert ours.fileno() != -1                  # the fetch thread still owns and closes it
            peer.settimeout(1)
            assert peer.recv(1) == b""                  # but the connection was shut down
        assert all(dup.fileno() == -1 for dup in watchdog._dups)   # its own duplicates are closed


class TricklingServer:
    """Local HTTP(S) server that sends one byte every 50 ms, forever, to its one client."""

    def __init__(self, prefix, tls=None):
        self.prefix, self.tls = prefix, tls
        self.stop = threading.Event()
        self.listener = socket.socket()
        self.listener.bind(("127.0.0.1", 0))
        self.listener.listen()
        self.port = self.listener.getsockname()[1]
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def _serve(self):
        try:
            conn, _ = self.listener.accept()
            if self.tls:
                conn = self.tls.wrap_socket(conn, server_side=True)
            with conn:
                conn.recv(65536)
                conn.sendall(self.prefix)
                while not self.stop.wait(0.05):
                    conn.sendall(b"x")
        except (OSError, ssl.SSLError):
            pass

    def close(self):
        self.stop.set()
        self.listener.close()
        self.thread.join(2)


SLOW_BODY = b"HTTP/1.1 200 OK\r\nContent-Type: text/calendar\r\n\r\n"
SLOW_HEADERS = b"HTTP/1.1 200 OK\r\nX-Slow: "


def trickle(monkeypatch, url_scheme, prefix, deadline, tls=None):
    monkeypatch.setattr(net, "_refuse_blocked", lambda host, port: None)   # allow 127.0.0.1 here
    server = TricklingServer(prefix, tls)
    try:
        started = time.monotonic()
        with pytest.raises(FetchError) as e:
            fetch(f"{url_scheme}://127.0.0.1:{server.port}/x.ics", deadline=deadline)
        elapsed = time.monotonic() - started
    finally:
        server.close()
    return e.value, elapsed


@pytest.mark.parametrize("prefix", [SLOW_BODY, SLOW_HEADERS], ids=["slow body", "slow headers"])
def test_watchdog_stops_a_trickling_server(monkeypatch, prefix):
    error, elapsed = trickle(monkeypatch, "http", prefix, deadline=0.3)
    assert error.reason == "timeout"
    assert elapsed < 2


@pytest.fixture(scope="module")
def tls_cert(tmp_path_factory):
    """Throwaway self-signed certificate for 127.0.0.1, made with the openssl CLI."""
    openssl = shutil.which("openssl")
    if not openssl:
        pytest.skip("openssl CLI not available")
    folder = tmp_path_factory.mktemp("tls")
    cert, key = folder / "cert.pem", folder / "key.pem"
    result = subprocess.run(
        [openssl, "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
         "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
         "-keyout", str(key), "-out", str(cert)],
        capture_output=True)
    if result.returncode != 0:
        pytest.skip("openssl could not create a test certificate")
    return cert, key


@pytest.mark.parametrize("prefix", [SLOW_BODY, SLOW_HEADERS], ids=["slow body", "slow headers"])
def test_watchdog_stops_a_trickling_https_server(monkeypatch, tls_cert, prefix):
    cert, key = tls_cert
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert, key)
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", str(cert))
    error, elapsed = trickle(monkeypatch, "https", prefix, deadline=0.5, tls=tls)
    assert error.reason == "timeout"
    assert elapsed < 1.5


def test_https_test_server_is_trusted(monkeypatch, tls_cert):
    """Guards the test above: with a normal response, the TLS setup must succeed."""
    cert, key = tls_cert
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.load_cert_chain(cert, key)
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", str(cert))
    monkeypatch.setattr(net, "_refuse_blocked", lambda host, port: None)
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()

    def serve():
        conn, _ = listener.accept()
        with tls.wrap_socket(conn, server_side=True) as conn:
            conn.recv(65536)
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\nBEGIN:VCALENDAR")
    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    try:
        assert fetch(f"https://127.0.0.1:{listener.getsockname()[1]}/x.ics") == b"BEGIN:VCALENDAR"
    finally:
        listener.close()
        thread.join(2)


def test_requests_timeout(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond_raises(monkeypatch, requests.ReadTimeout("read timed out"))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "timeout"


class TimingOutBody(io.BytesIO):
    """A urllib3-like body whose read times out after the headers arrived."""

    def stream(self, *args, **kwargs):
        raise ReadTimeoutError(None, "/secret.ics", "Read timed out.")


def test_body_read_timeout_is_a_timeout(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond_sequence(monkeypatch, make_response(200, raw=TimingOutBody()))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/secret.ics")
    assert e.value.reason == "timeout"                  # requests wraps it in a ConnectionError
    assert "secret" not in str(e.value) and e.value.__context__ is None


def test_other_connection_errors_stay_unreachable(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    respond_raises(monkeypatch, requests.ConnectionError("connection reset by peer"))
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "unreachable"


def test_every_reason_raised_is_listed():
    source = open(net.__file__, encoding="utf-8").read()
    raised = set(re.findall(r'FetchError\("([a-z_]+)"', source))
    assert "timeout" in raised and raised <= set(net.REASONS)


# ------------------------------------------------------------ errors

def test_http_status_kept(monkeypatch):             # 403 → reason "http", status 403
    resolve_to(monkeypatch, "203.0.113.10")
    respond(monkeypatch, 403, b"Forbidden")
    with pytest.raises(FetchError) as e:
        fetch("https://cal.example/x.ics")
    assert e.value.reason == "http"
    assert e.value.status == 403
    assert str(e.value) == "http 403"


def test_error_text_never_contains_the_link(monkeypatch):
    secret = "tok3nCANARY"
    resolve_to(monkeypatch, "203.0.113.10")
    respond_raises(monkeypatch, requests.ConnectionError(f"Max retries with url: /{secret}/c.ics"))
    with pytest.raises(FetchError) as e:
        fetch(f"https://x.example/{secret}/c.ics")
    assert secret not in str(e.value) and secret not in repr(e.value)
    assert e.value.__cause__ is None and e.value.__suppress_context__     # raised "from None"
    assert e.value.__context__ is None
    assert e.value.reason == "unreachable"


def test_unexpected_errors_become_fetch_errors(monkeypatch):
    secret = "tok3nCANARY"
    def broken_getaddrinfo(*args, **kwargs):
        raise RuntimeError(f"weird failure for {secret}")
    monkeypatch.setattr(net.socket, "getaddrinfo", broken_getaddrinfo)
    with pytest.raises(FetchError) as e:
        fetch(f"https://x.example/{secret}/c.ics")
    assert secret not in str(e.value) and secret not in repr(e.value)
    assert e.value.__cause__ is None and e.value.__context__ is None


def test_dns_failure_is_unreachable(monkeypatch):
    def no_such_host(*args, **kwargs):
        raise socket.gaierror(8, "nodename nor servname provided")
    monkeypatch.setattr(net.socket, "getaddrinfo", no_such_host)
    with pytest.raises(FetchError) as e:
        fetch("https://nowhere.example/x.ics")
    assert e.value.reason == "unreachable"


@pytest.mark.parametrize("url", ["", "ftp://cal.example/x.ics", "file:///etc/passwd",
                                 "https://", "https://[::1/x.ics"])
def test_bad_links(url):
    with pytest.raises(FetchError) as e:
        fetch(url)
    assert e.value.reason == "bad_link"


@pytest.mark.parametrize("url", ["https:/cal.example/x.ics", "mailto:someone@example.com",
                                 "HTTPS//cal.example/x.ics", "webcal//cal.example/x.ics"])
def test_mistyped_links_are_bad_links_not_files(url):
    with pytest.raises(FetchError) as e:
        fetch(url)
    assert e.value.reason == "bad_link"


def test_a_drive_letter_path_is_still_a_file():
    with pytest.raises(FetchError) as e:
        fetch("C:\\inkdoor-missing\\cal.ics")
    assert e.value.reason == "unreachable"                # read as a (missing) file


def test_a_trailing_dot_host_is_fetched(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    calls = respond(monkeypatch, 200, b"BEGIN:VCALENDAR")
    assert fetch("https://cal.example./x.ics") == b"BEGIN:VCALENDAR"
    assert calls[0][0] == "https://cal.example./x.ics"


def test_netrc_credentials_are_never_sent(tmp_path, monkeypatch):
    netrc = tmp_path / "netrc"
    netrc.write_text("machine cal.example login someone password not-a-real-secret\n")
    netrc.chmod(0o600)
    monkeypatch.setenv("NETRC", str(netrc))
    monkeypatch.setenv("HOME", str(tmp_path))
    resolve_to(monkeypatch, "203.0.113.10")
    sent = []

    def fake_send(self, request, **kwargs):
        sent.append(request)
        response = make_response(200, b"BEGIN:VCALENDAR")
        response.request = request
        return response
    monkeypatch.setattr(requests.Session, "send", fake_send)
    assert fetch("https://cal.example/x.ics") == b"BEGIN:VCALENDAR"
    assert "Authorization" not in sent[0].headers
    assert requests.utils.get_netrc_auth("https://cal.example/x.ics") is not None   # it was there



def test_user_info_in_the_link_is_still_sent(monkeypatch):
    resolve_to(monkeypatch, "203.0.113.10")
    sent = []

    def fake_send(self, request, **kwargs):
        sent.append(request)
        response = make_response(200, b"BEGIN:VCALENDAR")
        response.request = request
        return response
    monkeypatch.setattr(requests.Session, "send", fake_send)
    fetch("https://someone:not-a-real-secret@cal.example/dav/x.ics")
    assert sent[0].headers["Authorization"] == requests.auth._basic_auth_str(
        "someone", "not-a-real-secret")


# ------------------------------------------------------------ local files and webcal

def test_local_file_and_webcal(tmp_path, monkeypatch):
    path = tmp_path / "cal.ics"
    path.write_bytes(b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")
    assert fetch(str(path)) == b"BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"

    with pytest.raises(FetchError) as e:
        fetch(str(path), max_bytes=10)
    assert e.value.reason == "too_large"

    with pytest.raises(FetchError) as e:
        fetch(str(tmp_path / "missing.ics"))
    assert e.value.reason == "unreachable"

    resolve_to(monkeypatch, "203.0.113.10")
    for link in ["webcal://cal.example/x.ics", "WEBCAL://cal.example/x.ics"]:
        calls = respond(monkeypatch, 200, b"BEGIN:VCALENDAR")
        assert fetch(link) == b"BEGIN:VCALENDAR"
        assert calls[0][0] == "https://cal.example/x.ics"


# ------------------------------------------------------------ LAN address

class FakeSocket:
    instances = []

    def __init__(self, own_ip=None, fail=False):
        self.own_ip, self.fail = own_ip, fail
        self.connected_to = None
        self.closed = False
        FakeSocket.instances.append(self)

    def connect(self, address):
        if self.fail:
            raise OSError("Network is unreachable")
        self.connected_to = address

    def getsockname(self):
        return (self.own_ip, 54321)

    def send(self, *args):              # pragma: no cover - must never happen
        raise AssertionError("lan_address must not send packets")

    sendto = send

    def close(self):
        self.closed = True


def fake_socket(monkeypatch, **kwargs):
    FakeSocket.instances = []
    monkeypatch.setattr(net.socket, "socket", lambda *a, **k: FakeSocket(**kwargs))


def host_addresses(monkeypatch, *ips):
    def fake_getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM, 6, "",
                 (ip, 0)) for ip in ips]
    monkeypatch.setattr(net.socket, "getaddrinfo", fake_getaddrinfo)


@pytest.mark.real_lan_address
def test_lan_address_prefers_private(monkeypatch):
    fake_socket(monkeypatch, own_ip="192.168.1.20")
    host_addresses(monkeypatch, "10.0.0.7")
    assert lan_address() == "192.168.1.20"
    sock, = FakeSocket.instances
    assert sock.connected_to == ("192.0.2.1", 9)
    assert sock.closed


@pytest.mark.real_lan_address
def test_lan_address_falls_back_to_host_addresses(monkeypatch):
    fake_socket(monkeypatch, own_ip="203.0.113.5")          # default route is not private
    host_addresses(monkeypatch, "127.0.1.1", "fe80::1", "203.0.113.5", "172.16.4.2")
    assert lan_address() == "172.16.4.2"
    assert FakeSocket.instances[0].closed


@pytest.mark.real_lan_address
def test_lan_address_none_without_private_address(monkeypatch):
    fake_socket(monkeypatch, fail=True)
    host_addresses(monkeypatch, "127.0.0.1", "::1")
    assert lan_address() is None
    assert FakeSocket.instances[0].closed


@pytest.mark.real_lan_address
def test_lan_address_survives_resolver_errors(monkeypatch):
    fake_socket(monkeypatch, fail=True)
    def no_such_host(*args, **kwargs):
        raise socket.gaierror(8, "nodename nor servname provided")
    monkeypatch.setattr(net.socket, "getaddrinfo", no_such_host)
    assert lan_address() is None


def test_tests_never_resolve_this_machine():
    """conftest replaces net.lan_address, so no test looks up the real host name."""
    from helpers import FAKE_LAN_ADDRESS

    from inkdoor.config import with_defaults
    assert net.lan_address() == FAKE_LAN_ADDRESS
    assert net.admin_url(with_defaults({})) == f"http://{FAKE_LAN_ADDRESS}:3667"


@pytest.mark.real_lan_address
def test_lan_address_survives_an_odd_host_name(monkeypatch):
    fake_socket(monkeypatch, fail=True)
    def bad_label(*args, **kwargs):  # e.g. a host name with an empty or too long IDNA label
        raise UnicodeError("encoding with 'idna' codec failed (UnicodeError: label empty or too long)")
    monkeypatch.setattr(net.socket, "getaddrinfo", bad_label)
    assert lan_address() is None


def test_admin_url_uses_the_lan_address_and_the_port(monkeypatch):
    from inkdoor.config import with_defaults
    monkeypatch.setattr(net, "lan_address", lambda: "192.168.1.20")
    assert net.admin_url(with_defaults({})) == "http://192.168.1.20:3667"
    assert net.admin_url(with_defaults({"server": {"port": 8123}})) == "http://192.168.1.20:8123"
    monkeypatch.setattr(net, "lan_address", lambda: None)
    assert net.admin_url(with_defaults({})) is None
