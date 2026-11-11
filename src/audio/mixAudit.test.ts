// Automated tests for mixAudit. No network, credentials or audio devices:
// the real Soundscape is driven with a tiny in-memory AudioContext stub that
// records every setTargetAtTime target, and the audit's numbers are compared
// value-for-value with what update() writes. Run with: node --test --experimental-strip-types src/audio/mixAudit.test.ts

/// <reference types="node" />

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Soundscape } from './soundscape.ts';
import type { SoundView } from './soundscape.ts';
import { buildZones } from './zones.ts';
import { VOICE_PANEL } from './voices.ts';
import { auditMix } from './mixAudit.ts';
import type { AuditPanel, AuditZone, MixSnapshot } from './mixAudit.ts';
import type { Scene, PanelId } from '../scene.ts';

// --- minimal in-memory Web Audio stub ---------------------------------------
class FakeParam {
  value: number;
  targets: { value: number; time: number; tc: number }[] = [];
  constructor(value = 0) { this.value = value; }
  setTargetAtTime(value: number, time: number, tc: number): void { this.targets.push({ value, time, tc }); this.value = value; }
  setValueAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(): void { /* no-op */ }
  exponentialRampToValueAtTime(): void { /* no-op */ }
}
class FakeNode {
  gain?: FakeParam;
  pan?: FakeParam;
  constructor(kind: 'gain' | 'panner') {
    if (kind === 'gain') this.gain = new FakeParam(1);
    else this.pan = new FakeParam(0);
  }
  connect(): this { return this; }
  disconnect(): void { /* no-op */ }
}
class FakeCtx {
  state = 'running';
  currentTime = 12.34;
  createGain(): FakeNode { return new FakeNode('gain'); }
  createStereoPanner(): FakeNode { return new FakeNode('panner'); }
}
const fakeVoice = () => ({ schedule() {}, dispose() {} });
type StubbedSoundscape = Omit<Soundscape, 'ctx' | 'master' | 'beds' | 'active'> & {
  ctx: FakeCtx;
  master: unknown;
  beds: Record<PanelId, { bed: ReturnType<typeof fakeVoice>; fade: FakeNode; music: ReturnType<typeof fakeVoice> | null; musicFade: FakeNode }>;
  active: Map<string, { zone: { id: string }; voice: ReturnType<typeof fakeVoice>; fade: FakeNode; panner: FakeNode; gain: number; pan: number }>;
};

// Wire a Soundscape exactly far enough for update() to run without ever calling
// a real audio factory: pre-built beds and pre-seeded active entries mean
// spawn() is never reached for the ids the snapshot selects.
function stubSoundscape(scene: Scene, preSeedIds: string[]): StubbedSoundscape {
  const sc = new Soundscape(scene) as unknown as StubbedSoundscape;
  sc.ctx = new FakeCtx();
  sc.master = null;
  for (const id of ['eden', 'garden', 'hell'] as PanelId[]) {
    sc.beds[id] = { bed: fakeVoice(), fade: new FakeNode('gain'), music: null, musicFade: new FakeNode('gain') };
  }
  for (const id of preSeedIds) {
    sc.active.set(id, { zone: { id }, voice: fakeVoice(), fade: new FakeNode('gain'), panner: new FakeNode('panner'), gain: 0, pan: 0 });
  }
  return sc;
}

function makeScene(panels: AuditPanel[], zoneSpecs: { i: number; x: number; y: number; r: number; volume: number; panel: PanelId }[], poiSpecs: { id: string; title: string; x: number; y: number; r: number; panel: PanelId }[] = []): Scene {
  return {
    world: { w: 300000, h: 100000 },
    panels: panels.map((p) => ({ ...p, name: p.id, y0: 0, y1: 100000 })),
    poas: zoneSpecs.map((z) => ({ ...z })),
    pois: poiSpecs.map((p) => ({ ...p, overview: false, text: '' })),
  };
}

const PANELS: AuditPanel[] = [
  { id: 'eden', x0: 0, x1: 100000 },
  { id: 'garden', x0: 100000, x1: 200000 },
  { id: 'hell', x0: 200000, x1: 300000 },
];

function snapshotFrom(scene: Scene, view: SoundView, extra: Partial<MixSnapshot> = {}): MixSnapshot {
  const zones = buildZones(scene);
  return {
    panels: scene.panels.map((p) => ({ id: p.id, x0: p.x0, x1: p.x1 })),
    zones: zones.map((z) => ({ id: z.id, type: z.type, panel: z.panel, x: z.x, y: z.y, r: z.r, volume: z.volume, poiId: z.poiId })),
    view: { cx: view.cx, cy: view.cy, scale: view.scale, viewW: view.viewW, viewH: view.viewH },
    mode: 'nature',
    ...extra,
  };
}

