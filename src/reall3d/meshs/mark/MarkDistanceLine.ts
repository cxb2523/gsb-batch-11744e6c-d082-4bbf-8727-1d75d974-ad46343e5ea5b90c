// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { CircleGeometry, DoubleSide, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { CSS3DSprite, Line2, LineGeometry, LineMaterial } from 'three/examples/jsm/Addons.js';
import { Events } from '../../events/Events';
import { MarkDataDistanceLine } from './data/MarkDataDistanceLine';
import {
    AddMarkToWeakRef,
    DeleteMarkWeakRef,
    GetOptions,
    MarkFinish,
    StopAutoRotate,
    TraverseDisposeAndClear,
    ViewerNeedUpdate,
} from '../../events/EventConstants';
import { MarkData } from './data/MarkData';

export class MarkDistanceLine extends Line2 {
    public readonly isCustomMark: boolean = true;
    private disposed: boolean = false;
    private events: Events;
    private data: MarkDataDistanceLine;
    private circleStart: Mesh;
    private circleEnd: Mesh;
    private css3dMainTag: CSS3DSprite;
    private css3dTag: CSS3DSprite;

    constructor(events: Events) {
        super();
        this.events = events;
    }

    /**
     * 绘制开始
     */
    public drawStart(startPoint: Vector3, name?: string) {
        if (this.disposed) return;
        const that = this;

        const cnt: number = document.querySelectorAll('.mark-wrap-line.main-warp').length + 1;
        const data: MarkDataDistanceLine = {
            type: 'MarkDistanceLine',
            name: name || 'line' + Date.now(),
            startPoint: startPoint.toArray(),
            endPoint: startPoint.toArray(),
            lineColor: '#eeee00',
            lineWidth: 3,
            mainTagColor: '#c4c4c4',
            mainTagBackground: '#2E2E30',
            mainTagOpacity: 0.8,
            mainTagVisible: true,
            distanceTagColor: '#000000',
            distanceTagBackground: '#e0ffff',
            distanceTagOpacity: 0.9,
            distanceTagVisible: true,
            title: '标记距离' + cnt,
            intersectable: false,
        };

        const geometry = new LineGeometry();
        geometry.setPositions([...data.startPoint, ...data.endPoint]);
        const material = new LineMaterial({ color: data.lineColor, linewidth: data.lineWidth });
        material.resolution.set(innerWidth, innerHeight);
        that.copy(new Line2(geometry, material));

        const circleGeometry = new CircleGeometry(0.05, 32);
        const circleMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
        circleMaterial.transparent = true;
        circleMaterial.opacity = 0.6;
        const circleStart = new Mesh(circleGeometry, circleMaterial);
        circleStart.position.copy(startPoint);
        const circleEnd = new Mesh(circleGeometry, circleMaterial);
        circleEnd.position.copy(startPoint);

        const mainTagWarp: HTMLDivElement = document.createElement('div');
        mainTagWarp.innerHTML = `<div style='flex-direction: column;align-items: center;display: flex;pointer-events: none;margin-bottom: 40px;'>
                                    <span class="${data.name}-main-tag" style="color:${data.mainTagColor};background:${data.mainTagBackground};opacity:${data.mainTagOpacity};padding:1px 5px 2px 5px;border-radius: 4px;user-select: none;font-size: 12px;pointer-events: auto;">${data.title}</span>
                                 </div>`;
        mainTagWarp.classList.add('mark-wrap-line', `${data.name}`, `main-warp`);
        mainTagWarp.style.position = 'absolute';
        mainTagWarp.style.borderRadius = '4px';
        mainTagWarp.style.cursor = 'pointer';
        mainTagWarp.onclick = () => {
            if (that.events.fire(GetOptions).markMode) return;
            // @ts-ignore
            const onActiveMark = parent?.onActiveMark;
            onActiveMark?.(that.getMarkData(true));
            that.events.fire(StopAutoRotate);
        };
        mainTagWarp.oncontextmenu = (e: MouseEvent) => e.preventDefault();

        const css3dMainTag = new CSS3DSprite(mainTagWarp);
        css3dMainTag.position.copy(startPoint);
        css3dMainTag.element.style.pointerEvents = 'none';
        css3dMainTag.scale.set(0.01, 0.01, 0.01);
        css3dMainTag.visible = data.mainTagVisible;

        const tagWarp: HTMLDivElement = document.createElement('div');
        tagWarp.innerHTML = `<span class="${name}-distance-tag ${name}-distance-tag0" style="color:${data.distanceTagColor};background:${data.distanceTagBackground};opacity:${data.distanceTagOpacity};padding: 1px 5px;border-radius: 4px;margin-bottom: 5px;user-select: none;font-size: 12px;pointer-events: none;"></span>`;
        tagWarp.classList.add('mark-wrap-line', `${name}`, `distance-warp`);
        tagWarp.style.position = 'absolute';
        tagWarp.style.borderRadius = '4px';
        tagWarp.style.pointerEvents = 'none';
        // that.events.fire(GetMarkWarpElement).appendChild(tagWarp);

        const css3dTag = new CSS3DSprite(tagWarp);
        css3dTag.position.set(startPoint.x, startPoint.y, startPoint.z);
        css3dTag.element.style.pointerEvents = 'none';
        css3dTag.scale.set(0.008, 0.008, 0.008);
        css3dTag.visible = false;

        that.add(circleStart, circleEnd, css3dMainTag, css3dTag);

        that.data = data;
        that.circleStart = circleStart;
        that.circleEnd = circleEnd;
        that.css3dTag = css3dTag;
        that.css3dMainTag = css3dMainTag;

        that.events.fire(AddMarkToWeakRef, that);
    }

