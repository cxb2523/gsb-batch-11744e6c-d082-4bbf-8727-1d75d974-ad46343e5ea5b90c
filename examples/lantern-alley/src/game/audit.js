// Combat turn audit: a pure-data re-creation of the spawn / hit / combo rules that
// game.js (step + onHit) and combat.js (resolveHits + applyHit) run on live fighters.
//
// The audit never imports three, never touches the DOM or disk, never mutates its
// input and returns only JSON-serializable plain data (no Vector3 / Set / functions).
// Feed it a snapshot taken just before a candidate hit and it reports what the game
// would do with that hit, field for field.
import { COMBO_COUNT_GAP } from '../config.js';

export const AUDIT_SCHEMA = 'combat-audit/v1';

const HERO_ID = 'hero';

// Main entry. Never throws: malformed snapshots come back as degraded results with
// readable reasons and a list of the fields that could not be audited.
export function auditCombat(snapshot) {
  let snap;
  try {
    snap = snapshot ?? {};
  } catch (err) {
    return degraded([`snapshot is not readable: ${msg(err)}`], ['*']);
  }
  try {
    return audit(snap);
  } catch (err) {
    return degraded([`audit failed: ${msg(err)}`], ['*'], snapshot);
  }
}

function audit(snap) {
  const degradedReasons = [];
  const affectedFields = [];
  const rawHero = snap.hero ?? null;
  const hero = normalizeFighter(rawHero, HERO_ID);
  const rawEnemies = Array.isArray(snap.enemies) ? snap.enemies : [];
  const enemies = rawEnemies.map((e, i) => normalizeFighter(e, e?.id ?? e?.kind ?? `enemy-${i}`));
  if (!rawHero) {
    degradedReasons.push('snapshot.hero is missing: hero-side hit and combo fields cannot be audited');
    affectedFields.push('hit.attacker', 'hit.freeze.attacker', 'combo');
  }
  if (!Array.isArray(snap.enemies)) {
    degradedReasons.push('snapshot.enemies is missing or not an array: treated as an empty enemy list');
    affectedFields.push('hit.target');
  }
  const time = numberOr(snap.time, 0);
  const checks = [];

  const spawn = buildSpawn(snap, time, checks);

  let hit = null;
  let combo = baseCombo(snap, degradedReasons.length > 0);
  if (snap.candidate == null) {
    degradedReasons.push('snapshot.candidate is null: no candidate hit to audit');
    affectedFields.push('hit');
    checks.push(item('hit.available', false, 'no candidate hit provided'));
  } else {
    const built = buildHit(snap, hero, enemies, time, checks, degradedReasons, affectedFields);
    hit = built.hit;
    combo = built.combo;
  }

  return {
    schema: AUDIT_SCHEMA,
    degraded: degradedReasons.length > 0,
    degradedReasons,
    affectedFields: dedupe(affectedFields),
    time,
    wave: { wave: snap.wave ?? null, wavesLength: snap.wavesLength ?? null },
    spawn,
    hit,
    combo,
    checks,
  };
}

// --- Spawn gate, mirroring game.js step():
//   if (spawnQueue.length && time >= nextArrival && onField < maxOnField) shift + addEnemy
function buildSpawn(snap, time, checks) {
  const queueLength = numberOr(snap.spawnQueueLength, 0);
  const aliveCount = numberOr(snap.aliveCount, 0);
  const maxOnField = numberOr(snap.maxOnField, 0);
  const nextArrival = numberOr(snap.nextArrival, 0);

  const queueOk = queueLength > 0;
  const capacityOk = aliveCount < maxOnField;
  const timingOk = time >= nextArrival;
  checks.push(item('spawn.queue', queueOk, queueOk ? null : `spawnQueue is empty (${queueLength} enemy queued), nothing can arrive`));
  checks.push(item('spawn.capacity', capacityOk, capacityOk ? null : `field is full: ${aliveCount} alive fighters and maxOnField is ${maxOnField}`));
  checks.push(item('spawn.timing', timingOk, timingOk ? null : `nextArrival is at ${nextArrival}s but time is ${time}s`));

  const shouldSpawn = queueOk && capacityOk && timingOk;
  let reason;
  if (shouldSpawn) reason = 'spawn queue non-empty, room on the field and arrival time reached: one enemy spawns';
  else if (!queueOk) reason = 'no spawn: the spawn queue is empty';
  else if (!capacityOk) reason = 'no spawn: maxOnField reached, waiting for a knockout';
  else reason = 'no spawn: nextArrival has not been reached yet';

  return { shouldSpawn, reason, spawnQueueLength: queueLength, aliveCount, maxOnField, nextArrival };
}

