/** Wire format shared by the game and the Worker (worker/index.ts). JSON over
 * one WebSocket per player; greetings travel as preset ids, never free text. */

export type Vec3 = [number, number, number];

/** Client → server. */
export type ClientMessage =
  | { t: 'p'; p: Vec3; f: Vec3; m: number }
  | { t: 'g'; g: number };

/** One other player as the server knows them: id, jacket variant, pose. */
export type PeerState = [id: string, variant: number, p: Vec3, f: Vec3, m: number];

/** Server → client. */
export type ServerMessage =
  | { t: 'w'; id: string; v: number; peers: PeerState[] }
  | { t: 'j'; id: string; v: number }
  | { t: 'p'; id: string; p: Vec3; f: Vec3; m: number }
  | { t: 'g'; id: string; g: number }
  | { t: 'l'; id: string };

export const GREETING_COUNT = 4;
export const JACKET_VARIANTS = 6;
/** Players per room; the client tries the next room when one is full. */
export const ROOM_CAPACITY = 24;
export const MAX_ROOMS = 12;
export const ROOM_FULL = 4001;
/** Seconds between position updates while moving / while idle. */
export const SEND_MOVING = 0.4;
export const SEND_IDLE = 4;

/** Stored walk: quantized surface points, xyz × QUANT as int16. */
export const QUANT = 1800;
export const THREAD_MIN_POINTS = 12;
export const THREAD_MAX_POINTS = 700;
/** Max distance between consecutive points (world units). */
export const THREAD_MAX_STEP = 2.5;
export const THREAD_COLORS_COUNT = 6;

export interface ThreadUpload { c: number; p: number[] }
export interface ThreadsResponse { total: number; threads: { c: number; p: string }[] }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const isVec3 = (v: unknown, min = 11, max = 21): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite)
  && Math.hypot(v[0], v[1], v[2]) >= min && Math.hypot(v[0], v[1], v[2]) <= max;
export const isDirection = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(finite)
  && Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 0.2;

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 300) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const message = value as Partial<{ t: string; p: unknown; f: unknown; m: unknown; g: unknown }>;
  if (message?.t === 'p' && isVec3(message.p) && isDirection(message.f) && finite(message.m) && message.m >= 0 && message.m <= 2) {
    return { t: 'p', p: message.p, f: message.f, m: message.m };
  }
  if (message?.t === 'g' && Number.isInteger(message.g) && (message.g as number) >= 0 && (message.g as number) < GREETING_COUNT) {
    return { t: 'g', g: message.g as number };
  }
  return null;
}

/** Validates an uploaded walk; returns the quantized Int16 points or null. */
export function validateThread(value: unknown): { c: number; points: Int16Array } | null {
  const upload = value as Partial<ThreadUpload>;
  if (!upload || !Number.isInteger(upload.c) || upload.c! < 0 || upload.c! >= THREAD_COLORS_COUNT || !Array.isArray(upload.p)) return null;
  const p = upload.p;
  if (p.length % 3 || p.length / 3 < THREAD_MIN_POINTS || p.length / 3 > THREAD_MAX_POINTS || !p.every(finite)) return null;
  const points = new Int16Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const r = Math.hypot(p[i], p[i + 1], p[i + 2]);
    if (r < 13.2 || r > 17.5) return null;
    if (i && Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2], p[i + 2] - p[i - 1]) > THREAD_MAX_STEP) return null;
    for (let k = 0; k < 3; k++) points[i + k] = Math.round(p[i + k] * QUANT);
  }
  return { c: upload.c!, points };
}

/** Points per thread in the list response: walks keep their shape at this
 * density (about one point per 1.5 world units for the longest walks). */
export const THREAD_LIST_POINTS = 200;

/** Keep every k-th point (always the last one) so a walk has at most `max` points. */
export function thinPoints(points: Int16Array, max: number): Int16Array {
  const count = points.length / 3;
  if (count <= max) return points;
  const stride = Math.ceil(count / max);
  const out: number[] = [];
  for (let i = 0; i < count; i += stride) out.push(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
  if ((count - 1) % stride) out.push(points[count * 3 - 3], points[count * 3 - 2], points[count * 3 - 1]);
  return Int16Array.from(out);
}

export function encodePoints(points: Int16Array): string {
  const bytes = new Uint8Array(points.buffer, points.byteOffset, points.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodePoints(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ints = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const out = new Float32Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] / QUANT;
  return out;
}
