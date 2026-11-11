import { Vector3 } from 'three';
import { THREAD_COLORS_COUNT, THREAD_MAX_POINTS, THREAD_MAX_STEP, THREAD_MIN_POINTS, type ThreadUpload } from './protocol';

const SPACING = 0.45;
const RAW_LIMIT = 4000;
const COLOR_KEY = 'yarnplanet:color:v1';

/** Records where the player actually walked this session, as continuous
 * segments (a teleport or restore starts a new one). */
export class WalkRecorder {
  private segments: number[][] = [[]];
  private readonly last = new Vector3();
  private has = false;
  length = 0;

  record(position: Vector3): void {
    if (!this.has) { this.push(position); return; }
    const step = position.distanceTo(this.last);
    if (step < SPACING) return;
    if (step > THREAD_MAX_STEP) this.segments.push([]);
    else this.length += step;
    this.push(position);
  }

  private push(position: Vector3): void {
    const segment = this.segments[this.segments.length - 1];
    if (segment.length / 3 >= RAW_LIMIT) return;
    segment.push(position.x, position.y, position.z);
    this.last.copy(position);
    this.has = true;
  }

  /** The longest continuous segment, resampled to fit the upload limits; null if too short. */
  points(): number[] | null {
    const segment = this.segments.reduce((a, b) => (b.length > a.length ? b : a), [] as number[]);
    const count = segment.length / 3;
    if (count < THREAD_MIN_POINTS) return null;
    const stride = Math.max(1, Math.ceil(count / THREAD_MAX_POINTS));
    // Keep consecutive points under the server's step limit.
    const maxStride = Math.max(1, Math.floor((THREAD_MAX_STEP - 0.1) / SPACING));
    const use = Math.min(stride, maxStride);
    const start = Math.max(0, count - THREAD_MAX_POINTS * use);
    const out: number[] = [];
    for (let i = start; i < count; i += use) out.push(...segment.slice(i * 3, i * 3 + 3).map(n => Math.round(n * 1000) / 1000));
    return out.length / 3 >= THREAD_MIN_POINTS ? out : null;
  }
}

/** A thread color for this player, stable across visits. */
export function threadColor(): number {
  try {
    const saved = Number(localStorage.getItem(COLOR_KEY));
    if (Number.isInteger(saved) && saved >= 1 && saved <= THREAD_COLORS_COUNT) return saved - 1;
    const color = Math.floor(Math.random() * THREAD_COLORS_COUNT);
    localStorage.setItem(COLOR_KEY, String(color + 1));
    return color;
  } catch { return 0; }
}

export async function uploadWalk(origin: string, upload: ThreadUpload, beacon = false): Promise<number | null> {
  const body = JSON.stringify(upload);
  const url = new URL('/api/threads', origin);
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon(url, body); return null; }
  try {
    const response = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
    if (!response.ok) return null;
    return (await response.json() as { total: number }).total;
  } catch { return null; }
}
