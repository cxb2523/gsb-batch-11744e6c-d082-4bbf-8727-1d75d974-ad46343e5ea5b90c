#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 src/ 下的模块拼成单文件组件库（不做提取、不做作用域改写）。"""
import io, json, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'src')
OUT = os.path.join(BASE, 'dist', 'tvbox-web.js')

ORDER = ['core.js', 'ui.js', 'pages.js', 'player.js', 'watch.js', 'backup.js', 'app.js']

css = io.open(os.path.join(SRC, 'style.css'), encoding='utf-8').read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = re.sub(r'\s+', ' ', css).strip()

parts = []
for name in ORDER:
    parts.append(io.open(os.path.join(SRC, name), encoding='utf-8').read())
body = '\n\n'.join(parts)

VER = re.search(r"var VERSION = '([^']+)'", body).group(1)

HEAD = """/*!
 * TVBox Web · 组件库
 * 手写实现：多源搜索、首页推荐、HLS 播放、选集与线路、历史收藏、跨域代理、跳过广告。
 *
 * 仓库：https://github.com/silverbullet-liang/tvbox-web
 * 版权：Copyright (C) 2026 silverbullet-liang
 * 许可：AGPL-3.0-or-later（SPDX）
 *
 * 用法：
 *   <div id="tvbox-app" style="height:100vh"></div>
 *   <script src="https://cdn.jsdelivr.net/gh/silverbullet-liang/tvbox-web@v%s/dist/tvbox-web.min.js"></script>
 *   <script>TVBox.mount('#tvbox-app');</script>
 */
(function (G) {
'use strict';

var CSS = %s;

""" % (VER, json.dumps(css, ensure_ascii=False))

VENDOR = ''
mqtt_path = os.path.join(BASE, 'vendor', 'mqtt.min.js')
hls_path = os.path.join(BASE, 'vendor', 'hls.min.js')
if os.path.exists(mqtt_path) and os.path.exists(hls_path):
    mqtt_src = io.open(mqtt_path, encoding='utf-8').read()
    hls_src = io.open(hls_path, encoding='utf-8').read()
    hls_src = hls_src.replace('//# sourceMappingURL=hls.min.js.map', '')
    VENDOR = (
        '/*! vendor: mqtt.js 5.15.1 (MIT) / hls.js 1.7.3 (Apache-2.0)，已内嵌 */\n'
        '(function(){ var R = (typeof self !== \'undefined\' ? self : window); R.TVBoxCenter = R.TVBoxCenter || {};\n'
        '(function(){ var mq = (function(){ ' + mqtt_src + '\n;return mqtt; })(); R.TVBoxCenter.mqtt = mq; })();\n'
        '(function(){ var module = { exports: {} }, exports = module.exports;\n' + hls_src +
        '\nvar h = module.exports; R.TVBoxCenter.hls = (h && h.isSupported) ? h : (h && h.default ? h.default : h); if (!R.Hls) R.Hls = R.TVBoxCenter.hls; })();\n'
        '})();\n\n'
    )

TAIL = """

G.TVBox = { version: VERSION, mount: mount, unmount: unmount };
})(typeof self !== 'undefined' ? self : window);
"""

out = HEAD + VENDOR + body + TAIL
io.open(OUT, 'w', encoding='utf-8').write(out)

sdk_src = io.open(os.path.join(SRC, 'sdk.js'), encoding='utf-8').read()
sdk_out = os.path.join(BASE, 'dist', 'tvbox-web-sdk.js')
io.open(sdk_out, 'w', encoding='utf-8').write(sdk_src)
print('written:', sdk_out, len(sdk_src.encode('utf-8')), 'bytes')
import shutil
shutil.copyfile(OUT, os.path.join(BASE, 'dist', 'tvbox-center.js'))
shutil.copyfile(sdk_out, os.path.join(BASE, 'dist', 'tvbox-sdk.js'))
print('written:', OUT)
print('bytes:', len(out.encode('utf-8')))
