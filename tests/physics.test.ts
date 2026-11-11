import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { CollisionWorld, CourierPhysics } from '../src/physics.ts';
import { Player } from '../src/player.ts';
import { parallelTransport, sphereTangent } from '../src/sphere.ts';

function box(width: number, height: number, depth: number, x: number, y: number, z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.set(x, y, z);
  return mesh;
}
function floor(): Mesh { return box(40, 1, 40, 0, 19.5, 0); }
function simulate(physics: CourierPhysics, seconds: number, direction = new Vector3(0, 0, -1), fps = 60, jump = false, sprint = false): { maxDepth: number; maxHeight: number } {
  let maxDepth = 0, maxHeight = 0;
  for (let frame = 0; frame < seconds * fps; frame++) {
    physics.update(1 / fps, { direction: sphereTangent(physics.up, direction), amount: direction.lengthSq() > 0 ? 1 : 0, sprint, jump: jump && frame === 0 });
    maxDepth = Math.max(maxDepth, physics.collision.penetration(physics.position, physics.up, physics.height, physics.radius));
    maxHeight = Math.max(maxHeight, physics.jumpHeight);
    assert.ok(physics.position.toArray().every(Number.isFinite));
  }
  return { maxDepth, maxHeight };
}
function physicsFor(meshes: Mesh[], position = new Vector3(0, 20.025, 0)): CourierPhysics {
  const physics = new CourierPhysics(new CollisionWorld(meshes));
  physics.reset(position);
  return physics;
}

function ramp(slope: number): Mesh {
  const geometry = new BufferGeometry();
  // Width 10; ascending towards -Z. Normals point above the surface.
  geometry.setAttribute('position', new Float32BufferAttribute([-5, 20, 0, 5, 20, 0, -5, 20 + slope * 8, -8, 5, 20 + slope * 8, -8], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2]);
  return new Mesh(geometry, new MeshBasicMaterial());
}

test('elevated bridge stays on its own floor while an underpass remains below it', () => {
  const bridge = box(5, 0.4, 14, 0, 22.8, -2);
  const world = new CollisionWorld([floor(), bridge]);
  for (const y of [20.025, 23.025]) {
    const physics = new CourierPhysics(world);
    physics.reset(new Vector3(0, y, 2));
    const result = simulate(physics, 2.5);
    assert.ok(Math.abs(physics.position.y - (y > 22 ? 23 : 20)) < 0.08, `wrong support layer: ${physics.position.y}`);
    assert.ok(physics.position.z < -2.5, 'courier did not cross the bridge/underpass');
    assert.ok(result.maxDepth < 0.002, `capsule overlaps bridge by ${result.maxDepth}`);
    assert.equal(physics.grounded, true);
  }
});

test('jump into low underpass ceiling applies vertical correction and lands cleanly', () => {
  const ceiling = box(8, 0.25, 8, 0, 21.9, 0);
  const physics = physicsFor([floor(), ceiling]);
  const result = simulate(physics, 2, new Vector3(), 60, true);
  assert.ok(result.maxHeight > 0.08, 'jump never took off');
  assert.ok(result.maxHeight < 0.27, `head passed through ceiling: ${result.maxHeight}`);
  assert.ok(result.maxDepth < 0.002, `capsule overlaps ceiling by ${result.maxDepth}`);
  assert.equal(physics.grounded, true);
  assert.ok(Math.abs(physics.position.y - 20) < 0.005);
});

test('short local step probes climb stairs without selecting a tall roof', () => {
  const stair = box(8, 0.35, 8, 0, 20.045, -5);
  const physics = physicsFor([floor(), stair]);
  const result = simulate(physics, 2);
  assert.ok(physics.position.z < -3, `small stair blocked at ${physics.position.z}`);
  assert.ok(physics.position.y > 20.20 && physics.position.y < 20.25, `wrong stair height: ${physics.position.y}`);
  assert.ok(result.maxDepth < 0.002);
  const wall = box(8, 3, 8, 0, 21.5, -5);
  const blocked = physicsFor([floor(), wall]);
  const wallResult = simulate(blocked, 2);
  assert.ok(blocked.position.z > -0.75, `wall auto-climbed at ${blocked.position.z}`);
  assert.ok(blocked.position.y < 20.05, 'courier popped onto roof');
  assert.ok(wallResult.maxDepth < 0.002);
});

test('face-normal slope classification permits moderate ramps and rejects steep climbing', () => {
  for (const slope of [0.45, 1.6]) {
    const physics = physicsFor([floor(), ramp(slope)], new Vector3(0, 20.025, 0.7));
    const result = simulate(physics, 3);
    if (slope < 1) {
      assert.ok(physics.position.z < -3, `walkable ramp blocked: ${physics.position.z}`);
      assert.ok(physics.position.y > 21.4, `courier penetrated ramp: ${physics.position.y}`);
      assert.equal(physics.grounded, true);
    } else {
      assert.ok(physics.position.z > -1.5, `steep ramp climbed: ${physics.position.z}`);
    }
    assert.ok(result.maxDepth < 0.003, `ramp penetration ${result.maxDepth}`);
  }
});

