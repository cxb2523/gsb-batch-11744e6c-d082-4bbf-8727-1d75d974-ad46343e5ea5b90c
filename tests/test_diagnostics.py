"""Tests for autodeck.diagnostics: self-made local samples, no network, no real
credentials. The consistency cases re-run the real fetch.classify_url /
ytupdate.candidates / ytupdate.update on identical inputs and assert identical verdicts."""
import hashlib
import io
import json
import zipfile

import pytest

from autodeck import diagnostics as diag
from autodeck import ytupdate


# --- source-level guarantees -----------------------------------------------------------
def test_module_is_stdlib_only_and_pulls_in_no_yt_dlp():
    import ast
    from pathlib import Path

    src = Path(diag.__file__).read_text(encoding="utf-8")
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots = [a.name.split(".")[0] for a in node.names]
        elif isinstance(node, ast.ImportFrom):
            roots = [(node.module or "").split(".")[0]]
        else:
            continue
        assert "yt_dlp" not in roots and "autodeck" not in roots, roots
    assert "yt_dlp" not in src


# --- entry 1: diagnose_url -------------------------------------------------------------
def _assert_json_safe(obj):
    # Round-trip; raises on tuples-as-sets, Paths, functions and other non-JSON types.
    again = json.loads(json.dumps(obj))
    assert again == obj
    assert not callable(obj)
    return again


WATCH_WITH_LIST = "https://www.youtube.com/watch?v=abc123&list=RDabc"
PLAYLIST = "https://www.youtube.com/playlist?list=PL123"
SHORT = "https://youtu.be/abc123"
SHORT_WITH_QUERY = "https://youtu.be/abc123?si=xyz&list=LM"
MUSIC_WATCH = "https://music.youtube.com/watch?v=abc123"
NON_YT = "https://example.com/watch?v=abc"
NOT_A_URL = "not a url"
BARE_HOST = "https://www.youtube.com/"
WATCH_NO_V = "https://www.youtube.com/watch?list=PL1"
PLAYLIST_NO_LIST = "https://www.youtube.com/playlist"
SHORT_EMPTY = "https://youtu.be/"


def test_watch_with_list_is_single_video_and_list_marked_ignored():
    r = diag.diagnose_url(WATCH_WITH_LIST)
    _assert_json_safe(r)
    assert r["kind"] == "video" and r["id"] == "abc123" and r["importable"] is True
    assert r["ignored_list"] == "RDabc"
    names = [c["name"] for c in r["checks"]]
    assert names == ["hostname_supported", "watch_link_has_v", "importable"]
    assert all(c["passed"] and c["reason"] is None for c in r["checks"])


def test_short_link_with_list_also_ignores_list():
    r = diag.diagnose_url(SHORT_WITH_QUERY)
    assert r["kind"] == "video" and r["id"] == "abc123"
    assert r["ignored_list"] == "LM"


def test_playlist_link_imports_the_list():
    r = diag.diagnose_url(PLAYLIST)
    assert r["kind"] == "playlist" and r["id"] == "PL123"
    assert r["ignored_list"] is None  # list= is the imported id, not an ignored extra


def test_non_youtube_domain_is_not_importable():
    r = diag.diagnose_url(NON_YT)
    _assert_json_safe(r)
    assert r["kind"] == "invalid" and r["id"] is None and r["importable"] is False
    assert r["ignored_list"] is None
    failed = [c for c in r["checks"] if not c["passed"]]
    assert failed[0]["name"] == "hostname_supported" and failed[0]["reason"]
    assert any(c["name"] == "importable" and not c["passed"] for c in r["checks"])


def test_bare_host_and_malformed_urls_are_not_importable():
    for url in (NOT_A_URL, BARE_HOST, WATCH_NO_V, PLAYLIST_NO_LIST, SHORT_EMPTY):
        r = diag.diagnose_url(url)
        assert r["importable"] is False and r["kind"] == "invalid" and r["id"] is None
        _assert_json_safe(r)


