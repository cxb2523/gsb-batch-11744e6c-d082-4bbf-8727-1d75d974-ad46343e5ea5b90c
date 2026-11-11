import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  parseInitialUrlQueryParams,
  validateScoreUrl,
  extractFallbackIdFromUrl,
  fetchRemoteScoreYaml,
} from '../../src/core/scoreUrlLoader';

describe('scoreUrlLoader — Remote Score Fetcher & URL Query Parser', () => {
  describe('parseInitialUrlQueryParams', () => {
    it('parses canonical ?score= parameter', () => {
      expect(parseInitialUrlQueryParams('?score=blueprint-02')).toEqual({
        scoreId: 'blueprint-02',
        remoteUrl: null,
      });
    });

    it('parses legacy ?scene= parameter as fallback for ?score=', () => {
      expect(parseInitialUrlQueryParams('?scene=blueprint-03-ball-pass')).toEqual({
        scoreId: 'blueprint-03-ball-pass',
        remoteUrl: null,
      });
    });

    it('prioritizes ?score= over ?scene= if both are present', () => {
      expect(
        parseInitialUrlQueryParams('?score=blueprint-02&scene=legacy-id')
      ).toEqual({
        scoreId: 'blueprint-02',
        remoteUrl: null,
      });
    });

    it('parses ?url= parameter', () => {
      const url = 'https://raw.githubusercontent.com/user/repo/main/scene.yaml';
      expect(parseInitialUrlQueryParams(`?url=${encodeURIComponent(url)}`)).toEqual({
        scoreId: null,
        remoteUrl: url,
      });
    });

    it('handles query strings without leading ? and empty searches', () => {
      expect(parseInitialUrlQueryParams('score=demo')).toEqual({
        scoreId: 'demo',
        remoteUrl: null,
      });
      expect(parseInitialUrlQueryParams('')).toEqual({
        scoreId: null,
        remoteUrl: null,
      });
    });
  });

  describe('validateScoreUrl', () => {
    it('accepts valid http and https URLs', () => {
      expect(validateScoreUrl('https://example.com/scene.yaml').valid).toBe(true);
      expect(validateScoreUrl('http://localhost:8080/my_scene.yml').valid).toBe(true);
    });

    it('rejects unsupported protocols and invalid strings', () => {
      expect(validateScoreUrl('ftp://example.com/scene.yaml').valid).toBe(false);
      expect(validateScoreUrl('javascript:alert(1)').valid).toBe(false);
      expect(validateScoreUrl('not-a-url').valid).toBe(false);
      expect(validateScoreUrl('').valid).toBe(false);
    });
  });

  describe('extractFallbackIdFromUrl', () => {
    it('extracts sanitized slug from URL pathname', () => {
      expect(
        extractFallbackIdFromUrl('https://example.com/scenes/dialogue_flow.yaml')
      ).toBe('dialogue-flow');

      expect(
        extractFallbackIdFromUrl('https://gist.githubusercontent.com/user/123/raw/test_scene.yml')
      ).toBe('test-scene');

      expect(extractFallbackIdFromUrl('https://example.com/')).toBe('remote-score');
    });
  });

  describe('fetchRemoteScoreYaml', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('successfully fetches and parses valid remote YAML score', async () => {
      const validYaml = `
version: "1.0"
id: "remote-dialogue"
title: "Remote Dialogue"
duration: 10
aspect_ratio: "16:9"
stage:
  width: 10
  depth: 10
entities:
  - id: "actor"
    kind: "character"
    position: [0, 0, 0]
shots:
  - id: "s1"
    start: 0
    end: 10
    camera:
      target: [0, 1, 0]
      distance: 5
      pitch: 10
      yaw: 0
      lens: 35mm
`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => validYaml,
      } as unknown as Response);

      const result = await fetchRemoteScoreYaml(
        'https://raw.githubusercontent.com/user/repo/main/dialogue.yaml'
      );

      expect(result.rawYaml).toBe(validYaml);
      expect(result.score.title).toBe('Remote Dialogue');
      expect(result.fileName).toBe('dialogue.yaml');
      expect(result.fallbackId).toBe('dialogue');
    });

    it('throws clear error on HTTP non-200 status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as unknown as Response);

      await expect(
        fetchRemoteScoreYaml('https://example.com/missing.yaml')
      ).rejects.toThrow(/HTTP 404/);
    });

    it('throws clear CORS/network error on network rejection', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      await expect(
        fetchRemoteScoreYaml('https://blocked-cors.com/scene.yaml')
      ).rejects.toThrow(/CORS headers/);
    });

    it('throws clear error when remote score has syntax errors', async () => {
      const invalidYaml = `version: "1.0"\n  invalid: indentation: [broken`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => invalidYaml,
      } as unknown as Response);

      await expect(
        fetchRemoteScoreYaml('https://example.com/broken.yaml')
      ).rejects.toThrow(/Failed to parse remote YAML score/);
    });
  });
});

