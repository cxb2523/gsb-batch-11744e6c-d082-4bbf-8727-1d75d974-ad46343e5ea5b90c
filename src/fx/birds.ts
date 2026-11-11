import {
  BufferAttribute, Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial,
} from 'three';
import { dir } from '../chapter/data';
import { revivalGlsl } from '../art/revival';
import { fxCommonGlsl, fxUniforms, fxWorldUniforms, markEffect, mulberry32, tangentFrame } from './shared';

/** A flock circles a point of the planet: its birds fly a small circle of angular
 * radius `rho` around `center`, at `radius` from the planet center. */
export interface FlockSpec {
  name: string;
  /** lat, lon in degrees of the point they circle. */
  at: [number, number];
  rho: number;
  radius: number;
  /** Angular speed in radians per second (sign = direction). */
  omega: number;
  count: number;
  /** Body/wing color and wing-tip color once the place is alive. */
  colors: [string, string];
  size: number;
}

export const FLOCKS: readonly FlockSpec[] = [
  { name: 'harbor gulls', at: [14, 6], rho: 0.4, radius: 17.6, omega: 0.2, count: 6, colors: ['#fbf7ec', '#8d93a6'], size: 0.7 },
  { name: 'bay gulls', at: [-28, 8], rho: 0.5, radius: 17.2, omega: -0.16, count: 5, colors: ['#fbf7ec', '#7f879c'], size: 0.7 },
  { name: 'workshop swallows', at: [26, 118], rho: 0.33, radius: 18.4, omega: 0.28, count: 5, colors: ['#4658b8', '#f3e3c0'], size: 0.52 },
  { name: 'old street songbirds', at: [20, -122], rho: 0.3, radius: 17.0, omega: -0.26, count: 4, colors: ['#ef7a64', '#ffd9a0'], size: 0.5 },
  { name: 'grove doves', at: [68, 25], rho: 0.28, radius: 19.6, omega: 0.22, count: 4, colors: ['#ffffff', '#c9d6f0'], size: 0.62 },
  { name: 'migration', at: [35, 40], rho: 1.5, radius: 21.0, omega: 0.07, count: 7, colors: ['#2f8f9c', '#e0f3f0'], size: 0.72 },
];

/** Per-instance layout (pure data, reproducible: used by the renderer and by tests). */
export interface BirdInstances {
  count: number;
  center: Float32Array; e1: Float32Array; e2: Float32Array;
  orbit: Float32Array; form: Float32Array; style: Float32Array;
  colorA: Float32Array; colorB: Float32Array;
}

export function buildBirdInstances(flocks: readonly FlockSpec[] = FLOCKS, seed = 7): BirdInstances {
  const random = mulberry32(seed);
  const count = flocks.reduce((sum, flock) => sum + flock.count, 0);
  const data: BirdInstances = {
    count,
    center: new Float32Array(count * 3), e1: new Float32Array(count * 3), e2: new Float32Array(count * 3),
    orbit: new Float32Array(count * 4), form: new Float32Array(count * 4), style: new Float32Array(count * 4),
    colorA: new Float32Array(count * 3), colorB: new Float32Array(count * 3),
  };
  let index = 0;
  for (const flock of flocks) {
    const center = dir(flock.at[0], flock.at[1]);
    const [e1, e2] = tangentFrame(center);
    const theta0 = random() * Math.PI * 2;
    const a = new Color(flock.colors[0]), b = new Color(flock.colors[1]);
    for (let i = 0; i < flock.count; i++, index++) {
      const lead = i - (flock.count - 1) / 2;
      data.center.set([center.x, center.y, center.z], index * 3);
      data.e1.set([e1.x, e1.y, e1.z], index * 3);
      data.e2.set([e2.x, e2.y, e2.z], index * 3);
      data.orbit.set([flock.rho, theta0, flock.omega, flock.radius], index * 4);
      // Loose V: wingmen sit to the side and behind the leader, with a little scatter.
      data.form.set([lead * (0.85 + random() * 0.3), (random() - 0.5) * 0.7, Math.abs(lead) * 0.75 + random() * 0.35, random()], index * 4);
      data.style.set([flock.size * (0.9 + random() * 0.2), 4.6 + random() * 2.4, 0.35 + random() * 0.25, random() * Math.PI * 2], index * 4);
      data.colorA.set([a.r, a.g, a.b], index * 3);
      data.colorB.set([b.r, b.g, b.b], index * 3);
    }
  }
  return data;
}

/** One bird: a tapered diamond-section body with beak and tail fan, and two jointed
 * wings with a trailing feather. +Z forward, +Y up, wings along ±X. */
