import type { Tracked } from '#lib/fleet.js';
import type { LineId } from '#lib/lines.js';
import { stations } from '#lib/network.js';
import { ease, legAt } from '#lib/motion.js';
import {
  diagram as buildDiagram,
  markers,
  stopsOf,
  type Branch,
  type Diagram,
  type Stop
} from './diagram.js';

/** One item of the audit checklist, plain data so the whole report is JSON-serialisable */
export interface AuditCheck {
  name: string;
  passed: boolean;
  /** Human-readable explanation, present only when the check did not pass */
  reason?: string;
}

/** Where a stop sits in the diagram: the spine or a numbered branch level, and its index there */
export interface BranchPosition {
  /** 0 is the spine, 1 a branch off the spine, 2 a branch off a branch, and so on */
  level: number;
  /** Index of the stop within its own branch's stops, -1 where the stop only sits at a junction */
  index: number;
  /** Number of stops the branch holding this stop runs to, junction and rejoin excepted */
  branchStops: number;
}

/** The audit verdict for one train */
export type TrainAuditStatus = 'ok' | 'degraded' | 'failed';

export interface TrainLocationAudit {
  trainKey: string;
  /** ok: placed normally, degraded: held at an end the diagram cannot draw between, failed: not placed */
  status: TrainAuditStatus;
  /** True for the "stop-degradation" case where markers holds the train at one end of an undrawn link */
  degraded: boolean;
  /** Why the train had to be held at an end, when degraded */
  degradedReason?: string;
  /** Station name the marker's stop belongs to, null where the train could not be placed at all */
  stopName: string | null;
  f: number;
  down: boolean;
  beside: number;
  position: BranchPosition | null;
  /** The leg's ends, named, for anyone reading the report without the train object */
  leg: { from: string; to: string } | null;
  checks: AuditCheck[];
}

export interface LocationAudit {
  line: LineId;
  t: number;
  trains: TrainLocationAudit[];
  /** Every check on every train passed (degraded trains do not count as failing) */
  passed: boolean;
  failed: number;
  degradedCount: number;
}

interface Near {
  branch: Branch;
  from: number;
  to: number;
}

/** The stop a station is drawn as, rather than a junction or rejoin it is also at */
function stopOf({ spots }: Diagram, station: number): Stop | undefined {
  const spot = spots.get(station)?.find(({ branch, i }) => branch.stops[i]);
  return spot && spot.branch.stops[spot.i];
}

// the branch both ends of a leg are closest together on, as a station can be on two
function nearest({ spots }: Diagram, from: number, to: number): Near | null {
  let best: Near | null = null;
  for (const a of spots.get(from) ?? []) {
    for (const b of spots.get(to) ?? []) {
      if (a.branch === b.branch && (!best || Math.abs(b.i - a.i) < Math.abs(best.to - best.from)))
        best = { branch: a.branch, from: a.i, to: b.i };
    }
  }
  return best;
}

/** Where `x` stops down a branch is drawn, which past a loop's last stop is on down beside the line */
function along(branch: Branch, x: number): { stop: Stop; f: number; beside: number } {
  const last = branch.stops.length - 1;
  if (x <= last) {
    const i = Math.max(Math.floor(x), 0);
    return { stop: branch.stops[i], f: x - i, beside: 0 };
  }
  // from its last stop down past each it runs beside, then across the bend into the one it rejoins
  const way = [branch.stops[last], ...branch.beside];
  const u = (x - last) * (way.length + 1);
  const k = Math.floor(u);
  if (k >= way.length) return { stop: branch.into!, f: 0, beside: 1 - (u - k) };
  return { stop: way[k], f: u - k, beside: k > 0 ? 1 : 0 };
}

/** Every stop a loop runs down beside, or bends back into, so beside can be checked against the drawing */
function detourStops(spine: Branch): Set<Stop> {
  const detour = new Set<Stop>();
  for (const stop of stopsOf(spine)) {
    for (const branch of stop.branches) {
      for (const beside of branch.beside) detour.add(beside);
      if (branch.into) detour.add(branch.into);
    }
  }
  return detour;
}

/** Which branch level and index a drawn stop occupies, walking the diagram exactly as it is drawn */
function findPosition(spine: Branch, wanted: Stop): BranchPosition | null {
  let found: BranchPosition | null = null;
  const walk = (branch: Branch, level: number) => {
    branch.stops.forEach((stop, index) => {
      if (stop === wanted) found = { level, index, branchStops: branch.stops.length };
      for (const sub of stop.branches) walk(sub, level + 1);
    });
  };
  walk(spine, 0);
  return found;
}

const check = (name: string, passed: boolean, reason?: string): AuditCheck =>
  passed ? { name, passed } : { name, passed: false, reason };

// f can dip just below zero while a train rounds the bend into a branch, but never past a whole stop
const F_MIN = -1;
const F_MAX = 1;

/**
 * Audit where every train is located on a line's diagram at time `t`.
 *
 * Pure: it builds its own diagram, never touches the DOM, disk or global state, and returns only
 * station names, indices, numbers and booleans. For the same diagram, trains and `t`, the reported
 * stop name, f, down and beside match `markers` item for item. A leg whose ends the diagram cannot
 * draw a line between (like the DLR's Poplar triangle) is reported as a stop-degradation, not a
 * failure: the train is held at the same end markers holds it at.
 */
