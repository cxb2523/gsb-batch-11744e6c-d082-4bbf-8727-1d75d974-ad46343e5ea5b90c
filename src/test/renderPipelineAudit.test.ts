import { describe, it, expect } from 'vitest'
import { auditRenderPipeline, IRenderPipelineSnapshot, COORDINATE_FORMULA } from './renderPipelineAudit'

function makeSnapshot(overrides: Partial<IRenderPipelineSnapshot> = {}): IRenderPipelineSnapshot {
    return {
        canvas: { width: 800, height: 600 },
        viewport: { scale: 2, offsetX: 100, offsetY: 50 },
        layers: [
            // 正常可绘制、可交互
            { id: 'background', visible: true, opacity: 1, interactive: true, bounds: { x: 0, y: 0, width: 800, height: 600 }, clippedByParent: false },
            // 不可见
            { id: 'hidden', visible: false, opacity: 1, interactive: true, bounds: { x: 0, y: 0, width: 100, height: 100 }, clippedByParent: false },
            // opacity 为 0
            { id: 'transparent', visible: true, opacity: 0, interactive: true, bounds: { x: 0, y: 0, width: 100, height: 100 }, clippedByParent: false },
            // opacity 超出 [0,1]，夹取后为 1，可绘制
            { id: 'over-opaque', visible: true, opacity: 1.8, interactive: true, bounds: { x: 10, y: 10, width: 50, height: 50 }, clippedByParent: false },
            // 被父级裁剪但仍与画布有交集 -> 可绘制
            { id: 'clipped-partial', visible: true, opacity: 0.5, interactive: true, bounds: { x: 700, y: 500, width: 200, height: 200 }, clippedByParent: true },
            // 被父级裁剪且完全在画布外 -> 不可绘制
            { id: 'clipped-away', visible: true, opacity: 1, interactive: true, bounds: { x: 1000, y: 1000, width: 50, height: 50 }, clippedByParent: true },
            // 最上层，覆盖指针点（画布坐标 (50, 25)）
            { id: 'top', visible: true, opacity: 0.9, interactive: true, bounds: { x: 0, y: 0, width: 100, height: 100 }, clippedByParent: false }
        ],
        // 像素坐标 (200, 100) -> 画布坐标 ((200-100)/2, (100-50)/2) = (50, 25)
        pointer: { x: 200, y: 100, dragging: true },
        ...overrides
    }
}

describe('auditRenderPipeline 正常路径', () => {
    it('绘制集合与顺序正确，opacity 夹取后判断', () => {
        const result = auditRenderPipeline(makeSnapshot())

        expect(result.status).toBe('ok')
        expect(result.degradedReasons).toEqual([])

        const byId: Record<string, (typeof result.layers)[number]> = {}
        result.layers.forEach(l => { byId[l.id] = l })

        expect(byId['background'].willDraw).toBe(true)
        expect(byId['hidden'].willDraw).toBe(false)
        expect(byId['hidden'].reasons.join(' ')).toContain('invisible')
        expect(byId['transparent'].willDraw).toBe(false)
        expect(byId['transparent'].reasons.join(' ')).toContain('opacity-zero')
        // opacity 1.8 夹取为 1，仍可绘制
        expect(byId['over-opaque'].willDraw).toBe(true)
        expect(byId['over-opaque'].opacityClamped).toBe(1)
        // 裁剪后仍与画布相交 -> 可绘制
        expect(byId['clipped-partial'].willDraw).toBe(true)
        // 裁剪后完全在画布外 -> 不可绘制并给出原因
        expect(byId['clipped-away'].willDraw).toBe(false)
        expect(byId['clipped-away'].reasons.join(' ')).toContain('clipped-away')
        expect(byId['clipped-away'].checks.clipKeepsVisibleArea).toBe(false)

        // 绘制顺序保持输入顺序，仅含会绘制的图层
        expect(result.drawOrder).toEqual(['background', 'over-opaque', 'clipped-partial', 'top'])
        expect(result.drawCount).toBe(4)
    })

    it('坐标换算公式体现在输出中，且换算结果正确', () => {
        const result = auditRenderPipeline(makeSnapshot())
        expect(result.coordinateTransform.formula).toBe(COORDINATE_FORMULA)
        expect(result.coordinateTransform.canvasX).toBe(50)
        expect(result.coordinateTransform.canvasY).toBe(25)
        expect(result.pointer.dragging).toBe(true)
    })

    it('命中检测按绘制顺序逆序取第一个合格图层', () => {
        const result = auditRenderPipeline(makeSnapshot())
        // top 在最上层且覆盖 (50, 25)，background 也覆盖但更靠下
        expect(result.hitTest.hitLayerId).toBe('top')

        // 候选按逆序排列：top 在最前
        expect(result.hitTest.candidates[0].id).toBe('top')
        expect(result.hitTest.candidates[0].hit).toBe(true)
        expect(result.hitTest.candidates[0].checks).toEqual({ drawn: true, interactive: true, withinBounds: true })

        // 不可见 / opacity 0 / 被裁剪掉的图层不参与命中
        const hidden = result.hitTest.candidates.find(c => c.id === 'hidden')!
        expect(hidden.checks.drawn).toBe(false)
        expect(hidden.hit).toBe(false)
        expect(hidden.reason).toContain('不会被绘制')
    })

    it('去掉 top 后命中下一层的可交互图层', () => {
        const snapshot = makeSnapshot()
        snapshot.layers = snapshot.layers.filter(l => l.id !== 'top')
        const result = auditRenderPipeline(snapshot)
        // (50, 25) 落在 over-opaque (10,10,50,50) 与 background 内，over-opaque 更靠上
        expect(result.hitTest.hitLayerId).toBe('over-opaque')
    })
})

