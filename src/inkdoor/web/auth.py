"""Admin password, in-memory sessions and the login rate limit.

The password file holds one line, ``scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>``. Anything else,
or no file at all, means nobody can log in: it never means "no password".
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from dataclasses import dataclass, field

from ..files import write_private

ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"  # no 0/o, 1/l/i: easy to read off a terminal
_GROUPS, _GROUP_SIZE = 4, 4

SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1
SALT_BYTES, HASH_BYTES = 16, 32
_MAX_SCRYPT_MEMORY = 128 * 1024 * 1024
_FORMAT = re.compile(r"scrypt\$([0-9]{1,8})\$([0-9]{1,3})\$([0-9]{1,3})\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)")

FILE_NAME = "admin-password"


# --- passwords ---------------------------------------------------------------------------------

def generate_password() -> str:
    """16 characters from ALPHABET (about 78 bits) in groups of four: ``k7mq-x3vt-9hwp-r2nd``."""
    chars = "".join(secrets.choice(ALPHABET) for _ in range(_GROUPS * _GROUP_SIZE))
    return "-".join(chars[i:i + _GROUP_SIZE] for i in range(0, len(chars), _GROUP_SIZE))


def _strip(password: str) -> str:
    return "".join(password.split()).replace("-", "")  # any whitespace, e.g. a no-break space


def password_length(password: str) -> int:
    """How many characters of the password count: dashes and whitespace are not checked."""
    return len(_strip(password))


def _normalize(password: str) -> bytes:
    """Removes dashes and whitespace, and lowercases passwords made only of ALPHABET characters.

    Phone keyboards capitalize the first letter, so a generated password is accepted in any case;
    a password the user chose with other characters stays case-sensitive.
    """
    text = _strip(password)
    lowered = text.lower()
    if lowered and all(c in ALPHABET for c in lowered):
        text = lowered
    return text.encode("utf-8")


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int, length: int) -> bytes:
    return hashlib.scrypt(_normalize(password), salt=salt, n=n, r=r, p=p, dklen=length,
                          maxmem=_scrypt_memory(n, r, p) + 1024 * 1024)


def _scrypt_memory(n: int, r: int, p: int) -> int:
    """What OpenSSL allocates for these parameters (the V and B buffers)."""
    return 128 * r * (n + 2 + p)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, HASH_BYTES)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def _parse(encoded) -> tuple[int, int, int, bytes, bytes] | None:
    """The parameters of a stored hash, or None when it is not one we would have written."""
    if not isinstance(encoded, str):
        return None
    match = _FORMAT.fullmatch(encoded)
    if not match:
        return None
    n, r, p = (int(match.group(i)) for i in (1, 2, 3))
    if not (2**10 <= n <= 2**20 and n & (n - 1) == 0 and 1 <= r <= 32 and 1 <= p <= 16):
        return None
    if _scrypt_memory(n, r, p) > _MAX_SCRYPT_MEMORY:
        return None
    try:
        salt = base64.b64decode(match.group(4), validate=True)
        digest = base64.b64decode(match.group(5), validate=True)
    except (binascii.Error, ValueError):
        return None
    if len(salt) != SALT_BYTES or not 16 <= len(digest) <= 64:
        return None
    return n, r, p, salt, digest


def verify_password(password: str, encoded: str | None) -> bool:
    """True only for the right password and a well-formed hash; never raises."""
    parsed = _parse(encoded)
    if parsed is None or not isinstance(password, str):
        return False
    n, r, p, salt, digest = parsed
    try:
        candidate = _scrypt(password, salt, n, r, p, len(digest))
    except (ValueError, MemoryError):
        return False
    return hmac.compare_digest(candidate, digest)


def password_path(config_path: str) -> str:
    """The password file lives next to config.toml."""
    return os.path.join(os.path.dirname(os.path.abspath(config_path)), FILE_NAME)


def read_password_hash(path) -> str | None:
    """The stored hash, or None when the file is missing, unreadable or malformed."""
    try:
        with open(path, "rb") as f:
            text = f.read(4096).decode("ascii").strip()
    except (OSError, UnicodeDecodeError):
        return None
    return text if _parse(text) is not None else None


def set_password(path, password: str) -> None:
    """Replaces the password file (atomic, mode 600)."""
    write_private(path, (hash_password(password) + "\n").encode("ascii"))


class PasswordWatcher:
    """Notices when the password file is replaced, created or deleted (e.g. by `inkdoor password`)."""

    def __init__(self, path):
        self.path = os.fspath(path)
        self._lock = threading.Lock()
        self._signature = None
        self._primed = False

    def _stat(self):
        try:
            st = os.stat(self.path)
        except OSError:
            return None  # "missing" is a state of its own: deleting the file is a change
        return st.st_ino, st.st_size, st.st_mtime_ns

    def changed(self) -> bool:
        """True when the file differs from the last call. The first call only records it."""
        with self._lock:  # stat under the lock, so two requests cannot both report one change
            signature = self._stat()
            if not self._primed:
                self._primed, self._signature = True, signature
                return False
            if signature == self._signature:
                return False
            self._signature = signature
            return True


# --- sessions ----------------------------------------------------------------------------------

@dataclass(frozen=True)
class Session:
    sid: str = field(repr=False)   # secrets: keep them out of logs and tracebacks
    csrf: str = field(repr=False)
    expires: float
    # one-shot messages for the next page ("saved", "changed elsewhere"); the list is mutable
    notices: list[str] = field(default_factory=list, repr=False, compare=False)
    # one-shot flags, like notices: "watch_render" after a save or "Update now" asked for a
    # render, so the next Home page watches for the new screen
    flags: set[str] = field(default_factory=set, repr=False, compare=False)


class Sessions:
    """Logged-in browsers, in memory only: a restart logs everyone out.

    ``drop_all`` starts a new generation. A login reads ``generation`` before it reads the password
    hash and passes it to ``create``: if everyone was logged out meanwhile (the password changed
    while scrypt ran), the login gets no session, so an old password cannot outlive the change.
    """

    def __init__(self, clock=time.time, lifetime: float = 7 * 86400):
        self._clock = clock
        self._lifetime = lifetime
        self._lock = threading.Lock()
        self._sessions: dict[str, Session] = {}
        self._generation = 0

    @property
    def generation(self) -> int:
        with self._lock:
            return self._generation

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)

    def _prune(self, now: float) -> None:
        for sid in [sid for sid, s in self._sessions.items() if s.expires <= now]:
            del self._sessions[sid]

    def prune(self) -> None:
        """Forgets expired sessions."""
        with self._lock:
            self._prune(self._clock())

    def create(self, expected_generation: int | None = None) -> Session | None:
        """A new session; None when ``expected_generation`` is given and has ended."""
        now = self._clock()
        session = Session(secrets.token_urlsafe(32), secrets.token_urlsafe(32), now + self._lifetime)
        with self._lock:
            if expected_generation is not None and expected_generation != self._generation:
                return None
            self._prune(now)
            self._sessions[session.sid] = session
        return session

    def get(self, sid: str | None) -> Session | None:
        if not sid:
            return None
        now = self._clock()
        with self._lock:
            session = self._sessions.get(sid)
            if session is None:
                return None
            if session.expires <= now:
                del self._sessions[sid]
                return None
            return session

    def drop(self, sid: str | None) -> None:
        with self._lock:
            self._sessions.pop(sid, None)

    def drop_all(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._generation += 1


# --- login rate limit --------------------------------------------------------------------------

class LoginLimiter:
    """Per-IP backoff after repeated failures, plus a global pace of one attempt per second.

    After FREE_FAILURES failures from one IP, the next attempt waits BASE_WAIT seconds from the
    last failure, doubling with each further failure up to MAX_WAIT. There is no global lockout:
    other IPs only wait for the global pace, so a correct password is never refused for long.
    Check ``retry_after`` before running scrypt: when it allows an attempt it also reserves the
    global slot, so concurrent requests cannot all pass at once.
    """

    FREE_FAILURES = 5
    BASE_WAIT = 60.0
    MAX_WAIT = 3600.0
    GLOBAL_INTERVAL = 1.0
    FORGET_AFTER = 3600.0
    _SWEEP_EVERY = 60.0

    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._lock = threading.Lock()
        self._failures: dict[str, tuple[int, float]] = {}  # ip -> (count, time of last failure)
        self._last_attempt: float | None = None
        self._last_sweep: float | None = None

    def __len__(self) -> int:
        with self._lock:
            return len(self._failures)

    def _wait(self, count: int) -> float:
        if count < self.FREE_FAILURES:
            return 0.0
        doublings = min(count - self.FREE_FAILURES, 16)  # 2**16 minutes is far past the cap
        return min(self.BASE_WAIT * 2**doublings, self.MAX_WAIT)

    def _ip_remaining(self, ip: str, now: float) -> float:
        entry = self._failures.get(ip)
        if entry is None:
            return 0.0
        count, last = entry
        return max(0.0, last + self._wait(count) - now)

    def _sweep(self, now: float) -> None:
        if self._last_sweep is not None and now - self._last_sweep < self._SWEEP_EVERY:
            return
        self._last_sweep = now
        stale = [ip for ip, (_, last) in self._failures.items()
                 if now - last > self.FORGET_AFTER and self._ip_remaining(ip, now) == 0]
        for ip in stale:
            del self._failures[ip]

    def retry_after(self, ip: str) -> float:
        """Seconds this IP must wait before its next attempt; 0 when it may try now.

        Side effect: returning 0 records an attempt now (the global one-per-second slot is taken),
        so call it once per login attempt, right before checking the password. The caller then
        reports the outcome with ``failed`` or ``succeeded``.
        """
        now = self._clock()
        with self._lock:
            wait = self._ip_remaining(ip, now)
            if self._last_attempt is not None:
                wait = max(wait, self._last_attempt + self.GLOBAL_INTERVAL - now)
            if wait <= 0:
                self._last_attempt = now
                return 0.0
            return wait

    def failed(self, ip: str) -> None:
        now = self._clock()
        with self._lock:
            self._sweep(now)
            count, _ = self._failures.get(ip, (0, now))
            self._failures[ip] = (count + 1, now)
            self._last_attempt = now

    def succeeded(self, ip: str) -> None:
        now = self._clock()
        with self._lock:
            self._failures.pop(ip, None)
            self._last_attempt = now
