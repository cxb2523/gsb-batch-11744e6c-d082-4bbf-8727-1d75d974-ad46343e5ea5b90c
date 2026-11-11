// 技能目标解析与名次表一致性 —— 纯函数模块。
// 不访问 window / localStorage，不发起网络请求，不依赖 Three.js，
// 不修改任何传入数组；输出为可 JSON 序列化的普通数据。
// 解析顺序与 main.js 的 castAttack 逐项保持一致：
//   1. race.rows(playerZ) 中按 place 找行；行缺失或行.me → 拒绝
//   2. opponents 中先按 id 找、再按 name 找，取第一个匹配项
//   3. 找不到对手 → 不命中（castAttack 直接 return，技能槽保留）

// 不可释放原因枚举（code → 可读原因）
export const RELEASE_REASONS = {
  NO_SKILL: '无待释放技能',
  UNKNOWN_SKILL: '技能不在技能表中',
  NOT_RACE: '当前不是竞速模式',
  PLAYER_DEAD: '玩家已死亡',
  SELF_SKILL: '自用技能无需选目标',
};

// 目标解析失败原因枚举（code → 可读原因）
export const TARGET_FAILURES = {
  PLACE_NOT_FOUND: '名次不存在',
  TARGET_SELF: '选中自己',
  OPPONENT_GONE: '对手已不存在',
};

