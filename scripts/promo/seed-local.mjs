#!/usr/bin/env node
// LOCAL ONLY: fill a `wrangler dev` Durable Object with SIMULATED routes
// (public/woven/sample.json) for the illustrative finale shot. Refuses any
// non-localhost target so simulated threads can never reach production.
//   node scripts/promo/seed-local.mjs http://127.0.0.1:8788 300
import { readFile } from 'node:fs/promises';
const [origin = 'http://127.0.0.1:8788', countArg = '300'] = process.argv.slice(2);
const url = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('seed-local only talks to a local wrangler dev');
const { travelers } = JSON.parse(await readFile(new URL('../../public/woven/sample.json', import.meta.url), 'utf8'));
let ok = 0, fail = 0;
for (const [i, t] of travelers.slice(0, Number(countArg)).entries()) {
  const p = t.p.slice(0, 700 * 3);
  const response = await fetch(new URL('/api/threads', url), {
    method: 'POST', body: JSON.stringify({ c: t.c, p }),
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.${i >> 8}.${i & 255}` },
  });
  if (response.ok) ok++; else fail++;
}
console.log(JSON.stringify({ ok, fail }));
