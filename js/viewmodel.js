'use strict';
// ======================================================================
//  viewmodel.js —— 第一人称持枪：独立场景/相机渲染（永不穿墙），
//                   摆动/甩枪/后坐/换弹/检视/滑铲倾斜/刀/投掷/安包动画
// ======================================================================
class Spring {
  constructor(k = 180, c = 22) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  update(dt) { const n = Math.max(1, Math.ceil(dt / 0.008)); const h = dt / n; for (let i = 0; i < n; i++) { this.v += (-this.k * this.x - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
}

class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.01, 20);
    this.scene.add(this.camera);
    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.hemi = new THREE.HemisphereLight(0xd9d6cf, 0x8f7454, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe0b4, 2.4);
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.mflight = new THREE.PointLight(0xffb060, 0, 2.5, 2); this.root.add(this.mflight);
    this.models = {};
    this.cur = null; this.curId = null;
    this.team = 'CT';
    this.t = 0; this.bob = 0; this.swayX = 0; this.swayY = 0; this.swayR = 0;
    this.kickZ = new Spring(260, 26); this.kickRX = new Spring(220, 24); this.kickRY = new Spring(200, 22); this.kickRZ = new Spring(200, 22);
    this.land = new Spring(120, 16);
    this.drawT = 1; this.drawDur = 0.6;
    this.reload = null; this.inspect = -1; this.knife = null; this.nade = null; this.plant = -1; this.bolt = -1; this.boltSnd = false;
    this.sprint = 0; this.slide = 0; this.slideDir = 1; this.hidden = false;
    this.flashT = 1;
    this.slideBack = 0;
    this.buildArms();
    this.buildFlash();
  }

  setTeam(team) {
    this.team = team;
    const M = Models.mats();
    const sl = team === 'T' ? M.sleeveT : M.sleeveCT;
    this.armR.material = sl; this.armL.material = sl;
  }
  setEnv(env, sunDir) { this.scene.environment = env; this.sunDir = sunDir.clone(); }
  setFov(hfov4x3, aspect) {
    this.camera.fov = 2 * Math.atan(Math.tan(hfov4x3 * 0.5 * DEG) * 0.75) / DEG;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
  }

