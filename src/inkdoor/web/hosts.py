"""Host header allowlist, the defense against DNS rebinding.

A malicious website can point its own name at a server on the local network, so every request's
Host header is checked before anything else. Only addresses and private-network style names pass.
Every built-in suffix is one that public DNS never answers for: a suffix under a public domain
(``.fritz.box``, ``.ts.net``) would trust whoever controls that zone, so such names go in
``[admin] allowed_hosts`` instead.
"""

from __future__ import annotations

import ipaddress
import re

SUFFIXES = (
    ".local", ".lan", ".home", ".home.arpa", ".internal", ".localdomain",
)

_LABEL = re.compile(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?")
_PORT = re.compile(r"[0-9]{1,5}")


def _valid_port(port: str) -> bool:
    return bool(_PORT.fullmatch(port)) and 1 <= int(port) <= 65535


def _valid_hostname(name: str) -> bool:
    if not name or len(name) > 253:
        return False
    return all(_LABEL.fullmatch(label) for label in name.split("."))


def host_name(header: str | None) -> str | None:
    """Return the normalized host of a Host header, or None when it is missing or malformed.

    Lowercases, drops the port (1-65535) and one trailing dot, and unwraps bracketed IPv6. The
    result is either an IP literal or a syntactically valid hostname.
    """
    # ASCII first: lowercasing some non-ASCII letters (the Kelvin sign, for one) gives ASCII ones
    if not header or not header.isascii() or any(c.isspace() for c in header):
        return None
    text = header.lower()
    if text.startswith("["):
        end = text.find("]")
        if end == -1:
            return None
        inner, rest = text[1:end], text[end + 1:]
        if rest and not (rest.startswith(":") and _valid_port(rest[1:])):
            return None
        if "%" in inner:
            return None
        try:
            return str(ipaddress.IPv6Address(inner))
        except ValueError:
            return None
    if text.count(":") > 1:
        return None  # IPv6 must be bracketed
    host, sep, port = text.partition(":")
    if sep and not _valid_port(port):
        return None
    if host.endswith("."):
        host = host[:-1]
    if not _valid_hostname(host):
        return None
    return host


def _is_ip(name: str) -> bool:
    try:
        ipaddress.ip_address(name)
    except ValueError:
        return False
    return True


def host_allowed(header: str | None, extra: list[str]) -> bool:
    """True when the Host header names an IP, a local-style name or an entry of `extra`."""
    name = host_name(header)
    if name is None:
        return False
    if _is_ip(name) or name == "localhost" or "." not in name:
        return True
    if any(name.endswith(suffix) for suffix in SUFFIXES):
        return True
    for entry in extra:
        if isinstance(entry, str) and entry.isascii() and entry.strip().lower().rstrip(".") == name:
            return True
    return False