const EPS = 1e-12;

// Compare every audit number against the targets the real Soundscape wrote.
function assertMatchesLive(audit: ReturnType<typeof auditMix>, sc: StubbedSoundscape, snap: MixSnapshot): void {
  // beds: weight is stored on the instance; fade target is the last setTargetAtTime
  for (const bed of audit.beds) {
    assert.ok(Math.abs(bed.weight - sc.bedWeights[bed.id]) <= EPS, `bed weight ${bed.id}: audit ${bed.weight} vs live ${sc.bedWeights[bed.id]}`);
    const liveFade = sc.beds[bed.id].fade.gain!.targets.at(-1)!.value;
    assert.ok(Math.abs(bed.fadeTarget - liveFade) <= EPS, `bed fade ${bed.id}: audit ${bed.fadeTarget} vs live ${liveFade}`);
  }
  // voices: audit selection must equal the live active set, gain/pan target per id
  const liveIds = [...sc.active.keys()].sort();
  const auditIds = audit.voices.map((vc) => vc.id).sort();
  assert.deepEqual(auditIds, liveIds, 'selected voice ids match the live active map');
  for (const vc of audit.voices) {
    const a = sc.active.get(vc.id)!;
    const liveGain = a.fade.gain!.targets.at(-1)!.value;
    const livePan = a.panner.pan!.targets.at(-1)!.value;
    assert.ok(Math.abs(vc.gain - liveGain) <= EPS, `voice ${vc.id} gain: audit ${vc.gain} vs live ${liveGain}`);
    assert.ok(Math.abs(vc.pan - livePan) <= EPS, `voice ${vc.id} pan: audit ${vc.pan} vs live ${livePan}`);
  }
  // music: in period mode every bed gets a music node before update; check targets
  if (audit.music.participates) {
    for (const bed of audit.beds) {
      const liveMusic = sc.beds[bed.id].musicFade.gain!.targets.at(-1)!.value;
      assert.ok(Math.abs(audit.music.fadeTargets[bed.id] - liveMusic) <= EPS, `music fade ${bed.id}`);
      assert.equal(audit.music.weights[bed.id], sc.bedWeights[bed.id]);
    }
  }
  // JSON safety: the whole report must round-trip with no non-finite leakage
  const json = JSON.stringify(audit);
  assert.equal(typeof json, 'string');
  const back = JSON.parse(json);
  assert.equal(back.voices.length, audit.voices.length);
  assert.doesNotMatch(json, /NaN|Infinity/);
  void snap;
}

function runBoth(scene: Scene, snap: MixSnapshot, preSeedIds?: string[]): { audit: ReturnType<typeof auditMix>; sc: StubbedSoundscape } {
  // buildZones is the source of truth for ids; the audit runs on the exact
  // zone objects the live Soundscape was constructed with.
  const realZones = buildZones(scene);
  const ids = (preSeedIds ?? realZones.map((z) => z.id));
  const sc = stubSoundscape(scene, ids);
  if (snap.mode === 'period') {
    sc._mode = 'period';
    for (const id of ['eden', 'garden', 'hell'] as PanelId[]) sc.beds[id].music = fakeVoice();
  }
  if (snap.soloType) sc.solo(snap.soloType);
  if (snap.focusId) sc.focus(snap.focusId);
  const view: SoundView = { ...snap.view, time: 0 };
  sc.update(view);
  const aligned: MixSnapshot = { ...snap, zones: realZones.map((z) => ({ id: z.id, type: z.type, panel: z.panel, x: z.x, y: z.y, r: z.r, volume: z.volume, poiId: z.poiId })) };
  const audit = auditMix(aligned);
  return { audit, sc };
}

