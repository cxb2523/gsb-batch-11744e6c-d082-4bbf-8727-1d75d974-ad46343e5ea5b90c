// The example scene: a round pavilion (tholos) on a lawn. Replace it with your subject; keep
// the patterns: real dimensions, one instanced kit, sweeps and lathes, canvas textures,
// shader patches that read the shared uniforms, and an update(now) for anything alive.
import * as THREE from 'three';
import { Kit, place, lathe, arc, sweep, canvasTex, rng } from './kit.js';
import { U } from './env.js';

const R = 4.2;           // column ring radius, m
const COL_H = 5.0;       // column height including base and capital
const PODIUM = 0.75;     // three steps of 0.25 m

// ---------------------------------------------------------------- materials
function speckle(g, w, h, n, r0, r1, colors, rand) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rand() * colors.length) | 0];
    g.globalAlpha = 0.04 + rand() * 0.08;
    g.beginPath(); g.arc(rand() * w, rand() * h, r0 + rand() * (r1 - r0), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}
const stoneMap = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 1400, 3, 34, ['#e2dbcc', '#f8f5ee', '#e8e1d3', '#d6cfbf'], rng(7));
}, { repeat: [1, 1] });
const grassMap = canvasTex(512, 512, (g, w, h) => {
  const r = rng(11);
  g.fillStyle = '#5f7a3a'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 5000, 1, 7, ['#6f8a44', '#526b31', '#7b9650', '#4a6129'], r);
  for (let i = 0; i < 9000; i++) {           // blades
    g.strokeStyle = r() > 0.5 ? 'rgba(130,160,80,.25)' : 'rgba(40,60,25,.25)';
    const x = r() * w, y = r() * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 6); g.stroke();
  }
}, { repeat: [60, 60] });
const gravelMap = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#cbbfa8'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 4000, 0.6, 2.6, ['#b5a68d', '#ddd3c0', '#a89980', '#efe7d6'], rng(3));
}, { repeat: [1, 1] });

const stone = new THREE.MeshStandardMaterial({ map: stoneMap, color: '#ffffff', roughness: 0.82 });
const grass = new THREE.MeshStandardMaterial({ map: grassMap, roughness: 0.95 });
const gravel = new THREE.MeshStandardMaterial({ map: gravelMap, roughness: 1 });
const bronze = new THREE.MeshStandardMaterial({ color: '#3b3128', metalness: 0.7, roughness: 0.45 });
const glow = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffcf8a', emissiveIntensity: 0 });

// ---------------------------------------------------------------- geometry
// column: Attic base, shaft with entasis (it swells slightly a third of the way up), capital
function columnGeometry(H, D) {
  const r = D / 2, base = 0.5 * D, cap = 0.55 * D, shaft = H - base - cap;
  const p = [[0.001, 0], [r * 1.42, 0], [r * 1.42, 0.12 * D], [r * 1.25, 0.16 * D], [r * 1.3, 0.24 * D],
    [r * 1.12, 0.34 * D], [r * 1.18, 0.42 * D], [r * 1.02, base]];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, ent = 1 + 0.035 * Math.sin(Math.PI * Math.min(t * 1.5, 1)) - 0.16 * t;
    p.push([r * ent, base + shaft * t]);
  }
  const top = base + shaft, rt = r * 0.84;
  p.push([rt * 1.12, top + 0.04 * D], [rt * 1.0, top + 0.1 * D], [rt * 1.38, top + 0.28 * D], [r * 1.5, top + 0.4 * D],
    [r * 1.5, H], [0.001, H]);
  return lathe(p, 28);
}

// classical entablature: architrave, frieze, cornice; [outward offset, height] in metres
const ENTABLATURE = [[-0.32, 0], [0.32, 0], [0.32, 0.18], [0.36, 0.2], [0.36, 0.3], [0.3, 0.32], [0.3, 0.7],
  [0.38, 0.72], [0.44, 0.8], [0.66, 0.84], [0.7, 0.9], [0.76, 0.92], [0.78, 1.0], [0.82, 1.06], [0.78, 1.12], [-0.32, 1.12], [-0.32, 0]];

const CLEAR = [[15, 15], [0, 26], [-7.5, 9], [26, 34]];   // vantage positions in main.js

function trees(group, rand) {
  // instanced trees: a trunk and a clump of foliage balls each, swaying in the wind
  const trunkGeo = lathe([[0.001, 0], [0.22, 0], [0.16, 1.2], [0.12, 2.6], [0.001, 2.8]], 8);
  const leafGeo = new THREE.IcosahedronGeometry(1, 2);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4f6e2c', roughness: 0.9, flatShading: true });
  const sway = `
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    float ph = dot(wp.xz, vec2(0.13, 0.17));
    transformed.x += sin(uTime * 1.7 + ph) * 0.06 * uWind * (position.y + 1.0);
    transformed.z += cos(uTime * 1.3 + ph * 1.3) * 0.05 * uWind * (position.y + 1.0);`;
  const patch = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.uTime, uWind: U.uWind });
    sh.vertexShader = 'uniform float uTime, uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + sway);
  };
  leafMat.onBeforeCompile = patch;
  // the shadow pass draws with a depth material: patch it the same way or shadows stay still
  const leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  leafDepth.onBeforeCompile = patch;

  const kit = new Kit()
    .def('trunk', trunkGeo, new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.95 }))
    .def('leaves', leafGeo, leafMat, { depth: leafDepth });
  const greens = ['#4f6e2c', '#5d7a33', '#46632a', '#6a8540'].map((c) => new THREE.Color(c));
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, d = 17 + rand() * 30;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (Math.abs(x) < 4 && z > 0) continue;               // keep the approach clear
    if (CLEAR.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 7)) continue;   // and the camera spots
    const s = 0.8 + rand() * 0.6, rot = rand() * 6.28;
    kit.add('trunk', place(x, 0, z, rot, s, s, s));
    for (let k = 0; k < 5; k++) {
      const ox = (rand() - 0.5) * 2.2 * s, oz = (rand() - 0.5) * 2.2 * s, oy = (2.6 + rand() * 1.8) * s, ls = (1.1 + rand() * 0.9) * s;
      kit.add('leaves', place(x + ox, oy, z + oz, rand() * 6.28, ls, ls * 0.85, ls), greens[(rand() * 4) | 0]);
    }
  }
  kit.build(group);
}

