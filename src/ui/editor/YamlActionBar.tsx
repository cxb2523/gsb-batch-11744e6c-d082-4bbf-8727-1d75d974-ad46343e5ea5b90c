/**
 * Directorial Action Bar for the YAML Score Editor.
 * Houses Wrap, Copy, and Fork-to-Edit action pills.
 * The Guide button is located in the top YamlEditorHeader.
 */

import React, { useState, useCallback } from 'react';
import { ArrowRight, Check, Copy, WrapText } from 'lucide-react';

export interface YamlActionBarProps {
  rawYaml: string;
  isBundled: boolean;
  wordWrap: boolean;
  onToggleWordWrap: () => void;
  onForkScore?: () => void;
}

export const YamlActionBar: React.FC<YamlActionBarProps> = React.memo(
  ({ rawYaml, isBundled, wordWrap, onToggleWordWrap, onForkScore }) => {
    const [copied, setCopied] = useState(false);

    const handleCopyAll = useCallback(() => {
      navigator.clipboard.writeText(rawYaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }, [rawYaml]);

    return (
      <div className="px-3.5 py-1.5 border-b border-border-subtle bg-surface flex items-center justify-between gap-1.5 select-none shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleWordWrap}
            className={`px-2 py-1 rounded-md border text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95 ${
              wordWrap
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium'
                : 'bg-surface-subtle hover:bg-surface-hover border-border-main text-text-body hover:text-text-main'
            }`}
            title={
              wordWrap
                ? 'Disable soft line-wrapping'
                : 'Enable soft line-wrapping'
            }
          >
            <WrapText className="w-3 h-3" />
            <span>Wrap</span>
          </button>

          <button
            type="button"
            onClick={handleCopyAll}
            className="px-2 py-1 rounded-md bg-surface-subtle hover:bg-surface-hover border border-border-main text-[10px] font-mono text-text-body hover:text-text-main flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
            title="Copy full YAML score"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-300">
                  Copied
                </span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-text-muted" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {isBundled && onForkScore && (
          <button
            type="button"
            onClick={onForkScore}
            className="px-2 py-1 rounded-md bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-[10px] font-mono text-sky-600 dark:text-sky-300 font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
            title="Fork this bundled blueprint into an editable Custom Project"
          >
            <span>Fork to Edit</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }
);
