import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { auditExportRequest, EXPORT_AUDIT_CHECKS, type ExportAuditInput } from '~/utils/exportAudit'
import { DEFAULT_GLASS_PARAMS } from '~/utils/presets'
import type { GlassStudio, ModelDimensions } from '~/utils/glassScene'

// Importing glassScene pulls in the transmission shader package and GLTF exporter, both
// browser-only. The audits and STL export used here never instantiate either.
vi.mock('@pmndrs/vanilla', () => ({ MeshTransmissionMaterial: class {} }))
vi.mock('three/addons/exporters/GLTFExporter.js', () => ({ GLTFExporter: class { parseAsync() {} } }))
// glassScene is imported after the mocks above so its module graph resolves under node.
const { GlassStudio } = await import('~/utils/glassScene')

const dims = (over: Partial<ModelDimensions> = {}): ModelDimensions => ({
  widthMm: 100, heightMm: 60, depthMm: 14, triangles: 24, ...over,
})

function input(over: Partial<ExportAuditInput> = {}): ExportAuditInput {
  return {
    kind: 'glb',
    params: { ...DEFAULT_GLASS_PARAMS, finish: 'print' },
    dimensions: dims(),
    finish: 'print',
    geometry: 'extrude',
    hasMesh: true,
    printTextureAvailable: true,
    disposed: false,
    ...over,
  }
}

const byName = (result: ReturnType<typeof auditExportRequest>, name: string) =>
  result.checks.find(c => c.name === name)!

