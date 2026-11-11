/**
 * VideoWorkspaceSubpanel Component.
 * Modular, decoupled subpanel mounted directly beneath the reference video in the left column.
 * Provides a dedicated directorial workspace for the Executive Scene Production Brief
 * and an optional 3D Stage Cam monitor POV simulator.
 * Supports independent collapse/expand states with SceneFlow tactile tokens.
 * Layer 5 UI Component.
 */

import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Camera,
  FileText,
} from 'lucide-react';
import type { ShotCue, StageScore } from '../../core/types';
import { SceneProductionBrief } from './SceneProductionBrief';

export type SubpanelViewMode = 'brief' | 'notes' | 'stage-cam';

export interface VideoWorkspaceSubpanelProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  score: StageScore;
  activeShot?: ShotCue | null;
  shotIndex?: number;
  hasVideoAttached?: boolean;
  viewMode?: SubpanelViewMode;
  onSelectViewMode?: (mode: SubpanelViewMode) => void;
  stageCamSlot?: React.ReactNode;
}

export const VideoWorkspaceSubpanel: React.FC<VideoWorkspaceSubpanelProps> = ({
  isCollapsed,
  onToggleCollapse,
  score,
  hasVideoAttached = false,
  viewMode = 'brief',
  onSelectViewMode,
  stageCamSlot,
}) => {
  const isStageCam = viewMode === 'stage-cam';

  return (
    <div className="w-full h-full flex flex-col bg-surface border-t border-border-main overflow-hidden text-text-main select-none">
      {/* Subpanel Header Bar (click anywhere outside buttons to toggle collapse/expand) */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleCollapse}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
        className="h-9 px-3 bg-surface-subtle hover:bg-surface border-b border-border-subtle flex items-center justify-between gap-2 shrink-0 cursor-pointer select-none transition-colors group focus:outline-none focus:ring-1 focus:ring-accent-primary/40"
        title={
          isCollapsed
            ? 'Click to expand Scene Desk'
            : 'Click to collapse Scene Desk'
        }
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-accent-primary shrink-0" />
          <span className="text-[10px] font-mono font-bold tracking-wider text-text-main uppercase truncate group-hover:text-accent-primary transition-colors">
            Scene Desk
          </span>

          {/* Source/View Toggle Pill — Only visible when a video is attached */}
          {hasVideoAttached && onSelectViewMode && (
            <div
              role="group"
              aria-label="Directorial View Mode"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center p-0.5 rounded-lg bg-surface border border-border-main text-[9px] font-mono font-bold shrink-0 ml-1"
            >
              <button
                type="button"
                role="button"
                aria-pressed={!isStageCam}
                onClick={() => onSelectViewMode('brief')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  !isStageCam
                    ? 'bg-surface-muted text-text-main shadow-2xs font-semibold'
                    : 'text-text-muted hover:text-text-main'
                }`}
                title="Show Scene Production Brief & Call Sheet"
              >
                <FileText className="w-2.5 h-2.5" />
                <span>Brief</span>
              </button>

              <button
                type="button"
                role="button"
                aria-pressed={isStageCam}
                onClick={() => onSelectViewMode('stage-cam')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  isStageCam
                    ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 shadow-2xs font-semibold'
                    : 'text-text-muted hover:text-text-main'
                }`}
                title="Show 3D Stage Camera POV Simulator"
              >
                <Camera className="w-2.5 h-2.5" />
                <span>Stage Cam</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
          className="p-1 rounded-lg hover:bg-surface-muted text-text-muted hover:text-text-main transition-colors shrink-0 cursor-pointer"
          title={
            isCollapsed
              ? 'Expand Scene Desk'
              : 'Collapse Scene Desk'
          }
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed
              ? 'Expand Scene Desk'
              : 'Collapse Scene Desk'
          }
        >
          {isCollapsed ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Subpanel Content Body (visible when not collapsed) */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden bg-app">
          {isStageCam && stageCamSlot ? (
            /* Mode A: True 3D Stage Cam POV Simulator with aspect-ratio containment */
            <div className="w-full h-full aspect-fit-container p-2 min-h-0 overflow-hidden">
              <div
                style={{
                  ['--aspect-ratio' as string]: String(score.aspectRatio),
                }}
                className="aspect-fit-box relative bg-surface-dark rounded-xl border border-border-main shadow-md overflow-hidden flex items-center justify-center"
              >
                {stageCamSlot}
              </div>
            </div>
          ) : (
            /* Mode B: Executive Scene Production Brief & Call Sheet */
            <SceneProductionBrief score={score} />
          )}
        </div>
      )}
    </div>
  );
};
