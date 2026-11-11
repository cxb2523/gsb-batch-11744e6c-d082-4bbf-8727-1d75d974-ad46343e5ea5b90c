/**
 * SceneProductionBrief Component.
 * Executive Scene Production Sheet & Call Sheet for the Scene Desk.
 * Displays glance stat ribbon, scene premise & directorial notes,
 * camera & optical package, and categorized cast & prop lineup.
 * Layer 5 UI Component.
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Clock,
  Layers,
  Video,
  Camera,
  Film,
  Aperture,
  Compass,
} from 'lucide-react';
import type { StageScore } from '../../core/types';
import { SceneEntityRoster } from './SceneEntityRoster';
import { SceneMetadataCard } from './SceneMetadataCard';

export interface SceneProductionBriefProps {
  score: StageScore;
}

function formatAspectRatio(ratio: number | string | undefined): string {
  if (typeof ratio === 'string') return ratio;
  if (!ratio || Number.isNaN(ratio)) return '16:9';
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 2.39) < 0.08 || Math.abs(ratio - 2.35) < 0.08) return '2.39:1';
  if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  return `${ratio.toFixed(2)}:1`;
}

function getMediaSourceBadge(videoUrl?: string): {
  label: string;
  icon: React.FC<{ className?: string }>;
} {
  if (!videoUrl || videoUrl.startsWith('procedural://')) {
    return { label: 'Simulator', icon: Camera };
  }
  if (
    videoUrl.startsWith('youtube://') ||
    videoUrl.includes('youtube.com') ||
    videoUrl.includes('youtu.be')
  ) {
    return { label: 'YouTube Sync', icon: Film };
  }
  return { label: 'Video Player', icon: Video };
}

export const SceneProductionBrief: React.FC<SceneProductionBriefProps> = ({
  score,
}) => {
  const durationSec = score.durationSec ?? 0;
  const shotCount = score.shots?.length ?? 0;
  const mediaBadge = getMediaSourceBadge(score.videoUrl);
  const MediaIcon = mediaBadge.icon;

  // Extract unique prime lenses and camera maneuvers across the scene
  const { lenses, maneuvers } = useMemo(() => {
    const lensSet = new Set<string>();
    const maneuverSet = new Set<string>();

    (score.shots ?? []).forEach((shot) => {
      if (shot.stageCamera?.focalLengthMm) {
        lensSet.add(`${Math.round(shot.stageCamera.focalLengthMm)}mm`);
      }
      if (shot.stageCamera?.maneuver) {
        maneuverSet.add(shot.stageCamera.maneuver.toUpperCase());
      }
    });

    return {
      lenses: Array.from(lensSet),
      maneuvers: Array.from(maneuverSet),
    };
  }, [score]);

  return (
    <div className="flex-1 min-h-0 p-2.5 overflow-y-auto space-y-2 custom-scrollbar text-text-main select-text">
      {/* 1. Glance Stat Ribbon (Camera Slate Overview) */}
      <div className="p-2 rounded-xl bg-surface border border-border-main shadow-2xs">
        <div className="flex items-center justify-between gap-1 text-[11px] font-mono text-text-main flex-wrap">
          <span className="flex items-center gap-1 font-semibold shrink-0">
            <Clock className="w-3 h-3 text-text-muted" />
            <span>{durationSec.toFixed(1)}s</span>
          </span>

          <span className="text-border-main select-none">·</span>

          <span className="flex items-center gap-1 font-semibold shrink-0">
            <Layers className="w-3 h-3 text-text-muted" />
            <span>{shotCount} Shots</span>
          </span>

          <span className="text-border-main select-none">·</span>

          <span className="flex items-center gap-1 font-semibold shrink-0">
            <Video className="w-3 h-3 text-text-muted" />
            <span>{formatAspectRatio(score.aspectRatio)}</span>
          </span>

          <span className="text-border-main select-none">·</span>

          <span className="flex items-center gap-1 font-semibold shrink-0 truncate max-w-[110px]" title={mediaBadge.label}>
            <MediaIcon className="w-3 h-3 text-text-muted" />
            <span className="truncate">{mediaBadge.label}</span>
          </span>
        </div>
      </div>

      {/* 2. Scene Title & Directorial Premise Card */}
      <div className="p-2.5 rounded-xl bg-surface border border-border-main shadow-2xs space-y-1.5">
        <div className="space-y-0.5">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent-primary font-bold block">
            Scene Premise
          </span>
          <h2 className="text-sm font-bold font-sans text-text-main leading-snug">
            {score.title}
          </h2>
          {score.subtitle && (
            <p className="text-[11.5px] font-sans text-text-muted leading-relaxed">
              {score.subtitle}
            </p>
          )}
        </div>

        {score.description ? (
          <div className="pt-1.5 border-t border-border-subtle text-[11px] text-text-body font-sans leading-relaxed space-y-1 prose dark:prose-invert max-w-none">
            <ReactMarkdown>{score.description}</ReactMarkdown>
          </div>
        ) : null}
      </div>

      {/* 3. Scene-Wide Metadata & Production Notes Card */}
      {score.metadata && Object.keys(score.metadata).length > 0 && (
        <SceneMetadataCard metadata={score.metadata} />
      )}

      {/* 4. Camera & Optical Package */}
      {(lenses.length > 0 || maneuvers.length > 0) && (
        <div className="p-2.5 rounded-xl bg-surface border border-border-main shadow-2xs space-y-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted font-bold block">
            Camera & Optical Package
          </span>

          {/* Prime Lens Package */}
          {lenses.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1 font-semibold">
                <Aperture className="w-2.5 h-2.5 text-amber-500" />
                <span>Prime Lenses</span>
              </span>
              <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                {lenses.map((lens) => (
                  <span
                    key={lens}
                    className="px-1.5 py-0.5 rounded-md bg-surface-subtle border border-border-main text-text-main font-semibold"
                  >
                    {lens}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Camera Maneuver Repertoire */}
          {maneuvers.length > 0 && (
            <div className="space-y-1 pt-1.5 border-t border-border-subtle">
              <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-1 font-semibold">
                <Compass className="w-2.5 h-2.5 text-sky-500" />
                <span>Maneuvers</span>
              </span>
              <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                {maneuvers.map((m) => (
                  <span
                    key={m}
                    className="px-1.5 py-0.5 rounded-md bg-surface-subtle border border-border-main text-text-muted font-medium"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. Categorized Cast & Props Lineup */}
      {score.entities && score.entities.length > 0 && (
        <div className="p-2.5 rounded-xl bg-surface border border-border-main shadow-2xs">
          <SceneEntityRoster entities={score.entities} />
        </div>
      )}
    </div>
  );
};
