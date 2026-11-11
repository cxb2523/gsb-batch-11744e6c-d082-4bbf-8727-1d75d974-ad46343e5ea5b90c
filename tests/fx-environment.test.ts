import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, Points, ShaderMaterial, Vector3, type Object3D } from 'three';
import type { World } from '../src/contracts.ts';
import { dir, PLANET_RADIUS } from '../src/chapter/data.ts';
import { toonShared } from '../src/art/toon.ts';
import { revival } from '../src/art/revival.ts';
import { createEnvironmentFx } from '../src/fx/index.ts';
import { FLOCKS, buildBirdInstances } from '../src/fx/birds.ts';
import { buildButterflyInstances } from '../src/fx/butterflies.ts';
import { buildPetalInstances } from '../src/fx/petals.ts';
import { MAX_BURSTS } from '../src/fx/burst.ts';
import { fxUniforms, mulberry32, tangentFrame } from '../src/fx/shared.ts';

const surface = (lat: number, lon: number) => ({ position: dir(lat, lon).multiplyScalar(PLANET_RADIUS), normal: dir(lat, lon), forward: new Vector3(0, 0, -1) });
const stubWorld = {
  radius: PLANET_RADIUS,
  sampleRadius: () => PLANET_RADIUS,
  anchors: {
    sockets: { garden: surface(1, 133) },
    npcs: { sprout: surface(5, 127) },
    greatTree: surface(72, 0),
    paths: {},
  },
} as unknown as World;

const drawables = (root: Object3D) => {
  const list: Object3D[] = [];
  root.traverse(object => { if ((object as Mesh).isMesh || (object as Points).isPoints) list.push(object); });
  return list;
};

test('seeded generator is reproducible and tangent frames are orthonormal', () => {
  const a = mulberry32(5), b = mulberry32(5);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  for (const normal of [new Vector3(0, 1, 0), dir(-38, 0), dir(72, 10), new Vector3(1, 0, 0)]) {
    const [first, second] = tangentFrame(normal.clone());
    assert.ok(Math.abs(first.length() - 1) < 1e-9 && Math.abs(second.length() - 1) < 1e-9);
    assert.ok(Math.abs(first.dot(normal)) < 1e-9 && Math.abs(second.dot(normal)) < 1e-9 && Math.abs(first.dot(second)) < 1e-9);
  }
});

test('bird flocks circle over every district and the sea, deterministically', () => {
  const data = buildBirdInstances();
  assert.equal(data.count, FLOCKS.reduce((sum, flock) => sum + flock.count, 0));
  assert.deepEqual(buildBirdInstances().orbit, data.orbit);
  for (const value of [...data.center, ...data.orbit, ...data.form, ...data.style]) assert.ok(Number.isFinite(value));
  for (let i = 0; i < data.count; i++) {
    const radius = data.orbit[i * 4 + 3];
    assert.ok(radius > PLANET_RADIUS + 2 && radius < PLANET_RADIUS + 9, `flight altitude ${radius}`);
  }
  const names = FLOCKS.map(flock => flock.name).join('|');
  for (const place of ['harbor', 'bay', 'workshop', 'old street', 'grove']) assert.ok(names.includes(place), place);
});

test('butterflies and petals are laid out around the requested flowery places', () => {
  const zones = [{ name: 'garden', ground: dir(1, 133).multiplyScalar(PLANET_RADIUS), count: 12, radius: 2.5, altitude: [0.5, 1.5] as [number, number] }];
  const flies = buildButterflyInstances(zones);
  assert.equal(flies.count, 12);
  for (let i = 0; i < flies.count; i++) {
    const home = new Vector3().fromArray(flies.home, i * 3);
    assert.ok(home.distanceTo(zones[0].ground) < zones[0].radius + 0.3, 'home stays inside the zone');
    assert.ok(Math.abs(home.length() - PLANET_RADIUS) < 1e-4, 'homes sit on the ground sphere');
  }
  const petals = buildPetalInstances([{ name: 'tree', ground: dir(15, -118).multiplyScalar(PLANET_RADIUS), count: 30, radius: 1.5, height: 3.4, fall: [6, 9], gate: 'life' }]);
  assert.equal(petals.count, 30);
  assert.ok(petals.gate.every(gate => gate === 1));
  for (let i = 0; i < petals.count; i++) assert.ok(petals.params[i * 4 + 2] >= 6 && petals.params[i * 4 + 2] <= 9);
});

