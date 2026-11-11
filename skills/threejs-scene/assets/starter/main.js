// Renderer, camera, post-processing, quality tiers, camera flights and the frame loop.
//   ?light=morning|golden|night   ?view=front|corner|aerial   ?quality=high|balanced|fast
//   ?record=1   hides the UI and plays a scripted tour on the page clock (see frame-capture)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createEnvironment, U } from './env.js';
import { buildScene } from './scene.js';

const params = new URLSearchParams(location.search);
const RECORD = params.has('record');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

// named vantages: camera position + look-at target. Every still and every flight uses these.
export const VANTAGE = {
  front:  { pos: [0, 3.4, 26], tgt: [0, 3.6, 0] },
  corner: { pos: [15, 6.5, 15], tgt: [0, 3.2, 0] },
  low:    { pos: [-7.5, 1.4, 9], tgt: [0, 5.2, 0] },
  aerial: { pos: [26, 30, 34], tgt: [0, 2, 0] },
};

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: RECORD, stencil: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
// a longer lens (fov 38) keeps verticals calm; wide angles make architecture look like a toy
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.3, 6000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.07;
controls.maxPolarAngle = 1.52; controls.minDistance = 3; controls.maxDistance = 140;
camera.fov = fitFov(camera.aspect); camera.updateProjectionMatrix();
const startView = VANTAGE[params.get('view')] || VANTAGE.corner;
camera.position.set(...startView.pos); controls.target.set(...startView.tgt); controls.update();

const env = createEnvironment(renderer, scene, { preset: params.get('light') || 'golden', scale: 120 });
const world = buildScene();
scene.add(world.group);
scene.traverse((o) => { if (o.isPoints || o.renderOrder < 0) o.userData.noAO = true; });

// ---- post: MSAA half-float target -> ambient occlusion -> bloom -> tone map + sRGB
// GTAO darkens everything it sees; sky layers and particles must not get contact shadows
class SelectiveGTAO extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    this.scene.traverse((o) => { if (o.userData.noAO) o.visible = false; });
  }
}
const size = renderer.getDrawingBufferSize(new THREE.Vector2());
const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const gtao = new SelectiveGTAO(scene, camera, size.x, size.y);
gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 16 });
gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 0.8;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.15, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// keep the horizontal field of view on tall screens, so a phone sees the same width of the
// scene as a laptop instead of a crop of its middle
function fitFov(aspect, base = 38, baseAspect = 16 / 9) {
  if (aspect >= baseAspect) return base;
  const h = Math.tan(THREE.MathUtils.degToRad(base) / 2) * baseAspect;
  return Math.min(THREE.MathUtils.radToDeg(2 * Math.atan(h / aspect)), 75);
}
function resize() {
  camera.aspect = innerWidth / innerHeight; camera.fov = fitFov(camera.aspect); camera.updateProjectionMatrix();
  renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

// ---- quality tiers; drops one tier by itself if frames run long (never during a recording)
const TIERS = ['high', 'balanced', 'fast'];
let quality = TIERS.includes(params.get('quality')) ? params.get('quality') : 'high';
function setQuality(q) {
  quality = q;
  pixelRatio = q === 'high' ? Math.min(devicePixelRatio, 2) : q === 'balanced' ? Math.min(devicePixelRatio, 1.5) : 1;
  gtao.enabled = q === 'high';
  const ms = q === 'fast' ? 2048 : 4096;
  if (env.sun.shadow.mapSize.x !== ms) { env.sun.shadow.mapSize.set(ms, ms); env.sun.shadow.map?.dispose(); env.sun.shadow.map = null; }
  resize();
}
setQuality(quality);
const perf = { sum: 0, n: 0, since: 0 };
function watchFrameTime(dt, now) {
  if (RECORD || params.has('quality') || dt > 0.25) return;   // ignore tab switches
  perf.sum += dt; perf.n++;
  if (now - perf.since > 3 && perf.n > 60) {
    if (perf.sum / perf.n > 1 / 40 && quality !== 'fast') setQuality(TIERS[TIERS.indexOf(quality) + 1]);
    perf.sum = 0; perf.n = 0; perf.since = now;
  }
}

// ---- time on the page clock (setTimeout keeps real time and breaks frame-exact recording)
const pending = [];
const later = (secs, fn) => pending.push({ at: performance.now() / 1000 + secs, fn });
function runPending(now) { for (let i = pending.length - 1; i >= 0; i--) if (now >= pending[i].at) pending.splice(i, 1)[0].fn(); }

// ---- camera flights: rise over the midpoint, ease in and out, look at a moving target
let flight = null;
function flyTo(name, secs = 2.8) {
  const v = VANTAGE[name];
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...v.pos), t1 = new THREE.Vector3(...v.tgt);
  const mid = p0.clone().lerp(p1, 0.5);
  mid.y = Math.max(mid.y, Math.max(p0.y, p1.y) + Math.min(p0.distanceTo(p1) * 0.22, 40) * 0.6);
  flight = { p0, t0, p1, t1, mid, start: performance.now() / 1000, secs: REDUCED ? 0.001 : secs };
  controls.enabled = false;
}
function stepFlight(now) {
  if (!flight) return;
  const k = Math.min((now - flight.start) / flight.secs, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const a = flight.p0.clone().lerp(flight.mid, e), b = flight.mid.clone().lerp(flight.p1, e);
  camera.position.copy(a.lerp(b, e));
  controls.target.copy(flight.t0).lerp(flight.t1, e);
  camera.lookAt(controls.target);
  if (k >= 1) { flight = null; controls.enabled = !RECORD; controls.update(); }
}

// ---- UI
const buttons = [...document.querySelectorAll('[data-light]')];
const pressLight = (name) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === name)));
buttons.forEach((b) => b.addEventListener('click', () => { env.set(b.dataset.light); pressLight(b.dataset.light); }));
pressLight(env.current);
addEventListener('keydown', (e) => {
  const i = ['1', '2', '3', '4'].indexOf(e.key);
  if (i >= 0) flyTo(Object.keys(VANTAGE)[i]);
});

// ---- recording: a scripted tour driven by the page clock
if (RECORD) {
  controls.enabled = false;
  for (const el of document.querySelectorAll('.bar, .title')) el.style.display = 'none';
  const TOUR = [[0.5, 'front'], [5, 'low'], [10, 'aerial'], [15, () => env.set('night', 3)], [16, 'corner']];
  let next = 0;
  window.__recordFrame = (t) => {
    while (next < TOUR.length && t >= TOUR[next][0]) {
      const step = TOUR[next++][1];
      typeof step === 'function' ? step() : flyTo(step, 3.6);
    }
  };
}
window.__app = { scene, camera, controls, renderer, env, flyTo, later, setQuality, VANTAGE, U };

let frames = 0, last = performance.now() / 1000;
function frame() {
  const now = performance.now() / 1000;
  const dt = now - last; last = now;
  U.uTime.value = now;
  runPending(now);
  stepFlight(now);
  if (!flight && controls.enabled) controls.update();
  env.update(camera, controls.target);
  world.update(now);
  const night = U.uNight.value;
  bloom.strength = 0.12 + 0.5 * night;
  bloom.threshold = 0.9 - 0.15 * night;
  composer.render();
  watchFrameTime(dt, now);
  if (++frames === 3) { document.getElementById('loader').classList.add('done'); window.__ready = true; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
