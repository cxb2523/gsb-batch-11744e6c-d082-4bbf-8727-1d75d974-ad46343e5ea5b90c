/**
 * Accessible confirmation and conflict dialog modal for external choreography scores
 * (remote HTTP URLs and conflicting dropped files).
 * Styled with SceneFlow tactile design tokens.
 */

import React, { useEffect } from 'react';
import { Globe, AlertTriangle, Download, Copy, RefreshCw, X, Loader2 } from 'lucide-react';
import { UI_TOKENS } from './tokens/ui';

export type RemoteModalMode = 'url-import' | 'url-conflict' | 'file-conflict';

export interface ConfirmRemoteScoreModalProps {
  isOpen: boolean;
  mode: RemoteModalMode;
  targetUrl?: string;
  existingTitle?: string;
  sourceFileName?: string;
  isLoading?: boolean;
  onCancel: () => void;
  onConfirmImport?: () => void;
  onKeepLocal?: () => void;
  onOverwrite?: () => void;
  onSaveAsCopy?: () => void;
}

export const ConfirmRemoteScoreModal: React.FC<ConfirmRemoteScoreModalProps> = ({
  isOpen,
  mode,
  targetUrl,
  existingTitle,
  sourceFileName,
  isLoading = false,
  onCancel,
  onConfirmImport,
  onKeepLocal,
  onOverwrite,
  onSaveAsCopy,
}) => {
  useEffect(() => {
    if (!isOpen || isLoading) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remote-modal-title"
      className={UI_TOKENS.modal.overlay}
      onClick={() => {
        if (!isLoading) onCancel();
      }}
    >
      <div
        className={UI_TOKENS.modal.containerSm}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5">
            {mode === 'url-import' ? (
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-500 shrink-0">
                <Globe className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
            )}
            <div>
              <h2
                id="remote-modal-title"
                className="text-sm font-bold font-sans text-text-main"
              >
                {mode === 'url-import'
                  ? 'Load Remote Score'
                  : mode === 'url-conflict'
                  ? 'Local Edits Detected'
                  : 'Project Already in Library'}
              </h2>
              <span className="text-[11px] font-mono text-text-muted">
                {mode === 'file-conflict'
                  ? sourceFileName || 'Dropped YAML File'
                  : targetUrl
                  ? new URL(targetUrl).hostname
                  : 'External Choreography'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            aria-label="Close dialog"
            className={UI_TOKENS.button.iconClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-3 font-sans text-xs text-text-body">
          {mode === 'url-import' && (
            <>
              <p className="leading-relaxed">
                Do you want to fetch and open the external choreography score from the following address?
              </p>
              {targetUrl && (
                <div className="p-2.5 rounded-lg bg-surface-subtle border border-border-subtle font-mono text-[11px] text-sky-400 break-all select-all">
                  {targetUrl}
                </div>
              )}
              <p className="text-[11px] text-text-muted leading-relaxed">
                The score will be imported and saved as a persistent <span className="text-text-main font-semibold">Custom Project</span> in your browser storage (IndexedDB).
              </p>
            </>
          )}

          {mode === 'url-conflict' && (
            <>
              <p className="leading-relaxed">
                You already have <span className="font-semibold text-text-main">"{existingTitle ?? 'this project'}"</span> in your library, but you have modified it locally.
              </p>
              {targetUrl && (
                <div className="p-2 rounded-lg bg-surface-subtle border border-border-subtle font-mono text-[11px] text-text-muted break-all">
                  {targetUrl}
                </div>
              )}
              <p className="text-[11px] text-text-muted leading-relaxed">
                Choose whether to keep your local edits, overwrite them with the remote version, or import as a separate copy.
              </p>
            </>
          )}

          {mode === 'file-conflict' && (
            <>
              <p className="leading-relaxed">
                A project matching <span className="font-semibold text-text-main">"{existingTitle ?? 'this score'}"</span> is already stored in your library, but the dropped file has different content.
              </p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Would you like to update your existing project or import this file as a new separate copy?
              </p>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className={UI_TOKENS.modal.footer}>
          {mode === 'url-import' && (
            <div className="flex items-center justify-end gap-2 w-full">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className={UI_TOKENS.button.secondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmImport}
                disabled={isLoading}
                className={`${UI_TOKENS.button.primary} flex items-center gap-1.5`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Fetching Score...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Load Remote Score</span>
                  </>
                )}
              </button>
            </div>
          )}

          {(mode === 'url-conflict' || mode === 'file-conflict') && (
            <div className="flex items-center justify-end gap-2 flex-wrap w-full">
              <button
                type="button"
                onClick={onKeepLocal ?? onCancel}
                disabled={isLoading}
                className={UI_TOKENS.button.secondary}
              >
                Keep Existing
              </button>
              <button
                type="button"
                onClick={onSaveAsCopy}
                disabled={isLoading}
                className={`${UI_TOKENS.button.secondary} flex items-center gap-1.5`}
              >
                <Copy className="w-3.5 h-3.5 text-sky-400" />
                <span>Save as New Copy</span>
              </button>
              <button
                type="button"
                onClick={onOverwrite}
                disabled={isLoading}
                className={`${UI_TOKENS.button.danger} flex items-center gap-1.5`}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Overwrite Existing</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

