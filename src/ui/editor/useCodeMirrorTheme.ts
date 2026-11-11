/**
 * Theme-Adaptive CodeMirror 6 Theme & Syntax Highlighter for StageFlow.
 * Dynamically adjusts typography, chrome, cursor, selection, and YAML tokens
 * to match StageFlow's 4 active theme modes (Dark Obsidian, Warm Paper, Light Stone, Pure Black).
 */

import { useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

export function createStageflowCodeMirrorTheme(
  effectiveTheme: 'dark' | 'warm' | 'light'
): Extension[] {
  const isDark = effectiveTheme === 'dark';
  const isWarm = effectiveTheme === 'warm';

  // 1. Editor Canvas Chrome & Typography
  const editorTheme = EditorView.theme(
    {
      '&': {
        color: isDark ? '#f5f5f4' : isWarm ? '#292524' : '#1c1917',
        backgroundColor: 'var(--app-bg, transparent)',
        height: '100%',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: '12px',
        lineHeight: '1.6',
      },
      '.cm-content': {
        caretColor: isDark ? '#f59e0b' : '#d97706',
        padding: '12px 0',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: isDark ? '#f59e0b' : '#d97706',
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: isDark
          ? 'rgba(245, 158, 11, 0.25) !important'
          : 'rgba(217, 119, 6, 0.22) !important',
      },
      '.cm-activeLine': {
        backgroundColor: isDark
          ? 'rgba(255, 255, 255, 0.025)'
          : 'rgba(0, 0, 0, 0.03)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--app-bg, transparent)',
        color: isDark ? '#78716c' : isWarm ? '#8c8273' : '#a8a29e',
        borderRight: `1px solid ${
          isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)'
        }`,
        userSelect: 'none',
        paddingRight: '6px',
        paddingLeft: '4px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: isDark ? '#f59e0b' : '#d97706',
        fontWeight: 'bold',
      },
      '.cm-line': {
        padding: '0 16px',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'inherit',
        scrollbarWidth: 'thin',
        scrollbarColor: isDark
          ? 'rgba(255, 255, 255, 0.2) transparent'
          : isWarm
          ? 'rgba(0, 0, 0, 0.2) transparent'
          : 'rgba(0, 0, 0, 0.2) transparent',
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '6px',
        height: '6px',
      },
      '.cm-scroller::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        background: isDark
          ? 'rgba(255, 255, 255, 0.18)'
          : isWarm
          ? 'rgba(0, 0, 0, 0.2)'
          : 'rgba(0, 0, 0, 0.2)',
        borderRadius: '9999px',
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        background: isDark
          ? 'rgba(245, 158, 11, 0.6)'
          : 'rgba(217, 119, 6, 0.6)',
      },
      // Search match styling
      '.cm-searchMatch': {
        backgroundColor: isDark
          ? 'rgba(245, 158, 11, 0.35)'
          : 'rgba(217, 119, 6, 0.35)',
        outline: `1px solid ${isDark ? '#f59e0b' : '#d97706'}`,
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: isDark
          ? 'rgba(245, 158, 11, 0.65)'
          : 'rgba(217, 119, 6, 0.65)',
      },
    },
    { dark: isDark }
  );

  // 2. Syntax Token Highlighting for YAML
  const highlightStyle = HighlightStyle.define([
    // YAML Property Keys (shot tags, maneuver, target, etc.)
    {
      tag: [t.propertyName, t.definition(t.name)],
      color: isDark ? '#fbbf24' : isWarm ? '#b45309' : '#d97706',
      fontWeight: '600',
    },
    // String literals & URLs
    {
      tag: [t.string, t.character],
      color: isDark ? '#34d399' : isWarm ? '#047857' : '#059669',
    },
    // Numeric measurements, degrees, focal lengths
    {
      tag: [t.number, t.integer, t.float],
      color: isDark ? '#38bdf8' : isWarm ? '#0284c7' : '#2563eb',
      fontWeight: '500',
    },
    // Boolean flags (continuous: true, highlighted: false)
    {
      tag: [t.bool, t.atom],
      color: isDark ? '#c084fc' : isWarm ? '#7e22ce' : '#9333ea',
      fontWeight: 'bold',
    },
    // Comments
    {
      tag: [t.comment, t.lineComment],
      color: isDark ? '#78716c' : isWarm ? '#8c8273' : '#9ca3af',
      fontStyle: 'italic',
    },
    // Punctuation and brackets (colons, dashes, arrays)
    {
      tag: [t.separator, t.punctuation, t.bracket],
      color: isDark ? '#a8a29e' : isWarm ? '#57534e' : '#6b7280',
    },
  ]);

  return [editorTheme, syntaxHighlighting(highlightStyle)];
}

export function useCodeMirrorTheme(
  effectiveTheme: 'dark' | 'warm' | 'light'
): Extension[] {
  return useMemo(
    () => createStageflowCodeMirrorTheme(effectiveTheme),
    [effectiveTheme]
  );
}
