/**
 * speech-audit.test.mjs — 语音事件审计（src/speech-audit.js）。
 *
 * 审计模块是个纯函数：吃快照、吐可 JSON 序列化的结论，不碰文件/网络/适配器。
 * 这组测试分四条路：
 *   正常路径 —— 未来台词 + 已配对事件，开口时刻逐项等于 speechLag，检查全过；
 *   负向路径 —— due 的 segment 跟 scheduled 对不上、失败挂载还留着订阅；
 *   边界路径 —— 空槽、没写 at 的台词、延迟恰好顶到 2.0 上限；
 *   降级路径 —— 快照缺字段/形状错/seq 断裂，不抛异常，带原因降级；
 *   另验证输出经 JSON.stringify 往返后结构不丢。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { auditSpeechSnapshot } from '../src/speech-audit.js';
import { makeLagFn, speechLag } from '../src/speech.js';
import { speechEvents } from '../src/speech-bus.js';

/** 取具名检查项，测试里按名字断言而不是按下标，顺序调整不会误伤。 */
const check = (result, name) => {
  const found = result.checks.find((c) => c.name === name);
  assert.ok(found, `缺少检查项 ${name}`);
  return found;
};

const okMount = (specifier, subscriptions = 1) => ({
  specifier, ok: true, subscriptions, returnedDetach: true,
});

/* --------------------------------------------------------------- 正常路径 */

test('正常路径：未来台词 + 已配对事件，开口时刻与 speechLag 逐项相等且检查全过', () => {
  const lines = [
    { text: '短', at: 210 },            // 1 字 → 0.4
    { text: '一二三四五六七', at: 230 }, // 7 字 → 1.0
    { text: '结果发现他住的地址离学校有两个小时路程', at: 260 }, // 21 字 → 2.0
    { text: '   ', at: 290 },           // 空文本：归一化时丢弃
  ];
  const events = [
    { seq: 1, at: 210, text: '短', state: 'scheduled', input: 'a.mp4', segment: 200 },
    { seq: 2, at: 230, text: '一二三四五六七', state: 'scheduled', input: 'a.mp4', segment: 200 },
    { seq: 3, at: 260, text: '结果发现他住的地址离学校有两个小时路程', state: 'scheduled', input: 'a.mp4', segment: 200 },
    // due 的 at 是实际开口的播放位置（watch-loop 用 est.pos 发 due），均不早于开口时刻
    { seq: 4, at: 210.4, text: '短', state: 'due', input: 'a.mp4', segment: 200 },
    { seq: 5, at: 231.2, text: '一二三四五六七', state: 'due', input: 'a.mp4', segment: 200 },
    { seq: 6, at: 262.1, text: '结果发现他住的地址离学校有两个小时路程', state: 'due', input: 'a.mp4', segment: 200 },
  ];
  const snapshot = {
    lines,
    fallbackAt: 200,
    segment: 200,
    pos: 205,
    events,
    mounts: [okMount('voice-edge-tts')],
  };

  const result = auditSpeechSnapshot(snapshot);

  // ---- 计划事件归一化与 speechEvents 完全同口径
  assert.deepEqual(result.planned, speechEvents(lines, { fallbackAt: 200, segment: 200 }));
  assert.equal(result.planned.length, 3, '空文本台词被丢弃');
  assert.deepEqual(result.planned.map((p) => p.at), [210, 230, 260]);

  // ---- 开口时刻：每个计划事件 at + makeLagFn 规则的延迟
  const lagOf = makeLagFn(result.planned.map((p) => ({ from: p.at, text: p.text })));
  assert.equal(result.openings.length, 3);
  for (const o of result.openings) {
    const plan = result.planned.find((p) => p.text === o.text && p.at === o.at);
    // 题目要求：与 speechLag 对同一字数逐项相等
    assert.equal(o.lag, speechLag(o.chars), `「${o.text}」字数=${o.chars}`);
    // 同时必须符合 makeLagFn（WeakMap 缓存 + 0.1s memo + 二分，平手取更早）
    assert.equal(o.lag, lagOf(o.at), `「${o.text}」makeLagFn 口径`);
    assert.equal(o.openAt, +(plan.at + speechLag(plan.text.length)).toFixed(3));
  }
  assert.deepEqual(result.openings.map((o) => o.openAt), [210.4, 231, 262]);

  // ---- 配对：三条 scheduled 全部有 due，没有落单
  assert.equal(result.pairing.pairs.length, 3);
  assert.deepEqual(result.pairing.unmatchedScheduled, []);
  assert.deepEqual(result.pairing.unmatchedDue, []);
  assert.deepEqual(
    result.pairing.pairs.map((p) => p.scheduled.text),
    ['短', '一二三四五六七', '结果发现他住的地址离学校有两个小时路程'],
  );

  // ---- 适配器与全部检查项
  assert.equal(result.adapters.voiceSubscribers, true);
  assert.deepEqual(result.adapters.mountedSpecifiers, ['voice-edge-tts']);
  assert.equal(result.degraded, false);
  assert.deepEqual(result.degradedReasons, []);
  for (const c of result.checks) {
    assert.equal(c.pass, true, `${c.name} 应通过：${c.reason ?? ''}`);
  }
});

