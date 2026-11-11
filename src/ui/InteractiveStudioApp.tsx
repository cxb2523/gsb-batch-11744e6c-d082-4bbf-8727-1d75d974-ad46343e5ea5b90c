/**
 * Interactive 3D Choreography Studio Orchestrator.
 * Connects the Scene Catalog, Universal Media Clock, 60fps Dual-Tier Frame Loop,
 * Resizable Split Workspace, 3D Blueprint Diorama, Live YAML Score Drawer,
 * and Persistent Storage (IndexedDB scores + localStorage UI preferences).
 * Decomposed from App.tsx to enable true bundle code-splitting between
 * 3D Three.js Studio runtime and lightweight Markdown/KaTeX documentation modes.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { CameraPresetType } from '../stage/cameraPresets';
import type { ScoreDiagnostic, StageScore } from '../core/types';
import {
  INITIAL_CATALOG_ITEMS,
  findCatalogItem,
  isBundledSceneId,
  type ScoreCatalogItem,
} from '../core/scoreCatalog';
import { parseStageScore } from '../core/scoreParser';
import {
  loadStoredActiveSceneId,
  saveStoredActiveSceneId,
} from '../core/storage/localStorageUi';
import { saveStoredScore } from '../core/storage/scoreDb';
import {
  computeYamlContentHash,
  downloadYamlBlob,
  findDuplicateOrConflictingCustomScore,
  generateCustomScoreId,
  updateScoreYamlId,
  updateScoreYamlTitle,
} from '../core/scoreYamlUtils';
import {
  fetchRemoteScoreYaml,
  parseInitialUrlQueryParams,
} from '../core/scoreUrlLoader';
import {
  ConfirmRemoteScoreModal,
  type RemoteModalMode,
} from './ConfirmRemoteScoreModal';
import { useMediaClock } from '../hooks/useMediaClock';
import { useStageFrameLoop } from '../hooks/useStageFrameLoop';
import { useFileDropLoader } from '../hooks/useFileDropLoader';
import { useScorePersistence } from '../hooks/useScorePersistence';
import { useAppShellTheme } from '../hooks/useAppShellTheme';
import { useWorkspaceLayout } from '../hooks/useWorkspaceLayout';
import { useStudioDisplaySettings } from '../hooks/useStudioDisplaySettings';
import { useToastNotifications } from '../hooks/useToastNotifications';
import { DioramaCanvas } from '../stage/DioramaCanvas';
import { WorkspaceHeader } from './WorkspaceHeader';
import { ResizableSplitWorkspace } from './ResizableSplitWorkspace';
import { UniversalVideoViewport } from './UniversalVideoViewport';
import { StageCamMonitorCanvas } from '../stage/StageCamMonitorCanvas';
import {
  VideoWorkspaceSubpanel,
  type SubpanelViewMode,
} from './left-panel/VideoWorkspaceSubpanel';
import { YamlStudioPanel } from './editor';
import { ConfirmResetModal } from './ConfirmResetModal';
import { ScoreLibraryModal, type FilterTab } from './ScoreLibraryModal';
import { MobileScoreLibraryModal } from './library/MobileScoreLibraryModal';
import { AppInfoModal } from './AppInfoModal';
import { useIsMobile } from '../hooks/useIsMobile';
import { ToastContainer } from './ToastContainer';
import { DirectorialTransportBar } from './DirectorialTransportBar';
import { DioramaOverlayContainer } from './DioramaOverlayContainer';

export const InteractiveStudioApp: React.FC = () => {
  const theme = useAppShellTheme();
  const { toasts, showToast, dismissToast } = useToastNotifications();
  const layout = useWorkspaceLayout({ onNotify: showToast });
  const display = useStudioDisplaySettings();
  const isMobile = useIsMobile();
  const [subpanelViewMode, setSubpanelViewMode] =
    useState<SubpanelViewMode>('brief');

  const [catalog, setCatalog] = useState<ScoreCatalogItem[]>(
    INITIAL_CATALOG_ITEMS
  );

  // Synchronously hydrate active scene id from localStorage or ?score= / ?scene= query param
  const [activeSceneId, setActiveSceneIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const { scoreId } = parseInitialUrlQueryParams(window.location.search);
      if (scoreId) {
        const matched = findCatalogItem(scoreId, INITIAL_CATALOG_ITEMS);
        if (matched) return matched.id;
        return scoreId; // preserve pointer until storage hydration reconciles
      }
    }
    const stored = loadStoredActiveSceneId();
    return stored || INITIAL_CATALOG_ITEMS[0].id;
  });

  const setActiveSceneId = useCallback((id: string) => {
    setActiveSceneIdState(id);
    saveStoredActiveSceneId(id);
  }, []);

  // Score Library Modal state & initial category tab
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryInitialTab, setLibraryInitialTab] = useState<
    FilterTab | undefined
  >(undefined);

  // App Info Modal state
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  // Global '?' shortcut to open Info / Shortcuts Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setIsInfoOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Measure diorama pane width to toggle between standard and compact header (<768px)
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [dioramaWidth, setDioramaWidth] = useState<number>(1000);

  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setDioramaWidth(rect.width);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isNarrowDiorama = dioramaWidth < 768;

  const initialItem =
    INITIAL_CATALOG_ITEMS.find((item) => item.id === activeSceneId) ??
    INITIAL_CATALOG_ITEMS[0];

  const [rawYaml, setRawYaml] = useState<string>(initialItem.rawYaml);
  const [activeScore, setActiveScore] = useState(initialItem.score);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [parseDiagnostics, setParseDiagnostics] = useState<
    ScoreDiagnostic[] | undefined
  >(undefined);
  const [videoOverrideUrl, setVideoOverrideUrl] = useState<string | null>(null);

  // Sync YAML score `optics.dof_blur` preference when a score explicitly opts in
  useEffect(() => {
    if (activeScore.optics?.dofBlur === true) {
      display.setDofBlurEnabled(true);
    }
  }, [activeScore.optics?.dofBlur, display.setDofBlurEnabled]);

  const handleExportScore = useCallback(
    (item: ScoreCatalogItem) => {
      downloadYamlBlob(`${item.id}.yaml`, item.rawYaml);
      showToast(`Exported score "${item.id}.yaml"`, 'success');
    },
    [showToast]
  );

  const handleExportActiveScore = useCallback(() => {
    handleExportScore({
      id: activeSceneId,
      title: activeScore.title,
      rawYaml,
      score: activeScore,
      category: 'custom',
      isCustom: false,
    });
  }, [activeSceneId, activeScore, rawYaml, handleExportScore]);

  // IndexedDB Score Persistence Hook (Hydration, Forking, Draft Auto-saving, Project Lifecycle)
  const [remoteModalState, setRemoteModalState] = useState<{
    isOpen: boolean;
    mode: RemoteModalMode;
    targetUrl?: string;
    existingItem?: ScoreCatalogItem;
    sourceFileName?: string;
    pendingYaml?: string;
    pendingScore?: StageScore;
    isLoading?: boolean;
  }>({
    isOpen: false,
    mode: 'url-import',
  });

  const handleScoreNotFound = useCallback(
    (requestedId: string) => {
      showToast(
        `Score "${requestedId}" not found in library; loaded default score`,
        'info'
      );
    },
    [showToast]
  );

  const handleOpenedExistingScore = useCallback(
    (title: string) => {
      showToast(`Opened existing project "${title}" from library`, 'info');
    },
    [showToast]
  );

  const handlePendingRemoteUrl = useCallback(
    (
      url: string,
      status: {
        kind: 'new' | 'identical' | 'conflict';
        existingItem?: ScoreCatalogItem;
      }
    ) => {
      if (status.kind === 'identical') {
        return;
      }
      if (status.kind === 'conflict' && status.existingItem) {
        setRemoteModalState({
          isOpen: true,
          mode: 'url-conflict',
          targetUrl: url,
          existingItem: status.existingItem,
          isLoading: false,
        });
      } else {
        setRemoteModalState({
          isOpen: true,
          mode: 'url-import',
          targetUrl: url,
          isLoading: false,
        });
      }
    },
    []
  );

  const scorePersistence = useScorePersistence({
    catalog,
    activeSceneId,
    rawYaml,
    setCatalog,
    setActiveSceneId,
    setRawYaml,
    setActiveScore,
    onClearVideoOverride: () => setVideoOverrideUrl(null),
    onScoreNotFound: handleScoreNotFound,
    onPendingRemoteUrl: handlePendingRemoteUrl,
    onOpenedExistingScore: handleOpenedExistingScore,
  });

  // 1. Universal Media Clock (Local HTML5 Video, YouTube IFrame, or Procedural Slate)
  const mediaClock = useMediaClock(activeScore, videoOverrideUrl);

  // 2. Dual-Tier 60fps Frame Evaluation Loop
  const stageLoop = useStageFrameLoop(
    activeScore,
    mediaClock.driverRef,
    mediaClock.loopActiveShot,
    mediaClock.isPlaying,
    mediaClock.lastManualSeekIdRef
  );

  const cameraPresetActionRef = useRef<{
    type: CameraPresetType;
    id: number;
  } | null>(null);

  const handleSelectCameraPreset = useCallback(
    (preset: CameraPresetType) => {
      if (preset === 'reset') {
        stageLoop.setCameraMode('scripted');
      } else {
        stageLoop.setCameraMode('free');
      }
      cameraPresetActionRef.current = { type: preset, id: Date.now() };
    },
    [stageLoop]
  );

  // Switch between catalog scenes
  const handleSelectScene = useCallback(
    (sceneId: string) => {
      const found = catalog.find((item) => item.id === sceneId);
      if (!found) return;
      mediaClock.pause();
      setActiveSceneId(found.id);
      setRawYaml(found.rawYaml);
      setActiveScore(found.score);
      setParseError(null);
      setParseWarning(null);
      setParseDiagnostics(undefined);
      setVideoOverrideUrl(null);
      mediaClock.seek(0);
    },
    [catalog, mediaClock, setActiveSceneId]
  );

  // Live YAML editing in the Inspector Drawer (custom projects only)
  const handleChangeYaml = useCallback(
    (nextYaml: string) => {
      setRawYaml(nextYaml);
      const result = parseStageScore(nextYaml, activeSceneId);
      if (result.score) {
        setActiveScore(result.score);
        setParseError(null);
        setParseWarning(result.warning ?? null);
        setParseDiagnostics(undefined);

        // If YAML score specifies a video URL or changed it, clear ephemeral video override
        if (
          result.score.videoUrl &&
          result.score.videoUrl !== 'procedural://demo'
        ) {
          setVideoOverrideUrl(null);
        }

        // Auto-save draft to IndexedDB (debounced)
        scorePersistence.saveYamlDraftDebounced(nextYaml, result.score);
      } else {
        setParseError(result.error);
        setParseWarning(null);
        setParseDiagnostics(result.diagnostics);
      }
    },
    [activeSceneId, scorePersistence.saveYamlDraftDebounced]
  );

  const handleForkScore = useCallback(async () => {
    const forked = await scorePersistence.forkScoreAsCustom(activeSceneId);
    if (forked) {
      showToast(`Forked "${forked.title}" as Custom Project`, 'success');
    }
  }, [activeSceneId, scorePersistence.forkScoreAsCustom, showToast]);

  const handleCloseRemoteModal = useCallback(() => {
    setRemoteModalState((prev) => ({
      ...prev,
      isOpen: false,
      isLoading: false,
      pendingYaml: undefined,
      pendingScore: undefined,
    }));
  }, []);

  const handleExecuteRemoteImport = useCallback(
    async (
      targetUrl: string,
      asNewCopy = false,
      overwriteItem?: ScoreCatalogItem
    ) => {
      setRemoteModalState((prev) => ({ ...prev, isLoading: true }));
      try {
        showToast('Fetching remote score...', 'info');
        const result = await fetchRemoteScoreYaml(targetUrl);
        const hash = computeYamlContentHash(result.rawYaml);

        let finalId = overwriteItem
          ? overwriteItem.id
          : generateCustomScoreId(result.fallbackId);
        let finalTitle = result.score.title;

        if (asNewCopy && overwriteItem) {
          finalTitle = `${overwriteItem.title} (Remote)`;
          finalId = generateCustomScoreId(result.fallbackId);
        }

        let finalYaml = result.rawYaml;
        if (isBundledSceneId(finalId) || asNewCopy || !overwriteItem) {
          finalYaml = updateScoreYamlId(finalYaml, finalId);
          if (asNewCopy) {
            finalYaml = updateScoreYamlTitle(finalYaml, finalTitle);
          }
        }

        const finalParsed = parseStageScore(finalYaml, finalId);
        const resolvedScore = finalParsed.score ?? result.score;

        const newItem: ScoreCatalogItem = {
          id: finalId,
          title: finalTitle,
          subtitle: resolvedScore.subtitle,
          category: 'custom',
          rawYaml: finalYaml,
          score: resolvedScore,
          isCustom: true,
          contentHash: hash,
          originalContentHash: hash,
          sourceUrl: targetUrl,
          sourceFileName: result.fileName,
        };

        await saveStoredScore({
          id: newItem.id,
          title: newItem.title,
          subtitle: newItem.subtitle,
          rawYaml: finalYaml,
          isCustom: true,
          updatedAt: Date.now(),
          contentHash: hash,
          originalContentHash: hash,
          sourceUrl: targetUrl,
          sourceFileName: result.fileName,
        });

        setCatalog((prev) => {
          const filtered = prev.filter((item) => item.id !== newItem.id);
          return [...filtered, newItem];
        });

        setActiveSceneId(newItem.id);
        setRawYaml(finalYaml);
        setActiveScore(resolvedScore);
        setParseError(null);
        setParseWarning(finalParsed.warning ?? result.warning ?? null);
        setParseDiagnostics(undefined);
        setVideoOverrideUrl(null);
        mediaClock.seek(0);

        handleCloseRemoteModal();
        showToast(
          overwriteItem && !asNewCopy
            ? `Updated "${newItem.title}" from remote score`
            : `Imported "${newItem.title}" into Custom Projects`,
          'success'
        );
      } catch (err: unknown) {
        setRemoteModalState((prev) => ({ ...prev, isLoading: false }));
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Failed to load remote score: ${msg}`, 'error');
      }
    },
    [handleCloseRemoteModal, mediaClock, setActiveSceneId, showToast]
  );

  const handleResolveFileConflict = useCallback(
    async (action: 'overwrite' | 'copy' | 'keep') => {
      if (
        action === 'keep' ||
        !remoteModalState.existingItem ||
        !remoteModalState.pendingYaml
      ) {
        handleCloseRemoteModal();
        return;
      }

      const existing = remoteModalState.existingItem;
      const yaml = remoteModalState.pendingYaml;
      const parsed =
        remoteModalState.pendingScore ??
        parseStageScore(yaml, existing.id).score;
      if (!parsed) {
        handleCloseRemoteModal();
        return;
      }

      const hash = computeYamlContentHash(yaml);

      if (action === 'overwrite') {
        const finalYaml = updateScoreYamlId(yaml, existing.id);
        const finalParsed = parseStageScore(finalYaml, existing.id);
        const resolvedScore = finalParsed.score ?? parsed;

        const updatedItem: ScoreCatalogItem = {
          ...existing,
          title: resolvedScore.title,
          subtitle: resolvedScore.subtitle,
          rawYaml: finalYaml,
          score: resolvedScore,
          contentHash: hash,
          originalContentHash: hash,
          sourceFileName:
            remoteModalState.sourceFileName ?? existing.sourceFileName,
        };

        await saveStoredScore({
          id: existing.id,
          title: updatedItem.title,
          subtitle: updatedItem.subtitle,
          rawYaml: finalYaml,
          isCustom: true,
          updatedAt: Date.now(),
          contentHash: hash,
          originalContentHash: hash,
          sourceFileName: updatedItem.sourceFileName,
          sourceUrl: existing.sourceUrl,
        });

        setCatalog((prev) =>
          prev.map((item) => (item.id === existing.id ? updatedItem : item))
        );
        setActiveSceneId(existing.id);
        setRawYaml(finalYaml);
        setActiveScore(resolvedScore);
        mediaClock.seek(0);
        handleCloseRemoteModal();
        showToast(
          `Updated project "${updatedItem.title}" with dropped file`,
          'success'
        );
      } else if (action === 'copy') {
        const fallbackId =
          remoteModalState.sourceFileName?.replace(/\.(yaml|yml|json)$/i, '') ||
          existing.id;
        const newId = generateCustomScoreId(fallbackId);
        const newTitle = `${parsed.title || existing.title} (Copy)`;
        let finalYaml = updateScoreYamlId(yaml, newId);
        finalYaml = updateScoreYamlTitle(finalYaml, newTitle);

        const finalParsed = parseStageScore(finalYaml, newId);
        const resolvedScore = finalParsed.score ?? parsed;

        const newItem: ScoreCatalogItem = {
          id: newId,
          title: newTitle,
          subtitle: resolvedScore.subtitle,
          category: 'custom',
          rawYaml: finalYaml,
          score: resolvedScore,
          isCustom: true,
          contentHash: hash,
          originalContentHash: hash,
          sourceFileName: remoteModalState.sourceFileName,
        };

        await saveStoredScore({
          id: newItem.id,
          title: newItem.title,
          subtitle: newItem.subtitle,
          rawYaml: finalYaml,
          isCustom: true,
          updatedAt: Date.now(),
          contentHash: hash,
          originalContentHash: hash,
          sourceFileName: newItem.sourceFileName,
        });

        setCatalog((prev) => [...prev, newItem]);
        setActiveSceneId(newItem.id);
        setRawYaml(finalYaml);
        setActiveScore(resolvedScore);
        mediaClock.seek(0);
        handleCloseRemoteModal();
        showToast(
          `Imported "${newItem.title}" as new Custom Project`,
          'success'
        );
      }
    },
    [
      handleCloseRemoteModal,
      mediaClock,
      remoteModalState,
      setActiveSceneId,
      showToast,
    ]
  );

  // Drag-and-drop / File picker handlers for custom .yaml and .mp4 files
  const handleLoadYamlFile = useCallback(
    (yamlText: string, fileName: string) => {
      const fallbackId = fileName.replace(/\.(yaml|yml|json)$/i, '');
      const parsed = parseStageScore(yamlText, fallbackId);
      if (!parsed.score) {
        setRawYaml(yamlText);
        setParseError(parsed.error);
        setParseWarning(null);
        setParseDiagnostics(parsed.diagnostics);
        layout.openEditMode();
        showToast(
          `Failed to parse YAML: ${parsed.error ?? 'Syntax error'}`,
          'error'
        );
        return;
      }

      // Check against existing Custom Projects using Unified Content-Hash Matcher
      const customItems = catalog.filter((c) => c.isCustom);
      const match = findDuplicateOrConflictingCustomScore(
        {
          rawYaml: yamlText,
          id: parsed.score.id,
          sourceFileName: fileName,
        },
        customItems
      );

      // Case 1: Identical content hash match -> Open existing instantly with zero duplicate!
      if (match.kind === 'identical') {
        const existing = match.existingItem;
        setActiveSceneId(existing.id);
        setRawYaml(existing.rawYaml);
        setActiveScore(existing.score);
        setParseError(null);
        setParseWarning(null);
        setParseDiagnostics(undefined);
        setVideoOverrideUrl(null);
        mediaClock.seek(0);
        showToast(
          `Opened existing project "${existing.title}" (identical score already in library)`,
          'info'
        );
        return;
      }

      // Case 2: Identity match with differing content -> Open conflict modal
      if (match.kind === 'conflict') {
        setRemoteModalState({
          isOpen: true,
          mode: 'file-conflict',
          existingItem: match.existingItem,
          sourceFileName: fileName,
          pendingYaml: yamlText,
          pendingScore: parsed.score,
          isLoading: false,
        });
        return;
      }

      // Case 3: Brand new score -> Save as new Custom Project
      let finalId = parsed.score.id;
      let finalYaml = yamlText;
      let wasBundledConflict = false;

      // Auto-fork collision protection: never overwrite bundled presets or duplicate IDs
      if (isBundledSceneId(finalId) || catalog.some((c) => c.id === finalId)) {
        wasBundledConflict = true;
        finalId = generateCustomScoreId(fallbackId || finalId);
        finalYaml = updateScoreYamlId(finalYaml, finalId);
      }

      const finalParsed = parseStageScore(finalYaml, finalId);
      const resolvedScore = finalParsed.score ?? parsed.score;
      const hash = computeYamlContentHash(finalYaml);

      const newItem: ScoreCatalogItem = {
        id: finalId,
        title: resolvedScore.title,
        subtitle: resolvedScore.subtitle,
        category: 'custom',
        rawYaml: finalYaml,
        score: resolvedScore,
        isCustom: true,
        contentHash: hash,
        originalContentHash: hash,
        sourceFileName: fileName,
      };

      setCatalog((prev) => {
        const filtered = prev.filter((item) => item.id !== newItem.id);
        return [...filtered, newItem];
      });
      setActiveSceneId(newItem.id);
      setRawYaml(finalYaml);
      setActiveScore(resolvedScore);
      setParseError(null);
      setParseWarning(finalParsed.warning ?? parsed.warning ?? null);
      setParseDiagnostics(undefined);
      setVideoOverrideUrl(null);
      mediaClock.seek(0);

      // Persist custom imported score to IndexedDB
      saveStoredScore({
        id: newItem.id,
        title: newItem.title,
        subtitle: newItem.subtitle,
        rawYaml: finalYaml,
        isCustom: true,
        updatedAt: Date.now(),
        contentHash: hash,
        originalContentHash: hash,
        sourceFileName: fileName,
      });

      if (wasBundledConflict) {
        showToast(
          `Bundled ID detected: imported "${resolvedScore.title}" as new Custom Project`,
          'info'
        );
      } else {
        showToast(
          `Imported "${resolvedScore.title}" into Custom Projects`,
          'success'
        );
      }
    },
    [catalog, layout, mediaClock, setActiveSceneId, showToast]
  );

  const handleLoadVideoBlobUrl = useCallback(
    (blobUrl: string) => {
      setVideoOverrideUrl(blobUrl);
      mediaClock.seek(0);
      showToast('Loaded local video override', 'info');
    },
    [mediaClock, showToast]
  );

  const fileDrop = useFileDropLoader({
    onLoadYamlText: handleLoadYamlFile,
    onLoadVideoBlobUrl: handleLoadVideoBlobUrl,
  });

  const handleSeekAndSync = useCallback(
    (targetSec: number) => {
      mediaClock.seek(targetSec);
      stageLoop.evaluateTick60fps();
      stageLoop.forceSyncUi();
    },
    [mediaClock, stageLoop]
  );

  const handleStepFramesAndSync = useCallback(
    (frames: number) => {
      mediaClock.stepFrames(frames);
      stageLoop.evaluateTick60fps();
      stageLoop.forceSyncUi();
    },
    [mediaClock, stageLoop]
  );

  return (
    <div
      onDragOver={fileDrop.handleDragOver}
      onDragLeave={fileDrop.handleDragLeave}
      onDrop={fileDrop.handleDrop}
      className="relative w-full h-dvh flex flex-col bg-app text-text-main overflow-hidden"
    >
      {/* Drag-and-Drop Overlay Indicator */}
      {fileDrop.isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-overlay-heavy backdrop-blur-md border-2 border-dashed border-text-main flex flex-col items-center justify-center gap-2 pointer-events-none">
          <span className="text-lg font-mono font-bold text-text-main">
            Drop .MP4 / .WebM Video or .YAML Choreography Score
          </span>
          <span className="text-xs font-mono text-text-muted">
            Videos are held in session memory; YAML scores are saved in IndexedDB
          </span>
        </div>
      )}

      {/* Top Studio Header */}
      <WorkspaceHeader
        catalog={catalog}
        activeSceneId={activeSceneId}
        splitPreset={layout.splitPreset}
        isEditMode={layout.isEditMode}
        storageStatus={scorePersistence.storageStatus}
        isLibraryOpen={isLibraryOpen}
        isInfoOpen={isInfoOpen}
        themeMode={theme.themeMode}
        effectiveThemeCategory={theme.effectiveCategory}
        dioramaThemeMode={theme.dioramaThemeMode}
        effectiveDioramaCategory={theme.effectiveDioramaCategory}
        onSelectScene={handleSelectScene}
        onSelectSplitPreset={layout.handleSelectSplitPreset}
        onToggleEditMode={layout.handleToggleEditMode}
        onResetLayout={layout.handleResetLayout}
        onUploadFiles={fileDrop.processFiles}
        onExportActiveScore={handleExportActiveScore}
        onOpenLibrary={(tab) => {
          setLibraryInitialTab(tab);
          setIsLibraryOpen(true);
        }}
        onOpenInfo={() => setIsInfoOpen(true)}
        onSelectThemeMode={theme.setThemeMode}
        onSelectDioramaThemeMode={theme.setDioramaThemeMode}
        onCreateBlankProject={async () => {
          const blank = await scorePersistence.createBlankScore();
          if (blank) {
            showToast(`Created new blank score "${blank.title}"`, 'success');
          }
        }}
      />

      {/* Main Resizable Split Workspace (Video Panel + 3D Blueprint Diorama + YAML Studio) */}
      <ResizableSplitWorkspace
        aspectRatio={activeScore.aspectRatio}
        splitPreset={layout.splitPreset}
        isEditMode={layout.isEditMode}
        leftSplitPct={layout.leftSplitPct}
        onLeftSplitChange={layout.handleLeftSplitChange}
        rightSplitPct={layout.rightSplitPct}
        onRightSplitChange={layout.handleRightSplitChange}
        videoHeightPct={layout.videoHeightPct}
        onVideoHeightChange={layout.handleVideoHeightChange}
        isSubpanelCollapsed={layout.isSubpanelCollapsed}
        leftVideoPane={
          <UniversalVideoViewport
            score={activeScore}
            sourceInfo={mediaClock.sourceInfo}
            html5VideoRef={mediaClock.html5VideoRef}
            youtubeContainerRef={mediaClock.youtubeContainerRef}
            frameRef={stageLoop.frameRef}
            uiFrame={stageLoop.uiSnapshot.frame}
            isPlaying={mediaClock.isPlaying}
            labelMode={display.labelMode}
            showGuides={display.showGuides}
            dofBlurEnabled={display.dofBlurEnabled}
            onToggleDofBlur={display.handleToggleDofBlur}
            themeCategory={theme.effectiveDioramaCategory}
            onApplyVideoUrlOverride={(url) => {
              setVideoOverrideUrl(url);
              mediaClock.seek(0);
              showToast('Applied custom video URL override', 'info');
            }}
          />
        }
        leftSubpanelPane={
          <VideoWorkspaceSubpanel
            isCollapsed={layout.isSubpanelCollapsed}
            onToggleCollapse={layout.handleToggleSubpanelCollapse}
            score={activeScore}
            activeShot={stageLoop.uiSnapshot.frame.activeShot}
            shotIndex={stageLoop.uiSnapshot.frame.shotIndex}
            hasVideoAttached={mediaClock.sourceInfo.kind !== 'procedural'}
            viewMode={subpanelViewMode}
            onSelectViewMode={setSubpanelViewMode}
            stageCamSlot={
              mediaClock.sourceInfo.kind !== 'procedural' ? (
                <StageCamMonitorCanvas
                  score={activeScore}
                  frameRef={stageLoop.frameRef}
                  uiFrame={stageLoop.uiSnapshot.frame}
                  labelMode={display.labelMode}
                  isPlaying={mediaClock.isPlaying}
                  showGuides={display.showGuides}
                  dofBlurEnabled={display.dofBlurEnabled}
                  onToggleDofBlur={display.handleToggleDofBlur}
                  themeCategory={theme.effectiveDioramaCategory}
                />
              ) : undefined
            }
          />
        }
        centerStagePane={
          <div
            ref={stageContainerRef}
            className="relative w-full h-full isolate"
          >
            {/* 3D React Three Fiber Blueprint Diorama */}
            <DioramaCanvas
              score={activeScore}
              cameraMode={stageLoop.cameraMode}
              isPlaying={mediaClock.isPlaying}
              frameRef={stageLoop.frameRef}
              uiFrame={stageLoop.uiSnapshot.frame}
              lastManualSeekIdRef={mediaClock.lastManualSeekIdRef}
              evaluateTick60fps={stageLoop.evaluateTick60fps}
              onFreeOrbitPoseChange={stageLoop.notifyFreeOrbitChange}
              labelMode={display.labelMode}
              dofBlurEnabled={display.dofBlurEnabled}
              themeCategory={theme.effectiveDioramaCategory}
              cameraPresetActionRef={cameraPresetActionRef}
            />

            {/* Responsive Diorama HUD Overlays & POV Viewfinder Dock */}
            <DioramaOverlayContainer
              score={activeScore}
              frame={stageLoop.uiSnapshot.frame}
              liveViewportPose={stageLoop.uiSnapshot.liveViewportPose}
              cameraMode={stageLoop.cameraMode}
              isPlaying={mediaClock.isPlaying}
              labelMode={display.labelMode}
              showGuides={display.showGuides}
              dofBlurEnabled={display.dofBlurEnabled}
              isNarrow={isNarrowDiorama}
              dioramaWidth={dioramaWidth}
              onSetCameraMode={stageLoop.setCameraMode}
              onSelectPreset={handleSelectCameraPreset}
              onSelectLabelMode={display.handleSelectLabelMode}
              onToggleGuides={display.handleToggleGuides}
              onToggleDofBlur={display.handleToggleDofBlur}
            />
          </div>
        }
        rightEditorPane={
          <YamlStudioPanel
            isOpen={layout.isEditMode}
            sceneId={activeSceneId}
            rawYaml={rawYaml}
            parseError={parseError}
            parseWarning={parseWarning}
            diagnostics={parseDiagnostics}
            effectiveTheme={theme.effectiveCategory}
            storageStatus={scorePersistence.storageStatus}
            isBundled={isBundledSceneId(activeSceneId)}
            onChangeYaml={handleChangeYaml}
            onForkScore={handleForkScore}
            onClose={layout.handleToggleEditMode}
          />
        }
      />

      {/* Bottom Directorial Transport Deck (Streamlined Timeline Controls) */}
      <DirectorialTransportBar
        score={activeScore}
        frame={stageLoop.uiSnapshot.frame}
        durationSec={mediaClock.durationSec}
        isPlaying={mediaClock.isPlaying}
        playbackRate={mediaClock.playbackRate}
        isMuted={mediaClock.isMuted}
        loopActiveShot={mediaClock.loopActiveShot}
        onTogglePlay={mediaClock.togglePlay}
        onPause={mediaClock.pause}
        onSeek={handleSeekAndSync}
        onStepFrames={handleStepFramesAndSync}
        onSetPlaybackRate={mediaClock.setPlaybackRate}
        onToggleMute={mediaClock.toggleMute}
        onToggleLoopActiveShot={mediaClock.toggleLoopActiveShot}
      />

      {/* Reset Confirmation Dialog Modal */}
      <ConfirmResetModal
        isOpen={scorePersistence.isResetModalOpen}
        sceneTitle={activeScore.title}
        onConfirm={scorePersistence.confirmResetActiveScore}
        onCancel={() => scorePersistence.setIsResetModalOpen(false)}
      />

      {/* Remote Score Confirmation & Conflict Dialog Modal */}
      <ConfirmRemoteScoreModal
        isOpen={remoteModalState.isOpen}
        mode={remoteModalState.mode}
        targetUrl={remoteModalState.targetUrl}
        existingTitle={remoteModalState.existingItem?.title}
        sourceFileName={remoteModalState.sourceFileName}
        isLoading={remoteModalState.isLoading}
        onCancel={handleCloseRemoteModal}
        onConfirmImport={() => {
          if (remoteModalState.targetUrl) {
            handleExecuteRemoteImport(remoteModalState.targetUrl, false);
          }
        }}
        onKeepLocal={() => {
          if (remoteModalState.mode === 'file-conflict') {
            handleResolveFileConflict('keep');
          } else {
            handleCloseRemoteModal();
          }
        }}
        onOverwrite={() => {
          if (
            remoteModalState.mode === 'url-conflict' &&
            remoteModalState.targetUrl
          ) {
            handleExecuteRemoteImport(
              remoteModalState.targetUrl,
              false,
              remoteModalState.existingItem
            );
          } else if (remoteModalState.mode === 'file-conflict') {
            handleResolveFileConflict('overwrite');
          }
        }}
        onSaveAsCopy={() => {
          if (
            remoteModalState.mode === 'url-conflict' &&
            remoteModalState.targetUrl
          ) {
            handleExecuteRemoteImport(
              remoteModalState.targetUrl,
              true,
              remoteModalState.existingItem
            );
          } else if (remoteModalState.mode === 'file-conflict') {
            handleResolveFileConflict('copy');
          }
        }}
      />

      {/* Choreography Score Library Modal (Dedicated Mobile Sheet vs Desktop 2-Column Master-Detail) */}
      {isMobile ? (
        <MobileScoreLibraryModal
          isOpen={isLibraryOpen}
          catalog={catalog}
          activeSceneId={activeSceneId}
          initialTab={libraryInitialTab}
          onSelectScene={handleSelectScene}
          onClose={() => setIsLibraryOpen(false)}
        />
      ) : (
        <ScoreLibraryModal
          isOpen={isLibraryOpen}
          catalog={catalog}
          activeSceneId={activeSceneId}
          initialTab={libraryInitialTab}
          onSelectScene={handleSelectScene}
          onCreateBlankScore={async () => {
            const blank = await scorePersistence.createBlankScore();
            if (blank) {
              showToast(`Created new blank score "${blank.title}"`, 'success');
            }
          }}
          onForkScore={async (item) => {
            const custom = await scorePersistence.forkScoreAsCustom(item.id);
            if (custom) {
              showToast(
                `Forked "${item.title}" into editable Custom Project`,
                'success'
              );
            }
          }}
          onDuplicateScore={async (id) => {
            const item = catalog.find((c) => c.id === id);
            if (item) {
              const dupe = await scorePersistence.forkScoreAsCustom(item.id);
              if (dupe) {
                showToast(`Duplicated "${item.title}"`, 'success');
              }
            }
          }}
          onExportScore={handleExportScore}
          onRenameScore={async (id, newTitle) => {
            const ok = await scorePersistence.renameCustomScore(id, newTitle);
            if (ok) {
              showToast(`Renamed score to "${newTitle}"`, 'success');
            }
            return ok;
          }}
          onDeleteScore={async (id) => {
            const ok = await scorePersistence.deleteCustomScore(id);
            if (ok) {
              showToast('Custom project deleted', 'info');
            }
            return ok;
          }}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}

      {/* About & Studio Info Modal */}
      <AppInfoModal
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
      />

      {/* Floating Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default InteractiveStudioApp;

