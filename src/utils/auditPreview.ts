import { findThumbnail } from './findThumbnail';
import {
  HEATMAP_HEIGHT,
  HEATMAP_WIDTH,
  getHeatmapPath,
} from './getHeatmapPath';
import { PreviewThumbnail, parseThumbnailsVtt } from './parseThumbnailsVtt';

/**
 * Pure, explainable audit of the preview-thumbnail and heatmap pipelines.
 * No network, no DOM, no globals — every output is JSON-serializable data.
 */

export type ThumbnailHitReason =
  'hit' | 'gap' | 'out-of-range' | 'no-cues' | 'no-thumbnails';

const HIT_REASON_TEXT: Record<ThumbnailHitReason, string> = {
  hit: 'query time falls inside a cue range',
  gap: 'query time falls in a gap between cue ranges',
  'out-of-range': 'query time is outside all cue ranges',
  'no-cues': 'no cues were parsed from the VTT text',
  'no-thumbnails':
    'no thumbnail data available (not provided or not loaded yet)',
};

export interface ThumbnailRangeAudit {
  fromMs: number;
  toMs: number;
  url: string;
  /** True when the cue payload carried a `#xywh=` sprite fragment. */
  hasXywh: boolean;
}

export interface SkippedCueAudit {
  /** Index of the blank-line-separated block in the VTT text. */
  blockIndex: number;
  timingLine: string;
  reason: string;
}

export interface ThumbnailHitAudit {
  hasThumbnails: boolean;
  /** Number of cues that parsed successfully. */
  totalCues: number;
  /** Parsed cue ranges, sorted by `fromMs`. */
  ranges: ThumbnailRangeAudit[];
  /** The cue `findThumbnail` returns for the query time, or null. */
  hit: PreviewThumbnail | null;
  reason: ThumbnailHitReason;
  reasonText: string;
}

export interface VttAudit extends ThumbnailHitAudit {
  /** Number of cue blocks (with a timing line) that were skipped. */
  skippedCount: number;
  skipped: SkippedCueAudit[];
  /** Cue blocks carrying a `-->` timing line: totalCues + skippedCount. */
  timedBlockCount: number;
}

export interface HeatmapPointAudit {
  index: number;
  /** Horizontal coordinate: round((index + 0.5) * step), step = width / count. */
  x: number;
  /** Normalized height: round((value / maxValue) * HEATMAP_HEIGHT). */
  height: number;
  /** SVG y coordinate used by getHeatmapPath: HEATMAP_HEIGHT - height. */
  y: number;
}

export interface HeatmapAudit {
  valueCount: number;
  /** Values that are finite and greater than zero. */
  validCount: number;
  /** Values coerced to zero (non-finite or <= 0). */
  zeroedCount: number;
  /** Maximum of the sanitized values, used for normalization. */
  maxValue: number;
  /** True exactly when getHeatmapPath(values) returns an empty string. */
  emptyPath: boolean;
  width: number;
  height: number;
  points: HeatmapPointAudit[];
}

export interface SliderAudit {
  timeMs: number;
  thumbnails: ThumbnailHitAudit;
  heatmap: HeatmapAudit;
}

// Mirrors the (unexported) timestamp parsing in parseThumbnailsVtt so the
// audit can classify skipped cue blocks exactly the way the parser does.
const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/;

const parseTimestamp = (value: string): number => {
  const match = TIMESTAMP.exec(value.trim().split(/\s+/)[0]);

  if (!match) {
    return NaN;
  }

  const [, hh = '0', mm, ss, ms] = match;

  return ((+hh * 60 + +mm) * 60 + +ss) * 1000 + +ms;
};

const round = (value: number): number => Math.round(value * 100) / 100;

