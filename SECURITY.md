# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through
GitHub: go to the repository's **Security** tab and choose
[**Report a vulnerability**](https://github.com/frkey/inkdoor/security/advisories/new).

Include what an attacker can do, the steps to reproduce it and the version (the release or
commit) you tested. Use fictional data: never send real calendar links or passwords. You will
get an answer as soon as possible, and credit in the fix if you want it.

Only the latest release (what `install.sh` installs) and `master` are supported; fixes are not
backported.

## What inkdoor protects

inkdoor is meant to run on a home or office **local network**, never exposed to the internet.
Within that model:

- **Calendar links are secrets.** They stay in `config.toml` (readable only by the `inkdoor`
  user on a server), are never sent back to a browser in full, and never appear in logs, error
  messages or `inkdoor check` output.
- **The admin requires a login.** The password is stored as a scrypt hash, sessions live only in
  the server's memory, logins are rate limited per address, and every form is protected against
  CSRF. Only `/kindle.png`, the login page, the admin's static files and, while the admin is
  on, the KPM repository for the Kindle (`/kpm.json` and `/kpm/inkdoor.kpkg`: the Kindle scripts
  and the server's own address, nothing else) are public.
- **DNS rebinding is blocked.** The server only answers requests whose `Host` is an IP address,
  a local network name or a name listed in `allowed_hosts`.
- **Fetching is constrained.** Links are fetched with a size cap, a total deadline and a
  redirect limit, and never to the server's own loopback or link-local addresses (for example the
  cloud metadata address).
- **Reading a calendar is bounded.** Calendars are parsed in a separate process with a time
  limit and a cap on repeating events. A calendar past either counts as unreadable (the door
  uses that calendar's last good data from today, else says **Knock first**), and if the server
  ever stops refreshing, the Kindle gets an error screen instead of an old status.
- **Installs are verified.** `install.sh` installs a release only when its tag is signed with
  the inkdoor release key (a branch or tag you name with `--ref` is installed as it is), and
  Python packages at exact versions checked against their hashes.
- **The service is sandboxed.** On a server it runs as an unprivileged user under a strict
  systemd sandbox that can only write to `/var/lib/inkdoor` and `/etc/inkdoor`.

## Known limits

These are accepted trade-offs, documented so you can decide whether they fit your network:

- **The admin uses plain HTTP.** Someone who can watch your network traffic could read the
  password at login and a link when you paste it.
- **Private network addresses stay reachable.** A logged-in admin can make the server fetch
  other machines on the LAN with **Test link**, because calendars on a LAN server (Nextcloud,
  Radicale) are a real use.
- **DNS answers can change between the check and the connection** (DNS rebinding at the fetch).
  The address check runs before each request, but a hostile DNS server can still answer
  differently a moment later.
- **The Kindle image is public on the network.** Anyone on the LAN can see your schedule's
  status by opening `/kindle.png`.
