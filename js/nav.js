'use strict';
// ======================================================================
//  nav.js —— 2.5D 导航网格（0.5m）+ A* + 拉绳平滑
// ======================================================================
class NavGrid {
  constructor(world, min = -48, size = 96, cs = 0.5) {
    this.world = world; this.cs = cs; this.min = min; this.n = Math.round(size / cs);
    const N = this.n * this.n;
    this.h = new Float32Array(N).fill(NaN);
    this.edges = new Uint8Array(N);
    this.walkList = [];
    this.STEP = 0.5; this.DROP = 1.3; this.R = 0.42;
    this.DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    // A* 工作区
    this.g = new Float32Array(N); this.came = new Int32Array(N); this.seen = new Uint32Array(N); this.closed = new Uint32Array(N);
    this.gen = 1;
    this.heap = new Int32Array(N); this.fk = new Float32Array(N);
  }
  wx(c) { return this.min + (c % this.n + 0.5) * this.cs; }
  wz(c) { return this.min + (Math.floor(c / this.n) + 0.5) * this.cs; }
  cellOf(x, z) {
    const cx = Math.floor((x - this.min) / this.cs), cz = Math.floor((z - this.min) / this.cs);
    if (cx < 0 || cz < 0 || cx >= this.n || cz >= this.n) return -1;
    return cz * this.n + cx;
  }
  // 从台阶高度以上检测净空：≤0.45m 的小台阶/坡道不算障碍（与玩家自动上台阶一致）
  walkable(x, y, z) { return !this.world.overlapHull(x, y + 0.46, z, this.R, PHYS.standH - 0.5); }

