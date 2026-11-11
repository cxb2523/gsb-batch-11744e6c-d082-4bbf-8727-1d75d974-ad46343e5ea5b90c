import {
  BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Ray, SphereGeometry, Vector3,
} from 'three';
import { acceleratedRaycast, computeBoundsTree, type MeshBVH } from 'three-mesh-bvh';
import {
  dir, FAR_HOUSE, GREAT_TREE, NPC_PLACEMENTS, PLANET_RADIUS, SEA_RADIUS, SOCKET_HINTS, SPAWN,
  type ConnectionId, type NpcId, type SocketId,
} from '../chapter/data';
import type { SurfaceAnchor, World, WorldAnchors } from '../contracts';
import { createWaterMaterial } from '../art/water';
import { toonShared } from '../art/toon';
import { sphereTangent } from '../sphere';
import { Builder, type Ctx } from './context';
import { installDebugCamera } from './debug';
import { Ground } from './ground';
import { createWorldMaterials } from './materials';
import { buildTerrain, buildSeaBlockers, type PaintHook } from './terrainMesh';
import { groundPoint, terrainHeight } from './terrain';
import { buildHarbor } from './harbor';
import { buildOldStreet } from './oldstreet';
import { buildWorkshop } from './workshop';
import { buildGrove } from './grove';
import { buildFarHouse } from './farhouse';
import { buildRoads, buildWild } from './wild';
import { GLOW } from './materials';
import { buildHalos, resetHalos } from './halos';

function setupBounds(mesh: Mesh): void {
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  computeBoundsTree.call(mesh.geometry, { targetLeafSize: 8 });
  mesh.raycast = acceleratedRaycast;
}

function hintAnchor(lat: number, lon: number, faceLat?: number, faceLon?: number, lift = 0): SurfaceAnchor {
  const normal = dir(lat, lon);
  const position = groundPoint(normal).addScaledVector(normal, lift);
  const toward = faceLat === undefined ? new Vector3(0, 0, -1) : dir(faceLat, faceLon!).sub(normal);
  return { position, normal, forward: sphereTangent(normal, toward) };
}

export { terrainHeight };

