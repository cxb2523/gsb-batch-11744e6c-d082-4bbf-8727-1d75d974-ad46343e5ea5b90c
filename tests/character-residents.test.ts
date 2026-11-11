import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Vector3 } from 'three';
import { NPC_PLACEMENTS, dir, type ConnectionId, type NpcId } from '../src/chapter/data.ts';
import type { Resident, ResidentsContext, SurfaceAnchor, World } from '../src/contracts.ts';
import { createResidents, updateResidents } from '../src/residents/index.ts';
import { sphereTangent } from '../src/sphere.ts';

function anchorAt(lat: number, lon: number, faceLat?: number, faceLon?: number, radius = 14): SurfaceAnchor {
  const normal = dir(lat, lon);
  const toward = faceLat === undefined ? new Vector3(0, 0, -1) : dir(faceLat, faceLon!).sub(normal);
  return { position: normal.clone().multiplyScalar(radius), normal, forward: sphereTangent(normal, toward) };
}

function stubWorld(options: { npcs?: boolean; paths?: Record<string, Vector3[]> } = {}): World {
  const npcs = {} as World['anchors']['npcs'];
  if (options.npcs !== false) for (const p of NPC_PLACEMENTS) npcs[p.id] = anchorAt(p.lat, p.lon, p.faceLat, p.faceLon);
  return {
    group: new Group(), radius: 14, groundMeshes: [], obstacleMeshes: [], colliderMeshes: [],
    spawnNormal: new Vector3(0, 1, 0),
    anchors: {
      spawn: anchorAt(11, -3), sockets: { lighthouse: anchorAt(-8, -27, undefined, undefined, 14.7) } as World['anchors']['sockets'],
      npcs, farHouseDoor: anchorAt(-58, 180), greatTree: anchorAt(72, 0), paths: options.paths ?? {},
    },
    sampleRadius: () => 14, isWater: () => false, setView() {}, update() {}, activate() {}, setFinale() {}, stats: () => ({}),
  };
}

function context(overrides: Partial<ResidentsContext> & { playerPosition: Vector3 }): ResidentsContext {
  return { time: 0, dt: 1 / 60, speaking: false, ...overrides };
}

function run(residents: Resident[], seconds: number, base: Partial<ResidentsContext> & { playerPosition: Vector3 }): void {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) updateResidents(residents, context({ ...base, time: t, dt }));
}

const far = new Vector3(0, -14, 0);

test('residents are created for the whole cast with sane talk distances and hidden latecomers', () => {
  const residents = createResidents(stubWorld());
  assert.deepEqual(residents.map(r => r.id), NPC_PLACEMENTS.map(p => p.id));
  for (const resident of residents) {
    const placement = NPC_PLACEMENTS.find(p => p.id === resident.id)!;
    assert.equal(resident.present, !placement.appearsAfter, `${resident.id} presence`);
    assert.equal(resident.talkEnabled, true);
    assert.ok(resident.height > 0.4);
    assert.equal(resident.marker.visible, false);
    assert.ok(resident.group.children.includes(resident.character.group));
    if (resident.id === 'otto' || resident.id === 'ike') assert.equal(resident.talkDistance, 2.2);
    else assert.ok(resident.talkDistance >= 1.3 && resident.talkDistance <= 1.8, `${resident.id} ${resident.talkDistance}`);
    // focus point at head height above the feet
    const head = resident.focusPosition.clone().sub(resident.position).dot(resident.normal);
    assert.ok(head > resident.height * 0.5 && head < resident.height, `${resident.id} focus ${head}`);
  }
});

test('residents fall back to the placement when the world has no anchors', () => {
  const residents = createResidents(stubWorld({ npcs: false }));
  const wick = residents.find(r => r.id === 'wick')!;
  const placement = NPC_PLACEMENTS.find(p => p.id === 'wick')!;
  assert.ok(wick.position.distanceTo(dir(placement.lat, placement.lon).multiplyScalar(14)) < 1e-6);
});

test('a latecomer appears with a pop (or instantly) and updates only when present', () => {
  const residents = createResidents(stubWorld());
  const marlo = residents.find(r => r.id === 'marlo')!;
  run(residents, 0.5, { playerPosition: far });
  assert.equal(marlo.group.visible, false);
  marlo.appear(false);
  assert.equal(marlo.present, true);
  assert.ok(marlo.character.group.scale.x < 0.5, 'starts small');
  run(residents, 0.3, { playerPosition: far });
  assert.ok(marlo.character.group.scale.x > 0.2);
  run(residents, 1.5, { playerPosition: far });
  assert.ok(Math.abs(marlo.character.group.scale.x - 1) < 1e-6, 'settles at full size');
  const pim = residents.find(r => r.id === 'pim')!;
  pim.appear(true);
  assert.equal(pim.character.group.scale.x, 1);
  assert.equal(pim.group.visible, true);
});

test('a resident turns toward the player while talking and keeps its feet on the anchor', () => {
  const residents = createResidents(stubWorld());
  const sol = residents.find(r => r.id === 'sol')!;
  const before = sol.position.clone();
  const player = sol.position.clone().add(new Vector3(1, 0, 1).projectOnPlane(sol.normal).normalize().multiplyScalar(1.4));
  const faceBefore = new Vector3(0, 0, 1).applyQuaternion(sol.group.quaternion);
  run(residents, 1.6, { playerPosition: player, talkingId: 'sol' as NpcId, speaking: true });
  const face = new Vector3(0, 0, 1).applyQuaternion(sol.group.quaternion);
  const toward = player.clone().sub(sol.position).projectOnPlane(sol.normal).normalize();
  assert.ok(face.dot(toward) > 0.95, `facing the player ${face.dot(toward).toFixed(2)}`);
  assert.ok(face.dot(toward) > faceBefore.dot(toward) - 1e-6);
  assert.ok(sol.position.distanceTo(before) < 1e-9, 'static resident does not drift');
  assert.ok(Math.abs(sol.position.length() - 14) < 1e-6);
});