  build(seeds) {
    const n = this.n, w = this.world, h = this.h;
    const q = new Int32Array(n * n); let qh = 0, qt = 0;
    for (const s of seeds) {
      const c = this.cellOf(s.x, s.z); if (c < 0 || !isNaN(h[c])) continue;
      const y = w.surfaceTop(this.wx(c), this.wz(c), s.y + this.STEP);
      if (isFinite(y) && this.walkable(this.wx(c), y, this.wz(c))) { h[c] = y; q[qt++] = c; }
    }
    while (qh < qt) {
      const c = q[qh++], y = h[c], cx = c % n, cz = (c / n) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + this.DIRS[k][0], nz = cz + this.DIRS[k][1];
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const nc = nz * n + nx;
        if (!isNaN(h[nc])) continue;
        const x = this.wx(nc), z = this.wz(nc);
        const ny = w.surfaceTop(x, z, y + this.STEP);
        if (!isFinite(ny)) continue;
        const dy = ny - y;
        if (dy > this.STEP || dy < -this.DROP) continue;
        if (!this.walkable(x, ny, z)) continue;
        if (dy < -this.STEP && w.overlapHull(x, y + 0.05, z, this.R, PHYS.standH - 0.1)) continue;
        h[nc] = ny; q[qt++] = nc;
      }
    }
    // 边
    for (let c = 0; c < n * n; c++) {
      if (isNaN(h[c])) continue;
      this.walkList.push(c);
      const cx = c % n, cz = (c / n) | 0, y = h[c];
      let mask = 0;
      for (let k = 0; k < 8; k++) {
        const dx = this.DIRS[k][0], dz = this.DIRS[k][1];
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const nc = nz * n + nx;
        if (isNaN(h[nc])) continue;
        const dy = h[nc] - y;
        if (dy > this.STEP || dy < -this.DROP) continue;
        if (k >= 4) {
          const a = cz * n + nx, b = nz * n + cx;
          if (isNaN(h[a]) || isNaN(h[b]) || Math.abs(h[a] - y) > this.STEP || Math.abs(h[b] - y) > this.STEP) continue;
          if (dy < -this.STEP) continue;
        }
        mask |= 1 << k;
      }
      this.edges[c] = mask;
    }
  }

  nearest(x, y, z) {
    const c0 = this.cellOf(x, z);
    if (c0 >= 0 && !isNaN(this.h[c0]) && Math.abs(this.h[c0] - y) < 1.2) return c0;
    const n = this.n, cx = Math.floor((x - this.min) / this.cs), cz = Math.floor((z - this.min) / this.cs);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 8; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const ax = cx + dx, az = cz + dz;
        if (ax < 0 || az < 0 || ax >= n || az >= n) continue;
        const c = az * n + ax; if (isNaN(this.h[c])) continue;
        const dyy = Math.abs(this.h[c] - y); if (dyy > 1.4) continue;
        const d = dx * dx + dz * dz + dyy * dyy * 4;
        if (d < bd) { bd = d; best = c; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  heightAt(x, z) { const c = this.cellOf(x, z); return c < 0 ? NaN : this.h[c]; }

  findPath(from, to, maxExpand = 30000) {
    const s = this.nearest(from.x, from.y, from.z), t = this.nearest(to.x, to.y, to.z);
    if (s < 0 || t < 0) return null;
    if (s === t) return [new THREE.Vector3(to.x, this.h[t], to.z)];
    const n = this.n, h = this.h, gen = ++this.gen;
    const g = this.g, came = this.came, seen = this.seen, closed = this.closed, heap = this.heap, fk = this.fk;
    const tx = t % n, tz = (t / n) | 0;
    const H = (c) => { const dx = Math.abs(c % n - tx), dz = Math.abs(((c / n) | 0) - tz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    let hs = 0;
    const push = (c, f) => { let i = hs++; heap[i] = c; fk[i] = f; while (i > 0) { const p = (i - 1) >> 1; if (fk[p] <= fk[i]) break; const tc = heap[p], tf = fk[p]; heap[p] = heap[i]; fk[p] = fk[i]; heap[i] = tc; fk[i] = tf; i = p; } };
    const pop = () => {
      const top = heap[0]; hs--;
      if (hs > 0) {
        heap[0] = heap[hs]; fk[0] = fk[hs]; let i = 0;
        for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hs && fk[l] < fk[m]) m = l; if (r < hs && fk[r] < fk[m]) m = r; if (m === i) break; const tc = heap[m], tf = fk[m]; heap[m] = heap[i]; fk[m] = fk[i]; heap[i] = tc; fk[i] = tf; i = m; }
      }
      return top;
    };
    g[s] = 0; seen[s] = gen; came[s] = -1; push(s, H(s));
    let found = false, it = 0;
    while (hs > 0 && it++ < maxExpand) {
      const c = pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === t) { found = true; break; }
      const m = this.edges[c], cx = c % n, cz = (c / n) | 0;
      for (let k = 0; k < 8; k++) {
        if (!(m & (1 << k))) continue;
        const nc = (cz + this.DIRS[k][1]) * n + cx + this.DIRS[k][0];
        if (closed[nc] === gen) continue;
        const ng = g[c] + (k < 4 ? 1 : 1.4142) + Math.abs(h[nc] - h[c]) * 0.6;
        if (seen[nc] !== gen || ng < g[nc]) { seen[nc] = gen; g[nc] = ng; came[nc] = c; push(nc, ng + H(nc)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c !== -1; c = came[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => new THREE.Vector3(this.wx(c), h[c], this.wz(c)));
    pts[pts.length - 1].set(to.x, h[t], to.z);
    return this.smooth(pts);
  }

  lineOK(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(L / 0.2));
    let prev = this.heightAt(a.x, a.z);
    if (isNaN(prev)) prev = a.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = a.x + dx * t, z = a.z + dz * t;
      const c = this.cellOf(x, z); if (c < 0) return false;
      const hh = this.h[c];
      if (isNaN(hh) || Math.abs(hh - prev) > this.STEP) return false;
      prev = hh;
    }
    return true;
  }
  smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 48);
      while (j > i + 1 && !this.lineOK(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  randomPoint() {
    const c = this.walkList[(Math.random() * this.walkList.length) | 0];
    return new THREE.Vector3(this.wx(c), this.h[c], this.wz(c));
  }
}
