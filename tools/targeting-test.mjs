// 技能目标解析与名次表一致性 —— 纯 Node 自动化测试。
// 不依赖网络、真实凭据或 GPU：全部使用本地自造样例。
// 运行：node tools/targeting-test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSkillTarget, RELEASE_REASONS, TARGET_FAILURES } from '../src/targeting.js';
import { SKILLS } from '../src/powerups.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n     ') : err}`);
  }
}

// 与 main.js castAttack 完全一致的参考实现（只复刻其目标查找部分，不触碰任何运行态）。
// 用于验证纯函数模块的解析结果与真实命中逐项一致。
function castAttackReference({ rows, opponents, place }) {
  const row = rows.find((r) => r.place === place);
  if (!row || row.me) return { blocked: true, opponent: null };
  const o = opponents.find((x) => x.id === row.id) || opponents.find((x) => x.name === row.name);
  return { blocked: false, opponent: o || null };
}

// 三名选手的标准样例：玩家 + 两名真人对手（带唯一 id，模拟联机房间）
function sampleThreeRacers() {
  const rows = [
    { place: 1, id: 'r-nihon', name: '霓虹', me: false },
    { place: 2, id: 'r-chifeng', name: '赤风', me: false },
    { place: 3, id: 'r-me', name: '你', me: true },
  ];
  const opponents = [
    { id: 'r-nihon', name: '霓虹', remote: true, z: 120 },
    { id: 'r-chifeng', name: '赤风', remote: true, z: 80 },
    { id: 'r-me', name: '你', remote: false, z: 40 },
  ];
  return { rows, opponents };
}

// 单机 AI 样例：AI 的 id 均为 null（与 race.js _makeGhost / rows 实际输出一致）
function sampleAIRacers() {
  return {
    rows: [
      { place: 1, id: null, name: '霓虹', me: false },
      { place: 2, id: null, name: '赤风', me: false },
      { place: 3, id: null, name: '你', me: true },
    ],
    opponents: [
      { id: null, name: '霓虹', remote: false, z: 120 },
      { id: null, name: '赤风', remote: false, z: 80 },
    ],
  };
}

const baseInput = (over = {}) => ({
  playerZ: 40,
  rows: sampleThreeRacers().rows,
  opponents: sampleThreeRacers().opponents,
  skillKey: 'headwind',
  skills: SKILLS,
  place: 2,
  mode: 'race',
  playerAlive: true,
  ...over,
});

console.log('targeting · 正常路径');

test('对第 2 名释放逆风：解析目标与 castAttack 参考命中逐项一致（id 与 name）', () => {
  const { rows, opponents } = sampleThreeRacers();
  const audit = resolveSkillTarget(baseInput({ rows, opponents, place: 2 }));
  const ref = castAttackReference({ rows, opponents, place: 2 });

  assert.equal(audit.canRelease, true);
  assert.equal(audit.isAttack, true);
  assert.equal(audit.failureCode, null);
  assert.ok(ref.opponent, '参考实现应命中对手');
  assert.ok(audit.target, '审计应解析出目标');
  assert.equal(audit.target.id, ref.opponent.id);
  assert.equal(audit.target.name, ref.opponent.name);
  assert.equal(audit.target.name, '赤风');
  assert.equal(audit.target.matchedBy, 'id');
  // 检查项顺序与通过状态
  assert.deepEqual(
    audit.checks.map((c) => c.name),
    ['skill_equipped', 'skill_known', 'race_mode', 'player_alive', 'attack_type', 'place_exists', 'not_self', 'row_unique', 'opponent_exists']
  );
  assert.ok(audit.checks.every((c) => c.pass), '所有检查项应通过');
});

test('对第 1 名释放锁跳：同样与参考实现一致', () => {
  const { rows, opponents } = sampleThreeRacers();
  const audit = resolveSkillTarget(baseInput({ rows, opponents, skillKey: 'lockjump', place: 1 }));
  const ref = castAttackReference({ rows, opponents, place: 1 });
  assert.equal(audit.canRelease, true);
  assert.equal(audit.target.id, ref.opponent.id);
  assert.equal(audit.target.name, ref.opponent.name);
  assert.equal(audit.target.name, '霓虹');
});

test('单机 AI（id 全为 null）：复刻 null===null 特性，仍与 castAttack 命中一致并标注重复 id', () => {
  const { rows, opponents } = sampleAIRacers();
  // castAttack 里 x.id === row.id → null === null 恒真，所以选任何 AI 名次都命中第一个对手
  const audit2 = resolveSkillTarget(baseInput({ rows, opponents, place: 2 }));
  const ref2 = castAttackReference({ rows, opponents, place: 2 });
  assert.equal(audit2.canRelease, true);
  assert.equal(audit2.duplicates.hasDuplicateId, true, 'null id 出现多次应被标为重复 id');
  assert.deepEqual(audit2.duplicates.duplicateIds, [null]);
  assert.equal(audit2.target.matchedBy, 'id');
  assert.equal(audit2.target.id, ref2.opponent.id);
  assert.equal(audit2.target.name, ref2.opponent.name);
  assert.equal(audit2.target.name, '霓虹', 'castAttack 的 id find 取第一个对手');
});

console.log('targeting · 负向路径');

test('选中自己：target 为 null，原因=选中自己，且语义上技能槽不应被清空', () => {
  const { rows, opponents } = sampleThreeRacers();
  const myPlace = rows.find((r) => r.me).place;
  // 用外部变量模拟技能槽：解析模块不得改写它
  let slot = 'headwind';
  const audit = resolveSkillTarget(baseInput({ rows, opponents, place: myPlace, skillKey: slot }));
  assert.equal(audit.canRelease, false);
  assert.equal(audit.target, null);
  assert.equal(audit.failureCode, 'TARGET_SELF');
  assert.equal(audit.failureReason, TARGET_FAILURES.TARGET_SELF);
  assert.equal(audit.checks.find((c) => c.name === 'not_self').pass, false);
  assert.equal(slot, 'headwind', '模块不得清空调用方的技能槽');
});

test('名次不存在（第 9 名）：target 为 null，原因=名次不存在', () => {
  const { rows, opponents } = sampleThreeRacers();
  let slot = 'headwind';
  const audit = resolveSkillTarget(baseInput({ rows, opponents, place: 9, skillKey: slot }));
  assert.equal(audit.canRelease, false);
  assert.equal(audit.target, null);
  assert.equal(audit.failureCode, 'PLACE_NOT_FOUND');
  assert.equal(audit.failureReason, TARGET_FAILURES.PLACE_NOT_FOUND);
  assert.equal(audit.checks.find((c) => c.name === 'place_exists').pass, false);
  assert.equal(slot, 'headwind', '模块不得清空调用方的技能槽');
});

test('名次行存在但对手已被移除：原因=对手已不存在', () => {
  const { rows } = sampleThreeRacers();
  const audit = resolveSkillTarget(baseInput({ rows, opponents: [], place: 1 }));
  assert.equal(audit.canRelease, false);
  assert.equal(audit.target, null);
  assert.equal(audit.failureCode, 'OPPONENT_GONE');
  assert.equal(audit.failureReason, TARGET_FAILURES.OPPONENT_GONE);
  const ref = castAttackReference({ rows, opponents: [], place: 1 });
  assert.equal(ref.opponent, null, '参考实现同样不命中 → castAttack 会保留技能槽');
});

console.log('targeting · 边界路径：重复 id / name');

test('同一 id 在名次表重复：按 id 优先取第一个匹配，并标注重复', () => {
  // 两个行都带 id='r1'，对手数组里也有两个同 id 对手（顺序不同）
  const rows = [
    { place: 1, id: 'r1', name: '夜航', me: false },
    { place: 2, id: 'r1', name: '赤风', me: false },
    { place: 3, id: 'me', name: '你', me: true },
  ];
  const opponents = [
    { id: 'r1', name: '赤风', remote: true, z: 80 },
    { id: 'r1', name: '夜航', remote: true, z: 120 },
    { id: 'me', name: '你', remote: false, z: 40 },
  ];
  const audit = resolveSkillTarget(baseInput({ rows, opponents, place: 1 }));
  const ref = castAttackReference({ rows, opponents, place: 1 });

  assert.equal(audit.canRelease, true);
  assert.equal(audit.duplicates.hasDuplicateId, true);
  assert.deepEqual(audit.duplicates.duplicateIds, ['r1']);
  assert.equal(audit.checks.find((c) => c.name === 'row_unique').pass, false);
  assert.equal(audit.target.matchedBy, 'id');
  // 必须与 castAttack 的 find 顺序一致：第一个 id 匹配项
  assert.equal(audit.target.id, ref.opponent.id);
  assert.equal(audit.target.name, ref.opponent.name);
  assert.equal(audit.target.name, '赤风', 'id 查找取 opponents 中第一个 id=r1 的项');
});

test('同一 name 重复但 id 各不相同：id 先查未命中时按 name 取第一个，并标注重复', () => {
  const rows = [
    { place: 1, id: 'a9', name: '同名', me: false },
    { place: 2, id: 'b7', name: '同名', me: false },
    { place: 3, id: 'me', name: '你', me: true },
  ];
  const opponents = [
    { id: 'x1', name: '同名', remote: true, z: 50 },
    { id: 'a9', name: '同名', remote: true, z: 120 },
    { id: 'b7', name: '同名', remote: true, z: 90 },
  ];
  const audit = resolveSkillTarget(baseInput({ rows, opponents, place: 1 }));
  const ref = castAttackReference({ rows, opponents, place: 1 });

  assert.equal(audit.duplicates.hasDuplicateName, true);
  assert.deepEqual(audit.duplicates.duplicateNames, ['同名']);
  assert.equal(audit.target.matchedBy, 'id'); // row.id='a9' 能直接命中，id 优先
  assert.equal(audit.target.id, ref.opponent.id);
  assert.equal(audit.target.name, ref.opponent.name);

  // 行 id 在对手数组中缺失时，退化为按 name 取第一个
  const rows2 = [
    { place: 1, id: 'gone', name: '同名', me: false },
    { place: 2, id: 'me', name: '你', me: true },
  ];
  const audit2 = resolveSkillTarget(baseInput({ rows: rows2, opponents, place: 1 }));
  const ref2 = castAttackReference({ rows: rows2, opponents, place: 1 });
  assert.equal(audit2.target.matchedBy, 'name');
  assert.equal(audit2.target.id, ref2.opponent.id);
  assert.equal(audit2.target.name, '同名');
  assert.equal(audit2.target.id, 'x1', 'name 查找同样取第一个匹配项');
});

console.log('targeting · 自用技能 / 空技能槽 / 运行态');

for (const key of ['gale', 'shield', 'magnet']) {
  test(`自用技能 ${key}：判不可释放，标注"自用技能无需选目标"，不解析目标`, () => {
    const audit = resolveSkillTarget(baseInput({ skillKey: key, place: 1 }));
    assert.equal(audit.canRelease, false);
    assert.equal(audit.isAttack, false);
    assert.equal(audit.isSelfSkill, true);
    assert.equal(audit.reasonCode, 'SELF_SKILL');
    assert.equal(audit.reason, RELEASE_REASONS.SELF_SKILL);
    assert.equal(audit.target, null);
    assert.equal(audit.checks.find((c) => c.name === 'attack_type').pass, false);
  });
}

test('atkSkill 为空：不可释放、原因=无待释放技能、不抛异常', () => {
  assert.doesNotThrow(() => {
    const audit = resolveSkillTarget(baseInput({ skillKey: null, place: 1 }));
    assert.equal(audit.canRelease, false);
    assert.equal(audit.target, null);
    assert.equal(audit.reasonCode, 'NO_SKILL');
    assert.equal(audit.reason, RELEASE_REASONS.NO_SKILL);
    assert.equal(audit.checks[0].name, 'skill_equipped');
    assert.equal(audit.checks[0].pass, false);
  });
});

test('非竞速模式：不可释放、原因=当前不是竞速模式、不抛异常', () => {
  assert.doesNotThrow(() => {
    const audit = resolveSkillTarget(baseInput({ mode: 'run', place: 1 }));
    assert.equal(audit.canRelease, false);
    assert.equal(audit.reasonCode, 'NOT_RACE');
    assert.equal(audit.reason, RELEASE_REASONS.NOT_RACE);
  });
});

test('玩家已死：不可释放、原因=玩家已死亡', () => {
  const audit = resolveSkillTarget(baseInput({ playerAlive: false, place: 1 }));
  assert.equal(audit.canRelease, false);
  assert.equal(audit.reasonCode, 'PLAYER_DEAD');
  assert.equal(audit.reason, RELEASE_REASONS.PLAYER_DEAD);
});

test('未知技能 key 与缺省输入：不抛异常', () => {
  assert.doesNotThrow(() => {
    const audit = resolveSkillTarget(baseInput({ skillKey: 'nope', place: 1 }));
    assert.equal(audit.canRelease, false);
    assert.equal(audit.reasonCode, 'UNKNOWN_SKILL');
  });
  assert.doesNotThrow(() => resolveSkillTarget({}));
  assert.doesNotThrow(() => resolveSkillTarget(null));
  assert.doesNotThrow(() => resolveSkillTarget(undefined));
});

console.log('targeting · 序列化 / 纯函数约束');

test('审计对象可经 JSON.stringify 往返序列化且数据不丢字段', () => {
  const audit = resolveSkillTarget(baseInput({}));
  const text = JSON.stringify(audit);
  assert.equal(typeof text, 'string');
  const back = JSON.parse(text);
  assert.deepEqual(back, audit);
  // 负向路径同样可序列化
  for (const over of [{ skillKey: null }, { place: 9 }, { place: 3 }, { opponents: [] }, { mode: 'run' }]) {
    assert.doesNotThrow(() => JSON.stringify(resolveSkillTarget(baseInput(over))));
  }
});

test('不修改传入的 rows / opponents / skills', () => {
  const { rows, opponents } = sampleThreeRacers();
  const rowsSnap = JSON.stringify(rows);
  const oppSnap = JSON.stringify(opponents);
  const skillsSnap = JSON.stringify(SKILLS);
  resolveSkillTarget(baseInput({ rows, opponents, place: 2 }));
  resolveSkillTarget(baseInput({ rows, opponents, place: 9 }));
  resolveSkillTarget(baseInput({ rows, opponents, place: 3 }));
  assert.equal(JSON.stringify(rows), rowsSnap);
  assert.equal(JSON.stringify(opponents), oppSnap);
  assert.equal(JSON.stringify(SKILLS), skillsSnap);
});

test('输出不含函数 / Symbol / Three.js 风格对象（纯数据）', () => {
  const audit = resolveSkillTarget(baseInput({}));
  const walk = (v, path2) => {
    if (v === null || v === undefined) return;
    const t = typeof v;
    assert.ok(t !== 'function' && t !== 'symbol' && t !== 'bigint', `非法类型 ${t} @ ${path2}`);
    if (t === 'object') {
      if (Array.isArray(v)) v.forEach((c, i) => walk(c, `${path2}[${i}]`));
      else for (const k of Object.keys(v)) walk(v[k], `${path2}.${k}`);
    }
  };
  walk(audit, '$');
});

console.log('targeting · 与 castAttack 查找顺序的随机一致性');

test('200 组随机名次表/对手组合：命中对手的 id 与 name 与参考实现逐项一致', () => {
  const rng = mulberry32(20260722);
  const names = ['霓虹', '赤风', '夜航', '极光', '回声'];
  for (let iter = 0; iter < 200; iter++) {
    const n = 1 + Math.floor(rng() * 4);
    const opponents = [];
    for (let i = 0; i < n; i++) {
      const useId = rng() > 0.4;
      opponents.push({
        id: useId ? `id${Math.floor(rng() * 4)}` : null, // 刻意制造重复/ null id
        name: names[Math.floor(rng() * names.length)], // 刻意制造重复 name
        remote: rng() > 0.5,
        z: Math.floor(rng() * 500),
      });
    }
    const rows = opponents.map((o, i) => ({ place: i + 1, id: o.id, name: o.name, me: false }));
    if (rng() > 0.5) rows.push({ place: rows.length + 1, id: null, name: '你', me: true });
    const place = 1 + Math.floor(rng() * (rows.length + 1)); // 可能越界
    const audit = resolveSkillTarget(baseInput({ rows, opponents, place }));
    const ref = castAttackReference({ rows, opponents, place });

    if (ref.blocked) {
      assert.equal(audit.target, null, `iter=${iter} place=${place} 参考实现被名次/自己拦截`);
      assert.ok(['PLACE_NOT_FOUND', 'TARGET_SELF'].includes(audit.failureCode));
    } else if (!ref.opponent) {
      assert.equal(audit.target, null, `iter=${iter} 参考实现未找到对手`);
      assert.equal(audit.failureCode, 'OPPONENT_GONE');
    } else {
      assert.ok(audit.target, `iter=${iter} 审计应解析出目标`);
      assert.equal(audit.target.id, ref.opponent.id, `iter=${iter} id 不一致`);
      assert.equal(audit.target.name, ref.opponent.name, `iter=${iter} name 不一致`);
    }
  }
});

console.log('targeting · 模块源码约束（无 window / localStorage / 网络）');

test('targeting.js 不引用 window、localStorage、fetch、XMLHttpRequest、WebSocket', () => {
  let src = readFileSync(path.join(ROOT, 'src', 'targeting.js'), 'utf8');
  // 去掉块注释、行注释与字符串/模板字面量，只扫描真实代码
  src = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""');
  for (const banned of ['window', 'localStorage', 'sessionStorage', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator', 'document']) {
    assert.ok(!src.includes(banned), `源码不应出现 ${banned}`);
  }
  assert.ok(!/\bimport\s/.test(src), '纯函数模块不应有任何 import 依赖');
});

// 确定性随机数（测试本身也不依赖 Math.random）
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
