/**
 * Quantization constraint auditing (pure, runtime-agnostic).
 *
 * These helpers never call `quantizePixels`, never touch the DOM or the
 * filesystem, and never retain palette objects or typed arrays. Every value in
 * the returned reports is a JSON-serializable primitive (number, string,
 * boolean) or a plain array/object of such primitives, so a report survives
 * `JSON.stringify` unchanged and can cross Worker / serialization boundaries.
 *
 * The normalization rules here intentionally mirror the clamping performed
 * inside `quantize.js` one-to-one:
 * - effective maxColors:
 *     Math.max(1, Math.min(Math.round(maxColors) || 1, paletteColorCount, cols * rows))
 * - effective mergeStrength: Math.max(0, Math.min(30, mergeStrength))
 * - cartoon-only post-processing (similar-color merge + maxColors cap) runs
 *   solely when processMode === 'cartoon'.
 */

export const VALID_PROCESS_MODES = Object.freeze([
  'cartoon',
  'detail',
  'document',
  'photo',
  'pixel',
]);

export const VALID_WHITE_MODES = Object.freeze(['auto', 'keep']);

const DEFAULT_MAX_COLORS = 32;
const DEFAULT_MERGE_STRENGTH = 10;
const DEFAULT_PROCESS_MODE = 'cartoon';
const DEFAULT_WHITE_MODE = 'auto';
const MERGE_STRENGTH_MAX = 30;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

/**
 * Builds one ordered check entry.
 *
 * @param {string} name Stable machine-readable check name.
 * @param {boolean} passed Whether the constraint holds.
 * @param {string} [reason] Human-readable explanation when the check fails.
 */
function makeCheck(name, passed, reason = '') {
  return { name, passed: Boolean(passed), reason: passed ? '' : String(reason) };
}

/**
 * Audits the parameter snapshot of a single quantization call.
 *
 * @param {object} snapshot
 * @param {number} snapshot.cols Requested grid columns.
 * @param {number} snapshot.rows Requested grid rows.
 * @param {number} [snapshot.maxColors=32] Requested unique-color cap.
 * @param {string} [snapshot.processMode='cartoon'] Requested processing mode.
 * @param {number} [snapshot.mergeStrength=10] Requested merge aggressiveness.
 * @param {string} [snapshot.whiteMode='auto'] Requested background handling mode.
 * @param {boolean} [snapshot.protectDark=true] Whether dark neutral colors are protected.
 * @param {number} [snapshot.paletteColorCount] Number of usable (non-transparent) palette colors.
 * @param {boolean} [snapshot.hasTransparentColor=false] Whether the full palette includes a transparent entry.
 * @returns {{valid: boolean, degraded: boolean, normalized: object, behavior: object, checks: Array<{name: string, passed: boolean, reason: string}>}}
 */
