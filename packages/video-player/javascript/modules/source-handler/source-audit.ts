import {
  prepareSource,
  preparePosterSrc,
  prepareSeekThumbnailVttSrc,
  prepareChaptersVttSrc,
  resolveSourceUrlAndTransformations,
  isTransformationAllowedWithABS,
} from '../../utils';
import { validateRemoteTextTrackOptions } from '../subtitles/subtitles';
import { languageCodes } from '../../interfaces';
import type {
  IKPlayerOptions,
  SourceOptions,
  Transformation,
  RemoteTextTrackOptions,
} from '../../interfaces';

/**
 * Pure-data snapshot of a text track entry. Functions are stripped by the
 * snapshot builder so an audit report is always JSON-serializable.
 */
export interface TextTrackSnapshot {
  [key: string]: unknown;
}

/**
 * Pure-data snapshot of the source under audit. A plain string source is
 * normalized to `{ src: string }`; object sources keep only the data fields
 * the real preparation pipeline reads.
 */
export interface SourceSnapshot {
  src?: string;
  abs?: SourceOptions['abs'];
  transformation?: Transformation[];
  poster?: SourceOptions['poster'];
  chapters?: SourceOptions['chapters'];
  textTracks?: TextTrackSnapshot[];
  [key: string]: unknown;
}

/**
 * Pure-data snapshot of the global player options. `signerFn` is represented
 * by a boolean (`hasSignerFn`) because functions cannot cross a serialization
 * boundary; when a deterministic signer is needed for URL comparison it is
 * passed separately to {@link auditSourcePreparation}.
 */
export interface GlobalOptionsSnapshot {
  imagekitId?: string;
  abs?: IKPlayerOptions['abs'];
  transformation?: Transformation[];
  seekThumbnails?: boolean;
  hasSignerFn?: boolean;
  [key: string]: unknown;
}

/** Input bundle of a single source-preparation audit run. */
export interface SourceAuditInput {
  /** Original source: a URL string or a pure-data SourceOptions-like object. */
  source: string | SourceSnapshot | null | undefined;
  /** Global player options snapshot (no function references). */
  globalOptions: GlobalOptionsSnapshot;
  /** Whether the effective configuration is in ABS mode. */
  absMode: boolean;
}

/** One ordered check in the audit checklist. */
export interface SourceAuditCheck {
  /** Stable machine-readable check name. */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Whether the check is applicable to the current snapshot. */
  applicable: boolean;
  /** Human-readable failure reason; null when the check passed. */
  reason: string | null;
}

/** Per-text-track validation outcome, mirroring validateRemoteTextTrackOptions. */
export interface TextTrackAuditResult {
  /** Zero-based index of the track in `source.textTracks`. */
  index: number;
  /** True when the real validateRemoteTextTrackOptions does not throw. */
  passed: boolean;
  /** Error message of the thrown validation error; null when valid. */
  reason: string | null;
}

/** The structured, JSON-serializable result of a source-preparation audit. */
export interface SourceAuditReport {
  /** False when no audit could be performed (e.g. no source present). */
  auditable: boolean;
  /** Why the audit cannot be performed; null when auditable. */
  notAuditableReason: string | null;
  /** Effective ABS mode taken from the input snapshot. */
  absMode: boolean;
  /** Whether ABS was rejected because of forbidden transformation parameters. */
  absRejected: boolean;
  /** Forbidden parameter names that triggered the ABS rejection. */
  absRejectionReasons: string[];
  /** Error message produced by the real resolver when it throws; null otherwise. */
  resolutionError: string | null;
  /** Final video URL as returned by the real prepareSource pipeline (after ikBuild and optional signing). */
  finalVideoUrl: string | null;
  /**
   * Video URL (with ABS suffix and tr handling) as returned by the real
   * resolveSourceUrlAndTransformations, before ikBuild; null when it throws.
   */
  resolvedVideoUrl: string | null;
  /** Final transformation array, item-by-item equal to the real resolver's output. */
  finalTransformation: Transformation[];
  /** Poster URL equal to a real preparePosterSrc call; null when unavailable/failed. */
  posterUrl: string | null;
  /** Seek-thumbnail VTT URL equal to a real prepareSeekThumbnailVttSrc call; null when unavailable/failed. */
  seekThumbnailVttUrl: string | null;
  /** Chapters VTT URL equal to a real prepareChaptersVttSrc base URL; null when unavailable/failed/not applicable. */
  chaptersVttUrl: string | null;
  /** Translated chapter URLs keyed by lowercased langCode, equal to a real prepareChaptersVttSrc call. */
  chapterTranslatedUrls: Record<string, string>;
  /** Per-track text-track validation outcomes. */
  textTrackChecks: TextTrackAuditResult[];
  /** Ordered checklist. */
  checks: SourceAuditCheck[];
}

