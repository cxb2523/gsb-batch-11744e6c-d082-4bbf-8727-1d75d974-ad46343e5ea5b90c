/**
 * Pure Layer 1 utilities for manipulating YAML score headers, generating
 * custom project IDs, and triggering browser file downloads.
 * Pure module with zero React or runtime dependencies.
 */

/**
 * Generates a unique, collision-resistant custom score ID from a base slug.
 * Format: `custom-${slug}-${timestamp}`
 */
export function generateCustomScoreId(baseIdentifier?: string): string {
  const timestamp = Date.now().toString(36);
  const safeSlug = (baseIdentifier || 'scene')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `custom-${safeSlug || 'project'}-${timestamp}`;
}

/**
 * Replaces the top-level `id:` field in a raw YAML text, or prepends it
 * if missing from the document header.
 */
export function updateScoreYamlId(yaml: string, newId: string): string {
  const idRegex = /^id:\s*["']?[^"'\n\r]+["']?/m;
  if (idRegex.test(yaml)) {
    return yaml.replace(idRegex, `id: "${newId}"`);
  }
  return `id: "${newId}"\n${yaml}`;
}

/**
 * Replaces the top-level `title:` field in a raw YAML text, or prepends it
 * if missing from the document header.
 */
export function updateScoreYamlTitle(yaml: string, newTitle: string): string {
  const titleRegex = /^title:\s*["']?[^"'\n\r]+["']?/m;
  if (titleRegex.test(yaml)) {
    return yaml.replace(titleRegex, `title: "${newTitle}"`);
  }
  return `title: "${newTitle}"\n${yaml}`;
}

/**
 * Initiates a browser download of a raw YAML score string as a `.yaml` file.
 */
export function downloadYamlBlob(fileName: string, yamlText: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const blob = new Blob([yamlText], {
    type: 'text/yaml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.yaml') || fileName.endsWith('.yml')
    ? fileName
    : `${fileName}.yaml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Normalizes YAML score content for deterministic fingerprinting:
 * - Normalizes CRLF and CR line endings to LF (\n)
 * - Strips top-level id: line so auto-generated custom IDs do not alter content fingerprint
 * - Trims surrounding whitespace
 */
export function normalizeYamlForComparison(yaml: string): string {
  const unifiedLf = yaml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const strippedId = unifiedLf.replace(/^id:\s*["']?[^"'\n]+["']?\s*(\n|$)/m, '');
  return strippedId.trim();
}

/**
 * Computes a fast 32-bit FNV-1a hex hash of normalized YAML score text.
 * Returns formatted hash string: `fnv1a-xxxxxxxx`.
 */
export function computeYamlContentHash(yaml: string): string {
  const normalized = normalizeYamlForComparison(yaml);
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export interface CustomScoreCandidate {
  rawYaml: string;
  id?: string;
  sourceUrl?: string;
  sourceFileName?: string;
}

export interface MatchableCustomItem {
  id: string;
  rawYaml: string;
  title?: string;
  contentHash?: string;
  sourceUrl?: string;
  sourceFileName?: string;
  isCustom?: boolean;
}

export type ScoreMatchClassification<T> =
  | { kind: 'identical'; existingItem: T }
  | { kind: 'conflict'; existingItem: T; reason: 'url-match' | 'filename-match' | 'id-match' }
  | { kind: 'new' };

/**
 * Classifies an incoming custom score candidate against existing custom projects:
 * 1. Exact content match -> 'identical' (zero duplicate creation, zero dialog needed)
 * 2. Identity match (sourceUrl, sourceFileName, or id) with differing content -> 'conflict'
 * 3. No match -> 'new'
 */
export function findDuplicateOrConflictingCustomScore<T extends MatchableCustomItem>(
  candidate: CustomScoreCandidate,
  existingCustomItems: T[]
): ScoreMatchClassification<T> {
  const candidateHash = computeYamlContentHash(candidate.rawYaml);

  // 1. Check for exact content match across all custom projects
  for (const item of existingCustomItems) {
    const itemHash = item.contentHash ?? computeYamlContentHash(item.rawYaml);
    if (itemHash === candidateHash) {
      return { kind: 'identical', existingItem: item };
    }
  }

  // 2. Check for identity collision with different content
  const normCandidateUrl = candidate.sourceUrl?.trim().toLowerCase();
  const normCandidateFileName = candidate.sourceFileName?.trim().toLowerCase();
  const normCandidateId = candidate.id?.trim().toLowerCase();

  for (const item of existingCustomItems) {
    if (normCandidateUrl && item.sourceUrl && item.sourceUrl.trim().toLowerCase() === normCandidateUrl) {
      return { kind: 'conflict', existingItem: item, reason: 'url-match' };
    }
    if (normCandidateFileName && item.sourceFileName && item.sourceFileName.trim().toLowerCase() === normCandidateFileName) {
      return { kind: 'conflict', existingItem: item, reason: 'filename-match' };
    }
    if (normCandidateId && item.id && item.id.trim().toLowerCase() === normCandidateId) {
      return { kind: 'conflict', existingItem: item, reason: 'id-match' };
    }
  }

  return { kind: 'new' };
}

