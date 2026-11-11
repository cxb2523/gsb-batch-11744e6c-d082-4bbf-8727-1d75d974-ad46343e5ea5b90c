/**
 * Table of Contents Sidebar for ScoreAuthoringGuideView.
 * Renders two-tier H2 + H3 hierarchy with live search filtering,
 * active scroll-spy indicator, and smooth section jump handlers.
 */

import React, { useMemo } from 'react';
import { Search, X, BookOpen, FileText, ChevronRight } from 'lucide-react';
import type { GuideDocType, GuideTocItem } from './guideUtils';

export interface GuideSidebarTocProps {
  items: GuideTocItem[];
  activeId: string;
  filterInput: string;
  onFilterChange: (query: string) => void;
  onClearFilter: () => void;
  onSelectSection: (id: string) => void;
  activeDoc: GuideDocType;
  onCloseMobileDrawer?: () => void;
}

interface TocGroup {
  h2: GuideTocItem;
  h3s: GuideTocItem[];
}

export const GuideSidebarToc: React.FC<GuideSidebarTocProps> = ({
  items,
  activeId,
  filterInput,
  onFilterChange,
  onClearFilter,
  onSelectSection,
  activeDoc,
  onCloseMobileDrawer,
}) => {
  const isSpec = activeDoc === 'spec';
  const accentColorClass = isSpec ? 'text-sky-400' : 'text-amber-500';
  const activeBgClass = isSpec
    ? 'bg-sky-500/10 text-sky-400 font-bold border-l-2 border-sky-400'
    : 'bg-amber-500/10 text-amber-500 font-bold border-l-2 border-amber-500';
  const activeH3Class = isSpec
    ? 'text-sky-400 font-bold bg-sky-500/10 border-l-2 -ml-[9px] pl-[7px] border-sky-400'
    : 'text-amber-500 font-bold bg-amber-500/10 border-l-2 -ml-[9px] pl-[7px] border-amber-500';

  // Group H2 sections and their subordinate H3 subheadings
  const groups = useMemo(() => {
    const list: TocGroup[] = [];
    let current: TocGroup | null = null;

    for (const item of items) {
      if (item.level === 2) {
        current = { h2: item, h3s: [] };
        list.push(current);
      } else if (item.level === 3 && current) {
        current.h3s.push(item);
      }
    }
    return list;
  }, [items]);

  // Filter groups according to filterInput
  const filteredGroups = useMemo(() => {
    const q = filterInput.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((group) => {
        const h2Matches =
          group.h2.title.toLowerCase().includes(q) ||
          group.h2.id.toLowerCase().includes(q);
        const matchingH3s = group.h3s.filter(
          (h3) =>
            h3.title.toLowerCase().includes(q) ||
            h3.id.toLowerCase().includes(q)
        );

        if (h2Matches) {
          return group;
        }
        if (matchingH3s.length > 0) {
          return { h2: group.h2, h3s: matchingH3s };
        }
        return null;
      })
      .filter((g): g is TocGroup => g !== null);
  }, [groups, filterInput]);

  const handleItemClick = (id: string) => {
    onSelectSection(id);
    onCloseMobileDrawer?.();
  };

  return (
    <nav className="flex flex-col h-full text-text-main text-xs select-none">
      {/* 1. Sidebar Header with Filter Search Input */}
      <div className="pb-3 mb-2 border-b border-border-subtle shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            {isSpec ? (
              <FileText className={`w-3.5 h-3.5 ${accentColorClass}`} />
            ) : (
              <BookOpen className={`w-3.5 h-3.5 ${accentColorClass}`} />
            )}
            <span>Table of Contents</span>
          </span>
          <span className="text-[10px] font-mono text-text-muted bg-surface-muted px-1.5 py-0.5 rounded border border-border-subtle">
            {items.length} Topics
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={filterInput}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder={`Filter ${isSpec ? 'spec' : 'guide'} topics...`}
            className="w-full pl-8 pr-7 py-1 text-xs font-mono bg-surface border border-border-main rounded-md text-text-main placeholder-text-muted focus:outline-none focus:border-amber-500 transition-colors shadow-2xs"
          />
          {filterInput && (
            <button
              type="button"
              onClick={onClearFilter}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-main rounded cursor-pointer"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Scrollable Hierarchical Outline */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
        {filteredGroups.length === 0 ? (
          <div className="py-8 px-2 text-center text-text-muted font-mono text-xs">
            No sections match &ldquo;{filterInput}&rdquo;
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isH2Active = activeId === group.h2.id;
            const hasActiveH3 = group.h3s.some((h3) => h3.id === activeId);

            return (
              <div key={group.h2.id} className="space-y-1">
                {/* Section Level 2 Header */}
                <button
                  type="button"
                  onClick={() => handleItemClick(group.h2.id)}
                  className={`w-full text-left flex items-start gap-2 py-1.5 px-2 rounded-md transition-all cursor-pointer group ${
                    isH2Active
                      ? activeBgClass
                      : 'hover:bg-surface-subtle text-text-main'
                  }`}
                  title={group.h2.title}
                >
                  <span
                    className={`font-mono text-[10px] px-1 py-0.2 rounded shrink-0 transition-colors ${
                      isH2Active || hasActiveH3
                        ? 'bg-amber-500/20 text-amber-500 dark:text-amber-400 font-bold'
                        : 'bg-surface-muted text-text-muted group-hover:text-text-main'
                    }`}
                  >
                    {group.h2.sectionNumber
                      ? String(group.h2.sectionNumber).padStart(2, '0')
                      : '#'}
                  </span>
                  <span
                    className={`text-xs font-medium leading-snug line-clamp-2 ${
                      isH2Active ? 'font-bold' : ''
                    }`}
                  >
                    {group.h2.title}
                  </span>
                </button>

                {/* Subheadings Level 3 Outline */}
                {group.h3s.length > 0 && (
                  <ul className="ml-4 pl-2 space-y-0.5 border-l border-border-subtle">
                    {group.h3s.map((h3) => {
                      const isH3Active = activeId === h3.id;
                      return (
                        <li key={h3.id}>
                          <button
                            type="button"
                            onClick={() => handleItemClick(h3.id)}
                            className={`w-full text-left py-1 px-1.5 rounded text-[11px] font-mono leading-tight transition-all cursor-pointer truncate block ${
                              isH3Active
                                ? activeH3Class
                                : 'text-text-muted hover:text-text-main hover:bg-surface-subtle'
                            }`}
                            title={h3.title}
                          >
                            <span className="flex items-center gap-1">
                              <ChevronRight className="w-2.5 h-2.5 shrink-0 opacity-50" />
                              <span className="truncate">{h3.title}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>
    </nav>
  );
};
