"""Import & self-update diagnostics: pure, side-effect-free re-derivations of the
decisions made by fetch.py and ytupdate.py.

The real modules can't be reused here: fetch.py imports yt-dlp at module load, while a
diagnostic must work without yt-dlp installed and must never touch the network or disk.
The decision logic is therefore mirrored (small, and kept byte-for-byte equivalent in
shape), and tests/test_diagnostics.py cross-checks every mirrored decision against the
real classify_url / candidates / update on identical inputs so the two cannot drift.

Guarantees:
  * stdlib-only imports (no yt-dlp, no project modules that pull it in);
  * no network, no filesystem access, no clock reads -- everything is passed in as data;
  * return values are built from dict/list/str/int/float/bool/None only, so json.dumps
    always succeeds and no Path or function ever escapes.
"""
import re
from urllib.parse import parse_qs, urlparse

# Mirrored from fetch.py (see the comment there: markers stay narrow on purpose, because
# yt-dlp's sign-in / age-gate errors merely *suggest* --cookies and are not cookie-read
# failures). The CookieLoadError type branch of _is_cookie_error can't be observed from
# error text alone, so diagnose_error_text covers the text-marker half of that decision.
COOKIE_MARKERS = ("cookies database", "keyring", "decrypt", "failed to load cookies")
# Placeholder titles YouTube gives playlist entries we can't fetch.
UNAVAILABLE_TITLES = {"[private video]", "[deleted video]"}
YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}

# Mirrored from ytupdate.py.
CHECK_EVERY = 24 * 3600  # PyPI is asked at most once a day
KEEP = 2                 # newest downloaded versions kept


def _check(name, passed, reason=None):
    """One ordered diagnostic step. ``reason`` is set only when the step failed."""
    return {"name": name, "passed": bool(passed), "reason": None if passed else reason}


# --- mirrored primitives (ytupdate.py / fetch.py) -------------------------------------
def parse_version(v):
    """'2026.10.26' -> [2026, 10, 26]. Lists (not tuples) so the output is JSON-safe."""
    return [int(x) for x in re.findall(r"\d+", v)]


def ejs_pin(requires_dist):
    """The exact yt-dlp-ejs==X pin from a requires_dist list, or None."""
    for r in requires_dist or []:
        m = re.match(r"\s*yt-dlp-ejs\s*==\s*([0-9][^;\s,]*)", r)
        if m:
            return m.group(1)
    return None


def pick_wheel(release):
    """The pure-Python (py3-none-any) wheel entry of a PyPI release description, or None."""
    for u in (release or {}).get("urls", []):
        if u.get("packagetype") == "bdist_wheel" and u.get("filename", "").endswith("-py3-none-any.whl"):
            return u
    return None


def _is_cookie_error_text(text):
    """Text-marker half of fetch._is_cookie_error (the CookieLoadError type branch has no
    representation in a plain string)."""
    low = str(text).lower()
    return [m for m in COOKIE_MARKERS if m in low]


