/**
 * Pre-export snapshot audit.
 *
 * A pure, side-effect-free mirror of the guards inside `GlassStudio.exportGLB`,
 * `GlassStudio.exportSTL` and `GlassStudio.screenshot`: given the state an export would snap to,
 * it decides whether the export can run and which material branch the GLB exporter would take,
 * without touching WebGL, the DOM or any Three.js object. Everything in the result is plain
 * JSON-serialisable data.
 */
import type { Finish, Geometry, GlassParams } from './presets'

/** The three export entry points `GlassStudio` exposes. */
export type ExportRequestKind = 'glb' | 'stl' | 'png'

/**
 * The material class an export would use. This matches the branches in `exportGLB` exactly:
 * metal takes the metallic `MeshPhysicalMaterial`, print takes the mapped physical material and
 * every other finish (glass *and* liquid) takes the transmission glass material.
 */
export type ExportMaterialClass = 'metal' | 'print' | 'glass'

/** `GlassStudio.getDimensions()` return value, in millimetres; `null` while no mesh/trace exists. */
export interface AuditDimensions {
  widthMm: number
  heightMm: number
  depthMm: number
  triangles: number
}

/** Stable identifiers for the ordered audit checks, so the UI can key on them. */
export const EXPORT_AUDIT_CHECKS = {
  /** The studio still owns its renderer (export methods otherwise throw 'Viewer unavailable'). */
  studioAvailable: 'studio-available',
  /** Every export entry point throws 'Nothing to export' without a built mesh. */
  meshPresent: 'mesh-present',
  /** GLB and STL describe a physical solid, so every millimetre dimension must be positive. */
  positiveDimensions: 'positive-dimensions',
  /** A Print-finish GLB can only be written when the print texture can be built or reused. */
  printTexture: 'print-texture',
  /** Liquid exports through the transmission glass branch, never a material of its own. */
  liquidExportsAsGlass: 'liquid-exports-as-glass',
} as const

export interface ExportAuditCheck {
  name: string
  passed: boolean
  /** Human-readable reason, set only when the check fails. */
  reason: string | null
}

export interface ExportAuditResult {
  /** The export request this audit answers. */
  kind: ExportRequestKind
  /** True only when every applicable check passes; mirrors the export methods' own guards. */
  exportable: boolean
  /** Whether a mesh currently exists on the studio, i.e. whether 'Nothing to export' would throw. */
  hasMesh: boolean
  /** Material class the GLB exporter's branch would select for the current finish. */
  materialClass: ExportMaterialClass
  /** Carved size in millimetres, or nulls while no dimensions are available. */
  widthMm: number | null
  heightMm: number | null
  depthMm: number | null
  /** Triangle count of the mesh geometry, or null while no dimensions are available. */
  triangles: number | null
  /** Ordered, kind-specific checks; each carries a readable reason when it fails. */
  checks: ExportAuditCheck[]
}

export interface ExportAuditInput {
  /** Kind of the pending export request. */
  kind: ExportRequestKind
  /** The parameters the export would snap to (a copy; the audit never reads them by reference later). */
  params: GlassParams
  /** `GlassStudio.getDimensions()` at audit time, possibly null. */
  dimensions: AuditDimensions | null
  /** The finish the export would run under. */
  finish: Finish
  /** The geometry kind the mesh was built as. */
  geometry: Geometry
  /** Whether the studio currently holds an exportable mesh. */
  hasMesh: boolean
  /**
   * For a Print-finish GLB: whether `ensurePrintTexture()` can produce a texture, i.e. a texture
   * has already been built or the source image to build it from is present. Defaults to false.
   */
  printTextureAvailable?: boolean
  /** Whether the studio is disposed; a disposed studio is audited as not exportable. */
  disposed?: boolean
}

function check(name: string, passed: boolean, reason: string | null): ExportAuditCheck {
  return { name, passed, reason: passed ? null : reason }
}

/**
 * Audit one export request against a snapshot of studio state.
 *
 * Pure: no WebGL, no DOM, no mutation of any argument. The returned object is plain data and
 * survives `JSON.stringify`/`JSON.parse` unchanged.
 */
export function auditExportRequest(input: ExportAuditInput): ExportAuditResult {
  const { kind, dimensions, finish, hasMesh } = input
  const disposed = input.disposed ?? false

  // Mirrors exportGLB's material branch: metal -> metal material, print -> mapped physical
  // material, everything else (glass and liquid) -> transmission glass material.
  const materialClass: ExportMaterialClass =
    finish === 'metal' ? 'metal' : finish === 'print' ? 'print' : 'glass'

  const checks: ExportAuditCheck[] = []

  // A disposed studio's export methods throw 'Viewer unavailable'; audit it instead of throwing.
  checks.push(check(
    EXPORT_AUDIT_CHECKS.studioAvailable,
    !disposed,
    'The 3D viewer has been disposed and cannot export.',
  ))

  // All three export methods snap their params and then throw 'Nothing to export' without a mesh.
  checks.push(check(
    EXPORT_AUDIT_CHECKS.meshPresent,
    hasMesh,
    'Nothing to export: no mesh has been built from the current image.',
  ))

  // GLB and STL carry a real, millimetre-sized solid. A screenshot only needs a mesh to draw.
  if (kind !== 'png') {
    const positive = !!dimensions
      && Number.isFinite(dimensions.widthMm) && dimensions.widthMm > 0
      && Number.isFinite(dimensions.heightMm) && dimensions.heightMm > 0
      && Number.isFinite(dimensions.depthMm) && dimensions.depthMm > 0
    checks.push(check(
      EXPORT_AUDIT_CHECKS.positiveDimensions,
      positive,
      dimensions
        ? 'The mesh dimensions are not all positive millimetre values.'
        : 'No mesh dimensions are available, so a sized file cannot be exported.',
    ))
  }

  // exportGLB rebuilds the print texture (and surface maps) before building its mapped material.
  if (kind === 'glb' && finish === 'print') {
    const textureAvailable = input.printTextureAvailable ?? false
    checks.push(check(
      EXPORT_AUDIT_CHECKS.printTexture,
      textureAvailable,
      'The Color finish needs a print texture, but no source image texture is available.',
    ))
  }

  // Liquid has no export material of its own: it falls through to the transmission glass branch.
  if (kind === 'glb' && finish === 'liquid') {
    checks.push(check(
      EXPORT_AUDIT_CHECKS.liquidExportsAsGlass,
      materialClass === 'glass',
      materialClass === 'glass' ? null : 'Liquid must export through the glass material branch.',
    ))
  }

  return {
    kind,
    exportable: checks.every(c => c.passed),
    hasMesh,
    materialClass,
    widthMm: dimensions?.widthMm ?? null,
    heightMm: dimensions?.heightMm ?? null,
    depthMm: dimensions?.depthMm ?? null,
    triangles: dimensions?.triangles ?? null,
    checks,
  }
}
