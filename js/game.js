'use strict';
// ======================================================================
//  game.js —— 对局：子弹（穿透/命中盒/距离衰减/护甲）、伤害与击杀、
//              投掷物、掉落物、观战、模式（爆破/死斗/靶场）、经济
// ======================================================================
const GROUP_MULT = { head: 4, chest: 1, stomach: 1.25, arm: 1, leg: 0.75 };
const _ginv = new THREE.Matrix4(), _glo = new THREE.Vector3(), _gld = new THREE.Vector3();
const _g1 = new THREE.Vector3(), _g2 = new THREE.Vector3(), _g3 = new THREE.Vector3(), _g4 = new THREE.Vector3();
const _gq = new THREE.Quaternion();
// 射线-椭球求交（骨骼局部空间；头部用椭球，贴合模型，不再是偏大的方盒）
function rayEllipsoid(e, o, d) {
  const ox = (o.x - e.c.x) / e.r.x, oy = (o.y - e.c.y) / e.r.y, oz = (o.z - e.c.z) / e.r.z;
  const dx = d.x / e.r.x, dy = d.y / e.r.y, dz = d.z / e.r.z;
  const A = dx * dx + dy * dy + dz * dz, B = ox * dx + oy * dy + oz * dz, C = ox * ox + oy * oy + oz * oz - 1;
  const disc = B * B - A * C;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = (-B - sq) / A;
  if (t < 0) t = (-B + sq) / A;
  return t < 0 ? Infinity : t;
}
const hToV = (h) => 2 * Math.atan(Math.tan(h * 0.5 * DEG) * 0.75) / DEG;

class Game {
  constructor(eng, opts) {
    this.eng = eng; this.opts = opts;
    this.scene = eng.scene; this.world = eng.world; this.map = eng.map; this.nav = eng.nav; this.camera = eng.camera; this.vm = eng.vm;
    this.time = 0; this.actors = []; this.timers = []; this.grenades = []; this.drops = []; this.ragdolls = [];
    this.frozen = false; this.noFire = false; this.infiniteAmmo = false;
    this.shake = 0; this.flashAmt = 0; this.flashHold = 0; this.dmgFlash = 0; this.heartT = 0;
    this.fps = 60; this.spectating = false; this.viewTarget = null; this.deathT = 0; this.over = false; this.overT = 0;
    this.spotT = 0; this.crouchToggle = false; this.killer = null;
    this._rh = {};
    // 联机：net = NetHost（房主，权威对局）或 NetClient（加入者，照快照显示）
    this.net = opts.net || null; this.client = !!(this.net && this.net.client);
    const M = this.client ? ModeMirror : { tdm: ModeTDM, comp: ModeComp, range: ModeRange }[opts.mode];
    this.mode = new M(this, opts.mode);
    this.player = this.createActor(opts.team, false, opts.name || '你');
    this.vm.setTeam(opts.team);
    if (this.net) this.net.attach(this);
    if (!this.client) for (const h of opts.humans || []) this.createActor(h.team, false, h.name, h);
    if (!this.client) this.mode.setup();
    this.camera.layers.set(0);
  }

  // ---------------- 角色 ----------------
  createActor(team, isBot, name, remote) {
    const a = new Actor(this, { name, team, isBot, isPlayer: !isBot && !remote, remote: !!remote, pid: remote && remote.pid, knife: remote && remote.knife });
    a.model = new Models.Humanoid(team);
    if (!isBot && !remote) { a.model.layer = 1; a.model.root.traverse((o) => o.layers.set(1)); }
    a.model.root.visible = false;
    this.scene.add(a.model.root);
    if (isBot) a.brain = new BotBrain(a, this, this.opts.diff);
    this.actors.push(a);
    return a;
  }
  humans(team) { return this.actors.filter((a) => a.team === team && !a.isBot).length; }
  // 房主：对局中途有人加入 / 离开
  addRemote(h) {
    const a = this.createActor(h.team, false, h.name, h), md = this.mode;
    if (md.id === 'tdm') { md.loadout(a); md.spawn(a); }
    else { a.money = 800; a.stripForNewGame(); a.alive = false; }   // 爆破：下一回合出生
    return a;
  }
  removeRemote(pid) { const a = this.actors.find((x) => x.remote && x.pid === pid); if (a) this.removeActor(a); }
  removeActor(a) {
    if (a.alive && a.inv.c4 && this.mode.dropBomb) { a.inv.c4 = false; this.mode.dropBomb(a); }
    a.alive = false;
    if (a.model) { if (a.model.ragdoll) { a.model.ragdoll.dispose(); this.ragdolls = this.ragdolls.filter((r) => r !== a.model.ragdoll); } else this.scene.remove(a.model.root); }
    this.actors = this.actors.filter((x) => x !== a);
    for (const o of this.actors) if (o.brain && o.brain.target === a) o.brain.target = null;
    if (this.viewTarget === a) this.viewTarget = null;
    if (this.net && this.net.host) this.net.rosterDirty = true;
  }
  // 加入者：按房主名单建出的镜像角色（不跑 AI、不跑物理）
  createMirror(r) {
    const a = new Actor(this, { name: r.name, team: r.team, isBot: !!r.bot, isPlayer: false });
    a.mirror = true;
    a.model = new Models.Humanoid(r.team);
    a.model.root.visible = false;
    this.scene.add(a.model.root);
    this.actors.push(a);
    return a;
  }

  // ---------------- 联机广播（只有房主发） ----------------
  emit(ev) { if (this.net && this.net.host) this.net.emit(ev); }
  emitSnd(name, pos, o) {
    if (!(this.net && this.net.host)) return;
    const oo = Object.assign({}, o); delete oo.src; delete oo.net;
    this.net.emit({ t: 'snd', n: name, p: nv(pos), o: oo, s: o.src });
  }
  // 本机播放并同步给所有人的特效
  fx(name, ...args) { Effects[name](...args); this.emit({ t: 'fx', f: name, a: args.map(fxEnc) }); }
  // 按每个玩家的视角各说各的：spec 为参数数组，或 (角色) => 参数数组 / null
  center(spec) {
    const f = typeof spec === 'function' ? spec : () => spec;
    const mine = f(this.player); if (mine) HUD.center(...mine);
    if (this.net && this.net.host) for (const a of this.actors) if (a.remote) { const r = f(a); if (r) this.net.tell(a, { t: 'ctr', a: r }); }
  }
  sound2d(spec) {
    const f = typeof spec === 'function' ? spec : () => spec;
    for (const a of this.actors) if (a.isPlayer || a.remote) { const r = f(a); if (r) a.sfx(r[0], r[1]); }
  }
  openBuyAll() {
    HUD.openBuy(this);
    if (this.net && this.net.host) for (const a of this.actors) if (a.remote) this.net.tell(a, { t: 'ob' });
  }
  resetModel(a, force) {
    const h = a.model;
    if (force || h.ragdoll || h.hips.parent !== h.root) {
      // 尸体（布娃娃）留在场景里，由数量上限回收；角色换新模型
      if (h.ragdoll) { if (force) { h.ragdoll.dispose(); this.ragdolls = this.ragdolls.filter((r) => r !== h.ragdoll); } }
      else this.scene.remove(h.root);
      const nh = new Models.Humanoid(a.team);
      if (h.layer) { nh.layer = h.layer; nh.root.traverse((o) => o.layers.set(h.layer)); }
      a.model = nh; this.scene.add(nh.root);
      if (a.weapon) nh.setWeapon(a.weapon.id);
    }
    a.model.root.visible = true;
    a.model.gunMount.visible = true;
  }
  botName(team, i) { const l = BOT_NAMES[team]; return 'BOT ' + l[i % l.length]; }

  later(dt, fn) { this.timers.push({ t: this.time + dt, fn }); }
  aimPoint(a, part, out = new THREE.Vector3()) {
    const h = a.model;
    if (h && !h.ragdoll && h.root.visible) {
      if (part === 'head') return out.set(0, 0.1, -0.01).applyMatrix4(h.head.matrixWorld);
      return out.set(0, part === 'body' ? 0.2 : 0.3, 0).applyMatrix4(h.spine.matrixWorld);
    }
    return out.set(a.pos.x, a.pos.y + (part === 'head' ? a.eyeHeight() + 0.05 : a.eyeHeight() * 0.72), a.pos.z);
  }
  visible(a, b) { return this.world.clear(a.x, a.y, a.z, b.x, b.y, b.z) && !Effects.smokeBlocks(a, b); }
  teammateInLine(a, eye, p) {
    const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z, L = Math.hypot(dx, dy, dz);
    for (const o of this.actors) {
      if (o === a || !o.alive || o.team !== a.team) continue;
      const t = slab(o.pos.x - 0.35, o.pos.y, o.pos.z - 0.35, o.pos.x + 0.35, o.pos.y + o.hullH(), o.pos.z + 0.35, eye.x, eye.y, eye.z, dx / L, dy / L, dz / L);
      if (t !== Infinity && t < L) return true;
    }
    return false;
  }
  noise(src, pos, radius) {
    for (const a of this.actors) {
      if (!a.brain || !a.alive || a.team === src.team) continue;
      const d = a.pos.distanceTo(pos);
      if (d < radius * a.brain.d.hear) a.brain.hear(pos);
    }
  }
  randomGoal(a) {
    const pts = Object.values(this.map.points);
    if (Math.random() < 0.5) {
      const en = this.actors.filter((o) => o.alive && o.team !== a.team);
      if (en.length) { const e = pick(en); return e.pos.clone().add(_g1.set(rand(-6, 6), 0, rand(-6, 6))); }
    }
    return pick(pts).clone();
  }

  // ---------------- 声音 ----------------
  playAt(name, pos, o = {}) {
    // 房主默认把定位音同步给所有人；加入者自己会模拟出来的（枪声/弹着/手雷）标 net:false
    if (o.net !== false) this.emitSnd(name, pos, o);
    const cam = this.camera.position;
    const d = cam.distanceTo(pos);
    if (o.maxDist && d > o.maxDist) return;
    let vol = o.vol == null ? 1 : o.vol;
    let lp = 20000 * Math.exp(-d / 38);
    if (d > 2.5 && !this.world.clear(cam.x, cam.y, cam.z, pos.x, pos.y + 0.3, pos.z)) { lp = Math.min(lp, 1100); vol *= 0.6; }
    Sound.play(name, { pos, vol, ref: o.ref || 3, roll: o.roll || 1, lp: Math.max(lp, 650), delay: (o.delay || 0) + d / 343, dist: d, rev: o.rev });
  }

