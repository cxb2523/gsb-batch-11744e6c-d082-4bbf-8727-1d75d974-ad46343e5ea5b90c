"""Edits config.toml as it is on disk, for the admin pages.

The admin works on the raw TOML dict, never on ``config.load()`` output, so defaults and
``--lang`` / ``INKDOOR_LANG`` overrides are never written into the file. Every save carries the
digest of the file as it was read and is refused if the file changed in the meantime.
"""
from __future__ import annotations

import copy
import hashlib
import hmac
import os
import re
import threading
from dataclasses import dataclass

import tomli_w

from . import config
from .files import write_private

BACKUP_SUFFIX = ".bak"
_DIGEST = re.compile(r"[0-9a-f]{64}")
# Read, compare and write as one step, so two saves made from the same read cannot both win.
_LOCK = threading.RLock()


class ConfigChanged(Exception):
    """The file changed since it was read (a hand edit or another browser tab)."""


class ConfigIsLink(Exception):
    """config.toml is a symbolic link. Writes replace the file atomically, which would turn the
    link into a regular file, so the admin refuses and the file must be edited by hand."""


def _refuse_link(path: str) -> None:
    if os.path.islink(path):
        raise ConfigIsLink()


@dataclass
class RawConfig:
    data: dict
    digest: str
    exists: bool


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_raw(path) -> RawConfig:
    """The file's data without defaults, and the digest of the exact bytes read.

    A missing file reads as empty, so the first save creates it.
    """
    try:
        data, raw = config.read_toml(path)
    except config.ConfigMissing:
        return RawConfig({}, digest(b""), False)
    return RawConfig(data, digest(raw), True)


def check(data: dict) -> dict:
    """Validates a copy of ``data`` with the defaults filled in, and returns that copy."""
    cfg = config.check_sections(copy.deepcopy(data))
    return config.validate(config.with_defaults(cfg))


def save(path, data: dict, expected_digest) -> str:
    """Validates and writes ``data``; the previous file becomes the backup. Returns the new digest."""
    _refuse_link(os.fspath(path))
    check(data)
    return _replace(path, dumps(data).encode("utf-8"), expected_digest)


_BARE_KEY = re.compile(r"[A-Za-z0-9_-]+")


def _key(key: str) -> str:
    return key if _BARE_KEY.fullmatch(key) else tomli_w.dumps({"k": key})[4:].strip()


def _is_table(value) -> bool:
    return isinstance(value, dict) or (isinstance(value, list) and any(isinstance(v, dict) for v in value))


def _is_table_list(value) -> bool:
    """A non-empty list of tables without sub-tables, which can be written as [[name]] blocks."""
    return (isinstance(value, list) and bool(value) and all(
        isinstance(item, dict) and not any(_is_table(v) for v in item.values()) for item in value))


def dumps(data: dict) -> str:
    """TOML in the data's own order, with lists of tables written as [[name]] blocks.

    tomli_w writes short lists of tables inline, above every [section]; people who edit the file
    by hand after a save expect the [[calendar]] blocks of config.example.toml.
    """
    top = {k: v for k, v in data.items() if not isinstance(v, dict) and not _is_table_list(v)}
    parts = [tomli_w.dumps(top)] if top else []
    for key, value in data.items():
        if isinstance(value, dict):
            parts.append(tomli_w.dumps({key: value}))
        elif _is_table_list(value):
            parts += [f"[[{_key(key)}]]\n" + tomli_w.dumps(item) for item in value]
    return "\n".join(part.rstrip("\n") + "\n" for part in parts)


def restore_backup(path, expected_digest) -> str:
    """Puts the backup back. The file it replaces becomes the new backup, so this can be undone."""
    backup = os.fspath(path) + BACKUP_SUFFIX
    _refuse_link(os.fspath(path))
    with _LOCK:
        try:
            data, raw = config.read_toml(backup)
        except config.ConfigMissing:
            raise config.ConfigInvalid("unreadable", path=backup, error="FileNotFoundError") from None
        check(data)
        return _replace(path, raw, expected_digest)


def _is_digest(value) -> bool:
    return isinstance(value, str) and _DIGEST.fullmatch(value) is not None


def _replace(path, new: bytes, expected_digest) -> str:
    """Writes ``new`` if the file still has ``expected_digest``, then keeps the old bytes as backup.

    The new file goes first: if the backup write then fails, config.toml already holds the good
    bytes. (Writing the backup first could overwrite the only good copy during a restore.)
    """
    path = os.fspath(path)
    if not _is_digest(expected_digest):  # it comes from a browser form; never crash on it
        raise ConfigChanged()
    with _LOCK:
        _refuse_link(path)
        try:
            old = config.read_bytes(path)
        except config.ConfigMissing:
            old = None
        if not hmac.compare_digest(digest(old or b""), expected_digest):
            raise ConfigChanged()
        write_private(path, new)
        if old is not None:
            write_private(path + BACKUP_SUFFIX, old)
    return digest(new)
