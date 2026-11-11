import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
let commit = null;
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
const bundles = {};
for (const name of (await readdir(resolve(root, 'dist/assets'))).sort()) {
  if (!/\.(js|css)$/.test(name)) continue;
  bundles[`/assets/${name}`] = createHash('sha256').update(await readFile(resolve(root, 'dist/assets', name))).digest('hex');
}
const info = { app: 'unspool', commit, builtAt: new Date().toISOString(), chapter: 1,
  languages: ['zh', 'zh-Hant', 'en', 'ja', 'ko'], connections: 9, bundles };
await writeFile(resolve(root, 'dist/build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Build identity: ${commit ?? 'local-uncommitted'} (${Object.keys(bundles).length} bundles)`);
