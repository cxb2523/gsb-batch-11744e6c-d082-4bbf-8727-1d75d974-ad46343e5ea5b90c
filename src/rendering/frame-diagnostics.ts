import type { CharacterData } from '../patterns/pattern';

/**
 * Renderer backend types known to the diagnostics module.
 * @category Rendering
 */
export type DiagnosticRendererType = '2D' | 'WebGL';

/**
 * Subset of renderer options relevant to a single frame decision.
 * @category Rendering
 */
export interface FrameDiagnosticsOptionsSnapshot {
    /** Whether animation is enabled */
    animated: boolean;
    /** Animation speed multiplier */
    animationSpeed: number;
    /** Active renderer type for this frame */
    rendererType: DiagnosticRendererType;
    /** Whether per-character opacity is applied */
    enableOpacity?: boolean;
    /** Background color used when clearing */
    backgroundColor: string;
}

/**
 * Pure data snapshot describing one frame of `ASCIIRenderer.render`.
 * No DOM, canvas, pattern, or renderer instances — only serializable values.
 * @category Rendering
 */
export interface FrameDiagnosticsSnapshot {
    /** Relevant rendering options for this frame */
    options: FrameDiagnosticsOptionsSnapshot;
    /** Hash stored after the previous drawn frame */
    lastHash: number;
    /** Animation time accumulated up to the previous frame (seconds) */
    animationTime: number;
    /** Timestamp of this frame (milliseconds) */
    time: number;
    /** Elapsed time since the previous frame (seconds) */
    deltaTime: number;
    /** Characters produced by the pattern for this frame */
    characters: CharacterData[];
    /** Whether the pattern reports pending changes */
    patternIsDirty: boolean;
    /** Whether the renderer reports pending changes */
    rendererIsDirty: boolean;
    /** Whether the backend draw (clear/render) threw for this frame */
    drawThrew: boolean;
}

/**
 * A single ordered diagnostic check.
 * @category Rendering
 */
export interface FrameDiagnosticCheck {
    /** Stable kebab-case check identifier */
    name: string;
    /** Whether the invariant held for this frame */
    passed: boolean;
    /** Human-readable explanation, present only when the check failed */
    reason?: string;
}

/**
 * Structured, JSON-serializable diagnosis of a single frame.
 * @category Rendering
 */
export interface FrameDiagnostics {
    /** Animation time after this frame's advancement (seconds) */
    animationTime: number;
    /** Hash of this frame's character list, identical to the renderer's private hash */
    hash: number;
    /** Whether the frame would skip redrawing */
    skipRender: boolean;
    /** Why the frame is skipped, or null when it is drawn */
    skipReason: string | null;
    /** Backend that ultimately draws the frame, or null when skipped */
    backendType: DiagnosticRendererType | null;
    /** Whether a WebGL failure triggered the Canvas 2D fallback */
    fellBack: boolean;
    /** Whether a draw error is rethrown instead of handled (Canvas 2D path) */
    errorRethrown: boolean;
    /** Renderer type after this frame (changes only on fallback) */
    rendererTypeAfter: DiagnosticRendererType;
    /** Color the backend would clear with, or null when skipped */
    clearColor: string | null;
    /** Ordered invariant checks evaluated against this frame */
    checks: FrameDiagnosticCheck[];
}

/**
 * Compute the frame hash using the exact algorithm of `ASCIIRenderer._hash`.
 * @param list - the character data list to hash.
 * @returns A numeric hash value.
 */
export function computeFrameHash(list: CharacterData[]): number {
    let hash = 0;

    for (const { x, y, char, color = '', opacity = 1, scale = 1, rotation = 0 } of list) {
        hash ^= (
            ((x * 31 + y * 17) ^ char.charCodeAt(0)) +
            (color.charCodeAt(0) || 0) * 13 +
            Math.floor(opacity * 100) * 7 +
            Math.floor(scale * 100) * 5 +
            Math.floor(rotation * 100) * 3
        );
    }

    return hash;
}

/**
 * Diagnose a single frame from a pure data snapshot, mirroring the observable
 * behavior of `ASCIIRenderer.render` without touching the DOM, canvas, or WebGL.
 *
 * The function is pure: it never mutates the snapshot and its output contains
 * only JSON-serializable data.
 *
 * @param snapshot - the frame snapshot to diagnose.
 * @returns The structured diagnosis for the frame.
 */
export function diagnoseFrame(snapshot: FrameDiagnosticsSnapshot): FrameDiagnostics {
    const { options } = snapshot;

    const animationTime = options.animated
        ? snapshot.animationTime + snapshot.deltaTime * options.animationSpeed
        : snapshot.animationTime;

    const hash = computeFrameHash(snapshot.characters);
    const hashUnchanged = hash === snapshot.lastHash;
    const skipRender = hashUnchanged && !snapshot.rendererIsDirty && !snapshot.patternIsDirty;

    let skipReason: string | null = null;
    let backendType: DiagnosticRendererType | null = null;
    let fellBack = false;
    let errorRethrown = false;
    let rendererTypeAfter: DiagnosticRendererType = options.rendererType;
    let clearColor: string | null = null;

    if (skipRender) 
        skipReason = 'hash unchanged and neither renderer nor pattern is dirty';
    else {
        backendType = options.rendererType;
        clearColor = options.backgroundColor;

        if (snapshot.drawThrew) {
            if (options.rendererType === 'WebGL') {
                fellBack = true;
                backendType = '2D';
                rendererTypeAfter = '2D';
            } else 
                errorRethrown = true;
            
        }
    }

    const checks: FrameDiagnosticCheck[] = [
        check(
            'animation-time-advances-only-when-animated',
            options.animated
                ? animationTime === snapshot.animationTime + snapshot.deltaTime * options.animationSpeed
                : animationTime === snapshot.animationTime,
            'animationTime must only accumulate deltaTime * animationSpeed while animated is true'
        ),
        check(
            'no-skip-when-pattern-dirty',
            !(hashUnchanged && snapshot.patternIsDirty) || !skipRender,
            'hash unchanged but pattern.isDirty is true; the frame must not be skipped'
        ),
        check(
            'no-skip-when-renderer-dirty',
            !(hashUnchanged && snapshot.rendererIsDirty) || !skipRender,
            'hash unchanged but renderer isDirty is true; the frame must not be skipped'
        ),
        check(
            'skip-when-unchanged-and-clean',
            !(hashUnchanged && !snapshot.patternIsDirty && !snapshot.rendererIsDirty) || skipRender,
            'hash unchanged and nothing dirty; the frame must be skipped'
        ),
        check(
            'webgl-draw-error-falls-back-to-2d',
            !(snapshot.drawThrew && options.rendererType === 'WebGL' && !skipRender) ||
                (fellBack && backendType === '2D' && rendererTypeAfter === '2D'),
            'a WebGL draw error must fall back to the Canvas 2D backend'
        ),
        check(
            'canvas-2d-draw-error-rethrows',
            !(snapshot.drawThrew && options.rendererType === '2D' && !skipRender) ||
                (!fellBack && errorRethrown),
            'a Canvas 2D draw error must propagate instead of falling back'
        )
    ];

    return {
        animationTime,
        hash,
        skipRender,
        skipReason,
        backendType,
        fellBack,
        errorRethrown,
        rendererTypeAfter,
        clearColor,
        checks,
    };
}

const check = (name: string, passed: boolean, failureReason: string): FrameDiagnosticCheck =>
    passed ? { name, passed } : { name, passed, reason: failureReason };
