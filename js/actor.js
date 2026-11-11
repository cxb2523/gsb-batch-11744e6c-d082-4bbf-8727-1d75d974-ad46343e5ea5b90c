'use strict';
// ======================================================================
//  actor.js —— 玩家与机器人共用：经典 FPS 移动物理、蹲/跳/滑铲、
//                武器状态机（开火/后坐/散布/换弹/切枪/刀/投掷/C4）
// ======================================================================
let ACTOR_SEQ = 0;
const BOT_NAMES = {
  CT: ['老鹰', '猎隼', '铁壁', '北极星', '雷霆', '灰狼', '冰川', '堡垒', '利刃'],
  T: ['沙蝎', '毒蛇', '野狼', '黑曼巴', '赤狐', '鬣狗', '响尾蛇', '秃鹫', '狂沙'],
};

function newCmd() {
  return { fwd: 0, side: 0, jump: false, jumpPressed: false, duck: false, duckPressed: false, walk: false, sprint: false,
    attack: false, attackPressed: false, attack2: false, attack2Pressed: false, reload: false, use: false, usePressed: false,
    inspect: false, slotReq: null, drop: false };
}

class Actor {
  constructor(game, o) {
    this.game = game;
    this.id = ++ACTOR_SEQ;
    this.name = o.name; this.team = o.team; this.isBot = !!o.isBot; this.isPlayer = !!o.isPlayer;
    // 联机：remote = 房主侧代表加入者的角色（位置来自对方本机模拟），pid = 对方连接 id
    this.remote = !!o.remote; this.pid = o.pid || 0; this.spawnSeq = 0; this.inq = []; this.viewT = null; this.ping = null; this._vy = 0;
    this.pos = new THREE.Vector3(); this.prevPos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.renderPos = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true; this.groundBox = null;
    this.ducked = false; this.duckAmt = 0;
    this.sliding = false; this.slideT = 0; this.slideCD = 0; this.slideAmt = 0; this.slideRollDir = 1;
    this.sprinting = false; this.sprintRecover = 0;
    this.stamina = 0; this.velMod = 1; this.landInacc = 0; this.stepOffset = 0; this.stepDist = 0;
    this.hp = 100; this.armor = 0; this.helmet = false; this.alive = false;
    this.money = 800; this.kills = 0; this.deaths = 0; this.assists = 0; this.mvp = 0; this.roundKills = 0; this.damageBy = new Map();
    this.inv = { primary: null, secondary: null, knife: new WeaponInst(this.isPlayer ? (Settings.data.knife === 'knife' ? 'knife' : 'butterfly') : this.remote ? (o.knife === 'knife' ? 'knife' : 'butterfly') : (Math.random() < 0.3 ? 'butterfly' : 'knife')), nades: { he: 0, flash: 0, smoke: 0 }, c4: false, defuser: false };
    this.slot = 'knife'; this.lastSlot = 'knife'; this.weapon = this.inv.knife; this.nadeId = 'he';
    this.drawEnd = 0; this.nextFire = 0; this.reloadEnd = 0; this.reloading = false;
    this.recoilIdx = 0; this.lastShot = -9; this.fireInacc = 0; this.recoilP = 0; this.recoilY = 0;
    this.punchP = 0; this.punchY = 0; this.aimPunchP = 0; this.aimPunchY = 0;
    this.scoped = 0; this.zoomT = 9; this.rezoom = 0;
    this.nadeHold = 0; this.pinTime = 0; this.throwAt = 0; this.throwStrength = 1;
    this.planting = false; this.plantT = 0; this.defusing = false; this.defuseT = 0;
    this.knifeCombo = 0; this.blind = 0; this.blindMax = 0;
    this.cmd = newCmd();
    this.events = [];          // 第一人称动画事件
    this.model = null;
    this.brain = null;
    this.lastAttacker = null; this.lastHitTime = -9;
    this.spawnProtect = 0;
    this._t = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
    this._eye = new THREE.Vector3();
  }

