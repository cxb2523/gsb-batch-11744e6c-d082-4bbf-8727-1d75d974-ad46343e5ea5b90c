import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, SphereGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { FollowCamera } from '../src/camera.ts';
import type { Player } from '../src/player.ts';
import { parallelTransport } from '../src/sphere.ts';

function courier(position = new Vector3(0, 20, 0)): Player {
  return {
    position, normal: position.clone().normalize(), forward: new Vector3(0, 0, -1), moving: 0, height: 1.155, group: new Group(),
  } as unknown as Player;
}
function wall(width = 5, height = 4, depth = .2): Mesh {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.set(0, 21.5, 2);
  mesh.updateMatrixWorld(true);
  return mesh;
}
function elevation(camera: PerspectiveCamera, player: Player): number {
  const direction = camera.position.clone().sub(player.position.clone().addScaledVector(player.normal, .84)).normalize();
  return Math.asin(direction.dot(player.normal));
}
function clearView(camera: PerspectiveCamera, player: Player, obstacle: Mesh): void {
  const focus = player.position.clone().addScaledVector(player.normal, .84);
  const direction = camera.position.clone().sub(focus);
  const ray = new Raycaster(focus, direction.clone().normalize(), .01, direction.length());
  assert.equal(ray.intersectObject(obstacle, false).length, 0, 'line of sight crosses a solid wall');
  const local = camera.position.clone().applyMatrix4(obstacle.matrixWorld.clone().invert());
  const point = (obstacle.geometry.boundsTree as MeshBVH).closestPointToPoint(local);
  assert.ok(point!.distance > .33, `camera near plane too close to a solid surface: ${point!.distance}`);
}

test('wall obstruction retracts the camera boom without switching viewing elevation', () => {
  const player = courier();
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  follow.reset(player);
  const originalElevation = elevation(camera, player);
  const obstacle = wall();
  const world = { obstacleMeshes: [obstacle], colliderMeshes: [obstacle] };
  for (let i = 0; i < 180; i++) {
    follow.update(1 / 60, player, world);
    assert.ok(Math.abs(elevation(camera, player) - originalElevation) < 1e-6, 'obstruction raised the camera over a roof');
    clearView(camera, player, obstacle);
  }
  assert.ok(camera.position.distanceTo(player.position) < 2.5, 'boom never contracted');
});

test('after an obstruction clears the boom recovers gradually instead of snapping', () => {
  const player = courier();
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  const obstacle = wall();
  follow.update(1 / 60, player, { obstacleMeshes: [obstacle] });
  const contracted = camera.position.clone();
  follow.update(1 / 60, player, { obstacleMeshes: [] });
  // limits scale with the default boom (5.6)
  assert.ok(camera.position.distanceTo(contracted) < .17, 'camera snapped to full distance after a corner');
  let previous = camera.position.clone();
  for (let frame = 0; frame < 240; frame++) {
    follow.update(1 / 60, player, { obstacleMeshes: [] });
    assert.ok(camera.position.distanceTo(previous) < .17, 'recovery produced a camera jump');
    previous.copy(camera.position);
  }
  const focus = player.position.clone().addScaledVector(player.normal, .84);
  assert.ok(Math.abs(camera.position.distanceTo(focus) - 5.6) < .002);
});

test('camera clearance catches thin roof edges missed by a central visibility ray', () => {
  const player = courier();
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  follow.reset(player);
  const obstacle = new Mesh(new BoxGeometry(1.5, .05, .5), new MeshBasicMaterial());
  obstacle.position.copy(camera.position).add(new Vector3(0, .2, 0));
  obstacle.updateMatrixWorld(true);
  const focus = player.position.clone().addScaledVector(player.normal, .84);
  const direction = camera.position.clone().sub(focus);
  assert.equal(new Raycaster(focus, direction.clone().normalize(), .01, direction.length()).intersectObject(obstacle, false).length, 0);
  follow.update(1 / 60, player, { obstacleMeshes: [obstacle] });
  clearView(camera, player, obstacle);
});

