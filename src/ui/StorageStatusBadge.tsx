/**
 * Visual badge indicating score persistence state (Bundled baseline vs. IndexedDB draft).
 * Styled with SceneFlow tactile design tokens.
 */

import React from 'react';
import { Database, FileCode2, Sparkles, RefreshCw } from 'lucide-react';
import type { StoragePersistenceStatus } from '../core/types';

export type { StoragePersistenceStatus };

export interface StorageStatusBadgeProps {
  status: StoragePersistenceStatus;
  className?: string;
}

export const StorageStatusBadge: React.FC<StorageStatusBadgeProps> = ({
  status,
  className = '',
}) => {
  if (status === 'saving') {
    return (
      <span
        title="Auto-saving score draft to browser IndexedDB"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 animate-pulse ${className}`}
      >
        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
        <span>Saving Draft...</span>
      </span>
    );
  }

  if (status === 'draft-saved') {
    return (
      <span
        title="Custom edits are safely stored in browser IndexedDB"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 ${className}`}
      >
        <Database className="w-2.5 h-2.5 text-emerald-500" />
        <span>Draft (IndexedDB)</span>
      </span>
    );
  }

  if (status === 'custom') {
    return (
      <span
        title="Custom imported scene saved in browser IndexedDB"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-300 ${className}`}
      >
        <FileCode2 className="w-2.5 h-2.5 text-sky-500" />
        <span>Custom (IndexedDB)</span>
      </span>
    );
  }

  return (
    <span
      title="Unmodified pristine bundled score preset"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono bg-surface-muted border border-border-main text-text-muted ${className}`}
    >
      <Sparkles className="w-2.5 h-2.5 text-text-faint" />
      <span>Bundled Baseline</span>
    </span>
  );
};
