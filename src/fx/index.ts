import { Group, Vector3, type ShaderMaterial } from 'three';
import { dir } from '../chapter/data';
import type { EnvironmentFx, FxFrame, World } from '../contracts';
import { toonShared } from '../art/toon';
import { createBirds } from './birds';
import { createButterflies, type ButterflyZone } from './butterflies';
import { createBurstSystem } from './burst';
import { createDust, createFireflies } from './motes';
import { createPetals, type PetalEmitter } from './petals';
import { fxUniforms } from './shared';

/** Ambient and celebratory effects: birds circling over sea and districts,
 * butterflies over revived flower fields, pollen/dust around the player,
 * fireflies at dusk, falling blossom petals and the connection burst.
 *
 * Everything is GPU-driven (instanced geometry or points positioned in the
 * vertex shader) so the whole layer costs 7 draw calls and almost no CPU.
 * Sketch/color state is decided in the shaders from the shared revival waves
 * (`revivalDetail`), so effects turn from pencil to color together with the world.
 *
 * Optional world hint: `world.anchors.paths.blossomTree = [groundPoint]` places the
 * Old Street blossom tree; otherwise it defaults to dir(15, -118). */
export async function createEnvironmentFx(world: World): Promise<EnvironmentFx> {
  const group = new Group();
  group.name = 'EnvironmentFx';

  const groundOf = (point: Vector3): Vector3 => {
    const normal = point.clone().normalize();
    return normal.multiplyScalar(world.sampleRadius(normal));
  };
  const at = (lat: number, lon: number) => groundOf(dir(lat, lon));
  const anchors = world.anchors;
  const blossomTree = groundOf(anchors.paths.blossomTree?.[0] ?? dir(15, -118));
  const greatTree = groundOf(anchors.greatTree.position);

  const zones: ButterflyZone[] = [
    { name: 'flower terraces', ground: groundOf(anchors.sockets.garden.position), count: 14, radius: 2.8, altitude: [0.5, 1.5] },
    { name: 'sprout meadow', ground: groundOf(anchors.npcs.sprout.position), count: 8, radius: 2.2, altitude: [0.5, 1.4] },
    { name: 'blossom tree', ground: blossomTree, count: 5, radius: 2.0, altitude: [1.0, 2.4] },
    { name: 'great tree', ground: greatTree, count: 6, radius: 3.4, altitude: [0.8, 2.2] },
  ];
  const emitters: PetalEmitter[] = [
    { name: 'old street blossom', ground: blossomTree, count: 44, radius: 1.5, height: 3.4, fall: [6.5, 9], gate: 'revival' },
    { name: 'great tree', ground: greatTree, count: 34, radius: 3.6, height: 7.5, fall: [8, 11], gate: 'life' },
  ];

  const birds = createBirds();
  const butterflies = createButterflies(zones);
  const petals = createPetals(emitters);
  const dust = createDust();
  const fireflies = createFireflies();
  const burst = createBurstSystem();
  group.add(birds.mesh, butterflies.mesh, petals.mesh, dust, fireflies, burst.group);
  // Recording only: ?nobirds keeps the flocks from crossing close to a filmed camera.
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('nobirds')) birds.mesh.visible = false;
  const baseDrawCalls = 5;

  let ground = world.radius;
  let dusk = 0;
  const api: EnvironmentFx = {
    group,
    update(frame: FxFrame) {
      const player = frame.playerPosition;
      burst.update();
      dust.visible = fireflies.visible = !!player;
      if (player) {
        fxUniforms.uPlayer.value.copy(player);
        if (frame.playerNormal) fxUniforms.uPlayerUp.value.copy(frame.playerNormal);
        ground += (player.length() - ground) * (1 - Math.exp(-Math.min(frame.dt, 0.1) * 3));
        (dust.material as ShaderMaterial).uniforms.uGround.value = ground;
        (fireflies.material as ShaderMaterial).uniforms.uGround.value = ground;
      }
    },
    burst(position: Vector3, normal: Vector3, color: string) {
      const n = normal.clone().normalize();
      burst.trigger(position, n, color, world.sampleRadius(n));
    },
    setDusk(amount: number) {
      dusk = Math.min(1, Math.max(0, amount));
      toonShared.uDusk.value = dusk;
    },
    stats() {
      return {
        drawCalls: baseDrawCalls + (burst.active() > 0 ? 2 : 0), birds: birds.count, butterflies: butterflies.count, petals: petals.count, dust: 150, fireflies: 60,
        bursting: burst.active(), dusk,
      };
    },
  };
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    const look = ((window as unknown as { __unspoolLook?: Record<string, unknown> }).__unspoolLook ??= {});
    look.fx = { ...api, at, zones, emitters };
  }
  return api;
}