export async function createWorld(): Promise<World> {
  const group = new Group();
  group.name = 'UnspoolWorld';
  resetHalos();

  const mats = createWorldMaterials();
  const b = new Builder(11);
  const ground = new Ground(b);
  const paint: PaintHook[] = [];
  const ctx: Ctx = { b, ground, mats, group, paint };

  buildHarbor(ctx);
  buildOldStreet(ctx);
  buildWorkshop(ctx);
  buildGrove(ctx);
  buildFarHouse(ctx);
  buildRoads(ctx);
  buildWild(ctx);
  // finale: every lantern on the planet warms up with the dusk
  b.onFinale(a => { mats.setGlow(GLOW.finale, [1.25, 0.82, 0.42], a * 1.1); mats.setGlow(GLOW.harborWindows, [1.1, 0.82, 0.42], a * 0.9); });

  buildHalos(ctx);

  // Terrain, chunked for culling; one full copy for collision.
  const terrain = buildTerrain(36, paint);
  for (const chunk of terrain.chunks) {
    const mesh = new Mesh(chunk, mats.terrain);
    mesh.name = 'Terrain';
    group.add(mesh);
  }
  const water = new Mesh(new SphereGeometry(SEA_RADIUS, 72, 48), createWaterMaterial());
  water.name = 'Ocean';
  group.add(water);

  // Zone meshes.
  let triangles = 0;
  /** Casters that only need shadows while their zone is near the sunlit side (see update). */
  const casters: { mesh: Mesh; dir: Vector3 }[] = [];
  /** Fine details that vanish into the ink at title-camera distance. */
  const fineDetail: Mesh[] = [];
  for (const zone of b.zones) {
    for (const [collector, material, name] of [[zone.solid, mats.solid, 'Solid'], [zone.detail, mats.detail, 'Detail'], [zone.foliage, mats.foliage, 'Foliage'], [zone.small, mats.small, 'Small']] as const) {
      const geometry = collector.build();
      if (!geometry) continue;
      const mesh = new Mesh(geometry, material);
      mesh.name = `${name}:${zone.id}`;
      group.add(mesh);
      triangles += collector.triangles;
      if (material === mats.solid || material === mats.foliage) casters.push({ mesh, dir: zone.dir });
      else fineDetail.push(mesh);
    }
  }

  // Anchors: authored ones, with hint fallbacks so nothing is ever undefined.
  const sockets = {} as Record<SocketId, SurfaceAnchor>;
  for (const [id, hint] of Object.entries(SOCKET_HINTS) as [SocketId, typeof SOCKET_HINTS[SocketId]][]) {
    sockets[id] = b.sockets[id] ?? hintAnchor(hint.lat, hint.lon, undefined, undefined, 0.7);
  }
  const npcs = {} as Record<NpcId, SurfaceAnchor>;
  for (const npc of NPC_PLACEMENTS) npcs[npc.id] = b.npcs[npc.id] ?? hintAnchor(npc.lat, npc.lon, npc.faceLat, npc.faceLon);
  const anchors: WorldAnchors = {
    spawn: b.spawn ?? hintAnchor(SPAWN.lat, SPAWN.lon, SPAWN.faceLat, SPAWN.faceLon),
    sockets, npcs,
    farHouseDoor: b.farDoor ?? hintAnchor(FAR_HOUSE.lat, FAR_HOUSE.lon),
    greatTree: b.greatTree ?? hintAnchor(GREAT_TREE.lat, GREAT_TREE.lon),
    paths: b.paths,
  };

  // Collision: terrain, sea walls, authored structures.
  const collisionMaterial = new MeshBasicMaterial({ side: DoubleSide });
  const terrainCollider = new Mesh(terrain.geometry, collisionMaterial);
  terrainCollider.name = 'TerrainCollider';
  terrainCollider.visible = false;
  setupBounds(terrainCollider);
  const blockerGeometry = new BufferGeometry();
  blockerGeometry.setAttribute('position', new BufferAttribute(buildSeaBlockers(terrain.geometry, p => b.openings.some(test => test(p))), 3));
  const blockers = new Mesh(blockerGeometry, new MeshBasicMaterial());
  blockers.name = 'SeaWalls';
  blockers.visible = false;
  setupBounds(blockers);
  const obstacles: Mesh[] = [blockers];
  const structureGeometry = b.structures.build();
  if (structureGeometry) {
    const structures = new Mesh(structureGeometry, new MeshBasicMaterial());
    structures.name = 'Structures';
    structures.visible = false;
    setupBounds(structures);
    obstacles.unshift(structures);
  }
  const colliderMeshes = [terrainCollider, ...obstacles];

  // The spawn may sit on a deck (the pier): lift it from the terrain shell to
  // the topmost walkable floor along its normal.
  {
    const normal = anchors.spawn.normal;
    const down = new Ray(normal.clone().multiplyScalar(PLANET_RADIUS + 6), normal.clone().negate());
    let best: number | null = null;
    for (const mesh of colliderMeshes) {
      const hit = (mesh.geometry.boundsTree as MeshBVH | undefined)?.raycastFirst(down, DoubleSide);
      if (hit && hit.face && hit.face.normal.dot(normal) > 0.7 && (best === null || hit.distance < best)) best = hit.distance;
    }
    if (best !== null) anchors.spawn.position.copy(down.origin).addScaledVector(down.direction, best);
  }

  const ray = new Ray();
  const bvh = terrain.geometry.boundsTree as MeshBVH;
  const debugCamera = installDebugCamera(group);
  const sun = new Vector3();
  // Track the active camera so far views (title screen) can drop fine detail.
  let camera: { position: Vector3 } | undefined;
  const firstTerrain = group.children.find(child => child.name === 'Terrain') as Mesh;
  const baseHook = firstTerrain.onBeforeRender;
  firstTerrain.onBeforeRender = function (r, sc, c, g, m, gr) { camera = c; baseHook.call(this, r, sc, c, g, m, gr); };
  return {
    group, radius: PLANET_RADIUS, groundMeshes: [terrainCollider], obstacleMeshes: obstacles, colliderMeshes,
    spawnNormal: anchors.spawn.normal.clone(), anchors,
    sampleRadius(normal) {
      ray.set(new Vector3(0, 0, 0), normal.clone().normalize());
      const hit = bvh.raycastFirst(ray, DoubleSide);
      return hit ? hit.distance : terrainHeight(normal.clone().normalize());
    },
    isWater(point) { return point.length() < SEA_RADIUS + 0.05 && terrainHeight(point.clone().normalize()) < SEA_RADIUS; },
    setView() {},
    update(time, dt) {
      for (const run of b.hooks.updaters) run(time, dt);
      // The shadow pass draws every caster inside its orthographic box, even on the far side
      // of the planet. Only zones toward the (player-following) sun can shadow anything visible.
      sun.copy(toonShared.uLightPosition.value).normalize();
      if (camera) {
        const far = camera.position.length() > 30;
        for (const mesh of fineDetail) if (mesh.visible === far) mesh.visible = !far;
      }
      for (const caster of casters) {
        const facing = caster.dir.dot(sun) > -0.05;
        if (caster.mesh.castShadow !== facing) caster.mesh.castShadow = facing;
      }
      debugCamera?.();
    },
    activate(id: ConnectionId, instant: boolean) {
      for (const run of b.hooks.activate[id] ?? []) run(instant);
    },
    setFinale(amount) { for (const run of b.hooks.finale) run(amount); },
    stats() {
      const out: Record<string, number> = {
        colliders: colliderMeshes.length, staticTriangles: triangles, structureTriangles: b.structures.positions.length / 9,
        terrainTriangles: terrain.geometry.getAttribute('position').count / 3,
      };
      for (const zone of b.zones) {
        out[`tri:${zone.id}`] = zone.solid.triangles + zone.detail.triangles + zone.foliage.triangles + zone.small.triangles;
        out[`fol:${zone.id}`] = zone.foliage.triangles;
      }
      return out;
    },
  };
}
