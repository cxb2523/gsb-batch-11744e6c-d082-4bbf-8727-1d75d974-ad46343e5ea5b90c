import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh, ShaderMaterial, Vector3 } from 'three';
import { CONNECTION_IDS, CONNECTIONS, NPC_PLACEMENTS, SEA_RADIUS, SOCKET_HINTS, type NpcId, type SocketId } from '../src/chapter/data.ts';
import type { World } from '../src/contracts.ts';
import { CollisionWorld, CourierPhysics } from '../src/physics.ts';
import { sphereTangent } from '../src/sphere.ts';
import { createWorld } from '../src/world/index.ts';
import { buildNav, nearestReachable, PLAYER_HEIGHT, PLAYER_RADIUS, route, standingFor, type NavMesh } from './world-nav.ts';

let shared: { world: World; nav: NavMesh } | undefined;
async function build(): Promise<{ world: World; nav: NavMesh }> {
  if (!shared) {
    const world = await createWorld();
    const nav = buildNav(world, world.anchors.spawn.position, 60000);
    shared = { world, nav };
  }
  return shared;
}

const finite = (v: Vector3) => Number.isFinite(v.x + v.y + v.z);

test('anchors are finite, unit-length normals with tangent headings', async () => {
  const { world } = await build();
  const all = [world.anchors.spawn, world.anchors.farHouseDoor, world.anchors.greatTree, ...Object.values(world.anchors.sockets), ...Object.values(world.anchors.npcs)];
  for (const anchor of all) {
    assert.ok(finite(anchor.position) && finite(anchor.normal) && finite(anchor.forward));
    assert.ok(Math.abs(anchor.normal.length() - 1) < 1e-6, 'normal is unit');
    assert.ok(Math.abs(anchor.forward.dot(anchor.normal)) < 1e-3, 'forward is tangent');
    assert.ok(anchor.position.length() > 12 && anchor.position.length() < 20, 'anchor near the planet surface');
  }
  for (const id of Object.keys(SOCKET_HINTS)) assert.ok(world.anchors.sockets[id as SocketId], `socket ${id}`);
  for (const npc of NPC_PLACEMENTS) assert.ok(world.anchors.npcs[npc.id as NpcId], `npc ${npc.id}`);
  assert.ok(world.anchors.paths.cat.length >= 8 && world.anchors.paths.boat.length >= 8);
  for (const point of [...world.anchors.paths.cat, ...world.anchors.paths.boat]) assert.ok(finite(point));
});

test('spawn stands on a walkable floor above water', async () => {
  const { world } = await build();
  const spawn = world.anchors.spawn;
  // The spawn may be on a deck above the terrain shell (the pier), never below it.
  const ground = world.sampleRadius(spawn.normal);
  assert.ok(spawn.position.length() >= ground - 0.06, `spawn ${spawn.position.length()} vs ground ${ground}`);
  assert.equal(world.isWater(spawn.position.clone().addScaledVector(spawn.normal, 0.05)), false);
  const physics = new CourierPhysics(new CollisionWorld(world.colliderMeshes), PLAYER_HEIGHT);
  physics.reset(spawn.position.clone().addScaledVector(spawn.normal, 0.025));
  assert.equal(physics.grounded, true);
  assert.ok(physics.collision.penetration(physics.position, physics.up, PLAYER_HEIGHT, PLAYER_RADIUS) < 0.03);
});

test('water: the bay is water, the square is not; deep sea is walled off', async () => {
  const { world, nav } = await build();
  const bay = new Vector3(0, -0.5, 1).normalize().multiplyScalar(SEA_RADIUS - 0.2);
  assert.equal(world.isWater(bay), true);
  assert.equal(world.isWater(world.anchors.sockets.hub_harbor.position), false);
  // every reachable ground node keeps its feet out of deep water (the sea walls hold)
  let deep = 0;
  nav.points.forEach((p, i) => {
    if (!nav.reachable[i]) return;
    const ground = world.sampleRadius(p.clone().normalize());
    // decks and stairs stand above their own ground, wading never deeper than ~0.45
    if (p.length() < SEA_RADIUS - 0.5 && p.length() < ground + 0.3) deep++;
  });
  assert.equal(deep, 0, 'reachable points deeper than the wading limit');
});

test('every socket can be reached on foot from the spawn, at hand height', async () => {
  const { world, nav } = await build();
  for (const [id, anchor] of Object.entries(world.anchors.sockets)) {
    const height = anchor.position.length() - world.sampleRadius(anchor.normal);
    void height;
    const stand = standingFor(nav, anchor.position, anchor.normal, 1.2);
    assert.ok(stand, `${id}: no standing point within 1.2 of the plug`);
    const feet = nav.points[stand!.index];
    const drop = anchor.position.clone().sub(feet).dot(anchor.normal);
    assert.ok(drop >= 0.3 && drop <= 1.15, `${id}: plug ${drop.toFixed(2)} above the feet`);
  }
});

