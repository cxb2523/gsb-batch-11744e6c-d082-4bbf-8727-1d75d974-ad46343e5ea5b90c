import {
  BufferAttribute, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3,
} from 'three';
import { revivalGlsl } from '../art/revival';
import { fxCommonGlsl, fxUniforms, fxWorldUniforms, markEffect, mulberry32, tangentFrame } from './shared';

/** A blossom tree dropping petals: a ring of petals falls from the crown, sways
 * and tumbles, and fades near the ground. Petals only exist where color has
 * arrived; `gate: 'life'` emitters (the great tree) also wait for the chapter. */
export interface PetalEmitter {
  name: string;
  ground: Vector3;
  count: number;
  /** Crown radius and height above ground where petals start. */
  radius: number;
  height: number;
  fall: [number, number];
  gate: 'revival' | 'life';
}

export interface PetalInstances {
  count: number;
  anchor: Float32Array; up: Float32Array; e1: Float32Array; e2: Float32Array;
  params: Float32Array; gate: Float32Array;
}

export function buildPetalInstances(emitters: readonly PetalEmitter[], seed = 23): PetalInstances {
  const random = mulberry32(seed);
  const count = emitters.reduce((sum, emitter) => sum + emitter.count, 0);
  const data: PetalInstances = {
    count, anchor: new Float32Array(count * 3), up: new Float32Array(count * 3), e1: new Float32Array(count * 3), e2: new Float32Array(count * 3),
    params: new Float32Array(count * 4), gate: new Float32Array(count),
  };
  let index = 0;
  for (const emitter of emitters) {
    const up = emitter.ground.clone().normalize();
    const [e1, e2] = tangentFrame(up);
    for (let i = 0; i < emitter.count; i++, index++) {
      data.anchor.set([emitter.ground.x, emitter.ground.y, emitter.ground.z], index * 3);
      data.up.set([up.x, up.y, up.z], index * 3);
      data.e1.set([e1.x, e1.y, e1.z], index * 3);
      data.e2.set([e2.x, e2.y, e2.z], index * 3);
      data.params.set([emitter.radius, emitter.height, emitter.fall[0] + random() * (emitter.fall[1] - emitter.fall[0]), random()], index * 4);
      data.gate[index] = emitter.gate === 'life' ? 1 : 0;
    }
  }
  return data;
}

const vertexShader = /* glsl */ `
  ${revivalGlsl}
  ${fxCommonGlsl}
  attribute vec3 aAnchor, aUp, aE1, aE2;
  attribute vec4 aParams;
  attribute float aGate;
  varying vec2 vUv;
  varying float vTone;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float seed = aParams.w;
    float cycle = uTime / aParams.z + seed * 13.0;
    float id = floor(cycle);
    float phase = fract(cycle);
    float r1 = h21(vec2(seed * 91.0, id)), r2 = h21(vec2(id * 3.7, seed * 57.0)), r3 = h21(vec2(seed * 33.0 + 5.0, id + 9.0));
    float ang = r1 * 6.2831853;
    float rad = sqrt(r2) * aParams.x;
    vec3 start = (aE1 * cos(ang) + aE2 * sin(ang)) * rad;
    float height = aParams.y * (1.0 - phase * phase * 0.35 - phase * 0.65);
    vec3 sway = (aE1 * sin(uTime * 0.9 + seed * 20.0 + phase * 7.0) + aE2 * cos(uTime * 0.7 + seed * 11.0 + phase * 6.0)) * 0.45 * phase
      + aE1 * 0.9 * phase;
    vec3 center = aAnchor + aUp * (height + 0.04) + start + sway;
    float vis = smoothstep(0.5, 0.9, revivalDetail(aAnchor).x);
    if (aGate > 0.5) vis *= smoothstep(0.55, 0.9, uLife);
    float size = (0.034 + 0.026 * r3) * vis * smoothstep(0.0, 0.05, phase) * (1.0 - smoothstep(0.9, 1.0, phase));
    float a = uTime * (1.4 + r1 * 2.6) + r2 * 6.28;
    float b = uTime * (0.8 + r3 * 1.8) + r1 * 6.28;
    vec3 local = vec3(position.x, 0.0, position.y);
    local = vec3(local.x, local.y * cos(a) - local.z * sin(a), local.y * sin(a) + local.z * cos(a));
    local = vec3(local.x * cos(b) + local.z * sin(b), local.y, -local.x * sin(b) + local.z * cos(b));
    vec3 world = center + (aE1 * local.x + aUp * local.y + aE2 * local.z) * size;
    vUv = uv;
    vTone = r3;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${fxCommonGlsl}
  varying vec2 vUv;
  varying float vTone;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.y *= 0.75;
    float body = length(p * vec2(1.0, 0.9)) - 0.92;
    float notch = length(p - vec2(0.0, 1.0)) - 0.22;
    float d = max(body, -notch);
    if (d > 0.0) discard;
    vec3 pink = vec3(0.92, 0.4, 0.52);
    vec3 pale = vec3(1.0, 0.8, 0.86);
    vec3 color = mix(pale, pink, smoothstep(-0.9, -0.1, d) * 0.55 + vTone * 0.2);
    color = mix(color, vec3(0.8, 0.22, 0.38), (1.0 - smoothstep(0.0, 0.09, abs(p.x))) * smoothstep(-0.2, 0.7, -p.y) * 0.35);
    color = mix(color, vec3(0.2, 0.05, 0.1), smoothstep(-0.12, -0.02, d) * 0.45);
    color *= mix(vec3(1.0), vec3(1.0, 0.82, 0.74), uDusk * 0.7);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createPetals(emitters: readonly PetalEmitter[]): { mesh: Mesh; count: number } {
  const data = buildPetalInstances(emitters);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const attribute = (array: Float32Array, size: number) => new InstancedBufferAttribute(array, size);
  geometry.setAttribute('aAnchor', attribute(data.anchor, 3));
  geometry.setAttribute('aUp', attribute(data.up, 3));
  geometry.setAttribute('aE1', attribute(data.e1, 3));
  geometry.setAttribute('aE2', attribute(data.e2, 3));
  geometry.setAttribute('aParams', attribute(data.params, 4));
  geometry.setAttribute('aGate', attribute(data.gate, 1));
  geometry.instanceCount = data.count;
  const material = new ShaderMaterial({
    name: 'UnspoolPetals',
    uniforms: { ...fxWorldUniforms, ...fxUniforms },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Petals';
  markEffect(mesh);
  return { mesh, count: data.count };
}
