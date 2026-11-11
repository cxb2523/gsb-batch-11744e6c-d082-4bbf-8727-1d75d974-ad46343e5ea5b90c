import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASCIIRenderer } from '../../rendering/ascii-renderer';
import { createRenderer, type Renderer } from '../../rendering/renderer';
import {
    computeFrameHash,
    diagnoseFrame,
    type FrameDiagnosticsSnapshot
} from '../../rendering/frame-diagnostics';
import { DummyPattern } from '../../patterns/dummy-pattern';
import type { CharacterData } from '../../patterns/pattern';

vi.mock('../../rendering/renderer', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../rendering/renderer')>(),
    createRenderer: vi.fn(),
}));

type MockBackend = Pick<Renderer, 'options'> & {
    [K in 'initialize' | 'clear' | 'render' | 'resize' | 'destroy']: ReturnType<typeof vi.fn<Renderer[K]>>;
};

function createMockBackend(): MockBackend {
    const backend: MockBackend = {
        options: {} as Renderer['options'],
        initialize: vi.fn((_canvas, options) => { backend.options = options; }),
        clear: vi.fn(),
        render: vi.fn(),
        resize: vi.fn(),
        destroy: vi.fn(),
    };
    return backend;
}

const CHARACTERS: CharacterData[] = [
    { x: 1, y: 2, char: 'A', color: '#ff0000', opacity: 0.5, scale: 1.5, rotation: 0.25 },
    { x: 3, y: 4, char: 'B' },
    { x: 5, y: 6, char: '#', color: '#00ff00' }
];

type RendererInternals = {
    _state: { lastHash: number; animationTime: number; isDirty: boolean };
    _hash: (list: CharacterData[]) => number;
};

const internals = (renderer: ASCIIRenderer): RendererInternals =>
    renderer as unknown as RendererInternals;

function makeSnapshot(renderer: ASCIIRenderer, overrides: Partial<FrameDiagnosticsSnapshot>): FrameDiagnosticsSnapshot {
    const state = internals(renderer)._state;
    return {
        options: {
            animated: renderer.options.animated,
            animationSpeed: renderer.options.animationSpeed,
            rendererType: renderer.options.rendererType,
            enableOpacity: renderer.options.enableOpacity,
            backgroundColor: renderer.options.backgroundColor,
        },
        lastHash: state.lastHash,
        animationTime: state.animationTime,
        time: 2000,
        deltaTime: 1,
        characters: CHARACTERS,
        patternIsDirty: false,
        rendererIsDirty: false,
        drawThrew: false,
        ...overrides,
    };
}

