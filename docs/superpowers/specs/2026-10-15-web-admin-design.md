# Web admin: design

Status: approved in conversation on 2026-10-15; revised after an adversarial review
(see "Review changes" at the end). Pending written-spec review.

## Goal

Configure inkdoor from a browser instead of editing `config.toml` and copying it into a server or
container. After installing (for example with `deploy/proxmox/create-lxc.sh`), a user opens
`http://<server-ip>:3667`, logs in with a generated password, pastes calendar links, tests them
and sees the door screen update, without touching a terminal again.

Users: the maintainer first, but the repository is public, so it must be safe and clear for
anyone who installs it on a home network.

## Decisions already made

| Topic | Decision |
|---|---|
| Scope | The whole config: calendars, tasks, display settings, plus a live preview of the screen. Not logs, updates or restarts. |
| Transport | Plain HTTP on the LAN. No TLS. |
| Port | The same port as the Kindle image (`[server] port`, default 3667). |
| First password | Random, generated at install time and printed by the installer. |
| Stack | Flask + Jinja templates + Waitress, server-rendered pages, small first-party JS for progressive enhancement. |

### Threat model and accepted risk

The admin is meant for a home network. Without TLS, anyone who can observe LAN traffic (someone
on the Wi-Fi who knows its password, a compromised device) can read the admin password when it is
typed at login and a calendar link at the moment it is pasted. Browsers expose `crypto.subtle`
only in secure contexts, so client-side hashing is not an option.

Everything else is designed so that nothing leaks at rest or in other responses. Someone who logs
in can read the calendars, change the door, and use the "Test" button to make the server request
URLs on the LAN (see "Outbound requests" for the limits). They cannot run code on the server.

Because a laptop moves between networks, the admin is **opt-in for plain `inkdoor serve`** and
**on by default for server installs** (see "Enabling the admin").

## Architecture

One process, one port. `inkdoor serve`:

1. Loads the config (see "Startup with a broken or missing config"), creates the Flask app and
   serves it with Waitress on `0.0.0.0:<port>`. Bind errors map to the existing `PortInUse`
   message. Waitress `trusted_proxy` stays unset: `X-Forwarded-*` headers are never trusted.
2. Runs the render loop in a background thread. **Only this thread renders.** It clears a
   `threading.Event` at the start of each cycle and then waits on it with the refresh interval as
   timeout, so a save or "Update now" during a render triggers one more cycle instead of being
   lost. The admin never renders in a request thread.

Routes:

| Route | Access | Purpose |
|---|---|---|
| `GET/HEAD /kindle.png` | public | Unchanged contract: exact path (query string allowed), `image/png`, `Cache-Control: no-store`, 503 when not rendered yet. |
| `GET /` | session | Home page. Anonymous: redirect to `/login`. |
| `GET/POST /login` | public | Password form. |
| `POST /logout` | session | Logout is a POST. |
| `GET /static/<file>` | public | CSS, JS, Inter font, only files shipped in the package. |
| other admin routes | session | Anonymous GET redirects to `/login`; other methods get 401. |
| anything unknown | everyone | 404, including `/kindle.png/`, `/config.toml`, `/output/...`. The guard checks `request.url_rule is None` first, so unknown paths are never turned into redirects. |

`next=` after login only accepts relative paths that start with a single `/`.

With the admin disabled, only `/kindle.png` (and 404 for the rest) is routed, as today.

Code layout:

```
src/inkdoor/
  server.py            render loop + serve(): builds the app, runs Waitress
  net.py               LAN address detection; the one outbound fetch helper
  web/
    __init__.py        create_app(state): routes, guards, headers, error handlers
    auth.py            password hashing, password file, sessions, login rate limit
    hosts.py           Host header allowlist
    config_edit.py     read/modify/validate/write config.toml (atomic, .bak, concurrency token)
    templates/         Jinja templates (autoescape on)
    static/            admin.css, admin.js
  check.py             structured results shared by `inkdoor check` and the admin "Test" button
```

Shared state between the render loop and the app (`ServerState`): config path, output dir, the
last render summary (time, status text, per-source errors), the render `Event`, and a lock around
config writes. `SourceCache` gets its own lock.

## Enabling the admin

- New section `[admin]`: `enabled` (default `false`), `allowed_hosts` (default `[]`).
- `install.sh` writes `enabled = true` into the configs it creates, and migrates existing server
  installs by setting it once (the server case is the one the admin is for).