  // ---------------- 射击 ----------------
  rayActors(ox, oy, oz, d, maxT, exclude) {
    let best = null, bt = maxT;
    for (const a of this.actors) {
      if (!a.alive || exclude.has(a)) continue;
      const p = a.pos;
      const t0 = slab(p.x - 0.7, p.y - 0.2, p.z - 0.7, p.x + 0.7, p.y + 2.1, p.z + 0.7, ox, oy, oz, d.x, d.y, d.z);
      if (t0 === Infinity || t0 > bt) continue;
      for (const hb of a.model.hitboxes) {
        _ginv.copy(hb.bone.matrixWorld).invert();
        _glo.set(ox, oy, oz).applyMatrix4(_ginv);
        _gld.set(ox + d.x, oy + d.y, oz + d.z).applyMatrix4(_ginv).sub(_glo);
        const t = hb.ell ? rayEllipsoid(hb.ell, _glo, _gld) : slab(hb.min.x, hb.min.y, hb.min.z, hb.max.x, hb.max.y, hb.max.z, _glo.x, _glo.y, _glo.z, _gld.x, _gld.y, _gld.z);
        if (t !== Infinity && t >= 0 && t < bt) { bt = t; best = { actor: a, t, group: hb.group }; }
      }
    }
    return best;
  }
  fireBullet(sh, o, d, def) {
    let dmg = def.damage, traveled = 0, pens = 0, wall = false;
    let ox = o.x, oy = o.y, oz = o.z;
    const maxRange = 220, exclude = new Set([sh]);
    let tracerEnd = null, hitSomeone = false;
    for (let iter = 0; iter < 6; iter++) {
      const remaining = maxRange - traveled;
      if (remaining <= 0) break;
      const wh = this.world.raycast(ox, oy, oz, d.x, d.y, d.z, remaining, this._rh);
      const segEnd = wh ? wh.t : remaining;
      const whT = segEnd, whBox = wh ? wh.box : null, nx = wh ? wh.nx : 0, ny = wh ? wh.ny : 0, nz = wh ? wh.nz : 0;
      const ah = this.rayActors(ox, oy, oz, d, segEnd, exclude);
      if (ah) {
        const dist = traveled + ah.t;
        let damage = dmg * Math.pow(def.rangeMod || 1, (dist / U) / 500) * GROUP_MULT[ah.group];
        const pt = _g1.set(ox + d.x * ah.t, oy + d.y * ah.t, oz + d.z * ah.t);
        if (!tracerEnd) tracerEnd = pt.clone();
        const v = ah.actor;
        const friendly = v.team === sh.team;
        if ((!friendly || this.opts.ff) && !(v.isPlayer && v.alive)) {
          Effects.blood(pt, d, ah.group === 'head');
          this.playAt('imp_flesh', pt, { vol: 0.7, ref: 2, maxDist: 35, rev: 0, net: false });
        }
        this.applyDamage(v, sh, damage, ah.group, def, d, pt, wall);
        hitSomeone = true;
        exclude.add(v);
        dmg *= 0.55;
        traveled += ah.t + 0.05; ox = pt.x + d.x * 0.05; oy = pt.y + d.y * 0.05; oz = pt.z + d.z * 0.05;
        if (dmg < 5) break;
        continue;
      }
      if (!wh) { if (!tracerEnd) tracerEnd = _g2.set(ox + d.x * remaining, oy + d.y * remaining, oz + d.z * remaining).clone(); break; }
      const hp = _g2.set(ox + d.x * whT, oy + d.y * whT, oz + d.z * whT);
      const n = _g3.set(nx, ny, nz);
      Effects.impact(hp, n, whBox.mat, d, whBox.noDecal);
      if (!tracerEnd) tracerEnd = hp.clone();
      const mat = MATS[whBox.mat] || MATS.stone;
      if (hp.distanceToSquared(this.camera.position) < 900) {
        this.playAt(mat.snd, hp, { vol: 0.5, ref: 1.5, maxDist: 30, rev: 0, net: false });
        if (mat.fx !== 'sand' && Math.random() < 0.12) this.playAt('ricochet', hp, { vol: 0.35, ref: 2, maxDist: 30, net: false });
      }
      // 穿透
      const maxThick = (def.pen || 0) * mat.pen;
      if (pens >= 3 || maxThick < 0.01) break;
      let thick = this.world.exitT(whBox, ox, oy, oz, d.x, d.y, d.z) - whT;
      let px = hp.x + d.x * thick, py = hp.y + d.y * thick, pz = hp.z + d.z * thick;
      for (let k = 0; k < 4 && thick <= maxThick; k++) {
        const b2 = this.world.pointSolid(px + d.x * 0.003, py + d.y * 0.003, pz + d.z * 0.003);
        if (!b2) break;
        const t2 = this.world.exitT(b2, px, py, pz, d.x, d.y, d.z);
        thick += t2; px += d.x * t2; py += d.y * t2; pz += d.z * t2;
      }
      if (thick > maxThick) break;
      dmg *= mat.dmg * (1 - 0.45 * thick / maxThick);
      if (dmg < 3) break;
      Effects.impact(_g4.set(px, py, pz), _g3.set(-nx, -ny, -nz), whBox.mat, d, whBox.noDecal);
      wall = true; pens++;
      traveled += whT + thick + 0.01;
      ox = px + d.x * 0.01; oy = py + d.y * 0.01; oz = pz + d.z * 0.01;
    }
    if (!tracerEnd) tracerEnd = new THREE.Vector3(o.x + d.x * 100, o.y + d.y * 100, o.z + d.z * 100);
    // 曳光
    if (def.tracer) {
      let start;
      if (sh.isPlayer) start = this.vm.muzzleWorld(_g4).add(this.camera.position).clone();
      else start = sh.model.weapon ? sh.model.weapon.muzzle.getWorldPosition(new THREE.Vector3()) : o.clone();
      if (start.distanceTo(tracerEnd) > 3) Effects.tracer(start, tracerEnd);
    }
    // 近失呼啸
    const P = this.player;
    if (sh !== P && P.alive && !hitSomeone) {
      const eye = P.eyePos(_g4);
      const L = o.distanceTo(tracerEnd);
      const t = clamp((eye.x - o.x) * d.x + (eye.y - o.y) * d.y + (eye.z - o.z) * d.z, 0, L);
      const cx = o.x + d.x * t, cy = o.y + d.y * t, cz = o.z + d.z * t;
      const dd = Math.hypot(cx - eye.x, cy - eye.y, cz - eye.z);
      if (dd < 1.4 && t > 3) Sound.play('whiz', { pos: _g1.set(cx, cy, cz), vol: (1.4 - dd) * 0.8, ref: 1, rev: 0 });
    }
  }

  weaponFired(a, def) {
    const cam = this.camera;
    if (a.isPlayer) {
      Sound.play('shot_' + def.sound, { vol: def.vol * 0.62, rev: 0.32 });
      const m = this.vm.muzzleWorld(_g1).add(cam.position);
      if (!def.suppressed) Effects.light(m, 2.4, 0.06);
      const r = _g2.set(1, 0, 0).applyQuaternion(cam.quaternion), u = _g3.set(0, 1, 0).applyQuaternion(cam.quaternion), f = _g4.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const ej = cam.position.clone().addScaledVector(r, 0.1).addScaledVector(u, -0.09).addScaledVector(f, 0.32);
      const vel = new THREE.Vector3().addScaledVector(r, rand(1.6, 2.6)).addScaledVector(u, rand(1.0, 2.0)).addScaledVector(f, rand(-0.4, 0.2)).add(a.vel);
      Effects.shell(ej, vel, def.type === 'sniper');
    } else {
      const m = a.model.weapon ? a.model.weapon.muzzle.getWorldPosition(_g1) : a.eyePos(_g1);
      this.playAt('shot_' + def.sound, m, { vol: def.vol * 1.3, ref: def.suppressed ? 2.5 : 6, roll: 0.9, rev: 0.4, net: false });
      if (!def.suppressed) {
        Effects.muzzle(m, def.type === 'sniper' ? 1.6 : def.type === 'pistol' ? 0.7 : 1);
        if (m.distanceTo(cam.position) < 35) Effects.light(m, 1.8, 0.05);
      }
      if (m.distanceTo(cam.position) < 18) {
        const f = a.forward(_g2), r = _g3.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
        Effects.shell(m.clone().addScaledVector(f, -0.45), new THREE.Vector3().addScaledVector(r, rand(1.5, 2.5)).add(_g4.set(0, rand(1, 2), 0)).add(a.vel), def.type === 'sniper');
      }
      if (def.type === 'sniper') this.playAt('awpbolt', a.pos, { vol: 0.5, ref: 2, delay: 0.35, maxDist: 25, net: false });
    }
    this.noise(a, a.pos, def.suppressed ? 12 : 75);
  }

