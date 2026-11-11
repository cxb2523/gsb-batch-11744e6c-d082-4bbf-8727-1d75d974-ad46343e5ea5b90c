import { describe, expect, it } from 'vitest';
import { auditHeatmap, auditPreviewThumbnails } from '../auditPreview';
import { findThumbnail } from '../findThumbnail';
import {
  HEATMAP_HEIGHT,
  HEATMAP_WIDTH,
  getHeatmapPath,
} from '../getHeatmapPath';
import { parseThumbnailsVtt } from '../parseThumbnailsVtt';

const VTT = `WEBVTT

00:00.000 --> 00:10.000
sprite.jpg#xywh=0,0,160,90

00:10.000 --> 00:20.000
sprite.jpg#xywh=160,0,160,90

not a timestamp --> also not
broken.jpg

00:30.000 --> 00:40.000
other.jpg

00:50.000 --> 01:00.000
`;

describe('auditPreviewThumbnails', () => {
  it('reports the hit exactly as findThumbnail does, with xywh fields', () => {
    for (const timeMs of [0, 5000, 10000, 19999, 20000, 35000, 40000]) {
      const audit = auditPreviewThumbnails(VTT, timeMs);
      const expected = findThumbnail(parseThumbnailsVtt(VTT), timeMs);

      expect(audit.hit).toEqual(expected ?? null);
      expect(audit.reason).toBe(expected ? 'hit' : audit.reason);
    }

    const audit = auditPreviewThumbnails(VTT, 15000);

    expect(audit.hit).toEqual({
      fromMs: 10000,
      toMs: 20000,
      url: 'sprite.jpg',
      x: 160,
      y: 0,
      width: 160,
      height: 90,
    });
    expect(audit.reason).toBe('hit');
  });

  it('lists sorted ranges with xywh flags and explains skipped cues', () => {
    const audit = auditPreviewThumbnails(VTT, 0);

    expect(audit.ranges).toEqual([
      { fromMs: 0, toMs: 10000, url: 'sprite.jpg', hasXywh: true },
      { fromMs: 10000, toMs: 20000, url: 'sprite.jpg', hasXywh: true },
      { fromMs: 30000, toMs: 40000, url: 'other.jpg', hasXywh: false },
    ]);

    expect(audit.totalCues).toBe(3);
    expect(audit.skippedCount).toBe(2);
    expect(audit.totalCues + audit.skippedCount).toBe(audit.timedBlockCount);
    expect(audit.skipped.map((skip) => skip.reason)).toEqual([
      expect.stringContaining('unparseable timestamp'),
      expect.stringContaining('no image URL payload'),
    ]);
  });

  it('reports null with a gap reason between two cues', () => {
    const audit = auditPreviewThumbnails(VTT, 25000);

    expect(findThumbnail(parseThumbnailsVtt(VTT), 25000)).toBeUndefined();
    expect(audit.hit).toBeNull();
    expect(audit.reason).toBe('gap');
  });

  it('reports out-of-range before the first and after the last cue', () => {
    expect(auditPreviewThumbnails(VTT, -1).reason).toBe('out-of-range');
    expect(auditPreviewThumbnails(VTT, 40001).reason).toBe('out-of-range');
    expect(auditPreviewThumbnails(VTT, 40001).hit).toBeNull();
  });

  it('handles an empty VTT without throwing', () => {
    const audit = auditPreviewThumbnails('', 1000);

    expect(audit.totalCues).toBe(0);
    expect(audit.skippedCount).toBe(0);
    expect(audit.timedBlockCount).toBe(0);
    expect(audit.ranges).toEqual([]);
    expect(audit.hit).toBeNull();
    expect(audit.reason).toBe('no-cues');
  });

  it('resolves urls against baseUrl exactly like parseThumbnailsVtt', () => {
    const baseUrl = 'https://cdn.example.com/media/thumbs.vtt';
    const audit = auditPreviewThumbnails(VTT, 5000, baseUrl);
    const parsed = parseThumbnailsVtt(VTT, baseUrl);

    expect(audit.ranges.map((range) => range.url)).toEqual(
      parsed.map((thumbnail) => thumbnail.url)
    );
    expect(audit.hit?.url).toBe('https://cdn.example.com/media/sprite.jpg');
    expect(audit.hit).toEqual(findThumbnail(parsed, 5000));
  });

  it('returns JSON-serializable data only', () => {
    const audit = auditPreviewThumbnails(VTT, 15000, 'https://a.b/c.vtt');

    expect(JSON.parse(JSON.stringify(audit))).toEqual(audit);
  });
});

describe('auditHeatmap', () => {
  it('matches getHeatmapPath points and normalization', () => {
    const values = [10, 0, 30, 20, NaN, 50];
    const audit = auditHeatmap(values);
    const step = HEATMAP_WIDTH / values.length;

    expect(audit.emptyPath).toBe(false);
    expect(getHeatmapPath(values)).not.toBe('');
    expect(audit.validCount).toBe(4);
    expect(audit.zeroedCount).toBe(2);
    expect(audit.maxValue).toBe(50);
    expect(audit.points).toHaveLength(values.length);

    audit.points.forEach((point, index) => {
      const safe =
        Number.isFinite(values[index]) && values[index] > 0 ? values[index] : 0;
      const height = Math.round((safe / 50) * HEATMAP_HEIGHT * 100) / 100;

      expect(point.x).toBe(Math.round((index + 0.5) * step * 100) / 100);
      expect(point.height).toBe(height);
      expect(point.y).toBe(Math.round((HEATMAP_HEIGHT - height) * 100) / 100);
    });
  });

  it('reports an empty path if and only if getHeatmapPath does', () => {
    const cases = [
      [],
      [0, 0, 0],
      [NaN, Infinity, -Infinity, -5],
      [1],
      [0, 2, 1],
    ];

    for (const values of cases) {
      expect(auditHeatmap(values).emptyPath).toBe(
        getHeatmapPath(values) === ''
      );
    }
  });

  it('handles all-invalid values without throwing', () => {
    const audit = auditHeatmap([NaN, Infinity, -1, 0]);

    expect(audit.emptyPath).toBe(true);
    expect(audit.validCount).toBe(0);
    expect(audit.zeroedCount).toBe(4);
    expect(audit.maxValue).toBe(0);
    expect(audit.points).toEqual([]);
  });

  it('honors a custom target width for the x coordinates', () => {
    const audit = auditHeatmap([1, 1], 500);

    expect(audit.width).toBe(500);
    expect(audit.points.map((point) => point.x)).toEqual([125, 375]);
  });
});
