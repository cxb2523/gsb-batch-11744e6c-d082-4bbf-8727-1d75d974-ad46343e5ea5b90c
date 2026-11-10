"""Writes files that hold secrets: owner-only (mode 600) and atomic."""
from __future__ import annotations

import os
import threading

# Windows opens files in text mode unless told otherwise, which would turn \n into \r\n.
_FLAGS = os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_BINARY", 0)
# One writer at a time in this process, so the stale-tmp cleanup never hits a live writer's file.
_LOCK = threading.Lock()


def _remove(path: str) -> None:
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def write_private(path: str | os.PathLike, data: bytes) -> None:
    """Replaces ``path`` with ``data`` atomically. The file is mode 600 whatever the umask.

    The bytes go to ``path + ".tmp"`` first (created exclusively, so it never inherits the mode
    of an old file), are flushed to disk and then renamed over ``path``; the folder is flushed
    too, so a power loss right after the save cannot undo the rename.
    """
    path = os.fspath(path)
    tmp = path + ".tmp"
    with _LOCK:
        _remove(tmp)  # left behind by a crash; O_EXCL would refuse it
        fd = os.open(tmp, _FLAGS, 0o600)  # if this fails, the tmp is not ours to remove
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except BaseException:
            _remove(tmp)
            raise
        _sync_folder(path)


def _sync_folder(path: str) -> None:
    """Flushes the folder entry of ``path`` where the system allows it (not on Windows)."""
    try:
        fd = os.open(os.path.dirname(os.path.abspath(path)), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass  # some file systems cannot flush a folder; the file itself is already on disk
    finally:
        os.close(fd)
