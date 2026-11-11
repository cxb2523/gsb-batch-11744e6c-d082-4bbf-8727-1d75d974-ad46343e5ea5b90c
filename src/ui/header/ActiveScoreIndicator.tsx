/**
 * ActiveScoreIndicator Component for StageFlow Studio Header.
 * Displays the currently loaded score title in an interactive pill.
 * Clicking opens the Score Library modal.
 */

import React from 'react';
import { Film } from 'lucide-react';
import type { ScoreCatalogItem } from '../../core/scoreCatalog';
import type { StoragePersistenceStatus } from '../../core/types';
import { UI_TOKENS } from '../tokens/ui';

export interface ActiveScoreIndicatorProps {
  catalog: ScoreCatalogItem[];
  activeSceneId: string;
  storageStatus?: StoragePersistenceStatus;
  onOpenLibrary: () => void;
}

export const ActiveScoreIndicator: React.FC<ActiveScoreIndicatorProps> = ({
  catalog,
  activeSceneId,
  onOpenLibrary,
}) => {
  const activeItem = catalog.find((item) => item.id === activeSceneId);
  const activeTitle = activeItem?.title || activeSceneId;

  return (
    <button
      type="button"
      onClick={onOpenLibrary}
      className={`${UI_TOKENS.button.filePill} min-w-0 max-w-[140px] sm:max-w-[200px] md:max-w-[240px] xl:max-w-[340px] text-left group`}
      title={`Active Score: "${activeTitle}" — Click to open Score Library`}
    >
      <Film className="w-3.5 h-3.5 text-text-muted shrink-0 group-hover:text-text-main transition-colors" />
      <span className="text-xs font-mono text-text-body group-hover:text-text-main truncate">
        {activeTitle}
      </span>
    </button>
  );
};
