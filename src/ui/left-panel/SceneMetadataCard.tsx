/**
 * SceneMetadataCard Component.
 * Displays arbitrary scene-wide production metadata & directorial notes
 * (music, gear packages, lighting, checklist notes, credits) in the Scene Desk.
 * Supports Markdown formatting, arrays, nested key-values, and collapsible accordion.
 * Layer 5 UI Component.
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  ChevronDown,
  ChevronRight,
  Music,
  FileText,
  Film,
  SunMedium,
  Users,
  Tag,
} from 'lucide-react';

export interface SceneMetadataCardProps {
  metadata: Record<string, unknown>;
}

function getCategoryIcon(key: string): {
  icon: React.FC<{ className?: string }>;
  colorClass: string;
} {
  const lower = key.toLowerCase();
  if (
    lower.includes('music') ||
    lower.includes('audio') ||
    lower.includes('sound') ||
    lower.includes('track')
  ) {
    return { icon: Music, colorClass: 'text-amber-500' };
  }
  if (
    lower.includes('note') ||
    lower.includes('memo') ||
    lower.includes('brief') ||
    lower.includes('directorial')
  ) {
    return { icon: FileText, colorClass: 'text-emerald-500' };
  }
  if (
    lower.includes('camera') ||
    lower.includes('gear') ||
    lower.includes('rig') ||
    lower.includes('lens') ||
    lower.includes('package')
  ) {
    return { icon: Film, colorClass: 'text-sky-500' };
  }
  if (
    lower.includes('light') ||
    lower.includes('look') ||
    lower.includes('atmosphere') ||
    lower.includes('mood')
  ) {
    return { icon: SunMedium, colorClass: 'text-amber-400' };
  }
  if (
    lower.includes('cast') ||
    lower.includes('crew') ||
    lower.includes('actor') ||
    lower.includes('director') ||
    lower.includes('stunt')
  ) {
    return { icon: Users, colorClass: 'text-indigo-400' };
  }
  return { icon: Tag, colorClass: 'text-text-muted' };
}

function formatSectionTitle(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'bpm') return 'BPM';
      if (lower === 'dof') return 'DoF';
      if (lower === 'fps') return 'FPS';
      if (word.length <= 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

interface MetadataValueRendererProps {
  value: unknown;
}

const MetadataValueRenderer: React.FC<MetadataValueRendererProps> = ({ value }) => {
  if (typeof value === 'string') {
    return (
      <div className="text-[11px] text-text-body font-sans leading-relaxed prose dark:prose-invert max-w-none [&>p]:m-0 [&_a]:text-accent-primary [&_a]:underline">
        <ReactMarkdown>{value}</ReactMarkdown>
      </div>
    );
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded-md bg-surface-subtle border border-border-main text-[10.5px] font-mono font-semibold text-text-main">
        {String(value)}
      </span>
    );
  }

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1 pl-1 text-[11px] font-sans text-text-body">
        {value.map((item, index) => (
          <li key={index} className="flex items-start gap-1.5 leading-snug">
            <span className="w-1.5 h-1.5 rounded-full bg-border-main shrink-0 mt-1.5" />
            <div className="flex-1 min-w-0 prose dark:prose-invert max-w-none [&>p]:m-0 [&_a]:text-accent-primary [&_a]:underline">
              {typeof item === 'string' ? (
                <ReactMarkdown>{item}</ReactMarkdown>
              ) : (
                <span>{String(item)}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="flex flex-wrap gap-1 text-[10.5px] font-mono">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-subtle border border-border-main shadow-2xs"
          >
            <span className="text-text-muted font-normal">
              {formatSectionTitle(k)}:
            </span>
            <span className="font-semibold text-text-main">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-[11px] text-text-muted">{String(value)}</span>;
};

export const SceneMetadataCard: React.FC<SceneMetadataCardProps> = ({ metadata }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const entries = Object.entries(metadata);

  if (entries.length === 0) return null;

  return (
    <div className="p-2.5 rounded-xl bg-surface border border-border-main shadow-2xs space-y-2">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left group select-none cursor-pointer"
        aria-expanded={!isCollapsed}
        title={isCollapsed ? 'Expand Scene Metadata' : 'Collapse Scene Metadata'}
      >
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent-primary font-bold block">
          Scene Metadata
        </span>
        <span className="text-text-muted group-hover:text-text-main transition-colors">
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {/* Accordion Content */}
      {!isCollapsed && (
        <div className="space-y-2.5 pt-0.5">
          {entries.map(([key, val], idx) => {
            const { icon: Icon, colorClass } = getCategoryIcon(key);
            const title = formatSectionTitle(key);

            return (
              <div
                key={key}
                className={`space-y-1 ${
                  idx > 0 ? 'pt-2 border-t border-border-subtle' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-[9.5px] font-mono uppercase tracking-wider text-text-muted font-semibold">
                  <Icon className={`w-3 h-3 ${colorClass}`} />
                  <span>{title}</span>
                </div>
                <div className="pl-0.5">
                  <MetadataValueRenderer value={val} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

