// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
// Generate a tiny valid 3DGS .splat sample (32 bytes per Gaussian) for
// getLoadProgress() verification. Usage:
//   node scripts/make-test-splat.mjs <output.splat> [pointCount]
// The script only writes the path passed as an argument; it never reads
// anything from the data directory.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outPath = resolve(process.argv[2] || 'public/testdata/load-progress/load-progress-test.splat');
const pointCount = Number(process.argv[3]) || 1000;

const bytes = new Uint8Array(pointCount * 32);
const f32 = new Float32Array(bytes.buffer);
const u32 = new Uint32Array(bytes.buffer);

for (let i = 0; i < pointCount; i++) {
    const p = i / pointCount; // 0..1 across the model
    const base = i * 8; // float32 slots per point

    // xyz: a small diagonal cluster around the origin
    f32[base + 0] = p * 2 - 1;
    f32[base + 1] = Math.sin(p * Math.PI * 2) * 0.5;
    f32[base + 2] = Math.cos(p * Math.PI * 2) * 0.5;

    // scales: small positive Gaussians
    f32[base + 3] = 0.01;
    f32[base + 4] = 0.01;
    f32[base + 5] = 0.01;

    // rgba packed into one uint32 (bytes 24..27): gradient color, opaque
    const r = Math.floor(p * 255);
    const g = Math.floor((1 - p) * 255);
    const b = 128;
    const a = 200;
    u32[base + 6] = (a << 24) | (b << 16) | (g << 8) | r;

    // rotation quaternion as bytes 28..31: identity quaternion (w=1 -> 255)
    bytes[i * 32 + 28] = 128;
    bytes[i * 32 + 29] = 128;
    bytes[i * 32 + 30] = 128;
    bytes[i * 32 + 31] = 255;
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, bytes);
console.log(`Wrote ${pointCount} points (${bytes.byteLength} bytes) to ${outPath}`);
