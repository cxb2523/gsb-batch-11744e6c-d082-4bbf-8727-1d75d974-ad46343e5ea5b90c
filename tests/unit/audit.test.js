import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  auditQuantizeParameters,
  auditQuantizeResult,
  getPaletteProvider,
  quantizePixels,
} from '../../packages/core/src/index.js';
import { decodePng } from '../../src/adapters/png.js';

const fixturePath = path.resolve('tests/fixtures/rocket-badge.png');

/**
 * Recursively asserts that every leaf value is a JSON-serializable primitive
 * (number, string, boolean, null) nested only inside plain objects or arrays.
 */
function assertJsonSafe(value, label = 'root') {
  const visit = (node, name) => {
    const type = typeof node;
    if (node === null) {
      assert.equal(node, null, `${name} is null (allowed JSON literal)`);
      return;
    }
    if (type === 'number' || type === 'string' || type === 'boolean') return;
    if (type === 'function') assert.fail(`${name} must not contain a function`);
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${name}[${index}]`));
      return;
    }
    if (type === 'object') {
      if (ArrayBuffer.isView(node)) {
        assert.fail(`${name} must not contain a TypedArray (found ${node.constructor.name})`);
      }
      const prototype = Object.getPrototypeOf(node);
      assert.ok(
        prototype === Object.prototype || prototype === null,
        `${name} must be a plain object, found ${node.constructor?.name || typeof node}`,
      );
      for (const [key, entry] of Object.entries(node)) visit(entry, `${name}.${key}`);
      return;
    }
    assert.fail(`${name} has non-JSON type ${type}`);
  };
  visit(value, label);
}

function findCheck(report, name) {
  const check = report.checks.find((entry) => entry.name === name);
  assert.ok(check, `expected check named ${name} to exist`);
  return check;
}

test('audit happy path: rocket-badge quantization audit matches engine outputs and every check passes', () => {
  const buffer = fs.readFileSync(fixturePath);
  const imageData = decodePng(buffer);
  const provider = getPaletteProvider();
  const usablePalette = provider.colors.filter((color) => !color.isTransparent);

  const cols = 29;
  const rows = 29;
  const maxColors = 16;
  const mergeStrength = 10;

  const result = quantizePixels({
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
    cols,
    rows,
    palette: usablePalette,
    maxColors,
    processMode: 'cartoon',
    whiteMode: 'auto',
    mergeStrength,
    protectDark: true,
  });

  // --- Parameter audit -------------------------------------------------------
  const parameterAudit = auditQuantizeParameters({
    cols,
    rows,
    maxColors,
    processMode: 'cartoon',
    mergeStrength,
    whiteMode: 'auto',
    protectDark: true,
    paletteColorCount: usablePalette.length,
    hasTransparentColor: provider.colors.some((color) => color.isTransparent),
  });

  assert.equal(parameterAudit.valid, true);
  assert.equal(parameterAudit.degraded, false);
  assert.equal(parameterAudit.normalized.maxColors.effective, maxColors);
  assert.equal(parameterAudit.normalized.maxColors.wasClamped, false);
  assert.equal(parameterAudit.normalized.mergeStrength.effective, mergeStrength);
  assert.equal(parameterAudit.normalized.mergeStrength.wasClamped, false);
  assert.equal(parameterAudit.normalized.processMode.valid, true);
  assert.equal(parameterAudit.behavior.colorMergeEnabled, true);
  assert.equal(parameterAudit.behavior.colorCapEnabled, true);
  assert.ok(parameterAudit.checks.length > 0);
  for (const check of parameterAudit.checks) {
    assert.equal(check.passed, true, `parameter check ${check.name} should pass: ${check.reason}`);
    assert.equal(typeof check.name, 'string');
    assert.equal(typeof check.reason, 'string');
  }

  // --- Result audit ----------------------------------------------------------
  const resultAudit = auditQuantizeResult({
    cells: result.cells,
    selected: result.selected,
    nonEmpty: result.nonEmpty,
    diagnostics: result.diagnostics,
    cols,
    rows,
    maxColors,
  });

  assert.equal(resultAudit.valid, true);
  assert.equal(resultAudit.degraded, false);
  // Consistency: audit conclusions equal the engine's returned values.
  assert.equal(resultAudit.observed.nonEmptyObserved, result.nonEmpty);
  assert.equal(resultAudit.observed.nonEmptyReported, result.nonEmpty);
  assert.equal(resultAudit.observed.selectedLength, result.selected.length);
  assert.equal(resultAudit.effectiveLimit, maxColors);
  assert.ok(result.selected.length <= resultAudit.effectiveLimit);
  assert.ok(result.diagnostics.usedBeforeMerge >= result.selected.length);
  assert.equal(resultAudit.observed.cellsLength, cols * rows);
  assert.deepEqual(resultAudit.observed.cellIndicesOutsideSelected, []);
  for (const check of resultAudit.checks) {
    assert.equal(check.passed, true, `result check ${check.name} should pass: ${check.reason}`);
  }

  // --- Serializability -------------------------------------------------------
  assertJsonSafe(parameterAudit, 'parameterAudit');
  assertJsonSafe(resultAudit, 'resultAudit');
  const roundTripA = JSON.parse(JSON.stringify(parameterAudit));
  const roundTripB = JSON.parse(JSON.stringify(resultAudit));
  assert.deepEqual(roundTripA, parameterAudit);
  assert.deepEqual(roundTripB, resultAudit);
});

test('audit normalizes exactly like quantizePixels: maxColors clamps to [1, min(palette colors, cols*rows)]', () => {
  const tinyPalette = getPaletteProvider().colors.filter((color) => !color.isTransparent).slice(0, 5);
  const data = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;

  // Request 99 with a 5-color palette and a 3x3 grid: engine cap is min(5, 9) = 5.
  const result = quantizePixels({
    data,
    width: 4,
    height: 4,
    cols: 3,
    rows: 3,
    palette: tinyPalette,
    maxColors: 99,
    processMode: 'cartoon',
  });

  const audit = auditQuantizeParameters({
    cols: 3,
    rows: 3,
    maxColors: 99,
    processMode: 'cartoon',
    paletteColorCount: tinyPalette.length,
    hasTransparentColor: false,
  });

  assert.equal(audit.normalized.maxColors.effective, 5);
  assert.equal(audit.normalized.maxColors.wasClamped, true);
  assert.equal(findCheck(audit, 'params:max-colors-in-range').passed, false);
  assert.ok(result.selected.length <= audit.normalized.maxColors.effective);

  // mergeStrength outside [0, 30] clamps identically.
  const mergeAudit = auditQuantizeParameters({
    cols: 3,
    rows: 3,
    maxColors: 4,
    mergeStrength: 75,
    processMode: 'cartoon',
    paletteColorCount: tinyPalette.length,
  });
  assert.equal(mergeAudit.normalized.mergeStrength.effective, 30);
  assert.equal(mergeAudit.normalized.mergeStrength.wasClamped, true);

  const negativeMergeAudit = auditQuantizeParameters({
    cols: 3,
    rows: 3,
    mergeStrength: -8,
    processMode: 'cartoon',
    paletteColorCount: tinyPalette.length,
  });
  assert.equal(negativeMergeAudit.normalized.mergeStrength.effective, 0);
  assert.equal(negativeMergeAudit.behavior.colorMergeEnabled, false);
  assert.equal(negativeMergeAudit.behavior.colorCapEnabled, true);
});

test('audit negative path: duplicate selected indices are flagged with a readable reason', () => {
  const cells = new Int16Array([
    2, 2, 3,
    2, 3, 3,
    -1, -1, -1,
  ]);
  const report = auditQuantizeResult({
    cells,
    selected: [2, 3, 3], // duplicate index 3
    nonEmpty: 6,
    diagnostics: { usedBeforeMerge: 3 },
    cols: 3,
    rows: 3,
    maxColors: 8,
  });

  assert.equal(report.valid, false);
  const uniqueCheck = findCheck(report, 'result:selected-unique');
  assert.equal(uniqueCheck.passed, false);
  assert.match(uniqueCheck.reason, /duplicate/);
  assert.match(uniqueCheck.reason, /3/);
  // The non-empty count itself remains consistent.
  assert.equal(findCheck(report, 'result:non-empty-count').passed, true);
  assert.equal(findCheck(report, 'result:cells-length-matches-grid').passed, true);
  assertJsonSafe(report, 'duplicateReport');
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test('audit negative path: cells referencing indices outside selected are inconsistent', () => {
  const cells = new Int16Array([
    1, 1, 7,
    1, 7, 7,
    -1, -1, 1,
  ]);
  const report = auditQuantizeResult({
    cells,
    selected: [1], // index 7 is used by cells but missing from selected
    nonEmpty: 7,
    diagnostics: { usedBeforeMerge: 2 },
    cols: 3,
    rows: 3,
    maxColors: 8,
  });

  assert.equal(report.valid, false);
  const membershipCheck = findCheck(report, 'result:cells-indices-in-selected');
  assert.equal(membershipCheck.passed, false);
  assert.match(membershipCheck.reason, /absent from selected/);
  assert.deepEqual(report.observed.cellIndicesOutsideSelected, [7]);
  assert.equal(report.observed.nonEmptyObserved, 7);
  assertJsonSafe(report, 'outsideSelectedReport');
});

test('audit negative path: selected not ordered by descending usage is a sorting violation', () => {
  // Usage: index 4 appears 5 times, index 2 appears 3 times. Correct order is [4, 2].
  const cells = new Int16Array([
    4, 4, 4,
    4, 4, 2,
    2, 2, -1,
  ]);
  const report = auditQuantizeResult({
    cells,
    selected: [2, 4], // ascending usage: violates the descending rule
    nonEmpty: 8,
    diagnostics: { usedBeforeMerge: 2 },
    cols: 3,
    rows: 3,
    maxColors: 8,
  });

  assert.equal(report.valid, false);
  const sortCheck = findCheck(report, 'result:selected-sorted-desc');
  assert.equal(sortCheck.passed, false);
  assert.match(sortCheck.reason, /descending usage/);
  // The same data in the correct order passes.
  const fixed = auditQuantizeResult({
    cells,
    selected: [4, 2],
    nonEmpty: 8,
    diagnostics: { usedBeforeMerge: 2 },
    cols: 3,
    rows: 3,
    maxColors: 8,
  });
  assert.equal(findCheck(fixed, 'result:selected-sorted-desc').passed, true);
  assert.equal(fixed.valid, true);
});

test('audit negative path: selected over the effective limit and nonEmpty mismatch are reported', () => {
  const cells = new Int16Array([1, 2, 3, 4]);
  const report = auditQuantizeResult({
    cells,
    selected: [1, 2, 3, 4],
    nonEmpty: 99, // deliberately wrong
    diagnostics: { usedBeforeMerge: 2 }, // smaller than selected length
    cols: 2,
    rows: 2,
    maxColors: 3,
  });

  assert.equal(findCheck(report, 'result:selected-within-effective-limit').passed, false);
  assert.equal(report.effectiveLimit, 3);
  assert.equal(findCheck(report, 'result:non-empty-count').passed, false);
  assert.equal(report.observed.nonEmptyObserved, 4);
  assert.equal(findCheck(report, 'result:used-before-merge-covers-selected').passed, false);
});

test('audit boundary: maxColors=0 clamps to 1 and flags the clamp without throwing', () => {
  const audit = auditQuantizeParameters({
    cols: 4,
    rows: 4,
    maxColors: 0,
    processMode: 'cartoon',
    mergeStrength: 10,
    paletteColorCount: 20,
    hasTransparentColor: true,
  });

  assert.equal(audit.normalized.maxColors.effective, 1);
  assert.equal(audit.normalized.maxColors.wasClamped, true);
  const rangeCheck = findCheck(audit, 'params:max-colors-in-range');
  assert.equal(rangeCheck.passed, false);
  assert.match(rangeCheck.reason, /clamped to 1/);
  assert.equal(audit.degraded, true);
  // The rest of the snapshot still normalizes cleanly.
  assert.equal(findCheck(audit, 'params:cols-positive-integer').passed, true);
  assertJsonSafe(audit, 'zeroMaxColors');
});

test('audit boundary: non-positive cols/rows mark parameters invalid instead of throwing', () => {
  const zeroCols = auditQuantizeParameters({
    cols: 0,
    rows: 8,
    maxColors: 12,
    processMode: 'cartoon',
    paletteColorCount: 10,
  });
  assert.equal(findCheck(zeroCols, 'params:cols-positive-integer').passed, false);
  assert.equal(zeroCols.normalized.dimensionsValid, false);
  assert.equal(zeroCols.valid, false);
  assert.equal(zeroCols.degraded, true);
  // With a degenerate grid the cell-count bound is unavailable, so the palette
  // count remains the only upper bound and the requested cap still clamps to it.
  assert.equal(zeroCols.normalized.maxColors.effective, 10);

  const negativeRows = auditQuantizeParameters({
    cols: 8,
    rows: -3,
    maxColors: 12,
    processMode: 'cartoon',
    paletteColorCount: 10,
  });
  assert.equal(findCheck(negativeRows, 'params:rows-positive-integer').passed, false);
  assert.equal(negativeRows.valid, false);

  const fractional = auditQuantizeParameters({
    cols: 2.5,
    rows: 8,
    paletteColorCount: 10,
  });
  assert.equal(findCheck(fractional, 'params:cols-positive-integer').passed, false);

  // Result audit with mismatched dimensions also degrades rather than throws.
  const resultReport = auditQuantizeResult({
    cells: new Int16Array([1, 2, 3]),
    selected: [1, 2, 3],
    nonEmpty: 3,
    diagnostics: { usedBeforeMerge: 3 },
    cols: 0,
    rows: 0,
  });
  assert.equal(findCheck(resultReport, 'result:dimensions-positive-integer').passed, false);
  assert.equal(findCheck(resultReport, 'result:cells-length-matches-grid').passed, false);
  assert.equal(resultReport.degraded, true);
});

test('audit boundary: illegal processMode degrades readably and never claims cartoon merge or cap', () => {
  const audit = auditQuantizeParameters({
    cols: 4,
    rows: 4,
    maxColors: 8,
    processMode: 'watercolor',
    mergeStrength: 10,
    paletteColorCount: 20,
  });

  assert.equal(audit.normalized.processMode.valid, false);
  assert.equal(audit.normalized.processMode.effective, 'watercolor');
  assert.equal(findCheck(audit, 'params:process-mode-valid').passed, false);
  assert.equal(audit.behavior.colorMergeEnabled, false);
  assert.equal(audit.behavior.colorCapEnabled, false);
  assert.equal(audit.behavior.cartoonMode, false);
  assert.equal(audit.valid, false);
  assert.equal(audit.degraded, true);

  // photo / detail / pixel modes must never report cartoon-only stages.
  for (const mode of ['photo', 'detail', 'pixel', 'document']) {
    const modeAudit = auditQuantizeParameters({
      cols: 4,
      rows: 4,
      maxColors: 8,
      processMode: mode,
      mergeStrength: 10,
      paletteColorCount: 20,
    });
    assert.equal(modeAudit.normalized.processMode.valid, true, `${mode} is a known mode`);
    assert.equal(modeAudit.behavior.colorMergeEnabled, false, `${mode} must not claim cartoon merging`);
    assert.equal(modeAudit.behavior.colorCapEnabled, false, `${mode} must not claim cartoon color-cap trimming`);
  }
});

test('audit robustness: missing or malformed snapshots never throw and stay JSON-serializable', () => {
  assert.doesNotThrow(() => auditQuantizeParameters());
  assert.doesNotThrow(() => auditQuantizeParameters(null));
  assert.doesNotThrow(() => auditQuantizeParameters({}));
  assert.doesNotThrow(() => auditQuantizeResult());
  assert.doesNotThrow(() => auditQuantizeResult(null));
  assert.doesNotThrow(() => auditQuantizeResult({}));

  const emptyParamAudit = auditQuantizeParameters({});
  assert.equal(emptyParamAudit.valid, false);
  assert.equal(emptyParamAudit.degraded, true);
  // No palette or grid bounds are available, so the engine default 32 stands,
  // still clamped to a minimum of 1 by the max(1, ...) normalization rule.
  assert.equal(emptyParamAudit.normalized.maxColors.effective, 32);
  assert.equal(emptyParamAudit.normalized.mergeStrength.effective, 10);
  assert.equal(emptyParamAudit.normalized.processMode.effective, 'cartoon');

  const emptyResultAudit = auditQuantizeResult({});
  assert.equal(emptyResultAudit.valid, false);
  assert.equal(emptyResultAudit.observed.nonEmptyObserved, 0);
  assert.equal(emptyResultAudit.observed.selectedLength, 0);
  assert.equal(emptyResultAudit.effectiveLimit, 1);

  // Plain-array cells (no TypedArray retained) must also work and serialize.
  const plainArrayReport = auditQuantizeResult({
    cells: [0, 0, -1, 5],
    selected: [0, 5],
    nonEmpty: 3,
    diagnostics: { usedBeforeMerge: 2 },
    cols: 2,
    rows: 2,
    maxColors: 4,
  });
  assert.equal(plainArrayReport.valid, true);
  assert.deepEqual(JSON.parse(JSON.stringify(plainArrayReport)), plainArrayReport);

  for (const report of [emptyParamAudit, emptyResultAudit, plainArrayReport]) {
    assertJsonSafe(report, 'robustnessReport');
    assert.equal(typeof JSON.stringify(report), 'string');
  }
});
