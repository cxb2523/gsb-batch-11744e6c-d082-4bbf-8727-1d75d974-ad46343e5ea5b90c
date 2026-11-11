/**
 * Pure, declarative audit of a {@link CiReport}.
 *
 * `ciScan` only exposes a single `failed` boolean plus summary counters, so a
 * caller cannot tell which rule blocked which package. This module re-derives
 * that explanation from the report itself and the scan options, without
 * touching the engine, the network, the registry, or any AbortSignal.
 *
 * Every rule below mirrors a branch in `NpmSafeEngine.ciScan`:
 *   - a missing package (`exists === false`) fails unconditionally;
 *   - `shouldFailCi` blocks on critical findings or on the level/failLevel
 *     ranking, and fails closed on unknown levels;
 *   - a deep scan whose status is not `complete` blocks even for the most
 *     permissive fail level;
 *   - lockfile version mismatches and per-package exceptions are recorded on
 *     the package's `error` field and always fail the build.
 *
 * The returned value is plain JSON-serializable data: no functions, signals,
 * class instances, or engine references. The input report is never mutated.
 */
import { SECURITY_LEVEL_RANK, SecurityLevel, Severity } from '@npm-safe/core'
import type { ScanFinding } from '@npm-safe/core'
import type { CiReport, PackageResult } from './index.js'

/** Stable identifiers for the individual CI blocking rules. */
export type CiAuditReasonCode =
  | 'package-not-found'
  | 'lockfile-version-mismatch'
  | 'scan-error'
  | 'critical-finding'
  | 'fail-level'
  | 'deep-incomplete'

/**
 * One explanation of why a package was blocked.
 *
 * `hardBlock` marks rules that cannot be relaxed through `failLevel`: a missing
 * package, a scan exception, a lockfile mismatch, a critical finding, or an
 * incomplete deep scan. The risk-level comparison alone is relaxable.
 */
export interface CiAuditReason {
  readonly code: CiAuditReasonCode
  /** Human-readable explanation, safe to render in CI logs. */
  readonly message: string
  /** True when relaxing failLevel could never make this package pass. */
  readonly hardBlock: boolean
  /** Structured detail backing the message (plain JSON values only). */
  readonly details?: Readonly<Record<string, string | number | boolean | null>>
}

/** Audit verdict for one package entry of the report. */
export interface CiAuditPackage {
  readonly name: string
  readonly version: string
  readonly failed: boolean
  readonly hardBlocked: boolean
  readonly reasons: readonly CiAuditReason[]
}

/**
 * Scan context used to interpret the report. Only the aborted *flag* is passed
 * in (never the AbortSignal itself) so the audit stays pure data.
 */
export interface CiAuditOptions {
  /** Whether the scan ran in lockfile mode (exact-version enforcement). */
  readonly lockfile?: boolean
  /** Whether a deep tarball scan was requested. */
  readonly deep?: boolean
  /** Overrides the fail level recorded on the report. */
  readonly failLevel?: SecurityLevel
  /** Whether the scan's AbortSignal was already aborted. */
  readonly aborted?: boolean
}

/** Structured, JSON-serializable audit result. */
export interface CiAudit {
  /** Mirrors `report.failed` exactly for well-formed reports. */
  readonly failed: boolean
  /** True when the scan was cancelled before all dependencies were checked. */
  readonly cancelled: boolean
  /** True when the conclusion is partial and must not be treated as final. */
  readonly incomplete: boolean
  /** Effective fail level used by the audit, or null when unrecognized. */
  readonly failLevel: SecurityLevel | null
  readonly packageCount: number
  readonly failedPackageCount: number
  readonly hardBlockedPackageCount: number
  /** Every report package, in report order; passing ones carry empty reasons. */
  readonly packages: readonly CiAuditPackage[]
  /** Human-readable notes about cancellation or degraded input. */
  readonly notes: readonly string[]
}

/** ciScan encodes lockfile mismatches with this exact message shape. */
const LOCKFILE_MISMATCH_PATTERN = /^Requested (.*)@(.*) but checked (.*)$/

const CANCELLED_NOTE =
  'Scan was cancelled (AbortSignal aborted); the packages below are partial results, not a complete conclusion.'

