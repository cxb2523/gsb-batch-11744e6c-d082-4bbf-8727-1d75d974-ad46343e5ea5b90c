import os
import re
import threading

import pytest

from inkdoor.web.auth import (
    LoginLimiter,
    PasswordWatcher,
    Sessions,
    generate_password,
    hash_password,
    password_path,
    read_password_hash,
    set_password,
    verify_password,
)


class FakeClock:
    def __init__(self, now: float = 1000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# --- passwords ---------------------------------------------------------------------------------

def test_generated_password_shape():
    pw = generate_password()
    assert re.fullmatch(r"[2-9a-hjkmnp-z]{4}(-[2-9a-hjkmnp-z]{4}){3}", pw)


def test_generated_passwords_differ():
    assert len({generate_password() for _ in range(20)}) == 20


def test_verify_tolerates_phone_keyboards():
    enc = hash_password("k7mq-x3vt-9hwp-r2nd")
    assert verify_password("K7mq-x3vt-9hwp-r2nd", enc)
    assert verify_password(" k7mqx3vt9hwpr2nd ", enc)
    assert verify_password("K7MQ X3VT 9HWP R2ND", enc)
    assert not verify_password("k7mq-x3vt-9hwp-r2ne", enc)


def test_verify_ignores_any_whitespace():
    enc = hash_password("k7mq-x3vt-9hwp-r2nd")
    assert verify_password("k7mq\u00a0x3vt\u00a09hwp\tr2nd\n", enc)


def test_user_chosen_password_stays_case_sensitive():
    enc = hash_password("Correct Horse 1!")
    assert verify_password("Correct Horse 1!", enc)
    assert not verify_password("correct horse 1!", enc)


def test_hash_format():
    enc = hash_password("x")
    assert enc.startswith("scrypt$16384$8$1$")
    assert len(enc.split("$")) == 6


def test_same_password_gets_a_new_salt():
    assert hash_password("k7mq-x3vt-9hwp-r2nd") != hash_password("k7mq-x3vt-9hwp-r2nd")


@pytest.mark.parametrize("encoded", [
    None,
    "",
    "garbage",
    "scrypt$16384$8$1$AAAA$AAAA",                      # salt too short
    "bcrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "scrypt$16383$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "scrypt$1073741824$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "scrypt$16384$0$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "scrypt$16384$8$1$!!!!$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
])
def test_verify_fails_closed_on_bad_hashes(encoded):
    assert verify_password("anything", encoded) is False


def test_password_path_is_next_to_the_config(tmp_path):
    assert password_path(str(tmp_path / "config.toml")) == str(tmp_path / "admin-password")
    assert password_path("config.toml") == os.path.join(os.getcwd(), "admin-password")


def test_corrupt_or_missing_file_fails_closed(tmp_path):
    path = tmp_path / "admin-password"
    assert read_password_hash(path) is None                       # missing
    path.write_text("not a hash\n")
    assert read_password_hash(path) is None                       # garbage
    path.write_bytes(b"\xff\xfe\x00")
    assert read_password_hash(path) is None                       # not text
    good = hash_password("k7mq-x3vt-9hwp-r2nd")
    path.write_text(good[:-5] + "\n")
    assert read_password_hash(path) is None                       # truncated
    path.write_text(good + "\n")
    assert read_password_hash(path) == good
    assert read_password_hash(tmp_path) is None                   # a directory, not a file


def test_set_password_round_trip(tmp_path):
    path = tmp_path / "admin-password"
    set_password(path, "k7mq-x3vt-9hwp-r2nd")
    assert verify_password("K7MQ-X3VT-9HWP-R2ND", read_password_hash(path))
    assert path.read_text().count("\n") == 1


def test_password_file_is_private(tmp_path):
    old = os.umask(0o022)
    try:
        set_password(tmp_path / "admin-password", generate_password())
    finally:
        os.umask(old)
    assert os.stat(tmp_path / "admin-password").st_mode & 0o777 == 0o600


# --- password watcher --------------------------------------------------------------------------

def test_watcher_detects_replacement(tmp_path):
    path = tmp_path / "admin-password"
    set_password(path, "first password")
    watcher = PasswordWatcher(path)
    assert watcher.changed() is False                             # first call primes
    assert watcher.changed() is False
    set_password(path, "second password")
    assert watcher.changed() is True
    assert watcher.changed() is False
    os.unlink(path)
    assert watcher.changed() is True                              # deleted
    assert watcher.changed() is False                             # still missing
    set_password(path, "third password")
    assert watcher.changed() is True                              # created again


def test_watcher_primes_on_a_missing_file(tmp_path):
    watcher = PasswordWatcher(tmp_path / "admin-password")
    assert watcher.changed() is False
    set_password(tmp_path / "admin-password", "first password")
    assert watcher.changed() is True


# --- sessions ----------------------------------------------------------------------------------

def test_sessions_expire_after_7_days():
    clock = FakeClock()
    sessions = Sessions(clock)
    session = sessions.create()
    assert session.expires == clock.now + 7 * 86400
    clock.advance(7 * 86400 - 1)
    assert sessions.get(session.sid) is session
    clock.advance(2)
    assert sessions.get(session.sid) is None
    clock.advance(-10)                                            # dropped, not just hidden
    assert sessions.get(session.sid) is None


def test_session_ids_and_csrf_tokens_are_random():
    sessions = Sessions()
    a, b = sessions.create(), sessions.create()
    assert a.sid != b.sid and a.csrf != b.csrf and a.sid != a.csrf
    assert len(a.sid) >= 43 and len(a.csrf) >= 43                 # 32 bytes, urlsafe base64


def test_session_repr_hides_secrets():
    session = Sessions().create()
    text = repr(session)
    assert session.sid not in text and session.csrf not in text


def test_sessions_drop_and_drop_all():
    sessions = Sessions()
    a, b, c = sessions.create(), sessions.create(), sessions.create()
    sessions.drop(a.sid)
    sessions.drop("unknown")
    assert sessions.get(a.sid) is None
    assert sessions.get(b.sid) is b
    sessions.drop_all()
    assert sessions.get(b.sid) is None and sessions.get(c.sid) is None


def test_drop_all_starts_a_new_generation():
    sessions = Sessions()
    before = sessions.generation
    sessions.drop_all()
    # a login that read the generation before the drop gets no session
    assert sessions.create(expected_generation=before) is None
    assert len(sessions) == 0
    assert sessions.create(expected_generation=sessions.generation) is not None
    assert sessions.create() is not None


def test_unknown_or_empty_session_ids():
    sessions = Sessions()
    assert sessions.get("nope") is None
    assert sessions.get("") is None
    assert sessions.get(None) is None


def test_expired_sessions_do_not_accumulate():
    clock = FakeClock()
    sessions = Sessions(clock, lifetime=10)
    for _ in range(50):
        sessions.create()
    clock.advance(11)
    live = sessions.create()
    assert len(sessions) == 1
    assert sessions.get(live.sid) is live


def test_sessions_are_thread_safe():
    sessions = Sessions()
    created, failures = [], []

    def work():
        # an assert here would only print a warning: collect problems for the main thread
        try:
            for _ in range(200):
                s = sessions.create()
                created.append(s)
                if sessions.get(s.sid) is not s:
                    failures.append(f"session {len(created)} not found")
        except Exception as ex:
            failures.append(repr(ex))

    threads = [threading.Thread(target=work) for _ in range(8)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    assert failures == []
    assert len(sessions) == 1600 == len({s.sid for s in created})


# --- login limiter -----------------------------------------------------------------------------

def test_limiter_backoff():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    for _ in range(5):
        assert lim.retry_after("a") == 0
        lim.failed("a")
        clock.advance(1)
    assert lim.retry_after("a") == pytest.approx(60, abs=1)
    clock.advance(60)
    lim.failed("a")
    assert lim.retry_after("a") == pytest.approx(120, abs=1)
    assert lim.retry_after("b") <= 1                              # other IPs only slowed globally


def test_limiter_caps_at_one_hour():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    for _ in range(30):
        lim.failed("a")
        clock.advance(1)
    assert lim.retry_after("a") == pytest.approx(3600, abs=1)
    clock.advance(3600)
    assert lim.retry_after("a") == 0


def test_limiter_global_slowdown_is_one_attempt_per_second():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    lim.failed("a")
    assert lim.retry_after("b") == pytest.approx(1)
    clock.advance(0.4)
    assert lim.retry_after("b") == pytest.approx(0.6)
    clock.advance(0.6)
    assert lim.retry_after("b") == 0
    lim.succeeded("b")                                            # successes count as attempts too
    assert lim.retry_after("c") == pytest.approx(1)


def test_limiter_success_resets_the_ip():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    for _ in range(4):
        lim.failed("a")
        clock.advance(1)
    lim.succeeded("a")
    clock.advance(1)
    for _ in range(4):
        lim.failed("a")
        clock.advance(1)
    assert lim.retry_after("a") == 0                              # 4 failures since the reset


def test_limiter_forgets_old_entries():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    for i in range(100):
        lim.failed(f"10.0.0.{i}")
    assert len(lim) == 100
    clock.advance(3601)
    lim.failed("10.0.1.1")
    assert len(lim) == 1


def test_limiter_keeps_entries_still_waiting():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    for _ in range(30):
        lim.failed("a")                                           # waits an hour from the last
    clock.advance(1800)
    lim.failed("b")
    assert len(lim) == 2
    assert lim.retry_after("a") == pytest.approx(1800, abs=1)


def test_limiter_reserves_the_global_slot():
    clock = FakeClock()
    lim = LoginLimiter(clock)
    assert lim.retry_after("a") == 0                              # allowed: the slot is now taken
    assert lim.retry_after("b") == pytest.approx(1)               # a concurrent request must wait
    assert lim.retry_after("a") == pytest.approx(1)
    clock.advance(1)
    assert lim.retry_after("b") == 0
