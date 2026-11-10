// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { CSS3DSprite, Line2, LineGeometry, LineMaterial } from 'three/examples/jsm/Addons.js';
import { Events } from '../../events/Events';
import {
    AddMarkToWeakRef,
    ComputePlansArea,
    ComputePlansCenter,
    DeleteMarkWeakRef,
    GetOptions,
    MarkFinish,
    ReComputePlansArea,
    StopAutoRotate,
    TraverseDisposeAndClear,
    ViewerNeedUpdate,
} from '../../events/EventConstants';
import { MarkData } from './data/MarkData';
import { MarkDataMultiPlans } from './data/MarkDataMultiPlans';

export class MarkMultiPlans extends Line2 {
    public readonly isCustomMark: boolean = true;
    private disposed: boolean = false;
    private events: Events;
    private data: MarkDataMultiPlans;
    private css3dTags: CSS3DSprite[] = [];
    private css3dMainTag: CSS3DSprite;
    private css3dAreaTag: CSS3DSprite;
    private group: Group = new Group();
    private meshPlans: Mesh;

    constructor(events: Events) {
        super();
        this.add(this.group);
        this.events = events;
    }

    /**
     * 绘制开始
     */
    public drawStart(startPoint: Vector3, name?: string) {
        if (this.disposed) return;
        const that = this;

        const cnt: number = document.querySelectorAll('.mark-wrap-plans.main-warp').length + 1;
        const data: MarkDataMultiPlans = {
            type: 'MarkMultiPlans',
            name: name || 'plans' + Date.now(),
            points: [...startPoint.toArray(), ...startPoint.toArray()],
            lineColor: '#eeee00',
            lineWidth: 3,
            mainTagColor: '#c4c4c4',
            mainTagBackground: '#2E2E30',
            mainTagOpacity: 0.8,
            mainTagVisible: true,
            areaTagColor: '#000000',
            areaTagBackground: '#e0ffff',
            areaTagOpacity: 0.8,
            distanceTagVisible: true,
            areaTagVisible: true,
            planOpacity: 0.5,
            title: '标记面' + cnt,
            note: '',
            intersectable: false,
            clickable: false,
        };

        that.draw(data);
    }

