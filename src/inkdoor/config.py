"""Loads config.toml, fills in defaults and validates it."""
from __future__ import annotations

import copy
import os
import sys
from zoneinfo import ZoneInfo

if sys.version_info >= (3, 11):
    import tomllib
else:  # pragma: no cover
    import tomli as tomllib

DEFAULT_PATH = "config.toml"
PLACEHOLDER_PREFIX = "PASTE_"
STYLES = ("solid", "striped", "outline")

# Kindle screens, portrait (width, height); the admin names the models of each in its language
SCREENS = {
    "600x800": (600, 800),
    "758x1024": (758, 1024),
    "1072x1448": (1072, 1448),
    "1236x1648": (1236, 1648),
    "1264x1680": (1264, 1680),
    "1272x1696": (1272, 1696),
    "1860x2480": (1860, 2480),
}
DEFAULT_SCREEN = "1072x1448"

DISPLAY_DEFAULTS = {
    "language": "en-US",
    "timezone": "America/Sao_Paulo",
    "workday_start": 8,
    "workday_end": 19,
    "workdays": [0, 1, 2, 3, 4],
    "min_gap_minutes": 30,
    "screen": DEFAULT_SCREEN,
}
SERVER_DEFAULTS = {"port": 3667, "refresh_minutes": 5}
ADMIN_DEFAULTS = {"enabled": False, "allowed_hosts": []}
TABLE_SECTIONS = ("display", "server", "tasks", "admin")


class ConfigMissing(Exception):
    def __init__(self, path: str):
        super().__init__(path)
        self.path = path


class ConfigInvalid(Exception):
    """A config value is wrong. ``key`` is a translation key under ``config_error``."""

    def __init__(self, error_key: str, /, **details):
        super().__init__(error_key, details)
        self.key = error_key
        self.details = details


def resolve_path(path: str | None = None) -> str:
    """The config file to use: the given path, else $INKDOOR_CONFIG, else ./config.toml."""
    return os.fspath(path) if path else os.environ.get("INKDOOR_CONFIG") or DEFAULT_PATH


def read_bytes(path) -> bytes:
    """Reads the file, turning OS errors into ConfigMissing / ConfigInvalid."""
    path = os.fspath(path)
    try:
        with open(path, "rb") as f:
            return f.read()
    except FileNotFoundError:
        raise ConfigMissing(path) from None
    except PermissionError:
        raise ConfigInvalid("permission", path=path) from None
    except OSError as ex:
        raise ConfigInvalid("unreadable", path=path, error=type(ex).__name__) from None


def check_sections(data: dict) -> dict:
    """Makes sure every section has the shape ``with_defaults`` expects."""
    for section in TABLE_SECTIONS:
        if section in data and not isinstance(data[section], dict):
            raise ConfigInvalid("section", section=section)
    if not isinstance(data.get("calendar", []), list) or not all(
            isinstance(c, dict) for c in data.get("calendar", [])):
        raise ConfigInvalid("section", section="calendar")
    return data


def read_toml(path) -> tuple[dict, bytes]:
    """Reads and parses the file as it is, without defaults. Returns the data and the raw bytes."""
    raw = read_bytes(path)
    try:
        data = tomllib.loads(raw.decode("utf-8"))
    except UnicodeDecodeError:
        raise ConfigInvalid("encoding") from None
    except tomllib.TOMLDecodeError as ex:
        raise ConfigInvalid("syntax", error=str(ex)) from None
    return check_sections(data), raw


def with_defaults(cfg: dict) -> dict:
    for section, defaults in (("display", DISPLAY_DEFAULTS), ("server", SERVER_DEFAULTS),
                              ("admin", ADMIN_DEFAULTS)):
        cfg.setdefault(section, {})
        for key, value in defaults.items():
            cfg[section].setdefault(key, copy.deepcopy(value))
    cfg.setdefault("calendar", [])
    if "tasks" in cfg:
        cfg["tasks"].setdefault("name", "TickTick")
    return cfg


def _is_int(value, low, high) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def _has_port(host: str) -> bool:
    if host.startswith("["):                     # [IPv6] or [IPv6]:port
        return "]:" in host
    return host.count(":") == 1                  # an unbracketed IPv6 address has several


def validate(cfg: dict) -> dict:
    display, server = cfg["display"], cfg["server"]
    try:
        ZoneInfo(str(display["timezone"]))
    except Exception:
        raise ConfigInvalid("timezone", value=display["timezone"]) from None
    for key in ("workday_start", "workday_end"):
        if not _is_int(display[key], 0, 24):
            raise ConfigInvalid("hour", key=key, value=display[key])
    if not (isinstance(display["workdays"], list) and all(_is_int(d, 0, 6) for d in display["workdays"])):
        raise ConfigInvalid("workdays")
    if display.get("clock") not in (None, "12h", "24h"):
        raise ConfigInvalid("clock", value=display["clock"])
    if not isinstance(display["screen"], str) or display["screen"] not in SCREENS:
        raise ConfigInvalid("screen", value=display["screen"])
    if not _is_int(server["refresh_minutes"], 1, 1440):
        raise ConfigInvalid("refresh", value=server["refresh_minutes"])
    if not _is_int(server["port"], 1, 65535):
        raise ConfigInvalid("port", value=server["port"])
    admin = cfg["admin"]
    if not isinstance(admin["enabled"], bool):
        raise ConfigInvalid("admin_enabled", value=admin["enabled"])
    hosts = admin["allowed_hosts"]
    if not (isinstance(hosts, list) and all(isinstance(h, str) and h.strip() for h in hosts)):
        raise ConfigInvalid("allowed_hosts")
    for host in hosts:
        # the Host check compares names without a port, in ASCII: such entries would never match
        if not host.isascii() or _has_port(host.strip()):
            raise ConfigInvalid("allowed_host", host=host)
    names = set()
    for i, calendar in enumerate(cfg["calendar"], start=1):
        name = calendar.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ConfigInvalid("calendar_name", index=i)
        if name in names:
            raise ConfigInvalid("calendar_duplicate", name=name)
        names.add(name)
        if calendar.get("style", "solid") not in STYLES:
            raise ConfigInvalid("style", name=name, value=calendar.get("style"))
        # hand edits: the wrong type would crash the admin pages. No value in these errors, since
        # a misplaced link must never be repeated back
        if not isinstance(calendar.get("url", ""), str):
            raise ConfigInvalid("calendar_url", name=name)
        if not isinstance(calendar.get("busy", True), bool):
            raise ConfigInvalid("calendar_busy", name=name)
        if not isinstance(calendar.get("status_label", ""), str):
            raise ConfigInvalid("calendar_label", name=name)
    if not isinstance(cfg.get("tasks", {}).get("url", ""), str):
        raise ConfigInvalid("tasks_url")
    return cfg


def load(path: str | None = None, language: str | None = None) -> dict:
    """Reads and validates the config. ``language`` (from --lang) wins over the file."""
    data, _ = read_toml(resolve_path(path))
    cfg = with_defaults(data)
    language = language or os.environ.get("INKDOOR_LANG")
    if language:
        cfg["display"]["language"] = language
    return validate(cfg)


def is_configured(url) -> bool:
    """True once the user replaced the example placeholder with a real link (a non-empty string)."""
    return isinstance(url, str) and bool(url) and not url.startswith(PLACEHOLDER_PREFIX)