  buildArms() {
    const M = Models.mats();
    const cap = new THREE.CapsuleGeometry(0.036, 0.26, 4, 12);
    this.armR = new THREE.Mesh(cap, M.sleeveCT); this.armL = new THREE.Mesh(cap, M.sleeveCT);
    this.handR = new THREE.Group(); this.handL = new THREE.Group();
    this.buildFist(this.handR, M.glove);
    const p2 = new THREE.Mesh(Models.rbox(0.07, 0.03, 0.1, 0.012, 2), M.glove); p2.position.set(0, -0.022, 0); this.handL.add(p2);
    const f2 = new THREE.Mesh(Models.rbox(0.02, 0.05, 0.085, 0.009, 2), M.glove); f2.position.set(0.035, 0.0, 0); this.handL.add(f2);
    const f3 = new THREE.Mesh(Models.rbox(0.02, 0.045, 0.06, 0.009, 2), M.glove); f3.position.set(-0.035, 0.002, 0.01); this.handL.add(f3);
    for (const o of [this.armR, this.armL, this.handR, this.handL]) this.root.add(o);
  }
  // 右手握拳（握把通道沿 +Y，食指在上；手背朝 +X，手指从前方(-Z)绕到左侧，拇指压在食指上）
  buildFist(root, mat) {
    const box = (w, h, d, r) => Models.rbox(w, h, d, r, 2);
    const segm = (ax, az, bx, bz, y, th, h) => {
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const m = new THREE.Mesh(box(th, h, L + th * 0.6, th * 0.45), mat);
      m.position.set((ax + bx) / 2, y, (az + bz) / 2); m.rotation.y = Math.atan2(dx, dz);
      root.add(m);
    };
    // 手背 + 掌根
    const back = new THREE.Mesh(box(0.024, 0.085, 0.07, 0.01), mat); back.position.set(0.026, -0.004, 0.012); back.rotation.y = -0.12; root.add(back);
    const heel = new THREE.Mesh(box(0.03, 0.07, 0.03, 0.012), mat); heel.position.set(0.004, -0.012, 0.03); root.add(heel);
    // 四指：近节(前方横过) → 中节(左侧) → 远节(收回掌心)
    const ys = [0.028, 0.008, -0.012, -0.031], sc = [1, 1.04, 0.98, 0.84];
    for (let i = 0; i < 4; i++) {
      const y = ys[i], k = sc[i], h = i === 3 ? 0.016 : 0.0185;
      segm(0.03, -0.012 * k, 0.004, -0.031 * k, y, 0.02, h);
      segm(0.004, -0.031 * k, -0.022 * k, -0.017 * k, y, 0.018, h * 0.97);
      segm(-0.022 * k, -0.017 * k, -0.022 * k, 0.004, y, 0.016, h * 0.94);
    }
    // 拇指：从掌根左上方绕过来压在食指中节上
    segm(0.006, 0.032, -0.02, 0.012, 0.042, 0.021, 0.02);
    segm(-0.02, 0.012, -0.028, -0.012, 0.045, 0.018, 0.018);
    // 手腕护口
    const cuff = new THREE.Mesh(box(0.05, 0.03, 0.055, 0.012), mat); cuff.position.set(0.022, -0.04, 0.045); cuff.rotation.x = 0.4; root.add(cuff);
  }
  buildFlash() {
    const S = Tex.sprites;
    const mk = (tex, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(5, 3.8, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 5; return m; };
    this.flash = new THREE.Group();
    this.flashFront = mk(S.flash, 0.16, 0.16); this.flash.add(this.flashFront);
    const s1 = mk(S.flashSide, 0.22, 0.09); s1.position.z = -0.1; s1.rotation.y = Math.PI / 2; this.flash.add(s1);
    const s2 = mk(S.flashSide, 0.22, 0.09); s2.position.z = -0.1; s2.rotation.set(0, Math.PI / 2, Math.PI / 2); this.flash.add(s2);
    this.flash.visible = false;
    this.root.add(this.flash);
  }

  model(id) {
    if (!this.models[id]) {
      const m = Models.weapon(id);
      m.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
      if (m.mag) m.magBase = m.mag.position.clone();
      if (m.slide) m.slideBase = m.slide.position.clone();
      if (m.bolt) { m.boltBase = m.bolt.position.clone(); m.boltRot = m.bolt.rotation.clone(); }
      this.models[id] = m;
    }
    return this.models[id];
  }
  setWeapon(id) {
    if (this.curId === id) return;
    if (this.cur) this.root.remove(this.cur.group);
    this.cur = this.model(id); this.curId = id;
    this.root.add(this.cur.group);
    if (this.cur.pin) this.cur.pin.visible = true;
    this.cur.group.visible = true;
  }

  // 事件（来自 actor.events）
  handle(ev, actor) {
    switch (ev.t) {
      case 'draw': this.setWeapon(ev.id); this.drawT = 0; this.bfAnim = ev.id === 'butterfly' ? { k: 'draw', t: 0, s: {} } : null; this.drawDur = Math.max(0.35, (WEAPONS[ev.id].draw || 1) * 0.6); this.reload = null; this.inspect = -1; this.knife = null; this.nade = null; this.plant = -1; this.bolt = -1; this.slideBack = 0; if (this.cur && this.cur.mag) this.cur.mag.visible = true; break;
      case 'fire': {
        const def = WEAPONS[ev.id];
        const heavy = def.type === 'sniper' ? 2.4 : def.id === 'deagle' ? 2.0 : def.type === 'pistol' ? 1.2 : 1;
        this.kickZ.v += 1.25 * heavy + rand(0, 0.3); this.kickRX.v += 4.0 * heavy + rand(0, 1.5); this.kickRY.v += rand(-1.2, 1.2); this.kickRZ.v += rand(-1.5, 1.5);
        if (!def.suppressed) { this.flashT = 0; this.flash.rotation.z = Math.random() * 6.28; const s = rand(0.85, 1.25) * (def.type === 'sniper' ? 1.6 : def.type === 'pistol' ? 0.8 : 1); this.flash.scale.set(s, s, s); }
        else { this.flashT = 0.6; }
        if (this.cur && this.cur.slide) this.slideBack = ev.empty ? 2 : 1;
        if (def.type === 'sniper') { this.bolt = -0.32; this.boltSnd = false; }
        this.inspect = -1;
        break;
      }
      case 'reload': this.reload = { t: 0, dur: ev.dur, empty: ev.empty, id: ev.id, s: {} }; this.inspect = -1; break;
      case 'inspect':
        if (this.curId === 'butterfly') { if (!this.bfAnim) this.bfAnim = { k: 'inspect', t: 0, s: {} }; }
        else if (!this.reload) this.inspect = 0;
        break;
      case 'slash': case 'stab': this.knife = { t: 0, type: ev.t, n: ev.n || 0 }; this.inspect = -1; if (this.bfAnim && this.bfAnim.k === 'inspect') this.bfAnim = null; break;
      case 'pin': this.nade = { s: 'pin', t: 0 }; break;
      case 'throw': this.nade = { s: 'throw', t: 0 }; break;
      case 'plant': this.plant = 0; break;
      case 'plantcancel': this.plant = -1; break;
      case 'land': this.land.v -= clamp(ev.v * 0.09, 0, 1.2); break;
      case 'jump': this.land.v += 0.25; break;
      case 'slide': this.slideDir = actor.slideRollDir; break;
      default: break;
    }
  }

  update(dt, actor, camQuat, mdx, mdy, sunVis) {
    this.t += dt;
    this.camera.quaternion.copy(camQuat);
    this.camera.updateMatrixWorld(true);
    if (this.sunDir) { this.sun.position.copy(this.sunDir).multiplyScalar(10); }
    this.sun.intensity = 2.4 * (0.2 + 0.8 * sunVis);
    this.hemi.intensity = 0.42 + 0.18 * sunVis;
    for (const ev of actor.events) this.handle(ev, actor);
    actor.events.length = 0;
    if (!this.cur) return;
    const def = actor.def, id = this.curId, m = this.cur;
    this.hidden = !!actor.scoped || !actor.alive;
    this.root.visible = !this.hidden;
    if (this.hidden) { this.flash.visible = false; this.mflight.intensity = 0; return; }

    const S = Settings.data;
    const type = def.type;
    const pose = ViewModel.POSE[id === 'butterfly' ? 'bfly' : type] || ViewModel.POSE.rifle;
    const pos = _vmP.fromArray(pose.p), rot = _vmR.fromArray(pose.r);
    pos.x += (S.vmX - 1) * 0.008; pos.z -= (S.vmY - 1) * 0.01; pos.y += (S.vmZ + 1) * 0.008;

    // 走动摆动（经典 FPS 式）
    const hs = actor.hspeed(), frac = clamp(hs / Math.max(def.speed, 1), 0, 1.4);
    const bobAmt = S.vmBob ? frac * (actor.onGround ? 1 : 0.25) * (1 - actor.slideAmt) : 0;
    this.bob += hs * dt * 1.55 * (actor.onGround ? 1 : 0.2);
    pos.x += Math.sin(this.bob) * 0.0075 * bobAmt;
    pos.y += -Math.abs(Math.sin(this.bob)) * 0.009 * bobAmt + 0.0045 * bobAmt;
    rot.z += Math.sin(this.bob) * 0.012 * bobAmt;
    pos.y += Math.sin(this.t * 1.7) * 0.0011; rot.x += Math.sin(this.t * 1.3) * 0.002;
    // 甩枪惯性
    this.swayX = damp(this.swayX, clamp(-mdx * 0.0006, -0.07, 0.07), 9, dt);
    this.swayY = damp(this.swayY, clamp(-mdy * 0.0006, -0.06, 0.06), 9, dt);
    rot.y += this.swayX; rot.x += this.swayY; rot.z += this.swayX * 0.8;
    pos.x += this.swayX * 0.06; pos.y += this.swayY * 0.04;
    // 下蹲 / 冲刺 / 滑铲
    pos.y -= actor.duckAmt * 0.007; rot.z += actor.duckAmt * 0.035;
    this.sprint = damp(this.sprint, actor.sprinting ? 1 : 0, 9, dt);
    pos.x += this.sprint * 0.02; pos.y -= this.sprint * 0.045; pos.z += this.sprint * 0.03;
    rot.x -= this.sprint * 0.28; rot.y += this.sprint * 0.7; rot.z += this.sprint * 0.2;
    this.slide = damp(this.slide, actor.sliding ? 1 : 0, 10, dt);
    rot.z += this.slide * 0.42 * this.slideDir; pos.y -= this.slide * 0.03; pos.x -= this.slide * 0.015 * this.slideDir; rot.x += this.slide * 0.06;
    // 着地 / 后坐弹簧
    const ld = this.land.update(dt);
    pos.y += ld * 0.03; rot.x += ld * 0.06;
    pos.z += this.kickZ.update(dt) * 0.018;
    rot.x += this.kickRX.update(dt) * 0.012;
    rot.y += this.kickRY.update(dt) * 0.01;
    rot.z += this.kickRZ.update(dt) * 0.008;
    // 掏枪（蝴蝶刀用自己的甩开动画）
    if (m.bfly) this.drawT = 1;
    if (this.drawT < 1) {
      this.drawT = Math.min(1, this.drawT + dt / this.drawDur);
      const k = 1 - easeOut(this.drawT);
      pos.y -= k * 0.22; rot.x -= k * 0.9; rot.z += k * 0.3;
    }
    // 左手默认目标（枪局部）
    const L = _vmL.copy(m.guard);
    let leftVis = !(type === 'knife' || type === 'grenade');
    let magOff = 0, magVis = true, magZ = 0;
    // 换弹
    if (this.reload) {
      const r = this.reload; r.t += dt / r.dur; const T = r.t;
      const snd = (key, at, name, vol = 0.55) => { if (!r.s[key] && T >= at) { r.s[key] = 1; Sound.play(name, { vol }); } };
      const tilt = smoothstep(0, 0.14, T) * (1 - smoothstep(0.82, 0.97, T));
      const pistol = type === 'pistol';
      rot.z += tilt * (pistol ? 0.3 : 0.5); rot.x += tilt * 0.14; pos.x -= tilt * 0.025; pos.y -= tilt * 0.012; rot.y -= tilt * 0.12;
      if (T < 0.45) { magOff = T < 0.2 ? 0 : -Math.pow((T - 0.2) / 0.25, 2) * 0.4; magVis = T < 0.42; }
      else if (T < 0.64) { const k = easeOut(seg(T, 0.45, 0.64)); magOff = -(1 - k) * 0.22; magZ = (1 - k) * 0.04; }
      const mw = m.magWell || m.guard;
      if (T < 0.16) L.lerpVectors(m.guard, _vmT.copy(mw).add(_vmT2.set(0, -0.07, 0)), seg(T, 0.06, 0.16));
      else if (T < 0.45) L.copy(mw).add(_vmT.set(0, -0.07 + magOff, 0));
      else if (T < 0.64) L.copy(mw).add(_vmT.set(0, -0.07 + magOff, magZ));
      else if (T < 0.74) { L.copy(mw).add(_vmT.set(0, -0.06, 0)); rot.x += Math.sin(seg(T, 0.64, 0.74) * Math.PI) * 0.03; }
      else if (r.empty && !pistol && m.bolt) {
        const k = seg(T, 0.74, 0.86);
        L.lerpVectors(_vmT.copy(mw).add(_vmT2.set(0, -0.06, 0)), _vmT2.copy(m.bolt.position || mw).add(_vmT3.set(0.03, 0.0, 0.02)), smoothstep(0, 0.4, k));
        if (k > 0.5) L.z += Math.sin((k - 0.5) * 2 * Math.PI) * 0.05;
        if (T > 0.86) L.lerpVectors(_vmT.copy(m.bolt.position).add(_vmT2.set(0.03, 0, 0.02)), m.guard, seg(T, 0.86, 0.97));
      } else L.lerpVectors(_vmT.copy(mw).add(_vmT2.set(0, -0.06, 0)), m.guard, seg(T, 0.74, 0.92));
      snd('o', 0.18, 'magout'); snd('i', 0.6, 'magin');
      if (r.empty) snd('b', pistol ? 0.8 : 0.8, pistol ? 'slideback' : (id === 'awp' ? 'awpbolt' : 'bolt'));
      if (r.empty && T > 0.8) this.slideBack = 0;
      if (T >= 1) this.reload = null;
    }
    if (m.mag && m.magBase) { m.mag.position.copy(m.magBase); m.mag.position.y += magOff; m.mag.position.z += magZ; m.mag.visible = magVis; }
    // AWP 拉栓
    if (this.bolt > -1 && m.bolt) {
      this.bolt += dt / 0.95;
      const T = this.bolt;
      if (T >= 0) {
        if (!this.boltSnd) { this.boltSnd = true; Sound.play('awpbolt', { vol: 0.55 }); }
        const up = smoothstep(0, 0.15, T) * (1 - smoothstep(0.75, 0.9, T));
        const back = smoothstep(0.2, 0.38, T) * (1 - smoothstep(0.5, 0.7, T));
        m.bolt.rotation.z = m.boltRot.z + up * 1.2;
        m.bolt.position.z = m.boltBase.z + back * 0.08;
        rot.z += up * 0.12; rot.x += up * 0.05;
        L.copy(m.bolt.position).add(_vmT.set(0.05, -0.01, 0.02));
        leftVis = true;
        if (T >= 1) { this.bolt = -1; m.bolt.position.copy(m.boltBase); m.bolt.rotation.copy(m.boltRot); }
      }
    }
    // 手枪套筒
    if (m.slide) {
      this.slideBack = this.slideBack === 1 ? (this._sbT = (this._sbT || 0) + dt, this._sbT > 0.05 ? (this._sbT = 0, 0) : 1) : this.slideBack;
      m.slide.position.z = m.slideBase.z + (this.slideBack ? 0.035 : 0);
    }
    // 检视
    if (this.inspect >= 0) {
      this.inspect += dt / 2.8;
      const T = this.inspect;
      const a = smoothstep(0, 0.2, T) * (1 - smoothstep(0.45, 0.6, T));
      const b = smoothstep(0.5, 0.65, T) * (1 - smoothstep(0.85, 1, T));
      rot.y += a * 0.9 - b * 0.5; rot.z += a * 0.6 - b * 0.9; rot.x += a * 0.2 + b * 0.25;
      pos.x -= a * 0.06 + b * 0.03; pos.z += a * 0.05;
      if (T >= 1) this.inspect = -1;
    }
    // 刀
    if (this.knife) {
      const k = this.knife; k.t += dt / (k.type === 'stab' ? 0.75 : 0.42);
      const T = k.t, sd = k.n % 2 ? -1 : 1;
      if (k.type === 'slash') {
        const s = Math.sin(clamp(T, 0, 1) * Math.PI);
        const sw = easeInOut(clamp(T * 1.3, 0, 1));
        rot.y += (0.9 - sw * 2.0) * sd * s * 1.2; rot.z += -0.6 * s * sd; rot.x += 0.3 * s;
        pos.x += (-0.08 * sw) * sd * s; pos.z -= 0.08 * s;
      } else {
        const wind = smoothstep(0, 0.25, T) * (1 - smoothstep(0.3, 0.4, T));
        const thrust = smoothstep(0.28, 0.4, T) * (1 - smoothstep(0.55, 0.95, T));
        pos.z += wind * 0.06 - thrust * 0.2; rot.x += wind * 0.5 - thrust * 0.2; pos.x -= thrust * 0.06; rot.y += thrust * 0.4;
      }
      if (T >= 1) this.knife = null;
    }
    // 投掷物
    if (this.nade) {
      const n = this.nade; n.t += dt;
      if (n.s === 'pin') {
        const k = smoothstep(0, 0.3, n.t);
        pos.z += k * 0.06; pos.y += k * 0.02; rot.x -= k * 0.5;
        if (m.pin) { m.pin.position.x = -0.018 - smoothstep(0.05, 0.25, n.t) * 0.08; m.pin.visible = n.t < 0.28; }
        leftVis = n.t < 0.35; L.set(-0.06, 0.06, 0);
      } else {
        const k = smoothstep(0, 0.12, n.t);
        pos.z -= k * 0.25; pos.y += k * 0.08; rot.x += k * 1.0;
        m.group.visible = n.t < 0.11;
      }
    } else if (type === 'grenade') { m.group.visible = true; if (m.pin) { m.pin.visible = true; m.pin.position.x = -0.018; } }
    // C4 安放
    if (this.plant >= 0) {
      this.plant += dt;
      pos.y -= smoothstep(0, 0.4, this.plant) * 0.04; pos.z -= smoothstep(0, 0.4, this.plant) * 0.04;
      rot.x += Math.sin(this.plant * 22) * 0.008;
      L.set(-0.03 + Math.sin(this.plant * 17) * 0.01, 0.1, -0.01);
    }
    if (type === 'c4') { leftVis = true; if (this.plant < 0) L.set(-0.08, 0.0, 0.03); }

    // 蝴蝶刀：关键帧驱动刀刃/咬柄转角 + 手腕动作
    if (m.bfly) {
      let A = 0, Bk = 0;
      const an = this.bfAnim;
      if (an) {
        an.t += dt;
        const keys = ViewModel.BFLY[an.k], v = sampleKeys(keys, an.t, _bfv);
        A = v[1]; Bk = v[2];
        rot.x += v[3]; rot.y += v[4]; rot.z += v[5]; pos.x += v[6]; pos.y += v[7]; pos.z += v[8];
        this._bfRoll = keys[0].length > 9 ? v[9] : 0;
        for (const [tt, name] of ViewModel.BFLY_SND[an.k]) if (an.t >= tt && !an.s[tt]) { an.s[tt] = 1; Sound.play(name, { vol: name === 'bfly_click' ? 0.55 : 0.4, rate: rand(0.95, 1.08) }); }
        if (an.t >= keys[keys.length - 1][0]) this.bfAnim = null;
      }
      m.bfly.blade.rotation.x = A; m.bfly.bite.rotation.x = Bk;
      if (!an) this._bfRoll = 0;
    }
    m.group.position.copy(pos);
    m.group.rotation.set(rot.x, rot.y, rot.z, 'YXZ');
    m.group.updateMatrix();
    m.group.matrixWorldNeedsUpdate = true;

    // 手臂
    const grip = _vmA.copy(m.grip).applyMatrix4(m.group.matrix);
    this.handR.position.copy(grip);
    this.handR.quaternion.setFromEuler(m.group.rotation);
    if (type === 'knife') { this.handR.rotateX(-Math.PI / 2); this.handR.rotateY(0.1); }
    else if (type === 'grenade') this.handR.rotateX(-0.2);
    const er = pose.er || ViewModel.POSE.rifle.er;
    const elbowR = _vmB.set(pos.x + er[0], pos.y + er[1], pos.z + er[2]);
    this.placeArm(this.armR, elbowR, _vmT2.copy(grip).add(_vmT3.set(0.01, -0.02, 0.05).applyQuaternion(this.handR.quaternion)));
    this.handL.visible = this.armL.visible = leftVis;
    if (leftVis) {
      const lw = _vmC.copy(L).applyMatrix4(m.group.matrix);
      this.handL.position.copy(lw);
      this.handL.quaternion.setFromEuler(m.group.rotation);
      const el = pose.el || ViewModel.POSE.rifle.el;
      const elbowL = _vmB.set(lw.x + el[0], lw.y + el[1], lw.z + el[2]);
      this.placeArm(this.armL, elbowL, _vmT2.copy(lw).add(_vmT3.set(-0.01, -0.025, 0.045).applyQuaternion(this.handL.quaternion)));
    }
    // 蝴蝶刀在指间沿刀柄轴滚转（手不动）
    if (m.bfly && this._bfRoll) { m.group.rotateZ(this._bfRoll); m.group.updateMatrix(); }
    // 枪口焰
    this.flashT += dt;
    const fv = this.flashT < 0.035;
    this.flash.visible = fv && !def.suppressed;
    this.mflight.intensity = this.flashT < 0.05 ? (def.suppressed ? 0.6 : 3.5) * (1 - this.flashT / 0.05) : 0;
    if (fv || this.mflight.intensity > 0) {
      const mp = _vmA.copy(m.muzzle.position).applyMatrix4(m.group.matrix);
      this.flash.position.copy(mp); this.flash.quaternion.copy(this.handR.quaternion);
      this.flashFront.rotation.z += 1.7;
      this.mflight.position.copy(mp);
    }
  }
  placeArm(mesh, a, b) {
    const d = _vmD.subVectors(b, a); const L = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L));
    mesh.scale.set(1, L / 0.332, 1);
  }
  muzzleWorld(out) {
    if (!this.cur) return out.set(0, 0, 0);
    const mp = _vmA.copy(this.cur.muzzle.position).applyMatrix4(this.cur.group.matrix);
    return out.copy(mp).applyMatrix4(this.camera.matrixWorld);
  }
}
// 各类武器的基础持握位姿（相机空间）：p 位置 r 旋转 er 右肘偏移(相对枪) el 左肘偏移(相对左手)
ViewModel.POSE = {
  rifle:   { p: [0.13, -0.132, -0.36], r: [0.0, 0.05, 0], er: [0.12, -0.2, 0.24], el: [-0.13, -0.22, 0.22] },
  smg:     { p: [0.12, -0.125, -0.33], r: [0.0, 0.05, 0], er: [0.12, -0.2, 0.24], el: [-0.12, -0.22, 0.2] },
  sniper:  { p: [0.135, -0.168, -0.33], r: [0.0, 0.045, 0], er: [0.12, -0.2, 0.24], el: [-0.13, -0.22, 0.22] },
  pistol:  { p: [0.095, -0.118, -0.34], r: [0.0, 0.07, 0], er: [0.12, -0.2, 0.26], el: [-0.13, -0.2, 0.24] },
  knife:   { p: [0.15, -0.15, -0.3], r: [0.25, -0.35, -0.25], er: [0.1, -0.2, 0.24], el: [-0.1, -0.2, 0.2] },
  bfly:    { p: [0.115, -0.125, -0.25], r: [0.12, 0.28, -0.55], er: [0.1, -0.2, 0.24], el: [-0.1, -0.2, 0.2] },
  grenade: { p: [0.14, -0.15, -0.3], r: [0.2, 0.2, -0.2], er: [0.1, -0.2, 0.24], el: [-0.1, -0.2, 0.2] },
  c4:      { p: [0.0, -0.18, -0.36], r: [0.55, 0, 0], er: [0.14, -0.2, 0.22], el: [-0.14, -0.2, 0.22] },
};
const _vmP = new THREE.Vector3(), _vmR = new THREE.Vector3(), _vmL = new THREE.Vector3(), _vmT = new THREE.Vector3(), _vmT2 = new THREE.Vector3(), _vmT3 = new THREE.Vector3();
const _vmA = new THREE.Vector3(), _vmB = new THREE.Vector3(), _vmC = new THREE.Vector3(), _vmD = new THREE.Vector3();

