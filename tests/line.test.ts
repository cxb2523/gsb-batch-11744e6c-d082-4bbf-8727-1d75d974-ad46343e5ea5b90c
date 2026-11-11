import { describe, expect, it } from 'vitest';
import type { Tracked } from '#lib/fleet.js';
import { diagram, ends, markers, stopsOf, type Branch, type Diagram } from '#lib/line/diagram.js';
import { lengthOf } from '#lib/line/facts.js';
import { lineDescription } from '#lib/line/seo.js';
import { lineById, LINE_IDS, LINES, type LineId } from '#lib/lines.js';
import { lineRoutes, placesOn, stationById, stations } from '#lib/network.js';

const on = (line: LineId, name: string) =>
  stations.find((s) => s.name === name && s.lines.includes(line))!.index;
const names = (branch: Branch) => branch.stops.map((stop) => stop.station.name);
const stopAt = (branch: Branch, name: string) =>
  [...stopsOf(branch)].find((stop) => stop.station.name === name)!;
const branchesAt = (branch: Branch, name: string) =>
  stopAt(branch, name).branches.map((sub) => ({
    stops: names(sub),
    rejoins: sub.rejoins?.name ?? null
  }));

describe('diagram', () => {
  it('draws every station a line calls at, once each but for the stops the Circle makes twice', () => {
    for (const line of LINE_IDS) {
      const { spine, spots } = diagram(line);
      const drawn = [...stopsOf(spine)].map((stop) => stop.station);
      expect(
        drawn.filter((s) => !s.lines.includes(line)),
        line
      ).toEqual([]);
      if (line !== 'circle') expect(new Set(drawn).size, line).toBe(drawn.length);
      const calling = stations.filter((s) => s.lines.includes(line));
      expect(
        calling.filter((s) => !spots.has(s.index)).map((s) => s.name),
        line
      ).toEqual([]);
    }
  });

  it('runs from the north or west end, like a map', () => {
    const { spine } = diagram('victoria');
    expect(names(spine).at(0)).toBe('Walthamstow Central');
    expect(names(spine).at(-1)).toBe('Brixton');
    expect([...stopsOf(spine)].every((stop) => !stop.branches.length)).toBe(true);
    expect(names(diagram('central').spine).at(0)).toBe('West Ruislip');
  });

  it('splits each branch off where it leaves, and back in where it rejoins', () => {
    const { spine } = diagram('northern');
    expect(names(spine).at(0)).toBe('High Barnet');
    expect(names(spine).at(-1)).toBe('Morden');
    expect(branchesAt(spine, 'Finchley Central')).toEqual([
      { stops: ['Mill Hill East'], rejoins: null }
    ]);
    const [edgware, crescent] = branchesAt(spine, 'Camden Town');
    expect(edgware.stops.at(-1)).toBe('Edgware');
    expect(crescent).toEqual({ stops: ['Mornington Crescent'], rejoins: 'Euston' });
    const [charingCross] = branchesAt(spine, 'Euston');
    expect(charingCross.stops).toContain('Charing Cross');
    expect(charingCross.rejoins).toBe('Kennington');
    expect(branchesAt(spine, 'Kennington')[0].stops).toEqual([
      'Nine Elms',
      'Battersea Power Station'
    ]);
  });

  it('puts back the stop the Circle makes twice, which TfL lists once', () => {
    const order = names(diagram('circle').spine);
    expect(order.filter((name) => name === 'Edgware Road')).toHaveLength(2);
    expect(order.slice(8, 11)).toEqual(['Paddington', 'Edgware Road', 'Baker Street']);
    expect(order.slice(-3)).toEqual(['Bayswater', 'Paddington', 'Edgware Road']);
  });

  it("leaves out stations a line only runs through, like the Metropolitan's past Neasden", () => {
    const order = [...stopsOf(diagram('metropolitan').spine)].map((stop) => stop.station.name);
    for (const passed of ['Neasden', 'Dollis Hill', 'Kilburn', 'West Hampstead'])
      expect(order).not.toContain(passed);
    expect(order).toContain('Finchley Road');
  });

  it('draws a station TfL lists twice for different trains as the one stop', () => {
    const order = [...stopsOf(diagram('mildmay').spine)].map((stop) => stop.station.name);
    expect(order.filter((name) => name === 'Clapham Junction')).toHaveLength(1);
  });
});

describe('ends', () => {
  it('lists where trains start and finish, top to bottom', () => {
    expect(ends(diagram('central'))).toEqual([
      'West Ruislip',
      'Ealing Broadway',
      'Hainault',
      'Epping'
    ]);
    expect(ends(diagram('mildmay'))).toEqual(['Clapham Junction', 'Richmond', 'Stratford']);
  });
});