function countValues(rows, pick) {
  const counts = new Map();
  for (const row of rows) {
    const key = pick(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicated = [];
  for (const [key, n] of counts) if (n > 1) duplicated.push(key);
  return duplicated;
}

// 输入：
// {
//   playerZ: number,            // 当前玩家 z（仅审计记录用）
//   rows: Array<{place,id,name,me}>,
//   opponents: Array<{id,name,remote,z}>,
//   skillKey: string|null,      // 待释放技能 key（对应 main.js 的 atkSkill）
//   skills: SKILLS,             // 技能表
//   place: number|null,         // 玩家按 1/2/3 选择的名次
//   mode: string,               // title | run | race | over | pause
//   playerAlive: boolean,
// }
export function resolveSkillTarget(input) {
  const src = input && typeof input === 'object' ? input : {};
  const playerZ = Number.isFinite(src.playerZ) ? src.playerZ : 0;
  const rows = Array.isArray(src.rows) ? src.rows : [];
  const opponents = Array.isArray(src.opponents) ? src.opponents : [];
  const skillKey = src.skillKey === undefined ? null : src.skillKey;
  const skills = src.skills && typeof src.skills === 'object' ? src.skills : {};
  const place = src.place === undefined ? null : src.place;
  const mode = typeof src.mode === 'string' ? src.mode : 'title';
  const playerAlive = src.playerAlive !== false;

  const checks = [];
  const addCheck = (name, label, pass, reason = null) => checks.push({ name, label, pass, reason });

  // 重复统计（纯读取，不排序、不改数组）。null 也参与统计：
  // 实际名次表里玩家行与 AI 行 id 都是 null，这正是 castAttack 的 id 匹配会命中第一个 AI 的原因。
  const duplicateIds = countValues(rows, (r) => (r === null || r === undefined ? null : r.id));
  const duplicateNames = countValues(rows, (r) => (r === null || r === undefined ? null : r.name));
  const duplicates = {
    hasDuplicateId: duplicateIds.length > 0,
    hasDuplicateName: duplicateNames.length > 0,
    duplicateIds,
    duplicateNames,
  };

  const hasKey = skillKey !== null && skillKey !== undefined && skillKey !== '';
  const skill = hasKey && Object.prototype.hasOwnProperty.call(skills, skillKey) ? skills[skillKey] : null;

  let canRelease = false;
  let reasonCode = null;
  let reason = null;
  let target = null;
  let failureCode = null;
  let failureReason = null;
  let matchedBy = null;
  let resolvedRow = null;

  const finish = () => ({
    canRelease,
    ok: canRelease,
    reasonCode,
    reason,
    skillKey: hasKey ? String(skillKey) : null,
    skillName: skill && skill.name ? skill.name : null,
    isAttack: !!(skill && skill.self === false),
    isSelfSkill: !!(skill && skill.self === true),
    place: place === null || place === undefined ? null : place,
    target,
    failureCode,
    failureReason,
    matchedBy,
    row: resolvedRow,
    duplicates,
    checks,
    meta: {
      mode,
      playerAlive,
      playerZ,
      rowCount: rows.length,
      opponentCount: opponents.length,
    },
  });

  // 1) 技能槽非空
  addCheck('skill_equipped', '存在待释放技能', hasKey, hasKey ? null : RELEASE_REASONS.NO_SKILL);
  if (!hasKey) {
    reasonCode = 'NO_SKILL';
    reason = RELEASE_REASONS.NO_SKILL;
    return finish();
  }

  // 2) 技能在技能表中
  const known = skill !== null && skill !== undefined;
  addCheck('skill_known', '技能在技能表中', known, known ? null : RELEASE_REASONS.UNKNOWN_SKILL);
  if (!known) {
    reasonCode = 'UNKNOWN_SKILL';
    reason = RELEASE_REASONS.UNKNOWN_SKILL;
    return finish();
  }

  // 3) 竞速模式
  const inRace = mode === 'race';
  addCheck('race_mode', '处于竞速模式', inRace, inRace ? null : RELEASE_REASONS.NOT_RACE);
  if (!inRace) {
    reasonCode = 'NOT_RACE';
    reason = RELEASE_REASONS.NOT_RACE;
    return finish();
  }

  // 4) 玩家存活
  addCheck('player_alive', '玩家存活', playerAlive, playerAlive ? null : RELEASE_REASONS.PLAYER_DEAD);
  if (!playerAlive) {
    reasonCode = 'PLAYER_DEAD';
    reason = RELEASE_REASONS.PLAYER_DEAD;
    return finish();
  }

  // 5) 攻击类技能；自用技能（gale/shield/magnet）不解析目标
  const isAttack = skill.self === false;
  addCheck('attack_type', '攻击类技能', isAttack, isAttack ? null : RELEASE_REASONS.SELF_SKILL);
  if (!isAttack) {
    reasonCode = 'SELF_SKILL';
    reason = RELEASE_REASONS.SELF_SKILL;
    return finish();
  }

  // 6) 名次存在（与 castAttack 同一个 find）
  const row = rows.find((r) => r && r.place === place);
  const placeExists = row !== undefined;
  addCheck(
    'place_exists',
    '名次表中存在该名次',
    placeExists,
    placeExists ? null : TARGET_FAILURES.PLACE_NOT_FOUND
  );
  if (!placeExists) {
    failureCode = 'PLACE_NOT_FOUND';
    failureReason = TARGET_FAILURES.PLACE_NOT_FOUND;
    return finish();
  }

  // 7) 不能选自己
  const notSelf = row.me !== true;
  addCheck('not_self', '选中名次不是自己', notSelf, notSelf ? null : TARGET_FAILURES.TARGET_SELF);
  if (!notSelf) {
    failureCode = 'TARGET_SELF';
    failureReason = TARGET_FAILURES.TARGET_SELF;
    return finish();
  }

  resolvedRow = {
    place: row.place,
    id: row.id === undefined ? null : row.id,
    name: row.name === undefined ? null : row.name,
    me: row.me === true,
  };

  // 8) 名次表唯一性（警告项：重复不阻止释放，castAttack 仍会按顺序命中）
  const dupParts = [];
  if (duplicates.hasDuplicateId) dupParts.push(`重复 id: ${duplicateIds.map((v) => String(v)).join(', ')}`);
  if (duplicates.hasDuplicateName) dupParts.push(`重复 name: ${duplicateNames.map((v) => String(v)).join(', ')}`);
  addCheck('row_unique', '名次表 id/name 无重复', dupParts.length === 0, dupParts.length ? dupParts.join('；') : null);

  // 9) 反查对手：先 id 后 name，均取第一个匹配（与 castAttack 完全一致）
  const byId = opponents.find((x) => x && x.id === row.id);
  const byName = byId ? undefined : opponents.find((x) => x && x.name === row.name);
  const opponent = byId || byName || null;
  matchedBy = byId ? 'id' : byName ? 'name' : null;

  const opponentExists = opponent !== null;
  addCheck(
    'opponent_exists',
    '对手数组中可反查到目标',
    opponentExists,
    opponentExists ? null : TARGET_FAILURES.OPPONENT_GONE
  );
  if (!opponentExists) {
    failureCode = 'OPPONENT_GONE';
    failureReason = TARGET_FAILURES.OPPONENT_GONE;
    return finish();
  }

  target = {
    id: opponent.id === undefined ? null : opponent.id,
    name: opponent.name === undefined ? null : opponent.name,
    remote: opponent.remote === true,
    z: opponent.z === undefined ? null : opponent.z,
    matchedBy,
  };
  canRelease = true;
  return finish();
}
