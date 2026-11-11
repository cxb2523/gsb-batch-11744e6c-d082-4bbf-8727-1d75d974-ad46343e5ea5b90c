import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Html5MediaDriver } from '../../src/media/html5MediaDriver';
import { YouTubeMediaDriver } from '../../src/media/youtubeMediaDriver';
import { ProceduralMediaDriver } from '../../src/media/proceduralMediaDriver';

describe('MediaClockDrivers - Optimistic In-Flight Seek Synchronization', () => {
  describe('Html5MediaDriver', () => {
    let mockVideo: HTMLVideoElement & { seeking: boolean };
    let eventListeners: Record<string, ((ev?: Event) => void)[]> = {};

    beforeEach(() => {
      eventListeners = {};
      mockVideo = {
        readyState: 4,
        currentTime: 5.0,
        duration: 60.0,
        playbackRate: 1.0,
        paused: true,
        ended: false,
        muted: false,
        seeking: false,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        addEventListener: vi.fn((event: string, cb: (ev?: Event) => void) => {
          if (!eventListeners[event]) eventListeners[event] = [];
          eventListeners[event].push(cb);
        }),
        removeEventListener: vi.fn((event: string, cb: (ev?: Event) => void) => {
          if (eventListeners[event]) {
            eventListeners[event] = eventListeners[event].filter((fn) => fn !== cb);
          }
        }),
      } as unknown as HTMLVideoElement & { seeking: boolean };
    });

    it('returns optimistic seek target immediately before native video element finishes seeking', () => {
      const driver = new Html5MediaDriver(mockVideo, 60.0);
      expect(driver.getCurrentTime()).toBe(5.0);

      // User seeks to 24.5s
      // Simulate that the browser video element is now seeking and currentTime has not updated yet
      mockVideo.seeking = true;
      driver.seek(24.5);

      // Setting currentTime on video was dispatched
      expect(mockVideo.currentTime).toBe(24.5);

      // Temporarily revert mockVideo.currentTime to simulate async decoder delay
      mockVideo.currentTime = 5.0;

      // getCurrentTime() must optimistically return 24.5 rather than reverting to 5.0
      expect(driver.getCurrentTime()).toBe(24.5);

      // When the native 'seeked' event fires and seeking completes
      mockVideo.seeking = false;
      mockVideo.currentTime = 24.5;
      eventListeners['seeked']?.forEach((cb) => cb());

      expect(driver.getCurrentTime()).toBe(24.5);
      driver.destroy();
    });

    it('releases lock if safety timeout of 500ms elapses without seeked event', () => {
      const driver = new Html5MediaDriver(mockVideo, 60.0);
      mockVideo.seeking = true;
      driver.seek(30.0);
      mockVideo.currentTime = 5.0; // Decoder stalled

      expect(driver.getCurrentTime()).toBe(30.0);

      // Advance performance.now by 501ms
      const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 501);
      expect(driver.getCurrentTime()).toBe(5.0); // Safely timed out and returned video element time

      nowSpy.mockRestore();
      driver.destroy();
    });
  });

  describe('YouTubeMediaDriver', () => {
    it('anchors to seek target and prevents stale pre-seek polling from reverting anchor', () => {
      const container = {
        innerHTML: '',
        appendChild: vi.fn(),
      } as unknown as HTMLElement;
      const driver = new YouTubeMediaDriver(container, 'dQw4w9WgXcQ', 60.0);

      // Mock internal player ready state
      let mockYtCurrentTime = 3.5;
      (driver as unknown as { player: unknown; ready: boolean }).player = {
        getCurrentTime: () => mockYtCurrentTime,
        getDuration: () => 60.0,
        seekTo: vi.fn(),
        playVideo: vi.fn(),
        pauseVideo: vi.fn(),
        destroy: vi.fn(),
      };
      (driver as unknown as { ready: boolean }).ready = true;

      // Initially at 3.5s
      expect(driver.getCurrentTime()).toBe(3.5);

      // User seeks to 45.0s
      driver.seek(45.0);

      // YouTube iframe still returns 3.5s for the next few frames because postMessage is in flight
      mockYtCurrentTime = 3.5;

      // getCurrentTime() must NOT revert back to 3.5s
      expect(driver.getCurrentTime()).toBe(45.0);

      // When YouTube arrives within 0.35s of the target (e.g. 45.1s)
      mockYtCurrentTime = 45.1;
      expect(driver.getCurrentTime()).toBe(45.1);

      driver.destroy();
    });
  });

  describe('ProceduralMediaDriver', () => {
    it('seeks synchronously without delay', () => {
      const driver = new ProceduralMediaDriver(60.0);
      expect(driver.getCurrentTime()).toBe(0);

      driver.seek(18.25);
      expect(driver.getCurrentTime()).toBe(18.25);

      driver.destroy();
    });
  });
});
