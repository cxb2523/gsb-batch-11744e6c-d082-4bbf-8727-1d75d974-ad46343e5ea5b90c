/**
 * Custom hook detecting mobile viewports (< 768px / Tailwind `md`).
 * Uses `window.matchMedia` for responsive, zero-polling breakpoint tracking.
 * Layer 3 hook.
 */

import { useState, useEffect } from 'react';

/**
 * Pure evaluator for viewport width against mobile breakpoint (< 768px).
 */
export function isMobileViewport(width: number, breakpointPx = 768): boolean {
  return width < breakpointPx;
}

export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return isMobileViewport(window.innerWidth, breakpointPx);
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);

    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };

    update(mql);
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [breakpointPx]);

  return isMobile;
}
