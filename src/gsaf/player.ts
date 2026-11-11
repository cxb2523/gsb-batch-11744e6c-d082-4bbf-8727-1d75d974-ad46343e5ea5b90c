import { WORKBUFFER_UPDATE_ONCE } from 'playcanvas';
import type { AppBase, Entity, GSplatContainer } from 'playcanvas';

// type-only, so this module loads outside the browser (the worker module reads the decoder
// glue as a string, which only the bundler provides)
import type { GsafDecoder, GsafFrame, GsafFrameBuffers } from './gsaf-worker';

const STREAMS = [
    ['dataCenter', 'center'],
    ['dataColor', 'color'],
    ['dataScale', 'scale'],
    ['dataRotation', 'rotation']
] as const;

/**
 * An animated splat sequence playing through a container. The viewer's timeline drives it:
 * {@link paused} stops its clock, {@link seek} moves it and {@link time} is where it is. Each
 * update decodes the frame due at that time, in a worker, so a slow decode skips frames rather
 * than slowing playback; the decoder continues forward from the frame it holds and replays from
 * the last keyframe to go back. Destroying {@link entity} stops it and releases the worker and
 * the container.
 */
class GsafPlayer {
    /** The gsplat entity, showing the frame at {@link time}. */
    readonly entity: Entity;

    /**
     * Whether the sequence plays: more than one frame, on WebGPU. WebGL shows the first frame
     * only, since its sorter is asynchronous and lands a frame or more behind the data, and gsaf
     * reorders splats from frame to frame (survivors in their previous order, births appended),
     * so an order computed for one frame is wrong for the next.
     */
    readonly animated: boolean;

    /** Length of the sequence in seconds. */
    readonly duration: number;

    /** Stops the clock; paused until the viewer starts it. */
    paused = true;

    private app: AppBase;

    private decoder: GsafDecoder;

    private fps: number;

    private frameCount: number;

    private _time = 0;

    // the frame on screen, and the buffers it came in, null while a decode has them
    private shown = 0;

    private buffers: GsafFrameBuffers | null;

    // seeks waiting for their frame
    private waiters: { resolve: () => void; reject: (err: Error) => void }[] = [];

    // a decode that failed, after which the player shows its last frame and every seek fails
    private failure: Error | null = null;

    private destroyed = false;

    constructor(
        app: AppBase,
        entity: Entity,
        decoder: GsafDecoder,
        frameCount: number,
        fps: number,
        first: GsafFrame,
        animated: boolean
    ) {
        this.app = app;
        this.entity = entity;
        this.decoder = decoder;
        this.frameCount = frameCount;
        this.fps = fps;
        this.duration = frameCount / fps;
        this.buffers = first;
        this.animated = animated;

        const onUpdate = (dt: number) => {
            if (!this.paused && this.duration > 0) this._time = (this._time + dt) % this.duration;
            this.pump();
        };
        if (animated) app.on('update', onUpdate);

        entity.once('destroy', () => {
            this.destroyed = true;
            app.off('update', onUpdate);
            this.settle();
        });
    }

    /** The playhead, in seconds from the start of the sequence. */
    get time() {
        return this._time;
    }

    /** The frame on screen; it holds its value while the next frame decodes. */
    get frameIndex() {
        return this.shown;
    }

    /**
     * Moves the playhead, wrapping it into the sequence.
     *
     * @param time - The time in seconds.
     * @returns Resolves once the frame at that time is on screen — at once for a player that is
     * not {@link animated} — or the player is destroyed; rejects once a decode has failed, and
     * at once for a non-finite time or an empty sequence.
     */
    seek(time: number) {
        if (this.failure) return Promise.reject(this.failure);
        if (!Number.isFinite(time)) {
            return Promise.reject(new Error(`gsaf: cannot seek to ${time}`));
        }
        if (!(this.duration > 0)) {
            // an empty sequence has no frame to land on, and wrapping would divide by zero
            return Promise.reject(new Error('gsaf: cannot seek in an empty sequence'));
        }
        // a time already in range is kept exactly, so it lands on the frame it names
        const wrapped = time % this.duration;
        this._time = wrapped < 0 ? wrapped + this.duration : wrapped;
        if (!this.animated) return Promise.resolve();
        const landed = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
        this.pump();
        return landed;
    }

    private settle(err?: Error) {
        const { waiters } = this;
        this.waiters = [];
        for (const waiter of waiters) {
            if (err) waiter.reject(err);
            else waiter.resolve();
        }
    }

    // decode the frame due now, unless it is on screen or a decode is already in flight
    private pump() {
        if (this.destroyed || this.failure || !this.buffers) return;
        // a frame's own start time can land a rounding error short of it
        const due = Math.min(this.frameCount - 1, Math.floor(this._time * this.fps + 1e-6));
        if (due === this.shown) {
            this.settle();
            return;
        }
        const buffers = this.buffers;
        this.buffers = null;
        this.decoder.decode(due, buffers).then(
            (frame) => {
                // a decode can land after the entity was destroyed; nothing remains to show it
                if (this.destroyed) return;
                uploadFrame(this.app, this.entity.gsplat.resource as GSplatContainer, frame);
                // the engine re-copies a resource into its work buffer only when its allocation
                // changes, and a frame keeps the container's, so ask for the copy
                this.entity.gsplat.workBufferUpdate = WORKBUFFER_UPDATE_ONCE;
                this.shown = frame.index;
                this.buffers = frame;
                this.pump();
            },
            (err: Error) => {
                // the worker was terminated with the entity
                if (this.destroyed) return;
                console.error(err);
                this.failure = err;
                this.settle(err);
            }
        );
    }
}

const uploadFrame = (app: AppBase, container: GSplatContainer, frame: GsafFrame) => {
    for (const [name, key] of STREAMS) {
        const texture = container.getTexture(name);
        texture.lock().set(frame[key]);
        texture.unlock();
    }
    container.centers.set(frame.centers.subarray(0, frame.count * 3));
    container.update(frame.count);
    app.renderNextFrame = true;
};

export { GsafPlayer, uploadFrame };