// --- Candidate hit, mirroring combat.js resolveHits/applyHit and game.js onHit.
function buildHit(snap, hero, enemies, time, checks, degradedReasons, affectedFields) {
  const cand = snap.candidate ?? {};
  const attacker = findFighter(cand.attacker, hero, enemies);
  const target = findFighter(cand.target, hero, enemies);
  if (!attacker) {
    degradedReasons.push(`candidate attacker "${cand.attacker}" is not present in the snapshot`);
    affectedFields.push('hit.attacker', 'hit.freeze.attacker');
  }
  if (!target) {
    degradedReasons.push(`candidate target "${cand.target}" is not present in the snapshot`);
    affectedFields.push('hit.target', 'hit.damage', 'hit.knockback');
  }

  const rawDef = cand.def ?? {};
  const launched = cand.launched === true;
  // applyHit: a launchChance attack that does not launch swaps in its noLaunch values.
  let effDef = rawDef;
  if (rawDef.launchChance != null && !launched) effDef = { ...rawDef, ...(rawDef.noLaunch ?? {}) };

  const damageScale = attacker?.damageScale ?? cand.damageScale ?? 1;
  const damage = Math.max(0, Math.round(numberOr(effDef.damage, 0) * numberOr(damageScale, 1)));
  const hitstop = numberOr(effDef.hitstop, 0);
  const knockback = numberOr(effDef.knockback, 0);
  const flyingByThreshold = knockback >= 1.2;

  const targetHpBefore = target ? numberOr(target.hp, 0) : null;
  const hpAfter = targetHpBefore === null ? null : Math.max(0, targetHpBefore - damage);
  const targetArmor = target?.armor === true;
  const targetInvuln = target ? numberOr(target.invuln, 0) : null;
  const targetInvulnCfg = target ? numberOr(target.cfgInvuln, 0) : null;
  const invulnAfter = targetInvulnCfg === null ? null : Math.max(targetInvulnCfg, numberOr(effDef.recover, 0));

  // resolveHits only runs while the attack is inside its [hit[0], hit[1]] window.
  let inWindow = cand.inWindow;
  if (inWindow === undefined || inWindow === null) {
    const atk = attacker?.attack ?? cand.attack ?? null;
    if (atk && atk.def && Array.isArray(atk.def.hit) && numberOr(atk.dur, 0) > 0) {
      const p = numberOr(atk.t, 0) / atk.dur;
      inWindow = p >= atk.def.hit[0] && p <= atk.def.hit[1];
    } else {
      inWindow = false;
    }
  }
  const alreadyHit = cand.alreadyHit === true || attackHitsInclude(attacker?.attack, cand.target);
  const targetAlive = target ? target.alive !== false : false;
  const skippedInvuln = targetAlive && targetInvuln !== null && targetInvuln > 0;
  const lands = !!attacker && !!target && inWindow && targetAlive && !skippedInvuln && !alreadyHit;
  // applyHit armor branch is checked AFTER damage, against the post-hit hp.
  const blockedByArmor = lands && targetArmor && effDef.breaksArmor !== true && hpAfter > 0;

  checks.push(item('hit.attackWindow', !!inWindow, inWindow ? null : 'the attack is outside its hit window: resolveHits returns without testing targets'));
  checks.push(item('hit.targetAlive', targetAlive, targetAlive ? null : 'the target is not alive (ko/removed): resolveHits skips it'));
  checks.push(item('hit.invuln', !skippedInvuln, skippedInvuln ? `target has ${targetInvuln}s of invulnerability: the hit is skipped` : null));
  checks.push(item('hit.notAlreadyHit', !alreadyHit, alreadyHit ? 'this attack already hit the target (a.hits): each attack hits each target at most once' : null));
  checks.push(item(
    'hit.damage',
    Number.isInteger(damage) && damage >= 0 && damage === Math.max(0, Math.round(numberOr(effDef.damage, 0) * numberOr(damageScale, 1))),
    null,
  ));
  const hitstopWritten = lands;
  checks.push(item(
    'hit.hitstopBoth',
    hitstopWritten,
    hitstopWritten ? null : 'the hit does not land: no hitstop freeze is written to either fighter',
  ));
  checks.push(item(
    'hit.armor',
    !blockedByArmor,
    blockedByArmor ? 'armor target, attack does not break armor and hp stays above 0: damage applies but takeHit and knockback are skipped' : null,
  ));
  const knockbackProduced = lands && !blockedByArmor;
  checks.push(item(
    'hit.knockback',
    knockbackProduced,
    !lands ? 'the hit does not land: no knockback is produced' : blockedByArmor ? 'armor absorbs the blow: the target is not pushed back' : null,
  ));

  let reason;
  if (!lands) {
    if (!attacker || !target) reason = 'hit not auditable: a fighter is missing from the snapshot';
    else if (!inWindow) reason = 'skipped: the attack is outside its hit window';
    else if (!targetAlive) reason = 'skipped: the target is not alive';
    else if (skippedInvuln) reason = `skipped: target invulnerable for ${targetInvuln}s`;
    else reason = 'skipped: this attack already hit the target';
  } else if (blockedByArmor) reason = 'lands but armor-blocked: damage and hitstop apply, no takeHit, stagger or knockback';
  else reason = 'lands: full applyHit path (damage, hitstop on both fighters, knockback, takeHit)';

  const hit = {
    lands,
    inWindow: !!inWindow,
    targetAlive,
    skippedInvuln,
    alreadyHit,
    blockedByArmor,
    launched,
    attackerId: cand.attacker ?? null,
    targetId: cand.target ?? null,
    damage,
    damageScale: numberOr(damageScale, 1),
    hitstop,
    freeze: {
      attacker: hitstopWritten ? hitstop : 0,
      target: hitstopWritten ? hitstop : 0,
    },
    knockback: knockbackProduced ? knockback : 0,
    flying: knockbackProduced && flyingByThreshold,
    flyingThreshold: 1.2,
    targetHpBefore,
    targetHpAfter: lands ? hpAfter : targetHpBefore,
    invulnAfter: lands ? invulnAfter : targetInvuln,
    takeHit: knockbackProduced,
    reason,
  };

  const combo = buildCombo(snap, cand, lands, time, hero, checks);
  return { hit, combo };
}

