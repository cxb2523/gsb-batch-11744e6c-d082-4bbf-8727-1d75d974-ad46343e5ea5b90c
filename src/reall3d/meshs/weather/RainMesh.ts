// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import {
    BoxGeometry,
    BufferAttribute,
    BufferGeometry,
    Camera,
    Clock,
    ColorRepresentation,
    DynamicDrawUsage,
    LineBasicMaterial,
    LineSegments,
    Material,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';

const _TMP_VEC3_A = new Vector3();
const _TMP_VEC3_B = new Vector3();
const _TMP_VEC3_C = new Vector3();
const _TMP_VEC3_D = new Vector3();
const _TMP_VEC3_E = new Vector3();

/**
 * RainMesh
 */
export class RainMesh extends Mesh {
    public readonly isRainMesh = true;
    public readonly ignoreIntersect = true;

    private _effect: IRainEffect;
    private _clock = new Clock();

    private _enabled: boolean;
    private _followCamera: boolean;
    private _followCameraAlongUp: boolean;
    private _maxDelta: number;

    /** 当前世界 up */
    private _up = new Vector3(0, 1, 0);

    constructor(options: RainMeshOptions = {}) {
        // 壳子必须是可进入 render list 的 Mesh
        const shellGeometry = new BoxGeometry(0.001, 0.001, 0.001);
        const shellMaterial = new MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            fog: false,
        });

        shellMaterial.colorWrite = false;

        super(shellGeometry, shellMaterial);

        const resolved = {
            maxCount: options.maxCount ?? 10000,
            intensity: options.intensity ?? 1,
            area: options.area?.clone() ?? new Vector3(80, 50, 80),
            minLength: options.minLength ?? 0.5,
            maxLength: options.maxLength ?? 1.4,
            minSpeed: options.minSpeed ?? 10,
            maxSpeed: options.maxSpeed ?? 30,
            wind: options.wind?.clone() ?? new Vector3(1.2, 0, 0.4),
            up: options.up?.clone() ?? new Vector3(0, -1, 0),
            color: options.color ?? 0xaad8ff,
            opacity: options.opacity ?? 0.55,
            transparent: options.transparent ?? true,
            depthWrite: options.depthWrite ?? false,
            fog: options.fog ?? true,
            followCamera: options.followCamera ?? true,
            followCameraAlongUp: options.followCameraAlongUp ?? false,
            maxDelta: options.maxDelta ?? 1 / 20,
            enabled: options.enabled ?? true,
        };

        this._up.copy(resolved.up).normalize();
        this._enabled = resolved.enabled;
        this._followCamera = resolved.followCamera;
        this._followCameraAlongUp = resolved.followCameraAlongUp;
        this._maxDelta = resolved.maxDelta;

        this._effect = new RainLineEffect(resolved);
        this.add(this._effect.object);

        this.name = 'RainMesh';
        this.frustumCulled = false;
        this.renderOrder = 100;

        this._clock.start();
    }

    override onBeforeRender(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
        if (!this._enabled || !this.visible) return;

        const delta = Math.min(this._clock.getDelta(), this._maxDelta);

        if (this._followCamera) {
            // 构建与 up 对齐的水平面
            buildBasisFromUp(this._up, _TMP_VEC3_D, _TMP_VEC3_A, _TMP_VEC3_E);
            // _TMP_VEC3_D = right
            // _TMP_VEC3_A = up
            // _TMP_VEC3_E = forward

            // 相机位置在“水平面”上的投影跟随
            const camPos = camera.position;

            // 如果不跟随 up 方向高度，则仅保留水平分量
            if (this._followCameraAlongUp) {
                this.position.copy(camPos);
            } else {
                const upComp = _TMP_VEC3_A.copy(this._up).multiplyScalar(camPos.dot(this._up));
                this.position.copy(camPos).sub(upComp);
            }
        }

        this._effect.update(delta);
    }

    /** 暂停 */
    public pause() {
        this._enabled = false;
    }

    /** 恢复 */
    public resume() {
        this._enabled = true;
        this._clock.getDelta();
    }

    public get enabled() {
        return this._enabled;
    }

    public set enabled(v: boolean) {
        this._enabled = v;
        if (v) this._clock.getDelta();
    }

    /** 设置区域 */
    public setArea(area: Vector3) {
        this._effect.setArea(area);
    }

    /** 获取区域 */
    public getArea(target = new Vector3()) {
        return this._effect.getArea(target);
    }

    /**
     * 设置风（局部水平风）
     * x = right
     * z = forward
     */
    public setWind(wind: Vector3) {
        this._effect.setWind(wind);
    }

    public getWind(target = new Vector3()) {
        return this._effect.getWind(target);
    }

    /**
     * 设置世界 up
     * 建议直接传 camera.up 或 scene.up
     */
    public setUpDirection(up: Vector3) {
        if (up.lengthSq() < 1e-8) return;
        this._up.copy(up).normalize();
        this._effect.setUp(this._up);
    }

    public getUpDirection(target = new Vector3()) {
        return target.copy(this._up);
    }

    /** 设置颜色 */
    public setColor(color: ColorRepresentation) {
        this._effect.setColor(color);
    }

    /** 设置透明度 */
    public setOpacity(opacity: number) {
        this._effect.setOpacity(opacity);
    }

    /** 设置雨量强度（0 ~ 1） */
    public setIntensity(intensity: number) {
        this._effect.setIntensity(intensity);
    }

    /** 获取雨量强度 */
    public getIntensity() {
        return this._effect.getIntensity();
    }

    /** 设置是否跟随相机 */
    public setFollowCamera(enabled: boolean, alongUp = this._followCameraAlongUp) {
        this._followCamera = enabled;
        this._followCameraAlongUp = alongUp;
    }

    /** 重置雨滴 */
    public reset() {
        this._effect.reset();
    }

    /** 销毁 */
    public dispose() {
        this._effect.dispose();
        this.geometry.dispose();
        (this.material as Material).dispose();
    }
}