/**
 * Long parameter names corresponding to the short names rejected by
 * isTransformationAllowedWithABS (w, h, ar, f, vc, ac, q).
 */
const FORBIDDEN_PARAM_SHORT_TO_LONG: Record<string, string> = {
  w: 'width',
  h: 'height',
  ar: 'aspectRatio',
  f: 'format',
  vc: 'videoCodec',
  ac: 'audioCodec',
  q: 'quality',
};

const FORBIDDEN_OBJECT_PROPS: Array<{ prop: keyof Transformation; name: string }> = [
  { prop: 'width', name: 'width' },
  { prop: 'height', name: 'height' },
  { prop: 'aspectRatio', name: 'aspectRatio' },
  { prop: 'format', name: 'format' },
  { prop: 'videoCodec', name: 'videoCodec' },
  { prop: 'audioCodec', name: 'audioCodec' },
  { prop: 'quality', name: 'quality' },
];

const FORBIDDEN_RAW_PARAM = /\b(?:w|h|ar|f|vc|ac|q)-/;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Collects the forbidden parameter names present in a transformation array.
 * The membership decision is identical to isTransformationAllowedWithABS:
 * object properties width/height/aspectRatio/format/videoCodec/audioCodec/
 * quality and raw-string short params w/h/ar/f/vc/ac/q.
 */
export function collectForbiddenAbsParams(
  transformations: Transformation[]
): string[] {
  const found: string[] = [];
  const add = (name: string) => {
    if (!found.includes(name)) found.push(name);
  };

  for (const step of transformations) {
    for (const { prop, name } of FORBIDDEN_OBJECT_PROPS) {
      if (step[prop] !== undefined) add(name);
    }

    if (typeof step.raw === 'string' && FORBIDDEN_RAW_PARAM.test(step.raw)) {
      const matches = step.raw.match(/\b(?:w|h|ar|f|vc|ac|q)(?=-)/g) ?? [];
      for (const short of matches) {
        add(FORBIDDEN_PARAM_SHORT_TO_LONG[short] ?? short);
      }
    }
  }

  return found;
}

/**
 * Deep-clones a JSON-compatible value, dropping functions, symbols and other
 * non-serializable entries. Used so an audit never leaks function references
 * or mutates caller-owned objects.
 */
