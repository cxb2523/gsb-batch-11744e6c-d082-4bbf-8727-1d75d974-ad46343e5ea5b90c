/**
 * Top Studio Header Bar for StageFlow.
 * Composes a balanced 3-wing layout:
 * - Left Wing: Brand Identity, File ▾ Dropdown, and Active Score Indicator
 * - Center Stage: Centered Split Layout Segmented Control
 * - Right Wing: Theme Mode Dropdown, Score Library Button, and YAML Drawer Toggle
 */

import React, { useState, useEffect } from 'react';
import { Book, RotateCcw, Maximize, Minimize, Info } from 'lucide-react';
import type { ScoreCatalogItem } from '../core/scoreCatalog';
import type {
  AppThemeCategory,
  AppThemeMode,
  DioramaThemeMode,
  SplitPreset,
  StoragePersistenceStatus,
} from '../core/types';
import { UI_TOKENS } from './tokens/ui';
import { FileMenuDropdown } from './header/FileMenuDropdown';
import { LayoutSegmentedControl } from './header/LayoutSegmentedControl';
import { ActiveScoreIndicator } from './header/ActiveScoreIndicator';
import { ThemeSelectorDropdown } from './header/ThemeSelectorDropdown';
import type { FilterTab } from './ScoreLibraryModal';

export type { SplitPreset, StoragePersistenceStatus };

