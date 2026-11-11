import { describe, expect, it } from 'vitest';
import { Fleet, type Tracked } from '#lib/fleet.js';
import { layouts, type Layout } from '#lib/layout.js';
import { locate, route, schedule } from '#lib/motion.js';
import { distance, stations, type Point } from '#lib/network.js';
import { whereIs } from '#lib/status.js';
import type { Snapshot, Stop, TrainReading } from '#lib/types.js';
import { AT, index } from './helpers.js';

const STOCKWELL = index('940GZZLUSKW');
const VAUXHALL = index('940GZZLUVXL');
const PIMLICO = index('940GZZLUPCO');
const GREEN_PARK = index('940GZZLUGPK');

const train = (overrides: Partial<TrainReading> = {}): TrainReading => ({
  id: 'victoria:201',
  line: 'victoria',
  to: 'Walthamstow Central',
  dest: null,
  where: 'Between Stockwell and Vauxhall',
  from: STOCKWELL,
  stops: [
    [VAUXHALL, 60, 0],
    [PIMLICO, 180, 0]
  ],
  ...overrides
});

const seconds = (offset: number) => AT / 1000 + offset;

const offTrack = (p: Point, shape: Point[]) =>
  Math.min(
    ...shape.slice(1).map((b, i) => {
      const a = shape[i];
      const length = distance(a, b) ** 2 || 1;
      const f = Math.max(
        0,
        Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length)
      );
      return distance(p, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
    })
  );

describe('locate', () => {
  it('closes in on the next stop as its arrival time comes round', () => {
    const legs = schedule(train(), AT);
    const gaps = [0, 20, 40, 59].map((t) =>
      distance(locate('victoria', legs, VAUXHALL, seconds(t)), stations[VAUXHALL])
    );
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
    expect(gaps[3]).toBeLessThan(gaps[0] / 10);
  });

  it('waits at a station between arriving and leaving', () => {
    const legs = schedule(train(), AT);
    const stood = locate('victoria', legs, VAUXHALL, seconds(65));
    expect(stood.at).toBe(VAUXHALL);
    expect(distance(stood, stations[VAUXHALL])).toBeLessThan(1);
  });

  it('faces the way it is going, on the move and stood at a station', () => {
    const legs = schedule(train(), AT);
    const facing = (t: number, towards: number) => {
      const { x, y, angle } = locate('victoria', legs, VAUXHALL, seconds(t));
      const ahead = stations[towards];
      return Math.cos(angle) * (ahead.x - x) + Math.sin(angle) * (ahead.y - y);
    };
    expect(facing(30, VAUXHALL)).toBeGreaterThan(0);
    expect(facing(65, PIMLICO)).toBeGreaterThan(0);
  });

  it('stays at the last stop once the estimates run out', () => {
    const legs = schedule(train(), AT);
    expect(locate('victoria', legs, VAUXHALL, seconds(600)).at).toBe(PIMLICO);
  });

  it("keeps a train at the platform TfL says it's at, even with an ETA that says it left", () => {
    const stood = train({ where: 'At Stockwell Platform 1', stops: [[VAUXHALL, 20, 0]] });
    const placed = locate('victoria', schedule(stood, AT), VAUXHALL, seconds(0));
    expect(distance(placed, stations[STOCKWELL])).toBeLessThan(1);
  });

  it('leaves a train where it is when TfL says it is stood at its next call', () => {
    const stood = train({ where: 'At Vauxhall', from: VAUXHALL, stops: [[VAUXHALL, 40, 0]] });
    expect(locate('victoria', schedule(stood, AT), VAUXHALL, seconds(0)).at).toBe(VAUXHALL);
  });

  it.each(['geographic', 'schematic'] as const)('keeps a train on the %s track', (style) => {
    const layout = layouts[style];
    const placed = locate('victoria', schedule(train(), AT), VAUXHALL, seconds(30), layout);
    expect(placed.at).toBeNull();
    expect(offTrack(placed, layout.shape(...placed.between))).toBeLessThan(1);
  });

  it('works out where a train is coming from when TfL does not say', () => {
    const [first] = schedule(train({ from: null, where: '' }), AT);
    expect(first.from).toBe(STOCKWELL);
  });

  it('starts a train from the end of the line when it is heading back out', () => {
    const BRIXTON = index('940GZZLUBXN');
    const leaving = train({
      from: null,
      where: '',
      stops: [
        [BRIXTON, 60, 0],
        [STOCKWELL, 180, 0]
      ]
    });
    expect(locate('victoria', schedule(leaving, AT), BRIXTON, seconds(0)).at).toBe(BRIXTON);
  });
});

