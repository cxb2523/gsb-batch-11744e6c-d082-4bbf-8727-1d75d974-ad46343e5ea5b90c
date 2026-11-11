import { Vector3 } from 'three';
import { dir, PLANET_RADIUS } from '../chapter/data';
import { makeFrame, northAt, eastAt, DEG, type Frame } from './frame';
import { groundPoint, terrainHeight } from './terrain';

/** Layout helpers that keep small objects snapped to the curved ground. */

const AXIS_X = new Vector3(1, 0, 0);

/** Move `distance` along a tangent direction from a unit normal, staying on the sphere. */
export function walk(normal: Vector3, tangent: Vector3, distance: number): Vector3 {
  const angle = distance / PLANET_RADIUS;
  return normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent.clone().normalize(), Math.sin(angle)).normalize();
}

/** Unit direction after moving (x right, z forward) from a frame's origin. */
export function subDir(frame: Frame, x: number, z: number): Vector3 {
  const right = AXIS_X.clone().transformDirection(frame.matrix);
  const v = right.multiplyScalar(x).addScaledVector(frame.forward, z);
  const len = v.length();
  if (len < 1e-9) return frame.up.clone();
  return walk(frame.up, v, len);
}

/** A frame at an offset in another frame's coordinates, snapped to terrain. */
export function sub(frame: Frame, x: number, z: number, yaw = 0, lift = 0): Frame {
  const n = subDir(frame, x, z);
  const origin = groundPoint(n).addScaledVector(n, lift);
  const heading = frame.forward.clone().applyAxisAngle(frame.up, yaw);
  return makeFrame(origin, heading);
}

/** Like sub(), but keeps the parent frame's radius (decks, piers, platforms) instead of snapping to terrain. */
export function subLevel(frame: Frame, x: number, z: number, yaw = 0): Frame {
  const n = subDir(frame, x, z);
  const heading = frame.forward.clone().applyAxisAngle(frame.up, yaw);
  return makeFrame(n.multiplyScalar(frame.origin.length()), heading);
}

/** World ground point at an offset in a frame. */
export function subPoint(frame: Frame, x: number, z: number, lift = 0): Vector3 {
  const n = subDir(frame, x, z);
  return groundPoint(n).addScaledVector(n, lift);
}

/** Direction at lat/lon plus eastward/northward offsets in world units. */
export function offsetFrom(lat: number, lon: number, east: number, north: number): Vector3 {
  const c = dir(lat, lon);
  const e = eastAt(c), n = northAt(c);
  const v = e.multiplyScalar(east).addScaledVector(n, north);
  const len = v.length();
  return len < 1e-9 ? c : walk(c, v, len);
}

/** Great-circle interpolation between two unit directions. */
export function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  const theta = Math.acos(dot);
  if (theta < 1e-6) return a.clone();
  const s = Math.sin(theta);
  return a.clone().multiplyScalar(Math.sin((1 - t) * theta) / s).addScaledVector(b, Math.sin(t * theta) / s).normalize();
}

/** Points along a polyline of unit directions every `step` world units. */
export function sampleLine(points: Vector3[], step: number): Vector3[] {
  const out: Vector3[] = [];
  let carry = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const length = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * PLANET_RADIUS;
    let t = carry / Math.max(length, 1e-6);
    while (t <= 1) {
      out.push(slerp(a, b, t));
      t += step / Math.max(length, 1e-6);
    }
    carry = (t - 1) * length;
  }
  return out;
}

export function lineLength(points: Vector3[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < points.length; i++) sum += Math.acos(Math.max(-1, Math.min(1, points[i].dot(points[i + 1])))) * PLANET_RADIUS;
  return sum;
}

/** Catmull-Rom smoothing of a directional polyline (unit vectors). */
export function smoothLine(points: Vector3[], perSegment = 6): Vector3[] {
  if (points.length < 3) return points.map(p => p.clone());
  const out: Vector3[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t;
      const v = new Vector3();
      v.addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t);
      v.addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1);
      v.addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t);
      v.addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
      out.push(v.normalize());
    }
  }
  out.push(points[points.length - 1].clone());
  return out;
}

export function groundAt(n: Vector3, lift = 0): Vector3 {
  const u = n.clone().normalize();
  return u.multiplyScalar(terrainHeight(u) + lift);
}

export { DEG };
