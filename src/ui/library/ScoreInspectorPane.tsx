/**
 * ScoreInspectorPane Component for ScoreLibraryModal.
 * Displays a rich right-column choreography inspector for the selected score:
 * - 2D Vector SVG Stage Minimap preview
 * - Full un-truncated title & directorial notes
 * - Media source, lens coverage, and camera maneuver breakdown
 * - Shot-by-shot sequence strip and character lineup
 * - Unified action bar (Load, Fork, Duplicate, Export, Rename, Delete)
 */

import React, { useState, useMemo } from 'react';
import {
  Play,
  Check,
  GitFork,
  Download,
  Pencil,
  Copy,
  Trash2,
  Clock,
  Layers,
  Video,
  Users,
  Film,
  Camera,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { ScoreCatalogItem } from '../../core/scoreCatalog';
import { ScoreStageMinimap } from './ScoreStageMinimap';

export interface ScoreInspectorPaneProps {
  item: ScoreCatalogItem;
  isActive: boolean;
  onSelectScore: () => void;
  onForkScore?: (item: ScoreCatalogItem) => void;
  onDuplicateScore?: (id: string) => void;
  onExportScore?: (item: ScoreCatalogItem) => void;
  onRenameScore?: (id: string, newTitle: string) => Promise<boolean>;
  onDeleteScore?: (id: string) => Promise<boolean>;
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

function getMediaSourceInfo(videoUrl?: string): {
  label: string;
  badgeClass: string;
  icon: React.FC<{ className?: string }>;
} {
  if (!videoUrl) {
    return {
      label: 'Stage Cam Simulator',
      badgeClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/30',
      icon: Camera,
    };
  }
  if (videoUrl.startsWith('youtube://') || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
    return {
      label: 'YouTube Sync',
      badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-400/30',
      icon: Film,
    };
  }
  if (videoUrl.startsWith('procedural://')) {
    return {
      label: 'Stage Cam Simulator',
      badgeClass: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-400/30',
      icon: Camera,
    };
  }
  return {
    label: 'Local Video',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-400/30',
    icon: Video,
  };
}

export const ScoreInspectorPane: React.FC<ScoreInspectorPaneProps> = ({
  item,
  isActive,
  onSelectScore,
  onForkScore,
  onDuplicateScore,
  onExportScore,
  onRenameScore,
  onDeleteScore,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);

  const durationSec = item.score?.durationSec ?? 0;
  const shotCount = item.score?.shots?.length ?? 0;
  const entityCount = item.score?.entities?.length ?? 0;
  const aspectRatio = item.score?.aspectRatio ?? '16:9';
  const mediaInfo = getMediaSourceInfo(item.score?.videoUrl);
  const MediaIcon = mediaInfo.icon;

  // Extract unique lenses and maneuvers across shots
  const { lenses, maneuvers } = useMemo(() => {
    const lensSet = new Set<string>();
    const maneuverSet = new Set<string>();

    (item.score?.shots ?? []).forEach((shot) => {
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
  }, [item.score]);

  const handleSaveRename = async () => {
    if (editTitle.trim() && editTitle.trim() !== item.title && onRenameScore) {
      await onRenameScore(item.id, editTitle.trim());
    }
    setIsRenaming(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface text-text-main select-none">
      {/* Top Header: Title & Directorial Badges */}
      <div className="p-5 pb-4 border-b border-border-subtle shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Media Engine & Project Status Badges */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider ${mediaInfo.badgeClass}`}
            >
              <MediaIcon className="w-3 h-3" />
              <span>{mediaInfo.label}</span>
            </span>

            {item.isCustom ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-400/30 uppercase tracking-wider font-bold">
                Custom Project
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30 uppercase tracking-wider font-bold">
                Bundled Blueprint
              </span>
            )}
          </div>

          {/* Active Status Chip */}
          {isActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-btn-primary-bg text-btn-primary-text border border-btn-primary-bg shadow-2xs">
              <Check className="w-3 h-3" />
              <span>Active in Studio</span>
            </span>
          )}
        </div>

        {/* Title / Inline Rename */}
        {isRenaming ? (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              autoFocus
              className="flex-1 px-3 py-1.5 rounded-xl bg-surface-muted border border-border-main text-text-main text-base font-semibold focus:outline-none focus:ring-2 focus:ring-border-main"
            />
            <button
              type="button"
              onClick={handleSaveRename}
              className="px-3 py-1.5 rounded-xl bg-text-main text-surface text-xs font-mono font-bold"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsRenaming(false)}
              className="p-1.5 rounded-xl hover:bg-surface-muted text-text-faint hover:text-text-main"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2 pt-0.5">
            <h2 className="text-lg font-bold font-sans text-text-main leading-snug">
              {item.title}
            </h2>
            {item.isCustom && onRenameScore && (
              <button
                type="button"
                onClick={() => {
                  setEditTitle(item.title);
                  setIsRenaming(true);
                }}
                className="p-1 rounded-lg text-text-faint hover:text-text-main hover:bg-surface-muted transition-colors shrink-0"
                title="Rename Project"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Subtitle / Notes */}
        {item.subtitle && (
          <p className="text-xs font-sans text-text-muted leading-relaxed">
            {item.subtitle}
          </p>
        )}
      </div>

      {/* Middle Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        {/* 2D Top-Down Spatial Minimap & Telemetry Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <ScoreStageMinimap score={item.score} />

          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-faint font-bold">
                Optical & Staging Specs
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 rounded-xl bg-surface-muted/60 border border-border-subtle flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-faint flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> Duration
                  </span>
                  <span className="font-bold text-text-main">{durationSec.toFixed(1)}s</span>
                </div>
                <div className="p-2 rounded-xl bg-surface-muted/60 border border-border-subtle flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-faint flex items-center gap-1">
                    <Layers className="w-2.5 h-2.5" /> Shots
                  </span>
                  <span className="font-bold text-text-main">{shotCount}</span>
                </div>
                <div className="p-2 rounded-xl bg-surface-muted/60 border border-border-subtle flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-faint flex items-center gap-1">
                    <Video className="w-2.5 h-2.5" /> Film Gate
                  </span>
                  <span className="font-bold text-text-main">{formatAspectRatio(aspectRatio)}</span>
                </div>
                <div className="p-2 rounded-xl bg-surface-muted/60 border border-border-subtle flex flex-col gap-0.5">
                  <span className="text-[10px] text-text-faint flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" /> Entities
                  </span>
                  <span className="font-bold text-text-main">{entityCount}</span>
                </div>
              </div>
            </div>

            {/* Lens & Maneuver Pills */}
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-widest text-text-faint">
                Lenses & Maneuvers
              </span>
              <div className="flex flex-wrap gap-1.5 text-[10.5px] font-mono">
                {lenses.map((lens) => (
                  <span
                    key={lens}
                    className="px-2 py-0.5 rounded-lg bg-surface-subtle border border-border-main text-text-body font-semibold"
                  >
                    {lens}
                  </span>
                ))}
                {maneuvers.map((m) => (
                  <span
                    key={m}
                    className="px-2 py-0.5 rounded-lg bg-surface-subtle border border-border-main text-text-muted"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Character / Prop Lineup */}
        {entityCount > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border-subtle">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-faint font-bold">
              Entities & Cast ({entityCount})
            </span>
            <div className="flex flex-wrap gap-2">
              {(item.score?.entities ?? []).map((ent) => (
                <div
                  key={ent.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-muted/60 border border-border-subtle text-xs font-mono"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ent.color || '#38bdf8' }}
                  />
                  <span className="font-medium text-text-main">{ent.label || ent.id}</span>
                  <span className="text-[10px] text-text-faint capitalize">({ent.kind})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shot Sequence Breakdown */}
        {shotCount > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border-subtle">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-faint font-bold">
              Shot Coverage Sequence ({shotCount})
            </span>
            <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
              {(item.score?.shots ?? []).map((shot, idx) => {
                const duration = ((shot.endSec ?? 0) - (shot.startSec ?? 0)).toFixed(1);
                const lens = shot.stageCamera?.focalLengthMm
                  ? `${Math.round(shot.stageCamera.focalLengthMm)}mm`
                  : '50mm';
                const maneuver = shot.stageCamera?.maneuver || 'static';

                return (
                  <div
                    key={shot.id || idx}
                    className="p-2.5 rounded-xl bg-surface-muted/40 border border-border-subtle flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface border border-border-main text-text-muted shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-sans font-semibold text-text-main truncate">
                        {shot.label || `Shot ${idx + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-[11px] text-text-faint">
                      <span className="text-text-muted">{lens}</span>
                      <span>·</span>
                      <span className="uppercase">{maneuver}</span>
                      <span>·</span>
                      <span className="font-bold text-text-body">{duration}s</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Alert Banner */}
      {isDeletingConfirm && (
        <div className="p-3 mx-4 mb-2 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-mono font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Permanently delete "{item.title}"?</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsDeletingConfirm(false)}
              className="px-2.5 py-1 rounded-lg bg-surface border border-border-main text-text-main hover:bg-surface-muted font-mono"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (onDeleteScore) {
                  await onDeleteScore(item.id);
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-bold hover:bg-rose-700 shadow-xs"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Bottom Action Footer Bar */}
      <div className="p-4 border-t border-border-subtle bg-surface-subtle flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* Left Secondary Actions */}
        <div className="flex items-center gap-1.5">
          {/* Fork as Custom for Bundled */}
          {!item.isCustom && onForkScore && (
            <button
              type="button"
              onClick={() => onForkScore(item)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border-main hover:bg-surface-hover text-text-main text-xs font-mono font-medium shadow-2xs transition-colors"
              title="Clone this blueprint into an editable Custom Project"
            >
              <GitFork className="w-3.5 h-3.5 text-text-muted" />
              <span>Fork to Edit</span>
            </button>
          )}

          {/* Duplicate for Custom */}
          {item.isCustom && onDuplicateScore && (
            <button
              type="button"
              onClick={() => onDuplicateScore(item.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border-main hover:bg-surface-hover text-text-main text-xs font-mono font-medium shadow-2xs transition-colors"
              title="Duplicate project"
            >
              <Copy className="w-3.5 h-3.5 text-text-muted" />
              <span>Duplicate</span>
            </button>
          )}

          {/* Export YAML */}
          {onExportScore && (
            <button
              type="button"
              onClick={() => onExportScore(item)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border-main hover:bg-surface-hover text-text-main text-xs font-mono font-medium shadow-2xs transition-colors"
              title="Export choreography score as .yaml file"
            >
              <Download className="w-3.5 h-3.5 text-text-muted" />
              <span>Export</span>
            </button>
          )}

          {/* Delete Project for Custom */}
          {item.isCustom && onDeleteScore && !isDeletingConfirm && (
            <button
              type="button"
              onClick={() => setIsDeletingConfirm(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-rose-500/10 text-rose-500 text-xs font-mono transition-colors"
              title="Delete custom project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Primary Load Button */}
        <div>
          {isActive ? (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-muted text-text-muted border border-border-main text-xs font-mono font-bold opacity-80 cursor-default">
              <Check className="w-4 h-4 text-emerald-500" />
              <span>Loaded in Studio</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onSelectScore}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-btn-primary-bg text-btn-primary-text font-mono font-bold text-xs shadow-md hover:opacity-90 active:scale-98 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Load into Studio →</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
