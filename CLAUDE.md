# CLAUDE.md

Guidance for Claude (and other contributors) working on this repository.

## Language policy

- **Everything in the repository is written in English**: code, identifiers, comments,
  docstrings, commit messages, pull requests, issues, tests, CI, and technical docs.
  This applies even when the conversation with the maintainer happens in Portuguese.
- **User-facing text is internationalized.** Never hard-code a string that a user can see
  (on the Kindle screen, in CLI output, or in Kindle script messages). Instead:
  - Python: add a key to `src/inkdoor/locales/en-US.json` and use the `Translator`
    (`t("section.key", name=value)`). Plurals use `{"one": ..., "other": ...}` and `n=`.
  - Kindle shell scripts: add a `MSG_*` variable to both branches of the `case "$LANGUAGE"`
    block in `kindle/inkdoor/common.sh`. Keep those strings ASCII; the Kindle's built-in
    screen font has no accents.
  - Deploy scripts (`deploy/`): add a `MSG_*` variable to both branches of the script's
    `case "$LANGUAGE"` block. These run in a terminal, so pt-BR strings use accents.
- **en-US is the default and the reference locale.** Every key must exist in `en-US.json`.
- **pt-BR is a first-class option and must stay in sync.** Whenever you add or change a key in
  `en-US.json`, update `pt-BR.json` in the same change. `tests/test_i18n.py` fails if the
  catalogs have different keys.
- Write en-US text in US English: "canceled", "color", 12-hour clock with AM/PM, "Oct 14".
  Write pt-BR text in natural Brazilian Portuguese with the 24-hour clock ("14:30").
- Format times, dates and durations through `Translator.time()`, `.date_short()`,
  `.date_header()` and `.duration()`, never with ad-hoc f-strings.
- **User docs exist in both languages.** `README.md` (English) is mirrored by
  `README.pt-BR.md`, and each file in `docs/` has a translation in `docs/pt-BR/`. Update both
  in the same change. Developer-only docs (this file, code comments) are English only.
- Demo content in `src/inkdoor/demo.py` exists per language; add an entry for any new locale.

## Project overview

inkdoor turns a jailbroken Kindle into a door sign that shows whether you are in a meeting.

- `src/inkdoor/`: Python package that runs on a computer. It reads ICS calendars and a
  TickTick subscription (`sources.py`), draws a grayscale PNG at the Kindle's resolution (`render.py`) and
  serves it over HTTP with Waitress (`server.py`, render loop plus `serve()`). `net.py` fetches
  links and finds the LAN address; `state.py` holds what the render loop and the admin share;
  `files.py` writes private (mode 600) files atomically; `config_edit.py` edits `config.toml`
  as it is on disk for the admin.
- `src/inkdoor/web/`: the web admin (Flask, served on the same port as the image): routes and
  guards (`__init__.py`), password and sessions (`auth.py`), Host allowlist (`hosts.py`), pages
  and forms, Jinja templates and first-party static files.
- `kindle/`: POSIX shell scripts that run on the Kindle and display the PNG; `kindle/kpm/` holds
  the install hooks of the KPM package that the server builds from them (`kindle_files.py`).
- `deploy/`: runs `inkdoor serve` as a systemd service. `install.sh` installs or updates it on
  Debian/Ubuntu; `proxmox/create-lxc.sh` runs on a Proxmox VE host, creates an LXC container and
  runs `install.sh` in it.

## Commands

```sh
pip install -e ".[dev]"
pytest                                   # all tests
inkdoor -o output demo 10:20 16:50       # render previews with fictional data
inkdoor -o output --lang pt-BR demo 10:20
inkdoor -o output demo --screen 600x800 10:20   # another Kindle screen
cd kindle && shellcheck inkdoor/*.sh documents/*.sh kpm/*.sh
shellcheck deploy/*.sh deploy/proxmox/*.sh
```

After changing anything visual, render the demo in **both** languages at a few times
(e.g. 7:30, 10:20, 15:20, 16:50, 21:10) and look at the images: Portuguese strings are often
longer and are the usual cause of overflow. Also look at the smallest screen and the one with
the least room in layout units (`inkdoor demo --screen 600x800 10:20`, `--screen 1264x1680`).

## Conventions

