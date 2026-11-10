#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把仓库 tvbox-center 改名为 tvbox-web，并同步本地 remote。"""
import json, os, subprocess, urllib.request, urllib.error

API = 'https://api.github.com'
TOK = os.environ['GITHUB_TOKEN']
OLD = 'silverbullet-liang/tvbox-center'
NEW = 'tvbox-web'


def req(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header('Authorization', 'Bearer ' + TOK)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('User-Agent', 'tvbox-rename')
    if data:
        r.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read())


info = req('GET', '/repos/' + OLD)
if info['name'] == NEW:
    print('already renamed:', info['full_name'])
else:
    out = req('PATCH', '/repos/' + OLD, {'name': NEW})
    print('renamed ->', out['full_name'])
    print('pages:', out.get('homepage') or '-')

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
subprocess.run(['git', 'remote', 'set-url', 'origin',
                'https://github.com/silverbullet-liang/%s.git' % NEW], cwd=root)
print('remote updated')
