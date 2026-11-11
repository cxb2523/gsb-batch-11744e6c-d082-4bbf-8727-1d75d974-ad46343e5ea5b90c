/**
 * Unit tests for isMobileViewport pure evaluator and mobile breakpoint logic.
 */

import { describe, it, expect } from 'vitest';
import { isMobileViewport } from '../../src/hooks/useIsMobile';

describe('isMobileViewport', () => {
  it('correctly classifies narrow phone screens (< 768px) as mobile', () => {
    expect(isMobileViewport(320)).toBe(true);  // iPhone SE
    expect(isMobileViewport(390)).toBe(true);  // iPhone 14/15/16
    expect(isMobileViewport(412)).toBe(true);  // Pixel 7/8
    expect(isMobileViewport(430)).toBe(true);  // iPhone Pro Max
    expect(isMobileViewport(767)).toBe(true);  // 1px below md breakpoint
  });

  it('correctly classifies tablet and desktop viewports (>= 768px) as non-mobile', () => {
    expect(isMobileViewport(768)).toBe(false);  // iPad portrait / md breakpoint
    expect(isMobileViewport(820)).toBe(false);  // iPad Air
    expect(isMobileViewport(1024)).toBe(false); // iPad Pro / lg breakpoint
    expect(isMobileViewport(1280)).toBe(false); // Laptop
    expect(isMobileViewport(1920)).toBe(false); // Full HD desktop
  });

  it('supports custom breakpoint thresholds when provided', () => {
    expect(isMobileViewport(600, 640)).toBe(true);
    expect(isMobileViewport(640, 640)).toBe(false);
    expect(isMobileViewport(1000, 1024)).toBe(true);
    expect(isMobileViewport(1024, 1024)).toBe(false);
  });
});
