/**
 * Lightweight floating Toast Notification container for StageFlow.
 * Displays temporary feedback banners for file imports, forking, and project actions.
 * Styled with SceneFlow tactile card design tokens.
 */

import React from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import type { ToastNotification } from '../core/types';

export interface ToastContainerProps {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed top-14 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none"
    >
      {toasts.map((toast) => {
        const type = toast.type ?? 'info';
        const isSuccess = type === 'success';
        const isWarning = type === 'warning';
        const isError = type === 'error';

        const borderColor = isSuccess
          ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
          : isWarning
          ? 'border-amber-500/40 text-amber-700 dark:text-amber-300'
          : isError
          ? 'border-red-500/40 text-red-700 dark:text-red-300'
          : 'border-border-main text-text-main';

        const Icon = isSuccess
          ? CheckCircle2
          : isWarning
          ? AlertTriangle
          : isError
          ? XCircle
          : Info;

        const iconColor = isSuccess
          ? 'text-emerald-500'
          : isWarning
          ? 'text-amber-500'
          : isError
          ? 'text-red-500'
          : 'text-sky-500';

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 p-3.5 rounded-2xl border shadow-xl bg-surface text-xs font-mono transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${borderColor}`}
          >
            <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0 break-words leading-relaxed text-text-main">
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg hover:bg-surface-muted text-text-muted hover:text-text-main cursor-pointer shrink-0 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
