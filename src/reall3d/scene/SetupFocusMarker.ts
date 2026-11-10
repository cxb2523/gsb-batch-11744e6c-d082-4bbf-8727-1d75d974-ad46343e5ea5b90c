// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { Scene, Vector3 } from 'three';
import { Events } from '../events/Events';
import { ViewerNeedUpdate, FocusMarkerSetOpacity, FocusMarkerAutoDisappear, FocusMarkerUpdate, GetScene, RunLoopByFrame } from '../events/EventConstants';
import { CSS2DObject } from 'three/examples/jsm/Addons.js';

export function setupFocusMarker(events: Events) {
    let disposed = false;
    const on = (key: number, fn?: Function, multiFn?: boolean): Function | Function[] => events.on(key, fn, multiFn);
    const fire = (key: number, ...args: any): any => events.fire(key, ...args);

    let css2dFocusMarker: CSS2DObject = initFocusMarker();
    const aryProcessDisappear: any[] = [];

    on(FocusMarkerSetOpacity, (val: number) => {
        if (disposed) return;
        css2dFocusMarker.visible = val > 0.1;
        css2dFocusMarker.element.style.opacity = val + '';
        fire(ViewerNeedUpdate);
    });

    on(FocusMarkerUpdate, (focusPosition: Vector3) => {
        if (disposed) return;
        css2dFocusMarker.position.copy(focusPosition);
        while (aryProcessDisappear.length) aryProcessDisappear.pop().stop = true;
        fire(FocusMarkerSetOpacity, 1);
        fire(ViewerNeedUpdate);
    });

    on(FocusMarkerAutoDisappear, () => {
        while (aryProcessDisappear.length) aryProcessDisappear.pop().stop = true;
        let process = { opacity: 1.0, time: Date.now(), stop: false };
        aryProcessDisappear.push(process);

        fire(
            RunLoopByFrame,
            () => {
                process = aryProcessDisappear[0];
                !process && fire(FocusMarkerSetOpacity, 1);
                if (!disposed && process) {
                    process.opacity = 1 - Math.min((Date.now() - process.time) / 1500, 1);
                    if (process.opacity < 0.2) {
                        process.opacity = 0;
                        process.stop = true;
                    }
                    fire(FocusMarkerSetOpacity, process.opacity);
                }
            },
            () => !disposed && !process?.stop,
        );
    });

    function initFocusMarker() {
        const tagWarp: HTMLDivElement = document.createElement('div');
        tagWarp.innerHTML = `<svg height="64" width="64" style="fill:white;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M108.8 469.333333C128 279.466667 279.466667 128 469.333333 108.8V64c0-23.466667 19.2-42.666667 42.666667-42.666667s42.666667 19.2 42.666667 42.666667v44.8c189.866667 19.2 341.333333 170.666667 360.533333 360.533333H960c23.466667 0 42.666667 19.2 42.666667 42.666667s-19.2 42.666667-42.666667 42.666667h-44.8c-19.2 189.866667-170.666667 341.333333-360.533333 360.533333V960c0 23.466667-19.2 42.666667-42.666667 42.666667s-42.666667-19.2-42.666667-42.666667v-44.8C279.466667 896 128 744.533333 108.8 554.666667H64c-23.466667 0-42.666667-19.2-42.666667-42.666667s19.2-42.666667 42.666667-42.666667h44.8zM469.333333 194.133333C326.4 213.333333 215.466667 326.4 196.266667 469.333333H234.666667c23.466667 0 42.666667 19.2 42.666666 42.666667s-19.2 42.666667-42.666666 42.666667H196.266667c19.2 142.933333 132.266667 256 275.2 273.066666V789.333333c0-23.466667 19.2-42.666667 42.666666-42.666666s42.666667 19.2 42.666667 42.666666v38.4C697.6 810.666667 810.666667 697.6 829.866667 554.666667H789.333333c-23.466667 0-42.666667-19.2-42.666666-42.666667s19.2-42.666667 42.666666-42.666667h40.533334C810.666667 326.4 697.6 213.333333 554.666667 194.133333V234.666667c0 23.466667-19.2 42.666667-42.666667 42.666666s-42.666667-19.2-42.666667-42.666666V194.133333z"></path></svg>`;
        tagWarp.classList.add('css2d-focus-marker');
        tagWarp.style.position = 'absolute';
        const css2dTag = new CSS2DObject(tagWarp);
        css2dTag.element.style.pointerEvents = 'none';
        css2dTag.element.style.opacity = '1';
        css2dTag.visible = false;
        (fire(GetScene) as Scene).add(css2dTag);
        return css2dTag;
    }
}
