"""Outbound requests and LAN address detection.

Every calendar or task link is fetched through `fetch`, which:

- caps the body (5 MB by default) and follows at most 3 redirects, by hand, so every hop can
  be checked;
- enforces a total deadline (30 s by default): each request gets timeouts clamped to the time
  left, and a watchdog shuts down the connection (http or https) when time runs out, so a
  server that trickles the TLS handshake, the headers or the body one byte at a time cannot hold
  a fetch past the deadline. Two steps cannot be cut: DNS lookups (bounded by the system
  resolver's own timeout) and the TCP connect (bounded by the clamped connect timeout, once per
  resolved address);
- refuses hosts that resolve to loopback, link-local (including the cloud metadata address
  169.254.169.254) or unspecified addresses, on every hop. Private LAN addresses (RFC 1918,
  IPv6 ULA) stay allowed on purpose: a calendar on a LAN Nextcloud or Radicale is a real use,
  so a link can still reach other machines on the LAN. That residual risk is accepted;
- never puts the link in an error. Links are secrets, and `requests` copies the URL path into
  its messages, so every failure becomes a `FetchError` that only carries a short reason, raised
  outside the original handler and `from None` so no chained exception survives.

Known limit, accepted: the host is resolved and checked before each request, and `requests`
resolves it again to connect. A DNS server that answers differently the second time (DNS
rebinding) can slip past the check.

Proxies, a deliberate choice: the proxy settings of the environment apply (HTTPS_PROXY, NO_PROXY,
and on macOS the system proxy), so inkdoor works on a network that only reaches the internet
through one. The address check above still runs on the calendar's host as this machine resolves
it; what the proxy itself can reach is the proxy's business. Credentials from a .netrc file are
never sent: a link carries its own secret.
"""
from __future__ import annotations

import ipaddress
import re
import socket
import threading
import time
from urllib.parse import urljoin, urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.exceptions import ReadTimeoutError

MAX_BYTES = 5_000_000
DEADLINE = 30.0
# Every FetchError.reason; callers map each one to a message of their own
REASONS = ("blocked", "too_large", "timeout", "redirects", "http", "unreachable", "bad_link")

_SCHEME = re.compile(r"^([A-Za-z][A-Za-z0-9+.-]*)://")
# Mistyped links that would otherwise be read as a local file: "https:/x", "mailto:x",
# "https//x". A single letter before ":" stays a file path (a Windows drive, "C:\cal.ics").
_MISTYPED = re.compile(r"^(?:[A-Za-z][A-Za-z0-9+.-]+:|(?:https?|webcal)//)", re.IGNORECASE)
_CHUNK = 65536
_HEADERS = {"User-Agent": "inkdoor"}
_RFC1918 = tuple(ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))
_BAD_LINK_ERRORS = (requests.exceptions.InvalidURL, requests.exceptions.MissingSchema,
                    requests.exceptions.InvalidSchema, requests.exceptions.URLRequired,
                    UnicodeError)


class FetchError(Exception):
    """A link could not be fetched. The message is the reason only, never the link."""

    def __init__(self, reason: str, status: int | None = None):
        super().__init__(f"http {status}" if reason == "http" and status is not None else reason)
        self.reason = reason
        self.status = status


def fetch(url: str, *, max_bytes: int = MAX_BYTES, deadline: float = DEADLINE,
          max_redirects: int = 3) -> bytes:
    """Downloads an http(s)/webcal link, or reads a local file when the value has no scheme."""
    try:
        return _fetch(url, max_bytes, deadline, max_redirects)
    except FetchError as ex:
        error = FetchError(ex.reason, ex.status)
    except requests.Timeout:
        error = FetchError("timeout")
    except _BAD_LINK_ERRORS:
        error = FetchError("bad_link")
    except requests.ConnectionError as ex:
        # A read timeout while streaming the body reaches us as a ConnectionError
        timed_out = any(isinstance(arg, ReadTimeoutError) for arg in ex.args)
        error = FetchError("timeout" if timed_out else "unreachable")
    except Exception:
        error = FetchError("unreachable")
    # Raised here, outside the handlers, so not even __context__ keeps the original exception
    raise error from None


