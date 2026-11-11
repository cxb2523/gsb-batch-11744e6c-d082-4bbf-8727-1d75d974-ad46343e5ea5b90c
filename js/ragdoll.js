'use strict';
// ======================================================================
//  ragdoll.js —— Verlet 布娃娃：15 个质点 + 距离约束，驱动骨骼
// ======================================================================
class Ragdoll {
  constructor(h, scene, world, vel, impulse, hitGroup) {
    this.h = h; this.world = world; this.t = 0; this.sleep = false; this.still = 0;
    h.root.updateMatrixWorld(true);
    const W = (o, x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);
    const P = this.p = [
      W(h.hips), W(h.spine, 0, 0.48, 0), W(h.head, 0, 0.1, 0),
      W(h.shL), W(h.elL), W(h.elL, 0, -0.27, 0),
      W(h.shR), W(h.elR), W(h.elR, 0, -0.27, 0),
      W(h.hipL), W(h.knL), W(h.knL, 0, -0.42, 0),
      W(h.hipR), W(h.knR), W(h.knR, 0, -0.42, 0),
    ];
    const dt0 = 1 / 60;
    this.q = P.map((p) => p.clone().addScaledVector(vel, -dt0));
    const hitIdx = { head: [2, 1], chest: [1, 3, 6], stomach: [0, 1], arm: [4, 7, 5, 8], leg: [10, 13, 11, 14] }[hitGroup] || [1];
    for (let i = 0; i < P.length; i++) this.q[i].addScaledVector(impulse, -dt0 * 0.35);
    for (const i of hitIdx) this.q[i].addScaledVector(impulse, -dt0 * 0.9);
    // 轻微随机扭转，避免“直挺挺倒下”
    const tw = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(0.8 * dt0);
    this.q[2].sub(tw); this.q[1].sub(tw);
    this.r = [0.13, 0.14, 0.12, 0.07, 0.055, 0.05, 0.07, 0.055, 0.05, 0.085, 0.065, 0.06, 0.085, 0.065, 0.06];
    const pairs = [[0, 1], [1, 2], [1, 3], [1, 6], [3, 6], [0, 9], [0, 12], [9, 12], [3, 9], [6, 12], [3, 12], [6, 9], [2, 3], [2, 6],
      [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [12, 13], [13, 14], [0, 3], [0, 6]];
    this.c = pairs.map(([a, b]) => [a, b, P[a].distanceTo(P[b])]);
    this.minC = [[9, 11, 0.55], [12, 14, 0.55], [3, 5, 0.2], [6, 8, 0.2], [0, 2, 0.6], [10, 1, 0.45], [13, 1, 0.45]];
    this.container = new THREE.Group();
    scene.add(this.container);
    const bones = [h.hips, h.spine, h.neck, h.shL, h.elL, h.shR, h.elR, h.hipL, h.knL, h.hipR, h.knR];
    for (const b of bones) this.container.attach(b);
    h.gunMount.visible = false;
    this.root = h.root;   // 蒙皮网格留在原 root 下，随布娃娃一起回收
    this.bones = [
      { o: h.hips, a: 0, b: 1, up: true, r: [9, 12] },
      { o: h.spine, a: 0, b: 1, up: true, r: [3, 6], off: 0.04 },
      { o: h.neck, a: 1, b: 2, up: true, r: [3, 6] },
      { o: h.shL, a: 3, b: 4, r: [3, 6] }, { o: h.elL, a: 4, b: 5, r: [3, 6] },
      { o: h.shR, a: 6, b: 7, r: [3, 6] }, { o: h.elR, a: 7, b: 8, r: [3, 6] },
      { o: h.hipL, a: 9, b: 10, r: [9, 12] }, { o: h.knL, a: 10, b: 11, r: [9, 12] },
      { o: h.hipR, a: 12, b: 13, r: [9, 12] }, { o: h.knR, a: 13, b: 14, r: [9, 12] },
    ];
    this._m = new THREE.Matrix4(); this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
  }

  collide(i) {
    const p = this.p[i], r = this.r[i], q = this.q[i];
    const list = this.world.query(p.x - r, p.y - r, p.z - r, p.x + r, p.y + r, p.z + r);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      const cx = clamp(p.x, b.minX, b.maxX), cy = clamp(p.y, b.minY, b.maxY), cz = clamp(p.z, b.minZ, b.maxZ);
      let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      let ny;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2), k2 = (r - d) / d;
        p.x += dx * k2; p.y += dy * k2; p.z += dz * k2; ny = dy / d;
      } else {
        // 在盒内：沿最短轴推出（优先向上）
        const up = b.maxY - p.y;
        const opts = [[up * 0.6, 0, 1, 0], [p.x - b.minX, -1, 0, 0], [b.maxX - p.x, 1, 0, 0], [p.z - b.minZ, 0, 0, -1], [b.maxZ - p.z, 0, 0, 1]];
        let best = opts[0];
        for (const o of opts) if (o[0] < best[0]) best = o;
        const d = (best === opts[0] ? up : best[0]) + r;
        p.x += best[1] * d; p.y += best[2] * d; p.z += best[3] * d; ny = best[2];
      }
      if (ny > 0.5) { q.x = lerp(q.x, p.x, 0.35); q.z = lerp(q.z, p.z, 0.35); }
    }
  }

  update(dt) {
    if (this.sleep) return;
    this.t += dt;
    const steps = 2, h = Math.min(dt, 1 / 30) / steps;
    const P = this.p, Q = this.q;
    let motion = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = Q[i];
        const vx = (p.x - q.x) * 0.992, vy = (p.y - q.y) * 0.992, vz = (p.z - q.z) * 0.992;
        q.copy(p);
        p.x += vx; p.y += vy - 13 * h * h; p.z += vz;
        motion += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
      }
      for (let it = 0; it < 7; it++) {
        for (const [a, b, L] of this.c) this.solve(a, b, L, 0);
        for (const [a, b, L] of this.minC) this.solve(a, b, L, 1);
        if (it % 3 === 2) for (let i = 0; i < P.length; i++) this.collide(i);
      }
      for (let i = 0; i < P.length; i++) this.collide(i);
    }
    this.apply();
    if (motion < 0.004) this.still += dt; else this.still = 0;
    if (this.still > 0.6 || this.t > 7) this.sleep = true;
  }
  solve(a, b, L, minOnly) {
    const pa = this.p[a], pb = this.p[b];
    const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    if (minOnly && d >= L) return;
    const k = (d - L) / d * 0.5;
    pa.x += dx * k; pa.y += dy * k; pa.z += dz * k;
    pb.x -= dx * k; pb.y -= dy * k; pb.z -= dz * k;
  }
  apply() {
    const X = this._x, Y = this._y, Z = this._z;
    for (const B of this.bones) {
      const a = this.p[B.a], b = this.p[B.b];
      Y.subVectors(b, a).normalize();
      if (!B.up) Y.negate();
      X.subVectors(this.p[B.r[1]], this.p[B.r[0]]);
      X.addScaledVector(Y, -X.dot(Y));
      if (X.lengthSq() < 1e-8) X.set(1, 0, 0);
      X.normalize();
      Z.crossVectors(X, Y);
      this._m.makeBasis(X, Y, Z);
      B.o.quaternion.setFromRotationMatrix(this._m);
      B.o.position.copy(a);
      if (B.off) { const up = _v1.subVectors(this.p[1], this.p[0]).normalize(); B.o.position.addScaledVector(up, B.off); }
    }
  }
  dispose() {
    if (this.container.parent) this.container.parent.remove(this.container);
    if (this.root && this.root.parent) this.root.parent.remove(this.root);
  }
}