test('whole-planet camera transport keeps finite rotation and stable controls through both poles', () => {
  const player = courier();
  const planet = new Mesh(new SphereGeometry(20, 96, 64), new MeshBasicMaterial());
  planet.updateMatrixWorld(true);
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  follow.reset(player);
  const axis = new Vector3(1, 0, 0);
  let previousForward = follow.forward.clone();
  let previousCamera = camera.position.clone();
  for (let frame = 1; frame <= 2400; frame++) {
    const before = player.normal.clone();
    player.normal.set(0, 1, 0).applyAxisAngle(axis, frame * Math.PI * 4 / 2400);
    player.position.copy(player.normal).multiplyScalar(20);
    player.forward.copy(parallelTransport(player.forward, before, player.normal));
    follow.update(1 / 60, player, { obstacleMeshes: [], colliderMeshes: [planet] });
    assert.ok(Math.abs(follow.forward.dot(player.normal)) < 1e-8);
    assert.ok(previousForward.dot(follow.forward) > .9999, 'control heading flipped');
    assert.ok(camera.position.distanceTo(previousCamera) < .25, 'planet travel produced a camera discontinuity');
    assert.ok(camera.position.length() > 20.35, 'camera penetrated the planet');
    assert.ok(camera.quaternion.toArray().every(Number.isFinite));
    previousForward.copy(follow.forward);
    previousCamera.copy(camera.position);
  }
});

test('drag orbit interpolates continuously and recentering waits for manual input to settle', () => {
  const player = courier();
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  follow.reset(player);
  const before = camera.position.clone();
  follow.orbit(240, 120);
  assert.equal(camera.position.distanceTo(before), 0, 'input handler moved the camera outside the update loop');
  let previous = before;
  for (let i = 0; i < 60; i++) {
    follow.update(1 / 60, player, { obstacleMeshes: [] });
    assert.ok(camera.position.distanceTo(previous) < 1.65, 'drag orbit jumped');
    previous = camera.position.clone();
  }
  assert.ok(elevation(camera, player) > .5, 'pitch drag was not applied');
  assert.ok(follow.forward.dot(player.forward) < .9, 'automatic centering overrode manual input immediately');
});

test('camera follows the visible interpolated courier between fixed physics ticks', () => {
  const player = courier();
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  follow.reset(player);
  const initialPosition = camera.position.clone();
  Object.assign(player, {
    renderPosition: player.position.clone(),
    renderNormal: player.normal.clone(),
    renderForward: player.forward.clone(),
  });
  // A resolved capsule tick may be ahead of the displayed pose. The camera
  // should share the displayed position/up, not visibly chase that next tick.
  player.position.x += .04;
  player.normal.set(.002, 1, 0).normalize();
  follow.update(1 / 144, player, { obstacleMeshes: [] });
  assert.ok(camera.position.distanceTo(initialPosition) < 1e-9, 'camera stepped ahead of the visible courier');
  assert.ok(camera.up.distanceTo(player.renderNormal) < 1e-9, 'horizon used capsule orientation instead of the visible pose');
});


test('a cramped collision boom dissolves the local courier and restores visibility on exit', () => {
  const player = courier();
  const camera = new PerspectiveCamera(45, 1.7, .1, 150);
  const follow = new FollowCamera(camera);
  const obstacle = wall();
  obstacle.position.z = 1;
  obstacle.updateMatrixWorld(true);
  follow.update(1 / 60, player, { obstacleMeshes: [obstacle] });
  assert.equal(player.group.userData.cameraVisibility, 0, 'near camera still draws a screen-filling head');
  clearView(camera, player, obstacle);
  const direction = camera.position.clone().sub(player.position.clone().addScaledVector(player.normal, .84));
  assert.ok(direction.length() < player.height * .8, 'fixture did not exercise a cramped boom');
  let previousVisibility = 0;
  for (let frame = 0; frame < 240; frame++) {
    follow.update(1 / 60, player, { obstacleMeshes: [] });
    const visibility = player.group.userData.cameraVisibility as number;
    assert.ok(visibility >= previousVisibility, 'courier visibility flickered while recovering');
    assert.ok(visibility - previousVisibility < .15, 'courier popped back instantly');
    previousVisibility = visibility;
  }
  assert.ok(previousVisibility > .999, 'courier did not fully return on an open road');
});
