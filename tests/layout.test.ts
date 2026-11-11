import { describe, expect, it } from 'vitest';
import { layouts } from '#lib/layout.js';
import { distance, stations, tracks } from '#lib/network.js';

describe('the tube map', () => {
  it('only runs lines across, up and down, or at 45°', () => {
    const askew = tracks.filter(({ a, b }) => {
      const shape = layouts.schematic.shape(a, b);
      return shape.slice(1).some((q, i) => {
        const [dx, dy] = [Math.abs(q.x - shape[i].x), Math.abs(q.y - shape[i].y)];
        // stations spaced along a diagonal are rounded to whole units
        return dx > 2 && dy > 2 && Math.abs(dx - dy) > 2;
      });
    });
    expect(askew.map(({ a, b }) => `${stations[a].name} to ${stations[b].name}`)).toEqual([]);
  });

  it('puts a station where the map has it when flying there from its real position', () => {
    const misplaced = stations.filter(
      (s) => distance(layouts.schematic.place(s), layouts.schematic.at[s.index]) > 1
    );
    expect(misplaced.map((s) => s.name)).toEqual([]);
  });
});
