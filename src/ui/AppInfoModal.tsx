/**
 * Accessible About & Information Dialog Modal for StageFlow.
 * Modeled after SceneFlow AppInfoModal design parity.
 */

import React, { useEffect } from 'react';
import {
  Info,
  X,
  ExternalLink,
  BookOpen,
  FileCode2,
  ShieldCheck,
  Layers,
  Keyboard,
  Sparkles,
  Video,
} from 'lucide-react';
import { UI_TOKENS } from './tokens/ui';

export interface AppInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GithubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

const APP_VERSION = '1.0.0';
const GITHUB_URL = 'https://github.com/taruma/stageflow';
const AUTHOR_URL = 'https://github.com/taruma';
const SCENEFLOW_URL = 'https://github.com/taruma/screenplay-sync';

const DOC_LINKS = [
  { label: 'GitHub Repository', url: GITHUB_URL, icon: GithubIcon, tag: 'Source' },
  { label: 'YAML Authoring Guide', url: `${GITHUB_URL}/blob/main/docs/YAML_AUTHORING_GUIDE.md`, icon: BookOpen, tag: 'Guide' },
  { label: 'Mathematical & Kinematic Spec', url: `${GITHUB_URL}/blob/main/docs/STAGEFLOW_SCRIPT_SPECIFICATION.md`, icon: FileCode2, tag: 'Spec' },
  { label: 'Choreography Score Catalog', url: `${GITHUB_URL}/blob/main/docs/SCORE_CATALOG.md`, icon: Layers, tag: 'Docs' },
  { label: '60fps Viewport Recorder CLI', url: `${GITHUB_URL}/blob/main/docs/VIEWPORT_RECORDER_GUIDE.md`, icon: Video, tag: 'CLI' },
  { label: 'Sister Suite: SceneFlow', url: SCENEFLOW_URL, icon: Sparkles, tag: 'Sister App' },
];

const QUICK_SHORTCUTS = [
  { key: 'Space', desc: 'Play / Pause (unlocks 3D orbit)' },
  { key: '[ / ]', desc: 'Step 1 frame backward / forward' },
  { key: '← / →', desc: 'Scrub ±1s (Hold Shift for ±5s)' },
  { key: 'B', desc: 'Toggle Stage Cam DoF bokeh blur' },
  { key: 'G', desc: 'Toggle framing & safe-action guides' },
  { key: 'L', desc: 'Cycle 3D mannequin label mode' },
];

export const AppInfoModal: React.FC<AppInfoModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-info-title"
      className={UI_TOKENS.modal.overlayHeavy}
      onClick={onClose}
    >
      <div
        className={`${UI_TOKENS.modal.containerMd} max-h-[90vh] flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-btn-primary-bg text-btn-primary-text flex items-center justify-center shrink-0 shadow-xs">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="app-info-title" className="text-base font-black tracking-tight text-text-main">
                  StageFlow
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-btn-primary-bg text-btn-primary-text rounded-md">
                  v{APP_VERSION}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-faint uppercase tracking-wider">
                <span>by</span>
                <a
                  href={AUTHOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-text-body hover:text-text-main hover:underline transition-colors inline-flex items-center gap-1"
                >
                  Taruma Sakti <ExternalLink className="w-2.5 h-2.5 text-text-faint" />
                </a>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close modal" className={UI_TOKENS.button.iconClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 lg:p-7 space-y-4 overflow-y-auto scrollbar-hide text-text-main">
          {/* Hero Card */}
          <div className="p-4 bg-surface-subtle border border-border-main rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-main">
                3D Camera-Blocking &amp; Scene Choreography Diorama
              </span>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-text-faint uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>MIT License</span>
              </div>
            </div>
            <p className="text-xs text-text-body leading-relaxed">
              An open-source, web-based 3D diorama that synchronizes reference video side-by-side with an interactive Three.js blueprint stage. Every millisecond of camera movement and actor blocking is mathematically deterministic.
            </p>
          </div>

          {/* Why I Built This Card */}
          <div className="p-4 bg-surface-subtle border border-border-main rounded-2xl space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-faint">
              Directorial Intent
            </span>
            <p className="text-xs italic text-text-body leading-relaxed border-l-2 border-border-main pl-3 my-1">
              &ldquo;What does it actually mean to block a scene? How do camera moves, lens focal lengths, and performer staging interact to create meaning?&rdquo;
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed">
              StageFlow was built out of pure curiosity: an analytical sketchbook to deconstruct movie scenes in 3D space, treat staging as readable code in YAML, and build an intuitive appreciation for the craft of filmmaking.
            </p>
          </div>

          {/* Documentation & Resources Grid */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-faint">
              Documentation &amp; Resources
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DOC_LINKS.map((link) => {
                const IconComponent = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border-main bg-surface hover:bg-surface-subtle shadow-2xs transition-all active:scale-[0.98] group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <IconComponent className="w-3.5 h-3.5 shrink-0 text-text-muted group-hover:text-text-main transition-colors" />
                      <span className="text-xs font-semibold truncate text-text-body group-hover:text-text-main">
                        {link.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-muted text-text-muted">
                        {link.tag}
                      </span>
                      <ExternalLink className="w-3 h-3 text-text-faint group-hover:text-text-main transition-colors" />
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Quick Studio Shortcuts */}
          <div className="p-4 bg-surface-subtle border border-border-main rounded-2xl space-y-2.5">
            <div className="flex items-center gap-2">
              <Keyboard className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-[10px] font-black uppercase tracking-widest text-text-faint">
                Quick Studio Shortcuts
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {QUICK_SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[10px] text-text-main bg-surface border border-border-main rounded px-1.5 py-0.5 shrink-0 shadow-2xs">
                    {s.key}
                  </span>
                  <span className="text-[11px] text-text-muted truncate">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Credits & Vibe-Coded Note */}
          <div className="p-3 rounded-xl bg-surface-muted/50 border border-border-subtle text-[11px] text-text-muted space-y-1">
            <p>
              <strong className="text-text-main">AI Pair Programming:</strong> Built inside Google Antigravity with Gemini 3.8 Flash &amp; Gemini 4 Argon.
            </p>
            <p className="text-[10px] text-text-faint">
              Exploratory &ldquo;vibe-coded&rdquo; project. May contain experimental quirks. Use at your own risk.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className={UI_TOKENS.modal.footer}>
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] font-mono text-text-faint">StageFlow v{APP_VERSION}</span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-btn-primary-bg hover:bg-btn-primary-hover text-btn-primary-text rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
