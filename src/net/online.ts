import {
  MAX_ROOMS, ROOM_FULL, SEND_IDLE, SEND_MOVING, decodePoints,
  type ClientMessage, type PeerState, type ServerMessage, type ThreadsResponse, type Vec3,
} from './protocol';

/** Where the API lives: same origin in production builds; in dev only when
 * `?online=<origin>` points at a `wrangler dev` server. */
export function apiOrigin(): string | null {
  const param = new URLSearchParams(location.search).get('online');
  if (param) { try { return new URL(param).origin; } catch { return null; } }
  return import.meta.env.DEV ? null : location.origin;
}

export interface OnlineEvents {
  welcome(id: string, variant: number, peers: PeerState[]): void;
  join(id: string, variant: number): void;
  move(id: string, p: Vec3, f: Vec3, m: number): void;
  greet(id: string, greeting: number): void;
  leave(id: string): void;
  /** The connection dropped: forget everyone (welcome will resend them). */
  reset(): void;
}

/** One presence WebSocket. Joins room 0, moving on when a room is full;
 * reconnects with backoff. Silent no-op when no API origin is available. */
export class Online {
  private socket: WebSocket | null = null;
  private room = 0;
  private retry = 1;
  private lastSent = -Infinity;
  private last: { p: Vec3; m: number } | null = null;
  private stopped = false;
  connected = false;

  constructor(private readonly origin: string, private readonly events: OnlineEvents) {}

  start(): void { this.stopped = false; this.open(); }

  stop(): void { this.stopped = true; this.socket?.close(1000); this.socket = null; }

  private open(): void {
    if (this.stopped) return;
    const url = new URL('/api/live', this.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room', String(this.room));
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onmessage = event => {
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      switch (message.t) {
        case 'w': this.connected = true; this.retry = 1; this.lastSent = -Infinity; this.events.welcome(message.id, message.v, message.peers); break;
        case 'j': this.events.join(message.id, message.v); break;
        case 'p': this.events.move(message.id, message.p, message.f, message.m); break;
        case 'g': this.events.greet(message.id, message.g); break;
        case 'l': this.events.leave(message.id); break;
      }
    };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.connected = false;
      this.socket = null;
      this.events.reset();
      if (this.stopped) return;
      if (event.code === ROOM_FULL) { this.room = (this.room + 1) % MAX_ROOMS; setTimeout(() => this.open(), 200); return; }
      setTimeout(() => this.open(), Math.min(30, this.retry) * 1000);
      this.retry *= 2;
    };
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  /** Called every frame; sends at most every SEND_MOVING s while moving, SEND_IDLE s at rest. */
  pose(time: number, p: Vec3, f: Vec3, moving: number): void {
    if (!this.connected) return;
    const interval = moving > 0.05 ? SEND_MOVING : SEND_IDLE;
    const settled = this.last && moving <= 0.05 && this.last.m > 0.05;
    if (time - this.lastSent < interval && !settled) return;
    if (time - this.lastSent < 0.18) return;
    this.lastSent = time;
    this.last = { p, m: moving };
    const round = (v: Vec3) => v.map(n => Math.round(n * 1000) / 1000) as Vec3;
    this.send({ t: 'p', p: round(p), f: round(f), m: Math.round(moving * 100) / 100 });
  }

  greet(greeting: number): void { this.send({ t: 'g', g: greeting }); }
}

/** Everyone's stored walks, decoded to float xyz. */
export async function fetchThreads(origin: string): Promise<{ total: number; threads: { c: number; p: Float32Array }[] } | null> {
  try {
    const response = await fetch(new URL('/api/threads', origin));
    if (!response.ok) return null;
    const body = await response.json() as ThreadsResponse;
    return { total: body.total, threads: body.threads.map(thread => ({ c: thread.c, p: decodePoints(thread.p) })) };
  } catch { return null; }
}
