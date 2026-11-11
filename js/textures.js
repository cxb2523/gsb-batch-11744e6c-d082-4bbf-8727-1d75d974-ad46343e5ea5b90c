'use strict';
// ======================================================================
//  textures.js —— 程序化 PBR 纹理（反照率 + 法线 + 粗糙度），全部可平铺
// ======================================================================
const Tex = (() => {
  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, p, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p;
    const x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // 各向异性可平铺噪声（x/y 周期不同）
  function vnoise2(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // u,v ∈[0,1)，p = 基础频率（每张图的格子数）
  function fbm(u, v, p, oct, s) {
    let sum = 0, amp = 0.5, nrm = 0, x = u * p, y = v * p;
    for (let o = 0; o < oct; o++) { sum += amp * vnoise(x, y, p, s + o * 31); nrm += amp; x *= 2; y *= 2; p *= 2; amp *= 0.5; }
    return sum / nrm;
  }
  // 可平铺 Worley：返回 [F1, F2, cellHash]
  function worley(u, v, p, s, out) {
    const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p;
      const px = cx + 0.15 + 0.7 * hash2(wx, wy, s), py = cy + 0.15 + 0.7 * hash2(wx, wy, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, s + 13); } else if (d < f2) f2 = d;
    }
    out[0] = f1; out[1] = f2; out[2] = id;
    return out;
  }

  let SIZE = 512;
  let anisotropy = 4;

  // fn(u, v, x, y, o) 写入 o.r,g,b(0..1) o.h(高度 0..1) o.ro(粗糙度) o.me(金属度,可选)
  function generate(size, fn, normalStrength, opts = {}) {
    const n = size * size;
    const alb = new Uint8ClampedArray(n * 4), rgh = new Uint8ClampedArray(n * 4), nrm = new Uint8ClampedArray(n * 4);
    const hgt = new Float32Array(n);
    const o = { r: 0, g: 0, b: 0, h: 0.5, ro: 0.9, a: 1 };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        o.a = 1;
        fn(x / size, y / size, x, y, o);
        const i = y * size + x, k = i * 4;
        alb[k] = Math.pow(clamp(o.r, 0, 1), 1 / 2.2) * 255;
        alb[k + 1] = Math.pow(clamp(o.g, 0, 1), 1 / 2.2) * 255;
        alb[k + 2] = Math.pow(clamp(o.b, 0, 1), 1 / 2.2) * 255;
        alb[k + 3] = o.a * 255;
        const r = clamp(o.ro, 0.04, 1) * 255;
        rgh[k] = r; rgh[k + 1] = r; rgh[k + 2] = r; rgh[k + 3] = 255;
        hgt[i] = o.h;
      }
    }
    for (let y = 0; y < size; y++) {
      const ym = ((y - 1 + size) % size) * size, yp = ((y + 1) % size) * size, yc = y * size;
      for (let x = 0; x < size; x++) {
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        const hx = (hgt[yc + xp] - hgt[yc + xm]) * normalStrength;
        const hy = (hgt[yp + x] - hgt[ym + x]) * normalStrength;
        let nx = -hx, ny = hy, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const k = (yc + x) * 4;
        nrm[k] = (nx * 0.5 + 0.5) * 255; nrm[k + 1] = (ny * 0.5 + 0.5) * 255; nrm[k + 2] = (nz * 0.5 + 0.5) * 255; nrm[k + 3] = 255;
      }
    }
    const mk = (data, srgb) => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      c.getContext('2d').putImageData(new ImageData(data, size, size), 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = anisotropy;
      if (srgb) t.encoding = THREE.sRGBEncoding;
      return t;
    };
    return { map: mk(alb, true), normalMap: mk(nrm, false), roughnessMap: opts.noRough ? null : mk(rgh, false) };
  }

  const W = [0, 0, 0];
  const DEF = {
    // 沙土地面 (世界 4m)
    sand: [2.2, (u, v, x, y, o) => {
      const big = fbm(u, v, 4, 5, 11), mid = fbm(u, v, 16, 3, 21), fine = vnoise(u * 256, v * 256, 256, 5);
      const peb = vnoise(u * 96, v * 96, 96, 77);
      const pebble = peb > 0.78 ? (peb - 0.78) * 4.5 : 0;
      const tracks = Math.pow(fbm(u, v, 8, 3, 91), 3);
      const k = 0.84 + 0.22 * big - 0.08 * tracks + 0.06 * fine;
      o.r = (0.64 + 0.08 * mid) * k; o.g = (0.50 + 0.06 * mid) * k; o.b = (0.35 + 0.04 * mid) * k;
      if (pebble > 0) { const pc = 0.75 + 0.5 * hash2(Math.floor(u * 96), Math.floor(v * 96), 3); o.r *= pc; o.g *= pc; o.b *= pc * 0.95; }
      o.h = 0.45 * big + 0.3 * mid + 0.12 * fine + pebble * 0.5;
      o.ro = 0.95 - pebble * 0.2;
    }],
    // 砂岩砌块 (世界 4m，块 1m×0.5m)
    sandstone: [3.2, (u, v, x, y, o) => {
      const S = SIZE, bw = S / 4, bh = S / 8;
      const row = Math.floor(y / bh), off = (row % 2) * bw / 2;
      const xx = (x + off) % S, col = Math.floor(xx / bw);
      const lx = xx % bw, ly = y % bh;
      const chip = (vnoise(u * 64, v * 64, 64, 3) - 0.5) * 5;
      const d = Math.min(lx, bw - lx, ly, bh - ly) + chip;
      const mortar = 3;
      const br = hash2(col, row, 7), surf = fbm(u, v, 8, 4, 1), fine = vnoise(u * 200, v * 200, 200, 9);
      const stain = fbm(u, v, 2, 4, 55);
      if (d < mortar) {
        o.r = 0.52; o.g = 0.45; o.b = 0.36; o.h = 0.15 + fine * 0.05; o.ro = 0.98;
      } else {
        const bev = smoothstep(mortar, mortar + 6, d);
        const k = (0.86 + 0.2 * br) * (0.82 + 0.3 * surf) * (0.95 + 0.08 * fine) * (0.85 + 0.2 * stain);
        o.r = 0.74 * k; o.g = 0.61 * k; o.b = 0.45 * k;
        o.h = 0.45 + 0.35 * bev + 0.18 * surf + 0.05 * fine;
        o.ro = 0.86 + 0.08 * fine;
      }
    }],
    // 灰泥墙 (世界 4m) —— 局部剥落露出砖块
    plaster: [1.6, (u, v, x, y, o) => {
      const large = fbm(u, v, 3, 5, 31), fine = vnoise(u * 180, v * 180, 180, 2), speck = vnoise(u * 400, v * 400, 400, 8);
      const patch = fbm(u, v, 3, 4, 99);
      const S = SIZE;
      if (patch > 0.64) {
        const bw = S / 16, bh = S / 40;
        const row = Math.floor(y / bh), off = (row % 2) * bw / 2, xx = (x + off) % S;
        const lx = xx % bw, ly = y % bh, d = Math.min(lx, bw - lx, ly, bh - ly);
        const br = hash2(Math.floor(xx / bw), row, 5);
        const rim = smoothstep(0.64, 0.67, patch);
        if (d < 1.5) { o.r = 0.48; o.g = 0.42; o.b = 0.35; o.h = 0.1; }
        else { const k = 0.8 + 0.3 * br; o.r = 0.58 * k; o.g = 0.38 * k; o.b = 0.27 * k; o.h = 0.25 + 0.05 * fine; }
        o.h *= rim; o.ro = 0.92;
        if (rim < 1) { o.r = lerp(0.82, o.r, rim); o.g = lerp(0.76, o.g, rim); o.b = lerp(0.64, o.b, rim); }
      } else {
        const k = (0.82 + 0.22 * large) * (0.96 + 0.06 * fine) - (speck > 0.93 ? 0.12 : 0);
        o.r = 0.86 * k; o.g = 0.80 * k; o.b = 0.68 * k;
        o.h = 0.55 + 0.06 * fine + 0.1 * large + (patch > 0.6 ? (patch - 0.6) * 3 : 0);
        o.ro = 0.9;
      }
      // 裂纹
      const cr = Math.abs(fbm(u, v, 6, 4, 202) - 0.5);
      if (cr < 0.006 && large > 0.45) { o.r *= 0.55; o.g *= 0.55; o.b *= 0.55; o.h -= 0.25; }
    }],
    // 混凝土 (世界 4m)
    concrete: [1.5, (u, v, x, y, o) => {
      const large = fbm(u, v, 4, 5, 41), fine = vnoise(u * 220, v * 220, 220, 4);
      const streak = 0.6 * vnoise2(u * 48, v * 3, 48, 3, 61) + 0.4 * vnoise2(u * 96, v * 6, 96, 6, 62);
      const pore = vnoise(u * 300, v * 300, 300, 12) > 0.86;
      const seam = (y % (SIZE / 2)) < 2 || (x % (SIZE / 2)) < 2;
      const k = (0.8 + 0.25 * large) * (0.95 + 0.08 * fine) * (0.9 + 0.12 * streak);
      o.r = 0.56 * k; o.g = 0.545 * k; o.b = 0.52 * k;
      o.h = 0.55 + 0.1 * large + 0.08 * fine - (pore ? 0.3 : 0) - (seam ? 0.2 : 0);
      if (pore) { o.r *= 0.6; o.g *= 0.6; o.b *= 0.6; }
      if (seam) { o.r *= 0.8; o.g *= 0.8; o.b *= 0.8; }
      o.ro = 0.88;
    }],
    // 石板铺地 (世界 4m)
    tile: [3.0, (u, v, x, y, o) => {
      worley(u, v, 8, 17, W);
      const e = W[1] - W[0], id = W[2];
      const fine = vnoise(u * 180, v * 180, 180, 6), large = fbm(u, v, 4, 4, 7);
      if (e < 0.07) { const g = 0.5 + 0.2 * fine; o.r = 0.42 * g + 0.15; o.g = 0.37 * g + 0.13; o.b = 0.3 * g + 0.1; o.h = 0.1; o.ro = 0.98; }
      else {
        const bev = smoothstep(0.07, 0.2, e);
        const k = (0.78 + 0.35 * id) * (0.9 + 0.15 * large) * (0.94 + 0.08 * fine);
        o.r = 0.66 * k; o.g = 0.6 * k; o.b = 0.52 * k;
        o.h = 0.4 + 0.45 * bev + 0.06 * fine;
        o.ro = 0.78 + 0.1 * fine;
      }
    }],
    // 木箱面（面 UV 0..1）
    crate: [2.6, (u, v, x, y, o) => {
      const fw = 0.13, gap = 0.006;
      const inFrame = u < fw || u > 1 - fw || v < fw || v > 1 - fw;
      let grainU, grainV, plankId, edgeD;
      if (inFrame) {
        const vert = (u < fw || u > 1 - fw) && !(v < fw || v > 1 - fw);
        grainU = vert ? u * 30 : u * 3; grainV = vert ? v * 3 : v * 30;
        plankId = vert ? (u < 0.5 ? 1 : 2) : (v < 0.5 ? 3 : 4);
        edgeD = vert ? Math.min(Math.abs(u - (u < 0.5 ? 0 : 1)), Math.abs(u - (u < 0.5 ? fw : 1 - fw))) : Math.min(Math.abs(v - (v < 0.5 ? 0 : 1)), Math.abs(v - (v < 0.5 ? fw : 1 - fw)));
      } else {
        const pv = (v - fw) / (1 - 2 * fw) * 5; const pi = Math.floor(pv);
        grainU = u * 3; grainV = v * 40; plankId = 10 + pi; edgeD = Math.min(pv - pi, 1 - (pv - pi)) * (1 - 2 * fw) / 5;
      }
      const grain = fbm((grainU % 1 + 1) % 1, (grainV % 1 + 1) % 1, 4, 4, 70 + plankId);
      const ring2 = 0.5 + 0.5 * Math.sin(grain * 40);
      const pr = hash2(plankId, 1, 9);
      const k = (0.78 + 0.28 * pr) * (0.82 + 0.25 * grain) * (0.92 + 0.08 * ring2);
      o.r = 0.6 * k; o.g = 0.42 * k; o.b = 0.25 * k;
      o.h = (inFrame ? 0.75 : 0.55) + 0.1 * grain;
      if (edgeD < gap) { o.r *= 0.35; o.g *= 0.35; o.b *= 0.35; o.h = 0.1; }
      const dirt = smoothstep(0.35, 0.5, Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)));
      o.r *= 1 - dirt * 0.3; o.g *= 1 - dirt * 0.3; o.b *= 1 - dirt * 0.3;
      // 钉子
      const nails = [[fw / 2, fw / 2], [1 - fw / 2, fw / 2], [fw / 2, 1 - fw / 2], [1 - fw / 2, 1 - fw / 2]];
      for (const [nu, nv] of nails) if (Math.hypot(u - nu, v - nv) < 0.012) { o.r = o.g = o.b = 0.18; o.h = 0.9; o.ro = 0.4; return; }
      o.ro = 0.78;
    }],
    // 波纹铁皮（集装箱/大门），颜色由材质 color 提供
    metal: [4.0, (u, v, x, y, o) => {
      const rib = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 20);
      const rustN = fbm(u, v, 4, 5, 123), fine = vnoise(u * 256, v * 256, 256, 3);
      const rust = smoothstep(0.58, 0.68, rustN + 0.08 * fine);
      const scratch = vnoise2(u * 6, v * 300, 6, 300, 44) > 0.92 ? 0.15 : 0;
      const k = 0.85 + 0.15 * fine;
      o.r = lerp(0.78 * k + scratch, 0.42, rust); o.g = lerp(0.78 * k + scratch, 0.24, rust); o.b = lerp(0.78 * k + scratch, 0.12, rust);
      o.h = rib * 0.8 + rust * 0.1 * fine;
      o.ro = lerp(0.5, 0.95, rust);
    }],
    // 木门（竖板 + 剥落油漆）
    door: [2.2, (u, v, x, y, o) => {
      const pu = u * 6, pi = Math.floor(pu), fr = pu - pi;
      const grain = fbm(u, v, 3, 4, 300 + pi);
      const paintN = fbm(u, v, 4, 5, 77);
      const painted = paintN > 0.47;
      const k = 0.85 + 0.2 * grain;
      if (painted) { o.r = 0.22 * k; o.g = 0.42 * k; o.b = 0.43 * k; o.ro = 0.7; o.h = 0.7; }
      else { o.r = 0.42 * k; o.g = 0.34 * k; o.b = 0.26 * k; o.ro = 0.9; o.h = 0.55 + 0.1 * grain; }
      if (fr < 0.03 || fr > 0.97) { o.r *= 0.3; o.g *= 0.3; o.b *= 0.3; o.h = 0.1; }
    }],
    // 深色木梁（隧道顶）
    beam: [2.0, (u, v, x, y, o) => {
      const pv = v * 8, pi = Math.floor(pv), fr = pv - pi;
      const grain = fbm(u, (v * 8) % 1, 4, 4, 500 + pi);
      const k = (0.7 + 0.3 * hash2(pi, 0, 3)) * (0.85 + 0.2 * grain);
      o.r = 0.32 * k; o.g = 0.23 * k; o.b = 0.15 * k; o.h = 0.6 + 0.1 * grain; o.ro = 0.85;
      if (fr < 0.03 || fr > 0.97) { o.r *= 0.4; o.g *= 0.4; o.b *= 0.4; o.h = 0.15; }
    }],
    // 光滑石材（檐口/门框）
    trim: [1.8, (u, v, x, y, o) => {
      const large = fbm(u, v, 4, 4, 900), fine = vnoise(u * 160, v * 160, 160, 2);
      const k = (0.85 + 0.2 * large) * (0.95 + 0.08 * fine);
      o.r = 0.72 * k; o.g = 0.62 * k; o.b = 0.48 * k; o.h = 0.5 + 0.12 * large + 0.05 * fine; o.ro = 0.82;
    }],
    // 远景岩石
    rock: [2.5, (u, v, x, y, o) => {
      const a = fbm(u, v, 4, 6, 1000), b = fbm(u, v, 16, 3, 1001);
      const k = 0.7 + 0.4 * a;
      o.r = 0.62 * k; o.g = 0.48 * k; o.b = 0.34 * k; o.h = a * 0.7 + b * 0.3; o.ro = 0.95;
    }],
    // 沙袋布
    sackcloth: [2.0, (u, v, x, y, o) => {
      const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
      const large = fbm(u, v, 4, 4, 1200);
      const k = (0.85 + 0.2 * large) * (0.9 + 0.1 * weave);
      o.r = 0.62 * k; o.g = 0.53 * k; o.b = 0.38 * k; o.h = weave * 0.5 + large * 0.3; o.ro = 0.95;
    }],
  };

  // 枪械：磨损金属 / 聚合物（小尺寸，乘以材质颜色）
  function gunTex(kind) {
    return generate(256, (u, v, x, y, o) => {
      const fine = vnoise(u * 128, v * 128, 128, kind === 'metal' ? 31 : 37), mid = fbm(u, v, 8, 3, kind === 'metal' ? 41 : 43);
      if (kind === 'metal') {
        const scr = vnoise2(u * 3, v * 160, 3, 160, 51) > 0.86 || vnoise2(u * 160, v * 3, 160, 3, 52) > 0.9;
        const k = 0.9 + 0.08 * mid + 0.05 * fine + (scr ? 0.14 : 0);
        o.r = o.g = o.b = k; o.h = 0.5 + 0.1 * fine - (scr ? 0.15 : 0); o.ro = 0.42 + 0.22 * mid - (scr ? 0.15 : 0);
      } else {
        const st = vnoise(u * 90, v * 90, 90, 61);
        const k = 0.9 + 0.12 * mid + 0.04 * st;
        o.r = o.g = o.b = k; o.h = st * 0.8; o.ro = 0.62 + 0.15 * mid;
      }
    }, 1.0);
  }
  // 角色迷彩布料（小尺寸）
  function camo(kind) {
    return generate(256, (u, v, x, y, o) => {
      if (kind === 'ct') {
        const px = Math.floor(u * 64), py = Math.floor(v * 64);
        const n = fbm(u, v, 4, 3, 1300) + (hash2(px, py, 5) - 0.5) * 0.18;
        const c = n < 0.42 ? [0.12, 0.15, 0.2] : n < 0.55 ? [0.22, 0.26, 0.32] : [0.34, 0.37, 0.42];
        o.r = c[0]; o.g = c[1]; o.b = c[2];
      } else if (kind === 't') {
        const n = fbm(u, v, 3, 4, 1400);
        const c = n < 0.45 ? [0.36, 0.28, 0.2] : n < 0.6 ? [0.48, 0.4, 0.29] : [0.58, 0.5, 0.38];
        o.r = c[0]; o.g = c[1]; o.b = c[2];
      } else {
        const n = fbm(u, v, 4, 3, 1500); o.r = o.g = o.b = 0.1 + 0.06 * n;
      }
      const weave = (Math.sin(x * 2.2) * Math.sin(y * 2.2)) * 0.5 + 0.5;
      o.r *= 0.9 + 0.12 * weave; o.g *= 0.9 + 0.12 * weave; o.b *= 0.9 + 0.12 * weave;
      o.h = weave * 0.4; o.ro = 0.92;
    }, 1.2);
  }

  // ---------- 2D 精灵纹理（canvas 绘制） ----------
  function canvasTex(size, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function sprites() {
    const S = {};
    S.soft = canvasTex(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
    // 粒子图集 2x2：0 柔光 1 烟团 2 火花星 3 碎屑
    S.atlas = canvasTex(256, (g) => {
      const h = 128;
      let gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, h, h);
      // 烟团：多重噪声圆
      const id = g.createImageData(h, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
        const dx = (x - 64) / 62, dy = (y - 64) / 62, r = Math.hypot(dx, dy);
        const n = fbm(x / h, y / h, 4, 5, 2024);
        const a = clamp((1 - r) * 1.6 * (0.45 + n), 0, 1) * smoothstep(1, 0.6, r);
        const k = (y * h + x) * 4; const l = 200 + 55 * n;
        id.data[k] = l; id.data[k + 1] = l; id.data[k + 2] = l; id.data[k + 3] = a * 255;
      }
      g.putImageData(id, h, 0);
      // 火花星
      g.save(); g.translate(64, 192);
      gr = g.createRadialGradient(0, 0, 0, 0, 0, 60);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,240,200,0.9)'); gr.addColorStop(0.4, 'rgba(255,180,80,0.25)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill(); g.restore();
      // 碎屑
      g.save(); g.translate(192, 192); g.fillStyle = '#fff'; g.beginPath();
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = 26 + Math.random() * 22; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fill(); g.restore();
    }, false);
    // 弹孔贴花
    S.hole = canvasTex(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      let gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
      gr.addColorStop(0, 'rgba(10,8,6,1)'); gr.addColorStop(0.16, 'rgba(15,12,10,1)'); gr.addColorStop(0.24, 'rgba(40,32,26,0.85)');
      gr.addColorStop(0.5, 'rgba(60,50,40,0.35)'); gr.addColorStop(1, 'rgba(60,50,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
      g.strokeStyle = 'rgba(20,16,12,0.7)'; g.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const a = Math.random() * Math.PI * 2; let r = 10, x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 4; k++) { r += 5 + Math.random() * 8; const aa = a + (Math.random() - 0.5) * 0.5; x = 64 + Math.cos(aa) * r; y = 64 + Math.sin(aa) * r; g.lineTo(x, y); }
        g.stroke();
      }
    });
    S.blood = canvasTex(128, (g, s) => {
      g.clearRect(0, 0, s, s);
      for (let i = 0; i < 26; i++) {
        const r = i < 6 ? 10 + Math.random() * 18 : 2 + Math.random() * 5;
        const d = i < 6 ? Math.random() * 14 : 14 + Math.random() * 44, a = Math.random() * Math.PI * 2;
        g.fillStyle = `rgba(${90 + Math.random() * 40},${4 + Math.random() * 8},${4 + Math.random() * 6},${0.75 + Math.random() * 0.25})`;
        g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, r * (0.6 + Math.random() * 0.4), a, 0, 7); g.fill();
      }
    });
    S.scorch = canvasTex(128, (g, s) => {
      const id = g.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const r = Math.hypot(x - 64, y - 64) / 64, n = fbm(x / s, y / s, 6, 4, 77);
        const a = clamp((1 - r) * 1.5 * (0.6 + n * 0.8), 0, 1);
        const k = (y * s + x) * 4; id.data[k] = 18; id.data[k + 1] = 15; id.data[k + 2] = 12; id.data[k + 3] = a * 235;
      }
      g.putImageData(id, 0, 0);
    });
    S.flash = canvasTex(128, (g, s) => {
      g.translate(64, 64);
      for (let i = 0; i < 9; i++) {
        g.rotate(Math.PI * 2 / 9 + (Math.random() - 0.5) * 0.3);
        const L = 40 + Math.random() * 22;
        const gr = g.createLinearGradient(0, 0, L, 0);
        gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.5, 'rgba(255,190,90,0.6)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, -5); g.lineTo(L, 0); g.lineTo(0, 5); g.closePath(); g.fill();
      }
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.5, 'rgba(255,200,110,0.6)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
    }, false);
    S.flashSide = canvasTex(128, (g, s) => {
      const gr = g.createLinearGradient(0, 64, 128, 64);
      gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,200,100,0.7)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 64); g.bezierCurveTo(30, 30, 90, 50, 128, 64); g.bezierCurveTo(90, 78, 30, 98, 0, 64); g.fill();
      for (let i = 0; i < 5; i++) { g.beginPath(); const y = 64 + (Math.random() - 0.5) * 30; g.moveTo(10, 64); g.quadraticCurveTo(60, y, 110 + Math.random() * 18, y + (Math.random() - 0.5) * 20); g.lineTo(10, 66); g.fill(); }
    }, false);
    S.tracer = canvasTex(64, (g, s) => {
      const gr = g.createLinearGradient(0, 0, s, 0);
      gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(0.7, 'rgba(255,220,160,0.8)'); gr.addColorStop(1, 'rgba(255,255,240,1)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      const v = g.getImageData(0, 0, s, s);
      for (let y = 0; y < s; y++) { const f = 1 - Math.abs(y - s / 2) / (s / 2); for (let x = 0; x < s; x++) v.data[(y * s + x) * 4 + 3] *= Math.pow(f, 1.5); }
      g.putImageData(v, 0, 0);
    }, false);
    // 棕榈叶
    S.leaf = canvasTex(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = '#5b6a2c'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
      for (let i = 0; i < 44; i++) {
        const y = 6 + i * 5.6, L = 118 * Math.sin(Math.PI * (0.15 + 0.85 * i / 44)) * (0.85 + Math.random() * 0.15);
        for (const sd of [-1, 1]) {
          g.strokeStyle = `rgb(${70 + Math.random() * 30},${92 + Math.random() * 30},${38 + Math.random() * 14})`;
          g.lineWidth = 3.2; g.beginPath(); g.moveTo(128, y); g.quadraticCurveTo(128 + sd * L * 0.5, y + 10, 128 + sd * L, y + 26); g.stroke();
        }
      }
    });
    // A / B 包点喷漆
    S.siteA = paintLetter('A'); S.siteB = paintLetter('B');
    return S;
  }
  function paintLetter(ch) {
    return canvasTex(256, (g, s) => {
      g.clearRect(0, 0, s, s);
      g.font = 'bold 210px Bahnschrift, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(190,30,20,0.92)'; g.fillText(ch, 128, 140);
      const id = g.getImageData(0, 0, s, s);
      for (let i = 0; i < id.data.length; i += 4) { if (Math.random() < 0.25) id.data[i + 3] *= 0.6; }
      g.putImageData(id, 0, 0);
      g.strokeStyle = 'rgba(190,30,20,0.85)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 138, 112, 0, 7); g.stroke();
    });
  }

  const api = {
    sets: {}, sprites: null, camo: {},
    async init(quality, progress) {
      SIZE = quality === 'low' ? 256 : 512;
      anisotropy = quality === 'low' ? 2 : quality === 'medium' ? 4 : 8;
      const keys = Object.keys(DEF);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        progress && progress(i / (keys.length + 4), '生成材质 · ' + k);
        await new Promise((r) => setTimeout(r, 0));
        const [ns, fn] = DEF[k];
        this.sets[k] = generate(SIZE, fn, ns * SIZE / 512);
      }
      progress && progress((keys.length + 1) / (keys.length + 4), '生成角色布料');
      await new Promise((r) => setTimeout(r, 0));
      this.camo.ct = camo('ct'); this.camo.t = camo('t'); this.camo.dark = camo('dark');
      this.gun = { metal: gunTex('metal'), poly: gunTex('poly') };
      progress && progress((keys.length + 2) / (keys.length + 4), '生成特效贴图');
      await new Promise((r) => setTimeout(r, 0));
      this.sprites = sprites();
    },
    setAnisotropy(a) { anisotropy = a; },
    hash2, vnoise, fbm,
  };
  return api;
})();