/**
 * Explain a CI report without side effects.
 *
 * Malformed input (null report, missing `packages`/`summary`, garbage entries)
 * never throws: a degraded audit with readable notes is returned instead.
 */
export function auditCiReport(
  report: CiReport | null | undefined,
  options: CiAuditOptions = {},
): CiAudit {
  const notes: string[] = []
  const cancelled = options.aborted === true
  if (cancelled) {
    notes.push(CANCELLED_NOTE)
  }

  if (report === null || report === undefined || typeof report !== 'object') {
    notes.push('Input report is missing or not an object; returning a degraded empty audit.')
    return {
      failed: false,
      cancelled,
      incomplete: true,
      failLevel: null,
      packageCount: 0,
      failedPackageCount: 0,
      hardBlockedPackageCount: 0,
      packages: [],
      notes,
    }
  }

  let degraded = false
  const rawPackages = (report as { packages?: unknown }).packages
  if (!Array.isArray(rawPackages)) {
    notes.push('Report has no valid "packages" array; auditing zero packages.')
    degraded = true
  }
  const rawSummary = (report as { summary?: unknown }).summary
  if (rawSummary === null || typeof rawSummary !== 'object') {
    notes.push('Report "summary" is missing or malformed; counts are derived from the package list instead.')
    degraded = true
  }

  const effectiveFailLevel = options.failLevel ?? report.failLevel ?? SecurityLevel.Dangerous
  const failLevelKnown = Object.hasOwn(
    SECURITY_LEVEL_RANK,
    effectiveFailLevel as PropertyKey,
  )
  if (!failLevelKnown) {
    notes.push(
      `Fail level "${String(effectiveFailLevel)}" is not a known SecurityLevel; policy reasons fail closed.`,
    )
  }

  const rawEntries = Array.isArray(rawPackages) ? rawPackages : []
  const packages: CiAuditPackage[] = []
  for (const entry of rawEntries) {
    if (entry === null || entry === undefined || typeof entry !== 'object') {
      notes.push('Skipped a package entry that is not an object.')
      degraded = true
      continue
    }
    const audited = auditPackage(entry as PackageResult, {
      lockfile: options.lockfile === true,
      deep: options.deep === true,
      failLevel: effectiveFailLevel as SecurityLevel,
      failLevelKnown,
    })
    const recordedFailed = (entry as { failed?: unknown }).failed
    if (typeof recordedFailed === 'boolean' && recordedFailed !== audited.failed) {
      notes.push(
        `Package "${audited.name}" records failed=${String(recordedFailed)} but the audit ` +
          `derives failed=${String(audited.failed)} from its report fields.`,
      )
    }
    packages.push(audited)
  }

  const failedPackageCount = packages.filter(pkg => pkg.failed).length
  const hardBlockedPackageCount = packages.filter(pkg => pkg.hardBlocked).length

  return {
    failed: report.failed === true,
    cancelled,
    incomplete: cancelled || degraded,
    failLevel: failLevelKnown ? (effectiveFailLevel as SecurityLevel) : null,
    packageCount: packages.length,
    failedPackageCount,
    hardBlockedPackageCount,
    packages,
    notes,
  }
}

interface PackageAuditContext {
  readonly lockfile: boolean
  readonly deep: boolean
  readonly failLevel: SecurityLevel
  readonly failLevelKnown: boolean
}

