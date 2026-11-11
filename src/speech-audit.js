/**
 * speech-audit.js — **语音事件审计**：喂一份纯数据快照，核对声音这一侧的事件流。
 *
 * 它是一个纯函数模块，刻意和运行时隔离开：
 *
 *   · 不读写任何文件、不 import 适配器、不访问网络，也不碰 speech-bus 的订阅状态；
 *   · 输入是一份普通对象快照，输出是可 `JSON.stringify` 的普通对象
 *     （没有函数、没有类实例、没有 undefined）；
 *   · 快照缺字段、形状不对、seq 不连续时不抛未捕获异常 —— 退回**降级结果**，
 *     用 `degraded` + `degradedReasons` 标明受影响的字段。
 *
 * 规则直接复用线上实现，避免"审计一套、生产一套"：
 *
 *   · 计划事件归一化 → `speechEvents`（空文本丢弃；没写 `at` 的落在段首 `fallbackAt`）
 *   · 开口时刻       → `makeLagFn`（WeakMap 数组身份缓存 + 0.1 秒粒度 memo + 二分查找，
 *                     平手取更早那条），再在外面套上 `at + lag`
 *   · state 白名单   → 只认 `scheduled` / `due` / `spoken` / `skipped`
 *
 * 检查项（`checks`，按固定顺序排列，每项 `{ name, pass, reason }`）：
 *
 *   snapshot-integrity        快照形状是否完整可用（失败时其余检查照跑，但结果只供参考）
 *   event-state-valid         已记录事件的 state 只允许四种取值
 *   event-seq-continuous      seq 必须连续（允许从任意整数开始，逐条 +1）
 *   pair-identity             同一句的 scheduled 与 due，input 与 segment 必须一致
 *   due-not-before-open       due 的 at（实际开口的播放位置）不得早于该句的开口时刻
 *   due-requires-voice        没有成功挂载的 voice 适配器时，不得出现 due
 *   failed-mount-clean        失败挂载不得留下订阅（订阅数为 0，且不计入已挂载列表）
 *   mount-specifier-unique    同一 specifier 重复出现只算一次挂载
 */

import { speechEvents } from './speech-bus.js';
import { makeLagFn } from './speech.js';

/** state 只认这四种 —— 和 speech-bus 的 normalizeState 口径一致，但审计不做"容错归一"，写错就报。 */
const VALID_STATES = Object.freeze(['scheduled', 'due', 'spoken', 'skipped']);

/** 检查项的固定顺序，输出里就按这个排，方便人读也方便测试断言。 */
const CHECK_ORDER = Object.freeze([
  'snapshot-integrity',
  'event-state-valid',
  'event-seq-continuous',
  'pair-identity',
  'due-not-before-open',
  'due-requires-voice',
  'failed-mount-clean',
  'mount-specifier-unique',
]);

const checkName = (name, pass, reason = null) => ({ name, pass: Boolean(pass), reason: pass ? null : reason });

/** 只保留可 JSON 序列化的普通字段；事件自身没有的可空字段显式给 null，不塞 undefined。 */
function normEvent(e) {
  const out = {
    seq: Number.isFinite(Number(e?.seq)) ? Number(e.seq) : null,
    at: Number.isFinite(Number(e?.at)) ? Number(e.at) : null,
    text: String(e?.text ?? ''),
    state: e?.state == null ? null : String(e.state),
    input: e?.input == null || e.input === '' ? null : String(e.input),
    segment: Number.isFinite(Number(e?.segment)) ? Number(e.segment) : null,
  };
  return out;
}

/**
 * 计划事件的配对键：同一句 = 同一段文本。
 *
 * 注意**不能把 at 放进键里**：scheduled 的 at 是计划位置（字幕 from），
 * 而 due 的 at 是实际开口时的播放位置（watch-loop 用 est.pos 发 due），
 * 同一句的两个 at 天然不同 —— 时序是否合规由 due-not-before-open 单独查。
 */
const pairKey = (e) => e.text;

