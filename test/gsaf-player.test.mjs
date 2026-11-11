import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// The player's own module imports the engine but not the decoder worker (whose glue only the
// bundler provides), so it loads in a bare node process; the decoder is a constructor parameter,
// faked here. No wasm, no WebGPU.
import { GsafPlayer } from '../src/gsaf/player.ts';

const makeFrame = (index = 0, count = 1) => ({
    center: new Float32Array(4),
    color: new Uint16Array(4),
    scale: new Uint16Array(4),
    rotation: new Uint16Array(4),
    centers: new Float32Array(3),
    index,
    count
});

const makeContainer = () => ({
    uploads: 0,
    getTexture: () => ({
        lock: () => ({ set: () => undefined }),
        unlock: () => undefined
    }),
    centers: { set: () => undefined },
    update() {
        this.uploads++;
    }
});

const makeEntity = (container) => {
    const listeners = new Map();
    return {
        gsplat: { resource: container, workBufferUpdate: 0 },
        once(event, cb) {
            listeners.set(event, [...(listeners.get(event) ?? []), cb]);
        },
        destroy() {
            for (const cb of listeners.get('destroy') ?? []) cb();
        }
    };
};

const makeApp = () => {
    const handlers = new Map();
    return {
        renderNextFrame: false,
        on(event, cb) {
            handlers.set(event, [...(handlers.get(event) ?? []), cb]);
        },
        off(event, cb) {
            handlers.set(
                event,
                (handlers.get(event) ?? []).filter((h) => h !== cb)
            );
        },
        update(dt) {
            for (const cb of handlers.get('update') ?? []) cb(dt);
        }
    };
};

// records the frames it is asked for; `decode` defaults to resolving at once
const makeDecoder = (decode) => {
    const decoder = {
        calls: [],
        decode:
            decode ??
            ((index, buffers) => {
                decoder.calls.push(index);
                return Promise.resolve({ ...buffers, index, count: 1 });
            }),
        destroy: () => undefined
    };
    return decoder;
};

// 10 frames at 10 fps: a one-second sequence, so times wrap at 1 and a time names its frame
const makePlayer = ({ frameCount = 10, fps = 10, animated = true, decode } = {}) => {
    const app = makeApp();
    const container = makeContainer();
    const entity = makeEntity(container);
    const decoder = makeDecoder(decode);
    const player = new GsafPlayer(app, entity, decoder, frameCount, fps, makeFrame(0), animated);
    return { app, container, entity, decoder, player };
};

// a decode the test resolves by hand, to observe the player mid-decode
const manualDecode = () => {
    let release;
    const decoder = makeDecoder((index, buffers) => {
        decoder.calls.push(index);
        return new Promise((resolve) => {
            release = () => resolve({ ...buffers, index, count: 1 });
        });
    });
    return { decoder, release: () => release() };
};

