'use strict';
// ======================================================================
//  bot.js —— 机器人 AI：感知(视野/通视/听觉/受击) → 状态机 →
//             导航(A*) → 人类化瞄准(反应时间/误差收敛/压枪) → 急停点射
// ======================================================================
const DIFFS = {
  // react 反应(s)  turn 转身(°/s)  err 初始瞄准误差(°)  errDecay 误差收敛  head 瞄头概率  spray 压枪程度
  // fov 视野  hear 听觉  strafe 对枪横移  track 跟枪  stopShoot 急停开枪纪律  slide 滑铲倾向  first 首枪额外延迟(s)
  easy:   { label: '新兵',   react: 0.78, turn: 170, err: 10,  errDecay: 0.9, head: 0.06, spray: 0.12, fov: 100, hear: 0.5,  strafe: 0.2,  track: 0.3,  stopShoot: 0.3,  slide: 0.15, first: 0.25 },
  normal: { label: '老兵',   react: 0.52, turn: 280, err: 6.5, errDecay: 1.6, head: 0.15, spray: 0.35, fov: 110, hear: 0.72, strafe: 0.45, track: 0.55, stopShoot: 0.65, slide: 0.4,  first: 0.12 },
  hard:   { label: '精英',   react: 0.34, turn: 440, err: 4.0, errDecay: 2.8, head: 0.3,  spray: 0.62, fov: 120, hear: 0.92, strafe: 0.75, track: 0.78, stopShoot: 0.88, slide: 0.7,  first: 0.05 },
  cosmic: { label: '宇宙级', react: 0.21, turn: 760, err: 2.2, errDecay: 4.8, head: 0.5,  spray: 0.86, fov: 135, hear: 1.1,  strafe: 1.0,  track: 0.93, stopShoot: 1.0,  slide: 1.0,  first: 0.0 },
};

