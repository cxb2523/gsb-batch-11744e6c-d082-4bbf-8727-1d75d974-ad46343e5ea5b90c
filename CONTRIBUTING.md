# Contributing to inkdoor

Thanks for your interest! inkdoor is a small project, and every kind of help counts: a bug
report from a Kindle model nobody has tried, a translation, a clearer sentence in the docs, or
a pull request.

- [Ground rules](#ground-rules)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Making a change](#making-a-change)
- [Docs images](#docs-images)
- [Translations](#translations)
- [Testing on real hardware](#testing-on-real-hardware)
- [Releases](#releases)

## Ground rules

- **Privacy first.** This is a public repository. Never put real calendar links, names, email
  addresses or meeting titles in code, tests, docs, screenshots or issues. Use the fictional data
  in `src/inkdoor/demo.py` and `tests/fixtures/`. Never commit `config.toml` or `admin-password`.
- **English in the repository**: code, comments, commits, issues and pull requests. Users see
  inkdoor in their own language, so every user-facing string is translated (see
  [Translations](#translations)).
- **The door must never say "Free" without knowing.** Any change to fetching, caching or the
  status keeps this rule; when in doubt, the door says "Knock first".
- [`CLAUDE.md`](CLAUDE.md) holds the full conventions (it is written for AI assistants, and
  just as useful for people): language policy, screen constraints, security rules for links and
  the admin, deploy script rules, labels and the review process.

## Development setup

You need Python 3.10 or newer.

```sh
git clone https://github.com/frkey/inkdoor.git
cd inkdoor
python3 -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

Then:

```sh
pytest                                    # the whole suite, a few seconds, no network
inkdoor -o output demo 10:20 16:50        # render previews with fictional data
inkdoor -o output --lang pt-BR demo 10:20
inkdoor -o output demo --screen 600x800 10:20   # another Kindle screen
```

Shell scripts are checked with [ShellCheck](https://www.shellcheck.net/):

```sh
cd kindle && shellcheck inkdoor/*.sh documents/*.sh kpm/*.sh
shellcheck deploy/*.sh deploy/proxmox/*.sh
```

CI runs all of this on every pull request (Python 3.10 and 3.12) and uploads the rendered
previews as an artifact, so you can look at them without running anything.

## Project layout

```
src/inkdoor/
  sources.py      reads calendars (ICS) and tasks: recurrence, time zones, de-duplication, cache
  render.py       screen layout and drawing (every Kindle screen size, 16 grays)
  server.py       the render loop and `inkdoor serve` (Waitress)
  net.py          fetches links (size cap, deadline, redirects, no loopback) and finds the LAN address
  check.py        `inkdoor check` and the admin's Test link
  config.py       loading and validating config.toml
  config_edit.py  edits config.toml for the admin (atomic, private, with a backup)
  files.py        private (mode 600), atomic file writes
  i18n.py         translations and time/date formatting
  locales/        en-US.json (the reference) and pt-BR.json
  demo.py         fictional data for previews and screenshots
  fonts/          a Latin subset of Inter (SIL OFL 1.1)
  web/
    __init__.py   the Flask app: request guard, login, the public /kindle.png
    auth.py       password hashing, sessions, login rate limit
    hosts.py      Host header allowlist (DNS rebinding)
    links.py      masking and checking pasted links
    forms.py      reading and checking the admin's forms
    editing.py    what the pages share about reading and saving config.toml
    pages.py      the blueprint, built from home, calendars, screen and account
    templates/    Jinja templates
    static/       admin.css and admin.js (every page also works without JavaScript)
kindle/           POSIX sh scripts that run on the Kindle (BusyBox); kpm/ has the KPM hooks
deploy/           systemd unit, Debian/Ubuntu installer, Proxmox container script
tests/            pytest suite with fictional calendars in tests/fixtures/
docs/             user docs, each with a pt-BR translation in docs/pt-BR/
scripts/          docs_images.py regenerates docs/img/ from the demo
```

## Making a change

1. **Find or open an issue** first, unless the change is tiny. Search
   [open and closed issues](https://github.com/frkey/inkdoor/issues?q=is%3Aissue) to avoid
   duplicates. One issue per independent piece of work.
2. **Branch from `master`** and keep the change focused on that issue.
3. **Add or update tests.** Tests are hermetic: no network, no real clock where it matters, no
   listener on `0.0.0.0`. Shared helpers live in `tests/helpers.py` and `tests/web_helpers.py`.
4. **Anything visual?** Render the demo in both languages at a few times (for example 7:30, 10:20,
   15:20, 16:50 and 21:10) and look at the images; Portuguese strings are longer and are the
   usual cause of overflow. Check a small and a tall screen too (`--screen 600x800`,
   `--screen 1264x1680`). Keep strokes at least 3 px wide so they survive e-ink.
   If the change shows up in the README's images, regenerate them
   (see [Docs images](#docs-images)).
5. **Anything user-visible?** Update the docs in both languages: `README.md` and
   `README.pt-BR.md`, and each file in `docs/` with its twin in `docs/pt-BR/`.
6. **Open a pull request** with the template: what changes and why, `Fixes #N` (or `Refs #N`),
   and the test plan.

### Review

Every pull request is reviewed until a round finds no new real defect (correctness, security,
data loss, the door's status, or a rule in `CLAUDE.md`). Before opening yours, review your own
diff line by line. The maintainer then reviews it, you handle each finding (fix it, explain why
it does not apply, or move it to an issue) and push, and the new commits are reviewed the same
way. Style suggestions alone do not hold a pull request back.

### Kindle scripts

The server hands the Kindle scripts out as a zip and as a KPM package (`src/inkdoor/kindle_files.py`).
KPM only upgrades to a higher version, so when you change anything in `kindle/`, raise
`KINDLE_VERSION` and set `SCRIPTS_SHA256` to the new digest; `tests/test_kindle_files.py` fails
until you do, and prints what to change. The KPM hooks in `kindle/kpm/` are tested on the
computer by running them against a temporary folder (`INKDOOR_KINDLE_ROOT`).

### Deploy scripts

`deploy/` scripts are bash and must stay idempotent: running `install.sh` again is how users
update. They must never overwrite `/etc/inkdoor/config.toml` or `admin-password`. If you touch
the systemd sandbox in `inkdoor.service`, check that it still starts in an unprivileged Proxmox
container with nesting.

`install.sh` installs the Python packages from `deploy/requirements.txt`: exact versions with
hashes, setuptools included, so a server never fetches an unpinned package. After changing the
dependencies in `pyproject.toml` (or `deploy/requirements.in`), run the command at the top of that
file again (it needs [uv](https://docs.astral.sh/uv/)); a test fails until the lock names every
dependency. Dependabot proposes version bumps weekly, and the CI's `deploy-lock` job installs the pinned
versions the way `install.sh` does, runs the tests with them and checks them against known
vulnerabilities.

## Docs images

Every image in `docs/img/` comes from the demo's fictional data, through one script:

```sh
python scripts/docs_images.py           # everything
python scripts/docs_images.py screens   # only the door screens (no browser needed)
python scripts/docs_images.py admin     # only the admin screenshots, light and dark
```

The admin screenshots need a browser engine: on macOS the built-in Quick Look (`qlmanage`) is
used; elsewhere a headless Chromium-family browser on the `PATH`, or the one named in
`INKDOOR_BROWSER`. Commit the regenerated images with the change that made them stale.

## Translations

inkdoor ships in English (the reference) and Brazilian Portuguese. To add a language:

1. Copy `src/inkdoor/locales/en-US.json` to `<code>.json` (for example `es-ES.json`) and
   translate the values. Plurals are `{"one": ..., "other": ...}`. `tests/test_i18n.py` fails if
   any key is missing.
2. Add demo content for the language in `src/inkdoor/demo.py`, then render the demo and look for
   text that overflows.
3. Add the Kindle's messages to the `case "$LANGUAGE"` block in `kindle/inkdoor/common.sh`. Keep
   them ASCII: the Kindle's built-in screen font has no accents.
4. Add the installer messages to the same kind of block in `deploy/install.sh` and
   `deploy/proxmox/create-lxc.sh` (these run in a terminal, so accents are fine).
5. Optionally, translate the user docs into `docs/<code>/` and add a `README.<code>.md`.

Times, dates and durations always go through `Translator.time()`, `.date_short()`,
`.date_header()` and `.duration()`, never through ad-hoc formatting.

## Testing on real hardware

The Kindle scripts were written for a Kindle Paperwhite 10th generation. If you run inkdoor on
another model, another firmware or another kind of server, a short report is very welcome, even
when everything works: open an issue with the model, the firmware version and what you saw
(`inkdoor/log.txt` on the Kindle helps).

## Releases

Versions follow [Semantic Versioning](https://semver.org/). Add each user-visible change to the
`[Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md) as part of its pull request. To release:

1. In a pull request, set the version in `pyproject.toml` and `src/inkdoor/__init__.py` (a test
   checks they match), and move `[Unreleased]` to a dated section with the Kindle scripts'
   version (`KINDLE_VERSION`).
2. After it is merged, make a **signed** tag on `master` with the release key and push it:
   `git tag -s vX.Y.Z -m "inkdoor X.Y.Z"` then `git push origin vX.Y.Z`. Publish a GitHub
   release with that section as its notes. From then on, new installs and every update without
   `--ref` get that version; `install.sh --ref vX.Y.Z` installs exactly that version.

### Release key

`install.sh` installs a release only when its tag is signed by a key in `RELEASE_SIGNERS` at the
top of `deploy/install.sh` (git's allowed-signers format), and only if the tag object names
itself with that same version. The check runs in the installer that is already installed, so:

- Sign with SSH: `git config gpg.format ssh` and `git config user.signingkey <path to the
  public key>`. Keep the private key off shared machines, with a passphrase, and backed up.
- Add the public key to GitHub as a *signing* key too, so tags show as verified.
- To change keys, add the new key to `RELEASE_SIGNERS` and ship that in a release signed with a
  key already listed; remove the old key in a later release. A tag that no listed key signed is
  refused by every server, and the only way past it is `--ref`.
