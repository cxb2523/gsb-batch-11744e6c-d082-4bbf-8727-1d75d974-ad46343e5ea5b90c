# Troubleshooting

**English** · [Português (Brasil)](pt-BR/troubleshooting.md)

Start with the two commands that answer most questions, on the server (in a Proxmox container,
prefix them with `pct exec <id> --`):

```sh
inkdoor check                          # tests every calendar and task link
journalctl -u inkdoor -n 50 --no-pager # the service's recent log
```

Neither one ever prints a calendar link, so their output is safe to share in an issue.

## What the door shows

| Screen | What it means | What to do |
|---|---|---|
| **SETUP** · *inkdoor is almost ready* | No calendar and no task list has a link yet. | Open the admin address shown on the screen and add your calendars. |
| **KNOCK FIRST** · *calendar unavailable* | A calendar that marks you busy could not be read, and there is no data from it today. The line below names it. | Run `inkdoor check`, or press **Test link** for that calendar in the admin. See [Test link results](#test-link-and-inkdoor-check-results). |
| **KNOCK FIRST** · *no busy calendar* | Calendars are set up, but none of them marks you busy, so the door cannot know when you are free. | In the admin, edit the calendar with your meetings and turn on **Marks you busy**. |
| **KNOCK FIRST** · *address not allowed* | The Kindle reached the server through a host name that is not on the allow list. | Use the server's IP address in the Kindle's `URL`, or add the name to `allowed_hosts` ([details](server.md#opening-the-admin-by-name)). |
| **KNOCK FIRST** · *display error* | inkdoor itself failed to draw the screen. The error type is printed below. | Look at the service log and [open an issue](https://github.com/frkey/inkdoor/issues/new/choose) with it. |
| **KNOCK FIRST** · *display error*, "The screen stopped updating" | The server has not finished a refresh for more than 15 minutes past its time, or it was off for a while, so the last status may be old. | Look at the service log and restart the service (`systemctl restart inkdoor`). If it happens again, test each link. |
| A footer line like *unreachable: Work* | That calendar failed on the last refresh; the door is using its last good data from today. | Nothing, if it recovers on the next refresh; otherwise test the link. |

The door never says **Free** without knowing: whenever it cannot tell, it says **Knock first**.

## On the Kindle

| Message | What to do |
|---|---|
| *FAILED: Wi-Fi did not connect* | Make sure the Kindle is on the right Wi-Fi network and that airplane mode is off. |
| *FAILED: could not download the image.* | Check `URL` in `inkdoor/config.sh`: the address, the port (3667 on new installs, 8000 on older ones) and `/kindle.png` at the end. Open the same address in a browser on the same network. |
| *cannot reach the computer* (corner of the screen) | The last 3 downloads failed. The server is off, its address changed, or the Wi-Fi dropped. |
| *KPM is not installed on this Kindle.* | **inkdoor - connect KPM** needs KPM, which comes with recent jailbreaks. Without it, update by copying the zip again. |
| *URL in inkdoor/config.sh must be http://.../kindle.png* | **inkdoor - connect KPM** finds the server from `URL`. Fix it, or download the zip again. |
| *FAILED: KPM could not install inkdoor.* | The lines above it show KPM's error. Check `URL` in `inkdoor/config.sh`, that the server is on and that the admin is enabled: the KPM repository is only served while it is. |

- **The address changed**: if the server got its IP from DHCP, reserve that address on your
  router so it never moves.
- **History**: every attempt is logged in `inkdoor/log.txt` on the Kindle (connect it over USB
  to read it).
- **Back to the normal Kindle**: restart it (hold the power button). The display does not start
  again on its own.

## Test link and inkdoor check results

| Result | What it means | What to do |
|---|---|---|
| *link not pasted into config.toml yet* | The calendar has no link. | Paste the ICS link. |
| *access denied (HTTP 401 or 403)* | The provider refused the link: your organization blocks published calendars, or the calendar was unpublished. | Publish it again and copy the new link. |
| *link not found (HTTP 404)* | The link no longer exists. | Publish the calendar again and copy the ICS link. |
| *the link opened a web page, not a calendar* | You copied the HTML link. | Copy the link that ends in `.ics`. |
| *the server took too long to answer* | The provider did not answer within 30 seconds. | Try again later; check the server's internet access. |
| *could not reach the address* | Wrong address, no internet, or DNS failure. | Check the link and the server's network. |
| *address not allowed* | The link points to the server itself or to a link-local address. | Use the calendar's real address. |
| *this is not a valid link* | It does not start with `https://`, `http://` or `webcal://`. | Copy the whole link again. |
| *no events in the next 14 days* | The calendar is readable but empty. | Make sure you published the right calendar. |
| *the link only shows 'Busy'* | The calendar was published with "busy" detail only. | Publish it again with **Can view all details**; if that option is missing, the door still works. |
| *many events in the middle of the night* | The time zone is probably wrong. | Set the time zone on the admin's **Screen** page. |
| *could not read the events (TooManyOccurrences)* | The calendar repeats an event so often (every minute or second, say) that it has thousands of occurrences in a few days. inkdoor stops reading it. | Fix or remove that repeating event in your calendar app. |
| *could not read the events (CalendarTimeout)* | Reading the calendar took more than 30 seconds, usually because of a rule that repeats very often. | Same as above; with a very large calendar, publish a smaller one. |

Where to find each link: [Calendar links](calendar-sources.md).

## The admin

- **Forgot the password**: run `inkdoor password` on the server. It prints a new one and logs out
  every browser.
- **"This address is not allowed"** when opening the admin: you used a host name that is not on
  the allow list. Open it by the server's IP address, or [add the name](server.md#opening-the-admin-by-name).
- **"Too many attempts. Try again in…"** after several wrong passwords: the login waits longer
  after each failure from the same address. Wait, or make a new password.
- **"config.toml has a problem."**: the file was edited by hand and no longer loads. The door
  keeps using the last settings that worked; the admin says what is wrong and offers **Restore
  previous version**.
- **The admin does not open at all on a laptop**: it is off there by default
  ([turn it on](server.md#on-a-laptop)).

## The service

- **It does not start, with `226/NAMESPACE` in the log**: the Proxmox container needs the
  **nesting** feature (on by default for containers made by `create-lxc.sh`). Turn it on in the
  container's **Options → Features** and start it again.
- **"Port … is already in use"** when starting `inkdoor serve`: another program uses the port. Change `port` in
  `config.toml` and restart, or stop the other program.
- **The port changed after an update**: new installs use 3667, older configs may have 8000. See
  [which port an update uses](server.md#day-to-day).
- **After a hand edit**, most settings apply on the next refresh; a new `port` or a change to
  `[admin] enabled` needs `systemctl restart inkdoor`.

## Still stuck?

[Open an issue](https://github.com/frkey/inkdoor/issues/new/choose) with the output of
`inkdoor check`, the service log and what the door shows. Please leave out calendar links, names,
meeting titles and passwords.
