// Tests for engine/world/terrain-audit.js: the audit must replay the real
// buildIsland/buildTrees exactly, flag trees growing into occupied blocks,
// degrade gracefully on bad input, and stay JSON-serializable. Local sample
// data only: no network, no credentials, no GPU.
//
//   node --test tools/terrain-audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTerrain, createBlockRecorder } from '../engine/world/terrain-audit.js';
import { buildIsland, buildTrees } from '../engine/world/terrain.js';

// The good-path island: round, with bays and a custom surface rule (sand
// near the coast, grass inland).
const goodSnapshot = () => ({
  bounds: { x0: -14, x1: 14, z0: -12, z1: 12 },
  seed: 11,
  depth: 12,
  round: true,
  bays: 3,
  corner: 0,
  wobble: 1,
  surface: { default: 'grass', rules: [{ maxEdge: 2.5, block: 'sand' }] },
  trees: [[-5, -4, 5, 2, 'leaves'], [6, 5, 4, 2, 'leaves'], [0, 1, 6, 3, 'leaves']],
  occupied: [{ x: 100, y: 0, z: 100, block: 'concrete' }],
});

// Run the real terrain builders directly, the way a world would.
function directRun(snapshot) {
  const surfaceAt = (x, z, edge) => (edge < 2.5 ? 'sand' : 'grass');
  const grid = createBlockRecorder({ log: true });
  buildIsland(grid, snapshot.bounds, {
    surfaceAt,
    seed: snapshot.seed,
    depth: snapshot.depth,
    round: snapshot.round,
    bays: snapshot.bays,
    corner: snapshot.corner,
    wobble: snapshot.wobble,
  });
  for (const o of snapshot.occupied) grid.set(o.x, o.y, o.z, o.block);
  const treeMark = grid.events.length;
  buildTrees(grid, snapshot.trees);
  return { grid, treeEvents: grid.events.slice(treeMark) };
}

// Per-tree skipped-leaf counts from a direct buildTrees run's event log:
// each tree emits its trunk's log sets, then its crown's get/set events.
function skippedLeavesPerTree(events, spots) {
  const counts = [];
  let i = 0;
  for (const spot of spots) {
    const h = spot[2] === undefined ? 5 : spot[2];
    for (let logs = 0; logs < h; logs++, i++) {
      assert.equal(events[i].op, 'set');
      assert.equal(events[i].block, 'log');
    }
    let skipped = 0;
    while (i < events.length && !(events[i].op === 'set' && events[i].block === 'log')) {
      if (events[i].op === 'get' && events[i].block !== null) skipped++;
      i++;
    }
    counts.push(skipped);
  }
  assert.equal(i, events.length);
  return counts;
}

test('round island with bays and custom surface: audit matches direct buildIsland/buildTrees and all checks pass', () => {
  const snapshot = goodSnapshot();
  const before = JSON.stringify(snapshot);
  const report = auditTerrain(snapshot);
  const { grid, treeEvents } = directRun(snapshot);

  // Every check passes.
  assert.equal(report.degraded, false);
  assert.deepEqual(report.issues, []);
  assert.ok(report.checks.length >= 9);
  for (const check of report.checks) {
    assert.equal(check.pass, true, `check failed: ${check.name}: ${check.reason}`);
    assert.equal(check.reason, null);
  }
  assert.equal(report.ok, true);

  // Column counts.
  assert.equal(report.totalColumns, 28 * 24);
  assert.equal(report.columns.length, report.totalColumns);
  assert.ok(report.landColumns > 0);
  assert.equal(report.columns.filter(c => c.land).length, report.landColumns);

  // Each column matches what buildIsland wrote into the same kind of recorder.
  for (const col of report.columns) {
    const surfaceBlock = grid.get(col.x, -1, col.z);
    assert.equal(col.land, surfaceBlock !== undefined, `land mismatch at (${col.x},${col.z})`);
    assert.equal(typeof col.edge, 'number');
    if (!col.land) {
      assert.equal(col.thickness, null);
      assert.equal(col.bottom, null);
      assert.equal(col.surface, null);
      continue;
    }
    assert.equal(col.surface, surfaceBlock, `surface mismatch at (${col.x},${col.z})`);
    let lowest = -1;
    while (grid.has(col.x, lowest - 1, col.z)) lowest--;
    assert.equal(col.bottom, lowest, `bottom mismatch at (${col.x},${col.z})`);
    assert.equal(Math.round(col.thickness) + 1, -col.bottom, `thickness mismatch at (${col.x},${col.z})`);
    assert.ok(col.bottom < 0);
    assert.ok(col.thickness <= snapshot.depth);
  }

  // Thickness distribution bounds bracket every land column.
  const thicknesses = report.columns.filter(c => c.land).map(c => c.thickness);
  assert.ok(report.thickness.min <= Math.min(...thicknesses) + 1e-12);
  assert.ok(report.thickness.max >= Math.max(...thicknesses) - 1e-12);
  assert.equal(report.thickness.min, Math.min(...thicknesses));
  assert.equal(report.thickness.max, Math.max(...thicknesses));

  // Round-island cleanup counts are plain non-negative integers.
  assert.ok(report.roundCleanup);
  assert.ok(Number.isInteger(report.roundCleanup.removedLand) && report.roundCleanup.removedLand >= 0);
  assert.ok(Number.isInteger(report.roundCleanup.filledSea) && report.roundCleanup.filledSea >= 0);

  // Trees: spots and per-tree skipped-leaf counts match the direct run.
  assert.equal(report.trees.length, snapshot.trees.length);
  const skipped = skippedLeavesPerTree(treeEvents, snapshot.trees);
  report.trees.forEach((tree, i) => {
    const [x, z, h, size, leaves] = snapshot.trees[i];
    assert.equal(tree.x, x);
    assert.equal(tree.z, z);
    assert.equal(tree.trunkHeight, h);
    assert.equal(tree.crownRadius, size);
    assert.equal(tree.leaves, leaves);
    assert.equal(tree.skippedLeaves, skipped[i], `skipped-leaf count mismatch for tree ${i}`);
  });

  // Deterministic: a second audit of the same snapshot is identical.
  assert.deepEqual(auditTerrain(snapshot), report);

  // The snapshot was not mutated.
  assert.equal(JSON.stringify(snapshot), before);
});