describe('markers', () => {
  const T = 1_000_000;
  /** A train running from one station to the next between T and T + 100 */
  const running = (from: number, to: number) =>
    ({ key: 'a', legs: [{ from, to, depart: T, arrive: T + 100 }] }) as unknown as Tracked;
  const placed = (d: Diagram, from: number, to: number, t = T + 50) => {
    const [{ stop, f, down, beside }] = markers(d, [running(from, to)], t);
    return { at: stop.station.name, f, down, beside };
  };

  it('puts a train between the stops it runs between, facing the way it goes', () => {
    const d = diagram('victoria');
    const [north, south] = [on('victoria', 'Oxford Circus'), on('victoria', 'Green Park')];
    expect(placed(d, north, south)).toEqual({
      at: 'Oxford Circus',
      f: 0.5,
      down: true,
      beside: 0
    });
    expect(placed(d, south, north)).toMatchObject({ at: 'Oxford Circus', f: 0.5, down: false });
  });

  it('runs a train off a junction round the bend into its branch', () => {
    const d = diagram('northern');
    const [camden, chalk] = [on('northern', 'Camden Town'), on('northern', 'Chalk Farm')];
    expect(placed(d, camden, chalk)).toMatchObject({ at: 'Chalk Farm', f: -0.5, down: true });
    // still stood at the junction, it's at the junction's own stop
    expect(placed(d, camden, chalk, T - 10)).toMatchObject({ at: 'Camden Town', f: 0 });
  });

  it('runs a loop on down beside the line to where it rejoins', () => {
    const d = diagram('northern');
    const loop = stopAt(d.spine, 'Euston').branches[0];
    expect(loop.into?.station.name).toBe('Kennington');
    expect(loop.beside.map((stop) => stop.station.name)).toEqual([
      "King's Cross St. Pancras",
      'Angel',
      'Old Street',
      'Moorgate',
      'Bank',
      'London Bridge',
      'Borough',
      'Elephant & Castle'
    ]);
    const [waterloo, kennington] = [on('northern', 'Waterloo'), on('northern', 'Kennington')];
    expect(placed(d, waterloo, kennington)).toMatchObject({ at: 'Bank', beside: 1 });
    // and across the bend at the end, never back up it
    const end = Array.from({ length: 200 }, (_, i) => placed(d, waterloo, kennington, T + i / 2))
      .filter(({ at }) => at === 'Kennington')
      .map(({ f, beside }) => ({ f, beside }));
    expect(end.length).toBeGreaterThan(1);
    expect(end.every(({ f }) => f === 0)).toBe(true);
    expect(end.map(({ beside }) => beside)).toEqual(
      end.map(({ beside }) => beside).toSorted((a, b) => b - a)
    );
  });

  it("waits a train at an end of a link that hasn't a line of its own drawn", () => {
    const d = diagram('dlr');
    const [westferry, quay] = [on('dlr', 'Westferry'), on('dlr', 'West India Quay')];
    expect(placed(d, westferry, quay, T + 20)).toMatchObject({ at: 'Westferry', f: 0 });
    expect(placed(d, westferry, quay, T + 80)).toMatchObject({ at: 'West India Quay', f: 0 });
    // as it does where a loop meets the line again somewhere it can't be drawn joining
    const [blackwall, poplar] = [on('dlr', 'Blackwall'), on('dlr', 'Poplar')];
    expect(placed(d, blackwall, poplar, T + 20)).toMatchObject({ at: 'Blackwall', f: 0 });
    expect(placed(d, blackwall, poplar, T + 80)).toMatchObject({ at: 'Poplar', f: 0 });
  });

  it('finds every train, whichever leg of whichever route it is on', () => {
    for (const line of LINE_IDS) {
      const d = diagram(line);
      for (const route of lineRoutes.get(line)!) {
        for (let i = 1; i < route.length; i++)
          expect(markers(d, [running(route[i - 1], route[i])], T + 50), line).toHaveLength(1);
      }
    }
  });

  it("finds the right one of a station's two stops by where the train's coming from", () => {
    const d = diagram('circle');
    const id = (naptan: string) => stationById.get(naptan)!.index;
    const at = (from: string, to: string, t = T + 50) =>
      markers(d, [running(id(from), id(to))], t)[0].stop;
    // the Hammersmith & City's Paddington on the way out, Praed Street's coming back round
    expect(at('940GZZLUPAH', '940GZZLUERC')).toBe(d.spine.stops[8]);
    expect(at('940GZZLUPAC', '940GZZLUERC')).toBe(d.spine.stops.at(-2));
    // and stood at Edgware Road, which of its two it's at
    expect(at('940GZZLUPAC', '940GZZLUERC', T + 100)).toBe(d.spine.stops.at(-1));
    expect(at('940GZZLUERC', '940GZZLUBST', T - 10)).toBe(d.spine.stops[9]);
  });
});

describe('lengthOf', () => {
  it('measures a line along its real track', () => {
    expect(lengthOf('victoria') / 1000).toBeGreaterThan(20);
    expect(lengthOf('victoria') / 1000).toBeLessThan(23);
  });
});

describe('lineDescription', () => {
  it('says how many stations a line has and where it runs, short enough to show whole', () => {
    expect(lineDescription(lineById('victoria')!, diagram('victoria'))).toContain(
      `all ${placesOn('victoria').length} stations from Walthamstow Central to Brixton,`
    );
    expect(lineDescription(lineById('northern')!, diagram('northern'))).toContain(
      'from High Barnet to Morden and its branches'
    );
    for (const line of LINES)
      expect(lineDescription(line, diagram(line.id)).length).toBeLessThan(170);
  });
});