  knifeHit(a, heavy, combo) {
    const eye = a.eyePos(new THREE.Vector3());
    const range = heavy ? 1.3 : 1.55;
    const offs = [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.1], [0, -0.12]];
    let best = null;
    for (const [oy, op] of offs) {
      const d = dirFromAngles(a.yaw + oy, a.pitch + op, new THREE.Vector3());
      const wh = this.world.raycast(eye.x, eye.y, eye.z, d.x, d.y, d.z, range, {});
      const lim = wh ? wh.t : range;
      const ah = this.rayActors(eye.x, eye.y, eye.z, d, lim, new Set([a]));
      if (ah && (!best || !best.actor || ah.t < best.t)) best = { actor: ah.actor, t: ah.t, group: ah.group, d };
      else if (!ah && wh && !best) best = { wall: wh, t: wh.t, d, box: wh.box, n: new THREE.Vector3(wh.nx, wh.ny, wh.nz) };
    }
    if (!best) return;
    if (best.actor) {
      const v = best.actor;
      const af = _g1.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw)), vf = _g2.set(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
      const back = af.dot(vf) > 0.5;
      const dmg = heavy ? (back ? 180 : 65) : (back ? 90 : combo ? 25 : 40);
      const pt = eye.clone().addScaledVector(best.d, best.t);
      this.applyDamage(v, a, dmg, back ? 'chest' : best.group === 'head' ? 'chest' : best.group, a.def.type === 'knife' ? a.def : WEAPONS.knife, best.d, pt, false, true);
      this.fx('blood', pt, best.d, heavy);
      this.playAt('knife_flesh', pt, { vol: 0.8, ref: 2 });
    } else if (best.wall) {
      const pt = eye.clone().addScaledVector(best.d, best.t);
      this.fx('impact', pt, best.n, best.box.mat, best.d, best.box.noDecal);
      this.playAt('knife_wall', pt, { vol: 0.7, ref: 2 });
    }
  }

  // ---------------- 伤害 / 击杀 ----------------
  applyDamage(v, att, dmg, group, def, dir, point, wall, melee) {
    // 加入者不结算伤害：只把自己的坠落伤害报给房主
    if (this.client) { if (v === this.player && group === 'fall' && v.alive) this.net.send({ t: 'fall', d: dmg }); return; }
    if (!v.alive || this.over) return;
    const ff = this.opts.ff;
    if (att && att !== v && att.team === v.team && !ff) return;
    if (v.spawnProtect > 0 && group !== 'fall') return;
    let d = dmg;
    const armored = def && v.armor > 0 && group !== 'leg' && group !== 'fall' && (group !== 'head' || v.helmet);
    if (armored) {
      let toH = d * (def.armorPen || 0.5), toA = (d - toH) * 0.5;
      if (toA > v.armor) { toA = v.armor; toH = d - toA * 2; }
      v.armor = Math.max(0, v.armor - toA); d = toH;
    }
    d = Math.max(1, Math.floor(d));
    v.hp -= d;
    if (att && att !== v) { v.damageBy.set(att, (v.damageBy.get(att) || 0) + d); v.lastAttacker = att; }
    v.lastHitTime = this.time;
    if (def && def.type !== 'knife' && group !== 'fall') v.velMod = Math.min(v.velMod, group === 'leg' ? 0.62 : 0.5);
    if (v.isPlayer || v.remote) {
      v.aimPunchP += (armored ? 1.0 : 2.6) * rand(0.6, 1.1) * (def && def.type === 'sniper' ? 2 : 1);
      v.aimPunchY += rand(-1, 1) * 1.3;
    }
    if (this.net) this.emit({ t: 'dmg', v: v.id, k: att ? att.id : 0, d, g: group, ar: armored ? 1 : 0, e: att && att !== v && v.team !== att.team ? 1 : 0, kl: v.hp <= 0 ? 1 : 0 });
    if (v.isPlayer) {
      this.dmgFlash = Math.min(1, this.dmgFlash + d / 60 + 0.25);
      Sound.play('hurt', { vol: 0.55 });
      if (att && att !== v) {
        const dx = att.pos.x - v.pos.x, dz = att.pos.z - v.pos.z;
        HUD.damageFrom(-wrapAngle(yawOf(dx, dz) - v.yaw));
      }
      if (group === 'head') Sound.play(v.helmet && armored ? 'hs_helmet' : 'hs_flesh', { vol: 0.4 });
    }
    if (att && att.isPlayer && att !== v && v.team !== att.team) {
      if (group === 'head') Sound.play(armored ? 'hs_helmet' : 'hs_flesh', { vol: 0.75 });
      else Sound.play('hit_body', { vol: 0.5 });
      HUD.hitmarker(v.hp <= 0);
    }
    if (v.brain) v.brain.onDamaged(att);
    if (v.hp <= 0) this.kill(v, att, def, group === 'head', dir, wall, group, melee);
  }

  kill(v, att, def, hs, dir, wall, group) {
    v.alive = false; v.hp = 0; v.deaths++;
    v.sliding = false; v.planting = false; v.defusing = false; v.scoped = 0; v.reloading = false;
    const md = this.mode;
    if (att && att !== v) {
      if (att.team !== v.team) {
        att.kills++; att.roundKills++;
        if (!md.infiniteMoney) { const rw = (def && def.killReward) || 300; att.money = Math.min(16000, att.money + rw); if (att.isPlayer) HUD.moneyFlash(); }
      } else att.kills--;
    }
    for (const [o, dd] of v.damageBy) if (o !== att && dd >= 41 && o.team !== v.team) o.assists++;
    HUD.killfeed({ killer: att && att !== v ? att : null, victim: v, weapon: def ? def.name : '坠落', hs, wallbang: wall, mine: (att && att.isPlayer) || v.isPlayer });
    if (att && att.isPlayer && att !== v) Sound.play('kill', { vol: 0.35 });
    // 先广播：加入者要在武器掉落之前用同一个姿态生成布娃娃
    if (this.net) this.emit({ t: 'kill', v: v.id, k: att ? att.id : 0, w: def ? def.name : '坠落', hs: hs ? 1 : 0, wb: wall ? 1 : 0, dir: dir ? nv(dir) : null, g: group });
    // 掉落
    if (v.inv.primary) v.lastPrimary = v.inv.primary.id;
    const drop = v.inv.primary || v.inv.secondary;
    if (drop && md.id !== 'range') { this.dropWeapon(v, drop); if (drop === v.inv.primary) v.inv.primary = null; else v.inv.secondary = null; }
    if (v.inv.c4) { v.inv.c4 = false; md.dropBomb && md.dropBomb(v); }
    this.makeRagdoll(v, dir, group, hs);
    if (v.brain) v.brain.reset();
    if (v.isPlayer) this.playerDied(att && att !== v ? att : null, def ? def.name : '', hs, wall);
    md.onKill(v, att, hs);
  }
  // 布娃娃（房主和加入者共用）
  makeRagdoll(v, dir, group, hs) {
    const h = v.model;
    if (!h || h.ragdoll) return;
    const imp = (dir ? dir.clone() : new THREE.Vector3()).multiplyScalar(group === 'head' ? 4.2 : 3.0 + Math.random()).add(_g1.set(0, 0.8, 0));
    if (group === 'fall') imp.set(0, 0, 0);
    h.root.visible = true;
    h.ragdoll = new Ragdoll(h, this.scene, this.world, v.vel, imp, group);
    this.ragdolls.push(h.ragdoll);
    if (this.ragdolls.length > 14) { const r = this.ragdolls.shift(); r.dispose(); }
    if (hs || Math.random() < 0.4) this.later(1.2, () => { if (!v.alive && h.ragdoll) Effects.bloodPool(h.ragdoll.p[1]); });
  }
  // 本机玩家阵亡：死亡视角 + 提示
  playerDied(killer, wname, hs, wall) {
    const v = this.player;
    this.deathT = 0; this.killer = killer;
    // 死亡视角：从自己眼睛位置拉到尸体后上方，鼠标可自由环绕（不再自动锁定击杀者）
    this.deathYaw = v.yaw; this.deathPitch = -0.42; this.deathEye = v.eyePos(new THREE.Vector3()); this.deathQuat = this.camera.quaternion.clone();
    const kd = killer ? `被 <span class="c${killer.team}">${killer.name}</span> 使用 ${wname} 击杀${hs ? '（爆头）' : ''}${wall ? '（穿墙）' : ''}` : '你阵亡了';
    HUD.showDeath(kd, killer ? `对方剩余生命 ${Math.max(0, killer.hp)}` : '');
    Sound.stopAll();
  }

  // ---------------- 掉落物 ----------------
  dropWeapon(a, inst, isC4) {
    const mdl = Models.thirdPerson(isC4 ? 'c4' : inst.id);
    this.scene.add(mdl.group);
    const eye = a.eyePos(new THREE.Vector3()), f = a.forward(new THREE.Vector3());
    const d = { inst, c4: !!isC4, mesh: mdl.group, pos: eye.clone().addScaledVector(f, 0.35).add(_g1.set(0, -0.35, 0)),
      vel: f.multiplyScalar(a.alive ? 4.2 : 0.8).add(a.vel), ry: Math.random() * 6.28, spin: rand(4, 9), rest: false, t: 0, owner: a };
    if (this.world.pointSolid(d.pos.x, d.pos.y, d.pos.z)) d.pos.copy(a.pos).add(_g1.set(0, 0.5, 0));
    d.nid = this._dropSeq = (this._dropSeq || 0) + 1;
    this.drops.push(d);
    this.emit({ t: 'drop', n: d.nid, w: isC4 ? 'c4' : inst.id, c4: isC4 ? 1 : 0, p: nv(d.pos), v: nv(d.vel), ry: r3(d.ry), sp: r3(d.spin) });
    if (this.drops.length > 22) { const i = this.drops.findIndex((x) => !x.c4); if (i >= 0) this.removeDrop(i); }
    return d;
  }
  dropActive(a) {
    if (!a.alive) return;
    if (a.slot === 'primary' && a.inv.primary) { this.dropWeapon(a, a.inv.primary); a.inv.primary = null; }
    else if (a.slot === 'secondary' && a.inv.secondary) { this.dropWeapon(a, a.inv.secondary); a.inv.secondary = null; }
    else if (a.slot === 'c4' && a.inv.c4) { a.inv.c4 = false; this.mode.dropBomb && this.mode.dropBomb(a, true); }
    else return;
    a.weapon = null; a.switchTo(a.bestSlot());
  }
  updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      if (!d.rest) {
        d.vel.y -= 15 * dt;
        d.pos.addScaledVector(d.vel, dt);
        const top = this.world.surfaceTop(d.pos.x, d.pos.z, d.pos.y + 0.4);
        if (d.pos.y < top + 0.04) { d.pos.y = top + 0.04; d.vel.set(0, 0, 0); d.rest = true; }
        if (this.world.pointSolid(d.pos.x, d.pos.y, d.pos.z)) { d.vel.x *= -0.3; d.vel.z *= -0.3; d.pos.addScaledVector(d.vel, dt * 3); }
        d.ry += d.spin * dt;
      }
      d.mesh.position.copy(d.pos);
      d.mesh.rotation.set(0, d.ry, d.rest ? Math.PI / 2 : d.t * 6, 'YXZ');
      if (d.c4) d.mesh.rotation.set(0, d.ry, 0);
    }
    // 拾取（只在房主 / 单机结算）
    if (this.client) return;
    for (const a of this.actors) {
      if (!a.alive || a.mirror) continue;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        if (d.owner === a && d.t < 2.5) continue;
        const dx = d.pos.x - a.pos.x, dz = d.pos.z - a.pos.z;
        if (dx * dx + dz * dz > 1.1 || Math.abs(d.pos.y - a.pos.y - 0.3) > 1.2) continue;
        if (d.c4) {
          if (a.team === 'T' && this.mode.pickupBomb) { this.mode.pickupBomb(a); this.removeDrop(i); }
          continue;
        }
        const def = d.inst.def, has = def.slot === 1 ? a.inv.primary : a.inv.secondary;
        if (!has) { this.take(a, d, i); continue; }
        if ((a.isPlayer || a.remote) && a.cmd.usePressed) {
          const cur = def.slot === 1 ? a.inv.primary : a.inv.secondary;
          this.dropWeapon(a, cur);
          if (def.slot === 1) a.inv.primary = null; else a.inv.secondary = null;
          this.take(a, d, i);
          a.cmd.usePressed = false;
        }
      }
    }
  }
  take(a, d, i) {
    const def = d.inst.def;
    if (def.slot === 1) a.inv.primary = d.inst; else a.inv.secondary = d.inst;
    this.removeDrop(i);
    a.sfx('magin', 0.4);
    if (a.slot === 'knife' || (def.slot === 1 && a.slot === 'secondary') || a.isBot) { a.switchTo(def.slot === 1 ? 'primary' : 'secondary'); }
  }
  removeDrop(i) { this.emit({ t: 'undrop', n: this.drops[i].nid }); this.scene.remove(this.drops[i].mesh); this.drops.splice(i, 1); }

  // ---------------- 投掷物 ----------------
  spawnGrenade(id, pos, vel, owner) {
    this.emit({ t: 'nade', id, p: nv(pos), v: nv(vel), a: owner.id });
    const mdl = Models.thirdPerson(id);
    this.scene.add(mdl.group);
    this.grenades.push({ id, pos: pos.clone(), vel: vel.clone(), owner, t: 0, mesh: mdl.group, rest: false, still: 0, spin: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)), done: false });
  }
  updateGrenades(dt) {
    const W = this.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      if (!g.rest) {
        g.vel.y -= 0.4 * PHYS.gravity * dt;
        let remaining = dt;
        for (let k = 0; k < 3 && remaining > 0; k++) {
          const sp = g.vel.length(); if (sp < 1e-4) break;
          const step = sp * remaining;
          const h = W.raycast(g.pos.x, g.pos.y, g.pos.z, g.vel.x / sp, g.vel.y / sp, g.vel.z / sp, step + 0.05, this._rh);
          if (!h || h.t > step) { g.pos.addScaledVector(g.vel, remaining); break; }
          const tt = Math.max(0, h.t - 0.04);
          g.pos.addScaledVector(g.vel, tt / sp);
          remaining -= tt / sp;
          const n = _g1.set(h.nx, h.ny, h.nz);
          const vn = g.vel.dot(n);
          g.vel.addScaledVector(n, -1.45 * vn);
          g.vel.multiplyScalar(0.72);
          if (Math.abs(vn) > 1.5) this.playAt('bounce', g.pos, { vol: clamp(Math.abs(vn) / 10, 0.1, 0.6), ref: 2, rate: 1.0, maxDist: 30, net: false });
          if (n.y > 0.7 && g.vel.length() < 0.6) { g.rest = true; g.vel.set(0, 0, 0); break; }
          g.spin.multiplyScalar(0.6);
        }
        g.mesh.rotation.x += g.spin.x * dt; g.mesh.rotation.y += g.spin.y * dt; g.mesh.rotation.z += g.spin.z * dt;
        if (W.pointSolid(g.pos.x, g.pos.y, g.pos.z)) { const top = W.surfaceTop(g.pos.x, g.pos.z, g.pos.y + 0.5); if (isFinite(top)) g.pos.y = top + 0.04; }
      }
      g.mesh.position.copy(g.pos);
      if (g.rest) g.still += dt;
      const det = (g.id === 'he' || g.id === 'flash') ? g.t >= 1.6 : (g.rest && g.still > 0.6) || g.t > 4;
      if (det && !g.done) { g.done = true; this.detonate(g); }
      if (g.done && (g.id !== 'smoke' || g.t > 4.5)) { this.scene.remove(g.mesh); this.grenades.splice(i, 1); }
    }
  }
  detonate(g) {
    const p = g.pos;
    if (g.id === 'he') {
      g.mesh.visible = false;
      Effects.explosion(p);
      this.playAt('explode', p, { vol: 1.6, ref: 10, roll: 0.8, rev: 0.6, net: false });
      for (const a of this.actors) {
        if (!a.alive) continue;
        const c = _g2.set(a.pos.x, a.pos.y + 0.9, a.pos.z);
        const d = c.distanceTo(p);
        if (d > 9.5) continue;
        if (!this.world.clear(p.x, p.y + 0.15, p.z, c.x, c.y, c.z)) continue;
        const dmg = 98 * Math.pow(1 - d / 9.5, 1.4);
        if (a !== g.owner && a.team === g.owner.team && !this.opts.ff) continue;
        this.applyDamage(a, g.owner, a === g.owner ? dmg * 0.6 : dmg, 'chest', { armorPen: 0.5, type: 'grenade', name: '高爆手雷', killReward: 300 }, _g3.subVectors(c, p).normalize(), c, false);
      }
      const dc = this.camera.position.distanceTo(p);
      this.shake = Math.max(this.shake, clamp(1.5 - dc / 14, 0, 1.2));
      if (dc < 8) Sound.deafen(clamp(1 - dc / 8, 0.2, 0.7), 1.2);
      this.noise(g.owner, p, 40);
    } else if (g.id === 'flash') {
      g.mesh.visible = false;
      Effects.flashPop(p);
      this.playAt('flashbang', p, { vol: 1.4, ref: 8, roll: 0.8, rev: 0.5, net: false });
      for (const a of this.actors) {
        if (!a.alive) continue;
        const eye = a.eyePos(_g2), d = eye.distanceTo(p);
        if (d > 32 || !this.world.clear(p.x, p.y + 0.1, p.z, eye.x, eye.y, eye.z) || Effects.smokeBlocks(p, eye)) continue;
        const f = a.forward(_g3), dir = _g4.subVectors(p, eye).normalize();
        const dot = f.dot(dir);
        const ang = dot > 0.6 ? 1 : dot > 0 ? 0.55 + dot * 0.75 : dot > -0.4 ? 0.3 : 0.12;
        const dist = clamp(1.15 - d / 30, 0, 1);
        const dur = 4.6 * ang * dist;
        if (dur < 0.25) continue;
        if (a.isPlayer) {
          this.flashHold = Math.max(this.flashHold, dur * 0.55); this.flashAmt = 1;
          Sound.deafen(clamp(ang * dist, 0.3, 1), dur);
        } else a.blind = Math.max(a.blind, dur);
      }
    } else if (g.id === 'smoke') {
      Effects.smoke(p);
      this.playAt('smokepop', p, { vol: 1.0, ref: 4, net: false });
    }
  }

  // ---------------- 购买 ----------------
  buyState(a, id) {
    const it = WEAPONS[id] || EQUIP[id], md = this.mode;
    const price = md.infiniteMoney ? 0 : it.price;
    let own = false, ok = a.money >= price || md.infiniteMoney;
    if (it.team && it.team !== a.team) ok = false;
    if (WEAPONS[id]) {
      const def = WEAPONS[id];
      if (def.type === 'grenade') { own = a.inv.nades[id] > 0; if (a.inv.nades[id] >= def.max) ok = false; const tot = a.inv.nades.he + a.inv.nades.flash + a.inv.nades.smoke; if (tot >= 4) ok = false; }
      else { const cur = def.slot === 1 ? a.inv.primary : a.inv.secondary; own = !!cur && cur.id === id; if (own) ok = false; }
    } else if (id === 'kevlar') { own = a.armor >= 100; if (own) ok = false; }
    else if (id === 'helmet') { own = a.armor >= 100 && a.helmet; if (own) ok = false; if (a.armor >= 100 && !a.helmet && !md.infiniteMoney) ok = a.money >= 350; }
    else if (id === 'defuser') { own = a.inv.defuser; if (own) ok = false; }
    return { ok, own, price };
  }
  buy(a, id, ui) {
    const md = this.mode;
    if (!(md.canBuy && md.canBuy(a))) return false;
    const st = this.buyState(a, id);
    if (!st.ok) { if (ui) Sound.play('ui_deny'); return false; }
    if (this.client) { this.net.send({ t: 'buy', id }); if (ui) Sound.play('ui_buy', { vol: 0.6 }); return true; }
    let price = st.price;
    if (id === 'helmet' && a.armor >= 100 && !a.helmet && !md.infiniteMoney) price = 350;
    if (!md.infiniteMoney) a.money -= price;
    if (WEAPONS[id]) {
      const def = WEAPONS[id];
      if (def.type !== 'grenade') {
        const cur = def.slot === 1 ? a.inv.primary : a.inv.secondary;
        if (cur && md.id !== 'range') this.dropWeapon(a, cur);
      }
      a.giveWeapon(id);
      if (def.type === 'grenade' && a.isPlayer && a.slot !== 'nade') { /* 不自动切出 */ }
    } else if (id === 'kevlar') a.armor = 100;
    else if (id === 'helmet') { a.armor = 100; a.helmet = true; }
    else if (id === 'defuser') a.inv.defuser = true;
    if (ui) { Sound.play('ui_buy', { vol: 0.6 }); HUD.moneyFlash(); }
    return true;
  }
  botBuy(a) {
    const m = () => a.money;
    const rifle = a.team === 'T' ? 'ak47' : 'm4a4';
    if (!a.inv.primary) {
      if (m() >= 4750 + 1000 && Math.random() < 0.2) this.buy(a, 'awp');
      else if (m() >= WEAPONS[rifle].price + 650) this.buy(a, rifle);
      else if (m() >= 1250 + 650 && Math.random() < 0.55) this.buy(a, 'mp9');
      else if (m() >= 700 && Math.random() < 0.45 && !(a.inv.secondary && a.inv.secondary.id === 'deagle')) this.buy(a, 'deagle');
    }
    if (m() >= 1000 && !a.helmet) this.buy(a, 'helmet'); else if (m() >= 650 && a.armor < 100) this.buy(a, 'kevlar');
    if (a.team === 'CT' && m() >= 400 && Math.random() < 0.6) this.buy(a, 'defuser');
    const nades = shuffle(['he', 'flash', 'smoke', 'flash']);
    for (const n of nades) if (m() >= 900 && Math.random() < 0.5) this.buy(a, n);
  }

  // ---------------- 主循环 ----------------
  buildPlayerCmd() {
    const P = this.player, c = P.cmd, I = Input, S = Settings.data;
    const ui = HUD.buyOpen;
    c.jumpPressed = false; c.duckPressed = false; c.attackPressed = false; c.attack2Pressed = false; c.usePressed = false; c.reload = false;
    if (I.wasPressed('KeyB') && !this.over) { if (ui) HUD.closeBuy(); else if (this.mode.canBuy && this.mode.canBuy(P)) HUD.openBuy(this); }
    if (!P.alive) {
      if (I.mPressed[0] || I.wasPressed('Space')) this.nextSpectate(1);
      if (I.mPressed[2]) this.nextSpectate(-1);
      return;
    }
    const k = (code) => I.isDown(code);
    c.fwd = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    c.side = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const shift = k('ShiftLeft') || k('ShiftRight');
    const sprint = S.moveMode === 'sprint';
    c.walk = sprint ? (k('AltLeft') || k('AltRight')) : shift;
    c.sprint = sprint && shift;
    const duckDown = k('ControlLeft') || k('ControlRight') || k('KeyC');
    const duckEdge = I.wasPressed('ControlLeft') || I.wasPressed('ControlRight') || I.wasPressed('KeyC');
    if (S.toggleCrouch) { if (duckEdge) this.crouchToggle = !this.crouchToggle; c.duck = this.crouchToggle; if (P.sliding) this.crouchToggle = false; }
    else c.duck = duckDown;
    c.duckPressed = duckEdge;
    c.jump = k('Space'); c.jumpPressed = I.wasPressed('Space');
    if (ui) {
      c.attack = false; c.attack2 = false;
      if (I.mPressed[0]) HUD.buyClick(this);
      for (let n = 1; n <= 6; n++) if (I.wasPressed('Digit' + n)) HUD.buyKey(this, n);
      if (I.wasPressed('Escape')) HUD.closeBuy();
    } else {
      c.attack = I.mouse[0]; c.attackPressed = I.mPressed[0];
      c.attack2 = I.mouse[2]; c.attack2Pressed = I.mPressed[2];
      const slots = { Digit1: 'primary', Digit2: 'secondary', Digit3: 'knife', Digit4: 'nade', Digit5: 'c4', KeyQ: 'last' };
      for (const key in slots) if (I.wasPressed(key)) c.slotReq = slots[key];
      if (I.wheel) {
        const order = ['primary', 'secondary', 'knife', 'nade', 'c4'].filter((s) => s === 'nade' ? GRENADE_ORDER.some((n) => P.inv.nades[n] > 0) : !!P.slotWeapon(s));
        let i = order.indexOf(P.slot); if (i < 0) i = 0;
        c.slotReq = order[(i + (I.wheel > 0 ? 1 : -1) + order.length) % order.length];
      }
    }
    c.reload = I.wasPressed('KeyR');
    c.use = k('KeyE'); c.usePressed = I.wasPressed('KeyE');
    if (I.wasPressed('KeyF')) c.inspect = true;
    if (I.wasPressed('KeyG')) c.drop = true;
  }
  applyLook(mx, my) {
    const P = this.player;
    if (HUD.buyOpen) return;
    const S = Settings.data;
    if (!P.alive) {
      const k = S.sens * 0.022 * DEG;
      this.deathYaw = wrapAngle((this.deathYaw || 0) - mx * k);
      this.deathPitch = clamp((this.deathPitch || 0) - my * k * (S.invertY ? -1 : 1), -1.3, 0.5);
      return;
    }
    let sens = S.sens * 0.022 * DEG;
    if (P.scoped && P.def.zoom) sens *= S.zoomSens * P.def.zoom[P.scoped - 1] / 90;
    P.yaw = wrapAngle(P.yaw - mx * sens);
    P.pitch = clamp(P.pitch - my * sens * (S.invertY ? -1 : 1), -89 * DEG, 89 * DEG);
  }

  tick(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.time >= this.timers[i].t) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    if (this.client) return this.tickClient(dt);
    if (this.net) this.net.preTick();
    for (const a of this.actors) if (a.brain && a.alive) a.brain.tick(dt);
    for (const a of this.actors) {
      if (a.remote) a.netSim(dt); else a.simulate(dt);
      a.updateWeapon(dt);
      if (!a.isPlayer && !a.remote) a.events.length = 0;   // 机器人没有第一人称动画，事件直接丢掉
    }
    // 角色之间的软碰撞（远端玩家的位置以对方本机为准，这里不推它）
    const al = this.actors;
    for (let i = 0; i < al.length; i++) {
      const a = al[i]; if (!a.alive) continue;
      for (let j = i + 1; j < al.length; j++) {
        const b = al[j]; if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
        if (d >= 0.8 || Math.abs(b.pos.y - a.pos.y) > 1.6 || d < 1e-4) continue;
        const push = (0.8 - d) * 0.5, nx = dx / d * push, nz = dz / d * push;
        if (!a.remote && !this.world.overlapHull(a.pos.x - nx, a.pos.y, a.pos.z - nz, PHYS.hullHalf, a.hullH())) { a.pos.x -= nx; a.pos.z -= nz; }
        if (!b.remote && !this.world.overlapHull(b.pos.x + nx, b.pos.y, b.pos.z + nz, PHYS.hullHalf, b.hullH())) { b.pos.x += nx; b.pos.z += nz; }
      }
    }
    this.updateGrenades(dt);
    this.updateDrops(dt);
    this.mode.tick(dt);
    if (this.net) this.net.postTick();
    if (this.over) { this.overT += dt; if (this.overT > 9) this.eng.quitToMenu(); }
  }
  // 加入者：只模拟自己的移动；手雷 / 掉落物照房主给的初速度本地演算
  tickClient(dt) {
    const P = this.player;
    P.simulate(dt);
    if (P.alive) {
      for (const b of this.actors) {
        if (b === P || !b.alive) continue;
        const dx = b.pos.x - P.pos.x, dz = b.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d >= 0.8 || Math.abs(b.pos.y - P.pos.y) > 1.6 || d < 1e-4) continue;
        const nx = dx / d * (0.8 - d) * 0.5, nz = dz / d * (0.8 - d) * 0.5;
        if (!this.world.overlapHull(P.pos.x - nx, P.pos.y, P.pos.z - nz, PHYS.hullHalf, P.hullH())) { P.pos.x -= nx; P.pos.z -= nz; }
      }
    }
    this.updateGrenades(dt);
    this.updateDrops(dt);
    this.net.sendInput();
  }
  // 后台不渲染时也要让命中盒跟着角色走（机器人开枪按模型骨骼判定）
  syncModels() {
    for (const a of this.actors) {
      if (!a.alive || !a.model || a.model.ragdoll) continue;
      const r = a.model.root; r.position.copy(a.pos); a.renderPos.copy(a.pos); r.rotation.y = a.yaw; r.updateMatrixWorld(true);
    }
  }
  idleCmd() { const c = this.player.cmd; Object.assign(c, newCmd(), { duck: this.crouchToggle && c.duck }); }

  // ---------------- 回合清场 / C4（房主与加入者共用） ----------------
  clearRoundFx() {
    Effects.clearRound();
    for (const d of this.drops) this.scene.remove(d.mesh); this.drops.length = 0;
    for (const gr of this.grenades) this.scene.remove(gr.mesh); this.grenades.length = 0;
    for (const r of this.ragdolls) r.dispose(); this.ragdolls.length = 0;
    if (this.mode.clearBomb) this.mode.clearBomb(); else if (this.mode.clearMesh) this.mode.clearMesh();
    this.timers.length = 0;
    this.emit({ t: 'clr' });
  }
  bombModel(pos, yaw) {
    const m = Models.thirdPerson('c4');
    m.group.position.set(pos.x, pos.y + 0.03, pos.z); m.group.rotation.y = yaw;
    this.scene.add(m.group);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.02, 0.02) }));
    light.position.set(0.0, 0.1, -0.03); m.group.add(light);
    return { group: m.group, light };
  }
  c4Fx(pos) {
    Effects.explosion(pos); Effects.explosion(pos.clone().add(_g1.set(0, 1.5, 0)));
    this.playAt('c4boom', pos, { vol: 2.0, ref: 25, roll: 0.5, rev: 0.8, net: false });
    Effects.light(pos.clone().add(_g1.set(0, 2, 0)), 90, 0.8, 0xffa040, 45);
    const dc = this.camera.position.distanceTo(pos);
    this.shake = clamp(2 - dc / 30, 0.3, 2);
    if (dc < 25) { this.flashAmt = Math.max(this.flashAmt, clamp(1 - dc / 25, 0, 0.8)); this.flashHold = 0.1; Sound.deafen(clamp(1 - dc / 30, 0.2, 0.9), 2.5); }
    this.emit({ t: 'c4x', p: nv(pos) });
  }

  nextSpectate(dir) {
    const list = this.actors.filter((a) => a.alive && a.team === this.player.team && a !== this.player);
    if (!list.length) { this.viewTarget = null; return; }
    let i = list.indexOf(this.viewTarget);
    i = (i + dir + list.length) % list.length;
    this.viewTarget = list[i];
  }

  render(dt, alpha, mx, my) {
    const P = this.player, cam = this.camera;
    if (this.client) this.net.update(dt);
    for (const a of this.actors) {
      if (a.alive) a.renderPos.lerpVectors(a.prevPos, a.pos, alpha);
      const h = a.model;
      if (!h) continue;
      if (a.alive) {
        h.root.visible = true;
        h.root.position.copy(a.renderPos);
        h.root.rotation.y = a.yaw;
        h.update(dt, { speed: a.hspeed(), crouch: a.ducked || a.sliding, pitch: a.pitch, reloading: a.reloading });
        h.root.updateMatrixWorld(true);
        if (a.isPlayer) h.skeleton.update();   // 第一人称时主相机看不到自身模型，需手动刷新骨骼供阴影使用
      }
    }
    for (const r of this.ragdolls) r.update(dt);
    // 雷达发现（联机时两队都要算，加入者直接用房主的结果）
    this.spotT -= dt;
    if (this.spotT <= 0 && !this.client) {
      this.spotT = 0.15;
      for (const e of this.actors) {
        if (!e.alive || (e.team === P.team && !this.net)) continue;
        const head = this.aimPoint(e, 'head', _g1);
        for (const t of this.actors) {
          if (!t.alive || t.team === e.team) continue;
          const eye = t.eyePos(_g2);
          if (eye.distanceTo(head) > 80) continue;
          if (t.isPlayer || t.remote) { const f = t.forward(_g3); if (f.dot(_g4.subVectors(head, eye).normalize()) < 0.5) continue; }
          else if (!(t.brain && t.brain.target === e && t.brain.targetVisible)) continue;
          if (this.visible(eye, head)) { e.spottedT = this.time; break; }
        }
      }
    }
    this.updateCamera(dt);
    Effects.update(dt, cam);
    const view = P.alive ? P : null;
    const sunVis = this.sunVisibility(cam.position);
    if (view) this.vm.update(dt, P, cam.quaternion, mx, my, sunVis);
    else { this.vm.root.visible = false; P.events.length = 0; }
    // 后处理参数
    if (this.flashHold > 0) this.flashHold -= dt; else this.flashAmt = Math.max(0, this.flashAmt - dt * 0.55);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (P.alive && P.hp <= 25) { this.heartT -= dt; if (this.heartT <= 0) { this.heartT = 0.85; Sound.play('heart', { vol: 0.45 }); } }
    // 听者
    const f = _g1.set(0, 0, -1).applyQuaternion(cam.quaternion), u = _g2.set(0, 1, 0).applyQuaternion(cam.quaternion);
    Sound.setListener(cam.position, f, u);
    HUD.update(dt, this);
    HUD.scoreboard(Input.isDown('Tab') || this.over, this);
    if (!P.alive) {
      const t = this.viewTarget && this.viewTarget.alive ? this.viewTarget : null;
      HUD.spectate(this.deathT > 2.5 ? (t ? `观战：${t.name}  ·  左/右键切换` : this.mode.id === 'comp' ? '等待下一回合…' : '等待复活…') : '');
    } else HUD.spectate('');
  }

  sunVisibility(p) {
    this._sunT = (this._sunT || 0) - 1;
    if (this._sunT > 0) return this._sunVis;
    this._sunT = 3;
    const s = this.eng.sunDir;
    const v = this.world.raycast(p.x, p.y, p.z, s.x, s.y, s.z, 60, {}) ? 0 : 1;
    this._sunVis = this._sunVis == null ? v : lerp(this._sunVis, v, 0.35);
    return this._sunVis;
  }

  updateCamera(dt) {
    const P = this.player, cam = this.camera;
    let fov = hToV(90);
    if (P.alive) {
      cam.layers.disable(1);
      this.spectating = false; this.viewTarget = null;
      cam.position.set(P.renderPos.x, P.renderPos.y + P.eyeHeight() + P.stepOffset, P.renderPos.z);
      const vf = 0.45;
      const pitch = P.pitch + (P.recoilP * vf + P.punchP + P.aimPunchP * 0.7) * DEG;
      const yaw = P.yaw - (P.recoilY * vf + P.punchY - P.aimPunchY * 0.7) * DEG;
      const roll = P.slideAmt * 4.5 * DEG * P.slideRollDir;
      cam.rotation.set(clamp(pitch, -1.55, 1.55), yaw, roll, 'YXZ');
      if (P.scoped && P.def.zoom) fov = hToV(P.def.zoom[P.scoped - 1]);
      else fov += P.slideAmt * 5 + (P.sprinting ? 3 : 0);
    } else {
      this.deathT += dt;
      cam.layers.enable(1);
      if (this.deathT < 2.5 || !this.mode.spectateAllowed) {
        const base = _g3.copy(P.model && P.model.ragdoll ? P.model.ragdoll.p[1] : P.pos); base.y += 0.25;
        const k = easeInOut(clamp(this.deathT / 1.1, 0, 1));
        const dir = dirFromAngles(this.deathYaw || 0, this.deathPitch || -0.4, _g1);
        const want = _g2.copy(base).addScaledVector(dir, -2.8);
        const h = this.world.raycast(base.x, base.y, base.z, -dir.x, -dir.y, -dir.z, 2.8, {});
        if (h) want.copy(base).addScaledVector(dir, -Math.max(0.3, h.t - 0.2));
        if (this.deathEye && k < 1) want.lerpVectors(this.deathEye, want, k);
        cam.position.copy(want);
        cam.lookAt(base);
        cam.rotation.z = 0;
        if (this.deathQuat && k < 1) cam.quaternion.slerpQuaternions(this.deathQuat, _gq.copy(cam.quaternion), k);
      } else {
        this.spectating = true;
        if (!this.viewTarget || !this.viewTarget.alive) this.nextSpectate(1);
        const T = this.viewTarget;
        if (T) {
          const eye = _g1.set(T.renderPos.x, T.renderPos.y + T.eyeHeight(), T.renderPos.z);
          const f = dirFromAngles(T.yaw, T.pitch * 0.6, _g2);
          const r = _g3.set(Math.cos(T.yaw), 0, -Math.sin(T.yaw));
          const want = _g4.copy(eye).addScaledVector(f, -2.4).addScaledVector(r, 0.35).add(_v1.set(0, 0.45, 0));
          const dx = want.x - eye.x, dy = want.y - eye.y, dz = want.z - eye.z, L = Math.hypot(dx, dy, dz);
          const h = this.world.raycast(eye.x, eye.y, eye.z, dx / L, dy / L, dz / L, L, {});
          if (h) want.set(eye.x + dx / L * Math.max(0.3, h.t - 0.2), eye.y + dy / L * Math.max(0.3, h.t - 0.2), eye.z + dz / L * Math.max(0.3, h.t - 0.2));
          cam.position.lerp(want, 1 - Math.exp(-dt * 12));
          cam.lookAt(_v1.copy(eye).addScaledVector(f, 6));
        }
      }
    }
    if (this.shake > 0 && Settings.data.motionFx !== false) {
      cam.rotation.x += (Math.random() - 0.5) * 0.02 * this.shake;
      cam.rotation.y += (Math.random() - 0.5) * 0.02 * this.shake;
    }
    if (Math.abs(cam.fov - fov) > 8) cam.fov = fov; else cam.fov = damp(cam.fov, fov, 14, dt);
    cam.updateProjectionMatrix();
  }

  dispose() {
    for (const r of this.ragdolls) r.dispose();
    for (const a of this.actors) { if (a.model) { if (a.model.ragdoll) a.model.ragdoll.dispose(); this.scene.remove(a.model.root); } }
    for (const d of this.drops) this.scene.remove(d.mesh);
    for (const g of this.grenades) this.scene.remove(g.mesh);
    if (this.mode.dispose) this.mode.dispose();
    if (this.net) this.net.detach();
    Effects.clearAll();
    HUD.closeBuy();
  }
}

