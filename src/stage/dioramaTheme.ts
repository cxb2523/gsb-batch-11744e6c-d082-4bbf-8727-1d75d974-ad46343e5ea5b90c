/**
 * Theme color mapping for the 3D WebGL Diorama Canvas.
 * Dynamically adapts the background clear color, fog, and metric grid lines
 * to the active theme (Dark Obsidian Studio, Warm Drafting Paper, Light Warm Stone)
 * with zero extra WebGL draw calls or shader passes.
 */

import type { AppThemeCategory } from '../core/types';

export interface DioramaThemeColors {
  bg: string;
  fog: string;
  gridCell: string;
  gridSection: string;
  borderLine: string;
  axisLine: string;
  ringColor: string;
  floorColor: string;
  floorOpacity: number;
  borderOpacity: number;
}

export function getDioramaThemeColors(category: AppThemeCategory = 'light'): DioramaThemeColors {
  if (category === 'warm') {
    return {
      bg: '#f3efe6',
      fog: '#f3efe6',
      gridCell: '#e4dccb',
      gridSection: '#cfc4af',
      borderLine: '#9e8c75',
      axisLine: '#b5a48d',
      ringColor: '#9e8c75',
      floorColor: '#faf7f0',
      floorOpacity: 0.95,
      borderOpacity: 0.65,
    };
  }

  if (category === 'dark') {
    return {
      bg: '#0c0a09',
      fog: '#0c0a09',
      gridCell: '#1c1917',
      gridSection: '#2c2825',
      borderLine: '#38bdf8',
      axisLine: '#38bdf8',
      ringColor: '#38bdf8',
      floorColor: '#171514',
      floorOpacity: 0.92,
      borderOpacity: 0.35,
    };
  }

  // Light (Warm Stone baseline default)
  return {
    bg: '#f5f5f4',
    fog: '#f5f5f4',
    gridCell: '#e7e5e4',
    gridSection: '#d6d3d1',
    borderLine: '#78716c',
    axisLine: '#a8a29e',
    ringColor: '#78716c',
    floorColor: '#ffffff',
    floorOpacity: 0.95,
    borderOpacity: 0.65,
  };
}