function auditPackage(pkg: PackageResult, ctx: PackageAuditContext): CiAuditPackage {
  const name = typeof pkg.name === 'string' && pkg.name.length > 0 ? pkg.name : '<unknown-package>'
  const version = typeof pkg.version === 'string' ? pkg.version : ''
  const reasons: CiAuditReason[] = []

  // Exceptions (including lockfile mismatches, which ciScan throws) land on
  // the error field and always fail the package regardless of failLevel. The
  // catch branch of ciScan never runs shouldFailCi, so an error package is
  // explained by its error alone and skips every policy evaluation below.
  const errorText = typeof pkg.error === 'string' ? pkg.error : ''
  if (errorText.length > 0) {
    const mismatch = errorText.match(LOCKFILE_MISMATCH_PATTERN)
    if (mismatch && mismatch[1] !== undefined && mismatch[2] !== undefined && mismatch[3] !== undefined) {
      reasons.push({
        code: 'lockfile-version-mismatch',
        message:
          `Lockfile version mismatch for "${name}": requested version ${mismatch[2]} ` +
          `but the registry check resolved ${mismatch[3]}.`,
        hardBlock: true,
        details: {
          lockfile: ctx.lockfile,
          requestedName: mismatch[1],
          requestedVersion: mismatch[2],
          checkedVersion: mismatch[3],
        },
      })
    } else {
      reasons.push({
        code: 'scan-error',
        message: `Scan of "${name}" aborted with an error: ${errorText}`,
        hardBlock: true,
        details: { error: errorText },
      })
    }
    return finishPackage(name, version, reasons)
  }

  if (pkg.exists === false) {
    // A clean 404: checkPackage resolved with exists=false, no exception.
    // ciScan ORs !result.exists into packageFailed before any policy result,
    // so the missing package alone explains the block.
    reasons.push({
      code: 'package-not-found',
      message: `Package "${name}" does not exist on the registry.`,
      hardBlock: true,
    })
    return finishPackage(name, version, reasons)
  }

  // Critical evidence blocks even when the overall level would pass.
  const findings: readonly ScanFinding[] = Array.isArray(pkg.findings) ? pkg.findings : []
  const criticalCount = findings.reduce(
    (count, finding) =>
      finding !== null && typeof finding === 'object' && finding.severity === Severity.Critical
        ? count + 1
        : count,
    0,
  )
  if (criticalCount > 0) {
    reasons.push({
      code: 'critical-finding',
      message:
        `Package "${name}" has ${criticalCount} critical finding(s) ` +
        `(of ${findings.length}); critical evidence blocks regardless of failLevel.`,
      hardBlock: true,
      details: { criticalCount, findingCount: findings.length },
    })
  }

  // Mirror shouldFailCi's ranking branch (the critical branch is handled above).
  const level = pkg.level
  const levelKnown = Object.hasOwn(SECURITY_LEVEL_RANK, level as PropertyKey)
  if (!levelKnown || !ctx.failLevelKnown) {
    reasons.push({
      code: 'fail-level',
      message: `Package "${name}" risk level "${String(level)}" cannot be evaluated against fail level "${String(ctx.failLevel)}"; failing closed.`,
      hardBlock: false,
      details: { level: String(level), failLevel: String(ctx.failLevel) },
    })
  } else if (
    SECURITY_LEVEL_RANK[level as SecurityLevel] <=
    SECURITY_LEVEL_RANK[ctx.failLevel]
  ) {
    reasons.push({
      code: 'fail-level',
      message: `Package "${name}" risk level "${level}" meets the configured fail level "${ctx.failLevel}".`,
      hardBlock: false,
      details: { level, failLevel: ctx.failLevel },
    })
  }

  // Deep mode requires a complete content scan. ciScan computes
  // `deep === true && deepScanStatus !== 'complete'`, so a missing status
  // (e.g. a metadata-only check whose staticScan has no contentScan) counts as
  // incomplete too. PackageResult omits the field entirely in that case, hence
  // the identical `!== 'complete'` comparison rather than a string-presence test.
  if (ctx.deep && pkg.deepScanStatus !== 'complete') {
    reasons.push({
      code: 'deep-incomplete',
      message:
        `Deep scan of "${name}" did not complete ` +
        `(status: "${typeof pkg.deepScanStatus === 'string' ? pkg.deepScanStatus : 'unavailable'}").`,
      hardBlock: true,
      details: {
        status: typeof pkg.deepScanStatus === 'string' ? pkg.deepScanStatus : 'unavailable',
      },
    })
  }

  // Fail closed for reports that claim failure without an explainable cause.
  if (reasons.length === 0 && pkg.failed === true) {
    reasons.push({
      code: 'scan-error',
      message: `Package "${name}" is marked failed but the report records no blocking detail; failing closed.`,
      hardBlock: true,
    })
  }

  return finishPackage(name, version, reasons)
}

function finishPackage(
  name: string,
  version: string,
  reasons: readonly CiAuditReason[],
): CiAuditPackage {
  return {
    name,
    version,
    failed: reasons.length > 0,
    hardBlocked: reasons.some(reason => reason.hardBlock),
    reasons,
  }
}
