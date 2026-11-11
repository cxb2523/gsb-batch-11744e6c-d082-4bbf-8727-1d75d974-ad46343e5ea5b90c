/**
 * Floating 3-Way Camera POV Mode Switcher.
 * Mounts at top-center of the 3D Diorama Viewport.
 * Allows instant cuts between:
 *   - Scripted Observer (Timeline-driven while playing, releases to Free Orbit on pause)
 *   - Free Orbit (OrbitControls unlocked at all times)
 *   - Stage Cam POV (Looking directly through the active 3D camera lens with optical viewfinder)
 */

import React from 'react';
import { Eye, Orbit, Camera } from 'lucide-react';
import type { CameraViewMode } from '../core/types';

export interface CameraModeSwitcherProps {
  cameraMode: CameraViewMode;
  onSetCameraMode: (mode: CameraViewMode) => void;
  className?: string;
}

export const CameraModeSwitcher: React.FC<CameraModeSwitcherProps> = ({
  cameraMode,
  onSetCameraMode,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center bg-surface/90 backdrop-blur-md p-0.5 rounded-full border border-border-main text-[11px] font-mono shadow-md select-none pointer-events-auto z-20 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSetCameraMode('scripted')}
        className={`px-3 py-1 rounded-full flex items-center gap-1.5 border transition-colors duration-100 cursor-pointer focus:outline-none ${
          cameraMode === 'scripted'
            ? 'bg-surface text-text-main font-semibold shadow-xs border-border-subtle'
            : 'border-transparent text-text-muted hover:text-text-main hover:bg-surface-subtle/50'
        }`}
        title="Scripted Observer View (Driven by timeline while playing; releases to Free Orbit when paused)"
      >
        <Eye className="w-3.5 h-3.5 text-sky-500" />
        <span>Scripted</span>
      </button>

      <button
        type="button"
        onClick={() => onSetCameraMode('free')}
        className={`px-3 py-1 rounded-full flex items-center gap-1.5 border transition-colors duration-100 cursor-pointer focus:outline-none ${
          cameraMode === 'free'
            ? 'bg-surface text-text-main font-semibold shadow-xs border-border-subtle'
            : 'border-transparent text-text-muted hover:text-text-main hover:bg-surface-subtle/50'
        }`}
        title="Free Orbit View (Unlocks OrbitControls even during playback)"
      >
        <Orbit className="w-3.5 h-3.5 text-emerald-500" />
        <span>Free Orbit</span>
      </button>

      <button
        type="button"
        onClick={() => onSetCameraMode('stage-pov')}
        className={`px-3 py-1 rounded-full flex items-center gap-1.5 border transition-colors duration-100 cursor-pointer focus:outline-none ${
          cameraMode === 'stage-pov'
            ? 'bg-surface text-text-main font-semibold shadow-xs border-border-subtle'
            : 'border-transparent text-text-muted hover:text-text-main hover:bg-surface-subtle/50'
        }`}
        title="Stage Camera POV (Instant cut to look directly through the 3D Stage Camera lens)"
      >
        <Camera className="w-3.5 h-3.5 text-amber-500" />
        <span>Stage Cam</span>
      </button>
    </div>
  );
};