test('正常路径：只有 scheduled 的未来台词落单为 unmatchedScheduled，仍全部通过', () => {
  const lines = [{ text: '还没到点的一句', at: 300 }];
  const result = auditSpeechSnapshot({
    lines,
    fallbackAt: 200,
    segment: 7,
    pos: 205,
    events: [
      { seq: 11, at: 300, text: '还没到点的一句', state: 'scheduled', input: 'b.mp4', segment: 7 },
    ],
    mounts: [okMount('voice-edge-tts')],
  });
  assert.equal(result.pairing.pairs.length, 0);
  assert.equal(result.pairing.unmatchedScheduled.length, 1);
  assert.equal(result.pairing.unmatchedScheduled[0].text, '还没到点的一句');
  assert.deepEqual(result.pairing.unmatchedDue, []);
  for (const c of result.checks) assert.equal(c.pass, true, c.name);
});

/* --------------------------------------------------------------- 负向路径 */

test('负向：due 的 segment/input 与 scheduled 不一致 → pair-identity 失败并给原因', () => {
  const result = auditSpeechSnapshot({
    lines: [{ text: '跨段的一句词', at: 58 }], // 6 字 → 开口 58.9；due 58.5 不抢话，专测身份
    fallbackAt: 0,
    segment: 60,
    pos: 61,
    events: [
      { seq: 1, at: 58, text: '跨段的一句词', state: 'scheduled', input: 'b.mp4', segment: 0 },
      // 跨过 60 秒边界后 due 错报成"当前段 60"，且 input 也对不上；at=59 晚于开口时刻 58.9
      { seq: 2, at: 59, text: '跨段的一句词', state: 'due', input: 'other.mp4', segment: 60 },
    ],
    mounts: [okMount('voice-edge-tts')],
  });
  const identity = check(result, 'pair-identity');
  assert.equal(identity.pass, false);
  assert.match(identity.reason, /segment 不一致/);
  assert.match(identity.reason, /input 不一致/);
  // 其余不相关的检查项不受牵连
  assert.equal(check(result, 'event-state-valid').pass, true);
  assert.equal(check(result, 'event-seq-continuous').pass, true);
  assert.equal(check(result, 'due-not-before-open').pass, true, 'due 59s 晚于开口时刻 58.9s，时序本身没问题');
});

test('负向：没有前置 scheduled 的 due 落单，且失败挂载仍带订阅 → 两项检查失败', () => {
  const result = auditSpeechSnapshot({
    lines: [],
    fallbackAt: 0,
    segment: 0,
    pos: 10,
    events: [
      { seq: 1, at: 9, text: '凭空出现的 due', state: 'due', input: 'a.mp4', segment: 0 },
    ],
    mounts: [
      // 失败挂载却留下 2 个订阅 —— 精确回滚没做
      { specifier: 'broken-voice', ok: false, subscriptions: 2, returnedDetach: false },
    ],
  });
  assert.equal(result.pairing.unmatchedDue.length, 1);
  assert.equal(result.pairing.unmatchedDue[0].text, '凭空出现的 due');
  assert.deepEqual(result.pairing.unmatchedScheduled, []);

  const failed = check(result, 'failed-mount-clean');
  assert.equal(failed.pass, false);
  assert.match(failed.reason, /broken-voice/);
  assert.match(failed.reason, /2 个订阅/);

  // 失败的适配器不计入已挂载列表 → 没有 voice 订阅者，due 本身也违规
  assert.deepEqual(result.adapters.mountedSpecifiers, []);
  assert.equal(result.adapters.voiceSubscribers, false);
  const noVoice = check(result, 'due-requires-voice');
  assert.equal(noVoice.pass, false);
  assert.match(noVoice.reason, /1 条 due/);
});

