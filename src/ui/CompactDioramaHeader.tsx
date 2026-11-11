/**
 * Dedicated Compact Diorama Header for Narrow Viewports (<768px).
 * Mounts at top-3 left-3 right-3 when the split workspace is narrow.
 * Consolidates:
 *   1. Active Shot Badge & Info Popover
 *   2. Segmented 3-Way Camera POV Mode Switcher (Scripted, Free Orbit, Stage Cam)
 *   3. Unified [ View ▾ ] Popover (Camera Presets, 3D Labels, Viewfinder Guides)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Aperture,
  Camera,
  ChevronDown,
  Compass,
  Eye,
  Grid3X3,
  Info,
  Orbit,
  RotateCcw,
  X,
} from 'lucide-react';
import type {
  CameraViewMode,
  LabelDisplayMode,
  StageFrame,
  StageScore,
} from '../core/types';
import {
  DIORAMA_CAMERA_PRESETS,
  type CameraPresetType,
} from '../stage/cameraPresets';

export interface CompactDioramaHeaderProps {
  score: StageScore;
  frame: StageFrame;
  cameraMode: CameraViewMode;
  onSetCameraMode: (mode: CameraViewMode) => void;
  onSelectPreset: (preset: CameraPresetType) => void;
  labelMode: LabelDisplayMode;
  onSelectLabelMode: (mode: LabelDisplayMode) => void;
  showGuides: boolean;
  onToggleGuides: () => void;
  dofBlurEnabled?: boolean;
  onToggleDofBlur?: () => void;
  className?: string;
}

export const CompactDioramaHeader: React.FC<CompactDioramaHeaderProps> = ({
  score,
  frame,
  cameraMode,
  onSetCameraMode,
  onSelectPreset,
  labelMode,
  onSelectLabelMode,
  showGuides,
  onToggleGuides,
  dofBlurEnabled = false,
  onToggleDofBlur,
  className = '',
}) => {
  const [isShotInfoOpen, setIsShotInfoOpen] = useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close open popovers when clicking outside the compact header
  useEffect(() => {
    const handlePointerDownOutside = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsShotInfoOpen(false);
        setIsViewMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside);
  }, []);

  const shot = frame.activeShot;
  const rawLabel = shot ? shot.label : score.title;
  const cleanLabel = shot
    ? rawLabel.replace(/^Shot\s*\d+\s*[·:\u2013\u2014-]\s*/i, '').trim() || rawLabel
    : rawLabel;
  const shotTag = shot ? `#${String(shot.shotNumber).padStart(2, '0')}` : '#--';
  const stageCam = frame.stageCamera;
  const lensMm = Math.round(stageCam.transform.pose.focalLengthMm);

  const presetKeys: Array<Exclude<CameraPresetType, 'reset'>> = [
    'top',
    'iso',
    'front',
    'side',
  ];

  return (
    <div
      ref={containerRef}
      className={`absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-1.5 bg-surface/95 backdrop-blur-md px-2.5 py-1.5 rounded-2xl border border-border-main shadow-lg text-text-main pointer-events-auto select-none font-sans text-xs ${className}`}
    >
      {/* 1. Left Wing: Active Shot Pill + Details Toggle */}
      <div className="relative flex items-center gap-1 min-w-0 shrink">
        <button
          type="button"
          onClick={() => {
            setIsShotInfoOpen((prev) => !prev);
            setIsViewMenuOpen(false);
          }}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-surface hover:bg-surface-subtle border border-border-main text-text-muted hover:text-text-main transition-colors cursor-pointer min-w-0"
          title="Click to toggle shot staging details"
        >
          <span className="px-1.5 py-0.2 rounded-md bg-btn-primary-bg text-btn-primary-text text-[10px] font-mono font-bold shrink-0 shadow-2xs">
            {shotTag}
          </span>
          <span className="truncate max-w-[90px] sm:max-w-[160px] md:max-w-[220px] font-semibold text-[11px] text-text-main">
            {cleanLabel}
          </span>
          <Info className="w-3 h-3 text-text-faint shrink-0" />
        </button>

        {/* Shot Info Popover Dropdown */}
        {isShotInfoOpen && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-surface border border-border-main rounded-2xl p-3 shadow-2xl z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-1.5 border-b border-border-subtle">
              <span className="font-bold text-text-main text-[11px] font-sans truncate">
                {shotTag} · {cleanLabel}
              </span>
              <button
                type="button"
                onClick={() => setIsShotInfoOpen(false)}
                className="text-text-faint hover:text-text-main p-0.5 rounded-md"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-[10.5px] font-mono text-text-muted">
              <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                <Aperture className="w-3 h-3 text-sky-500" />
                {lensMm}mm Prime
              </span>
              <span>·</span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 uppercase font-semibold">
                <Compass className="w-3 h-3 text-amber-500" />
                {stageCam.maneuver}
              </span>
            </div>

            {shot?.description && (
              <p className="text-[10px] text-text-muted leading-relaxed font-sans line-clamp-3">
                {shot.description}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 2. Center Wing: Streamlined 3-Way Camera POV Segmented Switcher */}
      <div className="flex items-center bg-surface-subtle p-0.5 rounded-xl border border-border-subtle text-[10.5px] font-mono shrink-0">
        <button
          type="button"
          onClick={() => onSetCameraMode('scripted')}
          className={`px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
            cameraMode === 'scripted'
              ? 'bg-surface text-text-main font-bold shadow-xs border border-border-subtle'
              : 'text-text-muted hover:text-text-main'
          }`}
          title="Scripted Observer (Timeline locked while playing, free orbit on pause)"
        >
          <Eye className="w-3 h-3 text-sky-500 shrink-0" />
          <span className="hidden sm:inline">Scripted</span>
        </button>

        <button
          type="button"
          onClick={() => onSetCameraMode('free')}
          className={`px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
            cameraMode === 'free'
              ? 'bg-surface text-text-main font-bold shadow-xs border border-border-subtle'
              : 'text-text-muted hover:text-text-main'
          }`}
          title="Free Orbit (Unlocked OrbitControls at all times)"
        >
          <Orbit className="w-3 h-3 text-emerald-500 shrink-0" />
          <span className="hidden sm:inline">Free</span>
        </button>

        <button
          type="button"
          onClick={() => onSetCameraMode('stage-pov')}
          className={`px-2 py-0.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
            cameraMode === 'stage-pov'
              ? 'bg-surface text-text-main font-bold shadow-xs border border-border-subtle'
              : 'text-text-muted hover:text-text-main'
          }`}
          title="Stage Cam POV (Director's Optical Viewfinder)"
        >
          <Camera className="w-3 h-3 text-amber-500 shrink-0" />
          <span className="hidden sm:inline">Stage</span>
        </button>
      </div>

      {/* 3. Right Wing: Unified [ View ▾ ] Popover */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            setIsViewMenuOpen((prev) => !prev);
            setIsShotInfoOpen(false);
          }}
          className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-[11px] font-mono font-medium transition-colors cursor-pointer ${
            isViewMenuOpen
              ? 'bg-surface-hover text-text-main border-border-main'
              : 'bg-surface hover:bg-surface-subtle border-border-main text-text-muted hover:text-text-main'
          }`}
          title="Camera angle presets and stage display options"
        >
          <Compass className="w-3 h-3 text-text-faint" />
          <span>View</span>
          <ChevronDown className="w-3 h-3 text-text-faint" />
        </button>

        {/* View Options Dropdown Popover */}
        {isViewMenuOpen && (
          <div className="absolute top-full right-0 mt-2 w-52 bg-surface border border-border-main rounded-2xl p-2.5 shadow-2xl z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 text-[10.5px]">
            {/* Presets Cluster */}
            <div>
              <span className="text-[9px] font-bold text-text-faint font-mono uppercase tracking-wider block px-1.5 pb-1">
                Camera Angle Presets
              </span>
              <div className="grid grid-cols-2 gap-1 font-mono">
                {presetKeys.map((key) => {
                  const item = DIORAMA_CAMERA_PRESETS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onSelectPreset(key);
                        setIsViewMenuOpen(false);
                      }}
                      className="px-2 py-1 rounded-lg text-left text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors cursor-pointer font-medium"
                    >
                      {item.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    onSelectPreset('reset');
                    setIsViewMenuOpen(false);
                  }}
                  className="px-2 py-1 rounded-lg text-left text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors cursor-pointer flex items-center gap-1 font-medium col-span-2 border-t border-border-subtle mt-0.5 pt-1.5"
                >
                  <RotateCcw className="w-2.5 h-2.5 text-text-faint" />
                  <span>Reset (Scripted)</span>
                </button>
              </div>
            </div>

            <div className="w-full h-[1px] bg-border-subtle" />

            {/* 3D Label Modes */}
            <div>
              <span className="text-[9px] font-bold text-text-faint font-mono uppercase tracking-wider block px-1.5 pb-1">
                3D Stage Labels
              </span>
              <div className="flex items-center gap-1 font-mono bg-surface-subtle p-0.5 rounded-lg border border-border-subtle">
                {(['all', 'camera-only', 'off'] as LabelDisplayMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSelectLabelMode(mode)}
                    className={`flex-1 py-0.5 text-center rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      labelMode === mode
                        ? 'bg-surface text-text-main font-bold shadow-xs'
                        : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    {mode === 'camera-only' ? 'Cam' : mode === 'all' ? 'All' : 'Off'}
                  </button>
                ))}
              </div>
            </div>

            {/* Optical Guides & DoF Blur Toggles (in Stage POV) */}
            {cameraMode === 'stage-pov' && (
              <>
                <div className="w-full h-[1px] bg-border-subtle" />
                <button
                  type="button"
                  onClick={onToggleGuides}
                  className={`px-2 py-1 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer font-mono ${
                    showGuides
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold'
                      : 'text-text-muted hover:text-text-main hover:bg-surface-subtle'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Grid3X3 className="w-3 h-3 text-sky-500" />
                    <span>Viewfinder Guides</span>
                  </span>
                  <span className="text-[9px] font-bold">
                    {showGuides ? 'ON' : 'OFF'}
                  </span>
                </button>
                {onToggleDofBlur && (
                  <button
                    type="button"
                    onClick={onToggleDofBlur}
                    className={`px-2 py-1 rounded-lg flex items-center justify-between text-left transition-colors cursor-pointer font-mono ${
                      dofBlurEnabled
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold'
                        : 'text-text-muted hover:text-text-main hover:bg-surface-subtle'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Aperture className="w-3 h-3 text-emerald-500" />
                      <span>Optical DoF Blur</span>
                    </span>
                    <span className="text-[9px] font-bold">
                      {dofBlurEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
