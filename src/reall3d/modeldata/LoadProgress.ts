// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { ModelStatus } from './ModelData';

/**
 * Loading progress snapshot of a Gaussian model.
 * All numeric fields are guaranteed to be finite and never negative;
 * `progress` is always clamped to the 0~100 range.
 */
export interface LoadProgress {
    /** Status enum name, one of the keys of {@link ModelStatus} */
    status: string;
    /** Downloaded bytes */
    downloadSize: number;
    /** Total file size in bytes (0 while unknown) */
    fileSize: number;
    /** Parsed (ready) Gaussian count */
    dataSplatCount: number;
    /** Total Gaussian count of the model (0 while unknown) */
    modelSplatCount: number;
    /** Progress percentage, always within 0~100 */
    progress: number;
}

/** Safe non-negative finite integer, anything invalid becomes 0 */
function safeCount(v: number): number {
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Clamp a percentage into the 0~100 range */
function clampProgress(v: number): number {
    if (!Number.isFinite(v) || v < 0) return 0;
    if (v > 100) return 100;
    return v;
}

/**
 * Build a {@link LoadProgress} snapshot from the real loading counters.
 *
 * Percentage rules:
 * 1. When the total Gaussian count is known, use parsed count / total count.
 * 2. Otherwise, when the total file size is known, use downloaded bytes / total bytes.
 * 3. When neither is known, return 0.
 *
 * The result never contains NaN, Infinity or negative numbers and is clamped to 0~100.
 */
export function buildLoadProgress(
    status: ModelStatus,
    downloadSize: number,
    fileSize: number,
    dataSplatCount: number,
    modelSplatCount: number,
): LoadProgress {
    const dlSize = safeCount(downloadSize);
    const fSize = safeCount(fileSize);
    const dataCnt = safeCount(dataSplatCount);
    const totalCnt = safeCount(modelSplatCount); // modelSplatCount starts at -1 while unknown

    let progress = 0;
    if (totalCnt > 0) {
        // Prefer parsed points / total points
        progress = (Math.min(dataCnt, totalCnt) / totalCnt) * 100;
    } else if (fSize > 0) {
        // Fall back to downloaded bytes / total bytes
        progress = (Math.min(dlSize, fSize) / fSize) * 100;
    }

    return {
        status: ModelStatus[status] || ModelStatus[ModelStatus.FetchReady],
        downloadSize: dlSize,
        fileSize: fSize,
        dataSplatCount: dataCnt,
        modelSplatCount: totalCnt,
        progress: clampProgress(progress),
    };
}

/** The empty snapshot returned before addModel or after dispose */
export function emptyLoadProgress(): LoadProgress {
    return buildLoadProgress(ModelStatus.FetchReady, 0, 0, 0, 0);
}
