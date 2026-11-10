# TVBox v2.1.0 规划书 · 资源扩展 / 字幕 / 实时字幕 / 预加载

> 版本：v2.1.0　　编写日期：2026-11-08　　适用范围：Pro 版 `index.html`（全量）、Mini 版 `mini.html`（仅字幕导入）
> **CDN 组件库（`src/` 与 `dist/`）本轮冻结，不修改，版本停留在 2.0.1。**

---

## 0. 范围界定

| 能力 | Pro `index.html` | Mini `mini.html` | CDN 组件库 |
|---|---|---|---|
| 更多资源接口 | ✅ 全量 | ❌ | ❌ |
| 一键导入字幕（SRT/VTT/ASS/SSA） | ✅ | ✅ | ❌ |
| 字幕样式设置（字体/描边/背景/字号/位置） | ✅ | ❌（固定白字黑边，保证可读） | ❌ |
| 实时字幕 Beta（浏览器端 ASR） | ✅ | ❌ | ❌ |
| 模型选择 + 下载进度（MD3） | ✅ | ❌ | ❌ |
| 首页资源后台预加载 | ✅ | ❌ | ❌ |

理由：Mini 的定位是「单文件轻量外壳」，塞入 40–230MB 的模型与样式面板与自身定位冲突；CDN 版按用户指示本轮不动，待 Pro 验证稳定后再合并。

---

## 1. 已完成的实测验证（方案可行性依据）

### 1.1 模型来源：魔搭社区（ModelScope），非 HuggingFace

| 检查项 | 结果 |
|---|---|
| `Xenova/whisper-tiny`、`-base`、`-small` 三个仓库 | 均存在，根目录含 `config.json` / `tokenizer.json` / `preprocessor_config.json` / `generation_config.json` / `onnx/` |
| `https://www.modelscope.cn/models/{repo}/resolve/master/{file}` | `200`，`Access-Control-Allow-Origin: *` |
| `.../api/v1/models/{repo}/resolve/master/onnx/*.onnx` | `302` → `cdn-lfs-cn-1.modelscope.cn`，签名直链 |
| LFS CDN 文件域 | `206`，`Accept-Ranges: bytes`，`Access-Control-Allow-Origin: *` |

结论：**浏览器可直接跨域下载模型**，无需任何代理，支持断点/分片（Range）。

### 1.2 推理库：jsDelivr（全球 CDN）

| 检查项 | 结果 |
|---|---|
| `cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js` | `200`，582 KB，`Access-Control-Allow-Origin: *` |

用法：普通 Worker（Blob URL）内 `import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js')`，不打包进 HTML；`env.remoteHost='https://modelscope.cn/'`、`env.remotePathTemplate='models/{model}/resolve/master/'`，并用 fetch 钩子把任何落入 HuggingFace 域名的请求改写回魔搭兜底。

### 1.3 三档模型体积（q8 量化，实测字节数）

| 档位 | encoder | decoder_merged | 合计（含配置约 2 MB） | 定位 |
|---|---|---|---|---|
| `Xenova/whisper-tiny` | 10.1 MB | 30.7 MB | **≈ 42 MB** | 轻量 |
| `Xenova/whisper-base` | 23.2 MB | 53.7 MB | **≈ 76 MB** | 均衡 |
| `Xenova/whisper-small` | 92.3 MB | 156.8 MB | **≈ 240 MB** | 高精度 |

实测口径：每档 7 个必需文件（`config.json`、`generation_config.json`、`preprocessor_config.json`、`tokenizer.json`、`tokenizer_config.json`、`onnx/encoder_model_quantized.onnx`、`onnx/decoder_model_merged_quantized.onnx`），共 21 个链接全部返回 `200/206` 且带 `ACAO:*`；字节数含 tokenizer（约 2.4 MB）等配置。推理库最终采用 `@huggingface/transformers@4.3.0`（`q8` 在该版本映射到 `_quantized` 后缀，与魔搭仓库文件名一致）。

三档均使用多语种权重（非 `.en`），中文可识别。q4f16 在 WASM 后端不可用，故统一 q8。

### 1.4 新增资源接口（匿名实测，返回标准苹果 CMS JSON）

可用 6 个：

