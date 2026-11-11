/**
 * Custom hook encapsulating resizable 3-column studio layout state,
 * subpanel expansion, edit mode toggles, and localStorage persistence.
 * Layer 3 hook.
 */

import { useState, useCallback } from 'react';
import type { SplitPreset, ToastNotification } from '../core/types';
import {
  loadStoredEditMode,
  loadStoredLeftSplitPct,
  loadStoredRightSplitPct,
  loadStoredSplitPreset,
  loadStoredSubpanelCollapsed,
  loadStoredVideoHeightPct,
  saveStoredEditMode,
  saveStoredLeftSplitPct,
  saveStoredRightSplitPct,
  saveStoredSplitPreset,
  saveStoredSubpanelCollapsed,
  saveStoredVideoHeightPct,
} from '../core/storage/localStorageUi';

export interface UseWorkspaceLayoutOptions {
  onNotify?: (message: string, type?: ToastNotification['type']) => void;
}

export function useWorkspaceLayout(options?: UseWorkspaceLayoutOptions) {
  const [splitPreset, setSplitPresetState] = useState<SplitPreset>(
    () => loadStoredSplitPreset() ?? 'split'
  );

  const [isEditMode, setIsEditModeState] = useState<boolean>(
    () => loadStoredEditMode() ?? false
  );

  const [leftSplitPct, setLeftSplitPctState] = useState<number>(
    () => loadStoredLeftSplitPct() ?? 30
  );

  const [rightSplitPct, setRightSplitPctState] = useState<number>(
    () => loadStoredRightSplitPct() ?? 30
  );

  const [videoHeightPct, setVideoHeightPctState] = useState<number>(
    () => loadStoredVideoHeightPct() ?? 45
  );

  const [isSubpanelCollapsed, setIsSubpanelCollapsedState] = useState<boolean>(
    () => loadStoredSubpanelCollapsed() ?? false
  );

  const handleSelectSplitPreset = useCallback((preset: SplitPreset) => {
    setSplitPresetState(preset);
    saveStoredSplitPreset(preset);
  }, []);

  const handleToggleEditMode = useCallback(() => {
    setIsEditModeState((prev) => {
      const next = !prev;
      saveStoredEditMode(next);
      if (next) {
        setIsSubpanelCollapsedState(false);
        saveStoredSubpanelCollapsed(false);
      }
      return next;
    });
  }, []);

  const openEditMode = useCallback(() => {
    setIsEditModeState(true);
    saveStoredEditMode(true);
    setIsSubpanelCollapsedState(false);
    saveStoredSubpanelCollapsed(false);
  }, []);

  const handleToggleSubpanelCollapse = useCallback(() => {
    setIsSubpanelCollapsedState((prev) => {
      const next = !prev;
      saveStoredSubpanelCollapsed(next);
      return next;
    });
  }, []);

  const handleLeftSplitChange = useCallback((pct: number) => {
    setLeftSplitPctState(pct);
    saveStoredLeftSplitPct(pct);
  }, []);

  const handleRightSplitChange = useCallback((pct: number) => {
    setRightSplitPctState(pct);
    saveStoredRightSplitPct(pct);
  }, []);

  const handleVideoHeightChange = useCallback((pct: number) => {
    setVideoHeightPctState(pct);
    saveStoredVideoHeightPct(pct);
  }, []);

  const handleResetLayout = useCallback(() => {
    setSplitPresetState('split');
    saveStoredSplitPreset('split');

    setLeftSplitPctState(30);
    saveStoredLeftSplitPct(30);

    setRightSplitPctState(30);
    saveStoredRightSplitPct(30);

    setVideoHeightPctState(45);
    saveStoredVideoHeightPct(45);

    setIsSubpanelCollapsedState(false);
    saveStoredSubpanelCollapsed(false);

    options?.onNotify?.('Reset workspace layout to default (30/40/30)', 'info');
  }, [options]);

  return {
    splitPreset,
    isEditMode,
    leftSplitPct,
    rightSplitPct,
    videoHeightPct,
    isSubpanelCollapsed,
    handleSelectSplitPreset,
    handleToggleEditMode,
    openEditMode,
    handleToggleSubpanelCollapse,
    handleLeftSplitChange,
    handleRightSplitChange,
    handleVideoHeightChange,
    handleResetLayout,
  };
}
