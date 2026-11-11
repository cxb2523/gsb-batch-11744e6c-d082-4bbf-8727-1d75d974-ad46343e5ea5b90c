// engine/manifest.json records engine/ as released, so tools/check-site.mjs
// can tell a world when its engine no longer matches.
//
// Homecraft maintainers only, when releasing a new engine:
//   node tools/engine-manifest.mjs 0.2.0
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE = fileURLToPath(new URL('../engine/', import.meta.url));

// Every file in engine/ with a hash of its contents. Text files hash with LF
// line endings, so a Windows checkout reads the same as the release.
export function engineFiles(root = ENGINE) {
  const out = {};
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name), file = relative(root, path).split('\\').join('/');
      if (name === '.DS_Store' || file === 'manifest.json') continue;
      if (statSync(path).isDirectory()) { walk(path); continue; }
      let bytes = readFileSync(path);
      if (/\.(js|css|json|md|html|txt)$/.test(name)) bytes = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
      out[file] = createHash('sha256').update(bytes).digest('hex');
    }
  };
  walk(root);
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const version = process.argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('usage: node tools/engine-manifest.mjs <version, e.g. 0.2.0>'); process.exit(2); }
  const files = engineFiles();
  writeFileSync(join(ENGINE, 'manifest.json'), JSON.stringify({ version, files }, null, 1) + '\n');
  console.log(`engine/manifest.json: Homecraft ${version}, ${Object.keys(files).length} files`);
}
