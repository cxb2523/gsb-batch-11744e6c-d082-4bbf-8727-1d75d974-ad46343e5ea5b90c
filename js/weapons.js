'use strict';
// ======================================================================
//  weapons.js —— 武器数据（拟真弹道参数）与后坐图案（压枪）
//  散布单位：毫弧度(mrad)；后坐图案单位：度（俯仰上为正，偏航右为正）
// ======================================================================

// AK-47：先垂直上跳 ~9 发，再向左甩，再向右，再回左（经典“7”字）
const AK_PATTERN = [
  [0, 0], [0.45, 0.05], [1.2, 0.05], [2.15, -0.05], [3.2, 0.1], [4.25, 0.3], [5.2, 0.2], [6.0, -0.15], [6.6, -0.7], [7.05, -1.45],
  [7.35, -2.2], [7.55, -2.75], [7.75, -2.9], [7.85, -2.6], [7.95, -1.7], [8.05, -0.6], [8.15, 0.5], [8.25, 1.5], [8.3, 2.3], [8.4, 2.85],
  [8.5, 3.1], [8.55, 2.7], [8.65, 1.9], [8.7, 0.9], [8.8, -0.1], [8.85, -1.0], [8.95, -1.6], [9.0, -1.9], [9.05, -2.0], [9.1, -1.8],
];
// M4A4：上跳 → 右 → 左 → 右，幅度更小
const M4_PATTERN = [
  [0, 0], [0.35, 0], [0.95, 0.05], [1.7, 0.15], [2.5, 0.1], [3.3, -0.05], [4.0, 0.05], [4.55, 0.25], [5.0, 0.55], [5.3, 0.95],
  [5.5, 1.45], [5.65, 1.85], [5.8, 2.0], [5.9, 1.7], [6.0, 1.1], [6.05, 0.4], [6.1, -0.35], [6.15, -1.05], [6.2, -1.55], [6.25, -1.8],
  [6.3, -1.7], [6.35, -1.3], [6.4, -0.7], [6.4, 0.0], [6.45, 0.6], [6.5, 1.0], [6.55, 1.2], [6.55, 1.1], [6.6, 0.8], [6.6, 0.5],
];
function genPattern(n, step, decay, yawAmp, yawFreq, phase = 0) {
  const p = [[0, 0]];
  let pitch = 0;
  for (let i = 1; i < n; i++) {
    pitch += step * Math.exp(-(i - 1) * decay);
    p.push([pitch, yawAmp * Math.sin(i * yawFreq + phase) * Math.min(1, i / 4)]);
  }
  return p;
}

