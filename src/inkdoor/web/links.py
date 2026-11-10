"""Calendar and task links in the admin: masking for display and checking pasted values.

Links are secrets (anyone with one can read the calendar), so the admin never sends one back to
the browser. Pages show ``mask(url)`` instead, and a pasted link goes through ``clean`` before it
is saved.
"""
from __future__ import annotations

import ipaddress
import re
from typing import NamedTuple

HIDDEN = "…"
MAX_LENGTH = 4096
WEB_SCHEMES = ("http", "https", "webcal")

_WEB = re.compile(r"^(?P<scheme>[A-Za-z][A-Za-z0-9+.-]*)://(?P<rest>.*)\Z", re.DOTALL)
_UNSAFE = re.compile(r"[\s\x00-\x1f\x7f]")
# the authority ends where urlsplit (and requests) end it: at the first "/", "?" or "#"
_AUTHORITY = re.compile(r"^(?P<authority>[^/?#]*)(?P<path>[^?#]*)")
_HOST_PORT = re.compile(r"^(?:\[(?P<ipv6>[^\]]*)\]|(?P<name>[^:\[\]]*))(?::(?P<port>[0-9]{1,5}))?\Z")
_LABEL = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\Z")


class _WebLink(NamedTuple):
    scheme: str  # lowercased
    rest: str    # everything after "://", as given
    host: str    # lowercased; an IPv6 address in brackets
    port: int | None
    path: str    # without query or fragment


def _valid_host(name: str) -> bool:
    """A DNS name (ASCII letters, digits and hyphens; IDN as punycode; one trailing dot allowed,
    as in "calendar.example.") or an IPv4 address."""
    if name.endswith("."):
        name = name[:-1]
    if not name or len(name) > 253:
        return False
    labels = name.split(".")
    if not all(_LABEL.match(label) for label in labels):
        return False
    if all(label.isdigit() for label in labels):  # looks like an IPv4 address: must be one
        try:
            ipaddress.IPv4Address(name)
        except ValueError:
            return False
    return True


def _parse(url) -> _WebLink | None:
    """The parts of an http, https or webcal link with a valid host and port, else None."""
    match = _WEB.match(url) if isinstance(url, str) else None
    if match is None or match["scheme"].lower() not in WEB_SCHEMES:
        return None
    rest = match["rest"]
    parts = _AUTHORITY.match(rest)
    host_port = parts["authority"].rpartition("@")[2]  # user info is never shown or checked
    found = _HOST_PORT.match(host_port)
    if found is None:
        return None
    if found["ipv6"] is not None:
        if "%" in found["ipv6"]:  # a zone id (fe80::1%en0) names a local interface
            return None
        try:
            host = f"[{ipaddress.IPv6Address(found['ipv6'])}]"
        except ValueError:
            return None
    else:
        host = found["name"].lower()
        if not _valid_host(host):
            return None
    port = None
    if found["port"] is not None:
        port = int(found["port"])
        if not 1 <= port <= 65535:
            return None
    return _WebLink(match["scheme"].lower(), rest, host, port, parts["path"])


def is_web(url) -> bool:
    """True for an http, https or webcal link with a valid host and port (scheme in any case)."""
    return _parse(url) is not None


def mask(url) -> str:
    """The host, the port if any, and the first path segment, e.g. ``calendar.google.com/calendar/…``.

    The first segment is shown only when more segments follow it, so a link whose only segment is
    the token shows just the host. Never any user info, query string, fragment or later segment.
    Anything that is not a valid web link (e.g. a local path set by hand) is fully hidden.
    """
    link = _parse(url)
    if link is None:
        return HIDDEN
    host = link.host if link.port is None else f"{link.host}:{link.port}"
    segments = link.path.lstrip("/").split("/")
    if len(segments) > 1 and segments[0]:
        return f"{host}/{segments[0]}/{HIDDEN}"
    return f"{host}/{HIDDEN}"


def clean(value: str) -> str | None:
    """A link pasted in the admin, ready to store, or None when the field was left empty.

    Surrounding whitespace is removed and the scheme is lowercased; the rest is kept byte for
    byte. Raises ValueError unless it is an http, https or webcal link with a valid host and port:
    a value without a scheme would be read as a local file.
    """
    value = value.strip()
    if not value:
        return None
    if len(value) > MAX_LENGTH or _UNSAFE.search(value):
        raise ValueError("not a web link")
    link = _parse(value)
    if link is None:
        raise ValueError("not a web link")
    return f"{link.scheme}://{link.rest}"
