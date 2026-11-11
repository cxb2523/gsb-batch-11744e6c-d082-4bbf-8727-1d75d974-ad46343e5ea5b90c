import {
  BackSide, Color, DoubleSide, Mesh, Quaternion, RingGeometry, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { sphereOrientation, sphereTangent } from './sphere';
import { revivalUniforms } from './art/revival';
import { PALETTE, toonShared } from './art/toon';
import { glslColor as rgb, noiseGlsl } from './art/glsl';
import { overlayBlending } from './art/blend';
import { createSkyBodies } from './art/sky-bodies';

/** The sky removes character yaw, then compensates 90% of its transported
 * frame rotation. Keep a separate frame so turning or crossing a geographic
 * pole cannot spin the clouds. */
export class PlanetSkyOrientation {
  readonly rotation = new Quaternion();
  private readonly frame = new Quaternion();
  private readonly previousFrame = new Quaternion();
  private readonly offset = new Quaternion();
  private readonly correction = new Quaternion();
  private readonly target = new Quaternion();
  private readonly previousNormal = new Vector3();
  private initialized = false;

  reset(normal: Vector3, forward = sphereTangent(normal)): void {
    this.frame.copy(sphereOrientation(normal, forward));
    this.previousFrame.copy(this.frame);
    this.previousNormal.copy(normal).normalize();
    this.offset.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI * .5);
    this.rotation.copy(this.frame).multiply(this.offset);
    this.initialized = true;
  }

  update(normal: Vector3, forward?: Vector3): Quaternion {
    if (!this.initialized) this.reset(normal, forward);
    const nextNormal = normal.clone().normalize();
    if (this.previousNormal.dot(nextNormal) < -1 + 1e-8) {
      this.reset(nextNormal, forward);
      return this.rotation;
    }
    this.correction.setFromUnitVectors(this.previousNormal, nextNormal);
    this.frame.premultiply(this.correction).normalize();
    this.correction.copy(this.frame).invert().multiply(this.previousFrame);
    this.target.copy(this.offset).premultiply(this.correction);
    this.offset.slerp(this.target, .9).normalize();
    this.rotation.copy(this.frame).multiply(this.offset).normalize();
    this.previousFrame.copy(this.frame);
    this.previousNormal.copy(nextNormal);
    return this.rotation;
  }

  /** The parallel-transported local frame (x = east, y = up, z = north/forward):
   * it follows the player around the planet but never yaws with the character. */
  basis(east: Vector3, up: Vector3, north: Vector3): void {
    east.set(1, 0, 0).applyQuaternion(this.frame);
    up.set(0, 1, 0).applyQuaternion(this.frame);
    north.set(0, 0, 1).applyQuaternion(this.frame);
  }
}

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec4 vClip;
  varying vec2 vProjection;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vProjection = vec2(1.0 / projectionMatrix[1][1], projectionMatrix[1][1] / projectionMatrix[0][0]);
    vClip = projectionMatrix * viewMatrix * world;
    gl_Position = vClip;
  }
