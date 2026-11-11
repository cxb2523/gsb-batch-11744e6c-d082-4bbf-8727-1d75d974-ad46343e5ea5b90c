import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, Group } from 'three';
import { createWoven } from '../src/woven/index.ts';
import {
  COARSE_BUDGET, DEFAULT_BUDGET, DEFAULT_WIDTH, PALETTE, computeUPixel, diagnoseWoven, resolveBudget,
} from '../src/woven/diagnose.ts';
import { THREAD_COLORS } from '../src/chapter/data.ts';

/** Local sample routes on the planet shell (radius 14); no network, no GPU. */
function routePoints(count: number, phase = 0): number[] {
  const p: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = phase + i * 0.01;
    p.push(14 * Math.cos(a), 0.5 * Math.sin(i * 0.3 + phase), 14 * Math.sin(a));
  }
  return p;
}

test('palette stays in sync with THREAD_COLORS (diagnose.ts is dependency-free, so it re-declares it)', () => {
  assert.deepEqual([...PALETTE], [...Object.values(THREAD_COLORS), '#fff1d6']);
});

test('normal path: per-route vertices/quads/colors match createWoven geometry exactly', () => {
  const travelers = [
    { c: 0, p: routePoints(5) },
    { c: 3, p: routePoints(4, 1) },
    { c: 8, p: routePoints(6, 2) }, // 8 % 6 = 2
  ];
  const woven = createWoven(travelers, { width: 0.03, lift: 0.01 });
  const diag = diagnoseWoven({ travelers, width: 0.03, lift: 0.01 });

  assert.equal(diag.ok, true, JSON.stringify(diag.checks));
  // totals vs actual geometry
  assert.equal(diag.totals.vertices, woven.mesh.geometry.getAttribute('position').count);
  assert.equal(diag.totals.quads * 6, woven.mesh.geometry.getIndex()!.count);
  assert.equal(diag.totals.points, 15);
  // per-route counts: vertices = n*2, quads = n-1
  assert.deepEqual(diag.routes.map(r => r.points), [5, 4, 6]);
  assert.deepEqual(diag.routes.map(r => r.vertices), [10, 8, 12]);
  assert.deepEqual(diag.routes.map(r => r.quads), [4, 3, 5]);
  assert.ok(diag.routes.every(r => r.adopted && r.ribbonable));
  // palette modulo colors
  assert.deepEqual(diag.routes.map(r => r.color), [PALETTE[0], PALETTE[3], PALETTE[2]]);
  // ...and they equal the colors actually baked into the geometry, route by route
  const colorAttr = woven.mesh.geometry.getAttribute('aColor');
  let offset = 0;
  travelers.forEach((t, k) => {
    const expected = new Color(PALETTE[t.c % PALETTE.length]);
    for (const dv of [0, 1]) { // both sides of the first point of this route
      assert.ok(Math.abs(colorAttr.getX(offset + dv) - expected.r) < 1e-6, `route ${k} r`);
      assert.ok(Math.abs(colorAttr.getY(offset + dv) - expected.g) < 1e-6, `route ${k} g`);
      assert.ok(Math.abs(colorAttr.getZ(offset + dv) - expected.b) < 1e-6, `route ${k} b`);
    }
    offset += (t.p.length / 3) * 2;
  });
  // material snapshot
  assert.equal(diag.material.width, 0.03);
  assert.equal(diag.material.lift, 0.01);
});

test('color modulo: negative and oversized indices follow JS % semantics and are annotated', () => {
  const diag = diagnoseWoven({
    travelers: [{ c: -2, points: 4 }, { c: 100, points: 4 }, { c: 1.5, points: 4 }],
    budget: null,
  });
  const [neg, big, frac] = diag.routes;
  assert.equal(neg.paletteIndex, -2); // JS keeps the sign, matching PALETTE[t.c % len]
  assert.equal(neg.color, null); // PALETTE[-2] is undefined in the real renderer too
  assert.ok(neg.notes.some(n => n.includes('负索引')));
  assert.equal(big.paletteIndex, 100 % PALETTE.length);
  assert.equal(big.color, PALETTE[100 % PALETTE.length]);
  assert.equal(frac.color, null);
  assert.ok(frac.notes.some(n => n.includes('不是整数')));
  const colors = diag.checks.find(c => c.name === 'colors.resolvable')!;
  assert.equal(colors.pass, false);
  assert.ok(colors.reason!.includes('0'));
});

