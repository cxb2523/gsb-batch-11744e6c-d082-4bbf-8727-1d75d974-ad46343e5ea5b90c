import {
  AddEquation, BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, Mesh, OneFactor,
  OneMinusSrcAlphaFactor, ShaderMaterial, SrcAlphaFactor, ZeroFactor, type PerspectiveCamera,
} from 'three';
import { PALETTE, diagnoseWoven, undiagnosableDiagnosis, type WovenDiagnosis } from './diagnose';

/** Everyone's walks as thin glowing ribbons, with a spark walking along each
 * one. One draw call for all of them. Over-blended on color; alpha (the ink
 * surface id) and the ink normal target stay untouched. */

const vertex = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aAlong;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uPixel;
  uniform float uWidth;
  varying float vSide;
  varying float vAlong;
  varying float vSeed;
  varying vec3 vColor;
  varying float vFacing;
  void main() {
    vec3 p = position;
    vec3 toCamera = cameraPosition - p;
    float distance = length(toCamera);
    vec3 side = normalize(cross(aTangent, toCamera / distance));
    // never thinner than ~1.6 px, so far threads read as light, not aliasing
    float halfWidth = max(uWidth, uPixel * distance * 1.6);
    p += side * aSide * halfWidth;
    vSide = aSide;
    vAlong = aAlong;
    vSeed = aSeed;
    vColor = aColor;
    // threads on the far limb fade instead of popping at the horizon
    vFacing = dot(normalize(position), toCamera / distance);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uSpark;
  varying float vSide;
  varying float vAlong;
  varying float vSeed;
  varying vec3 vColor;
  varying float vFacing;
  void main() {
    float x = abs(vSide);
    float core = exp(-x * x * 9.0);
    float halo = exp(-x * x * 2.2) * 0.35;
    // a traveler's spark: a bright head and a fading tail, walking the route
    float speed = 1.1 + vSeed * 0.9;
    float s = fract((vAlong - uTime * speed) / 38.0 + vSeed * 13.0);
    float head = smoothstep(0.985, 0.996, s) * (1.0 - smoothstep(0.996, 1.0, s));
    float tail = smoothstep(0.86, 0.996, s) * (1.0 - smoothstep(0.996, 1.0, s));
    float shimmer = 0.82 + 0.18 * sin(vAlong * 0.9 + uTime * 1.3 + vSeed * 40.0);
    // Alpha-blended strands: a bundle of many routes reads as a thick rope of
    // mixed colors instead of burning out to white. Values above 1 still glow.
    float alpha = clamp(core + halo, 0.0, 1.0) * uIntensity;
    vec3 color = vColor * (1.15 + 0.5 * core) * shimmer;
    float spark = (tail * 0.8 + head * 3.0) * core * uSpark;
    color += mix(vColor, vec3(1.0, 0.97, 0.9), 0.6) * spark * 2.0;
    alpha = max(alpha, clamp(spark, 0.0, 1.0));
    alpha *= smoothstep(-0.05, 0.25, vFacing);
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface Woven {
  mesh: Mesh;
  material: ShaderMaterial;
  travelers: number;
  update(time: number, camera: PerspectiveCamera, viewportHeight: number): void;
  /** 只读诊断：从当前几何体属性与材质 uniform 采集快照，返回纯数据的渲染诊断。
   * mesh 已移除或几何体属性缺失时返回“不可诊断”的降级结果，不抛异常。 */
  audit(): WovenDiagnosis;
}

export interface Traveler { c: number; p: ArrayLike<number> }

/** Prototype helper: simulated routes from scripts/woven-sample.ts (never real players). */
export async function loadSample(url: string): Promise<Traveler[]> {
  return (await (await fetch(url)).json() as { travelers: Traveler[] }).travelers;
}

export function createWoven(travelers: Traveler[], options: { width?: number; lift?: number } = {}): Woven {
  const lift = options.lift ?? 0;
  let vertices = 0, quads = 0;
  for (const t of travelers) { const n = t.p.length / 3; vertices += n * 2; quads += n - 1; }
  const position = new Float32Array(vertices * 3), tangent = new Float32Array(vertices * 3), color = new Float32Array(vertices * 3);
  const side = new Float32Array(vertices), along = new Float32Array(vertices), seed = new Float32Array(vertices);
  const index = new Uint32Array(quads * 6);
  let v = 0, o = 0;
  const c = new Color();
  travelers.forEach((t, k) => {
    const n = t.p.length / 3, p = t.p;
    c.set(PALETTE[t.c % PALETTE.length]);
    const s = (k * 0.618034) % 1;
    let distance = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) distance += Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2], p[i * 3 + 2] - p[i * 3 - 1]);
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = p[b * 3] - p[a * 3], ty = p[b * 3 + 1] - p[a * 3 + 1], tz = p[b * 3 + 2] - p[a * 3 + 2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      for (const sign of [-1, 1]) {
        const r = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) || 1, k = 1 + lift / r;
        position.set([p[i * 3] * k, p[i * 3 + 1] * k, p[i * 3 + 2] * k], v * 3);
        tangent.set([tx, ty, tz], v * 3);
        color.set([c.r, c.g, c.b], v * 3);
        side[v] = sign; along[v] = distance; seed[v] = s;
        v++;
      }
      if (i < n - 1) {
        const base = v - 2;
        index.set([base, base + 1, base + 2, base + 1, base + 3, base + 2], o); o += 6;
      }
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('aTangent', new BufferAttribute(tangent, 3));
  geometry.setAttribute('aColor', new BufferAttribute(color, 3));
  geometry.setAttribute('aSide', new BufferAttribute(side, 1));
  geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingSphere();
  const material = new ShaderMaterial({
    name: 'UnspoolWoven',
    uniforms: { uTime: { value: 0 }, uPixel: { value: 0.001 }, uWidth: { value: options.width ?? 0.022 }, uIntensity: { value: 1 }, uSpark: { value: 1 } },
    vertexShader: vertex, fragmentShader: fragment,
    transparent: true, depthWrite: false, side: DoubleSide,
    // ordinary over-blending on color; alpha (ink surface id) and the second target (alpha 0) are left alone
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor,
    blendEquationAlpha: AddEquation, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
  });
  material.userData.noOutline = true;
  const mesh = new Mesh(geometry, material);
  mesh.name = 'Woven';
  mesh.userData.ignoreDepthPrepass = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  // Snapshot of what was baked into the geometry, for audit().
  const routeMeta = travelers.map(t => ({ c: t.c, points: t.p.length / 3 }));
  return {
    mesh, material, travelers: travelers.length,
    update(time, camera, viewportHeight) {
      material.uniforms.uTime.value = time;
      material.uniforms.uPixel.value = 2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, viewportHeight);
    },
    audit() {
      const position = mesh.geometry?.getAttribute('position');
      const index = mesh.geometry?.getIndex();
      if (!mesh.parent || !position || !mesh.geometry.getAttribute('aTangent') || !mesh.geometry.getAttribute('aColor') || !index) {
        return undiagnosableDiagnosis('mesh 已不在场景中，或几何体属性缺失（position/aTangent/aColor/index）');
      }
      return diagnoseWoven({
        travelers: routeMeta,
        width: Number(material.uniforms.uWidth.value),
        lift,
        budget: null, // 已经构建完成，截断发生在上游 main.ts
        camera: { uPixel: Number(material.uniforms.uPixel.value) },
        actual: { vertices: position.count, indices: index.count },
      });
    },
  };
}
