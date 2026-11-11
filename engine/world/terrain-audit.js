// Terrain generation audit: replays a pure-data snapshot of island and tree
// settings through the real buildIsland/buildTrees into an in-memory block
// recorder, checks the result, and reports plain JSON-safe data. No three,
// no window/document, no disk: it runs anywhere JavaScript runs.
//
//   const report = auditTerrain({
//     bounds: { x0: -16, x1: 16, z0: -16, z1: 16 },
//     seed: 11, depth: 17, round: true, bays: 2, corner: 0, wobble: 1,
//     surface: { default: 'grass', rules: [{ maxEdge: 2.5, block: 'sand' }] },
//     trees: [[3, 4, 5, 2, 'leaves']],
//     occupied: [{ x: 3, y: 1, z: 4, block: 'concrete' }],
//   });
//
// `surface` is the data form of buildIsland's surfaceAt: a block name, or
// { default, rules } where the first rule whose [minEdge, maxEdge) window
// holds the column's edge wins. `trees` entries are [x, z, height, crown
// radius, leaf block] arrays or { x, z, height, size, leaves } objects.
// `occupied` lists blocks the world already has (buildings); trees must not
// grow into them. Missing options take buildIsland's defaults, so a snapshot
// audits exactly what buildIsland would do with the same partial options.
//
// The snapshot is never mutated. The report is plain data: no functions, no
// TypedArrays, no class instances, safe for JSON.stringify.
import { valueNoise, buildIsland, buildTrees } from './terrain.js';
import { rng } from './prng.js';

// An in-memory block grid with the set/get semantics buildIsland and
// buildTrees expect. With `log: true` every get/set is recorded, so the
// audit can prove the real terrain builders wrote exactly what its own
// recomputation predicted. The recorder itself never leaves the module.
export function createBlockRecorder({ log = false } = {}) {
  const blocks = new Map(), events = [];
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    get(x, y, z) {
      const block = blocks.get(key(x, y, z));
      if (log) events.push({ op: 'get', x, y, z, block: block === undefined ? null : block });
      return block;
    },
    set(x, y, z, block) {
      blocks.set(key(x, y, z), block);
      if (log) events.push({ op: 'set', x, y, z, block });
    },
    has(x, y, z) { return blocks.has(key(x, y, z)); },
    events,
    entries() {
      return [...blocks].map(([k, block]) => {
        const [x, y, z] = k.split(',').map(Number);
        return { x, y, z, block };
      });
    },
    // A non-logging copy of the current state, for replaying tree growth.
    clone() {
      const copy = createBlockRecorder();
      for (const e of this.entries()) copy.set(e.x, e.y, e.z, e.block);
      return copy;
    },
  };
}

// The data form of surfaceAt: a block name, or { default, rules } with rules
// like { maxEdge: 2.5, block: 'sand' } / { minEdge: 4, block: 'stone' }.
export function surfaceAtFromSnapshot(surface) {
  if (surface == null) return () => 'grass';
  if (typeof surface === 'string') return () => surface;
  const fallback = typeof surface.default === 'string' ? surface.default : 'grass';
  const rules = Array.isArray(surface.rules) ? surface.rules.filter(r => r && typeof r.block === 'string') : [];
  return (x, z, edge) => {
    for (const rule of rules) {
      if (rule.minEdge !== undefined && !(edge >= rule.minEdge)) continue;
      if (rule.maxEdge !== undefined && !(edge < rule.maxEdge)) continue;
      return rule.block;
    }
    return fallback;
  };
}

// Tree spots as [x, z, height, crown radius, leaf block] arrays, with the
// same defaults buildTrees applies to missing entries.
function normalizeSpots(trees) {
  if (!Array.isArray(trees)) return [];
  const spots = [];
  for (const t of trees) {
    if (Array.isArray(t)) {
      spots.push([t[0], t[1], t[2] === undefined ? 5 : t[2], t[3] === undefined ? 2 : t[3], t[4] === undefined ? 'leaves' : t[4]]);
    } else if (t && typeof t === 'object') {
      const h = t.height !== undefined ? t.height : t.h !== undefined ? t.h : 5;
      const size = t.size !== undefined ? t.size : t.crownRadius !== undefined ? t.crownRadius : 2;
      const leaves = t.leaves !== undefined ? t.leaves : 'leaves';
      spots.push([t.x, t.z, h, size, leaves]);
    }
  }
  return spots;
}

