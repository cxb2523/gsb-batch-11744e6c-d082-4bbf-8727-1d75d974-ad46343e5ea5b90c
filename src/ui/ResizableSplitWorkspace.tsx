/**
 * ResizableSplitWorkspace Component for StageFlow Studio.
 * 3-Column Studio Workspace Architecture:
 * - Left Column: Reference Video + Horizontal Divider + VideoWorkspaceSubpanel
 * - Center Column: Interactive 3D Blueprint Diorama Stage
 * - Right Column: Full-Height YAML Score Studio
 * Enforces SceneFlow 60fps drag performance with .is-resizing-split.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { GripHorizontal, GripVertical } from 'lucide-react';
import type { SplitPreset } from '../core/types';

export interface ResizableSplitWorkspaceProps {
  aspectRatio?: number;
  splitPreset: SplitPreset;
  isEditMode: boolean;
  leftSplitPct: number;
  onLeftSplitChange: (pct: number) => void;
  rightSplitPct: number;
  onRightSplitChange: (pct: number) => void;
  videoHeightPct: number;
  onVideoHeightChange: (pct: number) => void;
  isSubpanelCollapsed: boolean;
  leftVideoPane: React.ReactNode;
  leftSubpanelPane?: React.ReactNode;
  centerStagePane: React.ReactNode;
  rightEditorPane?: React.ReactNode;
}

export const ResizableSplitWorkspace: React.FC<
  ResizableSplitWorkspaceProps
> = ({
  aspectRatio = 16 / 9,
  splitPreset,
  isEditMode,
  leftSplitPct,
  onLeftSplitChange,
  rightSplitPct,
  onRightSplitChange,
  videoHeightPct,
  onVideoHeightChange,
  isSubpanelCollapsed,
  leftVideoPane,
  leftSubpanelPane,
  centerStagePane,
  rightEditorPane,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leftColRef = useRef<HTMLDivElement | null>(null);

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingHorizontal, setIsDraggingHorizontal] = useState(false);

  const isVideoHidden = splitPreset === 'full';
  const showRightEditor = isEditMode && Boolean(rightEditorPane);
  const showSubpanel = !isSubpanelCollapsed && Boolean(leftSubpanelPane);

  // Global mousemove/mouseup listener for all dividers
  useEffect(() => {
    const isDraggingAny =
      isDraggingLeft || isDraggingRight || isDraggingHorizontal;
    if (!isDraggingAny) return;

    if (typeof document !== 'undefined') {
      document.body.classList.add('is-resizing-split');
    }

    const handlePointerMove = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;

      if (isDraggingLeft) {
        const rawPct = ((e.clientX - rect.left) / rect.width) * 100;
        const clamped = Math.max(18, Math.min(45, rawPct));
        onLeftSplitChange(clamped);
      } else if (isDraggingRight) {
        const rawPct = ((rect.right - e.clientX) / rect.width) * 100;
        const clamped = Math.max(18, Math.min(45, rawPct));
        onRightSplitChange(clamped);
      } else if (isDraggingHorizontal) {
        const leftCol = leftColRef.current;
        if (!leftCol) return;
        const leftRect = leftCol.getBoundingClientRect();
        if (leftRect.height <= 0) return;

        const rawPct = ((e.clientY - leftRect.top) / leftRect.height) * 100;
        // Ensure minimum 180px top video and 140px bottom subpanel
        const minTopPct = Math.min(40, (180 / leftRect.height) * 100);
        const maxTopPct = Math.max(60, 100 - (140 / leftRect.height) * 100);
        const clamped = Math.max(minTopPct, Math.min(maxTopPct, rawPct));
        onVideoHeightChange(clamped);
      }
    };

    const handlePointerUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      setIsDraggingHorizontal(false);
      if (typeof document !== 'undefined') {
        document.body.classList.remove('is-resizing-split');
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (typeof document !== 'undefined') {
        document.body.classList.remove('is-resizing-split');
      }
    };
  }, [
    isDraggingLeft,
    isDraggingRight,
    isDraggingHorizontal,
    onLeftSplitChange,
    onRightSplitChange,
    onVideoHeightChange,
  ]);

  const handlePointerDownLeft = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
  }, []);

  const handlePointerDownRight = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
  }, []);

  const handlePointerDownHorizontal = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingHorizontal(true);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 w-full flex flex-col md:flex-row overflow-hidden bg-app"
    >
      {/* LEFT COLUMN: Video Viewport + Horizontal Split Divider + Directorial Subpanel */}
      <div
        ref={leftColRef}
        style={
          isVideoHidden
            ? undefined
            : ({
                '--left-col-pct': `${leftSplitPct}%`,
                '--aspect-ratio': String(aspectRatio),
                '--mobile-video-h': `min(40%, calc((100vw - 20px) / var(--aspect-ratio) + 20px))`,
              } as React.CSSProperties)
        }
        className={
          isVideoHidden
            ? 'fixed -left-[99999px] top-0 w-[320px] h-[180px] opacity-0 pointer-events-none overflow-hidden -z-50'
            : 'w-full h-[var(--mobile-video-h)] md:h-full md:w-[var(--left-col-pct)] shrink-0 flex flex-col bg-surface border-b md:border-b-0 border-border-main overflow-hidden'
        }
        aria-hidden={isVideoHidden}
      >
        {/* Top Section: Reference Video Player (or Procedural Stage Cam Monitor) */}
        <div
          style={
            showSubpanel
              ? ({
                  '--video-h-pct': `${videoHeightPct}%`,
                } as React.CSSProperties)
              : undefined
          }
          className={`w-full shrink-0 min-h-0 relative flex flex-col overflow-hidden ${
            showSubpanel
              ? 'h-full md:h-[var(--video-h-pct)]'
              : 'h-full md:h-[calc(100%-36px)]'
          }`}
        >
          {leftVideoPane}
        </div>

        {/* Horizontal Divider Bar (between Video and Subpanel) */}
        {showSubpanel && (
          <div
            onPointerDown={handlePointerDownHorizontal}
            className={`hidden md:flex h-2 shrink-0 items-center justify-center cursor-row-resize select-none transition-colors z-20 ${
              isDraggingHorizontal
                ? 'bg-accent-primary'
                : 'bg-surface-subtle hover:bg-surface-hover border-y border-border-main'
            }`}
            title="Drag to resize Video and Directorial Workspace"
          >
            <GripHorizontal className="w-3.5 h-3.5 text-text-faint" />
          </div>
        )}

        {/* Bottom Section: Directorial Subpanel (Hidden on mobile < md) */}
        {leftSubpanelPane && (
          <div
            style={
              showSubpanel
                ? ({
                    '--subpanel-h-pct': `${100 - videoHeightPct}%`,
                  } as React.CSSProperties)
                : undefined
            }
            className={`hidden md:flex w-full min-h-0 relative flex-col overflow-hidden ${
              showSubpanel
                ? 'flex-1 md:h-[var(--subpanel-h-pct)]'
                : 'h-9 shrink-0'
            }`}
          >
            {leftSubpanelPane}
          </div>
        )}
      </div>

      {/* LEFT VERTICAL DIVIDER BAR (between Left Column and Center Diorama) */}
      {!isVideoHidden && (
        <div
          onPointerDown={handlePointerDownLeft}
          className={`hidden md:flex w-2 shrink-0 items-center justify-center cursor-col-resize select-none transition-colors z-10 ${
            isDraggingLeft
              ? 'bg-accent-primary'
              : 'bg-surface-subtle hover:bg-surface-hover border-x border-border-main'
          }`}
          title="Drag to resize Left Column and 3D Diorama Stage"
        >
          <GripVertical className="w-3.5 h-3.5 text-text-faint" />
        </div>
      )}

      {/* CENTER COLUMN: 3D Blueprint Diorama Viewport */}
      <div className="flex-1 min-w-0 min-h-0 h-full relative overflow-hidden bg-app isolate">
        {centerStagePane}
      </div>

      {/* RIGHT VERTICAL DIVIDER BAR (between Center Diorama and Right YAML Studio) */}
      {showRightEditor && (
        <div
          onPointerDown={handlePointerDownRight}
          className={`hidden md:flex w-2 shrink-0 items-center justify-center cursor-col-resize select-none transition-colors z-10 ${
            isDraggingRight
              ? 'bg-amber-500'
              : 'bg-surface-subtle hover:bg-surface-hover border-x border-border-main'
          }`}
          title="Drag to resize 3D Diorama and YAML Score Studio"
        >
          <GripVertical className="w-3.5 h-3.5 text-text-faint" />
        </div>
      )}

      {/* RIGHT COLUMN: Full-Height YAML Score Studio */}
      {showRightEditor && (
        <div
          style={
            {
              '--right-col-pct': `${rightSplitPct}%`,
            } as React.CSSProperties
          }
          className="w-full md:w-[var(--right-col-pct)] shrink-0 h-full flex flex-col bg-surface z-10"
        >
          {rightEditorPane}
        </div>
      )}
    </div>
  );
};
