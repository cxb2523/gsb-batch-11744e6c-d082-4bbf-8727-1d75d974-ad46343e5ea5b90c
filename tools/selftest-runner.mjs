// =============================================================================
// NOVA LANCER — headless self-test runner (zero third-party dependencies)
// -----------------------------------------------------------------------------
// Drives the local dev build (index.html) in a headless Chromium-family browser
// over the Chrome DevTools Protocol using only Node built-ins (WebSocket,
// fetch, child_process). No network access, no audio output and no real user
// gestures are required.
//
//   node tools/selftest-runner.mjs                # rebuilds dev bundle first
//   node tools/selftest-runner.mjs --no-build     # reuse the current index.html
//   BROWSER=/path/to/chrome node tools/selftest-runner.mjs
//
// Exit code 0 = every self-test assertion passed, 1 = failure/error.
// =============================================================================
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const doBuild = !args.includes('--no-build');
const timeoutMs = 60000;

// ------------------------------------------------------------ browser locate
function candidateBrowsers() {
  const out = [];
  if (process.env.BROWSER && fs.existsSync(process.env.BROWSER)) out.push(process.env.BROWSER);
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || path.join(pf86, '..', 'Local');
    out.push(
      path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    out.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    out.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try { out.push(execFileSync('which', [name], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch (e) { /* not found */ }
    }
  }
  return [...new Set(out.filter(p => p && fs.existsSync(p)))];
}

// ------------------------------------------------------------ tiny CDP client
class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', e => reject(new Error('WebSocket error: ' + (e.message || e.type))));
    });
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.eventListeners) fn(msg);
      }
    });
  }
  on(fn) { this.eventListeners.push(fn); }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const done = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return done;
  }
  close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Windows frequently keeps browser profile files locked (or read-only) for a
// beat after the process tree dies, so retry the removal instead of throwing.
function rmrf(target) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }); return; }
    catch (e) {
      if (Date.now() >= deadline) { console.warn('[selftest] could not remove temp dir ' + target + ': ' + e.message); return; }
      sleep(200);
    }
  }
}

async function getPageTarget(port) {
  const deadline = Date.now() + 15000;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      // Create a fresh page target and take its page-level WebSocket URL —
      // the /json/version endpoint is browser-level and has no Runtime domain.
      const put = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (put.ok) {
        const target = await put.json();
        if (target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
      }
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { lastErr = e; }
    await sleep(200);
  }
  throw new Error('could not obtain a page DevTools target: ' + (lastErr?.message || 'timeout'));
}

function killTree(proc) {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else { process.kill(proc.pid, 'SIGTERM'); }
  } catch (e) { try { proc.kill('SIGKILL'); } catch (e2) { /* ignore */ } }
}

async function main() {
  if (doBuild) {
    console.log('[selftest] building dev bundle …');
    execFileSync(process.execPath, [path.join(root, 'tools', 'build.mjs'), '--dev'], { cwd: root, stdio: 'inherit' });
  }
  const html = path.join(root, 'index.html');
  if (!fs.existsSync(html)) throw new Error('index.html not found — run the build first');

  const [browserExe] = candidateBrowsers();
  if (!browserExe) throw new Error('no Chromium-based browser found (set BROWSER=/path/to/chrome)');
  const port = 9200 + Math.floor(Math.random() * 700);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-lancer-selftest-'));

  const browser = spawn(browserExe, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--mute-audio',
    '--disable-background-networking',
    '--disable-sync',
    '--no-service-autorun',
    '--password-store=basic',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let browserStderr = '';
  browser.stderr.on('data', d => { browserStderr += d.toString(); });

  const consoleLines = [];
  let cdp;
  const gameUrl = pathToFileURL(html).href + '?manual&seed=1';
  const drive = (async () => {
    const wsUrl = await getPageTarget(port);
    cdp = new CDP(wsUrl);
    cdp.on(msg => {
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value ?? a.description ?? '').join(' ');
        consoleLines.push(`[console.${msg.params.type}] ${text}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        consoleLines.push('[page-exception] ' + (d.exception?.description || d.text));
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: gameUrl });

    // Wait for boot to expose the self-test hook.
    const readyDeadline = Date.now() + 30000;
    let booted = false;
    while (Date.now() < readyDeadline) {
      const r = await cdp.send('Runtime.evaluate', { expression: 'typeof window.__selftest === "function"', returnByValue: true });
      if (r.result.value === true) { booted = true; break; }
      await sleep(250);
    }
    if (!booted) throw new Error('game did not boot in headless mode (window.__selftest missing)\n' + browserStderr.split('\n').slice(-10).join('\n'));

    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'window.__selftest()',
      awaitPromise: true,
      returnByValue: true,
    });
    if (evalResult.exceptionDetails) {
      throw new Error('__selftest threw: ' + (evalResult.exceptionDetails.exception?.description || evalResult.exceptionDetails.text));
    }
    const report = evalResult.result.value;
    printReport(browserExe, report);
    if (consoleLines.length) {
      console.log('\n--- browser console (' + consoleLines.length + ' lines) ---');
      console.log(consoleLines.join('\n'));
    }
    return report.ok ? 0 : 1;
  })();
  const guard = new Promise((_, reject) => setTimeout(() => reject(new Error('self-test timed out after ' + timeoutMs + 'ms')), timeoutMs));
  try {
    return await Promise.race([drive, guard]);
  } finally {
    cdp?.close();
    killTree(browser);
    // Give the OS a moment to release profile file handles before cleanup.
    await sleep(300);
    rmrf(profileDir);
  }
}

function printReport(exe, report) {
  console.log('============================================================');
  console.log(' NOVA LANCER headless self-test');
  console.log(' browser : ' + exe);
  console.log(' seed    : ' + report.seed);
  console.log(' result  : ' + (report.ok ? 'PASS' : 'FAIL') +
    '  (' + report.passed + '/' + report.count + ' assertions passed, ' + report.failed + ' failed)');
  console.log('============================================================');
  let idx = 0;
  for (const r of report.results) {
    idx++;
    const tag = r.pass ? 'PASS' : 'FAIL';
    console.log(`${idx.toString().padStart(2, ' ')}. [${tag}] ${r.name}`);
    if (!r.pass) {
      console.log('        expected: ' + fmt(r.expected));
      console.log('        actual  : ' + fmt(r.actual));
    }
    if (r.details) {
      for (const [k, v] of Object.entries(r.details)) {
        if (v === null || v === undefined) continue;
        console.log('        · ' + k + ': ' + fmt(v));
      }
    }
  }
  console.log('============================================================');
}

const fmt = v => typeof v === 'string' ? v : JSON.stringify(v);

main().then(code => process.exit(code)).catch(err => {
  console.error('[selftest] fatal: ' + (err.stack || err.message || err));
  process.exit(1);
});