    /**
     * 绘制更新
     */
    public drawUpdate(data: MarkDataDistanceLine, saveData: boolean = true) {
        if (this.disposed) return;
        const that = this;

        if (data?.endPoint) {
            saveData && (that.data.endPoint = [...data.endPoint]);
            const start: Vector3 = new Vector3().fromArray(that.data.startPoint);
            const end: Vector3 = new Vector3().fromArray(data.endPoint);

            that.geometry.setPositions([...that.data.startPoint, ...data.endPoint]);
            const midPoint = new Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
            that.css3dTag.position.set(midPoint.x, midPoint.y, midPoint.z);

            const dir = end.clone().sub(start).normalize();
            that.circleStart.lookAt(that.circleStart.position.clone().add(dir));
            that.circleEnd.lookAt(that.circleEnd.position.clone().add(dir));

            const distance = start.distanceTo(end);
            that.css3dTag.visible = distance > 0.5;
            const title = (distance * that.events.fire(GetOptions).meterScale).toFixed(2) + ' m';
            (that.css3dTag.element.childNodes[0] as HTMLSpanElement).innerText = title;
        }
        if (data?.lineColor) {
            saveData && (that.data.lineColor = data.lineColor);
            that.material.color.set(data.lineColor);
        }
        if (data?.lineWidth) {
            saveData && (that.data.lineWidth = data.lineWidth);
            that.material.linewidth = data.lineWidth;
        }
        if (data?.mainTagColor) {
            saveData && (that.data.mainTagColor = data.mainTagColor);
            (document.querySelector(`.${that.data.name}-main-tag`) as HTMLSpanElement).style.color = data.mainTagColor;
        }
        if (data?.mainTagBackground) {
            saveData && (that.data.mainTagBackground = data.mainTagBackground);
            (document.querySelector(`.${that.data.name}-main-tag`) as HTMLSpanElement).style.background = data.mainTagBackground;
        }
        if (data?.mainTagOpacity) {
            saveData && (that.data.mainTagOpacity = data.mainTagOpacity);
            (document.querySelector(`.${that.data.name}-main-tag`) as HTMLSpanElement).style.opacity = data.mainTagOpacity.toString();
        }
        if (data?.mainTagVisible !== undefined) {
            saveData && (that.data.mainTagVisible = data.mainTagVisible);
            that.css3dMainTag.visible = data.mainTagVisible;
        }
        if (data?.distanceTagColor) {
            saveData && (that.data.distanceTagColor = data.distanceTagColor);
            (document.querySelector(`.${that.data.name}-distance-tag0`) as HTMLSpanElement).style.color = data.distanceTagColor;
        }
        if (data?.distanceTagBackground) {
            saveData && (that.data.distanceTagBackground = data.distanceTagBackground);
            (document.querySelector(`.${that.data.name}-distance-tag0`) as HTMLSpanElement).style.background = data.distanceTagBackground;
        }
        if (data?.distanceTagOpacity) {
            saveData && (that.data.distanceTagOpacity = data.distanceTagOpacity);
            (document.querySelector(`.${that.data.name}-distance-tag0`) as HTMLSpanElement).style.opacity = data.distanceTagOpacity.toString();
        }
        if (data?.distanceTagVisible !== undefined) {
            saveData && (that.data.distanceTagVisible = data.distanceTagVisible);
            that.css3dTag.visible = data.distanceTagVisible;
        }

        if (data?.title !== undefined) {
            saveData && (that.data.title = data.title);
            (this.css3dMainTag.element.querySelector(`.${that.data.name}-main-tag`) as HTMLSpanElement).innerText = data.title;
        }
        if (data?.note !== undefined) {
            saveData && (that.data.note = data.note);
        }

        that.events.fire(ViewerNeedUpdate);
    }

