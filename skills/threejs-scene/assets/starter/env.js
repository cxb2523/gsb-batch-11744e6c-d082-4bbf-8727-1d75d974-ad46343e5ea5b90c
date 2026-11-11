// Sky, sun, image-based light, fog, clouds and night. Presets blend smoothly; the shadow
// camera follows what the viewer looks at and snaps to its texel grid so shadows never swim.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// shared uniforms: every custom shader reads time, wind and night from here
export const U = {
  uTime: { value: 0 },
  uWind: { value: 0.5 },
  uNight: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.5) },
};

// skyEl drives the sky gradient, el the light: at golden hour the light sits a little above
// the painted sun so faces still read. sunI/hemiI/envI are tuned together with exposure (exp).
export const PRESETS = {
  morning: { skyEl: 30, el: 32, az: 130, sunI: 3.0, sunC: '#fff1dc', hemiS: '#cfe0ff', hemiG: '#5a6a4a', hemiI: 0.5, envI: 0.75,
    turb: 2.6, ray: 1.1, mie: 0.0035, mieG: 0.8, fogC: '#bccde2', fogD: 0.0035, exp: 0.62, night: 0, cloudLit: '#ffffff', cloudShade: '#b9c3d1', cloudA: 0.7 },
  golden:  { skyEl: 5, el: 9, az: 250, sunI: 3.4, sunC: '#ffb066', hemiS: '#f2c9a3', hemiG: '#4a3c2e', hemiI: 0.42, envI: 0.62,
    turb: 5.0, ray: 2.4, mie: 0.007, mieG: 0.86, fogC: '#dcae88', fogD: 0.0042, exp: 0.72, night: 0, cloudLit: '#ffd2a6', cloudShade: '#9a8a8c', cloudA: 0.68 },
  night:   { skyEl: -14, el: 42, az: 205, sunI: 0.14, sunC: '#a8bcff', hemiS: '#22324f', hemiG: '#07090d', hemiI: 0.28, envI: 0.16,
    turb: 2.0, ray: 0.6, mie: 0.002, mieG: 0.8, fogC: '#0b1322', fogD: 0.005, exp: 1.0, night: 1, cloudLit: '#3a4660', cloudShade: '#141b29', cloudA: 0.42 },
};
const NUM = ['skyEl', 'el', 'az', 'sunI', 'hemiI', 'envI', 'turb', 'ray', 'mie', 'mieG', 'fogD', 'exp', 'night', 'cloudA'];
const COL = ['sunC', 'hemiS', 'hemiG', 'fogC', 'cloudLit', 'cloudShade'];

