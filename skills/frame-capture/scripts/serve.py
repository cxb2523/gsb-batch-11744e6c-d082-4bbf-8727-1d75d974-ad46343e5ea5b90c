#!/usr/bin/env python3
"""Static file server with HTTP Range support, for previewing and recording pages.

    python3 serve.py [DIR] [--port 8000]

`python3 -m http.server` ignores Range headers. Browsers then cannot seek a <video> it
serves (video.seekable is empty), so scroll-scrubbed video freezes and recorded videos hold
their first frame. This server answers byte ranges, never caches (edits show on reload) and
sends the right type for .mjs, .wasm, .glb, .webp, .avif and .webm.
"""
import argparse
import http.server
import os
import re
from functools import partial

EXTRA_TYPES = {".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm",
               ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".webp": "image/webp",
               ".avif": "image/avif", ".webm": "video/webm", ".mp4": "video/mp4", ".json": "application/json"}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng.strip())
        size = os.path.getsize(path)
        if not m or (not m[1] and not m[2]):
            return super().send_head()
        if m[1]:
            start, end = int(m[1]), int(m[2]) if m[2] else size - 1
        else:
            start, end = max(0, size - int(m[2])), size - 1
        if start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        end = min(end, size - 1)
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        left = getattr(self, "_remaining", None)
        if left is None:
            return super().copyfile(source, outputfile)
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)
        self._remaining = None

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("dir", nargs="?", default=".")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=args.dir))
    print(f"serving {os.path.abspath(args.dir)} at http://{args.host}:{args.port}/", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
