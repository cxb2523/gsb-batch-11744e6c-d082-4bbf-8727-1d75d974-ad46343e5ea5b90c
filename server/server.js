'use strict';
// ======================================================================
//  server.js —— 局域网联机服务器（零依赖，Node 18+）
//    1. 托管游戏静态页面（仓库根目录）
//    2. /ws 上的 WebSocket 中转：房主的浏览器跑权威对局，其他人的消息都转给房主
//  用法：node server/server.js [端口]      默认 8080，也可用环境变量 PORT
// ======================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) || process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.md': 'text/plain; charset=utf-8',
};

// ---------------- 静态文件 ----------------
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  // 大厅用来显示“舍友该打开的地址”
  if (p === '/api/lan') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end(JSON.stringify({ port: PORT, ips: lanIPs() })); }
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || p.includes('/.') || p.startsWith('/server/')) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------------- 最小 WebSocket 实现（RFC 6455，仅文本帧） ----------------
class Sock {
  constructor(socket) {
    this.s = socket; this.buf = Buffer.alloc(0); this.frag = []; this.open = true;
    this.onmessage = null; this.onclose = null;
    socket.setNoDelay(true);
    socket.on('data', (d) => this.data(d));
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }
  data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 16 * 1024 * 1024) return this.close();
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) return;
      let payload = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const m = b.subarray(off, off + 4), out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3];
        payload = out;
      }
      this.buf = b.subarray(need);
      if (op === 8) return this.close();
      if (op === 9) { this.frame(10, payload); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) {
        this.frag.push(payload);
        if (fin) { const msg = Buffer.concat(this.frag).toString('utf8'); this.frag = []; if (this.onmessage) this.onmessage(msg); }
      }
    }
  }
  frame(op, data) {
    if (!this.open) return;
    const len = data.length;
    let head;
    if (len < 126) { head = Buffer.from([0x80 | op, len]); }
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.s.write(Buffer.concat([head, data]));
  }
  send(str) { this.frame(1, Buffer.from(str, 'utf8')); }
  close() { if (this.open) { try { this.frame(8, Buffer.alloc(0)); } catch (e) { /* ignore */ } this.s.end(); } this.closed(); }
  closed() { if (!this.open) return; this.open = false; this.s.destroy(); if (this.onclose) this.onclose(); }
}

// ---------------- 房间：一个服务器一个房间 ----------------
//  线上格式：  `${对端id}|${json}`   id 0 = 服务器自己
//  房主发出：  `${目标id 或 *}|${json}`   其他人发出：直接 json（一律转给房主）
let host = null, seq = 0;
const peers = new Map();   // id → { id, name, sock, role }

function sys(sock, obj) { sock.send('0|' + JSON.stringify(obj)); }
function hello(sock, msg) {
  let m; try { m = JSON.parse(msg); } catch (e) { return null; }
  if (!m || m.t !== 'hello') return null;
  const name = String(m.name || '玩家').slice(0, 16);
  if (m.role === 'host') {
    if (host && host.sock.open) { sys(sock, { t: 'error', msg: '房间里已经有房主了，请选择「加入房间」' }); return null; }
    const p = { id: ++seq, name, sock, role: 'host' };
    host = p; peers.set(p.id, p);
    sys(sock, { t: 'welcome', id: p.id, role: 'host' });
    for (const g of peers.values()) if (g !== p) sys(sock, { t: 'join', id: g.id, name: g.name });
    for (const g of peers.values()) if (g !== p) sys(g.sock, { t: 'hostup', name });
    log(`房主「${name}」创建了房间`);
    return p;
  }
  const p = { id: ++seq, name, sock, role: 'guest' };
  peers.set(p.id, p);
  sys(sock, { t: 'welcome', id: p.id, role: 'guest', host: host ? host.name : null });
  if (host) sys(host.sock, { t: 'join', id: p.id, name });
  log(`「${name}」加入${host ? '' : '（等待房主）'}`);
  return p;
}

const wss = { upgrade(req, socket) {
  if (new URL(req.url, 'http://x').pathname !== '/ws' || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const sock = new Sock(socket);
  let me = null;
  sock.onmessage = (msg) => {
    if (!me) { me = hello(sock, msg); if (!me) sock.close(); return; }
    if (me === host) {
      const i = msg.indexOf('|'); if (i < 0) return;
      const to = msg.slice(0, i), body = me.id + msg.slice(i);
      if (to === '*') { for (const p of peers.values()) if (p !== me) p.sock.send(body); }
      else { const p = peers.get(Number(to)); if (p) p.sock.send(body); }
    } else if (host && host.sock.open) host.sock.send(me.id + '|' + msg);
  };
  sock.onclose = () => {
    if (!me) return;
    peers.delete(me.id);
    if (me === host) {
      host = null;
      for (const p of peers.values()) sys(p.sock, { t: 'hostleft' });
      log(`房主「${me.name}」离开了`);
    } else {
      if (host) sys(host.sock, { t: 'leave', id: me.id });
      log(`「${me.name}」离开了`);
    }
  };
} };
server.on('upgrade', (req, socket) => wss.upgrade(req, socket));

// 保活：WiFi 下长时间静默的连接可能被路由器回收
setInterval(() => { for (const p of peers.values()) p.sock.frame(9, Buffer.alloc(0)); }, 20000);

function log(s) { console.log(`[${new Date().toLocaleTimeString()}] ${s}`); }
// 局域网 IPv4，排除代理软件的虚拟网卡（TUN 常用 198.18.0.0/15）
function lanIPs() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) {
    if (n.family !== 'IPv4' || n.internal || /^(198\.1[89]\.|169\.254\.)/.test(n.address)) continue;
    ips.push(n.address);
  }
  return ips;
}

// Windows：第一次运行时在防火墙放行端口（会弹管理员确认），否则舍友连不进来
function ensureFirewall() {
  if (process.platform !== 'win32' || !process.argv.includes('--firewall')) return;
  const { execFileSync, spawnSync } = require('child_process');
  const name = 'SandstormLAN-' + PORT;
  const has = () => { try { execFileSync('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=' + name], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
  if (has()) return;
  console.log(`\n  第一次运行：需要在防火墙放行 TCP ${PORT} 端口，舍友才能连进来。\n  马上会弹出管理员确认，请点「是」。`);
  spawnSync('powershell', ['-NoProfile', '-Command',
    `Start-Process netsh -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList 'advfirewall firewall add rule name=${name} dir=in action=allow protocol=TCP localport=${PORT} profile=any'`], { stdio: 'ignore' });
  console.log(has() ? '  防火墙已放行。' : '  没有放行成功：舍友可能连不进来（关掉窗口再运行一次即可重试）。');
}
ensureFirewall();

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n端口 ${PORT} 被占用了。换一个端口：node server/server.js 8090\n`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  沙暴行动 · 联机服务器已启动\n');
  console.log(`  本机打开：  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  舍友打开：  http://${ip}:${PORT}`);
  if (!ips.length) console.log('  （没找到局域网地址：确认已经连上 WiFi）');
  console.log('\n  · 你们俩要连同一个 WiFi / 局域网');
  console.log('  · Windows 弹出防火墙提示时，勾选「专用网络」并允许访问');
  console.log('  · 关掉这个窗口就停止服务器\n');
});
