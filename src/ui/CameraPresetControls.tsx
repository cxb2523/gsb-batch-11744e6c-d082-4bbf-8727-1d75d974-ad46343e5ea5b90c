/**
 * Directorial Camera Presets Floating Control.
 * Mounts in the bottom-left camera dock of the 3D Diorama Viewport.
 * Provides 1-click angle snaps with intuitive 3D ViewCube SVG icons:
 *   - Top (Plan View): Isometric cube with top face illuminated (84° pitch)
 *   - Iso (Three-Quarter): 3D isometric wireframe cube (35.3° pitch, 45° yaw)
 *   - Front (Proscenium): Isometric cube with front face illuminated (12° pitch)
 *   - Side (Profile): Isometric cube with side face illuminated (15° pitch, 90° yaw)
 *   - Reset: Re-snaps to active shot's scripted observer transform
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import {
  DIORAMA_CAMERA_PRESETS,
  type CameraPresetType,
} from '../stage/cameraPresets';

export interface CameraPresetControlsProps {
  onSelectPreset: (preset: CameraPresetType) => void;
  className?: string;
}

/**
 * Bespoke 3D ViewCube SVG Icons.
 * Renders an isometric cube with specific projection faces highlighted.
 */
const ViewCubeIcon: React.FC<{
  face: 'top' | 'iso' | 'front' | 'side';
  className?: string;
}> = ({ face, className = 'w-3.5 h-3.5' }) => {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Top Face */}
      <polygon
        points="8,2.5 13,5.25 8,8 3,5.25"
        stroke="currentColor"
        strokeWidth="1"
        fill={face === 'top' ? 'currentColor' : face === 'iso' ? 'currentColor' : 'none'}
        fillOpacity={face === 'top' ? 0.9 : face === 'iso' ? 0.35 : 0}
        strokeOpacity={face === 'top' ? 1 : 0.6}
      />
      {/* Front Face (Left projection) */}
      <polygon
        points="3,5.25 8,8 8,13.5 3,10.75"
        stroke="currentColor"
        strokeWidth="1"
        fill={face === 'front' ? 'currentColor' : 'none'}
        fillOpacity={face === 'front' ? 0.9 : 0}
        strokeOpacity={face === 'front' ? 1 : 0.6}
      />
      {/* Side Face (Right projection) */}
      <polygon
        points="8,8 13,5.25 13,10.75 8,13.5"
        stroke="currentColor"
        strokeWidth="1"
        fill={face === 'side' ? 'currentColor' : 'none'}
        fillOpacity={face === 'side' ? 0.9 : 0}
        strokeOpacity={face === 'side' ? 1 : 0.6}
      />
    </svg>
  );
};

export const CameraPresetControls: React.FC<CameraPresetControlsProps> = ({
  onSelectPreset,
  className = '',
}) => {
  const presetKeys: Array<Exclude<CameraPresetType, 'reset'>> = [
    'top',
    'iso',
    'front',
    'side',
  ];

  return (
    <div
      className={`flex items-center gap-0.5 bg-surface/90 backdrop-blur-md p-1 rounded-xl border border-border-main text-[11px] font-mono shadow-md select-none pointer-events-auto ${className}`}
    >
      {presetKeys.map((key) => {
        const item = DIORAMA_CAMERA_PRESETS[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectPreset(key)}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors duration-100 cursor-pointer flex items-center justify-center focus:outline-none"
            title={item.description}
            aria-label={item.label}
          >
            <ViewCubeIcon face={key} className="w-3.5 h-3.5" />
          </button>
        );
      })}

      <div className="w-[1px] h-3 bg-border-subtle mx-0.5" />

      <button
        type="button"
        onClick={() => onSelectPreset('reset')}
        className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors duration-100 cursor-pointer flex items-center justify-center focus:outline-none"
        title="Reset camera to active shot's scripted observer angle"
        aria-label="Reset to scripted observer angle"
      >
        <RotateCcw className="w-3.5 h-3.5 text-text-faint hover:text-text-main" />
      </button>
    </div>
  );
};
