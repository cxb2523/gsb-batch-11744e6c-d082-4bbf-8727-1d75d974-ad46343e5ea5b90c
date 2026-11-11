'use strict';
// ======================================================================
//  fxaudit.js —— 特效预算审计（纯函数模块）
//
//  与 effects.js 的真实语义保持一致：
//   - ParticleSys：n 永不超过 max；spawn 在 n<max 时追加，否则随机覆盖；
//     update 淘汰时用末尾粒子搬移到被淘汰槽位（swap-remove）并递减 n。
//   - DecalSet：count 封顶于 max，i 无限自增并按 i % max 回绕覆盖；
//     i > max 视为已进入环形覆盖阶段（i === max 时尚未回绕）。
//   - clearRound 只清空烟雾粒子、弹壳与曳光；
//     clearAll 在此基础上再清空全部贴花与普通/加色粒子系统。
//
//  约束：不读写全局状态、不创建 THREE 对象、不访问 DOM；
//        所有输出均为可 JSON 序列化的纯数据；非法输入返回降级结果，
//        绝不抛异常、绝不产生 NaN。
// ======================================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FxAudit = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const VERSION = 1;

  // ------------------------------------------------------------------
  // 基础工具
  // ------------------------------------------------------------------
  function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
  function isNonNegInt(v) { return isNum(v) && Number.isInteger(v) && v >= 0; }

  function fmt(v) {
    if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    return String(v);
  }

  // 接受数组（[{name, ...}]）或映射（{name: {...}}）两种快照写法
  function normalizeSystems(group, kind) {
    const out = [];
    if (group == null) return out;
    if (Array.isArray(group)) {
      group.forEach((s, idx) => {
        if (s && typeof s === 'object') out.push(Object.assign({ kind, name: s.name != null ? String(s.name) : kind + '_' + idx }, s));
        else out.push({ kind, name: kind + '_' + idx, __invalid: '条目必须是对象，收到 ' + fmt(s) });
      });
    } else if (typeof group === 'object') {
      for (const k of Object.keys(group)) {
        const s = group[k];
        if (s && typeof s === 'object') out.push(Object.assign({ kind, name: k }, s));
        else out.push({ kind, name: k, __invalid: '条目必须是对象，收到 ' + fmt(s) });
      }
    }
    return out;
  }

  function invalidEntry(kind, name, reason) {
    return {
      kind, name, ok: false, status: 'invalid', reason,
      max: null, used: null, occupancy: null, atLimit: null,
    };
  }

  // ------------------------------------------------------------------
  // 各子系统审计
  // ------------------------------------------------------------------
  function auditParticle(sys) {
    const name = sys.name;
    if (sys.__invalid) return invalidEntry('particle', name, sys.__invalid);
    const max = sys.max, n = sys.n;
    if (!isNum(max) || max <= 0) return invalidEntry('particle', name, '粒子系统 max 必须为正数，收到 ' + fmt(max));
    if (!isNum(n) || n < 0) return invalidEntry('particle', name, '粒子系统 n 不能为负或非数值，收到 ' + fmt(n));
    if (n > max) return invalidEntry('particle', name, '粒子系统 n（' + n + '）大于 max（' + max + '），违反 n <= max 不变式');
    return {
      kind: 'particle', name, ok: true, status: 'ok', reason: null,
      max, used: n, occupancy: n / max, atLimit: n === max,
    };
  }

  function auditDecal(sys) {
    const name = sys.name;
    if (sys.__invalid) return invalidEntry('decal', name, sys.__invalid);
    const max = sys.max, count = sys.count, i = sys.i;
    if (!isNum(max) || max <= 0) return invalidEntry('decal', name, '贴花集 max 必须为正数，收到 ' + fmt(max));
    if (!isNum(count) || count < 0) return invalidEntry('decal', name, '贴花集 count 不能为负或非数值，收到 ' + fmt(count));
    if (count > max) return invalidEntry('decal', name, '贴花集 count（' + count + '）大于 max（' + max + '），违反 count <= max 封顶语义');
    if (!isNum(i) || i < 0) return invalidEntry('decal', name, '贴花集游标 i 不能为负或非数值，收到 ' + fmt(i));
    const r = {
      kind: 'decal', name, ok: true, status: 'ok', reason: null,
      max, used: count, count, i, occupancy: count / max, atLimit: count === max,
      // i 按 i % max 回绕写槽：i > max 表示已开始覆盖旧贴花；i === max 恰未回绕
      ringWrapped: i > max,
      nextSlot: i % max,
    };
    return r;
  }

  // 固定池：曳光 / 弹壳 / 枪口焰 / 点光源。接受 {total, used}、{total, active} 或 {max, count}
  function auditPool(name, spec) {
    if (!spec || typeof spec !== 'object') return invalidEntry('pool', name, '固定池快照必须是对象，收到 ' + fmt(spec));
    const total = spec.total != null ? spec.total : spec.max;
    const used = spec.used != null ? spec.used : (spec.active != null ? spec.active : spec.count);
    if (!isNum(total) || total <= 0) return invalidEntry('pool', name, '固定池 ' + name + ' 的总量必须为正数，收到 ' + fmt(total));
    if (!isNum(used) || used < 0) return invalidEntry('pool', name, '固定池 ' + name + ' 的在用量不能为负或非数值，收到 ' + fmt(used));
    if (used > total) return invalidEntry('pool', name, '固定池 ' + name + ' 的在用量（' + used + '）大于总量（' + total + '）');
    return {
      kind: 'pool', name, ok: true, status: 'ok', reason: null,
      max: total, used, occupancy: used / total, atLimit: used === total,
    };
  }

  // ------------------------------------------------------------------
  // 清理范围投影：clearRound / clearAll 之后的预期占用
  // ------------------------------------------------------------------
  // clearRound：烟雾粒子、弹壳、曳光清零（effects.js clearRound 的真实范围）
  // clearAll：在 clearRound 基础上再清零全部贴花与普通/加色粒子
  function clearedBy(scope, entry) {
    if (entry.kind === 'particle') {
      if (scope === 'round') return entry.name === 'smoke';
      return true; // clearAll 清空全部粒子系统（P、PA、smoke）
    }
    if (entry.kind === 'decal') return scope === 'all';
    // pool
    return entry.name === 'shells' || entry.name === 'tracers';
  }

  function projectScope(entries, scope) {
    const expected = {};
    let used = 0, capacity = 0;
    for (const e of entries) {
      if (!e.ok) continue;
      const after = clearedBy(scope, e) ? 0 : e.used;
      expected[e.name] = after;
      used += after;
      capacity += e.max;
    }
    return {
      scope: scope === 'round' ? 'clearRound' : 'clearAll',
      expected,
      used,
      capacity,
      occupancy: capacity > 0 ? used / capacity : null,
    };
  }

  // ------------------------------------------------------------------
  // 入口一：整份特效配置快照审计
  // ------------------------------------------------------------------
  function auditSnapshot(snapshot) {
    const empty = { particles: [], decals: [], pools: [] };
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return {
        ok: false, status: 'invalid', version: VERSION,
        reason: '快照必须是对象，收到 ' + fmt(snapshot),
        systems: empty, overall: { used: 0, capacity: 0, occupancy: null },
        overLimit: [],
        projection: { clearRound: projectScope([], 'round'), clearAll: projectScope([], 'all') },
      };
    }

    const particles = normalizeSystems(snapshot.particles, 'particle').map(auditParticle);
    const decals = normalizeSystems(snapshot.decals, 'decal').map(auditDecal);
    const pools = [];
    const poolSpecs = { tracers: snapshot.tracers, shells: snapshot.shells, flashes: snapshot.flashes, lights: snapshot.lights };
    for (const name of Object.keys(poolSpecs)) {
      if (poolSpecs[name] != null) pools.push(auditPool(name, poolSpecs[name]));
    }

    const issues = [];
    const valid = [];
    for (const e of particles.concat(decals, pools)) {
      if (e.ok) valid.push(e);
      else issues.push('[' + e.kind + ':' + e.name + '] ' + e.reason);
    }

    let used = 0, capacity = 0;
    const overLimit = [];
    for (const e of valid) {
      used += e.used;
      capacity += e.max;
      if (e.atLimit) overLimit.push({ kind: e.kind, name: e.name, max: e.max, used: e.used });
    }

    return {
      ok: issues.length === 0,
      status: issues.length === 0 ? 'ok' : 'degraded',
      version: VERSION,
      reason: issues.length === 0 ? null : issues.join('；'),
      systems: { particles, decals, pools },
      overall: {
        used,
        capacity,
        occupancy: capacity > 0 ? used / capacity : null,
      },
      overLimit,
      projection: {
        clearRound: projectScope(valid, 'round'),
        clearAll: projectScope(valid, 'all'),
      },
    };
  }

  // ------------------------------------------------------------------
  // 入口二：粒子淘汰模拟（swap-remove + 追加/随机覆盖）
  // ------------------------------------------------------------------
  // 输入：{ n, max, spawn, expire, deadIndices? }
  //   n      当前粒子数；max 容量；spawn 本次新增数；expire 本次寿命到期淘汰数
  //   deadIndices 可选：显式指定哪些槽位寿命到期（用于精确复现）；
  //               缺省时假设到期粒子为当前数组中扫描顺序的前 expire 个。
  // 输出：淘汰与新增后的 n、搬移槽位次数、是否发生随机覆盖；
  //       不变式：n 恒不超过 max。
  function simulateEviction(input) {
    const INVARIANT = 'n 恒不超过 max：淘汰只会减小 n，新增在 n 达到 max 后转为随机覆盖已有槽位';
    const bad = (reason) => ({
      ok: false, status: 'invalid', reason,
      max: null, nBefore: null, expired: null, movedSlots: null,
      nAfterEviction: null, spawned: null, appended: null, overwritten: null,
      randomOverwrite: null, nAfter: null, nExceedsMax: null,
      invariant: INVARIANT,
    });

    if (!input || typeof input !== 'object') return bad('输入必须是对象，收到 ' + fmt(input));
    const max = input.max, n = input.n;
    const spawn = input.spawn == null ? 0 : input.spawn;
    const expire = input.expire == null ? 0 : input.expire;
    if (!isNum(max) || max <= 0) return bad('max 必须为正数，收到 ' + fmt(max));
    if (!isNonNegInt(n)) return bad('n 必须是非负整数，收到 ' + fmt(n));
    if (n > max) return bad('n（' + n + '）大于 max（' + max + '），违反 n <= max 不变式');
    if (!isNonNegInt(spawn)) return bad('本次新增粒子数 spawn 必须是非负整数，收到 ' + fmt(spawn));
    if (!isNonNegInt(expire)) return bad('本次淘汰数 expire 必须是非负整数，收到 ' + fmt(expire));

    // 死亡槽位集合：显式给定或取扫描顺序前 expire 个；死亡数不可能超过现存粒子数
    let dead;
    if (input.deadIndices != null) {
      if (!Array.isArray(input.deadIndices) || input.deadIndices.some((d) => !isNonNegInt(d) || d >= n)) {
        return bad('deadIndices 必须是 [0, n) 内的非负整数数组');
      }
      dead = new Set(input.deadIndices);
    } else {
      dead = new Set();
      for (let k = 0; k < Math.min(expire, n); k++) dead.add(k);
    }

    // 淘汰阶段：忠实复现 ParticleSys.update 的 swap-remove ——
    // 每淘汰一个粒子，n 减 1；若被淘汰的不是末尾槽位，则把末尾粒子搬移过来（计一次 copy）
    const alive = [];
    for (let k = 0; k < n; k++) alive.push(!dead.has(k));
    let m = n, movedSlots = 0;
    for (let i = 0; i < m; i++) {
      if (!alive[i]) {
        m--;
        if (i !== m) { alive[i] = alive[m]; movedSlots++; }
        i--;
      }
    }
    const expired = n - m;

    // 新增阶段：n < max 时追加；达到 max 后每次 spawn 随机覆盖一个已有槽位
    let cur = m, appended = 0, overwritten = 0;
    for (let k = 0; k < spawn; k++) {
      if (cur < max) { cur++; appended++; }
      else overwritten++;
    }

    return {
      ok: true, status: 'ok', reason: null,
      max, nBefore: n, expired, movedSlots,
      nAfterEviction: m, spawned: spawn, appended, overwritten,
      randomOverwrite: overwritten > 0,
      nAfter: cur,
      nExceedsMax: cur > max,
      invariant: INVARIANT,
    };
  }

  return { VERSION, auditSnapshot, simulateEviction };
});