test('budget truncation reproduces main.ts accumulation order exactly', () => {
  const travelers = [
    { c: 0, points: 10 },
    { c: 1, points: 20 },
    { c: 2, points: 15 }, // 10+20+15 = 45 > 35 -> this one breaks the loop
    { c: 3, points: 5 },  // never considered after the break
  ];
  // Independent re-implementation of the main.ts loop:
  //   points += thread.p.length / 3; if (points > budget) break; shown.push(thread);
  const shown: number[] = [];
  let points = 0;
  for (const t of travelers) { points += t.points; if (points > 35) break; shown.push(t.points); }

  const diag = diagnoseWoven({ travelers, budget: 35 });
  assert.deepEqual(diag.routes.filter(r => r.adopted).map(r => r.points), shown);
  assert.equal(diag.totals.points, shown.reduce((a, b) => a + b, 0));
  assert.equal(diag.routes[2].status, 'truncated');
  assert.equal(diag.routes[2].adopted, false);
  assert.match(diag.routes[2].reason!, /超过预算 35/);
  assert.equal(diag.routes[3].status, 'skipped');
  assert.match(diag.routes[3].reason!, /未被考虑/);
  assert.equal(diag.totals.truncated, 1);
  assert.equal(diag.totals.skipped, 1);
  const fits = diag.checks.find(c => c.name === 'budget.fits-all-routes')!;
  assert.equal(fits.pass, false);
  assert.match(fits.reason!, /2 条路线未被采纳/);
});

test('device budget follows main.ts: coarse pointer or low memory gets the small budget', () => {
  assert.deepEqual(resolveBudget({}), { value: DEFAULT_BUDGET, source: 'device' });
  assert.deepEqual(resolveBudget({ coarsePointer: true }), { value: COARSE_BUDGET, source: 'device' });
  assert.deepEqual(resolveBudget({ lowMemory: 4 }), { value: COARSE_BUDGET, source: 'device' });
  assert.deepEqual(resolveBudget({ lowMemory: 8 }), { value: DEFAULT_BUDGET, source: 'device' });
  assert.deepEqual(resolveBudget({ budget: 7 }), { value: 7, source: 'explicit' });
  assert.deepEqual(resolveBudget({ budget: null }), { value: null, source: 'none' });

  const big = [{ c: 0, points: COARSE_BUDGET + 1 }];
  const diag = diagnoseWoven({ travelers: big, coarsePointer: true });
  assert.equal(diag.budget.value, COARSE_BUDGET);
  assert.equal(diag.routes[0].status, 'truncated');
  assert.equal(diagnoseWoven({ travelers: big }).routes[0].status, 'adopted');
});