// The same coast and column arithmetic buildIsland runs, kept line-for-line
// in sync so the audit can state every column's edge, thickness and bottom
// and predict every block buildIsland sets. Any drift is caught at runtime
// by the 'island recorder matches recomputation' check.
function computeIsland(bounds, opts, surfaceAt) {
  const { seed, depth, round, bays, corner, wobble } = opts;
  const edgeNoise = valueNoise(seed), depthNoise = valueNoise(seed + 12), bayNoise = valueNoise(seed + 31);
  const W = bounds.x1 - bounds.x0, D = bounds.z1 - bounds.z0;
  const cx = (bounds.x0 + bounds.x1 - 1) / 2, cz = (bounds.z0 + bounds.z1 - 1) / 2;
  const rx = W / 2 - bays - 5, rz = D / 2 - bays - 5;
  const edges = new Float32Array(W * D);
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) {
    const x = bounds.x0 + i, z = bounds.z0 + j, box = Math.min(i, W - 1 - i, j, D - 1 - j);
    let d = box;
    if (corner) {
      const qx = Math.abs(x - cx) - ((W - 1) / 2 - corner), qz = Math.abs(z - cz) - ((D - 1) / 2 - corner);
      d = corner - Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - Math.min(Math.max(qx, qz), 0);
    }
    if (round) {
      const nx = (x - cx) / rx, nz = (z - cz) / rz, r = Math.hypot(nx, nz) || 1e-6;
      d = Math.min(box, (1 - r) * r / Math.hypot(nx / rx, nz / rz));
    }
    const inset = corner ? (3.5 + 0.75 * wobble) * wobble : 0;
    const edge = d - inset + ((edgeNoise(x * 0.13, z * 0.13) - 0.5) * 7 + (edgeNoise(x * 0.5 + 40, z * 0.5) - 0.5) * 1.5 * wobble) * wobble
      + (bays ? (bayNoise(x * 0.045, z * 0.045) - 0.5) * 2 * bays : 0);
    edges[i + j * W] = round ? Math.min(box, edge) : edge;
  }
  let removedLand = 0, filledSea = 0;
  if (round) {
    const reach = (start, keep) => {
      const seen = new Uint8Array(W * D), queue = start.filter(k => keep(k));
      for (const k of queue) seen[k] = 1;
      while (queue.length) {
        const k = queue.pop(), i = k % W, j = (k - i) / W;
        for (const n of [i > 0 && k - 1, i < W - 1 && k + 1, j > 0 && k - W, j < D - 1 && k + W]) {
          if (n !== false && !seen[n] && keep(n)) { seen[n] = 1; queue.push(n); }
        }
      }
      return seen;
    };
    const land = k => edges[k] >= 0.5;
    const island = reach([Math.floor(W / 2) + Math.floor(D / 2) * W], land);
    for (let k = 0; k < edges.length; k++) if (land(k) && !island[k]) { edges[k] = 0; removedLand++; }
    const border = [];
    for (let i = 0; i < W; i++) border.push(i, i + (D - 1) * W);
    for (let j = 0; j < D; j++) border.push(j * W, W - 1 + j * W);
    const sea = reach(border, k => !land(k));
    for (let k = 0; k < edges.length; k++) if (!land(k) && !sea[k]) { edges[k] = 1; filledSea++; }
  }
  const columns = [], sets = [];
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) {
    const edge = edges[i + j * W];
    const x = bounds.x0 + i, z = bounds.z0 + j;
    if (edge < 0.5) {
      columns.push({ x, z, edge, thickness: null, bottom: null, surface: null, land: false });
      continue;
    }
    const thickness = Math.min(depth, 2 + Math.pow(edge, 0.85) * 1.1 + depthNoise(x * 0.18, z * 0.18) * 4);
    const bottom = -Math.round(thickness) - 1;
    const surface = surfaceAt(x, z, edge);
    columns.push({ x, z, edge, thickness, bottom, surface, land: true });
    for (let y = bottom; y < 0; y++) {
      let block = 'stone';
      if (y === -1) block = surface;
      else if (y >= -3 - Math.round(depthNoise(x * 0.3, z * 0.3) * 2)) block = 'dirt';
      else if (y <= bottom + 1 + Math.round(depthNoise(x * 0.4 + 9, z * 0.4) * 2)) block = 'deepslate';
      sets.push({ x, y, z, block });
    }
  }
  return { columns, sets, removedLand, filledSea, edges, W, D };
}

