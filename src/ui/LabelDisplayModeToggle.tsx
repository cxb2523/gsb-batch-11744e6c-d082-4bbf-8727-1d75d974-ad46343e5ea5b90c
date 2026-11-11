/**
 * Floating Viewport Overlay Controls for the 3D Diorama.
 * Houses:
 *   1. 3-Mode Label Visibility Toggle ('all' | 'camera-only' | 'off') [Hotkey: L]
 *   2. Viewfinder Composition Guides Toggle (90% safe-action, rule-of-thirds, reticle) [Hotkey: G]
 * Styled with SceneFlow tactile pill design tokens.
 */

import React from 'react';
import { Aperture, EyeOff, Grid3X3, Tag, Video } from 'lucide-react';
import type { CameraViewMode, LabelDisplayMode } from '../core/types';

export interface LabelDisplayModeToggleProps {
  labelMode: LabelDisplayMode;
  onSelectLabelMode: (mode: LabelDisplayMode) => void;
  showGuides?: boolean;
  onToggleGuides?: () => void;
  dofBlurEnabled?: boolean;
  onToggleDofBlur?: () => void;
  cameraMode?: CameraViewMode;
  className?: string;
}

const MODES: Array<{
  mode: LabelDisplayMode;
  label: string;
  title: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  {
    mode: 'all',
    label: 'All',
    title: 'Show Actor & Camera Labels (Actors auto-dim during playback) [Hotkey: L]',
    Icon: Tag,
  },
  {
    mode: 'camera-only',
    label: 'Cam',
    title: 'Show Stage Camera Label Only [Hotkey: L]',
    Icon: Video,
  },
  {
    mode: 'off',
    label: 'Off',
    title: 'Hide All 3D Labels [Hotkey: L]',
    Icon: EyeOff,
  },
];

export const LabelDisplayModeToggle: React.FC<LabelDisplayModeToggleProps> = ({
  labelMode,
  onSelectLabelMode,
  showGuides = true,
  onToggleGuides,
  dofBlurEnabled = false,
  onToggleDofBlur,
  cameraMode,
  className = '',
}) => {
  const isStagePov = cameraMode === 'stage-pov';

  return (
    <div className={`flex items-center gap-1.5 pointer-events-auto select-none ${className}`}>
      {/* 1. 3D Labels Visibility Toggle */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-surface border border-border-main shadow-xs">
        <span className="text-[9px] font-mono uppercase tracking-wider text-text-faint pl-2 pr-1 hidden sm:inline">
          Labels
        </span>
        {MODES.map(({ mode, label, title, Icon }) => {
          const active = labelMode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelectLabelMode(mode)}
              title={title}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-colors duration-100 cursor-pointer focus:outline-none ${
                active
                  ? 'bg-btn-primary-bg text-btn-primary-text font-semibold shadow-2xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Composition Guides Toggle (Contextual: Stage Cam POV Only) */}
      {onToggleGuides && isStagePov && (
        <div className="flex items-center p-0.5 rounded-xl bg-surface border border-border-main shadow-xs">
          <button
            type="button"
            onClick={onToggleGuides}
            title={`Toggle Composition Guides (90% Safe-Action, Rule-of-Thirds, Reticle) [Hotkey: G] — Currently ${
              showGuides ? 'ON' : 'OFF'
            }`}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-colors duration-100 cursor-pointer focus:outline-none ${
              showGuides
                ? 'bg-amber-500 text-white font-semibold shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            <span className="hidden sm:inline">Guides</span>
          </button>
        </div>
      )}

      {/* 3. Optical Depth of Field Blur Toggle (Contextual: Stage Cam POV Only) */}
      {onToggleDofBlur && isStagePov && (
        <div className="flex items-center p-0.5 rounded-xl bg-surface border border-border-main shadow-xs">
          <button
            type="button"
            onClick={onToggleDofBlur}
            title={`Toggle Optical Depth of Field Blur Simulation [Hotkey: B] — Currently ${
              dofBlurEnabled ? 'ON' : 'OFF'
            }`}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1 transition-colors duration-100 cursor-pointer focus:outline-none ${
              dofBlurEnabled
                ? 'bg-emerald-500 text-white font-semibold shadow-2xs'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            <Aperture className="w-3 h-3" />
            <span className="hidden sm:inline">Blur</span>
          </button>
        </div>
      )}
    </div>
  );
};
