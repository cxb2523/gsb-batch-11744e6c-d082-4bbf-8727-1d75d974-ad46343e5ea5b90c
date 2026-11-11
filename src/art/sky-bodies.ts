import {
  BufferAttribute, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Vector3, type Camera,
} from 'three';
import { overlayBlending } from './blend';
import { glslColor as rgb, noiseGlsl } from './glsl';
import { revivalUniforms } from './revival';
import { toonShared } from './toon';

/** Tiny distant worlds hanging in the sky: a hint of the chapters to come. In the game they sit at
 * fixed azimuth/elevation (radians) in the player's local sky frame; on the title screen at fixed
 * screen positions (NDC), so the framing stays composed whatever the camera does.
 * Rows: [azimuth or screen x, elevation or screen y, angular radius (or radius in screen heights), kind]. */
export const GAME_BODIES = [
  [0.55, 0.40, 0.07, 0], [2.35, 0.30, 0.085, 1], [-1.95, 0.60, 0.04, 2], [-0.75, 0.24, 0.045, 3], [4.0, 0.16, 0.04, 4],
] as const;
export const TITLE_BODIES = [
  [-0.78, 0.56, 0.135, 0], [0.84, -0.52, 0.17, 1], [0.66, 0.66, 0.065, 2], [-0.72, -0.60, 0.085, 3], [0.46, 0.30, 0.05, 4],
] as const;
const COUNT = GAME_BODIES.length + TITLE_BODIES.length;

