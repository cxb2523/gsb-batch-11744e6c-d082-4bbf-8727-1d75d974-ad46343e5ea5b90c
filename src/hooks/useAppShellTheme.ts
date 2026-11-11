import { useState, useEffect, useCallback } from 'react';
import type { AppThemeCategory, AppThemeMode, DioramaThemeMode } from '../core/types';
import {
  loadStoredDioramaThemeMode,
  loadStoredThemeMode,
  saveStoredDioramaThemeMode,
  saveStoredThemeMode,
} from '../core/storage/localStorageUi';

/**
 * Suppresses CSS transitions across the entire DOM momentarily during theme or mode changes.
 * This eliminates choppy paint transitions and frame drops caused by global CSS variable cascades.
 */
export function disableTransitionsTemporarily(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.add('disable-theme-transitions');

  // Force synchronous reflow so that styles apply with transitions disabled
  void root.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove('disable-theme-transitions');
    });
  });
}

export function resolveSystemTheme(): AppThemeCategory {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light'; // StageFlow defaults to light theme
}

export function resolveEffectiveDioramaCategory(
  dioramaThemeMode: DioramaThemeMode,
  effectiveAppCategory: AppThemeCategory
): AppThemeCategory {
  return dioramaThemeMode === 'match-app'
    ? effectiveAppCategory
    : dioramaThemeMode;
}

export function useAppShellTheme() {
  const [themeMode, setThemeModeState] = useState<AppThemeMode>(() => {
    return loadStoredThemeMode() ?? 'light';
  });

  const [dioramaThemeMode, setDioramaThemeModeState] =
    useState<DioramaThemeMode>(() => {
      return loadStoredDioramaThemeMode() ?? 'match-app';
    });

  const [systemCategory, setSystemCategory] = useState<AppThemeCategory>(
    resolveSystemTheme
  );

  // Listen to system theme changes if mode is 'auto'
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemCategory(e.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const setThemeMode = useCallback((mode: AppThemeMode) => {
    setThemeModeState(mode);
    saveStoredThemeMode(mode);
  }, []);

  const setDioramaThemeMode = useCallback((mode: DioramaThemeMode) => {
    setDioramaThemeModeState(mode);
    saveStoredDioramaThemeMode(mode);
  }, []);

  const cycleThemeMode = useCallback(() => {
    const modes: AppThemeMode[] = ['light', 'warm', 'dark', 'auto'];
    const nextIndex = (modes.indexOf(themeMode) + 1) % modes.length;
    setThemeMode(modes[nextIndex]);
  }, [themeMode, setThemeMode]);

  const effectiveCategory: AppThemeCategory =
    themeMode === 'auto' ? systemCategory : themeMode;

  const effectiveDioramaCategory: AppThemeCategory =
    resolveEffectiveDioramaCategory(dioramaThemeMode, effectiveCategory);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    disableTransitionsTemporarily();
    document.documentElement.setAttribute(
      'data-theme-category',
      effectiveCategory
    );
    document.body.setAttribute('data-theme-category', effectiveCategory);
  }, [effectiveCategory]);

  return {
    themeMode,
    setThemeMode,
    cycleThemeMode,
    effectiveCategory,
    dioramaThemeMode,
    setDioramaThemeMode,
    effectiveDioramaCategory,
  };
}