`;

const fragmentShader = /* glsl */ `
  ${noiseGlsl}
  uniform float uGlobalLife, uTime, uDusk, uTitle, uNight;
  uniform vec3 uUp, uEast, uNorth, uSunDir, uSunShown, uPaper;
  varying vec3 vWorld;
  varying vec4 vClip;
  varying vec2 vProjection;

  vec3 graphite() { return ${rgb(0x5a5a68)}; }
  vec3 ink() { return ${rgb(0x2a2c3a)}; }

  float softBands(float t, float n, float softness) {
    float x = clamp(t, 0.0, 0.9999) * n;
    float b = floor(x);
    return (b + smoothstep(0.5 - softness * 0.5, 0.5 + softness * 0.5, fract(x))) / n;
  }

  // Diagonal pencil strokes in sky-direction space: stable while the camera moves.
  float skyStrokes(float az, float el, float freq, float width, float aa) {
    float s = az / 6.2831853 * floor(freq * 6.2831853) * 0.7 + el * freq;
    float f = abs(fract(s) - 0.5);
    return 1.0 - smoothstep(width - aa, width + aa, f);
  }

  // ---- clouds --------------------------------------------------------------
  const float PUFF_X[5] = float[5](-0.52, -0.27, 0.0, 0.27, 0.52);
  const float PUFF_R[5] = float[5](0.12, 0.19, 0.27, 0.2, 0.13);
  // Per-cell cloud parameters, hashed once per pixel instead of once per SDF evaluation.
  struct CloudShape { float scale; float shift; float base; vec4 jitterA; float jitterB; };
  CloudShape cloudShape(vec2 cell, float seed) {
    CloudShape c;
    c.scale = mix(0.62, 1.12, unHash12(cell + seed));
    c.shift = (unHash12(cell + seed + 9.1) - 0.5) * 0.5;
    c.base = 0.16 + unHash12(cell + seed + 4.7) * 0.3;
    c.jitterA = vec4(unHash12(cell + seed * 3.0), unHash12(cell + 1.7 + seed * 3.0), unHash12(cell + 3.4 + seed * 3.0), unHash12(cell + 5.1 + seed * 3.0));
    c.jitterB = unHash12(cell + 6.8 + seed * 3.0);
    return c;
  }
  float puffSdf(vec2 q, CloudShape c) {
    float d = 1e3;
    for (int i = 0; i < 5; i++) {
      float jitter = i < 4 ? c.jitterA[i] : c.jitterB;
      float radius = PUFF_R[i] * c.scale * mix(0.85, 1.15, jitter);
      vec2 center = vec2(c.shift + PUFF_X[i] * c.scale + (jitter - 0.5) * 0.06, c.base + radius * 0.62);
      d = min(d, length(q - center) - radius);
    }
    return max(d, c.base - q.y);
  }
  // x: coverage, y: lower shade, z: deeper lower shade, w: outline
  vec4 cloudLayer(float az, float elA, float cells, float rowH, float seed, float amount, float speed, float aa) {
    float v = elA / rowH + 0.5;
    float row = floor(v);
    float u = az / 6.2831853 * cells + uTime * speed + row * 0.41;
    vec2 cell = vec2(mod(floor(u), cells), row);
    vec2 p = vec2(fract(u), fract(v));
    float aspect = 6.2831853 / cells / rowH;
    vec2 q = vec2((p.x - 0.5) * aspect, p.y);
    float presence = step(1.0 - amount * (1.0 - 0.3 * max(row, 0.0)), unHash12(cell + seed));
    if (presence < 0.5 || row > 3.0) return vec4(0.0);
    CloudShape shape = cloudShape(cell, seed);
    float aaCell = aa / rowH;
    // bounding box of the puffs: most pixels of a populated cell are empty sky
    if (abs(q.x - shape.shift) > 0.7 * shape.scale + 0.04 || q.y > shape.base + 0.55 * shape.scale + 0.1 || q.y < shape.base - 0.05) return vec4(0.0);
    float d0 = puffSdf(q, shape);
    if (d0 > aaCell * 3.0) return vec4(0.0);
    float body = 1.0 - smoothstep(-aaCell, aaCell, d0);
    float lower = body * smoothstep(0.0, aaCell * 2.0, puffSdf(q - vec2(0.012, 0.042), shape));
    float deeper = body * smoothstep(0.0, aaCell * 2.0, puffSdf(q - vec2(0.03, 0.095), shape));
    float outline = 1.0 - smoothstep(0.0, aaCell * 1.6, abs(d0));
    return vec4(body, lower, deeper, outline);
  }

  void main() {
    vec3 rd = normalize(vWorld - cameraPosition);
    float pixelAngle = max(length(fwidth(rd)), 1e-5);
    float skyLife = 1.0 - exp(-uGlobalLife * 5.0);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vec3 result = vec3(0.0);

    // ============ gameplay sky ============
    if (uTitle < 0.999) {
      float el = dot(rd, uUp);
      float elA = asin(clamp(el, -1.0, 1.0));
      float az = atan(dot(rd, uNorth), dot(rd, uEast));
      float aa = pixelAngle;

      float t = smoothstep(-0.06, 0.62, el);
      vec3 dayHorizon = ${rgb(0xfff1c9)}, dayMid = ${rgb(0x9fe0ef)}, dayTop = ${rgb(0x4cc3e6)};
      vec3 day = mix(mix(dayHorizon, dayMid, smoothstep(0.0, 0.5, softBands(t, 6.0, 0.7))),
        dayTop, smoothstep(0.35, 1.0, softBands(t, 6.0, 0.7)));
      vec3 paperSky = mix(${rgb(0xf1ede4)}, ${rgb(0xdcdcd4)}, smoothstep(0.0, 1.0, t));
      vec3 duskHorizon = ${rgb(0xffb08a)}, duskMid = ${rgb(0xd58ab0)}, duskTop = ${rgb(0x4d4f9e)};
      vec3 dusk = mix(mix(duskHorizon, duskMid, smoothstep(0.0, 0.42, t)), duskTop, smoothstep(0.3, 1.0, t));
      vec3 sky = mix(paperSky, day, skyLife);
      sky = mix(sky, dusk, uDusk);
      // finale night: deep indigo with a faint glow at the horizon
      vec3 night = mix(mix(${rgb(0x3a3f78)}, ${rgb(0x1c2050)}, smoothstep(0.0, 0.4, t)), ${rgb(0x0c0e26)}, smoothstep(0.3, 1.0, t));
      sky = mix(sky, night, uNight);

      // pencil strokes in the paper sky, fading as color arrives
      float sketchy = (1.0 - skyLife) * smoothstep(0.1, 0.6, el) * (1.0 - smoothstep(0.68, 0.92, el));
      if (sketchy > 0.01) {
        float s1 = skyStrokes(az, elA, 38.0, 0.07, 0.04);
        sky = mix(sky, graphite(), s1 * sketchy * 0.09 * (0.6 + 0.4 * unNoise2(vec2(az * 9.0, elA * 14.0))));
      }

      // sun (drops toward the horizon at dusk)
      float sunAngle = acos(clamp(dot(rd, uSunShown), -1.0, 1.0));
      float sunRadius = 0.052;
      float sunAA = pixelAngle;
      float halo = exp(-sunAngle * 4.2) * 0.38 + exp(-sunAngle * 14.0) * 0.32;
      sky += mix(${rgb(0xffe9a8)}, ${rgb(0xff9a62)}, uDusk) * halo * (0.25 + 0.75 * skyLife) * (1.0 - uNight);
      float sunDisc = 1.0 - smoothstep(sunRadius - sunAA, sunRadius + sunAA, sunAngle);
      vec3 sunColor = mix(${rgb(0xfff6c8)}, ${rgb(0xffc066)}, uDusk);
      sky = mix(sky, mix(uPaper, sunColor, skyLife), sunDisc * (1.0 - uNight));
      float sunRing = (1.0 - smoothstep(0.0, sunAA * 1.8, abs(sunAngle - sunRadius))) * (1.0 - skyLife * 0.85);
      sky = mix(sky, graphite(), sunRing * 0.7);

      // stars at dusk
      float starAmount = max(smoothstep(0.3, 0.65, uDusk), uNight) * smoothstep(0.05, 0.6, el);
      if (starAmount > 0.01) {
        vec3 sp = rd * 46.0;
        vec3 cell = floor(sp);
        float h = unHash13(cell);
        if (h > 0.94) {
          vec3 jitter = unHash33(cell + 4.0) * 0.6 + 0.2;
          float dist = length(fract(sp) - jitter) * 1.0;
          float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
          float star = (1.0 - smoothstep(0.05, 0.16 + (h - 0.94) * 3.0, dist)) * twinkle;
          sky = mix(sky, vec3(1.0, 0.97, 0.88), star * starAmount);
        }
      }

      // toon clouds
      if (el > -0.3) {
        vec3 shadeColor = mix(${rgb(0xe0e6f8)}, ${rgb(0xd9a6c4)}, uDusk);
        vec3 deepColor = mix(${rgb(0xc3cdf0)}, ${rgb(0xa77fb4)}, uDusk);
        vec3 litColor = mix(vec3(1.0), ${rgb(0xffc6ac)}, uDusk);
        for (int layer = 0; layer < 2; layer++) {
          vec4 cloud = layer == 0
            ? cloudLayer(az, elA, 6.0, 0.30, 3.0, 0.55, 0.006, aa)
            : cloudLayer(az, elA, 11.0, 0.17, 17.0, 0.45, -0.004, aa);
          if (cloud.x > 0.0) {
            float haze = layer == 1 ? 0.35 : 0.0;
            vec3 coloredCloud = mix(litColor, shadeColor, cloud.y);
            coloredCloud = mix(coloredCloud, deepColor, cloud.z);
            coloredCloud = mix(coloredCloud, sky, haze + (1.0 - smoothstep(-0.05, 0.3, el)) * 0.35);
            coloredCloud = mix(coloredCloud, ${rgb(0x8a92c8)}, cloud.w * 0.22);
            vec3 paperCloud = uPaper * 1.04;
            float strokes = skyStrokes(az, elA, 52.0, 0.12, 0.05);
            paperCloud = mix(paperCloud, graphite(), (cloud.y * 0.35 + cloud.z * 0.2) * (0.3 + 0.7 * strokes));
            paperCloud = mix(paperCloud, graphite(), cloud.w * 0.55);
            vec3 cloudColor = mix(paperCloud, coloredCloud, skyLife);
            cloudColor = mix(cloudColor, cloudColor * vec3(0.32, 0.35, 0.6), uNight);
            sky = mix(sky, cloudColor, min(1.0, cloud.x + cloud.w * 0.6) * (layer == 1 ? 0.9 : 1.0));
          }
        }
      }
      result = sky;
    }

    // ============ title backdrop ============
    if (uTitle > 0.001) {
      vec2 ndc = vClip.xy / vClip.w;
      float tanY = vProjection.x, aspect = vProjection.y;
      vec2 q = vec2(ndc.x * aspect, ndc.y);
      float r = length(q);
      vec3 centerPaper = ${rgb(0xf8f2e3)}, edgePaper = ${rgb(0xe0d6c0)}, coolTop = ${rgb(0xe2e6ee)};
      vec3 col = mix(centerPaper, edgePaper, smoothstep(0.25, 1.7, r));
      col = mix(col, coolTop, smoothstep(-0.1, 1.1, ndc.y) * 0.4);
      col += ${rgb(0xffe3a0)} * exp(-r * r * 1.1) * 0.05;
      // a soft ring of light behind the planet
      float halo = exp(-pow((r - 0.62) * 2.6, 2.0));
      col = mix(col, ${rgb(0xfff7e0)}, halo * 0.35);
      // the planet floats above the page: a soft cool shadow slips out below and to the right
      vec3 toCenter = -cameraPosition;
      vec3 shadowCenter = (right * 0.7 - up * 1.5) + vec3(0.0);
      float shadowDistance = length(cross(rd, toCenter + shadowCenter)) ;
      float shadowRadius = 14.0;
      col *= 1.0 - 0.13 * (1.0 - smoothstep(shadowRadius * 0.85, shadowRadius * 1.3, shadowDistance));
      // sparse pencil sparkles
      vec2 grid = vec2(9.0 * aspect, 9.0);
      vec2 gp = ndc * grid * 0.5 + 0.5 * grid;
      vec2 gc = floor(gp);
      float gh = unHash12(gc + 3.0);
      if (gh > 0.78) {
        vec2 jitter = unHash22(gc) * 0.6 + 0.2;
        vec2 local = (fract(gp) - jitter);
        float size = mix(0.1, 0.32, unHash12(gc + 8.0)) * (0.8 + 0.2 * sin(uTime * 0.7 + gh * 30.0));
        float cross4 = max(
          (1.0 - smoothstep(0.0, 0.035, abs(local.x))) * (1.0 - smoothstep(0.0, size, abs(local.y))),
          (1.0 - smoothstep(0.0, 0.035, abs(local.y))) * (1.0 - smoothstep(0.0, size, abs(local.x))));
        float dotCore = 1.0 - smoothstep(0.02, 0.07, length(local));
        vec3 sparkleColor = gh > 0.93 ? ${rgb(0xe0a23a)} : graphite();
        col = mix(col, sparkleColor, clamp(cross4 + dotCore, 0.0, 1.0) * (gh > 0.93 ? 0.8 : 0.4));
      }
      if (uNight > 0.001) {
        // night sky behind the planet: deep indigo, a faint glow around the world, white stars
        vec3 night = mix(${rgb(0x262b55)}, ${rgb(0x0c0e22)}, smoothstep(0.2, 1.6, r));
        night += ${rgb(0x5a5fb0)} * exp(-pow((r - 0.55) * 2.4, 2.0)) * 0.35;
        vec2 sp = ndc * vec2(aspect, 1.0) * 60.0;
        vec2 sc = floor(sp);
        float sh = unHash12(sc + 11.0);
        float star = sh > 0.985 ? (1.0 - smoothstep(0.0, 0.18, length(fract(sp) - 0.5))) * (0.6 + 0.4 * sin(uTime * 1.7 + sh * 90.0)) : 0.0;
        night += vec3(0.95, 0.93, 1.0) * star * 0.8;
        col = mix(col, night, uNight);
      }
      result = mix(result, col, uTitle);
    }
    gl_FragColor = vec4(result, 1.0);
  }
