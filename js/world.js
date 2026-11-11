'use strict';
// ======================================================================
//  world.js —— 静态碰撞世界：AABB 集合 + 均匀网格加速
//  · traceHull: 玩家碰撞盒扫掠（经典 FPS 引擎风格 trace）
//  · raycast:   子弹/视线射线（网格 DDA）
// ======================================================================
const MATS = {
  sand:     { pen: 1.0,  dmg: 0.62, fx: 'sand',  step: 'sand',  snd: 'imp_sand' },
  stone:    { pen: 0.5,  dmg: 0.45, fx: 'stone', step: 'stone', snd: 'imp_stone' },
  plaster:  { pen: 0.75, dmg: 0.5,  fx: 'stone', step: 'stone', snd: 'imp_stone' },
  concrete: { pen: 0.45, dmg: 0.45, fx: 'stone', step: 'stone', snd: 'imp_stone' },
  tile:     { pen: 0.4,  dmg: 0.45, fx: 'stone', step: 'stone', snd: 'imp_stone' },
  wood:     { pen: 1.8,  dmg: 0.82, fx: 'wood',  step: 'wood',  snd: 'imp_wood' },
  metal:    { pen: 0.55, dmg: 0.6,  fx: 'metal', step: 'metal', snd: 'imp_metal' },
};

// slab 求交的副输出
let S_axis = -1, S_sign = 0, S_exit = 0;
function slab(x0, y0, z0, x1, y1, z1, ox, oy, oz, dx, dy, dz) {
  let tE = -Infinity, tX = Infinity, ax = -1, sg = 0, a, b, s;
  if (dx === 0) { if (ox <= x0 || ox >= x1) return Infinity; }
  else { a = (x0 - ox) / dx; b = (x1 - ox) / dx; s = -1; if (a > b) { const t = a; a = b; b = t; s = 1; } if (a > tE) { tE = a; ax = 0; sg = s; } if (b < tX) tX = b; }
  if (dy === 0) { if (oy <= y0 || oy >= y1) return Infinity; }
  else { a = (y0 - oy) / dy; b = (y1 - oy) / dy; s = -1; if (a > b) { const t = a; a = b; b = t; s = 1; } if (a > tE) { tE = a; ax = 1; sg = s; } if (b < tX) tX = b; }
  if (dz === 0) { if (oz <= z0 || oz >= z1) return Infinity; }
  else { a = (z0 - oz) / dz; b = (z1 - oz) / dz; s = -1; if (a > b) { const t = a; a = b; b = t; s = 1; } if (a > tE) { tE = a; ax = 2; sg = s; } if (b < tX) tX = b; }
  if (tE >= tX || tX <= 0) return Infinity;
  S_axis = ax; S_sign = sg; S_exit = tX;
  return tE;
}

class World {
  constructor(minXZ = -52, maxXZ = 52, cell = 4) {
    this.boxes = [];
    this.cell = cell; this.min = minXZ; this.n = Math.ceil((maxXZ - minXZ) / cell);
    this.grid = null; this.stamp = 1; this.marks = null;
    this.tr = { frac: 1, nx: 0, ny: 0, nz: 0, startSolid: false, box: null };
    this.rh = { t: 0, nx: 0, ny: 0, nz: 0, box: null };
    this.tmp = [];
  }
  add(minX, minY, minZ, maxX, maxY, maxZ, mat = 'stone', extra) {
    const b = { minX: Math.min(minX, maxX), minY: Math.min(minY, maxY), minZ: Math.min(minZ, maxZ),
      maxX: Math.max(minX, maxX), maxY: Math.max(minY, maxY), maxZ: Math.max(minZ, maxZ),
      mat, id: this.boxes.length, ramp: false, noDecal: false };
    if (extra) Object.assign(b, extra);
    this.boxes.push(b);
    return b;
  }
  build() {
    const n = this.n;
    this.grid = new Array(n * n);
    for (let i = 0; i < n * n; i++) this.grid[i] = [];
    for (const b of this.boxes) {
      const x0 = this.ci(b.minX), x1 = this.ci(b.maxX), z0 = this.ci(b.minZ), z1 = this.ci(b.maxZ);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.grid[z * n + x].push(b);
    }
    this.marks = new Uint32Array(this.boxes.length + 1);
  }
  ci(v) { return clamp(Math.floor((v - this.min) / this.cell), 0, this.n - 1); }

