'use strict';
// fxaudit 模块与 Effects.auditFx 的自动化测试（纯本地，无网络/凭据/浏览器依赖）
// 运行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FxAudit = require('../js/fxaudit.js');

// 递归断言对象中不存在 NaN / Infinity
function assertNoNaN(obj, where) {
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), `${where} 出现非有限数值`);
  } else if (obj && typeof obj === 'object') {
    for (const k of Object.keys(obj)) assertNoNaN(obj[k], `${where}.${k}`);
  }
}

function assertJsonSafe(obj, where) {
  const s = JSON.stringify(obj);
  assert.equal(typeof s, 'string', `${where} 必须可 JSON 序列化`);
  assert.ok(!s.includes('NaN') && !s.includes('Infinity'), `${where} 序列化结果不得含 NaN/Infinity`);
  assertNoNaN(JSON.parse(s), where);
}

// ------------------------------------------------------------------
// 正常路径：多系统混合占用
// ------------------------------------------------------------------
test('正常路径：混合占用时占用率与上限判定正确，贴花 i>max 报告环形覆盖', () => {
  const r = FxAudit.auditSnapshot({
    particles: {
      P: { max: 3000, n: 1500 },
      PA: { max: 1500, n: 1500 },
      smoke: { max: 600, n: 0 },
    },
    decals: {
      holes: { max: 320, count: 320, i: 500 },
      blood: { max: 80, count: 40, i: 40 },
      scorch: { max: 16, count: 3, i: 3 },
    },
    tracers: { total: 40, active: 5 },
    shells: { max: 96, count: 96 },
    flashes: { total: 10, active: 0 },
    lights: { total: 2, active: 1 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.status, 'ok');

  const P = r.systems.particles.find((s) => s.name === 'P');
  assert.equal(P.occupancy, 0.5);
  assert.equal(P.atLimit, false);
  const PA = r.systems.particles.find((s) => s.name === 'PA');
  assert.equal(PA.occupancy, 1);
  assert.equal(PA.atLimit, true);

  const holes = r.systems.decals.find((s) => s.name === 'holes');
  assert.equal(holes.atLimit, true);
  assert.equal(holes.ringWrapped, true, 'i=500 > max=320，应报告已进入环形覆盖');
  assert.equal(holes.nextSlot, 500 % 320);
  const blood = r.systems.decals.find((s) => s.name === 'blood');
  assert.equal(blood.ringWrapped, false);
  assert.equal(blood.occupancy, 0.5);

  const shells = r.systems.pools.find((s) => s.name === 'shells');
  assert.equal(shells.atLimit, true);

  // 总体占用率 = 总在用 / 总容量
  const used = 1500 + 1500 + 0 + 320 + 40 + 3 + 5 + 96 + 0 + 1;
  const cap = 3000 + 1500 + 600 + 320 + 80 + 16 + 40 + 96 + 10 + 2;
  assert.ok(Math.abs(r.overall.occupancy - used / cap) < 1e-12);

  // 超限项列表：PA、holes、shells 已达上限
  const names = r.overLimit.map((e) => e.name).sort();
  assert.deepEqual(names, ['PA', 'holes', 'shells']);

  assertJsonSafe(r, 'auditSnapshot(正常)');
});

// ------------------------------------------------------------------
// 负向路径：非法快照返回降级结果且无 NaN
// ------------------------------------------------------------------
test('负向路径：max 为 0 或 n 大于 max 时返回降级结果，无 NaN、不抛异常', () => {
  const r = FxAudit.auditSnapshot({
    particles: {
      P: { max: 0, n: 10 },
      PA: { max: 1500, n: 2000 },
      smoke: { max: 600, n: -3 },
    },
    decals: { holes: { max: 320, count: 400, i: 10 } },
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'degraded');
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.includes('max'), '原因应可读并提及 max');
  for (const s of r.systems.particles.concat(r.systems.decals)) {
    assert.equal(s.ok, false);
    assert.equal(s.status, 'invalid');
    assert.equal(typeof s.reason, 'string');
  }
  assertJsonSafe(r, 'auditSnapshot(非法)');

  // 快照本身不是对象也不抛异常
  const r2 = FxAudit.auditSnapshot(null);
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 'invalid');
  assertJsonSafe(r2, 'auditSnapshot(null)');
});

// ------------------------------------------------------------------
// 边界路径：n === max 判为已达上限；贴花 i === max 尚未回绕
// ------------------------------------------------------------------
test('边界路径：n 恰等于 max 判为已达上限，贴花 i 恰等于 max 尚未回绕', () => {
  const r = FxAudit.auditSnapshot({
    particles: { P: { max: 3000, n: 3000 } },
    decals: {
      holes: { max: 320, count: 320, i: 320 },
      blood: { max: 80, count: 80, i: 81 },
    },
  });
  assert.equal(r.ok, true);
  const P = r.systems.particles.find((s) => s.name === 'P');
  assert.equal(P.atLimit, true);
  assert.equal(P.occupancy, 1);
  const holes = r.systems.decals.find((s) => s.name === 'holes');
  assert.equal(holes.ringWrapped, false, 'i === max 时尚未回绕');
  assert.equal(holes.nextSlot, 0);
  const blood = r.systems.decals.find((s) => s.name === 'blood');
  assert.equal(blood.ringWrapped, true, 'i > max 时才进入环形覆盖');
});

// ------------------------------------------------------------------
// 淘汰模拟：新增与淘汰同时发生
// ------------------------------------------------------------------
test('淘汰模拟：新增与淘汰同时发生时的 n 变化与搬移次数', () => {
  // n=10, max=10，淘汰 4 个（默认扫描顺序前 4 个），再新增 5 个
  const r = FxAudit.simulateEviction({ n: 10, max: 10, spawn: 5, expire: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.expired, 4);
  assert.equal(r.movedSlots, 4, '前 4 个槽位死亡，每个都需从末尾搬移一次');
  assert.equal(r.nAfterEviction, 6);
  assert.equal(r.appended, 4, '淘汰后空出 4 个槽位可追加');
  assert.equal(r.overwritten, 1, '第 5 个新增触发随机覆盖');
  assert.equal(r.randomOverwrite, true);
  assert.equal(r.nAfter, 10);
  assert.equal(r.nExceedsMax, false, 'n 恒不超过 max');
  assert.ok(r.invariant.includes('n 恒不超过 max'));

  // 全部淘汰：n=3 全部到期，搬移 2 次（最后一次 i===n 不搬移）
  const r2 = FxAudit.simulateEviction({ n: 3, max: 96, spawn: 0, expire: 3 });
  assert.equal(r2.nAfterEviction, 0);
  assert.equal(r2.movedSlots, 2);
  assert.equal(r2.nAfter, 0);
  assert.equal(r2.randomOverwrite, false);

  // 显式指定死亡槽位：末尾粒子死亡时不发生搬移
  const r3 = FxAudit.simulateEviction({ n: 5, max: 10, spawn: 0, expire: 1, deadIndices: [4] });
  assert.equal(r3.movedSlots, 0);
  assert.equal(r3.nAfter, 4);

  // 未满时新增只追加、不覆盖
  const r4 = FxAudit.simulateEviction({ n: 2, max: 10, spawn: 3, expire: 0 });
  assert.equal(r4.nAfter, 5);
  assert.equal(r4.appended, 3);
  assert.equal(r4.randomOverwrite, false);

  assertJsonSafe(r, 'simulateEviction');
});

test('淘汰模拟：非法输入返回降级结果而非异常或 NaN', () => {
  const cases = [
    { n: 1, max: 0, spawn: 0, expire: 0 },
    { n: -1, max: 10, spawn: 0, expire: 0 },
    { n: 11, max: 10, spawn: 0, expire: 0 },
    { n: 1, max: 10, spawn: -2, expire: 0 },
    { n: 1, max: 10, spawn: 0, expire: -1 },
    null,
  ];
  for (const c of cases) {
    const r = FxAudit.simulateEviction(c);
    assert.equal(r.ok, false, JSON.stringify(c));
    assert.equal(r.status, 'invalid');
    assert.equal(typeof r.reason, 'string');
    assertJsonSafe(r, 'simulateEviction(非法)');
  }
});

// ------------------------------------------------------------------
// 清理范围投影：clearRound 与 clearAll 预期占用不同
// ------------------------------------------------------------------
test('清理范围：clearRound 与 clearAll 的预期占用不同且符合 effects.js 语义', () => {
  const r = FxAudit.auditSnapshot({
    particles: {
      P: { max: 3000, n: 900 },
      PA: { max: 1500, n: 300 },
      smoke: { max: 600, n: 200 },
    },
    decals: { holes: { max: 320, count: 100, i: 100 } },
    tracers: { total: 40, active: 8 },
    shells: { max: 96, count: 50 },
    flashes: { total: 10, active: 2 },
    lights: { total: 2, active: 1 },
  });
  assert.equal(r.ok, true);
  const { clearRound, clearAll } = r.projection;

  // clearRound 只清烟雾粒子、弹壳、曳光
  assert.equal(clearRound.expected.smoke, 0);
  assert.equal(clearRound.expected.shells, 0);
  assert.equal(clearRound.expected.tracers, 0);
  assert.equal(clearRound.expected.P, 900, 'clearRound 不应影响普通粒子');
  assert.equal(clearRound.expected.PA, 300);
  assert.equal(clearRound.expected.holes, 100, 'clearRound 不应影响贴花');

  // clearAll 额外清贴花与两个普通粒子系统
  assert.equal(clearAll.expected.P, 0);
  assert.equal(clearAll.expected.PA, 0);
  assert.equal(clearAll.expected.smoke, 0);
  assert.equal(clearAll.expected.holes, 0);
  assert.equal(clearAll.expected.shells, 0);
  assert.equal(clearAll.expected.tracers, 0);

  assert.ok(clearAll.occupancy < clearRound.occupancy, 'clearAll 后总体占用应低于 clearRound');
  assert.ok(clearRound.occupancy < r.overall.occupancy, 'clearRound 后总体占用应低于清理前');
  assertJsonSafe(r, 'projection');
});

// ------------------------------------------------------------------
// 集成：Effects.auditFx（用 THREE 桩加载真实 effects.js）
// ------------------------------------------------------------------
function loadEffects() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    addScaledVector() { return this; }
    subVectors() { return this; }
    normalize() { return this; }
    crossVectors() { return this; }
    multiplyScalar() { return this; }
    length() { return 0; }
    dot() { return 0; }
  }
  class Euler { constructor() { this.x = 0; this.y = 0; this.z = 0; } }
  class Quaternion {
    setFromUnitVectors() { return this; }
    setFromAxisAngle() { return this; }
    multiply() { return this; }
    setFromEuler() { return this; }
  }
  class Matrix4 { compose() { return this; } set() { return this; } }
  class Color { constructor() {} set() { return this; } copy() { return this; } setRGB() { return this; } }
  class PlaneGeometry { constructor() { this.index = null; this.attributes = { position: {}, uv: {} }; } }
  class CylinderGeometry { rotateZ() { return this; } }
  class InstancedBufferGeometry {
    constructor() { this.attributes = {}; this.instanceCount = 0; }
    setAttribute(n, a) { this.attributes[n] = a; }
  }
  class InstancedBufferAttribute {
    constructor(arr, size) { this.array = arr; this.itemSize = size; this.needsUpdate = false; }
    setUsage() { return this; }
  }
  class Material { constructor(o) { Object.assign(this, o || {}); } }
  class Mesh { constructor(g, m) { this.geometry = g; this.material = m; } }
  class InstancedMesh {
    constructor(g, m) { this.geometry = g; this.material = m; this.count = 0; this.instanceMatrix = { needsUpdate: false }; }
    setMatrixAt() {}
    setColorAt() {}
  }
  class Sprite {
    constructor(m) {
      this.material = m || {};
      this.position = new Vector3();
      this.scale = new Vector3(1, 1, 1);
      this.visible = false;
    }
  }
  class PointLight {
    constructor() { this.position = new Vector3(); this.color = new Color(); this.intensity = 0; this.distance = 0; }
  }
  const sandbox = {
    THREE: {
      Vector3, Euler, Quaternion, Matrix4, Color,
      PlaneGeometry, CylinderGeometry, InstancedBufferGeometry, InstancedBufferAttribute,
      ShaderMaterial: Material, MeshBasicMaterial: Material, MeshStandardMaterial: Material, SpriteMaterial: Material,
      Mesh, InstancedMesh, Sprite, PointLight,
      DynamicDrawUsage: 1, AdditiveBlending: 2, NormalBlending: 1, CustomBlending: 3, OneFactor: 4,
    },
    Tex: { sprites: { atlas: null, hole: null, blood: null, scorch: null, tracer: null, flash: null } },
    rand: (a = 0) => a,
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    smoothstep: (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
  };
  vm.createContext(sandbox);
  const fxauditCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'fxaudit.js'), 'utf8');
  vm.runInContext(fxauditCode, sandbox, { filename: 'fxaudit.js' });
  const effectsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'effects.js'), 'utf8');
  vm.runInContext(effectsCode, sandbox, { filename: 'effects.js' });
  return { Effects: vm.runInContext('Effects', sandbox), sandbox };
}

