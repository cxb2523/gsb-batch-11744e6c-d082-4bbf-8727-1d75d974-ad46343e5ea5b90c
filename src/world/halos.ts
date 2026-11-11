import {
  AdditiveBlending, BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, ShaderMaterial, Vector3,
} from 'three';
import type { Ctx } from './context';
import { GLOW_CHANNELS } from './materials';

/** Soft additive glows around lanterns and lamps. Lights register themselves
 * while the world is authored; one instanced billboard mesh draws them all and
 * fades each with its glow channel (shared uGlow uniform). */

interface Halo { position: Vector3; radius: number; channel: number }
let registry: Halo[] = [];

export function resetHalos(): void { registry = []; }
export function addHalo(position: Vector3, radius: number, channel: number): void {
  registry.push({ position: position.clone(), radius, channel });
}

export function buildHalos(ctx: Ctx): InstancedMesh | undefined {
  if (!registry.length) return undefined;
  const geometry = new PlaneGeometry(2, 2);
  geometry.deleteAttribute('normal');
  const material = new ShaderMaterial({
    name: 'WorldHalos',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    userData: { noOutline: true, castShadow: false },
    uniforms: { uGlow: { value: ctx.mats.glow } },
    vertexShader: /* glsl */ `
      attribute float aChannel;
      attribute float aRadius;
      uniform vec3 uGlow[${GLOW_CHANNELS}];
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = position.xy;
        vec3 g = uGlow[int(aChannel + 0.5)];
        float level = max(g.x, max(g.y, g.z));
        vTint = level > 0.001 ? g / level : vec3(1.0);
        vTint *= min(level, 1.4);
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float size = aRadius * (level > 0.01 ? 1.0 : 0.0);
        center.xy += position.xy * size;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        float r = length(vUv);
        float a = smoothstep(1.0, 0.0, r);
        a = a * a * 0.55;
        gl_FragColor = vec4(vTint * a, a);
      }`,
  });
  const mesh = new InstancedMesh(geometry, material, registry.length);
  mesh.name = 'Halos';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const channel = new Float32Array(registry.length), radius = new Float32Array(registry.length);
  const m = new Matrix4();
  registry.forEach((h, i) => {
    m.makeTranslation(h.position.x, h.position.y, h.position.z);
    mesh.setMatrixAt(i, m);
    channel[i] = h.channel;
    radius[i] = h.radius;
  });
  geometry.setAttribute('aChannel', new InstancedBufferAttribute(channel, 1));
  geometry.setAttribute('aRadius', new InstancedBufferAttribute(radius, 1));
  ctx.group.add(mesh);
  return mesh;
}

void BufferAttribute;