def _fetch(url: str, max_bytes: int, deadline: float, max_redirects: int) -> bytes:
    started = time.monotonic()
    if not url:
        raise FetchError("bad_link")
    match = _SCHEME.match(url)
    if not match:
        if _MISTYPED.match(url):
            raise FetchError("bad_link")
        return _read_file(url, max_bytes)        # hand-edited configs and test fixtures
    scheme = match.group(1).lower()
    if scheme == "webcal":
        url = "https" + url[len(scheme):]

    with _Watchdog(_remaining(started, deadline)) as watchdog, requests.Session() as session:
        adapter = _WatchedAdapter(watchdog)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        session.auth = _link_auth                 # an auth of our own: requests skips .netrc
        try:
            return _follow(session, watchdog, url, started, deadline, max_redirects, max_bytes)
        except FetchError:
            raise
        except Exception:
            if watchdog.expired:            # the watchdog cut the connection
                raise FetchError("timeout") from None
            raise


def _follow(session, watchdog, url, started, deadline, max_redirects, max_bytes) -> bytes:
    for _ in range(max_redirects + 1):
        host, port = _parse(url)
        _refuse_blocked(host, port)
        remaining = _remaining(started, deadline)
        response = session.get(url, stream=True, allow_redirects=False,
                               timeout=(min(5, remaining), min(10, remaining)), headers=_HEADERS)
        with response:
            if response.is_redirect:
                url = urljoin(url, response.headers["Location"])
                continue
            if response.status_code >= 400:
                raise FetchError("http", response.status_code)
            return _read_body(response, watchdog, started, deadline, max_bytes)
    raise FetchError("redirects")


def _link_auth(request):
    """Basic auth from the link's own user info (https://user:pass@host/...), as requests does
    when no auth is set; setting one is what keeps it from reading a .netrc file instead."""
    user, password = requests.utils.get_auth_from_url(request.url)
    if user or password:
        return requests.auth.HTTPBasicAuth(user, password)(request)
    return request


def _parse(url: str) -> tuple[str, int]:
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise FetchError("bad_link") from None
    scheme = parts.scheme.lower()
    if scheme not in ("http", "https") or not parts.hostname:
        raise FetchError("bad_link")
    return parts.hostname, port or (443 if scheme == "https" else 80)


def _refuse_blocked(host: str, port: int) -> None:
    for *_, sockaddr in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM):
        ip = ipaddress.ip_address(sockaddr[0].split("%", 1)[0])
        mapped = getattr(ip, "ipv4_mapped", None)
        if mapped is not None:
            ip = mapped
        if ip.is_loopback or ip.is_link_local or ip.is_unspecified:
            raise FetchError("blocked")


def _remaining(started: float, deadline: float) -> float:
    remaining = deadline - (time.monotonic() - started)
    if remaining <= 0:
        raise FetchError("timeout")
    return remaining


def _read_body(response, watchdog, started: float, deadline: float, max_bytes: int) -> bytes:
    length = response.headers.get("Content-Length", "")
    if length.isdigit() and int(length) > max_bytes:
        raise FetchError("too_large")
    body = bytearray()
    for chunk in response.iter_content(_CHUNK):
        body += chunk
        if len(body) > max_bytes:
            raise FetchError("too_large")
        _remaining(started, deadline)
    if watchdog.expired:                    # a cut connection can look like a short, complete body
        raise FetchError("timeout")
    return bytes(body)


