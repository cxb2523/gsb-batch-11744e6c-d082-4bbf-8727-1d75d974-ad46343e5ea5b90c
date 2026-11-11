import { describe, expect, it } from 'vitest'
import { FindingCategory, SecurityLevel, Severity } from '@npm-safe/core'
import type { ScanFinding } from '@npm-safe/core'
import { auditCiReport } from '../src/ci-audit.js'
import type { CiReport, PackageResult } from '../src/index.js'

/**
 * These tests construct reports by hand: no engine is instantiated and no
 * registry or network access happens. Every assertion runs against the pure
 * audit function over plain serializable fixtures.
 */

function finding(severity: Severity, ruleId = 'rule-1'): ScanFinding {
  return {
    ruleId,
    ruleName: `Rule ${ruleId}`,
    severity,
    message: `finding of severity ${severity}`,
    category: FindingCategory.Informational,
  }
}

function packageResult(partial: Partial<PackageResult> & { name: string }): PackageResult {
  return {
    exists: true,
    version: '1.0.0',
    level: SecurityLevel.Safe,
    score: 100,
    findingCount: 0,
    failed: false,
    findings: [],
    ...partial,
  }
}

function report(
  packages: readonly PackageResult[],
  overrides: Partial<CiReport> = {},
): CiReport {
  // Defensive helper: garbage entries are intentionally kept for one audit
  // test, so summary counts ignore anything that is not a package object.
  const entries = packages.filter(
    (pkg): pkg is PackageResult => pkg !== null && typeof pkg === 'object',
  )
  const failedPackages = entries.filter(pkg => pkg.failed === true).length
  const errorPackages = entries.filter(pkg => typeof pkg.error === 'string').length
  const deepIncomplete = entries.filter(pkg => {
    return (
      typeof pkg.deepScanStatus === 'string' &&
      pkg.deepScanStatus !== 'complete'
    )
  }).length
  return {
    dir: '/virtual/project',
    scannedAt: '2026-11-11T00:00:00.000Z',
    dependencyCount: packages.length,
    failLevel: SecurityLevel.Dangerous,
    failed: failedPackages > 0,
    summary: {
      safe: entries.filter(pkg => pkg.level === SecurityLevel.Safe).length,
      suspicious: entries.filter(pkg => pkg.level === SecurityLevel.Suspicious).length,
      dangerous: entries.filter(pkg => pkg.level === SecurityLevel.Dangerous).length,
      unknown: entries.filter(pkg => pkg.level === SecurityLevel.Unknown).length,
      errors: errorPackages,
      deepIncomplete,
    },
    packages,
    ...overrides,
  }
}

function reasonCodes(audit: ReturnType<typeof auditCiReport>, name: string): string[] {
  const pkg = audit.packages.find(entry => entry.name === name)
  if (!pkg) throw new Error(`audited package ${name} not found`)
  return pkg.reasons.map(reason => reason.code)
}

describe('auditCiReport — normal paths', () => {
  it('fails overall on one dangerous package and explains the risk-level reason', () => {
    const safePkg = packageResult({ name: 'safe-pkg' })
    const dangerousPkg = packageResult({
      name: 'dangerous-pkg',
      version: '3.1.0',
      level: SecurityLevel.Dangerous,
      score: 20,
      findingCount: 1,
      findings: [finding(Severity.High)],
      failed: true,
    })
    const input = report([safePkg, dangerousPkg])

    const audit = auditCiReport(input, { lockfile: false, deep: false })

    // The verdict must match the real report exactly.
    expect(audit.failed).toBe(input.failed)
    expect(audit.failed).toBe(true)
    expect(audit.failedPackageCount).toBe(1)
    expect(audit.cancelled).toBe(false)
    expect(audit.incomplete).toBe(false)
    expect(audit.failLevel).toBe(SecurityLevel.Dangerous)

    const safe = audit.packages.find(pkg => pkg.name === 'safe-pkg')!
    expect(safe.failed).toBe(false)
    expect(safe.hardBlocked).toBe(false)
    expect(safe.reasons).toEqual([])

    const danger = audit.packages.find(pkg => pkg.name === 'dangerous-pkg')!
    expect(danger.failed).toBe(true)
    expect(reasonCodes(audit, 'dangerous-pkg')).toContain('fail-level')
    const levelReason = danger.reasons.find(r => r.code === 'fail-level')!
    expect(levelReason.message).toContain('dangerous')
    // A plain level comparison is relaxable through failLevel.
    expect(levelReason.hardBlock).toBe(false)
    expect(danger.hardBlocked).toBe(false)
    expect(danger.version).toBe('3.1.0')
  })

  it('marks critical findings as a hard block even when failLevel is unknown', () => {
    const criticalPkg = packageResult({
      name: 'crit-pkg',
      level: SecurityLevel.Safe,
      score: 95,
      findingCount: 1,
      findings: [finding(Severity.Critical, 'critical-rule')],
      failed: true,
    })
    const input = report([criticalPkg], { failLevel: SecurityLevel.Unknown })

    const audit = auditCiReport(input, {
      failLevel: SecurityLevel.Unknown,
      lockfile: false,
      deep: false,
    })

    expect(audit.failed).toBe(true)
    const pkg = audit.packages[0]!
    expect(pkg.failed).toBe(true)
    expect(pkg.hardBlocked).toBe(true)
    const criticalReason = pkg.reasons.find(r => r.code === 'critical-finding')!
    expect(criticalReason.hardBlock).toBe(true)
    expect(criticalReason.details).toMatchObject({ criticalCount: 1, findingCount: 1 })
    // A safe level against the most permissive fail level produces no
    // level reason, so the critical evidence is the sole blocker.
    expect(reasonCodes(audit, 'crit-pkg')).toEqual(['critical-finding'])
  })
})