function runAudit(snapshot) {
  const degradedReasons = [];
  const mark = (field, reason) => degradedReasons.push({ field, reason });

  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  if (!snapshot || typeof snapshot !== 'object') {
    mark('snapshot', '快照必须是对象，收到的是 ' + (snapshot === null ? 'null' : typeof snapshot));
  }

  // ---- 台词槽：不是数组就降级成空槽，审计照跑（计划事件会是空列表）
  let lines = [];
  if (Array.isArray(snap.lines)) {
    lines = snap.lines;
  } else if ('lines' in snap) {
    mark('lines', '台词槽 lines 必须是数组，实际是 ' + (snap.lines === null ? 'null' : typeof snap.lines));
  } else {
    mark('lines', '缺少台词槽 lines');
  }

  // ---- 段首 fallbackAt：非有限值按 0 处理（和 speechEvents 的兜底一致），但标注字段受损
  let fallbackAt = 0;
  if (Number.isFinite(Number(snap.fallbackAt))) {
    fallbackAt = Number(snap.fallbackAt);
  } else if ('fallbackAt' in snap) {
    mark('fallbackAt', `fallbackAt 非有限值（${String(snap.fallbackAt)}），按 0 处理`);
  }

  // ---- 段号：可空；给了但不是有限数时丢掉段标记
  let segment;
  if (Number.isFinite(Number(snap.segment))) {
    segment = Number(snap.segment);
  } else if ('segment' in snap && snap.segment != null) {
    mark('segment', `segment 非有限值（${String(snap.segment)}），计划事件不带段标记`);
  }

  // ---- 当前播放位置：非有限值时开口时刻/到点判断仍可做，但 pos 相关结论不可信
  let pos = null;
  if (Number.isFinite(Number(snap.pos))) {
    pos = Number(snap.pos);
  } else if ('pos' in snap) {
    mark('pos', `pos 非有限值（${String(snap.pos)}）`);
  } else {
    mark('pos', '缺少当前播放位置 pos');
  }

  // ---- 已记录事件：不是数组就当没有事件，但后续基于事件的检查只能给"无数据"结论
  let rawEvents = [];
  if (Array.isArray(snap.events)) {
    rawEvents = snap.events;
  } else if ('events' in snap) {
    mark('events', '事件列表 events 必须是数组，实际是 ' + (snap.events === null ? 'null' : typeof snap.events));
  } else {
    mark('events', '缺少事件列表 events');
  }

  // ---- 适配器挂载记录：可空（没挂过适配器的场景），给了就必须是数组
  let rawMounts = [];
  if (Array.isArray(snap.mounts)) {
    rawMounts = snap.mounts;
  } else if ('mounts' in snap && snap.mounts != null) {
    mark('mounts', '挂载记录 mounts 必须是数组，实际是 ' + (snap.mounts === null ? 'null' : typeof snap.mounts));
  }

  // ===== 1. 计划事件：完全交给 speechEvents，保证归一化和生产同一个口径 =====
  const planned = speechEvents(lines, { fallbackAt, segment });

  // ===== 2. 开口时刻：makeLagFn 规则（同一份数组身份可命中它自己的 WeakMap 缓存）=====
  // 计划事件本身就带 from 语义（at = 字幕 from），直接用它们构造 lag 函数的字幕数组。
  const cueArray = planned.map((p) => ({ from: p.at, text: p.text }));
  const lagOf = makeLagFn(cueArray);
  const openings = planned.map((p) => {
    const lag = lagOf(p.at);
    return {
      at: p.at,
      text: p.text,
      ...(p.segment != null ? { segment: p.segment } : {}),
      chars: p.text.length,
      lag,
      openAt: +(p.at + lag).toFixed(3),
    };
  });
  const openingByKey = new Map(openings.map((o) => [pairKey(o), o]));

  // ===== 3. 已记录事件归一化 =====
  const events = rawEvents.map(normEvent);

  // ---- 3a. state 白名单
  const badState = events.find((e) => !VALID_STATES.includes(e.state));
  const stateCheck = badState
    ? checkName('event-state-valid', false,
        `seq=${badState.seq ?? '?'} 的 state=${JSON.stringify(badState.state)} 不在允许集合 scheduled/due/spoken/skipped 内`)
    : checkName('event-state-valid', true);

  // ---- 3b. seq 连续性：允许从任意整数起头，但每条必须 +1；非整数/缺失也算断
  let seqCheck;
  const seqSeen = events.filter((e) => Number.isInteger(e.seq));
  if (seqSeen.length !== events.length) {
    const firstBad = events.find((e) => !Number.isInteger(e.seq));
    seqCheck = checkName('event-seq-continuous', false,
      `存在 seq 缺失或非整数的事件（at=${firstBad?.at ?? '?'} text=${JSON.stringify(firstBad?.text ?? '')}）`);
  } else {
    const gap = seqSeen.find((e, i) => i > 0 && e.seq !== seqSeen[i - 1].seq + 1);
    seqCheck = gap
      ? checkName('event-seq-continuous', false,
          `seq 在 ${gap.seq} 处不连续：上一条是 ${seqSeen[seqSeen.indexOf(gap) - 1].seq}，期望 ${seqSeen[seqSeen.indexOf(gap) - 1].seq + 1}`)
      : checkName('event-seq-continuous', true);
  }

  // ===== 4. scheduled ↔ due 配对（同文本；一对一，按 seq 顺序先到先得）=====
  const scheduledBuckets = new Map();
  const dueBuckets = new Map();
  for (const e of events) {
    if (e.state !== 'scheduled' && e.state !== 'due') continue;
    const bucket = e.state === 'scheduled' ? scheduledBuckets : dueBuckets;
    const key = pairKey(e);
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(e);
  }
  const allKeys = [...new Set([...scheduledBuckets.keys(), ...dueBuckets.keys()])];
  const pairs = [];
  const unmatchedScheduled = [];
  const unmatchedDue = [];
  for (const key of allKeys) {
    const sList = scheduledBuckets.get(key) ?? [];
    const dList = dueBuckets.get(key) ?? [];
    const n = Math.min(sList.length, dList.length);
    for (let i = 0; i < n; i += 1) pairs.push({ key, scheduled: sList[i], due: dList[i] });
    for (let i = n; i < sList.length; i += 1) unmatchedScheduled.push(sList[i]);
    for (let i = n; i < dList.length; i += 1) unmatchedDue.push(dList[i]);
  }
  const sortBySeq = (a, b) => (a.seq ?? 0) - (b.seq ?? 0);
  pairs.sort((a, b) => sortBySeq(a.scheduled, b.scheduled));
  unmatchedScheduled.sort(sortBySeq);
  unmatchedDue.sort(sortBySeq);

  // ---- 4a. 配对身份：input 与 segment 必须逐字段相同（跨段边界时 due 要跟这句自己的段）----
  const identityFailures = [];
  for (const { scheduled: s, due: d } of pairs) {
    const diffs = [];
    if ((s.input ?? null) !== (d.input ?? null)) {
      diffs.push(`input 不一致（scheduled=${JSON.stringify(s.input)} due=${JSON.stringify(d.input)}）`);
    }
    if ((s.segment ?? null) !== (d.segment ?? null)) {
      diffs.push(`segment 不一致（scheduled=${s.segment} due=${d.segment}）`);
    }
    if (diffs.length) identityFailures.push({ text: s.text, at: s.at, reasons: diffs });
  }
  const identityCheck = identityFailures.length
    ? checkName('pair-identity', false,
        identityFailures.map((f) => `「${f.text}」(at=${f.at})：${f.reasons.join('；')}`).join(' | '))
    : checkName('pair-identity', true);

  // ---- 4b. due 不得早于开口时刻。at 是实际开口的播放位置（watch-loop 用 est.pos 发 due）----
  const timingFailures = [];
  for (const d of events.filter((e) => e.state === 'due')) {
    const opening = openingByKey.get(pairKey(d));
    if (!opening) {
      timingFailures.push(`due「${d.text}」(at=${d.at}) 在计划事件里找不到对应台词，无法核对开口时刻`);
      continue;
    }
    if (d.at === null || !Number.isFinite(d.at)) {
      timingFailures.push(`due「${d.text}」缺少有限的 at，无法与开口时刻 ${opening.openAt} 比较`);
      continue;
    }
    // 开口时刻自身只保留到毫秒（toFixed(3)），due 也归到毫秒再比，
    // 浮点尾差（如 40+2=41.9999…）不该被误判成抢话；真早于开口时刻才算
    if (+d.at.toFixed(3) < opening.openAt - 1e-3) {
      timingFailures.push(
        `due「${d.text}」at=${d.at} 早于开口时刻 ${opening.openAt}（计划 at=${opening.at} + 延迟 ${opening.lag}s）`,
      );
    }
  }
  const timingCheck = timingFailures.length
    ? checkName('due-not-before-open', false, timingFailures.join(' | '))
    : checkName('due-not-before-open', true);

  // ===== 5. 适配器挂载记录 =====
  const mounts = rawMounts.map((m, i) => ({
    index: i,
    specifier: m?.specifier == null ? null : String(m.specifier),
    ok: Boolean(m?.ok),
    subscriptions: Number.isFinite(Number(m?.subscriptions)) ? Number(m.subscriptions) : 0,
    returnedDetach: Boolean(m?.returnedDetach),
  }));

  // 成功挂载按 specifier 去重 —— 同一 specifier 重复出现只算一次
  const mountedSpecifiers = [];
  const seenSpec = new Set();
  for (const m of mounts) {
    if (!m.ok || m.specifier == null) continue;
    if (seenSpec.has(m.specifier)) continue;
    seenSpec.add(m.specifier);
    mountedSpecifiers.push(m.specifier);
  }
  const voiceSubscribers = mountedSpecifiers.length > 0;

  // ---- 5a. 没有 voice 订阅者时不得出现 due ----
  const dueEvents = events.filter((e) => e.state === 'due');
  const voiceCheck = (!voiceSubscribers && dueEvents.length > 0)
    ? checkName('due-requires-voice', false,
        `没有成功挂载的 voice 适配器，却出现 ${dueEvents.length} 条 due（seq=${dueEvents.map((e) => e.seq).join(',')}）`)
    : checkName('due-requires-voice', true);

  // ---- 5b. 失败挂载不得留下订阅，也不得计入已挂载列表 ----
  const mountFailures = [];
  for (const m of mounts) {
    if (m.ok) continue;
    if (m.subscriptions !== 0) {
      mountFailures.push(`挂载「${m.specifier ?? `#${m.index}`}」失败却留下 ${m.subscriptions} 个订阅`);
    }
    if (m.specifier != null && mountedSpecifiers.includes(m.specifier)) {
      mountFailures.push(`挂载「${m.specifier}」失败却出现在已挂载列表里`);
    }
  }
  const failedMountCheck = mountFailures.length
    ? checkName('failed-mount-clean', false, mountFailures.join(' | '))
    : checkName('failed-mount-clean', true);

  // ---- 5c. 同一 specifier 重复出现只算一次挂载 ----
  const specCount = new Map();
  for (const m of mounts) {
    if (m.specifier == null) continue;
    specCount.set(m.specifier, (specCount.get(m.specifier) ?? 0) + 1);
  }
  const duplicates = [...specCount.entries()].filter(([, n]) => n > 1);
  const uniqueCheck = duplicates.length
    ? checkName('mount-specifier-unique', false,
        duplicates.map(([spec, n]) => `「${spec}」出现 ${n} 次，只应计 1 次挂载`).join(' | '))
    : checkName('mount-specifier-unique', true);

  const integrityCheck = degradedReasons.length === 0
    ? checkName('snapshot-integrity', true)
    : checkName('snapshot-integrity', false,
        degradedReasons.map((r) => `${r.field}: ${r.reason}`).join(' | '));

  const checksByName = new Map([
    [integrityCheck.name, integrityCheck],
    [stateCheck.name, stateCheck],
    [seqCheck.name, seqCheck],
    [identityCheck.name, identityCheck],
    [timingCheck.name, timingCheck],
    [voiceCheck.name, voiceCheck],
    [failedMountCheck.name, failedMountCheck],
    [uniqueCheck.name, uniqueCheck],
  ]);
  const checks = CHECK_ORDER.map((name) => checksByName.get(name));

  return {
    degraded: degradedReasons.length > 0,
    degradedReasons,
    segment: segment ?? null,
    fallbackAt,
    pos,
    planned,
    openings,
    pairing: {
      pairs: pairs.map(({ scheduled, due }) => ({ scheduled, due })),
      unmatchedScheduled,
      unmatchedDue,
    },
    adapters: {
      records: mounts,
      mountedSpecifiers,
      voiceSubscribers,
    },
    checks,
  };
}

/**
 * 审计一份语音事件快照。
 *
 * @param {object} snapshot
 * @param {Array<{text:string, at?:number|null}>} snapshot.lines 台词槽；空文本会被丢弃，没写 at 的落段首
 * @param {number} [snapshot.fallbackAt=0] 段首时间，没写 at 的台词落在这
 * @param {number} [snapshot.segment] 段号（可空）
 * @param {number} snapshot.pos 当前播放位置（必须有限，否则进入降级）
 * @param {Array<{seq:number, at:number|null, text:string, state:string, input?:string|null, segment?:number|null}>} snapshot.events
 * @param {Array<{specifier:string, ok:boolean, subscriptions:number, returnedDetach:boolean}>} [snapshot.mounts]
 * @returns {object} 可 JSON 序列化的审计结果，任何输入都不抛未捕获异常
 */
export function auditSpeechSnapshot(snapshot) {
  try {
    return runAudit(snapshot);
  } catch (e) {
    // 最后一道防线：哪怕归一化中途遇到意外形状，也退回结构化降级结果而不是抛出去
    const reason = `audit failed: ${String(e?.message ?? e).slice(0, 200)}`;
    return {
      degraded: true,
      degradedReasons: [{ field: 'snapshot', reason }],
      segment: null,
      fallbackAt: 0,
      pos: null,
      planned: [],
      openings: [],
      pairing: { pairs: [], unmatchedScheduled: [], unmatchedDue: [] },
      adapters: { records: [], mountedSpecifiers: [], voiceSubscribers: false },
      checks: CHECK_ORDER.map((name) => checkName(name, false, reason)),
    };
  }
}
