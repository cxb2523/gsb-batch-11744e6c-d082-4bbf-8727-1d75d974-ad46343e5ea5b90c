/**
 * Synchronous local storage accessors for StageFlow UI preferences.
 * Safely handles environments where localStorage is disabled or restricted.
 */

import type {
  AppThemeMode,
  DioramaThemeMode,
  LabelDisplayMode,
  LibraryFilterTab,
  SplitPreset,
} from '../types';

const STORAGE_KEYS = {
  SPLIT_PRESET: 'stageflow:ui:split-preset',
  DRAWER_OPEN: 'stageflow:ui:yaml-drawer-open',
  ACTIVE_SCENE_ID: 'stageflow:ui:active-scene-id',
  DEFAULT_SCENE_VERSION: 'stageflow:ui:default-scene-version',
  LABEL_MODE: 'stageflow:ui:label-mode',
  VIEWFINDER_GUIDES: 'stageflow:ui:viewfinder-guides',
  THEME_MODE: 'stageflow:ui:theme-mode',
  DIORAMA_THEME_MODE: 'stageflow:ui:diorama-theme-mode',
  EDIT_MODE: 'stageflow:ui:edit-mode',
  LEFT_SPLIT_PCT: 'stageflow:ui:left-split-pct',
  RIGHT_SPLIT_PCT: 'stageflow:ui:right-split-pct',
  VIDEO_HEIGHT_PCT: 'stageflow:ui:video-height-pct',
  SUBPANEL_COLLAPSED: 'stageflow:ui:subpanel-collapsed',
  EDITOR_WORD_WRAP: 'stageflow:ui:editor-word-wrap',
  DOF_BLUR: 'stageflow:ui:dof-blur',
  LIBRARY_TAB: 'stageflow:ui:library-tab',
  LIBRARY_STUDY_EXPANDED: 'stageflow:ui:library-study-expanded',
  LIBRARY_BLUEPRINT_EXPANDED: 'stageflow:ui:library-blueprint-expanded',
  LIBRARY_CUSTOM_EXPANDED: 'stageflow:ui:library-custom-expanded',
} as const;

export function loadStoredSplitPreset(): SplitPreset | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.SPLIT_PRESET);
    if (val === 'split' || val === 'full') {
      return val;
    }
    // Backward-compatible migration of legacy ratio presets
    if (val === '50-50' || val === '30-70' || val === '70-30') {
      return 'split';
    }
    if (val === '0-100') {
      return 'full';
    }
  } catch {
    // Ignore localStorage access restrictions (e.g. sandboxed iframes)
  }
  return null;
}

export function saveStoredSplitPreset(preset: SplitPreset): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SPLIT_PRESET, preset);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredYamlDrawerOpen(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.DRAWER_OPEN);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredYamlDrawerOpen(isOpen: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DRAWER_OPEN, String(isOpen));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredActiveSceneId(): string | null {
  try {
    const version = localStorage.getItem(STORAGE_KEYS.DEFAULT_SCENE_VERSION);
    if (version !== 'v2') {
      const existing = localStorage.getItem(STORAGE_KEYS.ACTIVE_SCENE_ID);
      // Migrate legacy default ('demo-blueprint') to new default so returning users get Vector Field
      if (existing === 'demo-blueprint' || !existing) {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCENE_ID);
      }
      localStorage.setItem(STORAGE_KEYS.DEFAULT_SCENE_VERSION, 'v2');
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_SCENE_ID);
    }
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_SCENE_ID);
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredActiveSceneId(sceneId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCENE_ID, sceneId);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredLabelMode(): LabelDisplayMode | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.LABEL_MODE);
    if (val === 'all' || val === 'camera-only' || val === 'off') {
      return val;
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredLabelMode(mode: LabelDisplayMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LABEL_MODE, mode);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredViewfinderGuides(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.VIEWFINDER_GUIDES);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredViewfinderGuides(showGuides: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIEWFINDER_GUIDES, String(showGuides));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredThemeMode(): AppThemeMode | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.THEME_MODE);
    if (val === 'auto' || val === 'light' || val === 'warm' || val === 'dark') {
      return val;
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredThemeMode(mode: AppThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME_MODE, mode);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredDioramaThemeMode(): DioramaThemeMode | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.DIORAMA_THEME_MODE);
    if (
      val === 'dark' ||
      val === 'match-app' ||
      val === 'warm' ||
      val === 'light'
    ) {
      return val;
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredDioramaThemeMode(mode: DioramaThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DIORAMA_THEME_MODE, mode);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredEditMode(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.EDIT_MODE);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore storage quota or access errors
  }
  return null;
}

export function saveStoredEditMode(isEdit: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EDIT_MODE, String(isEdit));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredLeftSplitPct(): number | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.LEFT_SPLIT_PCT);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!Number.isNaN(parsed) && parsed >= 15 && parsed <= 50) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage quota or access errors
  }
  return null;
}

export function saveStoredLeftSplitPct(pct: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LEFT_SPLIT_PCT, String(pct));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredRightSplitPct(): number | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.RIGHT_SPLIT_PCT);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!Number.isNaN(parsed) && parsed >= 15 && parsed <= 50) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage quota or access errors
  }
  return null;
}

export function saveStoredRightSplitPct(pct: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.RIGHT_SPLIT_PCT, String(pct));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredVideoHeightPct(): number | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.VIDEO_HEIGHT_PCT);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!Number.isNaN(parsed) && parsed >= 15 && parsed <= 85) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage quota or access errors
  }
  return null;
}

export function saveStoredVideoHeightPct(pct: number): void {
  try {
    localStorage.setItem(STORAGE_KEYS.VIDEO_HEIGHT_PCT, String(pct));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredSubpanelCollapsed(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.SUBPANEL_COLLAPSED);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore storage quota or access errors
  }
  return null;
}

export function saveStoredSubpanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SUBPANEL_COLLAPSED, String(collapsed));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredEditorWordWrap(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.EDITOR_WORD_WRAP);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore storage quota or access errors
  }
  return null;
}

export function saveStoredEditorWordWrap(wrap: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.EDITOR_WORD_WRAP, String(wrap));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredDofBlur(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.DOF_BLUR);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredDofBlur(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DOF_BLUR, String(enabled));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredLibraryTab(): LibraryFilterTab | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.LIBRARY_TAB);
    if (
      val === 'all' ||
      val === 'study' ||
      val === 'blueprint' ||
      val === 'custom'
    ) {
      return val;
    }
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredLibraryTab(tab: LibraryFilterTab): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_TAB, tab);
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredLibraryStudyExpanded(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.LIBRARY_STUDY_EXPANDED);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredLibraryStudyExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LIBRARY_STUDY_EXPANDED, String(expanded));
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredLibraryBlueprintExpanded(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.LIBRARY_BLUEPRINT_EXPANDED);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredLibraryBlueprintExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_BLUEPRINT_EXPANDED,
      String(expanded)
    );
  } catch {
    // Ignore storage quota or access errors
  }
}

export function loadStoredLibraryCustomExpanded(): boolean | null {
  try {
    const val = localStorage.getItem(STORAGE_KEYS.LIBRARY_CUSTOM_EXPANDED);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // Ignore localStorage access restrictions
  }
  return null;
}

export function saveStoredLibraryCustomExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.LIBRARY_CUSTOM_EXPANDED,
      String(expanded)
    );
  } catch {
    // Ignore storage quota or access errors
  }
}