export interface RainMeshOptions {
    /** 最大雨滴数量（用于预分配） */
    maxCount?: number;

    /** 初始强度，0 ~ 1 */
    intensity?: number;

    /**
     * 下雨区域尺寸（局部 right / up / forward 空间）
     * x = 横向宽度
     * y = 垂直高度（沿 up）
     * z = 深度
     */
    area?: Vector3;

    /** 雨滴最小长度 */
    minLength?: number;

    /** 雨滴最大长度 */
    maxLength?: number;

    /** 雨滴最小速度（单位：世界坐标/秒） */
    minSpeed?: number;

    /** 雨滴最大速度（单位：世界坐标/秒） */
    maxSpeed?: number;

    /**
     * 风（水平局部空间）
     * x = 沿 right 方向
     * z = 沿 forward 方向
     * y 会被忽略（雨不沿 up 漂）
     */
    wind?: Vector3;

    /**
     * 世界“向上”方向
     * 雨的下落方向会自动取 -up
     * 建议传入 camera.up 或你的全局 up
     */
    up?: Vector3;

    /** 雨滴颜色 */
    color?: ColorRepresentation;

    /** 雨滴透明度 */
    opacity?: number;

    /** 是否透明 */
    transparent?: boolean;

    /** 是否写入深度（雨通常建议 false） */
    depthWrite?: boolean;

    /** 是否受雾影响 */
    fog?: boolean;

    /** 是否跟随相机 */
    followCamera?: boolean;

    /** 跟随相机时是否同步 up 轴方向上的位置 */
    followCameraAlongUp?: boolean;

    /** 单帧最大 delta，避免切后台回来动画跳变 */
    maxDelta?: number;

    /** 是否初始启用 */
    enabled?: boolean;
}

interface IRainEffect {
    readonly object: Object3D;
    update(delta: number): void;
    setArea(area: Vector3): void;
    getArea(target?: Vector3): Vector3;
    setWind(wind: Vector3): void;
    getWind(target?: Vector3): Vector3;
    setUp(up: Vector3): void;
    getUp(target?: Vector3): Vector3;
    setColor(color: ColorRepresentation): void;
    setOpacity(opacity: number): void;
    setIntensity(intensity: number): void;
    getIntensity(): number;
    reset(): void;
    dispose(): void;
}