// ======================================================================
//  模式：团队死斗
// ======================================================================
class ModeTDM {
  constructor(g) { this.g = g; this.id = 'tdm'; this.title = '团队死斗'; this.infiniteMoney = true; this.score = { CT: 0, T: 0 }; this.limit = 50; this.total = 480; this.t = 0; this.phase = 'live'; this.spectateAllowed = false; }
  setup() {
    const g = this.g, n = g.opts.size;
    for (const team of ['CT', 'T']) {
      const cnt = Math.max(0, n - g.humans(team));
      for (let i = 0; i < cnt; i++) g.createActor(team, true, g.botName(team, i));
    }
    for (const a of g.actors) { this.loadout(a); this.spawn(a); }
    g.center(['团队死斗', '', 3, `先达到 ${this.limit} 击杀的队伍获胜 · 按 B 免费换枪`]);
    g.sound2d(['round_start', 0.5]);
  }
  loadout(a) {
    a.stripForNewGame();
    a.inv.secondary = new WeaponInst(a.team === 'T' ? 'glock' : 'usp');
    if (a.isBot) {
      const r = Math.random();
      a.inv.primary = new WeaponInst(r < 0.12 ? 'awp' : r < 0.25 ? 'mp9' : a.team === 'T' ? 'ak47' : 'm4a4');
      a.inv.nades.he = Math.random() < 0.4 ? 1 : 0;
    } else a.inv.primary = new WeaponInst(a.team === 'T' ? 'ak47' : 'm4a4');
    a.armor = 100; a.helmet = true;
  }
  spawn(a) {
    const g = this.g;
    const pts = g.map.spawns[a.team];
    let best = pts[0], bs = -1;
    for (let k = 0; k < 8; k++) {
      const p = pick(pts);
      let near = 1e9;
      for (const o of g.actors) if (o.alive && o !== a) near = Math.min(near, o.pos.distanceTo(p));
      if (near > bs) { bs = near; best = p; }
    }
    for (const s of ['primary', 'secondary']) if (a.inv[s]) { const w = a.inv[s]; w.mag = w.def.mag; w.reserve = w.def.reserve; }
    if (!a.inv.primary && a.lastPrimary) a.inv.primary = new WeaponInst(a.lastPrimary);
    if (!a.inv.secondary) a.inv.secondary = new WeaponInst(a.team === 'T' ? 'glock' : 'usp');
    a.armor = 100; a.helmet = true;
    a.spawnAt(best, a.team === 'T' ? 0 : Math.PI);
    a.spawnTime = g.time;
    if (a.brain) { a.brain.reset(); a.brain.task = { type: 'roam', pos: g.randomGoal(a) }; }
    if (a.isPlayer) { HUD.hideDeath(); g.flashAmt = 0; }
  }
  canBuy(a) { return a.alive && this.g.time - (a.spawnTime || 0) < 20; }
  buyTimeLeft() { return Math.max(0, 20 - (this.g.time - (this.g.player.spawnTime || 0))); }
  timeLeft() { return this.total - this.t; }
  tick(dt) {
    const g = this.g;
    if (this.phase !== 'live') return;
    this.t += dt;
    for (const a of g.actors) {
      if (!a.alive && a.respawnAt && g.time >= a.respawnAt) { a.respawnAt = 0; this.spawn(a); }
      if (a.alive && a.brain && a.brain.task && a.brain.task.type === 'roam') {
        const t = a.brain.task;
        t.timer = (t.timer || 0) + dt;
        if (a.pos.distanceTo(t.pos) < 3 || t.timer > 25) { t.pos = g.randomGoal(a); t.timer = 0; }
      }
    }
    if (this.score.CT >= this.limit || this.score.T >= this.limit || this.t >= this.total) this.finish();
  }
  onKill(v, k) {
    if (k && k !== v && k.team !== v.team) this.score[k.team]++;
    v.respawnAt = this.g.time + 3;
    if (v.isPlayer) HUD.showDeath(document.getElementById('deathinfo').innerHTML.split('<small>')[0], '3 秒后复活');
  }
  finish() {
    const g = this.g;
    this.phase = 'over'; g.over = true; g.frozen = true; g.noFire = true;
    const w = this.score.CT === this.score.T ? null : this.score.CT > this.score.T ? 'CT' : 'T';
    g.center([w ? (w === 'CT' ? '反恐精英获胜！' : '恐怖分子获胜！') : '平局', w ? (w === 'CT' ? 'win-ct' : 'win-t') : '', 9, `${this.score.CT} : ${this.score.T}`]);
    g.sound2d((a) => [w === a.team ? 'round_win' : 'round_lose', 0.6]);
  }
}

