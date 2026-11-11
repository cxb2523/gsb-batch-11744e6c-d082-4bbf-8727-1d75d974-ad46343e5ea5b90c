import { describe, expect, it } from 'vitest';
import type { Tracked } from '#lib/fleet.js';
import { diagram, markers } from '#lib/line/diagram.js';
import { auditLocations } from '#lib/line/locate.js';
import type { LineId } from '#lib/lines.js';
import { lineRoutes, stations } from '#lib/network.js';

const T = 1_000_000;

const on = (line: LineId, name: string) =>
  stations.find((s) => s.name === name && s.lines.includes(line))!.index;

/** A train running one leg from one station to the next between T and T + 100 */
const running = (from: number, to: number, depart = T, arrive = T + 100) =>
  ({ key: `${from}>${to}`, legs: [{ from, to, depart, arrive }] }) as unknown as Tracked;

const allPassed = (audit: ReturnType<typeof auditLocations>) =>
  audit.trains.every((train) => train.checks.every((check) => check.passed));

describe('auditLocations', () => {
  it('locates a Victoria line train Oxford Circus to Green Park exactly as markers does, all checks passing', () => {
    const line: LineId = 'victoria';
    const d = diagram(line);
    const [oxford, greenPark] = [on(line, 'Oxford Circus'), on(line, 'Green Park')];
    const train = running(oxford, greenPark);
    const t = T + 50;

    const audit = auditLocations(line, [train], t);
    const [marker] = markers(d, [train], t);

    expect(audit.line).toBe(line);
    expect(audit.t).toBe(t);
    expect(audit).toMatchObject({ passed: true, failed: 0, degradedCount: 0 });
    expect(audit.trains).toHaveLength(1);

    const located = audit.trains[0];
    expect(located).toMatchObject({
      trainKey: `${oxford}>${greenPark}`,
      status: 'ok',
      degraded: false,
      stopName: 'Oxford Circus',
      f: marker.f,
      down: marker.down,
      beside: marker.beside
    });
    expect(located.f).toBe(0.5);
    expect(located.down).toBe(true);
    expect(located.beside).toBe(0);

    // the stop sits on the spine (branch level 0), at Oxford Circus's own index down it
    const spineIndex = d.spine.stops.findIndex((stop) => stop.station.name === 'Oxford Circus');
    expect(located.position).toEqual({
      level: 0,
      index: spineIndex,
      branchStops: d.spine.stops.length
    });

    expect(located.leg).toEqual({ from: 'Oxford Circus', to: 'Green Park' });
    expect(allPassed(audit)).toBe(true);
    expect(located.checks.map((check) => check.name)).toEqual([
      'both leg ends found on the diagram',
      'the two leg ends lie on one drawn branch',
      'f within its expected range',
      'beside is non-zero only on a beside detour',
      'reported placement matches markers'
    ]);

    // and coming back the other way, down=false and the same stop and f as markers
    const back = auditLocations(line, [running(greenPark, oxford)], t);
    const [backMarker] = markers(d, [running(greenPark, oxford)], t);
    expect(back.trains[0]).toMatchObject({
      status: 'ok',
      stopName: backMarker.stop.station.name,
      f: backMarker.f,
      down: false,
      beside: backMarker.beside
    });
    expect(allPassed(back)).toBe(true);
  });

  it('marks an undrawn DLR link Westferry to West India Quay as a stop-degradation, at the same end as markers', () => {
    const line: LineId = 'dlr';
    const d = diagram(line);
    const [westferry, quay] = [on(line, 'Westferry'), on(line, 'West India Quay')];
    const train = running(westferry, quay);

    for (const [t, held] of [
      [T + 20, 'Westferry'],
      [T + 80, 'West India Quay']
    ] as const) {
      const audit = auditLocations(line, [train], t);
      const [marker] = markers(d, [train], t);
      const located = audit.trains[0];

      // held at the same end markers holds it at, rather than judged a failure
      expect(located.status).toBe('degraded');
      expect(located.degraded).toBe(true);
      expect(located.degradedReason).toContain('stop-degradation');
      expect(located.stopName).toBe(held);
      expect(located.stopName).toBe(marker.stop.station.name);
      expect(located).toMatchObject({ f: 0, down: marker.down, beside: 0 });
      expect(audit.passed).toBe(true);
      expect(audit.failed).toBe(0);
      expect(audit.degradedCount).toBe(1);
      expect(located.position).not.toBeNull();

      // the unconnectable leg is explained, not silently treated as a normal placement
      const branchCheck = located.checks.find(
        (check) => check.name === 'the two leg ends lie on one drawn branch'
      )!;
      expect(branchCheck.passed).toBe(false);
      expect(branchCheck.reason).toBeTruthy();
      // the placement itself still agrees with markers and the numeric checks pass
      expect(located.checks.filter((check) => !check.passed).map((check) => check.name)).toEqual([
        'the two leg ends lie on one drawn branch'
      ]);
    }
  });

  it('also degrades where a loop rejoins somewhere it cannot be drawn bending into, at the same end as markers', () => {
    const line: LineId = 'dlr';
    const d = diagram(line);
    const [blackwall, poplar] = [on(line, 'Blackwall'), on(line, 'Poplar')];
    const train = running(blackwall, poplar);

    for (const [t, held] of [
      [T + 20, 'Blackwall'],
      [T + 80, 'Poplar']
    ] as const) {
      const audit = auditLocations(line, [train], t);
      const [marker] = markers(d, [train], t);
      const located = audit.trains[0];

      expect(located.status).toBe('degraded');
      expect(located.stopName).toBe(held);
      expect(located.stopName).toBe(marker.stop.station.name);
      expect(located.degradedReason).toContain('stop-degradation');
      // this is the "rejoins without a bend drawn into it" reason, distinct from no branch at all
      expect(located.degradedReason).toContain('rejoining its branch');
      expect(audit.passed).toBe(true);
      expect(audit.failed).toBe(0);
    }
  });

  it('does not throw at the exact depart and arrive times, with f and beside still in range', () => {
    const line: LineId = 'victoria';
    const d = diagram(line);
    const [oxford, greenPark] = [on(line, 'Oxford Circus'), on(line, 'Green Park')];
    const train = running(oxford, greenPark);

    for (const t of [T, T + 100]) {
      const audit = auditLocations(line, [train], t);
      const [marker] = markers(d, [train], t);
      const located = audit.trains[0];

      expect(located.status).toBe('ok');
      expect(located.f).toBe(marker.f);
      expect(located.beside).toBe(marker.beside);
      expect(located.f).toBeGreaterThanOrEqual(-1);
      expect(located.f).toBeLessThanOrEqual(1);
      expect(located.beside).toBeGreaterThanOrEqual(0);
      expect(located.beside).toBeLessThanOrEqual(1);
      expect(allPassed(audit)).toBe(true);
    }

    // the same boundary times on a degraded DLR leg stay degraded and hold at the right end
    const dlr: LineId = 'dlr';
    const [westferry, quay] = [on(dlr, 'Westferry'), on(dlr, 'West India Quay')];
    const dlrTrain = running(westferry, quay);
    for (const t of [T, T + 100]) {
      const audit = auditLocations(dlr, [dlrTrain], t);
      const [marker] = markers(diagram(dlr), [dlrTrain], t);
      const located = audit.trains[0];
      expect(located.status).toBe('degraded');
      expect(located.stopName).toBe(marker.stop.station.name);
      expect(located.f).toBe(0);
      expect(located.beside).toBe(0);
    }
  });

  it('reports a beside detour on the Northern loop, matching markers and only where the loop runs beside', () => {
    const line: LineId = 'northern';
    const d = diagram(line);
    const [waterloo, kennington] = [on(line, 'Waterloo'), on(line, 'Kennington')];
    const audit = auditLocations(line, [running(waterloo, kennington)], T + 50);
    const [marker] = markers(d, [running(waterloo, kennington)], T + 50);
    const located = audit.trains[0];

    expect(located).toMatchObject({
      status: 'ok',
      stopName: marker.stop.station.name,
      f: marker.f,
      beside: marker.beside
    });
    expect(located.stopName).toBe('Bank');
    expect(located.beside).toBe(1);
    // the loop runs down beside the spine's own stops, so Bank itself is drawn on the spine
    const loop = d.spine.stops
      .find((stop) => stop.station.name === 'Euston')!
      .branches.find((branch) => branch.into?.station.name === 'Kennington')!;
    expect(loop.beside.some((stop) => stop.station.name === 'Bank')).toBe(true);
    expect(located.position?.level).toBe(0);
    expect(allPassed(audit)).toBe(true);
  });

  it('returns only JSON-serialisable plain data, with no station objects or functions', () => {
    const line: LineId = 'victoria';
    const [oxford, greenPark] = [on(line, 'Oxford Circus'), on(line, 'Green Park')];
    const audit = auditLocations(line, [running(oxford, greenPark)], T + 50);

    const roundTrip = JSON.parse(JSON.stringify(audit));
    expect(roundTrip).toEqual(audit);
    const json = JSON.stringify(audit);
    expect(json).toContain('"stopName":"Oxford Circus"');
    expect(json).not.toContain('"station"');

    // every value is JSON data: a primitive, a plain object or an array, never a function or class
    const plain = (value: unknown): boolean => {
      if (value === null || typeof value !== 'object')
        return ['string', 'number', 'boolean'].includes(typeof value) || value === null;
      if (Array.isArray(value)) return value.every(plain);
      return Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(plain);
    };
    expect(plain(audit)).toBe(true);
  });

  it('agrees with markers on every leg of every route of every line', () => {
    for (const line of lineRoutes.keys()) {
      const d = diagram(line);
      for (const route of lineRoutes.get(line)!) {
        for (let i = 1; i < route.length; i++) {
          const train = running(route[i - 1], route[i]);
          const audit = auditLocations(line, [train], T + 50);
          const [marker] = markers(d, [train], T + 50);
          const located = audit.trains[0];

          expect(marker, line).toBeDefined();
          expect(['ok', 'degraded']).toContain(located.status);
          expect(located.stopName).toBe(marker.stop.station.name);
          expect(located.f).toBe(marker.f);
          expect(located.down).toBe(marker.down);
          expect(located.beside).toBe(marker.beside);
          // degraded is exactly markers' own no-drawn-link fallback
          expect(located.degraded).toBe(located.status === 'degraded');
        }
      }
    }
  });

  it('reports a train it cannot place at all as failed, without confusing it with a degradation', () => {
    const line: LineId = 'victoria';
    const nowhere = stations.length + 99;
    const audit = auditLocations(line, [running(nowhere, nowhere + 1)], T + 50);
    const located = audit.trains[0];

    expect(located.status).toBe('failed');
    expect(located.degraded).toBe(false);
    expect(located.stopName).toBeNull();
    expect(located.position).toBeNull();
    expect(audit.passed).toBe(false);
    expect(audit.failed).toBe(1);
    expect(located.checks[0].passed).toBe(false);
    expect(located.checks[0].reason).toBeTruthy();
  });
});