// The same growth buildTrees runs, replayed on a clone of the recorder so
// the audit can report each tree and predict the exact get/set sequence the
// real buildTrees will make. Drift is caught by the 'trees recorder matches
// recomputation' check.
function simulateTrees(grid, spots) {
  const r = rng(77);
  const trees = [], events = [];
  const get = (x, y, z) => {
    const block = grid.get(x, y, z);
    events.push({ op: 'get', x, y, z, block: block === undefined ? null : block });
    return block;
  };
  const set = (x, y, z, block) => {
    grid.set(x, y, z, block);
    events.push({ op: 'set', x, y, z, block });
  };
  for (const [x, z, h, size, leaves] of spots) {
    const tree = { x, z, trunkHeight: h, crownRadius: size, leaves, skippedLeaves: 0, trunk: [], crown: [] };
    for (let y = 0; y < h; y++) { set(x, y, z, 'log'); tree.trunk.push({ x, y, z }); }
    for (let dy = -1; dy <= size; dy++) {
      const rad = dy === size ? size - 1 : dy === -1 ? size - 0.5 : size;
      for (let dx = -size; dx <= size; dx++) for (let dz = -size; dz <= size; dz++) {
        const dist = Math.hypot(dx, dz);
        if (dist > rad + 0.35) continue;
        if (dist > rad - 0.6 && r() < 0.35) continue;
        const y = h - 1 + dy;
        if (dx === 0 && dz === 0 && y < h) continue;
        if (get(x + dx, y, z + dz)) { tree.skippedLeaves++; tree.crown.push({ x: x + dx, y, z: z + dz }); continue; }
        set(x + dx, y, z + dz, leaves);
        tree.crown.push({ x: x + dx, y, z: z + dz });
      }
    }
    trees.push(tree);
  }
  return { trees, events };
}

const sameBlock = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z && a.block === b.block;

function sameEvents(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].op !== b[i].op || !sameBlock(a[i], b[i])) return false;
  }
  return true;
}

// Every land cell reachable from the centre cell, counted. Used by the
// round-island connectivity check.
function connectedFromCentre(edges, W, D) {
  const land = k => edges[k] >= 0.5;
  let total = 0;
  for (let k = 0; k < edges.length; k++) if (land(k)) total++;
  const start = Math.floor(W / 2) + Math.floor(D / 2) * W;
  const seen = new Uint8Array(W * D), queue = land(start) ? [start] : [];
  for (const k of queue) seen[k] = 1;
  while (queue.length) {
    const k = queue.pop(), i = k % W, j = (k - i) / W;
    for (const n of [i > 0 && k - 1, i < W - 1 && k + 1, j > 0 && k - W, j < D - 1 && k + W]) {
      if (n !== false && !seen[n] && land(n)) { seen[n] = 1; queue.push(n); }
    }
  }
  let reached = 0;
  for (let k = 0; k < seen.length; k++) reached += seen[k];
  return { total, reached };
}

const finite = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const describe = v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : JSON.stringify(v) ?? String(v));

