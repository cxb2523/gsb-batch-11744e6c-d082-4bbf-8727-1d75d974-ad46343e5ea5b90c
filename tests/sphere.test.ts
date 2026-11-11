import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { advanceOnSphere, parallelTransport, sphereOrientation, sphereTangent } from '../src/sphere.ts';

function close(actual: number, expected: number, tolerance = 1e-7): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
}

function unitTangent(normal: Vector3, heading: Vector3): void {
  close(normal.length(), 1);
  close(heading.length(), 1);
  close(normal.dot(heading), 0);
}

test('great-circle movement circles a globe and crosses both poles without heading drift', () => {
  let normal = new Vector3(0, 1, 0);
  let heading = new Vector3(0, 0, -1);
  const startHeading = heading.clone();
  const radius = 20;
  const count = 4096;
  const distance = Math.PI * 2 * radius / count;
  for (let step = 0; step < count; step++) {
    const frame = advanceOnSphere(normal, heading, heading, distance, radius);
    normal = frame.normal;
    heading = frame.forward;
    unitTangent(normal, heading);
    if (step === count / 2 - 1) close(normal.y, -1);
  }
  close(normal.distanceTo(new Vector3(0, 1, 0)), 0);
  close(heading.distanceTo(startHeading), 0);
});

test('transport preserves a sideways heading across a geographic pole', () => {
  const before = new Vector3(0.0001, 1, 0).normalize();
  const after = new Vector3(-0.0001, 1, 0).normalize();
  const heading = sphereTangent(before, new Vector3(1, 0, 0));
  const moved = parallelTransport(heading, before, after);
  unitTangent(after, moved);
  assert.ok(moved.dot(heading) > 0.99999);
});

test('orientation makes gravity local-down on the opposite side of the globe', () => {
  const normal = new Vector3(0, -1, 0);
  const heading = sphereTangent(normal);
  const orientation = sphereOrientation(normal, heading);
  const localUp = new Vector3(0, 1, 0).applyQuaternion(orientation);
  const localDown = new Vector3(0, -1, 0).applyQuaternion(orientation);
  close(localUp.distanceTo(normal), 0);
  close(localDown.distanceTo(normal.clone().negate()), 0);
  close(new Vector3(0, 0, 1).applyQuaternion(orientation).distanceTo(heading), 0);
});

test('zero preferred tangent and exact antipodes still produce finite perpendicular headings', () => {
  const normal = new Vector3(0, 0, 1);
  const heading = sphereTangent(normal, normal);
  const transported = parallelTransport(heading, normal, normal.clone().negate());
  unitTangent(normal, heading);
  unitTangent(normal.clone().negate(), transported);
});
