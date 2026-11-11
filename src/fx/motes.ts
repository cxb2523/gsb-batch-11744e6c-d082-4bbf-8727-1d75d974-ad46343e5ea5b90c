import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector2, type WebGLRenderer } from 'three';
import { PLANET_RADIUS } from '../chapter/data';
import { revivalGlsl } from '../art/revival';
import { fxCommonGlsl, fxUniforms, fxWorldUniforms, markEffect, mulberry32, overlayBlending } from './shared';

/** Soft floating specks around the player in a world-fixed lattice that wraps
 * around them: pencil-grey dust in the sketch, golden pollen where color has
 * returned, and (at dusk) fireflies that blink on and off. Positions are computed
 * entirely in the vertex shader; the CPU only sets the player position. */
const BOX = 9;

const vertexShader = /* glsl */ `
  ${revivalGlsl}
  ${fxCommonGlsl}
  attribute vec4 aSeed;
  uniform float uGround;
  uniform float uMode;     // 0 = dust/pollen, 1 = fireflies
  varying float vAlpha;
  varying float vAlive;
  varying float vPulse;
  varying float vSeed;
  void main() {
    float t = uTime;
    float seed = aSeed.w;
    vec3 drift = vec3(sin(t * 0.21 + seed * 17.0), cos(t * 0.17 + seed * 9.0), sin(t * 0.19 + seed * 5.0)) * 0.55
      + vec3(0.12, -0.05, 0.08) * t * (0.4 + seed);
    if (uMode > 0.5) drift = vec3(sin(t * 0.35 + seed * 23.0), cos(t * 0.29 + seed * 11.0), sin(t * 0.31 + seed * 7.0)) * 0.9;
    vec3 lattice = aSeed.xyz * ${BOX.toFixed(1)} + drift;
    vec3 rel = mod(lattice - uPlayer + 0.5 * ${BOX.toFixed(1)}, ${BOX.toFixed(1)}) - 0.5 * ${BOX.toFixed(1)};
    vec3 direction = normalize(uPlayer + rel);
    float height = uMode > 0.5
      ? 0.25 + 1.6 * fract(seed * 7.13) + 0.25 * sin(t * 0.8 + seed * 31.0)
      : 0.15 + 3.0 * fract(seed * 5.31) + 0.2 * sin(t * 0.6 + seed * 13.0);
    vec3 world = direction * (uGround + height);
    float distanceToPlayer = length(world - uPlayer);
    vAlpha = 1.0 - smoothstep(2.2, 4.0, distanceToPlayer);
    vAlive = revivalDetail(world).x;
    vSeed = seed;
    vPulse = 1.0;
    float size = 0.018 + 0.016 * fract(seed * 3.7);
    if (uMode > 0.5) {
      float blink = sin(t * (1.4 + seed * 1.6) + seed * 50.0);
      vPulse = smoothstep(0.1, 0.95, blink);
      vAlpha *= smoothstep(0.2, 0.55, uDusk) * mix(0.0, 1.0, vPulse);
      size = 0.05 + 0.03 * fract(seed * 3.7);
    } else {
      vAlpha *= 0.35 + 0.65 * smoothstep(0.0, 0.2, vAlive) * (0.7 + 0.3 * sin(t * 1.7 + seed * 40.0));
    }
    vec4 view = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(uPixelHeight * 0.5 * projectionMatrix[1][1] * size / max(-view.z, 0.1), 1.5, 22.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${fxCommonGlsl}
  uniform float uMode;
  varying float vAlpha;
  varying float vAlive;
  varying float vPulse;
  varying float vSeed;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    float core = 1.0 - smoothstep(0.0, 1.0, r);
    vec3 color;
    float alpha;
    if (uMode > 0.5) {
      color = mix(vec3(0.62, 0.9, 0.18), vec3(1.0, 0.85, 0.3), fract(vSeed * 9.0));
      alpha = (core * core * 0.9 + (1.0 - smoothstep(0.0, 0.35, r)) * 0.5) * vAlpha;
    } else {
      vec3 dust = vec3(0.08, 0.085, 0.11);
      vec3 pollen = vec3(1.0, 0.86, 0.45);
      color = mix(dust, pollen, vAlive);
      float cross4 = max(1.0 - smoothstep(0.0, 0.14, abs(p.x)), 1.0 - smoothstep(0.0, 0.14, abs(p.y))) * (1.0 - smoothstep(0.3, 0.5, r * 0.5));
      alpha = (smoothstep(1.0, 0.45, r) * 0.9 + cross4 * 0.5 * vAlive) * vAlpha;
    }
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function motesGeometry(count: number, seed: number): BufferGeometry {
  const random = mulberry32(seed);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  const geometry = new BufferGeometry();
  // positions are unused by the shader; three needs the attribute for the draw count
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  return geometry;
}

function createPoints(name: string, count: number, seed: number, mode: 0 | 1): Points {
  const material = new ShaderMaterial({
    name,
    uniforms: { ...fxWorldUniforms, ...fxUniforms, uGround: { value: PLANET_RADIUS }, uMode: { value: mode } },
    vertexShader,
    fragmentShader,
  });
  overlayBlending(material, mode === 1);
  const points = new Points(motesGeometry(count, seed), material);
  points.name = name;
  markEffect(points);
  const size = new Vector2();
  points.onBeforeRender = (renderer: WebGLRenderer) => { fxUniforms.uPixelHeight.value = renderer.getDrawingBufferSize(size).y; };
  return points;
}

export function createDust(count = 150): Points { return createPoints('PollenDust', count, 5, 0); }
export function createFireflies(count = 60): Points { return createPoints('Fireflies', count, 9, 1); }