const WEAPONS = {
  knife: {
    id: 'knife', name: '匕首', short: '刀', slot: 3, type: 'knife', speed: 250 * U, draw: 0.6, price: 0, killReward: 1500, armorPen: 0.85, rangeMod: 1,
  },
  butterfly: {
    id: 'butterfly', name: '蝴蝶刀', short: '刀', slot: 3, type: 'knife', speed: 250 * U, draw: 0.6, price: 0, killReward: 1500, armorPen: 0.85, rangeMod: 1,
  },
  glock: {
    id: 'glock', name: 'Glock-18', slot: 2, type: 'pistol', team: 'T', price: 200, killReward: 300,
    damage: 30, armorPen: 0.47, rangeMod: 0.85, pen: 0.1, cycle: 0.15, auto: false, mag: 20, reserve: 120,
    reload: 2.27, draw: 1.0, speed: 240 * U,
    spread: 2.0, inaccStand: 7.0, inaccCrouch: 5.5, inaccMove: 16, inaccJump: 220, inaccLand: 60, inaccFire: 28, recovery: 0.35,
    pattern: genPattern(20, 0.95, 0.12, 0.35, 1.7), recoilRecover: 8, viewKick: [0.9, 0.3], tracer: 0, sound: 'glock', vol: 0.85,
  },
  usp: {
    id: 'usp', name: 'USP-S', slot: 2, type: 'pistol', team: 'CT', price: 200, killReward: 300,
    damage: 35, armorPen: 0.505, rangeMod: 0.91, pen: 0.12, cycle: 0.17, auto: false, mag: 12, reserve: 24,
    reload: 2.2, draw: 1.0, speed: 240 * U,
    spread: 1.5, inaccStand: 5.0, inaccCrouch: 4.0, inaccMove: 18, inaccJump: 220, inaccLand: 60, inaccFire: 25, recovery: 0.33,
    pattern: genPattern(12, 1.05, 0.1, 0.3, 2.1), recoilRecover: 7, viewKick: [1.0, 0.3], tracer: 0, sound: 'usp', vol: 0.7, suppressed: true,
  },
  deagle: {
    id: 'deagle', name: '沙漠之鹰', slot: 2, type: 'pistol', price: 700, killReward: 300,
    damage: 63, armorPen: 0.932, rangeMod: 0.81, pen: 0.24, cycle: 0.225, auto: false, mag: 7, reserve: 35,
    reload: 2.2, draw: 1.0, speed: 230 * U,
    spread: 2.0, inaccStand: 6.0, inaccCrouch: 4.0, inaccMove: 45, inaccJump: 300, inaccLand: 90, inaccFire: 55, recovery: 0.65,
    pattern: genPattern(7, 2.4, 0.05, 0.6, 2.4), recoilRecover: 3.6, viewKick: [2.6, 0.6], tracer: 0, sound: 'deagle', vol: 1.0,
  },
  mp9: {
    id: 'mp9', name: 'MP9', slot: 1, type: 'smg', price: 1250, killReward: 600,
    damage: 26, armorPen: 0.6, rangeMod: 0.87, pen: 0.12, cycle: 0.07, auto: true, mag: 30, reserve: 120,
    reload: 2.13, draw: 1.0, speed: 240 * U,
    spread: 1.2, inaccStand: 12, inaccCrouch: 9, inaccMove: 32, inaccJump: 150, inaccLand: 60, inaccFire: 6.5, recovery: 0.3,
    pattern: genPattern(30, 0.55, 0.09, 1.1, 0.55, 0.4), recoilRecover: 55, viewKick: [0.35, 0.3], tracer: 1, sound: 'mp9', vol: 0.85,
  },
  ak47: {
    id: 'ak47', name: 'AK-47', slot: 1, type: 'rifle', team: 'T', price: 2700, killReward: 300,
    damage: 36, armorPen: 0.775, rangeMod: 0.98, pen: 0.3, cycle: 0.1, auto: true, mag: 30, reserve: 90,
    reload: 2.43, draw: 1.0, speed: 215 * U,
    spread: 0.6, inaccStand: 6.4, inaccCrouch: 4.8, inaccMove: 140, inaccJump: 400, inaccLand: 150, inaccFire: 7.8, recovery: 0.38,
    pattern: AK_PATTERN, recoilScale: 0.92, recoilRecover: 55, viewKick: [0.55, 0.3], tracer: 1, sound: 'ak', vol: 1.0,
  },
  m4a4: {
    id: 'm4a4', name: 'M4A4', slot: 1, type: 'rifle', team: 'CT', price: 3100, killReward: 300,
    damage: 33, armorPen: 0.7, rangeMod: 0.97, pen: 0.28, cycle: 0.09, auto: true, mag: 30, reserve: 90,
    reload: 3.07, draw: 1.0, speed: 225 * U,
    spread: 0.5, inaccStand: 5.0, inaccCrouch: 3.7, inaccMove: 120, inaccJump: 400, inaccLand: 140, inaccFire: 7.0, recovery: 0.34,
    pattern: M4_PATTERN, recoilScale: 0.92, recoilRecover: 58, viewKick: [0.45, 0.25], tracer: 1, sound: 'm4', vol: 0.95,
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, type: 'sniper', price: 4750, killReward: 100,
    damage: 115, armorPen: 0.975, rangeMod: 0.99, pen: 0.48, cycle: 1.46, auto: false, mag: 5, reserve: 30,
    reload: 3.67, draw: 1.25, speed: 200 * U, scopedSpeed: 100 * U,
    spread: 0.2, inaccStand: 80, inaccScoped: 1.6, inaccCrouch: 1.2, inaccMove: 190, inaccJump: 520, inaccLand: 200, inaccFire: 110, recovery: 0.25,
    pattern: [[0, 0], [0, 0]], recoilRecover: 2, viewKick: [3.6, 0.6], tracer: 1, sound: 'awp', vol: 1.1,
    scope: true, zoom: [40, 12],
  },
  he: { id: 'he', name: '高爆手雷', short: 'HE', slot: 4, type: 'grenade', price: 300, speed: 245 * U, draw: 0.6, max: 1 },
  flash: { id: 'flash', name: '闪光弹', short: '闪光', slot: 4, type: 'grenade', price: 200, speed: 245 * U, draw: 0.6, max: 2 },
  smoke: { id: 'smoke', name: '烟雾弹', short: '烟雾', slot: 4, type: 'grenade', price: 300, speed: 245 * U, draw: 0.6, max: 1 },
  c4: { id: 'c4', name: 'C4 炸弹', short: 'C4', slot: 5, type: 'c4', speed: 250 * U, draw: 0.8, price: 0 },
};
const GRENADE_ORDER = ['he', 'flash', 'smoke'];

const EQUIP = {
  kevlar: { id: 'kevlar', name: '防弹衣', price: 650 },
  helmet: { id: 'helmet', name: '防弹衣+头盔', price: 1000 },
  defuser: { id: 'defuser', name: '拆弹器', price: 400, team: 'CT' },
};

const BUY_MENU = [
  { title: '手枪', items: ['glock', 'usp', 'deagle'] },
  { title: '冲锋枪', items: ['mp9'] },
  { title: '步枪', items: ['ak47', 'm4a4'] },
  { title: '狙击枪', items: ['awp'] },
  { title: '装备 / 投掷物', items: ['kevlar', 'helmet', 'defuser', 'he', 'flash', 'smoke'] },
];

function patternAt(def, idx) {
  const p = def.pattern;
  if (!p) return [0, 0];
  const sc = def.recoilScale || 1;
  const i0 = Math.floor(idx), f = idx - i0;
  if (i0 >= p.length - 1) { const l = p[p.length - 1]; return [l[0] * sc, l[1] * sc]; }
  const a = p[i0], b = p[i0 + 1];
  return [(a[0] + (b[0] - a[0]) * f) * sc, (a[1] + (b[1] - a[1]) * f) * sc];
}

class WeaponInst {
  constructor(id) {
    this.def = WEAPONS[id];
    this.id = id;
    this.mag = this.def.mag || 0;
    this.reserve = this.def.reserve || 0;
  }
}