def test_url_verdict_matches_classify_url_on_a_wide_sweep():
    # The diagnostic must reproduce fetch.classify_url on every input, branch by branch.
    from autodeck import fetch

    valid = [WATCH_WITH_LIST, SHORT, SHORT_WITH_QUERY, MUSIC_WATCH,
             PLAYLIST, "https://m.youtube.com/watch?v=zzz",
             "https://www.youtube.com/playlist?list=LM&si=q",
             "https://youtube.com/watch?v=a"]  # bare apex host still takes the /watch branch
    invalid = [NON_YT, NOT_A_URL, BARE_HOST, WATCH_NO_V, PLAYLIST_NO_LIST, SHORT_EMPTY,
               "http://youtu.be.evil.com/x",  # look-alike host, not the real youtu.be
               "https://www.youtube.com/feed/trending"]
    for url in valid:
        kind, item_id = fetch.classify_url(url)
        r = diag.diagnose_url(url)
        assert (r["kind"], r["id"]) == (kind, item_id) and r["importable"] is True
    for url in invalid:
        with pytest.raises(ValueError):
            fetch.classify_url(url)
        r = diag.diagnose_url(url)
        assert r["importable"] is False and r["kind"] == "invalid"


# --- entry 3: playlist entries ---------------------------------------------------------
def test_playlist_entry_without_duration_is_usable_and_defaulted():
    r = diag.diagnose_playlist_entry({"id": "ddddddddddd", "title": "D", "uploader": "U"})
    _assert_json_safe(r)
    assert r["usable"] is True and r["duration_defaulted"] is True
    assert r["song"] == {"id": "ddddddddddd", "title": "D", "channel": "U",
                         "duration": 0.0, "status": "queued"}


def test_playlist_entry_drops_private_deleted_and_idless():
    for entry in (
        {"id": "b", "title": "[Private video]"},
        {"id": "c", "title": "[Deleted video]"},
        {"id": None, "title": "no id"},
        {"id": "x", "title": ""},
        {},
    ):
        r = diag.diagnose_playlist_entry(entry)
        assert r["usable"] is False and r["song"] is None
        assert any(not c["passed"] for c in r["checks"])
        _assert_json_safe(r)


def test_playlist_entry_matches_song_from_entry():
    from autodeck import fetch

    entries = [
        {"id": "a", "title": "A", "channel": "X", "duration": 10},
        {"id": "d", "title": "D", "uploader": "U"},
        {"id": "b", "title": "[Private video]"},
        {"id": None, "title": "t"},
        {},
    ]
    for e in entries:
        song = fetch._song_from_entry(e)
        r = diag.diagnose_playlist_entry(e)
        if song is None:
            assert r["usable"] is False
        else:
            assert r["usable"] is True
            assert r["song"] == {"id": song.id, "title": song.title, "channel": song.channel,
                                 "duration": song.duration, "status": song.status}


# --- entry 4: error text ---------------------------------------------------------------
AGE_GATE = ("ERROR: [youtube] abc123: Sign in to confirm your age. Use --cookies-from-browser "
            "or --cookies for the authentication. See https://github.com/yt-dlp/yt-dlp/wiki/FAQ")


def test_age_gate_with_cookies_hint_is_not_a_cookie_error():
    r = diag.diagnose_error_text(AGE_GATE)
    _assert_json_safe(r)
    assert r["is_cookie_error"] is False and r["matched_markers"] == []
    assert not r["checks"][0]["passed"] and r["checks"][0]["reason"]


@pytest.mark.parametrize("msg", [
    "could not find chrome cookies database",
    "Failed to load cookies from browser",
    "keyring unavailable",
    "unable to decrypt cookie value",
])
def test_narrow_markers_are_cookie_errors(msg):
    r = diag.diagnose_error_text(msg)
    assert r["is_cookie_error"] is True and r["matched_markers"]
    assert r["checks"][0]["passed"]