export function buildScene() {
  const group = new THREE.Group();
  const rand = rng(2024);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 64), grass);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // gravel path: a ring around the podium and a straight approach, swept as thin flat bands
  const ring = sweep([[-1.4, 0.01], [1.4, 0.01]], arc(0, 0, R + 4.2, 0, Math.PI * 2, 96), { closed: true });
  const lane = sweep([[-1.2, 0.012], [1.2, 0.012]], [[0, R + 5], [0, 60]], { uvScale: 2 });
  for (const g of [ring, lane]) { const m = new THREE.Mesh(g, gravel); m.receiveShadow = true; group.add(m); }

  // podium: three round steps in one lathe
  const steps = lathe([[0.001, 0], [R + 1.6, 0], [R + 1.6, 0.25], [R + 1.25, 0.25], [R + 1.25, 0.5], [R + 0.9, 0.5],
    [R + 0.9, PODIUM], [0.001, PODIUM]], 96);
  const podium = new THREE.Mesh(steps, stone); podium.castShadow = podium.receiveShadow = true; group.add(podium);

  // twelve columns, one draw call
  const kit = new Kit().def('column', columnGeometry(COL_H, 0.56), stone);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    kit.add('column', place(Math.sin(a) * R, PODIUM, Math.cos(a) * R));
  }
  kit.build(group);

  // entablature swept round the ring, then a drum and a shallow dome
  const top = PODIUM + COL_H;
  const ent = new THREE.Mesh(sweep(ENTABLATURE, arc(0, 0, R, 0, Math.PI * 2, 96), { closed: true, y: top }), stone);
  ent.castShadow = ent.receiveShadow = true; group.add(ent);
  const domeP = [[0.001, 0], [R + 0.3, 0], [R + 0.3, 0.55], [R + 0.05, 0.62]];
  for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI / 2; domeP.push([(R + 0.05) * Math.cos(t), 0.62 + R * 0.62 * Math.sin(t)]); }
  domeP.push([0.35, 0.62 + R * 0.62 + 0.05], [0.35, 0.62 + R * 0.62 + 0.45], [0.001, 0.62 + R * 0.62 + 0.5]);
  const dome = new THREE.Mesh(lathe(domeP, 96), stone);
  dome.position.y = top + 1.12; dome.castShadow = dome.receiveShadow = true; group.add(dome);

  // an urn at the centre
  const urn = new THREE.Mesh(lathe([[0.001, 0], [0.42, 0], [0.42, 0.12], [0.2, 0.2], [0.18, 0.4], [0.5, 0.8], [0.62, 1.15],
    [0.5, 1.45], [0.3, 1.55], [0.34, 1.62], [0.001, 1.62]], 40), bronze);
  urn.position.y = PODIUM; urn.castShadow = true; group.add(urn);

  // lamp posts on the approach; at night their globes glow and two real lights spill on the path
  const postGeo = lathe([[0.001, 0], [0.16, 0], [0.16, 0.1], [0.07, 0.25], [0.05, 2.9], [0.09, 3.0], [0.001, 3.0]], 12);
  const lamps = new Kit().def('post', postGeo, bronze).def('globe', new THREE.SphereGeometry(0.2, 20, 12), glow, { cast: false });
  const lights = [];
  for (const z of [12, 22, 32, 42]) for (const x of [-2.2, 2.2]) {
    lamps.add('post', place(x, 0, z));
    lamps.add('globe', place(x, 3.18, z));
    if (z === 12) {
      const l = new THREE.PointLight('#ffc98a', 0, 18, 2);   // decay 2: physically based falloff
      l.position.set(x, 3.1, z); l.userData.candela = 40; group.add(l); lights.push(l);
    }
  }
  lamps.build(group);

  // a lantern hung under the dome: at night the columns read against their own warm light
  // (no shadow: a point-light shadow renders the scene six more times, for little gain here)
  const lantern = new THREE.PointLight('#ffc27a', 0, 16, 2);
  lantern.position.set(0, PODIUM + COL_H - 0.6, 0); lantern.userData.candela = 70;
  group.add(lantern); lights.push(lantern);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), glow);
  bulb.position.copy(lantern.position).add(new THREE.Vector3(0, 0.3, 0)); group.add(bulb);

  trees(group, rand);

  return {
    group,
    center: new THREE.Vector3(0, 3.2, 0),
    update(now) {
      const night = U.uNight.value;
      glow.emissiveIntensity = night * 3.5;          // bloom picks the globes up at night
      for (const l of lights) l.intensity = night * l.userData.candela;
      lights.forEach((l) => { l.visible = night > 0.01; });   // a dark light still costs a shadow pass
    },
  };
}
