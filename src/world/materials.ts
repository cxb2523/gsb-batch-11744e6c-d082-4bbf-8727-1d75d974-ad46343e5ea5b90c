import { ShaderMaterial, Vector3 } from 'three';
import { createToonMaterial } from '../art/toon';

/** Emissive channels for the detail material. Each vertex carries a channel
 * index (`aGlow`); activation code sets `glow[channel]` (tint x level) and the
 * whole district lights up with one uniform write instead of one draw call per
 * lamp. Glow is gated by revival (paper areas never glow). */
export const GLOW = {
  none: 0,
  lighthouse: 1,
  harborHub: 2,
  workshopHub: 3,
  oldHub: 4,
  oldWindows: 5,
  neighbors: 6,
  oldLanterns: 7,
  finale: 8,
  farWindow: 9,
  rootHarbor: 10,
  rootWorkshop: 11,
  rootOldStreet: 12,
  workshopWindows: 13,
  harborWindows: 14,
  forge: 15,
} as const;
export const GLOW_CHANNELS = 16;

export interface WorldMaterials {
  solid: ShaderMaterial;
  detail: ShaderMaterial;
  foliage: ShaderMaterial;
  small: ShaderMaterial;
  terrain: ShaderMaterial;
  /** Current additive emission per channel (rgb already multiplied by level). */
  glow: Vector3[];
  setGlow(channel: number, tint: Vector3 | string | [number, number, number], level: number): void;
}

const TINTS: Record<string, [number, number, number]> = {};

export function createWorldMaterials(): WorldMaterials {
  const solid = createToonMaterial({ vertexColors: true, name: 'UnspoolSolid' });
  const terrain = createToonMaterial({ vertexColors: true, name: 'UnspoolTerrain', castShadow: false });
  const small = createToonMaterial({ vertexColors: true, sway: true, name: 'UnspoolGroundCover', castShadow: false });
  const foliage = createToonMaterial({ vertexColors: true, sway: true, name: 'UnspoolFoliage' });
  const detail = createToonMaterial({ vertexColors: true, name: 'UnspoolDetail', castShadow: false });
  const glow = Array.from({ length: GLOW_CHANNELS }, () => new Vector3());
  patchGlow(detail, glow);
  const tints = new Map<number, Vector3>();
  return {
    solid, detail, foliage, small, terrain, glow,
    setGlow(channel, tint, level) {
      let rgb = tints.get(channel);
      if (!rgb) { rgb = new Vector3(1, 0.85, 0.5); tints.set(channel, rgb); }
      if (Array.isArray(tint)) rgb.set(tint[0], tint[1], tint[2]);
      else if (typeof tint !== 'string') rgb.copy(tint);
      glow[channel].copy(rgb).multiplyScalar(level);
    },
  };
}
void TINTS;

/** Adds the `aGlow` channel lookup on top of the shared toon shader. If the
 * toon shader changes shape the patch quietly degrades to no glow. */
export function patchGlow(material: ShaderMaterial, glow: Vector3[]): boolean {
  const vertex = material.vertexShader, fragment = material.fragmentShader;
  const anchor = 'color += base * uEmissive * alive;';
  if (!vertex.includes('void main() {') || !fragment.includes('void main() {') || !fragment.includes(anchor)) return false;
  material.vertexShader = vertex.replace('void main() {', 'attribute float aGlow;\nvarying float vGlow;\nvoid main() {\n    vGlow = aGlow;');
  material.fragmentShader = fragment
    .replace('void main() {', 'varying float vGlow;\nuniform vec3 uGlow[16];\nvoid main() {')
    .replace(anchor, `${anchor}\n    color += uGlow[int(vGlow + 0.5)] * alive;`);
  material.uniforms.uGlow = { value: glow };
  return true;
}
