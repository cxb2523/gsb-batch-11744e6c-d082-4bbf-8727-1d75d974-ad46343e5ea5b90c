import { Matrix4, Vector3 } from 'three';
import { dir, PLANET_RADIUS } from '../chapter/data';
import { sphereOrientation, sphereTangent } from '../sphere';

/** Spherical layout helpers: local east/north tangent planes, frames whose
 * +Y is the planet normal, and bearings measured clockwise from north. */

export const DEG = Math.PI / 180;
/** World units per degree of arc on the land surface. */
export const UNIT_PER_DEG = PLANET_RADIUS * DEG;

const POLE = new Vector3(0, 1, 0);

export function northAt(normal: Vector3): Vector3 {
  return sphereTangent(normal, POLE);
}
export function eastAt(normal: Vector3): Vector3 {
  return new Vector3().crossVectors(northAt(normal), normal).normalize();
}

export function latLon(position: Vector3): { lat: number; lon: number } {
  const n = position.clone().normalize();
  return { lat: Math.asin(Math.max(-1, Math.min(1, n.y))) / DEG, lon: Math.atan2(n.x, n.z) / DEG };
}

/** Unit direction reached from `center` after moving `east` and `north` world units along the surface. */
export function offsetDir(center: Vector3, east: number, north: number): Vector3 {
  const e = eastAt(center), n = northAt(center);
  const angle = Math.hypot(east, north) / PLANET_RADIUS;
  if (angle < 1e-9) return center.clone();
  const tangent = e.multiplyScalar(east / (angle * PLANET_RADIUS)).addScaledVector(n, north / (angle * PLANET_RADIUS));
  return center.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent, Math.sin(angle)).normalize();
}

/** Tangent heading at `normal` for a compass bearing (0 = north, +90deg = east). */
export function headingFromBearing(normal: Vector3, bearing: number): Vector3 {
  return northAt(normal).multiplyScalar(Math.cos(bearing)).addScaledVector(eastAt(normal), Math.sin(bearing)).normalize();
}

/** Compass bearing of the direction from `from` toward `to` (radians). */
export function bearingTo(from: Vector3, to: Vector3): number {
  const f = from.clone().normalize();
  const d = sphereTangent(f, to.clone().sub(f.clone().multiplyScalar(to.dot(f))));
  return Math.atan2(d.dot(eastAt(f)), d.dot(northAt(f)));
}

/** Great-circle surface distance in world units. */
export function arcDistance(a: Vector3, b: Vector3): number {
  return Math.acos(Math.max(-1, Math.min(1, a.clone().normalize().dot(b.clone().normalize())))) * PLANET_RADIUS;
}

export interface Frame {
  /** Ground point (the frame origin). */
  origin: Vector3;
  up: Vector3;
  /** Direction local +Z points toward. */
  forward: Vector3;
  /** Local-to-world transform: +Y up, +Z forward. */
  matrix: Matrix4;
}

export function makeFrame(origin: Vector3, forward: Vector3): Frame {
  const up = origin.clone().normalize();
  const f = sphereTangent(up, forward);
  const matrix = new Matrix4().makeRotationFromQuaternion(sphereOrientation(up, f)).setPosition(origin);
  return { origin: origin.clone(), up, forward: f, matrix };
}

/** Local frame at a world point with its +Z toward `bearing` radians from north. */
export function frameAtBearing(origin: Vector3, bearing: number): Frame {
  const up = origin.clone().normalize();
  return makeFrame(origin, headingFromBearing(up, bearing));
}

/** Point in a frame's local coordinates mapped to the world. */
export function toWorld(frame: Frame, x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).applyMatrix4(frame.matrix);
}

/** Lat/lon helper that returns the unit direction. */
export function at(lat: number, lon: number): Vector3 { return dir(lat, lon); }