describe('auditExportRequest pure function', () => {
  it('passes every check for a positive-sized print-finish GLB and classifies the material as print', () => {
    const result = auditExportRequest(input())
    expect(result.kind).toBe('glb')
    expect(result.exportable).toBe(true)
    expect(result.hasMesh).toBe(true)
    expect(result.materialClass).toBe('print')
    expect(result.widthMm).toBe(100)
    expect(result.heightMm).toBe(60)
    expect(result.depthMm).toBe(14)
    expect(result.triangles).toBe(24)
    expect(result.checks.length).toBeGreaterThan(0)
    expect(result.checks.every(c => c.passed)).toBe(true)
    expect(result.checks.every(c => c.reason === null)).toBe(true)
    // The print-finish GLB explicitly audits print-texture availability.
    expect(byName(result, EXPORT_AUDIT_CHECKS.printTexture).passed).toBe(true)
  })

  it('reports not exportable with a reason when dimensions are null, matching the STL guard', () => {
    const result = auditExportRequest(input({ kind: 'stl', dimensions: null, hasMesh: false, finish: 'metal' }))
    expect(result.hasMesh).toBe(false)
    expect(result.exportable).toBe(false)
    const mesh = byName(result, EXPORT_AUDIT_CHECKS.meshPresent)
    expect(mesh.passed).toBe(false)
    expect(mesh.reason).toBeTruthy()
    const size = byName(result, EXPORT_AUDIT_CHECKS.positiveDimensions)
    expect(size.passed).toBe(false)
    expect(size.reason).toBeTruthy()
    expect(result.widthMm).toBeNull()
    expect(result.triangles).toBeNull()

    // Same state through the real export method: exportSTL throws 'Nothing to export'.
    const studio = Object.assign(Object.create(GlassStudio.prototype), {
      disposed: false,
      mesh: null,
      target: { ...DEFAULT_GLASS_PARAMS, finish: 'metal' },
      snapParams() {},
    }) as GlassStudio
    expect(() => studio.exportSTL()).toThrow('Nothing to export')
    expect(studio.auditExport('stl').exportable).toBe(false)
  })

  it('classifies a liquid-finish GLB as glass and passes the liquid-glass check', () => {
    const result = auditExportRequest(input({
      finish: 'liquid',
      params: { ...DEFAULT_GLASS_PARAMS, finish: 'liquid' },
      printTextureAvailable: undefined,
    }))
    expect(result.materialClass).toBe('glass')
    expect(result.exportable).toBe(true)
    const liquid = byName(result, EXPORT_AUDIT_CHECKS.liquidExportsAsGlass)
    expect(liquid).toBeDefined()
    expect(liquid.passed).toBe(true)
    // No print-texture check applies outside the print finish.
    expect(result.checks.find(c => c.name === EXPORT_AUDIT_CHECKS.printTexture)).toBeUndefined()
  })

  it('treats a PNG request as exportable when a mesh exists even if dimensions are missing', () => {
    const result = auditExportRequest(input({ kind: 'png', dimensions: null }))
    expect(result.hasMesh).toBe(true)
    expect(result.exportable).toBe(true)
    // PNG renders pixels: it has no positive-dimension requirement.
    expect(result.checks.find(c => c.name === EXPORT_AUDIT_CHECKS.positiveDimensions)).toBeUndefined()
    expect(byName(result, EXPORT_AUDIT_CHECKS.meshPresent).passed).toBe(true)
    expect(result.widthMm).toBeNull()
  })

  it('rejects a PNG request once the mesh is gone, matching screenshot()', () => {
    const result = auditExportRequest(input({ kind: 'png', dimensions: null, hasMesh: false, finish: 'glass' }))
    expect(result.exportable).toBe(false)
    expect(byName(result, EXPORT_AUDIT_CHECKS.meshPresent).passed).toBe(false)
  })

  it('fails the print-texture check for a print GLB without texture or source image', () => {
    const result = auditExportRequest(input({ printTextureAvailable: false }))
    expect(result.materialClass).toBe('print')
    expect(result.exportable).toBe(false)
    const texture = byName(result, EXPORT_AUDIT_CHECKS.printTexture)
    expect(texture.passed).toBe(false)
    expect(texture.reason).toBeTruthy()
  })

  it('skips the print-texture check for non-GLB print exports', () => {
    const stl = auditExportRequest(input({ kind: 'stl', printTextureAvailable: false }))
    expect(stl.checks.find(c => c.name === EXPORT_AUDIT_CHECKS.printTexture)).toBeUndefined()
    expect(stl.exportable).toBe(true)
  })

  it('requires positive dimensions for GLB and STL but not PNG', () => {
    for (const kind of ['glb', 'stl'] as const) {
      const flat = auditExportRequest(input({
        kind,
        dimensions: dims({ depthMm: 0 }),
        printTextureAvailable: true,
      }))
      expect(flat.exportable).toBe(false)
      expect(byName(flat, EXPORT_AUDIT_CHECKS.positiveDimensions).passed).toBe(false)
    }
    const png = auditExportRequest(input({
      kind: 'png',
      dimensions: dims({ widthMm: 0 }),
    }))
    expect(png.exportable).toBe(true)
  })

  it('maps every finish to the same material branch exportGLB selects', () => {
    expect(auditExportRequest(input({ finish: 'metal', params: { ...DEFAULT_GLASS_PARAMS, finish: 'metal' } })).materialClass).toBe('metal')
    expect(auditExportRequest(input({ finish: 'print' })).materialClass).toBe('print')
    expect(auditExportRequest(input({ finish: 'glass', params: { ...DEFAULT_GLASS_PARAMS, finish: 'glass' } })).materialClass).toBe('glass')
    expect(auditExportRequest(input({ finish: 'liquid', params: { ...DEFAULT_GLASS_PARAMS, finish: 'liquid' } })).materialClass).toBe('glass')
  })

  it('returns not exportable for a disposed studio without throwing', () => {
    const result = auditExportRequest(input({ disposed: true }))
    expect(result.exportable).toBe(false)
    expect(byName(result, EXPORT_AUDIT_CHECKS.studioAvailable).passed).toBe(false)
    expect(byName(result, EXPORT_AUDIT_CHECKS.studioAvailable).reason).toBeTruthy()
  })

  it('is pure data: JSON round-trips unchanged, contains no functions and never mutates its input', () => {
    const original = input()
    const snapshot = JSON.parse(JSON.stringify(original))
    const result = auditExportRequest(original)
    const roundTripped = JSON.parse(JSON.stringify(result))
    expect(roundTripped).toEqual(result)
    expect(JSON.stringify(result)).toBe(JSON.stringify(roundTripped))
    expect(Object.values(result).every(v => typeof v !== 'function')).toBe(true)
    expect(result.checks.every(c => typeof c === 'object' && c !== null)).toBe(true)
    expect(original).toEqual(snapshot)
  })
})