export function auditLocations(line: LineId, trains: Tracked[], t: number): LocationAudit {
  const d = buildDiagram(line);
  const order = [...stopsOf(d.spine)];
  const detour = detourStops(d.spine);
  const markerByKey = new Map(markers(d, trains, t).map((marker) => [marker.train.key, marker]));

  const trainAudits = trains.map((train): TrainLocationAudit => {
    const on = legAt(train.legs, t);
    const start = on && stopOf(d, on.leg.from);
    const end = on && stopOf(d, on.leg.to);
    const leg = on
      ? {
          from: stations[on.leg.from]?.name ?? `station ${on.leg.from}`,
          to: stations[on.leg.to]?.name ?? `station ${on.leg.to}`
        }
      : null;

    if (!on || !start || !end) {
      const reason = !on
        ? 'the train has no leg covering this time'
        : `no drawn stop for leg end ${!start ? leg!.from : leg!.to}`;
      return {
        trainKey: train.key,
        status: 'failed',
        degraded: false,
        stopName: null,
        f: 0,
        down: false,
        beside: 0,
        position: null,
        leg,
        checks: [check('both leg ends found on the diagram', false, reason)]
      };
    }

    const best = nearest(d, on.leg.from, on.leg.to);
    // with no line drawn between them, like the DLR's triangle at Poplar, it waits at one end
    const rejoining = best !== null && Math.max(best.from, best.to) === best.branch.stops.length;
    const degraded = best === null || (rejoining && !best.branch.into);

    const endsCheck = check('both leg ends found on the diagram', true, undefined);
    const branchCheck = check(
      'the two leg ends lie on one drawn branch',
      !degraded,
      degraded
        ? best === null
          ? `no drawn branch connects ${leg!.from} with ${leg!.to}`
          : `the branch from ${leg!.from} only rejoins at ${best.branch.rejoins?.name}, without a bend drawn into it`
        : undefined
    );

    if (degraded) {
      const down = order.indexOf(end) > order.indexOf(start);
      const held = on.progress < 0.5 ? start : end;
      const degradedReason =
        best === null
          ? `stop-degradation: no line is drawn between ${leg!.from} and ${leg!.to}, so the train is held at ${held.station.name}`
          : `stop-degradation: the link from ${leg!.from} to ${leg!.to} cannot be drawn rejoining its branch, so the train is held at ${held.station.name}`;
      const f = 0;
      const beside = 0;
      return {
        trainKey: train.key,
        status: 'degraded',
        degraded: true,
        degradedReason,
        stopName: held.station.name,
        f,
        down,
        beside,
        position: findPosition(d.spine, held),
        leg,
        checks: [
          endsCheck,
          branchCheck,
          check('f within its expected range', f >= F_MIN && f <= F_MAX),
          check('beside is non-zero only on a beside detour', beside === 0 || detour.has(held))
        ]
      };
    }

    const { branch, from, to } = best;
    const x = from + ease(on.progress) * (to - from);
    // stood at a junction or where a branch rejoins, it's at that station's own stop
    const placed =
      Number.isInteger(x) && !branch.stops[x]
        ? { stop: x === from ? start : end, f: 0, beside: 0 }
        : along(branch, x);
    const { f, beside } = placed;
    const fOk = Number.isFinite(f) && f >= F_MIN && f <= F_MAX;
    const besideOk =
      Number.isFinite(beside) &&
      beside >= 0 &&
      beside <= 1 &&
      (beside === 0 || detour.has(placed.stop));

    return {
      trainKey: train.key,
      status: 'ok',
      degraded: false,
      stopName: placed.stop.station.name,
      f,
      down: to > from,
      beside,
      position: findPosition(d.spine, placed.stop),
      leg,
      checks: [
        endsCheck,
        branchCheck,
        check(
          'f within its expected range',
          fOk,
          fOk ? undefined : `f is ${f}, expected between ${F_MIN} and ${F_MAX}`
        ),
        check(
          'beside is non-zero only on a beside detour',
          besideOk,
          besideOk
            ? undefined
            : `beside is ${beside} at ${placed.stop.station.name}, which is not on a beside detour`
        )
      ]
    };
  });

  // the audit's numbers must be markers' own numbers, item for item; a divergence is a hard
  // failure, whereas a degradation's explanatory check is not
  let consistent = true;
  for (const audit of trainAudits) {
    const marker = markerByKey.get(audit.trainKey);
    if (!marker) continue;
    if (audit.stopName !== marker.stop.station.name) {
      consistent = false;
      audit.checks.push(
        check(
          'reported stop matches markers',
          false,
          `audit says ${audit.stopName}, markers says ${marker.stop.station.name}`
        )
      );
    } else if (
      audit.f !== marker.f ||
      audit.down !== marker.down ||
      audit.beside !== marker.beside
    ) {
      consistent = false;
      audit.checks.push(
        check('reported f, down and beside match markers', false, 'the values diverge from markers')
      );
    } else audit.checks.push(check('reported placement matches markers', true));
  }

  const failed = trainAudits.filter((audit) => audit.status === 'failed').length;
  return {
    line,
    t,
    trains: trainAudits,
    // degraded trains are not failures; only unplaceable trains or a divergence from markers are
    passed: failed === 0 && consistent,
    failed,
    degradedCount: trainAudits.filter((audit) => audit.degraded).length
  };
}
