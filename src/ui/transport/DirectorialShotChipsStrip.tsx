/**
 * Directorial Shot Chips Strip Component.
 * Features:
 *   - Auto-centering active shot chip on cut boundaries
 *   - Flanking `<` and `>` navigation chevrons for smooth peek scrolling
 *   - Edge fade masks indicating off-screen shots without an intrusive scrollbar
 *   - Free-scrolling with trackpad/mouse-wheel to peek forward/backward
 *   - Directorial jump-to-shot interaction
 */

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ShotCue } from '../../core/types';

export interface DirectorialShotChipsStripProps {
  shots: ShotCue[];
  activeShotId: string | null;
  onSeek: (startSec: number) => void;
}

export const DirectorialShotChipsStrip: React.FC<
  DirectorialShotChipsStripProps
> = ({ shots, activeShotId, onSeek }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeChipRef = useRef<HTMLButtonElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const updateScrollBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflowing = scrollWidth > clientWidth + 4;
    setIsOverflowing(overflowing);
    setCanScrollLeft(overflowing && scrollLeft > 4);
    setCanScrollRight(overflowing && scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  // Update bounds on mount, layout, resize, and shot changes
  useLayoutEffect(() => {
    updateScrollBounds();
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollBounds);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollBounds, shots.length]);

  // Smoothly center the active shot chip whenever activeShotId changes (when overflowing)
  useEffect(() => {
    if (activeChipRef.current && isOverflowing) {
      activeChipRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
      // Check scroll bounds after smooth scroll begins
      const timer = setTimeout(updateScrollBounds, 300);
      return () => clearTimeout(timer);
    }
  }, [activeShotId, isOverflowing, updateScrollBounds]);

  const handleScrollBy = useCallback(
    (delta: number) => {
      containerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
      setTimeout(updateScrollBounds, 250);
    },
    [updateScrollBounds]
  );

  if (!shots || shots.length === 0) {
    return null;
  }

  return (
    <div className="relative flex items-center w-full gap-1 select-none">
      {/* Left Navigation Chevron (conditionally shown on overflow) */}
      {isOverflowing && (
        <button
          type="button"
          onClick={() => handleScrollBy(-220)}
          disabled={!canScrollLeft}
          className={`p-1 rounded-lg bg-surface hover:bg-surface-subtle border border-border-main text-text-muted hover:text-text-main shrink-0 transition-all cursor-pointer shadow-2xs active:scale-95 ${
            !canScrollLeft ? 'opacity-25 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Scroll previous shots"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Scrollable Chip Row with Edge Fades when overflowing, Centered when fitting */}
      <div
        ref={containerRef}
        onScroll={updateScrollBounds}
        style={
          isOverflowing
            ? {
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                maskImage:
                  'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
              }
            : {
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }
        }
        className={`flex-1 flex items-center gap-1.5 overflow-x-auto px-4 py-0.5 no-scrollbar ${
          isOverflowing ? 'justify-start' : 'justify-center'
        }`}
      >
        {shots.map((shot) => {
          const isActive = activeShotId === shot.id;
          const cleanLabel =
            shot.label.replace(/^Shot\s*\d+\s*[·:–-]\s*/i, '').trim() ||
            shot.label;

          return (
            <button
              key={shot.id}
              ref={isActive ? activeChipRef : undefined}
              type="button"
              onClick={() => onSeek(shot.startSec)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-mono shrink-0 transition-colors cursor-pointer border ${
                isActive
                  ? 'bg-btn-primary-bg text-btn-primary-text border-btn-primary-bg font-bold shadow-xs'
                  : 'bg-surface hover:bg-surface-hover border-border-main text-text-muted hover:text-text-main shadow-2xs'
              }`}
              title={`Jump to Shot #${String(shot.shotNumber).padStart(2, '0')}: ${cleanLabel} (${shot.startSec.toFixed(1)}s – ${shot.endSec.toFixed(1)}s)`}
            >
              #{String(shot.shotNumber).padStart(2, '0')}
            </button>
          );
        })}
      </div>

      {/* Right Navigation Chevron (conditionally shown on overflow) */}
      {isOverflowing && (
        <button
          type="button"
          onClick={() => handleScrollBy(220)}
          disabled={!canScrollRight}
          className={`p-1 rounded-lg bg-surface hover:bg-surface-subtle border border-border-main text-text-muted hover:text-text-main shrink-0 transition-all cursor-pointer shadow-2xs active:scale-95 ${
            !canScrollRight ? 'opacity-25 cursor-not-allowed pointer-events-none' : ''
          }`}
          title="Scroll next shots"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
