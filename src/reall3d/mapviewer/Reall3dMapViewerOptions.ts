// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
/**
 * Configuration options for Reall3dMapViewer
 */
export declare interface Reall3dMapViewerOptions {
    /**
     * Container element or its selector (default: '#map').
     * Will be automatically created if not found.
     */
    root?: HTMLElement | string;

    /**
     * Enable keyboard controls (default: false)
     */
    enableKeyboard?: boolean;

    /**
     * Minimum panning boundaries (default: [-20000, 0.1, -60000])
     */
    minPan?: number[];

    /**
     * Maximum panning boundaries (default: [50000, 10000, 0])
     */
    maxPan?: number[];

    /**
     * Background color (default: '#dbf0ff')
     */
    background?: string;

    /**
     * Debug mode flag (default: false in production)
     */
    debugMode?: boolean;

    /**
     * Edit mode flag (default: false)
     */
    editMode?: boolean;
}
