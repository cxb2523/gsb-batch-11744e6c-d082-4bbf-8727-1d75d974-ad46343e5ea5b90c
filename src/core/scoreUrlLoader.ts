/**
 * Pure Layer 1 / transport utility for validating, fetching, and parsing
 * remote StageFlow choreography scores from HTTP(S) URLs.
 * Pure module with zero React or runtime DOM dependencies.
 */

import { parseStageScore } from './scoreParser';
import type { StageScore } from './types';

export interface RemoteScoreFetchResult {
  rawYaml: string;
  score: StageScore;
  fallbackId: string;
  fileName: string;
  warning?: string;
}

/**
 * Extracts and normalizes supported query parameters from a URL search string.
 * Supports canonical ?score= (with backwards-compatible ?scene= fallback) and ?url=.
 */
export function parseInitialUrlQueryParams(search: string): {
  scoreId: string | null;
  remoteUrl: string | null;
} {
  if (!search) return { scoreId: null, remoteUrl: null };
  const cleanSearch = search.startsWith('?') ? search : `?${search}`;
  const params = new URLSearchParams(cleanSearch);

  const rawScore = params.get('score') ?? params.get('scene');
  const rawUrl = params.get('url');

  return {
    scoreId: rawScore?.trim() || null,
    remoteUrl: rawUrl?.trim() || null,
  };
}

/**
 * Validates that an incoming remote URL is a well-formed HTTP or HTTPS address.
 */
export function validateScoreUrl(urlStr: string): {
  valid: boolean;
  error?: string;
  url?: URL;
} {
  const trimmed = urlStr.trim();
  if (!trimmed) {
    return { valid: false, error: 'Remote URL cannot be empty' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`,
      };
    }
    return { valid: true, url: parsed };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Extracts a sanitized fallback ID from a remote URL's pathname.
 * E.g. "https://example.com/scenes/dialogue_v2.yaml" -> "dialogue_v2"
 */
export function extractFallbackIdFromUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr.trim());
    const pathname = url.pathname;
    const lastSegment = pathname.split('/').filter(Boolean).pop() || 'remote-score';
    const stem = lastSegment.replace(/\.(yaml|yml|json)$/i, '');
    const safeSlug = stem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return safeSlug || 'remote-score';
  } catch {
    return 'remote-score';
  }
}

/**
 * Fetches and parses a remote YAML score from an HTTP/HTTPS endpoint.
 * Returns parsed StageScore AST, raw YAML, and extracted filenames.
 * Throws human-readable descriptive errors on network, CORS, HTTP, or YAML syntax failure.
 */
export async function fetchRemoteScoreYaml(
  targetUrl: string
): Promise<RemoteScoreFetchResult> {
  const validation = validateScoreUrl(targetUrl);
  if (!validation.valid || !validation.url) {
    throw new Error(validation.error ?? 'Invalid remote score URL');
  }

  let response: Response;
  try {
    response = await fetch(validation.url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'text/yaml, text/plain, application/json, */*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to connect to remote host (${message}). Note: cross-origin hosts must allow CORS headers (e.g. GitHub raw, Gists, public CDNs).`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Remote server responded with HTTP ${response.status} (${response.statusText || 'Error'})`
    );
  }

  const rawText = await response.text();
  if (!rawText || !rawText.trim()) {
    throw new Error('Remote score file is empty');
  }

  const fallbackId = extractFallbackIdFromUrl(targetUrl);
  const parsed = parseStageScore(rawText, fallbackId);

  if (!parsed.score) {
    throw new Error(
      `Failed to parse remote YAML score: ${parsed.error ?? 'Syntax error in YAML definition'}`
    );
  }

  const urlPath = validation.url.pathname;
  const fileName = urlPath.split('/').filter(Boolean).pop() || `${fallbackId}.yaml`;

  return {
    rawYaml: rawText,
    score: parsed.score,
    fallbackId,
    fileName,
    warning: parsed.warning ?? undefined,
  };
}
