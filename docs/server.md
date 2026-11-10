# Running inkdoor on a home server

**English** · [Português (Brasil)](pt-BR/server.md)

`inkdoor serve` has to run all the time: when it stops, the Kindle stops updating. A laptop
that sleeps at night is a poor host. A home server is a better one, and inkdoor is light: one
small Python process that needs under 100 MB of RAM and about 1 GB of disk, operating system
included.

- **Proxmox VE**: one command creates a container with everything set up. [Jump there](#proxmox-ve).
- **Any Debian or Ubuntu machine** (a VM, a mini PC, a Raspberry Pi with a 64-bit OS):
  [use the installer](#debian-or-ubuntu).

Either way you get the same layout, and you configure inkdoor from a browser with the
[admin](#admin):

| Path | What it is |
|---|---|
| `/etc/inkdoor/config.toml` | your config, private to the `inkdoor` user |
| `/etc/inkdoor/admin-password` | the admin password, stored as a hash |
| `/opt/inkdoor` | the code and its Python environment |
| `/var/lib/inkdoor/kindle.png` | the rendered screen |
| `inkdoor.service` | the systemd service, started at boot and restarted if it fails |
| `/usr/local/bin/inkdoor` | runs inkdoor with that config: `inkdoor password`, `inkdoor check` |

## Proxmox VE

`deploy/proxmox/create-lxc.sh` runs on the Proxmox host. It downloads the newest Debian
template (13, or 12 on Proxmox versions that do not support 13 yet), creates an unprivileged container (1 core, 512 MB of RAM, 4 GB of disk, started at
boot) and installs inkdoor in it.

1. Open a shell on the Proxmox host: in the web UI, select the node and click **Shell**
   (or connect with SSH as root).
2. Download the script and read it if you like:

   ```sh
   curl -fsSLO https://raw.githubusercontent.com/frkey/inkdoor/master/deploy/proxmox/create-lxc.sh
   ```

3. Run it:

   ```sh
   bash create-lxc.sh
   ```

   Add `--lang pt-BR` for the screen and the messages in Brazilian Portuguese. To bring an
   existing `config.toml`, copy it to the host first (for example
   `scp config.toml root@<proxmox-ip>:`) and add `--config config.toml`.

4. At the end the script prints the admin's address and its password, like this:

   ```
   New admin password: k7mq-x3vt-9hwp-r2nd  (saved in /etc/inkdoor/admin-password; ...)

   inkdoor is running.
     Admin:  http://192.168.1.50:3667  (log in with the password above)
             or http://inkdoor.local:3667 on computers and phones (the Kindle uses the IP)
     On the Kindle, in inkdoor/config.sh:  URL="http://192.168.1.50:3667/kindle.png"
   ```

5. Open the admin address in a browser on the same network and log in with that password.
   Computers and phones can also use `http://inkdoor.local:3667` (the container's name, announced
   on the network); the Kindle cannot resolve such names, so it always uses the IP address.
6. In **Calendars**, add your calendar links ([where to find them](calendar-sources.md)) and
   press **Test link** on each one after saving it. The preview on **Home** shows the door as
   the Kindle will.
7. On the Kindle, set `URL="http://<container-ip>:3667/kindle.png"` in `inkdoor/config.sh`
   ([Kindle setup](kindle.md)). The admin's home page shows this address with a copy button.

Until a link is added, the door shows a setup screen with the admin's address.

### Options

| Option | Default | |
|---|---|---|
| `--config FILE` | | `config.toml` to copy into the container |
| `--lang en-US\|pt-BR` | system language, else `en-US` | screen language of a new config, and the script's messages |
| `--ip dhcp\|CIDR` | `dhcp` | a static address, e.g. `192.168.1.50/24` |
| `--gateway IP` | | your router, required with a static `--ip` |
| `--ctid N` | next free ID | |
| `--hostname NAME` | `inkdoor` | |
| `--bridge NAME` | `vmbr0` | |
| `--storage NAME` | `local-lvm` | where the container's disk goes |
| `--template-storage NAME` | `local` | where the Debian template is stored |
| `--disk GB` | `4` | can be grown later with `pct resize <id> rootfs +1G` |
| `--memory MB` | `512` | |
| `--ref BRANCH_OR_TAG` | the latest release | inkdoor version to install, e.g. `v1.1.0` or `master` |

The Kindle must always find the server at the same address. Use a static `--ip`, or reserve
the container's address on your router (a "DHCP reservation").

### Day to day

| Task | Command on the Proxmox host |
|---|---|
| Change the config | the admin, at `http://<container-ip>:3667` |
| Update inkdoor | `pct exec <id> -- env LC_ALL=C.UTF-8 bash /opt/inkdoor/deploy/install.sh` |
| Make a new admin password | `pct exec <id> -- inkdoor password` |
| Follow the log | `pct exec <id> -- journalctl -u inkdoor -f` |
| Test the calendar links | `pct exec <id> -- inkdoor check` |
| Something is wrong | [Troubleshooting](troubleshooting.md) |
| Edit the config by hand | `pct enter <id>`, then `nano /etc/inkdoor/config.toml` |

Changes saved in the admin update the door right away. Hand edits are picked up at the next
refresh; only a new `port` or a change to `[admin] enabled` needs
`systemctl restart inkdoor`.

The default port is 3667 ("DOOR" on a phone keypad); it used to be 8000. To see which port an
update will use, look at the `[server]` section of your `config.toml`:

- **`port = 8000` or `port = 3667`**: nothing changes; the server keeps that port. Configs made
  from `config.example.toml` before the change have `port = 8000`, new installs get 3667.
- **No `port` line**: the server moves to 3667 when you update. To keep 8000, add
  `port = 8000` inside the existing `[server]` section before updating. If there is no `[server]`
  section at all, add it with the line (a line added at the end of the file would belong to the
  last section and be ignored):

  ```toml
  [server]
  port = 8000
  ```

To move to 3667 on purpose, change `port` in `config.toml`, restart the service and update the
`URL` in the Kindle's `inkdoor/config.sh`.

### Creating the container yourself

If you prefer to make the container in the web UI, keep it **unprivileged** with the
**nesting** feature on (both are the defaults). The service runs in a systemd sandbox, which
fails to start without nesting (status `226/NAMESPACE`). Then follow the next section inside
the container.

## Debian or Ubuntu

`deploy/install.sh` works on Debian 12 or newer and Ubuntu 22.04 or newer, with systemd. As
root:

```sh
curl -fsSLO https://raw.githubusercontent.com/frkey/inkdoor/master/deploy/install.sh
bash install.sh
```

It installs Python, git and avahi (which announces the machine as `<hostname>.local`) from apt,
downloads inkdoor to `/opt/inkdoor`, creates the
`inkdoor` user and the service. On the first run it creates `/etc/inkdoor/config.toml` with just
the `--lang` you gave, the machine's time zone and the admin turned on: calendars are added in
the admin (every option is explained in `/opt/inkdoor/config.example.toml`). It then makes an
admin password, starts the service and prints the admin's address and the password.
Continue from step 5 of the Proxmox steps above.

To update, run `bash /opt/inkdoor/deploy/install.sh`. It downloads the latest release (or the
branch or tag you gave with `--ref` before) from the same repository, installs the Python
packages at the exact versions in `deploy/requirements.txt`, checked against their hashes, and
restarts the service. Releases are signed: it installs one only when its tag carries the inkdoor
release signature, and otherwise stops without changing anything (a branch or tag given with
`--ref` is installed without that check). It never overwrites your
config or your admin password; on an install from before the admin existed, it turns the admin
on once and prints its first password. Without `--lang`, its messages use the `language` set in your config.

Options: `--lang en-US|pt-BR`, `--timezone Area/City` (for a new config), `--ref BRANCH_OR_TAG`.

## Admin

The admin is a small website served by `inkdoor serve` on the same port as the Kindle image.
After logging in you can:

- **Home**: see a preview of the door, its status, when it last updated and which links are
  failing; update it now; copy the Kindle's address.
- **Calendars** and **Tasks**: add, edit, reorder and remove calendars and the TickTick link,
  and test each link. A saved link is never shown again in full, only its start.
- **Screen**: the Kindle model, language, time zone, clock, workday hours and days, the shortest free gap to
  list, refresh interval. The port is shown read-only: changing it means editing `config.toml`
  and restarting the service.
- **Account**: change the password, log out.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="img/admin-calendars-dark-en-US.png">
  <img alt="The admin's Calendars page: three calendars, each with its marker, door word, shortened link and buttons to test, edit, move and remove it" src="img/admin-calendars-light-en-US.png">
</picture>

Every save rewrites `config.toml` and keeps the previous version as `config.toml.bak`. Comments
in the file are lost on the first save; settings the admin does not manage are kept. If the
file breaks (for example after a hand edit), the admin says what is wrong and offers to restore
the previous version.

> **The admin uses plain HTTP.** Someone who can watch your network traffic (a guest on your
> Wi-Fi, a compromised device) could read the password when you log in and a calendar link when
> you paste it, so use the admin only on a network you trust and never forward its port.

### Password

The installer prints the first password. To make a new one (for example if you lost it), run
`inkdoor password` on the server (in a Proxmox container: `pct exec <id> -- inkdoor password`).
It prints the new password once and logs out every browser. You can also change it on the
**Account** page.

### Opening the admin by name

The admin, and the Kindle image, only answer when the address in the browser is an IP address
or a local network name: a name without dots, or one ending in `.local`, `.lan`, `.home`,
`.home.arpa`, `.internal` or `.localdomain`. This blocks websites that try to reach your server
through their own names (DNS rebinding). To use another name, list it in `config.toml`:

```toml
[admin]
enabled = true
allowed_hosts = ["door.example.com"]
```

Names from your router or VPN that end in a public domain, such as a FRITZ!Box name
(`inkdoor.fritz.box`) or a Tailscale name (`inkdoor.tail1234.ts.net`), need to be listed too:
whoever controls that domain could otherwise point a name of their own at your server.

Write each name exactly as typed in the browser, without the port and without wildcards. A name
with accents or other non-ASCII letters goes in its ASCII form (punycode, starting with
`xn--`); an entry with a port or with non-ASCII letters is reported as a config error. If the
Kindle's `URL` uses a name that is not allowed, the door shows a screen saying
so.

### On a laptop

Plain `inkdoor serve` on your own computer serves only the Kindle image: a laptop joins
networks you do not control. To use the admin there, add this to `config.toml`:

```toml
[admin]
enabled = true
```

Then run `inkdoor password`, restart `inkdoor serve` and open `http://<computer-ip>:3667`
(`inkdoor url` prints the address). Turn it off again before taking the laptop to a network you
do not trust.

## Security

- **Keep it on your local network.** Never forward the port on your router: the image shows
  your schedule. If the server has a firewall, allow the port only from your LAN.
- Only `/kindle.png` and the Kindle's KPM repository (`/kpm.json`, `/kpm/inkdoor.kpkg`: the
  Kindle scripts and this server's address) are public; every other page needs the admin login.
  The service runs as an
  unprivileged user in a systemd sandbox that can only write to `/var/lib/inkdoor` and
  `/etc/inkdoor`.
- `config.toml` holds secret calendar links: anyone who has them can read your calendars. On a
  server, it and the password file are readable only by the `inkdoor` user.
- Anyone who logs in to the admin can make the server fetch addresses on your local network
  with **Test link**, including other services on the server's own LAN address; only loopback
  (`127.0.0.1`, `localhost`) and link-local addresses are refused. That is how a calendar on a
  LAN server such as Nextcloud works, and it is an accepted risk, so keep the password private.
- Calendar links are fetched through the proxy set in inkdoor's environment, if any
  (`HTTPS_PROXY`, `NO_PROXY`; on macOS also the system proxy), so it works on networks that only
  reach the internet through one. The loopback and link-local check above uses the calendar's
  address as this machine sees it. Logins from a `.netrc` file are never sent with a link.
