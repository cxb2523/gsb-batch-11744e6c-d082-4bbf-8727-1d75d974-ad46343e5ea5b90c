import { createRef } from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoSeekSlider, Props, VideoSeekSliderHandle } from '..';

const thumbnails = [
  {
    fromMs: 0,
    toMs: 50000,
    url: 'sprite.jpg',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
  },
  {
    fromMs: 50000,
    toMs: 100000,
    url: 'sprite.jpg',
    x: 320,
    y: 0,
    width: 320,
    height: 180,
  },
];

const renderWithRef = (props: Partial<Props> = {}) => {
  const ref = createRef<VideoSeekSliderHandle>();

  render(
    <VideoSeekSlider
      ref={ref}
      max={100000}
      currentTime={0}
      onChange={() => undefined}
      {...props}
    />
  );

  return ref;
};

describe('VideoSeekSlider auditPreview handle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('audits the current thumbnails and heatmap through the ref', () => {
    const ref = renderWithRef({
      previewThumbnails: thumbnails,
      heatmap: [1, 3, 2],
    });

    const audit = ref.current!.auditPreview(75000);

    expect(audit.timeMs).toBe(75000);
    expect(audit.thumbnails.reason).toBe('hit');
    expect(audit.thumbnails.hit).toEqual(thumbnails[1]);
    expect(audit.thumbnails.ranges).toHaveLength(2);
    expect(audit.heatmap.emptyPath).toBe(false);
    expect(audit.heatmap.points).toHaveLength(3);
    expect(JSON.parse(JSON.stringify(audit))).toEqual(audit);
  });

  it('reports gaps without throwing', () => {
    const ref = renderWithRef({ previewThumbnails: thumbnails });

    const audit = ref.current!.auditPreview(150000);

    expect(audit.thumbnails.hit).toBeNull();
    expect(audit.thumbnails.reason).toBe('out-of-range');
  });

  it('reports no thumbnail data when previewThumbnails is not provided', () => {
    const ref = renderWithRef();

    const audit = ref.current!.auditPreview(0);

    expect(audit.thumbnails.hit).toBeNull();
    expect(audit.thumbnails.reason).toBe('no-thumbnails');
    expect(audit.heatmap.emptyPath).toBe(true);
  });

  it('reports no thumbnail data while the VTT is still loading', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const ref = renderWithRef({ previewThumbnails: '/media/thumbs.vtt' });

    expect(ref.current!.auditPreview(0).thumbnails.reason).toBe(
      'no-thumbnails'
    );

    resolveFetch(
      new Response(
        'WEBVTT\n\n00:00:00.000 --> 00:01:40.000\nsheet.jpg#xywh=0,0,160,90\n'
      )
    );

    await waitFor(() => {
      const audit = ref.current!.auditPreview(5000);

      expect(audit.thumbnails.reason).toBe('hit');
      expect(audit.thumbnails.hit?.url).toBe(
        'http://localhost:3000/media/sheet.jpg'
      );
    });
  });
});