// game.js onHit: hero hits advance/reset the combo counter (armor-blocked hits still
// call onHit; skipped hits never do); any other attacker zeroes the counter.
function buildCombo(snap, cand, lands, time, hero, checks) {
  const previous = numberOr(snap.combo, 0);
  const lastComboHit = numberOr(snap.lastComboHit, -99);
  const byHero = cand.attacker === HERO_ID || hero?.id === cand.attacker;

  if (!lands) {
    checks.push(item('combo.rule', true, null));
    return { value: previous, counted: false, byHero, reason: 'the candidate hit does not land, so onHit is not called: the combo counter stays at ' + previous };
  }
  if (byHero) {
    const gap = time - lastComboHit;
    if (gap <= COMBO_COUNT_GAP) {
      checks.push(item('combo.rule', true, null));
      return { value: previous + 1, counted: true, byHero: true, gap, reason: `hero hit ${gap.toFixed(3)}s after the last one (<= ${COMBO_COUNT_GAP}s): combo increments to ${previous + 1}` };
    }
    checks.push(item('combo.rule', true, null));
    return { value: 1, counted: true, byHero: true, gap, reason: `hero hit ${gap.toFixed(3)}s after the last one (> ${COMBO_COUNT_GAP}s): combo resets to 1` };
  }
  checks.push(item('combo.rule', true, null));
  return { value: 0, counted: false, byHero: false, reason: 'a non-hero attacker landed the hit: game.js zeroes the combo counter' };
}

function baseCombo(snap, degraded) {
  return {
    value: numberOr(snap.combo, 0),
    counted: false,
    byHero: null,
    reason: degraded ? 'combo not audited: snapshot is degraded and no candidate hit was evaluated' : 'no candidate hit: the combo counter is unchanged',
  };
}

// --- helpers
// Heroes and enemies share the Fighter fields, but snapshots describe them with slightly
// different shapes; normalize both so findFighter returns one common record layout.
function normalizeFighter(f, fallbackId) {
  if (!f) return null;
  return {
    id: f.id ?? fallbackId,
    kind: f.kind ?? (f.id === HERO_ID || fallbackId === HERO_ID ? HERO_ID : f.kind),
    hp: f.hp,
    alive: f.alive,
    invuln: f.invuln ?? 0,
    freeze: f.freeze ?? 0,
    armor: f.armor === true,
    cfgInvuln: f.cfgInvuln ?? f.invuln ?? 0,
    damageScale: f.damageScale ?? 1,
    attack: f.attack ?? null,
    kb: f.kb ?? null,
  };
}

function findFighter(id, hero, enemies) {
  if (id === undefined || id === null) return null;
  if (id === HERO_ID || hero?.id === id) return hero;
  return enemies.find(e => e.id === id || e.kind === id) ?? null;
}

function attackHitsInclude(attack, targetId) {
  if (!attack || attack.hits === undefined || attack.hits === null) return false;
  if (Array.isArray(attack.hits)) return attack.hits.includes(targetId);
  if (attack.hits instanceof Set) return attack.hits.has(targetId);
  return false; // a plain hit count cannot identify which targets were hit
}

function item(name, pass, reason) {
  return { name, pass: !!pass, reason: pass ? null : reason };
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dedupe(list) {
  const out = [];
  for (const v of list) if (!out.includes(v)) out.push(v);
  return out;
}

function msg(err) {
  return err && err.message ? err.message : String(err);
}

function degraded(reasons, affectedFields, snapshot) {
  return {
    schema: AUDIT_SCHEMA,
    degraded: true,
    degradedReasons: reasons,
    affectedFields: dedupe(affectedFields),
    time: snapshot && typeof snapshot.time === 'number' ? snapshot.time : null,
    wave: { wave: snapshot?.wave ?? null, wavesLength: snapshot?.wavesLength ?? null },
    spawn: null,
    hit: null,
    combo: null,
    checks: [item('audit.readable', false, reasons.join('; '))],
  };
}
