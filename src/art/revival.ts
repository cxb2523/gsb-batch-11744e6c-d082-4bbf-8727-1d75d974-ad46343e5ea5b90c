import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../chapter/data';
import { noiseGlsl } from './glsl';

/** Circular color waves over the planet. Every toon material shares these
 * uniform objects, so updating them once recolors the whole world. A point is
 * "alive" (full color) once it lies inside any wave, measured as surface
 * distance (angle × planet radius) so a wave also climbs buildings above it. */
export const MAX_WAVES = 16;

interface Wave { center: Vector3; target: number; radius: number; speed: number; glow: number }

export const revivalUniforms = {
  uRevealCenter: { value: Array.from({ length: MAX_WAVES }, () => new Vector3(0, 1, 0)) },
  uRevealRadius: { value: new Array<number>(MAX_WAVES).fill(0) },
  /** Bright fringe strength per wave: 1 while growing, fading once finished. */
  uRevealGlow: { value: new Array<number>(MAX_WAVES).fill(0) },
  uRevealSoft: { value: 1.6 },
  uPlanetRadius: { value: PLANET_RADIUS },
  /** 0..1 fraction of the chapter revived; sky, fog and ambience use it. */
  uGlobalLife: { value: 0 },
  uTime: { value: 0 },
  /** Visual-only override (title screen): 1 shows the whole planet in color. */
  uForceAlive: { value: 0 },
};

/** Fraction of `uRevealSoft` used as the width of the watercolor feather. */
export const EDGE_SOFT = 0.8;
const waves: Wave[] = [];

function sync(): void {
  for (let i = 0; i < MAX_WAVES; i++) {
    const wave = waves[i];
    revivalUniforms.uRevealRadius.value[i] = wave ? wave.radius : 0;
    revivalUniforms.uRevealGlow.value[i] = wave ? wave.glow : 0;
    if (wave) revivalUniforms.uRevealCenter.value[i].copy(wave.center).normalize();
  }
}

export const revival = {
  /** Start a wave at `center` growing to `radius` world units.
   * `instant` (save restore) skips the animation. */
  addWave(center: Vector3, radius: number, options: { instant?: boolean; seconds?: number } = {}): void {
    const seconds = options.seconds ?? Math.max(1.6, radius / 5);
    const wave: Wave = { center: center.clone().normalize(), target: radius, radius: options.instant ? radius : 0, speed: radius / seconds, glow: options.instant ? 0 : 1 };
    if (waves.length >= MAX_WAVES) {
      // Merge into the smallest finished wave; the planet-wide finale wave
      // eventually supersedes everything anyway.
      waves.sort((a, b) => a.target - b.target).shift();
    }
    waves.push(wave);
    sync();
  },
  update(dt: number, time: number): void {
    revivalUniforms.uTime.value = time;
    let changed = false;
    for (const wave of waves) {
      if (wave.radius < wave.target) {
        wave.radius = Math.min(wave.target, wave.radius + wave.speed * dt);
        changed = true;
      } else if (wave.glow > 0) {
        wave.glow = Math.max(0, wave.glow - dt * 0.8);
        changed = true;
      }
    }
    if (changed) sync();
  },
  setGlobalLife(value: number): void { revivalUniforms.uGlobalLife.value = Math.min(1, Math.max(0, value)); },
  /** 0..1 aliveness at a world position (CPU mirror of the shader, without the
   * watercolor edge noise: the noise is zero-mean, so this is the average edge). */
  amountAt(position: Vector3): number {
    const direction = position.clone().normalize();
    let alive = 0;
    const soft = revivalUniforms.uRevealSoft.value * EDGE_SOFT;
    for (const wave of waves) {
      if (wave.radius <= 0) continue;
      const distance = Math.acos(Math.min(1, Math.max(-1, direction.dot(wave.center)))) * PLANET_RADIUS;
      const x = Math.min(1, Math.max(0, (wave.radius - distance) / soft));
      alive = Math.max(alive, x * x * (3 - 2 * x));
    }
    return alive;
  },
  get animating(): boolean { return waves.some(wave => wave.radius < wave.target || wave.glow > 0); },
  reset(): void { waves.length = 0; sync(); revivalUniforms.uGlobalLife.value = 0; },
};

/** GLSL helpers shared by toon, water, sky and effect shaders.
 *  - `revivalAt(worldPosition)`: x = aliveness 0..1, y = warm fringe 0..1 (stable contract).
 *  - `revivalDetail(worldPosition)`: same plus z = pigment speckle strength beyond the edge
 *    (speckles are already folded into x).
 * The front is a watercolor bleed: a lobed, noisy, feathered edge instead of a
 * perfect circle, a luminous warm band just inside the advancing front and tiny
 * pigment speckles ahead of it. Fringe and speckles scale with the per-wave glow,
 * so finished waves settle into a plain organic color/paper boundary: no ring. */
export const revivalGlsl = /* glsl */ `
  ${noiseGlsl}
  uniform vec3 uRevealCenter[${MAX_WAVES}];
  uniform float uRevealRadius[${MAX_WAVES}];
  uniform float uRevealGlow[${MAX_WAVES}];
  uniform float uRevealSoft;
  uniform float uPlanetRadius;
  uniform float uGlobalLife;
  uniform float uForceAlive;
  vec3 revivalDetail(vec3 worldPosition) {
    vec3 d = normalize(worldPosition);
    float alive = 0.0, fringe = 0.0, speckle = 0.0;
    float soft = uRevealSoft * ${EDGE_SOFT.toFixed(2)};
    float warp = 0.0, fine = 0.5;
    bool warped = false;
    for (int i = 0; i < ${MAX_WAVES}; i++) {
      float r = uRevealRadius[i];
      if (r <= 0.0) continue;
      float dist = acos(clamp(dot(d, uRevealCenter[i]), -1.0, 1.0)) * uPlanetRadius;
      float e = r - dist;
      if (e > 3.6) { alive = 1.0; continue; }
      if (e < -4.2) continue;
      if (!warped) {
        warped = true;
        vec3 q = d * uPlanetRadius;
        warp = unNoise3(q * 0.42 + 3.7) * 1.7 + unNoise3(q * 1.6 + 9.1) * 0.9 - 1.3;
        fine = unNoise3(q * 4.7 + 1.3);
      }
      float edge = e + warp * clamp(r * 0.5, 0.35, 1.0);
      float shape = smoothstep(0.0, soft, edge + (fine - 0.5) * 0.9);
      alive = max(alive, shape);
      float glow = uRevealGlow[i];
      if (glow > 0.0) {
        float band = smoothstep(-0.15, 0.3, edge) * (1.0 - smoothstep(0.3, 1.3, edge + (fine - 0.5) * 0.5));
        fringe = max(fringe, band * glow);
        if (edge < 0.2) {
          vec3 cellP = worldPosition * 8.0;
          vec3 cell = floor(cellP);
          float h = unHash13(cell);
          float radius = mix(0.14, 0.42, unHash13(cell + 17.0));
          float dotShape = 1.0 - smoothstep(radius * 0.6, radius, length(fract(cellP) - 0.5));
          float density = glow * (1.0 - smoothstep(0.0, 2.8, -edge));
          float speck = step(1.0 - 0.2 * density, h) * dotShape;
          speckle = max(speckle, speck);
        }
      }
    }
    alive = max(max(alive, speckle), uForceAlive);
    return vec3(alive, fringe * (1.0 - uForceAlive), speckle);
  }
  // x: aliveness 0..1, y: bright fringe at the advancing edge 0..1
  vec2 revivalAt(vec3 worldPosition) { return revivalDetail(worldPosition).xy; }
`;