test('walking with real physics reaches every socket without getting stuck', async () => {
  const { world, nav } = await build();
  const physics = new CourierPhysics(nav.collision, PLAYER_HEIGHT);
  const spawn = world.anchors.spawn;
  const failures: string[] = [];
  for (const [id, anchor] of Object.entries(world.anchors.sockets)) {
    const stand = standingFor(nav, anchor.position, anchor.normal, 1.2)!;
    const path = route(nav, nav.start, stand.index);
    physics.reset(spawn.position.clone().addScaledVector(spawn.normal, 0.025));
    let index = 0, time = 0, bestRemaining = Infinity, lastProgress = 0, done = false;
    while (time < 90 && !done) {
      const position = physics.position;
      for (let k = index; k < Math.min(path.length, index + 8); k++) if (position.distanceTo(nav.points[path[k]]) < 0.42) index = Math.max(index, k);
      if (index === path.length - 1 && position.distanceTo(nav.points[path[index]]) < 0.45) { done = true; break; }
      let target = Math.min(path.length - 1, index + 1);
      for (let k = target + 1; k < Math.min(path.length, index + 10); k++) {
        const q = nav.points[path[k]];
        if (position.distanceTo(q) > 1.0) break;
        const a1 = position.clone().addScaledVector(physics.up, 0.3), b1 = q.clone().addScaledVector(nav.normals[path[k]], 0.3);
        const a2 = position.clone().addScaledVector(physics.up, 0.55), b2 = q.clone().addScaledVector(nav.normals[path[k]], 0.55);
        if (!nav.collision.hasLineOfSight(a1, b1, 0.3) || !nav.collision.hasLineOfSight(a2, b2, 0.3)) break;
        target = k;
      }
      const direction = sphereTangent(physics.up, nav.points[path[target]].clone().sub(position));
      physics.update(1 / 60, { direction, amount: 1, sprint: false, jump: false });
      time += 1 / 60;
      const remaining = path.length - index;
      if (remaining < bestRemaining) { bestRemaining = remaining; lastProgress = time; }
      if (time - lastProgress > 6) break;
    }
    if (!done) failures.push(`${id} (stuck at node ${index}/${path.length})`);
    else assert.ok(physics.position.distanceTo(anchor.position) <= 1.3, `${id}: ended ${physics.position.distanceTo(anchor.position).toFixed(2)} from the plug`);
  }
  assert.deepEqual(failures, []);
});

test('residents can be talked to: a reachable spot with a clear line of sight', async () => {
  const { world, nav } = await build();
  const talk: Partial<Record<NpcId, number>> = { otto: 2.2, ike: 2.2 };
  for (const placement of NPC_PLACEMENTS) {
    const anchor = world.anchors.npcs[placement.id];
    const limit = talk[placement.id] ?? 1.6;
    const focus = anchor.position.clone().addScaledVector(anchor.normal, 1.2 * 0.8);
    let ok = false;
    nav.points.forEach((p, i) => {
      if (ok || !nav.reachable[i] || p.distanceTo(anchor.position) > limit) return;
      const from = p.clone().addScaledVector(nav.normals[i], PLAYER_HEIGHT * 0.65);
      if (nav.collision.hasLineOfSight(from, focus)) ok = true;
    });
    assert.ok(ok, `${placement.id}: nowhere to talk within ${limit}`);
  }
});

test('otto and ike stand on interior floors the player cannot enter', async () => {
  const { world, nav } = await build();
  for (const id of ['otto', 'ike'] as const) {
    const anchor = world.anchors.npcs[id];
    const support = nav.collision.supportAt(anchor.position.clone().addScaledVector(anchor.normal, 0.3), anchor.normal, 1.2);
    assert.ok(support && support.normal.dot(anchor.normal) > 0.7, `${id} has a floor`);
    // the interior is not part of the reachable floor set
    nav.points.forEach((p, i) => {
      if (nav.reachable[i] && p.distanceTo(anchor.position) < 0.8 && Math.abs(p.clone().sub(anchor.position).dot(anchor.normal)) < 0.4) assert.fail(`${id}'s room is reachable`);
    });
  }
  // the window opening itself stays free for sight lines between the alley and the room
  const otto = world.anchors.npcs.otto, ike = world.anchors.npcs.ike;
  const head = (a: typeof otto) => a.position.clone().addScaledVector(a.normal, 1.2 * 0.8);
  assert.ok(nav.collision.hasLineOfSight(head(otto), head(ike), 0.1), 'Otto and Ike can see each other through both windows');
});

test('the far house door is reachable', async () => {
  const { world, nav } = await build();
  assert.ok(nearestReachable(nav, world.anchors.farHouseDoor.position).distance < 1.6);
});

test('activation: instant and animated transitions run without errors and drive the glow channels', async () => {
  const world = await createWorld();
  for (const id of CONNECTION_IDS) world.activate(id, true);
  world.setFinale(1);
  for (let i = 0; i < 20; i++) world.update(i / 60, 1 / 60);
  const fresh = await createWorld();
  for (const connection of CONNECTIONS) fresh.activate(connection.id, false);
  fresh.setFinale(0.5);
  for (let i = 0; i < 240; i++) fresh.update(i / 60, 1 / 60);
  fresh.setFinale(1);
  fresh.update(5, 1 / 60);
  let glow: ShaderMaterial | undefined;
  fresh.group.traverse(object => {
    const material = (object as Mesh).material as ShaderMaterial | undefined;
    if (material?.name === 'UnspoolDetail') glow = material;
  });
  assert.ok(glow, 'detail material present');
  assert.ok(glow!.fragmentShader.includes('uGlow'), 'glow channels are patched into the toon shader');
  const levels = glow!.uniforms.uGlow.value as Vector3[];
  assert.ok(levels.some(level => level.length() > 0.5), 'some glow channel is lit after the finale');
});

test('static scenery is merged: draw-call and triangle budgets', async () => {
  const { world } = await build();
  let meshes = 0, triangles = 0;
  world.group.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const geometry = mesh.geometry;
    const instances = (mesh as unknown as { count?: number }).count;
    triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3 * (instances ?? 1);
  });
  assert.ok(meshes <= 140, `${meshes} world meshes`);
  assert.ok(triangles <= 200000, `${Math.round(triangles)} triangles`);
});