describe('GlassStudio.auditExport', () => {
  /**
   * A GlassStudio built on its prototype with local, CPU-only doubles. No WebGLRenderer is ever
   * constructed; the audit path only reads plain fields and getDimensions().
   */
  function fakeStudio(over: Record<string, unknown> = {}): GlassStudio {
    const geometry = new THREE.BoxGeometry(100, 60, 14)
    const mesh = new THREE.Mesh(geometry)
    return Object.assign(Object.create(GlassStudio.prototype), {
      disposed: false,
      mesh,
      // getDimensions() also requires a trace; a minimal object is enough.
      trace: { polygons: [{}] },
      target: { ...DEFAULT_GLASS_PARAMS, finish: 'glass' },
      printTex: null,
      source: null,
      // The export entry points snap first; the audit must not.
      snapParams() {},
      ...over,
    }) as GlassStudio
  }

  it('audits a real mesh through getDimensions() without WebGL and stays exportable', () => {
    const studio = fakeStudio({ source: {} as HTMLImageElement })
    const audit = studio.auditExport('glb')
    expect(audit.kind).toBe('glb')
    expect(audit.exportable).toBe(true)
    expect(audit.hasMesh).toBe(true)
    expect(audit.materialClass).toBe('glass')
    // BoxGeometry(100, 60, 14) reports its own millimetre box and 12 indexed triangles.
    expect(audit.widthMm).toBe(100)
    expect(audit.heightMm).toBe(60)
    expect(audit.depthMm).toBe(14)
    expect(audit.triangles).toBe(12)
  })

  it('mirrors exportSTL throwing "Nothing to export" when no mesh exists', () => {
    const studio = fakeStudio({ mesh: null })
    const audit = studio.auditExport('stl')
    expect(audit.exportable).toBe(false)
    expect(audit.hasMesh).toBe(false)
    expect(() => studio.exportSTL()).toThrow('Nothing to export')
  })

  it('audits a print GLB against the live print-texture/source availability', () => {
    const withoutSource = fakeStudio({ target: { ...DEFAULT_GLASS_PARAMS, finish: 'print' } })
    expect(withoutSource.auditExport('glb').exportable).toBe(false)
    const withSource = fakeStudio({
      target: { ...DEFAULT_GLASS_PARAMS, finish: 'print' },
      source: {} as HTMLImageElement,
    })
    const audit = withSource.auditExport('glb')
    expect(audit.exportable).toBe(true)
    expect(audit.materialClass).toBe('print')
  })

  it('returns a not-exportable audit when disposed instead of throwing', () => {
    const studio = fakeStudio({ disposed: true })
    let audit: ReturnType<GlassStudio['auditExport']>
    expect(() => { audit = studio.auditExport('glb') }).not.toThrow()
    expect(audit!.exportable).toBe(false)
    // The real export methods still throw on a disposed studio; the audit is the non-throwing path.
    expect(() => studio.exportSTL()).toThrow('Viewer unavailable')
  })

  it('does not mutate studio parameters while auditing', () => {
    const studio = fakeStudio()
    const target = { ...(studio as unknown as { target: object }).target }
    const meshBefore = (studio as unknown as { mesh: THREE.Mesh }).mesh
    studio.auditExport('glb')
    studio.auditExport('stl')
    studio.auditExport('png')
    expect((studio as unknown as { target: object }).target).toEqual(target)
    expect((studio as unknown as { mesh: THREE.Mesh }).mesh).toBe(meshBefore)
  })
})