test('负向：due 早于开口时刻、state 非法、重复 specifier → 各自的检查项失败', () => {
  const result = auditSpeechSnapshot({
    lines: [{ text: '一二三四五六七', at: 100 }], // 7 字 → 开口时刻 101
    fallbackAt: 0,
    segment: 0,
    pos: 99,
    events: [
      { seq: 1, at: 100, text: '一二三四五六七', state: 'scheduled', input: 'a.mp4', segment: 0 },
      // at=100 就开口 = 抢话，早于 101
      { seq: 2, at: 100, text: '一二三四五六七', state: 'due', input: 'a.mp4', segment: 0 },
      { seq: 3, at: 101, text: '状态写错了', state: 'playing' },
    ],
    mounts: [okMount('voice-edge-tts'), okMount('voice-edge-tts'), okMount('voice-edge-tts')],
  });

  const timing = check(result, 'due-not-before-open');
  assert.equal(timing.pass, false);
  assert.match(timing.reason, /早于开口时刻 101/);

  const state = check(result, 'event-state-valid');
  assert.equal(state.pass, false);
  assert.match(state.reason, /playing/);

  const unique = check(result, 'mount-specifier-unique');
  assert.equal(unique.pass, false);
  assert.match(unique.reason, /出现 3 次/);
  // 去重后仍然只算一个适配器
  assert.deepEqual(result.adapters.mountedSpecifiers, ['voice-edge-tts']);
});

/* --------------------------------------------------------------- 边界路径 */

test('边界：空台词槽 → 计划事件与开口时刻都是空数组，不抛异常', () => {
  const result = auditSpeechSnapshot({
    lines: [],
    fallbackAt: 180,
    segment: 3,
    pos: 181,
    events: [],
    mounts: [],
  });
  assert.deepEqual(result.planned, speechEvents([], { fallbackAt: 180, segment: 3 }));
  assert.deepEqual(result.openings, []);
  assert.equal(result.degraded, false);
  for (const c of result.checks) assert.equal(c.pass, true, c.name);
});

test('边界：没写 at 的台词落在段首，与 speechEvents 一致', () => {
  const lines = [
    { text: '没写 at', at: null },
    { text: '写了 at', at: 190 },
    { text: '', at: 195 },
  ];
  const result = auditSpeechSnapshot({
    lines,
    fallbackAt: 180,
    segment: 180,
    pos: 179,
    events: [],
    mounts: [],
  });
  assert.deepEqual(result.planned, speechEvents(lines, { fallbackAt: 180, segment: 180 }));
  assert.equal(result.planned.length, 2);
  assert.equal(result.planned[0].at, 180, '没写 at 的按段首算');
  assert.equal(result.openings[0].at, 180);
  assert.equal(
    result.openings[0].openAt,
    +(180 + speechLag('没写 at'.length)).toFixed(3),
  );
});

test('边界：字数使延迟恰好落在 2.0 上限（17 字），审计与 speechLag/makeLagFn 一致', () => {
  const text = '一二三四五六七八九十一二三四五六七'; // 17 字：0.3 + 17/5*0.5 = 2.0 恰好夹在上限
  assert.equal(text.length, 17);
  assert.equal(speechLag(17), 2, '前置：17 字恰好顶到上限');
  const lines = [{ text, at: 40 }];

  const result = auditSpeechSnapshot({
    lines,
    fallbackAt: 0,
    segment: 0,
    pos: 10,
    events: [
      { seq: 1, at: 40, text, state: 'scheduled', input: 'a.mp4', segment: 0 },
      { seq: 2, at: 42, text, state: 'due', input: 'a.mp4', segment: 0 },
    ],
    mounts: [okMount('voice-edge-tts')],
  });
  assert.equal(result.openings[0].lag, 2);
  assert.equal(result.openings[0].openAt, 42);
  const lagOf = makeLagFn([{ from: 40, text }]);
  assert.equal(lagOf(40), 2, 'makeLagFn 同口径也是 2.0');
  assert.equal(check(result, 'due-not-before-open').pass, true, '恰在开口时刻 due 不算抢话');
});

