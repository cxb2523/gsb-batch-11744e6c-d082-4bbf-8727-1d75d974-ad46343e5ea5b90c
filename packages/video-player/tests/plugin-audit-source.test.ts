// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import videojs from 'video.js';
import type VideoJsPlayer from 'video.js/dist/types/player';
import type { IKPlayerOptions } from '../javascript/interfaces';
import type { SourceAuditReport } from '../javascript/modules/source-handler/source-audit';

// Importing the plugin module registers 'imagekitVideoPlayer' on video.js.
import '../javascript/index';

function baseOptions(overrides: Partial<IKPlayerOptions> = {}): IKPlayerOptions {
  return {
    imagekitId: 'demo',
    seekThumbnails: true,
    ...overrides,
  } as IKPlayerOptions;
}

type PluginHandle = {
  auditSource: () => Promise<SourceAuditReport>;
};

describe('ImageKitVideoPlayerPlugin#auditSource()', () => {
  let player: VideoJsPlayer;
  let element: HTMLVideoElement;

  beforeEach(() => {
    element = document.createElement('video');
    document.body.appendChild(element);
    player = videojs(element, { controls: true });
    // The playlist plugin is normally provided by the host app; stub it for
    // the plugin constructor's environment.
    (player as unknown as { playlist: () => void }).playlist = () => undefined;
  });

  afterEach(() => {
    try {
      player.dispose();
    } catch {
      // jsdom teardown may already have removed the element.
    }
    if (element.parentNode) element.parentNode.removeChild(element);
  });

  it('returns a structured "no source, cannot audit" result when no source is set (never throws)', async () => {
    // Guard against accidental network use: the no-source audit must not fetch.
    const fetchSpy = vi.fn(() => {
      throw new Error('auditSource() must not perform network requests');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const plugin = (
      player as unknown as {
        imagekitVideoPlayer: (opts: IKPlayerOptions) => PluginHandle;
      }
    ).imagekitVideoPlayer(baseOptions());

    const report = await plugin.auditSource();

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    expect(report.auditable).toBe(false);
    expect(report.notAuditableReason).not.toBeNull();
    expect(report.notAuditableReason).toMatch(/no source/i);
    expect(report.finalVideoUrl).toBeNull();
    expect(report.resolvedVideoUrl).toBeNull();
    expect(report.checks.length).toBeGreaterThan(0);

    // The report must round-trip through JSON without losing data and contain
    // no function references.
    const roundTripped = JSON.parse(JSON.stringify(report));
    expect(roundTripped).toEqual(report);
    expect(typeof roundTripped.notAuditableReason).toBe('string');
  });

  it('stays non-throwing and serializable when imagekitId is also missing', async () => {
    const plugin = (
      player as unknown as {
        imagekitVideoPlayer: (opts: IKPlayerOptions) => PluginHandle;
      }
    ).imagekitVideoPlayer(baseOptions({ imagekitId: '' }));

    const report = await plugin.auditSource();
    expect(report.auditable).toBe(false);
    const idCheck = report.checks.find(c => c.name === 'imagekit-id-present');
    expect(idCheck?.passed).toBe(false);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