const vertexShader = /* glsl */ `
  attribute vec3 aCenter, aTx, aTy;
  attribute vec4 aInfo;       // radius, kind, alpha, distance
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vLight;
  varying float vKind, vAlpha, vTitle;
  void main() {
    vec3 offset = (aTx * position.x + aTy * position.y) * (aInfo.x * 1.35);
    vec3 world = cameraPosition + (aCenter + offset) * aInfo.w;
    vUv = position.xy * 1.35;
    vKind = aInfo.y;
    vAlpha = aInfo.z;
    vTitle = aInfo.w > 60.0 ? 1.0 : 0.0;
    vec3 l = vec3(dot(uSunDir, aTx), dot(uSunDir, aTy), -dot(uSunDir, aCenter));
    vLight = normalize(l + vec3(0.0, 0.0, 0.35));
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    if (aInfo.z < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  ${noiseGlsl}
  uniform float uGlobalLife, uTime;
  uniform vec3 uPaper;
  varying vec2 vUv;
  varying vec3 vLight;
  varying float vKind, vAlpha, vTitle;
  vec3 graphite() { return ${rgb(0x5a5a68)}; }
  vec3 ink() { return ${rgb(0x2a2c3a)}; }
  // ---- toon shading for the little worlds ---------------------------------
  vec3 bodyShade(vec3 base, float nl, vec2 uv, float aa, float life) {
    float lit = smoothstep(-0.05, 0.12, nl);
    vec3 colored = mix(base * vec3(0.5, 0.5, 0.82), base, lit);
    vec3 paper = uPaper * mix(0.9, 1.02, lit);
    float s = (uv.x + uv.y) * 9.0;
    float stroke = 1.0 - smoothstep(0.1 - aa * 9.0, 0.1 + aa * 9.0, abs(fract(s) - 0.5));
    paper = mix(paper, graphite(), (1.0 - lit) * stroke * 0.55);
    return mix(paper, colored, life);
  }
  vec3 inkLine(vec3 color, float line, float life) {
    return mix(color, mix(graphite(), ink(), life), line * 0.8);
  }

  // kind 0: ringed planet
  vec4 ringedPlanet(vec2 uv, float aa, vec3 l, float life, float sunAmount) {
    vec2 pr = uv / 0.58;
    float r = length(pr);
    float c = cos(0.42), s = sin(0.42);
    vec2 q = vec2(c * uv.x + s * uv.y, -s * uv.x + c * uv.y);
    q.y /= 0.27;
    float rr = length(q);
    float ringBand = smoothstep(0.78 - aa, 0.78 + aa, rr) * (1.0 - smoothstep(1.02 - aa, 1.02 + aa, rr));
    ringBand *= 1.0 - 0.8 * smoothstep(0.88, 0.9, rr) * (1.0 - smoothstep(0.9, 0.92, rr));
    float ringEdge = (1.0 - smoothstep(0.0, aa * 1.6, abs(rr - 0.78))) + (1.0 - smoothstep(0.0, aa * 1.6, abs(rr - 1.02)));
    float planet = 1.0 - smoothstep(1.0 - aa / 0.58, 1.0 + aa / 0.58, r);
    vec3 n = vec3(pr, sqrt(max(0.0, 1.0 - dot(pr, pr))));
    float nl = dot(n, l);
    float bands = sin(pr.y * 9.0 + 0.8) * 0.5 + 0.5;
    vec3 base = mix(${rgb(0xf0a2b8)}, ${rgb(0xffc27a)}, smoothstep(0.35, 0.65, bands));
    vec3 color = bodyShade(base, nl, pr, aa / 0.58, life);
    color = inkLine(color, smoothstep(1.0 - 2.2 * aa / 0.58, 1.0 - 0.6 * aa / 0.58, r), life);
    vec3 ringColor = bodyShade(${rgb(0xfff0c4)}, 0.5, q, aa, life);
    float back = ringBand * step(0.0, q.y);
    float front = ringBand * step(q.y, 0.0);
    vec3 out_ = vec3(0.0); float a = 0.0;
    out_ = ringColor; a = back;
    out_ = mix(out_, color, planet); a = max(a, planet);
    out_ = mix(out_, ringColor, front); a = max(a, front);
    float edge = ringEdge * ringBand;
    out_ = inkLine(out_, edge * 0.8, life);
    return vec4(out_, a);
  }

  // kind 1 and 4: floating island with a tree and a house
  vec4 floatingIsland(vec2 uv, float aa, vec3 l, float life, float seed) {
    uv.y += 0.25;
    float topEllipse = length(vec2(uv.x / 1.0, uv.y / 0.2)) - 1.0;
    float depth = clamp(-uv.y / 1.05, 0.0, 1.0);
    float jag = (unNoise2(vec2(uv.y * 5.0 + seed, seed)) - 0.5) * 0.18;
    float halfWidth = pow(1.0 - depth, 0.78) * 0.98 + jag * (1.0 - depth);
    float rock = (abs(uv.x) < halfWidth && uv.y < 0.02 && uv.y > -1.05) ? 1.0 : 0.0;
    float grass = 1.0 - smoothstep(-aa * 1.2, aa * 1.2, topEllipse * 0.2);
    // tree
    vec2 tp = uv - vec2(0.34, 0.5);
    float leaf = 1.0 - smoothstep(0.0, aa * 2.0, length(tp) - 0.26);
    float trunk = (abs(uv.x - 0.34) < 0.04 && uv.y > 0.1 && uv.y < 0.3) ? 1.0 : 0.0;
    // house
    float wall = (uv.x > -0.55 && uv.x < -0.2 && uv.y > 0.05 && uv.y < 0.3) ? 1.0 : 0.0;
    float roofT = clamp((uv.y - 0.3) / 0.2, 0.0, 1.0);
    float roof = (uv.y >= 0.3 && uv.y < 0.5 && abs(uv.x + 0.375) < 0.24 * (1.0 - roofT)) ? 1.0 : 0.0;
    float lightFace = smoothstep(-0.2, 0.3, l.x * uv.x + l.y * 0.5);
    vec3 rockColor = bodyShade(${rgb(0xa3a8b5)}, mix(-0.3, 0.5, lightFace) - (uv.x * l.x < 0.0 ? 0.0 : 0.0), uv, aa, life);
    vec3 grassColor = bodyShade(${rgb(0x8cc66b)}, 0.6, uv, aa, life);
    vec3 leafColor = bodyShade(${rgb(0x5fae6a)}, mix(-0.3, 0.6, smoothstep(-0.3, 0.3, dot(tp / 0.26, l.xy))), tp, aa, life);
    vec3 trunkColor = bodyShade(${rgb(0xb07a4f)}, -0.3, uv, aa, life);
    vec3 wallColor = bodyShade(${rgb(0xf6ead2)}, 0.4, uv, aa, life);
    vec3 roofColor = bodyShade(${rgb(0xe0705a)}, 0.4, uv, aa, life);
    vec3 col = rockColor; float a = rock;
    col = mix(col, grassColor, grass); a = max(a, grass);
    col = mix(col, trunkColor, trunk); a = max(a, trunk);
    col = mix(col, wallColor, wall); a = max(a, wall);
    col = mix(col, roofColor, roof); a = max(a, roof);
    col = mix(col, leafColor, leaf); a = max(a, leaf);
    // ink: outline of the rock silhouette and top ellipse
    float rim = (1.0 - smoothstep(0.0, aa * 2.0, abs(topEllipse * 0.2))) * grass
      + (1.0 - smoothstep(0.0, aa * 2.2, abs(abs(uv.x) - halfWidth))) * rock
      + (1.0 - smoothstep(0.0, aa * 2.0, abs(length(tp) - 0.26))) * leaf;
    col = inkLine(col, clamp(rim, 0.0, 1.0), life);
    return vec4(col, a);
  }

  // kind 2: moon with craters
  vec4 moon(vec2 uv, float aa, vec3 l, float life) {
    float r = length(uv);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
    vec3 n = vec3(uv, sqrt(max(0.0, 1.0 - dot(uv, uv))));
    float nl = dot(n, l);
    vec3 base = ${rgb(0xfff2d4)};
    vec3 color = bodyShade(base, nl, uv, aa, life);
    float crater = 0.0;
    crater += 1.0 - smoothstep(0.17, 0.2, length(uv - vec2(-0.3, 0.25)));
    crater += 1.0 - smoothstep(0.11, 0.14, length(uv - vec2(0.35, -0.1)));
    crater += 1.0 - smoothstep(0.08, 0.1, length(uv - vec2(-0.05, -0.45)));
    color = mix(color, color * vec3(0.82, 0.8, 0.9), clamp(crater, 0.0, 1.0));
    color = inkLine(color, smoothstep(1.0 - 2.2 * aa, 1.0 - 0.6 * aa, r), life);
    return vec4(color, disc);
  }

  // kind 3: banded gas giant
  vec4 gasGiant(vec2 uv, float aa, vec3 l, float life) {
    float r = length(uv);
    float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
    vec3 n = vec3(uv, sqrt(max(0.0, 1.0 - dot(uv, uv))));
    float nl = dot(n, l);
    float bands = floor((uv.y + 1.0) * 3.5 + sin(uv.x * 2.0) * 0.25);
    vec3 base = mix(${rgb(0x4aa39a)}, ${rgb(0xe8b84a)}, mod(bands, 2.0));
    vec3 color = bodyShade(base, nl, uv, aa, life);
    float spot = 1.0 - smoothstep(0.17, 0.2, length((uv - vec2(0.3, -0.2)) * vec2(1.0, 1.6)));
    color = mix(color, bodyShade(${rgb(0xe0705a)}, nl, uv, aa, life), spot);
    color = inkLine(color, smoothstep(1.0 - 2.2 * aa, 1.0 - 0.6 * aa, r), life);
    return vec4(color, disc);
  }


  void main() {
    vec2 uv = vUv;
    float aa = max(length(fwidth(uv)), 1e-4);
    float skyLife = 1.0 - exp(-uGlobalLife * 5.0);
    float life = vTitle > 0.5 ? 0.55 + 0.45 * skyLife : 0.14 + 0.86 * skyLife;
    uv.y += sin(uTime * 0.25 + vKind * 3.0) * 0.04;
    vec3 l = normalize(vLight);
    vec4 sprite;
    if (vKind < 0.5) sprite = ringedPlanet(uv, aa, l, life, 1.0);
    else if (vKind < 1.5) sprite = floatingIsland(uv, aa, l, life, 1.7);
    else if (vKind < 2.5) sprite = moon(uv, aa, l, life);
    else if (vKind < 3.5) sprite = gasGiant(uv, aa, l, life);
    else sprite = floatingIsland(uv + vec2(0.0, 0.1), aa, l, life, 5.3);
    float alpha = sprite.a * vAlpha;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(sprite.rgb, alpha);
  }
`;