describe('auditCiReport — boundaries and degraded input', () => {
  it('returns a non-failing audit for an empty package list without throwing', () => {
    const input = report([], { failed: false, dependencyCount: 0 })

    const audit = auditCiReport(input)

    expect(audit.failed).toBe(false)
    expect(audit.packageCount).toBe(0)
    expect(audit.failedPackageCount).toBe(0)
    expect(audit.hardBlockedPackageCount).toBe(0)
    expect(audit.packages).toEqual([])
    expect(audit.notes).toEqual([])
  })

  it('does not throw on a missing packages array or missing summary', () => {
    const noPackages = { ...report([]), packages: undefined } as unknown as CiReport
    const auditA = auditCiReport(noPackages)
    expect(auditA.failed).toBe(false)
    expect(auditA.packageCount).toBe(0)
    expect(auditA.incomplete).toBe(true)
    expect(auditA.notes.join(' ')).toContain('packages')

    const noSummary = { ...report([]), summary: undefined } as unknown as CiReport
    const auditB = auditCiReport(noSummary)
    expect(() => JSON.stringify(auditB)).not.toThrow()
    expect(auditB.incomplete).toBe(true)
    expect(auditB.notes.join(' ')).toContain('summary')

    expect(() => auditCiReport(null)).not.toThrow()
    expect(() => auditCiReport(undefined)).not.toThrow()
    const nullAudit = auditCiReport(null)
    expect(nullAudit.packages).toEqual([])
    expect(nullAudit.incomplete).toBe(true)
    expect(nullAudit.notes.length).toBeGreaterThan(0)

    const garbageEntries = report([
      null,
      'not-an-object',
      packageResult({ name: 'real-pkg' }),
    ] as unknown as PackageResult[])
    const auditC = auditCiReport(garbageEntries)
    expect(auditC.packageCount).toBe(1)
    expect(auditC.packages[0]!.name).toBe('real-pkg')
    expect(auditC.notes.length).toBeGreaterThan(0)
  })
})

