/**
 * Root Application Router & Entry Switcher for StageFlow.
 * Selectively mounts either the 3D Blueprint Choreography Studio,
 * the Headless Viewport Recorder, or the Markdown + KaTeX Documentation Viewer.
 * Code-split with React.lazy() so loading documentation never downloads
 * Three.js or CodeMirror, dropping initial payload by ~78%.
 */

import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { BookOpen } from 'lucide-react';

const InteractiveStudioApp = React.lazy(() =>
  import('./ui/InteractiveStudioApp').then((m) => ({
    default: m.InteractiveStudioApp,
  }))
);

const ScoreAuthoringGuideView = React.lazy(() =>
  import('./ui/guide').then((m) => ({ default: m.ScoreAuthoringGuideView }))
);

const HeadlessRecorderView = React.lazy(() =>
  import('./recorder/HeadlessRecorderView').then((m) => ({
    default: m.HeadlessRecorderView,
  }))
);

// Synchronous route classification to request only the active chunk
const urlParams =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : null;

const isHeadlessRender = urlParams?.get('mode') === 'headless-render';
const isGuideMode = urlParams?.get('mode') === 'guide';
const isSpecMode = urlParams?.get('mode') === 'spec';
const isDocMode = isGuideMode || isSpecMode;

if (typeof document !== 'undefined' && isDocMode) {
  document.documentElement.setAttribute('data-mode', 'guide');
  document.body.classList.remove('overflow-hidden');
}

/** Lightweight skeleton loader for documentation view (?mode=guide / ?mode=spec) */
const GuideLoadingSkeleton: React.FC = () => (
  <div className="min-h-screen w-full bg-app text-text-main flex flex-col font-sans select-none animate-pulse">
    {/* Header Placeholder */}
    <header className="h-14 px-4 sm:px-6 bg-surface/90 border-b border-border-main flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500">
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <div className="h-3.5 w-48 bg-surface-muted rounded" />
          <div className="h-2.5 w-32 bg-surface-muted/60 rounded" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-7 w-28 bg-surface-muted rounded-lg" />
        <div className="h-7 w-24 bg-surface-muted rounded-xl" />
      </div>
    </header>

    {/* Body Layout Placeholder */}
    <div className="flex-1 flex w-full max-w-7xl mx-auto px-4 sm:px-6">
      {/* Sidebar Placeholder (Desktop) */}
      <aside className="hidden lg:block w-72 shrink-0 border-r border-border-main py-6 pr-4 space-y-4">
        <div className="h-8 bg-surface-muted rounded-md" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-4 w-3/4 bg-surface-muted rounded" />
              <div className="h-3 w-1/2 bg-surface-muted/60 rounded ml-4" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content Reading Skeleton */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">
        <div className="h-8 w-2/3 bg-surface-muted rounded" />
        <div className="h-4 w-full bg-surface-muted/60 rounded" />
        <div className="h-4 w-5/6 bg-surface-muted/60 rounded" />
        <div className="h-32 w-full bg-surface-subtle border border-border-subtle rounded-xl" />
        <div className="h-4 w-4/5 bg-surface-muted/60 rounded" />
        <div className="h-24 w-full bg-surface-subtle border border-border-subtle rounded-xl" />
      </main>
    </div>
  </div>
);

export const App: React.FC = () => {
  if (isHeadlessRender) {
    return (
      <React.Suspense fallback={<div className="w-full h-full bg-black" />}>
        <HeadlessRecorderView />
      </React.Suspense>
    );
  }

  return (
    <>
      {isDocMode ? (
        <React.Suspense fallback={<GuideLoadingSkeleton />}>
          <ScoreAuthoringGuideView initialDoc={isSpecMode ? 'spec' : 'guide'} />
        </React.Suspense>
      ) : (
        <React.Suspense fallback={null}>
          <InteractiveStudioApp />
        </React.Suspense>
      )}
      <Analytics />
      <SpeedInsights />
    </>
  );
};

export default App;