// ======================================================================
//  模式：靶场
// ======================================================================
class ModeRange {
  constructor(g) { this.g = g; this.id = 'range'; this.title = '靶场训练'; this.infiniteMoney = true; this.score = { CT: 0, T: 0 }; this.phase = 'live'; this.spectateAllowed = false; g.infiniteAmmo = true; }
  setup() {
    const g = this.g, P = g.player;
    const enemy = P.team === 'CT' ? 'T' : 'CT';
    this.spots = [[2.5, 0, 4], [-2.5, 0, -4], [1.5, 0, -12], [-1.5, 0, -17], [3, 0, -28], [-3.2, 0, 9.5]].map((p) => new THREE.Vector3(...p));
    this.spots.forEach((p, i) => { const b = g.createActor(enemy, true, '靶子 ' + (i + 1)); b.brain.passive = true; b.home = p; });
    P.stripForNewGame();
    P.inv.secondary = new WeaponInst('deagle'); P.inv.primary = new WeaponInst(P.team === 'T' ? 'ak47' : 'm4a4');
    P.inv.nades = { he: 1, flash: 2, smoke: 1 }; P.armor = 100; P.helmet = true;
    P.spawnAt(new THREE.Vector3(0, 0, 24), 0); P.spawnTime = 0;
    for (const a of g.actors) if (a !== P) this.spawnDummy(a);
    HUD.center('靶场训练', '', 4, '无限弹药 · 随处按 B 换枪 · 右侧显示实时散布/速度');
  }
  spawnDummy(a) {
    a.inv.primary = null; a.inv.secondary = new WeaponInst('glock'); a.armor = Math.random() < 0.5 ? 100 : 0; a.helmet = a.armor > 0 && Math.random() < 0.5;
    a.spawnAt(a.home, Math.PI); a.brain.task = { type: 'dummy', pos: a.home };
  }
  canBuy(a) { return a.alive; }
  timeLeft() { return null; }
  tick(dt) {
    const g = this.g;
    for (const a of g.actors) {
      if (a.isPlayer) { if (!a.alive && a.respawnAt && g.time > a.respawnAt) { a.respawnAt = 0; a.spawnAt(new THREE.Vector3(0, 0, 24), 0); HUD.hideDeath(); } continue; }
      if (!a.alive && a.respawnAt && g.time > a.respawnAt) { a.respawnAt = 0; this.spawnDummy(a); }
    }
  }
  onKill(v, k) { v.respawnAt = this.g.time + (v.isPlayer ? 2 : 1.6); if (k && k.isPlayer) this.score[k.team]++; }
}