- Plain `inkdoor serve` on a laptop keeps today's image-only behavior until the user sets
  `enabled = true` and runs `inkdoor password`. The docs explain both.

## Configuration storage

`config.toml` stays the single source of truth; hand-editing keeps working.

- **Reading**: every admin page reads the file fresh.
- **Editing works on the raw file**, never on `config.load()` output. The admin loads the raw TOML
  dict, applies the change, then validates a *copy* with `with_defaults` + `validate`. The raw
  dict is what gets written, so defaults are not pinned into the file and `--lang` /
  `INKDOOR_LANG` overrides are never written. When an override is active, the language field is
  shown read-only with an explanation.
- **Writing**: serialize with `tomli-w`; create `config.toml.tmp` with
  `os.open(..., O_CREAT | O_EXCL | O_WRONLY, 0o600)`, write, `fsync`, write the previous content to
  `config.toml.bak` the same way (mode 600), then `os.replace`. Every file the admin creates is
  600 regardless of umask. Comments from the example are lost on the first admin save; keys the
  admin does not manage are preserved.
- **Concurrent edits**: each form carries the SHA-256 of the file as it was read. On save, if the
  file changed meanwhile (a hand edit or another tab), the save is refused with a "changed
  elsewhere, reload" message.
- **Unreadable or broken file** (`OSError`, bad encoding or syntax error): pages show the translated
  error and disable the forms. A file that parses but fails validation (e.g. a duplicate name) shows
  the error as a banner and keeps the forms enabled, so the problem can be fixed from the admin; a
  save is refused unless the result validates. `PermissionError` gets its own message that says to
  `chown inkdoor` the file. If `config.toml.bak` loads, offer "Restore previous version".
- **Symlinked file**: if `config.toml` is a symbolic link, saves and "Restore previous version" are
  refused with a translated message to edit the file by hand, since the atomic replace would turn
  the link into a regular file. The installer leaves such a link alone and says the same.
- **Missing file**: the first admin save creates it (raw dict starting from nothing, not from the
  example, so no placeholders).
- **`.gitignore`**: add `config.toml.*` and `admin-password` (the Mac checkout case).
- **Server install**: `/etc/inkdoor` is `inkdoor:inkdoor 700` and every file in it
  `inkdoor:inkdoor 600`. `install.sh` re-applies this on every run. The unit gets
  `ReadWritePaths=/etc/inkdoor` and `UMask=0077`.

## Startup with a broken or missing config

`serve` must always come up, otherwise the restore button is unreachable and the door is stuck:

1. Try `config.toml`; if it fails, try `config.toml.bak`; if that fails, use defaults (port 3667).
2. When `.bak` loads, the door keeps working from it and the admin shows the "broken file" banner
   with the restore option. When only defaults are left, the door shows the error screen (broken
   file) or the setup screen (missing file), and the admin opens in "broken file" or "first
   setup" mode.
3. The render loop keeps today's rule: it reloads each cycle and keeps the last valid config when
   the file breaks later.

## Password and sessions

- **Password file**: `admin-password` in the same directory as `config.toml`, mode 600, one line:
  `scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>` (`hashlib.scrypt`, n=2^14, r=8, p=1, 16-byte salt).
  Compared with `hmac.compare_digest`.
- **Fail closed**: a missing, unreadable or malformed password file means no login is possible;
  the login page says to run `inkdoor password`. It never means "no password".
- **Generated password**: 16 characters from `23456789abcdefghjkmnpqrstuvwxyz`, shown in groups
  of four (`k7mq-x3vt-9hwp-r2nd`), about 78 bits. When checking, dashes and spaces are removed and
  the input is lowercased if it contains only letters of that alphabet in any case, so phone
  keyboards that capitalize the first letter do not lock people out.
- **Who generates it**: `inkdoor password` (new CLI command, translated output) writes a new hash
  and prints the password once. `install.sh` runs it through the `inkdoor` wrapper (so the file is
  owned by `inkdoor`) when the file is missing, and prints the result with the admin URL.
  `inkdoor serve` never prints a password: under systemd that would land in the journal.
- **Changing it**: the Account page requires the current password; the new one must have at least
  12 characters, or the user picks "generate". The current browser gets a fresh session; all
  other sessions are dropped.
