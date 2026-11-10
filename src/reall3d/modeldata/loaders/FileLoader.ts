// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { OnFetching, OnFetchStart } from '../../events/EventConstants';
import { Events } from '../../events/Events';

export async function loadFile(url: string, events?: Events): Promise<Uint8Array> {
    if (!url) return new Uint8Array(0);

    const abortController: AbortController = new AbortController();
    const signal: AbortSignal = abortController.signal;
    try {
        events?.fire(OnFetchStart);
        const req = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload', signal });
        if (req.status != 200) {
            console.warn(`fetch error: ${req.status}`);
            return null;
        }
        const reader = req.body.getReader();
        const contentLength = parseInt(req.headers.get('content-length') || '0');
        const datas = new Uint8Array(contentLength);

        let bytesRead = 0;
        while (true) {
            let { done, value } = await reader.read();
            if (done) break;
            datas.set(value, bytesRead);
            bytesRead += value.length;
            events?.fire(OnFetching, (100 * bytesRead) / contentLength);
        }
        return datas;
    } catch (e) {
        console.error(e);
        abortController.abort();
    }
    return null;
}
