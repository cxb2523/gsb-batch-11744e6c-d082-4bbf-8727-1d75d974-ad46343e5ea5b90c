import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  GUIDE_DOC_SHORTCUTS,
  SECTION_SHORTCUTS,
  cleanMarkdownHeading,
  extractGuideToc,
  getNodeText,
  slugify,
} from '../../src/ui/guide/guideUtils';
import yamlAuthoringGuideRaw from '../../docs/YAML_AUTHORING_GUIDE.md?raw';
import scriptSpecificationRaw from '../../docs/STAGEFLOW_SCRIPT_SPECIFICATION.md?raw';

describe('guideUtils', () => {
  it('correctly extracts text from string, array, and nested React elements', () => {
    expect(getNodeText('Hello World')).toBe('Hello World');
    expect(getNodeText(['Hello ', 'World'])).toBe('Hello World');
    expect(
      getNodeText([
        '4. Scene Entities (',
        React.createElement('code', null, 'entities:'),
        ')',
      ])
    ).toBe('4. Scene Entities (entities:)');
  });

  it('slugifies headings reliably without double hyphens or punctuation', () => {
    expect(slugify('1. Introduction & Spatial Architecture')).toBe('1-introduction-spatial-architecture');
    expect(slugify('2. Quickstart & Minimal Score Anatomy')).toBe('2-quickstart-minimal-score-anatomy');
    expect(slugify('3. Scene Foundation (Root, Stage & Entities)')).toBe('3-scene-foundation-root-stage-entities');
    expect(slugify("7. Director's Cookbook (8 Production Recipes)")).toBe('7-director-s-cookbook-8-production-recipes');
  });

  it('cleans markdown heading text by stripping inline math and formatting', () => {
    expect(
      cleanMarkdownHeading('### 4.1 Default Geometry & Intrinsic Look-At Anchor ($\\vec{A}_i$)')
    ).toBe('4.1 Default Geometry & Intrinsic Look-At Anchor');
    expect(
      cleanMarkdownHeading('### 5.1 Easing Functions ($u = E(\\tau)$)')
    ).toBe('5.1 Easing Functions');
    expect(
      cleanMarkdownHeading('### 4.2 Entity Facing Angle (`rotation` & `look_at`)')
    ).toBe('4.2 Entity Facing Angle (rotation & look_at)');
  });

  it('extracts hierarchical table of contents with H2 and H3 items from both guides', () => {
    const guideToc = extractGuideToc(yamlAuthoringGuideRaw);
    expect(guideToc.length).toBeGreaterThan(30);

    const guideH2s = guideToc.filter((item) => item.level === 2);
    expect(guideH2s.length).toBe(7);
    guideH2s.forEach((h2, idx) => {
      expect(h2.id).toBe(`section-${idx + 1}`);
      expect(h2.sectionNumber).toBe(idx + 1);
    });

    const guideH3s = guideToc.filter((item) => item.level === 3);
    expect(guideH3s.length).toBeGreaterThan(20);
    expect(guideH3s.some((h3) => h3.id === 'section-1-1')).toBe(true);
    expect(guideH3s.some((h3) => h3.id === 'recipe-1')).toBe(true);
    expect(guideH3s.some((h3) => h3.id === 'recipe-8')).toBe(true);

    const specToc = extractGuideToc(scriptSpecificationRaw);
    expect(specToc.length).toBeGreaterThan(12);

    const specH2s = specToc.filter((item) => item.level === 2);
    expect(specH2s.length).toBe(7);
    specH2s.forEach((h2, idx) => {
      expect(h2.id).toBe(`section-${idx + 1}`);
      expect(h2.sectionNumber).toBe(idx + 1);
    });

    const specH3s = specToc.filter((item) => item.level === 3);
    expect(specH3s.some((h3) => h3.id === 'section-2-1')).toBe(true);
    expect(specH3s.some((h3) => h3.id === 'section-7-1')).toBe(true);
  });

  it('ensures docs/YAML_AUTHORING_GUIDE.md code blocks have perfectly balanced fences', () => {
    const fenceLines = yamlAuthoringGuideRaw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('```'));

    expect(fenceLines.length).toBeGreaterThan(0);
    expect(fenceLines.length % 2).toBe(0);
  });

  it('ensures every guide shortcut corresponds to an actual h2 in docs/YAML_AUTHORING_GUIDE.md', () => {
    const h2Lines = yamlAuthoringGuideRaw
      .split('\n')
      .filter((line) => line.startsWith('## '));

    expect(h2Lines.length).toBe(GUIDE_DOC_SHORTCUTS.guide.length);
    expect(SECTION_SHORTCUTS.length).toBe(GUIDE_DOC_SHORTCUTS.guide.length);

    GUIDE_DOC_SHORTCUTS.guide.forEach((sec, idx) => {
      const line = h2Lines[idx];
      expect(sec.id).toBe(`section-${idx + 1}`);
      expect(line.startsWith(`## ${idx + 1}.`)).toBe(true);
    });
  });

  it('ensures every spec shortcut corresponds to an actual h2 in docs/STAGEFLOW_SCRIPT_SPECIFICATION.md', () => {
    const h2Lines = scriptSpecificationRaw
      .split('\n')
      .filter((line) => line.startsWith('## '));

    expect(h2Lines.length).toBe(GUIDE_DOC_SHORTCUTS.spec.length);

    GUIDE_DOC_SHORTCUTS.spec.forEach((sec, idx) => {
      const line = h2Lines[idx];
      expect(sec.id).toBe(`section-${idx + 1}`);
      expect(line.startsWith(`## ${idx + 1}.`)).toBe(true);
    });
  });
});