class _Watchdog:
    """Enforces the total deadline while a request or read is blocked.

    Socket timeouts apply to each read, so a server sending one byte every few seconds never
    trips them. Every socket the fetch opens is duplicated (`dup()`: a second descriptor for the
    same connection) and kept here. When time runs out, the watchdog shuts the duplicates down,
    which ends the connection for every descriptor, so the read blocked in the fetch thread
    returns and the fetch fails with "timeout".

    The duplicate keeps working after TLS wraps (and detaches) the original socket, and since
    the watchdog owns it, its number cannot be reused by an unrelated socket. The watchdog never
    closes anything the fetch thread uses; it only closes its own duplicates on exit.
    """

    def __init__(self, seconds: float):
        self.expired = False
        self._done = False
        self._lock = threading.Lock()
        self._dups: list = []
        self._timer = threading.Timer(seconds, self._expire)
        self._timer.daemon = True

    def __enter__(self):
        self._timer.start()
        return self

    def __exit__(self, *exc_info):
        self._timer.cancel()
        with self._lock:                    # waits for an _expire that is already running
            self._done = True
            for dup in self._dups:
                dup.close()

    def watch_socket(self, sock) -> None:
        dup = sock.dup()
        with self._lock:
            if self._done:
                dup.close()
                return
            self._dups.append(dup)
            if self.expired:
                _shutdown(dup)

    def _expire(self) -> None:
        with self._lock:
            if self._done:
                return
            self.expired = True
            for dup in self._dups:
                _shutdown(dup)


def _shutdown(sock) -> None:
    try:
        sock.shutdown(socket.SHUT_RDWR)     # wakes a read blocked in another thread
    except OSError:
        pass                                # already disconnected


class _WatchedAdapter(HTTPAdapter):
    """Hands every socket urllib3 opens (directly or through a proxy) to the watchdog.

    The socket is registered as soon as it is connected, before any TLS handshake, so the
    handshake, the headers and the body are all covered.
    """

    def __init__(self, watchdog: _Watchdog):
        self._watchdog = watchdog
        super().__init__()

    def init_poolmanager(self, *args, **kwargs):
        super().init_poolmanager(*args, **kwargs)
        self._watch(self.poolmanager)

    def proxy_manager_for(self, proxy, **proxy_kwargs):
        manager = super().proxy_manager_for(proxy, **proxy_kwargs)
        self._watch(manager)
        return manager

    def _watch(self, manager) -> None:
        if getattr(manager, "_inkdoor_watched", False):
            return
        manager.pool_classes_by_scheme = {
            scheme: _watched_pool(pool_cls, self._watchdog)
            for scheme, pool_cls in manager.pool_classes_by_scheme.items()
        }
        manager._inkdoor_watched = True


def _watched_pool(pool_cls, watchdog: _Watchdog):
    class Connection(pool_cls.ConnectionCls):
        def _new_conn(self):
            sock = super()._new_conn()
            watchdog.watch_socket(sock)
            return sock

    return type(pool_cls.__name__, (pool_cls,), {"ConnectionCls": Connection})


def _read_file(path: str, max_bytes: int) -> bytes:
    with open(path, "rb") as f:
        content = f.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise FetchError("too_large")
    return content


# ---------------------------------------------------------------- LAN address

def lan_address() -> str | None:
    """Private IPv4 address other devices on the LAN can use to reach this computer."""
    try:
        # A UDP "connect" only picks the route and the source address; no packet is sent
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.connect(("192.0.2.1", 9))
            address = sock.getsockname()[0]
        finally:
            sock.close()
        if _is_private_ipv4(address):
            return address
    except OSError:
        pass
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None)
    except (OSError, UnicodeError):  # UnicodeError: a host name IDNA cannot encode
        return None
    for *_, sockaddr in infos:
        if _is_private_ipv4(sockaddr[0]):
            return sockaddr[0]
    return None


def admin_url(cfg: dict) -> str | None:
    """Address of the admin for other devices on the LAN, or None when there is no LAN address."""
    address = lan_address()
    if address is None:
        return None
    return f"http://{address}:{cfg['server']['port']}"


def _is_private_ipv4(address) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return False
    return ip.version == 4 and any(ip in network for network in _RFC1918)
