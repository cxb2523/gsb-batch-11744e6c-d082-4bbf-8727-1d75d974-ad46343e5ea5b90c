// mixAudit: a pure, side-effect-free re-implementation of the Soundscape.update()
// mixing math, run against a plain-data snapshot. It produces a structured audit
// that can be compared value-for-value with what a live Soundscape writes into
// its fade.gain / panner.pan AudioParams, plus an ordered list of checks.
//
// It never creates an AudioContext, never touches window/document, never mutates
// its input, and every field of its output is JSON-serialisable (no NaN/Infinity).

import { clamp } from './dsp.ts';
import { VOICE_PANEL } from './voices.ts';
import type { VoiceType } from './voices.ts';
import type { PanelId } from '../scene.ts';
import type { SoundMode, SoundView } from './soundscape.ts';

// Mirrored constants: keep in lockstep with soundscape.ts (not exported there).
const MAX_VOICES = 12;
const MAX_PER_TYPE = 2;
const NEAR_FACTOR = 2.5;
const FADE_GAIN_FLOOR = 0.004; // update() drops a voice whose gain is below this
const CENTRE_RANGE = 12000;
const SCALE_OVERVIEW = 0.006;
const SCALE_CLOSE = 0.1;
const MUSIC_LEVEL = 1.7;
const AMBIENCE_DUCK = 0.6;

export type AuditMode = SoundMode;

export interface AuditPanel { id: PanelId; x0: number; x1: number }
export interface AuditZone {
  id: string; type: VoiceType; panel: PanelId; x: number; y: number; r: number; volume: number;
  poiId?: string | null;
}
export interface AuditView { cx: number; cy: number; scale: number; viewW: number; viewH: number }

// One row of an offline render, the subset of offlineTest.ts's TestRow that the
// pass rule depends on.
export interface AuditRenderRow {
  kind: 'voice' | 'bed' | 'cue';
  name: string;
  mode: string;
  peakDb: number;
  rmsDb: number;
  nan: boolean;
  musicBuilt: number;
}

export interface MixSnapshot {
  panels: AuditPanel[];
  zones: AuditZone[];
  view: AuditView;
  mode: AuditMode;
  focusId?: string | null;
  soloType?: VoiceType | null;
  renderRows?: AuditRenderRow[];
}

export type TruncationReason = 'per-type-cap' | 'voice-cap' | 'gain-floor' | 'out-of-range';

export interface TruncatedZone {
  id: string;
  type: VoiceType;
  reason: TruncationReason;
  detail: string;
  /** gain computed before the drop (0 when out of range), finite, JSON-safe */
  gain: number;
}

export interface AuditedVoice {
  id: string;
  type: VoiceType;
  panel: PanelId;
  gain: number;
  pan: number;
  pinned: boolean;
  /** true for the dev-harness solo voice, which is not backed by a zone */
  synthetic: boolean;
}

export interface BedAudit {
  id: PanelId;
  /** equal-power weight sqrt(w/sum), exactly Soundscape.bedWeights */
  weight: number;
  /** target written into fade.gain (0 under solo; otherwise weight * bedMaster) */
  fadeTarget: number;
  /** target written into musicFade.gain when a music voice exists (0 under solo) */
  musicFadeTarget: number;
}

export interface RenderRowVerdict extends AuditRenderRow {
  pass: boolean;
  failures: string[];
}

export interface MixCheck {
  name: string;
  ok: boolean;
  reason: string | null;
}

export interface MixAudit {
  degraded: string[];
  mode: AuditMode;
  solo: boolean;
  beds: BedAudit[];
  /** sum of the equal-power weights sqrt(w/sum); depends on the view, not normalised */
  bedWeightSum: number;
  /** sum of the squared equal-power weights; always 1 unless the view is degraded */
  bedPowerSum: number;
  /** sum of the equal-power weights; 1 unless the view is degraded */
  music: {
    participates: boolean;
    /** per-panel music weight when music participates, 0 otherwise */
    weights: Record<PanelId, number>;
    /** per-panel musicFade.gain target as update() would write it */
    fadeTargets: Record<PanelId, number>;
  };
  voices: AuditedVoice[];
  truncated: TruncatedZone[];
  focus: { focusId: string | null; resolvedZoneId: string | null; pinned: boolean; gain: number };
  limits: { maxVoices: number; maxPerType: number; gainFloor: number };
  renderRows: RenderRowVerdict[];
  checks: MixCheck[];
}

const PANEL_IDS: PanelId[] = ['eden', 'garden', 'hell'];
const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

