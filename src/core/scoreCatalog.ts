/**
 * Bundled scene catalog registry for StageFlow.
 * Driven declaratively by src/scores/catalog.yaml with zero TypeScript maintenance required.
 */

import yaml from 'yaml';
import catalogManifestRaw from '../scores/catalog.yaml?raw';
import type { ScoreCategory, StageScore } from './types';
import { parseStageScore } from './scoreParser';
import { computeYamlContentHash } from './scoreYamlUtils';

export interface ScoreCatalogItem {
  id: string;
  title: string;
  subtitle?: string;
  category: ScoreCategory;
  rawYaml: string;
  score: StageScore;
  isCustom?: boolean;
  aliases?: string[];
  contentHash?: string;
  originalContentHash?: string;
  sourceUrl?: string;
  sourceFileName?: string;
}

interface ManifestEntry {
  id: string;
  file: string;
  category?: ScoreCategory;
  aliases?: string[];
}

// Vite eagerly imports all YAML files in src/scores/ as raw strings
const rawScoreModules = import.meta.glob<string>('../scores/**/*.yaml', {
  query: '?raw',
  eager: true,
  import: 'default',
});

/**
 * Resolves raw YAML content from the eagerly loaded Vite glob map.
 * Normalizes relative paths and path separators for cross-platform robustness.
 */
function resolveRawScoreYaml(relFile: string): string | undefined {
  const target = relFile.replace(/^[./\\]+/, '').replace(/\\/g, '/');
  for (const [key, content] of Object.entries(rawScoreModules)) {
    const cleanKey = key.replace(/^[./\\]+/, '').replace(/\\/g, '/');
    if (cleanKey.endsWith(target)) {
      return content;
    }
  }
  return undefined;
}

/**
 * Builds the bundled catalog items by parsing the declarative catalog.yaml manifest.
 */
function buildInitialCatalog(): ScoreCatalogItem[] {
  const parsedManifest = yaml.parse(catalogManifestRaw);
  if (!Array.isArray(parsedManifest)) {
    throw new Error('Invalid catalog.yaml: Expected top-level array of score entries.');
  }

  const items: ScoreCatalogItem[] = [];

  for (const entry of parsedManifest as ManifestEntry[]) {
    if (!entry.id || !entry.file) {
      throw new Error(`Invalid catalog.yaml entry: Missing "id" or "file" property.`);
    }

    const rawYaml = resolveRawScoreYaml(entry.file);
    if (!rawYaml) {
      throw new Error(
        `Score catalog manifest error: File "${entry.file}" specified for id "${entry.id}" was not found in src/scores/.`
      );
    }

    const parsed = parseStageScore(rawYaml, entry.id);
    if (!parsed.score) {
      throw new Error(
        `Failed to parse bundled score "${entry.file}" (${entry.id}): ${parsed.error}`
      );
    }

    const hash = computeYamlContentHash(rawYaml);
    items.push({
      id: entry.id,
      title: parsed.score.title,
      subtitle: parsed.score.subtitle,
      category: entry.category ?? 'blueprint',
      rawYaml,
      score: parsed.score,
      isCustom: false,
      aliases: entry.aliases ?? [],
      contentHash: hash,
      originalContentHash: hash,
    });
  }

  return items;
}

export const INITIAL_CATALOG_ITEMS: ScoreCatalogItem[] = buildInitialCatalog();

/**
 * Resolves a score catalog item by its canonical ID or any registered alias.
 * Searches provided catalog (if passed) or falls back to INITIAL_CATALOG_ITEMS.
 */
export function findCatalogItem(
  idOrAlias: string,
  catalog: ScoreCatalogItem[] = INITIAL_CATALOG_ITEMS
): ScoreCatalogItem | undefined {
  const normalized = idOrAlias.trim().toLowerCase();
  return catalog.find((item) => {
    if (item.id.toLowerCase() === normalized) return true;
    if (item.aliases?.some((a) => a.toLowerCase() === normalized)) return true;
    return false;
  });
}

/**
 * Checks whether a given scene ID corresponds to a factory bundled blueprint (by canonical ID or alias).
 */
export function isBundledSceneId(id: string): boolean {
  return findCatalogItem(id, INITIAL_CATALOG_ITEMS) !== undefined;
}

/**
 * Generates a clean, minimal valid StageFlow choreography YAML score for new custom projects.
 */
export function generateBlankScoreYaml(id: string, title = 'New Custom Scene'): string {
  return `# ==============================================================================
# STAGEFLOW CHOREOGRAPHY SCORE — ${title.toUpperCase()}
# ==============================================================================
version: "1.0"
id: "${id}"
title: "${title}"
subtitle: "Custom 3D Staging & Camera Diorama"
video: "procedural://demo"
aspect_ratio: "16:9"
duration: 10.0

stage:
  width: 10
  depth: 10
  grid_step: 1
  observer_camera:
    target: [0, 1.1, 0]
    distance: 7.5
    pitch: 25
    yaw: 35
    lens: 35mm
  stage_camera:
    target: [0, 1.25, 0]
    distance: 4.5
    pitch: 5
    yaw: 0
    lens: 35mm

entities:
  - id: "actor_1"
    label: "Actor 1"
    kind: "character"
    position: [0, 0, 0]
    facing: 0
    height: 1.75
    color: "#00d2ff"

shots:
  - id: "shot_01"
    name: "Establishing Shot"
    start: 0.0
    end: 10.0
    maneuver: "static"
    easing: "smooth"
    camera:
      target: "actor_1"
      distance: 4.5
      pitch: 5
      yaw: 0
      lens: 35mm
`;
}