describe('auditCiReport — ciScan-specific blocking rules', () => {
  it('classifies a lockfile version mismatch with requested and checked versions', () => {
    const mismatchPkg = packageResult({
      name: 'locked-pkg',
      exists: false,
      version: '1.0.0',
      level: SecurityLevel.Unknown,
      score: 0,
      failed: true,
      error: 'Requested locked-pkg@1.0.0 but checked 2.0.0',
    })
    const input = report([mismatchPkg])

    const audit = auditCiReport(input, { lockfile: true })

    expect(audit.failed).toBe(true)
    const pkg = audit.packages[0]!
    expect(pkg.hardBlocked).toBe(true)
    const reason = pkg.reasons.find(r => r.code === 'lockfile-version-mismatch')!
    expect(reason.hardBlock).toBe(true)
    expect(reason.message).toContain('1.0.0')
    expect(reason.message).toContain('2.0.0')
    expect(reason.details).toMatchObject({
      requestedVersion: '1.0.0',
      checkedVersion: '2.0.0',
      lockfile: true,
    })
    // It is reported as a mismatch, not double-counted as a generic error.
    expect(reasonCodes(audit, 'locked-pkg')).toEqual(['lockfile-version-mismatch'])
  })

  it('classifies a generic scan exception as scan-error, also for scoped names', () => {
    const brokenPkg = packageResult({
      name: '@scope/broken',
      exists: false,
      version: '',
      level: SecurityLevel.Unknown,
      score: 0,
      failed: true,
      error: 'network timeout',
    })
    const audit = auditCiReport(report([brokenPkg]))
    const pkg = audit.packages[0]!
    const reason = pkg.reasons.find(r => r.code === 'scan-error')!
    expect(reason.hardBlock).toBe(true)
    expect(reason.message).toContain('network timeout')
    expect(pkg.hardBlocked).toBe(true)
  })

  it('classifies a partial deep scan as deep-incomplete, a hard block', () => {
    const partialPkg = packageResult({
      name: 'partial-pkg',
      level: SecurityLevel.Safe,
      score: 100,
      deepScanStatus: 'partial',
      failed: true,
    })
    const input = report([partialPkg])

    const audit = auditCiReport(input, { deep: true, failLevel: SecurityLevel.Unknown })

    expect(audit.failed).toBe(true)
    const pkg = audit.packages[0]!
    expect(pkg.failed).toBe(true)
    expect(pkg.hardBlocked).toBe(true)
    const reason = pkg.reasons.find(r => r.code === 'deep-incomplete')!
    expect(reason.hardBlock).toBe(true)
    expect(reason.details).toMatchObject({ status: 'partial' })
    // Safe level vs unknown failLevel adds no level reason.
    expect(reasonCodes(audit, 'partial-pkg')).toEqual(['deep-incomplete'])

    // Without deep mode the same status is not an audit-level blocker.
    const shallow = auditCiReport(input, { deep: false })
    expect(reasonCodes(shallow, 'partial-pkg')).not.toContain('deep-incomplete')
  })

  it('treats a missing deepScanStatus in deep mode as incomplete, mirroring ciScan', () => {
    // ciScan computes `deep && deepScanStatus !== 'complete'`; when the static
    // report has no contentScan the field is absent (undefined), which is not
    // 'complete', so the package still fails. PackageResult omits the field.
    const noContentScan = packageResult({
      name: 'metadata-only',
      level: SecurityLevel.Safe,
      score: 100,
      failed: true,
    })
    expect(noContentScan.deepScanStatus).toBeUndefined()
    const audit = auditCiReport(report([noContentScan]), {
      deep: true,
      failLevel: SecurityLevel.Unknown,
    })
    const pkg = audit.packages[0]!
    expect(pkg.hardBlocked).toBe(true)
    const reason = pkg.reasons.find(r => r.code === 'deep-incomplete')!
    expect(reason.hardBlock).toBe(true)
    expect(reason.details).toMatchObject({ status: 'unavailable' })
  })

  it('flags a clean 404 as package-not-found, a hard block', () => {
    const missingPkg = packageResult({
      name: 'ghost-pkg',
      exists: false,
      version: '',
      level: SecurityLevel.Unknown,
      score: 0,
      failed: true,
    })
    const audit = auditCiReport(report([missingPkg]))
    const pkg = audit.packages[0]!
    const reason = pkg.reasons.find(r => r.code === 'package-not-found')!
    expect(reason.hardBlock).toBe(true)
    expect(pkg.hardBlocked).toBe(true)
  })

  it('labels an aborted scan as cancelled and treats collected packages as partial', () => {
    const safePkg = packageResult({ name: 'collected-pkg' })
    const input = report([safePkg], { failed: false })

    const audit = auditCiReport(input, { aborted: true })

    expect(audit.cancelled).toBe(true)
    expect(audit.incomplete).toBe(true)
    expect(audit.notes.some(note => /cancelled/i.test(note))).toBe(true)
    // Partial results are still described, but never presented as complete.
    expect(audit.packageCount).toBe(1)
    expect(audit.packages[0]!.name).toBe('collected-pkg')
  })
})

describe('auditCiReport — purity and consistency guarantees', () => {
  it('produces JSON-serializable output with no functions or signals', () => {
    const input = report([
      packageResult({
        name: 'dangerous-pkg',
        level: SecurityLevel.Dangerous,
        score: 10,
        findingCount: 1,
        findings: [finding(Severity.Critical)],
        failed: true,
      }),
    ])
    const audit = auditCiReport(input)

    // A round trip proves every value is plain JSON data.
    const roundTripped = JSON.parse(JSON.stringify(audit)) as unknown
    expect(roundTripped).toEqual(audit)

    // Explicitly prove there are no functions, symbols or signal-like objects.
    const visit = (value: unknown): void => {
      if (value === null || value === undefined) return
      const type = typeof value
      expect(type).not.toBe('function')
      expect(type).not.toBe('symbol')
      if (type === 'object') {
        expect(value).not.toBeInstanceOf(AbortSignal)
        for (const nested of Object.values(value as Record<string, unknown>)) {
          visit(nested)
        }
      }
    }
    visit(audit)
  })

  it('never mutates the input report', () => {
    const input = report([
      packageResult({
        name: 'dangerous-pkg',
        level: SecurityLevel.Dangerous,
        score: 10,
        failed: true,
        findings: [finding(Severity.High)],
      }),
    ])
    const snapshot = structuredClone(input)
    auditCiReport(input, { lockfile: true, deep: true, aborted: false })
    expect(input).toEqual(snapshot)
  })

  it('keeps audit.failed equal to report.failed for every fixture verdict', () => {
    const cases: Array<{ report: CiReport; aborted?: boolean }> = [
      { report: report([]) },
      { report: report([packageResult({ name: 'ok' })]) },
      { report: report([packageResult({
        name: 'bad', level: SecurityLevel.Dangerous, score: 0, failed: true,
      })]) },
      { report: report([packageResult({ name: 'partial-ok' })]), aborted: true },
    ]
    for (const { report: input, aborted } of cases) {
      const audit = auditCiReport(input, { aborted })
      expect(audit.failed).toBe(input.failed)
      for (const pkg of audit.packages.filter(p => p.hardBlocked)) {
        const original = input.packages.find(p => p.name === pkg.name)!
        expect(original.failed).toBe(true)
      }
    }
  })
})
