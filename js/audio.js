'use strict';
// ======================================================================
//  audio.js —— 全程序化合成音效（无外部素材）+ HRTF 3D 定位
// ======================================================================
const Sound = (() => {
  let ctx = null, master = null, sfxBus = null, revIn = null, comp = null;
  let SR = 44100;
  const B = {};            // name → [AudioBuffer...]
  let voices = 0;
  let windNode = null, windGain = null;
  let tinnitusOsc = null, tinnitusGain = null;
  let muffle = null;       // 闪光/爆炸后的低通

  // ---------- 合成基元 ----------
  const len = (sec) => Math.max(1, Math.round(sec * SR));
  function white(n) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; return a; }
  function filt(x, type, f, q = 0.707) {
    f = Math.min(f, SR * 0.45);
    const w0 = 2 * Math.PI * f / SR, c = Math.cos(w0), s = Math.sin(w0), al = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
    }
    return y;
  }
  // 时变带通（呼啸/挥刀）
  function sweepBP(n, f0, f1, q) {
    const x = white(n), y = new Float32Array(n);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b2, a1, a2;
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 0) {
        const t = i / n, f = f0 * Math.pow(f1 / f0, t);
        const w0 = 2 * Math.PI * f / SR, c = Math.cos(w0), al = Math.sin(w0) / (2 * q), a0 = 1 + al;
        b0 = al / a0; b2 = -al / a0; a1 = -2 * c / a0; a2 = (1 - al) / a0;
      }
      const xi = x[i], yi = b0 * xi + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi; y[i] = yi;
    }
    return y;
  }
  function tone(sec, f0, f1, k) {
    const n = len(sec), a = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const f = f1 + (f0 - f1) * Math.exp(-t / k); ph += 2 * Math.PI * f / SR; a[i] = Math.sin(ph); }
    return a;
  }
  function ring(sec, partials) {
    const n = len(sec), a = new Float32Array(n);
    for (const [f, amp, dec] of partials) {
      const ph0 = Math.random() * 6.28;
      for (let i = 0; i < n; i++) { const t = i / SR; a[i] += Math.sin(ph0 + 2 * Math.PI * f * t) * amp * Math.exp(-t / dec); }
    }
    return a;
  }
  const env = (att, dec) => (t) => (att > 0 ? 1 - Math.exp(-t / att) : 1) * Math.exp(-t / dec);
  function mix(out, src, at, gain, envFn) {
    const o = Math.round(at * SR);
    for (let i = 0; i < src.length && i + o < out.length; i++) out[i + o] += src[i] * gain * (envFn ? envFn(i / SR) : 1);
  }
  function norm(x, peak = 0.9) {
    let m = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > m) m = v; }
    if (m > 0) { const k = peak / m; for (let i = 0; i < x.length; i++) x[i] *= k; }
    // 尾部淡出防爆音
    const f = Math.min(x.length, len(0.01));
    for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f;
    return x;
  }
  const click = (f, q, dec, sec = 0.04) => {
    const c = filt(white(len(sec)), 'bp', f, q); const e = env(0.0002, dec);
    for (let i = 0; i < c.length; i++) c[i] *= e(i / SR) * 3;
    return c;
  };
  function reg(name, count, gen) {
    B[name] = [];
    for (let i = 0; i < count; i++) {
      const data = gen(i);
      const b = ctx.createBuffer(1, data.length, SR);
      b.copyToChannel ? b.copyToChannel(data, 0) : b.getChannelData(0).set(data);
      B[name].push(b);
    }
  }

  // ---------- 枪声 ----------
  const SHOT = {
    ak: { dur: 1.3, crack: 0.9, crackHP: 2200, body: 1.0, bodyLP: 2500, bodyDecay: 0.055, mid: 0.5, midF: 620, midDecay: 0.11, thump: 0.95, f0: 140, f1: 46, thumpDecay: 0.09, tail: 0.24, tailLP: 800, tailDecay: 0.4, echo: 0.2, echoDelay: 0.11 },
    m4: { dur: 1.2, crack: 1.0, crackHP: 3000, body: 0.9, bodyLP: 3300, bodyDecay: 0.045, mid: 0.45, midF: 900, midDecay: 0.09, thump: 0.75, f0: 165, f1: 55, thumpDecay: 0.075, tail: 0.2, tailLP: 950, tailDecay: 0.34, echo: 0.17, echoDelay: 0.1 },
    awp: { dur: 2.2, crack: 1.0, crackHP: 1700, body: 1.1, bodyLP: 1900, bodyDecay: 0.095, mid: 0.6, midF: 400, midDecay: 0.18, thump: 1.25, f0: 110, f1: 34, thumpDecay: 0.17, tail: 0.36, tailLP: 600, tailDecay: 0.8, echo: 0.3, echoDelay: 0.17 },
    deagle: { dur: 1.5, crack: 1.0, crackHP: 2000, body: 1.0, bodyLP: 2300, bodyDecay: 0.06, mid: 0.55, midF: 520, midDecay: 0.12, thump: 1.05, f0: 130, f1: 42, thumpDecay: 0.11, tail: 0.26, tailLP: 700, tailDecay: 0.5, echo: 0.22, echoDelay: 0.13 },
    glock: { dur: 0.9, crack: 0.9, crackHP: 3500, body: 0.8, bodyLP: 3800, bodyDecay: 0.03, mid: 0.35, midF: 1100, midDecay: 0.06, thump: 0.5, f0: 210, f1: 70, thumpDecay: 0.05, tail: 0.15, tailLP: 1000, tailDecay: 0.26, echo: 0.12, echoDelay: 0.09 },
    mp9: { dur: 0.9, crack: 0.85, crackHP: 3200, body: 0.85, bodyLP: 3500, bodyDecay: 0.035, mid: 0.4, midF: 1000, midDecay: 0.06, thump: 0.55, f0: 185, f1: 64, thumpDecay: 0.05, tail: 0.15, tailLP: 1000, tailDecay: 0.25, echo: 0.12, echoDelay: 0.09 },
  };
  function genShot(p) {
    const out = new Float32Array(len(p.dur));
    mix(out, filt(white(len(0.03)), 'hp', p.crackHP, 0.7), 0, p.crack * 1.4, env(0.0002, 0.0032));
    let body = filt(white(len(Math.min(p.dur, p.bodyDecay * 9))), 'lp', p.bodyLP, 0.7);
    body = filt(body, 'lp', p.bodyLP * 1.5, 0.6);
    mix(out, body, 0, p.body * 2.4, env(0.0007, p.bodyDecay));
    mix(out, filt(white(len(p.midDecay * 7)), 'bp', p.midF, 0.9), 0, p.mid * 3.5, env(0.001, p.midDecay));
    mix(out, tone(p.thumpDecay * 7, p.f0, p.f1, 0.025), 0, p.thump * 0.9, env(0.0012, p.thumpDecay));
    const tl = filt(filt(white(out.length), 'lp', p.tailLP, 0.6), 'hp', 90, 0.7);
    mix(out, tl, 0.012, p.tail * 4.0, (t) => (1 - Math.exp(-t / 0.02)) * Math.exp(-t / p.tailDecay));
    const ec = filt(white(len(0.3)), 'lp', p.tailLP * 1.4, 0.7);
    mix(out, ec, p.echoDelay, p.echo * 3.0, env(0.002, 0.05));
    mix(out, ec, p.echoDelay * 2.3, p.echo * 1.5, env(0.003, 0.07));
    return norm(out, 0.95);
  }
  function genSuppressed() {
    const out = new Float32Array(len(0.5));
    mix(out, filt(filt(white(len(0.15)), 'bp', 620, 0.9), 'lp', 1800), 0, 2.4, env(0.0006, 0.024));
    mix(out, tone(0.1, 170, 70, 0.03), 0, 0.7, env(0.001, 0.03));
    mix(out, click(3400, 3, 0.004), 0.003, 0.5);
    mix(out, click(2500, 4, 0.006), 0.034, 0.4);
    mix(out, filt(white(len(0.4)), 'lp', 500), 0.01, 0.35, env(0.01, 0.12));
    return norm(out, 0.8);
  }

  // ---------- 生成全部 ----------
  function synthAll() {
    for (const k in SHOT) reg('shot_' + k, 3, () => genShot(SHOT[k]));
    reg('shot_usp', 3, genSuppressed);

    // 武器机械
    reg('dry', 1, () => { const o = new Float32Array(len(0.08)); mix(o, click(2800, 5, 0.004), 0, 1); mix(o, click(1400, 3, 0.006), 0.01, 0.5); return norm(o, 0.7); });
    reg('magout', 2, () => { const o = new Float32Array(len(0.25)); mix(o, click(2400, 4, 0.004), 0, 1); mix(o, filt(white(len(0.1)), 'bp', 1800, 1.2), 0.012, 0.6, env(0.004, 0.03)); mix(o, click(1600, 3, 0.006), 0.075, 0.8); mix(o, tone(0.08, 220, 150, 0.03), 0.075, 0.25, env(0.001, 0.02)); return norm(o, 0.8); });
    reg('magin', 2, () => { const o = new Float32Array(len(0.25)); mix(o, filt(white(len(0.05)), 'bp', 2000, 1.2), 0, 0.4, env(0.003, 0.015)); mix(o, click(2600, 4, 0.005), 0.045, 1.2); mix(o, click(1300, 2.5, 0.008), 0.05, 0.8); mix(o, tone(0.1, 190, 120, 0.03), 0.045, 0.5, env(0.001, 0.03)); return norm(o, 0.85); });
    reg('bolt', 2, () => { const o = new Float32Array(len(0.35)); mix(o, click(2200, 4, 0.004), 0, 0.8); mix(o, filt(white(len(0.12)), 'bp', 1600, 1.4), 0.02, 0.5, env(0.005, 0.04)); mix(o, click(2400, 3, 0.006), 0.13, 1.3); mix(o, ring(0.15, [[1700, 0.3, 0.03], [2650, 0.2, 0.02]]), 0.13, 1); mix(o, tone(0.08, 200, 120, 0.02), 0.13, 0.4, env(0.001, 0.02)); return norm(o, 0.9); });
    reg('slideback', 1, () => { const o = new Float32Array(len(0.2)); mix(o, click(2600, 4, 0.004), 0, 0.8); mix(o, click(2000, 3, 0.006), 0.06, 1.2); mix(o, ring(0.1, [[2300, 0.3, 0.02]]), 0.06, 1); return norm(o, 0.85); });
    reg('awpbolt', 1, () => { const o = new Float32Array(len(0.65)); mix(o, click(2000, 4, 0.006), 0, 0.9); mix(o, filt(white(len(0.12)), 'bp', 1400, 1.5), 0.1, 0.6, env(0.006, 0.04)); mix(o, click(1700, 3, 0.006), 0.2, 0.7); mix(o, filt(white(len(0.12)), 'bp', 1700, 1.5), 0.3, 0.6, env(0.006, 0.04)); mix(o, click(2300, 4, 0.006), 0.42, 1.2); mix(o, ring(0.12, [[1900, 0.3, 0.03]]), 0.42, 1); return norm(o, 0.9); });
    reg('deploy', 2, () => { const o = new Float32Array(len(0.3)); mix(o, filt(white(len(0.2)), 'bp', 2400, 0.6), 0, 0.5, env(0.03, 0.06)); mix(o, click(2600, 4, 0.004), 0.16, 0.8); return norm(o, 0.6); });
    reg('pin', 1, () => { const o = new Float32Array(len(0.3)); mix(o, click(3000, 5, 0.004), 0, 1); mix(o, ring(0.25, [[2400, 0.4, 0.06], [3500, 0.3, 0.05]]), 0.002, 1); mix(o, click(2000, 3, 0.01), 0.12, 0.5); return norm(o, 0.7); });
    reg('throw', 1, () => { const n = len(0.3); const s = sweepBP(n, 500, 1800, 1.5); for (let i = 0; i < n; i++) s[i] *= Math.sin(Math.PI * i / n); return norm(s, 0.6); });
    reg('bounce', 3, () => { const o = new Float32Array(len(0.2)); mix(o, ring(0.2, [[1900 + rand(-200, 200), 0.6, 0.04], [2900, 0.4, 0.03], [4300, 0.3, 0.02]]), 0, 1); mix(o, click(1200, 2, 0.006), 0, 0.6); return norm(o, 0.7); });
    reg('knife_swing', 3, () => { const n = len(0.24); const s = sweepBP(n, rand(800, 1000), rand(2400, 3000), 1.2); for (let i = 0; i < n; i++) s[i] *= Math.pow(Math.sin(Math.PI * i / n), 2); return norm(s, 0.6); });
    reg('knife_wall', 2, () => { const o = new Float32Array(len(0.25)); mix(o, click(2200, 2, 0.01), 0, 1); mix(o, ring(0.25, [[1500, 0.5, 0.06], [2300, 0.4, 0.05], [3700, 0.3, 0.03]]), 0, 1); return norm(o, 0.8); });
    reg('bfly_click', 4, () => { const o = new Float32Array(len(0.14)); mix(o, click(rand(3800, 4600), 3, 0.003), 0, 1); mix(o, ring(0.12, [[rand(2900, 3300), 0.5, 0.03], [rand(5200, 5800), 0.35, 0.02], [rand(7600, 8200), 0.2, 0.012]]), 0, 0.7); mix(o, click(rand(2400, 2800), 4, 0.002), rand(0.012, 0.02), 0.5); return norm(o, 0.5); });
    reg('bfly_swish', 3, () => { const n = len(0.16); const s = sweepBP(n, rand(1500, 1900), rand(3600, 4400), 1.6); for (let i = 0; i < n; i++) s[i] *= Math.pow(Math.sin(Math.PI * i / n), 2); return norm(s, 0.3); });
    reg('knife_flesh', 2, () => { const o = new Float32Array(len(0.25)); mix(o, tone(0.15, 130, 70, 0.03), 0, 0.9, env(0.001, 0.05)); mix(o, filt(white(len(0.15)), 'lp', 900), 0, 1.4, env(0.002, 0.05)); mix(o, filt(white(len(0.1)), 'bp', 1500, 2), 0.01, 0.8, env(0.002, 0.02)); return norm(o, 0.85); });

    // 脚步（四种地面）
    reg('step_sand', 4, () => {
      const o = new Float32Array(len(0.22)); const nz = filt(white(o.length), 'bp', 1300, 0.8);
      for (let i = 0; i < o.length; i++) { const t = i / SR; const g = Math.random() < 0.07 ? Math.random() * 1.6 : 0.25; o[i] += nz[i] * g * Math.exp(-t / 0.05) * (1 - Math.exp(-t / 0.004)); }
      mix(o, tone(0.08, 110, 60, 0.03), 0, 0.45, env(0.002, 0.03));
      mix(o, filt(white(len(0.08)), 'bp', 900, 1.0), 0.06, 0.5, env(0.002, 0.025));
      return norm(o, 0.8);
    });
    reg('step_stone', 4, () => {
      const o = new Float32Array(len(0.2));
      mix(o, filt(white(len(0.05)), 'bp', 2100 + rand(-300, 300), 1.2), 0, 1.6, env(0.0005, 0.012));
      mix(o, tone(0.06, 170, 90, 0.02), 0, 0.6, env(0.001, 0.02));
      mix(o, filt(white(len(0.08)), 'bp', 3000, 0.8), 0.05, 0.5, env(0.004, 0.025));
      return norm(o, 0.8);
    });
    reg('step_wood', 4, () => {
      const o = new Float32Array(len(0.25));
      mix(o, ring(0.25, [[190 + rand(-15, 15), 1, 0.06], [430, 0.6, 0.04], [880, 0.3, 0.03]]), 0, 0.8);
      mix(o, filt(white(len(0.05)), 'bp', 650, 2), 0, 1.2, env(0.001, 0.015));
      return norm(o, 0.8);
    });
    reg('step_metal', 4, () => {
      const o = new Float32Array(len(0.4));
      mix(o, ring(0.4, [[520 + rand(-40, 40), 1, 0.11], [1340, 0.7, 0.08], [2710, 0.5, 0.06], [3900, 0.3, 0.04]]), 0, 0.7);
      mix(o, filt(white(len(0.04)), 'bp', 1500, 1.5), 0, 1.2, env(0.0005, 0.01));
      return norm(o, 0.8);
    });
    reg('jump', 2, () => { const o = new Float32Array(len(0.2)); mix(o, filt(white(len(0.2)), 'bp', 2400, 0.6), 0, 0.8, env(0.02, 0.05)); mix(o, click(3000, 4, 0.004), 0.03, 0.3); return norm(o, 0.5); });
    reg('land', 2, () => {
      const o = new Float32Array(len(0.3));
      mix(o, tone(0.15, 95, 48, 0.03), 0, 1, env(0.002, 0.06));
      mix(o, filt(white(len(0.15)), 'lp', 520), 0, 1.6, env(0.002, 0.05));
      for (let k = 0; k < 3; k++) mix(o, click(2600 + rand(-500, 500), 4, 0.004), 0.02 + k * 0.025 + rand(0, 0.01), 0.35);
      return norm(o, 0.85);
    });
    reg('slidemove', 1, () => {
      const o = new Float32Array(len(0.95)); const nz = filt(filt(white(o.length), 'lp', 1900), 'hp', 250);
      const nz2 = filt(white(o.length), 'bp', 800, 0.9);
      for (let i = 0; i < o.length; i++) {
        const t = i / SR; const e = (1 - Math.exp(-t / 0.02)) * (t < 0.45 ? 1 : Math.exp(-(t - 0.45) / 0.16));
        const grain = Math.random() < 0.05 ? 1.8 : 1;
        o[i] = (nz[i] * 0.9 * grain + nz2[i] * 1.2) * e;
      }
      mix(o, filt(white(len(0.9)), 'lp', 180), 0, 2.0, (t) => (1 - Math.exp(-t / 0.03)) * Math.exp(-t / 0.4));
      return norm(o, 0.75);
    });

    // 子弹命中
    reg('imp_stone', 3, () => { const o = new Float32Array(len(0.25)); mix(o, filt(white(len(0.03)), 'hp', 2500), 0, 1.6, env(0.0002, 0.006)); mix(o, filt(white(len(0.2)), 'bp', 1500, 0.8), 0.004, 0.8, env(0.002, 0.04)); mix(o, tone(0.05, 200, 120, 0.02), 0, 0.3, env(0.001, 0.015)); return norm(o, 0.8); });
    reg('imp_wood', 3, () => { const o = new Float32Array(len(0.2)); mix(o, filt(white(len(0.08)), 'bp', 700, 2), 0, 2, env(0.0005, 0.035)); mix(o, tone(0.1, 240, 180, 0.03), 0, 0.5, env(0.001, 0.04)); mix(o, filt(white(len(0.02)), 'hp', 3000), 0, 0.5, env(0.0002, 0.004)); return norm(o, 0.8); });
    reg('imp_metal', 3, () => { const o = new Float32Array(len(0.3)); mix(o, ring(0.3, [[1800 + rand(-200, 200), 0.6, 0.1], [2650, 0.45, 0.08], [4100, 0.35, 0.05]]), 0, 1); mix(o, click(3000, 2, 0.003), 0, 0.7); return norm(o, 0.75); });
    reg('imp_sand', 3, () => { const o = new Float32Array(len(0.18)); mix(o, filt(white(len(0.18)), 'lp', 1000), 0, 2, env(0.001, 0.045)); mix(o, filt(white(len(0.03)), 'bp', 2500, 1), 0, 0.4, env(0.0003, 0.006)); return norm(o, 0.6); });
    reg('imp_flesh', 3, () => { const o = new Float32Array(len(0.2)); mix(o, tone(0.1, 120, 70, 0.02), 0, 1, env(0.001, 0.04)); mix(o, filt(white(len(0.12)), 'lp', 700), 0, 1.6, env(0.001, 0.05)); mix(o, filt(white(len(0.05)), 'bp', 1200, 2), 0.004, 0.8, env(0.001, 0.02)); return norm(o, 0.8); });
    // 命中反馈（射手听到）
    reg('hit_body', 2, () => { const o = new Float32Array(len(0.15)); mix(o, tone(0.1, 150, 80, 0.02), 0, 1, env(0.0008, 0.035)); mix(o, filt(white(len(0.1)), 'bp', 950, 0.8), 0, 1.8, env(0.0008, 0.03)); return norm(o, 0.7); });
    reg('hs_helmet', 2, () => { const o = new Float32Array(len(0.6)); mix(o, ring(0.6, [[3200, 1, 0.3], [4480, 0.6, 0.22], [6150, 0.4, 0.15], [2100, 0.35, 0.35]]), 0, 1); mix(o, filt(white(len(0.02)), 'hp', 4000), 0, 1.2, env(0.0002, 0.003)); return norm(o, 0.75); });
    reg('hs_flesh', 2, () => { const o = new Float32Array(len(0.2)); mix(o, filt(white(len(0.02)), 'hp', 3000), 0, 1, env(0.0002, 0.004)); mix(o, filt(white(len(0.12)), 'bp', 1700, 1.4), 0.002, 1.4, env(0.001, 0.03)); mix(o, tone(0.1, 190, 90, 0.02), 0, 0.8, env(0.001, 0.03)); return norm(o, 0.8); });
    reg('hurt', 2, () => { const o = new Float32Array(len(0.35)); mix(o, tone(0.3, 85, 42, 0.05), 0, 1, env(0.002, 0.11)); mix(o, filt(white(len(0.3)), 'lp', 320), 0, 2, env(0.002, 0.09)); return norm(o, 0.8); });
    reg('kill', 1, () => { const o = new Float32Array(len(0.25)); mix(o, ring(0.25, [[1320, 0.6, 0.07], [1980, 0.5, 0.06]]), 0, 1, env(0.002, 1)); return norm(o, 0.35); });
    reg('whiz', 3, () => { const n = len(0.22); const s = sweepBP(n, rand(2600, 3400), rand(900, 1300), 3); for (let i = 0; i < n; i++) { const t = i / n; s[i] *= Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 2); } return norm(s, 0.6); });
    reg('ricochet', 2, () => { const n = len(0.4); const o = new Float32Array(n); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; const f = 1300 + 1300 * Math.exp(-t / 0.12) + 60 * Math.sin(t * 90); ph += 2 * Math.PI * f / SR; o[i] = Math.sin(ph) * Math.exp(-t / 0.13) * (1 - Math.exp(-t / 0.004)); } mix(o, click(3000, 2, 0.003), 0, 0.8); return norm(o, 0.45); });

    // 投掷物 / 炸弹
    const boom = (sec, crackHP, bodyLP, bodyDec, tailDec, subF) => {
      const o = new Float32Array(len(sec));
      mix(o, filt(white(len(0.05)), 'hp', crackHP), 0, 1.5, env(0.0003, 0.01));
      mix(o, filt(white(len(1.5)), 'lp', bodyLP), 0, 3.2, env(0.002, bodyDec));
      mix(o, tone(1.2, subF * 2, subF, 0.06), 0, 1.2, env(0.003, 0.4));
      mix(o, filt(white(o.length), 'lp', 220), 0.02, 3.0, (t) => (1 - Math.exp(-t / 0.05)) * Math.exp(-t / tailDec));
      mix(o, filt(white(len(1.0)), 'hp', 2200), 0.25, 0.12, env(0.05, 0.35));
      return norm(o, 0.98);
    };
    reg('explode', 2, () => boom(2.6, 1500, 600, 0.35, 0.9, 32));
    reg('c4boom', 1, () => boom(4.0, 1200, 450, 0.55, 1.6, 26));
    reg('flashbang', 1, () => { const o = new Float32Array(len(1.6)); mix(o, filt(white(len(0.05)), 'hp', 2500), 0, 2, env(0.0002, 0.008)); mix(o, filt(white(len(0.6)), 'lp', 1300), 0, 2.2, env(0.001, 0.12)); mix(o, filt(white(o.length), 'lp', 500), 0.01, 1.6, env(0.02, 0.5)); return norm(o, 0.98); });
    reg('smokepop', 1, () => { const o = new Float32Array(len(4.0)); mix(o, tone(0.15, 140, 70, 0.03), 0, 0.6, env(0.001, 0.05)); mix(o, filt(filt(white(o.length), 'hp', 2200), 'lp', 7000), 0.03, 0.8, (t) => (1 - Math.exp(-t / 0.15)) * Math.exp(-t / 1.4)); return norm(o, 0.6); });
    reg('beep', 1, () => { const o = new Float32Array(len(0.14)); mix(o, ring(0.14, [[2950, 1, 1], [5900, 0.25, 1]]), 0, 1, (t) => (1 - Math.exp(-t / 0.002)) * (t < 0.09 ? 1 : Math.exp(-(t - 0.09) / 0.01))); return norm(o, 0.55); });
    reg('keypad', 3, () => { const o = new Float32Array(len(0.12)); mix(o, ring(0.12, [[1800 + randi(0, 6) * 150, 1, 1]]), 0, 1, (t) => (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.05)); mix(o, click(3000, 3, 0.003), 0, 0.5); return norm(o, 0.45); });
    reg('armed', 1, () => { const o = new Float32Array(len(0.6)); mix(o, ring(0.25, [[1800, 1, 1]]), 0, 1, (t) => (t < 0.2 ? 1 : 0)); mix(o, ring(0.3, [[2400, 1, 1]]), 0.26, 1, (t) => (t < 0.25 ? 1 : 0)); return norm(o, 0.5); });
    reg('defused', 1, () => { const o = new Float32Array(len(0.6)); mix(o, ring(0.2, [[2400, 1, 1]]), 0, 1, (t) => (t < 0.16 ? 1 : 0)); mix(o, ring(0.3, [[1600, 1, 1]]), 0.2, 1, (t) => (t < 0.25 ? 1 : 0)); return norm(o, 0.5); });

    // 界面
    reg('ui_click', 1, () => { const o = new Float32Array(len(0.06)); mix(o, ring(0.06, [[1500, 1, 0.015]]), 0, 1); return norm(o, 0.35); });
    reg('ui_buy', 1, () => { const o = new Float32Array(len(0.25)); mix(o, click(2600, 4, 0.004), 0, 1); mix(o, ring(0.2, [[1760, 0.6, 0.05], [2640, 0.4, 0.05]]), 0.04, 1); return norm(o, 0.45); });
    reg('ui_deny', 1, () => { const o = new Float32Array(len(0.2)); for (let i = 0; i < o.length; i++) { const t = i / SR; o[i] = Math.sign(Math.sin(2 * Math.PI * 200 * t)) * 0.3 * Math.exp(-t / 0.06); } return norm(filt(o, 'lp', 1500), 0.35); });
    const chord = (notes, step, dec) => { const o = new Float32Array(len(notes.length * step + 1.2)); notes.forEach((f, k) => mix(o, ring(1.2, [[f, 1, dec], [f * 2, 0.3, dec * 0.6], [f * 3, 0.12, dec * 0.4]]), k * step, 1, env(0.01, 5))); return norm(o, 0.5); };
    reg('round_start', 1, () => chord([660, 880], 0.14, 0.15));
    reg('round_win', 1, () => chord([523, 659, 784, 1046], 0.12, 0.5));
    reg('round_lose', 1, () => chord([440, 392, 330], 0.2, 0.5));
    reg('heart', 1, () => { const o = new Float32Array(len(0.5)); mix(o, tone(0.15, 70, 42, 0.03), 0, 1, env(0.003, 0.05)); mix(o, tone(0.15, 62, 40, 0.03), 0.2, 0.7, env(0.003, 0.05)); return norm(o, 0.7); });

    // 环境风声（可循环）
    reg('wind', 1, () => {
      const n = len(12); const o = new Float32Array(n); let b = 0;
      for (let i = 0; i < n; i++) { b = (b + (Math.random() * 2 - 1) * 0.02) * 0.998; o[i] = b; }
      let f = filt(filt(o, 'lp', 650), 'hp', 40);
      for (let i = 0; i < n; i++) { const t = i / SR; f[i] *= 0.55 + 0.25 * Math.sin(t * 0.7) + 0.2 * Math.sin(t * 0.23 + 1.3); }
      const x = len(1.0); // 首尾交叉淡化
      for (let i = 0; i < x; i++) { const k = i / x; f[i] = f[i] * k + f[n - x + i] * (1 - k); }
      return norm(f.subarray(0, n - x), 0.5);
    });
  }

  function makeIR(sec, decay) {
    const n = len(sec); const ir = ctx.createBuffer(2, n, SR);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < len(0.008) ? 0 : 1); }
    }
    return ir;
  }

  const api = {
    get ctx() { return ctx; },
    ready: false,
    init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      SR = ctx.sampleRate;
      master = ctx.createGain(); master.gain.value = Settings.data.volume;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
      muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
      master.connect(muffle); muffle.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      const rev = ctx.createConvolver(); rev.buffer = makeIR(1.8, 3.2);
      revIn = ctx.createGain(); revIn.gain.value = 0.32; revIn.connect(rev); rev.connect(master);
      synthAll();
      api.ready = true;
    },
    resume() { if (ctx && ctx.state !== 'running') ctx.resume(); },
    setVolume(v) { if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
    has(name) { return !!B[name]; },

    // o: {pos, vol, rate, delay, lp, ref, roll, rev, noPitch}
    play(name, o = {}) {
      if (!ctx || !B[name]) return null;
      if (voices > 72 && o.pos) return null;
      const list = B[name];
      const src = ctx.createBufferSource();
      src.buffer = list[(Math.random() * list.length) | 0];
      src.playbackRate.value = (o.rate || 1) * (o.noPitch ? 1 : 1 + (Math.random() - 0.5) * 0.06);
      let node = src;
      if (o.lp && o.lp < 18000) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.6; node.connect(f); node = f; }
      const g = ctx.createGain(); g.gain.value = o.vol == null ? 1 : o.vol; node.connect(g);
      const revAmt = o.rev == null ? 0.2 : o.rev;
      if (o.pos) {
        const p = ctx.createPanner();
        p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
        p.refDistance = o.ref || 3; p.rolloffFactor = o.roll || 1; p.maxDistance = 10000;
        if (p.positionX) { p.positionX.value = o.pos.x; p.positionY.value = o.pos.y; p.positionZ.value = o.pos.z; }
        else p.setPosition(o.pos.x, o.pos.y, o.pos.z);
        g.connect(p); p.connect(sfxBus);
        if (revAmt > 0) {
          const d = o.dist == null ? 5 : o.dist;
          const s = ctx.createGain(); s.gain.value = revAmt * (o.ref || 3) / ((o.ref || 3) + d * 0.6);
          g.connect(s); s.connect(revIn);
        }
      } else {
        g.connect(sfxBus);
        if (revAmt > 0) { const s = ctx.createGain(); s.gain.value = revAmt; g.connect(s); s.connect(revIn); }
      }
      src.start(ctx.currentTime + (o.delay || 0));
      voices++;
      src.onended = () => { voices--; try { g.disconnect(); } catch (e) { /* noop */ } };
      return src;
    },

    setListener(pos, fwd, up) {
      if (!ctx) return;
      const L = ctx.listener;
      if (L.positionX) {
        const t = ctx.currentTime;
        L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
        L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
        L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
      } else {
        L.setPosition(pos.x, pos.y, pos.z);
        L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    },

    startAmbience() {
      if (!ctx || windNode) return;
      windNode = ctx.createBufferSource(); windNode.buffer = B.wind[0]; windNode.loop = true;
      windGain = ctx.createGain(); windGain.gain.value = 0.0;
      windNode.connect(windGain); windGain.connect(master);
      windNode.start();
      windGain.gain.setTargetAtTime(0.16, ctx.currentTime, 1.5);
    },

    // 闪光弹耳鸣 & 听觉闷响
    deafen(amount, dur) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (!tinnitusOsc) {
        tinnitusOsc = ctx.createOscillator(); tinnitusOsc.type = 'sine'; tinnitusOsc.frequency.value = 3700;
        tinnitusGain = ctx.createGain(); tinnitusGain.gain.value = 0;
        tinnitusOsc.connect(tinnitusGain); tinnitusGain.connect(comp); tinnitusOsc.start();
      }
      tinnitusGain.gain.cancelScheduledValues(t);
      tinnitusGain.gain.setValueAtTime(Math.max(tinnitusGain.gain.value, 0.0001), t);
      tinnitusGain.gain.linearRampToValueAtTime(0.09 * amount, t + 0.05);
      tinnitusGain.gain.setTargetAtTime(0, t + dur * 0.5, dur * 0.25);
      muffle.frequency.cancelScheduledValues(t);
      muffle.frequency.setValueAtTime(lerp(20000, 700, amount), t);
      muffle.frequency.setTargetAtTime(20000, t + dur * 0.4, dur * 0.3);
    },
    stopAll() { if (tinnitusGain) tinnitusGain.gain.setValueAtTime(0, ctx.currentTime); if (muffle) muffle.frequency.setValueAtTime(20000, ctx.currentTime); },
  };
  Settings.onChange((d) => api.setVolume(d.volume));
  return api;
})();