def test_cookie_text_verdict_matches_is_cookie_error_for_generic_exceptions():
    # The type branch (CookieLoadError) isn't representable as text; for ordinary
    # exceptions the text verdict must equal fetch._is_cookie_error.
    from yt_dlp.utils import DownloadError

    from autodeck import fetch

    for msg in (AGE_GATE, "could not find chrome cookies database", "keyring unavailable",
                "ERROR: boom", "failed to load cookies"):
        assert diag.diagnose_error_text(msg)["is_cookie_error"] == fetch._is_cookie_error(DownloadError(msg))


# --- entry 2: diagnose_pylib -----------------------------------------------------------
def _snap(name, *, is_dir=True, complete=False, dot=False):
    return {"name": name, "is_dir": is_dir, "complete": complete, "dot": dot}


def _full_snapshot():
    # Old complete, new complete, newest-but-half-finished, and a dot-prefixed tmp dir.
    return [
        _snap("2026.9.1", complete=True),
        _snap("2026.11.2", complete=True),
        _snap("2026.12.1", complete=True),
        _snap("2027.1.1", complete=False),          # half-finished download
        _snap(".2027.2.2.tmp", complete=False, dot=True),
        _snap("last-check", is_dir=False),          # the throttle stamp is a file
    ]


def test_pylib_snapshot_candidates_and_retain_conclusion():
    r = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=None)
    _assert_json_safe(r)
    # Half-finished and dot dirs excluded; newest first.
    assert r["installed_versions"] == ["2026.12.1", "2026.11.2", "2026.9.1"]
    # Mirror of ytupdate.candidates: complete dirs newer than bundled, newest first.
    assert r["candidates"] == ["2026.12.1", "2026.11.2"]
    assert r["would_download"] is False  # no release description at all
    assert r["latest_version"] is None and r["wheel"] is None
    assert r["wheel_filename"] is None and r["wheel_sha256_present"] is False
    # Nothing new projected -> the keep decision is just the current KEEP newest.
    assert r["retain_after_update"] == ["2026.12.1", "2026.11.2"]
    assert r["prune_after_update"] == ["2026.9.1"]
    assert all(c["reason"] is None for c in r["checks"] if c["passed"])


def test_pylib_candidates_match_real_candidates_on_disk(tmp_path):
    # Build the same layout for real and compare against ytupdate.candidates.
    for name, complete, dot in [
        ("2026.9.1", True, False), ("2026.11.2", True, False), ("2026.12.1", True, False),
        ("2027.1.1", False, False), (".2027.2.2.tmp", False, True)]:
        d = tmp_path / name
        d.mkdir()
        if complete:
            (d / ytupdate.DONE).write_text(name)
    snapshot = [_snap(p.name, is_dir=p.is_dir(), complete=(p / ytupdate.DONE).exists(),
                      dot=p.name.startswith(".")) for p in tmp_path.iterdir()]
    real = [p.name for p in ytupdate.candidates(tmp_path, "2026.10.26")]
    r = diag.diagnose_pylib(snapshot, "2026.10.26")
    assert r["candidates"] == real == ["2026.12.1", "2026.11.2"]
    assert r["installed_versions"] == [p.name for _, p in ytupdate.installed(tmp_path)]


def _release(version="2027.3.1", *, wheel=True, sha=None, ejs="0.9.0"):
    urls = []
    if wheel:
        urls.append({
            "packagetype": "bdist_wheel",
            "filename": f"yt_dlp-{version}-py3-none-any.whl",
            "url": "https://files.example/yt.whl",
            "digests": {"sha256": sha or "a" * 64},
        })
    else:
        urls.append({"packagetype": "sdist", "filename": f"yt_dlp-{version}.tar.gz",
                     "url": "https://files.example/yt.tar.gz", "digests": {"sha256": "b" * 64}})
    return {"info": {"name": "yt-dlp", "version": version,
                     "requires_dist": [f'yt-dlp-ejs=={ejs}; extra == "default"'] if ejs else []},
            "urls": urls}


