/**
 * Floating Telemetry Capsule + 1-Click YAML Snippet Copy (Taruma-Film Pattern).
 * Displays live human degrees and metric meters for either the Observer Camera
 * or the active Shot's Stage Camera with an integrated [ OBS | CAM ] segmented switch,
 * and copies a ready-to-paste scoped YAML camera block to clipboard on click.
 * Styled with SceneFlow tactile pill design tokens.
 * Layer 5 UI Component.
 */

import React, { useState, useEffect, memo } from 'react';
import { Camera, Check, Copy, Eye } from 'lucide-react';
import type {
  CameraViewMode,
  EvaluatedCameraRigState,
  SphericalPose,
  StageFrame,
} from '../core/types';
import { radToDeg } from '../core/sphericalMath';
import {
  formatTelemetryYamlSnippet,
  type TelemetryCameraSource,
} from './telemetryYamlFormatter';
import { CameraTelemetryHoverCard } from './CameraTelemetryHoverCard';

export interface CameraTelemetryCapsuleProps {
  observerPose?: SphericalPose;
  stageCamera?: StageFrame['stageCamera'];
  observerRig?: EvaluatedCameraRigState;
  cameraMode?: CameraViewMode;
  dioramaWidth?: number;
  /** Legacy fallbacks for backwards compatibility */
  pose?: SphericalPose;
  activeRig?: EvaluatedCameraRigState;
}

const PillStat: React.FC<{
  label: string;
  value: string;
  copied: boolean;
  valueClass?: string;
  title?: string;
}> = ({ label, value, copied, valueClass, title }) => (
  <span className="flex items-center gap-0.5" title={title}>
    <span className="text-[9px] text-text-faint font-mono">{label}</span>
    <span
      className={
        copied
          ? 'text-emerald-600 dark:text-emerald-300 font-bold'
          : (valueClass ?? 'font-bold text-text-main')
      }
    >
      {value}
    </span>
  </span>
);

