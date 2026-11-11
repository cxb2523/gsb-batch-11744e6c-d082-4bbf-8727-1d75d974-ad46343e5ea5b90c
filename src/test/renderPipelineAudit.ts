/**
 * 渲染管线诊断（纯函数模块）
 *
 * 输入一份纯数据快照（画布 / 视口 / 图层列表 / 指针事件），
 * 输出结构化的纯数据诊断结果：
 *  - 每个图层是否会被实际绘制及原因
 *  - 最终绘制顺序与绘制数量
 *  - 按绘制顺序逆序命中检测的结果与逐项依据
 *
 * 约束：不创建 DOM、不实例化 Leafer、不访问 window/document，
 * 输出可 JSON 序列化（不含函数、类实例或循环引用）。
 */

export interface IRectSnapshot {
    x: number
    y: number
    width: number
    height: number
}

export interface ILayerSnapshot {
    id: string
    visible: boolean
    opacity: number
    interactive: boolean
    bounds: IRectSnapshot
    /** 是否被父级裁剪（裁剪区域视为画布矩形） */
    clippedByParent: boolean
}

export interface IViewportSnapshot {
    scale: number
    offsetX: number
    offsetY: number
}

export interface IPointerSnapshot {
    /** 像素（屏幕）坐标 */
    x: number
    y: number
    dragging: boolean
}

export interface IRenderPipelineSnapshot {
    canvas: { width: number, height: number }
    viewport: IViewportSnapshot
    /** 按绘制顺序（先画的在前）排列 */
    layers: ILayerSnapshot[]
    pointer: IPointerSnapshot
}

export interface ILayerDrawDiagnostic {
    id: string
    willDraw: boolean
    /** 夹取到 [0,1] 后的 opacity */
    opacityClamped: number
    /** 未通过绘制条件的逐项原因；通过时为空数组 */
    reasons: string[]
    checks: {
        visible: boolean
        opacityPositive: boolean
        boundsNonEmpty: boolean
        clipKeepsVisibleArea: boolean
    }
}

export interface IHitCandidateDiagnostic {
    id: string
    /** 是否参与命中（可交互且会被绘制） */
    eligible: boolean
    hit: boolean
    checks: {
        drawn: boolean
        interactive: boolean
        withinBounds: boolean
    }
    /** 逐项依据的可读说明 */
    reason: string
}

export interface IRenderPipelineAudit {
    status: 'ok' | 'degraded'
    /** 降级原因；正常时为空数组 */
    degradedReasons: string[]
    coordinateTransform: {
        formula: string
        scale: number
        offsetX: number
        offsetY: number
        pixelX: number
        pixelY: number
        /** 换算后的画布坐标；视口 scale 非法时为 null */
        canvasX: number | null
        canvasY: number | null
    }
    pointer: { x: number, y: number, dragging: boolean }
    layers: ILayerDrawDiagnostic[]
    /** 最终绘制顺序（图层 id，先画的在前） */
    drawOrder: string[]
    drawCount: number
    hitTest: {
        hitLayerId: string | null
        /** 按绘制顺序逆序（最上层优先）评估的候选图层逐项依据 */
        candidates: IHitCandidateDiagnostic[]
    }
}

export const COORDINATE_FORMULA = 'canvasX = (pixelX - offsetX) / scale; canvasY = (pixelY - offsetY) / scale'

function clampOpacity(opacity: number): number {
    if (typeof opacity !== 'number' || isNaN(opacity)) return 0
    if (opacity < 0) return 0
    if (opacity > 1) return 1
    return opacity
}