describe('GsafPlayer.seek', () => {
    it('lands on the frame its time names', async () => {
        const { player, decoder } = makePlayer();

        await player.seek(0.35);

        assert.strictEqual(player.time, 0.35);
        assert.strictEqual(player.frameIndex, 3);
        assert.deepStrictEqual(decoder.calls, [3]);
    });

    it('wraps negative and past-the-end times into the sequence', async () => {
        const { player } = makePlayer();

        await player.seek(-0.25);
        assert.strictEqual(player.time, 0.75);
        assert.strictEqual(player.frameIndex, 7);

        await player.seek(2.35);
        assert.strictEqual(player.time, 2.35 % 1);
        assert.strictEqual(player.frameIndex, 3);
    });

    it('rejects NaN and Infinity without moving the playhead or the frame', async () => {
        const { player, decoder } = makePlayer();
        await player.seek(0.35);
        const { frameIndex } = player;

        for (const bad of [NaN, Infinity, -Infinity]) {
            await assert.rejects(player.seek(bad), (err) => err instanceof Error);
        }

        assert.strictEqual(player.time, 0.35);
        assert.strictEqual(player.frameIndex, frameIndex);
        assert.deepStrictEqual(decoder.calls, [3]);
    });

    it('rejects every seek of an empty sequence rather than dividing by zero', async () => {
        const { player, decoder } = makePlayer({ frameCount: 0 });
        assert.strictEqual(player.duration, 0);

        await assert.rejects(player.seek(0), (err) => err instanceof Error);
        await assert.rejects(player.seek(1), (err) => err instanceof Error);

        assert.strictEqual(player.time, 0);
        assert.strictEqual(player.frameIndex, 0);
        assert.deepStrictEqual(decoder.calls, []);
    });

    it('rejects every later seek with the same decode failure and stops decoding', async () => {
        const failure = new Error('gsaf: boom');
        const { player, decoder } = makePlayer({
            decode: (index) => {
                decoder.calls.push(index);
                return Promise.reject(failure);
            }
        });

        await assert.rejects(player.seek(0.35), (err) => err === failure);
        await assert.rejects(player.seek(0.5), (err) => err === failure);
        await assert.rejects(player.seek(0.6), (err) => err === failure);

        // one decode, the one that failed; later seeks never reach the decoder
        assert.deepStrictEqual(decoder.calls, [3]);
        assert.strictEqual(player.frameIndex, 0);
    });

    it('moves the clock of a non-animated player without decoding', async () => {
        const { player, decoder } = makePlayer({ animated: false });

        await player.seek(2.35);
        assert.strictEqual(player.time, 2.35 % 1);

        await player.seek(-0.25);
        assert.strictEqual(player.time, 0.75);

        // nothing decodes and the first frame stays on screen
        assert.deepStrictEqual(decoder.calls, []);
        assert.strictEqual(player.frameIndex, 0);

        await assert.rejects(player.seek(NaN), (err) => err instanceof Error);
        assert.strictEqual(player.time, 0.75);
    });
});

describe('GsafPlayer.frameIndex', () => {
    it('holds the shown frame while the next one decodes', async () => {
        const { decoder, release } = manualDecode();
        const app = makeApp();
        const entity = makeEntity(makeContainer());
        const player = new GsafPlayer(app, entity, decoder, 10, 10, makeFrame(0), true);

        const landed = player.seek(0.35);
        assert.deepStrictEqual(decoder.calls, [3]);
        assert.strictEqual(player.frameIndex, 0);

        release();
        await landed;
        assert.strictEqual(player.frameIndex, 3);
    });
});

describe('GsafPlayer destruction', () => {
    it('ignores a decode that lands after the entity is destroyed', async () => {
        const { decoder, release } = manualDecode();
        const app = makeApp();
        const container = makeContainer();
        const entity = makeEntity(container);
        const player = new GsafPlayer(app, entity, decoder, 10, 10, makeFrame(0), true);

        // a destroy settles the seek, so it resolves rather than hanging
        const landed = player.seek(0.35);
        entity.destroy();
        release();
        await landed;
        await new Promise((resolve) => setTimeout(resolve, 0));

        // the late frame touched neither the container nor the entity
        assert.strictEqual(container.uploads, 0);
        assert.strictEqual(entity.gsplat.workBufferUpdate, 0);
        assert.strictEqual(player.frameIndex, 0);
    });

    it('ignores a decode failure that lands after the entity is destroyed', async () => {
        let fail;
        const decoder = makeDecoder(
            () =>
                new Promise((resolve, reject) => {
                    fail = () => reject(new Error('gsaf: stopped mid-decode'));
                })
        );
        const app = makeApp();
        const entity = makeEntity(makeContainer());
        const player = new GsafPlayer(app, entity, decoder, 10, 10, makeFrame(0), true);

        const landed = player.seek(0.35);
        entity.destroy();
        fail();
        await landed;
        await new Promise((resolve) => setTimeout(resolve, 0));

        // the late failure is not sticky: it belonged to a player that no longer exists
        assert.strictEqual(player.frameIndex, 0);
    });
});