test('Effects.auditFx：init 未调用时返回“不可诊断”而不抛异常', () => {
  const { Effects } = loadEffects();
  const r = Effects.auditFx();
  assert.equal(r.ok, false);
  assert.equal(r.status, 'unavailable');
  assert.equal(typeof r.reason, 'string');
  assertJsonSafe(r, 'auditFx(未初始化)');
});

test('Effects.auditFx：init 后返回真实快照审计，clearRound/clearAll 行为不变', () => {
  const { Effects, sandbox } = loadEffects();
  const scene = { add() {} };
  Effects.init(scene, {});
  const r = Effects.auditFx();
  assert.equal(r.ok, true);
  const maxOf = (kind, name) => r.systems[kind].find((s) => s.name === name).max;
  assert.equal(maxOf('particles', 'P'), 3000);
  assert.equal(maxOf('particles', 'PA'), 1500);
  assert.equal(maxOf('particles', 'smoke'), 600);
  assert.equal(maxOf('decals', 'holes'), 320);
  assert.equal(maxOf('decals', 'blood'), 80);
  assert.equal(maxOf('decals', 'scorch'), 16);
  assert.equal(maxOf('pools', 'tracers'), 40);
  assert.equal(maxOf('pools', 'shells'), 96);
  assert.equal(maxOf('pools', 'flashes'), 10);
  assert.equal(maxOf('pools', 'lights'), 2);
  // 刚 init 后粒子/贴花/弹壳均为空；仅 2 个点光源处于初始点亮窗口（t=0 < dur=0.05）
  for (const s of r.systems.particles.concat(r.systems.decals)) assert.equal(s.used, 0);
  assert.equal(r.systems.pools.find((s) => s.name === 'lights').used, 2);
  assert.equal(r.overall.used, 2);

  // 抛一个弹壳后快照应反映在用数量
  const THREE = sandbox.THREE;
  Effects.shell(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 2, 0), false);
  const r2 = Effects.auditFx();
  assert.equal(r2.systems.pools.find((s) => s.name === 'shells').used, 1);
  assert.equal(r2.overall.used, 3);

  // clearRound 清空弹壳；clearAll 不抛异常且审计仍可用
  Effects.clearRound();
  assert.equal(Effects.auditFx().systems.pools.find((s) => s.name === 'shells').used, 0);
  Effects.clearAll();
  const r3 = Effects.auditFx();
  assert.equal(r3.ok, true);
  assert.equal(r3.overall.used, 2, 'clearAll 后只剩初始窗口内的 2 个点光源');
  assertJsonSafe(r3, 'auditFx(init 后)');
});