test('occupied blocks on a tree spot fail the overlap check with a readable reason', () => {
  const snapshot = {
    bounds: { x0: -10, x1: 10, z0: -10, z1: 10 },
    seed: 5,
    depth: 8,
    round: true,
    bays: 2,
    surface: 'grass',
    trees: [[0, 0, 5, 2, 'leaves']],
    occupied: [{ x: 0, y: 2, z: 0, block: 'concrete' }],
  };
  const before = JSON.stringify(snapshot);
  const report = auditTerrain(snapshot);

  assert.equal(report.ok, false);
  const overlap = report.checks.find(c => c.name === 'trees clear of occupied blocks');
  assert.equal(overlap.pass, false);
  assert.match(overlap.reason, /tree 0/);
  assert.match(overlap.reason, /\(0,2,0\)/);

  // The other checks still ran; the trunk check passes because the log
  // overwrites the occupied cell.
  const trunk = report.checks.find(c => c.name === 'tree trunks continuous from y=0');
  assert.equal(trunk.pass, true);

  assert.equal(JSON.stringify(snapshot), before);
});

test('degraded input: width-0 bounds, zero depth and NaN seed return readable results without throwing', () => {
  const cases = [
    { field: 'bounds', snapshot: { bounds: { x0: 0, x1: 0, z0: 0, z1: 8 }, seed: 3, depth: 5 } },
    { field: 'bounds', snapshot: { bounds: { x0: 0, x1: 8, z0: 4, z1: 4 }, seed: 3, depth: 5 } },
    { field: 'depth', snapshot: { bounds: { x0: 0, x1: 8, z0: 0, z1: 8 }, seed: 3, depth: 0 } },
    { field: 'seed', snapshot: { bounds: { x0: 0, x1: 8, z0: 0, z1: 8 }, seed: NaN, depth: 5 } },
  ];
  for (const { field, snapshot } of cases) {
    const report = auditTerrain(snapshot);
    assert.equal(report.degraded, true, `expected degraded result for ${field}`);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(i => i.field === field), `expected an issue naming ${field}`);
    assert.ok(report.issues.every(i => typeof i.reason === 'string' && i.reason.length > 0));
    assert.deepEqual(report.columns, []);
    assert.deepEqual(report.trees, []);
    assert.equal(report.landColumns, 0);
    assert.deepEqual(report.thickness, { min: null, max: null });
    assert.equal(report.roundCleanup, null);
    const failed = report.checks.filter(c => !c.pass);
    assert.ok(failed.length > 0, 'expected failed checks');
    assert.ok(failed.every(c => typeof c.reason === 'string' && c.reason.length > 0));
  }
});

test('audit reports are JSON-serializable plain data', () => {
  const reports = [
    auditTerrain(goodSnapshot()),
    auditTerrain({ bounds: { x0: 0, x1: 0, z0: 0, z1: 8 }, seed: 3, depth: 5 }),
    auditTerrain({ bounds: { x0: 0, x1: 8, z0: 0, z1: 8 }, seed: NaN, depth: 0 }),
  ];
  for (const report of reports) {
    const parsed = JSON.parse(JSON.stringify(report));
    assert.deepEqual(parsed, report);
  }
});
