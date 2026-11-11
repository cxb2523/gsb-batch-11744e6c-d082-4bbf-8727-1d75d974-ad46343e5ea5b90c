'use strict';
// ======================================================================
//  core.js —— 常量 / 数学工具 / 设置 / 输入
// ======================================================================
const VERSION = '1.2.0';

const U = 0.0254;                 // 英寸 → 米（沿用经典 FPS 的英制单位制）
const DEG = Math.PI / 180;
const TICK_RATE = 128;            // 128 tick 固定步长物理
const TICK = 1 / TICK_RATE;

// 经典 FPS 移动参数（换算为米）
const PHYS = {
  gravity: 800 * U,               // 20.32 m/s²
  jumpImpulse: 301.993 * U,       // 7.67 m/s → 起跳高度约 57u
  friction: 5.2,
  stopSpeed: 80 * U,
  accelerate: 5.5,
  airAccelerate: 12,
  airWishCap: 30 * U,             // 空中加速上限(空中转向/连跳的根源)
  stepHeight: 18 * U,
  hullHalf: 16 * U,               // 32u 宽
  standH: 72 * U,
  crouchH: 54 * U,
  standEye: 64 * U,
  crouchEye: 46 * U,
  slideEye: 34 * U,
  walkMul: 0.52,
  duckMul: 0.34,
  sprintMul: 1.28,
  accurateFrac: 0.34,            // 低于最大速度 34% 视为“静止精度”
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
// 区间 [t0,t1] 内的局部进度
const seg = (t, t0, t1) => clamp((t - t0) / (t1 - t0), 0, 1);

// yaw=0 朝 -Z；yaw 增大为左转；pitch 正为抬头
function dirFromAngles(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}
function yawOf(dx, dz) { return Math.atan2(-dx, -dz); }

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function $(id) { return document.getElementById(id); }

// ======================================================================
//  设置（localStorage 仅作便利，失败不影响运行）
// ======================================================================
const SETTINGS_KEY = 'sandstorm_fps_settings_v1';
const DEFAULT_SETTINGS = {
  sens: 1.6, zoomSens: 1.0, rawInput: true, invertY: false,
  moveMode: 'walk', slide: true, toggleCrouch: false, kbLock: true, knife: 'butterfly',
  crossStyle: 'static', crossSize: 5, crossGap: 3, crossThick: 2, crossColor: '#3dff7f', crossDot: false, crossOutline: true,
  hitmarker: true,
  vmFov: 68, vmX: 1, vmY: 1, vmZ: -1, vmBob: true,
  volume: 0.7,
  quality: 'high', renderScale: 1.0, showFps: true, motionFx: true,
};
const Settings = {
  data: Object.assign({}, DEFAULT_SETTINGS),
  listeners: [],
  load() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) Object.assign(this.data, JSON.parse(s));
      // 早期版本的取值已废弃，未知值回落到默认
      if (this.data.moveMode !== 'walk' && this.data.moveMode !== 'sprint') this.data.moveMode = DEFAULT_SETTINGS.moveMode;
    } catch (e) { /* 隐私模式等 */ }
  },
  save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    for (const f of this.listeners) f(this.data);
  },
  reset() { this.data = Object.assign({}, DEFAULT_SETTINGS); this.save(); },
  onChange(f) { this.listeners.push(f); },
};
Settings.load();

// ======================================================================
//  输入
// ======================================================================
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'KeyC', 'KeyR', 'KeyF', 'KeyE', 'KeyQ', 'KeyG', 'KeyB', 'Tab', 'AltLeft', 'AltRight',
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);

