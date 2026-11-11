import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_WAVES, revival, revivalGlsl, revivalUniforms } from '../src/art/revival.ts';
import { noiseGlsl } from '../src/art/glsl.ts';
import { dir, PLANET_RADIUS } from '../src/chapter/data.ts';

const at = (lat: number, lon: number, radius = PLANET_RADIUS) => dir(lat, lon).multiplyScalar(radius);

test('revival waves grow, never leave a ring, and reset cleanly', () => {
  revival.reset();
  assert.equal(revival.amountAt(at(10, 0)), 0);
  assert.equal(revival.animating, false);

  revival.addWave(dir(10, 0), 8, { seconds: 2 });
  assert.equal(revival.animating, true);
  revival.update(1, 1);
  const mid = revivalUniforms.uRevealRadius.value[0];
  assert.ok(mid > 3.9 && mid < 4.1, `half way after one of two seconds, got ${mid}`);
  assert.ok(revival.amountAt(at(10, 0)) > 0.99);
  assert.equal(revival.amountAt(at(10, 90)), 0);
  revival.update(1.2, 2.2);
  assert.equal(revivalUniforms.uRevealRadius.value[0], 8);
  // after the glow fades only the plain organic boundary remains
  for (let i = 0; i < 40; i++) revival.update(0.1, 3 + i * 0.1);
  assert.equal(revivalUniforms.uRevealGlow.value[0], 0);
  assert.equal(revival.animating, false);

  revival.reset();
  assert.equal(revival.amountAt(at(10, 0)), 0);
  assert.equal(revivalUniforms.uRevealRadius.value[0], 0);
});

test('amountAt falls off smoothly and monotonically across the wave edge', () => {
  revival.reset();
  revival.addWave(dir(0, 0), 6, { instant: true });
  let previous = 1;
  for (let degrees = 0; degrees <= 40; degrees += 0.5) {
    const value = revival.amountAt(at(0, degrees));
    assert.ok(value <= previous + 1e-9, `monotonic at ${degrees} degrees`);
    assert.ok(value >= 0 && value <= 1);
    previous = value;
  }
  // the edge sits near the wave radius: 6 world units is about 24.5 degrees on a 14 radius planet
  const edge = 6 / PLANET_RADIUS * 180 / Math.PI;
  assert.ok(revival.amountAt(at(0, edge - 5)) > 0.95);
  assert.ok(revival.amountAt(at(0, edge + 5)) < 0.05);
  // buildings above the ground follow the same angular distance
  assert.equal(revival.amountAt(at(0, 2, 20)), revival.amountAt(at(0, 2, 14)));
  revival.reset();
});

test('more waves than the budget evict the smallest and never overflow the uniform arrays', () => {
  revival.reset();
  for (let i = 0; i < MAX_WAVES + 6; i++) revival.addWave(dir(i * 5 - 40, i * 20), 2 + i, { instant: true });
  assert.equal(revivalUniforms.uRevealRadius.value.length, MAX_WAVES);
  assert.ok(revivalUniforms.uRevealRadius.value.every(radius => radius >= 0));
  assert.ok(revivalUniforms.uRevealRadius.value.every(radius => radius === 0 || radius > 2 + 5));
  revival.reset();
});

test('revivalGlsl keeps its public contract and declares every uniform it reads', () => {
  assert.match(revivalGlsl, /vec2 revivalAt\(vec3 worldPosition\)/);
  assert.match(revivalGlsl, /vec3 revivalDetail\(vec3 worldPosition\)/);
  for (const name of ['uRevealCenter', 'uRevealRadius', 'uRevealGlow', 'uRevealSoft', 'uPlanetRadius', 'uGlobalLife']) {
    assert.ok(revivalGlsl.includes(name), name);
    assert.ok(name in revivalUniforms, `${name} is supplied by revivalUniforms`);
  }
  assert.match(revivalGlsl, new RegExp(`uRevealCenter\\[${MAX_WAVES}\\]`));
});

test('the shared noise library is include-guarded so modules can combine it freely', () => {
  assert.match(noiseGlsl, /#ifndef UN_NOISE_GLSL/);
  assert.match(noiseGlsl, /#endif\s*$/);
  for (const name of ['unHash12', 'unHash13', 'unNoise2', 'unNoise3', 'unFbm3', 'unSine3', 'unSrgb', 'unHex']) {
    assert.ok(noiseGlsl.includes(name), name);
  }
  assert.ok(revivalGlsl.includes('UN_NOISE_GLSL'), 'revivalGlsl embeds the guarded library, so shaders can include both');
});