// ======================================================================
//  模式：爆破竞技（回合制 + 经济 + C4）
// ======================================================================
class ModeComp {
  constructor(g) {
    this.g = g; this.id = 'comp'; this.title = '爆破竞技'; this.infiniteMoney = false; this.spectateAllowed = true;
    this.score = { CT: 0, T: 0 }; this.round = 0; this.phase = 'freeze'; this.t = 0; this.roundTime = 115; this.freezeTime = 8; this.buyWindow = 18;
    this.toWin = 9; this.half = 8; this.lossStreak = { CT: 0, T: 0 };
    this.bomb = null; this.bombMesh = null; this.bombLight = null;
  }
  setup() {
    const g = this.g, n = g.opts.size;
    for (const team of ['CT', 'T']) {
      const cnt = Math.max(0, n - g.humans(team));
      for (let i = 0; i < cnt; i++) g.createActor(team, true, g.botName(team, i));
    }
    for (const a of g.actors) { a.money = 800; a.stripForNewGame(); }
    this.startRound();
  }
  defaultPistol(a) { if (!a.inv.secondary) a.inv.secondary = new WeaponInst(a.team === 'T' ? 'glock' : 'usp'); }
  startRound() {
    const g = this.g;
    this.round++;
    if (this.round === this.half + 1) this.halftime();
    g.clearRoundFx();
    const pts = { CT: shuffle(g.map.spawns.CT.slice()), T: shuffle(g.map.spawns.T.slice()) };
    for (const a of g.actors) {
      if (!a.alive) { a.inv.primary = null; a.inv.secondary = null; a.inv.nades = { he: 0, flash: 0, smoke: 0 }; a.armor = 0; a.helmet = false; a.inv.defuser = false; }
      a.inv.c4 = false;
      this.defaultPistol(a);
      for (const s of ['primary', 'secondary']) if (a.inv[s]) { const w = a.inv[s]; w.reserve = w.def.reserve; }
      a.spawnAt(pts[a.team].pop() || g.map.spawns[a.team][0], a.team === 'T' ? 0 : Math.PI);
      a.roundKills = 0;
    }
    // 炸弹
    const ts = g.actors.filter((a) => a.team === 'T');
    if (ts.length) { const c = pick(ts); c.inv.c4 = true; this.bomb = { carrier: c, dropped: false, planted: false, pos: new THREE.Vector3(), timer: 40, defuseT: 0, beepT: 0, exploded: false, defused: false }; }
    this.phase = 'freeze'; this.t = this.freezeTime; g.frozen = true; g.noFire = true;
    for (const a of g.actors) if (a.isBot) g.botBuy(a);
    this.assignTasks();
    HUD.hideDeath(); g.flashAmt = 0; g.deathT = 0;
    const last = this.round === this.half ? '（上半场最后一局）' : this.score.CT === this.toWin - 1 || this.score.T === this.toWin - 1 ? '（赛点）' : '';
    g.center((P) => [`第 ${this.round} 回合${last}`, '', 3, P.team === 'T' ? (P.inv.c4 ? '你携带着 C4 —— 前往 A 或 B 包点安放' : '与队友一起攻占包点并安放 C4') : '守住 A / B 包点，阻止 C4 被安放']);
    g.openBuyAll();
  }
  halftime() {
    const g = this.g;
    for (const a of g.actors) {
      a.team = a.team === 'T' ? 'CT' : 'T';
      a.money = 800; a.stripForNewGame(); a.alive = false;
      g.resetModel(a, true);
      if (a.isBot) a.name = a.name;
    }
    this.score = { CT: this.score.T, T: this.score.CT };
    this.lossStreak = { CT: 0, T: 0 };
    g.vm.setTeam(g.player.team);
    g.center(['交换攻守', '', 3]);
  }
  assignTasks() {
    const g = this.g, map = g.map;
    const bots = (t) => g.actors.filter((a) => a.isBot && a.alive && a.team === t);
    // T：选包点与路线
    const site = Math.random() < 0.55 ? 'A' : 'B';
    this.tSite = site;
    const ts = bots('T');
    ts.forEach((a, i) => {
      const route = pick(map.routes[site]).map((k) => map.points[k].clone().add(_g1.set(rand(-1.2, 1.2), 0, rand(-1.2, 1.2))));
      const s = map.sites[site];
      const plantPos = new THREE.Vector3(lerp(s.min[0], s.max[0], rand(0.35, 0.65)), s.center.y, lerp(s.min[1], s.max[1], rand(0.35, 0.65)));
      const holds = map.holds[site];
      const h = holds[i % holds.length];
      const then = a.inv.c4 ? { type: 'plant', pos: this.snap(plantPos, s.center), urgent: true } : { type: 'hold', pos: h.pos.clone(), look: map.points[site === 'A' ? 'ct_to_a' : 'b_doors'].clone().add(_g1.set(0, 1.5, 0)) };
      a.brain.task = { type: 'route', pts: route, i: 0, then, delay: i * 0.6 };
    });
    // CT：分防
    const cs = shuffle(bots('CT'));
    const groups = ['A', 'B', 'mid', 'A', 'B'];
    cs.forEach((a, i) => {
      const grp = groups[i % groups.length];
      const h = pick(map.holds[grp]);
      a.brain.task = { type: 'hold', pos: h.pos.clone(), look: h.look.clone(), grp };
    });
  }
  snap(p, fallback) { const h = this.g.nav.heightAt(p.x, p.z); if (isNaN(h)) return fallback.clone(); return new THREE.Vector3(p.x, h, p.z); }
  canBuy(a) { return a.alive && (this.phase === 'freeze' || (this.phase === 'live' && this.roundTime - this.t < this.buyWindow - this.freezeTime)) && this.g.map.inBuyZone(a.team, a.pos); }
  buyTimeLeft() { return this.phase === 'freeze' ? this.t + (this.buyWindow - this.freezeTime) : Math.max(0, (this.buyWindow - this.freezeTime) - (this.roundTime - this.t)); }
  timeLeft() { if (this.phase === 'freeze') return this.t; if (this.bomb && this.bomb.planted && !this.bomb.defused && !this.bomb.exploded) return null; return this.phase === 'live' ? this.t : 0; }
  canPlant(a) { return this.phase === 'live' && this.bomb && !this.bomb.planted && a.team === 'T'; }