test('both gravity hemispheres use the same complete wall and ceiling collision', () => {
  for (const angle of [0, Math.PI]) {
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), angle);
    const meshes = [floor(), box(8, 3, 0.15, 0, 21.5, -2)];
    for (const mesh of meshes) { mesh.position.applyQuaternion(rotation); mesh.quaternion.copy(rotation); }
    const physics = physicsFor(meshes, new Vector3(0, 20.025, 0).applyQuaternion(rotation));
    const result = simulate(physics, 2, new Vector3(0, 0, -1).applyQuaternion(rotation));
    const local = physics.position.clone().applyQuaternion(rotation.clone().invert());
    assert.ok(local.z > -1.65 && local.z < -1.1, `wall crossed or not reached: ${local.z}`);
    assert.ok(Math.abs(local.y - 20) < 0.02);
    assert.equal(physics.grounded, true);
    assert.ok(result.maxDepth < 0.002);
  }
});

test('fixed physics remains consistent at 15/30/60/144 Hz on sustained spherical routes', () => {
  const world = new CollisionWorld([new Mesh(new SphereGeometry(20, 96, 64), new MeshBasicMaterial())]);
  const positions: Vector3[] = [];
  for (const fps of [15, 30, 60, 144]) {
    const physics = new CourierPhysics(world, 1.155);
    physics.reset(new Vector3(0, 20.025, 0));
    let maxDepth = 0;
    let direction = new Vector3(0, 0, -1);
    for (let frame = 0; frame < fps * 12; frame++) {
      const before = physics.up.clone();
      physics.update(1 / fps, { direction, amount: 1, sprint: true, jump: false });
      direction = parallelTransport(direction, before, physics.up);
      maxDepth = Math.max(maxDepth, world.penetration(physics.position, physics.up, physics.height, physics.radius));
    }
    assert.ok(physics.position.length() > 19.97 && physics.position.length() < 20.01, `lost spherical support: ${physics.position.length()}`);
    assert.ok(maxDepth < 0.003, `low FPS penetration ${maxDepth}`);
    positions.push(physics.position.clone());
  }
  for (const position of positions) assert.ok(position.distanceTo(positions[0]) < 0.06, `frame-rate trajectory drift ${position.distanceTo(positions[0])}`);
});


test('NPC interaction visibility rejects thin walls and bridge floors between nearby characters', () => {
  const wall = box(4, 3, 0.04, 0, 21, -1);
  const world = new CollisionWorld([floor(), wall]);
  const chest = new Vector3(0, 20.75, 0);
  assert.equal(world.hasLineOfSight(chest, new Vector3(0, 20.75, -2)), false, 'nearby NPC behind a thin wall remained interactable');
  assert.equal(world.hasLineOfSight(chest, new Vector3(0, 20.75, -0.7)), true, 'visible nearby NPC was blocked');
  assert.equal(world.hasLineOfSight(chest, new Vector3(5, 20.75, -2)), true, 'clear diagonal route was blocked');
  const bridge = new CollisionWorld([floor(), box(5, 0.4, 8, 0, 22.8, 0)]);
  assert.equal(bridge.hasLineOfSight(chest, new Vector3(0, 23.75, 0)), false, 'interaction crossed a bridge floor');
});


test('continuous player walking keeps animation active at 60/120/144 Hz without alternating idle frames', () => {
  const positions: Vector3[] = [];
  for (const fps of [60, 120, 144]) {
    const ground = new Mesh(new SphereGeometry(20, 96, 64), new MeshBasicMaterial());
    const player = new Player({ radius: 20, sampleRadius: () => 20, obstacleMeshes: [], colliderMeshes: [ground] }, new Vector3(0, 1, 0));
    let cameraForward = new Vector3(0, 0, -1);
    let previousMotion = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      const before = player.normal.clone();
      player.update(1 / fps, { x: 0, y: 1, sprint: false, jump: false }, cameraForward);
      cameraForward = parallelTransport(cameraForward, before, player.normal);
      if (frame > fps) {
        assert.ok(player.moving > .9, `walk fell into idle at ${fps} Hz frame ${frame}: ${player.moving}`);
        assert.ok(Math.abs(player.moving - previousMotion) < .035, `animation intensity pulsed at ${fps} Hz`);
      }
      previousMotion = player.moving;
    }
    assert.ok(player.position.z < -3.5, 'animation remained active without real locomotion');
    positions.push(player.position.clone());
  }
  for (const position of positions) assert.ok(position.distanceTo(positions[0]) < .015, 'animation repair changed the high refresh rate path');
});

test('holding movement into a blocking wall settles player animation to idle', () => {
  const ground = floor(), wall = box(8, 3, .1, 0, 21.5, -2);
  const player = new Player({ radius: 20, sampleRadius: () => 20, obstacleMeshes: [wall], colliderMeshes: [ground, wall] }, new Vector3(0, 1, 0));
  for (let frame = 0; frame < 120 * 3; frame++) {
    player.update(1 / 120, { x: 0, y: 1, sprint: false, jump: false }, new Vector3(0, 0, -1));
  }
  assert.ok(player.position.z > -1.75, 'player passed through the blocking wall');
  assert.ok(player.moving < .06, `blocked courier kept playing a walk animation: ${player.moving}`);
});
