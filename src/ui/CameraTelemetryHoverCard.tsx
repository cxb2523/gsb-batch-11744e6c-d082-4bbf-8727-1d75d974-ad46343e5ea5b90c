/**
 * Precision Hover Telemetry Card for CameraTelemetryCapsule.
 * Displays detailed degrees, radians, metric meters, optical focus, aperture,
 * maneuver, and rig mount specifications for the inspected camera.
 * Layer 5 UI Component.
 */

import React from 'react';
import { Camera, Copy, Eye } from 'lucide-react';
import type {
  CameraManeuver,
  EvaluatedCameraRigState,
  EvaluatedDofState,
  SphericalPose,
} from '../core/types';
import { formatApertureFStop } from '../core/opticsMath';
import type { TelemetryCameraSource } from './telemetryYamlFormatter';

export interface CameraTelemetryHoverCardProps {
  source: TelemetryCameraSource;
  pose: SphericalPose;
  pitchDeg: string;
  yawDeg: string;
  rollDeg: string;
  hasNonZeroRoll: boolean;
  distMeters: string;
  tx: string;
  ty: string;
  tz: string;
  lensMm: number;
  currentRig?: EvaluatedCameraRigState;
  dof?: EvaluatedDofState;
  maneuver?: CameraManeuver;
}

export const CameraTelemetryHoverCard: React.FC<CameraTelemetryHoverCardProps> = ({
  source,
  pose,
  pitchDeg,
  yawDeg,
  rollDeg,
  hasNonZeroRoll,
  distMeters,
  tx,
  ty,
  tz,
  lensMm,
  currentRig,
  dof,
  maneuver,
}) => {
  return (
    <div className="absolute bottom-full mb-2 right-0 w-72 bg-surface border border-border-main rounded-2xl p-3.5 shadow-2xl text-[10.5px] z-50 flex flex-col gap-1.5 pointer-events-none animate-in fade-in zoom-in-95 duration-150 text-text-main">
      {/* Directorial Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-border-subtle">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-text-main font-sans text-[10px]">
          {source === 'stage' ? (
            <>
              <Camera className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Stage Camera</span>
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Observer Camera</span>
            </>
          )}
        </div>
        <span className="px-1.5 py-0.5 rounded bg-surface-subtle border border-border-subtle text-[8.5px] font-mono font-bold text-text-muted uppercase">
          YAML
        </span>
      </div>

      <div className="flex justify-between items-center text-text-body font-mono">
        <span className="text-text-muted font-sans">Pitch:</span>
        <span>
          <strong className="text-text-main">{pitchDeg}°</strong>{' '}
          <span className="text-text-faint text-[9.5px]">
            ({pose.pitch.toFixed(3)} rad)
          </span>
        </span>
      </div>

      <div className="flex justify-between items-center text-text-body font-mono">
        <span className="text-text-muted font-sans">Yaw:</span>
        <span>
          <strong className="text-text-main">{yawDeg}°</strong>{' '}
          <span className="text-text-faint text-[9.5px]">
            ({pose.yaw.toFixed(3)} rad)
          </span>
        </span>
      </div>

      <div className="flex justify-between items-center text-text-body font-mono">
        <span className="text-text-muted font-sans">Roll:</span>
        <span>
          <strong
            className={
              hasNonZeroRoll
                ? 'text-violet-600 dark:text-violet-300'
                : 'text-text-muted'
            }
          >
            {rollDeg}°
          </strong>{' '}
          <span className="text-text-faint text-[9.5px]">
            ({pose.roll.toFixed(3)} rad)
          </span>
        </span>
      </div>

      <div className="flex justify-between items-center text-text-body font-mono">
        <span className="text-text-muted font-sans">Distance:</span>
        <span>
          <strong className="text-amber-600 dark:text-amber-400">
            {distMeters}
          </strong>{' '}
          <span className="text-text-faint text-[9.5px]">meters</span>
        </span>
      </div>

      <div className="flex justify-between items-center text-text-body font-mono">
        <span className="text-text-muted font-sans">Target (X,Y,Z):</span>
        <span className="text-text-main">
          [{tx}, {ty}, {tz}]
        </span>
      </div>

      <div className="flex justify-between items-center text-text-body font-mono pt-1 border-t border-border-subtle">
        <span className="text-text-muted font-sans">Equivalent Lens:</span>
        <span className="text-amber-600 dark:text-amber-400 font-semibold">
          {lensMm}mm
        </span>
      </div>

      {source === 'stage' && (
        <>
          {maneuver && (
            <div className="flex justify-between items-center text-text-body font-mono">
              <span className="text-text-muted font-sans">Maneuver:</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold uppercase">
                {maneuver}
              </span>
            </div>
          )}

          {(dof?.hasExplicitFocus || dof?.enabled) && (
            <div className="flex justify-between items-center text-text-body font-mono">
              <span className="text-text-muted font-sans">Focus Distance:</span>
              <span className="text-emerald-500 font-semibold">
                {dof.focusDistanceM.toFixed(2)}m
              </span>
            </div>
          )}

          {dof?.enabled && (
            <div className="flex justify-between items-center text-text-body font-mono">
              <span className="text-text-muted font-sans">Aperture:</span>
              <span className="text-text-main font-semibold">
                {formatApertureFStop(dof.apertureFStop)}
              </span>
            </div>
          )}
        </>
      )}

      {currentRig && (
        <div className="flex justify-between items-center text-text-body font-mono">
          <span className="text-text-muted font-sans">Rig Mount:</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold uppercase">
            {currentRig.type.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Subtle 1-Click Copy Helper Footer */}
      <div className="flex items-center justify-center gap-1.5 pt-2 mt-0.5 border-t border-border-subtle text-[9.5px] font-mono text-text-muted">
        <Copy className="w-3 h-3 text-text-faint" />
        <span>Click capsule to copy YAML block</span>
      </div>
    </div>
  );
};

