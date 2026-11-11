import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const url = process.argv[2] ?? 'https://yarn.ynot.games';
const base = new URL(url);
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Expected a plain HTTP(S) site URL');
const local = JSON.parse(await readFile(resolve(root, 'dist/build-info.json'), 'utf8'));
const get = path => fetch(new URL(path, base), { signal: AbortSignal.timeout(30_000) });
const infoResponse = await get('/build-info.json');
if (!infoResponse.ok) throw new Error(`Build identity HTTP ${infoResponse.status}`);
const deployed = await infoResponse.json();
if (deployed.commit !== local.commit) throw new Error('Deployed commit differs from the release build');
const page = await get('/');
const html = await page.text();
if (!page.ok || !page.headers.get('content-type')?.includes('text/html') || !html.includes('<div id="world">') || !html.includes('Yarn Planet')) {
  throw new Error(`Game homepage failed: HTTP ${page.status}`);
}
const checks = [];
for (const [path, sha256] of Object.entries(local.bundles)) {
  const response = await get(path);
  const actual = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  if (!response.ok || actual !== sha256) throw new Error(`Compiled bundle differs: ${path}`);
  checks.push({ path, status: response.status, sha256: actual, contentType: response.headers.get('content-type') });
}
const missing = await get('/assets/nonexistent-asset.js');
if (missing.status !== 404) throw new Error(`Missing asset returned HTTP ${missing.status}, expected 404`);
const receipt = { url: base.origin, checkedAt: new Date().toISOString(), deployed, homepage: { status: page.status, contentType: page.headers.get('content-type') }, checks, missingAssetStatus: missing.status };
await mkdir(resolve(root, 'release'), { recursive: true });
await writeFile(resolve(root, 'release/online-http.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ url: base.origin, commit: deployed.commit, homepage: page.status, hashes: 'matched', missingAsset: missing.status }));