function toPlainData<T>(value: T): T {
  if (value === undefined || typeof value === 'function') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeSource(
  source: string | SourceSnapshot | null | undefined
): SourceSnapshot | null {
  if (source === null || source === undefined) return null;
  if (typeof source === 'string') {
    return source.trim() === '' ? {} : { src: source };
  }
  const snapshot: SourceSnapshot = {};
  if (typeof source.src === 'string') snapshot.src = source.src;
  if (source.abs !== undefined) snapshot.abs = toPlainData(source.abs);
  if (source.transformation !== undefined) {
    snapshot.transformation = toPlainData(source.transformation);
  }
  if (source.poster !== undefined) snapshot.poster = toPlainData(source.poster);
  if (source.chapters !== undefined) snapshot.chapters = toPlainData(source.chapters);
  if (source.textTracks !== undefined) {
    snapshot.textTracks = toPlainData(source.textTracks);
  }
  return snapshot;
}

/**
 * Builds a pure-data audit snapshot from live plugin state.
 *
 * @param source the current source (string or SourceOptions-like), or null
 * @param globalOptions the live IKPlayerOptions; only data fields are retained
 * @param absMode whether the effective configuration is in ABS mode
 */
export function buildSourceAuditSnapshot(
  source: string | SourceOptions | SourceSnapshot | null | undefined,
  globalOptions: IKPlayerOptions | GlobalOptionsSnapshot,
  absMode: boolean
): SourceAuditInput {
  const optionsSnapshot: GlobalOptionsSnapshot = {
    imagekitId: globalOptions.imagekitId,
    abs: toPlainData(globalOptions.abs),
    transformation: toPlainData(globalOptions.transformation),
    seekThumbnails: globalOptions.seekThumbnails,
    hasSignerFn: typeof (globalOptions as IKPlayerOptions).signerFn === 'function',
  };

  return {
    source: normalizeSource(source as string | SourceSnapshot | null | undefined),
    globalOptions: optionsSnapshot,
    absMode,
  };
}

/**
 * Performs a source-preparation audit against a pure-data snapshot.
 *
 * The audit reuses the real preparation functions
 * (resolveSourceUrlAndTransformations, prepareSource, preparePosterSrc,
 * prepareSeekThumbnailVttSrc, prepareChaptersVttSrc and
 * validateRemoteTextTrackOptions) inside try/catch boundaries, so every URL,
 * transformation array and validation verdict is item-by-item equal to a real
 * pipeline call with the same inputs. It performs no network requests, creates
 * no DOM nodes, reads no window/document state and mutates no global state.
 *
 * @param input the source/options/absMode snapshot
 * @param signerFn optional deterministic signer; invoked only when
 *   `input.globalOptions.hasSignerFn` is true. Never embedded in the output.
 * @returns a JSON-serializable structured audit report (never throws).
 */
export async function auditSourcePreparation(
  input: SourceAuditInput,
  signerFn?: (src: string) => Promise<string>
): Promise<SourceAuditReport> {
  const checks: SourceAuditCheck[] = [];
  const addCheck = (
    name: string,
    passed: boolean,
    applicable: boolean,
    reason: string | null
  ): void => {
    checks.push({ name, passed, applicable, reason });
  };

  const baseReport: SourceAuditReport = {
    auditable: false,
    notAuditableReason: null,
    absMode: input.absMode === true,
    absRejected: false,
    absRejectionReasons: [],
    resolutionError: null,
    finalVideoUrl: null,
    resolvedVideoUrl: null,
    finalTransformation: [],
    posterUrl: null,
    seekThumbnailVttUrl: null,
    chaptersVttUrl: null,
    chapterTranslatedUrls: {},
    textTrackChecks: [],
    checks,
  };

  try {
    const sourceSnapshot = normalizeSource(input.source);
    const optionsSnapshot = toPlainData(input.globalOptions ?? {});

    // Options object handed to the real pipeline functions. The signer is
    // attached separately so the snapshot itself stays function-free.
    const pipelineOptions: IKPlayerOptions = {
      ...(optionsSnapshot as IKPlayerOptions),
    };
    const effectiveSigner =
      optionsSnapshot.hasSignerFn === true && typeof signerFn === 'function'
        ? signerFn
        : undefined;
    if (effectiveSigner) {
      pipelineOptions.signerFn = effectiveSigner;
    }

    const sourceObj: SourceOptions = {
      ...(sourceSnapshot ?? {}),
    } as SourceOptions;

    const hasSourceObject = sourceSnapshot !== null;
    const srcUrl =
      hasSourceObject && typeof sourceSnapshot!.src === 'string'
        ? sourceSnapshot!.src
        : '';
    const hasSourceUrl = srcUrl.trim() !== '';

    // ── Check 1: a source URL must be present ──────────────────────────────
    addCheck(
      'source-url-present',
      hasSourceObject && hasSourceUrl,
      true,
      !hasSourceObject
        ? 'No source was provided; source preparation cannot be audited.'
        : !hasSourceUrl
          ? 'Source `src` is missing or empty; a source URL is required.'
          : null
    );

    // ── Check 2: imagekitId must be a non-empty string ─────────────────────
    const imagekitIdValid =
      typeof optionsSnapshot.imagekitId === 'string' &&
      optionsSnapshot.imagekitId.trim() !== '';
    addCheck(
      'imagekit-id-present',
      imagekitIdValid,
      true,
      imagekitIdValid
        ? null
        : '`imagekitId` is required and must be a non-empty string; the plugin cannot initialize without it.'
    );

    // Effective transformation list, matching resolveSourceUrlAndTransformations:
    // source-level transformation wins, otherwise the global one (or []).
    const existingTransforms: Transformation[] =
      hasSourceObject && Array.isArray(sourceSnapshot!.transformation)
        ? (sourceSnapshot!.transformation as Transformation[])
        : Array.isArray(optionsSnapshot.transformation)
          ? (optionsSnapshot.transformation as Transformation[])
          : [];

    // ── Check 3: ABS vs forbidden transformation parameters ───────────────
    const forbiddenParams = input.absMode === true
      ? collectForbiddenAbsParams(existingTransforms)
      : [];
    const absAllowed =
      input.absMode !== true || isTransformationAllowedWithABS(existingTransforms);
    baseReport.absRejected = !absAllowed;
    baseReport.absRejectionReasons = forbiddenParams;
    addCheck(
      'abs-transformations-allowed',
      absAllowed,
      input.absMode === true,
      absAllowed
        ? null
        : `ABS cannot be combined with transformation parameter(s): ${forbiddenParams.join(', ') || 'w, h, ar, f, vc, ac, q'}.`
    );

    // ── Text-track validation (real validateRemoteTextTrackOptions) ────────
    const textTracks: TextTrackSnapshot[] = Array.isArray(sourceSnapshot?.textTracks)
      ? sourceSnapshot!.textTracks!
      : [];
    baseReport.textTrackChecks = textTracks.map((track, index) => {
      try {
        validateRemoteTextTrackOptions(track as RemoteTextTrackOptions);
        return { index, passed: true, reason: null };
      } catch (err) {
        return { index, passed: false, reason: errorMessage(err) };
      }
    });

    // ── Check 4: autoGenerate must not coexist with src/kind/srclang ───────
    const autoConflictTrack = baseReport.textTrackChecks.find((_, i) => {
      const track = textTracks[i] as Record<string, unknown>;
      return (
        track &&
        track.autoGenerate === true &&
        ('src' in track || 'kind' in track || 'srclang' in track)
      );
    });
    const autoConflictApplicable = textTracks.some(
      track => (track as Record<string, unknown>).autoGenerate === true
    );
    addCheck(
      'text-track-auto-generate-no-conflict',
      autoConflictTrack === undefined,
      autoConflictApplicable,
      autoConflictTrack
        ? `textTracks[${autoConflictTrack.index}]: \`autoGenerate\` cannot be combined with \`src\`, \`kind\` or \`srclang\` (${autoConflictTrack.reason ?? 'validation failed'}).`
        : null
    );

    // ── Check 5: translation langCodes must be supported ───────────────────
    type BadTranslation = { index: number; langCode: string };
    let badTranslation: BadTranslation | null = null;
    for (let index = 0; index < textTracks.length && badTranslation === null; index++) {
      const translations = (textTracks[index] as Record<string, unknown>).translations;
      if (!Array.isArray(translations)) continue;
      for (const translation of translations as Array<{ langCode?: string }>) {
        const langCode = translation?.langCode;
        if (
          typeof langCode !== 'string' ||
          !languageCodes[langCode.toLowerCase() as keyof typeof languageCodes]
        ) {
          badTranslation = { index, langCode: String(langCode) };
          break;
        }
      }
    }
    const translationApplicable = textTracks.some(track =>
      Array.isArray((track as Record<string, unknown>).translations)
    );
    addCheck(
      'text-track-translation-lang-codes-supported',
      badTranslation === null,
      translationApplicable,
      badTranslation
        ? `textTracks[${badTranslation.index}]: translation langCode "${badTranslation.langCode}" is not supported.`
        : null
    );

    // ── Check 6: chapters=true requires a source URL ───────────────────────
    const chaptersWanted = sourceSnapshot?.chapters === true;
    addCheck(
      'chapters-source-url-present',
      !(chaptersWanted && !hasSourceUrl),
      chaptersWanted,
      chaptersWanted && !hasSourceUrl
        ? '`chapters` is true but the source URL is missing; chapter VTT URLs cannot be generated.'
        : null
    );

    const auditable = hasSourceObject && hasSourceUrl && imagekitIdValid;
    baseReport.auditable = auditable;
    if (!auditable) {
      const reasons: string[] = [];
      if (!hasSourceObject) reasons.push('no source is set');
      else if (!hasSourceUrl) reasons.push('the source has no URL');
      if (!imagekitIdValid) reasons.push('imagekitId is missing or empty');
      baseReport.notAuditableReason = `Source cannot be audited: ${reasons.join('; ')}.`;
    }

    if (!hasSourceUrl) {
      return baseReport;
    }

    // ── Real resolution: resolveSourceUrlAndTransformations ────────────────
    let resolved: { src: string; transformation: Transformation[] } | null = null;
    try {
      resolved = resolveSourceUrlAndTransformations(
        sourceObj as string | SourceOptions,
        pipelineOptions
      );
      baseReport.resolvedVideoUrl = resolved.src;
      baseReport.finalTransformation = resolved.transformation;
      addCheck('source-url-resolution', true, true, null);
    } catch (err) {
      baseReport.resolutionError = errorMessage(err);
      addCheck(
        'source-url-resolution',
        false,
        true,
        `resolveSourceUrlAndTransformations threw: ${baseReport.resolutionError}`
      );
      return baseReport;
    }

    // ── Real full preparation: prepareSource (ikBuild + optional signing) ──
    try {
      const prepared = await prepareSource(
        sourceObj as string | SourceOptions,
        pipelineOptions
      );
      baseReport.finalVideoUrl = prepared.src;
      addCheck('source-preparation', true, true, null);
    } catch (err) {
      addCheck(
        'source-preparation',
        false,
        true,
        `prepareSource threw: ${errorMessage(err)}`
      );
      return baseReport;
    }

    // The downstream URL builders consume the prepared source object, exactly
    // like the plugin pipeline does.
    const preparedSource: SourceOptions = {
      ...sourceObj,
      src: baseReport.finalVideoUrl as string,
    };

    // ── Real poster URL ────────────────────────────────────────────────────
    try {
      baseReport.posterUrl = await preparePosterSrc(
        preparedSource,
        pipelineOptions
      );
      addCheck('poster-url-preparation', true, true, null);
    } catch (err) {
      addCheck(
        'poster-url-preparation',
        false,
        true,
        `preparePosterSrc threw: ${errorMessage(err)}`
      );
    }

    // ── Real seek-thumbnail VTT URL ────────────────────────────────────────
    try {
      baseReport.seekThumbnailVttUrl = await prepareSeekThumbnailVttSrc(
        preparedSource,
        pipelineOptions
      );
      addCheck(
        'seek-thumbnail-url-preparation',
        true,
        optionsSnapshot.seekThumbnails === true,
        null
      );
    } catch (err) {
      addCheck(
        'seek-thumbnail-url-preparation',
        false,
        optionsSnapshot.seekThumbnails === true,
        `prepareSeekThumbnailVttSrc threw: ${errorMessage(err)}`
      );
    }

    // ── Real chapters VTT URL (auto-generated chapters only) ───────────────
    if (chaptersWanted) {
      try {
        const { baseUrl, translatedUrls } = await prepareChaptersVttSrc(
          preparedSource,
          pipelineOptions
        );
        baseReport.chaptersVttUrl = baseUrl;
        baseReport.chapterTranslatedUrls = Object.fromEntries(
          translatedUrls.entries()
        );
        addCheck('chapters-url-preparation', true, true, null);
      } catch (err) {
        addCheck(
          'chapters-url-preparation',
          false,
          true,
          `prepareChaptersVttSrc threw: ${errorMessage(err)}`
        );
      }
    } else {
      addCheck(
        'chapters-url-preparation',
        true,
        false,
        null
      );
    }

    return baseReport;
  } catch (err) {
    // Defensive: the audit itself must never throw.
    addCheck(
      'audit-execution',
      false,
      true,
      `Unexpected audit failure: ${errorMessage(err)}`
    );
    baseReport.auditable = false;
    baseReport.notAuditableReason = `Audit failed: ${errorMessage(err)}`;
    return baseReport;
  }
}
