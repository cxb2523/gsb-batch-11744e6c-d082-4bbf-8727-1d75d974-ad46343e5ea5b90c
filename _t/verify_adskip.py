# 自动跳过广告 —— 在真实 Chrome（Chrome for Testing）中验证 index.html 的各判定分支。
# 本地起 HTTP 服务加载仓库根目录的 index.html，通过 CDP 注入 _t/adskip_test.js，
# 测试帧与音频频谱全部在页面内构造，不访问外网功能接口。
import json, os, subprocess, sys, time, urllib.request, threading, functools, http.server

sys.dont_write_bytecode = True
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
import websocket  # websocket-client

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = r"D:\workspace\firstpi\644\A\attempt-2\temp\chrome-test\chrome-win64\chrome.exe"
PORT_HTTP = 8123
PORT_CDP = 9377
URL = "http://127.0.0.1:%d/index.html" % PORT_HTTP


def static_checks():
    src = open(os.path.join(REPO, "index.html"), encoding="utf-8").read()
    a = src.index("自动跳过广告：三色按钮")
    b = src.index("function handleEpisodeEnd")
    sec = src[a:b]
    fails = []
    for bad in ("fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "console."):
        if bad in sec:
            fails.append("ad section contains %r" % bad)
    if "adSkipReset();savePosition();playerEp=idx" not in src:
        fails.append("playEp does not reset ad-skip state on episode switch")
    if 'getElementById("swAdSkip")' not in src or "adSkipStop()" not in src:
        fails.append("settings toggle not wired to adSkipStop")
    return fails


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


class QuietServer(http.server.ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass  # Chrome 关闭 keep-alive 连接产生的 ConnectionResetError 属正常


def main():
    fails = static_checks()
    for f in fails:
        print("STATIC FAIL:", f)

    httpd = QuietServer(
        ("127.0.0.1", PORT_HTTP), functools.partial(Quiet, directory=REPO))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    profile = os.path.join(os.environ["TEMP"], "adskip-chrome-profile")
    proc = subprocess.Popen([
        CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--mute-audio",
        "--autoplay-policy=no-user-gesture-required",
        "--remote-debugging-port=%d" % PORT_CDP,
        "--user-data-dir=" + profile,
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        ws_url = None
        for _ in range(60):
            try:
                tabs = json.load(urllib.request.urlopen(
                    "http://127.0.0.1:%d/json" % PORT_CDP, timeout=2))
                pages = [t for t in tabs if t.get("type") == "page"]
                if pages:
                    ws_url = pages[0]["webSocketDebuggerUrl"]
                    break
            except Exception:
                pass
            time.sleep(0.3)
        if not ws_url:
            print("FATAL: cannot reach CDP")
            return 2

        ws = websocket.create_connection(ws_url, timeout=180)
        mid = [0]

        def send(method, params=None):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get("id") == mid[0]:
                    return msg.get("result", {})

        def evaljs(expr, await_promise=False):
            r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                          "awaitPromise": await_promise})
            if "exceptionDetails" in r:
                return ("__ERR__", json.dumps(r["exceptionDetails"])[:800])
            return r.get("result", {}).get("value")

        send("Page.enable")
        send("Runtime.enable")
        send("Page.navigate", {"url": URL})
        ok = False
        for _ in range(60):
            v = evaljs("document.readyState==='complete'&&typeof adSkipStart==='function'")
            if v is True:
                ok = True
                break
            time.sleep(0.5)
        if not ok:
            print("FATAL: page did not finish loading")
            return 2
        time.sleep(1.5)

        test_js = open(os.path.join(REPO, "_t", "adskip_test.js"), encoding="utf-8").read()
        print("running in-page tests (real time, ~35s) ...")
        t0 = time.time()
        res = evaljs(test_js, await_promise=True)
        print("elapsed %.1fs" % (time.time() - t0))
        if isinstance(res, tuple) and res[0] == "__ERR__":
            print("FATAL: test script raised:", res[1])
            return 2
        if not isinstance(res, dict):
            print("FATAL: unexpected result:", repr(res)[:500])
            return 2
        for t in res["tests"]:
            mark = "PASS" if t["ok"] else "FAIL"
            line = "[%s] %s" % (mark, t["name"])
            if t.get("detail"):
                line += "  -- " + t["detail"]
            print(line)
        print("=" * 60)
        print("TOTAL %d  PASS %d  FAIL %d" % (res["total"], res["total"] - res["fails"], res["fails"]))
        return 1 if (res["fails"] or fails) else 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
