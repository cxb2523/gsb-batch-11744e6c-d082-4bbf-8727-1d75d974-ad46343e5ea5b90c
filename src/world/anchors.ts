import { Vector3 } from 'three';
import { dir } from '../chapter/data';
import type { SurfaceAnchor } from '../contracts';
import { sphereTangent } from '../sphere';
import { groundPoint } from './terrain';

/** Surface anchors from lat/lon (ground point + facing toward another lat/lon). */
export function anchorAt(lat: number, lon: number, faceLat?: number, faceLon?: number, lift = 0): SurfaceAnchor {
  const normal = dir(lat, lon);
  const position = groundPoint(normal).addScaledVector(normal, lift);
  const toward = faceLat === undefined ? new Vector3(0, 0, -1) : dir(faceLat, faceLon!).sub(normal);
  return { position, normal, forward: sphereTangent(normal, toward) };
}

/** Anchor from a ground direction facing another direction. */
export function anchorFrom(n: Vector3, faceToward: Vector3, lift = 0, radius?: number): SurfaceAnchor {
  const normal = n.clone().normalize();
  const position = radius ? normal.clone().multiplyScalar(radius + lift) : groundPoint(normal).addScaledVector(normal, lift);
  return { position, normal, forward: sphereTangent(normal, faceToward.clone().sub(normal)) };
}
