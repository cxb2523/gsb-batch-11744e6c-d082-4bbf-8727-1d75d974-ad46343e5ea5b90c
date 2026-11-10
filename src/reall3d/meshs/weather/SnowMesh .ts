// ==============================================
// Copyright (c) 2025 reall3d.com, MIT license
// ==============================================
import {
    AdditiveBlending,
    BoxGeometry,
    BufferAttribute,
    BufferGeometry,
    Camera,
    CanvasTexture,
    Clock,
    Color,
    ColorRepresentation,
    DynamicDrawUsage,
    Material,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    NormalBlending,
    Object3D,
    Points,
    Scene,
    ShaderMaterial,
    Texture,
    Vector3,
    WebGLRenderer,
} from 'three';

const _TMP_A = new Vector3();
const _TMP_B = new Vector3();
const _TMP_C = new Vector3();
const _TMP_D = new Vector3();
const _TMP_E = new Vector3();
const _TMP_F = new Vector3();
const _TMP_G = new Vector3();

/**
 * SnowMesh
 */
export class SnowMesh extends Mesh {
    public readonly isSnowMesh = true;
    public readonly ignoreIntersect = true;

    private _effect: ISnowEffect;
    private _clock = new Clock();

    private _enabled: boolean;
    private _followCamera: boolean;
    private _followCameraAlongUp: boolean;
    private _maxDelta: number;
    private _up = new Vector3(0, 1, 0);

    constructor(options: SnowMeshOptions = {}) {
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
            maxCount: options.maxCount ?? 20000,
            intensity: options.intensity ?? 1,
            area: options.area?.clone() ?? new Vector3(90, 55, 90),
            up: options.up?.clone() ?? new Vector3(0, -1, 0),
            wind: options.wind?.clone() ?? new Vector3(1, 0, 0.35),
            windStrength: options.windStrength ?? 1.0,
            followCamera: options.followCamera ?? false,
            followCameraAlongUp: options.followCameraAlongUp ?? false,
            nearCullRadius: options.nearCullRadius ?? 2.2,
            color: options.color ?? 0xffffff,
            opacity: options.opacity ?? 0.92,
            transparent: options.transparent ?? true,
            depthWrite: options.depthWrite ?? false,
            additive: options.additive ?? false,
            maxDelta: options.maxDelta ?? 1 / 20,
            enabled: options.enabled ?? true,
            flakeSize: options.flakeSize ?? 0.2,
            flakeSizeRange: options.flakeSizeRange ?? 1.0,
            useTexture: options.useTexture ?? true,
        };

        this._up.copy(resolved.up).normalize();
        this._enabled = resolved.enabled;
        this._followCamera = resolved.followCamera;
        this._followCameraAlongUp = resolved.followCameraAlongUp;
        this._maxDelta = resolved.maxDelta;

        this._effect = new SnowMultiLayerEffect(resolved);
        this.add(this._effect.object);

        this.name = 'SnowMesh';
        this.frustumCulled = false;
        this.renderOrder = 100;