test('Otto and Ike behind their windows barely turn their bodies toward a visitor', () => {
  const residents = createResidents(stubWorld());
  const otto = residents.find(r => r.id === 'otto')!;
  const rest = new Vector3(0, 0, 1).applyQuaternion(otto.group.quaternion);
  const side = new Vector3().crossVectors(otto.normal, rest).normalize();
  const player = otto.position.clone().addScaledVector(side, 2).addScaledVector(rest, -0.5);
  run(residents, 2.5, { playerPosition: player });
  const face = new Vector3(0, 0, 1).applyQuaternion(otto.group.quaternion);
  assert.ok(Math.acos(Math.min(1, face.dot(rest))) < 0.55, 'stays facing the other window');
});

test('the cat wanders slowly near home, sits when the player is close, and never leaves the ground', () => {
  const residents = createResidents(stubWorld());
  const cat = residents.find(r => r.id === 'cat')!;
  const home = cat.position.clone();
  let maxFromHome = 0;
  for (let t = 0; t < 90; t += 1 / 30) {
    updateResidents(residents, context({ time: t, dt: 1 / 30, playerPosition: far }));
    maxFromHome = Math.max(maxFromHome, cat.position.distanceTo(home));
    assert.ok(Math.abs(cat.position.length() - 14) < 0.05, 'glued to the ground');
  }
  assert.ok(maxFromHome > 0.5, `wanders (${maxFromHome.toFixed(2)})`);
  assert.ok(maxFromHome < 4.5, 'stays in its neighbourhood');
  // with a visitor close by, it stops
  const player = cat.position.clone().addScaledVector(new Vector3(1, 0, 0).projectOnPlane(cat.normal).normalize(), 1.2);
  run(residents, 3, { playerPosition: player });
  const stopped = cat.position.clone();
  run(residents, 3, { playerPosition: player });
  assert.ok(cat.position.distanceTo(stopped) < 0.05, 'sits while someone is near');
});

test('the cat follows an authored path when the world provides one', () => {
  const path = [anchorAt(11, -2).position, anchorAt(11, 4).position, anchorAt(14, 10).position];
  const residents = createResidents(stubWorld({ paths: { cat: path } }));
  const cat = residents.find(r => r.id === 'cat')!;
  let closest = Infinity;
  for (let t = 0; t < 120; t += 1 / 30) {
    updateResidents(residents, context({ time: t, dt: 1 / 30, playerPosition: far }));
    closest = Math.min(closest, cat.position.distanceTo(path[2]));
  }
  assert.ok(closest < 0.5, `reached the far waypoint (${closest.toFixed(2)})`);
});

test('Wick strolls to the lighthouse once the harbor is alive, but not while the player is near', () => {
  const world = stubWorld();
  const residents = createResidents(world);
  const wick = residents.find(r => r.id === 'wick')!;
  const socket = world.anchors.sockets.lighthouse.position;
  const completed = new Set<ConnectionId>(['h1']);
  const start = wick.position.distanceTo(socket);
  run(residents, 4, { playerPosition: wick.position.clone().addScaledVector(wick.normal, 0.1).add(new Vector3(0.5, 0, 0).projectOnPlane(wick.normal)), completed });
  assert.ok(Math.abs(wick.position.distanceTo(socket) - start) < 0.05, 'waits for the player to leave');
  run(residents, 25, { playerPosition: far, completed });
  const end = wick.position.distanceTo(socket);
  assert.ok(end < start - 1, `walked toward the lighthouse (${start.toFixed(2)} -> ${end.toFixed(2)})`);
  assert.ok(end > 1.5, 'stops short of the door');
  assert.ok(Math.abs(wick.position.length() - 14) < 0.05);
});

test('the speech-bubble marker bobs, faces the visitor and is only animated while visible', () => {
  const residents = createResidents(stubWorld());
  const bram = residents.find(r => r.id === 'bram')!;
  bram.marker.visible = true;
  const player = bram.position.clone().add(new Vector3(0, 0, 1).projectOnPlane(bram.normal).normalize().multiplyScalar(2));
  const heights = new Set<number>();
  for (let t = 0; t < 2; t += 1 / 30) {
    updateResidents(residents, context({ time: t, dt: 1 / 30, playerPosition: player }));
    heights.add(Math.round(bram.marker.position.y * 1000));
  }
  assert.ok(heights.size > 5, 'bobs');
  assert.ok(bram.marker.position.y > bram.height);
  bram.marker.visible = false;
  const frozen = bram.marker.position.y;
  run(residents, 1, { playerPosition: player });
  assert.equal(bram.marker.position.y, frozen);
});

test('perform() overrides the idle for its duration and then lets go', () => {
  const residents = createResidents(stubWorld());
  const otto = residents.find(r => r.id === 'otto')!;
  const watcher = otto.position.clone().add(new Vector3(1, 0, 0).projectOnPlane(otto.normal).normalize().multiplyScalar(6));
  otto.perform('lean', 1);
  run(residents, 0.5, { playerPosition: watcher });
  const mesh = otto.character.group.children[0] as unknown as { geometry: { attributes: { position: { array: Float32Array } } } };
  const leaning = Array.from(mesh.geometry.attributes.position.array.slice(0, 300));
  run(residents, 3, { playerPosition: watcher });
  const after = Array.from(mesh.geometry.attributes.position.array.slice(0, 300));
  assert.ok(leaning.some((value, i) => Math.abs(value - after[i]) > 0.005), 'pose changes after the gesture ends');
});