describe('whereIs', () => {
  it('names neighbouring stations even when a leg skips calls', () => {
    const VICTORIA = index('940GZZLUVIC');
    const reading = train({
      stops: [
        [STOCKWELL, 0, 0],
        [VICTORIA, 300, 0]
      ]
    });
    const where = [60, 150, 230, 290].map((t) =>
      whereIs({ legs: schedule(reading, AT), reading } as Tracked, AT + t * 1000)
    );
    for (const text of where) {
      expect(text).toMatch(
        /^(Between|Approaching) (Stockwell and Vauxhall|Vauxhall and Pimlico|Pimlico and Victoria|Vauxhall|Pimlico|Victoria)$/
      );
    }
  });
});

describe('Fleet', () => {
  const snapshot = (at: number, trains: TrainReading[]): Snapshot => ({
    at,
    stale: false,
    trains,
    platforms: [''],
    status: []
  });

  it('keeps following a nameless train from one reading to the next', () => {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train({ id: null })]), AT);
    const [key] = fleet.trains.keys();
    const later = train({
      id: null,
      stops: [
        [VAUXHALL, 50, 0],
        [PIMLICO, 170, 0]
      ]
    });
    fleet.update(snapshot(AT + 10_000, [later]), AT + 10_000);
    expect([...fleet.trains.keys()]).toEqual([key]);
  });

  it('carries trains straight onto the other map rather than easing them across', () => {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    fleet.step(AT + 1000, 1);
    fleet.step(AT + 1100, 0.1, layouts.schematic);
    const [moved] = fleet.trains.values();
    const there = locate('victoria', moved.legs, VAUXHALL, seconds(1.1), layouts.schematic);
    expect(distance(moved.shown, there)).toBeLessThan(1);
  });

  /** Runs the fleet at 60fps, handing over the time each frame */
  function* play(fleet: Fleet, from: number, seconds: number, layout = layouts.geographic) {
    for (let i = 1; i <= seconds * 60; i++) {
      const now = from + (i * 1000) / 60;
      fleet.step(now, 1 / 60, layout);
      yield now;
    }
  }

  const running = (fleet: Fleet) => [...fleet.trains.values()].find((t) => !t.gone)!;

  const metresOff = ({ reading, legs, shown }: Tracked, now: number, layout: Layout) => {
    const target = locate(reading.line, legs, reading.stops[0][0], now / 1000, layout);
    const way = route(reading.line, shown, target)!;
    return way.end - way.start;
  };

  /** A train a little way out of Stockwell, then a reading that puts it `stood` at a station */
  function jump(stood: number, layout = layouts.geographic) {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    fleet.step(AT + 1000, 1, layout);
    const stops: Stop[] = [
      [stood, 30, 0],
      [index('940GZZLUOXC'), 150, 0]
    ];
    fleet.update(
      snapshot(AT + 1000, [train({ where: `At ${stations[stood].name}`, from: stood, stops })]),
      AT + 1000
    );
    return fleet;
  }

  it.each(['geographic', 'schematic'] as const)(
    'catches up a reading a stop on by hurrying along the %s track, no faster than 100mph',
    (style) => {
      const layout = layouts[style];
      const fleet = jump(PIMLICO, layout);
      const moving = running(fleet);
      let [gap, was] = [Infinity, moving.shown];
      for (const now of play(fleet, AT + 1000, 45, layout)) {
        const { shown } = moving;
        expect(offTrack(shown, layout.shape(...shown.between))).toBeLessThan(1);
        expect(metresOff(moving, now, layout)).toBeLessThanOrEqual(gap);
        gap = metresOff(moving, now, layout);
        const way = route('victoria', was, shown)!;
        expect((way.end - way.start) * 60).toBeLessThan(45.1);
        was = shown;
      }
      expect(gap).toBeLessThan(1);
    }
  );

  it('fades a train across rather than racing it miles up the line', () => {
    const fleet = jump(GREEN_PARK);
    const moving = running(fleet);
    const there = locate('victoria', moving.legs, VAUXHALL, seconds(1));
    expect(distance(moving.shown, there)).toBeLessThan(1);
    expect(moving.opacity).toBe(0);
    const [ghost] = [...fleet.trains.values()].filter((t) => t.gone);
    expect(distance(ghost.shown, stations[GREEN_PARK])).toBeGreaterThan(3000);
    fleet.step(AT + 2000, 1);
    expect([...fleet.trains.values()]).toEqual([moving]);
    expect(moving.opacity).toBe(1);
  });

  it('waits for a reading a little behind where it is drawn, rather than reversing', () => {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    fleet.step(AT + 20_000, 20);
    const late = train({
      stops: [
        [VAUXHALL, 44, 0],
        [PIMLICO, 164, 0]
      ]
    });
    fleet.update(snapshot(AT + 20_000, [late]), AT + 20_000);
    const held = running(fleet);
    const was = held.shown;
    for (const _ of play(fleet, AT + 20_000, 2)) {
      expect(distance(held.shown, was)).toBeLessThan(0.01);
    }
  });

  it('fades a train back rather than waiting ages for a reading well behind', () => {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    fleet.step(AT + 55_000, 55);
    const stuck = train({ where: 'At Stockwell', stops: [[VAUXHALL, 120, 0]] });
    fleet.update(snapshot(AT + 55_000, [stuck]), AT + 55_000);
    expect(distance(running(fleet).shown, stations[STOCKWELL])).toBeLessThan(1);
    expect([...fleet.trains.values()].filter((t) => t.gone)).toHaveLength(1);
  });

  it('tells apart two trains TfL gives the same id by where they are', () => {
    const [HIGHBURY, FINSBURY_PARK] = [index('940GZZLUHAI'), index('940GZZLUFPK')];
    const north = (eta: number) =>
      train({
        where: 'Between Highbury & Islington and Finsbury Park',
        from: HIGHBURY,
        stops: [[FINSBURY_PARK, eta, 0]]
      });
    const south = (eta: number) => train({ stops: [[VAUXHALL, eta, 0]] });
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [south(60), north(60)]), AT);
    const keyAt = (station: number) =>
      [...fleet.trains.values()].find((t) => t.reading.stops[0][0] === station)!.key;
    const [southKey, northKey] = [keyAt(VAUXHALL), keyAt(FINSBURY_PARK)];
    fleet.update(snapshot(AT + 10_000, [north(50), south(50)]), AT + 10_000);
    expect([keyAt(VAUXHALL), keyAt(FINSBURY_PARK)]).toEqual([southKey, northKey]);
    expect([...fleet.trains.values()].every((t) => !t.gone)).toBe(true);
  });

  it("remembers where a train came from when TfL doesn't say", () => {
    const [WHARF, WHITECHAPEL, LIVERPOOL_STREET] = ['CANWHRF', 'WCHAPXR', 'LIVSTLL'].map((code) =>
      index(`910G${code}`)
    );
    const westbound = (stops: Stop[]): TrainReading => ({
      id: 'elizabeth:1',
      line: 'elizabeth',
      to: 'Paddington',
      dest: null,
      where: '',
      from: null,
      stops
    });
    const fleet = new Fleet();
    fleet.update(
      snapshot(AT, [
        westbound([
          [WHARF, 20, 0],
          [WHITECHAPEL, 200, 0],
          [LIVERPOOL_STREET, 380, 0]
        ])
      ]),
      AT
    );
    const later = westbound([
      [WHITECHAPEL, 170, 0],
      [LIVERPOOL_STREET, 350, 0]
    ]);
    fleet.update(snapshot(AT + 30_000, [later]), AT + 30_000);
    expect(running(fleet).legs[0].from).toBe(WHARF);
    // as TfL sent it, so a station's board can still find the train it's about
    expect(running(fleet).reading).toBe(later);
  });

  it("doesn't send a train back the way it came once it's turned round", () => {
    const BRIXTON = index('940GZZLUBXN');
    const going = (stops: Stop[]) => train({ where: '', from: null, stops });
    const fleet = new Fleet();
    const inbound = going([
      [STOCKWELL, 20, 0],
      [BRIXTON, 140, 0]
    ]);
    fleet.update(snapshot(AT, [inbound]), AT);
    const outbound = going([
      [STOCKWELL, 200, 0],
      [VAUXHALL, 320, 0]
    ]);
    fleet.update(snapshot(AT + 30_000, [outbound]), AT + 30_000);
    expect(running(fleet).legs[0].from).toBe(BRIXTON);
  });

  it('trusts where TfL says a train came from, even when it turns round to go back there', () => {
    const BRIXTON = index('940GZZLUBXN');
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    const reversing = train({
      where: 'Left Stockwell',
      stops: [
        [BRIXTON, 60, 0],
        [STOCKWELL, 240, 0]
      ]
    });
    fleet.update(snapshot(AT + 10_000, [reversing]), AT + 10_000);
    expect(running(fleet).legs[0].from).toBe(STOCKWELL);
  });

  it('never takes a train fading out for the one it became', () => {
    const fleet = jump(GREEN_PARK);
    const { key } = running(fleet);
    // with the map asleep nothing has faded by the time it's sighted back where it was
    fleet.update(snapshot(AT + 11_000, [train()]), AT + 11_000);
    expect(running(fleet).key).toBe(key);
    expect([...fleet.trains.values()].filter((t) => !t.gone)).toHaveLength(1);
  });

  it('forgets trains that faded out while the map was asleep', () => {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    fleet.update(snapshot(AT + 10_000, []), AT + 10_000);
    expect(fleet.trains.size).toBe(1);
    fleet.update(snapshot(AT + 20_000, []), AT + 20_000);
    expect(fleet.trains.size).toBe(0);
  });

  it('fades a train out when it drops off the feed rather than deleting it', () => {
    const fleet = new Fleet();
    fleet.update(snapshot(AT, [train()]), AT);
    fleet.step(AT + 1000, 1);
    fleet.update(snapshot(AT + 10_000, []), AT + 10_000);
    const [gone] = fleet.trains.values();
    expect(gone.gone).toBe(true);
    fleet.step(AT + 12_000, 2);
    expect(fleet.trains.size).toBe(0);
  });
});
