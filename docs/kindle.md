# Setting up the Kindle

**English** · [Português (Brasil)](pt-BR/kindle.md)

inkdoor runs on jailbroken Kindles. The Kindle side is small: a couple of scriptlets that turn
off the Kindle interface and show the image rendered by your computer.

## Which Kindle do I have?

inkdoor draws the image at your Kindle's resolution: pick the model on the admin's **Screen**
page (or set `screen` under `[display]` in `config.toml`, for example `screen = "1236x1648"`).
The default is 1072 × 1448. These are the Kindles that current jailbreaks support:

| Screen | Kindle models |
|---|---|
| 600 × 800 | Kindle 2014, 2016 and 2019 (7th, 8th and 10th generation) |
| 758 × 1024 | Kindle Paperwhite 1 and 2 (2012, 2013) |
| 1072 × 1448 | Kindle Paperwhite 3 and 4 (2015, 2018), Voyage, Oasis 2016, Kindle 2022 and 2024 (11th generation) |
| 1236 × 1648 | Kindle Paperwhite 5 and Signature Edition (2021) |
| 1264 × 1680 | Kindle Oasis 2017 and 2019 |
| 1272 × 1696 | Kindle Paperwhite 2024 and Colorsoft |
| 1860 × 2480 | Kindle Scribe 2022 and 2024 |

On firmware 5.14 or newer, Settings → Device Options → Device Info names the model. The layout
keeps the same proportions on every screen, with text sized for it.

- If the image does not fill the screen, or its edges are cut off, the model on the **Screen**
  page is not yours.
- The Paperwhite 2024 and the Colorsoft size comes from screenshots, not from inkdoor running on
  them, and the Colorsoft shows the door in gray. If you have one, a report is very welcome
  ([open an issue](https://github.com/frkey/inkdoor/issues/new/choose)).
- Which firmware versions can be jailbroken changes over time: check
  [Kindle Modding](https://kindlemodding.org/jailbreaking/) before you start.

## 1. Jailbreak

Follow the up-to-date guide at [Kindle Modding](https://kindlemodding.org/jailbreaking/). The
method depends on your model and firmware version (Settings → Device Options → Device Info).
Recent jailbreaks install support for **scriptlets**: `.sh` files in the `documents` folder
that show up in the library and run when you tap them.

Before you start, put the Kindle in **airplane mode** so it does not update its firmware.

## 2. Install

### Download the files from the admin

On the admin's **Home** page, press **Download the Kindle files**. The `.zip` already has your
server's address and your language in `inkdoor/config.sh`. With the Kindle connected over USB:

1. Unzip it.
2. Copy the `inkdoor` folder to the root of the Kindle, next to its `documents` folder.
3. Copy the files in `scriptlets` into the Kindle's `documents` folder. Copy the files, not the
   folder: replacing `documents` would remove your books.

The `README.txt` inside the zip has the same steps.

### Updates through KPM (optional)

Recent jailbreaks come with **KPM**, the Kindle Package Manager, and your inkdoor server works as
a KPM repository. Once the files above are on the Kindle, open **inkdoor - connect KPM** in the
library, once: it adds your server to KPM and installs inkdoor from it, keeping your `config.sh`
settings. From then on, to update the Kindle after updating the server, type in the Kindle's
search bar, pressing Enter after each line:

```
;kpm update
;kpm upgrade
```

To remove inkdoor, type `;kpm uninstall inkdoor`.

The server cannot be added with `;kpm add-repo` from the search bar: the Kindle drops any
search command whose text has a `.` or a `:`, so an address never reaches KPM
([KindleModding/KPM#5](https://github.com/KindleModding/KPM/issues/5)). That is why the
scriptlet does it. If the server's address changes, put the new one in `URL` in
`inkdoor/config.sh` (the admin's **Home** page shows it) and open **inkdoor - connect KPM** again.

### By hand

From a copy of this repository, with the Kindle connected over USB:

```
Kindle/
├── documents/
│   ├── inkdoor-start.sh       ← from kindle/documents/
│   ├── inkdoor-test.sh        ← from kindle/documents/
│   └── inkdoor-kpm.sh         ← from kindle/documents/ (optional, for KPM updates)
└── inkdoor/                   ← the whole kindle/inkdoor/ folder
    ├── common.sh
    ├── config.sh
    └── loop.sh
```

Edit `inkdoor/config.sh`:

```sh
URL="http://192.168.0.10:3667/kindle.png"   # IP of the computer running "inkdoor serve"
INTERVAL=300                                # longest wait between updates, in seconds
FULL_REFRESH_EVERY=6                        # every N updates, a full refresh (flashes, clears ghosting)
LANGUAGE="en-US"                            # messages on the Kindle: en-US or pt-BR
```

You can edit it on Windows: line endings are fixed automatically.

## 3. Use

Eject the Kindle. The library now shows:

- **inkdoor - test connection**: turns on Wi-Fi, downloads the image once and reports the
  result. Changes nothing on the Kindle.
- **inkdoor - start display**: turns off the Kindle interface and starts showing your day.
- **inkdoor - connect KPM**: only needed once, for [updates through KPM](#updates-through-kpm-optional).

**To get the normal Kindle back, restart it** (hold the power button). The display does not
start by itself after a restart.

## Tips

- **Power**: the display keeps Wi-Fi on and does not use deep sleep, so keep the Kindle on a
  charger. A thin USB cable fits through most door frames.
- **Fixed IP**: reserve an IP for your computer on the router; otherwise the address changes
  and the display stops updating. A home server avoids this and never sleeps
  ([docs/server.md](server.md)).
- **On time**: the server redraws the door right when a meeting starts or ends and tells the
  Kindle when to come back, so the status changes within seconds. `INTERVAL` is only the
  longest wait between updates; this needs the Kindle scripts from version 1.2 (`;kpm upgrade`
  or a new zip).
- **Single instance**: tapping "start display" twice does not start two loops.
- **No connection**: after 3 failures in a row, "cannot reach the computer" appears in the
  corner of the screen. The history is in `inkdoor/log.txt`, and
  [Troubleshooting](troubleshooting.md#on-the-kindle) explains every message.