  tick(dt) {
    const g = this.g;
    if (this.phase === 'freeze') {
      this.t -= dt;
      if (this.t <= 0) { this.phase = 'live'; this.t = this.roundTime; g.frozen = false; g.noFire = false; g.sound2d(['round_start', 0.5]); g.center(['行动！', '', 1.2]); }
      return;
    }
    if (this.phase === 'post') {
      this.t -= dt;
      if (this.t <= 0) {
        if (this.score.CT >= this.toWin || this.score.T >= this.toWin) this.finish();
        else this.startRound();
      }
      return;
    }
    if (this.phase === 'over') return;
    // live
    const B = this.bomb;
    if (!(B && B.planted)) this.t -= dt;
    this.updateBots(dt);
    if (B && B.planted && !B.exploded && !B.defused) {
      B.timer -= dt;
      B.beepT -= dt;
      const frac = clamp(B.timer / 40, 0, 1);
      if (B.beepT <= 0) {
        B.beepT = B.timer < 2 ? 0.12 : lerp(0.15, 1.0, Math.pow(frac, 1.3));
        g.playAt('beep', B.pos, { vol: 0.8, ref: 4, roll: 0.9, rev: 0.1 });
        if (this.bombLight) { this.bombLight.material.color.setRGB(8, 0.4, 0.3); setTimeout(() => this.bombLight && this.bombLight.material.color.setRGB(0.6, 0.02, 0.02), 90); }
      }
      // 拆弹
      let defuser = null;
      for (const a of g.actors) {
        a.defusing = false;
        if (!a.alive || a.team !== 'CT' || !a.cmd.use) continue;
        const dx = a.pos.x - B.pos.x, dz = a.pos.z - B.pos.z;
        if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(a.pos.y - B.pos.y) < 1.2 && a.onGround) { defuser = a; break; }
      }
      if (defuser) {
        if (B.defuser !== defuser) { B.defuser = defuser; B.defuseT = 0; g.playAt('keypad', B.pos, { vol: 0.6, ref: 3 }); }
        defuser.defusing = true;
        const prev = B.defuseT; B.defuseT += dt; defuser.defuseT = B.defuseT;
        if (Math.floor(prev * 2) !== Math.floor(B.defuseT * 2)) g.playAt('keypad', B.pos, { vol: 0.5, ref: 3 });
        if (B.defuseT >= (defuser.inv.defuser ? 5 : 10)) { B.defused = true; defuser.defusing = false; g.playAt('defused', B.pos, { vol: 0.9, ref: 6 }); defuser.mvpFlag = true; this.endRound('CT', 'defuse'); return; }
      } else { B.defuser = null; B.defuseT = 0; }
      if (B.timer <= 0) { this.explodeBomb(); return; }
    }
    // 胜负判定
    const alive = (t) => g.actors.some((a) => a.alive && a.team === t);
    if (!alive('T') && !(B && B.planted)) return this.endRound('CT', 'elim');
    if (!alive('CT')) return this.endRound('T', 'elim');
    if (this.t <= 0 && !(B && B.planted)) return this.endRound('CT', 'time');
  }

  updateBots(dt) {
    const g = this.g, map = g.map, B = this.bomb;
    for (const a of g.actors) {
      if (!a.isBot || !a.alive || !a.brain.task) continue;
      const t = a.brain.task;
      if (t.type === 'route') {
        if (t.delay > 0) { t.delay -= dt; continue; }
        // 进点前道具：闪光弹丢进包点，烟雾弹封 CT 回防口
        const site = this.tSite, st = map.sites[site];
        if (!t.smokeDone && t.pts.length >= 3 && t.i >= t.pts.length - 3 && !a.brain.target && !a.brain.nade) {
          t.smokeDone = true;
          if (a.inv.nades.smoke && Math.random() < 0.85) a.brain.planNade('smoke', map.points[site === 'A' ? 'ct_to_a' : 'b_doors'].clone());
        }
        if (!t.utilDone && t.pts.length >= 2 && t.i >= t.pts.length - 2 && !a.brain.target && !a.brain.nade) {
          t.utilDone = true;
          if (a.inv.nades.flash && Math.random() < 0.85) a.brain.planNade('flash', st.center.clone().add(_g1.set(rand(-3, 3), 1.5, rand(-3, 3))));
          else if (a.inv.nades.he && Math.random() < 0.5) a.brain.planNade('he', st.center.clone().add(_g1.set(rand(-4, 4), 0, rand(-4, 4))));
        }
        if (t.i >= t.pts.length - 1 && a.pos.distanceTo(t.pts[t.pts.length - 1]) < 3.5) a.brain.task = t.then || { type: 'hold', pos: a.pos.clone() };
      }
      if (t.type === 'hold') {
        t.timer = (t.timer || 0) + dt;
        if (t.timer > rand(14, 30) && t.grp && a.team === 'CT' && !(B && B.planted)) { const h = pick(map.holds[t.grp]); t.pos = h.pos.clone(); t.look = h.look.clone(); t.timer = 0; }
      }
    }
    // 掉落的炸弹：最近的 T 去捡
    if (B && B.dropped && !B.planted) {
      let best = null, bd = 1e9;
      for (const a of g.actors) if (a.isBot && a.alive && a.team === 'T') { const d = a.pos.distanceTo(B.pos); if (d < bd) { bd = d; best = a; } }
      if (best && (!best.brain.task || best.brain.task.type !== 'fetch')) best.brain.task = { type: 'fetch', pos: B.pos.clone(), urgent: true };
    }
  }

  dropBomb(a) {
    const g = this.g, B = this.bomb; if (!B) return;
    const d = g.dropWeapon(a, null, true);
    B.dropped = true; B.carrier = null; B.drop = d; B.pos.copy(a.pos);
    g.later(1.5, () => { if (B.drop && B.drop.rest) B.pos.copy(B.drop.pos); });
    g.center((P) => P.team === 'T' ? ['炸弹已掉落', '', 2] : null);
  }
  pickupBomb(a) {
    const g = this.g, B = this.bomb; if (!B) return;
    a.inv.c4 = true; B.dropped = false; B.carrier = a; B.drop = null;
    g.center((P) => P === a ? ['你捡起了 C4', '', 2] : null); a.sfx('magin', 0.4);
    if (a.isBot) {
      const site = this.tSite || 'A', s = this.g.map.sites[site];
      a.brain.task = { type: 'route', pts: [s.center.clone()], i: 0, then: { type: 'plant', pos: s.center.clone(), urgent: true } };
    }
  }
  plantBomb(a, site) {
    const g = this.g, B = this.bomb;
    B.planted = true; B.dropped = false; B.carrier = null; B.timer = 40; B.beepT = 0; B.site = site;
    B.pos.set(a.pos.x, a.pos.y, a.pos.z); B.yaw = a.yaw;
    const m = g.bombModel(B.pos, a.yaw);
    this.bombMesh = m.group; this.bombLight = m.light;
    g.playAt('armed', B.pos, { vol: 0.8, ref: 5 });
    a.money += 300; a.mvpFlag = true;
    g.center(['炸弹已安放', 'win-t', 3, `${site} 包点 · 40 秒后爆炸`]);
    // 机器人：CT 回防拆弹，T 守包
    const cts = g.actors.filter((x) => x.isBot && x.alive && x.team === 'CT').sort((p, q) => p.pos.distanceTo(B.pos) - q.pos.distanceTo(B.pos));
    cts.forEach((x, i) => { x.brain.task = i === 0 || Math.random() < 0.5 ? { type: 'defuse', pos: B.pos.clone(), urgent: i === 0 } : { type: 'hold', pos: B.pos.clone().add(_g1.set(rand(-4, 4), 0, rand(-4, 4))), look: B.pos.clone().add(_g1.set(0, 1, 0)) }; });
    const holds = g.map.holds[site];
    g.actors.filter((x) => x.isBot && x.alive && x.team === 'T').forEach((x, i) => { const h = holds[i % holds.length]; x.brain.task = { type: 'hold', pos: h.pos.clone(), look: B.pos.clone().add(_g1.set(rand(-8, 8), 1.5, rand(-8, 8))) }; });
    g.noise(a, B.pos, 30);
  }
  explodeBomb() {
    const g = this.g, B = this.bomb;
    B.exploded = true;
    g.c4Fx(B.pos);
    for (const a of g.actors) {
      if (!a.alive) continue;
      const d = a.pos.distanceTo(B.pos);
      const dmg = 500 * Math.exp(-(d * d) / (2 * 8.5 * 8.5));
      if (dmg > 1) g.applyDamage(a, null, dmg, 'chest', { armorPen: 0.85, type: 'c4', name: 'C4' }, _g2.subVectors(a.pos, B.pos).normalize(), a.pos, false);
    }
    if (this.bombMesh) this.bombMesh.visible = false;
    this.endRound('T', 'bomb');
  }
  clearBomb() {
    if (this.bombMesh) this.g.scene.remove(this.bombMesh);
    this.bombMesh = null; this.bombLight = null; this.bomb = null;
  }
  endRound(winner, reason) {
    const g = this.g;
    if (this.phase !== 'live') return;
    this.phase = 'post'; this.t = 5.5;
    this.score[winner]++;
    const loser = winner === 'CT' ? 'T' : 'CT';
    const bonus = reason === 'bomb' || reason === 'defuse' ? 3500 : 3250;
    const lossPay = Math.min(3400, 1400 + 500 * this.lossStreak[loser]);
    this.lossStreak[winner] = Math.max(0, this.lossStreak[winner] - 1); this.lossStreak[loser] = Math.min(4, this.lossStreak[loser] + 1);
    for (const a of g.actors) {
      if (a.team === winner) a.money += bonus;
      else a.money += (reason === 'time' && a.alive) ? 0 : lossPay + (a.team === 'T' && this.bomb && this.bomb.planted ? 800 : 0);
      a.money = Math.min(16000, a.money);
    }
    let mvp = null;
    for (const a of g.actors) if (a.team === winner && (a.mvpFlag || !mvp || a.roundKills > mvp.roundKills)) { if (!mvp || a.mvpFlag || a.roundKills > mvp.roundKills) mvp = a; }
    if (mvp) mvp.mvp++;
    for (const a of g.actors) a.mvpFlag = false;
    const why = { elim: '全歼敌方', time: '时间耗尽', bomb: '目标已摧毁', defuse: '炸弹已拆除' }[reason];
    g.center([winner === 'CT' ? '反恐精英获胜' : '恐怖分子获胜', winner === 'CT' ? 'win-ct' : 'win-t', 5, `${why}${mvp ? ' · 本局 MVP：' + mvp.name : ''}`]);
    g.sound2d((a) => [winner === a.team ? 'round_win' : 'round_lose', 0.55]);
    g.noFire = false;
  }
  finish() {
    const g = this.g;
    this.phase = 'over'; g.over = true; g.frozen = true; g.noFire = true;
    const w = this.score.CT > this.score.T ? 'CT' : 'T';
    g.center((P) => [P.team === w ? '胜利！' : '失败', w === 'CT' ? 'win-ct' : 'win-t', 9, `${w === 'CT' ? '反恐精英' : '恐怖分子'} ${this.score[w]} : ${this.score[w === 'CT' ? 'T' : 'CT']}`]);
    g.sound2d((a) => [a.team === w ? 'round_win' : 'round_lose', 0.6]);
  }
  onKill(v, k) { void v; void k; }
  dispose() { this.clearBomb(); }
}