// --- normal path -------------------------------------------------------------
test('normal snapshot: weights, gains and pans match the live Soundscape targets', () => {
  // POAs spread across all three panels with differing y so panelDefault varies.
  const poas = [
    { i: 0, x: 95000, y: 10000, r: 16000, volume: 1, panel: 'eden' as PanelId },
    { i: 1, x: 120000, y: 50000, r: 14000, volume: 0.8, panel: 'garden' as PanelId },
    { i: 2, x: 165000, y: 80000, r: 18000, volume: 1, panel: 'garden' as PanelId },
    { i: 3, x: 190000, y: 30000, r: 15000, volume: 1, panel: 'garden' as PanelId },
    { i: 4, x: 205000, y: 60000, r: 13000, volume: 0.9, panel: 'hell' as PanelId },
  ];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 45000, scale: 0.02, viewW: 4000, viewH: 2600, time: 0 };
  const snap = snapshotFrom(scene, view);
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  assert.ok(audit.voices.length > 1, 'several zones should be audible at this zoom');
  assert.ok(new Set(audit.voices.map((vc) => vc.panel)).size >= 2, 'voices span more than one panel');
  assert.ok(audit.beds.every((b) => b.weight >= 0), 'all panels have non-negative weights');
  assert.ok(Math.abs(audit.bedPowerSum - 1) <= 1e-9);
  for (const c of audit.checks) assert.ok(c.ok, `${c.name}: ${c.reason ?? ''}`);
  assert.equal(audit.music.participates, false);
  assert.equal(audit.degraded.length, 0);
});

test('period mode: music participates with per-panel weights equal to bed weights', () => {
  const poas = [
    { i: 0, x: 30000, y: 40000, r: 9000, volume: 1, panel: 'eden' as PanelId },
    { i: 1, x: 150000, y: 40000, r: 9000, volume: 1, panel: 'garden' as PanelId },
    { i: 2, x: 260000, y: 40000, r: 9000, volume: 1, panel: 'hell' as PanelId },
  ];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 44000, scale: 0.006, viewW: 2000, viewH: 1200, time: 0 };
  const snap = { ...snapshotFrom(scene, view), mode: 'period' as const };
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  assert.equal(audit.music.participates, true);
  for (const bed of audit.beds) assert.equal(audit.music.weights[bed.id], bed.weight);
  for (const c of audit.checks) assert.ok(c.ok, `${c.name}: ${c.reason ?? ''}`);
});

test('focus pins the poi zone and guarantees at least 0.9 gain', () => {
  const poas = [
    { i: 0, x: 140000, y: 40000, r: 8000, volume: 1, panel: 'garden' as PanelId },
  ];
  const pois = [
    { id: 'p1', title: 'Courtly Love', x: 55000, y: 90000, r: 3000, panel: 'garden' as PanelId },
  ];
  const scene = makeScene(PANELS, poas, pois);
  const realZones = buildZones(scene);
  const poiZone = realZones.find((z) => z.id === 'poi-p1')!;
  assert.ok(poiZone, 'the story point gets its own zone');
  // view far away from the poi: without the pin it would be out of range
  const view: SoundView = { cx: 50000, cy: 20000, scale: 0.1, viewW: 900, viewH: 600, time: 0 };
  const snap = { ...snapshotFrom(scene, view), focusId: 'p1' };
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  assert.equal(audit.focus.resolvedZoneId, 'poi-p1');
  const pinned = audit.voices.find((vc) => vc.id === 'poi-p1')!;
  assert.ok(pinned.pinned);
  assert.ok(pinned.gain >= 0.9, `pinned gain ${pinned.gain} >= 0.9`);
  const focusCheck = audit.checks.find((c) => c.name === 'focus-pinned')!;
  assert.ok(focusCheck.ok);
});

// --- negative paths ----------------------------------------------------------
test('per-type cap: extra same-type zones are reported truncated with reasons', () => {
  // Four garden POAs in the middle y-band: panelDefault alternates
  // crowd-murmur / birds-garden, so build two clusters of identical type instead
  // by placing all four in the foreground band (y > 60000 -> crowd-murmur).
  const poas = [0, 1, 2, 3].map((i) => ({
    i, x: 120000 + i * 6000, y: 70000 + i * 1000, r: 12000, volume: 1, panel: 'garden' as PanelId,
  }));
  const scene = makeScene(PANELS, poas);
  const realZones = buildZones(scene);
  const sameType = realZones.filter((z) => z.type === realZones[0].type);
  assert.ok(sameType.length >= 4, 'fixture must produce at least four same-type zones');
  const view: SoundView = { cx: 130000, cy: 72000, scale: 0.08, viewW: 1400, viewH: 900, time: 0 };
  const snap = snapshotFrom(scene, view);
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  const capDrops = audit.truncated.filter((t) => t.reason === 'per-type-cap');
  assert.ok(capDrops.length >= sameType.length - 2, 'all but two same-type voices are capped');
  for (const drop of capDrops) {
    assert.equal(drop.type, realZones[0].type);
    assert.match(drop.detail, /already has 2/);
  }
  const perTypeCheck = audit.checks.find((c) => c.name === 'per-type-within-max')!;
  assert.ok(perTypeCheck.ok, 'the surviving set itself never violates the cap');
  // no dropped id survives into the voice list
  for (const drop of capDrops) assert.ok(!audit.voices.some((vc) => vc.id === drop.id));
});

