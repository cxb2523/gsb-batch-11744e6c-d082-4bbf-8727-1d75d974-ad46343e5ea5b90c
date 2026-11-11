import {
  BufferAttribute, BufferGeometry, Color, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, ShaderMaterial,
  Vector2, Vector3, Vector4,
} from 'three';
import { fxCommonGlsl, fxUniforms, markEffect, mulberry32, overlayBlending } from './shared';

/** The joyful connection burst: confetti and four-point sparkles in the thread's
 * colors fly out of the socket, while two soft rings roll across the ground.
 * Up to MAX_BURSTS overlap; each owns a slot in the uniform arrays and all
 * particles live in two fixed instanced meshes (2 draw calls in total). */
export const MAX_BURSTS = 6;
export const CONFETTI_PER_BURST = 60;
export const RING_RADIUS = 7.5;
export const BURST_LIFE = 2.4;

const slotUniforms = () => ({
  /** xyz origin (ground point for the rings, socket tip for confetti), w start time (-1 = idle). */
  uBurstA: { value: Array.from({ length: MAX_BURSTS }, () => new Vector4(0, 0, 0, -1)) },
  /** xyz surface normal, w ground radius lift for the rings. */
  uBurstB: { value: Array.from({ length: MAX_BURSTS }, () => new Vector4(0, 1, 0, 0)) },
  uBurstColor: { value: Array.from({ length: MAX_BURSTS }, () => new Vector3(1, 1, 1)) },
  /** xyz ground point of the ring center. */
  uBurstGround: { value: Array.from({ length: MAX_BURSTS }, () => new Vector3(0, 14, 0)) },
});

const frameGlsl = /* glsl */ `
  uniform vec4 uBurstA[${MAX_BURSTS}];
  uniform vec4 uBurstB[${MAX_BURSTS}];
  uniform vec3 uBurstColor[${MAX_BURSTS}];
  uniform vec3 uBurstGround[${MAX_BURSTS}];
  void burstFrame(vec3 n, out vec3 t1, out vec3 t2) {
    vec3 reference = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    t1 = normalize(cross(reference, n));
    t2 = cross(n, t1);
  }
`;

const confettiVertex = /* glsl */ `
  ${fxCommonGlsl}
  ${frameGlsl}
  attribute vec4 aRand;
  attribute vec2 aSlot;      // x: burst slot, y: kind (0 rect, 1 star, 2 dot)
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  varying float vFade;
  void main() {
    int slot = int(aSlot.x + 0.5);
    vec4 A = uBurstA[slot];
    float age = uTime - A.w;
    float life = 1.5 + aRand.w * 0.9;
    float on = step(0.0, A.w) * step(0.0, age) * step(age, life);
    vec3 n = normalize(uBurstB[slot].xyz);
    vec3 t1, t2;
    burstFrame(n, t1, t2);
    float angle = aRand.x * 6.2831853;
    float upward = 0.5 + 1.0 * aRand.y;
    float lateral = 0.35 + 0.9 * (1.0 - aRand.y * 0.5);
    vec3 direction = normalize(n * upward + (t1 * cos(angle) + t2 * sin(angle)) * lateral);
    float speed = 2.0 + 4.4 * fract(aRand.y * 7.3 + aRand.z * 3.1);
    float drag = 2.1;
    float travel = (1.0 - exp(-drag * age)) / drag;
    vec3 world = A.xyz + direction * speed * travel - n * (0.5 * 4.5 * age * age);
    float kind = aSlot.y;
    float size = kind < 0.5 ? 0.034 + 0.03 * aRand.z : (kind < 1.5 ? 0.06 + 0.06 * aRand.y : 0.028);
    float pop = smoothstep(0.0, 0.07, age);
    float fade = 1.0 - smoothstep(life * 0.65, life, age);
    float scale = size * pop * fade * on;
    vec4 view = viewMatrix * vec4(world, 1.0);
    float spin = aRand.z * 6.2831853 + age * (4.0 + aRand.x * 8.0);
    vec2 q = position.xy;
    if (kind < 0.5) q.x *= 0.12 + 0.88 * abs(cos(age * (4.0 + aRand.z * 5.0) + aRand.x * 9.0));
    vec2 rotated = vec2(cos(spin) * q.x - sin(spin) * q.y, sin(spin) * q.x + cos(spin) * q.y);
    view.xy += rotated * scale;
    gl_Position = projectionMatrix * view;
    if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    float pick = fract(aRand.x * 13.7 + aRand.y * 5.1);
    vec3 base = uBurstColor[slot];
    vec3 color = base * (0.75 + 0.55 * aRand.z);
    if (pick > 0.55) color = mix(base, vec3(1.0), 0.78);
    if (pick > 0.8) color = vec3(1.0, 0.64, 0.19);
    if (kind > 0.5 && kind < 1.5) color = mix(color, vec3(1.0, 0.95, 0.7), 0.5);
    vColor = color;
    vUv = position.xy;
    vKind = kind;
    vFade = fade;
  }
`;

const confettiFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vKind;
  varying float vFade;
  void main() {
    vec2 p = vUv;
    vec3 ink = vec3(0.023, 0.025, 0.042);
    float alpha;
    vec3 color = vColor;
    if (vKind < 0.5) {
      float d = max(abs(p.x), abs(p.y));
      alpha = 1.0 - smoothstep(0.82, 0.98, d);
      color = mix(color, ink * 2.0, smoothstep(0.62, 0.82, d) * 0.55);
    } else if (vKind < 1.5) {
      float s = pow(abs(p.x), 0.5) + pow(abs(p.y), 0.5);
      float glow = exp(-length(p) * 3.0) * 0.55;
      alpha = clamp((1.0 - smoothstep(0.8, 1.0, s)) + glow, 0.0, 1.0);
      color = mix(color, vec3(1.0), (1.0 - smoothstep(0.0, 0.7, s)) * 0.7);
    } else {
      float d = length(p);
      alpha = 1.0 - smoothstep(0.78, 0.98, d);
      color = mix(color, ink * 2.0, smoothstep(0.55, 0.8, d) * 0.5);
    }
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha * min(1.0, vFade * 3.0));
  }
`;

/** The ground ring is a screen-space decal: it reads the opaque scene depth the ink renderer
 * already produces for the ocean (same uniform names, so render.ts feeds it automatically),
 * rebuilds each pixel's world position and draws a ring at constant great-circle distance
 * from the burst. It hugs terrain, steps and walls exactly, with no z-fighting. */
const ringVertex = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ringFragment = /* glsl */ `
  ${fxCommonGlsl}
  ${frameGlsl}
  uniform sampler2D tSceneDepth;
  uniform vec2 uResolution;
  uniform mat4 uCameraWorld;
  uniform mat4 uProjectionInverse;
  float ring(float radial, float age, float strength) {
    float t = clamp(age / 1.55, 0.0, 1.0);
    float r = ${RING_RADIUS.toFixed(2)} * (1.0 - pow(1.0 - t, 3.0));
    float width = mix(0.42, 0.1, t);
    float d = abs(radial - r);
    float band = 1.0 - smoothstep(width * 0.35, width, d);
    float core = 1.0 - smoothstep(0.0, width * 0.3, d);
    return (band * 0.8 + core * 0.5) * strength * (1.0 - smoothstep(0.35, 1.0, t)) * step(0.0, age);
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float depth = texture2D(tSceneDepth, uv).r;
    if (depth >= 0.9999) discard;
    vec4 view = uProjectionInverse * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 world = (uCameraWorld * (view / view.w)).xyz;
    vec3 direction = normalize(world);
    vec3 accumulated = vec3(0.0);
    float alpha = 0.0;
    for (int i = 0; i < ${MAX_BURSTS}; i++) {
      vec4 A = uBurstA[i];
      float age = uTime - A.w;
      if (A.w < 0.0 || age < 0.0 || age > ${BURST_LIFE.toFixed(2)}) continue;
      vec3 ground = uBurstGround[i];
      float radial = acos(clamp(dot(direction, normalize(ground)), -1.0, 1.0)) * length(ground);
      float a = ring(radial, age, 1.0) + ring(radial, age - 0.2, 0.55);
      float t = clamp(age / 1.2, 0.0, 1.0);
      float front = ${RING_RADIUS.toFixed(2)} * (1.0 - pow(1.0 - clamp(age / 1.55, 0.0, 1.0), 3.0));
      float height = length(world) - length(ground);
      // the glow only washes the ground itself; the ring may climb a little up walls and legs
      a += (1.0 - smoothstep(0.0, max(front, 0.01), radial)) * 0.22 * (1.0 - t) * (1.0 - smoothstep(0.05, 0.35, height));
      a *= 1.0 - smoothstep(0.8, 3.0, height);
      vec3 color = mix(uBurstColor[i], vec3(1.0, 0.97, 0.88), clamp(a * 0.45, 0.0, 0.6));
      accumulated += color * a;
      alpha += a;
    }
    alpha = clamp(alpha, 0.0, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(accumulated / max(alpha, 1e-3), alpha);
  }
`;

export interface BurstSystem {
  group: Group;
  trigger(position: Vector3, normal: Vector3, color: string, groundRadius?: number): void;
  /** Number of bursts still playing. */
  active(): number;
  /** Hide the whole system while idle so it costs no draw calls or triangles. */
  update(): void;
}

export function createBurstSystem(): BurstSystem {
  const uniforms = { ...fxUniforms, ...slotUniforms() };
  const group = new Group();
  group.name = 'ConnectionBurst';

  // Confetti: one instanced quad per particle.
  const random = mulberry32(31);
  const count = MAX_BURSTS * CONFETTI_PER_BURST;
  const rand = new Float32Array(count * 4), slot = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const burst = Math.floor(i / CONFETTI_PER_BURST);
    for (let k = 0; k < 4; k++) rand[i * 4 + k] = random();
    const pick = random();
    slot[i * 2] = burst;
    slot[i * 2 + 1] = pick < 0.58 ? 0 : pick < 0.85 ? 1 : 2;
  }
  const confettiGeometry = new InstancedBufferGeometry();
  confettiGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  confettiGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  confettiGeometry.setAttribute('aRand', new InstancedBufferAttribute(rand, 4));
  confettiGeometry.setAttribute('aSlot', new InstancedBufferAttribute(slot, 2));
  confettiGeometry.instanceCount = count;
  const confettiMaterial = new ShaderMaterial({
    name: 'UnspoolConfetti', uniforms, vertexShader: confettiVertex, fragmentShader: confettiFragment,
  });
  overlayBlending(confettiMaterial);
  const confetti = new Mesh(confettiGeometry, confettiMaterial);
  confetti.name = 'Confetti';
  markEffect(confetti);
  confetti.renderOrder = 20;

  // Ground ring decal: one full-screen triangle that reads scene depth (see ringFragment).
  const ringGeometry = new BufferGeometry();
  ringGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const ringUniforms = {
    ...uniforms,
    // Names shared with the ocean: render.ts binds the opaque depth to any material that has them.
    tSceneDepth: { value: null }, uUseSceneDepth: { value: 0 }, uResolution: { value: new Vector2(1, 1) },
    uCameraNear: { value: 0.1 }, uCameraFar: { value: 200 },
    uCameraWorld: { value: new Matrix4() }, uProjectionInverse: { value: new Matrix4() },
  };
  const ringMaterial = new ShaderMaterial({
    name: 'UnspoolBurstRingDecal', uniforms: ringUniforms, vertexShader: ringVertex, fragmentShader: ringFragment,
    depthTest: false,
  });
  overlayBlending(ringMaterial);
  const rings = new Mesh(ringGeometry, ringMaterial);
  rings.name = 'BurstRings';
  markEffect(rings);
  rings.renderOrder = 19;
  rings.onBeforeRender = (_renderer, _scene, camera) => {
    ringUniforms.uCameraWorld.value.copy(camera.matrixWorld);
    ringUniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
  };

  group.add(rings, confetti);
  group.visible = false;

  let next = 0;
  const tint = new Color();
  return {
    group,
    trigger(position, normal, color, groundRadius) {
      const index = next++ % MAX_BURSTS;
      const n = normal.clone().normalize();
      const ground = groundRadius ?? position.length();
      uniforms.uBurstA.value[index].set(position.x, position.y, position.z, fxUniforms.uTime.value);
      uniforms.uBurstB.value[index].set(n.x, n.y, n.z, 0.14);
      tint.set(color);
      uniforms.uBurstColor.value[index].set(tint.r, tint.g, tint.b);
      uniforms.uBurstGround.value[index].copy(n).multiplyScalar(ground);
      group.visible = true;
    },
    update() { group.visible = this.active() > 0; },
    active() {
      let active = 0;
      for (const slotValue of uniforms.uBurstA.value) {
        const age = fxUniforms.uTime.value - slotValue.w;
        if (slotValue.w >= 0 && age >= 0 && age < BURST_LIFE) active++;
      }
      return active;
    },
  };
}