  query(minX, minY, minZ, maxX, maxY, maxZ) {
    const out = this.tmp; out.length = 0;
    const st = ++this.stamp, mk = this.marks, n = this.n;
    const x0 = this.ci(minX), x1 = this.ci(maxX), z0 = this.ci(minZ), z1 = this.ci(maxZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const list = this.grid[z * n + x];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (mk[b.id] === st) continue; mk[b.id] = st;
        if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY || b.maxZ < minZ || b.minZ > maxZ) continue;
        out.push(b);
      }
    }
    return out;
  }

  // 碰撞盒(脚底中心 x,y,z；半宽 hw；高 h)是否与世界重叠
  overlapHull(x, y, z, hw, h, eps = 0.0005) {
    const list = this.query(x - hw, y, z - hw, x + hw, y + h, z + hw);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (x - hw < b.maxX - eps && x + hw > b.minX + eps && y < b.maxY - eps && y + h > b.minY + eps && z - hw < b.maxZ - eps && z + hw > b.minZ + eps) return b;
    }
    return null;
  }

  traceHull(sx, sy, sz, ex, ey, ez, hw, h) {
    const r = this.tr;
    r.frac = 1; r.nx = r.ny = r.nz = 0; r.startSolid = false; r.box = null;
    const dx = ex - sx, dy = ey - sy, dz = ez - sz;
    const list = this.query(Math.min(sx, ex) - hw, Math.min(sy, ey), Math.min(sz, ez) - hw, Math.max(sx, ex) + hw, Math.max(sy, ey) + h, Math.max(sz, ez) + hw);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const t = slab(b.minX - hw, b.minY - h, b.minZ - hw, b.maxX + hw, b.maxY, b.maxZ + hw, sx, sy, sz, dx, dy, dz);
      if (t === Infinity) continue;
      let tt = t;
      if (t < 0) {
        if (S_axis < 0) { r.startSolid = true; continue; }
        const dAx = S_axis === 0 ? dx : S_axis === 1 ? dy : dz;
        const depth = -t * Math.abs(dAx);
        if (depth < 0.002) tt = 0; else { r.startSolid = true; continue; }
      }
      if (tt < r.frac) {
        r.frac = tt; r.box = b;
        r.nx = S_axis === 0 ? S_sign : 0; r.ny = S_axis === 1 ? S_sign : 0; r.nz = S_axis === 2 ? S_sign : 0;
      }
    }
    return r;
  }

  // 把卡进几何体的碰撞盒推出来
  unstick(p, hw, h) {
    for (let it = 0; it < 4; it++) {
      const b = this.overlapHull(p.x, p.y, p.z, hw, h, 0.0002);
      if (!b) return true;
      const c = [
        [b.maxY - p.y, 0, 1, 0],
        [(p.x + hw) - b.minX, -1, 0, 0], [b.maxX - (p.x - hw), 1, 0, 0],
        [(p.z + hw) - b.minZ, 0, 0, -1], [b.maxZ - (p.z - hw), 0, 0, 1],
        [(p.y + h) - b.minY, 0, -1, 0],
      ];
      c[0][0] *= 0.7; // 优先向上（站到台阶/箱子上）
      let best = c[0];
      for (const k of c) if (k[0] < best[0]) best = k;
      const d = (best === c[0] ? best[0] / 0.7 : best[0]) + 0.001;
      p.x += best[1] * d; p.y += best[2] * d; p.z += best[3] * d;
    }
    return false;
  }

  // 射线：返回最近命中 {t,nx,ny,nz,box}；skipRamp 用于烘焙/贴花
  raycast(ox, oy, oz, dx, dy, dz, maxDist, out, skipRamp) {
    const r = out || this.rh;
    r.box = null;
    const cell = this.cell, n = this.n, min = this.min;
    const st = ++this.stamp, mk = this.marks;
    let cx = this.ci(ox), cz = this.ci(oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    let tMaxX = dx !== 0 ? ((cx + (dx > 0 ? 1 : 0)) * cell + min - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? ((cz + (dz > 0 ? 1 : 0)) * cell + min - oz) / dz : Infinity;
    const tDX = dx !== 0 ? cell / Math.abs(dx) : Infinity, tDZ = dz !== 0 ? cell / Math.abs(dz) : Infinity;
    let best = maxDist, ba = 0, bs = 0, bb = null;
    for (let it = 0; it < 256; it++) {
      const list = this.grid[cz * n + cx];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (mk[b.id] === st) continue; mk[b.id] = st;
        if (skipRamp && b.ramp) continue;
        const t = slab(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, ox, oy, oz, dx, dy, dz);
        if (t >= 0 && t < best) { best = t; ba = S_axis; bs = S_sign; bb = b; }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (best <= tNext || tNext >= maxDist) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; if (cx < 0 || cx >= n) break; }
      else { cz += stepZ; tMaxZ += tDZ; if (cz < 0 || cz >= n) break; }
    }
    if (!bb) return null;
    r.t = best; r.box = bb;
    r.nx = ba === 0 ? bs : 0; r.ny = ba === 1 ? bs : 0; r.nz = ba === 2 ? bs : 0;
    return r;
  }

  // 两点之间是否通视
  clear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.01, this._clr || (this._clr = {}));
  }

  // 射线穿出盒子的距离
  exitT(b, ox, oy, oz, dx, dy, dz) {
    const t = slab(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, ox, oy, oz, dx, dy, dz);
    if (t === Infinity) return 0;
    return S_exit;
  }

  pointSolid(x, y, z, skipRamp, eps = 0.0005) {
    const list = this.grid[this.ci(z) * this.n + this.ci(x)];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (skipRamp && b.ramp) continue;
      if (x > b.minX + eps && x < b.maxX - eps && y > b.minY + eps && y < b.maxY - eps && z > b.minZ + eps && z < b.maxZ - eps) return b;
    }
    return null;
  }

  // (x,z) 处、高度不超过 maxY 的最高表面
  surfaceTop(x, z, maxY) {
    const list = this.grid[this.ci(z) * this.n + this.ci(x)];
    let best = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.maxY <= maxY + 1e-4 && b.maxY > best) best = b.maxY;
    }
    return best;
  }
}