export const CameraTelemetryCapsule: React.FC<CameraTelemetryCapsuleProps> =
  memo(
    ({
      observerPose,
      stageCamera,
      observerRig,
      cameraMode,
      dioramaWidth,
      pose,
      activeRig: legacyActiveRig,
    }) => {
      const [selectedSource, setSelectedSource] =
        useState<TelemetryCameraSource>(
          cameraMode === 'stage-pov' ? 'stage' : 'observer'
        );
      const [copied, setCopied] = useState(false);
      const [isHovered, setIsHovered] = useState(false);

      // Auto-sync with viewport camera mode changes (with manual override retained)
      useEffect(() => {
        if (cameraMode === 'stage-pov') {
          setSelectedSource('stage');
        } else if (cameraMode === 'scripted' || cameraMode === 'free') {
          setSelectedSource('observer');
        }
      }, [cameraMode]);

      // Resolve active telemetry based on user's selected source
      const isStage = selectedSource === 'stage' && !!stageCamera;
      const activePose = isStage
        ? stageCamera.transform.pose
        : (observerPose ?? pose ?? stageCamera?.transform.pose);

      if (!activePose) return null;

      const currentRig = isStage
        ? stageCamera.rig
        : (observerRig ?? legacyActiveRig);
      const dof = isStage ? stageCamera.dof : undefined;
      const maneuver = isStage ? stageCamera.maneuver : undefined;

      const showTargetCoords =
        dioramaWidth === undefined || dioramaWidth >= 920;

      const pitchDeg = radToDeg(activePose.pitch).toFixed(1);
      const yawDeg = radToDeg(activePose.yaw).toFixed(1);
      const rollVal = radToDeg(activePose.roll);
      const rollDeg = rollVal.toFixed(1);
      const hasNonZeroRoll = Math.abs(rollVal) >= 0.05;
      const distMeters = activePose.distance.toFixed(2);
      const tx = activePose.target.x.toFixed(2);
      const ty = activePose.target.y.toFixed(2);
      const tz = activePose.target.z.toFixed(2);
      const lensMm = Math.round(activePose.focalLengthMm);

      const handleCopyYaml = (e: React.MouseEvent) => {
        e.stopPropagation();

        const yamlSnippet = formatTelemetryYamlSnippet({
          source: selectedSource,
          pose: activePose,
          activeRig: currentRig,
          dof,
          maneuver,
        });

        navigator.clipboard.writeText(yamlSnippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      };

      return (
        <div
          className="absolute bottom-3 right-3 select-none z-20 flex items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Unified Tactile Capsule Container */}
          <div
            className={`flex items-center p-1 rounded-xl border text-[11px] font-mono transition-all shadow-md ${
              copied
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-300'
                : 'bg-surface border-border-main text-text-body'
            }`}
          >
            {/* Integrated [ OBS | CAM ] Segmented Switcher */}
            {stageCamera && (
              <div className="flex items-center bg-surface-subtle/90 p-0.5 rounded-lg border border-border-subtle shrink-0 mr-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSource('observer');
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
                    selectedSource === 'observer'
                      ? 'bg-surface text-amber-600 dark:text-amber-400 font-bold shadow-2xs border border-border-subtle'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                  title="Inspect & copy Observer Camera telemetry"
                >
                  <Eye className="w-3 h-3" />
                  <span>OBS</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSource('stage');
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
                    selectedSource === 'stage'
                      ? 'bg-surface text-amber-600 dark:text-amber-400 font-bold shadow-2xs border border-border-subtle'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                  title="Inspect & copy Stage Camera telemetry"
                >
                  <Camera className="w-3 h-3" />
                  <span>CAM</span>
                </button>
              </div>
            )}

            {/* Clickable 1-Click Copy Telemetry Button */}
            <button
              type="button"
              onClick={handleCopyYaml}
              className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer hover:bg-surface-hover/80 group"
              title={`Click to copy YAML ${
                selectedSource === 'stage' ? 'camera' : 'observer_camera'
              } block to clipboard`}
            >
              {copied && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}

              <PillStat label="P" value={`${pitchDeg}°`} copied={copied} />
              <span className="text-border-main">·</span>
              <PillStat label="Y" value={`${yawDeg}°`} copied={copied} />

              {hasNonZeroRoll && (
                <>
                  <span className="text-border-main">·</span>
                  <PillStat
                    label="R"
                    value={`${rollDeg}°`}
                    copied={copied}
                    valueClass="font-bold text-violet-600 dark:text-violet-300"
                    title="Camera Roll (Dutch Angle)"
                  />
                </>
              )}

              <span className="text-border-main">·</span>
              <PillStat
                label="D"
                value={`${distMeters}m`}
                copied={copied}
                valueClass="font-bold text-amber-600 dark:text-amber-400"
              />

              {showTargetCoords && (
                <>
                  <span className="text-border-main hidden sm:inline">·</span>
                  <span className="hidden sm:flex items-center gap-0.5 text-text-muted">
                    <span className="text-[9px] text-text-faint font-mono">TGT</span>
                    <span>[{tx}, {ty}, {tz}]</span>
                  </span>
                </>
              )}

              <span className="text-border-main hidden md:inline">·</span>
              <span className="hidden md:inline text-text-main font-semibold">
                {lensMm}mm
              </span>

              {currentRig && (
                <>
                  <span className="text-border-main hidden lg:inline">·</span>
                  <span className="hidden lg:inline px-1 py-0.5 rounded text-[8.5px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 uppercase">
                    {currentRig.type.replace('_', ' ')}
                  </span>
                </>
              )}

              <Copy className="w-3 h-3 text-text-faint group-hover:text-text-main ml-0.5 shrink-0" />
            </button>
          </div>

          {/* Upward Hover Precision Telemetry Tooltip */}
          {isHovered && (
            <CameraTelemetryHoverCard
              source={selectedSource}
              pose={activePose}
              pitchDeg={pitchDeg}
              yawDeg={yawDeg}
              rollDeg={rollDeg}
              hasNonZeroRoll={hasNonZeroRoll}
              distMeters={distMeters}
              tx={tx}
              ty={ty}
              tz={tz}
              lensMm={lensMm}
              currentRig={currentRig}
              dof={dof}
              maneuver={maneuver}
            />
          )}
        </div>
      );
    }
  );

CameraTelemetryCapsule.displayName = 'CameraTelemetryCapsule';
