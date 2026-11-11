/**
 * Minimalist Top-Left HUD Overlay inside the 3D Diorama Viewport.
 * Displays active Shot Number, Label, Cine Optics, Look-At Target, 3D Offset Vector,
 * Timing, and Directorial Staging Screenplay Note.
 * Styled with SceneFlow tactile design tokens.
 * Layer 5 UI Component.
 */

import React, { useState } from 'react';
import {
  Aperture,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
} from 'lucide-react';
import type { CameraViewMode, StageFrame, StageScore } from '../core/types';
import { formatApertureFStop } from '../core/opticsMath';
import {
  cleanShotLabel,
  formatFilmGateLabel,
  formatShotTiming,
  formatSignedVector3D,
  resolveShotTargetInfo,
} from './shotBreakdownUtils';

export interface ShotBreakdownHudProps {
  score: StageScore;
  frame: StageFrame;
  cameraMode: CameraViewMode;
  isPlaying: boolean;
}

export const ShotBreakdownHud: React.FC<ShotBreakdownHudProps> = ({
  score,
  frame,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const shot = frame.activeShot;
  const stageCam = frame.stageCamera;
  const dof = stageCam.dof;
  const lensMm = Math.round(stageCam.transform.pose.focalLengthMm);
  const aspectLabel = formatFilmGateLabel(score.aspectRatio);

  const offset = stageCam.targetOffset;
  const offsetMag = offset ? Math.hypot(offset.x, offset.y, offset.z) : 0;
  const hasOffset = offsetMag >= 0.01;

  const rawLabel = shot ? shot.label : score.title;
  const cleanLabel = cleanShotLabel(rawLabel);
  const shotTag = shot ? `#${String(shot.shotNumber).padStart(2, '0')}` : '#--';

  // Resolve Look-At Target against scene entities
  const targetInfo = resolveShotTargetInfo(
    shot?.stageCamera?.target,
    score.entities,
    stageCam.baseTarget
  );

  return (
    <div className="absolute top-3 left-3 max-w-[calc(100%-320px)] sm:max-w-md md:max-w-lg flex flex-col gap-1.5 pointer-events-none select-none z-10">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsCollapsed((prev) => !prev);
          }
        }}
        className="px-3.5 py-2.5 rounded-2xl bg-surface/95 backdrop-blur-md border border-border-main hover:border-border-hover shadow-lg flex flex-col gap-1.5 text-text-main pointer-events-auto transition-all cursor-pointer group select-none focus:outline-none focus:ring-1 focus:ring-accent-primary/40"
        title={
          isCollapsed
            ? 'Click to expand shot breakdown'
            : 'Click to collapse shot breakdown'
        }
      >
        {/* UNIFIED HEADER ROW: Same single-line structure for both Collapsed & Expanded */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="px-1.5 py-0.5 rounded-md bg-btn-primary-bg text-btn-primary-text text-[10px] font-mono font-bold shrink-0 shadow-2xs">
              {shotTag}
            </span>
            <span className="text-xs font-sans font-semibold text-text-main truncate group-hover:text-accent-primary transition-colors">
              {cleanLabel}
            </span>
          </div>

          <div
            aria-hidden="true"
            className="p-1 rounded-lg text-text-faint group-hover:text-text-main group-hover:bg-surface-subtle transition-colors duration-100 shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </div>
        </div>

        {/* COLLAPSED VIEW: Line 2 with Essential Cine Tokens */}
        {isCollapsed ? (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted truncate">
            <span className="text-text-main font-semibold shrink-0">
              {lensMm}mm
            </span>
            {dof.enabled && (
              <>
                <span className="text-text-faint opacity-50">·</span>
                <span className="text-text-muted font-medium shrink-0">
                  {formatApertureFStop(dof.apertureFStop)}
                </span>
              </>
            )}
            <span className="text-text-faint opacity-50">·</span>
            <span className="uppercase text-amber-500 font-semibold shrink-0">
              {stageCam.rig
                ? `${stageCam.rig.type.replace('_', ' ')}`
                : stageCam.maneuver}
            </span>
            {(dof.hasExplicitFocus || dof.enabled) && (
              <>
                <span className="text-text-faint opacity-50">·</span>
                <span className="text-emerald-500 font-semibold shrink-0">
                  F {dof.focusDistanceM.toFixed(1)}m
                </span>
              </>
            )}
            {hasOffset && (
              <>
                <span className="text-text-faint opacity-50">·</span>
                <span className="text-sky-500 font-semibold shrink-0">
                  Δ {offsetMag.toFixed(2)}m
                </span>
              </>
            )}
          </div>
        ) : (
          /* EXPANDED VIEW: Multi-Row Directorial Spec Strip & Callout */
          <div className="space-y-2 pt-0.5">
            {/* Row 2: Optics & Physical Rig / Maneuver Spec Strip */}
            <div className="flex items-center gap-2 text-[10.5px] font-mono text-text-muted flex-wrap">
              <span className="flex items-center gap-1 text-text-main font-semibold">
                <Aperture className="w-3 h-3 text-sky-500" />
                <span>
                  {lensMm}mm Prime
                  {dof.enabled ? ` · ${formatApertureFStop(dof.apertureFStop)}` : ''} · {aspectLabel}
                </span>
              </span>

              <span className="text-border-main">|</span>

              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-300 uppercase font-semibold">
                <Compass className="w-3 h-3 text-amber-500" />
                <span>
                  {stageCam.rig ? `${stageCam.rig.type.replace('_', ' ')} · ` : ''}
                  {stageCam.maneuver}
                </span>
              </span>

              {(dof.hasExplicitFocus || dof.enabled) && (
                <>
                  <span className="text-border-main">|</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Focus {dof.focusDistanceM.toFixed(2)}m
                  </span>
                </>
              )}
            </div>

            {/* Row 3: Directorial Tracking & Staging Strip */}
            <div className="flex items-center gap-2.5 text-[10px] font-mono text-text-muted pt-1.5 border-t border-border-subtle flex-wrap">
              {/* Target Entity with Blueprint Color Dot */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Crosshair className="w-3 h-3 text-sky-500" />
                {targetInfo.color && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: targetInfo.color }}
                  />
                )}
                <span className="font-semibold text-text-main">
                  {targetInfo.label}
                </span>
              </div>

              {/* Full 3D Offset Vector */}
              {hasOffset && offset && (
                <>
                  <span className="text-border-main">|</span>
                  <span className="text-sky-600 dark:text-sky-300 font-mono font-medium shrink-0">
                    {formatSignedVector3D(offset)}
                  </span>
                </>
              )}

              {/* Shot Timing */}
              {shot && (
                <>
                  <span className="text-border-main">|</span>
                  <span className="flex items-center gap-1 text-text-muted shrink-0">
                    <Clock className="w-3 h-3 text-text-faint" />
                    <span>{formatShotTiming(shot.startSec, shot.endSec)}</span>
                  </span>
                </>
              )}
            </div>

            {/* Row 4: Directorial Staging Description (Simple Italic Writing) */}
            {shot?.description && (
              <p className="pt-1.5 border-t border-border-subtle text-[11px] font-sans italic text-text-muted leading-relaxed">
                {shot.description}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