describe('frame diagnostics', () => {
    let renderer: ASCIIRenderer | undefined;
    let canvas: HTMLCanvasElement;
    let pattern: DummyPattern;
    let canvasBackend: MockBackend;
    let webglBackend: MockBackend;

    beforeEach(() => {
        vi.spyOn(document, 'createElement').mockRestore();
        canvas = document.createElement('canvas');
        document.body.appendChild(canvas);

        vi.spyOn(Object.getPrototypeOf(canvas), 'getContext').mockReturnValue({
            font: '',
            measureText: () => ({ width: 10, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 4 }),
        });
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        canvasBackend = createMockBackend();
        webglBackend = createMockBackend();
        vi.mocked(createRenderer).mockImplementation(type => type === 'WebGL' ? webglBackend : canvasBackend);

        pattern = new DummyPattern();
        pattern.generate = vi.fn(() => CHARACTERS);
    });

    afterEach(() => {
        renderer?.destroy();
        renderer = undefined;
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    describe('hash parity', () => {
        it('matches the private ASCIIRenderer._hash for the same character list', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });
            const expected = internals(renderer)._hash(CHARACTERS);

            expect(computeFrameHash(CHARACTERS)).toBe(expected);
            expect(diagnoseFrame(makeSnapshot(renderer, {})).hash).toBe(expected);
        });

        it('matches for lists using default color, opacity, scale, and rotation', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });
            const sparse: CharacterData[] = [
                { x: 0, y: 0, char: ' ' },
                { x: 17, y: 29, char: 'z' }
            ];

            expect(computeFrameHash(sparse)).toBe(internals(renderer)._hash(sparse));
            expect(computeFrameHash([])).toBe(internals(renderer)._hash([]));
        });
    });

    describe('normal path', () => {
        it('skips the redraw when the hash is unchanged and nothing is dirty', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });
            renderer.render(1000);
            expect(canvasBackend.clear).toHaveBeenCalledTimes(1);
            expect(canvasBackend.render).toHaveBeenCalledTimes(1);

            const diagnosis = diagnoseFrame(makeSnapshot(renderer, {}));

            expect(diagnosis.skipRender).toBe(true);
            expect(diagnosis.skipReason).toBeTruthy();
            expect(diagnosis.backendType).toBeNull();
            expect(diagnosis.hash).toBe(internals(renderer)._state.lastHash);
            expect(diagnosis.checks.every(check => check.passed)).toBe(true);

            renderer.render(2000);
            expect(canvasBackend.clear).toHaveBeenCalledTimes(1);
            expect(canvasBackend.render).toHaveBeenCalledTimes(1);
        });

        it('draws once when the hash changed, matching clear/render calls', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });

            const diagnosis = diagnoseFrame(makeSnapshot(renderer, { lastHash: -1 }));

            expect(diagnosis.skipRender).toBe(false);
            expect(diagnosis.backendType).toBe('2D');
            expect(diagnosis.clearColor).toBe(renderer.options.backgroundColor);
            expect(diagnosis.checks.every(check => check.passed)).toBe(true);

            renderer.render(1000);
            expect(canvasBackend.clear).toHaveBeenCalledTimes(1);
            expect(canvasBackend.render).toHaveBeenCalledTimes(1);
        });
    });

    describe('negative path', () => {
        it('marks the fallback to Canvas 2D when the WebGL draw throws', () => {
            renderer = new ASCIIRenderer({ canvas, pattern, options: { rendererType: 'WebGL' } });
            webglBackend.render.mockImplementationOnce(() => { throw new Error('Context lost'); });

            const diagnosis = diagnoseFrame(makeSnapshot(renderer, {
                lastHash: -1,
                drawThrew: true,
            }));

            expect(diagnosis.skipRender).toBe(false);
            expect(diagnosis.fellBack).toBe(true);
            expect(diagnosis.errorRethrown).toBe(false);
            expect(diagnosis.backendType).toBe('2D');
            expect(diagnosis.rendererTypeAfter).toBe('2D');
            expect(diagnosis.checks.every(check => check.passed)).toBe(true);

            renderer.render(1000);
            expect(renderer.options.rendererType).toBe('2D');
            expect(webglBackend.destroy).toHaveBeenCalledOnce();
            expect(canvasBackend.clear).toHaveBeenCalledTimes(1);
            expect(canvasBackend.render).toHaveBeenCalledTimes(1);
            expect(canvasBackend.render).toHaveBeenCalledWith(...webglBackend.render.mock.calls[0]);
        });
    });

    describe('boundary paths', () => {
        it('does not skip when the hash is unchanged but pattern.isDirty is true', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });
            renderer.render(1000);
            expect(canvasBackend.render).toHaveBeenCalledTimes(1);

            const diagnosis = diagnoseFrame(makeSnapshot(renderer, { patternIsDirty: true }));

            expect(diagnosis.skipRender).toBe(false);
            expect(diagnosis.checks.every(check => check.passed)).toBe(true);
            const dirtyCheck = diagnosis.checks.find(check => check.name === 'no-skip-when-pattern-dirty');
            expect(dirtyCheck?.passed).toBe(true);

            renderer.pattern.isDirty = true;
            renderer.render(2000);
            expect(canvasBackend.clear).toHaveBeenCalledTimes(2);
            expect(canvasBackend.render).toHaveBeenCalledTimes(2);
        });

        it('rethrows instead of falling back when a Canvas 2D draw throws', () => {
            renderer = new ASCIIRenderer({ canvas, pattern, options: { rendererType: '2D' } });

            const diagnosis = diagnoseFrame(makeSnapshot(renderer, {
                lastHash: -1,
                drawThrew: true,
            }));

            expect(diagnosis.fellBack).toBe(false);
            expect(diagnosis.errorRethrown).toBe(true);
            expect(diagnosis.rendererTypeAfter).toBe('2D');
            expect(diagnosis.checks.every(check => check.passed)).toBe(true);

            canvasBackend.render.mockImplementationOnce(() => { throw new Error('2D draw failed'); });
            expect(() => renderer!.render(1000)).toThrow('2D draw failed');
            expect(renderer.options.rendererType).toBe('2D');
            expect(canvasBackend.clear).toHaveBeenCalledTimes(1);
            expect(canvasBackend.render).toHaveBeenCalledTimes(1);
        });
    });

    describe('animation time', () => {
        it('advances by deltaTime * animationSpeed only when animated', () => {
            renderer = new ASCIIRenderer({
                canvas,
                pattern,
                options: { animated: true, animationSpeed: 2 },
            });
            renderer.render(1000);
            expect(internals(renderer)._state.animationTime).toBe(2);

            const animatedDiagnosis = diagnoseFrame(makeSnapshot(renderer, {}));
            expect(animatedDiagnosis.animationTime).toBe(4);

            renderer.render(2000);
            expect(internals(renderer)._state.animationTime).toBe(4);
            expect(animatedDiagnosis.checks.every(check => check.passed)).toBe(true);

            const paused = diagnoseFrame(makeSnapshot(renderer, {
                options: { ...makeSnapshot(renderer, {}).options, animated: false },
            }));
            expect(paused.animationTime).toBe(internals(renderer)._state.animationTime);
        });
    });

    describe('purity guarantees', () => {
        it('produces JSON-serializable output without functions', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });
            const diagnosis = diagnoseFrame(makeSnapshot(renderer, { drawThrew: true }));

            const roundTripped = JSON.parse(JSON.stringify(diagnosis)) as unknown;
            expect(roundTripped).toEqual(diagnosis);
        });

        it('does not mutate the snapshot', () => {
            renderer = new ASCIIRenderer({ canvas, pattern });
            const snapshot = makeSnapshot(renderer, { drawThrew: true });
            const before = JSON.parse(JSON.stringify(snapshot)) as unknown;

            diagnoseFrame(snapshot);

            expect(JSON.parse(JSON.stringify(snapshot))).toEqual(before);
        });
    });
});