| 名称 | 接口 |
|---|---|
| 无尽资源 | `https://api.wujinapi.com/api.php/provide/vod/` |
| 电影天堂 | `https://caiji.dyttzyapi.com/api.php/provide/vod/` |
| 百度云资源 | `https://api.apibdzy.com/api.php/provide/vod/` |
| 魔都资源 | `https://www.mdzyapi.com/api.php/provide/vod/` |
| 最大资源 | `https://api.zuidapi.com/api.php/provide/vod/` |
| 360 资源 | `https://www.360zy.com/api.php/provide/vod/` |

实测不可用（空响应 / 403 / Cloudflare 挑战 / 域名失效），已剔除：1080zyku、rycjapi、maotaizy、kuaikanzy、lezhizy、huangfeizy、ys2008、xiaomazy、douubizy、modouzy、subo、xinlangapi、cj.ukuapi、tiankongapi。

资源总数 7 → **13**。

---

## 2. 架构设计

Pro 版是单文件，因此新增代码按「自包含段」组织，全部内联在 `index.html`，命名前缀统一 `SUB_` / `ASR_` / `PRE_`，避免与既有全局冲突。

```
┌─ 字幕子系统 ────────────────────────────────┐
│ SubParse   解析 SRT / VTT / ASS / SSA + 编码探测 │
│ SubStore   按 source:vod_id 持久化 cues         │
│ SubView    字幕层 DOM + 样式应用（CSS 变量驱动）  │
│ SubPanel   播放器内的导入/选择/关闭面板           │
└──────────────────────────────────────────────┘
┌─ 实时字幕 ───────────────────────────────────┐
│ AsrCatalog 三档模型元数据 + 设备评分推荐         │
│ AsrDl      下载与进度（驱动 pipeline 预热缓存）   │
│ AsrEngine  AudioContext(16k) → AudioWorklet →   │
│            Worker(transformers.js) → 增量文本    │
└──────────────────────────────────────────────┘
┌─ 预加载 ─────────────────────────────────────┐
│ Preload  idle 调度 → detail → 首页前 N 条首集预热 │
└──────────────────────────────────────────────┘
```

### 2.1 字幕样式：单一来源 CSS 变量

字幕层只读 `#videoWrap` 上的 CSS 变量，设置项写入变量即生效，不做 DOM 重建：

```
--sub-font      字体栈
--sub-size      字号（clamp 由 JS 计算 px）
--sub-color     文字色
--sub-edge      描边色
--sub-edge-w    描边宽度 px（0 = 关闭）
--sub-bg        背景色（含 alpha）
--sub-bottom    距底部 %
```

「白字黑边」与「黑字白边」是一组预设，切换即改 4 个变量，用户仍可单独微调。

### 2.2 实时字幕数据流

```
video ──createMediaElementSource──┬─→ destination（保证扬声器有声）
                                  └─→ AudioWorklet(16k, 单声道)
                                        └─ postMessage(Float32Array 块)
主线程   累积到 lookahead 秒 → 静音门限判断 → 送 Worker
Worker   pipeline('automatic-speech-recognition', 模型, {language:'chinese'})
         → postMessage({text})
主线程   写入「实时 cue」→ SubView 渲染（覆盖手动字幕）
```

关键点：
- `AudioContext({sampleRate:16000})` 由浏览器完成重采样，免自己写滤波器。
- `createMediaElementSource` 会截断原音频输出，**必须** `connect(ctx.destination)`。
- Worker 用 `type:'module'` + Blob URL，内部 `import` jsDelivr 的 transformers.js。
- 切集不销毁 Worker（模型重载代价 40–230MB），只暂停送流并清空缓冲。

### 2.3 「提前识别几秒」语义

用户可滑动 **1–10 秒**（默认 4）。含义：每轮送入 ASR 的音频窗口长度。
- 窗口短 → 出字快、上下文少、断句碎（适合对话密集）
- 窗口长 → 出字慢、上下文足、标点与长句更准
内部步进固定 1 秒，窗口内相邻轮次重叠 50%，抑制断字。

### 2.4 首页预加载语义

