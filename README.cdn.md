# TVBox Web CDN Guide

**English** · [简体中文](README.cdn.zh-CN.md)

What is on the CDN and how to call it. For the player itself see [README.md](README.md).

Licence: `AGPL-3.0-or-later`. CDN files match the repo; versions match the [releases](https://github.com/silverbullet-liang/tvbox-web/releases).

---

## 1. What is available

| File | Contents | Size |
| --- | --- | --- |
| `dist/tvbox-web.min.js` | Component library (minified), hls.js and mqtt.js inlined | ~1.07 MB |
| `dist/tvbox-web.js` | Component library (source) | ~1.08 MB |
| `dist/tvbox-sdk.min.js` | API SDK (minified) | ~6 KB |
| `dist/tvbox-sdk.js` | API SDK (source) | ~10 KB |
| `index.html` | Pro build | ~216 KB |
| `lite.html` | Mini build | ~84 KB |
| `promo.html` | Landing page | ~34 KB |

The component library ships its own hls.js 1.7.3 and mqtt.js 5.15.1 — **no extra CDN tags needed**. Only the Cast SDK is fetched from Google, since there is no reliable self-hosted copy.

### URLs

```html
<!-- pinned (recommended) -->
https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-web.min.js

<!-- follow main -->
https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@main/dist/tvbox-web.min.js

<!-- raw fallback -->
https://raw.githubusercontent.com/silverbullet-liang/tvbox-web/main/dist/tvbox-web.min.js
```

jsDelivr gzips / brotlis on top, so the wire size is roughly 300 KB.

---

## 2. Component library: TVBox.mount()

```html
<div id="tvbox-app" style="height:100vh"></div>
<script src="https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-web.min.js"></script>
<script>TVBox.mount('#tvbox-app');</script>
```

The container needs a height; the internal layout is percentage-based.

### Options

```js
const app = TVBox.mount('#tvbox-app', {
  sources: [
    {
      key: 'lzi',                                         // unique id, keys history / favorites
      name: 'Quantum',                                    // display name
      api: 'https://cj.lziapi.com/api.php/provide/vod/',   // MacCMS v10 endpoint
      type: 1,                                            // 1 = movies/TV
      enabled: true,
      search: true,                                       // participate in server-side search
      cors: false                                         // false = known to lack CORS
    }
  ],
  theme: 'purple'                                         // purple | yellow | green | blue
});
```

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `sources` | Array | 7 built-ins | Replaces the built-in set entirely |
| `theme` | String | last saved | Initial palette |

### Return value

```js
app.id;           // 'tvbox-root'
TVBox.version;    // '2.0.0'
TVBox.unmount();  // remove and mount again later
```

One instance per page; a second `mount` unmounts the first.

### Bundled libraries

```js
TVBoxCenter.hls;    // hls.js 1.7.3
TVBoxCenter.mqtt;   // mqtt.js 5.15.1
```

Also usable in a Worker (loads the libraries without running the UI):

```js
importScripts('https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-web.js');
const { hls, mqtt } = self.TVBoxCenter;
```

### Features

- **Home**: continue watching, carousel banner (4.5s auto-rotate, swipeable, refresh), favorites, recommendation grid; merged from all sources, cached 5 minutes.
- **Search**: parallel across sources, live suggestions after 2 characters, Enter or button, load more.
- **Player**: hls.js / native HLS, line switching, episodes, seek, speed 0.5–2x, aspect (auto / 16:9 / 4:3 / fill / fit), fullscreen, picture-in-picture.
- **Gestures**: horizontal seek, vertical volume, double-tap fullscreen, long-press 2x.
- **Keyboard**: Space, ← →, J L, ↑ ↓, M, F, Esc.
- **Watch Together**: per-title room over MQTT, chat, online count, unread badge, progress sync and follow, share link.
- **Ad skip**: three-colour buttons + red/gold palette, jumps 15s with an undo action.
- **History / favorites**: local storage, long-press a card to favorite.
- **Settings**: 4 themes, per-source toggles, CORS proxy (auto / off / custom), 5 playback switches, intro/outro skip, default speed and aspect.
- **Backup**: export / import `.tvcbak`, AES-GCM-256 + PBKDF2 (200k) + GZIP.
- **Casting**: Chromecast.

Everything is stored in the browser; nothing is uploaded.

---

## 3. API SDK: TVBoxSDK

Requests and parsing only, no UI, ~6 KB minified.

```html
<script src="https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-sdk.min.js"></script>
```

Node:

```js
const TVBoxSDK = require('./tvbox-sdk.min.js');
```

### Client

```js
const client = TVBoxSDK.create({
  sources: [
    { key: 'lzi', name: 'Quantum', api: 'https://cj.lziapi.com/api.php/provide/vod/' },
    'https://cj.ffzyapi.com/api.php/provide/vod/'
  ],
  cors: 'auto',        // auto | off | custom
  proxy: '',           // used when cors === 'custom', {url} placeholder
  timeout: 12000
});
```

| Method | Description |
| --- | --- |
| `client.get(keyOrName)` | Get a source instance |
| `client.add(src)` | Append a source |
| `client.list(key, {page, wd, t})` | Single-source list / search |
| `client.detail(key, id)` | Single-source detail |
| `client.search(wd, {page, t})` | Parallel search, merged and de-duplicated, tagged with `_source` / `_sourceKey` / `_api` |
| `client.suggest(wd, limit)` | Parallel suggestions |

### Single source

```js
const src = TVBoxSDK.source({ api: 'https://cj.lziapi.com/api.php/provide/vod/' }, { timeout: 8000 });

await src.list({ page: 1 });     // { ok, list, total, pagecount }
await src.detail('12345');
await src.suggest('In', 10);
src.url({ ac: 'list', pg: 1 });  // URL only
```

### Parsing helpers

```js
TVBoxSDK.parseEpisodes('Ep01$https://a/1.m3u8#Ep02$https://a/2.m3u8');
TVBoxSDK.parsePlay(detail.vod_play_url, detail.vod_play_from);
// { order: ['Source A', 'Source A m3u8'], groups: { name: [{name,url}] } }
TVBoxSDK.parsePlayUrls(url, from);          // legacy, groups only
TVBoxSDK.pickDefaultFrom(order, groups);    // prefers m3u8 (usually "默认源2")
TVBoxSDK.buildUrl(api, { ac: 'list', pg: 1 });
TVBoxSDK.proxyUrl(url, 'https://p.com/?url={url}');
TVBoxSDK.request(url, timeout);
```

### Proxy

Same rules as the component library: in `auto`, sources with `cors: false` go straight through `corsmirror.com`, others try direct for 4s then fall back; `custom` uses your own endpoint.

---

## 4. Embedding the full app

```html
<iframe
  src="https://silverbullet-liang.github.io/tvbox-web/index.html"
  style="width:100%;height:100vh;border:0"
  allow="fullscreen; autoplay; clipboard-write"
  referrerpolicy="no-referrer"></iframe>
```

`lite.html` works the same way and is lighter.

---

## 5. FAQ

**CORS errors / no results?**
Several sources stopped sending CORS headers; the library proxies automatically. Self-hosted: set your own endpoint under Settings → CORS proxy. The SDK does not proxy silently — use `cors: 'custom'` or forward through your backend.

**Blank area after `mount`?**
Check the container height first, then the console. The library only needs `fetch` / `WebSocket` / `crypto.subtle`.

**Two instances on one page?**
Not supported; the second `mount` unmounts the first.

**CDN and repo out of sync?**
jsDelivr caches `@main`. Pin a version, or purge:
`https://purge.jsdelivr.net/gh/silverbullet-liang/tvbox-web@main/dist/tvbox-web.min.js`.

**Backup won't open?**
Export / import need `crypto.subtle`, so HTTPS or localhost only.

---

## 6. Licence

AGPL-3.0-or-later. Pulling from the CDN counts as using the library unmodified; modified versions offered as a service must be open-sourced too.
