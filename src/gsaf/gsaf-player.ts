import { Entity, GSplatContainer, GSplatFormat, Quat, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { compileGsafDecoder, GsafDecoder } from './gsaf-worker';
import { GsafPlayer, uploadFrame } from './player';

// the playback rate when the file carries no fps hint
const DEFAULT_FPS = 30;

// Reads the response whole, reporting progress. Chunks are gathered rather than written into a
// buffer of the declared length, which is the compressed length when the server encodes it.
const readBytes = async (response: Response, progressCallback: (progress: number) => void) => {
    if (!response.ok) {
        throw new Error(`gsaf: ${response.status} ${response.statusText} fetching ${response.url}`);
    }
    const length = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !length) {
        return response.arrayBuffer();
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    const reader = response.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        progressCallback(Math.trunc(Math.min(1, received / length) * 100));
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    return bytes.buffer;
};

/**
 * Loads a gsaf file (an animated, compressed splat sequence) into a {@link GsafPlayer}. Frames
 * are decoded in a worker and written into a {@link GSplatContainer} in the engine's default
 * float format, which takes gsaf's render-ready values (linear scales, `w, x, y, z` rotations,
 * activated colors) as they are.
 *
 * @param app - The application.
 * @param response - The file's response.
 * @param decoderUrl - The decoder's wasm, if not the file beside the bundle.
 * @param progressCallback - Receives the download progress, 0 to 100.
 * @param signal - Aborted when the viewer is destroyed. Its handlers run before the app's own
 * destroy, so a load in flight releases its worker and container while the device is alive.
 * @returns The player, paused on the first frame.
 */
const loadGsaf = async (
    app: AppBase,
    response: Promise<Response>,
    decoderUrl: string | undefined,
    progressCallback: (progress: number) => void,
    signal: AbortSignal
) => {
    const fail = () => new Error('loadGsaf: the viewer was destroyed while loading');

    // the decoder compiles while the file downloads
    const wasm = compileGsafDecoder(decoderUrl);
    wasm.catch(() => {
        // reported by the await below, once the download is done
    });
    const bytes = await readBytes(await response, progressCallback);
    if (signal.aborted) throw fail();
    const compiledWasm = await wasm;
    if (signal.aborted) throw fail();

    const decoder = new GsafDecoder();
    let container: GSplatContainer | null = null;
    // until the entity owns them, a destroy stops the worker at once, which rejects the request
    // it was serving, and frees the container
    const onAbort = () => {
        decoder.destroy();
        container?.destroy();
        container = null;
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        const header = await decoder.open(bytes, compiledWasm);
        if (signal.aborted) throw fail();

        const device = app.graphicsDevice;
        container = new GSplatContainer(device, header.maxSplats, GSplatFormat.createDefaultFormat(device));
        container.aabb.setMinMax(new Vec3(header.boundsMin), new Vec3(header.boundsMax));

        const texture = container.getTexture('dataCenter');
        const capacity = texture.width * texture.height * 4;
        const first = await decoder.decode(0, {
            center: new Float32Array(capacity),
            color: new Uint16Array(capacity),
            scale: new Uint16Array(capacity),
            rotation: new Uint16Array(capacity),
            centers: new Float32Array(header.maxSplats * 3)
        });
        if (signal.aborted) throw fail();
        signal.removeEventListener('abort', onAbort);
        uploadFrame(app, container, first);

        // always name the app: the engine's default is the most recently created one, which is
        // another viewer's when two share a page
        const entity = new Entity('gsplat', app);
        if (header.canonicalRotation) {
            // the canonical frame is y up and -z forward, the engine's own
            const [w, x, y, z] = header.canonicalRotation;
            entity.setLocalRotation(new Quat(x, y, z, w));
            if (header.canonicalTranslation) {
                entity.setLocalPosition(new Vec3(header.canonicalTranslation));
            }
        } else {
            entity.setLocalEulerAngles(0, 0, 180);
        }
        entity.addComponent('gsplat', {
            unified: true,
            resource: container
        });
        app.root.addChild(entity);

        const animated = header.frameCount > 1 && device.isWebGPU;
        if (!animated) decoder.destroy();

        const owned = container;
        entity.once('destroy', () => {
            decoder.destroy();
            owned.destroy();
        });

        const fps = header.fps > 0 ? header.fps : DEFAULT_FPS;
        return new GsafPlayer(app, entity, decoder, header.frameCount, fps, first, animated);
    } catch (err) {
        signal.removeEventListener('abort', onAbort);
        decoder.destroy();
        container?.destroy();
        throw signal.aborted ? fail() : err;
    }
};

export { GsafPlayer, loadGsaf };
