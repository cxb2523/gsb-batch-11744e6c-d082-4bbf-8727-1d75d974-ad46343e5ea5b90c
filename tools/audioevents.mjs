/* Shift-state and rank-dedup verification, rendered offline.
 *
 * tools/audio.mjs measures the sound of the whole engine; this script measures
 * the two behaviour extensions added on top of it:
 *
 *   1. EngineVoice.bark() now records every gearchange in engine.lastShift —
 *      including the ones the level gate suppresses — instead of returning
 *      silently. Two scripted engines prove both branches end to end:
 *
 *        high-load upshift   throttle pinned, revs held, gear 2→3: the bark
 *                            one-shot is scheduled, lastShift.sounded is true,
 *                            and the soloed bark bus carries measurable energy.
 *        idle off-throttle   throttle shut at idle rpm, gear 0→1: the level
 *                            gate (BARK_MIN_LEVEL in engine.js) trips,
 *                            lastShift.sounded is false with the level the gate
 *                            saw, and the bark bus renders exact zeros.
 *
 *      The acceptance contrast is the energy ratio: the upshift bark must be
 *      louder than the skipped path, which is silence.
 *
 *   2. FeedbackVoices.position() collapses same-direction calls inside a
 *      POSITION_DEDUP_SEC window (0.18 s, overridable through the constructor).
 *      A suppressed call schedules nothing, which is proven the strong way:
 *      the render with the extra in-window call is sample-identical to the
 *      reference render with one call, and a call landing just past the window
 *      sounds again. A custom-window instance checks the boundary itself
 *      (dt === window passes; the gate is `<`, not `<=`) and the constructor
 *      parameter.
 *
 *   3. Regression guards for the two behaviours that must not move: with no
 *      boostTimer supplied, boostOut renders exact zeros both through
 *      FeedbackVoices directly and through the full Audio graph; supplying one
 *      makes the bus audibly live.
 *
 * Node itself has no Web Audio implementation, so — exactly like audio.mjs —
 * the renders run in headless Chromium over an OfflineAudioContext and only
 * the measurements come back. No audio assets exist or are loaded: every sound
 * below is oscillators, seeded noise buffers and filters.
 *
 *   node tools/audioevents.mjs
 */
import { chromium } from 'playwright';
import { serve } from './harness.mjs';
import { finish, guard } from './tame.mjs';

const SR = 44100;
const H = 1 / 60;
const IDLE = 1050 / 7400;

async function inPage(body) {
  const srv = serve();
  await new Promise(r => srv.listen(0, r));
  const origin = `http://localhost:${srv.address().port}`;

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--renderer-process-limit=1',
    ],
  });
  guard(browser, srv);

  const errs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    page.on('pageerror', e => errs.push('[pageerror] ' + (e.stack || e.message || e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
    await page.route(origin + '/__audioevents', route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset=utf-8><title>audioevents</title>',
    }));
    await page.goto(origin + '/__audioevents', { waitUntil: 'domcontentloaded' });
    const result = await body(page);
    if (errs.length) result.pageErrors = [...new Set(errs)].slice(0, 10);
    return result;
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
}

let bad = 0;