- **Sessions**: 32 random bytes (`secrets.token_urlsafe`) in memory, cookie `inkdoor_session` with
  `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Secure` (HTTP). Lifetime 7 days. A new session ID is
  issued at login. A restart logs everyone out. A change to the password file, detected with
  `os.stat` (inode, size, mtime) on each request, drops all sessions, so `inkdoor password` from a
  shell logs out the browser.
- **Rate limit**: checked **before** running scrypt. Per client IP (the socket address), after 5
  failed logins each further attempt must wait 1, 2, 4 … 60 minutes. No global lockout; instead a
  global slowdown of one login attempt per second, which never refuses a correct password for long.
  With a 78-bit generated password online guessing is not a practical threat; this only limits
  noise and CPU.

## Request guards

1. **Host allowlist** (DNS rebinding). Accept: IP literals (IPv4, bracketed IPv6, with or without
   port), `localhost`, single-label names, names ending in `.local`, `.lan`, `.home`,
   `.home.arpa`, `.internal`, `.localdomain`, `.fritz.box`, `.ts.net`, and `[admin] allowed_hosts`.
   A trailing dot is ignored. Missing Host is rejected.
   - Admin routes with a disallowed Host: 400 with a short text page that says to open the admin
     by IP and add the name under allowed hosts.
   - `/kindle.png` with a disallowed Host: **200 with a rendered error image** ("address not
     allowed": use the IP address, or add <host> to `allowed_hosts` in the `[admin]` section of
     `config.toml`; the admin has no field for it, and the image shows even with the admin off). A 4xx would make the Kindle keep its old image, possibly
     "Free". The error image carries no schedule data, so it is safe to serve to anyone. The
     rejected name is logged once.
   - The guard applies whether or not the admin is enabled.
2. **CSRF**:
   - Logged-in forms carry a per-session token in a hidden field.
   - `/login` uses a double-submit token (random cookie + hidden field), so no server state is
     created before login.
   - When `Origin` is present it must match the request's scheme, host and port (default port
     normalized). `Origin: null` is rejected. This works because the referrer policy is
     `same-origin` (see 3); with `no-referrer` browsers send `Origin: null` on every form POST.
