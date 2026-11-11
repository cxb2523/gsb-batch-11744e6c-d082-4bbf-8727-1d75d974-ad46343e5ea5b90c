import { DurableObject } from 'cloudflare:workers';
import {
  JACKET_VARIANTS, ROOM_CAPACITY, ROOM_FULL, MAX_ROOMS, THREAD_LIST_POINTS, encodePoints, parseClientMessage, thinPoints, validateThread,
  type PeerState, type ServerMessage, type ThreadsResponse, type Vec3,
} from '../src/net/protocol';

/** Static assets plus two small APIs, both backed by the Planet Durable Object:
 *  GET  /api/live?room=N   WebSocket: presence and preset greetings (one room per DO)
 *  GET  /api/threads       everyone's stored walks (edge-cached for a minute)
 *  POST /api/threads       store one finished walk */

interface Env { ASSETS: Fetcher; PLANET: DurableObjectNamespace<Planet> }

// ≈ 600 × 200 points: a few hundred KB, light enough for phones to draw.
const THREADS_SHOWN = 600;
const THREADS_KEPT = 5000;
const UPLOADS_PER_DAY = 6;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/live') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      const room = Math.max(0, Math.min(MAX_ROOMS - 1, Number(url.searchParams.get('room')) || 0));
      return env.PLANET.get(env.PLANET.idFromName(`room-${room}`)).fetch(request);
    }
    if (url.pathname === '/api/threads') {
      const store = env.PLANET.get(env.PLANET.idFromName('threads'));
      if (request.method === 'POST') {
        if (Number(request.headers.get('Content-Length') ?? 0) > 64_000) return new Response('too large', { status: 413 });
        return store.fetch(request);
      }
      if (request.method !== 'GET') return new Response('method not allowed', { status: 405 });
      const cache = caches.default;
      const key = new Request(`${url.origin}/api/threads`);
      const hit = await cache.match(key);
      if (hit) return hit;
      const response = await store.fetch(request);
      if (response.ok) ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    }
    if (url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

interface Attachment { id: string; v: number; p: Vec3 | null; f: Vec3; m: number; lastPos: number; lastGreet: number }

export class Planet extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS threads (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, c INTEGER, p BLOB)`);
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS uploads (who TEXT, day INTEGER, n INTEGER, PRIMARY KEY (who, day))`);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/threads') return request.method === 'POST' ? this.store(request) : this.list();
    return this.join();
  }

  // ---------------------------------------------------------------- presence

  private join(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= ROOM_CAPACITY) {
      server.accept();
      server.close(ROOM_FULL, 'room full');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    const id = crypto.randomUUID().slice(0, 8);
    const v = Math.floor(Math.random() * JACKET_VARIANTS);
    server.serializeAttachment({ id, v, p: null, f: [0, 0, 1], m: 0, lastPos: 0, lastGreet: 0 } satisfies Attachment);
    const peers: PeerState[] = [];
    for (const socket of sockets) {
      const peer = socket.deserializeAttachment() as Attachment | null;
      if (peer?.p) peers.push([peer.id, peer.v, peer.p, peer.f, peer.m]);
    }
    this.send(server, { t: 'w', id, v, peers });
    this.broadcast({ t: 'j', id, v }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    const message = parseClientMessage(raw);
    const self = socket.deserializeAttachment() as Attachment | null;
    if (!message || !self) return;
    const now = Date.now();
    if (message.t === 'p') {
      if (now - self.lastPos < 150) return;
      self.p = message.p.map(n => Math.round(n * 1000) / 1000) as Vec3;
      self.f = message.f.map(n => Math.round(n * 1000) / 1000) as Vec3;
      self.m = Math.round(message.m * 100) / 100;
      self.lastPos = now;
      socket.serializeAttachment(self);
      this.broadcast({ t: 'p', id: self.id, p: self.p, f: self.f, m: self.m }, socket);
    } else {
      if (now - self.lastGreet < 1500 || !self.p) return;
      self.lastGreet = now;
      socket.serializeAttachment(self);
      this.broadcast({ t: 'g', id: self.id, g: message.g }, socket);
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> { this.leave(socket); }
  async webSocketError(socket: WebSocket): Promise<void> { this.leave(socket); }

  private leave(socket: WebSocket): void {
    const self = socket.deserializeAttachment() as Attachment | null;
    try { socket.close(1000, 'bye'); } catch { /* already closed */ }
    if (self) this.broadcast({ t: 'l', id: self.id }, socket);
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    try { socket.send(JSON.stringify(message)); } catch { /* closing */ }
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const text = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(text); } catch { /* closing */ }
    }
  }

  // ---------------------------------------------------------------- threads

  private list(): Response {
    const total = Number(this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM threads`).one().n);
    const rows = this.ctx.storage.sql.exec(`SELECT c, p FROM threads ORDER BY id DESC LIMIT ?`, THREADS_SHOWN).toArray();
    const body: ThreadsResponse = {
      total,
      threads: rows.map(row => ({ c: Number(row.c), p: encodePoints(thinPoints(new Int16Array(row.p as ArrayBuffer), THREAD_LIST_POINTS)) })),
    };
    // Public, read-only data: any origin may read it (dev servers, embeds).
    return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=60', 'Access-Control-Allow-Origin': '*' } });
  }

  private async store(request: Request): Promise<Response> {
    let value: unknown;
    try { value = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
    const thread = validateThread(value);
    if (!thread) return new Response('invalid thread', { status: 422 });
    // A salted hash of the address, kept only as a per-day upload counter.
    const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`yarn-planet:${address}`));
    const who = [...new Uint8Array(digest).slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
    const day = Math.floor(Date.now() / 86_400_000);
    const used = this.ctx.storage.sql.exec(`SELECT n FROM uploads WHERE who = ? AND day = ?`, who, day).toArray()[0];
    if (used && Number(used.n) >= UPLOADS_PER_DAY) return new Response('daily limit', { status: 429 });
    this.ctx.storage.sql.exec(`INSERT INTO uploads (who, day, n) VALUES (?, ?, 1) ON CONFLICT(who, day) DO UPDATE SET n = n + 1`, who, day);
    this.ctx.storage.sql.exec(`DELETE FROM uploads WHERE day < ?`, day - 1);
    this.ctx.storage.sql.exec(`INSERT INTO threads (at, c, p) VALUES (?, ?, ?)`, Date.now(), thread.c, thread.points.buffer);
    this.ctx.storage.sql.exec(`DELETE FROM threads WHERE id <= (SELECT MAX(id) FROM threads) - ?`, THREADS_KEPT);
    const total = Number(this.ctx.storage.sql.exec(`SELECT COUNT(*) AS n FROM threads`).one().n);
    return Response.json({ ok: true, total });
  }
}