function rectsIntersect(a: IRectSnapshot, b: IRectSnapshot): boolean {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function pointInRect(x: number, y: number, r: IRectSnapshot): boolean {
    return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

/**
 * 对一份渲染快照执行诊断。任何非法输入都返回带 status='degraded' 的结果，绝不抛异常。
 */
export function auditRenderPipeline(snapshot: IRenderPipelineSnapshot): IRenderPipelineAudit {
    const degradedReasons: string[] = []

    const canvas = (snapshot && snapshot.canvas) || { width: 0, height: 0 }
    const viewport = (snapshot && snapshot.viewport) || { scale: 1, offsetX: 0, offsetY: 0 }
    const layers = (snapshot && Array.isArray(snapshot.layers)) ? snapshot.layers : []
    const pointer = (snapshot && snapshot.pointer) || { x: 0, y: 0, dragging: false }

    const canvasValid = canvas.width > 0 && canvas.height > 0
    if (!canvasValid) degradedReasons.push('canvas-size-non-positive: 画布宽高必须为正数')
    if (layers.length === 0) degradedReasons.push('empty-layer-list: 图层列表为空')

    const canvasRect: IRectSnapshot = { x: 0, y: 0, width: Math.max(0, canvas.width), height: Math.max(0, canvas.height) }

    // ---- 绘制诊断 ----
    const layerDiagnostics: ILayerDrawDiagnostic[] = layers.map(layer => {
        const opacityClamped = clampOpacity(layer.opacity)
        const bounds = layer.bounds || { x: 0, y: 0, width: 0, height: 0 }

        const checks = {
            visible: layer.visible === true,
            opacityPositive: opacityClamped > 0,
            boundsNonEmpty: bounds.width > 0 && bounds.height > 0,
            // 被父级裁剪的图层：裁剪后与画布仍有交集才保留可见区域
            clipKeepsVisibleArea: layer.clippedByParent ? rectsIntersect(bounds, canvasRect) : true
        }

        const reasons: string[] = []
        if (!checks.visible) reasons.push('invisible: visible 为 false')
        if (!checks.opacityPositive) reasons.push('opacity-zero: opacity 夹取到 [0,1] 后为 0')
        if (!checks.boundsNonEmpty) reasons.push('empty-bounds: 包围盒宽或高不为正数')
        if (!checks.clipKeepsVisibleArea) reasons.push('clipped-away: 被父级裁剪后与画布无可见交集')

        return {
            id: layer.id,
            willDraw: checks.visible && checks.opacityPositive && checks.boundsNonEmpty && checks.clipKeepsVisibleArea,
            opacityClamped,
            reasons,
            checks
        }
    })

    if (layers.some(l => !l.bounds || l.bounds.width <= 0 || l.bounds.height <= 0)) {
        degradedReasons.push('empty-bounds-layer: 存在包围盒宽或高为 0 的图层')
    }

    // layerDiagnostics 与输入图层同序，过滤后即最终绘制顺序
    const drawOrder = layerDiagnostics.filter(d => d.willDraw).map(d => d.id)
    const drawnSet: Record<string, boolean> = {}
    layerDiagnostics.forEach(d => { drawnSet[d.id] = d.willDraw })

    // ---- 坐标换算：像素坐标 -> 画布坐标 ----
    const scaleValid = typeof viewport.scale === 'number' && isFinite(viewport.scale) && viewport.scale !== 0
    if (!scaleValid) degradedReasons.push('invalid-viewport-scale: 视口 scale 必须为非零有限数')
    const canvasX = scaleValid ? (pointer.x - viewport.offsetX) / viewport.scale : null
    const canvasY = scaleValid ? (pointer.y - viewport.offsetY) / viewport.scale : null

    // ---- 命中检测：按绘制顺序逆序，取第一个通过判定的可交互图层 ----
    const reversed = layers.slice().reverse()
    let hitLayerId: string | null = null
    const candidates: IHitCandidateDiagnostic[] = reversed.map(layer => {
        const drawn = drawnSet[layer.id] === true
        const interactive = layer.interactive === true
        const withinBounds = canvasX !== null && canvasY !== null && pointInRect(canvasX, canvasY, layer.bounds)
        const eligible = drawn && interactive
        const hit = eligible && withinBounds

        let reason: string
        if (!drawn) reason = '跳过：图层不会被绘制，不参与命中'
        else if (!interactive) reason = '跳过：图层不可交互，不参与命中'
        else if (withinBounds) reason = `命中：画布坐标 (${canvasX}, ${canvasY}) 位于包围盒内`
        else reason = `未命中：画布坐标 (${canvasX}, ${canvasY}) 不在包围盒内`

        if (hit && hitLayerId === null) hitLayerId = layer.id

        return { id: layer.id, eligible, hit, checks: { drawn, interactive, withinBounds }, reason }
    })

    if (hitLayerId === null && layers.length > 0 && canvasValid) {
        const anyInteractiveDrawn = candidates.some(c => c.eligible)
        degradedReasons.push(anyInteractiveDrawn
            ? 'pointer-outside-all-bounds: 指针坐标落在所有可命中包围盒之外'
            : 'no-hittable-layer: 没有可交互且会被绘制的图层')
    }

    return {
        status: degradedReasons.length ? 'degraded' : 'ok',
        degradedReasons,
        coordinateTransform: {
            formula: COORDINATE_FORMULA,
            scale: viewport.scale,
            offsetX: viewport.offsetX,
            offsetY: viewport.offsetY,
            pixelX: pointer.x,
            pixelY: pointer.y,
            canvasX,
            canvasY
        },
        pointer: { x: pointer.x, y: pointer.y, dragging: pointer.dragging === true },
        layers: layerDiagnostics,
        drawOrder,
        drawCount: drawOrder.length,
        hitTest: { hitLayerId, candidates }
    }
}