describe('auditRenderPipeline 负向路径', () => {
    it('全部图层不可交互时命中为 null，且逐项依据可读', () => {
        const snapshot = makeSnapshot()
        snapshot.layers = [
            { id: 'a', visible: true, opacity: 1, interactive: false, bounds: { x: 0, y: 0, width: 800, height: 600 }, clippedByParent: false },
            { id: 'b', visible: true, opacity: 0.6, interactive: false, bounds: { x: 0, y: 0, width: 100, height: 100 }, clippedByParent: false }
        ]
        const result = auditRenderPipeline(snapshot)

        expect(result.hitTest.hitLayerId).toBeNull()
        expect(result.status).toBe('degraded')
        expect(result.degradedReasons.join(' ')).toContain('no-hittable-layer')

        expect(result.hitTest.candidates.length).toBe(2)
        result.hitTest.candidates.forEach(c => {
            expect(c.eligible).toBe(false)
            expect(c.hit).toBe(false)
            expect(c.checks.interactive).toBe(false)
            expect(c.reason).toContain('不可交互')
        })
    })

    it('指针落在所有包围盒之外时命中为 null 且状态明确', () => {
        const snapshot = makeSnapshot({
            layers: [
                { id: 'small', visible: true, opacity: 1, interactive: true, bounds: { x: 500, y: 500, width: 10, height: 10 }, clippedByParent: false }
            ]
        })
        const result = auditRenderPipeline(snapshot)
        expect(result.hitTest.hitLayerId).toBeNull()
        expect(result.status).toBe('degraded')
        expect(result.degradedReasons.join(' ')).toContain('pointer-outside-all-bounds')
        expect(result.hitTest.candidates[0].checks.withinBounds).toBe(false)
    })
})

describe('auditRenderPipeline 边界与降级', () => {
    it('画布宽高为 0 时不抛异常且状态为 degraded', () => {
        const snapshot = makeSnapshot()
        snapshot.canvas = { width: 0, height: 0 }
        let result: ReturnType<typeof auditRenderPipeline> | undefined
        expect(() => { result = auditRenderPipeline(snapshot) }).not.toThrow()
        expect(result!.status).toBe('degraded')
        expect(result!.degradedReasons.join(' ')).toContain('canvas-size-non-positive')
    })

    it('图层列表为空时不抛异常且状态为 degraded', () => {
        const snapshot = makeSnapshot({ layers: [] })
        let result: ReturnType<typeof auditRenderPipeline> | undefined
        expect(() => { result = auditRenderPipeline(snapshot) }).not.toThrow()
        expect(result!.status).toBe('degraded')
        expect(result!.degradedReasons.join(' ')).toContain('empty-layer-list')
        expect(result!.drawOrder).toEqual([])
        expect(result!.drawCount).toBe(0)
        expect(result!.hitTest.hitLayerId).toBeNull()
    })

    it('包围盒宽或高为 0 的图层不抛异常、不绘制且原因明确', () => {
        const snapshot = makeSnapshot({
            layers: [
                { id: 'zero-w', visible: true, opacity: 1, interactive: true, bounds: { x: 0, y: 0, width: 0, height: 100 }, clippedByParent: false },
                { id: 'zero-h', visible: true, opacity: 1, interactive: true, bounds: { x: 0, y: 0, width: 100, height: 0 }, clippedByParent: false },
                { id: 'ok', visible: true, opacity: 1, interactive: true, bounds: { x: 0, y: 0, width: 100, height: 100 }, clippedByParent: false }
            ]
        })
        let result: ReturnType<typeof auditRenderPipeline> | undefined
        expect(() => { result = auditRenderPipeline(snapshot) }).not.toThrow()
        expect(result!.status).toBe('degraded')
        expect(result!.degradedReasons.join(' ')).toContain('empty-bounds-layer')

        const zeroW = result!.layers.find(l => l.id === 'zero-w')!
        expect(zeroW.willDraw).toBe(false)
        expect(zeroW.checks.boundsNonEmpty).toBe(false)
        expect(zeroW.reasons.join(' ')).toContain('empty-bounds')
        expect(result!.drawOrder).toEqual(['ok'])
    })

    it('诊断结果可 JSON 序列化且不含函数', () => {
        const result = auditRenderPipeline(makeSnapshot())
        const json = JSON.stringify(result)
        expect(typeof json).toBe('string')
        const revived = JSON.parse(json)
        expect(revived).toEqual(result)
        expect(revived.hitTest.hitLayerId).toBe('top')
    })
})
