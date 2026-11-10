# Calendar links

**English** · [Português (Brasil)](pt-BR/calendar-sources.md)

inkdoor reads any calendar that has an ICS (iCalendar) link. Add each link in the
[admin](server.md#admin) and, after saving, press **Test link**; or paste it into `config.toml`
and run `inkdoor check`.

> **These links are secret.** Anyone with the link can read the whole calendar, including
> descriptions and meeting passcodes. Never publish your `config.toml`, and if a link leaks,
> create a new one (unpublish and publish again).

## Microsoft 365 / Outlook

1. Sign in at [outlook.office.com](https://outlook.office.com).
2. Settings → Calendar → **Shared calendars**.
3. Under **Publish a calendar**, pick the calendar and the permission
   **Can view all details**. Click Publish.
4. Copy the **ICS** link (the HTML one is only for viewing in a browser).

Repeat for each account. What you may find on work accounts:

| What you see | Result in inkdoor |
|---|---|
| "Can view all details" is available | Works fully, with titles. |
| Only "Can view when I'm busy" | The door status works; the list shows "Busy" instead of titles. |
| No "Publish a calendar" section | Your organization disabled publishing. |

Windows time zone names (`E. South America Standard Time`, `Mountain Standard Time`…) are
converted automatically.

## Google Calendar

1. [calendar.google.com](https://calendar.google.com) → Settings (gear icon).
2. Click the calendar on the left.
3. Copy the **Secret address in iCal format**.

## TickTick

On TickTick for desktop or the web:

1. Avatar → **Settings** → **Integrations & Import**.
2. Under **Others**, open **Subscribe to TickTick**.
3. Click **Enable the URL**, pick the list and copy the link it makes (it may start with
   `webcal://`; inkdoor accepts it).

Which plans include this option is up to TickTick; see its
[help article](https://help.ticktick.com/articles/7055781574649839616).

Tasks due today and overdue ones (up to `overdue_days`) are shown. Completed tasks are skipped.

## How inkdoor treats each event

- **Cancelled** meetings are skipped.
- Events marked as **free** (TRANSP) are listed but do not make the door busy. The same goes
  for all-day events, which appear as tags.
- Teams, Zoom and Meet links in the location field are hidden.
- Repeats of the same event **within one calendar** are merged; different calendars are never
  mixed.
- If a calendar cannot be read, the last good data from today is reused and the footer says
  which one failed. If there is no data for it yet, the door shows "Knock first" instead of
  "Free".
