import {
  imageTypeToExtension,
  isImageType,
} from './utilities.js';

const REGEXP_EXTENSION = /\.\w+$/;
const JPEG_MIME_TYPE = 'image/jpeg';

/**
 * The fallback reasons reported by the audit.
 * @enum {string}
 */
export const FALLBACK_REASONS = {
  STRICT: 'strict',
  CANVAS_NO_OUTPUT: 'canvas-no-output',
  NONE: 'none',
};

/**
 * The EXIF handling actions reported by the audit.
 * @enum {string}
 */
export const EXIF_ACTIONS = {
  RETAIN: 'retain',
  STRIP: 'strip',
  NONE: 'none',
};

/**
 * Check whether the given mime type is listed in `convertTypes`,
 * mirroring the `indexOf` semantics of `draw()` for both strings and arrays.
 * @param {string|string[]} convertTypes - The effective `convertTypes` option.
 * @param {string} mimeType - The mime type to look up.
 * @returns {boolean} Returns `true` when the mime type is listed.
 */
function isListedInConvertTypes(convertTypes, mimeType) {
  if (typeof convertTypes === 'string') {
    return convertTypes.indexOf(mimeType) >= 0;
  }

  return Array.isArray(convertTypes) && convertTypes.indexOf(mimeType) >= 0;
}

/**
 * Audit the output decisions of a compression run from a plain-data snapshot.
 *
 * The audit mirrors the decision logic of `draw()` and `done()` without
 * touching the DOM, canvas, disk, or network, so callers can verify—before or
 * after a run—why the original file was kept or why EXIF data was retained or
 * stripped, and what the final mime type and file name will be.
 *
 * @param {Object} snapshot - The plain-data snapshot to audit.
 * @param {Object} [snapshot.file] - The original file info.
 * @param {string} [snapshot.file.type] - The mime type of the original file.
 * @param {number} [snapshot.file.size] - The size of the original file in bytes.
 * @param {string} [snapshot.file.name] - The name of the original file.
 * @param {number} [snapshot.file.lastModified] - The modification time of the original file.
 * @param {Object|null} [snapshot.result] - The compressed result info, or `null` when the canvas produced no output.
 * @param {string} [snapshot.result.type] - The mime type of the compressed result.
 * @param {number} [snapshot.result.size] - The size of the compressed result in bytes.
 * @param {Object} [snapshot.options] - The effective options subset for the run.
 * @param {boolean} [snapshot.options.strict] - The `strict` option.
 * @param {boolean} [snapshot.options.retainExif] - The `retainExif` option.
 * @param {string} [snapshot.options.mimeType] - The `mimeType` option.
 * @param {number} [snapshot.options.width] - The `width` option.
 * @param {number} [snapshot.options.height] - The `height` option.
 * @param {number} [snapshot.options.minWidth] - The `minWidth` option.
 * @param {number} [snapshot.options.minHeight] - The `minHeight` option.
 * @param {number} [snapshot.options.maxWidth] - The `maxWidth` option.
 * @param {number} [snapshot.options.maxHeight] - The `maxHeight` option.
 * @param {string|string[]} [snapshot.options.convertTypes] - The `convertTypes` option.
 * @param {number} [snapshot.options.convertSize] - The `convertSize` option.
 * @param {number} [snapshot.naturalWidth] - The natural width of the source image.
 * @param {number} [snapshot.naturalHeight] - The natural height of the source image.
 * @returns {Object} A JSON-serializable audit report.
 */
