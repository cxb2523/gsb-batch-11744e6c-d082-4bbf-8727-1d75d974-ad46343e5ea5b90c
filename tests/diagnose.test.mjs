#!/usr/bin/env node
// Local, dependency-free tests for the pure scene/night-light diagnostics module
// (skills/threejs-scene/assets/starter/diagnose.js). No network, no credentials, no GPU:
// the module imports nothing, so the tests run under plain node.
//
//   node tests/diagnose.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diagnoseScene,
  GLOW_EMISSIVE_FACTOR,
  LIGHT_VISIBLE_CUTOFF,
} from '../skills/threejs-scene/assets/starter/diagnose.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

// A snapshot shaped like buildSceneSnapshot()'s: two z=12 lamp posts with real PointLights,
// three further rows of posts without lights, the dome lantern and the pavilion parts.
function pavilionSnapshot(overrides = {}) {
  const lamps = [];
  for (const z of [12, 22, 32, 42]) {
    for (const x of [-2.2, 2.2]) {
      lamps.push({ x, z, atRowZ12: z === 12, candela: z === 12 ? 40 : null });
    }
  }
  return {
    night: 0.6,
    lamps,
    lanternCandela: 70,
    parts: [
      { name: 'lawn', geometry: 'primitive', instances: 1, castShadow: false, receiveShadow: true },
      { name: 'gravel-ring', geometry: 'sweep', instances: 1, castShadow: false, receiveShadow: true },
      { name: 'gravel-lane', geometry: 'sweep', instances: 1, castShadow: false, receiveShadow: true },
      { name: 'podium-steps', geometry: 'lathe', instances: 1, castShadow: true, receiveShadow: true },
      { name: 'column', geometry: 'instanced', instances: 12, castShadow: true, receiveShadow: true },
      { name: 'entablature', geometry: 'sweep', instances: 1, castShadow: true, receiveShadow: true },
      { name: 'dome', geometry: 'lathe', instances: 1, castShadow: true, receiveShadow: true },
      { name: 'central-urn', geometry: 'lathe', instances: 1, castShadow: true, receiveShadow: false },
      { name: 'post', geometry: 'instanced', instances: 8, castShadow: true, receiveShadow: true },
      { name: 'globe', geometry: 'instanced', instances: 8, castShadow: false, receiveShadow: true },
      { name: 'lantern-bulb', geometry: 'primitive', instances: 1, castShadow: false, receiveShadow: false },
      { name: 'trunk', geometry: 'instanced', instances: 44, castShadow: true, receiveShadow: true },
      { name: 'leaves', geometry: 'instanced', instances: 220, castShadow: true, receiveShadow: true },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------- happy path: night 0.6
test('night 0.6: glow, lights and checks follow the update(now) rules', () => {
  const r = diagnoseScene(pavilionSnapshot());

  assert.equal(r.status, 'ok');
  assert.deepEqual(r.affectedFields, []);

  // glow.emissiveIntensity = night * 3.5
  assert.equal(r.lighting.glowIntensity, 0.6 * GLOW_EMISSIVE_FACTOR);
  assert.equal(r.lighting.glowIntensity, 2.1);
  // two z=12 lamp lights plus one lantern; the six lightless posts are not lights
  assert.equal(r.lighting.lightCount, 3);
  assert.equal(r.lighting.lightVisible, true);

  const lamps = r.lighting.lights.filter((l) => l.kind === 'lamp');
  assert.equal(lamps.length, 2);
  for (const l of lamps) {
    assert.equal(l.atRowZ12, true);
    assert.equal(l.candela, 40);
    assert.equal(l.intensity, 0.6 * 40);          // night * candela
    assert.equal(l.visible, 0.6 > LIGHT_VISIBLE_CUTOFF);
  }
  assert.deepEqual([...new Set(lamps.map((l) => l.x))].sort(), [-2.2, 2.2]);
  assert.ok(lamps.every((l) => l.z === 12));

  const lantern = r.lighting.lights.find((l) => l.kind === 'lantern');
  assert.ok(lantern);
  assert.equal(lantern.candela, 70);
  assert.equal(lantern.intensity, 0.6 * 70);
  assert.equal(lantern.visible, true);

  // every check passes on a valid snapshot
  assert.ok(r.checks.length > 0);
  for (const c of r.checks) assert.equal(c.pass, true, `check "${c.name}" failed: ${c.reason}`);
});

test('Kit rule: instanced parts cost one draw call, others cost one per instance', () => {
  const r = diagnoseScene(pavilionSnapshot());
  const byName = Object.fromEntries(r.assembly.parts.map((p) => [p.name, p]));

  for (const name of ['column', 'post', 'globe', 'trunk', 'leaves']) {
    assert.equal(byName[name].geometry, 'instanced');
    assert.equal(byName[name].drawCalls, 1, `${name} must merge into one InstancedMesh`);
  }
  assert.equal(byName['central-urn'].drawCalls, 1);     // lathe, single mesh
  assert.equal(byName['lawn'].drawCalls, 1);            // primitive, single mesh

  // shadow flags survive into the report, including the globe's cast: false
  assert.equal(byName['globe'].castShadow, false);
  assert.equal(byName['globe'].receiveShadow, true);
  assert.equal(byName['column'].castShadow, true);
  assert.equal(byName['central-urn'].receiveShadow, false);

  // rule-based totals: every instanced part is 1, every other part is its instance count
  const expectedTotal = r.assembly.parts.reduce(
    (sum, p) => sum + (p.geometry === 'instanced' ? 1 : p.instances), 0);
  assert.equal(r.assembly.totalDrawCalls, expectedTotal);
  assert.ok(r.assembly.parts.filter((p) => p.geometry === 'instanced').length >= 1);
});

// ---------------------------------------------------------------- night 0: everything dark
test('night 0: all lights hidden, zero intensity, check explains the night is unlit', () => {
  const r = diagnoseScene(pavilionSnapshot({ night: 0 }));

  assert.equal(r.status, 'ok');
  assert.equal(r.lighting.glowIntensity, 0);
  assert.equal(r.lighting.lightVisible, false);
  assert.equal(r.lighting.lightCount, 3);
  for (const l of r.lighting.lights) {
    assert.equal(l.visible, false, `${l.name} must be hidden at night 0`);
    assert.equal(l.intensity, 0, `${l.name} intensity must be 0 at night 0`);
  }
  const dark = r.checks.find((c) => c.name === 'night-zero-dark');
  assert.equal(dark.pass, true);
  assert.match(dark.reason, /night is 0/i);
  assert.match(dark.reason, /off|invisible/i);
  assert.ok(r.checks.every((c) => c.pass));
});

test('the 0.01 cutoff itself hides lights (update rule, not just night === 0)', () => {
  const r = diagnoseScene(pavilionSnapshot({ night: 0.01 }));
  assert.equal(r.lighting.lightVisible, false);
  assert.ok(r.lighting.lights.every((l) => l.visible === false));
  const r2 = diagnoseScene(pavilionSnapshot({ night: 0.011 }));
  assert.equal(r2.lighting.lightVisible, true);
  assert.ok(r2.lighting.lights.every((l) => l.visible === true));
});

// ---------------------------------------------------------------- degraded inputs never throw
test('NaN night, Infinity candela and negative instances degrade with readable reasons', () => {
  const snap = pavilionSnapshot({
    night: NaN,
    lamps: [{ x: -2.2, z: 12, atRowZ12: true, candela: Infinity },
      { x: 2.2, z: 12, atRowZ12: true, candela: 40 }],
    lanternCandela: Infinity,
    parts: [
      { name: 'good', geometry: 'lathe', instances: 2, castShadow: true, receiveShadow: false },
      { name: 'bad', geometry: 'instanced', instances: -3, castShadow: false, receiveShadow: false },
    ],
  });
  const r = diagnoseScene(snap);

  assert.equal(r.status, 'degraded');
  assert.ok(r.affectedFields.includes('night'));
  assert.ok(r.affectedFields.includes('lamps[0].candela'));
  assert.ok(r.affectedFields.includes('lanternCandela'));
  assert.ok(r.affectedFields.includes('parts[1].instances'));

  // NaN must not leak into the output; glow cannot be computed
  assert.equal(r.lighting.glowIntensity, null);
  const bad = r.lighting.lights.find((l) => l.candela === null);
  assert.ok(bad, 'Infinity candela must be nulled for JSON safety');
  assert.equal(bad.intensity, null);

  const badPart = r.assembly.parts.find((p) => p.name === 'bad');
  assert.equal(badPart.instances, null);
  assert.equal(badPart.drawCalls, 1);   // instanced parts still render one InstancedMesh

  const failed = Object.fromEntries(r.checks.filter((c) => !c.pass).map((c) => [c.name, c]));
  for (const name of ['night-range', 'candela-positive', 'instances-nonnegative-integer']) {
    assert.ok(failed[name], `expected failing check ${name}`);
    assert.ok(failed[name].reason.length > 8, 'failure reason must be readable');
  }
  // the instanced draw-call rule itself still holds, so its check passes
  assert.equal(r.checks.find((c) => c.name === 'instanced-single-draw-call').pass, true);
});

test('Infinity candela at a valid night degrades candela only, without throwing', () => {
  const r = diagnoseScene(pavilionSnapshot({ lanternCandela: Infinity }));
  assert.equal(r.status, 'degraded');
  assert.ok(r.affectedFields.includes('lanternCandela'));
  const lantern = r.lighting.lights.find((l) => l.kind === 'lantern');
  assert.equal(lantern.candela, null);
  assert.equal(lantern.intensity, null);
  assert.equal(lantern.visible, true);    // visibility tracks night > 0.01, independent of candela
  assert.equal(r.lighting.glowIntensity, 0.6 * GLOW_EMISSIVE_FACTOR);
});

test('unbuilt scene and garbage input return not-built/degraded instead of throwing', () => {
  const unbuilt = diagnoseScene(null);
  assert.equal(unbuilt.status, 'not-built');
  assert.match(JSON.stringify(unbuilt), /not been built/i);

  assert.equal(diagnoseScene(undefined).status, 'not-built');
  const garbage = diagnoseScene('not an object');
  assert.equal(garbage.status, 'degraded');
  assert.equal(garbage.assembly.totalDrawCalls, 0);
});

// ---------------------------------------------------------------- JSON serialisation
test('every report shape round-trips through JSON.stringify without special values', () => {
  const samples = [
    pavilionSnapshot(),
    pavilionSnapshot({ night: 0 }),
    pavilionSnapshot({ night: NaN, lanternCandela: Infinity,
      parts: [{ name: 'bad', geometry: 'sweep', instances: -1, castShadow: false, receiveShadow: false }] }),
    null,
  ];
  for (const s of samples) {
    const r = diagnoseScene(s);
    const text = JSON.stringify(r);
    assert.equal(typeof text, 'string');
    // bare non-finite JSON numbers only: the words NaN/Infinity are fine inside quoted reasons
    assert.doesNotMatch(text, /:(?:NaN|-?Infinity)(?=[,}\s])/, 'JSON must contain no non-finite numbers');
    const back = JSON.parse(text);
    assert.deepEqual(back, r);
  }
});

// ---------------------------------------------------------------- module purity constraints
test('diagnose.js imports nothing and never references browser or host globals', () => {
  const raw = readFileSync(join(ROOT, 'skills/threejs-scene/assets/starter/diagnose.js'), 'utf8');
  // scan code only: comments legitimately describe what the module avoids
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\bimport\b/, 'no static imports allowed');
  assert.doesNotMatch(src, /\brequire\s*\(/, 'no require() allowed');
  for (const banned of ['window', 'document', 'globalThis', 'process', 'THREE', 'Vector3', 'fetch']) {
    assert.doesNotMatch(src, new RegExp(`\\b${banned}\\b`), `must not reference ${banned}`);
  }
});

// ---------------------------------------------------------------- scene.js wiring (static; three.js is a CDN import map, not installed offline)
test('scene.js exposes a read-only buildSceneSnapshot that delegates to diagnoseScene', () => {
  const src = readFileSync(join(ROOT, 'skills/threejs-scene/assets/starter/scene.js'), 'utf8');
  assert.match(src, /import\s*\{\s*diagnoseScene\s*\}\s*from\s*'\.\/diagnose\.js'/);
  assert.match(src, /export function buildSceneSnapshot\(\)/);
  // before any build it must answer "not built" rather than throw
  assert.match(src, /if\s*\(!sceneState\)\s*return\s+diagnoseScene\(null\)/);
  // the snapshot feeds the pure module the three required sections
  assert.match(src, /diagnoseScene\(\{[\s\S]*?night:[\s\S]*?lamps:[\s\S]*?lanternCandela:[\s\S]*?parts:/);
  // existing entry points keep their signatures (still plain function declarations / unchanged)
  assert.match(src, /export function buildScene\(\)/);
  assert.match(src, /function trees\(group, rand\)/);
  assert.match(src, /function columnGeometry\(H, D\)/);
  // the update() rules the diagnostics mirror are still literally in place
  assert.match(src, /glow\.emissiveIntensity\s*=\s*night\s*\*\s*3\.5/);
  assert.match(src, /l\.intensity\s*=\s*night\s*\*\s*l\.userData\.candela/);
  assert.match(src, /l\.visible\s*=\s*night\s*>\s*0\.01/);
  // no new CLI/subcommand entry point was added to the starter
  assert.doesNotMatch(src, /process\.argv|createRequire|node:fs|child_process/);
});

test('edge cases: out-of-range night, non-array collections and zero-instance parts', () => {
  const r = diagnoseScene({
    night: 1.5,
    lamps: 'nope',
    lanternCandela: null,
    parts: [{ name: 'empty', geometry: 'instanced', instances: 0, castShadow: false, receiveShadow: false }],
  });
  assert.equal(r.status, 'degraded');
  assert.ok(r.affectedFields.includes('night'));
  assert.equal(r.lighting.lightCount, 0);                 // non-array lamps and null lantern degrade to empty
  assert.equal(r.assembly.parts[0].drawCalls, 1);        // instanced stays one call even at count 0
  assert.equal(r.checks.find((c) => c.name === 'night-range').pass, false);

  const badCandela = diagnoseScene({ night: 0.5, lamps: [], lanternCandela: 0, parts: [] });
  assert.equal(badCandela.status, 'degraded');
  assert.ok(badCandela.affectedFields.includes('lanternCandela'));
  assert.equal(badCandela.checks.find((c) => c.name === 'candela-positive').pass, false);

  const okZero = diagnoseScene({
    night: 0,
    lamps: [{ x: 0, z: 12, atRowZ12: true, candela: 40 }],
    lanternCandela: 70,
    parts: [],
  });
  assert.equal(okZero.status, 'ok');
  assert.equal(okZero.lighting.glowIntensity, 0);
  assert.equal(okZero.checks.find((c) => c.name === 'night-zero-dark').pass, true);
  assert.ok(okZero.lighting.lights.every((l) => l.visible === false && l.intensity === 0));
});

console.log(`\n1..${passed} - all diagnose tests passed`);