const Input = {
  down: new Set(),
  pressed: new Set(),      // 本 tick 尚未消费的按下沿
  mouse: [false, false, false],
  mPressed: [false, false, false],
  mReleased: [false, false, false],
  dx: 0, dy: 0, wheel: 0,
  locked: false,
  canvas: null,
  skipMoves: 0,
  uiKeyHandler: null,      // 菜单层可拦截按键
  onUnlock: null,
  onLock: null,
  cursorX: 0, cursorY: 0,  // 虚拟光标(购买菜单)

  init(canvas) {
    this.canvas = canvas;
    this.cursorX = innerWidth / 2; this.cursorY = innerHeight / 2;
    window.addEventListener('keydown', (e) => {
      if (this.uiKeyHandler && this.uiKeyHandler(e, true)) { e.preventDefault(); return; }
      if (e.ctrlKey || e.code === 'ControlLeft' || e.code === 'ControlRight') this.lastCtrlT = performance.now();
      if (!this.locked) return;
      if (e.code === 'Escape' && !(typeof HUD !== 'undefined' && HUD.buyOpen)) { e.preventDefault(); this.unlock(); return; }
      if (GAME_KEYS.has(e.code) || e.ctrlKey || e.altKey || e.metaKey) e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.pressed.add(e.code); }
    }, true);
    window.addEventListener('keyup', (e) => {
      if (this.uiKeyHandler && this.uiKeyHandler(e, false)) { e.preventDefault(); }
      if (this.locked && (GAME_KEYS.has(e.code) || e.altKey)) e.preventDefault();
      this.down.delete(e.code);
    }, true);
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this.skipMoves > 0) { this.skipMoves--; return; }
      const mx = e.movementX || 0, my = e.movementY || 0;
      // Chromium 偶发的指针锁定尖峰过滤
      if (Math.abs(mx) > 1600 || Math.abs(my) > 1600) return;
      this.dx += mx; this.dy += my;
      this.cursorX = clamp(this.cursorX + mx, 0, innerWidth);
      this.cursorY = clamp(this.cursorY + my, 0, innerHeight);
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      if (e.button < 3) { this.mouse[e.button] = true; this.mPressed[e.button] = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button < 3) { if (this.mouse[e.button]) this.mReleased[e.button] = true; this.mouse[e.button] = false; }
    });
    document.addEventListener('wheel', (e) => { if (this.locked) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        this.skipMoves = 1;
        if (this.onLock) this.onLock();
      } else {
        this.down.clear(); this.mouse.fill(false);
        if (was && this.onUnlock) this.onUnlock();
      }
    });
    window.addEventListener('blur', () => { this.down.clear(); this.mouse.fill(false); });
  },

  lastCtrlT: -1e9,
  // 全屏 + Keyboard Lock：浏览器在全屏下才允许网页接管 Ctrl+W / Ctrl+D 等系统快捷键，
  // 否则下蹲(Ctrl)+移动 会触发浏览器快捷键，导致失去指针锁定（表现为“自动按了 Esc”）
  fullscreen() {
    if (!Settings.data.kbLock) return;
    const el = document.documentElement;
    const kb = () => { try { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {}); } catch (e) { /* 不支持 */ } };
    if (document.fullscreenElement) { kb(); return; }
    try {
      const p = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.then) p.then(kb).catch(() => {});
    } catch (e) { /* 不支持全屏 */ }
  },
  exitFullscreen() {
    try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) { /* ignore */ }
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
  },
  lock() {
    const c = this.canvas;
    try {
      const p = Settings.data.rawInput ? c.requestPointerLock({ unadjustedMovement: true }) : c.requestPointerLock();
      if (p && p.catch) {
        p.catch(() => {
          // 不支持原始输入时回退
          try { const p2 = c.requestPointerLock(); if (p2 && p2.catch) p2.catch(() => { if (this.onLockFail) this.onLockFail(); }); } catch (e) { if (this.onLockFail) this.onLockFail(); }
        });
      }
    } catch (e) {
      try { c.requestPointerLock(); } catch (e2) { if (this.onLockFail) this.onLockFail(); }
    }
    this.fullscreen();
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },

  isDown(code) { return this.down.has(code); },
  wasPressed(code) { return this.pressed.has(code); },
  takeMouse() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; },
  endTick() { this.pressed.clear(); this.mPressed.fill(false); this.mReleased.fill(false); this.wheel = 0; },
};