function check(name: string, ok: boolean, reason: string | null): MixCheck {
  return { name, ok, reason: ok ? null : reason };
}

// Resolve focus the same way Soundscape.zoneForPoi does: an explicit `poi-<id>`
// zone first, then any zone carrying the poi id.
function resolveFocusZone(zones: AuditZone[], focusId: string): AuditZone | null {
  return zones.find((z) => z.id === `poi-${focusId}`) || zones.find((z) => z.poiId === focusId) || null;
}

export function auditMix(snapshot: MixSnapshot): MixAudit {
  // Defensive copies: the input objects are never mutated, and non-finite input
  // numbers are neutralised so the output stays JSON-serialisable.
  const panels = snapshot.panels.map((p) => ({ ...p }));
  const zones = snapshot.zones.map((z) => ({ ...z, poiId: z.poiId ?? null }));
  const v = snapshot.view;
  const view: AuditView = {
    cx: finite(v.cx), cy: finite(v.cy), scale: finite(v.scale),
    viewW: finite(v.viewW), viewH: finite(v.viewH),
  };
  const mode: AuditMode = snapshot.mode === 'period' ? 'period' : 'nature';
  const soloType = snapshot.soloType ?? null;
  const focusId = snapshot.focusId ?? null;
  const degraded: string[] = [];
  if (view.viewW <= 0) degraded.push('viewW is zero or negative: bed crossfade and pan cannot be defined; bed weights forced to 0');
  if (view.scale <= 0) degraded.push('scale is zero or negative: world distances cannot be projected; voice selection degraded');
  if (!Number.isFinite(v.viewW) || !Number.isFinite(v.scale)) degraded.push('non-finite view dimensions replaced with 0');

  // --- zoom factor and master trims: identical arithmetic to update() -------
  const z = clamp(
    (Math.log(view.scale) - Math.log(SCALE_OVERVIEW)) / (Math.log(SCALE_CLOSE) - Math.log(SCALE_OVERVIEW)),
    0, 1,
  );
  const focusing = focusId != null;
  const period = mode === 'period';
  const duck = period ? AMBIENCE_DUCK : 1;
  const voiceMaster = (0.12 + 0.88 * Math.pow(z, 0.8)) * duck;
  const bedMaster = (1 - 0.5 * z) * (focusing ? 0.65 : 1) * duck;
  const musicMaster = MUSIC_LEVEL * (1 - 0.35 * z) * (focusing ? 0.7 : 1);

  // --- beds ------------------------------------------------------------------
  const safeViewW = view.viewW > 0 && view.scale > 0;
  const halfW = view.viewW / (2 * view.scale);
  const x0 = view.cx - halfW;
  const x1 = view.cx + halfW;
  const rawWeights = {} as Record<PanelId, number>;
  let sum = 0;
  for (const p of panels) {
    let w: number;
    if (!safeViewW) {
      w = 0;
    } else {
      const overlap = Math.max(0, Math.min(x1, p.x1) - Math.max(x0, p.x0)) / (x1 - x0);
      const dCentre = view.cx < p.x0 ? p.x0 - view.cx : view.cx > p.x1 ? view.cx - p.x1 : 0;
      const centre = Math.max(0, 1 - dCentre / CENTRE_RANGE);
      w = overlap + 0.6 * centre;
    }
    rawWeights[p.id] = w;
    sum += w;
  }
  const bedWeight: Record<PanelId, number> = { eden: 0, garden: 0, hell: 0 };
  for (const p of panels) {
    bedWeight[p.id] = safeViewW && sum > 0 ? Math.sqrt(rawWeights[p.id] / sum) : 0;
  }
  const beds: BedAudit[] = panels.map((p) => {
    const weight = finite(bedWeight[p.id]);
    return {
      id: p.id,
      weight,
      fadeTarget: soloType ? 0 : finite(weight * bedMaster),
      musicFadeTarget: soloType || !period ? 0 : finite(weight * musicMaster),
    };
  });
  const bedPowerSum = finite(PANEL_IDS.reduce((acc, id) => acc + (bedWeight[id] || 0) ** 2, 0));
  const bedWeightSum = finite(PANEL_IDS.reduce((acc, id) => acc + (bedWeight[id] || 0), 0));

  // --- positional voices -----------------------------------------------------
  const viewR = 0.5 * Math.hypot(view.viewW, view.viewH) / view.scale;
  const focusZone = focusing ? resolveFocusZone(zones, focusId!) : null;
  if (focusing && !focusZone) degraded.push(`focusId '${focusId}' does not resolve to any zone; nothing is pinned`);

  const truncated: TruncatedZone[] = [];
  const voices: AuditedVoice[] = [];

  if (soloType) {
    // The dev-harness solo path: one synthetic centred voice, everything else off.
    voices.push({
      id: `solo-${soloType}`,
      type: soloType,
      panel: VOICE_PANEL[soloType] || 'garden',
      gain: 1,
      pan: 0,
      pinned: false,
      synthetic: true,
    });
    // In solo mode update() never even visits the zones; report them as muted.
    for (const zone of zones) {
      truncated.push({ id: zone.id, type: zone.type, reason: 'out-of-range', detail: `solo active: only the centred '${soloType}' voice plays`, gain: 0 });
    }
  } else {
    interface Wanted { zone: AuditZone; gain: number; pan: number; pinned: boolean }
    const wanted: Wanted[] = [];
    for (const zone of zones) {
      const d = Math.hypot(zone.x - view.cx, zone.y - view.cy);
      if (d > zone.r + NEAR_FACTOR * viewR && zone !== focusZone) {
        truncated.push({ id: zone.id, type: zone.type, reason: 'out-of-range', detail: `distance ${Math.round(d)} exceeds r ${zone.r} + ${NEAR_FACTOR} view radii (${(zone.r + NEAR_FACTOR * viewR).toFixed(0)})`, gain: 0 });
        continue;
      }
      const rel = d / (zone.r + viewR);
      let g = rel < 1 ? zone.volume * Math.pow(1 - rel, 1.5) : 0;
      g *= voiceMaster;
      const pinned = zone === focusZone;
      if (pinned) g = Math.max(g, 0.9);
      else if (focusing) g *= 0.7;
      g = finite(g);
      if (g < FADE_GAIN_FLOOR) {
        truncated.push({ id: zone.id, type: zone.type, reason: 'gain-floor', detail: `computed gain ${g.toFixed(4)} is below the ${FADE_GAIN_FLOOR} drop threshold`, gain: g });
        continue;
      }
      // viewW 0 would make the divisor 0; degrade to centred pan instead of NaN
      const pan = view.viewW > 0 ? finite(clamp(((zone.x - view.cx) * view.scale) / (view.viewW * 0.6), -1, 1)) : 0;
      wanted.push({ zone, gain: g, pan, pinned });
    }
    wanted.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.gain - a.gain));

    // per-type cap, identical splice order to update()
    const perType = new Map<VoiceType, number>();
    for (let i = 0; i < wanted.length;) {
      const n = perType.get(wanted[i].zone.type) || 0;
      if (n >= MAX_PER_TYPE && !wanted[i].pinned) {
        const dropped = wanted.splice(i, 1)[0];
        truncated.push({ id: dropped.zone.id, type: dropped.zone.type, reason: 'per-type-cap', detail: `type '${dropped.zone.type}' already has ${MAX_PER_TYPE} voices and the zone is not pinned`, gain: dropped.gain });
      } else {
        perType.set(wanted[i].zone.type, n + 1);
        i++;
      }
    }
    // hard voice cap: update() truncates the sorted tail silently
    if (wanted.length > MAX_VOICES) {
      for (const dropped of wanted.splice(MAX_VOICES)) {
        truncated.push({ id: dropped.zone.id, type: dropped.zone.type, reason: 'voice-cap', detail: `voice pool full at ${MAX_VOICES}; lowest-priority voice after sorting by pin and gain`, gain: dropped.gain });
      }
    }
    for (const w of wanted) {
      voices.push({ id: w.zone.id, type: w.zone.type, panel: w.zone.panel, gain: w.gain, pan: w.pan, pinned: w.pinned, synthetic: false });
    }
  }

  // --- offline render rows: same pass rule as offlineTest.renderItem --------
  const renderRows: RenderRowVerdict[] = (snapshot.renderRows ?? []).map((row) => {
    const failures: string[] = [];
    if (row.nan) failures.push('rendered buffer contains NaN samples');
    if (!(row.rmsDb > -60)) failures.push(`rmsDb ${row.rmsDb} is not above -60 dBFS`);
    if (!(row.peakDb < -1)) failures.push(`peakDb ${row.peakDb} is not below -1 dBFS`);
    if (row.mode === 'nature' && row.musicBuilt !== 0) failures.push(`nature mode instantiated ${row.musicBuilt} music generator(s); musicBuilt must be 0`);
    return { ...row, pass: failures.length === 0, failures };
  });

  // --- music participation ---------------------------------------------------
  const musicWeights = { eden: 0, garden: 0, hell: 0 } as Record<PanelId, number>;
  const musicFadeTargets = { eden: 0, garden: 0, hell: 0 } as Record<PanelId, number>;
  if (period && !soloType) {
    for (const p of panels) {
      musicWeights[p.id] = bedWeight[p.id] || 0;
      musicFadeTargets[p.id] = finite(musicWeights[p.id] * musicMaster);
    }
  }

  const focusGain = focusZone ? (voices.find((vc) => vc.id === focusZone.id)?.gain ?? 0) : 0;

  // --- checks ----------------------------------------------------------------
  const checks: MixCheck[] = [];
  const viewDegraded = degraded.some((d) => d.startsWith('viewW') || d.startsWith('scale') || d.startsWith('non-finite'));
  checks.push(check(
    'bed-weights-equal-power',
    !viewDegraded && Math.abs(bedPowerSum - 1) <= 1e-9,
    viewDegraded ? `degraded view (${degraded[0]}); squared weight sum is ${bedPowerSum.toFixed(4)}` : `squared equal-power weight sum is ${bedPowerSum.toFixed(6)}, expected 1`,
  ));
  checks.push(check(
    'voice-count-within-max',
    voices.length <= MAX_VOICES,
    `${voices.length} selected voices exceed MAX_VOICES=${MAX_VOICES}`,
  ));
  const typeCounts = new Map<VoiceType, number>();
  for (const vc of voices) typeCounts.set(vc.type, (typeCounts.get(vc.type) || 0) + 1);
  const overType = [...typeCounts].filter(([, n]) => n > MAX_PER_TYPE);
  checks.push(check(
    'per-type-within-max',
    overType.length === 0,
    overType.map(([t, n]) => `type '${t}' has ${n} voices, max is ${MAX_PER_TYPE}`).join('; '),
  ));
  const badPan = voices.filter((vc) => vc.pan < -1 || vc.pan > 1);
  checks.push(check(
    'pan-in-range',
    badPan.length === 0,
    badPan.map((vc) => `voice ${vc.id} pan ${vc.pan} outside [-1, 1]`).join('; '),
  ));
  const quietKept = voices.filter((vc) => !vc.synthetic && vc.gain < FADE_GAIN_FLOOR);
  checks.push(check(
    'sub-threshold-gain-dropped',
    quietKept.length === 0,
    quietKept.map((vc) => `voice ${vc.id} kept with gain ${vc.gain} below ${FADE_GAIN_FLOOR}`).join('; '),
  ));
  if (soloType) {
    const soloOk = voices.length === 1 && voices[0].synthetic && voices[0].pan === 0 &&
      beds.every((b) => b.fadeTarget === 0) && PANEL_IDS.every((id) => musicFadeTargets[id] === 0);
    checks.push(check(
      'solo-exclusive',
      soloOk,
      'solo must leave exactly one centred voice with all bed and music gains at 0',
    ));
  } else {
    checks.push(check(
      'solo-exclusive',
      true,
      null,
    ));
  }
  if (focusing) {
    const pinnedVoice = voices.find((vc) => vc.pinned);
    checks.push(check(
      'focus-pinned',
      focusZone != null && !!pinnedVoice && pinnedVoice.gain >= 0.9,
      focusZone == null
        ? `focusId '${focusId}' does not resolve to any zone`
        : `focus zone '${focusZone.id}' pin gain is ${focusGain.toFixed(4)}, below the 0.9 floor`,
    ));
  } else {
    checks.push(check(
      'focus-pinned',
      true,
      null,
    ));
  }
  const failedRows = renderRows.filter((r) => !r.pass);
  checks.push(check(
    'offline-render-rows-pass',
    failedRows.length === 0,
    failedRows.map((r) => `${r.kind} '${r.name}' (${r.mode}): ${r.failures.join(', ')}`).join('; '),
  ));

  return {
    degraded,
    mode,
    solo: !!soloType,
    beds,
    bedWeightSum,
    bedPowerSum,
    music: {
      participates: period && !soloType,
      weights: musicWeights,
      fadeTargets: musicFadeTargets,
    },
    voices,
    truncated,
    focus: { focusId, resolvedZoneId: focusZone ? focusZone.id : null, pinned: voices.some((vc) => vc.pinned), gain: finite(focusGain) },
    limits: { maxVoices: MAX_VOICES, maxPerType: MAX_PER_TYPE, gainFloor: FADE_GAIN_FLOOR },
    renderRows,
    checks,
  };
}
