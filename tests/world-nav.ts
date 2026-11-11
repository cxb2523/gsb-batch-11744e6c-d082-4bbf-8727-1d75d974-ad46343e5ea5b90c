import { Vector3 } from 'three';
import type { World } from '../src/contracts.ts';
import { CollisionWorld } from '../src/physics.ts';

/** Test helper: sample the planet with a Fibonacci grid, keep the spots where
 * the player capsule fits and stands on a walkable floor, connect neighbors that
 * can be walked between (step height, clear chest/knee rays) and flood-fill
 * from a start point. This mirrors the physics rules without simulating them. */

export interface NavMesh {
  points: Vector3[];
  normals: Vector3[];
  adjacency: number[][];
  reachable: Uint8Array;
  start: number;
  spacing: number;
  collision: CollisionWorld;
}

export const PLAYER_HEIGHT = 1.155;
export const PLAYER_RADIUS = PLAYER_HEIGHT * 0.2;

export function buildNav(world: World, start: Vector3, count = 30000, collision = new CollisionWorld(world.colliderMeshes)): NavMesh {
  const points: Vector3[] = [], normals: Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const ids = new Map<string, number[]>();
  const cell = 0.5;
  const key = (p: Vector3) => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
  const spacing = Math.sqrt(4 * Math.PI * world.radius * world.radius / count);
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + 0.5) / count * 2, r = Math.sqrt(1 - y * y), a = i * golden;
    const normal = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    // scan every floor from above the tallest structure down to the planet's core shell
    let from = normal.clone().multiplyScalar(world.radius + 7);
    for (let layer = 0; layer < 3; layer++) {
      const support = collision.supportAt(from, normal, 14);
      if (!support) break;
      const slope = Math.max(0.7, support.normal.dot(normal));
      // On a slope the capsule rests on its lower sphere, so the feet sit slightly above the plane.
      const feet = support.point.clone().addScaledVector(normal, 0.003 + PLAYER_RADIUS * (1 / slope - 1));
      const walkable = support.normal.dot(normal) >= 0.7 && collision.penetration(feet, normal, PLAYER_HEIGHT, PLAYER_RADIUS) <= 0.012;
      if (walkable) {
        points.push(feet); normals.push(normal.clone());
        const k = key(feet);
        (ids.get(k) ?? ids.set(k, []).get(k)!).push(points.length - 1);
      }
      from = feet.clone().addScaledVector(normal, -0.2);
      if (from.length() < world.radius - 2.5) break;
    }
  }
  const adjacency: number[][] = points.map(() => []);
  const near = Math.max(spacing * 1.7, 0.78);
  const chestA = new Vector3(), chestB = new Vector3(), delta = new Vector3();
  points.forEach((p, i) => {
    const kx = Math.floor(p.x / cell), ky = Math.floor(p.y / cell), kz = Math.floor(p.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of ids.get(`${kx + dx},${ky + dy},${kz + dz}`) ?? []) {
        if (j <= i) continue;
        const q = points[j];
        if (p.distanceTo(q) > near) continue;
        const up = normals[i];
        delta.copy(q).sub(p);
        const rise = Math.abs(delta.dot(up));
        if (rise > 0.34) continue;
        let clear = true;
        for (const height of [0.55, 0.3]) {
          chestA.copy(p).addScaledVector(up, height + Math.max(0, delta.dot(up)));
          chestB.copy(q).addScaledVector(normals[j], height + Math.max(0, -delta.dot(up)));
          if (!collision.hasLineOfSight(chestA, chestB, 0.01)) { clear = false; break; }
        }
        if (!clear) continue;
        adjacency[i].push(j); adjacency[j].push(i);
      }
    }
  });
  const reachable = new Uint8Array(points.length);
  let startIndex = 0, best = Infinity;
  points.forEach((p, i) => { const d = p.distanceTo(start); if (d < best) { best = d; startIndex = i; } });
  const stack = [startIndex];
  reachable[startIndex] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of adjacency[i]) if (!reachable[j]) { reachable[j] = 1; stack.push(j); }
  }
  return { points, normals, adjacency, reachable, start: startIndex, spacing, collision };
}

/** Nearest reachable standing point whose feet are below `plug` by a plausible
 * hand height (0.3..1.15) and within `maxDistance` (3D). */
export function standingFor(nav: NavMesh, plug: Vector3, up: Vector3, maxDistance = 1.2): { index: number; distance: number } | null {
  let best: { index: number; distance: number } | null = null;
  nav.points.forEach((p, i) => {
    if (!nav.reachable[i]) return;
    const distance = p.distanceTo(plug);
    if (distance > maxDistance) return;
    const drop = plug.clone().sub(p).dot(up);
    if (drop < 0.3 || drop > 1.15) return;
    if (!best || distance < best.distance) best = { index: i, distance };
  });
  return best;
}

/** Closest reachable point to a position, for resident/door checks. */
export function nearestReachable(nav: NavMesh, position: Vector3, maxHeightAbove = Infinity): { distance: number; index: number } {
  let best = Infinity, index = nav.start;
  nav.points.forEach((p, i) => {
    if (!nav.reachable[i]) return;
    const d = p.distanceTo(position);
    if (d < best && position.clone().sub(p).dot(nav.normals[i]) < maxHeightAbove) { best = d; index = i; }
  });
  return { distance: best, index };
}

/** Breadth-first shortest route between nav nodes. */
export function route(nav: NavMesh, from: number, to: number): number[] {
  if (from < 0 || to < 0) return [];
  const parent = new Int32Array(nav.points.length).fill(-1);
  const queue = [from];
  parent[from] = from;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i === to) break;
    for (const j of nav.adjacency[i]) if (parent[j] < 0) { parent[j] = i; queue.push(j); }
  }
  if (parent[to] < 0) return [];
  const path = [to];
  while (path[path.length - 1] !== from) path.push(parent[path[path.length - 1]]);
  return path.reverse();
}
