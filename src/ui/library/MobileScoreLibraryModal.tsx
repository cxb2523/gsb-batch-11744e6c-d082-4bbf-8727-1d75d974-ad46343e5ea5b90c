/**
 * MobileScoreLibraryModal Component.
 * Dedicated, full-screen mobile score switcher optimized for touch thumbs.
 * Features 1-tap direct scene loading, horizontal swipeable category chips,
 * and collapsed-by-default blueprints section.
 * Layer 5 UI Component.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Clapperboard, X, ChevronDown } from 'lucide-react';
import type { ScoreCatalogItem } from '../../core/scoreCatalog';
import type { FilterTab } from '../ScoreLibraryModal';
import {
  loadStoredLibraryBlueprintExpanded,
  loadStoredLibraryCustomExpanded,
  loadStoredLibraryStudyExpanded,
  loadStoredLibraryTab,
  saveStoredLibraryBlueprintExpanded,
  saveStoredLibraryCustomExpanded,
  saveStoredLibraryStudyExpanded,
  saveStoredLibraryTab,
} from '../../core/storage/localStorageUi';
import { ScoreLibraryCard } from './ScoreLibraryCard';
import { UI_TOKENS } from '../tokens/ui';

export interface MobileScoreLibraryModalProps {
  isOpen: boolean;
  catalog: ScoreCatalogItem[];
  activeSceneId: string;
  initialTab?: FilterTab;
  onSelectScene: (sceneId: string) => void;
  onClose: () => void;
}

export const MobileScoreLibraryModal: React.FC<MobileScoreLibraryModalProps> = ({
  isOpen,
  catalog,
  activeSceneId,
  initialTab,
  onSelectScene,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>(() => {
    return initialTab ?? loadStoredLibraryTab() ?? 'all';
  });
  const [isStudyExpanded, setIsStudyExpanded] = useState<boolean>(() => {
    return loadStoredLibraryStudyExpanded() ?? true;
  });
  const [isBlueprintExpanded, setIsBlueprintExpanded] = useState<boolean>(() => {
    return loadStoredLibraryBlueprintExpanded() ?? false;
  });
  const [isCustomExpanded, setIsCustomExpanded] = useState<boolean>(() => {
    return loadStoredLibraryCustomExpanded() ?? true;
  });

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

  // Synchronize initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      } else {
        setActiveTab(loadStoredLibraryTab() ?? 'all');
      }
    }
  }, [isOpen, initialTab]);

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
    if (activeTab === 'study') return studyScores;
    if (activeTab === 'blueprint') return blueprintScores;
    if (activeTab === 'custom') return customScores;
    return catalog;
  }, [catalog, activeTab, studyScores, blueprintScores, customScores]);

  const handleCardClick = (id: string) => {
    onSelectScene(id);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-score-library-title"
      className="fixed inset-0 z-50 bg-app text-text-main flex flex-col overflow-hidden animate-in fade-in duration-150"
    >
      {/* 1. Mobile Header Bar */}
      <header className="h-14 px-4 bg-surface border-b border-border-main flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-surface-muted border border-border-main flex items-center justify-center text-text-main shrink-0 shadow-2xs">
            <Clapperboard className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2
              id="mobile-score-library-title"
              className="text-sm font-bold font-sans text-text-main tracking-tight leading-none truncate"
            >
              Choreography Library
            </h2>
            <span className="text-[11px] font-sans text-text-muted truncate block mt-0.5">
              Tap any scene to switch instantly
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close library"
          className={UI_TOKENS.button.iconClose}
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* 2. Horizontal Scrollable Category Filter Chips */}
      <div className="px-3 py-2 bg-surface-subtle border-b border-border-subtle shrink-0 overflow-x-auto no-scrollbar flex items-center gap-1.5 select-none">
        <button
          type="button"
          onClick={() => handleSelectTab('all')}
          className={`px-3 py-1 rounded-full text-xs font-mono font-medium shrink-0 transition-colors cursor-pointer ${
            activeTab === 'all'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'bg-surface hover:bg-surface-hover text-text-muted hover:text-text-main border border-border-main'
          }`}
        >
          All ({catalog.length})
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('study')}
          className={`px-3 py-1 rounded-full text-xs font-mono font-medium shrink-0 transition-colors cursor-pointer ${
            activeTab === 'study'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'bg-surface hover:bg-surface-hover text-text-muted hover:text-text-main border border-border-main'
          }`}
        >
          Studies ({studyScores.length})
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('blueprint')}
          className={`px-3 py-1 rounded-full text-xs font-mono font-medium shrink-0 transition-colors cursor-pointer ${
            activeTab === 'blueprint'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'bg-surface hover:bg-surface-hover text-text-muted hover:text-text-main border border-border-main'
          }`}
        >
          Blueprints ({blueprintScores.length})
        </button>
        <button
          type="button"
          onClick={() => handleSelectTab('custom')}
          className={`px-3 py-1 rounded-full text-xs font-mono font-medium shrink-0 transition-colors cursor-pointer ${
            activeTab === 'custom'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'bg-surface hover:bg-surface-hover text-text-muted hover:text-text-main border border-border-main'
          }`}
        >
          Custom ({customScores.length})
        </button>
      </div>

      {/* 3. Fast-Scrolling 1-Tap Score List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {filteredScores.length === 0 ? (
          <div className="py-16 text-center text-text-muted font-sans text-xs">
            No choreography scores found.
          </div>
        ) : activeTab === 'all' ? (
          <div className="space-y-3">
            {/* Scene Studies Section (Expanded by default) */}
            {studyScores.length > 0 && (
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
                    {studyScores.length}
                  </span>
                </button>

                {isStudyExpanded && (
                  <div className="space-y-1.5">
                    {studyScores.map((item) => (
                      <ScoreLibraryCard
                        key={item.id}
                        item={item}
                        isActive={item.id === activeSceneId}
                        onSelect={() => handleCardClick(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bundled Blueprints Section (Collapsed by default on mobile) */}
            {blueprintScores.length > 0 && (
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
                    <span>Bundled Blueprints</span>
                  </div>
                  <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-600 dark:text-sky-300 font-mono">
                    {blueprintScores.length}
                  </span>
                </button>

                {isBlueprintExpanded && (
                  <div className="space-y-1.5">
                    {blueprintScores.map((item) => (
                      <ScoreLibraryCard
                        key={item.id}
                        item={item}
                        isActive={item.id === activeSceneId}
                        onSelect={() => handleCardClick(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Custom Projects Section (Expanded by default) */}
            {customScores.length > 0 && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={handleToggleCustomExpanded}
                  aria-expanded={isCustomExpanded}
                  className="w-full px-2 py-1 text-[10px] font-mono font-bold tracking-wider text-text-muted hover:text-text-main uppercase flex items-center justify-between rounded-md hover:bg-surface-subtle transition-colors group select-none cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-text-faint group-hover:text-text-main transition-transform duration-150 ${
                        isCustomExpanded ? 'rotate-0' : '-rotate-90'
                      }`}
                    />
                    <span>Custom Projects</span>
                  </div>
                  <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-600 dark:text-amber-300 font-mono">
                    {customScores.length}
                  </span>
                </button>

                {isCustomExpanded && (
                  <div className="space-y-1.5">
                    {customScores.map((item) => (
                      <ScoreLibraryCard
                        key={item.id}
                        item={item}
                        isActive={item.id === activeSceneId}
                        onSelect={() => handleCardClick(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredScores.map((item) => (
              <ScoreLibraryCard
                key={item.id}
                item={item}
                isActive={item.id === activeSceneId}
                onSelect={() => handleCardClick(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