- Default branch: `master`.
- Supported Python: 3.10+ (`tomli` is used as a fallback for `tomllib` on 3.10).
- Screen constraints: 16 gray levels (multiples of 17); `render()` snaps every pixel to those
  levels. The layout is written in units of a 1072-wide screen (1072×1448 is the default) and
  `Canvas` scales coordinates, strokes and fonts to the size in `config.SCREENS`; keep strokes at
  least 3 units wide so they survive e-ink. Draw only through the `Canvas`, never on the image.
- Calendars are never merged with each other; only repeats inside one calendar are
  de-duplicated.
- The door must never say "Free" without knowing. If a busy calendar cannot be read, the
  server reuses that calendar's last good data for the day (`SourceCache`), and with no data
  at all the status becomes "Knock first". If rendering fails, an error screen replaces the
  old image.
- `/kindle.png` is public (so are the login page, the admin's bundled static files and, while
  the admin is on, the KPM repository `/kpm.json` and `/kpm/inkdoor.kpkg`, which hold only the
  Kindle scripts and the server's own address); every other route requires the admin login, and
  unknown paths are 404. Never serve the output folder or config files.
- The render loop renders on refresh ticks of the clock and just after each moment the screen
  changes (`render.next_change`); `/kindle.png` sends `X-Inkdoor-Next` (seconds until that render
  is done) and `loop.sh` sleeps that long, clamped to 30 s..`INTERVAL`. Keep both sides working
  with an older version of the other: no header means `INTERVAL`, and extra headers are ignored.
- The Kindle side has a version (`kindle_files.KINDLE_VERSION`): KPM only upgrades to a higher
  one, so bump it whenever a file in `kindle/inkdoor/`, `kindle/documents/` or `kindle/kpm/`
  changes, and update `SCRIPTS_SHA256` (a test fails until both match).
- Fetch calendar and task links only through `inkdoor.net.fetch` (size cap, deadline, redirect
  limit, no loopback or link-local). Links are secrets: never put them in a response, a log line
  or an exception message.
- Kindle scripts must be POSIX `sh` (BusyBox), use LF line endings (`.gitattributes` enforces
  it), and pass ShellCheck with `kindle/.shellcheckrc`.
- Deploy scripts are bash (Debian/Ubuntu and Proxmox hosts), must be idempotent (running
  `install.sh` again is how users update) and must never overwrite `/etc/inkdoor/config.toml`
  or `admin-password` (the one change allowed is adding `[admin] enabled = true` once).
  `/etc/inkdoor` is `inkdoor:inkdoor` 700 and every file in it 600; the admin writes there.
  Keep `inkdoor.service` sandboxed; if you add an option, check it still starts in an
  unprivileged LXC container with nesting.
- Fonts in `src/inkdoor/fonts/` are a Latin subset of Inter (SIL OFL 1.1). If you need a glyph
  outside that subset, re-subset from the upstream font and keep `OFL.txt`.

## Issues and labels

Work is tracked in GitHub issues on `frkey/inkdoor` (use `gh issue ...`).

- **Open an issue** for every bug, follow-up, deferred review finding or idea that is not done in
  the current change. Never leave follow-ups only in a chat, a PR comment or a local note.
- **Before opening one**, search open and closed issues (`gh issue list --search ...`) and comment
  on an existing issue instead of creating a duplicate.
- **Write issues in English**, like everything else in the repo. Title: short and imperative
  ("Show all-day events in inkdoor check"). Body: context, current vs expected behavior (steps to
  reproduce for bugs), acceptance criteria, and the files or modules involved.
- **Privacy applies to issues too**: they are public. Never paste calendar links, `config.toml`
  content, passwords, names, emails or meeting titles; use fictional data and redact logs.
- **Labels**: every issue gets exactly one `type:`, exactly one `priority:` and at least one
  `area:` label. Add a `status:` label only when it applies, and remove it when it no longer does.
  Do not use GitHub's default `bug`, `enhancement` or `documentation` labels; use the `type:` ones.
- **Link the work**: every PR references its issue (see "Pull requests"). One issue per
  independent piece of work; split issues that mix unrelated changes.
- **Creating or editing labels changes the public repository**: ask the maintainer before running
  `gh label create`/`gh label edit`. If a label from the table is missing, ask before creating it
  instead of picking another one.

| Label | Color | Use for |
|---|---|---|
| `type: bug` | `d73a4a` | Something that is wrong or broken |
| `type: feature` | `1d76db` | New capability for users |
| `type: improvement` | `a2eeef` | Better behavior of something that already works |
| `type: docs` | `0075ca` | Documentation only (both languages) |
| `type: chore` | `cfd3d7` | Maintenance, refactoring, tests, CI, dependencies |
| `type: security` | `b60205` | Vulnerabilities and hardening (no exploit details in public) |
| `priority: critical` | `b60205` | Door shows wrong status, secrets leak, or the service is down; fix now |
| `priority: high` | `d93f0b` | Breaks a main flow or affects most users; next in line |
| `priority: medium` | `fbca04` | Real problem with a workaround; plan it |
| `priority: low` | `0e8a16` | Polish, nice to have |
| `area: server` | `5319e7` | `serve`, render loop, Waitress, `/kindle.png` |
| `area: admin` | `5319e7` | Web admin pages, login, sessions |
| `area: sources` | `5319e7` | Calendar and task fetching (`sources.py`, `net.py`, `check.py`) |
| `area: render` | `5319e7` | Screen layout and drawing (`render.py`) |
| `area: kindle` | `5319e7` | Scripts that run on the Kindle (`kindle/`) |
| `area: deploy` | `5319e7` | `deploy/`, systemd, Proxmox |
| `area: i18n` | `5319e7` | Translations and locale formatting |
| `area: docs` | `5319e7` | README and `docs/` |
| `status: blocked` | `000000` | Waiting on something outside the issue (say what in a comment) |
| `status: needs info` | `d876e3` | Cannot proceed without more details |
| `status: needs hardware` | `c5def5` | Must be verified on a real Kindle or Proxmox host |

GitHub's `good first issue`, `help wanted`, `duplicate`, `wontfix` and `question` labels stay
available alongside these.

## Pull requests

- **Review until clean, before opening a pull request.** Once the work is committed and the tests
  pass, run `git fetch` and `/code-review high origin/master...HEAD` (always name the range:
  without one the skill compares with the pushed branch and can review nothing). Handle its
  findings (see "Handle every finding"), commit, and run another round on the fix commits only
  (`/code-review high <last-reviewed-commit>..HEAD`): the fixes are new code that the previous
  round did not see. Repeat until a round is clean.
- **A round is clean** when it reports no new real defect: nothing about correctness, security,
  data loss, the door's status or a rule in this file. Polish and style suggestions do not keep
  the loop going; record them as not applicable or defer them to an issue.
- **Same loop before every later push** to an open PR: review the new commits (from the last
  reviewed commit to `HEAD`) until a round is clean, then push. If `master` was merged into the
  branch since the last round, review `origin/master...HEAD` instead (after `git fetch`), so the
  round covers the merge result without re-reviewing `master`'s own commits.
- **Stop and ask**: if the fourth round of the same loop still finds a new real defect, stop and
  ask the maintainer; it usually means the approach needs rethinking, not another patch.
- **Handle every finding**: fix it; or explain in the PR description why it does not apply; or, if
  it is real but out of scope, open an issue (see "Issues and labels") and link it. A finding
  already recorded as not applicable or deferred does not need to be handled again in later rounds.
- **Without Claude Code**: contributors review their own diff line by line before opening the PR.
  The maintainer then runs `/code-review` on the PR and posts the findings; the contributor
  handles them and pushes, and the maintainer reviews the new commits, until a round is clean.
- **Changelog**: a PR with a user-visible change adds a line to `## [Unreleased]` in
  `CHANGELOG.md` (English). Releases are described in CONTRIBUTING.md ("Releases").
- **Describe the PR with the template** (`.github/pull_request_template.md`): the summary, the
  issue it closes or references ("Fixes #12", or "Refs #12" when it only does part of it), and a
  test plan whose checked `/code-review` line gives the totals over every loop on the PR: the
  number of rounds, that the last round was clean, and the findings (each counted once) fixed, not
  applicable and deferred.

## Privacy

This is a public repository.

- Never commit `config.toml` (or its `.bak`/`.tmp` copies) or `admin-password`; they hold
  secret calendar links and the admin password hash and are git-ignored.
- Never put real calendar URLs, names, email addresses or meeting titles in code, tests, docs or
  screenshots. Use the fictional data in `demo.py` and `tests/fixtures/`.