        this._clock.start();
    }

    override onBeforeRender(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
        if (!this._enabled || !this.visible) return;

        const delta = Math.min(this._clock.getDelta(), this._maxDelta);
        const elapsed = this._clock.elapsedTime;

        if (this._followCamera) {
            buildBasisFromUp(this._up, _TMP_D, _TMP_A, _TMP_E);

            const camPos = camera.position;

            if (this._followCameraAlongUp) {
                this.position.copy(camPos);
            } else {
                const upComp = _TMP_A.copy(this._up).multiplyScalar(camPos.dot(this._up));
                this.position.copy(camPos).sub(upComp);
            }
        }

        this._effect.update(delta, elapsed, camera);
    }

    public pause() {
        this._enabled = false;
    }

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

    public setArea(area: Vector3) {
        this._effect.setArea(area);
    }

    public getArea(target = new Vector3()) {
        return this._effect.getArea(target);
    }

    public setWindDirection(wind: Vector3) {
        this._effect.setWindDirection(wind);
    }

    public getWindDirection(target = new Vector3()) {
        return this._effect.getWindDirection(target);
    }

    public setWindStrength(strength: number) {
        this._effect.setWindStrength(strength);
    }

    public getWindStrength() {
        return this._effect.getWindStrength();
    }

    public setUpDirection(up: Vector3) {
        if (up.lengthSq() < 1e-8) return;
        this._up.copy(up).normalize();
        this._effect.setUp(this._up);
    }

    public getUpDirection(target = new Vector3()) {
        return target.copy(this._up);
    }

    public setColor(color: ColorRepresentation) {
        this._effect.setColor(color);
    }

    public setOpacity(opacity: number) {
        this._effect.setOpacity(opacity);
    }

    public setIntensity(intensity: number) {
        this._effect.setIntensity(intensity);
    }

    public getIntensity() {
        return this._effect.getIntensity();
    }

    public setNearCullRadius(radius: number) {
        this._effect.setNearCullRadius(radius);
    }

    public setFlakeSize(size: number) {
        this._effect.setFlakeSize(size);
    }

    public getFlakeSize() {
        return this._effect.getFlakeSize();
    }

    public setFlakeSizeRange(range: number) {
        this._effect.setFlakeSizeRange(range);
    }

    public getFlakeSizeRange() {
        return this._effect.getFlakeSizeRange();
    }

    public setFollowCamera(enabled: boolean, alongUp = this._followCameraAlongUp) {
        this._followCamera = enabled;
        this._followCameraAlongUp = alongUp;
    }

    public reset() {
        this._effect.reset();
    }

    public dispose() {
        this._effect.dispose();
        this.geometry.dispose();
        (this.material as Material).dispose();
    }
}

export interface SnowMeshOptions {
    /** 总雪花数（建议 6000 ~ 30000） */
    maxCount?: number;

    /** 强度 0 ~ 1 */
    intensity?: number;

    /**
     * 下雪区域（局部 right / up / forward）
     * x = 横向宽
     * y = 垂直高
     * z = 深度
     */
    area?: Vector3;

    /**
     * 世界 up
     * 建议传 camera.up 或 scene.up
     */
    up?: Vector3;

    /**
     * 风方向（局部空间）
     * x = right
     * z = forward
     * 建议传一个方向向量，不一定非要单位化
     */
    wind?: Vector3;

    /** 风强度（最终会乘到 wind 上） */
    windStrength?: number;

    /** 是否跟随相机 */
    followCamera?: boolean;

    /** 跟随相机时是否同步 up 高度 */
    followCameraAlongUp?: boolean;

    /** 相机附近空洞半径，防止雪贴脸 */
    nearCullRadius?: number;

    /** 雪花颜色 */
    color?: ColorRepresentation;

    /** 全局透明度 */
    opacity?: number;

    /** 是否透明 */
    transparent?: boolean;

    /** 是否写深度 */
    depthWrite?: boolean;

    /** 是否使用加色混合（默认不推荐） */
    additive?: boolean;

    /** 单帧最大 delta */
    maxDelta?: number;

    /** 是否启用 */
    enabled?: boolean;

    /**
     * 雪花平均大小倍率（整体大小）
     * 例如 1 = 默认，1.5 = 更大，0.7 = 更小
     */
    flakeSize?: number;

    /**
     * 雪花大小随机范围倍率
     * 越大越有大小差异
     */
    flakeSizeRange?: number;

    /**
     * 是否使用内置雪花贴图
     * 建议保持 true
     */
    useTexture?: boolean;
}

type FlakeData = {
    u: number;
    v: number;
    w: number;

    speed: number;
    size: number;
    alpha: number;

    phase: number;
    swayFreqOffset: number;
    swayAmpOffset: number;
};

interface ISnowEffect {
    readonly object: Object3D;
    update(delta: number, elapsed: number, camera: Camera): void;
    setArea(area: Vector3): void;
    getArea(target?: Vector3): Vector3;
    setWindDirection(wind: Vector3): void;
    getWindDirection(target?: Vector3): Vector3;
    setWindStrength(strength: number): void;
    getWindStrength(): number;
    setUp(up: Vector3): void;
    getUp(target?: Vector3): Vector3;
    setColor(color: ColorRepresentation): void;
    setOpacity(opacity: number): void;
    setIntensity(intensity: number): void;
    getIntensity(): number;
    setNearCullRadius(radius: number): void;
    setFlakeSize(size: number): void;
    getFlakeSize(): number;
    setFlakeSizeRange(range: number): void;
    getFlakeSizeRange(): number;
    reset(): void;
    dispose(): void;
}