export function auditQuantizeParameters(snapshot = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const {
    cols,
    rows,
    maxColors,
    processMode,
    mergeStrength,
    whiteMode,
    protectDark,
    paletteColorCount,
    hasTransparentColor,
  } = safeSnapshot;

  const checks = [];

  // --- Dimension normalization -------------------------------------------------
  const colsValid = isPositiveInteger(cols);
  const rowsValid = isPositiveInteger(rows);
  const dimensionsValid = colsValid && rowsValid;
  const safeCols = colsValid ? cols : 0;
  const safeRows = rowsValid ? rows : 0;
  const cellCount = dimensionsValid ? safeCols * safeRows : 0;

  checks.push(makeCheck(
    'params:cols-positive-integer',
    colsValid,
    colsValid
      ? ''
      : `cols must be a positive integer, received ${JSON.stringify(cols)}; parameter flagged invalid instead of throwing`,
  ));
  checks.push(makeCheck(
    'params:rows-positive-integer',
    rowsValid,
    rowsValid
      ? ''
      : `rows must be a positive integer, received ${JSON.stringify(rows)}; parameter flagged invalid instead of throwing`,
  ));

  // --- Palette normalization --------------------------------------------------
  const paletteCountValid = isPositiveInteger(paletteColorCount);
  const safePaletteCount = paletteCountValid ? paletteColorCount : 0;
  checks.push(makeCheck(
    'params:palette-color-count-positive',
    paletteCountValid,
    paletteCountValid
      ? ''
      : `paletteColorCount must be a positive integer, received ${JSON.stringify(paletteColorCount)}; effective cap falls back to the grid cell count`,
  ));
  checks.push(makeCheck(
    'params:transparent-color-flag-boolean',
    typeof hasTransparentColor === 'boolean',
    typeof hasTransparentColor === 'boolean'
      ? ''
      : `hasTransparentColor must be a boolean, received ${JSON.stringify(hasTransparentColor)}; defaulting to false`,
  ));

  // --- maxColors normalization (mirrors quantize.js line 1443) ----------------
  // Engine: Math.max(1, Math.min(Math.round(maxColors) || 1, palette.length, grid.length))
  const maxColorsProvided = maxColors !== undefined && maxColors !== null;
  const maxColorsNumeric = isFiniteNumber(maxColors);
  const roundedMaxColors = maxColorsNumeric ? Math.round(maxColors) : DEFAULT_MAX_COLORS;
  const requestedMaxColors = maxColorsProvided && maxColorsNumeric
    ? roundedMaxColors
    : DEFAULT_MAX_COLORS;
  const upperBoundCandidates = [];
  if (paletteCountValid) upperBoundCandidates.push(safePaletteCount);
  if (dimensionsValid) upperBoundCandidates.push(cellCount);
  const upperBound = upperBoundCandidates.length
    ? Math.min(...upperBoundCandidates)
    : Number.POSITIVE_INFINITY;
  const effectiveMaxColors = Math.max(
    1,
    Math.min(requestedMaxColors, Number.isFinite(upperBound) ? upperBound : requestedMaxColors),
  );

  const maxColorsWasClamped = maxColorsProvided
    ? (!maxColorsNumeric || roundedMaxColors < 1 || roundedMaxColors > upperBound)
    : false;
  const maxColorsInRange = maxColorsProvided
    ? maxColorsNumeric && roundedMaxColors >= 1 && roundedMaxColors <= upperBound
    : true;

  let maxColorsReason = '';
  if (!maxColorsProvided) {
    maxColorsReason = `maxColors omitted; engine default of ${DEFAULT_MAX_COLORS} applies`;
  } else if (!maxColorsNumeric) {
    maxColorsReason = `maxColors must be a finite number, received ${JSON.stringify(maxColors)}; clamped to ${effectiveMaxColors}`;
  } else if (roundedMaxColors < 1) {
    maxColorsReason = `maxColors of ${String(maxColors)} is zero or negative; clamped to 1 per the [1, min(palette colors, cols*rows)] rule`;
  } else if (roundedMaxColors > upperBound) {
    maxColorsReason = `maxColors of ${roundedMaxColors} exceeds the available cap min(palette colors=${safePaletteCount || 'n/a'}, cols*rows=${cellCount || 'n/a'})=${Number.isFinite(upperBound) ? upperBound : 'n/a'}; clamped to ${effectiveMaxColors}`;
  }
  checks.push(makeCheck('params:max-colors-in-range', maxColorsInRange, maxColorsReason));

  // --- mergeStrength normalization (mirrors quantize.js line 1404) ------------
  // Engine: Math.max(0, Math.min(30, mergeStrength)); merge loop additionally
  // requires mergeStrength > 0 and processMode === 'cartoon'.
  const mergeProvided = mergeStrength !== undefined && mergeStrength !== null;
  const mergeNumeric = isFiniteNumber(mergeStrength);
  const requestedMerge = mergeProvided && mergeNumeric ? mergeStrength : DEFAULT_MERGE_STRENGTH;
  const effectiveMergeStrength = Math.max(0, Math.min(MERGE_STRENGTH_MAX, requestedMerge));
  const mergeWasClamped = mergeProvided
    ? (!mergeNumeric || mergeStrength < 0 || mergeStrength > MERGE_STRENGTH_MAX)
    : false;
  const mergeInRange = mergeProvided
    ? mergeNumeric && mergeStrength >= 0 && mergeStrength <= MERGE_STRENGTH_MAX
    : true;
  let mergeReason = '';
  if (!mergeProvided) {
    mergeReason = `mergeStrength omitted; engine default of ${DEFAULT_MERGE_STRENGTH} applies`;
  } else if (!mergeNumeric) {
    mergeReason = `mergeStrength must be a finite number, received ${JSON.stringify(mergeStrength)}; defaulted to ${effectiveMergeStrength}`;
  } else if (mergeStrength < 0) {
    mergeReason = `mergeStrength of ${String(mergeStrength)} is negative; clamped to 0 per the [0, 30] rule`;
  } else if (mergeStrength > MERGE_STRENGTH_MAX) {
    mergeReason = `mergeStrength of ${String(mergeStrength)} exceeds 30; clamped to 30 per the [0, 30] rule`;
  }
  checks.push(makeCheck('params:merge-strength-in-range', mergeInRange, mergeReason));

  // --- processMode / whiteMode / protectDark normalization --------------------
  const processModeProvided = processMode !== undefined && processMode !== null;
  const processModeValid = typeof processMode === 'string'
    && VALID_PROCESS_MODES.includes(processMode);
  const effectiveProcessMode = processModeValid
    ? processMode
    : (processModeProvided ? String(processMode) : DEFAULT_PROCESS_MODE);
  checks.push(makeCheck(
    'params:process-mode-valid',
    processModeValid,
    processModeValid
      ? ''
      : `processMode must be one of ${VALID_PROCESS_MODES.join(', ')}, received ${JSON.stringify(processMode)}; cartoon-only post-processing cannot be claimed for this value`,
  ));

  const whiteModeProvided = whiteMode !== undefined && whiteMode !== null;
  const whiteModeValid = typeof whiteMode === 'string' && VALID_WHITE_MODES.includes(whiteMode);
  const effectiveWhiteMode = whiteModeValid
    ? whiteMode
    : (whiteModeProvided ? String(whiteMode) : DEFAULT_WHITE_MODE);
  checks.push(makeCheck(
    'params:white-mode-valid',
    whiteModeValid,
    whiteModeValid
      ? ''
      : `whiteMode must be one of ${VALID_WHITE_MODES.join(', ')}, received ${JSON.stringify(whiteMode)}; defaulting to ${DEFAULT_WHITE_MODE}`,
  ));

  const protectDarkProvided = protectDark !== undefined && protectDark !== null;
  const protectDarkValid = typeof protectDark === 'boolean';
  const effectiveProtectDark = protectDarkProvided ? Boolean(protectDark) : true;
  checks.push(makeCheck(
    'params:protect-dark-boolean',
    protectDarkValid,
    protectDarkValid
      ? ''
      : `protectDark must be a boolean, received ${JSON.stringify(protectDark)}; defaulting to true`,
  ));

  // --- Cartoon-only post-processing behavior ----------------------------------
  // The similar-color merge and the hard maxColors trimming cap are applied by
  // quantizePixels only in cartoon mode. Other modes must never be reported as
  // running those cartoon stages.
  const isCartoon = processModeValid && effectiveProcessMode === 'cartoon';
  const colorMergeEnabled = isCartoon && effectiveMergeStrength > 0;
  const colorCapEnabled = isCartoon;

  if (!processModeValid) {
    checks.push(makeCheck(
      'params:cartoon-postprocessing-mode',
      false,
      `processMode ${JSON.stringify(effectiveProcessMode)} is not a recognized mode; neither color merging nor the cartoon color cap is applied`,
    ));
  } else if (!isCartoon) {
    checks.push(makeCheck(
      'params:cartoon-postprocessing-mode',
      true,
      `processMode '${effectiveProcessMode}' skips cartoon-only color merging and color-cap trimming`,
    ));
  } else {
    checks.push(makeCheck(
      'params:cartoon-postprocessing-mode',
      true,
      effectiveMergeStrength > 0
        ? 'cartoon mode applies similar-color merging followed by the maxColors cap'
        : 'cartoon mode applies the maxColors cap; mergeStrength is 0 so similar-color merging is skipped',
    ));
  }

  const degraded = Boolean(
    !dimensionsValid
      || !paletteCountValid
      || !processModeValid
      || !whiteModeValid
      || !protectDarkValid
      || maxColorsWasClamped
      || mergeWasClamped,
  );
  const valid = dimensionsValid
    && paletteCountValid
    && processModeValid
    && whiteModeValid
    && protectDarkValid
    && maxColorsInRange
    && mergeInRange;

  return {
    valid: Boolean(valid),
    degraded: Boolean(degraded),
    normalized: {
      cols: safeCols,
      rows: safeRows,
      cellCount,
      dimensionsValid: Boolean(dimensionsValid),
      paletteColorCount: safePaletteCount,
      paletteColorCountValid: Boolean(paletteCountValid),
      hasTransparentColor: Boolean(hasTransparentColor),
      maxColors: {
        requested: maxColorsProvided && maxColorsNumeric ? roundedMaxColors : DEFAULT_MAX_COLORS,
        provided: Boolean(maxColorsProvided),
        effective: effectiveMaxColors,
        wasClamped: Boolean(maxColorsWasClamped),
      },
      mergeStrength: {
        requested: requestedMerge,
        provided: Boolean(mergeProvided),
        effective: effectiveMergeStrength,
        wasClamped: Boolean(mergeWasClamped),
      },
      processMode: {
        requested: processModeProvided ? String(processMode) : DEFAULT_PROCESS_MODE,
        effective: effectiveProcessMode,
        valid: Boolean(processModeValid),
      },
      whiteMode: {
        requested: whiteModeProvided ? String(whiteMode) : DEFAULT_WHITE_MODE,
        effective: effectiveWhiteMode,
        valid: Boolean(whiteModeValid),
      },
      protectDark: {
        requested: protectDarkProvided ? Boolean(protectDark) : true,
        effective: effectiveProtectDark,
        valid: Boolean(protectDarkValid),
      },
    },
    behavior: {
      colorMergeEnabled: Boolean(colorMergeEnabled),
      colorCapEnabled: Boolean(colorCapEnabled),
      cartoonMode: Boolean(isCartoon),
    },
    checks,
  };
}

