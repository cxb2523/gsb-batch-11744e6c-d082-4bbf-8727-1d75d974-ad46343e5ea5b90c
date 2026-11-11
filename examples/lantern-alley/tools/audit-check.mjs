// Combat audit checks (game logic only, no browser/GPU/network).
// The real resolveHits/applyHit from combat.js is run on tiny local fakes, and the
// pure-data audit from src/game/audit.js must reproduce its damage, hitstop,
// knockback, flying flag and combo results field for field.
// Usage: node tools/audit-check.mjs
globalThis.location ??= { search: '?seed=7' };   // random.js reads location.search at import time

const { resolveHits } = await import('../src/game/combat.js');
const { ATTACKS, FIGHTERS, COMBO_COUNT_GAP } = await import('../src/config.js');
const { auditCombat } = await import('../src/game/audit.js');
const { readFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}  (${detail})`); }
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// --- minimal fighters: just the surface combat.js resolveHits/applyHit touches
function makeFighter(kind, role, opts = {}) {
  const cfg = FIGHTERS[kind];
  return {
    id: opts.id ?? (role === 'hero' ? 'hero' : kind + '-1'),
    kind,
    cfg: { ...cfg },
    pos: { x: opts.x ?? 0, z: opts.z ?? 0 },
    facing: opts.facing ?? 1,
    radius: cfg.radius,
    hp: opts.hp ?? cfg.hp,
    maxHp: opts.maxHp ?? cfg.hp,
    alive: true,
    state: 'idle',
    attack: null,
    attackActive: false,
    freeze: 0,
    invuln: opts.invuln ?? 0,
    kb: null,
    damageScale: opts.damageScale ?? 1,
    flashCount: 0,
    visual: { hitFlash() { this.flashCount++; } },
    // mirrors Fighter.takeHit for the parts applyHit relies on
    takeHit(def) {
      this.attack = null;
      if (this.hp <= 0) { this.state = 'ko'; this.alive = false; return true; }
      this.state = def.react === 'head' ? 'hit_to_head' : 'hit_to_body';
      return false;
    },
  };
}

function startAttack(f, name, defOverride) {
  const def = defOverride ? { ...ATTACKS[name], ...defOverride } : ATTACKS[name];
  f.attack = { name, def, t: (def.hit[0] + def.hit[1]) / 2, dur: 1, hits: new Set() };
  f.attackActive = true;
}

// Runs the real resolveHits and the real onHit combo rule from game.js.
function runRealHit(attacker, target, time, opts = {}) {
  const state = { combo: opts.combo ?? 0, lastComboHit: opts.lastComboHit ?? -99, time, hit: null };
  const onHit = h => {
    if (h.attacker === opts.heroRef) {
      state.combo = state.time - state.lastComboHit <= COMBO_COUNT_GAP ? state.combo + 1 : 1;
      state.lastComboHit = state.time;
    } else state.combo = 0;
    state.hit = h;
  };
  const hpBefore = target.hp;
  resolveHits(attacker, [target], onHit);
  const h = state.hit;
  return {
    hit: h,
    hpBefore,
    hpAfter: target.hp,
    targetFreeze: target.freeze,
    attackerFreeze: attacker.freeze,
    kbRemaining: target.kb ? target.kb.remaining : 0,
    flying: target.kb ? target.kb.flying : false,
    targetState: target.state,
    alive: target.alive,
    combo: state.combo,
  };
}

function snapshotFor(attacker, target, time, opts = {}) {
  const attack = attacker.attack;
  return {
    wave: opts.wave ?? 0,
    wavesLength: opts.wavesLength ?? 4,
    spawnQueueLength: opts.spawnQueueLength ?? 1,
    aliveCount: opts.aliveCount ?? 1,
    maxOnField: opts.maxOnField ?? 3,
    nextArrival: opts.nextArrival ?? time,
    time,
    hero: opts.includeHero === false ? undefined : {
      id: 'hero',
      kind: 'hero',
      hp: opts.heroHp ?? 100,
      maxHp: 100,
      alive: true,
      invuln: 0,
      freeze: 0,
      armor: false,
      cfgInvuln: FIGHTERS.hero.invuln,
      damageScale: attacker.id === 'hero' ? attacker.damageScale : 1,
      attack: attacker.id === 'hero' && attack
        ? { name: attack.name, def: attack.def, t: attack.t, dur: attack.dur, hitCount: attack.hits.size }
        : null,
    },
    enemies: opts.includeEnemies === false ? [] : [{
      id: target.id,
      kind: target.kind,
      hp: target.hp,
      alive: target.alive,
      invuln: target.invuln,
      freeze: target.freeze,
      armor: target.cfg.armor === true,
      cfgInvuln: target.cfg.invuln,
      damageScale: target.damageScale,
      kb: target.kb ? { dir: target.kb.dir, remaining: target.kb.remaining, flying: target.kb.flying, bumpedCount: target.kb.bumped.size } : null,
    }],
    turns: { holder: opts.holder ?? null, gap: opts.gap ?? 2 },
    combo: opts.combo ?? 0,
    lastComboHit: opts.lastComboHit ?? -99,
    candidate: opts.candidate === undefined ? {
      attacker: attacker.id,
      target: target.id,
      def: attack ? attack.def : {},
      launched: opts.launched ?? false,
      inWindow: attack ? attacker.attackActive : false,
    } : opts.candidate,
  };
}

// The audit must equal the real applyHit/onHit outcome on every audited field.
function matchReal(result, real, label) {
  const h = result.hit;
  check(`${label}: damage equals real applyHit`, h.damage === (real.hit ? real.hit.damage : 0), `audit ${h.damage} vs real ${real.hit?.damage}`);
  check(`${label}: target hitstop equals real freeze`, h.freeze.target === real.targetFreeze, `${h.freeze.target} vs ${real.targetFreeze}`);
  check(`${label}: attacker hitstop equals real freeze`, h.freeze.attacker === real.attackerFreeze, `${h.freeze.attacker} vs ${real.attackerFreeze}`);
  check(`${label}: knockback equals real kb.remaining`, h.knockback === real.kbRemaining, `${h.knockback} vs ${real.kbRemaining}`);
  check(`${label}: flying flag equals real kb.flying`, h.flying === real.flying, `${h.flying} vs ${real.flying}`);
  check(`${label}: target hp equals real hp`, h.targetHpAfter === real.hpAfter, `${h.targetHpAfter} vs ${real.hpAfter}`);
  check(`${label}: combo equals real onHit combo`, result.combo.value === real.combo, `${result.combo.value} vs ${real.combo}`);
}

const jsonRoundTrips = (label, value) => {
  let ok = true;
  try {
    const again = JSON.parse(JSON.stringify(value));
    ok = JSON.stringify(value) === JSON.stringify(again);
  } catch { ok = false; }
  check(`${label}: audit result is JSON-serializable with no data loss`, ok);
};

const deepFreeze = v => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
};

// ---------------------------------------------------------------- 1. happy path
{
  const time = 2.0;
  const hero = makeFighter('hero', 'hero');
  const target = makeFighter('thug_skinny', 'enemy');
  startAttack(hero, 'jab');
  const real = runRealHit(hero, target, time, { heroRef: hero, combo: 0, lastComboHit: -99 });
  const snap = deepFreeze(snapshotFor(hero, makeFighter('thug_skinny', 'enemy'), time, { combo: 0, lastComboHit: -99 }));
  const result = auditCombat(snap);
  check('happy path: audit reports the hit lands', result.hit.lands === true, JSON.stringify(result.hit));
  check('happy path: every ordered check passes', result.checks.every(c => c.pass), result.checks.filter(c => !c.pass).map(c => c.name + ': ' + c.reason).join(' | '));
  check('happy path: spawn gate reports one arrival', result.spawn.shouldSpawn === true, result.spawn.reason);
  matchReal(result, real, 'happy path');
  eq('happy path: hitstop is 0.07 on both fighters', result.hit.freeze, { attacker: 0.07, target: 0.07 });
  eq('happy path: jab knockback 0.12 is not flying', { kb: result.hit.knockback, flying: result.hit.flying }, { kb: 0.12, flying: false });
  eq('happy path: first hit starts combo at 1', result.combo.value, 1);
  jsonRoundTrips('happy path', result);
}

// --------------------------------------------- 2. combo: two quick hits then gap
{
  // second hit 0.5 s after the first: inside COMBO_COUNT_GAP, combo 1 -> 2
  const time = 2.5;
  const hero = makeFighter('hero', 'hero');
  const target = makeFighter('thug_skinny', 'enemy', { hp: 22 });
  startAttack(hero, 'cross');
  const real = runRealHit(hero, target, time, { heroRef: hero, combo: 1, lastComboHit: 2.0 });
  const preTarget = makeFighter('thug_skinny', 'enemy', { hp: 22 });
  const result = auditCombat(snapshotFor(hero, preTarget, time, { combo: 1, lastComboHit: 2.0 }));
  check('combo: second quick hit lands', result.hit.lands && result.checks.every(c => c.pass));
  matchReal(result, real, 'combo second hit');
  eq('combo: counter increments to 2 within the gap', result.combo.value, 2);
  eq('combo: hit is counted', result.combo.counted, true);

  // same hit 1.5 s after the last one: outside the 1.2 s gap, resets to 1
  const hero2 = makeFighter('hero', 'hero');
  const target2 = makeFighter('thug_skinny', 'enemy', { hp: 22 });
  startAttack(hero2, 'cross');
  const realLate = runRealHit(hero2, target2, 3.5, { heroRef: hero2, combo: 2, lastComboHit: 2.0 });
  const late = auditCombat(snapshotFor(hero2, makeFighter('thug_skinny', 'enemy', { hp: 22 }), 3.5, { combo: 2, lastComboHit: 2.0 }));
  eq('combo: a hit later than COMBO_COUNT_GAP resets to 1 (audit)', late.combo.value, 1);
  eq('combo: a hit later than COMBO_COUNT_GAP resets to 1 (real)', realLate.combo, 1);
  jsonRoundTrips('combo', late);
}

// ----------------------------------------- 3. negative: invulnerable target skip
{
  const time = 4.0;
  const hero = makeFighter('hero', 'hero');
  const target = makeFighter('thug_skinny', 'enemy', { invuln: 0.2 });
  startAttack(hero, 'jab');
  const real = runRealHit(hero, target, time, { heroRef: hero, combo: 3, lastComboHit: 3.9 });
  const pre = makeFighter('thug_skinny', 'enemy', { invuln: 0.2 });
  const result = auditCombat(snapshotFor(hero, pre, time, { combo: 3, lastComboHit: 3.9 }));
  check('invuln: real resolveHits does not land', real.hit === null);
  check('invuln: audit marks the hit skipped', result.hit.lands === false && result.hit.skippedInvuln === true, result.hit.reason);
  check('invuln: invuln check item explains the skip', result.checks.find(c => c.name === 'hit.invuln')?.pass === false);
  eq('invuln: no damage applied', result.hit.targetHpAfter, result.hit.targetHpBefore);
  eq('invuln: no knockback produced', result.hit.knockback, 0);
  eq('invuln: not flying', result.hit.flying, false);
  eq('invuln: no hitstop written', result.hit.freeze, { attacker: 0, target: 0 });
  eq('invuln: combo untouched because onHit never fires', result.combo.value, 3);
  jsonRoundTrips('invuln', result);
}

// ------------------------------------------ 4. negative: armor blocks stagger/kb
{
  const time = 5.0;
  const hero = makeFighter('hero', 'hero');
  const slab = makeFighter('thug_fat', 'enemy');
  startAttack(hero, 'jab');                       // jab does not break armor
  const real = runRealHit(hero, slab, time, { heroRef: hero });
  const pre = makeFighter('thug_fat', 'enemy');
  const result = auditCombat(snapshotFor(hero, pre, time));
  check('armor: real hit is flagged armored', real.hit?.armored === true);
  check('armor: audit reports armor interception', result.hit.lands === true && result.hit.blockedByArmor === true, result.hit.reason);
  check('armor: armor check item fails with a readable reason', result.checks.find(c => c.name === 'hit.armor')?.pass === false);
  matchReal(result, real, 'armor block');
  eq('armor: damage still lands (8)', result.hit.damage, 8);
  eq('armor: hitstop still freezes both', result.hit.freeze, { attacker: 0.07, target: 0.07 });
  eq('armor: no knockback', result.hit.knockback, 0);
  eq('armor: not flying', result.hit.flying, false);
  eq('armor: takeHit not entered', result.hit.takeHit, false);
  check('armor: real target was never staggered', real.targetState === 'idle', real.targetState);
  eq('armor: armored hit still counts towards the combo (onHit fires)', result.combo.value, real.combo);

  // same target, armor-breaking hook: full path, 1.5 m knockback -> flying
  const hero2 = makeFighter('hero', 'hero');
  const slab2 = makeFighter('thug_fat', 'enemy');
  startAttack(hero2, 'hook');
  const realHook = runRealHit(hero2, slab2, time + 0.5, { heroRef: hero2 });
  const broke = auditCombat(snapshotFor(hero2, makeFighter('thug_fat', 'enemy'), time + 0.5));
  check('break armor: audit allows the hit through', broke.hit.blockedByArmor === false && broke.hit.lands === true);
  matchReal(broke, realHook, 'break armor');
  eq('break armor: flying at 1.5 m knockback', broke.hit.flying, true);
  jsonRoundTrips('armor', result);
}

// ------------------------------- 5. boundary: launchChance roll says no launch
{
  // find a real trial where chance(0.5) does not launch, then audit with launched=false
  let real, attempt = 0;
  for (; attempt < 200; attempt++) {
    const hero = makeFighter('hero', 'hero');
    const target = makeFighter('thug_skinny', 'enemy');
    startAttack(hero, 'flying_kick');
    real = runRealHit(hero, target, 6 + attempt * 0.1, { heroRef: hero });
    if (real.hit && real.hit.launched === false) break;
  }
  check('no-launch: found a real grounded flying_kick trial', real.hit?.launched === false, `after ${attempt} tries`);
  const hero = makeFighter('hero', 'hero');
  startAttack(hero, 'flying_kick');
  const result = auditCombat(snapshotFor(hero, makeFighter('thug_skinny', 'enemy'), 6, { launched: false }));
  check('no-launch: audit agrees it stays grounded', result.hit.launched === false && result.hit.flying === false);
  matchReal(result, real, 'no-launch');
  eq('no-launch: noLaunch knockback 0.35', result.hit.knockback, 0.35);
  eq('no-launch: noLaunch hitstop 0.08', result.hit.hitstop, 0.08);

  // and a launching trial: 2.2 m knockback, flying
  let realFly;
  for (let i = 0; i < 200; i++) {
    const h2 = makeFighter('hero', 'hero');
    const t2 = makeFighter('thug_skinny', 'enemy');
    startAttack(h2, 'flying_kick');
    realFly = runRealHit(h2, t2, 8 + i * 0.1, { heroRef: h2 });
    if (realFly.hit?.launched === true) break;
  }
  check('launch: found a real flying trial', realFly.hit?.launched === true);
  const h3 = makeFighter('hero', 'hero');
  startAttack(h3, 'flying_kick');
  const fly = auditCombat(snapshotFor(h3, makeFighter('thug_skinny', 'enemy'), 8, { launched: true }));
  matchReal(fly, realFly, 'launch');
  eq('launch: flying true at 2.2 m', { kb: fly.hit.knockback, flying: fly.hit.flying }, { kb: 2.2, flying: true });
  jsonRoundTrips('no-launch', result);
}

// -------------------------- 6. boundary: damage rounds to 0, hp must not change
{
  const time = 7.0;
  const hero = makeFighter('hero', 'hero');
  const target = makeFighter('thug_skinny', 'enemy', { hp: 30 });
  startAttack(hero, 'jab', { damage: 0.4, knockback: 0, hitstop: 0.05 });
  const real = runRealHit(hero, target, time, { heroRef: hero });
  const result = auditCombat(snapshotFor(hero, makeFighter('thug_skinny', 'enemy', { hp: 30 }), time));
  eq('zero damage: real rounds 0.4*1 to 0', real.hit.damage, 0);
  matchReal(result, real, 'zero damage');
  eq('zero damage: target hp unchanged', result.hit.targetHpAfter, 30);
  check('zero damage: audit damage is never negative', result.hit.damage >= 0);
  jsonRoundTrips('zero damage', result);
}

// ----------------------------------- 7. boundary: spawn queue empty / full / early
{
  const heroForSpawn = makeFighter('hero', 'hero');
  startAttack(heroForSpawn, 'jab');
  const base = snapshotFor(heroForSpawn, makeFighter('thug_skinny', 'enemy'), 3, { spawnQueueLength: 0 });
  const empty = auditCombat(base);
  check('spawn: empty queue means no spawn', empty.spawn.shouldSpawn === false && /empty/i.test(empty.spawn.reason), empty.spawn.reason);
  check('spawn: queue check item fails with reason', empty.checks.find(c => c.name === 'spawn.queue')?.pass === false);

  const full = auditCombat({ ...base, spawnQueueLength: 2, aliveCount: 4, maxOnField: 4, nextArrival: 0 });
  check('spawn: full field blocks arrival', full.spawn.shouldSpawn === false && /maxOnField|full/i.test(full.spawn.reason), full.spawn.reason);

  const early = auditCombat({ ...base, spawnQueueLength: 2, aliveCount: 1, maxOnField: 4, nextArrival: 99 });
  check('spawn: arrival in the future blocks arrival', early.spawn.shouldSpawn === false && /nextArrival/i.test(early.spawn.reason), early.spawn.reason);

  const go = auditCombat({ ...base, spawnQueueLength: 2, aliveCount: 1, maxOnField: 4, nextArrival: 3 });
  check('spawn: queue + room + due time spawns exactly one', go.spawn.shouldSpawn === true, go.spawn.reason);
  jsonRoundTrips('spawn', go);
}

// --------------------------------- 8. non-hero attacker zeroes the combo counter
{
  const time = 9.0;
  const enemy = makeFighter('thug_skinny', 'enemy');
  const heroTarget = makeFighter('hero', 'hero', { id: 'hero' });
  startAttack(enemy, 'sprat_jab');
  const real = runRealHit(enemy, heroTarget, time, { heroRef: heroTarget, combo: 4, lastComboHit: 8.8 });
  const snap = {
    wave: 0, wavesLength: 4, spawnQueueLength: 1, aliveCount: 1, maxOnField: 3, nextArrival: time, time,
    hero: { id: 'hero', kind: 'hero', hp: 100, maxHp: 100, alive: true, attack: null, cfgInvuln: FIGHTERS.hero.invuln, armor: false, damageScale: 1, invuln: 0, freeze: 0, kb: null },
    enemies: [{ id: enemy.id, kind: enemy.kind, hp: enemy.hp, alive: true, invuln: 0, freeze: 0, armor: false, cfgInvuln: FIGHTERS.thug_skinny.invuln, damageScale: 1, kb: null }],
    turns: { holder: enemy.id, gap: 2 },
    combo: 4, lastComboHit: 8.8,
    candidate: { attacker: enemy.id, target: 'hero', def: enemy.attack.def, launched: false, inWindow: true },
  };
  const result = auditCombat(snap);
  check('enemy hit: real onHit zeroes combo', real.combo === 0);
  eq('enemy hit: audit zeroes combo', result.combo.value, 0);
  eq('enemy hit: not counted as a hero combo', result.combo.byHero, false);
  matchReal(result, real, 'enemy hit');
  jsonRoundTrips('enemy hit', result);
}

// ---------------------- 9. degraded snapshots never throw and stay JSON-safe
{
  let r1, r2, r3;
  const h1 = makeFighter('hero', 'hero'); startAttack(h1, 'jab');
  const h2 = makeFighter('hero', 'hero'); startAttack(h2, 'jab');
  check('degraded: missing hero does not throw', (() => { r1 = auditCombat(snapshotFor(h1, makeFighter('thug_skinny', 'enemy'), 1, { includeHero: false })); return true; })());
  check('degraded: missing hero is flagged', r1.degraded === true && r1.affectedFields.length > 0, r1.degradedReasons.join('; '));
  check('degraded: empty enemy list does not throw', (() => { r2 = auditCombat(snapshotFor(h2, makeFighter('thug_skinny', 'enemy'), 1, { includeEnemies: false })); return true; })());
  check('degraded: empty enemy list resolves the target as missing and is flagged', r2.degraded === true && /target/.test(r2.degradedReasons.join('; ')), r2.degradedReasons.join('; '));
  check('degraded: null candidate does not throw', (() => { r3 = auditCombat({ wave: 0, wavesLength: 4, spawnQueueLength: 0, aliveCount: 0, maxOnField: 3, nextArrival: 0, time: 1, hero: { id: 'hero', hp: 10, maxHp: 100, alive: true, attack: null }, enemies: [], turns: { holder: null, gap: 2 }, combo: 0, lastComboHit: -99, candidate: null }); return true; })());
  check('degraded: null candidate is flagged with affected hit fields', r3.degraded === true && r3.affectedFields.includes('hit'), r3.degradedReasons.join('; '));
  check('degraded: totally garbage input does not throw', (() => { const r = auditCombat(null); return r.degraded === true && r.checks[0].pass === false; })());
  for (const [label, r] of [['missing hero', r1], ['empty enemies', r2], ['null candidate', r3]]) jsonRoundTrips(label, r);
}

// ------------------------- 10. the audit module itself stays pure (no three/DOM/fs)
{
  const srcPath = fileURLToPath(new URL('../src/game/audit.js', import.meta.url));
  const src = readFileSync(srcPath, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); // comments can mention what the code avoids
  check('purity: audit.js does not import three', !/from\s+['"]three['"]/.test(code));
  check('purity: audit.js does not touch the DOM or storage', !/(^|[^\w.])(document|window|localStorage|performance)\s*[.[]/.test(code));
  check('purity: audit.js does not import node built-ins or fs', !/node:|from\s+['"]fs|readFile|writeFile/.test(code));
  check('purity: audit.js exports no Set/Vector3/function in a sample output', (() => {
    const h = makeFighter('hero', 'hero');
    startAttack(h, 'jab');
    const r = auditCombat(snapshotFor(h, makeFighter('thug_skinny', 'enemy'), 1));
    const bad = JSON.stringify(r, (k, v) => (typeof v === 'function' || v instanceof Set || v?.isVector3 ? '__BAD__' : v));
    return !bad.includes('__BAD__');
  })());
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