def test_new_release_with_wheel_would_download_and_prunes_to_keep():
    rel = _release("2027.3.1")
    r = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=rel)
    _assert_json_safe(r)
    assert r["latest_version"] == "2027.3.1" and r["latest_newer"] is True
    assert r["ejs_pin"] == "0.9.0"
    assert r["wheel_filename"] == "yt_dlp-2027.3.1-py3-none-any.whl"
    assert r["wheel_sha256_present"] is True and r["wheel"]["sha256"] == "a" * 64
    assert r["throttled"] is False and r["would_download"] is True
    # After 2027.3.1 lands, only the newest KEEP survive: old 2026.x dirs are pruned.
    assert r["retain_after_update"] == ["2027.3.1", "2026.12.1"]
    assert r["prune_after_update"] == ["2026.11.2", "2026.9.1"]


def test_release_without_pure_python_wheel_does_not_download():
    r = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=_release(wheel=False))
    assert r["latest_newer"] is True  # a new version exists...
    assert r["wheel"] is None and r["wheel_sha256_present"] is False
    assert r["would_download"] is False  # ...but no pure-Python wheel means no download
    wheel_check = next(c for c in r["checks"] if c["name"] == "pure_python_wheel_available")
    assert not wheel_check["passed"] and wheel_check["reason"]


def test_wheel_missing_sha256_does_not_download():
    rel = _release()
    del rel["urls"][0]["digests"]["sha256"]
    r = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=rel)
    assert r["wheel_sha256_present"] is False and r["would_download"] is False


def test_latest_not_newer_than_best_available_does_not_download():
    # 2026.11.2 is already installed completely; same version on PyPI changes nothing.
    r = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=_release("2026.11.2"))
    assert r["latest_newer"] is False and r["would_download"] is False
    newer_check = next(c for c in r["checks"] if c["name"] == "latest_newer_than_bundled_and_installed")
    assert not newer_check["passed"]


def test_throttled_snapshot_does_not_download():
    rel = _release("2027.3.1")
    r = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=rel,
                            last_check_age=3600)  # checked an hour ago, day not elapsed
    assert r["throttled"] is True and r["would_download"] is False
    throttle = next(c for c in r["checks"] if c["name"] == "daily_throttle_expired")
    assert not throttle["passed"]
    # Just past the interval, the same snapshot would download.
    r2 = diag.diagnose_pylib(_full_snapshot(), "2026.10.26", release=rel,
                             last_check_age=ytupdate.CHECK_EVERY + 1)
    assert r2["throttled"] is False and r2["would_download"] is True


def test_missing_release_and_bad_bundled_never_raise():
    r = diag.diagnose_pylib([], "", release=None)
    _assert_json_safe(r)
    assert r["installed_versions"] == [] and r["candidates"] == []
    assert r["would_download"] is False