// 关键帧采样：keys = [[t, ch1, ch2, ...]]，段内 smoothstep 缓动
function sampleKeys(keys, t, out) {
  const n = keys.length;
  if (t <= keys[0][0]) { for (let i = 0; i < keys[0].length; i++) out[i] = keys[0][i]; return out; }
  if (t >= keys[n - 1][0]) { for (let i = 0; i < keys[n - 1].length; i++) out[i] = keys[n - 1][i]; return out; }
  let k = 0; while (k < n - 2 && t >= keys[k + 1][0]) k++;
  const a = keys[k], b = keys[k + 1], u = (t - a[0]) / (b[0] - a[0]), e = u * u * (3 - 2 * u);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * e;
  out[0] = t;
  return out;
}
const _bfv = [];
// 蝴蝶刀关键帧：[时间, α刀刃, β咬柄, 手腕rx, ry, rz, 位移x, y, z]；合拢 = (π, π)，打开 = (0, 0) ≡ (2π, 2π)
{
  const PI = Math.PI, P2 = PI * 2;
  ViewModel.BFLY = {
    // 掏出：合拢状态抬起 → 刀刃连同咬柄向下甩出 → 咬柄从上方甩回掌心锁定
    draw: [
      [0.0, PI, PI, 0.55, 0.0, 0.35, 0.02, -0.1, 0.03],
      [0.16, PI, PI, 0.18, 0.0, 0.12, 0.0, -0.025, 0.0],
      [0.4, P2, PI, -0.28, 0.0, -0.06, 0.0, 0.0, -0.02],
      [0.62, P2, P2, 0.14, 0.0, 0.02, 0.0, 0.006, 0.0],
      [0.82, P2, P2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ],
    // 检视：翻腕展示刀面 → 收刀（咬柄下甩合刃 → 整体上翻合拢）→ 合拢状态手指滚转一圈(zen rollover)
    //       → 甩开（刀刃下甩 → 咬柄回掌）→ 翻到另一面展示 → 复位
    inspect: [
      [0.0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0.5, 0, 0, -0.12, 0.38, 0.35, -0.03, 0.026, -0.03, 0],
      [1.05, 0, 0, -0.2, 0.42, 0.5, -0.032, 0.03, -0.03, 0],
      [1.3, 0, 0, 0.05, 0.2, 0.05, -0.01, 0.01, 0.0, 0],
      [1.55, 0, PI, 0.16, 0.15, 0.0, -0.01, 0.012, 0.0, 0],
      [1.85, PI, PI, -0.2, 0.12, 0.0, -0.01, 0.0, 0.0, 0],
      [2.0, PI, PI, 0.05, 0.1, 0.0, 0.0, 0.01, 0.0, 0],
      [2.65, PI, PI, 0.05, 0.1, 0.0, -0.01, 0.03, -0.01, P2],
      [2.8, PI, PI, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, P2],
      [3.1, P2, PI, -0.3, 0.1, 0.0, 0.0, 0.0, -0.02, P2],
      [3.38, P2, P2, 0.15, 0.1, 0.0, 0.0, 0.006, 0.0, P2],
      [3.6, P2, P2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, P2],
      [4.15, P2, P2, 0.3, -0.75, -0.15, -0.03, 0.03, -0.025, P2],
      [4.6, P2, P2, 0.34, -0.8, -0.22, -0.03, 0.032, -0.025, P2],
      [5.1, P2, P2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, P2],
    ],
  };
  ViewModel.BFLY_SND = {
    draw: [[0.18, 'bfly_swish'], [0.4, 'bfly_click'], [0.45, 'bfly_swish'], [0.62, 'bfly_click']],
    inspect: [[1.3, 'bfly_swish'], [1.55, 'bfly_click'], [1.6, 'bfly_swish'], [1.85, 'bfly_click'], [2.1, 'bfly_swish'], [2.85, 'bfly_swish'], [3.1, 'bfly_click'], [3.15, 'bfly_swish'], [3.38, 'bfly_click']],
  };
}
