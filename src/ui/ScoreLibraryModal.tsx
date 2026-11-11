/**
 * Accessible Score Library Modal for StageFlow (2-Column Master-Detail Layout).
 * Displays bundled factory blueprints and custom user scores with high-density compact rows,
 * keyboard arrow navigation (↑ / ↓ / Enter), sticky section headers, procedural 2D SVG stage minimap,
 * and unified project lifecycle management.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clapperboard,
  Plus,
  X,
  Search,
  LayoutList,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import type { ScoreCatalogItem } from '../core/scoreCatalog';
import type { LibraryFilterTab } from '../core/types';
import {
  loadStoredLibraryBlueprintExpanded,
  loadStoredLibraryCustomExpanded,
  loadStoredLibraryStudyExpanded,
  loadStoredLibraryTab,
  saveStoredLibraryBlueprintExpanded,
  saveStoredLibraryCustomExpanded,
  saveStoredLibraryStudyExpanded,
  saveStoredLibraryTab,
} from '../core/storage/localStorageUi';
import { ScoreLibraryCard } from './library/ScoreLibraryCard';
import { ScoreInspectorPane } from './library/ScoreInspectorPane';
import { UI_TOKENS } from './tokens/ui';

export type FilterTab = LibraryFilterTab;

export interface ScoreLibraryModalProps {
  isOpen: boolean;
  catalog: ScoreCatalogItem[];
  activeSceneId: string;
  initialTab?: FilterTab;
  onSelectScene: (sceneId: string) => void;
  onCreateBlankScore?: () => void;
  onForkScore?: (item: ScoreCatalogItem) => void;
  onDuplicateScore?: (id: string) => void;
  onExportScore?: (item: ScoreCatalogItem) => void;
  onRenameScore?: (id: string, newTitle: string) => Promise<boolean>;
  onDeleteScore?: (id: string) => Promise<boolean>;
  onClose: () => void;
}

export const ScoreLibraryModal: React.FC<ScoreLibraryModalProps> = ({
  isOpen,
  catalog,
  activeSceneId,
  initialTab,
  onSelectScene,
  onCreateBlankScore,
  onForkScore,
  onDuplicateScore,
  onExportScore,
  onRenameScore,
  onDeleteScore,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>(() => {
    return initialTab ?? loadStoredLibraryTab() ?? 'all';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScoreId, setSelectedScoreId] = useState<string>(activeSceneId);
  const [mobileView, setMobileView] = useState<'list' | 'details'>('list');
  const [isStudyExpanded, setIsStudyExpanded] = useState<boolean>(() => {
    return loadStoredLibraryStudyExpanded() ?? true;
  });
  const [isBlueprintExpanded, setIsBlueprintExpanded] = useState<boolean>(() => {
    return loadStoredLibraryBlueprintExpanded() ?? false;
  });
  const [isCustomExpanded, setIsCustomExpanded] = useState<boolean>(() => {
    return loadStoredLibraryCustomExpanded() ?? true;
  });
  const listContainerRef = useRef<HTMLDivElement>(null);

  const handleSelectTab = (tab: FilterTab) => {
    setActiveTab(tab);
    saveStoredLibraryTab(tab);
  };

  const handleToggleStudyExpanded = () => {
    setIsStudyExpanded((prev) => {
      const next = !prev;
      saveStoredLibraryStudyExpanded(next);
      return next;
    });
  };

  const handleToggleBlueprintExpanded = () => {
    setIsBlueprintExpanded((prev) => {
      const next = !prev;
      saveStoredLibraryBlueprintExpanded(next);
      return next;
    });
  };

  const handleToggleCustomExpanded = () => {
    setIsCustomExpanded((prev) => {
      const next = !prev;
      saveStoredLibraryCustomExpanded(next);
      return next;
    });
  };

  // Synchronize initialTab and selectedScoreId when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else {
        setActiveTab(loadStoredLibraryTab() ?? 'all');
      }
      setSelectedScoreId(activeSceneId);
      setMobileView('list');
    }
  }, [isOpen, initialTab, activeSceneId]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const studyScores = useMemo(
    () => catalog.filter((item) => item.category === 'study'),
    [catalog]
  );
  const blueprintScores = useMemo(
    () => catalog.filter((item) => item.category === 'blueprint'),
    [catalog]
  );
  const customScores = useMemo(
    () => catalog.filter((item) => item.category === 'custom' || item.isCustom),
    [catalog]
  );

  const filteredScores = useMemo(() => {
    let list = catalog;
    if (activeTab === 'study') list = studyScores;
    if (activeTab === 'blueprint') list = blueprintScores;
    if (activeTab === 'custom') list = customScores;

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.id.toLowerCase().includes(q)
    );
  }, [catalog, activeTab, studyScores, blueprintScores, customScores, searchQuery]);

  // Grouped lists for the "All" tab
  const { studyFiltered, blueprintFiltered, customFiltered } = useMemo(() => {
    return {
      studyFiltered: filteredScores.filter((item) => item.category === 'study'),
      blueprintFiltered: filteredScores.filter((item) => item.category === 'blueprint'),
      customFiltered: filteredScores.filter((item) => item.category === 'custom' || item.isCustom),
    };
  }, [filteredScores]);

  // Determine scores currently visible in the DOM (respecting activeTab and collapsible sections)
  const visibleScores = useMemo(() => {
    if (activeTab === 'study') {
      return studyFiltered;
    }
    if (activeTab === 'blueprint') {
      return blueprintFiltered;
    }
    if (activeTab === 'custom') {
      return customFiltered;
    }
    if (activeTab === 'all') {
      const items: ScoreCatalogItem[] = [];
      if (isStudyExpanded) items.push(...studyFiltered);
      if (isBlueprintExpanded) items.push(...blueprintFiltered);
      if (isCustomExpanded) items.push(...customFiltered);
      return items;
    }
    return filteredScores;
  }, [activeTab, studyFiltered, blueprintFiltered, customFiltered, isStudyExpanded, isBlueprintExpanded, isCustomExpanded, filteredScores]);

  // Find currently selected score object, falling back to first visible/filtered item
  const selectedScore = useMemo(() => {
    const found = catalog.find((item) => item.id === selectedScoreId);
    if (found) return found;
    return visibleScores[0] || filteredScores[0] || catalog[0] || null;
  }, [catalog, selectedScoreId, visibleScores, filteredScores]);

  // Keyboard navigation: ArrowUp, ArrowDown, Enter
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyNav = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;

      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIndex = visibleScores.findIndex(
          (s) => s.id === selectedScoreId
        );
        const nextIndex = Math.min(visibleScores.length - 1, currentIndex + 1);
        if (visibleScores[nextIndex]) {
          setSelectedScoreId(visibleScores[nextIndex].id);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIndex = visibleScores.findIndex(
          (s) => s.id === selectedScoreId
        );
        const prevIndex = Math.max(0, currentIndex - 1);
        if (visibleScores[prevIndex]) {
          setSelectedScoreId(visibleScores[prevIndex].id);
        }
      } else if (e.key === 'Enter') {
        // If actively typing inside search or rename input, let input handle Enter
        if (isInput) return;
        if (selectedScore) {
          e.preventDefault();
          onSelectScene(selectedScore.id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, [isOpen, visibleScores, selectedScoreId, selectedScore, onSelectScene, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-library-title"
      className={UI_TOKENS.modal.overlay}
      onClick={onClose}
    >
      <div
        className={UI_TOKENS.modal.containerLibrary}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-surface-muted border border-border-main flex items-center justify-center text-text-main shrink-0 shadow-2xs">
              <Clapperboard className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="score-library-title"
                className="text-base font-bold font-sans text-text-main tracking-tight leading-none"
              >
                Choreography Score Library
              </h2>
              <span className="text-xs font-sans text-text-muted truncate block mt-1">
                Explore bundled blueprint scores and custom saved scenes · <kbd className="font-mono text-[10px] px-1 py-0.2 rounded bg-surface border border-border-subtle">↑</kbd> <kbd className="font-mono text-[10px] px-1 py-0.2 rounded bg-surface border border-border-subtle">↓</kbd> to navigate
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onCreateBlankScore && (
              <button
                type="button"
                onClick={() => {
                  onCreateBlankScore();
                  onClose();
                }}
                className={UI_TOKENS.button.actionPill}
                title="Create a new blank choreography score"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Blank</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close score library"
              className={UI_TOKENS.button.iconClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Master-Detail Body Layout */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left Column: High-Density Score List & Search (w-full on mobile, ~40% on md+) */}
          <div
            className={`w-full md:w-[42%] lg:w-[40%] flex flex-col border-r border-border-subtle bg-surface min-h-0 ${
              mobileView === 'details' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Filter Tabs & Search Bar */}
            <div className="p-3 border-b border-border-subtle bg-surface-subtle space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className={UI_TOKENS.button.segmentedGroup}>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('all')}
                    className={
                      activeTab === 'all'
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    }
                  >
                    All ({catalog.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('study')}
                    className={
                      activeTab === 'study'
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    }
                  >
                    Studies ({studyScores.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('blueprint')}
                    className={
                      activeTab === 'blueprint'
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    }
                  >
                    Blueprints ({blueprintScores.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTab('custom')}
                    className={
                      activeTab === 'custom'
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    }
                  >
                    Custom ({customScores.length})
                  </button>
                </div>

                {/* Mobile View Toggle */}
                <div className="md:hidden flex items-center">
                  <button
                    type="button"
                    onClick={() => setMobileView('details')}
                    className="p-1.5 rounded-lg bg-surface border border-border-main text-text-muted hover:text-text-main text-xs font-mono flex items-center gap-1"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Inspector</span>
                  </button>
                </div>
              </div>

              {/* Search Field */}
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-text-faint absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search scores by title, note, or ID..."
                  className={UI_TOKENS.input.search}
                />
              </div>
            </div>

            {/* Scrollable High-Density Scores List */}
            <div
              ref={listContainerRef}
              className="flex-1 overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar"
            >
              {filteredScores.length === 0 ? (
                <div className="py-16 text-center text-text-muted font-sans text-xs">
                  No choreography scores found matching your criteria.
                </div>
              ) : activeTab === 'all' && (studyFiltered.length > 0 || blueprintFiltered.length > 0 || customFiltered.length > 0) ? (
                <div className="space-y-2">
                  {/* Scene Studies Section */}
                  {studyFiltered.length > 0 && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={handleToggleStudyExpanded}
                        aria-expanded={isStudyExpanded}
                        className="w-full px-2 py-1 text-[10px] font-mono font-bold tracking-wider text-text-muted hover:text-text-main uppercase flex items-center justify-between rounded-md hover:bg-surface-subtle transition-colors group select-none cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-text-faint group-hover:text-text-main transition-transform duration-150 ${
                              isStudyExpanded ? 'rotate-0' : '-rotate-90'
                            }`}
                          />
                          <span>Scene Studies</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-violet-500/15 border border-violet-400/30 text-violet-600 dark:text-violet-300 font-mono">
                          {studyFiltered.length}
                        </span>
                      </button>

                      {isStudyExpanded && (
                        <div className="space-y-1.5">
                          {studyFiltered.map((item) => (
                            <ScoreLibraryCard
                              key={item.id}
                              item={item}
                              isActive={item.id === activeSceneId}
                              isSelected={item.id === selectedScore?.id}
                              onSelect={() => {
                                setSelectedScoreId(item.id);
                                setMobileView('details');
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Bundled Blueprints Section */}
                  {blueprintFiltered.length > 0 && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={handleToggleBlueprintExpanded}
                        aria-expanded={isBlueprintExpanded}
                        className="w-full px-2 py-1 text-[10px] font-mono font-bold tracking-wider text-text-muted hover:text-text-main uppercase flex items-center justify-between rounded-md hover:bg-surface-subtle transition-colors group select-none cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-text-faint group-hover:text-text-main transition-transform duration-150 ${
                              isBlueprintExpanded ? 'rotate-0' : '-rotate-90'
                            }`}
                          />
                          <span>Blueprints</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-surface-subtle border border-border-subtle group-hover:border-border-main text-text-muted font-mono">
                          {blueprintFiltered.length}
                        </span>
                      </button>

                      {isBlueprintExpanded && (
                        <div className="space-y-1.5">
                          {blueprintFiltered.map((item) => (
                            <ScoreLibraryCard
                              key={item.id}
                              item={item}
                              isActive={item.id === activeSceneId}
                              isSelected={item.id === selectedScore?.id}
                              onSelect={() => {
                                setSelectedScoreId(item.id);
                                setMobileView('details');
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom Projects Section */}
                  {customFiltered.length > 0 && (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={handleToggleCustomExpanded}
                        aria-expanded={isCustomExpanded}
                        className="w-full px-2 pt-2 pb-1 text-[10px] font-mono font-bold tracking-wider text-text-muted hover:text-text-main uppercase flex items-center justify-between rounded-md hover:bg-surface-subtle transition-colors group select-none cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5">
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-text-faint group-hover:text-text-main transition-transform duration-150 ${
                              isCustomExpanded ? 'rotate-0' : '-rotate-90'
                            }`}
                          />
                          <span>Custom Projects</span>
                        </div>
                        <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-surface-subtle border border-border-subtle group-hover:border-border-main text-text-muted font-mono">
                          {customFiltered.length}
                        </span>
                      </button>

                      {isCustomExpanded && (
                        <div className="space-y-1.5">
                          {customFiltered.map((item) => (
                            <ScoreLibraryCard
                              key={item.id}
                              item={item}
                              isActive={item.id === activeSceneId}
                              isSelected={item.id === selectedScore?.id}
                              onSelect={() => {
                                setSelectedScoreId(item.id);
                                setMobileView('details');
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                filteredScores.map((item) => (
                  <ScoreLibraryCard
                    key={item.id}
                    item={item}
                    isActive={item.id === activeSceneId}
                    isSelected={item.id === selectedScore?.id}
                    onSelect={() => {
                      setSelectedScoreId(item.id);
                      setMobileView('details');
                    }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right Column: Choreography Inspector Pane */}
          <div
            className={`flex-1 flex flex-col min-h-0 overflow-hidden bg-surface ${
              mobileView === 'list' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Mobile Header to return to list */}
            <div className="md:hidden p-2.5 border-b border-border-subtle bg-surface-subtle flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="text-xs font-mono text-text-muted hover:text-text-main flex items-center gap-1"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>← Back to Score List</span>
              </button>
            </div>

            {selectedScore ? (
              <ScoreInspectorPane
                item={selectedScore}
                isActive={selectedScore.id === activeSceneId}
                onSelectScore={() => {
                  onSelectScene(selectedScore.id);
                  onClose();
                }}
                onForkScore={onForkScore}
                onDuplicateScore={onDuplicateScore}
                onExportScore={onExportScore}
                onRenameScore={onRenameScore}
                onDeleteScore={onDeleteScore}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
                <Clapperboard className="w-10 h-10 stroke-1 text-text-faint mb-3" />
                <span className="text-sm font-sans font-medium">No score selected</span>
                <span className="text-xs text-text-faint mt-1">
                  Select a score from the list to inspect its staging and optical breakdown.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
