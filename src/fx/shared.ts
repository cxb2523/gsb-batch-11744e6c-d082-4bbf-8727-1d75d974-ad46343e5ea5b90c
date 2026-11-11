import { Vector3, type Object3D } from 'three';
import { revivalUniforms } from '../art/revival';
import { toonShared } from '../art/toon';

/** Uniforms shared by every effect material (by reference, so one write per frame
 * updates all of them). `uLife` mirrors the chapter life; `uDusk` the finale. */
export const fxUniforms = {
  uTime: revivalUniforms.uTime,
  uDusk: toonShared.uDusk,
  uLife: revivalUniforms.uGlobalLife,
  uPlayer: { value: new Vector3() },
  uPlayerUp: { value: new Vector3(0, 1, 0) },
  uPixelHeight: { value: 800 },
};

/** Effect materials share the paper palette, sun and revival waves with the toon shader. */
export const fxWorldUniforms = {
  ...revivalUniforms,
  uLightPosition: toonShared.uLightPosition,
  uShadowTint: toonShared.uShadowTint,
  uPaper: toonShared.uPaper,
  uFringe: toonShared.uFringe,
};

/** Seeded, dependency-free PRNG so effect layouts are reproducible (and testable). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Any unit vectors perpendicular to `normal` and to each other. */
export function tangentFrame(normal: Vector3, first = new Vector3(), second = new Vector3()): [Vector3, Vector3] {
  const reference = Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  first.crossVectors(reference, normal).normalize();
  second.crossVectors(normal, first).normalize();
  return [first, second];
}

/** Keep effect meshes out of the ink/outline-depth bookkeeping and out of frustum culling
 * (their positions are computed in the vertex shader, so the bind-pose bounds are wrong). */
export function markEffect(object: Object3D, options: { outline?: boolean } = {}): void {
  object.frustumCulled = false;
  object.userData.ignoreDepthPrepass = true;
  object.userData.noShadowCast = true;
  object.castShadow = false;
  object.receiveShadow = false;
  if (!options.outline) object.userData.noOutline = true;
}

export { overlayBlending } from '../art/blend';

/** Declarations for the shared effect uniforms (use in both shader stages; unused ones are free). */
export const fxCommonGlsl = /* glsl */ `
  uniform vec3 uLightPosition, uShadowTint, uPaper, uFringe, uPlayer, uPlayerUp;
  uniform float uDusk, uTime, uLife, uPixelHeight;
`;

/** Shared GLSL for effect shaders: toon lighting on paper or color. Needs `fxCommonGlsl` in scope. */
export const fxLightingGlsl = /* glsl */ `
  vec3 fxToon(vec3 base, vec3 normal, vec3 worldPosition, float alive, float dusk) {
    float diffuse = dot(normal, normalize(uLightPosition - worldPosition));
    float lit = smoothstep(-0.05, 0.14, diffuse);
    vec3 colored = mix(base * uShadowTint * 0.95, base, lit);
    colored *= mix(vec3(1.0), mix(vec3(0.84, 0.78, 1.02), vec3(1.0, 0.82, 0.7), lit), dusk);
    vec3 paper = uPaper * mix(0.84, 1.0, lit) * mix(0.8, 1.0, dot(base, vec3(0.3, 0.55, 0.15)));
    return mix(paper, colored, alive);
  }
`;