test('边界：平手取更早那条 —— 两个计划事件 at 相同（0.1s 粒度同键）时跟 makeLagFn 一致', () => {
  // 同一 at 上两条字幕：makeLagFn 二分平手取更早（数组里更靠前）那条
  const lines = [
    { text: '短', at: 77 },
    { text: '结果发现他住的地址离学校有两个小时路程', at: 77 },
  ];
  const result = auditSpeechSnapshot({
    lines, fallbackAt: 0, segment: 0, pos: 1, events: [], mounts: [],
  });
  const lagOf = makeLagFn(lines.map((l) => ({ from: l.at, text: l.text })));
  for (const o of result.openings) {
    assert.equal(o.lag, lagOf(o.at), `at=${o.at} 必须与 makeLagFn 的平手规则一致`);
  }
  // 两条都落在同一个 0.1 秒键上，取更早那条（数组首条 = 1 字 → 0.4）
  assert.equal(lagOf(77), speechLag('短'.length));
  assert.deepEqual(result.openings.map((o) => o.lag), [0.4, 0.4]);
});

/* --------------------------------------------------------------- 降级路径 */

test('降级：快照缺字段 / lines 非数组 / pos 非有限值，不抛异常并标注受影响字段', () => {
  const cases = [
    { snap: undefined, field: 'snapshot' },
    { snap: null, field: 'snapshot' },
    { snap: { fallbackAt: 0, segment: 0, pos: 1, events: [], mounts: [] }, field: 'lines' },
    { snap: { lines: 'not-array', fallbackAt: 0, segment: 0, pos: 1, events: [], mounts: [] }, field: 'lines' },
    { snap: { lines: [], fallbackAt: 0, segment: 0, pos: NaN, events: [], mounts: [] }, field: 'pos' },
    { snap: { lines: [], fallbackAt: 0, segment: 0, pos: 1, events: {}, mounts: [] }, field: 'events' },
    { snap: { lines: [], fallbackAt: 0, segment: 0, pos: 1, events: [], mounts: 7 }, field: 'mounts' },
  ];
  for (const { snap, field } of cases) {
    const result = auditSpeechSnapshot(snap);
    assert.equal(result.degraded, true, `场景 ${field} 必须标注降级`);
    assert.ok(
      result.degradedReasons.some((r) => r.field === field),
      `应指出受影响字段 ${field}，实际：${JSON.stringify(result.degradedReasons)}`,
    );
    const integrity = check(result, 'snapshot-integrity');
    assert.equal(integrity.pass, false);
    assert.match(integrity.reason, new RegExp(field));
    // 降级不影响可序列化
    assert.equal(typeof JSON.stringify(result), 'string');
  }
});

test('降级：事件 seq 不连续 → event-seq-continuous 失败且原因可读，其余检查照跑', () => {
  const result = auditSpeechSnapshot({
    lines: [],
    fallbackAt: 0,
    segment: 0,
    pos: 1,
    events: [
      { seq: 1, at: 1, text: '第一条', state: 'scheduled' },
      { seq: 2, at: 2, text: '第二条', state: 'due' },
      { seq: 5, at: 3, text: '断号了', state: 'spoken' },
    ],
    mounts: [],
  });
  const seq = check(result, 'event-seq-continuous');
  assert.equal(seq.pass, false);
  assert.match(seq.reason, /5/);
  // 不抛异常、结构完整、其他检查项仍然存在
  assert.equal(result.checks.length, 8);
  assert.equal(check(result, 'event-state-valid').pass, true);
});

/* --------------------------------------------------------------- 序列化 */

test('输出是纯数据：JSON.stringify 往返后结构不丢，不含函数/类实例', () => {
  const result = auditSpeechSnapshot({
    lines: [{ text: '一二三四五六七', at: 230 }, { text: '没 at', at: null }],
    fallbackAt: 200,
    segment: 200,
    pos: 205,
    events: [
      { seq: 1, at: 230, text: '一二三四五六七', state: 'scheduled', input: 'a.mp4', segment: 200 },
      { seq: 2, at: 231, text: '一二三四五六七', state: 'due', input: 'a.mp4', segment: 200 },
    ],
    mounts: [okMount('voice-edge-tts')],
  });

  const text = JSON.stringify(result);
  assert.equal(typeof text, 'string');
  const back = JSON.parse(text);
  assert.deepEqual(back, result);
  // 递归确认没有函数（纯数据快照的硬要求）
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        assert.notEqual(typeof child, 'function', `字段 ${k} 不许是函数`);
        walk(child);
      }
    }
  };
  walk(result);
  // 检查项的形状固定：name/pass/reason 三字段
  for (const c of result.checks) {
    assert.deepEqual(Object.keys(c).sort(), ['name', 'pass', 'reason']);
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.pass, 'boolean');
    assert.ok(c.reason === null || typeof c.reason === 'string');
  }
});