# --- entry 1: URL import diagnosis -----------------------------------------------------
def diagnose_url(url):
    """Classify a YouTube URL exactly as fetch.classify_url would, without importing it.

    Returns a JSON-safe dict:
      kind          "video" | "playlist" | "invalid"
      id            the video/playlist id when importable, else None
      importable    True unless the real classify_url would raise ValueError
      ignored_list  the list= value a watch/short link carries but must not import, else None
      checks        ordered [{name, passed, reason}] tracing the classification steps
    """
    text = url.strip() if isinstance(url, str) else str(url)
    u = urlparse(text)
    host = (u.hostname or "").lower()
    q = parse_qs(u.query)

    kind, item_id, ignored_list = "invalid", None, None
    checks = []

    host_ok = host == "youtu.be" or host in YT_HOSTS
    checks.append(_check(
        "hostname_supported", host_ok,
        f"hostname {host or '(none)'} is not youtu.be or a youtube.com/music/m.youtube host"))

    if host_ok:
        if host == "youtu.be":
            vid = u.path.strip("/")
            ok = bool(vid)
            checks.append(_check("short_link_has_video_id", ok,
                                 "youtu.be link has no video id in its path"))
            if ok:
                kind, item_id = "video", vid
                if q.get("list"):
                    ignored_list = q["list"][0]
        else:
            watch_ok = u.path == "/watch" and bool(q.get("v"))
            checks.append(_check("watch_link_has_v", watch_ok,
                                 "not a /watch URL carrying a v= video parameter"))
            if watch_ok:
                kind, item_id = "video", q["v"][0]
                # A watch link wins over a trailing list=: one song, not the radio mix.
                if q.get("list"):
                    ignored_list = q["list"][0]
            else:
                playlist_ok = u.path == "/playlist" and bool(q.get("list"))
                checks.append(_check("playlist_link_has_list", playlist_ok,
                                     "not a /playlist URL carrying a list= parameter"))
                if playlist_ok:
                    kind, item_id = "playlist", q["list"][0]

    importable = kind != "invalid"
    checks.append(_check(
        "importable", importable,
        None if importable else "URL is neither a YouTube video nor a playlist and would be rejected"))

    return {
        "url": text,
        "kind": kind,
        "id": item_id,
        "importable": importable,
        "ignored_list": ignored_list,
        "checks": checks,
    }


# --- entry 2: pylib / self-update diagnosis -------------------------------------------
def _complete_versions(snapshot):
    """Mirror of ytupdate.installed over an in-memory snapshot: (version-list, name),
    newest first. Only real, non-dot directories carrying COMPLETE count."""
    found = []
    for e in snapshot or []:
        if e.get("is_dir") and not e.get("dot") and e.get("complete"):
            found.append((parse_version(e["name"]), e["name"]))
    found.sort(key=lambda pair: pair[0], reverse=True)
    return found


def diagnose_pylib(snapshot, bundled, release=None, *, last_check_age=None):
    """Diagnose the yt-dlp self-update state from a pylib directory snapshot.

    snapshot entries are plain dicts: {"name", "is_dir", "complete" (has a COMPLETE
    marker), "dot" (name starts with '.')} -- e.g. produced by walking the directory
    elsewhere; this function itself never touches the filesystem.
    bundled: the version the app ships with. release: optional PyPI release description
    with info.version, info.requires_dist and a urls list. last_check_age: seconds since
    the last-check stamp was written, or None when no stamp exists (mirror of the
    now - st_mtime < CHECK_EVERY throttle test).

    Returns a JSON-safe dict with the installed complete versions (newest first), the
    activatable candidates (identical ordering to ytupdate.candidates), whether the
    published latest is newer than both bundled and installed, the wheel file name and
    whether a sha256 digest accompanies it, the projected retain/prune conclusion, and
    the ordered check list.
    """
    complete = _complete_versions(snapshot)
    bundled_tuple = parse_version(bundled)
    checks = [
        _check("bundled_version_parseable", bool(bundled_tuple),
               f"bundled version {bundled!r} contains no numeric version segments"),
    ]

    installed_versions = [name for _, name in complete]
    candidates = [name for v, name in complete if v > bundled_tuple]

    info = (release or {}).get("info") or {}
    latest = info.get("version")
    have = max([bundled_tuple] + [v for v, _ in complete])
    best_name = complete[0][1] if complete and complete[0][0] >= bundled_tuple else f"bundled {bundled}"
    latest_tuple = parse_version(latest) if latest else []
    latest_newer = bool(latest) and latest_tuple > have

    checks.append(_check("release_description_present", release is not None,
                         "no PyPI release description was supplied"))
    checks.append(_check(
        "latest_newer_than_bundled_and_installed", latest_newer,
        (f"latest {latest} is not newer than the best available version {best_name} "
         f"({'.'.join(map(str, have))})") if latest else "release description has no info.version"))

    wheel_entry = pick_wheel(release) if release else None
    wheel = None
    if wheel_entry:
        sha = (wheel_entry.get("digests") or {}).get("sha256")
        wheel = {
            "filename": wheel_entry.get("filename"),
            "url": wheel_entry.get("url"),
            "sha256": sha,
            "sha256_present": bool(sha),
        }
    checks.append(_check("pure_python_wheel_available", wheel_entry is not None,
                         "release has no bdist_wheel whose filename ends in -py3-none-any.whl"))
    checks.append(_check("wheel_sha256_available", bool(wheel and wheel["sha256_present"]),
                         "the wheel entry carries no digests.sha256, so it cannot be verified"))

    throttled = last_check_age is not None and last_check_age < CHECK_EVERY
    checks.append(_check(
        "daily_throttle_expired", not throttled,
        f"last-check was {last_check_age:g}s ago, under the {CHECK_EVERY}s interval; PyPI is not asked yet"
        if throttled else None))

    would_download = latest_newer and wheel_entry is not None and bool(
        wheel and wheel["sha256_present"]) and not throttled
    fail_names = [c["name"] for c in checks if not c["passed"]]
    checks.append(_check(
        "download_would_start", would_download,
        None if would_download else "no download would start; failed step(s): " + ", ".join(fail_names)))

    # Mirror of update's tail: once the new version lands, only the newest KEEP survive.
    if latest_newer:
        projected = sorted(complete + [(latest_tuple, latest)], key=lambda pair: pair[0], reverse=True)
    else:
        projected = complete
    retain = [name for _, name in projected[:KEEP]]
    prune = [name for _, name in projected[KEEP:]]

    return {
        "bundled": bundled,
        "bundled_version": bundled_tuple,
        "installed_versions": installed_versions,
        "candidates": candidates,
        "latest_version": latest,
        "latest_newer": latest_newer,
        "ejs_pin": ejs_pin(info.get("requires_dist")),
        "wheel": wheel,
        "wheel_filename": wheel["filename"] if wheel else None,
        "wheel_sha256_present": bool(wheel and wheel["sha256_present"]),
        "throttled": throttled,
        "would_download": would_download,
        "retain_after_update": retain,
        "prune_after_update": prune,
        "checks": checks,
    }