    /**
     * 绘制更新
     */
    public drawUpdate(data?: MarkDataMultiPlans, saveData: boolean = true, lastPoint?: Vector3, next: boolean = false) {
        if (this.disposed) return;
        const that = this;

        if (lastPoint) {
            if (next) {
                // 更新最后点位置，计算更新距离，并开始下一条线
                const len = that.data.points.length;
                const index: number = that.css3dTags.length - 1;
                const start: Vector3 = new Vector3().fromArray(that.data.points.slice(len - 6, len - 3));
                const end: Vector3 = lastPoint;
                const midPoint = new Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
                const distance = start.distanceTo(end);
                const title = (distance * that.events.fire(GetOptions).meterScale).toFixed(2) + ' m';
                that.css3dTags[index].element.innerText = title;
                that.css3dTags[index].position.set(midPoint.x, midPoint.y, midPoint.z);
                that.css3dTags[index].visible = true;

                that.data.points.pop();
                that.data.points.pop();
                that.data.points.pop();
                that.data.points = [...that.data.points, ...lastPoint.toArray(), ...lastPoint.toArray()];
                this.draw(this.data);
            } else {
                // 更新最后点位置
                const len = that.data.points.length;
                that.data.points[len - 3] = lastPoint.x;
                that.data.points[len - 2] = lastPoint.y;
                that.data.points[len - 1] = lastPoint.z;
                const index: number = that.css3dTags.length - 1;
                const start: Vector3 = new Vector3().fromArray(that.data.points.slice(len - 6, len - 3));
                const end: Vector3 = new Vector3().fromArray(that.data.points.slice(len - 3));
                const midPoint = new Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
                const distance = start.distanceTo(end);
                const title = (distance * that.events.fire(GetOptions).meterScale).toFixed(2) + ' m';
                that.css3dTags[index].element.innerText = title;

                that.geometry.setPositions([...that.data.points]);
                that.css3dTags[index].position.set(midPoint.x, midPoint.y, midPoint.z);
                that.css3dTags[index].visible = next ? true : distance > 0.5;

                that.meshPlans.geometry.setAttribute('position', new BufferAttribute(new Float32Array(that.data.points), 3));
                that.meshPlans.geometry.attributes.position.needsUpdate = true;

                const center: Vector3 = that.events.fire(ComputePlansCenter, that.data.points);
                that.css3dAreaTag.position.copy(center);
                const area: number = that.events.fire(ComputePlansArea, that.data.points);
                (that.css3dAreaTag.element.childNodes[0] as HTMLSpanElement).innerText = area.toFixed(2) + ' m²';
            }
        }
        if (data?.lineColor) {
            saveData && (that.data.lineColor = data.lineColor);
            that.material.color.set(data.lineColor);
            (that.meshPlans.material as MeshBasicMaterial).color.set(data.lineColor);
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
        if (data?.areaTagVisible !== undefined) {
            saveData && (that.data.areaTagVisible = data.areaTagVisible);
            that.css3dAreaTag.visible = data.areaTagVisible;
        }
        if (data?.areaTagColor) {
            saveData && (that.data.areaTagColor = data.areaTagColor);
            const tag: HTMLSpanElement = document.querySelector(`.${that.data.name}-area-tag`);
            tag && (tag.style.color = data.areaTagColor);
        }
        if (data?.areaTagBackground) {
            saveData && (that.data.areaTagBackground = data.areaTagBackground);
            const tag: HTMLSpanElement = document.querySelector(`.${that.data.name}-area-tag`);
            tag && (tag.style.background = data.areaTagBackground);
        }
        if (data?.areaTagOpacity) {
            saveData && (that.data.areaTagOpacity = data.areaTagOpacity);
            const tag: HTMLSpanElement = document.querySelector(`.${that.data.name}-area-tag`);
            tag && (tag.style.opacity = data.areaTagOpacity.toString());
        }
        if (data?.distanceTagVisible !== undefined) {
            saveData && (that.data.distanceTagVisible = data.distanceTagVisible);
            that.css3dTags.forEach((tag: CSS3DSprite) => (tag.visible = data.distanceTagVisible));
        }
        if (data?.planOpacity) {
            saveData && (that.data.planOpacity = data.planOpacity);
            (this.meshPlans.material as MeshBasicMaterial).opacity = data.planOpacity;
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

        const points: Vector3[] = [];
        for (let i = 0, max = that.data.points.length / 3; i < max; i++) {
            points.push(new Vector3(that.data.points[i * 3], that.data.points[i * 3 + 1], that.data.points[i * 3 + 2]));
        }

        let start: Vector3;
        let end: Vector3;
        for (let i = 1; i < points.length; i++) {
            start = points[i - 1];
            end = points[i];
            (that.css3dTags[i - 1].element as HTMLSpanElement).innerText = (start.distanceTo(end) * meterScale).toFixed(2) + ' m';
        }

        const area: number = that.events.fire(ReComputePlansArea, points, meterScale);
        (that.css3dAreaTag.element.childNodes[0] as HTMLSpanElement).innerText = area.toFixed(2) + ' m²';
    }

    /**
     * 绘制结束
     */
    public drawFinish(hasSelectPoint?: boolean) {
        if (this.disposed) return;
        const that = this;

        const len = that.data.points.length;
        const start: Vector3 = new Vector3().fromArray(that.data.points.slice(len - 6, len - 3));
        const end: Vector3 = new Vector3().fromArray(that.data.points.slice(len - 3));
        if (!hasSelectPoint || start.distanceTo(end) < 0.0001) {
            // 双击时没有选中终点，或终点距离太近是自动补充的点，则删除尾部点
            that.data.points.pop();
            that.data.points.pop();
            that.data.points.pop();
        }

        that.events.fire(MarkFinish);

        // 点数不足以构成1个面时销毁删除
        if (that.data.points.length < 9) {
            that.dispose();
            return;
        }

        // 删除多余的标签
        while (that.css3dTags.length > that.data.points.length / 3 - 1) {
            const tag: CSS3DSprite = that.css3dTags.pop();
            tag.removeFromParent();
            tag.element.parentElement?.removeChild(tag.element);
        }

        // 点离起点过于靠近时，不应支持，在选点时应过滤掉，这里按正常看待

        // 添加起点到末端以形成闭环线
        that.data.points.push(that.data.points[0], that.data.points[1], that.data.points[2]);
        that.draw(that.data, true);

        that.css3dTags[that.css3dTags.length - 1].visible = true;

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
    public draw(inputData: MarkDataMultiPlans, finish: boolean = false) {
        if (this.disposed) return;
        const that = this;
        this.css3dTags = this.css3dTags || [];

        const data: MarkDataMultiPlans = {
            type: 'MarkMultiPlans',
            name: inputData.name || 'plans' + Date.now(),
            points: [...inputData.points],
            lineColor: inputData.lineColor || '#eeee00',
            lineWidth: inputData.lineWidth || 3,
            mainTagColor: inputData.mainTagColor || '#c4c4c4',
            mainTagBackground: inputData.mainTagBackground || '#2E2E30',
            mainTagOpacity: inputData.mainTagOpacity || 0.8,
            mainTagVisible: inputData.mainTagVisible === undefined ? true : inputData.mainTagVisible,
            areaTagColor: inputData.areaTagColor || '#000000',
            areaTagBackground: inputData.areaTagBackground || '#e0ffff',
            areaTagOpacity: inputData.areaTagOpacity || 0.9,
            areaTagVisible: inputData.areaTagVisible === undefined ? true : inputData.areaTagVisible,
            distanceTagVisible: inputData.distanceTagVisible === undefined ? true : inputData.distanceTagVisible,
            planOpacity: inputData.planOpacity || 0.5,
            title: inputData.title || '标记面' + (document.querySelectorAll('.mark-wrap-plans.main-warp').length + 1),
            note: inputData.note || '',
            intersectable: inputData.intersectable || false,
            clickable: inputData.clickable !== false,
        };

        const oldGeometry = that.geometry;
        const oldMaterial = that.material;
        const geometry = new LineGeometry();
        geometry.setPositions([...data.points]);
        const material = new LineMaterial({ color: data.lineColor, linewidth: data.lineWidth });
        material.resolution.set(innerWidth, innerHeight);
        that.copy(new Line2(geometry, material));

        oldGeometry?.dispose();
        oldMaterial?.dispose();

        const name = data.name;
        const count: number = data.points.length / 3 - 1;

        if (!that.css3dMainTag) {
            const mainTagWarp: HTMLDivElement = document.createElement('div');
            mainTagWarp.innerHTML = `<div style='flex-direction: column;align-items: center;display: flex;pointer-events: none;margin-bottom: 40px;'>
                                        <span class="${name}-main-tag" style="color:${data.mainTagColor};background:${data.mainTagBackground};opacity:${data.mainTagOpacity};padding:1px 5px 2px 5px;border-radius: 4px;user-select: none;font-size: 12px;pointer-events: auto;">${data.title}</span>
                                     </div>`;
            mainTagWarp.classList.add('mark-wrap-plans', `${data.name}`, `main-warp`);
            mainTagWarp.style.position = 'absolute';
            mainTagWarp.style.borderRadius = '4px';
            mainTagWarp.style.cursor = 'pointer';
            mainTagWarp.onclick = () => {
                if (that.events.fire(GetOptions).markMode) return;
                // @ts-ignore
                const onActiveMark = parent?.onActiveMark;
                const data: any = that.getMarkData(true);
                data.meterScale = that.events.fire(GetOptions).meterScale;
                onActiveMark?.(data);
                that.events.fire(StopAutoRotate);
            };
            mainTagWarp.oncontextmenu = (e: MouseEvent) => e.preventDefault();

            const css3dMainTag = new CSS3DSprite(mainTagWarp);
            css3dMainTag.position.set(data.points[0], data.points[1], data.points[2]);
            css3dMainTag.element.style.pointerEvents = 'none';
            css3dMainTag.scale.set(0.01, 0.01, 0.01);
            css3dMainTag.visible = data.mainTagVisible;
            that.group.add(css3dMainTag);

            that.css3dMainTag = css3dMainTag;
        }

        const area = that.events.fire(ComputePlansArea, data.points).toFixed(2) + ' m²';
        const center: Vector3 = that.events.fire(ComputePlansCenter, data.points);
        if (!that.css3dAreaTag) {
            const areaTagWarp: HTMLDivElement = document.createElement('div');
            areaTagWarp.innerHTML = `<span class="${name}-area-tag" style="color:${data.areaTagColor};background:${data.areaTagBackground};opacity:${data.areaTagOpacity};padding:1px 5px 2px 5px;border-radius: 4px;user-select: none;font-size: 12px;pointer-events: none;">${area}</span>`;
            areaTagWarp.classList.add('mark-wrap-plans', `${data.name}`, `area-warp`);
            areaTagWarp.style.position = 'absolute';
            areaTagWarp.style.borderRadius = '4px';

            const css3dAreaTag = new CSS3DSprite(areaTagWarp);
            css3dAreaTag.position.copy(center);
            css3dAreaTag.element.style.pointerEvents = 'none';
            css3dAreaTag.scale.set(0.01, 0.01, 0.01);
            that.group.add(css3dAreaTag);
            that.css3dAreaTag = css3dAreaTag;
        } else {
            that.css3dAreaTag.position.copy(center);
            (that.css3dAreaTag.element.childNodes[0] as HTMLSpanElement).innerText = area;
        }
        that.css3dAreaTag.visible = data.points.length > 6 && data.areaTagVisible;

        for (let i = that.css3dTags.length; i < count; i++) {
            const start: Vector3 = new Vector3().fromArray(data.points.slice(i * 3, i * 3 + 3));
            const end: Vector3 = new Vector3().fromArray(data.points.slice(i * 3 + 3, i * 3 + 6));
            const midPoint = new Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);

            const distance = start.distanceTo(end);
            const title = (distance * that.events.fire(GetOptions).meterScale).toFixed(2) + ' m';

            const tagWarp: HTMLDivElement = document.createElement('div');
            tagWarp.innerText = title;
            tagWarp.style.color = 'white';
            tagWarp.classList.add('mark-wrap-plans', `${name}`, 'distance-warp');
            tagWarp.style.position = 'absolute';
            tagWarp.style.borderRadius = '4px';
            tagWarp.style.display = 'none';

            const css3dTag = new CSS3DSprite(tagWarp);
            css3dTag.position.copy(midPoint);
            css3dTag.element.style.pointerEvents = 'none';
            css3dTag.scale.set(0.008, 0.008, 0.008);
            css3dTag.visible = data.distanceTagVisible;

            that.css3dTags.push(css3dTag);
            that.group.add(css3dTag);
        }

        that.drawPlans(data);

        if (!finish) {
            that.css3dTags[that.css3dTags.length - 1].visible = false; // 标注中，最后一个标签不显示
        } else {
            // // 删除多余wrap
            // const list = document.querySelectorAll(`.mark-wrap-${data.name}`);
            // list.forEach(wrap => !wrap.childNodes.length && wrap.parentElement?.removeChild(wrap));
        }

        that.data = data;
        that.events.fire(AddMarkToWeakRef, that);
    }

    private drawPlans(data: MarkDataMultiPlans) {
        const that = this;

        if (!that.meshPlans) {
            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new BufferAttribute(new Float32Array(), 3));
            geometry.attributes.position.needsUpdate = true;
            const indexAttribute = new BufferAttribute(new Uint16Array([]), 1);
            geometry.setIndex(indexAttribute);
            const material = new MeshBasicMaterial({
                color: data.lineColor,
                transparent: true,
                opacity: data.planOpacity,
                side: DoubleSide,
            });
            material.depthWrite = false;
            material.depthTest = true;
            that.meshPlans = new Mesh(geometry, material);
            that.meshPlans.renderOrder = 1;
            that.group.add(that.meshPlans);
        }

        if (data.points.length > 6) {
            that.meshPlans.geometry.setAttribute('position', new BufferAttribute(new Float32Array(data.points), 3));
            that.meshPlans.geometry.attributes.position.needsUpdate = true;

            let faceCount = data.points.length / 3 - 2;
            const start: Vector3 = new Vector3().fromArray(data.points.slice(0, 3));
            const end: Vector3 = new Vector3().fromArray(data.points.slice(-3));
            if (start.distanceTo(end) < 0.0001) {
                faceCount--; // 末点是绘制完成时添加的起点，应减少一个面
            }
            const indexArray = new Uint16Array(faceCount * 3);
            for (let i = 0; i < faceCount; i++) {
                indexArray[i * 3] = 0;
                indexArray[i * 3 + 1] = i + 1;
                indexArray[i * 3 + 2] = i + 2;
            }
            that.meshPlans.geometry.setIndex(new BufferAttribute(indexArray, 1));
            that.meshPlans.geometry.computeBoundingSphere();
        }
    }

    public getMarkData(simple: boolean = false): MarkData {
        const data: MarkDataMultiPlans = { ...this.data };
        if (simple) {
            delete data.points;
        } else {
            data.points = [...data.points];
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

        that.geometry.dispose();
        that.material.dispose();

        const list = document.querySelectorAll(`.${that.data.name}`);
        list.forEach(wrap => wrap.parentElement?.removeChild(wrap));

        that.events = null;
        that.data = null;
        that.css3dTags = null;
        that.group = null;
        that.meshPlans = null;
        that.css3dMainTag = null;
        that.css3dAreaTag = null;
    }
}