    /**
     * 按米标比例尺重新计算更新渲染
     */
    public updateByMeterScale(meterScale: number) {
        const that = this;
        const start: Vector3 = new Vector3().fromArray(that.data.startPoint);
        const end: Vector3 = new Vector3().fromArray(that.data.endPoint);
        const distance = (start.distanceTo(end) * meterScale).toFixed(2) + ' m';
        (that.css3dTag.element.childNodes[0] as HTMLSpanElement).innerText = distance;
    }

    /**
     * 绘制结束
     */
    public drawFinish(endPoint: Vector3) {
        if (this.disposed) return;
        const that = this;

        that.data.endPoint = [...endPoint.toArray()];
        const start: Vector3 = new Vector3().fromArray(that.data.startPoint);
        const end: Vector3 = new Vector3().fromArray(that.data.endPoint);
        const midPoint = new Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);

        that.geometry.setPositions([...that.data.startPoint, ...that.data.endPoint]);
        that.css3dTag.position.set(midPoint.x, midPoint.y, midPoint.z);

        const dir = end.clone().sub(start).normalize();
        that.circleStart.lookAt(that.circleStart.position.clone().add(dir));
        that.circleEnd.lookAt(that.circleEnd.position.clone().add(dir));
        that.circleEnd.position.copy(end);

        const distance = start.distanceTo(end);
        that.css3dTag.visible = true;
        const title = (distance * that.events.fire(GetOptions).meterScale).toFixed(2) + ' m';
        (that.css3dTag.element.childNodes[0] as HTMLSpanElement).innerText = title;

        that.events.fire(MarkFinish);