export interface SkyBodies {
  mesh: Mesh;
  /** Gameplay set: needs the local sky frame; `amount` fades it (1 = fully shown). */
  updateGame(east: Vector3, north: Vector3, up: Vector3, amount: number): void;
  /** Title set: fixed screen positions, derived from the render camera; `amount` fades it. */
  updateTitle(camera: Camera, amount: number): void;
  setSun(direction: Vector3): void;
}

/** One instanced quad per body, drawn after the dome with the depth test on (the home planet
 * hides what is behind it) and alpha blending that keeps the ink surface id untouched. Keeping
 * them out of the dome shader keeps that shader small and cheap. */
export function createSkyBodies(): SkyBodies {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const center = new InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  const tx = new InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  const ty = new InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  const info = new InstancedBufferAttribute(new Float32Array(COUNT * 4), 4);
  geometry.setAttribute('aCenter', center);
  geometry.setAttribute('aTx', tx);
  geometry.setAttribute('aTy', ty);
  geometry.setAttribute('aInfo', info);
  geometry.instanceCount = COUNT;
  const sun = new Vector3(-0.4, 0.8, 0.45).normalize();
  const material = new ShaderMaterial({
    name: 'UnspoolSkyBodies',
    uniforms: {
      uGlobalLife: revivalUniforms.uGlobalLife, uTime: revivalUniforms.uTime,
      uPaper: toonShared.uPaper, uSunDir: { value: sun },
    },
    vertexShader, fragmentShader, side: DoubleSide,
  });
  overlayBlending(material);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'UnspoolSkyBodies';
  mesh.renderOrder = 1001;
  mesh.frustumCulled = false;
  mesh.userData.noOutline = true;
  mesh.userData.ignoreDepthPrepass = true;

  const c = new Vector3(), up = new Vector3(), x = new Vector3(), y = new Vector3(), right = new Vector3(), forward = new Vector3();
  const write = (index: number, center3: Vector3, upReference: Vector3, radius: number, kind: number, alpha: number, distance: number) => {
    y.copy(upReference).addScaledVector(center3, -upReference.dot(center3));
    if (y.lengthSq() < 1e-8) y.set(1, 0, 0);
    y.normalize();
    x.crossVectors(center3, y);
    center.setXYZ(index, center3.x, center3.y, center3.z);
    tx.setXYZ(index, x.x, x.y, x.z);
    ty.setXYZ(index, y.x, y.y, y.z);
    info.setXYZW(index, radius, kind, alpha, distance);
  };
  const flush = () => { center.needsUpdate = tx.needsUpdate = ty.needsUpdate = info.needsUpdate = true; };
  return {
    mesh,
    setSun(direction) { sun.copy(direction); },
    updateGame(east, north, upFrame, amount) {
      GAME_BODIES.forEach((body, index) => {
        c.copy(east).multiplyScalar(Math.cos(body[0])).addScaledVector(north, Math.sin(body[0])).multiplyScalar(Math.cos(body[1]))
          .addScaledVector(upFrame, Math.sin(body[1]));
        write(index, c, upFrame, body[2], body[3], amount, 32);
      });
      flush();
    },
    updateTitle(camera, amount) {
      const e = camera.matrixWorld.elements;
      right.set(e[0], e[1], e[2]);
      up.set(e[4], e[5], e[6]);
      forward.set(-e[8], -e[9], -e[10]);
      const m = (camera as unknown as { projectionMatrix: { elements: number[] } }).projectionMatrix.elements;
      const tanY = 1 / m[5], aspect = m[5] / m[0];
      TITLE_BODIES.forEach((body, index) => {
        c.copy(forward).addScaledVector(right, body[0] * tanY * aspect).addScaledVector(up, body[1] * tanY).normalize();
        const radius = body[2] * tanY * Math.min(1, aspect * 0.9);
        write(GAME_BODIES.length + index, c, up, radius, body[3], amount, 110);
      });
      flush();
    },
  };
}
