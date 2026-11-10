# TVBox Web CDN 使用说明

[English](README.cdn.md) · **简体中文**

CDN 上能拿到什么、怎么调。播放器源码见 [README.zh-CN.md](README.zh-CN.md)。

许可：`AGPL-3.0-or-later`。CDN 文件与仓库同源，版本号与 [Release](https://github.com/silverbullet-liang/tvbox-web/releases) 一致。

---

## 1. 可用资源

| 文件 | 说明 | 大小 |
| --- | --- | --- |
| `dist/tvbox-web.min.js` | 组件库（压缩），已内嵌 hls.js 与 mqtt.js | 约 1.07 MB |
| `dist/tvbox-web.js` | 组件库（源码） | 约 1.08 MB |
| `dist/tvbox-sdk.min.js` | 采集接口 SDK（压缩） | 约 6 KB |
| `dist/tvbox-sdk.js` | 采集接口 SDK（源码） | 约 10 KB |
| `index.html` | Pro 版整站 | 约 216 KB |
| `lite.html` | Mini 版整站 | 约 84 KB |
| `promo.html` | 宣传页 | 约 34 KB |

组件库自带 hls.js 1.7.3 与 mqtt.js 5.15.1，**不需要再引其他 CDN**。只有投屏用的 Cast SDK 由浏览器从 Google 官方地址加载（Google 不提供可自托管的稳定副本）。

### 取法

```html
<!-- 锁定版本（推荐） -->
https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-web.min.js

<!-- 跟随 main -->
https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@main/dist/tvbox-web.min.js

<!-- GitHub raw 兜底 -->
https://raw.githubusercontent.com/silverbullet-liang/tvbox-web/main/dist/tvbox-web.min.js
```

jsDelivr 会再压一次 gzip / brotli，实际传输约 300 KB。

---

## 2. 组件库：TVBox.mount()

```html
<div id="tvbox-app" style="height:100vh"></div>
<script src="https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-web.min.js"></script>
<script>TVBox.mount('#tvbox-app');</script>
```

容器必须有高度（`height` 或 `min-height`），内部按百分比布局。

### 参数

```js
const app = TVBox.mount('#tvbox-app', {
  sources: [
    {
      key: 'lzi',                                         // 唯一标识，进历史/收藏的键
      name: '量子资源',                                    // 展示名
      api: 'https://cj.lziapi.com/api.php/provide/vod/',   // MacCMS v10 接口，末尾斜杠可省
      type: 1,                                            // 1 = 影视，默认 1
      enabled: true,                                      // 是否启用
      search: true,                                       // 参与服务端搜索
      cors: false                                         // false = 已知无 CORS，自动模式直接走代理
    }
  ],
  theme: 'purple'                                         // purple | yellow | green | blue
});
```

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `sources` | Array | 内置 7 个源 | 传了就整套替换内置源 |
| `theme` | String | 本机已保存 | 初始配色 |

### 返回值

```js
app.id;           // 'tvbox-root'
TVBox.version;    // '2.0.0'
TVBox.unmount();  // 卸载，可再次 mount
```

一页只支持一个实例，再次 `mount` 会先卸载上一个。

### 内置第三方库

```js
TVBoxCenter.hls;    // hls.js 1.7.3
TVBoxCenter.mqtt;   // mqtt.js 5.15.1
```

Worker 里也能用（只装载库，不跑 UI）：

```js
importScripts('https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-web.js');
const { hls, mqtt } = self.TVBoxCenter;
```

### 功能

- **首页**：继续观看、热门推荐滚动 banner（4.5 秒轮播，可左右滑，换一批）、我的收藏、为你推荐网格；数据取自 7 源首页列表合并去重，缓存 5 分钟。
- **搜索**：多源并行，实时联想（输入 2 字以上），回车或按钮搜索，分页加载更多。
- **播放器**：hls.js / 原生 HLS 自适应，线路切换，选集，进度拖动，倍速（0.5–2x），画幅（自动 / 16:9 / 4:3 / 铺满 / 适应），全屏，画中画。
- **手势**：横滑快进快退、竖滑音量、双击全屏、长按 2 倍速。
- **快捷键**：空格播放暂停、← → 10 秒、J L 60 秒、↑ ↓ 音量、M 静音、F 全屏、Esc 退出。
- **一起看**：按作品生成房间，MQTT 聊天、在线人数、未读角标、进度同步与跟随、分享链接。
- **跳过广告**：三色按钮 + 红金配色两路视觉判断，命中后跳 15 秒并给出「取消」。
- **历史 / 收藏**：本地保存，长按卡片收藏。
- **设置**：4 套主题、7 源开关、跨域代理（自动 / 关闭 / 自定义）、5 个播放开关、跳过片头片尾、默认倍速与画幅。
- **备份**：导出 / 导入 `.tvcbak`，AES-GCM-256 + PBKDF2（20 万次）+ GZIP。
- **投屏**：Chromecast（Cast SDK）。

数据全部存在浏览器本地，不上传。

---

## 3. 采集 SDK：TVBoxSDK

只做接口请求与解析，不含 UI，压缩后约 6 KB。

```html
<script src="https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v2.0.1/dist/tvbox-sdk.min.js"></script>
```

Node：

```js
const TVBoxSDK = require('./tvbox-sdk.min.js');
```

### 客户端

```js
const client = TVBoxSDK.create({
  sources: [
    { key: 'lzi', name: '量子资源', api: 'https://cj.lziapi.com/api.php/provide/vod/' },
    'https://cj.ffzyapi.com/api.php/provide/vod/'      // 字符串也可以
  ],
  cors: 'auto',        // auto | off | custom
  proxy: '',           // custom 时的地址，支持 {url}
  timeout: 12000
});
```

| 方法 | 说明 |
| --- | --- |
| `client.get(keyOrName)` | 取单源实例 |
| `client.add(src)` | 追加数据源 |
| `client.list(key, {page, wd, t})` | 单源列表 / 搜索 |
| `client.detail(key, id)` | 单源详情 |
| `client.search(wd, {page, t})` | 多源并行搜索，合并去重，带 `_source` / `_sourceKey` / `_api` |
| `client.suggest(wd, limit)` | 多源联想 |

### 单源

```js
const src = TVBoxSDK.source({ api: 'https://cj.lziapi.com/api.php/provide/vod/' }, { timeout: 8000 });

await src.list({ page: 1 });     // { ok, list, total, pagecount }
await src.detail('12345');       // vod_name / vod_pic / vod_play_from / vod_play_url ...
await src.suggest('庆', 10);
src.url({ ac: 'list', pg: 1 });  // 只拼 URL
```

### 解析与工具

```js
TVBoxSDK.parseEpisodes('第01集$https://a/1.m3u8#第02集$https://a/2.m3u8');
// [{ name, url }, ...]

TVBoxSDK.parsePlay(detail.vod_play_url, detail.vod_play_from);
// { order: ['量子资源', '量子资源m3u8'], groups: { 线路名: [{name,url}] } }

TVBoxSDK.parsePlayUrls(url, from);          // 兼容旧接口，只返回 groups
TVBoxSDK.pickDefaultFrom(order, groups);    // 多线路时优先 m3u8（通常是「默认源2」）
TVBoxSDK.buildUrl(api, { ac: 'list', pg: 1 });
TVBoxSDK.proxyUrl(url, 'https://p.com/?url={url}');
TVBoxSDK.request(url, timeout);             // 裸 JSON 请求
```

### 代理

SDK 与组件库共用代理规则：`cors: 'auto'` 时，`cors: false` 的源直接走 `corsmirror.com`，其余先直连 4 秒再兜底；`custom` 用你自己的地址（`{url}` 占位）。

---

## 4. 直接嵌入整站

```html
<iframe
  src="https://silverbullet-liang.github.io/tvbox-web/index.html"
  style="width:100%;height:100vh;border:0"
  allow="fullscreen; autoplay; clipboard-write"
  referrerpolicy="no-referrer"></iframe>
```

`lite.html` 同理，单源、更轻。

---

## 5. 常见问题

**跨域报错 / 搜索结果为空？**
量子、暴风等源关闭了 CORS，组件库自动走第三方代理。自建部署可在「设置 → 跨域代理」填自己的地址。SDK 不做隐藏代理，需要在自有后端转发或设 `cors: 'custom'`。

**`mount` 后一片空白？**
先看容器有没有高度；再看控制台。组件库只依赖浏览器的 `fetch` / `WebSocket` / `crypto.subtle`。

**同一个页面挂两个实例？**
不支持，第二次 `mount` 会卸载前一个。

**CDN 与仓库对不上？**
jsDelivr 对 `@main` 有缓存，锁定版本号即可，或访问 `https://purge.jsdelivr.net/gh/silverbullet-liang/tvbox-web@main/dist/tvbox-web.min.js` 刷新。

**导出的备份打不开？**
备份需要 `crypto.subtle`，只能在 HTTPS 或 localhost 下导出 / 导入。

---

## 6. 许可

AGPL-3.0-or-later。通过 CDN 引入视为使用未修改的库；修改后对外提供服务需同样开源。
