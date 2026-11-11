import { Vector3 } from 'three';
import { dir, SEA_RADIUS } from '../chapter/data';
import type { Ctx } from './context';
import { bush, flowerPatch, grassTuft, meadowPatch, mushroom, palm, pineTree, poplar, reeds, rock, rockCluster, roundTree, stump } from './foliage';
import { dirtColor } from './ground';
import { lampPost } from './props';
import { smoothLine, sampleLine, walk } from './layout';
import { GLOW } from './materials';
import { C } from './palette';
import { scatterPlanet } from './scatter';
import { terrainHeight } from './terrain';
import { latLon } from './frame';

/** Roads between the districts and the great tree, lamp posts along them, and
 * the wild meadows, groves, rocks and shores that fill the rest of the planet. */

export interface RoadSpec { name: string; points: [number, number][]; width: number; lamps?: number }

export const ROADS: RoadSpec[] = [
  { name: 'harbor-oldstreet', width: 0.72, lamps: 4, points: [[12, -9], [13, -20], [15, -34], [15, -50], [14, -66], [11, -80], [8, -91], [6, -97]] },
  { name: 'harbor-workshop', width: 0.72, lamps: 4, points: [[12, 7], [11, 22], [11, 40], [13, 58], [16, 76], [18, 94], [18, 106]] },
  { name: 'harbor-tree', width: 0.72, lamps: 4, points: [[19, -3], [28, 0], [37, 2], [45, 0], [50, 0]] },
  { name: 'workshop-tree', width: 0.72, lamps: 4, points: [[26, 111], [36, 106], [46, 100], [56, 94], [64, 88], [70, 83], [73.3, 79.5]] },
  { name: 'oldstreet-tree', width: 0.72, lamps: 4, points: [[24, -113], [34, -108], [44, -102], [54, -96], [63, -90], [70, -84], [73.3, -79.5]] },
  { name: 'street-west', width: 0.6, points: [[25, -139], [27, -148], [26, -160]] },
  { name: 'terraces-south', width: 0.6, points: [[-3, 130], [-12, 134], [-22, 138], [-31, 142]] },
];

export function buildRoads(ctx: Ctx): void {
  const { ground, b } = ctx;
  for (const road of ROADS) {
    const line = sampleLine(smoothLine(road.points.map(([a, o]) => dir(a, o)), 8), 0.32);
    ground.ribbon(line, road.width, dirtColor, { lift: 0.02 });
    if (road.lamps) {
      for (let i = 1; i <= road.lamps; i++) {
        const idx = Math.floor(line.length * i / (road.lamps + 1));
        const n = line[idx];
        const next = line[Math.min(line.length - 1, idx + 1)];
        const side = new Vector3().crossVectors(n, next.clone().sub(n)).normalize();
        const at = walk(n, side, 0.8);
        if (terrainHeight(at) < SEA_RADIUS + 0.3) continue;
        lampPost(b.kit(b.placeAt(at, 0)), 1.9, GLOW.finale, C.coal, C.glassWarm, false);
        ground.clear(at, 0.4);
      }
    }
  }
  // the cat patrols the harbor and the first stretch of the north road
  const northRoad = sampleLine(smoothLine(ROADS[2].points.map(([a, o]) => dir(a, o)), 4), 1.0).slice(0, 8);
  const loop = b.paths.cat ?? [];
  b.paths.cat = [...loop, ...northRoad.map(n => n.clone().multiplyScalar(terrainHeight(n))), ...northRoad.slice().reverse().map(n => n.clone().multiplyScalar(terrainHeight(n)))];
}

export function buildWild(ctx: Ctx): void {
  const r = ctx.b.random;
  const pineZone = (n: Vector3) => Math.abs(latLon(n).lat) > 38;
  scatterPlanet(ctx, 120, { margin: 0.9, minHeight: SEA_RADIUS + 0.5 }, (k, n) => {
    const roll = r();
    if (pineZone(n) && roll < 0.65) pineTree(k, r, { scale: 0.95 });
    else if (roll < 0.75) roundTree(k, r, { scale: 1.0 });
    else if (roll < 0.88) poplar(k, r);
    else if (roll < 0.95) roundTree(k, r, { scale: 0.85, leaf: C.autumn, leafAlt: C.orange });
    else pineTree(k, r, { scale: 0.8 });
  });
  scatterPlanet(ctx, 70, { margin: 0.5, minHeight: SEA_RADIUS + 0.4 }, k => bush(k, r, { berries: r() > 0.75 ? C.red : null }));
  scatterPlanet(ctx, 70, { margin: 0.35, minHeight: SEA_RADIUS + 0.4 }, k => meadowPatch(k, r, 0.7));
  scatterPlanet(ctx, 40, { margin: 0.35, minHeight: SEA_RADIUS + 0.4 }, k => flowerPatch(k, r, 6, 0.4));
  scatterPlanet(ctx, 34, { margin: 0.6, minHeight: SEA_RADIUS + 0.3 }, k => rockCluster(k, r, 3 + Math.floor(r() * 3), 0.7, 0.4));
  scatterPlanet(ctx, 22, { margin: 0.5, minHeight: SEA_RADIUS + 0.4 }, k => rock(k, r, 0.55 + r() * 0.35, C.rock, true));
  scatterPlanet(ctx, 1800, { margin: 0.1, minHeight: SEA_RADIUS + 0.28, attempts: 4 }, k => grassTuft(k, r, r() > 0.75 ? C.leafMid : C.leafLight));
  scatterPlanet(ctx, 26, { margin: 0.4, minHeight: SEA_RADIUS + 0.05, maxHeight: SEA_RADIUS + 0.4, attempts: 30 }, k => reeds(k, r, 6));
  scatterPlanet(ctx, 10, { margin: 0.5, minHeight: SEA_RADIUS + 0.1, maxHeight: SEA_RADIUS + 0.45, attempts: 40 }, k => palm(k, r, 1.05));
  scatterPlanet(ctx, 16, { margin: 0.3, minHeight: SEA_RADIUS + 0.5 }, k => mushroom(k, r, r() > 0.5 ? C.tulip : C.orange));
  scatterPlanet(ctx, 14, { margin: 0.4, minHeight: SEA_RADIUS + 0.5 }, k => stump(k, r));
}