# --- entry 3: playlist entry diagnosis (boundary mirror of fetch._song_from_entry) -----
def diagnose_playlist_entry(entry):
    """Explain whether a flat playlist entry would become a Song, mirroring
    fetch._song_from_entry (private/deleted and id/title-less entries are dropped;
    a missing duration is legal and recorded as 0.0). Never raises."""
    e = entry or {}
    vid = e.get("id")
    title = e.get("title")
    has_id = bool(vid)
    has_title = bool(title)
    unavailable = has_title and title.strip().lower() in UNAVAILABLE_TITLES
    duration_present = e.get("duration") is not None
    usable = has_id and has_title and not unavailable

    checks = [
        _check("has_id", has_id, "entry has no id"),
        _check("has_title", has_title, "entry has no title"),
        _check("title_available", not unavailable,
               f"title {title!r} is a private/deleted placeholder and the entry is skipped"),
        _check("duration_present", duration_present,
               "duration missing; the entry is still usable and duration is recorded as 0.0"),
        _check("usable", usable,
               None if usable else "entry would be dropped by the playlist reader"),
    ]
    song = None
    if usable:
        song = {
            "id": vid,
            "title": title,
            "channel": e.get("channel") or e.get("uploader") or "",
            "duration": float(e.get("duration") or 0.0),
            "status": "queued",
        }
    return {
        "usable": usable,
        "duration_defaulted": usable and not duration_present,
        "song": song,
        "checks": checks,
    }


# --- entry 4: error-text diagnosis (text half of fetch._is_cookie_error) ---------------
def diagnose_error_text(text):
    """Decide whether an error message is a cookie-READ failure. A bare --cookies hint
    (sign-in / age-gate / bot check) must not be mislabelled: only the narrow markers
    count, matching fetch._is_cookie_error's text branch."""
    matched = _is_cookie_error_text(text)
    is_cookie = bool(matched)
    return {
        "text": str(text),
        "is_cookie_error": is_cookie,
        "matched_markers": matched,
        "checks": [
            _check(
                "narrow_cookie_marker_found", is_cookie,
                "no cookie-read marker (cookies database/keyring/decrypt/failed to load cookies); "
                "a --cookies usage hint is an age-gate/sign-in error, not a cookie-read failure"),
        ],
    }