/**
 * Audits the structural consistency of a real quantizePixels result against
 * the constraints documented for the quantization engine.
 *
 * The function never recomputes quantization: it only inspects the supplied
 * result snapshot. Typed-array inputs are copied into plain arrays so the
 * returned report stays fully JSON-serializable.
 *
 * @param {object} result
 * @param {Int16Array | number[]} result.cells Flat grid values (-1 marks an empty cell).
 * @param {number[]} result.selected Palette indices ordered by descending usage.
 * @param {number} result.nonEmpty Number of non-empty cells reported by the engine.
 * @param {object} [result.diagnostics] Engine diagnostics (uses usedBeforeMerge).
 * @param {number} result.cols Grid columns.
 * @param {number} result.rows Grid rows.
 * @param {number} [result.maxColors] Cap that was in force for the run.
 * @returns {{valid: boolean, degraded: boolean, observed: object, effectiveLimit: number, checks: Array<{name: string, passed: boolean, reason: string}>}}
 */
export function auditQuantizeResult(result = {}) {
  const safeResult = result && typeof result === 'object' ? result : {};
  const {
    cells,
    selected,
    nonEmpty,
    diagnostics,
    cols,
    rows,
    maxColors,
  } = safeResult;

  const checks = [];

  // --- Input shape ------------------------------------------------------------
  const cellsIsIterable = cells !== undefined
    && cells !== null
    && (Array.isArray(cells) || typeof cells.length === 'number');
  const cellValues = cellsIsIterable ? Array.from(cells) : [];
  const selectedIsArray = Array.isArray(selected);
  const selectedValues = selectedIsArray ? selected.map((value) => value) : [];
  const colsValid = isPositiveInteger(cols);
  const rowsValid = isPositiveInteger(rows);

  checks.push(makeCheck(
    'result:cells-array',
    cellsIsIterable,
    cellsIsIterable ? '' : `cells must be an array or typed array, received ${JSON.stringify(cells === undefined ? 'undefined' : typeof cells)}`,
  ));
  checks.push(makeCheck(
    'result:selected-array',
    selectedIsArray,
    selectedIsArray ? '' : `selected must be an array of palette indices, received ${JSON.stringify(selected === undefined ? 'undefined' : typeof selected)}`,
  ));
  checks.push(makeCheck(
    'result:dimensions-positive-integer',
    colsValid && rowsValid,
    colsValid && rowsValid
      ? ''
      : `cols and rows must be positive integers, received cols=${JSON.stringify(cols)}, rows=${JSON.stringify(rows)}`,
  ));

  // --- cells length equals cols * rows ----------------------------------------
  const expectedLength = colsValid && rowsValid ? cols * rows : 0;
  const lengthMatches = colsValid && rowsValid && cellValues.length === expectedLength;
  checks.push(makeCheck(
    'result:cells-length-matches-grid',
    lengthMatches,
    lengthMatches
      ? ''
      : `cells length ${cellValues.length} does not equal cols*rows (${colsValid && rowsValid ? expectedLength : 'n/a due to invalid dimensions'})`,
  ));

  // --- selected uniqueness -----------------------------------------------------
  const duplicateIndices = [];
  const seenSelected = new Set();
  for (const index of selectedValues) {
    if (seenSelected.has(index)) {
      if (!duplicateIndices.includes(index)) duplicateIndices.push(index);
    } else {
      seenSelected.add(index);
    }
  }
  const selectedUnique = selectedIsArray && duplicateIndices.length === 0;
  checks.push(makeCheck(
    'result:selected-unique',
    selectedUnique,
    selectedUnique
      ? ''
      : `selected contains duplicate palette indices: ${duplicateIndices.map((value) => String(value)).join(', ')}`,
  ));

  // --- observed usage and non-empty count -------------------------------------
  const usage = new Map();
  let observedNonEmpty = 0;
  const outsideSelected = new Set();
  for (const value of cellValues) {
    if (value < 0) continue;
    observedNonEmpty++;
    usage.set(value, (usage.get(value) || 0) + 1);
    if (!seenSelected.has(value)) outsideSelected.add(value);
  }

  const nonEmptyValid = isFiniteNumber(nonEmpty);
  const nonEmptyMatches = nonEmptyValid && nonEmpty === observedNonEmpty;
  checks.push(makeCheck(
    'result:non-empty-count',
    nonEmptyMatches,
    nonEmptyMatches
      ? ''
      : `reported nonEmpty ${nonEmptyValid ? nonEmpty : JSON.stringify(nonEmpty)} does not match the ${observedNonEmpty} cells whose value is not -1`,
  ));

  // --- every cell index belongs to selected ------------------------------------
  const cellIndicesInSelected = outsideSelected.size === 0;
  checks.push(makeCheck(
    'result:cells-indices-in-selected',
    cellIndicesInSelected,
    cellIndicesInSelected
      ? ''
      : `cells reference palette indices absent from selected: ${Array.from(outsideSelected).map((value) => String(value)).join(', ')}`,
  ));

  // --- selected ordered by descending usage (index asc tiebreak), no repeats ---
  // Engine sort comparator (quantize.js): count desc, then palette index asc.
  let sortedCorrectly = selectedIsArray && duplicateIndices.length === 0;
  let firstSortViolation = null;
  if (sortedCorrectly) {
    for (let i = 1; i < selectedValues.length; i++) {
      const previous = selectedValues[i - 1];
      const current = selectedValues[i];
      const previousUsage = usage.get(previous) || 0;
      const currentUsage = usage.get(current) || 0;
      if (
        currentUsage > previousUsage
        || (currentUsage === previousUsage && current < previous)
      ) {
        sortedCorrectly = false;
        firstSortViolation = [previous, current];
        break;
      }
    }
  }
  checks.push(makeCheck(
    'result:selected-sorted-desc',
    sortedCorrectly,
    sortedCorrectly
      ? ''
      : duplicateIndices.length
        ? 'selected ordering cannot be verified while duplicate indices are present'
        : `selected is not ordered by descending usage; violation between indices ${firstSortViolation ? firstSortViolation.map((value) => String(value)).join(' -> ') : 'n/a'}`,
  ));

  // --- effective limit and selected length ------------------------------------
  const limitCandidates = [];
  if (isFiniteNumber(maxColors)) limitCandidates.push(Math.round(maxColors) || 1);
  if (colsValid && rowsValid) limitCandidates.push(expectedLength);
  const effectiveLimit = limitCandidates.length ? Math.max(1, Math.min(...limitCandidates)) : 1;
  const withinLimit = selectedIsArray && selectedValues.length <= effectiveLimit;
  checks.push(makeCheck(
    'result:selected-within-effective-limit',
    withinLimit,
    withinLimit
      ? ''
      : `selected length ${selectedValues.length} exceeds the effective maxColors cap of ${effectiveLimit}`,
  ));

  // --- usedBeforeMerge >= selected length --------------------------------------
  const diagnosticsValid = diagnostics !== undefined && diagnostics !== null && typeof diagnostics === 'object';
  const usedBeforeMerge = diagnosticsValid ? diagnostics.usedBeforeMerge : undefined;
  const usedBeforeMergeValid = isFiniteNumber(usedBeforeMerge) && usedBeforeMerge >= 0;
  const usedBeforeMergeCovers = usedBeforeMergeValid
    && selectedIsArray
    && usedBeforeMerge >= selectedValues.length;
  checks.push(makeCheck(
    'result:used-before-merge-covers-selected',
    usedBeforeMergeCovers,
    usedBeforeMergeCovers
      ? ''
      : !diagnosticsValid
        ? 'diagnostics object is missing; usedBeforeMerge cannot be compared against selected length'
        : !usedBeforeMergeValid
          ? `diagnostics.usedBeforeMerge must be a non-negative finite number, received ${JSON.stringify(usedBeforeMerge)}`
          : `diagnostics.usedBeforeMerge (${usedBeforeMerge}) is smaller than selected length (${selectedValues.length}); merging cannot increase color count`,
  ));

  const degraded = Boolean(
    !cellsIsIterable
      || !selectedIsArray
      || !colsValid
      || !rowsValid
      || !lengthMatches
      || !nonEmptyValid
      || !diagnosticsValid,
  );
  const valid = checks.every((check) => check.passed);

  return {
    valid: Boolean(valid),
    degraded: Boolean(degraded),
    effectiveLimit,
    observed: {
      cellsLength: cellValues.length,
      expectedLength,
      nonEmptyReported: nonEmptyValid ? nonEmpty : null,
      nonEmptyObserved: observedNonEmpty,
      selectedLength: selectedValues.length,
      selectedUnique: Boolean(selectedUnique),
      selectedSortedDescending: Boolean(sortedCorrectly),
      cellIndicesOutsideSelected: Array.from(outsideSelected).map((value) => Number(value)),
      usedBeforeMerge: usedBeforeMergeValid ? usedBeforeMerge : null,
      usage: Array.from(usage.entries())
        .map(([index, count]) => ({ index: Number(index), count: Number(count) }))
        .sort((a, b) => b.count - a.count || a.index - b.index),
    },
    checks,
  };
}