test('gain floor: distant quiet zones are dropped with gain-floor reasons', () => {
  // A small, quiet zone placed well inside the audible radius (so it passes the
  // range gate) whose distance attenuation still lands its gain under 0.004.
  const poas = [
    { i: 0, x: 150000, y: 45000, r: 6000, volume: 1, panel: 'garden' as PanelId },
    { i: 1, x: 170000, y: 45000, r: 6000, volume: 0.05, panel: 'garden' as PanelId },
  ];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 45000, scale: 0.1, viewW: 1000, viewH: 700, time: 0 };
  const snap = snapshotFrom(scene, view);
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  const quiet = audit.truncated.filter((t) => t.reason === 'gain-floor');
  assert.ok(quiet.some((t) => t.id === 'poa-1'), 'the quiet distant zone is dropped');
  for (const t of quiet) {
    assert.ok(t.gain < 0.004);
    assert.match(t.detail, /0.004/);
  }
  const floorCheck = audit.checks.find((c) => c.name === 'sub-threshold-gain-dropped')!;
  assert.ok(floorCheck.ok);
});

test('voice cap: more than MAX_VOICES survivors truncate the sorted tail', () => {
  // 18 close, loud zones spread over all three panels and three y-bands so the
  // panelDefault voice types differ; after per-type capping more than 12 voices
  // survive, forcing the hard MAX_VOICES truncation of the sorted tail.
  const poas = Array.from({ length: 18 }, (_, i) => {
    const panel = (['eden', 'garden', 'hell'] as PanelId[])[i % 3];
    const base = panel === 'eden' ? 0 : panel === 'garden' ? 100000 : 200000;
    const band = [15000, 45000, 75000][Math.floor(i / 3) % 3];
    return { i, x: base + 30000 + (i % 2) * 25000, y: band, r: 16000, volume: 1, panel };
  });
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 45000, scale: 0.02, viewW: 4000, viewH: 3000, time: 0 };
  const snap = snapshotFrom(scene, view);
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  assert.equal(audit.voices.length, 12);
  const capDrops = audit.truncated.filter((t) => t.reason === 'voice-cap');
  assert.ok(capDrops.length > 0);
  for (const t of capDrops) assert.match(t.detail, /voice pool full/);
  // the quietest survivors are still louder than the capped tail
  const minKept = Math.min(...audit.voices.map((vc) => vc.gain));
  for (const t of capDrops) assert.ok(t.gain <= minKept + EPS);
});

// --- boundary paths ----------------------------------------------------------
test('solo: one centred synthetic voice, beds and music forced to zero', () => {
  const poas = [
    { i: 0, x: 30000, y: 40000, r: 9000, volume: 1, panel: 'eden' as PanelId },
    { i: 1, x: 160000, y: 40000, r: 9000, volume: 1, panel: 'garden' as PanelId },
  ];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 44000, scale: 0.05, viewW: 1280, viewH: 800, time: 0 };
  const snap = { ...snapshotFrom(scene, view), soloType: 'swans' as const, mode: 'period' as const };
  const { audit, sc } = runBoth(scene, snap, [`solo-swans`]);
  assertMatchesLive(audit, sc, snap);
  assert.equal(audit.voices.length, 1);
  const solo = audit.voices[0];
  assert.equal(solo.id, 'solo-swans');
  assert.equal(solo.gain, 1);
  assert.equal(solo.pan, 0);
  assert.equal(solo.panel, VOICE_PANEL.swans);
  assert.ok(solo.synthetic);
  assert.ok(audit.beds.every((b) => b.fadeTarget === 0 && b.musicFadeTarget === 0));
  assert.equal(audit.music.participates, false);
  for (const id of ['eden', 'garden', 'hell'] as PanelId[]) assert.equal(audit.music.fadeTargets[id], 0);
  // equal-power weights themselves are still computed; only the targets go to zero
  assert.ok(audit.beds.some((b) => b.weight > 0));
  const soloCheck = audit.checks.find((c) => c.name === 'solo-exclusive')!;
  assert.ok(soloCheck.ok);
});