type DropData = {
    /** 局部 right 坐标 */
    u: number;
    /** 局部 up 坐标 */
    v: number;
    /** 局部 forward 坐标 */
    w: number;
    length: number;
    speed: number;
};

/**
 * LineSegments 版雨效实现
 * - 预分配 maxCount
 * - 用 drawRange 控制当前强度
 * - 基于 up/right/forward 局部坐标系更新
 */
class RainLineEffect implements IRainEffect {
    public readonly object: LineSegments;

    private _maxCount: number;
    private _activeCount: number;
    private _intensity: number;

    private _area: Vector3;
    private _minLength: number;
    private _maxLength: number;
    private _minSpeed: number;
    private _maxSpeed: number;

    /** 局部水平风：x=right, z=forward */
    private _wind: Vector3;

    /** 世界 up */
    private _up: Vector3 = new Vector3(0, 1, 0);

    /** 正交基 */
    private _rightAxis = new Vector3(1, 0, 0);
    private _upAxis = new Vector3(0, 1, 0);
    private _forwardAxis = new Vector3(0, 0, 1);

    private _drops: DropData[] = [];
    private _positions: Float32Array;
    private _positionAttr: BufferAttribute;
    private _geometry: BufferGeometry;
    private _material: LineBasicMaterial;

    constructor(
        options: Required<
            Pick<
                RainMeshOptions,
                | 'maxCount'
                | 'intensity'
                | 'area'
                | 'minLength'
                | 'maxLength'
                | 'minSpeed'
                | 'maxSpeed'
                | 'wind'
                | 'up'
                | 'color'
                | 'opacity'
                | 'transparent'
                | 'depthWrite'
                | 'fog'
            >
        >,
    ) {
        this._maxCount = Math.max(1, Math.floor(options.maxCount));
        this._intensity = MathUtils.clamp(options.intensity, 0, 1);
        this._activeCount = Math.max(1, Math.floor(this._maxCount * this._intensity));

        this._area = options.area.clone();
        this._minLength = options.minLength;
        this._maxLength = options.maxLength;
        this._minSpeed = options.minSpeed;
        this._maxSpeed = options.maxSpeed;
        this._wind = options.wind.clone();
        this.setUp(options.up);

        this._geometry = new BufferGeometry();

        // 每个雨滴 2 顶点，每顶点 xyz => 6 floats
        this._positions = new Float32Array(this._maxCount * 6);
        this._positionAttr = new BufferAttribute(this._positions, 3);
        this._positionAttr.setUsage(DynamicDrawUsage);
        this._geometry.setAttribute('position', this._positionAttr);

        this._material = new LineBasicMaterial({
            color: options.color,
            transparent: options.transparent,
            opacity: options.opacity,
            depthWrite: options.depthWrite,
            fog: options.fog,
        });

        this.object = new LineSegments(this._geometry, this._material);
        this.object.frustumCulled = false;
        this.object.renderOrder = 100;

        this.initDrops();
        this.updateGeometry();
        this.applyDrawRange();
    }

    private randRange(min: number, max: number): number {
        return MathUtils.randFloat(min, max);
    }

    private createRandomDrop(initial = false): DropData {
        const halfY = this._area.y * 0.5;

        return {
            u: MathUtils.randFloatSpread(this._area.x),
            v: initial ? this.randRange(-halfY, halfY) : halfY + this.randRange(0, this._area.y * 0.2),
            w: MathUtils.randFloatSpread(this._area.z),
            length: this.randRange(this._minLength, this._maxLength),
            speed: this.randRange(this._minSpeed, this._maxSpeed),
        };
    }

    private initDrops() {
        this._drops.length = 0;
        for (let i = 0; i < this._maxCount; i++) {
            this._drops.push(this.createRandomDrop(true));
        }
    }

    private applyDrawRange() {
        // 每条线段 = 2 个顶点
        this._geometry.setDrawRange(0, this._activeCount * 2);
    }

    /**
     * 局部坐标 -> 世界坐标
     */
    private localToWorldUVW(u: number, v: number, w: number, out: Vector3) {
        out.copy(this._rightAxis).multiplyScalar(u).addScaledVector(this._upAxis, v).addScaledVector(this._forwardAxis, w);
        return out;
    }

