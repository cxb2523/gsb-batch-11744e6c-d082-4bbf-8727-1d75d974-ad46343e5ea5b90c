/**
 * Diagnostics & Alert Banner for the YAML Score Editor.
 * Surfaces syntax diagnostics with exact line/column locations and 1-click jump actions,
 * or schema warnings. Renders nothing when the score is valid.
 */

import React from 'react';
import { AlertTriangle, CornerDownRight } from 'lucide-react';
import type { ScoreDiagnostic } from '../../core/types';

export interface YamlDiagnosticsBannerProps {
  parseError: string | null;
  parseWarning?: string | null;
  diagnostics?: ScoreDiagnostic[];
  onJumpToLine?: (line: number, column?: number) => void;
}

export const YamlDiagnosticsBanner: React.FC<YamlDiagnosticsBannerProps> =
  React.memo(({ parseError, parseWarning, diagnostics, onJumpToLine }) => {
    if (!parseError && !parseWarning) return null;

    const primaryDiagnostic = diagnostics?.[0];

    return (
      <div className="flex flex-col shrink-0 select-none">
        {/* Syntax Error Alert */}
        {parseError && (
          <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 flex items-start gap-2.5 text-xs font-mono text-rose-700 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-bold text-[11px] text-rose-800 dark:text-rose-300">
                  Syntax Error
                </span>
                {primaryDiagnostic && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-700 dark:text-rose-200 border border-rose-500/30 font-semibold">
                    Line {primaryDiagnostic.line}
                    {primaryDiagnostic.column
                      ? `, Col ${primaryDiagnostic.column}`
                      : ''}
                  </span>
                )}
                {primaryDiagnostic && onJumpToLine && (
                  <button
                    type="button"
                    onClick={() =>
                      onJumpToLine(
                        primaryDiagnostic.line,
                        primaryDiagnostic.column
                      )
                    }
                    className="px-1.5 py-0.2 rounded text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs active:scale-95"
                    title="Jump cursor to this line in CodeMirror"
                  >
                    <CornerDownRight className="w-2.5 h-2.5" />
                    <span>Jump</span>
                  </button>
                )}
              </div>
              <div className="break-words text-[11px] leading-relaxed opacity-90 line-clamp-3">
                {parseError}
              </div>
            </div>
          </div>
        )}

        {/* Schema Warning Alert */}
        {parseWarning && !parseError && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 flex items-start gap-2 text-[11px] font-mono text-amber-700 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 break-words leading-relaxed">
              {parseWarning}
            </div>
          </div>
        )}
      </div>
    );
  });
