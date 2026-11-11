import React, { useState, useRef, useEffect } from 'react';
import {
  Moon,
  Sun,
  Monitor,
  Palette,
  Sparkles,
  Box,
  Layout,
} from 'lucide-react';
import type {
  AppThemeCategory,
  AppThemeMode,
  DioramaThemeMode,
} from '../../core/types';
import { UI_TOKENS } from '../tokens/ui';

export interface ThemeSelectorDropdownProps {
  themeMode: AppThemeMode;
  effectiveCategory: AppThemeCategory;
  onSelectThemeMode: (mode: AppThemeMode) => void;
  dioramaThemeMode?: DioramaThemeMode;
  effectiveDioramaCategory?: AppThemeCategory;
  onSelectDioramaThemeMode?: (mode: DioramaThemeMode) => void;
}

const APP_THEME_OPTIONS: Array<{
  id: AppThemeMode;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'warm', label: 'Warm', icon: Sparkles },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'auto', label: 'Auto', icon: Monitor },
];

const DIORAMA_THEME_OPTIONS: Array<{
  id: DioramaThemeMode;
  label: string;
  sublabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'match-app', label: 'Match', sublabel: 'Follows App', icon: Layout },
  { id: 'light', label: 'Light', sublabel: 'Warm Stone', icon: Sun },
  { id: 'warm', label: 'Warm', sublabel: 'Drafting Paper', icon: Sparkles },
  { id: 'dark', label: 'Dark', sublabel: 'Studio (Fixed)', icon: Moon },
];

export const ThemeSelectorDropdown: React.FC<ThemeSelectorDropdownProps> = ({
  themeMode,
  effectiveCategory,
  onSelectThemeMode,
  dioramaThemeMode = 'match-app',
  effectiveDioramaCategory = 'light',
  onSelectDioramaThemeMode,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const activeAppOption =
    APP_THEME_OPTIONS.find((opt) => opt.id === themeMode) ??
    APP_THEME_OPTIONS[0];
  const ActiveIcon = activeAppOption.icon;

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Trigger Button */}
      <button
        type="button"
        aria-label="Theme settings selector"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`${
          isOpen
            ? UI_TOKENS.button.settingsPillActive
            : UI_TOKENS.button.settingsPill
        } flex items-center gap-1.5`}
        title={`Theme: App (${activeAppOption.label}) · Diorama (${dioramaThemeMode})`}
      >
        <ActiveIcon className="w-3.5 h-3.5 text-text-muted" />
        <span className="hidden sm:inline capitalize text-[11px]">
          {activeAppOption.label}
        </span>
      </button>

      {/* Settings Menu Dropdown */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Theme selector options"
          className="absolute top-full right-0 mt-2 w-64 bg-surface rounded-2xl shadow-2xl border border-border-main overflow-hidden z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 text-text-main divide-y divide-border-subtle"
        >
          {/* Header */}
          <div className={UI_TOKENS.dropdown.header}>
            <span className={UI_TOKENS.dropdown.headerText}>Color Themes</span>
            <Palette className="w-3.5 h-3.5 text-text-faint" />
          </div>

          {/* Section 1: App Shell Theme */}
          <div className="p-3 bg-surface-subtle flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Layout className="w-3 h-3 text-text-faint" />
                <span>App Shell</span>
              </span>
              <span className="text-[9px] font-mono text-text-faint capitalize">
                {themeMode === 'auto' ? `Auto (${effectiveCategory})` : themeMode}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 p-0.5 bg-surface-muted rounded-xl border border-border-main">
              {APP_THEME_OPTIONS.map((opt) => {
                const isSelected = themeMode === opt.id;
                const OptIcon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectThemeMode(opt.id)}
                    className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all active:scale-95 cursor-pointer ${
                      isSelected
                        ? 'bg-surface text-text-main shadow-xs ring-1 ring-border-main'
                        : 'text-text-muted hover:text-text-main hover:bg-surface/50'
                    }`}
                    title={`Set App Shell to ${opt.label}`}
                  >
                    <OptIcon className="w-3.5 h-3.5 mb-0.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: 3D Diorama Stage Theme (Decoupled) */}
          {onSelectDioramaThemeMode && (
            <div className="p-3 bg-surface flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-text-muted flex items-center gap-1">
                  <Box className="w-3 h-3 text-text-faint" />
                  <span>3D Diorama Stage</span>
                </span>
                <span className="text-[9px] font-mono text-text-faint capitalize">
                  {dioramaThemeMode === 'match-app'
                    ? `Match (${effectiveDioramaCategory})`
                    : dioramaThemeMode}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-1 p-0.5 bg-surface-muted rounded-xl border border-border-main">
                {DIORAMA_THEME_OPTIONS.map((opt) => {
                  const isSelected = dioramaThemeMode === opt.id;
                  const OptIcon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onSelectDioramaThemeMode(opt.id)}
                      className={`flex flex-col items-center justify-center py-1.5 rounded-lg text-[10px] font-bold capitalize transition-all active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-surface text-text-main shadow-xs ring-1 ring-border-main'
                          : 'text-text-muted hover:text-text-main hover:bg-surface/50'
                      }`}
                      title={`Set 3D Diorama to ${opt.label}: ${opt.sublabel}`}
                    >
                      <OptIcon className="w-3.5 h-3.5 mb-0.5" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <p className="text-[9px] text-text-faint font-sans leading-tight mt-0.5">
                Keep the 3D stage in <strong>Dark</strong> mode while the app shell is Light/Warm, or set to <strong>Match</strong>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