export function dirFrom(el, az) {
  const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function cloudLayer(height, size) {
  const g = new THREE.PlaneGeometry(size, size);
  g.rotateX(Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: U.uTime, uWind: U.uWind, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uA: { value: 0.7 }, uScale: { value: 9 / size } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uWind, uA, uScale; uniform vec3 uLit, uShade; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), u.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * n(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
      void main(){
        vec2 p = vW.xz * uScale + vec2(uTime * (0.004 + uWind * 0.012), uTime * 0.002);
        vec2 q = vec2(fbm(p), fbm(p + 5.2));
        float d = fbm(p + q * 1.3);
        float c = smoothstep(0.44, 0.72, d);
        float edge = smoothstep(0.44, 0.56, d) - smoothstep(0.56, 0.86, d);
        float fade = 1.0 - smoothstep(0.15, 0.48, length(vW.xz - cameraPosition.xz) * uScale / 9.0);
        vec3 col = mix(uShade, uLit, clamp(0.35 + edge * 0.9 + (1.0 - c) * 0.4, 0.0, 1.0));
        gl_FragColor = vec4(col, c * fade * uA);
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = height; mesh.renderOrder = -1; mesh.frustumCulled = false;
  return mesh;
}

function nightDome(radius) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, transparent: true, fog: false, uniforms: { uNight: U.uNight },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uNight; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        float y = max(vD.y, 0.0);
        vec3 col = mix(vec3(0.075, 0.11, 0.2), vec3(0.008, 0.016, 0.045), pow(y, 0.5));
        col += vec3(0.16, 0.12, 0.08) * pow(1.0 - y, 8.0);                 // glow on the horizon
        vec3 c = floor(vD * 700.0);
        col += vec3(0.8, 0.85, 1.0) * step(0.9975, h(c)) * smoothstep(0.05, 0.3, y) * (0.4 + 0.6 * h(c + 1.0));
        gl_FragColor = vec4(col, uNight);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m);
  mesh.renderOrder = -2; mesh.frustumCulled = false;
  return mesh;
}

/**
 * createEnvironment(renderer, scene, { preset, scale })
 * scale: rough size of the scene in metres (sets sky, cloud and shadow distances).
 */
export function createEnvironment(renderer, scene, { preset = 'morning', scale = 120 } = {}) {
  const far = scale * 40;
  const sky = new Sky(); sky.scale.setScalar(far * 0.95); sky.renderOrder = -3; sky.frustumCulled = false; scene.add(sky);
  const dome = nightDome(far * 0.9); scene.add(dome);
  const clouds = cloudLayer(scale * 6, far * 2.4); scene.add(clouds);

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = scale * 0.0006;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = scale * 12;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5); scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xbccde2, 0.003);

  // image-based light rendered from a private copy of the sky, so reflections match the sky
  const envScene = new THREE.Scene();
  const envSky = new Sky(); envSky.scale.setScalar(far * 0.5); envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(far * 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x4d5a45 }));
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -2; envScene.add(envGround);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  const cur = structuredClone(PRESETS[preset]);
  for (const k of COL) cur[k] = new THREE.Color(PRESETS[preset][k]);
  let from = null, to = null, t0 = 0, dur = 1, envDirty = true, ticks = 0;

  function apply() {
    const sd = dirFrom(cur.skyEl, cur.az);
    for (const s of [sky, envSky]) {
      const u = s.material.uniforms;
      u.turbidity.value = cur.turb; u.rayleigh.value = cur.ray; u.mieCoefficient.value = cur.mie; u.mieDirectionalG.value = cur.mieG;
      u.sunPosition.value.copy(sd);
    }
    U.uSunDir.value.copy(dirFrom(cur.el, cur.az));
    sun.color.copy(cur.sunC); sun.intensity = cur.sunI;
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemiI;
    scene.fog.color.copy(cur.fogC); scene.fog.density = cur.fogD * (120 / scale);
    renderer.toneMappingExposure = cur.exp;
    U.uNight.value = cur.night;
    scene.environmentIntensity = cur.envI;
    const cu = clouds.material.uniforms;
    cu.uLit.value.copy(cur.cloudLit); cu.uShade.value.copy(cur.cloudShade); cu.uA.value = cur.cloudA;
    envGround.material.color.setRGB(0.3, 0.36, 0.27).multiplyScalar(1 - cur.night * 0.9);
    sky.visible = cur.night < 0.995;
  }
  function regenEnv() {
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0, 1, far);
    scene.environment = envRT.texture;
  }
  apply(); regenEnv();

  return {
    sun, hemi, current: preset,
    set(name, seconds = 2.5) {
      this.current = name;
      from = { ...cur }; for (const k of COL) from[k] = cur[k].clone();
      to = PRESETS[name]; t0 = performance.now() / 1000; dur = Math.max(seconds, 0.001);
      if (Math.abs(to.az - from.az) > 180) from.az += to.az > from.az ? 360 : -360;   // short way round
    },
    update(camera, target) {
      if (to) {
        const k = Math.min((performance.now() / 1000 - t0) / dur, 1), e = k * k * (3 - 2 * k);
        for (const n of NUM) cur[n] = THREE.MathUtils.lerp(from[n], to[n], e);
        for (const c of COL) cur[c].copy(from[c]).lerp(new THREE.Color(to[c]), e);
        apply();
        if (++ticks % 6 === 0 || k >= 1) envDirty = true;   // PMREM is costly: refresh every 6th frame
        if (k >= 1) to = null;
      }
      if (envDirty) { regenEnv(); envDirty = false; }
      // shadow frustum sized to the view, centred on the target, snapped to whole texels
      const half = THREE.MathUtils.clamp(camera.position.distanceTo(target) * 0.85, scale * 0.25, scale * 4);
      const sc = sun.shadow.camera;
      if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
      const texel = (2 * half) / sun.shadow.mapSize.x;
      sun.target.position.set(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
      sun.position.copy(sun.target.position).addScaledVector(U.uSunDir.value, scale * 6);
      sun.target.updateMatrixWorld();
      dome.position.copy(camera.position);
    },
  };
}