export function auditOutput(snapshot = {}) {
  const file = snapshot.file || {};
  const result = snapshot.result || null;
  const options = snapshot.options || {};
  const issues = [];

  const fileType = typeof file.type === 'string' ? file.type : '';
  const fileName = typeof file.name === 'string' ? file.name : '';
  const fileSize = typeof file.size === 'number' ? file.size : 0;
  const { naturalWidth, naturalHeight } = snapshot;

  // Validate the snapshot; invalid inputs degrade the report instead of throwing
  if (!isImageType(fileType)) {
    issues.push({
      field: 'file.type',
      reason: `The original file type "${fileType || '(missing)'}" is not an image mime type; type-dependent decisions may not reflect a real compression run.`,
    });
  }

  if (!(fileSize >= 0)) {
    issues.push({
      field: 'file.size',
      reason: `The original file size (${file.size}) is negative or not a number; size comparisons use 0 instead.`,
    });
  }

  if (!(naturalWidth > 0)) {
    issues.push({
      field: 'naturalWidth',
      reason: `The natural width (${naturalWidth}) is not a positive number; size-related option checks are skipped.`,
    });
  }

  if (!(naturalHeight > 0)) {
    issues.push({
      field: 'naturalHeight',
      reason: `The natural height (${naturalHeight}) is not a positive number; size-related option checks are skipped.`,
    });
  }

  const safeFileSize = fileSize >= 0 ? fileSize : 0;
  const dimensionsValid = naturalWidth > 0 && naturalHeight > 0;

  const {
    strict = true,
    retainExif = false,
    mimeType = 'auto',
    width,
    height,
    minWidth = 0,
    minHeight = 0,
    maxWidth = Infinity,
    maxHeight = Infinity,
    convertTypes = [],
    convertSize = 5000000,
  } = options;

  // Resolve the output mime type the way `draw()` does
  const explicitMimeType = typeof mimeType === 'string' && isImageType(mimeType);
  let drawMimeType = explicitMimeType ? mimeType : fileType;
  const listed = isListedInConvertTypes(convertTypes, drawMimeType);
  const convertsToJpeg = !explicitMimeType && safeFileSize > convertSize && listed;

  if (convertsToJpeg) {
    drawMimeType = JPEG_MIME_TYPE;
  }

  // Evaluate the strict fallback conditions the way `done()` does
  const hasResult = result !== null && result !== undefined;
  const resultSize = hasResult && typeof result.size === 'number' ? result.size : 0;
  const resultLarger = hasResult && resultSize > safeFileSize;
  const mimeTypeUnchanged = drawMimeType === fileType;
  const sizeOptionReasons = [];

  if (dimensionsValid) {
    if (width > naturalWidth) {
      sizeOptionReasons.push(`width (${width}) is greater than the natural width (${naturalWidth})`);
    }

    if (height > naturalHeight) {
      sizeOptionReasons.push(`height (${height}) is greater than the natural height (${naturalHeight})`);
    }

    if (minWidth > naturalWidth) {
      sizeOptionReasons.push(`minWidth (${minWidth}) is greater than the natural width (${naturalWidth})`);
    }

    if (minHeight > naturalHeight) {
      sizeOptionReasons.push(`minHeight (${minHeight}) is greater than the natural height (${naturalHeight})`);
    }

    if (maxWidth < naturalWidth) {
      sizeOptionReasons.push(`maxWidth (${maxWidth}) is less than the natural width (${naturalWidth})`);
    }

    if (maxHeight < naturalHeight) {
      sizeOptionReasons.push(`maxHeight (${maxHeight}) is less than the natural height (${naturalHeight})`);
    }
  }

  const noSizeOptions = sizeOptionReasons.length === 0;
  const strictFallback = hasResult
    && strict
    && !retainExif
    && resultLarger
    && mimeTypeUnchanged
    && noSizeOptions;

  let fallbackReason = FALLBACK_REASONS.NONE;

  if (!hasResult) {
    fallbackReason = FALLBACK_REASONS.CANVAS_NO_OUTPUT;
  } else if (strictFallback) {
    fallbackReason = FALLBACK_REASONS.STRICT;
  }

  const fallbackOccurs = fallbackReason !== FALLBACK_REASONS.NONE;

  // Resolve the final output mime type and file name the way `done()` does
  const outputMimeType = fallbackOccurs ? fileType : drawMimeType;
  let outputName = fileName;

  if (!fallbackOccurs && outputName && drawMimeType !== fileType) {
    outputName = outputName.replace(REGEXP_EXTENSION, imageTypeToExtension(drawMimeType));
  }

  // Resolve the EXIF handling action
  const outputIsJpeg = outputMimeType === JPEG_MIME_TYPE;
  let exifAction;
  let exifReason;

  if (fallbackReason === FALLBACK_REASONS.CANVAS_NO_OUTPUT) {
    exifAction = EXIF_ACTIONS.NONE;
    exifReason = 'Canvas produced no output; the original file is returned untouched.';
  } else if (fallbackReason === FALLBACK_REASONS.STRICT) {
    if (fileType === JPEG_MIME_TYPE) {
      exifAction = EXIF_ACTIONS.STRIP;
      exifReason = 'The strict fallback returns the original JPEG; its EXIF data is stripped asynchronously before delivery.';
    } else {
      exifAction = EXIF_ACTIONS.NONE;
      exifReason = 'The strict fallback returns the original non-JPEG file; no EXIF handling applies.';
    }
  } else if (outputIsJpeg && retainExif) {
    if (fileType === JPEG_MIME_TYPE) {
      exifAction = EXIF_ACTIONS.RETAIN;
      exifReason = 'retainExif is enabled and the output is JPEG; the source EXIF data is re-inserted into the compressed output.';
    } else {
      exifAction = EXIF_ACTIONS.NONE;
      exifReason = 'retainExif is enabled but the source file is not JPEG; there is no EXIF data to retain.';
    }
  } else if (outputIsJpeg) {
    exifAction = EXIF_ACTIONS.STRIP;
    exifReason = 'retainExif is disabled and the output is JPEG; any EXIF data in the canvas output is stripped.';
  } else {
    exifAction = EXIF_ACTIONS.NONE;
    exifReason = `The output type (${outputMimeType || 'unknown'}) is not JPEG; no EXIF handling applies.`;
  }

  // Build the ordered check list
  const checks = [];

  checks.push({
    name: 'canvas-output',
    passed: hasResult,
    reason: hasResult ? null : 'Canvas produced no output; the original file will be returned.',
  });

  let strictCheckReason = null;

  if (!strictFallback) {
    if (!hasResult) {
      strictCheckReason = 'Canvas produced no output; the strict fallback does not apply.';
    } else if (!strict) {
      strictCheckReason = 'The strict option is disabled.';
    } else if (retainExif) {
      strictCheckReason = 'retainExif is enabled, which disables the strict fallback.';
    } else {
      const unmet = [];

      if (!resultLarger) {
        unmet.push(`the compressed result (${resultSize} bytes) is not larger than the original file (${safeFileSize} bytes)`);
      }

      if (!mimeTypeUnchanged) {
        unmet.push(`the mime type changed from "${fileType || '(unknown)'}" to "${drawMimeType}"`);
      }

      for (const reason of sizeOptionReasons) {
        unmet.push(`a size-related option is set: ${reason}`);
      }

      if (unmet.length > 0) {
        strictCheckReason = `Strict fallback conditions not met: ${unmet.join('; ')}.`;
      }
    }
  }

  checks.push({
    name: 'strict-fallback',
    passed: strictFallback,
    reason: strictCheckReason,
  });

  let conversionCheckReason = null;

  if (!convertsToJpeg) {
    if (explicitMimeType) {
      conversionCheckReason = `The mimeType option is explicitly set to "${mimeType}"; automatic conversion to JPEG is disabled.`;
    } else if (!listed) {
      conversionCheckReason = `The output type "${drawMimeType || '(unknown)'}" is not listed in convertTypes.`;
    } else {
      conversionCheckReason = `The file size (${safeFileSize} bytes) does not exceed convertSize (${convertSize} bytes).`;
    }
  }

  checks.push({
    name: 'jpeg-conversion',
    passed: convertsToJpeg,
    reason: conversionCheckReason,
  });

  checks.push({
    name: 'exif-retention',
    passed: exifAction === EXIF_ACTIONS.RETAIN,
    reason: exifAction === EXIF_ACTIONS.RETAIN ? null : exifReason,
  });

  checks.push({
    name: 'exif-strip',
    passed: exifAction === EXIF_ACTIONS.STRIP,
    reason: exifAction === EXIF_ACTIONS.STRIP ? null : exifReason,
  });

  return {
    fallback: {
      occurs: fallbackOccurs,
      reason: fallbackReason,
    },
    output: {
      mimeType: outputMimeType,
      name: outputName,
      extension: imageTypeToExtension(outputMimeType),
      typeChanged: outputMimeType !== fileType,
    },
    exif: {
      action: exifAction,
      reason: exifReason,
    },
    checks,
    degraded: issues.length > 0,
    issues,
  };
}
