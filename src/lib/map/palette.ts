import { LINES, type Line, type LineId } from '#lib/lines.js';
import type { Palette } from './painter.js';

// the lines too dark to see on the night map get a lighter strand there
const NIGHT = new Set<LineId>(['northern', 'piccadilly', 'metropolitan', 'elizabeth', 'weaver']);
// how far a chevron's tint and a train's outline move from their line's colour
const TINT = 0.45;
const EDGE = 0.55;

// the palette's colours all come back from the browser as opaque rgb()
const channels = (rgb: string) => rgb.match(/[\d.]+/g)!.map(Number);

const brightness = (rgb: string) => {
  const [r, g, b] = channels(rgb);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

const towards = (rgb: string, to: number, by: number) => {
  const moved = channels(rgb).map((c) => Math.round(c + (to - c) * by));
  return `rgb(${moved.join(', ')})`;
};

/** An rgb() colour moved towards black, or towards white if it's dark already */
export const tint = (rgb: string) => towards(rgb, brightness(rgb) > 140 ? 0 : 255, TINT);

/** An rgb() colour taken much darker for the day map, or much lighter for the night one */
export const edge = (rgb: string, night: boolean) => towards(rgb, night ? 255 : 0, EDGE);

/** Tokens hold light-dark(), which only resolves once it lands on a real property */
export function readPalette(root: HTMLElement, night: boolean): Palette {
  const probe = document.createElement('span');
  probe.hidden = true;
  // the page's own scheme might not have caught up yet
  probe.style.colorScheme = night ? 'dark' : 'light';
  root.append(probe);
  const resolve = (colour: string) => {
    probe.style.color = colour;
    return getComputedStyle(probe).color;
  };
  const read = (token: string) => resolve(`var(${token})`);
  const perLine = (colour: (line: Line) => string) =>
    Object.fromEntries(LINES.map((line) => [line.id, colour(line)])) as Record<LineId, string>;
  const lines = perLine(({ id, colour }) => (NIGHT.has(id) ? read(`--${id}`) : resolve(colour)));
  const palette: Palette = {
    paper: read('--paper'),
    river: read('--river'),
    stationInk: read('--station-ink'),
    ring: read('--ring'),
    ringFill: read('--ring-fill'),
    halo: read('--accent'),
    lines,
    tints: perLine(({ id }) => tint(lines[id])),
    edges: perLine(({ id }) => edge(lines[id], night))
  };
  probe.remove();
  return palette;
}