// Audit one terrain snapshot. Returns a plain-data report; never throws on
// bad input, never mutates the snapshot.
export function auditTerrain(snapshot = {}) {
  const src = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const bounds = src.bounds && typeof src.bounds === 'object' ? src.bounds : {};
  const surface = src.surface !== undefined ? src.surface : src.surfaceAt;
  const opts = {
    seed: src.seed === undefined ? 11 : src.seed,
    depth: src.depth === undefined ? 17 : src.depth,
    round: src.round === undefined ? false : Boolean(src.round),
    bays: src.bays === undefined ? 0 : src.bays,
    corner: src.corner === undefined ? 0 : src.corner,
    wobble: src.wobble === undefined ? 1 : src.wobble,
  };
  const W = bounds.x1 - bounds.x0, D = bounds.z1 - bounds.z0;

  const issues = [];
  if (![bounds.x0, bounds.x1, bounds.z0, bounds.z1].every(v => typeof v === 'number' && Number.isFinite(v))) {
    issues.push({ field: 'bounds', reason: 'bounds must be finite numbers { x0, x1, z0, z1 }' });
  } else if (W < 1 || D < 1) {
    issues.push({ field: 'bounds', reason: `bounds must be at least 1x1 (got ${W}x${D})` });
  }
  if (!(typeof opts.depth === 'number' && Number.isFinite(opts.depth)) || opts.depth <= 0) {
    issues.push({ field: 'depth', reason: `depth must be a positive finite number (got ${describe(opts.depth)})` });
  }
  if (!(typeof opts.seed === 'number' && Number.isFinite(opts.seed))) {
    issues.push({ field: 'seed', reason: `seed must be a finite number (got ${describe(opts.seed)})` });
  }

  const checks = [];
  const addCheck = (name, pass, reason = null) => checks.push({ name, pass, reason });
  addCheck('bounds at least 1x1', !issues.some(i => i.field === 'bounds'), issues.find(i => i.field === 'bounds')?.reason ?? null);
  addCheck('depth positive', !issues.some(i => i.field === 'depth'), issues.find(i => i.field === 'depth')?.reason ?? null);
  addCheck('seed finite', !issues.some(i => i.field === 'seed'), issues.find(i => i.field === 'seed')?.reason ?? null);

  const laterCheckNames = [
    'island recorder matches recomputation',
    'land bottoms below zero, thickness within depth',
    'surface blocks match surfaceAt',
    ...(opts.round ? ['land connected from island centre'] : []),
    'trees recorder matches recomputation',
    'trees clear of occupied blocks',
    'tree trunks continuous from y=0',
  ];

  const echo = {
    bounds: { x0: finite(bounds.x0), x1: finite(bounds.x1), z0: finite(bounds.z0), z1: finite(bounds.z1) },
    options: {
      seed: finite(opts.seed), depth: finite(opts.depth), round: opts.round,
      bays: finite(opts.bays), corner: finite(opts.corner), wobble: finite(opts.wobble),
    },
  };

  if (issues.length) {
    for (const name of laterCheckNames) addCheck(name, false, `not run: ${issues[0].reason}`);
    return {
      ok: false, degraded: true, issues, ...echo,
      columns: [], landColumns: 0,
      totalColumns: Number.isFinite(W) && Number.isFinite(D) && W >= 1 && D >= 1 ? W * D : 0,
      thickness: { min: null, max: null }, roundCleanup: null, trees: [], checks,
    };
  }

  const surfaceAt = surfaceAtFromSnapshot(surface);
  const recorder = createBlockRecorder({ log: true });

  // Island: recompute, then run the real buildIsland and compare.
  const island = computeIsland(bounds, opts, surfaceAt);
  buildIsland(recorder, bounds, { surfaceAt, ...opts });
  const islandEvents = recorder.events.slice();
  const islandMatch = islandEvents.every(e => e.op === 'set')
    && islandEvents.length === island.sets.length
    && islandEvents.every((e, i) => sameBlock(e, island.sets[i]));
  addCheck('island recorder matches recomputation', islandMatch,
    islandMatch ? null : 'buildIsland wrote blocks the audit did not predict');

  // Existing world blocks (buildings) the trees must grow around.
  const occupied = Array.isArray(src.occupied) ? src.occupied : [];
  const occupiedCells = new Set();
  for (const o of occupied) {
    if (!o || ![o.x, o.y, o.z].every(v => typeof v === 'number' && Number.isFinite(v))) continue;
    recorder.set(o.x, o.y, o.z, typeof o.block === 'string' ? o.block : 'occupied');
    occupiedCells.add(`${o.x},${o.y},${o.z}`);
  }

  // Trees: replay on a clone, then run the real buildTrees and compare.
  const spots = normalizeSpots(src.trees);
  const sim = simulateTrees(recorder.clone(), spots);
  const treeMark = recorder.events.length;
  buildTrees(recorder, spots);
  const treeEvents = recorder.events.slice(treeMark);
  const treesMatch = sameEvents(treeEvents, sim.events);

  const badBottom = island.columns.find(c => c.land && !(c.bottom < 0 && c.thickness <= opts.depth));
  addCheck('land bottoms below zero, thickness within depth', !badBottom,
    badBottom ? `column (${badBottom.x},${badBottom.z}): bottom ${badBottom.bottom}, thickness ${badBottom.thickness}, depth ${opts.depth}` : null);

  const badSurface = island.columns.find(c => c.land && recorder.get(c.x, -1, c.z) !== c.surface);
  addCheck('surface blocks match surfaceAt', !badSurface,
    badSurface ? `column (${badSurface.x},${badSurface.z}): surface is ${JSON.stringify(recorder.get(badSurface.x, -1, badSurface.z)) ?? 'missing'}, expected ${JSON.stringify(badSurface.surface)}` : null);

  if (opts.round) {
    const { total, reached } = connectedFromCentre(island.edges, island.W, island.D);
    const pass = total === reached;
    addCheck('land connected from island centre', pass,
      pass ? null : `${total - reached} of ${total} land cells are not reachable from the island centre`);
  }

  addCheck('trees recorder matches recomputation', treesMatch,
    treesMatch ? null : 'buildTrees did not match the audit replay');

  const overlaps = [];
  sim.trees.forEach((tree, index) => {
    for (const cell of [...tree.trunk, ...tree.crown]) {
      if (occupiedCells.has(`${cell.x},${cell.y},${cell.z}`)) overlaps.push({ index, tree, cell });
    }
  });
  addCheck('trees clear of occupied blocks', overlaps.length === 0,
    overlaps.length ? overlaps.slice(0, 3).map(o => `tree ${o.index} at (${o.tree.x},${o.tree.z}) overlaps occupied block (${o.cell.x},${o.cell.y},${o.cell.z})`).join('; ') : null);

  const gap = sim.trees.map((tree, index) => {
    for (let y = 0; y < tree.trunkHeight; y++) {
      if (recorder.get(tree.x, y, tree.z) !== 'log') return { index, tree, y };
    }
    return null;
  }).find(Boolean);
  addCheck('tree trunks continuous from y=0', !gap,
    gap ? `tree ${gap.index} at (${gap.tree.x},${gap.tree.z}): trunk broken at y=${gap.y}` : null);

  const landColumns = island.columns.filter(c => c.land);
  let minThickness = null, maxThickness = null;
  for (const c of landColumns) {
    if (minThickness === null || c.thickness < minThickness) minThickness = c.thickness;
    if (maxThickness === null || c.thickness > maxThickness) maxThickness = c.thickness;
  }

  return {
    ok: checks.every(c => c.pass), degraded: false, issues: [], ...echo,
    columns: island.columns,
    landColumns: landColumns.length,
    totalColumns: island.W * island.D,
    thickness: { min: minThickness, max: maxThickness },
    roundCleanup: opts.round ? { removedLand: island.removedLand, filledSea: island.filledSea } : null,
    trees: sim.trees.map(t => ({
      x: t.x, z: t.z, trunkHeight: t.trunkHeight, crownRadius: t.crownRadius,
      leaves: t.leaves, skippedLeaves: t.skippedLeaves,
    })),
    checks,
  };
}