function birdGeometry(): InstancedBufferGeometry {
  const vertices: number[] = [];
  const tri = (...points: number[][]) => points.forEach(point => vertices.push(...point));
  // body rings: z, half width, half height (top, right, bottom, left)
  const rings: [number, number, number][] = [[0.32, 0.03, 0.03], [0.2, 0.075, 0.07], [0.04, 0.095, 0.085], [-0.12, 0.07, 0.06], [-0.27, 0.025, 0.02]];
  const ringPoints = rings.map(([z, w, h]) => [[0, h, z], [w, 0, z], [0, -h * 0.8, z], [-w, 0, z]]);
  for (let k = 0; k < rings.length - 1; k++) {
    for (let side = 0; side < 4; side++) {
      const a = ringPoints[k][side], b = ringPoints[k][(side + 1) % 4], c = ringPoints[k + 1][side], d = ringPoints[k + 1][(side + 1) % 4];
      tri(a, c, b); tri(b, c, d);
    }
  }
  // beak and tail fan
  tri([0, 0.01, 0.44], ringPoints[0][0], ringPoints[0][1]); tri([0, 0.01, 0.44], ringPoints[0][3], ringPoints[0][0]);
  tri([0, 0.0, 0.44], ringPoints[0][1], ringPoints[0][2]); tri([0, 0.0, 0.44], ringPoints[0][2], ringPoints[0][3]);
  tri([-0.03, 0.01, -0.25], [0.03, 0.01, -0.25], [0.0, 0.01, -0.46]);
  tri([-0.03, 0.01, -0.25], [0.0, 0.01, -0.46], [-0.085, 0.01, -0.4]);
  tri([0.03, 0.01, -0.25], [0.085, 0.01, -0.4], [0.0, 0.01, -0.46]);
  // wings, both sides: root -> mid -> tip, plus a trailing feather
  for (const s of [-1, 1]) {
    const rootF = [s * 0.07, 0.01, 0.15], rootB = [s * 0.07, 0.01, -0.21];
    const midF = [s * 0.32, 0.03, 0.12], midB = [s * 0.31, 0.03, -0.27];
    const tip = [s * 0.64, 0.06, -0.14], feather = [s * 0.5, 0.04, -0.36];
    const quads: number[][][] = [[rootF, rootB, midB], [rootF, midB, midF], [midF, midB, tip], [midB, feather, tip]];
    for (const [a, b, c] of quads) { if (s < 0) tri(a, b, c); else tri(a, c, b); }
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  return geometry;
}

const vertexShader = /* glsl */ `
  ${revivalGlsl}
  ${fxCommonGlsl}
  attribute vec3 aCenter, aE1, aE2, aColorA, aColorB;
  attribute vec4 aOrbit, aForm, aStyle;
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vAlive;
  varying float vFringe;
  varying float vWing;
  varying vec3 vColorB;
  void main() {
    float theta = aOrbit.y + aOrbit.z * uTime;
    float sr = sin(aOrbit.x), cr = cos(aOrbit.x);
    vec3 radial = aCenter * cr + (aE1 * cos(theta) + aE2 * sin(theta)) * sr;
    vec3 tangent = normalize((-aE1 * sin(theta) + aE2 * cos(theta)) * (aOrbit.z < 0.0 ? -1.0 : 1.0));
    vec3 up = radial;
    vec3 side = cross(up, tangent);
    float seed = aForm.w;
    float bob = sin(uTime * 1.1 + seed * 30.0) * 0.14;
    vec3 center = radial * (aOrbit.w + aForm.y + bob) + side * aForm.x - tangent * aForm.z;
    // lean into the turn
    vec3 inward = aCenter - radial * dot(aCenter, radial);
    float turnSide = dot(normalize(inward + 1e-5), side) > 0.0 ? 1.0 : -1.0;
    float bank = aStyle.z * turnSide;
    vec3 rollSide = side * cos(bank) - up * sin(bank);
    vec3 rollUp = up * cos(bank) + side * sin(bank);
    vec3 p = position * aStyle.x;
    float wing = abs(position.x);
    float glide = 1.0 - 0.85 * smoothstep(0.55, 0.85, sin(uTime * 0.35 + seed * 9.0));
    float flap = sin(uTime * aStyle.y + aStyle.w - wing * 2.6) * glide;
    p.y += flap * wing * 0.8 * aStyle.x;
    p.z -= abs(flap) * wing * 0.12 * aStyle.x;
    vWorld = center + rollSide * p.x + rollUp * p.y + tangent * p.z;
    vec3 life = revivalDetail(center);
    vAlive = life.x;
    vFringe = life.y;
    vColor = aColorA;
    vColorB = aColorB;
    vWing = wing * step(0.12, wing);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${fxCommonGlsl}
  varying vec3 vWorld;
  varying vec3 vColor;
  varying float vAlive;
  varying float vFringe;
  varying float vWing;
  varying vec3 vColorB;
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
    float diffuse = dot(n, normalize(uLightPosition - vWorld));
    float lit = smoothstep(-0.05, 0.14, diffuse);
    vec3 base = mix(vColor, vColorB, step(0.42, vWing));
    vec3 colored = mix(base * uShadowTint * 0.95, base, lit);
    colored *= mix(vec3(1.0), mix(vec3(0.84, 0.78, 1.02), vec3(1.0, 0.82, 0.7), lit), uDusk);
    // unrevived: pencil-grey silhouettes with a lighter lit side
    vec3 graphite = mix(vec3(0.07, 0.072, 0.1), uPaper * 0.6, lit * 0.6);
    vec3 color = mix(graphite, colored, vAlive);
    color = mix(color, uFringe, vFringe * 0.4);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function createBirds(): { mesh: Mesh; count: number } {
  const data = buildBirdInstances();
  const geometry = birdGeometry();
  const attribute = (array: Float32Array, size: number) => new InstancedBufferAttribute(array, size);
  geometry.setAttribute('aCenter', attribute(data.center, 3));
  geometry.setAttribute('aE1', attribute(data.e1, 3));
  geometry.setAttribute('aE2', attribute(data.e2, 3));
  geometry.setAttribute('aOrbit', attribute(data.orbit, 4));
  geometry.setAttribute('aForm', attribute(data.form, 4));
  geometry.setAttribute('aStyle', attribute(data.style, 4));
  geometry.setAttribute('aColorA', attribute(data.colorA, 3));
  geometry.setAttribute('aColorB', attribute(data.colorB, 3));
  geometry.instanceCount = data.count;
  const material = new ShaderMaterial({
    name: 'UnspoolBirds',
    uniforms: { ...fxWorldUniforms, ...fxUniforms },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Birds';
  markEffect(mesh, { outline: true });
  return { mesh, count: data.count };
}

