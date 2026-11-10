# Changelog

All notable changes to inkdoor are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

The Kindle scripts have their own version, which KPM uses to offer updates (`;kpm upgrade`).
It is shown next to each release.

## [Unreleased]

## [1.1.2] - 2026-11-10

A bug-fix release. Kindle scripts: 1.2.0 (unchanged).

### Fixed

- The dashed line after a free gap in today's list ("free · 1h") no longer runs a few pixels past
  the right margin.

## [1.1.1] - 2026-11-10

A security and bug-fix release. Kindle scripts: 1.2.0 (unchanged).

### Fixed

- `config.example.toml` no longer sets `status_label = "Busy"` on the Personal calendar, which
  showed **BUSY** in English on doors in other languages. A config started from it (by hand, or by
  the first installer) keeps the label: if your door shows a word in the wrong language, clear
  **Door word** for that calendar in the admin to get the translated default.

### Security

- Installs and updates with `deploy/install.sh` get Pillow 13.0.0, setuptools 84.2.1 and certifi
  2026.10.23, which fix known vulnerabilities. Pillow 13 needs Python 3.11, so servers on Python
  3.10 (Ubuntu 22.04) keep Pillow 12.3.0 for now.

## [1.1.0] - 2026-10-16

A security release. Kindle scripts: 1.2.0 (unchanged).

### Security

- The admin and the Kindle image no longer accept names ending in `.fritz.box` or `.ts.net`
  without being listed: both are public domains. If the Kindle's `URL` or your browser uses such
  a name, add it to `[admin] allowed_hosts` (see the server guide).
- Calendars and task lists are read in a separate process with a 30-second limit and at most
  20,000 occurrences in the window read. A calendar that goes past either counts as unreadable
  (the door falls back on today's data or **Knock first**) instead of stalling the server.
- If the server stops finishing refreshes (more than 15 minutes late) or the image on disk is
  from before a long outage, the Kindle gets an error screen instead of a status that may be old.
- `install.sh` installs the latest release instead of `master`, also when updating an install
  that was on `master` by default (pass `--ref master` to stay on it). The Proxmox script does
  the same.
- `install.sh` installs the Python packages at exact versions checked against their hashes
  (`deploy/requirements.txt`), and builds inkdoor without fetching anything unpinned.
- Releases are signed, and `install.sh` installs a release only when its tag carries the inkdoor
  release signature; otherwise it stops without changing anything.
- CI runs with a read-only token, pins its actions by commit and audits the pinned packages for
  known vulnerabilities every week; Dependabot proposes updates.

### Changed

- `inkdoor check` and **Test link** list the next events in order of start.

## [1.0.0] - 2026-10-15

The first public release. Kindle scripts: 1.2.0.

### The door

- A 16-gray screen that someone at the door can read from 2 meters away: **In a meeting**
  (or the calendar's own label) until when, and what comes next; **Free** until the next
  meeting; after hours; and **Knock first** whenever inkdoor cannot be sure.
- Today's agenda with free gaps, a "now" marker and finished events folded away; all-day events
  as tags; after the workday, tomorrow's agenda.
- Tasks due today and overdue ones from a TickTick subscription link, with priorities.
- A footer with tomorrow at a glance and a legend of the calendars, told apart by pattern
  (solid, striped, outline) since e-ink has no color.
- The door never says "Free" without knowing: a busy calendar that cannot be read keeps its last
  good data for the day, and with none the door says "Knock first". If drawing fails, an error
  screen replaces the old image.
- Every Kindle screen that current jailbreaks support, from 600 × 800 to the Scribe's
  1860 × 2480, drawn at the device's resolution with text sized for it.
- Status changes reach the door within seconds: the server redraws when a meeting starts or
  ends and tells the Kindle when to come back.

### Calendars

- Any number of ICS links: Outlook, Google, a Nextcloud or Radicale server on your network, or
  any other. Calendars are never merged; repeats inside one calendar are.
- Recurring events, their exceptions and time zones. A calendar published with "busy" detail
  only still drives the door.
- Per calendar: marks you busy or is only listed, its pattern, and its own status word.
- Links are fetched with a size cap, a deadline and a redirect limit, never to the server's own
  loopback or link-local addresses, and are never shown in full again, logged or printed.
- `inkdoor check` and the admin's **Test link** explain what is wrong with a link in plain words.

### Web admin

- Served on the same port as the Kindle image (3667), behind a login: scrypt password, sessions
  in memory, login rate limit, CSRF protection and a Host allowlist against DNS rebinding.
- **Home** with the door's status, a live preview, "Update now" and the Kindle files;
  **Calendars** and **Tasks** to add, test, edit, reorder and remove links; **Screen** for the
  Kindle model, language, time zone, clock, workday and refresh; **Account** for the password.
- Step-by-step help where people get stuck: where to find each calendar's link, how to install
  on the Kindle.
- Edits `config.toml` in place, atomically and privately, keeps a backup, and can restore it.

### Kindle

- Scriptlets to test the connection and start the display, written for BusyBox `sh`.
- **Download the Kindle files** in the admin: a zip with this server's address and language
  already set.
- The server is a KPM repository: open **inkdoor - connect KPM** once, and later updates are
  `;kpm update` and `;kpm upgrade` in the search bar.

### Server

- `deploy/install.sh` installs or updates inkdoor as a sandboxed systemd service on
  Debian/Ubuntu, and announces it as `<hostname>.local` on the network.
- `deploy/proxmox/create-lxc.sh` creates an unprivileged LXC container on Proxmox VE and installs
  inkdoor in it with one command.
- Keeps serving with a broken or missing config, showing the setup or error screen; with a
  broken file the admin stays reachable to restore the last good version.

### Languages

- English (US) and Brazilian Portuguese, with each language's clock and dates, in the door, the
  admin, the command line, the Kindle messages, the installers and the docs.

[Unreleased]: https://github.com/frkey/inkdoor/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/frkey/inkdoor/releases/tag/v1.1.2
[1.1.1]: https://github.com/frkey/inkdoor/releases/tag/v1.1.1
[1.1.0]: https://github.com/frkey/inkdoor/releases/tag/v1.1.0
[1.0.0]: https://github.com/frkey/inkdoor/releases/tag/v1.0.0