test('focusId pointing at a missing zone degrades gracefully without throwing', () => {
  const poas = [{ i: 0, x: 150000, y: 45000, r: 9000, volume: 1, panel: 'garden' as PanelId }];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 45000, scale: 0.05, viewW: 1280, viewH: 800, time: 0 };
  const snap = { ...snapshotFrom(scene, view), focusId: 'ghost-id' };
  const { audit, sc } = runBoth(scene, snap);
  assertMatchesLive(audit, sc, snap);
  assert.equal(audit.focus.resolvedZoneId, null);
  assert.equal(audit.focus.pinned, false);
  assert.ok(audit.degraded.some((d) => d.includes('ghost-id')));
  const focusCheck = audit.checks.find((c) => c.name === 'focus-pinned')!;
  assert.equal(focusCheck.ok, false);
  assert.match(focusCheck.reason!, /does not resolve/);
  // everything else still passes
  for (const c of audit.checks.filter((c) => c.name !== 'focus-pinned')) assert.ok(c.ok, `${c.name}: ${c.reason ?? ''}`);
});

test('viewW 0: no throw, zeroed beds, centred pans, readable degradation', () => {
  const poas = [
    { i: 0, x: 30000, y: 40000, r: 20000, volume: 1, panel: 'eden' as PanelId },
    { i: 1, x: 260000, y: 40000, r: 20000, volume: 1, panel: 'hell' as PanelId },
  ];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 44000, scale: 0.05, viewW: 0, viewH: 800, time: 0 };
  const snap = snapshotFrom(scene, view);
  assert.doesNotThrow(() => auditMix(snap));
  const audit = auditMix(snap);
  assert.ok(audit.degraded.length > 0);
  assert.ok(audit.beds.every((b) => b.weight === 0 && b.fadeTarget === 0));
  assert.ok(audit.voices.every((vc) => vc.pan === 0), 'pans degrade to centre, never NaN');
  assert.doesNotMatch(JSON.stringify(audit), /NaN|Infinity/);
  const weightCheck = audit.checks.find((c) => c.name === 'bed-weights-equal-power')!;
  assert.equal(weightCheck.ok, false);
  assert.match(weightCheck.reason!, /degraded/);
});

// --- offline render rows -----------------------------------------------------
test('offline rows follow the offlineTest pass rule, including nature musicBuilt', () => {
  const snap: MixSnapshot = {
    panels: PANELS,
    zones: [],
    view: { cx: 0, cy: 0, scale: 0.05, viewW: 1280, viewH: 800 },
    mode: 'nature',
    renderRows: [
      { kind: 'voice', name: 'swans', mode: 'nature', peakDb: -6, rmsDb: -20, nan: false, musicBuilt: 0 },
      { kind: 'bed', name: 'eden', mode: 'nature', peakDb: -5, rmsDb: -18, nan: false, musicBuilt: 2 },
      { kind: 'voice', name: 'clangs', mode: 'period', peakDb: -3, rmsDb: -22, nan: false, musicBuilt: 1 },
      { kind: 'cue', name: 'open', mode: '-', peakDb: -4, rmsDb: -70, nan: true, musicBuilt: 0 },
      { kind: 'bed', name: 'hell', mode: 'period', peakDb: 0.2, rmsDb: -10, nan: false, musicBuilt: 1 },
    ],
  };
  const audit = auditMix(snap);
  const [good, natureMusic, periodOk, nanRow, hotRow] = audit.renderRows;
  assert.ok(good.pass);
  assert.equal(natureMusic.pass, false);
  assert.ok(natureMusic.failures.some((f) => f.includes('music generator')));
  assert.ok(periodOk.pass);
  assert.equal(nanRow.pass, false);
  assert.ok(nanRow.failures.some((f) => f.includes('NaN')));
  assert.ok(nanRow.failures.some((f) => f.includes('-60')));
  assert.equal(hotRow.pass, false);
  assert.ok(hotRow.failures.some((f) => f.includes('-1 dBFS')));
  const rowCheck = audit.checks.find((c) => c.name === 'offline-render-rows-pass')!;
  assert.equal(rowCheck.ok, false);
  assert.match(rowCheck.reason!, /nature mode/);
});

// --- purity ------------------------------------------------------------------
test('audit is pure: inputs are not mutated and the output is JSON-safe', () => {
  const poas = [{ i: 0, x: 150000, y: 45000, r: 9000, volume: 1, panel: 'garden' as PanelId }];
  const scene = makeScene(PANELS, poas);
  const view: SoundView = { cx: 150000, cy: 45000, scale: 0.05, viewW: 1280, viewH: 800, time: 0 };
  const snap = snapshotFrom(scene, view);
  const before = JSON.parse(JSON.stringify(snap));
  const audit = auditMix(snap);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), before);
  const round = JSON.parse(JSON.stringify(audit));
  assert.deepEqual(round, audit);
});