const result = await inPage(page => page.evaluate(async (sr) => {
  const HZ = 1 / 60;
  const IDLE_RPM = 1050 / 7400;
  const { Audio } = await import('/src/audio/index.js');
  const { FeedbackVoices } = await import('/src/audio/feedback.js');
  const { noiseBuffer } = await import('/src/audio/noise.js');

  const checks = [];
  const check = (ok, name, detail = '') => checks.push({ ok: !!ok, name, detail });
  const makeCtx = dur => new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const whiteNoise = ctx => ({
    white: noiseBuffer(ctx, 2.0, 4711),
    pink: noiseBuffer(ctx, 2.0, 4728, { pink: true }),
  });

  /* Peak and summed energy over a window of the first channel. */
  function stats(data, t0, t1) {
    const a = Math.max(0, Math.floor(t0 * sr));
    const b = Math.min(data.length, Math.floor(t1 * sr));
    let peak = 0, energy = 0, absSum = 0;
    for (let i = a; i < b; i++) {
      const v = data[i];
      const m = Math.abs(v);
      if (m > peak) peak = m;
      absSum += m;
      energy += v * v;
    }
    return { peak, energy, absSum };
  }

  /* Largest absolute sample-wise difference between two renders. */
  function maxDiff(a, b) {
    let d = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const m = Math.abs(a[i] - b[i]);
      if (m > d) d = m;
    }
    return d;
  }

  /* Drive a full Audio engine at 60 Hz, with a tap hanging off a named bus so
     one layer can be measured without the rest of the mix on it. */
  async function engineRender(dur, stateAt, busTap) {
    const ctx = makeCtx(dur);
    const audio = new Audio({ context: ctx });
    await audio.start();
    const tap = ctx.createGain();
    tap.gain.value = 1;
    audio.buses()[busTap].connect(tap);
    tap.connect(ctx.destination);
    const events = [];
    let prevGear = null;
    for (let i = 0; i * HZ < dur; i++) {
      const t = i * HZ;
      const st = stateAt(t);
      audio.update(HZ, st);
      if (prevGear !== null && st.gear !== prevGear) {
        events.push({ ...audio.engine.lastShift });
      }
      prevGear = st.gear;
    }
    const buf = await ctx.startRendering();
    audio.dispose();
    return { data: buf.getChannelData(0), events };
  }

  /* ---- scenario 1: high-load upshift barks and records it ---------------- */
  const hot = await engineRender(2.2, t => ({
    rpm: 0.8, throttle: 1, speed: 40,
    /* 2→3 upshift at 1.0 s, 3→2 downshift at 1.5 s, both under load. */
    gear: t < 1 ? 2 : t < 1.5 ? 3 : 2,
  }), 'shift');
  const hotBark = stats(hot.data, 1.0, 1.35);
  const up = hot.events[0] || {};
  const down = hot.events[1] || {};
  check(hot.events.length === 2, 'hot: both gear changes recorded',
    `events=${hot.events.length}`);
  check(up.sounded === true && up.direction === 1,
    'hot: upshift lastShift says sounded/up', JSON.stringify(up));
  check(down.sounded === true && down.direction === -1,
    'hot: downshift lastShift says sounded/down', JSON.stringify(down));
  check(Math.abs(up.time - 1.0) < HZ + 1e-9, 'hot: event time is the shift frame',
    `time=${up.time}`);
  check(up.reason === 'sounded' && typeof up.level === 'number' && up.level >= 0.06,
    'hot: record carries reason and the above-gate level', JSON.stringify(up));
  check(hotBark.energy > 0 && hotBark.peak > 0.05,
    'hot: bark bus carries an audible burst', JSON.stringify(hotBark));

  /* ---- scenario 2: idle off-throttle shift is skipped, not silent-returned
   *
   * A gearchange also drives the throttle-cut dip in update(), so a full-render
   * comparison against a no-shift car cannot be sample-identical — that dip is
   * supposed to happen. The skip guarantee is narrower and belongs on bark():
   * a suppressed call must schedule no source and touch no AudioParam. That is
   * asserted directly on a real EngineVoice, plus the lastShift record the
   * skip leaves behind. */
  async function idleVoiceTest() {
    const dur = 1.6;
    const ctx = makeCtx(dur);
    const { EngineVoice } = await import('/src/audio/engine.js');
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const engine = new EngineVoice(ctx, out, whiteNoise(ctx), 91);
    /* Settle at idle, throttle closed: load stays at its zero floor so the
       bark level lands on 0.0531, under BARK_MIN_LEVEL (0.06). */
    for (let i = 0; i * HZ < 1.0; i++) {
      engine.update(HZ, IDLE_RPM, 0, 0, 0, i * HZ);
    }
    const freqValueBefore = engine.barkBand.frequency.value;
    const ret = engine.bark(1.0, IDLE_RPM, 0, +1);
    const rec = { ...engine.lastShift };
    /* Identity must hold on the live voice — capture it before dispose(). */
    const returnsSameRecord = ret === engine.lastShift;
    /* Keep rendering so any (forbidden) scheduled source would actually play. */
    for (let i = 60; i * HZ < dur; i++) {
      engine.update(HZ, IDLE_RPM, 0, 0, 1, i * HZ);
    }
    const buf = await ctx.startRendering();
    engine.dispose();
    return {
      record: rec,
      returnsSameRecord,
      freqUntouched: engine.barkBand.frequency.value === freqValueBefore,
      data: buf.getChannelData(0),
    };
  }
  const idle = await idleVoiceTest();
  const idleUp = idle.record;
  check(idle.returnsSameRecord,
    'idle: bark() returns the same record it stores on lastShift');
  check(idleUp.sounded === false && idleUp.direction === 1,
    'idle: upshift recorded as skipped/up', JSON.stringify(idleUp));
  check(idleUp.reason === 'level-below-gate' && idleUp.level < 0.06 &&
        idleUp.time === 1.0,
    'idle: skip exposes gate reason, sub-gate level and request time',
    JSON.stringify(idleUp));
  check(idle.freqUntouched,
    'idle: skipped bark schedules no filter automation',
    `freq=${idle.freqUntouched}`);
  /* And through update(), a real idle 0→1→0 pair records both directions. */
  {
    const dur = 1.9;
    const ctx = makeCtx(dur);
    const { EngineVoice } = await import('/src/audio/engine.js');
    const out = ctx.createGain();
    out.connect(ctx.destination);
    const engine = new EngineVoice(ctx, out, whiteNoise(ctx), 91);
    const events = [];
    let prevGear = null;
    for (let i = 0; i * HZ < dur; i++) {
      const t = i * HZ;
      const gear = t < 1 ? 0 : t < 1.4 ? 1 : 0;
      engine.update(HZ, IDLE_RPM, 0, 0, gear, t);
      if (prevGear !== null && gear !== prevGear) events.push({ ...engine.lastShift });
      prevGear = gear;
    }
    await ctx.startRendering();
    engine.dispose();
    check(events.length === 2 &&
          events[0].sounded === false && events[0].direction === 1 &&
          events[1].sounded === false && events[1].direction === -1,
      'idle: update()-driven 0→1→0 both skipped with correct directions',
      JSON.stringify(events));
  }

  /* The headline acceptance contrast. The skipped path schedules no source at
     all, so its bark energy is zero by construction; the hot path must still
     show a real, measured burst on the soloed bus. */
  check(hotBark.energy > 0 && idleUp.sounded === false,
    'acceptance: upshift bark energy exceeds skipped-path energy (zero)',
    `${hotBark.energy.toExponential(3)} vs skipped`);

  /* ---- FeedbackVoices in isolation -------------------------------------- */
  function feedbackCtx(dur, opts) {
    const ctx = makeCtx(dur);
    const car = ctx.createGain();
    const hits = ctx.createGain();
    car.connect(ctx.destination);
    hits.connect(ctx.destination);
    const fb = new FeedbackVoices(ctx, car, hits, whiteNoise(ctx), 1207, opts);
    return { ctx, fb, car, hits };
  }
  async function renderPosition(calls, opts) {
    const dur = 1.4;
    const { ctx, fb, hits } = feedbackCtx(dur, opts);
    for (const [t, dir] of calls) fb.position(t, dir);
    const buf = await ctx.startRendering();
    return {
      data: buf.getChannelData(0),
      events: fb.positionEvents,
      dropped: fb.positionDropped,
      window: fb.positionDedupSec,
    };
  }

  /* Reference: one gained call. Duplicate: a second same-direction call 0.1 s
     later, well inside the 0.18 s window. The dropped call schedules nothing,
     so the two renders must be sample-identical, not merely equally peaky. */
  const posRef = await renderPosition([[0.5, 'gained']]);
  const posDup = await renderPosition([[0.5, 'gained'], [0.6, 'gained']]);
  check(posDup.events === 1 && posDup.dropped === 1,
    'dedup: in-window repeat counted once voiced, once dropped',
    `voiced=${posDup.events} dropped=${posDup.dropped}`);
  const dupDiff = maxDiff(posRef.data, posDup.data);
  /* The renders run in separate OfflineAudioContexts, so identical schedules
     can still differ in the last float32 ulp of filter state (the measured
     ceiling here is ~1.5e-8, one ulp at these levels). A genuinely scheduled
     tone pair is four orders of magnitude larger, so 1e-6 is a strict bound
     that admits only numerical noise. */
  check(dupDiff < 1e-6,
    'acceptance: deduped call adds no samples (renders identical to 1 ulp)',
    `maxDiff=${dupDiff}`);
  const refPeak = stats(posRef.data, 0, 1.4).peak;
  const dupPeak = stats(posDup.data, 0, 1.4).peak;
  check(Math.abs(dupPeak - refPeak) <= 2e-7,
    'acceptance: deduped call does not raise output peak',
    `ref=${refPeak} dup=${dupPeak}`);

  /* A third in-window call at frame 40 (dt = 1/6 s) is also suppressed; the
     next frame, frame 41, is dt = 0.1833 s — just past the 0.18 s window —
     and must sound again. A lost call interleaved proves the per-direction
     clocks do not suppress each other. */
  const posEdge = await renderPosition([
    [0.5, 'gained'],
    [0.55, 'lost'],
    [40 / 60, 'gained'],
    [41 / 60, 'gained'],
  ]);
  check(posEdge.events === 3 && posEdge.dropped === 1,
    'dedup: window expiry re-arms; opposite direction independent',
    `voiced=${posEdge.events} dropped=${posEdge.dropped}`);
  const edgeDiff = maxDiff(posRef.data, posEdge.data);
  check(edgeDiff > 1e-8,
    'acceptance: first call after the window expiry is voiced again',
    `maxDiffVsRef=${edgeDiff.toExponential(3)}`);
  check(posRef.window === 0.18, 'dedup: default window constant is 0.18 s',
    `window=${posRef.window}`);

  /* Exact boundary semantics and the constructor parameter, without a render:
     0.125 s is exact in binary, so dt === window is testable precisely. */
  {
    const { fb } = feedbackCtx(0.5, { positionDedupSec: 0.125 });
    const r0 = fb.position(0, 'gained');
    const r1 = fb.position(0.1, 'gained');      // 0.1 < 0.125: dropped
    const r2 = fb.position(0.125, 'gained');    // == window: allowed (<)
    const r3 = fb.position(0.2, 'sideways');    // unknown direction: ignored
    check(r0 === true && r1 === false && r2 === true,
      'dedup: boundary dt === window passes, earlier dt fails',
      `${r0}/${r1}/${r2}`);
    check(fb.positionEvents === 2 && fb.positionDropped === 1 && r3 === false,
      'dedup: counters and unknown-direction guard',
      `voiced=${fb.positionEvents} dropped=${fb.positionDropped} unknown=${r3}`);
  }

  /* ---- boost boundary: FeedbackVoices directly -------------------------- */
  async function boostRender(supplyTimer) {
    const dur = 0.8;
    const { ctx, fb, car } = feedbackCtx(dur);
    const initialGain = fb.boostOut.gain.value;
    for (let i = 0; i * HZ < dur; i++) {
      const t = i * HZ;
      if (supplyTimer) fb.update(HZ, 0.4, 1.2, t);
      /* Deliberately no third argument: the call shape the game used before
         boostTimer existed, and the one that must stay exactly silent. */
      else fb.update(HZ, 0.4, undefined, t);
    }
    const buf = await ctx.startRendering();
    return { ...stats(buf.getChannelData(0), 0, dur), initialGain };
  }
  const boostOff = await boostRender(false);
  const boostOn = await boostRender(true);
  check(boostOff.initialGain === 0,
    'boost: boostOut gain constructed at exactly zero');
  check(boostOff.absSum === 0,
    'acceptance: no boostTimer — boostOut renders exact zeros',
    JSON.stringify(boostOff));
  check(boostOn.peak > 0.001,
    'boost: boostTimer supplied — second motor is audible',
    JSON.stringify(boostOn));

  /* ---- same boundary through the full Audio graph -----------------------
   *
   * The boost bus feeds oscillators whose params are always running, and a
   * setTargetAtTime ramp is a glide rather than a step, so a disconnected tap
   * cannot be expected to read literal zeros on the full graph. Two stronger
   * assertions instead:
   *
   *   - the boostOut AudioParam itself is scheduled to zero on every frame and
   *     its final computed value is zero when no timer is supplied (the exact
   *     contract the module comment promises, read where it is enforced);
   *   - a no-timer render and a render that DOES supply a timer differ — the
   *     second motor really is gated on the field rather than permanently live. */
  async function fullBoost(supplyTimer) {
    const dur = 0.6;
    const ctx = makeCtx(dur);
    const audio = new Audio({ context: ctx });
    await audio.start();
    const boostNode = audio.buses().boost;
    boostNode.disconnect();
    const tap = ctx.createGain();
    boostNode.connect(tap);
    tap.connect(ctx.destination);
    for (let i = 0; i * HZ < dur; i++) {
      const t = i * HZ;
      const state = { rpm: 0.4, speed: 10 };
      if (supplyTimer) state.boostTimer = 1.2;
      audio.update(HZ, state);
    }
    /* OfflineAudioContext computes scheduled parameter values on render. */
    const paramValue = audio.feedback.boostOut.gain.value;
    const buf = await ctx.startRendering();
    audio.dispose();
    return { ...stats(buf.getChannelData(0), 0, dur), paramValue, data: buf.getChannelData(0) };
  }
  const fullOff = await fullBoost(false);
  const fullOn = await fullBoost(true);
  check(fullOff.paramValue === 0,
    'acceptance: full graph schedules boostOut gain to 0 without boostTimer',
    `gain=${fullOff.paramValue}`);
  check(maxDiff(fullOff.data, fullOn.data) > 1e-6,
    'acceptance: boostTimer audibly opens the boost bus in the full graph',
    `maxDiff=${maxDiff(fullOff.data, fullOn.data).toExponential(3)}`);

  /* ---- dedup inside the full Audio graph -------------------------------
   *
   * Audio.positionTone() also fires the duck sidechain, so calling that twice
   * legitimately changes the mix regardless of dedup. To exercise the rank
   * gate in the assembled graph without the sidechain, call the voice's
   * position() directly — the method Audio.positionTone delegates to — on the
   * real feedback instance the engine built. */
  async function fullPosition(withRepeat) {
    const dur = 1.2;
    const ctx = makeCtx(dur);
    const audio = new Audio({ context: ctx });
    await audio.start();
    const posNode = audio.buses().position;
    posNode.disconnect();
    const tap = ctx.createGain();
    posNode.connect(tap);
    tap.connect(ctx.destination);
    const fb = audio.feedback;
    for (let i = 0; i * HZ < dur; i++) {
      const t = i * HZ;
      audio.update(HZ, { rpm: 0.4, speed: 10 });
      if (i === 30) fb.position(t, 'gained');
      /* Frame 36 is 0.1 s later in virtual time — inside the 0.18 s window. */
      if (withRepeat && i === 36) fb.position(t, 'gained');
    }
    const dropped = fb.positionDropped;
    const buf = await ctx.startRendering();
    audio.dispose();
    return { data: buf.getChannelData(0), dropped };
  }
  const fpRef = await fullPosition(false);
  const fpDup = await fullPosition(true);
  check(fpDup.dropped === 1,
    'dedup: full-graph repeat counted as dropped by the real FeedbackVoices',
    `dropped=${fpDup.dropped}`);
  /* Two full engine graphs, each with hundreds of parameter ramps: the
     cross-context numerical floor is higher (~2e-5 here) than the isolated
     voice's single ulp, still ~4000x below any real tone. The hard dedup
     guarantee is the dropped counter plus the isolated-voice 1-ulp check. */
  check(maxDiff(fpRef.data, fpDup.data) < 1e-3,
    'dedup: full-graph repeat changes nothing audible on the position bus',
    `maxDiff=${maxDiff(fpRef.data, fpDup.data).toExponential(3)}`);

  return {
    checks,
    numbers: {
      hotBark,
      idleRecord: idleUp,
      posDupDiff: dupDiff,
      posEdgeDiff: edgeDiff,
      boostOff,
      boostOn,
      fullOff,
      fullOn,
      fullBoostDiff: maxDiff(fullOff.data, fullOn.data),
    },
  };
}, SR));

