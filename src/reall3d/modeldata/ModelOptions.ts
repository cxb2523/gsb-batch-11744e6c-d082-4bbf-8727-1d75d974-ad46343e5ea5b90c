// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
/**
 * Gaussian Model Options
 */
export interface ModelOptions {
    /**
     * Model URL
     */
    url: string;

    /**
     * Base URL
     */
    baseUrl?: string;

    /**
     * Model format (ply | splat | spx | spz | sog | obj | glb), auto-detected by default
     */
    format?: 'ply' | 'splat' | 'spx' | 'spz' | 'sog' | 'obj' | 'glb';

    /**
     * Whether to force re-download
     */
    fetchReload?: boolean;
}
