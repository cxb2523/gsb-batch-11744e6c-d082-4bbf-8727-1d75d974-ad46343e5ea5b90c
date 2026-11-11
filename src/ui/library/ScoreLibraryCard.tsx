/**
 * ScoreLibraryCard Component for ScoreLibraryModal.
 * Renders a high-density, 2-line compact list row (~50px) for the Master-Detail catalog.
 * Line 1: Blueprint / Custom tag + Title (Inter 12px) + Active indicator
 * Line 2: Precision telemetry string (JetBrains Mono 10px): Media · Duration · Shots · Aspect
 */

import React from 'react';
import { Check, ChevronRight, Film, Camera, Video } from 'lucide-react';
import type { ScoreCatalogItem } from '../../core/scoreCatalog';

export interface ScoreLibraryCardProps {
  item: ScoreCatalogItem;
  isActive: boolean;
  isSelected?: boolean;
  onSelect: () => void;
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

interface BlueprintBadgeInfo {
  tag: string;
  badgeClass: string;
  accentBorder: string;
}

function getScoreBadgeInfo(item: ScoreCatalogItem): BlueprintBadgeInfo {
  if (item.category === 'custom' || item.isCustom) {
    return {
      tag: 'CUSTOM',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-400/30',
      accentBorder: 'border-l-amber-500',
    };
  }

  if (item.category === 'study') {
    return {
      tag: 'STUDY',
      badgeClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-400/30',
      accentBorder: 'border-l-violet-500',
    };
  }

  // Extract BP number if matches demo or blueprint-0X pattern
  let tag = 'BLUEPRINT';
  if (item.id === 'demo-blueprint') {
    tag = 'BP 01';
  } else {
    const match = item.id.match(/(?:blueprint[_-]?0?(\d+))/i);
    if (match?.[1]) {
      const num = parseInt(match[1], 10);
      tag = `BP ${num < 10 ? `0${num}` : num}`;
    }
  }

  return {
    tag,
    badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-400/30',
    accentBorder: 'border-l-sky-500',
  };
}

function getMediaSourceBadge(videoUrl?: string) {
  if (!videoUrl || videoUrl.startsWith('procedural://')) {
    return {
      label: 'Simulator',
      icon: Camera,
      className: 'text-cyan-600 dark:text-cyan-400',
    };
  }
  if (videoUrl.startsWith('youtube://') || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
    return {
      label: 'YouTube',
      icon: Film,
      className: 'text-rose-600 dark:text-rose-400',
    };
  }
  return {
    label: 'Video',
    icon: Video,
    className: 'text-amber-600 dark:text-amber-400',
  };
}

export const ScoreLibraryCard: React.FC<ScoreLibraryCardProps> = ({
  item,
  isActive,
  isSelected = false,
  onSelect,
}) => {
  const durationSec = item.score?.durationSec ?? 0;
  const shotCount = item.score?.shots?.length ?? 0;
  const aspectRatio = item.score?.aspectRatio ?? '16:9';
  const badgeInfo = getScoreBadgeInfo(item);
  const mediaBadge = getMediaSourceBadge(item.score?.videoUrl);
  const MediaIcon = mediaBadge.icon;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 group relative select-none border-l-[3px] ${badgeInfo.accentBorder} ${
        isSelected
          ? 'border-border-main bg-surface-subtle ring-1 ring-text-main/20 shadow-xs'
          : 'border-border-subtle bg-surface hover:bg-surface-subtle'
      }`}
    >
      {/* Content Columns: Line 1 Title, Line 2 Telemetry */}
      <div className="min-w-0 flex-1 space-y-0.5">
        {/* Line 1: Tag + Title + Indicator */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border shrink-0 uppercase tracking-wider ${badgeInfo.badgeClass}`}
          >
            {badgeInfo.tag}
          </span>

          <h3 className="text-xs font-semibold font-sans text-text-main group-hover:text-text-main truncate">
            {item.title}
          </h3>
        </div>

        {/* Line 2: Precision Telemetry String */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted truncate">
          <span className={`inline-flex items-center gap-1 ${mediaBadge.className} shrink-0`}>
            <MediaIcon className="w-2.5 h-2.5" />
            <span>{mediaBadge.label}</span>
          </span>

          <span className="text-text-faint opacity-50">·</span>
          <span className="shrink-0">{durationSec.toFixed(1)}s</span>

          <span className="text-text-faint opacity-50">·</span>
          <span className="shrink-0">{shotCount} {shotCount === 1 ? 'shot' : 'shots'}</span>

          <span className="text-text-faint opacity-50">·</span>
          <span className="shrink-0">{formatAspectRatio(aspectRatio)}</span>
        </div>
      </div>

      {/* Right Column: Active Chip or Selected Chevron */}
      <div className="shrink-0 flex items-center">
        {isActive ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-btn-primary-bg text-btn-primary-text border border-btn-primary-bg px-1.5 py-0.2 rounded-full shadow-2xs">
            <Check className="w-2.5 h-2.5" />
            <span>Active</span>
          </span>
        ) : isSelected ? (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-text-main transition-colors" />
        ) : null}
      </div>
    </div>
  );
};