const buildHitAudit = (
  thumbnails: PreviewThumbnail[] | undefined,
  timeMs: number
): ThumbnailHitAudit => {
  if (!thumbnails) {
    return {
      hasThumbnails: false,
      totalCues: 0,
      ranges: [],
      hit: null,
      reason: 'no-thumbnails',
      reasonText: HIT_REASON_TEXT['no-thumbnails'],
    };
  }

  const ranges = thumbnails.map((thumbnail) => ({
    fromMs: thumbnail.fromMs,
    toMs: thumbnail.toMs,
    url: thumbnail.url,
    hasXywh: thumbnail.x !== undefined,
  }));

  const found = findThumbnail(thumbnails, timeMs);
  const hit = found ? { ...found } : null;

  let reason: ThumbnailHitReason;

  if (hit) {
    reason = 'hit';
  } else if (!thumbnails.length) {
    reason = 'no-cues';
  } else if (
    timeMs < thumbnails[0].fromMs ||
    timeMs > thumbnails[thumbnails.length - 1].toMs
  ) {
    reason = 'out-of-range';
  } else {
    reason = 'gap';
  }

  return {
    hasThumbnails: thumbnails.length > 0,
    totalCues: thumbnails.length,
    ranges,
    hit,
    reason,
    reasonText: HIT_REASON_TEXT[reason],
  };
};

/**
 * Audits already parsed (or not yet loaded) thumbnails against a query time.
 * This is what the `VideoSeekSlider` ref channel uses.
 */
export function auditThumbnailList(
  thumbnails: PreviewThumbnail[] | undefined,
  timeMs: number
): ThumbnailHitAudit {
  return buildHitAudit(thumbnails, timeMs);
}

/**
 * Audits a WebVTT thumbnails text: parses it with `parseThumbnailsVtt`,
 * explains every skipped cue block, and looks up `timeMs` with
 * `findThumbnail`, so the reported hit always matches the runtime behavior.
 */
export function auditPreviewThumbnails(
  vtt: string,
  timeMs: number,
  baseUrl?: string
): VttAudit {
  const thumbnails = parseThumbnailsVtt(vtt, baseUrl);
  const hitAudit = buildHitAudit(thumbnails, timeMs);

  const skipped: SkippedCueAudit[] = [];
  let timedBlockCount = 0;
  const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/);

  blocks.forEach((block, blockIndex) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const timingIndex = lines.findIndex((line) => line.includes('-->'));

    if (timingIndex === -1) {
      return;
    }

    timedBlockCount += 1;

    const timingLine = lines[timingIndex];
    const payload = lines[timingIndex + 1];

    if (!payload) {
      skipped.push({
        blockIndex,
        timingLine,
        reason: 'cue has a timing line but no image URL payload',
      });
      return;
    }

    const [start, end] = timingLine.split('-->');

    if (
      Number.isNaN(parseTimestamp(start)) ||
      Number.isNaN(parseTimestamp(end))
    ) {
      skipped.push({
        blockIndex,
        timingLine,
        reason: `unparseable timestamp in timing line "${timingLine}"`,
      });
    }
  });

  return {
    ...hitAudit,
    skippedCount: skipped.length,
    skipped,
    timedBlockCount,
  };
}

/**
 * Audits heatmap values the way `getHeatmapPath` sees them: which values
 * survive sanitizing, what they are normalized against, whether the path
 * comes out empty, and where each point lands.
 */
export function auditHeatmap(
  values: number[],
  targetWidth: number = HEATMAP_WIDTH
): HeatmapAudit {
  const safeValues = values.map((value) =>
    Number.isFinite(value) && value > 0 ? value : 0
  );
  const maxValue = safeValues.reduce((max, value) => Math.max(max, value), 0);
  const validCount = safeValues.filter((value) => value > 0).length;
  const emptyPath = getHeatmapPath(values) === '';

  const points: HeatmapPointAudit[] = emptyPath
    ? []
    : safeValues.map((value, index) => {
        const step = targetWidth / safeValues.length;
        const height = round((value / maxValue) * HEATMAP_HEIGHT);

        return {
          index,
          x: round((index + 0.5) * step),
          height,
          y: round(HEATMAP_HEIGHT - (value / maxValue) * HEATMAP_HEIGHT),
        };
      });

  return {
    valueCount: values.length,
    validCount,
    zeroedCount: values.length - validCount,
    maxValue,
    emptyPath,
    width: targetWidth,
    height: HEATMAP_HEIGHT,
    points,
  };
}