test('edge cases degrade with readable reasons instead of throwing', () => {
  // empty traveler list
  const empty = diagnoseWoven({ travelers: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.totals.travelers, 0);
  const emptyCheck = empty.checks.find(c => c.name === 'travelers.non-empty')!;
  assert.equal(emptyCheck.pass, false);
  assert.ok(emptyCheck.reason!.length > 0);

  // single-point route: no negative quads, flagged as not ribbonable
  const single = diagnoseWoven({ travelers: [{ c: 0, p: routePoints(1) }], budget: null });
  assert.equal(single.routes[0].points, 1);
  assert.equal(single.routes[0].vertices, 2);
  assert.equal(single.routes[0].quads, 0);
  assert.equal(single.routes[0].ribbonable, false);
  assert.ok(single.routes[0].notes.some(n => n.includes('不可成带')));
  assert.equal(single.checks.find(c => c.name === 'routes.ribbonable')!.pass, false);

  // zero-point route: also no negative quads, no exception
  const zero = diagnoseWoven({ travelers: [{ c: 0, p: [] }], budget: null });
  assert.equal(zero.routes[0].quads, 0);
  assert.ok(zero.routes[0].notes.some(n => n.includes('不可成带')));

  // budget 0: everything truncated, readable reason
  const broke = diagnoseWoven({ travelers: [{ c: 0, points: 3 }], budget: 0 });
  assert.equal(broke.routes[0].status, 'truncated');
  assert.equal(broke.totals.adopted, 0);
  assert.match(broke.checks.find(c => c.name === 'budget.available')!.reason!, /预算为 0/);

  // negative width / lift
  const badOptions = diagnoseWoven({ travelers: [{ c: 0, points: 3 }], width: -0.5, lift: -1, budget: null });
  assert.equal(badOptions.ok, false);
  assert.ok(badOptions.checks.find(c => c.name === 'options.width')!.reason!.includes('-0.5'));
  assert.ok(badOptions.checks.find(c => c.name === 'options.lift')!.reason!.includes('-1'));

  // no input at all
  assert.doesNotThrow(() => diagnoseWoven());
});

test('camera uPixel: given directly or computed with the update() formula', () => {
  assert.equal(computeUPixel(45, 800), 2 * Math.tan(45 * Math.PI / 360) / 800);
  const diag = diagnoseWoven({ travelers: [{ c: 0, points: 3 }], budget: null, camera: { fov: 45, viewportHeight: 800 } });
  assert.ok(Math.abs(diag.material.uPixel! - computeUPixel(45, 800)) < 1e-12);
  assert.equal(diag.checks.find(c => c.name === 'camera.u-pixel')!.pass, true);
  const direct = diagnoseWoven({ travelers: [{ c: 0, points: 3 }], budget: null, camera: { uPixel: 0.002 } });
  assert.equal(direct.material.uPixel, 0.002);
});

test('diagnosis is JSON-serializable and survives a round trip unchanged', () => {
  const diag = diagnoseWoven({
    travelers: [{ c: 0, p: routePoints(5) }, { c: -1, points: 1 }, { c: 2, points: 30 }],
    width: DEFAULT_WIDTH, lift: 0, budget: 20, coarsePointer: true, lowMemory: 2,
    camera: { fov: 50, viewportHeight: 600 },
  });
  const round = JSON.parse(JSON.stringify(diag));
  assert.deepEqual(round, diag);
});

test('audit() reads live geometry and uniforms; degrades once the mesh is removed', () => {
  const travelers = [{ c: 1, p: routePoints(4) }, { c: 4, p: routePoints(7, 3) }];
  const woven = createWoven(travelers, { width: 0.05, lift: 0.02 });

  // not yet in a scene: undiagnosable, but no exception
  const orphan = woven.audit();
  assert.equal(orphan.ok, false);
  assert.equal(orphan.checks[0].name, 'auditable');
  assert.match(orphan.checks[0].reason!, /不在场景中|缺失/);

  const group = new Group();
  group.add(woven.mesh);
  const audit = woven.audit();
  assert.equal(audit.ok, true, JSON.stringify(audit.checks));
  assert.equal(audit.totals.vertices, woven.mesh.geometry.getAttribute('position').count);
  assert.equal(audit.totals.indices, woven.mesh.geometry.getIndex()!.count);
  assert.equal(audit.material.width, 0.05);
  assert.equal(audit.material.lift, 0.02);
  assert.deepEqual(audit.routes.map(r => r.color), [PALETTE[1], PALETTE[4]]);
  assert.ok(audit.checks.some(c => c.name === 'counts.match-actual' && c.pass));
  assert.doesNotThrow(() => JSON.stringify(audit));

  // removed from the scene: undiagnosable again, still no exception
  woven.mesh.removeFromParent();
  const gone = woven.audit();
  assert.equal(gone.ok, false);
  assert.equal(gone.checks[0].name, 'auditable');
  assert.doesNotThrow(() => JSON.stringify(gone));
});
