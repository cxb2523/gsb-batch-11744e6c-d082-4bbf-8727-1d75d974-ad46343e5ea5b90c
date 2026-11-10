#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.1.1：校验远端树、建 annotated tag、发 Release。"""
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
    return subprocess.check_output(['git', 'hash-object', path], cwd=ROOT).decode().strip()


ref = req('GET', '/repos/%s/git/ref/heads/main' % REPO)
commit_sha = ref['object']['sha']
tree_sha = req('GET', '/repos/%s/git/commits/%s' % (REPO, commit_sha))['tree']['sha']
tree = req('GET', '/repos/%s/git/trees/%s?recursive=1' % (REPO, tree_sha))
remote = {f['path']: f['sha'] for f in tree['tree'] if f['type'] == 'blob'}
local_files = [p for p in subprocess.check_output(
    ['git', '-c', 'core.quotepath=false', 'ls-files'], cwd=ROOT).decode().splitlines() if p]

diff = [p for p in local_files if remote.get(p) != local_sha(p)]
extra = [p for p in remote if p not in local_files]
print('commit', commit_sha, '| local', len(local_files), '| remote', len(remote))
print('不一致:', diff if diff else '无', '| 远端多余:', extra if extra else '无')
if diff or extra:
    raise SystemExit('远端与本地不一致，停止打 tag')

try:
    tag_obj = req('POST', '/repos/%s/git/tags' % REPO, {
        'tag': 'v2.1.1', 'message': 'v2.1.1', 'object': commit_sha, 'type': 'commit'})
    req('POST', '/repos/%s/git/refs' % REPO, {'ref': 'refs/tags/v2.1.1', 'sha': tag_obj['sha']})
    print('tag', tag_obj['sha'])
except SystemExit as e:
    print('tag:', e)

BODY = """把名字改对。

### 更名

| 项目 | 新 | 旧 |
| --- | --- | --- |
| 产品名 | TVBox Web | TVBox 影视资源中心 |
| 仓库 | `silverbullet-liang/tvbox-web` | `tvbox-center`（旧地址自动跳转） |
| 轻量版 | `lite.html` | `mini.html`（旧地址保留跳转页） |
| 组件库 | `dist/tvbox-web.js` | `dist/tvbox-center.js`（同名副本保留） |
| SDK | `dist/tvbox-web-sdk.js` | `dist/tvbox-sdk.js`（同名副本保留） |

### 不变的部分

- 调用方式不变：`TVBox.mount(...)`、`TVBoxCenter.hls` / `TVBoxCenter.mqtt`、`TVBoxSDK` 全部照旧。
- 本地数据不变：`localStorage` 的 `tvbox_*` 键没有改动，历史、收藏、设置、播放位置都还在。
- 备份与分享：新导出的备份与分享链接使用 `tvbox-web` 标识，旧的 `.tvcbak` 与旧分享链接仍能读取。

> 本轮不含功能变更，CDN 组件库内容仍与 2.0.1 一致（字幕与实时识别只在 Pro 版提供）。
"""

try:
    rel = req('POST', '/repos/%s/releases' % REPO, {
        'tag_name': 'v2.1.1', 'name': 'v2.1.1 · 更名 TVBox Web', 'body': BODY,
        'draft': False, 'prerelease': False})
    print('release', rel['html_url'])
except SystemExit as e:
    print('release:', e)
