import { describe, it, expect } from 'vitest';
import {
  auditSourcePreparation,
  buildSourceAuditSnapshot,
} from '../javascript/modules/source-handler/source-audit';
import {
  resolveSourceUrlAndTransformations,
  preparePosterSrc,
  prepareSeekThumbnailVttSrc,
  prepareChaptersVttSrc,
  isTransformationAllowedWithABS,
} from '../javascript/utils';
import { validateRemoteTextTrackOptions } from '../javascript/modules/subtitles/subtitles';
import type { IKPlayerOptions, SourceOptions, Transformation } from '../javascript/interfaces';

const BASE_URL = 'https://ik.imagekit.io/demo/sample-video.mp4';

/** Deterministic, network-free stand-in for a signing endpoint. */
const deterministicSigner = async (url: string): Promise<string> =>
  `${url}${url.includes('?') ? '&' : '?'}sig=test-signature`;

function globalOptions(overrides: Partial<IKPlayerOptions> = {}): IKPlayerOptions {
  return {
    imagekitId: 'demo',
    seekThumbnails: true,
    ...overrides,
  } as IKPlayerOptions;
}

function checkByName(report: Awaited<ReturnType<typeof auditSourcePreparation>>, name: string) {
  const check = report.checks.find(c => c.name === name);
  if (!check) throw new Error(`expected check "${name}" to exist`);
  return check;
}

describe('auditSourcePreparation — positive path (ABS HLS)', () => {
  it('produces an ik-master.m3u8 URL with streamingResolutions, item-by-item equal to the real functions', async () => {
    const source: SourceOptions = {
      src: BASE_URL,
      abs: { protocol: 'hls', sr: [240, 360, 720, 1080] },
      chapters: true,
      textTracks: [
        {
          autoGenerate: true,
          translations: [
            { langCode: 'es' },
            { langCode: 'fr' },
          ],
        },
      ],
    };
    const options = globalOptions({
      abs: { protocol: 'hls', sr: [240, 360, 720, 1080] },
    });

    const snapshot = buildSourceAuditSnapshot(source, options, true);
    const report = await auditSourcePreparation(snapshot);

    // ── Audit-level structural assertions ──────────────────────────────────
    expect(report.auditable).toBe(true);
    expect(report.notAuditableReason).toBeNull();
    expect(report.absMode).toBe(true);
    expect(report.absRejected).toBe(false);
    expect(report.absRejectionReasons).toEqual([]);
    expect(report.resolutionError).toBeNull();

    expect(report.resolvedVideoUrl).toMatch(/\/ik-master\.m3u8(\?|$)/);
    expect(
      report.finalTransformation.some(
        step =>
          step.streamingResolutions &&
          (step.streamingResolutions as unknown[]).length === 4
      )
    ).toBe(true);

    // ── Parity with real resolveSourceUrlAndTransformations ────────────────
    const realResolved = resolveSourceUrlAndTransformations(source, options);
    expect(report.resolvedVideoUrl).toBe(realResolved.src);
    expect(report.finalTransformation).toEqual(realResolved.transformation);
    expect(new URL(report.resolvedVideoUrl!).pathname.endsWith('/ik-master.m3u8')).toBe(true);

    // ── Parity with real prepareSource (via finalVideoUrl) ─────────────────
    const realPrepared = await resolveThenBuildLikePrepareSource(source, options);
    expect(report.finalVideoUrl).toBe(realPrepared);
    expect(report.finalVideoUrl).toMatch(/\/ik-master\.m3u8(\?|$)/);

    // ── Parity with real poster / thumbnail / chapter URL builders ─────────
    const preparedSource: SourceOptions = { ...source, src: report.finalVideoUrl! };
    expect(report.posterUrl).toBe(await preparePosterSrc(preparedSource, options));
    expect(report.seekThumbnailVttUrl).toBe(
      await prepareSeekThumbnailVttSrc(preparedSource, options)
    );

    const realChapters = await prepareChaptersVttSrc(preparedSource, options);
    expect(report.chaptersVttUrl).toBe(realChapters.baseUrl);
    expect(report.chapterTranslatedUrls).toEqual(
      Object.fromEntries(realChapters.translatedUrls.entries())
    );
    expect(Object.keys(report.chapterTranslatedUrls).sort()).toEqual(['es', 'fr']);

    // ── All applicable checks passed ───────────────────────────────────────
    for (const check of report.checks) {
      expect(check.passed, `${check.name}: ${check.reason ?? ''}`).toBe(true);
    }
  });

  it('matches the signed output of every real function when a signer is present', async () => {
    const source: SourceOptions = {
      src: BASE_URL,
      abs: { protocol: 'dash', sr: [360, 720] },
      chapters: true,
    };
    const options = globalOptions({
      abs: { protocol: 'dash', sr: [360, 720] },
      signerFn: deterministicSigner,
    });

    const snapshot = buildSourceAuditSnapshot(source, options, true);
    expect(snapshot.globalOptions.hasSignerFn).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('signerFn');

    const report = await auditSourcePreparation(snapshot, deterministicSigner);

    const realResolved = resolveSourceUrlAndTransformations(source, options);
    expect(report.resolvedVideoUrl).toBe(realResolved.src);
    expect(report.finalTransformation).toEqual(realResolved.transformation);
    expect(report.resolvedVideoUrl).toMatch(/\/ik-master\.mpd(\?|$)/);

    const preparedSource: SourceOptions = { ...source, src: report.finalVideoUrl! };
    expect(report.finalVideoUrl).toBe(
      await deterministicSigner(
        (
          await resolveSourceUrlAndTransformationsAndBuild(source, options)
        )
      )
    );
    expect(report.posterUrl).toBe(await preparePosterSrc(preparedSource, options));
    expect(report.seekThumbnailVttUrl).toBe(
      await prepareSeekThumbnailVttSrc(preparedSource, options)
    );
    const realChapters = await prepareChaptersVttSrc(preparedSource, options);
    expect(report.chaptersVttUrl).toBe(realChapters.baseUrl);
    expect(report.chapterTranslatedUrls).toEqual(
      Object.fromEntries(realChapters.translatedUrls.entries())
    );

    // No function references anywhere in the report; fully JSON-serializable.
    const roundTripped = JSON.parse(JSON.stringify(report));
    expect(roundTripped).toEqual(report);
  });
});

