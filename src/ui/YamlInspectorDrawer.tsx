/**
 * Backward-compatible adapter re-exporting the CodeMirror 6 YamlStudioPanel.
 * Maintained to preserve backward compatibility across tests and legacy imports.
 */

import React from 'react';
import type { ScoreDiagnostic } from '../core/types';
import type { StoragePersistenceStatus } from './StorageStatusBadge';
import { YamlStudioPanel } from './editor/YamlStudioPanel';

export interface YamlInspectorDrawerProps {
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
  onResetDefault?: () => void;
  onClose: () => void;
}

export const YamlInspectorDrawer: React.FC<YamlInspectorDrawerProps> = ({
  isOpen,
  rawYaml,
  sceneId,
  parseError,
  parseWarning,
  diagnostics,
  storageStatus = 'bundled',
  isBundled = false,
  effectiveTheme,
  onChangeYaml,
  onForkScore,
  onClose,
}) => {
  return (
    <YamlStudioPanel
      isOpen={isOpen}
      rawYaml={rawYaml}
      sceneId={sceneId}
      parseError={parseError}
      parseWarning={parseWarning}
      diagnostics={diagnostics}
      storageStatus={storageStatus}
      isBundled={isBundled}
      effectiveTheme={effectiveTheme}
      onChangeYaml={onChangeYaml}
      onForkScore={onForkScore}
      onClose={onClose}
    />
  );
};

export default YamlInspectorDrawer;