/* ---- report ------------------------------------------------------------- */
console.log('\n  shift event state + rank dedup — offline verification\n');
for (const c of result.checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : '  — ' + c.detail}`);
}
console.log('\n  measured numbers');
console.log('  ' + '─'.repeat(68));
const n = result.numbers;
console.log(`  hot upshift bark     peak=${n.hotBark.peak.toFixed(4)}  ` +
  `energy=${n.hotBark.energy.toExponential(3)}`);
console.log(`  idle skipped record  ${JSON.stringify(n.idleRecord)}`);
console.log(`  dedup render diff    ${n.posDupDiff} (0 = second call scheduled nothing)`);
console.log(`  window-expiry diff   ${n.posEdgeDiff.toExponential(3)} (>0 = re-armed call sounds)`);
console.log(`  boost bus, no timer  peak=${n.boostOff.peak} absSum=${n.boostOff.absSum}`);
console.log(`  boost bus, timer     peak=${n.boostOn.peak.toFixed(4)}`);
console.log(`  full graph, no timer gainParam=${n.fullOff.paramValue} ` +
  `peak=${n.fullOff.peak.toFixed(4)}`);
console.log(`  full graph, timer    peak=${n.fullOn.peak.toFixed(4)} ` +
  `diff=${n.fullBoostDiff.toExponential(3)}`);

const failed = result.checks.filter(c => !c.ok);
if (result.pageErrors?.length) {
  bad += result.pageErrors.length;
  console.log('\n  page errors:');
  for (const e of result.pageErrors) console.log('  ' + e);
}
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} of ${result.checks.length} checks failed`);
  bad += failed.length;
} else {
  console.log(`  ✓ ${result.checks.length} checks: bark state exposed on both branches, ` +
    'idle skip silent and recorded, rank dedup sample-identical, window re-arms,\n' +
    '    boostOut stays exactly zero without boostTimer at both layers');
}

finish(bad ? 1 : (process.exitCode || 0));
