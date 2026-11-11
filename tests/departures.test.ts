import { describe, expect, it } from 'vitest';
import { arrivals, departures } from '#lib/departures.js';
import type { LineId } from '#lib/lines.js';
import type { Snapshot, TrainReading } from '#lib/types.js';
import { AT, index } from './helpers.js';

const BRIXTON = '940GZZLUBXN';
const STOCKWELL = '940GZZLUSKW';
const VAUXHALL = '940GZZLUVXL';
const PLATFORMS = ['Northbound - Platform 1', '', 'Southbound - Platform 2'];

/** A train calling at each station `eta` seconds off, on one of the PLATFORMS */
const train = (
  line: LineId,
  to: string,
  calls: [naptan: string, eta: number, platform: number][]
): TrainReading => ({
  id: null,
  line,
  to,
  dest: index(calls.at(-1)![0]),
  where: '',
  from: null,
  stops: calls.map(([naptan, eta, platform]) => [index(naptan), eta, platform])
});

const north = train('victoria', 'Walthamstow Central', [
  [STOCKWELL, 120, 0],
  [VAUXHALL, 240, 0]
]);
const sooner = train('victoria', 'Seven Sisters', [
  [STOCKWELL, 60, 0],
  [VAUXHALL, 180, 0]
]);
const gone = train('victoria', 'Walthamstow Central', [
  [STOCKWELL, -40, 0],
  [VAUXHALL, 80, 0]
]);
const south = train('victoria', 'Brixton', [
  [STOCKWELL, 30, 2],
  [BRIXTON, 150, 2]
]);
const northern = train('northern', 'Edgware', [
  [STOCKWELL, 300, 1],
  ['940GZZLUKNG', 420, 1]
]);

const snapshot: Snapshot = {
  at: AT,
  stale: false,
  trains: [north, sooner, gone, south, northern],
  platforms: PLATFORMS,
  status: []
};
const both = new Set<LineId>(['victoria', 'northern']);
const at = (naptan: string) => new Set([index(naptan)]);

describe('departures', () => {
  it('gives each line and platform a board, soonest train first', () => {
    const boards = departures(snapshot, at(STOCKWELL), both, AT);
    expect(boards.map((b) => [b.line.id, b.platform])).toEqual([
      ['northern', ''],
      ['victoria', 'Northbound · Platform 1'],
      ['victoria', 'Southbound · Platform 2']
    ]);
    expect(boards[1].rows.map((row) => row.train)).toEqual([sooner, north]);
    expect(boards[1].rows[0].due).toBe(60);
  });

  it('counts down from now, and lets a train that has only just gone drop off', () => {
    const later = departures(snapshot, at(STOCKWELL), both, AT + 80_000);
    expect(later[1].rows.map((row) => [row.train, row.due])).toEqual([
      [sooner, -20],
      [north, 40]
    ]);
    expect(later.flatMap((b) => b.rows).some((row) => row.train === gone)).toBe(false);
  });

  it('leaves out lines that are switched off, and trains finishing here', () => {
    const victoria = departures(snapshot, at(STOCKWELL), new Set(['victoria']), AT);
    expect(victoria.every((b) => b.line.id === 'victoria')).toBe(true);
    expect(departures(snapshot, at(BRIXTON), both, AT)).toEqual([]);
  });
});

describe('arrivals', () => {
  it('lists trains coming in to finish here, with the platform they finish on', () => {
    expect(arrivals(snapshot, at(BRIXTON), both, AT)).toEqual([
      { train: south, platform: 'Southbound · Platform 2', due: 150 }
    ]);
    expect(arrivals(snapshot, at(STOCKWELL), both, AT)).toEqual([]);
  });
});
