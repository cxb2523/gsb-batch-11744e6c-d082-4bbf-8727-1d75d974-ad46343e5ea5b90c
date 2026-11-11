import { describe, expect, it } from 'vitest';
import {
  generateCustomScoreId,
  updateScoreYamlId,
  updateScoreYamlTitle,
  normalizeYamlForComparison,
  computeYamlContentHash,
  findDuplicateOrConflictingCustomScore,
  type MatchableCustomItem,
} from '../../src/core/scoreYamlUtils';

describe('YAML Score Utilities (scoreYamlUtils)', () => {
  describe('generateCustomScoreId', () => {
    it('generates a custom score ID with sanitized slug and timestamp', () => {
      const id1 = generateCustomScoreId('My Cool Scene');
      expect(id1).toMatch(/^custom-my-cool-scene-[a-z0-9]+$/);

      const id2 = generateCustomScoreId('scene #1 / test! & more');
      expect(id2).toMatch(/^custom-scene-1-test-more-[a-z0-9]+$/);

      const idFallback = generateCustomScoreId('');
      expect(idFallback).toMatch(/^custom-scene-[a-z0-9]+$/);
    });
  });

  describe('updateScoreYamlId', () => {
    it('replaces quoted id field in YAML text', () => {
      const yaml = `version: "1.0"\nid: "old-scene-id"\ntitle: "Old Title"`;
      const updated = updateScoreYamlId(yaml, 'new-custom-id');
      expect(updated).toBe(`version: "1.0"\nid: "new-custom-id"\ntitle: "Old Title"`);
    });

    it('replaces unquoted id field in YAML text', () => {
      const yaml = `id: legacy_scene\nversion: 1.0`;
      const updated = updateScoreYamlId(yaml, 'new-id');
      expect(updated).toBe(`id: "new-id"\nversion: 1.0`);
    });

    it('prepends id field when absent from YAML document header', () => {
      const yaml = `version: "1.0"\ntitle: "No ID Scene"`;
      const updated = updateScoreYamlId(yaml, 'prepended-id');
      expect(updated).toBe(`id: "prepended-id"\nversion: "1.0"\ntitle: "No ID Scene"`);
    });
  });

  describe('updateScoreYamlTitle', () => {
    it('replaces quoted title field in YAML text', () => {
      const yaml = `id: "scene-1"\ntitle: "Original Title"\nduration: 10`;
      const updated = updateScoreYamlTitle(yaml, 'Updated Title (Copy)');
      expect(updated).toBe(`id: "scene-1"\ntitle: "Updated Title (Copy)"\nduration: 10`);
    });

    it('replaces unquoted title field in YAML text', () => {
      const yaml = `title: Simple Title\nid: scene-2`;
      const updated = updateScoreYamlTitle(yaml, 'Renamed Title');
      expect(updated).toBe(`title: "Renamed Title"\nid: scene-2`);
    });

    it('prepends title field when absent from YAML document header', () => {
      const yaml = `id: "scene-3"\nversion: "1.0"`;
      const updated = updateScoreYamlTitle(yaml, 'New Prepended Title');
      expect(updated).toBe(`title: "New Prepended Title"\nid: "scene-3"\nversion: "1.0"`);
    });
  });

  describe('normalizeYamlForComparison & computeYamlContentHash', () => {
    it('normalizes CRLF to LF and strips top-level id line', () => {
      const raw = `id: "some-id"\r\nversion: "1.0"\r\ntitle: "Test"`;
      const normalized = normalizeYamlForComparison(raw);
      expect(normalized).toBe(`version: "1.0"\ntitle: "Test"`);
    });

    it('produces bit-for-bit identical hashes across CRLF vs LF and auto-generated IDs', () => {
      const yamlLf = `version: "1.0"\nid: "original-scene-id"\ntitle: "Test Scene"\nduration: 10\nstage:\n  width: 10`;
      const yamlCrlfWithCustomId = `version: "1.0"\r\nid: "custom-random-12345"\r\ntitle: "Test Scene"\r\nduration: 10\r\nstage:\r\n  width: 10\r\n`;

      const hash1 = computeYamlContentHash(yamlLf);
      const hash2 = computeYamlContentHash(yamlCrlfWithCustomId);

      expect(hash1).toMatch(/^fnv1a-[0-9a-f]{8}$/);
      expect(hash1).toBe(hash2);
    });

    it('produces distinct hashes when choreography content differs', () => {
      const yamlA = `version: "1.0"\ntitle: "Scene"\nduration: 10`;
      const yamlB = `version: "1.0"\ntitle: "Scene"\nduration: 12`;

      expect(computeYamlContentHash(yamlA)).not.toBe(computeYamlContentHash(yamlB));
    });
  });

  describe('findDuplicateOrConflictingCustomScore', () => {
    const existingCustomProjects: MatchableCustomItem[] = [
      {
        id: 'custom-dialogue-1',
        title: 'Dialogue Scene',
        rawYaml: `version: "1.0"\nid: "custom-dialogue-1"\ntitle: "Dialogue Scene"\nduration: 15`,
        contentHash: computeYamlContentHash(`version: "1.0"\ntitle: "Dialogue Scene"\nduration: 15`),
        sourceUrl: 'https://raw.githubusercontent.com/user/repo/main/dialogue.yaml',
        sourceFileName: 'dialogue.yaml',
      },
      {
        id: 'custom-action-2',
        title: 'Action Scene',
        rawYaml: `version: "1.0"\nid: "custom-action-2"\ntitle: "Action Scene"\nduration: 20`,
        contentHash: computeYamlContentHash(`version: "1.0"\ntitle: "Action Scene"\nduration: 20`),
        sourceFileName: 'action.yaml',
      },
    ];

    it('detects identical content match across files even with different IDs or line endings', () => {
      const droppedYaml = `version: "1.0"\r\nid: "my-local-id"\r\ntitle: "Dialogue Scene"\r\nduration: 15\r\n`;
      const match = findDuplicateOrConflictingCustomScore(
        { rawYaml: droppedYaml, sourceFileName: 'some_other_name.yaml' },
        existingCustomProjects
      );

      expect(match.kind).toBe('identical');
      if (match.kind === 'identical') {
        expect(match.existingItem.id).toBe('custom-dialogue-1');
      }
    });

    it('detects conflict when sourceUrl matches but content has been modified', () => {
      const remoteUpdatedYaml = `version: "1.0"\ntitle: "Dialogue Scene (Updated)"\nduration: 18`;
      const match = findDuplicateOrConflictingCustomScore(
        {
          rawYaml: remoteUpdatedYaml,
          sourceUrl: 'https://raw.githubusercontent.com/user/repo/main/dialogue.yaml',
        },
        existingCustomProjects
      );

      expect(match.kind).toBe('conflict');
      if (match.kind === 'conflict') {
        expect(match.reason).toBe('url-match');
        expect(match.existingItem.id).toBe('custom-dialogue-1');
      }
    });

    it('detects conflict when fileName matches but content has been modified', () => {
      const localModifiedYaml = `version: "1.0"\ntitle: "Action Scene (Modified)"\nduration: 30`;
      const match = findDuplicateOrConflictingCustomScore(
        {
          rawYaml: localModifiedYaml,
          sourceFileName: 'action.yaml',
        },
        existingCustomProjects
      );

      expect(match.kind).toBe('conflict');
      if (match.kind === 'conflict') {
        expect(match.reason).toBe('filename-match');
        expect(match.existingItem.id).toBe('custom-action-2');
      }
    });

    it('classifies unseen scores as new', () => {
      const brandNewYaml = `version: "1.0"\ntitle: "Brand New Staging"\nduration: 5`;
      const match = findDuplicateOrConflictingCustomScore(
        {
          rawYaml: brandNewYaml,
          id: 'brand-new-id',
          sourceFileName: 'unseen.yaml',
        },
        existingCustomProjects
      );

      expect(match.kind).toBe('new');
    });
  });
});
