/**
 * Custom ReactMarkdown component renderers for ScoreAuthoringGuideView.
 * Provides accessible typography, LaTeX styling, theme-aware code blocks,
 * deterministic section jump targets, and in-app cross-specification tab navigation.
 */

import type { Components } from 'react-markdown';
import { BookOpen } from 'lucide-react';
import { getNodeText, slugify, type GuideDocType } from './guideUtils';

export interface GuideMarkdownOptions {
  onSwitchDoc?: (doc?: GuideDocType, anchor?: string) => void;
}

export const createGuideMarkdownComponents = (
  options?: GuideMarkdownOptions
): Components => ({
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold font-sans text-text-main mt-8 mb-4 pb-2 border-b border-border-main flex items-center gap-2">
      <BookOpen className="w-6 h-6 text-amber-500 inline shrink-0" />
      <span>{children}</span>
    </h1>
  ),
  h2: ({ children }) => {
    const text = getNodeText(children);
    const slug = slugify(text);
    const match = text.match(/^(\d+)\./);
    const sectionId = match ? `section-${match[1]}` : slug;
    return (
      <h2
        id={sectionId}
        data-slug={slug}
        className="text-lg font-bold font-sans text-text-main mt-8 mb-3 pb-1.5 border-b border-border-subtle scroll-mt-20"
      >
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const text = getNodeText(children);
    const slug = slugify(text);
    const numMatch = text.match(/^(\d+\.\d+)/);
    const recipeMatch = text.match(/^recipe\s*(\d+)/i);
    const h3Id = numMatch
      ? `section-${numMatch[1].replace('.', '-')}`
      : recipeMatch
        ? `recipe-${recipeMatch[1]}`
        : slug;

    return (
      <h3
        id={h3Id}
        data-slug={slug}
        className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 mt-6 mb-2 uppercase tracking-wide scroll-mt-20"
      >
        {children}
      </h3>
    );
  },
  p: ({ children }) => (
    <p className="text-sm font-sans text-text-body leading-relaxed my-3">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside space-y-1.5 my-3 text-sm text-text-body pl-3">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside space-y-1.5 my-3 text-sm text-text-body pl-3">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-sm text-text-body leading-relaxed">{children}</li>
  ),
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;

    // Check if it's a cross-document link to spec or guide
    const isSpec =
      href.includes('mode=spec') ||
      href.includes('STAGEFLOW_SCRIPT_SPECIFICATION');
    const isGuide =
      href.includes('mode=guide') || href.includes('YAML_AUTHORING_GUIDE');

    if (isSpec || isGuide) {
      const targetDoc: GuideDocType = isSpec ? 'spec' : 'guide';
      const hashMatch = href.match(/#([^?&]+)/);
      const anchor = hashMatch ? hashMatch[1] : undefined;

      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            options?.onSwitchDoc?.(targetDoc, anchor);
          }}
          className="text-amber-500 hover:text-amber-400 font-medium underline underline-offset-2 decoration-amber-500/40 hover:decoration-amber-400 transition-colors cursor-pointer"
        >
          {children}
        </a>
      );
    }

    // Anchor on the same page
    if (href.startsWith('#')) {
      const anchor = href.slice(1);
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            options?.onSwitchDoc?.(undefined, anchor);
          }}
          className="text-amber-500 hover:text-amber-400 font-medium underline underline-offset-2 decoration-amber-500/40 hover:decoration-amber-400 transition-colors cursor-pointer"
        >
          {children}
        </a>
      );
    }

    // External web link
    const isExternal =
      href.startsWith('http://') || href.startsWith('https://');
    if (isExternal) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-amber-500 hover:text-amber-400 font-medium underline underline-offset-2 decoration-amber-500/40 hover:decoration-amber-400 transition-colors"
        >
          {children}
        </a>
      );
    }

    // Fallback safe render for any other local relative path (avoids browser 404)
    return (
      <span className="font-mono text-xs bg-surface-subtle px-1.5 py-0.5 rounded border border-border-subtle text-amber-600 dark:text-amber-400">
        {children}
      </span>
    );
  },
  table: ({ children }) => (
    <div className="w-full overflow-x-auto custom-scrollbar my-5 rounded-xl border border-border-main bg-surface shadow-2xs">
      <table className="w-full text-left border-collapse text-xs font-mono">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface-muted text-text-main text-xs border-b border-border-main">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 font-bold text-text-main">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 border-b border-border-subtle/60 text-xs text-text-body">{children}</td>
  ),
  pre: ({ children }) => (
    <pre className="p-4 my-4 rounded-xl bg-surface-muted border border-border-main font-mono text-xs text-text-main overflow-x-auto custom-scrollbar leading-relaxed shadow-inner">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    if (!className) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-surface-subtle text-amber-600 dark:text-amber-400 font-mono text-xs border border-border-subtle">
          {children}
        </code>
      );
    }
    return <code>{children}</code>;
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-amber-500 bg-amber-500/10 px-4 py-2.5 rounded-r-lg my-4 text-sm italic text-text-body">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-t border-border-subtle" />,
});
