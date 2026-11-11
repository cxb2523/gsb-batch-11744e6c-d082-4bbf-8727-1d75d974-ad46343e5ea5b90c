/**
 * LayoutSegmentedControl Component for StageFlow Studio Header.
 * Houses the 2 workspace layout modes (Split | Full) in a SceneFlow-style centered segmented pill.
 */

import React from 'react';
import { Columns2, Edit2, Maximize2 } from 'lucide-react';
import type { SplitPreset } from '../../core/types';
import { UI_TOKENS } from '../tokens/ui';

export interface LayoutSegmentedControlProps {
  splitPreset: SplitPreset;
  onSelectSplitPreset: (preset: SplitPreset) => void;
  isEditMode: boolean;
  onToggleEditMode: () => void;
}

export const LayoutSegmentedControl: React.FC<LayoutSegmentedControlProps> = ({
  splitPreset,
  onSelectSplitPreset,
  isEditMode,
  onToggleEditMode,
}) => {
  return (
    <div className="flex items-center gap-1.5">
      <div
        role="group"
        aria-label="Workspace Layout Modes"
        className={UI_TOKENS.button.segmentedGroup}
      >
        <button
          type="button"
          role="button"
          aria-pressed={splitPreset === 'split'}
          onClick={() => onSelectSplitPreset('split')}
          className={
            splitPreset === 'split'
              ? UI_TOKENS.button.segmentedItemActive
              : UI_TOKENS.button.segmentedItem
          }
          title="Side-by-side Video and 3D Diorama Stage"
        >
          <Columns2 className="w-3.5 h-3.5" />
          <span>Split</span>
        </button>

        <button
          type="button"
          role="button"
          aria-pressed={splitPreset === 'full'}
          onClick={() => onSelectSplitPreset('full')}
          className={
            splitPreset === 'full'
              ? UI_TOKENS.button.segmentedItemActive
              : UI_TOKENS.button.segmentedItem
          }
          title="Full-Screen 3D Diorama Stage"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Full</span>
        </button>
      </div>

      {/* Companion Edit Mode Action Pill */}
      <button
        type="button"
        role="button"
        aria-pressed={isEditMode}
        onClick={onToggleEditMode}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] lg:text-xs font-bold transition-all active:scale-95 cursor-pointer border shadow-2xs ${
          isEditMode
            ? 'bg-surface text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-xs ring-1 ring-amber-500/20'
            : 'bg-surface hover:bg-surface-subtle text-text-muted hover:text-text-main border-border-main'
        }`}
        title={
          isEditMode
            ? 'Exit Authoring Studio'
            : 'Enter Authoring Studio & YAML Editor'
        }
      >
        <Edit2 className="w-3.5 h-3.5" />
        <span>Edit</span>
      </button>
    </div>
  );
};
