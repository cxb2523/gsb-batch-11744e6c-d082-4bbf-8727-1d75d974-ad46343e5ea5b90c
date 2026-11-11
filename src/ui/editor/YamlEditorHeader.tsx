/**
 * Top Header Bar for the YAML Score Editor Studio.
 * Houses title, active synchronization indicator, and close button.
 * Editorial actions (Guide, Wrap, Copy) reside in the companion YamlActionBar.
 */

import React, { useCallback } from 'react';
import { BookOpen, Code2, FileText, X } from 'lucide-react';
import { UI_TOKENS } from '../tokens/ui';

export interface YamlEditorHeaderProps {
  isBundled: boolean;
  onOpenSpec?: () => void;
  onOpenGuide?: () => void;
  onClose: () => void;
}

export const YamlEditorHeader: React.FC<YamlEditorHeaderProps> = React.memo(
  ({ isBundled, onOpenSpec, onOpenGuide, onClose }) => {
    const handleDefaultOpenSpec = useCallback(() => {
      const url = `${window.location.origin}${window.location.pathname}?mode=spec`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const handleDefaultOpenGuide = useCallback(() => {
      const url = `${window.location.origin}${window.location.pathname}?mode=guide`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }, []);

    const handleSpecClick = onOpenSpec ?? handleDefaultOpenSpec;
    const handleGuideClick = onOpenGuide ?? handleDefaultOpenGuide;

    return (
      <div className="h-10 px-4 border-b border-border-main flex items-center justify-between gap-2 select-none bg-surface-subtle shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono font-bold text-text-main truncate">
              Live YAML Score
            </span>
            {isBundled ? (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-400/30 shrink-0">
                Read-Only
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-1.5 py-0.2 rounded text-[9px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Sync</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleSpecClick}
            className="px-2 py-1 rounded-md bg-surface hover:bg-surface-hover border border-border-main text-[10px] font-mono text-text-body hover:text-text-main flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
            title="Open StageFlow Script Technical Specification in a new tab"
          >
            <FileText className="w-3 h-3 text-sky-400" />
            <span>SPEC</span>
          </button>

          <button
            type="button"
            onClick={handleGuideClick}
            className="px-2 py-1 rounded-md bg-surface hover:bg-surface-hover border border-border-main text-[10px] font-mono text-text-body hover:text-text-main flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
            title="Open YAML Score Authoring Guide in a new tab"
          >
            <BookOpen className="w-3 h-3 text-amber-500" />
            <span>Guide</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className={UI_TOKENS.button.iconClose}
            title="Close Editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }
);