# --- end-to-end consistency against the real ytupdate.update ---------------------------
def _wheel_bytes(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        for name, text in files.items():
            z.writestr(name, text)
    return b.getvalue()


def _fake_get_factory(release, *, wheel_ok=True):
    whl = _wheel_bytes({"yt_dlp/__init__.py": "", "yt_dlp/version.py":
                        f"__version__ = '{release['info']['version']}'"})
    digest = hashlib.sha256(whl).hexdigest()
    # Mutate first, then serialize: the real update re-parses this JSON and must see
    # the same digest the diagnostic reads from the in-memory release dict.
    release["urls"][0]["digests"]["sha256"] = digest if wheel_ok else "0" * 64
    rel_json = json.dumps(release).encode()

    def fake_get(url):
        if url.endswith("/json"):
            return rel_json
        return whl
    return fake_get, digest


@pytest.mark.parametrize("age", [None, 25 * 3600])  # no stamp, or a day-old stamp
def test_would_download_matches_real_update_decision(tmp_path, monkeypatch, age):
    rel = _release("2027.3.1")
    fake_get, digest = _fake_get_factory(rel)
    monkeypatch.setattr(ytupdate, "_get", fake_get)
    # Real layout matching _full_snapshot().
    for v in ("2026.9.1", "2026.11.2", "2026.12.1"):
        d = tmp_path / v
        d.mkdir()
        (d / ytupdate.DONE).write_text(v)
    (tmp_path / "2027.1.1").mkdir()
    (tmp_path / ".2027.2.2.tmp").mkdir()
    if age is not None:
        stamp = tmp_path / "last-check"
        stamp.write_text("")
        import os
        os.utime(stamp, (1000.0 - age, 1000.0 - age))
    snapshot = [_snap(p.name, is_dir=p.is_dir(), complete=(p / ytupdate.DONE).exists(),
                      dot=p.name.startswith(".")) for p in tmp_path.iterdir()]

    r = diag.diagnose_pylib(snapshot, "2026.10.26", release=rel, last_check_age=age)
    assert r["would_download"] is True
    assert r["wheel"]["sha256"] == digest

    got = ytupdate.update(tmp_path, "2026.10.26", now=1000.0)
    assert got == "2027.3.1"
    # And the projected retain/prune conclusion matches the real pruning tail.
    assert r["retain_after_update"] == [p.name for _, p in ytupdate.installed(tmp_path)]
    assert all(not (tmp_path / name).exists() for name in r["prune_after_update"])


def test_throttled_diagnosis_matches_real_update_which_downloads_nothing(tmp_path, monkeypatch):
    rel = _release("2027.3.1")
    calls = []
    fake_get, _ = _fake_get_factory(rel)

    def recording_get(url):
        calls.append(url)
        return fake_get(url)
    monkeypatch.setattr(ytupdate, "_get", recording_get)
    stamp = tmp_path / "last-check"
    stamp.write_text("")
    import os
    os.utime(stamp, (1000.0 - 3600.0, 1000.0 - 3600.0))
    snapshot = [_snap("last-check", is_dir=False)]

    r = diag.diagnose_pylib(snapshot, "2026.10.26", release=rel, last_check_age=3600)
    assert r["would_download"] is False and r["throttled"] is True
    assert ytupdate.update(tmp_path, "2026.10.26", now=1000.0) is None
    assert calls == []  # throttled: not even the PyPI JSON is fetched


def test_not_newer_diagnosis_matches_real_update_which_downloads_nothing(tmp_path, monkeypatch):
    rel = _release("2026.10.26")  # equal to bundled -> not newer
    calls = []
    fake_get, _ = _fake_get_factory(rel)

    def recording_get(url):
        calls.append(url)
        return fake_get(url)
    monkeypatch.setattr(ytupdate, "_get", recording_get)

    r = diag.diagnose_pylib([], "2026.10.26", release=rel)
    assert r["would_download"] is False and r["latest_newer"] is False
    assert ytupdate.update(tmp_path, "2026.10.26", now=1.0) is None
    # The JSON is fetched once, but no wheel URL is ever requested.
    assert calls == ["https://pypi.org/pypi/yt-dlp/json"]
    assert ytupdate.installed(tmp_path) == []


def test_no_pure_python_wheel_diagnosis_matches_real_update_failure(tmp_path, monkeypatch):
    rel = _release("2027.3.1", wheel=False)
    calls = []
    fake_get, _ = _fake_get_factory(rel)

    def recording_get(url):
        calls.append(url)
        return fake_get(url)
    monkeypatch.setattr(ytupdate, "_get", recording_get)

    r = diag.diagnose_pylib([], "2026.10.26", release=rel)
    assert r["would_download"] is False
    with pytest.raises(RuntimeError, match="no pure-Python wheel"):
        ytupdate.update(tmp_path, "2026.10.26", now=1.0)
    assert calls == ["https://pypi.org/pypi/yt-dlp/json"]  # JSON only, wheel never fetched
    # Only the throttle stamp remains; no half version dir.
    assert sorted(p.name for p in tmp_path.iterdir()) == ["last-check"]
