import {
  BufferAttribute, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3,
} from 'three';
import { revivalGlsl } from '../art/revival';
import { fxCommonGlsl, fxUniforms, fxWorldUniforms, markEffect, mulberry32, tangentFrame } from './shared';

/** A flowery place: butterflies flutter around `ground` and only appear once the
 * revival waves have colored that spot (decided per butterfly in the shader). */
export interface ButterflyZone {
  name: string;
  ground: Vector3;
  count: number;
  radius: number;
  altitude: [number, number];
}

const WING_COLORS = ['#ff8a5c', '#f5a9c0', '#ffd24a', '#8fd0ff', '#ffffff', '#c9a6ff', '#e8505b'];

export interface ButterflyInstances {
  count: number;
  home: Float32Array; up: Float32Array; e1: Float32Array; e2: Float32Array;
  params: Float32Array; colorA: Float32Array; colorB: Float32Array;
}

export function buildButterflyInstances(zones: readonly ButterflyZone[], seed = 11): ButterflyInstances {
  const random = mulberry32(seed);
  const count = zones.reduce((sum, zone) => sum + zone.count, 0);
  const data: ButterflyInstances = {
    count, home: new Float32Array(count * 3), up: new Float32Array(count * 3), e1: new Float32Array(count * 3), e2: new Float32Array(count * 3),
    params: new Float32Array(count * 4), colorA: new Float32Array(count * 3), colorB: new Float32Array(count * 3),
  };
  let index = 0;
  for (const zone of zones) {
    const up = zone.ground.clone().normalize();
    const [e1, e2] = tangentFrame(up);
    for (let i = 0; i < zone.count; i++, index++) {
      // Spread homes inside the zone so each butterfly's revival test samples its own spot.
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * zone.radius * 0.9;
      const home = zone.ground.clone().addScaledVector(e1, Math.cos(angle) * distance).addScaledVector(e2, Math.sin(angle) * distance);
      home.setLength(zone.ground.length());
      const a = new Color(WING_COLORS[Math.floor(random() * WING_COLORS.length)]);
      const b = new Color(WING_COLORS[Math.floor(random() * WING_COLORS.length)]);
      data.home.set([home.x, home.y, home.z], index * 3);
      data.up.set([up.x, up.y, up.z], index * 3);
      data.e1.set([e1.x, e1.y, e1.z], index * 3);
      data.e2.set([e2.x, e2.y, e2.z], index * 3);
      data.params.set([zone.radius * (0.55 + random() * 0.45), zone.altitude[0] + random() * (zone.altitude[1] - zone.altitude[0]), 0.7 + random() * 0.6, random()], index * 4);
      data.colorA.set([a.r, a.g, a.b], index * 3);
      data.colorB.set([b.r, b.g, b.b], index * 3);
    }
  }
  return data;
}

/** Two wing quads (uv.x outward 0..1, uv.y front to back 0..1) and a thin body (uv.x = -1). */
function butterflyGeometry(): InstancedBufferGeometry {
  const position: number[] = [], uv: number[] = [], index: number[] = [];
  const W = 0.3, L = 0.3;
  const quad = (corners: [number, number, number][], uvs: [number, number][]) => {
    const base = position.length / 3;
    corners.forEach(corner => position.push(...corner));
    uvs.forEach(coordinate => uv.push(...coordinate));
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const s of [-1, 1]) {
    quad(
      [[0, 0, L * 0.5], [s * W, 0, L * 0.5], [s * W, 0, -L * 0.5], [0, 0, -L * 0.5]],
      [[0, 0], [1, 0], [1, 1], [0, 1]],
    );
  }
  quad([[-0.02, 0, 0.17], [0.02, 0, 0.17], [0.02, 0, -0.17], [-0.02, 0, -0.17]], [[-1, 0], [-1, 0], [-1, 1], [-1, 1]]);
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(index);
  return geometry;
}

