import { Matrix4, Quaternion, Vector3 } from 'three';

const EPSILON = 1e-10;

/** A stable tangent even at geographic poles; gameplay never uses latitude Euler angles. */
export function sphereTangent(normal: Vector3, preferred = new Vector3(0, 0, -1)): Vector3 {
  const tangent = preferred.clone().addScaledVector(normal, -preferred.dot(normal));
  if (tangent.lengthSq() < EPSILON) {
    const reference = Math.abs(normal.x) < 0.8 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    tangent.copy(reference).addScaledVector(normal, -reference.dot(normal));
  }
  return tangent.normalize();
}

/** Move a tangent heading with the surface instead of rebuilding it from world-up. */
export function parallelTransport(vector: Vector3, fromNormal: Vector3, toNormal: Vector3): Vector3 {
  const rotation = new Quaternion();
  if (fromNormal.dot(toNormal) < -1 + EPSILON) {
    // A half-turn has no unique shortest arc. Use the existing heading as its axis.
    rotation.setFromAxisAngle(sphereTangent(fromNormal, vector), Math.PI);
  } else {
    rotation.setFromUnitVectors(fromNormal, toNormal);
  }
  return sphereTangent(toNormal, vector.clone().applyQuaternion(rotation));
}

export interface SphereStep {
  normal: Vector3;
  forward: Vector3;
  direction: Vector3;
}

/** Exact great-circle integration, transporting both visual heading and movement. */
export function advanceOnSphere(
  normal: Vector3,
  forward: Vector3,
  direction: Vector3,
  distance: number,
  radius: number,
): SphereStep {
  if (!(radius > 0) || !Number.isFinite(radius)) throw new Error('Sphere radius must be positive and finite.');
  const tangent = sphereTangent(normal, direction);
  const axis = new Vector3().crossVectors(normal, tangent).normalize();
  const rotation = new Quaternion().setFromAxisAngle(axis, distance / radius);
  const nextNormal = normal.clone().applyQuaternion(rotation).normalize();
  return {
    normal: nextNormal,
    forward: sphereTangent(nextNormal, forward.clone().applyQuaternion(rotation)),
    direction: sphereTangent(nextNormal, tangent.applyQuaternion(rotation)),
  };
}

export function turnHeading(forward: Vector3, target: Vector3, normal: Vector3, amount: number): Vector3 {
  const projected = sphereTangent(normal, target);
  const cross = new Vector3().crossVectors(forward, projected);
  const angle = Math.atan2(cross.dot(normal), forward.dot(projected));
  return sphereTangent(normal, forward.clone().applyAxisAngle(normal, angle * Math.min(1, Math.max(0, amount))));
}

/** Characters use local +Y for feet-to-head and local +Z for their face. */
export function sphereOrientation(normal: Vector3, forward: Vector3): Quaternion {
  const tangent = sphereTangent(normal, forward);
  const right = new Vector3().crossVectors(normal, tangent).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, normal, tangent));
}