describe('auditSourcePreparation — negative path (ABS + forbidden width)', () => {
  it('flags ABS rejection with width listed, and the real resolver throws identically', async () => {
    const forbidden: Transformation[] = [{ width: 500 }];
    const source: SourceOptions = {
      src: BASE_URL,
      abs: { protocol: 'hls', sr: [240, 720] },
      transformation: forbidden,
    };
    const options = globalOptions({
      abs: { protocol: 'hls', sr: [240, 720] },
      transformation: forbidden,
    });

    // Real behavior baseline: ABS check rejects and resolver throws.
    expect(isTransformationAllowedWithABS(forbidden)).toBe(false);
    expect(() => resolveSourceUrlAndTransformations(source, options)).toThrow();

    const snapshot = buildSourceAuditSnapshot(source, options, true);
    const report = await auditSourcePreparation(snapshot);

    expect(report.absRejected).toBe(true);
    expect(report.absRejectionReasons).toEqual(['width']);
    expect(report.resolutionError).not.toBeNull();
    expect(report.resolvedVideoUrl).toBeNull();
    expect(report.finalVideoUrl).toBeNull();

    const absCheck = checkByName(report, 'abs-transformations-allowed');
    expect(absCheck.passed).toBe(false);
    expect(absCheck.applicable).toBe(true);
    expect(absCheck.reason).toContain('width');

    const resolutionCheck = checkByName(report, 'source-url-resolution');
    expect(resolutionCheck.passed).toBe(false);
    expect(resolutionCheck.reason).toContain('resolveSourceUrlAndTransformations threw');

    // Real throw message matches the recorded resolution error.
    let realMessage = '';
    try {
      resolveSourceUrlAndTransformations(source, options);
    } catch (err) {
      realMessage = err instanceof Error ? err.message : String(err);
    }
    expect(report.resolutionError).toBe(realMessage);

    // Report remains JSON-serializable and never throws.
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('lists every forbidden parameter, including short raw params (w-, q-)', async () => {
    const source: SourceOptions = {
      src: BASE_URL,
      abs: { protocol: 'hls', sr: [240] },
      transformation: [{ width: 100 }, { raw: 'q-50,h-200' }],
    };
    const options = globalOptions({ abs: { protocol: 'hls', sr: [240] } });
    expect(() => resolveSourceUrlAndTransformations(source, options)).toThrow();

    const report = await auditSourcePreparation(
      buildSourceAuditSnapshot(source, options, true)
    );
    expect(report.absRejected).toBe(true);
    expect(report.absRejectionReasons).toEqual(['width', 'quality', 'height']);
  });
});

describe('auditSourcePreparation — boundary paths', () => {
  it('chapters=true without a source URL yields a failed check and never throws', async () => {
    const source = { chapters: true } as unknown as SourceOptions;
    const options = globalOptions();

    const report = await auditSourcePreparation(
      buildSourceAuditSnapshot(source, options, false)
    );

    expect(report.auditable).toBe(false);
    expect(report.notAuditableReason).toMatch(/no URL/);

    const urlCheck = checkByName(report, 'source-url-present');
    expect(urlCheck.passed).toBe(false);

    const chaptersCheck = checkByName(report, 'chapters-source-url-present');
    expect(chaptersCheck.passed).toBe(false);
    expect(chaptersCheck.applicable).toBe(true);
    expect(chaptersCheck.reason).toContain('chapters');

    expect(report.chaptersVttUrl).toBeNull();
    expect(report.finalVideoUrl).toBeNull();
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('an unsupported translation langCode fails the lang-code check and mirrors the real validator', async () => {
    const source: SourceOptions = {
      src: BASE_URL,
      textTracks: [
        {
          autoGenerate: true,
          translations: [{ langCode: 'xx' as never }],
        },
      ],
    };
    const options = globalOptions();

    // Real behavior baseline: validateRemoteTextTrackOptions throws.
    expect(() =>
      validateRemoteTextTrackOptions(source.textTracks![0] as never)
    ).toThrow(/not supported/);

    const report = await auditSourcePreparation(
      buildSourceAuditSnapshot(source, options, false)
    );

    const langCheck = checkByName(report, 'text-track-translation-lang-codes-supported');
    expect(langCheck.passed).toBe(false);
    expect(langCheck.applicable).toBe(true);
    expect(langCheck.reason).toContain('xx');

    expect(report.textTrackChecks).toHaveLength(1);
    expect(report.textTrackChecks[0].passed).toBe(false);
    expect(report.textTrackChecks[0].reason).toMatch(/not supported/);

    // URL preparation still proceeds; the audit itself never throws.
    expect(report.auditable).toBe(true);
    expect(report.finalVideoUrl).not.toBeNull();
    expect(() => JSON.stringify(report)).not.toThrow();
  });

  it('autoGenerate combined with src/kind/srclang fails the conflict check like the real validator', async () => {
    const conflictingTrack = {
      autoGenerate: true,
      src: 'https://ik.imagekit.io/demo/captions.vtt',
      kind: 'subtitles',
      srclang: 'en',
    } as never;

    expect(() => validateRemoteTextTrackOptions(conflictingTrack)).toThrow();

    const source: SourceOptions = { src: BASE_URL, textTracks: [conflictingTrack] };
    const report = await auditSourcePreparation(
      buildSourceAuditSnapshot(source, globalOptions(), false)
    );

    const conflictCheck = checkByName(report, 'text-track-auto-generate-no-conflict');
    expect(conflictCheck.passed).toBe(false);
    expect(conflictCheck.applicable).toBe(true);
    expect(conflictCheck.reason).toContain('autoGenerate');
    expect(report.textTrackChecks[0].passed).toBe(false);
  });

  it('missing imagekitId fails the initialization check even with a valid source', async () => {
    const options = globalOptions({ imagekitId: '   ' });
    const report = await auditSourcePreparation(
      buildSourceAuditSnapshot({ src: BASE_URL } as SourceOptions, options, false)
    );

    expect(report.auditable).toBe(false);
    const idCheck = checkByName(report, 'imagekit-id-present');
    expect(idCheck.passed).toBe(false);
    expect(idCheck.reason).toContain('imagekitId');
  });

  it('non-ABS sources are audited without ABS checks applying', async () => {
    const source: SourceOptions = {
      src: BASE_URL,
      transformation: [{ width: 300 }],
    };
    const report = await auditSourcePreparation(
      buildSourceAuditSnapshot(source, globalOptions(), false)
    );

    expect(report.absMode).toBe(false);
    expect(report.absRejected).toBe(false);
    const absCheck = checkByName(report, 'abs-transformations-allowed');
    expect(absCheck.applicable).toBe(false);
    expect(absCheck.passed).toBe(true);

    const realResolved = resolveSourceUrlAndTransformations(source, globalOptions());
    expect(report.resolvedVideoUrl).toBe(realResolved.src);
    expect(report.finalTransformation).toEqual(realResolved.transformation);
  });
});

describe('auditSourcePreparation — snapshot purity', () => {
  it('never mutates the input snapshot and produces a function-free JSON payload', async () => {
    const source: SourceOptions = {
      src: BASE_URL,
      abs: { protocol: 'hls', sr: [360] },
      textTracks: [{ autoGenerate: true }],
    };
    const options = globalOptions({
      abs: { protocol: 'hls', sr: [360] },
      signerFn: deterministicSigner,
    });

    const snapshot = buildSourceAuditSnapshot(source, options, true);
    const snapshotClone = JSON.parse(JSON.stringify(snapshot));

    const report = await auditSourcePreparation(snapshot, deterministicSigner);

    // Input untouched.
    expect(snapshot).toEqual(snapshotClone);
    expect(source.textTracks).toHaveLength(1);

    // Output is pure data: round-trips through JSON with no loss, no functions.
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const json = JSON.stringify(report);
    expect(json).not.toContain('signerFn');
    expect(json).not.toContain('function');
  });
});

// ── Helpers reproducing prepareSource's non-signing/signing composition ──────
// prepareSource = ikBuild(resolve(...)) then optional signing. We compare
// against the same composition instead of importing ikBuild directly, keeping
// the tests aligned with the real public pipeline entry point.
async function resolveThenBuildLikePrepareSource(
  input: string | SourceOptions,
  opts: IKPlayerOptions
): Promise<string> {
  const { buildSrc } = await import('@imagekit/javascript');
  const { src: finalSrc, transformation } = resolveSourceUrlAndTransformations(input, opts);
  return buildSrc({ src: finalSrc, urlEndpoint: '', transformation });
}

async function resolveSourceUrlAndTransformationsAndBuild(
  input: string | SourceOptions,
  opts: IKPlayerOptions
): Promise<string> {
  return resolveThenBuildLikePrepareSource(input, opts);
}