对首页推荐的前 N 条（默认 4，可 1–10）：
1. `ac=detail` 取详情 → 按既有 `pickDefaultSource` 选线路 → 第 1 集 URL
2. `.m3u8`：取 playlist 文本 → 再对首个分片发 `Range: bytes=0-65535`，预热 DNS/TLS/CDN 边缘
3. 直链 mp4：`Range: bytes=0-524288`
串行、间隔 800 ms、单条 8 秒超时、总预算 30 秒，`requestIdleCallback` 启动，页面隐藏即暂停。已预热的 key 记入 `sessionStorage`，不重复。

---

## 3. 功能规格（逐条）

### F1. 资源接口扩展至 13 个
- `DEFAULT_SOURCES` 追加 6 条（`cors:false`，走代理；`search:true`）。
- 设置页「数据源」区自动列出，默认全部启用；老用户 `localStorage` 里只存 `{key,enabled}`，新增项按默认值合并，不会丢配置。

### F2. 一键导入字幕
- 入口：播放器控制条新增 CC 按钮 → 字幕面板。
- 面板内容：当前状态、导入文件按钮（点击选文件）、拖放区域、移除字幕、实时字幕开关、「字幕样式」跳转设置。
- 支持 `.srt` `.vtt` `.ass` `.ssa`；编码自动识别（BOM → `utf-8`；解出替换字符则回退 `gbk`）。
- 导入成功：立即渲染 + 写入 `tvbox_subs`（上限 20 部，单部 400 KB，超限淘汰最旧）。
- 再次打开同一作品：自动挂载上次导入的字幕，面板显示文件名与条数。
- 时间轴：按 `video.currentTime` 二分查找当前 cue；`seek`/`timeupdate` 均更新；同刻多条合并成两行。

### F3. 字幕样式设置（独立 section）
| 项 | 控件 | 范围 |
|---|---|---|
| 字体 | 三选卡片：宋体（系统）/ MiSans（jsDelivr）/ 思源黑体（jsDelivr） | — |
| 字号 | 滑块 | 14–40 px |
| 配色方案 | 两选：白字黑边 / 黑字白边 | — |
| 描边粗细 | 滑块 | 0–4 px（0.5 步进） |
| 背景透明度 | 滑块 | 0–100 % |
| 底部位置 | 滑块 | 4–30 % |
| 预览 | 实时预览条（播放器画面比例的缩略块） | — |

字体加载：`@font-face` 懒加载，仅在选中时注入，失败静默回退系统字体（不阻塞播放）。

### F4. 实时字幕 Beta
- 设置页「实时字幕（Beta）」section：模型三卡 + 下载进度 + 「提前识别」滑块 + 自动开启开关。
- 播放器字幕面板：「开启实时字幕」按钮；未下载模型时按钮旁提示「先去设置下载模型」。
- 运行中：字幕层右上角显示「实时」小徽标；识别文本覆盖手动字幕。
- 停止：面板按钮 / 关闭播放器 / 切集（保留 Worker）。
- 失败降级：无 WebGPU 用 WASM；模型加载失败提示并给出「换个更小的模型」。

### F5. 模型选择与下载进度（MD3）
- 三张卡：`轻量 43MB` / `均衡 79MB` / `高精度 236MB`，每张含：体积、三项优点（速度、中文准确度、内存占用）、适用设备。
- 设备评分自动打「推荐」徽标：
  `score = (cores≥8?2:cores≥4?1:0) + (mem≥8?2:mem≥4?1:0) + (webgpu?2:0) - (mobile?1:0)`
  `score≥5 → 高精度`，`≥2 → 均衡`，`else → 轻量`。
- 下载状态：未下载 / 下载中（线性进度条 + 百分比 + 已下载/总量 + 速度）/ 已缓存（显示占用体积）。
- 缓存：transformers.js 默认 Cache Storage；另在 `tvbox_asr_state` 记 `{model, bytes, at}` 用于 UI 判断。
- 可删除缓存（`caches.delete` 对应 cacheName + 清 meta）。

### F6. 首页预加载
- 设置页「首页预加载」section：开关 + 条数滑块（1–10，默认 4）+ 一句说明（消耗流量）。
- 关闭即中止在途请求（AbortController 集合）。

