#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验远端树与本地一致，并创建 v2.1.0 的 annotated tag 与 Release。"""
import json, os, subprocess, urllib.request, urllib.error

REPO = 'silverbullet-liang/tvbox-web'
API = 'https://api.github.com'
TOK = os.environ['GITHUB_TOKEN']
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header('Authorization', 'Bearer ' + TOK)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('User-Agent', 'tvbox-release')
    if data:
        r.add_header('Content-Type', 'application/json')
    for i in range(3):
        try:
            with urllib.request.urlopen(r, timeout=120) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')
            if e.code < 500:
                raise SystemExit('HTTP %s %s: %s' % (e.code, path, msg[:300]))
            if i == 2:
                raise


def local_sha(path):
    out = subprocess.check_output(['git', 'hash-object', path], cwd=ROOT)
    return out.decode().strip()


# 1) 比对远端树
ref = req('GET', '/repos/%s/git/ref/heads/main' % REPO)
commit_sha = ref['object']['sha']
tree_sha = req('GET', '/repos/%s/git/commits/%s' % (REPO, commit_sha))['tree']['sha']
tree = req('GET', '/repos/%s/git/trees/%s?recursive=1' % (REPO, tree_sha))
remote = {f['path']: f['sha'] for f in tree['tree'] if f['type'] == 'blob'}
local_files = subprocess.check_output(
    ['git', '-c', 'core.quotepath=false', 'ls-files'], cwd=ROOT).decode().splitlines()

diff = [p for p in local_files if p and remote.get(p) != local_sha(p)]
extra = [p for p in remote if p not in local_files]
print('commit', commit_sha)
print('本地文件', len(local_files), '远端 blob', len(remote))
print('内容不一致:', diff if diff else '无')
print('远端多余:', extra if extra else '无')
if diff or extra:
    raise SystemExit('远端与本地不一致，停止打 tag')

# 2) annotated tag
tag_obj = req('POST', '/repos/%s/git/tags' % REPO, {
    'tag': 'v2.1.0', 'message': 'v2.1.0', 'object': commit_sha, 'type': 'commit'})
try:
    req('POST', '/repos/%s/git/refs' % REPO,
        {'ref': 'refs/tags/v2.1.0', 'sha': tag_obj['sha']})
    print('tag created', tag_obj['sha'])
except SystemExit as e:
    print('tag exists?', e)

BODY = """本次更新把「看片时最麻烦的三件事」一次解决：找片、看字幕、等缓冲。

### 数据源 7 → 13
新增无尽资源、电影天堂、百度云盘、魔都资源、最大资源、360 资源，全部支持服务端搜索。搜索与首页推荐仍然是多源并行、合并去重。

### 字幕：一键导入 + 全参数可调
播放器新增字幕按钮，支持 `.srt` / `.vtt` / `.ass` / `.ssa`，也可以把文件直接拖进播放器。编码自动识别（UTF-8 / UTF-16 / GBK），按作品记住，下次打开自动挂载。

设置 → 字幕样式：字体（宋体 / MiSans / 思源）、字号、白字黑边 / 黑字白边、描边粗细、背景透明度、距画面底部距离，全部可调，带实时预览。

### 实时字幕（Beta）：本机识别，音频不出浏览器
用 Web Audio 采集播放中的音轨，交给浏览器内的 Whisper 模型转写，边说边出字。三档模型：

| 档位 | 体积 | 适合 |
| --- | --- | --- |
| 轻量 | 约 42 MB | 手机、老电脑 |
| 均衡 | 约 76 MB | 多数设备 |
| 高精度 | 约 240 MB | 桌面端 |

应用会按 CPU 核心数、内存、WebGPU 支持与是否移动端打分，并标注推荐档位；下载显示百分比、速度与体积，缓存随时可删。「提前识别秒数」1–10 秒可调：窗口越长断句越完整，越短出字越快。

推理库来自 jsDelivr，模型权重来自魔搭社区（ModelScope），不使用 HuggingFace。需要 HTTPS 或 localhost。

### 首页预加载
空闲时预取首页推荐每部第一集的前几秒，打开即播更少等待。默认开启，可在设置里关闭，或把条数调为 1–10。

### Mini 版
新增字幕导入：播放器字幕按钮选文件，或直接拖入；样式固定为白字黑边保证可读，并记住最近一次。

### 体验细节
- 设置页新增「字幕样式」「实时字幕 Beta」「首页预加载」三个分区
- 滑块统一 Material 3 外观：10px 圆角轨道、已选进度高亮、28px 圆形滑块

> CDN 组件库与 SDK 本轮未同步这些功能，产物保持 `@v2.0.1` 不变。
"""

rel = req('POST', '/repos/%s/releases' % REPO, {
    'tag_name': 'v2.1.0', 'name': 'v2.1.0 · 字幕与实时识别',
    'body': BODY, 'draft': False, 'prerelease': False})
print('release', rel['html_url'])
