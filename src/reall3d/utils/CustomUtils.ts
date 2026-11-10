// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { IsDefaultPipeline } from '../events/EventConstants';
import { Events } from '../events/Events';
import { setupMinimap } from '../scene/SetupMinimap';

// 个性化自定义处理
export function setupCustomUtils(events: Events) {
    const on = (key: number, fn?: Function, multiFn?: boolean): Function | Function[] => events.on(key, fn, multiFn);
    const fire = (key: number, ...args: any): any => events.fire(key, ...args);

    setupMinimap(events);

    on(IsDefaultPipeline, () => true);
}