  get def() { return this.weapon ? this.weapon.def : WEAPONS.knife; }
  hullH() { return this.ducked ? PHYS.crouchH : PHYS.standH; }
  eyeHeight() {
    const e = lerp(PHYS.standEye, PHYS.crouchEye, this.duckAmt);
    return e - this.slideAmt * (PHYS.crouchEye - PHYS.slideEye);
  }
  eyePos(out = this._eye) { return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z); }
  forward(out) { return dirFromAngles(this.yaw, this.pitch, out); }
  hspeed() { return Math.hypot(this.vel.x, this.vel.z); }

  // ================= 出生 / 装备 =================
  spawnAt(p, yaw) {
    this.pos.copy(p); this.prevPos.copy(p); this.renderPos.copy(p); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.spawnSeq++;
    this.hp = 100; this.alive = true; this.ducked = false; this.duckAmt = 0; this.sliding = false; this.slideAmt = 0;
    this.velMod = 1; this.stamina = 0; this.stepOffset = 0; this.landInacc = 0; this.fireInacc = 0; this.recoilIdx = 0;
    this.recoilP = this.recoilY = this.punchP = this.punchY = this.aimPunchP = this.aimPunchY = 0;
    this.scoped = 0; this.rezoom = 0; this.reloading = false; this.planting = false; this.defusing = false;
    this.nadeHold = 0; this.throwAt = 0; this.blind = 0; this.onGround = true;
    this.damageBy.clear(); this.lastAttacker = null; this.roundKills = 0;
    this.cmd = newCmd();
    this.spawnProtect = this.game.mode && this.game.mode.id === 'tdm' ? 2.0 : 0;
    if (this.model) { this.game.resetModel(this); }
    if (this.isPlayer) { const kid = Settings.data.knife === 'knife' ? 'knife' : 'butterfly'; if (this.inv.knife.id !== kid) this.inv.knife = new WeaponInst(kid); }
    const best = this.inv.primary ? 'primary' : this.inv.secondary ? 'secondary' : 'knife';
    this.weapon = null; this.switchTo(best, true);
  }
  giveWeapon(id) {
    const def = WEAPONS[id];
    if (def.type === 'grenade') { if (this.inv.nades[id] < def.max) this.inv.nades[id]++; return; }
    const w = new WeaponInst(id);
    if (def.slot === 1) { this.inv.primary = w; this.switchTo('primary'); }
    else if (def.slot === 2) { this.inv.secondary = w; this.switchTo('secondary'); }
  }
  stripForNewGame() {
    this.inv.primary = null; this.inv.secondary = null; this.inv.nades = { he: 0, flash: 0, smoke: 0 };
    this.inv.c4 = false; this.inv.defuser = false; this.armor = 0; this.helmet = false;
  }

  // ================= 切枪 =================
  slotWeapon(slot) {
    const I = this.inv;
    if (slot === 'primary') return I.primary;
    if (slot === 'secondary') return I.secondary;
    if (slot === 'knife') return I.knife;
    if (slot === 'c4') return I.c4 ? (this._c4inst || (this._c4inst = new WeaponInst('c4'))) : null;
    if (slot === 'nade') {
      const avail = GRENADE_ORDER.filter((k) => I.nades[k] > 0);
      if (!avail.length) return null;
      let id = avail[0];
      if (this.slot === 'nade' && this.weapon) { const i = avail.indexOf(this.weapon.id); id = avail[(i + 1) % avail.length]; }
      else if (avail.includes(this.nadeId)) id = this.nadeId;
      this.nadeId = id;
      return new WeaponInst(id);
    }
    return null;
  }
  switchTo(slot, instant) {
    const w = this.slotWeapon(slot);
    if (!w) return false;
    if (w === this.weapon || (this.weapon && slot === 'nade' && this.slot === 'nade' && w.id === this.weapon.id)) return false;
    if (this.slot !== slot) this.lastSlot = this.slot;
    this.slot = slot; this.weapon = w;
    this.reloading = false; this.scoped = 0; this.rezoom = 0; this.nadeHold = 0; this.throwAt = 0; this.planting = false;
    const now = this.game.time;
    this.drawEnd = now + (instant ? 0.05 : (w.def.draw || 1) * 0.85);
    this.nextFire = Math.max(this.nextFire, this.drawEnd);
    this.recoilIdx = 0;
    this.events.push({ t: 'draw', id: w.id });
    if (this.model) this.model.setWeapon(w.id);
    if (!instant) this.sfx('deploy', 0.35);
    return true;
  }
  quickSwitch() { if (!this.switchTo(this.lastSlot)) { this.switchTo(this.inv.primary ? 'primary' : this.inv.secondary ? 'secondary' : 'knife'); } }
  bestSlot() { return this.inv.primary ? 'primary' : this.inv.secondary ? 'secondary' : 'knife'; }

  // ================= 每 tick 模拟 =================
  simulate(dt) {
    if (!this.alive) return;
    const c = this.cmd, g = this.game, W = g.world;
    this.prevPos.copy(this.pos);
    W.unstick(this.pos, PHYS.hullHalf, this.hullH());
    this.slideCD = Math.max(0, this.slideCD - dt);
    this.stamina = Math.max(0, this.stamina - 60 * dt);
    this.velMod = Math.min(1, this.velMod + dt * 0.5);
    this.landInacc *= Math.exp(-dt * 7);
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    if (this.blind > 0) this.blind = Math.max(0, this.blind - dt);

    const def = this.def;
    let maxSpeed = def.speed;
    if (this.scoped && def.scopedSpeed) maxSpeed = def.scopedSpeed;
    maxSpeed *= this.velMod;
    const frozen = g.frozen || this.planting || this.defusing;

    this.updateDuck(dt, c.duck || this.sliding);

    const hs = this.hspeed();
    this.sprinting = !!c.sprint && c.fwd > 0 && this.onGround && !this.ducked && !this.sliding && !this.scoped && !frozen && this.def.type !== 'c4';
    if (this.sprinting) this.sprintRecover = 0.16; else this.sprintRecover = Math.max(0, this.sprintRecover - dt);

    // 滑铲触发：接近满速奔跑时按蹲
    const slideOn = this.isPlayer ? Settings.data.slide : true;
    if (c.duckPressed && slideOn && this.onGround && !this.sliding && this.slideCD <= 0 && !c.walk && !frozen) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const along = this.vel.x * fx + this.vel.z * fz;
      if (hs >= def.speed * 0.78 && along > hs * 0.5) this.startSlide(hs, def);
    }

    // 期望方向
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let fwd = frozen ? 0 : c.fwd, side = frozen ? 0 : c.side;
    let wx = -sy * fwd + cy * side, wz = -cy * fwd - sy * side;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-4) { wx /= wl; wz /= wl; }
    let wish = wl > 1e-4 ? maxSpeed : 0;
    if (this.ducked && !this.sliding) wish *= PHYS.duckMul;
    else if (c.walk) wish *= PHYS.walkMul;
    else if (this.sprinting) wish *= PHYS.sprintMul;

    // 起跳
    if (c.jumpPressed && this.onGround && !frozen) {
      this.vel.y = PHYS.jumpImpulse;
      if (this.sliding) { this.vel.x *= 1.04; this.vel.z *= 1.04; this.endSlide(); this.events.push({ t: 'slidejump' }); }
      this.onGround = false;
      this.events.push({ t: 'jump' });
      this.sound('jump', 0.3, 0.5);
    }

    if (this.onGround) {
      if (this.sliding) this.slideFriction(dt, wx, wz);
      else { this.friction(dt); this.accelerate(wx, wz, wish, PHYS.accelerate, dt); }
      this.vel.y = 0;
      this.walkMove(dt);
      this.stayOnGround();
    } else {
      if (this.sliding) this.endSlide();
      this.airAccelerate(wx, wz, wish, dt);
      this.vel.y -= PHYS.gravity * dt * 0.5;
      this.slideMove(dt);
      this.vel.y -= PHYS.gravity * dt * 0.5;
    }
    this.categorize();

    // 滑铲视觉
    this.slideAmt = clamp(this.slideAmt + (this.sliding ? dt / 0.1 : -dt / 0.22), 0, 1);
    if (this.sliding && Math.random() < dt * 30) Effects.slideDust(this.pos, this.vel);

    // 脚步
    if (this.onGround && !this.sliding) {
      const s = this.hspeed();
      this.stepDist += s * dt;
      const stride = this.sprinting ? 2.4 : 2.0;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (s > def.speed * 0.6 && !this.ducked && !c.walk) this.footstep(s);
      }
    }
    this.stepOffset = damp(this.stepOffset, 0, 16, dt);
  }

  friction(dt) {
    const v = this.vel, sp = Math.hypot(v.x, v.z);
    if (sp < 0.002) { v.x = 0; v.z = 0; return; }
    const control = sp < PHYS.stopSpeed ? PHYS.stopSpeed : sp;
    const drop = control * PHYS.friction * dt;
    const ns = Math.max(0, sp - drop) / sp;
    v.x *= ns; v.z *= ns;
  }
  // 加速基准 = max(250u, wishspeed)，因此静步/蹲走/急停都同样“跟手”
  accelerate(wx, wz, wish, accel, dt) {
    const cur = this.vel.x * wx + this.vel.z * wz;
    const add = wish - cur; if (add <= 0) return;
    let as = accel * dt * Math.max(250 * U, wish); if (as > add) as = add;
    this.vel.x += as * wx; this.vel.z += as * wz;
  }
  airAccelerate(wx, wz, wish, dt) {
    const ws = Math.min(wish, PHYS.airWishCap);
    const cur = this.vel.x * wx + this.vel.z * wz;
    const add = ws - cur; if (add <= 0) return;
    let as = PHYS.airAccelerate * wish * dt; if (as > add) as = add;
    this.vel.x += as * wx; this.vel.z += as * wz;
  }

  slideMove(dt) {
    const W = this.game.world, hw = PHYS.hullHalf, h = this.hullH(), p = this.pos, v = this.vel;
    let time = dt;
    let n0x = 0, n0y = 0, n0z = 0, n1x = 0, n1y = 0, n1z = 0, np = 0;
    for (let bump = 0; bump < 4; bump++) {
      const dx = v.x * time, dy = v.y * time, dz = v.z * time;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-7) break;
      const tr = W.traceHull(p.x, p.y, p.z, p.x + dx, p.y + dy, p.z + dz, hw, h);
      const f = tr.frac >= 1 ? 1 : Math.max(0, tr.frac - 0.0008 / len);
      p.x += dx * f; p.y += dy * f; p.z += dz * f;
      if (tr.frac >= 1) break;
      time -= time * tr.frac;
      if (np === 0) { n0x = tr.nx; n0y = tr.ny; n0z = tr.nz; } else { n1x = tr.nx; n1y = tr.ny; n1z = tr.nz; }
      np = Math.min(2, np + 1);
      let d = v.x * tr.nx + v.y * tr.ny + v.z * tr.nz;
      if (d < 0) { v.x -= tr.nx * d; v.y -= tr.ny * d; v.z -= tr.nz * d; }
      d = v.x * n0x + v.y * n0y + v.z * n0z;
      if (d < 0) { v.x -= n0x * d; v.y -= n0y * d; v.z -= n0z * d; }
      if (np > 1) { d = v.x * n1x + v.y * n1y + v.z * n1z; if (d < 0) { v.x -= n1x * d; v.y -= n1y * d; v.z -= n1z * d; } }
    }
  }
  walkMove(dt) {
    const v = this.vel, p = this.pos;
    if (Math.abs(v.x) + Math.abs(v.z) < 1e-5) return;
    const W = this.game.world, hw = PHYS.hullHalf, h = this.hullH();
    const T = this._t;
    const p0 = T.a.copy(p), v0 = T.b.copy(v);
    this.slideMove(dt);
    const pD = T.c.copy(p), vD = T.d.copy(v);
    // 尝试上台阶
    p.copy(p0); v.copy(v0);
    let tr = W.traceHull(p.x, p.y, p.z, p.x, p.y + PHYS.stepHeight, p.z, hw, h);
    const up = tr.frac >= 1 ? PHYS.stepHeight : Math.max(0, tr.frac * PHYS.stepHeight - 0.001);
    p.y += up;
    this.slideMove(dt);
    tr = W.traceHull(p.x, p.y, p.z, p.x, p.y - up - 0.002, p.z, hw, h);
    if (tr.frac >= 1 || tr.ny < 0.7 || up < 0.01) { p.copy(pD); v.copy(vD); return; }
    p.y -= Math.max(0, tr.frac * (up + 0.002) - 0.0008);
    const dDown = (pD.x - p0.x) ** 2 + (pD.z - p0.z) ** 2;
    const dUp = (p.x - p0.x) ** 2 + (p.z - p0.z) ** 2;
    if (dDown >= dUp - 1e-9 || p.y - p0.y < 0.002) { p.copy(pD); v.copy(vD); return; }
    v.y = vD.y;
    this.stepOffset -= (p.y - p0.y);
  }
  stayOnGround() {
    const W = this.game.world, p = this.pos;
    const tr = W.traceHull(p.x, p.y, p.z, p.x, p.y - PHYS.stepHeight, p.z, PHYS.hullHalf, this.hullH());
    if (tr.frac > 0 && tr.frac < 1 && !tr.startSolid && tr.ny > 0.7) {
      const ny = p.y - PHYS.stepHeight * tr.frac + 0.0008;
      if (p.y - ny > 0.004) { this.stepOffset += p.y - ny; p.y = ny; }
    }
  }
  categorize() {
    const W = this.game.world, p = this.pos;
    const was = this.onGround;
    if (this.vel.y > 140 * U) { this.onGround = false; return; }
    const tr = W.traceHull(p.x, p.y, p.z, p.x, p.y - 0.05, p.z, PHYS.hullHalf, this.hullH());
    if (tr.frac < 1 && tr.ny > 0.7) {
      p.y = p.y - 0.05 * tr.frac + 0.0008;
      this.groundBox = tr.box;
      if (!was) this.onLand();
      this.onGround = true;
    } else this.onGround = false;
  }
  onLand() {
    const fs = Math.max(0, -this.vel.y);
    this.vel.y = 0;
    const fsu = fs / U;
    this.stamina = Math.min(80, this.stamina + 0.05 * fsu);
    const k = (100 - this.stamina) / 100;
    this.vel.x *= k; this.vel.z *= k;
    this.landInacc = (this.def.inaccLand || 0) * clamp(fs / 7, 0.25, 1);
    this.events.push({ t: 'land', v: fs });
    if (fs > 2.0) {
      this.sound('land', clamp(fs / 8, 0.2, 0.8), 0.6);
      if (fs > 4.5) Effects.landDust(this.pos, clamp(fs / 9, 0.3, 1));
    }
    if (fsu > 580) this.game.applyDamage(this, null, Math.round((fsu - 580) * (100 / (1024 - 580))), 'fall', null, null);
  }
  updateDuck(dt, want) {
    const W = this.game.world, p = this.pos, hw = PHYS.hullHalf, dH = PHYS.standH - PHYS.crouchH;
    if (want) {
      if (!this.ducked) {
        if (!this.onGround) { p.y += dH; this.duckAmt = 1; }
        this.ducked = true;
      }
    } else if (this.ducked) {
      if (this.onGround) {
        if (!W.overlapHull(p.x, p.y, p.z, hw, PHYS.standH)) this.ducked = false;
      } else {
        const ny = p.y - dH;
        if (!W.overlapHull(p.x, ny, p.z, hw, PHYS.standH)) { p.y = ny; this.ducked = false; this.duckAmt = 0; }
        else if (!W.overlapHull(p.x, p.y, p.z, hw, PHYS.standH)) this.ducked = false;
      }
    }
    const target = this.ducked ? 1 : 0, sp = dt / 0.12;
    this.duckAmt += clamp(target - this.duckAmt, -sp, sp);
  }
  startSlide(hs, def) {
    this.sliding = true; this.slideT = 0;
    const dx = this.vel.x / hs, dz = this.vel.z / hs;
    const base = Math.max(hs, def.speed * (this.sprinting ? PHYS.sprintMul : 1));
    const ns = Math.min(base * 1.36, 9.4);
    this.vel.x = dx * ns; this.vel.z = dz * ns;
    this.ducked = true;
    this.slideRollDir = this.cmd.side !== 0 ? -Math.sign(this.cmd.side) : (Math.random() < 0.5 ? -1 : 1);
    this.events.push({ t: 'slide' });
    this.sound('slidemove', 0.55, 0.8);
    this.game.noise(this, this.pos, 16);
  }
  slideFriction(dt, wx, wz) {
    const v = this.vel, s = Math.hypot(v.x, v.z);
    this.slideT += dt;
    const ns = Math.max(0, s - (1.0 + 0.9 * s) * dt);
    if (s > 0.01) {
      let dx = v.x / s, dz = v.z / s;
      if (wx || wz) { dx += wx * 1.5 * dt; dz += wz * 1.5 * dt; const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
      v.x = dx * ns; v.z = dz * ns;
    }
    if (ns < 2.6 || this.slideT > 1.15) this.endSlide();
  }
  endSlide() { if (this.sliding) { this.sliding = false; this.slideCD = 0.35; } }

  footstep(s) {
    const mat = this.groundBox ? (MATS[this.groundBox.mat] || MATS.sand).step : 'sand';
    const o = { vol: 1.1, ref: 2.5, roll: 1.4, maxDist: 32, rev: 0.05, src: this.id };
    if (this.isPlayer) { Sound.play('step_' + mat, { vol: 0.28 * (this.sprinting ? 1.2 : 1), rev: 0.05 }); this.game.emitSnd('step_' + mat, this.pos, o); }
    else this.game.playAt('step_' + mat, this.pos, o);
    this.game.noise(this, this.pos, this.sprinting ? 26 : 20);
  }
  sound(name, vol, refVol) {
    const o = { vol: refVol, ref: 2.5, roll: 1.4, maxDist: 30, src: this.id, pv: vol };
    if (this.isPlayer) { Sound.play(name, { vol }); this.game.emitSnd(name, this.pos, o); }
    else this.game.playAt(name, this.pos, o);
  }
  // 只给操作者自己听的 2D 提示音；远端玩家转发给对方
  sfx(name, vol, rate) {
    if (this.isPlayer) Sound.play(name, rate ? { vol, rate } : { vol });
    else if (this.remote) this.events.push({ t: 's2', n: name, v: vol, r: rate });
  }

  // ================= 联机（房主侧的远端玩家） =================
  // 位置 / 姿态照搬加入者本机模拟的结果，顺带补出跳跃、落地、滑铲的声音
  netApply(m) {
    const wasGround = this.onGround, wasSlide = this.sliding, vy = this._vy;
    this.pos.set(m.p[0], m.p[1], m.p[2]); this.vel.set(m.v[0], m.v[1], m.v[2]);
    this.yaw = wrapAngle(m.yw); this.pitch = clamp(m.pt, -89 * DEG, 89 * DEG);
    const f = m.f;
    this.ducked = !!(f & 1); this.sliding = !!(f & 2); this.onGround = !!(f & 4); this.sprinting = !!(f & 8); this.sprintRecover = f & 16 ? 0.05 : 0;
    this.duckAmt = clamp(m.da, 0, 1); this.slideAmt = clamp(m.sa, 0, 1); this.landInacc = Math.max(0, m.li || 0);
    if (wasGround && !this.onGround && this.vel.y > 1) this.sound('jump', 0.3, 0.5);
    if (!wasGround && this.onGround && -vy > 2) this.sound('land', clamp(-vy / 8, 0.2, 0.8), 0.6);
    if (this.sliding && !wasSlide) { this.sound('slidemove', 0.55, 0.8); this.game.noise(this, this.pos, 16); }
    this._vy = this.vel.y;
  }
  // 代替 simulate：只推进计时器和脚步声（机器人靠脚步声“听见”人）
  netSim(dt) {
    if (!this.alive) return;
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.velMod = Math.min(1, this.velMod + dt * 0.5);
    if (this.blind > 0) this.blind = Math.max(0, this.blind - dt);
    if (this.onGround && !this.sliding) {
      const s = this.hspeed();
      this.stepDist += s * dt;
      if (this.stepDist > (this.sprinting ? 2.4 : 2.0)) {
        this.stepDist = 0;
        if (s > this.def.speed * 0.6 && !this.ducked && !this.cmd.walk) {
          const h = this.game.world.raycast(this.pos.x, this.pos.y + 0.1, this.pos.z, 0, -1, 0, 0.5, this._rg || (this._rg = {}));
          this.groundBox = h ? h.box : null;
          this.footstep(s);
        }
      }
    }
  }

  // ================= 武器 =================
  inaccuracy() {
    const def = this.def;
    if (!def.inaccStand) return 0;
    let base;
    if (def.scope) base = this.scoped ? (this.ducked ? def.inaccCrouch : def.inaccScoped) + Math.max(0, 0.28 - this.zoomT) * 140 : def.inaccStand;
    else base = this.ducked && this.onGround ? def.inaccCrouch : def.inaccStand;
    const hs = this.hspeed(), ms = def.speed, acc = ms * PHYS.accurateFrac;
    let move = 0;
    if (hs > acc) move = def.inaccMove * clamp((hs - acc) / (ms * 0.95 - acc), 0, 1);
    if (this.sliding) move = Math.max(move, def.inaccMove * 0.85);
    let air = 0;
    if (!this.onGround) air = def.inaccJump * (0.3 + 0.7 * clamp(Math.abs(this.vel.y) / 4, 0, 1));
    return base + move + air + this.landInacc + this.fireInacc;
  }

  updateWeapon(dt) {
    if (!this.alive) return;
    const g = this.game, now = g.time, c = this.cmd;
    if (c.slotReq) { const s = c.slotReq; c.slotReq = null; if (s === 'last') this.quickSwitch(); else this.switchTo(s); }
    if (c.drop) { c.drop = false; g.dropActive(this); }
    const w = this.weapon; if (!w) return;
    const def = w.def;
    const rec = (this.ducked ? 0.85 : 1) * (def.recovery || 0.35);
    this.fireInacc *= Math.exp(-dt * 3 / rec);
    if (now - this.lastShot > (def.cycle || 0.1) * 1.25 + 0.02) this.recoilIdx = Math.max(0, this.recoilIdx - dt * (def.recoilRecover || 50));
    const pat = patternAt(def, this.recoilIdx);
    this.recoilP = damp(this.recoilP, pat[0], 30, dt);
    this.recoilY = damp(this.recoilY, pat[1], 30, dt);
    this.punchP = damp(this.punchP, 0, 13, dt); this.punchY = damp(this.punchY, 0, 13, dt);
    this.aimPunchP = damp(this.aimPunchP, 0, 9, dt); this.aimPunchY = damp(this.aimPunchY, 0, 9, dt);
    this.zoomT += dt;
    if (now < this.drawEnd) return;
    if (this.reloading && now >= this.reloadEnd) {
      const need = def.mag - w.mag, take = g.infiniteAmmo ? need : Math.min(need, w.reserve);
      w.mag += take; if (!g.infiniteAmmo) w.reserve -= take;
      this.reloading = false;
    }
    if (this.rezoom && now >= this.nextFire - 0.05 && !this.reloading) { this.scoped = this.rezoom; this.rezoom = 0; this.zoomT = 0; }
    const type = def.type;
    if (type === 'grenade') return this.updateNade(dt);
    if (type === 'c4') return this.updateC4(dt);
    if (type === 'knife') return this.updateKnife();
    if (c.inspect && !this.reloading && now >= this.nextFire) { c.inspect = false; this.events.push({ t: 'inspect' }); }
    if ((c.reload || (w.mag === 0 && c.attackPressed)) && !this.reloading && w.mag < def.mag && (w.reserve > 0 || g.infiniteAmmo)) this.startReload();
    if (c.attack2Pressed && def.scope && !this.reloading) {
      this.scoped = (this.scoped + 1) % 3; this.rezoom = 0; this.zoomT = 0;
      this.sfx('dry', 0.25, 1.6);
    }
    const canFire = !this.reloading && now >= this.nextFire && this.sprintRecover <= 0 && !this.sprinting && !g.noFire;
    const trigger = def.auto ? c.attack : c.attackPressed;
    if (trigger && canFire) {
      if (w.mag > 0) this.fire(now);
      else if (c.attackPressed) { this.sfx('dry', 0.5); this.nextFire = now + 0.2; }
    }
  }

  fire(now) {
    const w = this.weapon, def = w.def, g = this.game;
    w.mag--;
    this.nextFire = now + def.cycle;
    this.lastShot = now;
    const inacc = this.inaccuracy() / 1000;
    const a1 = Math.random() * Math.PI * 2, r1 = Math.random() * inacc;
    const a2 = Math.random() * Math.PI * 2, r2 = Math.random() * (def.spread / 1000);
    const sx = Math.cos(a1) * r1 + Math.cos(a2) * r2, sy = Math.sin(a1) * r1 + Math.sin(a2) * r2;
    const pat = patternAt(def, this.recoilIdx);
    const jit = this.recoilIdx > 1 ? 0.1 : 0;
    const bp = this.pitch + (pat[0] + rand(-jit, jit) * 0.5 + this.aimPunchP) * DEG;
    const by = this.yaw - (pat[1] + rand(-jit, jit) - this.aimPunchY) * DEG;
    const dir = dirFromAngles(by, bp, this._t.a);
    const cyw = Math.cos(by), syw = Math.sin(by), sp = Math.sin(bp), cp = Math.cos(bp);
    dir.x += cyw * sx + syw * sp * sy; dir.y += cp * sy; dir.z += -syw * sx + cyw * sp * sy;
    dir.normalize();
    this.recoilIdx += 1;
    this.fireInacc = Math.min(this.fireInacc + def.inaccFire, def.inaccFire * 12);
    this.punchP += def.viewKick[0] * rand(0.85, 1.1);
    this.punchY += rand(-1, 1) * def.viewKick[1];
    if (def.scope && this.scoped) { this.rezoom = this.scoped; this.scoped = 0; }
    const eye = this.eyePos(this._t.b);
    if (g.net && g.net.host) g.net.emit({ t: 'shot', a: this.id, o: nv(eye), d: nv(dir), w: def.id });
    // 远端玩家开枪：按对方屏幕上看到的位置判定（延迟补偿）
    if (this.remote && g.net) g.net.rewind(this, () => g.fireBullet(this, eye, dir, def));
    else g.fireBullet(this, eye, dir, def);
    g.weaponFired(this, def);
    this.events.push({ t: 'fire', id: def.id, empty: w.mag === 0 });
  }

  startReload() {
    const def = this.def;
    this.reloading = true;
    this.reloadEnd = this.game.time + def.reload;
    this.scoped = 0; this.rezoom = 0;
    this.events.push({ t: 'reload', dur: def.reload, empty: this.weapon.mag === 0, id: def.id });
    const mo = { vol: 0.6, ref: 2, roll: 1.5, delay: def.reload * 0.2, maxDist: 20, src: this.id }, mi = Object.assign({}, mo, { delay: def.reload * 0.62 });
    if (!this.isPlayer) { this.game.playAt('magout', this.pos, mo); this.game.playAt('magin', this.pos, mi); }
    else { this.game.emitSnd('magout', this.pos, mo); this.game.emitSnd('magin', this.pos, mi); }
    this.game.noise(this, this.pos, 10);
  }

  updateKnife() {
    const c = this.cmd, now = this.game.time;
    if (c.inspect && now >= this.nextFire) { c.inspect = false; this.events.push({ t: 'inspect' }); }
    if (now < this.nextFire || this.game.noFire) return;
    if (c.attack) {
      const combo = now - this.lastShot < 0.8;
      this.knifeAttack(false, combo);
      this.nextFire = now + (combo ? 0.5 : 0.4);
    } else if (c.attack2) { this.knifeAttack(true, false); this.nextFire = now + 1.0; }
  }
  knifeAttack(heavy, combo) {
    const g = this.game;
    this.lastShot = g.time;
    this.knifeCombo = combo ? this.knifeCombo + 1 : 0;
    this.events.push({ t: heavy ? 'stab' : 'slash', n: this.knifeCombo });
    this.sound('knife_swing', 0.5, 0.6);
    const delay = heavy ? 0.18 : 0.08;
    g.later(delay, () => { if (this.alive) g.knifeHit(this, heavy, combo); });
  }

  updateNade(dt) {
    const c = this.cmd, now = this.game.time;
    if (this.throwAt) {
      if (now >= this.throwAt) { this.throwAt = 0; this.throwNade(); }
      return;
    }
    if (this.game.noFire) return;
    if ((c.attack || c.attack2) && !this.nadeHold) {
      this.nadeHold = c.attack ? 1 : 2; this.pinTime = now;
      this.events.push({ t: 'pin' });
      this.sfx('pin', 0.5);
    }
    if (this.nadeHold) {
      if (c.attack && c.attack2) this.nadeHold = 3;
      if (!c.attack && !c.attack2 && now - this.pinTime > 0.3) {
        this.throwStrength = this.nadeHold === 1 ? 1 : this.nadeHold === 3 ? 0.62 : 0.34;
        this.throwAt = now + 0.12; this.nadeHold = 0;
        this.events.push({ t: 'throw' });
        this.sound('throw', 0.4, 0.5);
      }
    }
  }
  throwNade() {
    const g = this.game, id = this.weapon.id;
    let pdeg = -this.pitch / DEG;
    pdeg = pdeg < 0 ? -10 + pdeg * (80 / 90) : -10 + pdeg * (100 / 90);
    const ang = -pdeg * DEG;
    const dir = dirFromAngles(this.yaw, ang, new THREE.Vector3());
    const spd = clamp(750 * 0.9 * this.throwStrength, 15, 750) * U;
    const eye = this.eyePos(new THREE.Vector3());
    const src = eye.clone().addScaledVector(dir, 0.35);
    if (g.world.pointSolid(src.x, src.y, src.z)) src.copy(eye);
    const vel = dir.multiplyScalar(spd).addScaledVector(this.vel, 1.25);
    g.spawnGrenade(id, src, vel, this);
    this.inv.nades[id] = Math.max(0, this.inv.nades[id] - 1);
    g.later(0.35, () => {
      if (!this.alive) return;
      if (this.inv.nades[id] > 0) { this.weapon = null; this.switchTo('nade'); }
      else if (!this.switchTo(this.lastSlot !== 'nade' ? this.lastSlot : this.bestSlot())) this.switchTo(this.bestSlot());
    });
  }

  updateC4(dt) {
    const c = this.cmd, g = this.game;
    const site = g.map.inSite(this.pos);
    const want = (c.attack || c.use) && this.onGround && site && g.mode.canPlant && g.mode.canPlant(this);
    if (want) {
      if (!this.planting) { this.planting = true; this.plantT = 0; this.events.push({ t: 'plant' }); }
      const before = this.plantT;
      this.plantT += dt;
      if (Math.floor(before * 2.5) !== Math.floor(this.plantT * 2.5)) this.sound('keypad', 0.4, 0.5);
      if (this.plantT >= 3.2) {
        this.planting = false;
        g.mode.plantBomb(this, site);
        this.inv.c4 = false; this.weapon = null;
        this.switchTo(this.bestSlot(), true);
      }
    } else if (this.planting) { this.planting = false; this.plantT = 0; this.events.push({ t: 'plantcancel' }); }
  }
}
