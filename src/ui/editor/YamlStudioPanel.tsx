/**
 * Studio Editor Panel for StageFlow's 3-Column Directorial Workspace.
 * Hosts the CodeMirror 6 YAML editor canvas, theme synchronizer,
 * sticky diagnostics banner, and decoupled action toolbar.
 * Wrapped in React.memo to ensure zero re-render overhead during 60fps WebGL playback.
 */

import React, { useRef, useCallback, useState } from 'react';
import type { ScoreDiagnostic } from '../../core/types';
import {
  loadStoredEditorWordWrap,
  saveStoredEditorWordWrap,
} from '../../core/storage/localStorageUi';
import type { StoragePersistenceStatus } from '../StorageStatusBadge';
import { YamlEditorHeader } from './YamlEditorHeader';
import { YamlActionBar } from './YamlActionBar';
import { YamlDiagnosticsBanner } from './YamlDiagnosticsBanner';
import { YamlEditorCanvas, type YamlEditorHandle } from './YamlEditorCanvas';

export interface YamlStudioPanelProps {
  isOpen: boolean;
  rawYaml: string;
  sceneId?: string;
  parseError: string | null;
  parseWarning?: string | null;
  diagnostics?: ScoreDiagnostic[];
  storageStatus?: StoragePersistenceStatus;
  isBundled?: boolean;
  effectiveTheme?: 'dark' | 'warm' | 'light';
  onChangeYaml: (newYaml: string) => void;
  onForkScore?: () => void;
  onClose: () => void;
}

export const YamlStudioPanel: React.FC<YamlStudioPanelProps> = React.memo(
  ({
    isOpen,
    rawYaml,
    sceneId,
    parseError,
    parseWarning,
    diagnostics,
    isBundled = false,
    effectiveTheme = 'light',
    onChangeYaml,
    onForkScore,
    onClose,
  }) => {
    const editorCanvasRef = useRef<YamlEditorHandle | null>(null);

    const [wordWrap, setWordWrap] = useState<boolean>(() => {
      return loadStoredEditorWordWrap() ?? true;
    });

    const handleToggleWordWrap = useCallback(() => {
      setWordWrap((prev) => {
        const next = !prev;
        saveStoredEditorWordWrap(next);
        return next;
      });
    }, []);

    const handleJumpToLine = useCallback((line: number, column?: number) => {
      editorCanvasRef.current?.jumpToLine(line, column);
    }, []);

    if (!isOpen) return null;

    return (
      <aside
        aria-label="Choreography Score Editor"
        className="w-full h-full bg-surface border-l border-border-main flex flex-col text-text-main overflow-hidden select-none"
      >
        {/* 1. Top Panel Header (Title, Live Sync Indicator, Guide Button, Close Button) */}
        <YamlEditorHeader isBundled={isBundled} onClose={onClose} />

        {/* 2. Directorial Action Bar (Wrap, Copy, Fork to Edit) */}
        <YamlActionBar
          rawYaml={rawYaml}
          isBundled={isBundled}
          wordWrap={wordWrap}
          onToggleWordWrap={handleToggleWordWrap}
          onForkScore={onForkScore}
        />

        {/* 3. Conditional Diagnostics Banner (Only appears on Error or Warning) */}
        <YamlDiagnosticsBanner
          parseError={parseError}
          parseWarning={parseWarning}
          diagnostics={diagnostics}
          onJumpToLine={handleJumpToLine}
        />

        {/* 4. CodeMirror 6 Editor Canvas */}
        <YamlEditorCanvas
          ref={editorCanvasRef}
          rawYaml={rawYaml}
          sceneId={sceneId}
          isBundled={isBundled}
          effectiveTheme={effectiveTheme}
          wordWrap={wordWrap}
          onChangeYaml={onChangeYaml}
        />
      </aside>
    );
  }
);
