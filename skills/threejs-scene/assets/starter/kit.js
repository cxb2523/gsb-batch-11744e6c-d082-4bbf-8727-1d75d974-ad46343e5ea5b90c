// Building blocks for procedural scenes: seeded randomness, canvas textures, an instancing
// kit, profile sweeps and lathes. Units are metres; +Y up.
import * as THREE from 'three';

/** Seeded random numbers in [0, 1). The same seed draws the same scene on every load. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** A texture drawn with the 2D canvas API. No image files, nothing to download. */
export function canvasTex(w, h, draw, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

/** Matrix for a part at (x, y, z), turned `angle` radians about +Y, scaled (sx, sy, sz). */
export function place(x, y, z, angle = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromAxisAngle(UP, angle);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/**
 * Collects instance matrices per named part, then builds one InstancedMesh per part.
 * Ten thousand balusters become one draw call.
 *   const kit = new Kit().def('column', columnGeo, stone);
 *   kit.add('column', place(x, 0, z));
 *   kit.build(group);
 */
export class Kit {
  constructor() { this.parts = new Map(); }
  def(name, geometry, material, opts = {}) {
    if (!this.parts.has(name)) this.parts.set(name, { geometry, material, mats: [], colors: [], opts });
    return this;
  }
  add(name, matrix, color) {
    const p = this.parts.get(name);
    if (!p) throw new Error('undefined part ' + name);
    p.mats.push(matrix);
    if (color) p.colors.push(color);
  }
  build(group) {
    const meshes = {};
    for (const [name, p] of this.parts) {
      if (!p.mats.length) continue;
      const m = new THREE.InstancedMesh(p.geometry, p.material, p.mats.length);
      p.mats.forEach((mm, i) => m.setMatrixAt(i, mm));
      if (p.colors.length === p.mats.length) p.colors.forEach((c, i) => m.setColorAt(i, c));
      m.castShadow = p.opts.cast !== false;
      m.receiveShadow = p.opts.receive !== false;
      if (p.opts.depth) m.customDepthMaterial = p.opts.depth;
      m.name = name;
      m.computeBoundingSphere();
      group.add(m);
      meshes[name] = m;
    }
    return meshes;
  }
}

/** Lathe from [radius, height] pairs: columns, balusters, urns, domes, lamp posts. */
export function lathe(points, segs = 24) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

/** Points along a circle in the XZ plane; angle 0 is +Z, turning toward +X. */
export function arc(cx, cz, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]); }
  return pts;
}

const norm2 = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

/**
 * Sweep a 2D profile along a path in the XZ plane, with mitred corners: cornices, kerbs,
 * steps, rails, mouldings. profile: [[offset, height], ...], offset measured outward from the
 * path. For a closed path "outward" is away from the enclosed area; for an open one it is the
 * right-hand side of travel (side = -1 flips it). UVs are planar at 1 unit per `uvScale` m.
 */
export function sweep(profile, path, { closed = false, y = 0, side = 1, uvScale = 4 } = {}) {
  const n = path.length;
  let s = side;
  if (closed) {
    let a = 0;
    for (let i = 0; i < n; i++) { const [x0, z0] = path[i], [x1, z1] = path[(i + 1) % n]; a += x0 * z1 - x1 * z0; }
    s = a > 0 ? -1 : 1;
  }
  const dirs = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? path[(i - 1 + n) % n] : path[Math.max(i - 1, 0)];
    const next = closed ? path[(i + 1) % n] : path[Math.min(i + 1, n - 1)];
    const cur = path[i];
    const d0 = norm2(cur[0] - prev[0], cur[1] - prev[1]), d1 = norm2(next[0] - cur[0], next[1] - cur[1]);
    const a = (i === 0 && !closed) ? d1 : d0, b = (i === n - 1 && !closed) ? d0 : d1;
    const n0 = [-a[1] * s, a[0] * s], n1 = [-b[1] * s, b[0] * s];
    const m = norm2(n0[0] + n1[0], n0[1] + n1[1]);
    const k = 1 / Math.max(m[0] * n1[0] + m[1] * n1[1], 0.3);   // mitre length, capped at sharp corners
    dirs.push([m[0] * k, m[1] * k]);
  }
  const pos = [], idx = [];
  const rings = closed ? n + 1 : n;
  for (let k = 0; k < profile.length - 1; k++) {
    const base = pos.length / 3;
    for (let r = 0; r < rings; r++) {
      const i = r % n, [px, pz] = path[i], [dx, dz] = dirs[i];
      for (const [o, h] of [profile[k], profile[k + 1]]) pos.push(px + dx * o, y + h, pz + dz * o);
    }
    for (let r = 0; r < rings - 1; r++) {
      const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
      if (s > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) uv.push((pos[i] + pos[i + 2]) / uvScale, pos[i + 1] / uvScale);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