    private updateGeometry() {
        const arr = this._positions;

        // 风只在水平面（right / forward）里作用
        const windU = this._wind.x;
        const windW = this._wind.z;

        for (let i = 0; i < this._maxCount; i++) {
            const d = this._drops[i];
            const base = i * 6;

            // 头部
            this.localToWorldUVW(d.u, d.v, d.w, _TMP_VEC3_B);

            // 尾部：沿 -up 下拉，同时受一点风倾斜
            const tailOffsetScale = d.length / Math.max(d.speed, 0.0001);
            const tailU = d.u - windU * tailOffsetScale;
            const tailV = d.v - d.length;
            const tailW = d.w - windW * tailOffsetScale;

            this.localToWorldUVW(tailU, tailV, tailW, _TMP_VEC3_C);

            arr[base + 0] = _TMP_VEC3_B.x;
            arr[base + 1] = _TMP_VEC3_B.y;
            arr[base + 2] = _TMP_VEC3_B.z;

            arr[base + 3] = _TMP_VEC3_C.x;
            arr[base + 4] = _TMP_VEC3_C.y;
            arr[base + 5] = _TMP_VEC3_C.z;
        }

        this._positionAttr.needsUpdate = true;
        this._geometry.computeBoundingSphere();
    }

    public update(delta: number) {
        const halfY = this._area.y * 0.5;
        const halfX = this._area.x * 0.5;
        const halfZ = this._area.z * 0.5;

        const windU = this._wind.x;
        const windW = this._wind.z;

        for (let i = 0; i < this._activeCount; i++) {
            const d = this._drops[i];

            // 沿局部 up 反方向下落
            d.v -= d.speed * delta;

            // 水平风漂移
            d.u += windU * delta;
            d.w += windW * delta;

            const outBottom = d.v - d.length < -halfY;
            const outU = d.u < -halfX || d.u > halfX;
            const outW = d.w < -halfZ || d.w > halfZ;

            if (outBottom || outU || outW) {
                const nd = this.createRandomDrop(false);
                d.u = nd.u;
                d.v = nd.v;
                d.w = nd.w;
                d.length = nd.length;
                d.speed = nd.speed;
            }
        }

        this.updateGeometry();
    }

    public setArea(area: Vector3) {
        this._area.copy(area);
    }

    public getArea(target = new Vector3()) {
        return target.copy(this._area);
    }

    public setWind(wind: Vector3) {
        // 只取局部水平风：x / z
        this._wind.set(wind.x, 0, wind.z);
    }

    public getWind(target = new Vector3()) {
        return target.copy(this._wind);
    }

    public setUp(up: Vector3) {
        if (up.lengthSq() < 1e-8) {
            this._up.set(0, 1, 0);
        } else {
            this._up.copy(up).normalize();
        }

        buildBasisFromUp(this._up, this._rightAxis, this._upAxis, this._forwardAxis);
    }

    public getUp(target = new Vector3()) {
        return target.copy(this._up);
    }

    public setColor(color: ColorRepresentation) {
        this._material.color.set(color);
    }

    public setOpacity(opacity: number) {
        this._material.opacity = opacity;
    }

    public setIntensity(intensity: number) {
        this._intensity = MathUtils.clamp(intensity, 0, 1);
        this._activeCount = Math.max(1, Math.floor(this._maxCount * this._intensity));
        this.applyDrawRange();
    }

    public getIntensity() {
        return this._intensity;
    }

    public reset() {
        this.initDrops();
        this.updateGeometry();
    }

    public dispose() {
        this._geometry.dispose();
        this._material.dispose();
    }
}

/**
 * 根据 up 构建一组稳定的正交基：
 * right / up / forward
 */
function buildBasisFromUp(up: Vector3, outRight: Vector3, outUp: Vector3, outForward: Vector3) {
    outUp.copy(up).normalize();

    // 选一个不平行的参考轴
    const ref = Math.abs(outUp.y) < 0.999 ? _TMP_VEC3_A.set(0, 1, 0) : _TMP_VEC3_A.set(1, 0, 0);

    outRight.crossVectors(ref, outUp).normalize();
    outForward.crossVectors(outUp, outRight).normalize();
}
