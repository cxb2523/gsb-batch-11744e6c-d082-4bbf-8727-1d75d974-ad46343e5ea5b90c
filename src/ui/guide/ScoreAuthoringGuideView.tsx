/**
 * Dedicated Full-Page Markdown + LaTeX Documentation Viewer.
 * Mounted when ?mode=guide or ?mode=spec is present in the URL.
 * Renders docs/YAML_AUTHORING_GUIDE.md or docs/STAGEFLOW_SCRIPT_SPECIFICATION.md
 * with zero WebGL diorama, video player, or transport deck overhead.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ArrowLeft, BookOpen, Compass, FileText, List, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import yamlAuthoringGuideRaw from '../../../docs/YAML_AUTHORING_GUIDE.md?raw';
import scriptSpecificationRaw from '../../../docs/STAGEFLOW_SCRIPT_SPECIFICATION.md?raw';
import { useAppShellTheme } from '../../hooks/useAppShellTheme';
import { ThemeSelectorDropdown } from '../header/ThemeSelectorDropdown';
import {
  extractGuideToc,
  type GuideDocType,
} from './guideUtils';
import { createGuideMarkdownComponents } from './guideMarkdownComponents';
import { GuideSidebarToc } from './GuideSidebarToc';

export interface ScoreAuthoringGuideViewProps {
  initialDoc?: GuideDocType;
}

export const ScoreAuthoringGuideView: React.FC<ScoreAuthoringGuideViewProps> = ({
  initialDoc,
}) => {
  const theme = useAppShellTheme();
  const [activeDoc, setActiveDoc] = useState<GuideDocType>(() => {
    if (initialDoc) return initialDoc;
    if (typeof window !== 'undefined') {
      const mode = new URLSearchParams(window.location.search).get('mode');
      if (mode === 'spec') return 'spec';
    }
    return 'guide';
  });
  const [filterInput, setFilterInput] = useState('');
  const [activeId, setActiveId] = useState<string>('section-1');
  const [isMobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleClearFilter = useCallback(() => {
    setFilterInput('');
  }, []);

  const currentRawDoc = activeDoc === 'spec' ? scriptSpecificationRaw : yamlAuthoringGuideRaw;
  const tocItems = useMemo(() => extractGuideToc(currentRawDoc), [currentRawDoc]);

  const handleSwitchDoc = (nextDoc?: GuideDocType, anchor?: string) => {
    if (nextDoc && nextDoc !== activeDoc) {
      setActiveDoc(nextDoc);
      handleClearFilter();
      const url = new URL(window.location.href);
      url.searchParams.set('mode', nextDoc);
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    if (anchor) {
      setTimeout(() => {
        handleJumpToSection(anchor);
      }, 50);
    } else if (nextDoc && nextDoc !== activeDoc) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const handleJumpToSection = (targetId: string) => {
    const el =
      document.getElementById(targetId) ||
      document.querySelector(`[data-slug="${targetId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(targetId);
    }
  };

  const handleCloseOrReturn = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete('mode');
      window.location.href = url.pathname + url.search;
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-mode', 'guide');
    document.body.classList.remove('overflow-hidden');
    return () => {
      document.documentElement.removeAttribute('data-mode');
      document.body.classList.add('overflow-hidden');
    };
  }, []);

  // Scroll Spy: observe visible headings and update activeId in TOC
  useEffect(() => {
    let animationFrameId: number;

    const handleScroll = () => {
      animationFrameId = requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const threshold = scrollY + 120;
        let currentId = tocItems[0]?.id || 'section-1';

        for (const item of tocItems) {
          const el = document.getElementById(item.id);
          if (el) {
            const top = el.getBoundingClientRect().top + scrollY;
            if (top <= threshold) {
              currentId = item.id;
            } else {
              break;
            }
          }
        }

        setActiveId(currentId);
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, [tocItems, currentRawDoc]);

  const markdownComponents = useMemo(
    () => createGuideMarkdownComponents({ onSwitchDoc: handleSwitchDoc }),
    [activeDoc]
  );

  return (
    <div className="min-h-screen w-full bg-app text-text-main flex flex-col font-sans selection:bg-amber-500/20 select-text">
      {/* 1. Directorial Header Bar */}
      <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-surface/90 backdrop-blur-md border-b border-border-main flex items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            className="lg:hidden p-1.5 rounded-lg border border-border-main bg-surface hover:bg-surface-hover text-text-body flex items-center gap-1.5 text-xs font-mono cursor-pointer transition-colors shadow-2xs"
            title="Open Table of Contents"
          >
            <List className="w-4 h-4 text-amber-500" />
            <span className="hidden sm:inline">TOC</span>
          </button>

          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
            {activeDoc === 'spec' ? <FileText className="w-4 h-4 text-sky-400" /> : <Compass className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-text-main leading-tight truncate">
              {activeDoc === 'spec' ? 'StageFlow Script Technical Specification' : 'StageFlow YAML Score Authoring Manual'}
            </h1>
            <span className="text-[10px] font-mono text-text-muted truncate block">
              {activeDoc === 'spec' ? 'docs/STAGEFLOW_SCRIPT_SPECIFICATION.md · Mathematical Model' : 'docs/YAML_AUTHORING_GUIDE.md · Standalone Reference'}
            </span>
          </div>
        </div>

        {/* Center/Right Actions: Doc Switcher, Theme Switcher, Studio Return */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Document Switcher Segmented Control */}
          <div className="flex items-center p-0.5 rounded-lg bg-surface-muted border border-border-main text-[11px] font-mono shadow-2xs">
            <button
              type="button"
              onClick={() => handleSwitchDoc('spec')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeDoc === 'spec'
                  ? 'bg-surface text-sky-400 font-bold shadow-2xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
              title="View StageFlow Script Technical & Mathematical Specification"
            >
              <FileText className="w-3 h-3" />
              <span>SPEC</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchDoc('guide')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                activeDoc === 'guide'
                  ? 'bg-surface text-amber-500 font-bold shadow-2xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
              title="View YAML Score Authoring Manual & Recipes"
            >
              <BookOpen className="w-3 h-3" />
              <span>Guide</span>
            </button>
          </div>

          <ThemeSelectorDropdown
            themeMode={theme.themeMode}
            effectiveCategory={theme.effectiveCategory}
            onSelectThemeMode={theme.setThemeMode}
          />

          <button
            type="button"
            onClick={handleCloseOrReturn}
            className="px-3 py-1.5 rounded-xl border border-border-main bg-surface hover:bg-surface-hover text-text-body hover:text-text-main text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs active:scale-95"
            title="Return to StageFlow Studio or close tab"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Studio</span>
          </button>
        </div>
      </header>

      {/* 2. Responsive 2-Column Documentation Body */}
      <div className="flex-1 flex w-full max-w-7xl mx-auto px-4 sm:px-6">
        {/* Desktop Sticky Left Sidebar Table of Contents */}
        <aside className="hidden lg:block w-72 shrink-0 border-r border-border-main sticky top-14 h-[calc(100vh-3.5rem)] overflow-hidden py-6 pr-4">
          <GuideSidebarToc
            items={tocItems}
            activeId={activeId}
            filterInput={filterInput}
            onFilterChange={setFilterInput}
            onClearFilter={handleClearFilter}
            onSelectSection={handleJumpToSection}
            activeDoc={activeDoc}
          />
        </aside>

        {/* Main Centered Markdown Reading Canvas */}
        <main className="flex-1 min-w-0 max-w-4xl mx-auto px-4 sm:px-8 py-8 select-text">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
          >
            {currentRawDoc}
          </ReactMarkdown>
        </main>
      </div>

      {/* 3. Mobile Table of Contents Slide-Over Drawer (< lg) */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="relative w-80 max-w-[85vw] bg-surface h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 border-r border-border-main">
            <div className="p-3 border-b border-border-main flex items-center justify-between shrink-0">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-text-main flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                Table of Contents
              </span>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1 rounded-md hover:bg-surface-subtle text-text-muted hover:text-text-main cursor-pointer"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <GuideSidebarToc
                items={tocItems}
                activeId={activeId}
                filterInput={filterInput}
                onFilterChange={setFilterInput}
                onClearFilter={handleClearFilter}
                onSelectSection={handleJumpToSection}
                activeDoc={activeDoc}
                onCloseMobileDrawer={() => setMobileDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
