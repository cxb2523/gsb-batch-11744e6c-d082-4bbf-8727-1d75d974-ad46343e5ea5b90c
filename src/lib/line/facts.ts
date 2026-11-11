import { layouts } from '#lib/layout.js';
import type { LineId } from '#lib/lines.js';
import { distance, lineGraph } from '#lib/network.js';

/** Metres of track the line runs along, following its real curves */
export function lengthOf(line: LineId) {
  let metres = 0;
  for (const [a, onward] of lineGraph.get(line)!) {
    for (const b of onward) {
      if (a > b) continue;
      const shape = layouts.geographic.shape(a, b);
      for (let i = 1; i < shape.length; i++) metres += distance(shape[i - 1], shape[i]);
    }
  }
  return metres;
}

/** From the lowest fare zone to the highest, where a station on a boundary is in both */
export function zoneSpan(zones: string[]) {
  const numbers = zones.flatMap((zone) => zone.split('/').map(Number)).filter(Number.isFinite);
  if (!numbers.length) return null;
  const [low, high] = [Math.min(...numbers), Math.max(...numbers)];
  return low === high ? String(low) : `${low}–${high}`;
}