        // @ts-ignore
        const onActiveMark = parent?.onActiveMark;
        const data: any = that.getMarkData(true);
        data.isNew = true;
        data.meterScale = that.events.fire(GetOptions).meterScale;
        onActiveMark?.(data);
    }

    /**
     * 根据数据直接绘制
     */
    public draw(inputData: MarkDataDistanceLine) {
        if (this.disposed) return;
        const that = this;

        const data: MarkDataDistanceLine = {
            type: 'MarkDistanceLine',
            name: inputData.name || 'line' + Date.now(),
            startPoint: [...inputData.startPoint],
            endPoint: [...inputData.endPoint],
            lineColor: inputData.lineColor || '#eeee00',
            lineWidth: inputData.lineWidth || 3,
            mainTagColor: inputData.mainTagColor || '#c4c4c4',
            mainTagBackground: inputData.mainTagBackground || '#2E2E30',
            mainTagOpacity: inputData.mainTagOpacity || 0.8,
            mainTagVisible: inputData.mainTagVisible === undefined ? true : inputData.mainTagVisible,
            distanceTagColor: inputData.distanceTagColor || '#000000',
            distanceTagBackground: inputData.distanceTagBackground || '#e0ffff',
            distanceTagOpacity: inputData.distanceTagOpacity || 0.9,
            distanceTagVisible: inputData.distanceTagVisible === undefined ? true : inputData.distanceTagVisible,
            title: inputData.title || '标记距离',
            intersectable: inputData.intersectable || false,
        };

        const start: Vector3 = new Vector3().fromArray(data.startPoint);
        const end: Vector3 = new Vector3().fromArray(data.endPoint);
        const midPoint = new Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);

        const geometry = new LineGeometry();
        geometry.setPositions([...data.startPoint, ...data.endPoint]);
        const material = new LineMaterial({ color: data.lineColor, linewidth: data.lineWidth });
        material.resolution.set(innerWidth, innerHeight);
        that.copy(new Line2(geometry, material));

        const circleGeometry = new CircleGeometry(0.05, 32);
        const circleMaterial = new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide });
        circleMaterial.transparent = true;
        circleMaterial.opacity = 0.6;
        const circleStart = new Mesh(circleGeometry, circleMaterial);
        circleStart.position.copy(start);
        const circleEnd = new Mesh(circleGeometry, circleMaterial);
        circleEnd.position.copy(end);

        const dir = end.clone().sub(start).normalize();
        circleStart.lookAt(circleStart.position.clone().add(dir));
        circleEnd.lookAt(circleEnd.position.clone().add(dir));

        const name = data.name;
        const mainTagWarp: HTMLDivElement = document.createElement('div');
        mainTagWarp.innerHTML = `<div style='flex-direction: column;align-items: center;display: flex;pointer-events: none;margin-bottom: 40px;'>
                                <span class="${name}-main-tag" style="color:${data.mainTagColor};background:${data.mainTagBackground};opacity:${data.mainTagOpacity};padding:1px 5px 2px 5px;border-radius: 4px;margin-bottom: 5px;user-select: none;font-size: 12px;pointer-events: auto;">${data.title}</span>
                             </div>`;
        mainTagWarp.classList.add('mark-wrap-line', `${data.name}`, `main-warp`);
        mainTagWarp.style.position = 'absolute';
        mainTagWarp.style.borderRadius = '4px';
        mainTagWarp.style.cursor = 'pointer';
        mainTagWarp.onclick = () => {
            if (that.events.fire(GetOptions).markMode) return;
            // @ts-ignore
            const onActiveMark = parent?.onActiveMark;
            onActiveMark?.(that.getMarkData(true));
            that.events.fire(StopAutoRotate);
        };
        mainTagWarp.oncontextmenu = (e: MouseEvent) => e.preventDefault();

        const css3dMainTag = new CSS3DSprite(mainTagWarp);
        css3dMainTag.position.copy(start);
        css3dMainTag.element.style.pointerEvents = 'none';
        css3dMainTag.scale.set(0.01, 0.01, 0.01);
        css3dMainTag.visible = data.mainTagVisible;

        const distance = start.distanceTo(end);
        const title = (distance * that.events.fire(GetOptions).meterScale).toFixed(2) + ' m';
        const tagWarp: HTMLDivElement = document.createElement('div');
        tagWarp.innerHTML = `<span class="${name}-distance-tag ${name}-distance-tag0" style="color:${data.distanceTagColor};background:${data.distanceTagBackground};opacity:${data.distanceTagOpacity};padding: 1px 5px;border-radius: 4px;margin-bottom: 5px;user-select: none;font-size: 12px;pointer-events: none;">${title}</span>`;
        tagWarp.classList.add('mark-wrap-line', `${name}`, 'distance-warp');
        tagWarp.style.position = 'absolute';
        tagWarp.style.borderRadius = '4px';
        tagWarp.style.pointerEvents = 'none';

        const css3dTag = new CSS3DSprite(tagWarp);
        css3dTag.position.copy(midPoint);
        css3dTag.element.style.pointerEvents = 'none';
        css3dTag.scale.set(0.008, 0.008, 0.008);
        css3dTag.visible = data.distanceTagVisible;

        that.add(circleStart, circleEnd, css3dMainTag, css3dTag);

        that.data = data;
        that.circleStart = circleStart;
        that.circleEnd = circleEnd;
        that.css3dTag = css3dTag;
        that.css3dMainTag = css3dMainTag;
        that.events.fire(AddMarkToWeakRef, that);
    }

    public getMarkData(simple: boolean = false): MarkData {
        const data: MarkDataDistanceLine = { ...this.data };
        if (simple) {
            delete data.startPoint;
            delete data.endPoint;
        } else {
            data.startPoint = [...data.startPoint];
            data.endPoint = [...data.endPoint];
        }
        return data;
    }

    public isIntersectable(): boolean {
        return this.data.intersectable;
    }

    public dispose() {
        if (this.disposed) return;
        const that = this;
        that.disposed = true;

        that.events.fire(TraverseDisposeAndClear, that);
        that.removeFromParent();
        that.events.fire(DeleteMarkWeakRef, that);

        const list = document.querySelectorAll(`.${that.data.name}`);
        list.forEach(wrap => wrap.parentElement?.removeChild(wrap));

        that.events = null;
        that.data = null;
        that.circleStart = null;
        that.circleEnd = null;
        that.css3dTag = null;
        that.css3dMainTag = null;
    }
}
