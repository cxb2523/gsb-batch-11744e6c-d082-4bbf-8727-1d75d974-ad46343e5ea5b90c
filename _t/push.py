#!/usr/bin/env python3
"""用 Git Data API 推送当前 HEAD（github.com 的 git 端点在本环境不通）。"""
import base64, json, os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

REPO = 'silverbullet-liang/tvbox-web'
API = 'https://api.github.com'
TOK = os.environ['GITHUB_TOKEN']
BR = 'main'


def req(method, path, body=None, raw=False):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header('Authorization', 'Bearer ' + TOK)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('User-Agent', 'tvbox-push')
    if data:
        r.add_header('Content-Type', 'application/json')
    for i in range(4):
        try:
            with urllib.request.urlopen(r, timeout=180) as resp:
                return resp.read() if raw else json.loads(resp.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')
            if e.code < 500 and e.code != 429:
                raise SystemExit('HTTP %s %s %s: %s' % (e.code, method, path, msg[:400]))
            if i == 3:
                raise
        except Exception:
            if i == 3:
                raise
    raise RuntimeError('unreachable')


def files():
    out = subprocess.check_output(['git', '-c', 'core.quotepath=false', 'ls-files'], cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return [l for l in out.decode().splitlines() if l]


def blob(path):
    data = open(path, 'rb').read()
    r = req('POST', '/repos/%s/git/blobs' % REPO,
            {'content': base64.b64encode(data).decode(), 'encoding': 'base64'})
    return path, r['sha']


root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
paths = files()
print('文件数', len(paths))

with ThreadPoolExecutor(8) as ex:
    shas = dict(ex.map(blob, paths))
print('blob 上传完成')

tree = [{'path': p, 'mode': '100644', 'type': 'blob', 'sha': shas[p]} for p in paths]
t = req('POST', '/repos/%s/git/trees' % REPO, {'tree': tree})
msg = subprocess.check_output(['git', 'log', '-1', '--pretty=%B'], cwd=root).decode().strip()
parent = req('GET', '/repos/%s/git/ref/heads/%s' % (REPO, BR))['object']['sha']
print('parent', parent)
c = req('POST', '/repos/%s/git/commits' % REPO, {'message': msg, 'tree': t['sha'], 'parents': [parent]})
req('PATCH', '/repos/%s/git/refs/heads/%s' % (REPO, BR), {'sha': c['sha'], 'force': True})
print('pushed', c['sha'])