function buildBasisFromUp(up: Vector3, outRight: Vector3, outUp: Vector3, outForward: Vector3) {
    outUp.copy(up).normalize();

    const ref = Math.abs(outUp.y) < 0.999 ? _TMP_A.set(0, 1, 0) : _TMP_A.set(1, 0, 0);

    outRight.crossVectors(ref, outUp).normalize();
    outForward.crossVectors(outUp, outRight).normalize();
}

/**
 * 代码内生成雪花贴图（零网络请求 / 零外部资源）
 * 比硬编码超长 base64 更可维护
 */
function createSnowflakeTexture(): Texture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.5;

    // 柔边主轮廓
    const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    radial.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    radial.addColorStop(0.22, 'rgba(255,255,255,0.95)');
    radial.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    radial.addColorStop(1.0, 'rgba(255,255,255,0.0)');

    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
    ctx.fill();

    // 叠加一点不规则碎边，让它不像完美圆点
    for (let i = 0; i < 18; i++) {
        const angle = (i / 18) * Math.PI * 2 + MathUtils.randFloatSpread(0.12);
        const radius = MathUtils.randFloat(size * 0.18, size * 0.42);
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        const r = MathUtils.randFloat(size * 0.03, size * 0.07);

        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,0.25)');
        g.addColorStop(1, 'rgba(255,255,255,0.0)');

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const tex = new CanvasTexture(canvas);
    tex.needsUpdate = true;
    tex.flipY = false;
    return tex;
}

type SnowLayerOptions = {
    count: number;
    area: Vector3;
    up: Vector3;
    windDirection: Vector3;
    windStrength: number;
    color: ColorRepresentation;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
    additive: boolean;

    minSpeed: number;
    maxSpeed: number;

    minSize: number;
    maxSize: number;

    swayAmplitude: number;
    swayFrequency: number;

    nearCullRadius: number;

    minAlpha: number;
    maxAlpha: number;

    texture?: Texture | null;
};

class SnowLayer {
    public readonly points: Points;

    private _count: number;
    private _activeCount: number;

    private _area: Vector3;
    private _windDirection: Vector3;
    private _windStrength: number;
    private _up = new Vector3(0, 1, 0);

    private _rightAxis = new Vector3(1, 0, 0);
    private _upAxis = new Vector3(0, 1, 0);
    private _forwardAxis = new Vector3(0, 0, 1);

    private _nearCullRadius: number;

    private _minSpeed: number;
    private _maxSpeed: number;
    private _baseMinSize: number;
    private _baseMaxSize: number;
    private _sizeScale = 1;
    private _sizeRangeScale = 1;
    private _swayAmplitude: number;
    private _swayFrequency: number;
    private _minAlpha: number;
    private _maxAlpha: number;

    private _flakes: FlakeData[] = [];

    private _positions: Float32Array;
    private _sizes: Float32Array;
    private _alphas: Float32Array;

    private _positionAttr: BufferAttribute;
    private _sizeAttr: BufferAttribute;
    private _alphaAttr: BufferAttribute;

    private _geometry: BufferGeometry;
    private _material: ShaderMaterial;
    private _texture: Texture | null;

