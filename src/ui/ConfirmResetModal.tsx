/**
 * Accessible confirmation dialog modal before resetting a scene score draft.
 * Informs the user that any edits stored in IndexedDB will be discarded.
 * Styled with SceneFlow tactile modal design tokens.
 */

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { UI_TOKENS } from './tokens/ui';

export interface ConfirmResetModalProps {
  isOpen: boolean;
  sceneTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmResetModal: React.FC<ConfirmResetModalProps> = ({
  isOpen,
  sceneTitle,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-reset-title"
      className={UI_TOKENS.modal.overlay}
      onClick={onCancel}
    >
      <div
        className={UI_TOKENS.modal.containerSm}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="confirm-reset-title"
                className="text-sm font-bold font-sans text-text-main"
              >
                Reset Scene Blueprint?
              </h2>
              <span className="text-[11px] font-mono text-text-muted">
                {sceneTitle}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className={UI_TOKENS.button.iconClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-xs text-text-body leading-relaxed font-sans">
            This will delete your draft stored in <span className="font-semibold text-text-main font-mono">IndexedDB</span> and revert the choreography score back to its pristine bundled baseline. This action cannot be undone.
          </p>
        </div>

        {/* Actions */}
        <div className={UI_TOKENS.modal.footer}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={UI_TOKENS.button.secondary}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={UI_TOKENS.button.danger}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard Edits & Reset</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