class BotBrain {
  constructor(actor, game, diff) {
    this.a = actor; this.g = game; this.d = DIFFS[diff] || DIFFS.normal;
    this.path = null; this.pathIdx = 0; this.goal = null; this.repathT = 0;
    this.target = null; this.targetVisible = false; this.acquireT = 0; this.lastSeenT = -99; this.lastKnown = new THREE.Vector3();
    this.errP = 0; this.errY = 0; this.aimPart = 'chest';
    this.thinkT = Math.random() * 0.1; this.stuckT = 0; this.stuckRef = new THREE.Vector3();
    this.strafeT = 0; this.strafeMove = false; this.strafeDir = 1; this.burstPause = 0; this.burstLen = 5; this.sprayStart = 0;
    this.look = new THREE.Vector3(); this.hasLook = false;
    this.task = null; this.hearPos = new THREE.Vector3(); this.hearT = -99;
    this.alertBy = null; this.alertT = -99;
    this.passive = false; this.holdT = 0; this.crouchSpray = Math.random() < 0.35;
    this.sweep = 0; this.wantScope = false; this.dummyT = 0;
    this.nade = null; this.nadeUsedOn = null;
    this._e = new THREE.Vector3(); this._p = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  reset() {
    this.path = null; this.goal = null; this.target = null; this.targetVisible = false; this.hearT = -99; this.alertBy = null;
    this.burstPause = 0; this.task = null; this.holdT = 0; this.lastSeenT = -99; this.nade = null;
  }

  // ---------------- 投掷物 ----------------
  // 计划把 id 投向 target（自动反解抛物线出手角）
  planNade(id, target) {
    const a = this.a;
    if (this.nade || !a.inv.nades[id]) return false;
    const eye = a.eyePos(this._e);
    const dx = target.x - eye.x, dz = target.z - eye.z, D = Math.hypot(dx, dz), H = target.y + 0.3 - eye.y;
    const v = 750 * 0.9 * U, g = 0.4 * PHYS.gravity;
    let best = null, bestErr = 1e9;
    for (let deg = -15; deg <= 65; deg += 1) {
      const th = deg * DEG, c = Math.cos(th);
      const y = D * Math.tan(th) - g * D * D / (2 * v * v * c * c);
      const err = Math.abs(y - H);
      if (err < bestErr) { bestErr = err; best = deg; }
      if (err < 0.3) break;
    }
    if (best == null || bestErr > 3) return false;
    const pitchDeg = best > 10 ? (best - 10) / (80 / 90) : (best - 10) / (100 / 90);
    this.nade = { id, yaw: yawOf(dx, dz), pitch: pitchDeg * DEG, t: 0, phase: 'draw' };
    return true;
  }
  runNade(dt) {
    const a = this.a, c = a.cmd, n = this.nade;
    n.t += dt;
    c.fwd = 0; c.side = 0; c.attack = false;
    if (n.t > 4) { this.nade = null; return; }
    if (n.phase === 'draw') {
      if (!(a.slot === 'nade' && a.weapon && a.weapon.id === n.id)) { a.nadeId = n.id; c.slotReq = 'nade'; return; }
      if (this.g.time < a.drawEnd) return;
      const e = Math.abs(wrapAngle(n.yaw - a.yaw)) + Math.abs(n.pitch - a.pitch);
      if (e < 0.03) { n.phase = 'pull'; n.t0 = n.t; }
      return;
    }
    if (n.phase === 'pull') { c.attack = true; if (n.t - n.t0 > 0.4) { n.phase = 'done'; n.t0 = n.t; } return; }
    if (n.phase === 'done' && n.t - n.t0 > 0.7) this.nade = null;
  }

  hear(pos) {
    if (this.target && this.targetVisible) return;
    this.hearPos.copy(pos); this.hearT = this.g.time;
  }
  onDamaged(attacker) {
    if (!attacker || attacker.team === this.a.team) return;
    this.alertBy = attacker; this.alertT = this.g.time;
    if (!this.targetVisible) { this.lastKnown.copy(attacker.pos); this.lastSeenT = this.g.time - 1; }
  }

  // ---------------- 感知 ----------------
  think() {
    const a = this.a, g = this.g;
    const eye = a.eyePos(this._e);
    const fwd = a.forward(this._d);
    const cosF = Math.cos(this.d.fov * 0.5 * DEG);
    let best = null, bestScore = Infinity;
    if (a.blind < 0.6) {
      for (const e of g.actors) {
        if (!e.alive || e.team === a.team) continue;
        const head = g.aimPoint(e, 'head', _v1);
        const dx = head.x - eye.x, dy = head.y - eye.y, dz = head.z - eye.z, dist = Math.hypot(dx, dy, dz);
        if (dist > 95) continue;
        const known = e === this.target || (e === this.alertBy && g.time - this.alertT < 2.5);
        const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist;
        if (!known && dot < cosF) continue;
        // 远处、移动慢、蹲着的目标更难发现
        if (!known && dist > 30 && e.hspeed() < 1 && e.ducked && Math.random() < 0.4) continue;
        let vis = g.visible(eye, head);
        if (!vis) vis = g.visible(eye, g.aimPoint(e, 'chest', _v1));
        if (!vis) continue;
        const score = dist * (dot > 0.95 ? 0.7 : 1) * (e === this.target ? 0.6 : 1);
        if (score < bestScore) { bestScore = score; best = e; }
      }
    }
    if (best) {
      if (best !== this.target || !this.targetVisible) {
        if (best !== this.target || g.time - this.lastSeenT > 1.2) this.acquire(best);
        this.target = best;
      }
      this.targetVisible = true; this.lastSeenT = g.time; this.lastKnown.copy(best.pos);
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || g.time - this.lastSeenT > 5)) this.target = null;
    }
    this.decide();
  }
  acquire(t) {
    const g = this.g;
    this.acquireT = g.time + (this.a.blind > 0 ? 0.5 : 0) + this.d.react * rand(-0.15, 0.35) + this.d.first;
    const dist = t.pos.distanceTo(this.a.pos);
    const e = this.d.err * rand(0.55, 1.25) * (t.hspeed() > 3 ? 1.3 : 1) * (dist > 40 ? 0.8 : 1);
    const th = Math.random() * Math.PI * 2;
    this.errP = Math.sin(th) * e * 0.7; this.errY = Math.cos(th) * e;
    this.aimPart = Math.random() < this.d.head ? 'head' : 'body';
    this.burstLen = this.pickBurst(dist);
    this.strafeT = 0; this.slideDecided = false;
  }
  pickBurst(dist) {
    const def = this.a.def;
    if (!def.auto) return 1;
    // 压枪差的机器人打短点射（否则后坐上飘全变成爆头）
    const sp = this.d.spray;
    if (dist > 30) return randi(1, 2 + Math.round(sp));
    if (dist > 14) return randi(2, 3 + Math.round(3 * sp));
    return randi(3, 4 + Math.round(12 * sp));
  }

  // ---------------- 决策 ----------------
  decide() {
    const a = this.a, g = this.g;
    let goal = null;
    if (this.targetVisible) { this.state = 'combat'; return; }
    if (this.task && this.task.urgent) { goal = this.taskGoal(); this.state = 'task'; }
    else if (this.target && g.time - this.lastSeenT < 5 && !(this.task && this.task.type === 'hold' && Math.random() < 0.6)) {
      goal = this.lastKnown; this.state = 'hunt';
      const d = a.pos.distanceTo(this.lastKnown);
      if (a.inv.nades.he && this.nadeUsedOn !== this.target && d > 7 && d < 24 && Math.random() < 0.25) { if (this.planNade('he', this.lastKnown)) this.nadeUsedOn = this.target; }
    }
    else if (g.time - this.hearT < 4 && (!this.task || this.task.type !== 'hold')) { goal = this.hearPos; this.state = 'investigate'; }
    else { goal = this.taskGoal(); this.state = 'task'; }
    if (goal) this.setGoal(goal);
  }
  taskGoal() {
    const t = this.task, a = this.a;
    if (!t || t.delay > 0) return null;
    if (t.type === 'route') {
      while (t.i < t.pts.length - 1 && a.pos.distanceTo(t.pts[t.i]) < 3.5) t.i++;
      return t.pts[t.i];
    }
    return t.pos;
  }
  setGoal(goal) {
    const g = this.g, a = this.a;
    this.repathT -= 0.1;
    if (!this.goal || this.goal.distanceTo(goal) > 2.0 || this.repathT <= 0 || !this.path) {
      this.goal = this.goal || new THREE.Vector3();
      this.goal.copy(goal);
      this.path = g.nav.findPath(a.pos, goal);
      this.pathIdx = this.path && this.path.length > 1 ? 1 : 0;
      this.repathT = 4 + Math.random() * 2;
    }
  }

  // ---------------- 每 tick ----------------
  tick(dt) {
    const a = this.a;
    if (!a.alive) return;
    const c = a.cmd;
    c.jumpPressed = false; c.duckPressed = false; c.attackPressed = false; c.attack2Pressed = false; c.usePressed = false; c.reload = false;
    c.walk = false; c.sprint = false;
    if (this.passive) { this.dummy(dt); return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.09 + Math.random() * 0.04; this.think(); }
    this.burstPause = Math.max(0, this.burstPause - dt);
    const combat = this.target && this.targetVisible;
    if (this.nade && !combat) {
      const n = this.nade;
      a.yaw = wrapAngle(a.yaw + clamp(wrapAngle(n.yaw - a.yaw), -6 * dt, 6 * dt));
      a.pitch += clamp(n.pitch - a.pitch, -4 * dt, 4 * dt);
      this.runNade(dt);
      return;
    }
    if (this.nade && combat) this.nade = null;
    this.aim(dt, combat);
    if (combat) { this.combatMove(dt); this.shoot(dt); }
    else {
      c.attack = false; c.duck = false; c.use = false;
      if (this.task && this.task.type === 'defuse' && this.task.pos.distanceTo(a.pos) < 1.4) { c.fwd = 0; c.side = 0; c.use = true; return; }
      if (this.task && this.task.type === 'plant' && this.g.map.inSite(a.pos) && a.inv.c4 && this.task.pos.distanceTo(a.pos) < 2.5) {
        c.fwd = 0; c.side = 0;
        if (a.slot !== 'c4') c.slotReq = 'c4'; else c.attack = true;
        return;
      }
      if (a.slot === 'c4' && !this.task) c.slotReq = a.bestSlot();
      this.navigate(dt);
      // 空闲时换弹 / 切回主武器
      const w = a.weapon;
      if (w && w.def.mag && w.mag < w.def.mag * 0.5 && w.reserve > 0 && !a.reloading && this.g.time - this.lastSeenT > 1.5) c.reload = true;
      if (a.slot === 'knife' && (a.inv.primary || a.inv.secondary) && !(this.task && this.task.knife)) c.slotReq = a.bestSlot();
      if (a.scoped && this.g.time - this.lastSeenT > 3) c.attack2Pressed = a.scoped === 1 ? true : false;
    }
  }

  aim(dt, combat) {
    const a = this.a, g = this.g;
    let ty = a.yaw, tp = a.pitch;
    const eye = a.eyePos(this._e);
    if (combat) {
      const p = g.aimPoint(this.target, this.aimPart, this._p);
      const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
      ty = yawOf(dx, dz); tp = Math.atan2(dy, Math.hypot(dx, dz));
      // 目标横移 → 误差增大（跟枪能力不足）
      const tv = this.target.vel, dist = Math.hypot(dx, dz) + 0.1;
      const lateral = Math.abs((tv.x * dz - tv.z * dx) / dist) / dist;
      const k = Math.exp(-this.d.errDecay * dt);
      this.errY = this.errY * k + (Math.random() - 0.5) * lateral * (1 - this.d.track) * 60 * dt;
      this.errP *= k;
      ty += this.errY * DEG; tp += this.errP * DEG;
      const pat = patternAt(a.def, a.recoilIdx);
      tp -= (pat[0] + a.aimPunchP) * DEG * this.d.spray;
      ty += pat[1] * DEG * this.d.spray;
    } else {
      if (this.state === 'task' && this.task && this.task.type === 'hold' && this.task.pos.distanceTo(a.pos) < 2.5 && this.task.look) {
        this.sweep += dt * 0.6;
        const L = this.task.look;
        ty = yawOf(L.x - eye.x, L.z - eye.z) + Math.sin(this.sweep) * 0.25;
        tp = Math.atan2(L.y - eye.y, Math.hypot(L.x - eye.x, L.z - eye.z));
      } else if (this.alertBy && g.time - this.alertT < 1.5) {
        const p = this.alertBy.pos; ty = yawOf(p.x - eye.x, p.z - eye.z); tp = 0;
      } else if (this.state === 'investigate' || (this.state === 'hunt' && this.lastKnown)) {
        const p = this.state === 'hunt' ? this.lastKnown : this.hearPos;
        ty = yawOf(p.x - eye.x, p.z - eye.z); tp = Math.atan2(p.y + 1.4 - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z));
      } else if (this.path && this.pathIdx < this.path.length) {
        const wp = this.path[Math.min(this.path.length - 1, this.pathIdx + 1)];
        const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z;
        if (dx * dx + dz * dz > 0.5) ty = yawOf(dx, dz);
        tp = Math.atan2(wp.y + 1.5 - eye.y, Math.hypot(dx, dz) + 3);
      }
    }
    const dyaw = wrapAngle(ty - a.yaw), dp = tp - a.pitch;
    const kk = 1 - Math.exp(-dt * (combat ? 16 : 7));
    let sy = dyaw * kk, sp = dp * kk;
    const maxStep = this.d.turn * DEG * dt * (combat ? 1 : 0.55);
    const m = Math.hypot(sy, sp);
    if (m > maxStep) { sy *= maxStep / m; sp *= maxStep / m; }
    a.yaw = wrapAngle(a.yaw + sy);
    a.pitch = clamp(a.pitch + sp, -1.45, 1.45);
  }

  combatMove(dt) {
    const a = this.a, c = a.cmd, def = a.def;
    c.fwd = 0;
    const dist = this.target.pos.distanceTo(a.pos);
    if (a.sliding) { c.fwd = 1; c.side = 0; return; }   // 滑铲中保持方向
    // 刚发现敌人且正在全速奔跑：滑铲抢位（爆发式滑铲）
    if (!this.slideDecided) { this.slideDecided = true; if (this.slideCheck(dist > 6 && dist < 30 ? 0.55 : 0)) { c.fwd = 1; c.side = 0; return; } }
    if (def.type === 'sniper') {
      c.side = 0;
      if (!a.scoped && dist > 7 && this.g.time > a.nextFire - 0.1 && !a.reloading) c.attack2Pressed = true;
      this.counterStrafe(c);
      return;
    }
    if (def.type === 'knife' || def.type === 'grenade' || def.type === 'c4') {
      if (a.inv.primary || a.inv.secondary) c.slotReq = a.bestSlot();
      else { c.fwd = 1; c.side = 0; }
      return;
    }
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeMove = !this.strafeMove && Math.random() < this.d.strafe;
      if (this.strafeMove) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        const R = _v1.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
        const nx = a.pos.x + R.x * this.strafeDir * 1.4, nz = a.pos.z + R.z * this.strafeDir * 1.4;
        const h = this.g.nav.heightAt(nx, nz);
        if (isNaN(h) || Math.abs(h - a.pos.y) > 0.6) this.strafeDir = -this.strafeDir;
        this.strafeT = rand(0.22, 0.5);
      } else this.strafeT = rand(0.3, 0.75) * (1.25 - this.d.strafe * 0.5);
    }
    if (this.strafeMove && a.recoilIdx < 2) c.side = this.strafeDir;
    else this.counterStrafe(c);
    if (dist > 45 && def.type === 'pistol') c.fwd = 0.6;
    c.duck = this.crouchSpray && a.recoilIdx > 3 && dist > 10;
  }
  // 满足条件则按下蹲触发滑铲（实际是否滑出由 Actor 物理判定：需接近满速且朝前）
  slideCheck(p, wx, wz, room) {
    const a = this.a, def = a.def;
    if (a.sliding || a.slideCD > 0 || !a.onGround || a.scoped || def.type === 'c4') return false;
    if (Math.random() > p * this.d.slide) return false;
    const hs = a.hspeed();
    if (hs < def.speed * 0.8) return false;
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    if ((a.vel.x * fx + a.vel.z * fz) < hs * 0.7) return false;
    if (wx !== undefined && (wx * fx + wz * fz) < 0.9) return false;      // 朝向与路径一致才滑
    // 前方 4m 内无障碍
    const W = this.g.world, e = a.pos;
    const tr = W.traceHull(e.x, e.y + 0.3, e.z, e.x + fx * 4, e.y + 0.3, e.z + fz * 4, PHYS.hullHalf, PHYS.crouchH - 0.3);
    if (tr.frac < 1) return false;
    a.cmd.duckPressed = true; a.cmd.duck = false;
    return true;
  }
  counterStrafe(c) {
    const a = this.a;
    const R = _v1.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw)), F = _v2.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
    const lat = a.vel.x * R.x + a.vel.z * R.z, lon = a.vel.x * F.x + a.vel.z * F.z;
    c.side = Math.abs(lat) > 0.6 ? -Math.sign(lat) : 0;
    c.fwd = Math.abs(lon) > 0.6 ? -Math.sign(lon) : c.fwd;
  }

  shoot(dt) {
    const a = this.a, g = this.g, c = a.cmd, def = a.def;
    c.attack = false;
    if (g.time < this.acquireT + this.d.react) return;
    if (a.blind > 0.4) { if (Math.random() < 0.5 * dt * 10) c.attack = true; return; }
    if (!a.weapon || !def.damage) return;
    if (a.weapon.mag === 0) { c.reload = true; return; }
    if (a.reloading) return;
    if (this.burstPause > 0) { if (def.auto) return; }
    const eye = a.eyePos(this._e);
    const p = g.aimPoint(this.target, this.aimPart, this._p);
    const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z, dist = Math.hypot(dx, dy, dz);
    const pat = patternAt(def, a.recoilIdx);
    const dir = dirFromAngles(a.yaw - pat[1] * DEG, a.pitch + (pat[0] + a.aimPunchP) * DEG, this._d);
    const cosErr = (dir.x * dx + dir.y * dy + dir.z * dz) / dist;
    const err = Math.acos(clamp(cosErr, -1, 1));
    const rad = this.aimPart === 'head' ? 0.12 : 0.2;
    const tol = Math.atan2(rad, dist) * (1.3 + (1 - this.d.stopShoot) * 1.5) + 0.004;
    const hs = a.hspeed();
    const accurate = hs <= def.speed * 0.36 || dist < 7 || (def.type === 'smg' && hs < def.speed * 0.7) || Math.random() > this.d.stopShoot;
    if (def.scope && !a.scoped && dist > 7) return;
    if (err > tol || !accurate) return;
    if (g.teammateInLine(a, eye, p)) return;
    if (def.auto) {
      c.attack = true;
      if (this.sprayStart === 0) this.sprayStart = a.recoilIdx;
      if (a.recoilIdx >= this.burstLen) {
        c.attack = false;
        this.burstPause = dist > 25 ? rand(0.3, 0.5) : dist > 12 ? rand(0.18, 0.35) : 0.05;
        this.burstLen = this.pickBurst(dist);
      }
    } else if (g.time >= a.nextFire + (def.type === 'pistol' ? rand(0.02, 0.18) * (1.2 - this.d.track) : 0.05)) {
      c.attackPressed = true;
    }
  }

  navigate(dt) {
    const a = this.a, c = a.cmd;
    c.fwd = 0; c.side = 0;
    if (!this.path || this.pathIdx >= this.path.length) {
      if (this.task && this.task.type === 'hold') { this.holdT += dt; }
      return;
    }
    const wp = this.path[this.pathIdx];
    const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, d = Math.hypot(dx, dz);
    const last = this.pathIdx === this.path.length - 1;
    if (d < (last ? 0.5 : 0.9) && Math.abs(wp.y - a.pos.y) < 1.2) { this.pathIdx++; return; }
    const wx = dx / d, wz = dz / d;
    const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
    c.fwd = wx * -sy + wz * -cy;
    c.side = wx * cy + wz * -sy;
    if (last && d < 2) { c.fwd *= 0.6; c.side *= 0.6; }
    if (a.sliding) { c.fwd = Math.max(c.fwd, 0.7); }
    else if (!last && d > 5 && Math.abs(wp.y - a.pos.y) < 0.3) {
      // 赶路/转点/回防时更爱滑铲
      const hurry = this.state === 'hunt' || (this.task && (this.task.urgent || this.task.type === 'route'));
      if (Math.random() < dt * (hurry ? 0.5 : 0.18)) this.slideCheck(1, wx, wz, d);
    }
    // 卡住检测
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (this.stuckRef.distanceTo(a.pos) < 0.35) {
        c.jumpPressed = true;
        this.path = this.g.nav.findPath(a.pos, this.goal || wp);
        this.pathIdx = this.path && this.path.length > 1 ? 1 : 0;
        if (Math.random() < 0.3 && this.task && this.task.type === 'roam') this.task.pos = this.g.randomGoal(a);
      }
      this.stuckRef.copy(a.pos); this.stuckT = 0;
    }
  }

  // 靶场假人：原地 AD 晃动
  dummy(dt) {
    const a = this.a, c = a.cmd;
    c.attack = false; c.fwd = 0;
    this.dummyT -= dt;
    if (this.dummyT <= 0) {
      this.dummyT = rand(0.3, 1.1);
      this.strafeDir = Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? -1 : 1);
      const R = _v1.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
      if (this.strafeDir && this.task && this.task.pos) {
        const off = _v2.subVectors(a.pos, this.task.pos);
        if (Math.abs(off.x * R.x + off.z * R.z) > 2.5) this.strafeDir = -Math.sign(off.x * R.x + off.z * R.z);
      }
      if (Math.random() < 0.12) c.jumpPressed = true;
      c.duck = Math.random() < 0.15;
    }
    c.side = this.strafeDir;
    const P = this.g.player;
    if (P) { const dx = P.pos.x - a.pos.x, dz = P.pos.z - a.pos.z; a.yaw = yawOf(dx, dz); }
  }
}
