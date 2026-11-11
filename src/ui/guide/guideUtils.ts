/**
 * Helper utilities, section anchor mappings, and text extractors
 * for ScoreAuthoringGuideView. Supports both the YAML Authoring Guide
 * and the StageFlow Script Technical Specification.
 */

import React from 'react';

export type GuideDocType = 'guide' | 'spec';

export interface GuideSectionShortcut {
  label: string;
  id: string;
}

export interface GuideTocItem {
  id: string;
  title: string;
  level: 2 | 3;
  slug: string;
  sectionNumber?: number;
}

export const GUIDE_DOC_SHORTCUTS: Record<GuideDocType, GuideSectionShortcut[]> = {
  guide: [
    { label: 'Intro', id: 'section-1' },
    { label: 'Quickstart', id: 'section-2' },
    { label: 'Foundation', id: 'section-3' },
    { label: 'Cameras', id: 'section-4' },
    { label: 'Coverage', id: 'section-5' },
    { label: 'Timelines', id: 'section-6' },
    { label: 'Cookbook', id: 'section-7' },
  ],
  spec: [
    { label: 'Coordinates', id: 'section-1' },
    { label: 'Kinematics', id: 'section-2' },
    { label: 'Optics', id: 'section-3' },
    { label: 'Entities', id: 'section-4' },
    { label: 'Maneuvers', id: 'section-5' },
    { label: 'Chaining', id: 'section-6' },
    { label: 'Contract', id: 'section-7' },
  ],
};

export const SECTION_SHORTCUTS = GUIDE_DOC_SHORTCUTS.guide;

export const getNodeText = (node: React.ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (React.isValidElement(node)) {
    return getNodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
};

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const cleanMarkdownHeading = (raw: string): string =>
  raw
    .replace(/^#+\s*/, '')
    .replace(/\$[^$]+\$/g, '')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const extractGuideToc = (markdown: string): GuideTocItem[] => {
  const lines = markdown.split('\n');
  const items: GuideTocItem[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const raw = line.slice(3).trim();
      const match = raw.match(/^(\d+)\./);
      const sectionNum = match ? parseInt(match[1], 10) : undefined;
      const id = match ? `section-${match[1]}` : slugify(raw);
      items.push({
        id,
        title: cleanMarkdownHeading(raw),
        level: 2,
        slug: slugify(raw),
        sectionNumber: sectionNum,
      });
    } else if (line.startsWith('### ')) {
      const raw = line.slice(4).trim();
      const numMatch = raw.match(/^(\d+\.\d+)/);
      const recipeMatch = raw.match(/^recipe\s*(\d+)/i);
      const id = numMatch
        ? `section-${numMatch[1].replace('.', '-')}`
        : recipeMatch
          ? `recipe-${recipeMatch[1]}`
          : slugify(raw);
      items.push({
        id,
        title: cleanMarkdownHeading(raw),
        level: 3,
        slug: slugify(raw),
      });
    }
  }

  return items;
};