const vertexShader = /* glsl */ `
  ${revivalGlsl}
  ${fxCommonGlsl}
  attribute vec3 aHome, aUp, aE1, aE2, aColorA, aColorB;
  attribute vec4 aParams;
  varying vec2 vUv;
  varying vec3 vColorA;
  varying vec3 vColorB;
  varying vec3 vWorld;
  varying float vShade;
  vec3 flightPosition(float t) {
    float R = aParams.x, seed = aParams.w;
    vec3 around = aE1 * (sin(t * 0.9 + seed * 6.0) * R + sin(t * 2.3 + seed) * 0.22 * R)
      + aE2 * (cos(t * 0.7 + seed * 3.0) * R + cos(t * 1.9 + seed * 2.0) * 0.2 * R);
    float height = aParams.y + 0.35 * sin(t * 1.3 + seed * 5.0) + 0.07 * sin(t * 6.0 + seed);
    return aHome + aUp * height + around;
  }
  void main() {
    float t = uTime * aParams.z + aParams.w * 40.0;
    vec3 p0 = flightPosition(t);
    vec3 p1 = flightPosition(t + 0.12);
    vec3 forward = normalize(p1 - p0 + 1e-5);
    vec3 up = normalize(aUp - forward * dot(aUp, forward) + 1e-5);
    vec3 side = cross(up, forward);
    float vis = smoothstep(0.55, 0.95, revivalDetail(aHome).x);
    float flapRate = 8.0 + 3.0 * aParams.w;
    float flap = 0.5 + 0.5 * sin(uTime * flapRate + aParams.w * 20.0);
    float angle = 0.2 + 1.0 * flap;
    vec3 local = position * (0.6 + 0.5 * aParams.w) * vis;
    float x = local.x;
    local.x = x * cos(angle);
    local.y = abs(x) * sin(angle);
    vUv = uv;
    vColorA = aColorA;
    vColorB = aColorB;
    vShade = 0.75 + 0.25 * flap;
    vWorld = p0 + side * local.x + up * local.y + forward * local.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${fxCommonGlsl}
  varying vec2 vUv;
  varying vec3 vColorA;
  varying vec3 vColorB;
  varying vec3 vWorld;
  varying float vShade;
  float ellipse(vec2 p, vec2 center, vec2 radii) { return (length((p - center) / radii) - 1.0) * min(radii.x, radii.y); }
  void main() {
    vec3 ink = vec3(0.023, 0.025, 0.042);
    vec3 color = ink * 1.4;
    // (the body strip has uv.x = -1; wings continue below)
    if (vUv.x >= 0.0) {
      vec2 q = vUv;
      // front wing (large lobe) and hind wing, joined smoothly
      float d1 = ellipse(q, vec2(0.62, 0.3), vec2(0.46, 0.32));
      float d2 = ellipse(q, vec2(0.46, 0.74), vec2(0.36, 0.26));
      float k = 0.08;
      float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
      float d = mix(d2, d1, h) - k * h * (1.0 - h);
      if (d > 0.0) discard;
      float edge = smoothstep(-0.04, -0.02, d);
      color = mix(vColorA, vColorB, smoothstep(0.2, 0.95, q.x));
      float spot = 1.0 - smoothstep(0.05, 0.075, length(q - vec2(0.72, 0.28)));
      spot += 1.0 - smoothstep(0.035, 0.055, length(q - vec2(0.5, 0.74)));
      color = mix(color, vec3(1.0, 0.98, 0.9), clamp(spot, 0.0, 1.0) * 0.9);
      color = mix(color, ink * 2.0, edge);
      float diffuse = dot(normalize(cameraPosition - vWorld), normalize(uLightPosition - vWorld));
      color *= vShade * mix(0.88, 1.0, smoothstep(-0.2, 0.5, diffuse));
      color *= mix(vec3(1.0), vec3(1.0, 0.84, 0.76), uDusk * 0.7);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createButterflies(zones: readonly ButterflyZone[]): { mesh: Mesh; count: number } {
  const data = buildButterflyInstances(zones);
  const geometry = butterflyGeometry();
  const attribute = (array: Float32Array, size: number) => new InstancedBufferAttribute(array, size);
  geometry.setAttribute('aHome', attribute(data.home, 3));
  geometry.setAttribute('aUp', attribute(data.up, 3));
  geometry.setAttribute('aE1', attribute(data.e1, 3));
  geometry.setAttribute('aE2', attribute(data.e2, 3));
  geometry.setAttribute('aParams', attribute(data.params, 4));
  geometry.setAttribute('aColorA', attribute(data.colorA, 3));
  geometry.setAttribute('aColorB', attribute(data.colorB, 3));
  geometry.instanceCount = data.count;
  const material = new ShaderMaterial({
    name: 'UnspoolButterflies',
    uniforms: { ...fxWorldUniforms, ...fxUniforms },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Butterflies';
  markEffect(mesh, { outline: true });
  return { mesh, count: data.count };
}