    constructor(options: SnowLayerOptions) {
        this._count = Math.max(1, Math.floor(options.count));
        this._activeCount = this._count;

        this._area = options.area.clone();
        this._windDirection = options.windDirection.clone();
        this._windStrength = options.windStrength;
        this._nearCullRadius = Math.max(0, options.nearCullRadius);

        this._minSpeed = options.minSpeed;
        this._maxSpeed = options.maxSpeed;
        this._baseMinSize = options.minSize;
        this._baseMaxSize = options.maxSize;
        this._swayAmplitude = options.swayAmplitude;
        this._swayFrequency = options.swayFrequency;
        this._minAlpha = options.minAlpha;
        this._maxAlpha = options.maxAlpha;

        this._texture = options.texture ?? null;

        this.setUp(options.up);

        this._geometry = new BufferGeometry();

        this._positions = new Float32Array(this._count * 3);
        this._sizes = new Float32Array(this._count);
        this._alphas = new Float32Array(this._count);

        this._positionAttr = new BufferAttribute(this._positions, 3);
        this._positionAttr.setUsage(DynamicDrawUsage);
        this._geometry.setAttribute('position', this._positionAttr);

        this._sizeAttr = new BufferAttribute(this._sizes, 1);
        this._sizeAttr.setUsage(DynamicDrawUsage);
        this._geometry.setAttribute('aSize', this._sizeAttr);

        this._alphaAttr = new BufferAttribute(this._alphas, 1);
        this._alphaAttr.setUsage(DynamicDrawUsage);
        this._geometry.setAttribute('aAlpha', this._alphaAttr);

        this._material = new ShaderMaterial({
            transparent: options.transparent,
            depthWrite: options.depthWrite,
            blending: options.additive ? AdditiveBlending : NormalBlending,
            uniforms: {
                uColor: { value: new Color(options.color) },
                uOpacity: { value: options.opacity },
                uPixelRatio: { value: 1 },
                uMap: { value: this._texture },
                uUseMap: { value: this._texture ? 1 : 0 },
            },
            vertexShader: `
        uniform float uPixelRatio;

        attribute float aSize;
        attribute float aAlpha;

        varying float vAlpha;

        void main() {
          vAlpha = aAlpha;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

          float dist = max(1.0, -mvPosition.z);

          // 比上一版稍微更稳、更柔和
          gl_PointSize = aSize * uPixelRatio * (72.0 / dist);
          gl_PointSize = clamp(gl_PointSize, 1.0, 72.0);

          gl_Position = projectionMatrix * mvPosition;
        }
      `,
            fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform sampler2D uMap;
        uniform int uUseMap;

        varying float vAlpha;

        void main() {
          vec2 uv = gl_PointCoord;

          float texAlpha = 1.0;

          if (uUseMap == 1) {
            texAlpha = texture2D(uMap, uv).a;
          } else {
            vec2 p = uv - vec2(0.5);
            float d = length(p);
            texAlpha = smoothstep(0.5, 0.18, d);
          }

          float alpha = texAlpha * vAlpha * uOpacity;

          if (alpha < 0.01) discard;

          gl_FragColor = vec4(uColor, alpha);
        }
      `,
        });

        this.points = new Points(this._geometry, this._material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 100;

        this.initFlakes();
        this.updateGeometry(0);
        this._geometry.setDrawRange(0, this._activeCount);
    }

    private randRange(min: number, max: number): number {
        return MathUtils.randFloat(min, max);
    }

    private getActualMinSize() {
        const center = this._baseMinSize * this._sizeScale;
        const range = center * Math.max(0, this._sizeRangeScale - 1);
        return Math.max(0.5, center - range);
    }

    private getActualMaxSize() {
        const center = this._baseMaxSize * this._sizeScale;
        const range = center * Math.max(0, this._sizeRangeScale - 1);
        return Math.max(this.getActualMinSize() + 0.01, center + range);
    }

    private createRandomFlake(initial = false): FlakeData {
        const halfY = this._area.y * 0.5;
        const minSize = this.getActualMinSize();
        const maxSize = this.getActualMaxSize();

        return {
            u: MathUtils.randFloatSpread(this._area.x),
            v: initial ? this.randRange(-halfY, halfY) : halfY + this.randRange(0, this._area.y * 0.25),
            w: MathUtils.randFloatSpread(this._area.z),

            speed: this.randRange(this._minSpeed, this._maxSpeed),
            size: this.randRange(minSize, maxSize),
            alpha: this.randRange(this._minAlpha, this._maxAlpha),

            phase: this.randRange(0, Math.PI * 2),
            swayFreqOffset: this.randRange(0.75, 1.25),
            swayAmpOffset: this.randRange(0.7, 1.3),
        };
    }

    private initFlakes() {
        this._flakes.length = 0;
        for (let i = 0; i < this._count; i++) {
            this._flakes.push(this.createRandomFlake(true));
        }
    }

    private localToWorldUVW(u: number, v: number, w: number, out: Vector3) {
        out.copy(this._rightAxis).multiplyScalar(u).addScaledVector(this._upAxis, v).addScaledVector(this._forwardAxis, w);
        return out;
    }

    private respawnFlake(f: FlakeData) {
        const nf = this.createRandomFlake(false);
        f.u = nf.u;
        f.v = nf.v;
        f.w = nf.w;
        f.speed = nf.speed;
        f.size = nf.size;
        f.alpha = nf.alpha;
        f.phase = nf.phase;
        f.swayFreqOffset = nf.swayFreqOffset;
        f.swayAmpOffset = nf.swayAmpOffset;
    }

    private updateGeometry(elapsed: number) {
        const pos = this._positions;
        const sizes = this._sizes;
        const alphas = this._alphas;

        const halfY = this._area.y * 0.5;

        for (let i = 0; i < this._count; i++) {
            const f = this._flakes[i];
            const base = i * 3;

            const sway = Math.sin(elapsed * this._swayFrequency * f.swayFreqOffset + f.phase) * this._swayAmplitude * f.swayAmpOffset;

            this.localToWorldUVW(f.u + sway, f.v, f.w, _TMP_B);

            pos[base + 0] = _TMP_B.x;
            pos[base + 1] = _TMP_B.y;
            pos[base + 2] = _TMP_B.z;

            sizes[i] = f.size;

            const normalizedV = (f.v + halfY) / Math.max(0.0001, this._area.y);
            const heightFade = 0.65 + Math.sin(normalizedV * Math.PI) * 0.35;
            alphas[i] = f.alpha * heightFade;
        }

        this._positionAttr.needsUpdate = true;
        this._sizeAttr.needsUpdate = true;
        this._alphaAttr.needsUpdate = true;
        this._geometry.computeBoundingSphere();
    }

    public update(delta: number, elapsed: number, camera: Camera) {
        this._material.uniforms.uPixelRatio.value = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

        const halfY = this._area.y * 0.5;
        const halfX = this._area.x * 0.5;
        const halfZ = this._area.z * 0.5;

        const windVec = _TMP_G.copy(this._windDirection);
        if (windVec.lengthSq() > 1e-8) {
            windVec.normalize().multiplyScalar(this._windStrength);
        } else {
            windVec.set(0, 0, 0);
        }

        const windU = windVec.x;
        const windW = windVec.z;

        const parent = this.points.parent;
        const parentPos = parent ? parent.position : _TMP_C.set(0, 0, 0);

        const localCamU = camera.position.dot(this._rightAxis) - parentPos.dot(this._rightAxis);
        const localCamV = camera.position.dot(this._upAxis) - parentPos.dot(this._upAxis);
        const localCamW = camera.position.dot(this._forwardAxis) - parentPos.dot(this._forwardAxis);

        const nearR2 = this._nearCullRadius * this._nearCullRadius;

        for (let i = 0; i < this._activeCount; i++) {
            const f = this._flakes[i];

            f.v -= f.speed * delta;
            f.u += windU * delta;
            f.w += windW * delta;

            const outBottom = f.v < -halfY;
            const outU = f.u < -halfX || f.u > halfX;
            const outW = f.w < -halfZ || f.w > halfZ;

            const du = f.u - localCamU;
            const dv = f.v - localCamV;
            const dw = f.w - localCamW;
            const inNearHole = du * du + dv * dv + dw * dw < nearR2;

            if (outBottom || outU || outW || inNearHole) {
                this.respawnFlake(f);
            }
        }

        this.updateGeometry(elapsed);
    }

    public setIntensityFactor(factor: number) {
        const next = Math.max(1, Math.floor(this._count * MathUtils.clamp(factor, 0, 1)));
        this._activeCount = next;
        this._geometry.setDrawRange(0, this._activeCount);
    }

    public setArea(area: Vector3) {
        this._area.copy(area);
    }

    public getArea(target = new Vector3()) {
        return target.copy(this._area);
    }

    public setWindDirection(wind: Vector3) {
        if (wind.lengthSq() < 1e-8) return;
        this._windDirection.copy(wind);
    }

    public getWindDirection(target = new Vector3()) {
        return target.copy(this._windDirection);
    }

    public setWindStrength(strength: number) {
        this._windStrength = Math.max(0, strength);
    }

    public getWindStrength() {
        return this._windStrength;
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
        this._material.uniforms.uColor.value.set(color);
    }

    public setOpacity(opacity: number) {
        this._material.uniforms.uOpacity.value = opacity;
    }

    public setNearCullRadius(radius: number) {
        this._nearCullRadius = Math.max(0, radius);
    }

    public setFlakeSize(size: number) {
        this._sizeScale = Math.max(0.1, size);
        for (let i = 0; i < this._flakes.length; i++) {
            const minSize = this.getActualMinSize();
            const maxSize = this.getActualMaxSize();
            this._flakes[i].size = this.randRange(minSize, maxSize);
        }
    }

    public getFlakeSize() {
        return this._sizeScale;
    }

    public setFlakeSizeRange(range: number) {
        this._sizeRangeScale = Math.max(0, range);
        for (let i = 0; i < this._flakes.length; i++) {
            const minSize = this.getActualMinSize();
            const maxSize = this.getActualMaxSize();
            this._flakes[i].size = this.randRange(minSize, maxSize);
        }
    }

    public getFlakeSizeRange() {
        return this._sizeRangeScale;
    }

    public reset() {
        this.initFlakes();
        this.updateGeometry(0);
    }

    public dispose() {
        this._geometry.dispose();
        this._material.dispose();
    }
}

class SnowMultiLayerEffect implements ISnowEffect {
    public readonly object = new Object3D();

    private _intensity: number;
    private _area: Vector3;
    private _windDirection: Vector3;
    private _windStrength: number;
    private _up: Vector3;
    private _opacity: number;
    private _nearCullRadius: number;
    private _flakeSize: number;
    private _flakeSizeRange: number;

    private _layers: SnowLayer[];
    private _texture: Texture | null;

    constructor(
        options: Required<
            Pick<
                SnowMeshOptions,
                | 'maxCount'
                | 'intensity'
                | 'area'
                | 'up'
                | 'wind'
                | 'windStrength'
                | 'color'
                | 'opacity'
                | 'transparent'
                | 'depthWrite'
                | 'additive'
                | 'nearCullRadius'
                | 'flakeSize'
                | 'flakeSizeRange'
                | 'useTexture'
            >
        >,
    ) {
        this._intensity = MathUtils.clamp(options.intensity, 0, 1);
        this._area = options.area.clone();
        this._windDirection = options.wind.clone();
        this._windStrength = Math.max(0, options.windStrength);
        this._up = options.up.clone();
        this._opacity = options.opacity;
        this._nearCullRadius = options.nearCullRadius;
        this._flakeSize = options.flakeSize;
        this._flakeSizeRange = options.flakeSizeRange;

        this._texture = options.useTexture ? createSnowflakeTexture() : null;

        const total = Math.max(100, Math.floor(options.maxCount));

        const nearCount = Math.floor(total * 0.18);
        const midCount = Math.floor(total * 0.37);
        const farCount = total - nearCount - midCount;

        this._layers = [
            new SnowLayer({
                count: nearCount,
                area: this._area.clone(),
                up: this._up,
                windDirection: this._windDirection,
                windStrength: this._windStrength,
                color: options.color,
                opacity: this._opacity,
                transparent: options.transparent,
                depthWrite: options.depthWrite,
                additive: options.additive,
                minSpeed: 0.7,
                maxSpeed: 1.6,
                minSize: 12,
                maxSize: 24,
                swayAmplitude: 0.35,
                swayFrequency: 1.2,
                nearCullRadius: this._nearCullRadius,
                minAlpha: 0.45,
                maxAlpha: 0.85,
                texture: this._texture,
            }),
            new SnowLayer({
                count: midCount,
                area: this._area.clone(),
                up: this._up,
                windDirection: this._windDirection,
                windStrength: this._windStrength,
                color: options.color,
                opacity: this._opacity,
                transparent: options.transparent,
                depthWrite: options.depthWrite,
                additive: options.additive,
                minSpeed: 0.45,
                maxSpeed: 1.2,
                minSize: 7,
                maxSize: 15,
                swayAmplitude: 0.24,
                swayFrequency: 1.0,
                nearCullRadius: this._nearCullRadius,
                minAlpha: 0.4,
                maxAlpha: 0.75,
                texture: this._texture,
            }),
            new SnowLayer({
                count: farCount,
                area: this._area.clone(),
                up: this._up,
                windDirection: this._windDirection,
                windStrength: this._windStrength,
                color: options.color,
                opacity: this._opacity,
                transparent: options.transparent,
                depthWrite: options.depthWrite,
                additive: options.additive,
                minSpeed: 0.22,
                maxSpeed: 0.75,
                minSize: 3,
                maxSize: 7,
                swayAmplitude: 0.12,
                swayFrequency: 0.8,
                nearCullRadius: this._nearCullRadius,
                minAlpha: 0.2,
                maxAlpha: 0.55,
                texture: this._texture,
            }),
        ];

        for (const layer of this._layers) {
            layer.setFlakeSize(this._flakeSize);
            layer.setFlakeSizeRange(this._flakeSizeRange);
            this.object.add(layer.points);
        }

        this.setIntensity(this._intensity);
    }

    public update(delta: number, elapsed: number, camera: Camera) {
        for (const layer of this._layers) {
            layer.update(delta, elapsed, camera);
        }
    }

    public setArea(area: Vector3) {
        this._area.copy(area);
        for (const layer of this._layers) layer.setArea(area);
    }

    public getArea(target = new Vector3()) {
        return target.copy(this._area);
    }

    public setWindDirection(wind: Vector3) {
        this._windDirection.copy(wind);
        for (const layer of this._layers) layer.setWindDirection(this._windDirection);
    }

    public getWindDirection(target = new Vector3()) {
        return target.copy(this._windDirection);
    }

    public setWindStrength(strength: number) {
        this._windStrength = Math.max(0, strength);
        for (const layer of this._layers) layer.setWindStrength(this._windStrength);
    }

    public getWindStrength() {
        return this._windStrength;
    }

    public setUp(up: Vector3) {
        this._up.copy(up).normalize();
        for (const layer of this._layers) layer.setUp(this._up);
    }

    public getUp(target = new Vector3()) {
        return target.copy(this._up);
    }

    public setColor(color: ColorRepresentation) {
        for (const layer of this._layers) layer.setColor(color);
    }

    public setOpacity(opacity: number) {
        this._opacity = opacity;
        for (const layer of this._layers) layer.setOpacity(opacity);
    }

    public setIntensity(intensity: number) {
        this._intensity = MathUtils.clamp(intensity, 0, 1);
        for (const layer of this._layers) {
            layer.setIntensityFactor(this._intensity);
        }
    }

    public getIntensity() {
        return this._intensity;
    }

    public setNearCullRadius(radius: number) {
        this._nearCullRadius = Math.max(0, radius);
        for (const layer of this._layers) {
            layer.setNearCullRadius(this._nearCullRadius);
        }
    }

    public setFlakeSize(size: number) {
        this._flakeSize = Math.max(0.1, size);
        for (const layer of this._layers) {
            layer.setFlakeSize(this._flakeSize);
        }
    }

    public getFlakeSize() {
        return this._flakeSize;
    }

    public setFlakeSizeRange(range: number) {
        this._flakeSizeRange = Math.max(0, range);
        for (const layer of this._layers) {
            layer.setFlakeSizeRange(this._flakeSizeRange);
        }
    }

    public getFlakeSizeRange() {
        return this._flakeSizeRange;
    }

    public reset() {
        for (const layer of this._layers) layer.reset();
    }

    public dispose() {
        for (const layer of this._layers) layer.dispose();
        this._texture?.dispose();
    }
}