### F7. Mini 导入字幕
- Mini 播放器控制条新增「字幕」按钮 → 选文件 → 解析 → 渲染。
- 样式固定为白字黑边 + 30% 黑底（保证任何画面上可读）。
- 仅当前会话有效 + 记住最近一次（`tvbox_mini_sub`），不做样式面板。

---

## 4. UI 规范（Material 3，与本项目既有风格一致）

- **设置 section**：沿用 `st-section` / `st-label` / `st-card` / `st-item`。
- **模型卡**：圆角 20px、1px `--ol-v` 描边；选中 2px `--p` 描边 + `--p-c` 淡底；右上角「推荐」pill（`--t` 底）。
- **进度条**：高 4px、圆角 2px，轨道 `--sf-v`，填充 `--p`，下载中带 1.4s 呼吸（仅在下载中）。
- **滑块**：自绘轨道与拇指（不依赖原生外观），轨道 4px `--sf-v`，已选段 `--p`，拇指 18px 白底 2px `--p` 边，聚焦时 40px 光晕。
- **字幕层**：`pointer-events:none`，`text-shadow` 由变量合成（4 向 + 8 向共 8 层描边模拟，避免 `-webkit-text-stroke` 在部分机型上吃字形）。
- 所有可点元素加 `user-select:none`；图标全部内联 SVG / 既有 iconify 体系。

---

## 5. 存储键

| 键 | 内容 | 上限 |
|---|---|---|
| `tvbox_subs` | `{ "src:vodid": {name, cues:[[s,e,text]], at} }` | 20 部 / 单部 400 KB |
| `tvbox_sub_style` | `{font,size,mode,edge,bg,bottom}` | — |
| `tvbox_asr` | `{model,lookahead,auto}` | — |
| `tvbox_asr_state` | `{model, bytes, at}` | — |
| `tvbox_preload` | `{on,count}` | — |
| `tvbox_mini_sub` | Mini 最近一次字幕 | 400 KB |

---

## 6. 边界与降级

| 场景 | 处理 |
|---|---|
| 非 HTTPS / `file://` | 导入字幕可用；实时字幕禁用并提示「需 HTTPS」 |
| iOS Safari | 模型 > 100 MB 可能 OOM → 推荐卡强制「轻量」，并提示 |
| 无 WebGPU | 走 WASM（q8），速度约慢 2–4× |
| 模型下载中断 | 任务可重试；Cache Storage 已写入的分片由服务端 Range 续传 |
| 字幕编码非 UTF-8 | 自动 `gbk` 回退；仍乱码则提示转码 |
| 预加载占用流量 | 默认 4 条 + 开关 + 页面隐藏暂停 |
| 播放器切集 | 手动字幕保留（同作品），实时字幕重置上下文 |
| 全屏 | 字幕层位于 `#videoWrap` 内，随全屏同步缩放 |

---

## 7. 实施批次（每批可独立验证）

| 批次 | 内容 | 验收 |
|---|---|---|
| P1 | 源扩展至 13 个 | 设置页数据源 13 行；首页/搜索能出新增源条目 |
| P2 | 字幕解析 + 渲染 + 导入（Pro） | 导入 srt/vtt/ass 各 1 份，时间轴对齐，切集保留 |
| P3 | 字幕样式设置 + 预览 | 6 个控件全部生效、刷新后保持 |
| P4 | 模型目录 + 设备评分 + 下载进度 | 三卡渲染、推荐徽标正确、下载进度到 100% 后可复用 |
| P5 | 实时字幕引擎 | 播放中出字；停止后不残留；切集不崩 |
| P6 | 首页预加载 | 开关生效；Network 面板可见 playlist/分片预热请求 |
| P7 | Mini 导入字幕 | 选文件后字幕出现在播放器，样式可读 |
| P8 | 版本 / CHANGELOG / README / 自检 | 版本 2.1.0，语法检查通过 |

---

## 8. 明确不做（避免范围蔓延）

- 不做字幕在线搜索/匹配字幕站（无稳定公开源，且涉及版权）。
- 不做字幕编辑与时间轴微调（本轮目标是「可用」）。
- 不做语音翻译（whisper 的 translate 只到英文，需求未提）。
- 不把模型打包进 HTML（违背单文件轻量初衷，且 43 MB 起步）。
- 不改 CDN 组件库与 `dist/`。
