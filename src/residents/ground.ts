import { Raycaster, Vector3 } from 'three';
import type { World } from '../contracts';

/** Ground probing for residents that walk (the cat, Wick). Static residents
 * keep their authored anchor; walkers re-sample the collider set so they
 * follow floors, piers and slopes instead of the bare terrain radius. */

const ray = new Raycaster();
ray.firstHitOnly = true;
const origin = new Vector3();
const down = new Vector3();

/** Radius of the surface under `normal`, searched from just above `hint`. */
export function groundRadius(world: World, normal: Vector3, hint: number, up = 0.55, depth = 1.2): number {
  const meshes = world.colliderMeshes;
  if (meshes && meshes.length) {
    origin.copy(normal).multiplyScalar(hint + up);
    down.copy(normal).negate();
    ray.set(origin, down);
    ray.near = 0;
    ray.far = up + depth;
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length) return hint + up - hits[0].distance;
  }
  const sampled = world.sampleRadius(normal);
  return Number.isFinite(sampled) && sampled > 0 ? sampled : hint;
}

/** True when something solid blocks a short horizontal probe at knee height. */
export function blocked(world: World, from: Vector3, direction: Vector3, normal: Vector3, distance: number): boolean {
  const meshes = world.colliderMeshes;
  if (!meshes || !meshes.length) return false;
  for (const height of [0.22, 0.5]) {
    origin.copy(from).addScaledVector(normal, height);
    ray.set(origin, direction);
    ray.near = 0;
    ray.far = distance;
    if (ray.intersectObjects(meshes, false).length) return true;
  }
  return false;
}