`;

/** Procedural gradient dome. Paper-pale until the planet revives (uGlobalLife),
 * then a storybook sky with layered toon clouds, a sun disc and tiny distant
 * worlds; `setDusk` warms it and brings out the first stars. On the title
 * screen (no player normal) it paints a soft paper backdrop with a faint orbit. */
export function createPlanetSky() {
  const material = new ShaderMaterial({
    name: 'UnspoolSky',
    userData: { noOutline: true },
    uniforms: {
      uGlobalLife: revivalUniforms.uGlobalLife,
      uTime: { value: 0 },
      uDusk: toonShared.uDusk,
      uNight: toonShared.uNight,
      uTitle: { value: 1 },
      uUp: { value: new Vector3(0, 1, 0) },
      uEast: { value: new Vector3(1, 0, 0) },
      uNorth: { value: new Vector3(0, 0, 1) },
      uSunDir: { value: new Vector3(-0.4, 0.8, 0.45).normalize() },
      uSunShown: { value: new Vector3(-0.4, 0.8, 0.45).normalize() },
      uPaper: toonShared.uPaper,
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
  });
  // Large enough that the portrait title camera (≈69 from the center) stays inside.
  const mesh = new Mesh(new SphereGeometry(90, 32, 24), material);
  mesh.name = 'UnspoolSky';
  // Drawn last among the opaque meshes with the depth test on: pixels already covered by the planet
  // and its props never run the (comparatively heavy) sky shader.
  mesh.renderOrder = 1000;
  mesh.userData.noOutline = true;
  mesh.userData.ignoreDepthPrepass = true;
  mesh.frustumCulled = false;

  // A faint dashed orbit line around the home planet, visible on the title screen only.
  const orbitMaterial = new ShaderMaterial({
    name: 'UnspoolTitleOrbit',
    side: DoubleSide,
    userData: { noOutline: true },
    uniforms: { uTime: { value: 0 }, uAmount: { value: 1 }, uColor: { value: new Color(PALETTE.ink) } },
    vertexShader: /* glsl */ `
      varying vec2 vPlane;
      void main() { vPlane = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uAmount;
      uniform vec3 uColor;
      varying vec2 vPlane;
      void main() {
        float angle = atan(vPlane.y, vPlane.x);
        float ring = step(0.5, fract(angle * 22.0 / 3.14159 + uTime * 0.02));
        gl_FragColor = vec4(uColor, 0.34 * uAmount * ring);
      }
    `,
  });
  overlayBlending(orbitMaterial);
  const orbit = new Mesh(new RingGeometry(21.45, 21.62, 192, 1), orbitMaterial);
  orbit.name = 'UnspoolTitleOrbit';
  orbit.rotation.set(Math.PI / 2 - 0.34, 0.2, 0.12);
  orbit.renderOrder = 5;
  orbit.userData.noOutline = true;
  orbit.userData.ignoreDepthPrepass = true;
  orbit.frustumCulled = false;
  mesh.add(orbit);

  const orientation = new PlanetSkyOrientation();
  const east = new Vector3(), up = new Vector3(), north = new Vector3(), sun = new Vector3();
  const sunFlat = new Vector3(), sunHorizon = new Vector3();
  let title = 1, lastTime = 0;

  // Tiny distant worlds: a separate instanced-quad draw (keeps this shader small and cheap).
  const bodies = createSkyBodies();
  mesh.add(bodies.mesh);
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    if (title > 0.001) bodies.updateTitle(camera, title);
  };

  const api = {
    mesh,
    reset(normal: Vector3, forward: Vector3) { orientation.reset(normal, forward); },
    setDusk(amount: number) { toonShared.uDusk.value = Math.min(1, Math.max(0, amount)); },
    update(time: number, normal?: Vector3, forward?: Vector3) {
      const dt = Math.min(0.1, Math.max(0, time - lastTime)); lastTime = time;
      const uniforms = material.uniforms;
      uniforms.uTime.value = time;
      title += ((normal ? 0 : 1) - title) * (1 - Math.exp(-dt * 3));
      if (Math.abs(title - (normal ? 0 : 1)) < 0.002) title = normal ? 0 : 1;
      uniforms.uTitle.value = title;
      orbit.visible = title > 0.01;
      orbitMaterial.uniforms.uAmount.value = title;
      orbitMaterial.uniforms.uTime.value = time;
      if (normal) {
        orientation.update(normal, forward);
        orientation.basis(east, up, north);
        uniforms.uUp.value.copy(normal).normalize();
        uniforms.uEast.value.copy(east);
        uniforms.uNorth.value.copy(north);
        sun.copy(toonShared.uLightPosition.value).addScaledVector(normal, -15).normalize();
        uniforms.uSunDir.value.copy(sun);
        // the drawn sun sinks toward the horizon at dusk (the light itself stays put)
        sunFlat.copy(sun).addScaledVector(uniforms.uUp.value, -sun.dot(uniforms.uUp.value));
        if (sunFlat.lengthSq() < 1e-8) sunFlat.copy(east);
        sunHorizon.copy(sunFlat.normalize()).multiplyScalar(Math.cos(0.06)).addScaledVector(uniforms.uUp.value, Math.sin(0.06));
        uniforms.uSunShown.value.copy(sun).lerp(sunHorizon, Math.min(1, toonShared.uDusk.value * 1.2)).normalize();
        bodies.setSun(sun);
        bodies.updateGame(east, north, uniforms.uUp.value, 1 - title);
      }
    },
  };
  // Dev-only handle for screenshots (look workstream): __unspoolLook.sky.setDusk(.6) etc.
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    const look = ((window as unknown as { __unspoolLook?: Record<string, unknown> }).__unspoolLook ??= {});
    look.sky = api;
  }
  return api;
}
