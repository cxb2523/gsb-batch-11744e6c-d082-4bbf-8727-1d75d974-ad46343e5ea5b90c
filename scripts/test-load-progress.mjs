// Standalone verification of the snapshot rules. Imports the TS source via a
// tiny inline re-implementation guard: we instead compile the real module on
// the fly with esbuild (already a project dependency).
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(here, '.tmp-load-progress-test');
mkdirSync(outDir, { recursive: true });
const entry = resolve(outDir, 'entry.mjs');

await build({
    entryPoints: [resolve(root, 'src/reall3d/modeldata/LoadProgress.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: entry,
    logLevel: 'silent',
});

const { buildLoadProgress, emptyLoadProgress } = await import(pathToFileURL(entry).href);

// Minimal local copy of the ModelStatus numeric ordering (enum is not exported
// as runtime value through this isolated build path's const-enum behavior).
const ModelStatus = {
    FetchReady: 0,
    Fetching: 1,
    FetchDone: 2,
    FetchAborted: 3,
    FetchFailed: 4,
    Invalid: 5,
};

let failures = 0;
const check = (name, cond, detail) => {
    if (cond) {
        console.log('PASS', name);
    } else {
        failures++;
        console.error('FAIL', name, detail ?? '');
    }
};

const isClean = p =>
    Number.isFinite(p.progress) &&
    p.progress >= 0 &&
    p.progress <= 100 &&
    [p.downloadSize, p.fileSize, p.dataSplatCount, p.modelSplatCount].every(n => Number.isFinite(n) && n >= 0);

// 1. Empty snapshot
const empty = emptyLoadProgress();
check('empty snapshot', empty.status === 'FetchReady' && empty.progress === 0 && isClean(empty), empty);

// 2. Point-based progress (known total): 250/1000 -> 25
const pointBased = buildLoadProgress(ModelStatus.Fetching, 8000, 32000, 250, 1000);
check('point-based progress 25%', pointBased.progress === 25 && pointBased.status === 'Fetching' && isClean(pointBased), pointBased);

// 3. Byte-based fallback (total points unknown, -1): 16000/32000 -> 50
const byteBased = buildLoadProgress(ModelStatus.Fetching, 16000, 32000, 0, -1);
check('byte-based fallback 50%', byteBased.progress === 50 && byteBased.modelSplatCount === 0 && isClean(byteBased), byteBased);

// 4. Both unknown -> 0
const noneKnown = buildLoadProgress(ModelStatus.FetchReady, 0, 0, 0, -1);
check('both unknown -> 0', noneKnown.progress === 0 && isClean(noneKnown), noneKnown);

// 5. Abort: parsed points never exceed total, progress <= 100
const aborted = buildLoadProgress(ModelStatus.FetchAborted, 6400, 32000, 200, 1000);
check('abort status + 20%', aborted.status === 'FetchAborted' && aborted.progress === 20 && isClean(aborted), aborted);

// 6. Done at full count -> 100
const done = buildLoadProgress(ModelStatus.FetchDone, 32000, 32000, 1000, 1000);
check('done -> 100', done.progress === 100 && done.status === 'FetchDone', done);

// 7. Defensive: garbage/NaN/Infinity/negative inputs never leak through
const garbage = buildLoadProgress(ModelStatus.Fetching, NaN, Infinity, -50, undefined);
check('garbage inputs sanitized', garbage.progress === 0 && isClean(garbage), garbage);

// 8. Over-shoot clamped to 100 (e.g. counters momentarily ahead)
const over = buildLoadProgress(ModelStatus.Fetching, 99999, 32000, 1200, 1000);
check('overshoot clamped 100', over.progress === 100 && over.dataSplatCount === 1200 && over.modelSplatCount === 1000, over);

// 9. Failed path retains byte progress via fallback when points unknown
const failed = buildLoadProgress(ModelStatus.FetchFailed, 12000, 32000, 0, -1);
check('failed status with byte progress', failed.status === 'FetchFailed' && failed.progress === 37.5, failed);

// 10. Status name strings are exactly the enum keys
const expectedNames = ['FetchReady', 'Fetching', 'FetchDone', 'FetchAborted', 'FetchFailed', 'Invalid'];
const namesOk = expectedNames.every((name, idx) => buildLoadProgress(idx, 0, 0, 0, 0).status === name);
check('status names match ModelStatus keys', namesOk);

rmSync(outDir, { recursive: true, force: true });

if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nAll load-progress snapshot checks passed.');
