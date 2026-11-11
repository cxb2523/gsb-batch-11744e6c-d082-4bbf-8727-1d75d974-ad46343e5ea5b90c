import type { Point } from '#lib/network.js';

/** Screen = world * k + (x, y), world being metres from Charing Cross */
export interface View {
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const toScreen = (view: View, p: Point): Point => ({
  x: p.x * view.k + view.x,
  y: p.y * view.k + view.y
});

export const toWorld = (view: View, p: Point): Point => ({
  x: (p.x - view.x) / view.k,
  y: (p.y - view.y) / view.k
});

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

// about where the map opens, past which lines thin faster so the middle doesn't clog up
const OPENS = 0.04;
const weight = (k: number) => 2 + Math.log2(k / 0.01) * 1.25;

/** Line weight in CSS pixels, thickening gently as you zoom in */
export const lineWidth = (k: number) =>
  k < OPENS ? Math.max(1, weight(OPENS) * (k / OPENS) ** 0.85) : Math.min(weight(k), 7.5);

// about where lines reach their full weight, and zoomed out past where the small marks go
const CLOSE = 0.2;
const DETAIL = 0.018;

/** Close enough in for the small marks: station ticks and which way trains face */
export const detailed = (k: number) => k > DETAIL;

/** How far it's zoomed out from close in to where the detail goes, from 0 to 1 */
export const zoomedOut = (k: number) =>
  clamp(Math.log2(CLOSE / k) / Math.log2(CLOSE / DETAIL), 0, 1);

export const labelSize = (k: number) => Math.round(clamp(11 + Math.log2(k / 0.03) * 1.6, 11, 15));

export const visible = (view: View, p: Point, margin = 40) =>
  p.x > -margin && p.y > -margin && p.x < view.width + margin && p.y < view.height + margin;