export interface WorkspaceHeaderProps {
  catalog: ScoreCatalogItem[];
  activeSceneId: string;
  splitPreset: SplitPreset;
  isEditMode: boolean;
  storageStatus?: StoragePersistenceStatus;
  isLibraryOpen?: boolean;
  isInfoOpen?: boolean;
  themeMode?: AppThemeMode;
  effectiveThemeCategory?: AppThemeCategory;
  dioramaThemeMode?: DioramaThemeMode;
  effectiveDioramaCategory?: AppThemeCategory;
  onSelectScene: (sceneId: string) => void;
  onSelectSplitPreset: (preset: SplitPreset) => void;
  onToggleEditMode: () => void;
  onUploadFiles: (files: FileList) => void;
  onExportActiveScore: () => void;
  onOpenLibrary: (tab?: FilterTab) => void;
  onOpenInfo?: () => void;
  onResetLayout?: () => void;
  onSelectThemeMode?: (mode: AppThemeMode) => void;
  onSelectDioramaThemeMode?: (mode: DioramaThemeMode) => void;
  onCreateBlankProject?: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  catalog,
  activeSceneId,
  splitPreset,
  isEditMode,
  storageStatus = 'bundled',
  isLibraryOpen = false,
  isInfoOpen = false,
  themeMode = 'light',
  effectiveThemeCategory = 'light',
  dioramaThemeMode = 'match-app',
  effectiveDioramaCategory = 'light',
  onSelectSplitPreset,
  onToggleEditMode,
  onUploadFiles,
  onExportActiveScore,
  onOpenLibrary,
  onOpenInfo,
  onResetLayout,
  onSelectThemeMode,
  onSelectDioramaThemeMode,
  onCreateBlankProject,
}) => {
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const customScores = catalog.filter((item) => item.isCustom);
  const isDark = effectiveThemeCategory === 'dark';

  return (
    <header className={UI_TOKENS.layout.appHeader}>
      {/* Left Wing: Brand Identity, File Menu & Active Score Indicator */}
      <div className="flex items-center gap-2 min-w-0 flex-1 md:flex-initial md:max-w-[calc(50%-80px)]">
        {/* Brand Identity: Desktop Horizontal Logo vs Mobile Rounded Box Icon */}
        {/* Mobile (< md): Theme-adaptive rounded box icon */}
        <div className="flex md:hidden items-center shrink-0">
          <div
            className="w-8 h-8 rounded-xl bg-surface-muted border border-border-main flex items-center justify-center shadow-2xs overflow-hidden p-1 shrink-0"
            title="StageFlow by Taruma Sakti | 3D Camera-Blocking & Scene Choreography Diorama"
          >
            <img
              src="/StageFlow - ICON - Square.png"
              alt="StageFlow Icon"
              className={`w-full h-full object-contain ${isDark ? '' : 'invert'}`}
            />
          </div>
        </div>

        {/* Desktop (>= md): Full Horizontal Brand Logo */}
        <div className="hidden md:flex items-center shrink-0">
          <img
            src={
              isDark
                ? '/StageFlow - LOGO - WHITE.png'
                : '/StageFlow - LOGO - BLACK.png'
            }
            alt="StageFlow by Taruma Sakti | 3D Camera-Blocking & Scene Choreography Diorama"
            title="StageFlow by Taruma Sakti | 3D Camera-Blocking & Scene Choreography Diorama"
            className="h-7 w-auto max-w-[145px] object-contain select-none"
          />
        </div>

        <div className="h-5 w-px bg-border-main shrink-0 hidden md:block" />

        {/* Tiered File Dropdown Menu (Hidden on mobile < md) */}
        <div className="hidden md:block">
          <FileMenuDropdown
            isOpen={isFileMenuOpen}
            customScoresCount={customScores.length}
            onToggle={() => setIsFileMenuOpen((prev) => !prev)}
            onClose={() => setIsFileMenuOpen(false)}
            onUploadFiles={onUploadFiles}
            onExportActiveScore={onExportActiveScore}
            onCreateBlankScore={onCreateBlankProject}
            onOpenLibrary={onOpenLibrary}
          />
        </div>

        {/* Active Score Context Chip (Clickable to Open Library) */}
        <ActiveScoreIndicator
          catalog={catalog}
          activeSceneId={activeSceneId}
          storageStatus={storageStatus}
          onOpenLibrary={() => onOpenLibrary()}
        />
      </div>

      {/* Center Stage: Mathematically Centered at 50% of Header Width (Tablets & Desktop) */}
      <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center pointer-events-auto">
        <LayoutSegmentedControl
          splitPreset={splitPreset}
          onSelectSplitPreset={onSelectSplitPreset}
          isEditMode={isEditMode}
          onToggleEditMode={onToggleEditMode}
        />
      </div>

      {/* Right Wing: Theme Mode Dropdown, Score Library Button & Fullscreen/Reset Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Theme Mode Selector Dropdown */}
        {onSelectThemeMode && (
          <ThemeSelectorDropdown
            themeMode={themeMode}
            effectiveCategory={effectiveThemeCategory}
            onSelectThemeMode={onSelectThemeMode}
            dioramaThemeMode={dioramaThemeMode}
            effectiveDioramaCategory={effectiveDioramaCategory}
            onSelectDioramaThemeMode={onSelectDioramaThemeMode}
          />
        )}

        {/* Standalone Library Button */}
        <button
          type="button"
          onClick={() => onOpenLibrary()}
          className={
            isLibraryOpen
              ? UI_TOKENS.button.libraryPopActive
              : UI_TOKENS.button.libraryPop
          }
          title="Browse Choreography Score Library (Blueprints & Custom Scores)"
        >
          <Book className="w-3.5 h-3.5 shrink-0" />
          <span className="font-bold tracking-wide">Library</span>
        </button>

        {/* Reset Layout Dimensions Button (Desktop & Tablets >= md only) */}
        {onResetLayout && (
          <button
            type="button"
            onClick={onResetLayout}
            className={`${UI_TOKENS.button.filePill} hidden md:flex`}
            title="Reset workspace layout and split widths to default (30/40/30)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-text-muted" />
            <span className="hidden sm:inline">Reset Layout</span>
          </button>
        )}

        {/* Native Fullscreen Toggle Button (Mobile & Desktop) */}
        <button
          type="button"
          onClick={handleToggleFullscreen}
          className={UI_TOKENS.button.filePill}
          title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          aria-label={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
        >
          {isFullscreen ? (
            <Minimize className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <Maximize className="w-3.5 h-3.5 text-text-muted" />
          )}
        </button>

        {/* Standalone About / Info Modal Button (Top Right Corner) */}
        {onOpenInfo && (
          <button
            type="button"
            onClick={onOpenInfo}
            className={
              isInfoOpen
                ? UI_TOKENS.button.filePillActive
                : UI_TOKENS.button.filePill
            }
            title="About StageFlow, Shortcuts & Documentation"
            aria-label="About StageFlow, Shortcuts & Documentation"
          >
            <Info className="w-3.5 h-3.5 text-text-muted" />
          </button>
        )}
      </div>
    </header>
  );
};
