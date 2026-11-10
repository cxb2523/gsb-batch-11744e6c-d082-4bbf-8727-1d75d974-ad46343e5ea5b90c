// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import { CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { Events } from '../events/Events';
import {
    ControlPlaneUpdate,
    ControlPlaneSwitchVisible,
    GetCameraLookAt,
    GetCameraLookUp,
    GetControlPlane,
    GetScene,
    ViewerNeedUpdate,
    IsControlPlaneVisible,
} from '../events/EventConstants';

export function setupControlPlane(events: Events) {
    const on = (key: number, fn?: Function, multiFn?: boolean): Function | Function[] => events.on(key, fn, multiFn);
    const fire = (key: number, ...args: any): any => events.fire(key, ...args);

    const planeGeometry = new PlaneGeometry(1, 1);
    planeGeometry.rotateX(-Math.PI / 2);
    const planeMaterial = new MeshBasicMaterial({ color: 0xffffff });
    planeMaterial.transparent = true;
    planeMaterial.opacity = 0.6;
    planeMaterial.depthTest = false;
    planeMaterial.depthWrite = false;
    planeMaterial.side = DoubleSide;
    const planeMesh = new Mesh(planeGeometry, planeMaterial);

    const arrowDir = new Vector3(0, -1, 0);
    arrowDir.normalize();
    const arrowOrigin = new Vector3(0, 0, 0);
    const arrowLength = 0.5;
    const arrowRadius = 0.01;
    const arrowColor = 0xffff66; // 0x00dd00;
    const headLength = 0.1;
    const headWidth = 0.03;
    const arrowHelper = new ArrowHelper(arrowDir, arrowOrigin, arrowLength, arrowRadius, arrowColor, headLength, headWidth);

    const controlPlane = new Object3D();
    (controlPlane as any).ignoreIntersect = true;
    controlPlane.add(planeMesh);
    controlPlane.add(arrowHelper);
    controlPlane.renderOrder = 99999;
    planeMesh.renderOrder = 99999;
    // arrowHelper.renderOrder = 99999;
    controlPlane.visible = false;

    fire(GetScene).add(controlPlane);

    on(GetControlPlane, () => controlPlane);
    on(ControlPlaneSwitchVisible, (visible?: boolean) => {
        fire(ControlPlaneUpdate, true);
        controlPlane.visible = visible === undefined ? !controlPlane.visible : visible;
        fire(ViewerNeedUpdate);
    });
    on(IsControlPlaneVisible, () => controlPlane.visible);

    on(ControlPlaneUpdate, (force: boolean = false) => {
        if (force || controlPlane.visible) {
            const tempQuaternion = new Quaternion();
            const defaultUp = new Vector3(0, -1, 0);
            tempQuaternion.setFromUnitVectors(defaultUp, fire(GetCameraLookUp));
            controlPlane.position.copy(fire(GetCameraLookAt));
            controlPlane.quaternion.copy(tempQuaternion);
        }
    });
}

export class ArrowHelper extends Object3D {
    private line: Mesh;
    private cone: Mesh;
    declare public type: string;
    private _axis: Vector3 = new Vector3();

    constructor(
        dir = new Vector3(0, 0, 1),
        origin = new Vector3(0, 0, 0),
        length = 1,
        radius = 0.1,
        color = 0xffff00,
        headLength = length * 0.2,
        headRadius = headLength * 0.2,
    ) {
        super();

        this.type = 'ArrowHelper';

        const lineGeometry = new CylinderGeometry(radius, radius, length, 32);
        lineGeometry.translate(0, length / 2.0, 0);
        const coneGeometry = new CylinderGeometry(0, headRadius, headLength, 32);
        coneGeometry.translate(0, length, 0);

        this.position.copy(origin);

        const lineMaterial = new MeshBasicMaterial({ color: color, toneMapped: false, opacity: 0.9, transparent: true, depthTest: true, depthWrite: false });
        lineMaterial.side = DoubleSide;
        this.line = new Mesh(lineGeometry, lineMaterial);
        this.line.matrixAutoUpdate = false;
        this.line.renderOrder = 9999999;
        // @ts-ignore
        this.line.ignoreIntersect = true;
        this.add(this.line);

        const coneMaterial = new MeshBasicMaterial({ color: color, toneMapped: false, opacity: 0.9, transparent: true, depthTest: true, depthWrite: false });
        coneMaterial.side = DoubleSide;
        this.cone = new Mesh(coneGeometry, coneMaterial);
        this.cone.matrixAutoUpdate = false;
        this.cone.renderOrder = 9999999;
        // @ts-ignore
        this.cone.ignoreIntersect = true;
        this.add(this.cone);

        this.setDirection(dir);
        this.renderOrder = 9999999;
    }

    setDirection(dir) {
        if (dir.y > 0.99999) {
            this.quaternion.set(0, 0, 0, 1);
        } else if (dir.y < -0.99999) {
            this.quaternion.set(1, 0, 0, 0);
        } else {
            this._axis.set(dir.z, 0, -dir.x).normalize();
            const radians = Math.acos(dir.y);
            this.quaternion.setFromAxisAngle(this._axis, radians);
        }
    }

    setColor(color) {
        // @ts-ignore
        this.line.material.color.set(color);
        // @ts-ignore
        this.cone.material.color.set(color);
    }

    copy(source) {
        super.copy(source, false);
        this.line.copy(source.line);
        this.cone.copy(source.cone);
        return this;
    }

    dispose() {
        this.line.geometry.dispose();
        // @ts-ignore
        this.line.material.dispose();
        this.cone.geometry.dispose();
        // @ts-ignore
        this.cone.material.dispose();
    }
}