3. **Headers** on every response except `/kindle.png`, including `/login` and error pages:
   `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none';
   form-action 'self'; base-uri 'none'`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: same-origin`, `Cache-Control: no-store`. No inline styles or scripts.

## Secret links

- Never sent back to the browser. Shown masked as the host plus the first path segment, e.g.
  `outlook.office365.com/owa/…` or `calendar.google.com/calendar/…`. Never any part of a query
  string or of the trailing token.
- Edit forms leave the link field empty (`autocomplete="off"`); empty means "keep the current
  link".
- Never logged and never in responses or error pages:
  - A Flask error handler logs only the exception type and returns a generic translated 500.
  - Every place that fetches a link catches `Exception` (not only `RequestException`, since
    `requests` puts the URL path in its messages and some malformed URLs raise other errors).
  - `run_cycle` logs the exception class name only (today it logs `str(ex)`).
- Scheme check (`http`, `https`, `webcal`, case-insensitive) applies only to links submitted in
  the admin, so a hand-edited local file path on another calendar does not block saves.

## Outbound requests

All link fetches (render loop, `inkdoor check`, admin "Test") go through one helper in `net.py`:

- `stream=True`, body capped at 5 MB, total deadline 30 s, at most 3 redirects.
- Refuses loopback, link-local (including `169.254.169.254`) and unspecified addresses, checked
  on every redirect hop. Private LAN addresses (RFC 1918, ULA) stay allowed: a calendar on a
  LAN Nextcloud or Radicale is a real use. This residual SSRF to the LAN is accepted and
  documented.
- Admin "Test" allows at most 2 concurrent tests (a non-blocking semaphore; a third gets a "busy,
  try again" answer), and Waitress gets `threads=8`, so tests can never starve `/kindle.png`.
- `[admin] enabled` is read at startup; changing it needs a restart. When neither `config.toml`
  nor `config.toml.bak` loads and the file exists (broken), the admin is enabled if an
  `admin-password` file exists next to the config, so a server install can still reach "Restore
  previous version"; a missing config file keeps the admin disabled. `allowed_hosts` is read from
  the last valid config on every request.
- "Update now" is limited to once every 30 seconds.

## Source cache

`SourceCache` is keyed by `(calendar name, SHA-256 of the link)`, not the name alone. Otherwise,
after replacing a link in the admin, a failed first fetch of the new link would fall back to the
old link's data for the day and could show "Free" without knowing. (This also fixes the same
problem for hand edits today.)

## Pages

All pages: shared menu, mobile friendly, light/dark from the OS, bundled Inter font, no external
resources, no inline styles. Text comes from `locales/*.json` under `admin.*`, in the configured
screen language. Pages work without JavaScript; `admin.js` only enhances (test a link without
reloading, copy the Kindle URL, refresh the preview).

1. **Login**: password field, plus the "run `inkdoor password`" hint when the password file is
   missing.
2. **Home**: preview of the current screen (`<img src="/kindle.png?t=<last render>">`, no separate
   route), door status, last update time, failing sources, "Update now", the Kindle URL with a
   copy button, a banner in "first setup" or "broken file" mode.
3. **Calendars**: one card per calendar (name, marker style drawn with CSS classes or SVG, a busy
   badge — the toggle is in the edit form —, status label, masked link); test, edit, remove, move up/down; add calendar. "Test"
   shows the result inline: reachable or not, events in the next 14 days, the next three, and the
   existing warnings (busy-only titles, likely wrong time zone).
4. **Tasks**: TickTick link (masked), name, `overdue_days`, test.
5. **Screen**: language, time zone (searchable list from `zoneinfo.available_timezones()`), clock
   (12h/24h/automatic), workday start/end, workdays, `min_gap_minutes`, `refresh_minutes`. The port
   is read-only with a note that changing it means editing the file and restarting.
6. **Account**: change password, log out.

On save: field errors next to the field (reusing `config_error.*` messages); on success the render
loop is woken and the preview refreshes when the next render lands (polling the last-render time).

`check.py` is refactored to return structured results (per source: ok/warn/fail messages, event
count, next events). `inkdoor check` prints them exactly as today.

## Setup screen and "Free"

Today, calendars without a link are skipped silently, so a fresh config makes the door say FREE.
New rules, computed in `collect()` as a `Snapshot` field (so `demo_snapshot()` and existing render
tests are unaffected):

- **Nothing configured** (no calendar and no tasks with a link): the door shows a setup screen.
  With the admin enabled it says "Set up inkdoor at http://<ip>:<port>"; with it disabled, "Add
  your calendar links to config.toml". (A missing config file means the admin is disabled,
  because `enabled` defaults to `false`; server installs always have a file written by
  `install.sh`.)
- **Something configured, but no busy calendar with a link** (e.g. tasks only): the door never says
  Free; the status shows the existing "Knock first" state with a detail that no busy calendar is
  set up.
- Otherwise: today's logic.

The `<ip>` comes from one helper in `net.py`, used by the setup screen and by `install.sh` (via
`inkdoor`), recomputed every render: prefer a private (RFC 1918) address of the default-route
interface, fall back to any private address, then to the hostname.

## Install and deploy changes

- `install.sh`:
  - No longer waits for a link before starting the service; the setup screen covers it.
  - Always applies the `/etc/inkdoor` ownership and modes above (migrates the old
    `root:inkdoor 750/640` layout).
  - Fresh install: config with `[admin] enabled = true`, password generated through the wrapper,
    service started, admin URL and password printed.
  - Update: keeps the password, sets `enabled = true` once on old installs, reminds that
    `inkdoor password` makes a new one.
  - New `MSG_*` strings in both language branches; `MSG_NEXT_STEPS` stops telling people to use
    `nano`.
- `inkdoor.service`: `ReadWritePaths=/etc/inkdoor`, `UMask=0077`.
- `create-lxc.sh`: `--config` stays optional, pushed as `inkdoor`-owned once the user exists (the
  installer re-applies ownership anyway); `MSG_DONE` points to the admin.
- `pyproject.toml`: add `flask`, `waitress`, `tomli-w` (all support Python 3.10).
- `CLAUDE.md`: server rule becomes "`/kindle.png` is public; everything else requires the admin
  login; never serve the output folder or config files"; mention `net.py` as the only way to fetch
  links.
- Docs (en-US and pt-BR): `docs/server.md`, `README.md` and translations present the admin as the
  main way to configure on a server; hand-editing and the laptop opt-in stay documented.

## Testing

Automated (pytest):

- **Golden output first**: before refactoring `check.py`, add a test that captures today's
  `inkdoor check` output for the fixtures; it must still pass afterwards.
- **Route inventory**: for every rule in `app.url_map` and every method, anonymous requests are
  rejected, except `/kindle.png`, `/login` and `/static`; unknown paths are 404, not redirects.
- **`/kindle.png`**: today's contract, ported from `tests/test_server.py` (which imports
  `make_handler`, to be replaced).
- **Host parsing against a real Waitress socket**: `[::1]:8000`, `[fe80::1]`, trailing dot,
  missing Host, allowed and rejected names; `/kindle.png` with a bad Host returns the error PNG.
- **Login**: success, failure, backoff timing (clock injected), rate limit checked before scrypt,
  session rotation, expiry, logout via POST only, `next=` restricted, password change keeps the
  current session and drops others, password-file change drops all, missing or corrupt file fails
  closed, capitalized generated password accepted.
- **CSRF**: POST without token, wrong token, foreign `Origin`, `Origin: null`; correct requests
  with a same-origin `Origin` pass.
- **Secrets with a canary**: links contain a unique token; after saving, testing, and a failing
  fetch, no response body, header, `capsys` or `caplog` output contains the token or any 8-char
  substring of it.
- **Links**: file paths and other schemes rejected in the admin; a hand-edited file path elsewhere
  does not block saving.
- **Config writes**: run under `umask 022`; `.tmp`, `.bak`, config and password file are 600;
  atomic replace; round-trip keeps values and unknown keys and does not add defaults; `--lang`
  is not written; concurrent-change refusal; restore from `.bak`.
- **Startup**: broken config, missing config and unreadable config all start the server and serve
  an error or setup image.
- **Outbound helper**: size cap, deadline, redirect limit, loopback and link-local refused on
  redirect hops (mocked).
- **Status rules**: nothing configured shows setup; tasks-only shows "Knock first"; the demo at
  7:30, 10:20, 15:20, 16:50 and 21:10 never shows setup; cache keyed by link.
- **Render loop**: an Event set during a render triggers another cycle.
- `tests/test_i18n.py` enforces matching `admin.*` and new keys in both catalogs.

Manual:

- Fresh install in a Debian 12 machine; update of an install with the old layout (750/640,
  no password file); in the in-app browser, log in, paste a public test calendar, test it, see the
  preview update; save under the systemd sandbox and check file modes.
- Render the setup screen in both languages with a 15-character IP and a 5-digit port.

## Out of scope

HTTPS, multiple users or roles, logs/updates/restarts from the admin, changing the port from the
admin, OAuth logins to Google or Microsoft, admin screenshots in the docs.

## Review changes

An adversarial review on 2026-10-15 found these problems in the first draft; all are addressed
above:

1. `.bak`/`.tmp` files could be world-readable and were not git-ignored (secret links in a public
   repo) → 600 via `O_EXCL`, `UMask=0077`, `.gitignore` `config.toml.*`.
2. A 400 on `/kindle.png` for an unknown Host would freeze the door on an old image → error PNG.
3. `Referrer-Policy: no-referrer` makes browsers send `Origin: null`, breaking every form →
   `same-origin`.
4. A broken config at startup killed the admin, making restore unreachable → fallback startup.
5. Ownership and migration of `/etc/inkdoor` were unspecified → `inkdoor:inkdoor`, re-applied.
6. Links could leak through `requests` exception messages and Flask tracebacks, and a printed
   password through the journal → type-only logging, no password from `serve`, canary tests;
   mask no longer shows the end of the link.
7. The Test button allowed SSRF to loopback/metadata, memory exhaustion and thread starvation →
   one fetch helper with caps, a separate executor.
8. Global login cap was a lockout; login had no CSRF design → slowdown, double-submit token,
   rate limit before scrypt.
9. A setup rule based on the config would hijack the demo → computed in `collect()`.
10. The source cache keyed by name could show the old link's data → keyed by link hash.
11. Saving `config.load()` output pinned defaults and wrote `--lang` → edit the raw dict.
12. Route table contradicted itself and broke existing tests → unknown is 404, tests listed.
13. Render races → only the render thread renders; Event cleared before each cycle.
14. Different IP detection in installer and door → one helper.
15. Password file edge cases → fail closed, case-tolerant check, `os.stat` detection.
16. Cookies, CSP and headers details → covered in "Request guards".
17. The Mac case exposed the admin on untrusted networks → admin opt-in for plain `serve`.
18. Missing i18n for CLI and installer strings → listed.
19. YAGNI: separate preview route and global cap dropped.
20. Test plan gaps → golden output, real-socket Host tests, canary substrings, startup tests.
