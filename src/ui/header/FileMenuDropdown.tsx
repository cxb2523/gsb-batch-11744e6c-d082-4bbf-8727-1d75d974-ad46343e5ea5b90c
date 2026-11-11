/**
 * FileMenuDropdown Component for StageFlow Studio Header.
 * Houses project I/O, score creation, score management, and reference links
 * in a tiered SceneFlow-style dropdown.
 */

import React, { useRef, useEffect } from 'react';
import {
  ChevronDown,
  FolderOpen,
  Download,
  Plus,
  FolderKanban,
  Book,
  ExternalLink,
} from 'lucide-react';
import { UI_TOKENS } from '../tokens/ui';
import type { FilterTab } from '../ScoreLibraryModal';

export interface FileMenuDropdownProps {
  isOpen: boolean;
  customScoresCount: number;
  onToggle: () => void;
  onClose: () => void;
  onUploadFiles: (files: FileList) => void;
  onExportActiveScore: () => void;
  onCreateBlankScore?: () => void;
  onOpenLibrary: (tab?: FilterTab) => void;
}

export const FileMenuDropdown: React.FC<FileMenuDropdownProps> = ({
  isOpen,
  customScoresCount,
  onToggle,
  onClose,
  onUploadFiles,
  onExportActiveScore,
  onCreateBlankScore,
  onOpenLibrary,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative select-none">
      {/* File Menu Trigger Button */}
      <button
        type="button"
        id="studio-file-menu-button"
        onClick={onToggle}
        className={`${
          isOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill
        } flex items-center gap-1.5`}
        title="Score & File Actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span>File</span>
        <ChevronDown
          className={`w-3 h-3 text-text-muted transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-text-main' : ''
          }`}
        />
      </button>

      {/* Hidden File Input for Open / Load */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml,.json,.mp4,.webm,.mov,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUploadFiles(e.target.files);
            e.target.value = '';
            onClose();
          }
        }}
      />

      {/* Dropdown Menu Panel */}
      {isOpen && (
        <div
          role="menu"
          aria-labelledby="studio-file-menu-button"
          className="absolute top-full left-0 mt-2 w-64 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main text-xs font-mono divide-y divide-border-subtle animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Section 1: File & Media I/O */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-body hover:text-text-main hover:bg-surface-subtle transition-colors text-left cursor-pointer"
              title="Load local .yaml score or .mp4/.webm video file"
            >
              <FolderOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>Open Video or Score...</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExportActiveScore();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-body hover:text-text-main hover:bg-surface-subtle transition-colors text-left cursor-pointer"
              title="Download active choreography score as .yaml file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Export Active Score (.yaml)</span>
            </button>
          </div>

          {/* Section 2: Score Creation & Management */}
          <div className="p-1.5 space-y-0.5">
            {onCreateBlankScore && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onCreateBlankScore();
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-body hover:text-text-main hover:bg-surface-subtle transition-colors text-left cursor-pointer"
                title="Create a new blank choreography score"
              >
                <Plus className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                <span>New Blank Score...</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenLibrary('custom');
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-text-body hover:text-text-main hover:bg-surface-subtle transition-colors text-left cursor-pointer"
              title="Manage Custom Scores (Rename, Duplicate, Export, Delete)"
            >
              <div className="flex items-center gap-2">
                <FolderKanban className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Manage Custom Scores</span>
              </div>
              {customScoresCount > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-300 px-1.5 py-0.2 rounded-full font-bold">
                  {customScoresCount}
                </span>
              )}
            </button>
          </div>

          {/* Section 3: Library & Reference Documentation */}
          <div className="p-1.5 space-y-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenLibrary();
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-text-body hover:text-amber-600 dark:hover:text-amber-300 hover:bg-surface-subtle transition-colors text-left cursor-pointer"
              title="Browse bundled blueprint scores and custom scores"
            >
              <Book className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Score Library...</span>
            </button>

            <a
              href="?mode=guide"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors text-left"
              title="Open StageFlow YAML Score Authoring Manual in a new tab"
            >
              <span>YAML Authoring Guide</span>
              <ExternalLink className="w-3 h-3 text-text-faint" />
            </a>

            <a
              href="?mode=spec"
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors text-left"
              title="Open StageFlow Script Technical Specification in a new tab"
            >
              <span>Script Specification</span>
              <ExternalLink className="w-3 h-3 text-text-faint" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