test('environment fx stays well inside the draw-call budget and honors the contract', async () => {
  revival.reset();
  const fx = await createEnvironmentFx(stubWorld);
  const objects = drawables(fx.group);
  assert.ok(objects.length <= 25, `${objects.length} drawables`);
  assert.ok(objects.length >= 6);
  for (const object of objects) {
    assert.equal(object.frustumCulled, false, 'positions are computed in shaders, so bounds are meaningless');
    assert.equal(object.userData.ignoreDepthPrepass, true);
    assert.ok(((object as Mesh).material as ShaderMaterial).isShaderMaterial);
  }
  const stats = fx.stats();
  for (const key of ['drawCalls', 'birds', 'butterflies', 'petals']) assert.ok(typeof stats[key] === 'number', key);
  assert.ok(stats.drawCalls <= 25);

  // update works with and without a player, and publishes the player to the shaders
  fx.update({ time: 1, dt: 1 / 60, playerSpeed: 0, life: 0 });
  const player = dir(11, -3).multiplyScalar(PLANET_RADIUS);
  fx.update({ time: 1.1, dt: 1 / 60, playerPosition: player, playerNormal: player.clone().normalize(), playerSpeed: 2, life: 0.3 });
  assert.ok(fxUniforms.uPlayer.value.distanceTo(player) < 1e-9);
  const dusts = drawables(fx.group).filter(object => (object as Points).isPoints);
  assert.equal(dusts.length, 2);
  assert.ok(dusts.every(object => object.visible));
  fx.update({ time: 1.2, dt: 1 / 60, playerSpeed: 0, life: 0.3 });
  assert.ok(dusts.every(object => !object.visible), 'motes are hidden on the title screen');

  fx.setDusk(0.5);
  assert.equal(toonShared.uDusk.value, 0.5);
  fx.setDusk(-1);
  assert.equal(toonShared.uDusk.value, 0);
});

test('connection burst plays for a couple of seconds, overlaps, and recycles its slots', async () => {
  const fx = await createEnvironmentFx(stubWorld);
  const burst = drawables(fx.group).filter(object => object.parent?.name === 'ConnectionBurst');
  assert.equal(burst.length, 2, 'confetti plus ground ring');
  assert.ok(burst.every(object => !object.parent!.visible), 'idle bursts cost nothing');
  const position = dir(3, -7).multiplyScalar(PLANET_RADIUS + 0.7);
  fxUniforms.uTime.value = 10;
  fx.burst(position, position.clone().normalize(), '#ffcf4a');
  fx.update({ time: 10, dt: 0, playerSpeed: 0, life: 0 });
  assert.equal(fx.stats().bursting, 1);
  assert.ok(burst[0].parent!.visible);
  assert.equal(fx.stats().drawCalls, 7);
  fxUniforms.uTime.value = 10.5;
  fx.burst(position, position.clone().normalize(), '#4fb3e8');
  assert.equal(fx.stats().bursting, 2);
  for (let i = 0; i < MAX_BURSTS + 2; i++) fx.burst(position, position.clone().normalize(), '#e8505b');
  assert.equal(fx.stats().bursting, MAX_BURSTS, 'old slots are recycled instead of growing');
  fxUniforms.uTime.value = 20;
  fx.update({ time: 20, dt: 0, playerSpeed: 0, life: 0 });
  assert.equal(fx.stats().bursting, 0);
  assert.ok(!burst[0].parent!.visible);
});
