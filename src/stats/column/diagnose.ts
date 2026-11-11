// Pre-analysis diagnostics for column tests: everything `runColumnTest` decides
// before it touches R — the spec's `check`, the groups its `parseGroups` keeps
// (capped at `maxGroups`), the per-group value counts against `minValues`, and
// the exact R it would run — reported as plain data. Pure: no webR, no network,
// no side effects, so a caller can see why an analysis would fail (or exactly
// what it would run) without starting the R engine. Every step mirrors
// `runColumnTest` in base.ts; the error strings are the same, so a diagnosis
// never disagrees with the run it previews.

import type { AnovaParams, Column, CompareTwoGroupsParams } from "../types";
import { dataGroups, type ColumnTestSpec } from "./base";
import { compareTwoGroupsSpec } from "./compare-two-groups";
import { anovaSpec } from "./anova";

/** The params a diagnosis understands: which test, plus the union of both column
 *  tests' options (each spec reads only its own). Everything but `testType` is
 *  handed to the spec untouched — defaults live in the specs, as they do for
 *  `runColumnTest`, so the two can never apply them differently. */
export type DiagnoseParams = {
  testType: "compare-two-groups" | "anova";
} & Partial<CompareTwoGroupsParams & AnovaParams>;

/** One step of the pre-run validation, in the order `runColumnTest` performs it. */
export interface DiagnosticCheck {
  /** "check" (the spec's own validation), "minGroups", or "minValues". */
  name: string;
  ok: boolean;
  /** The error `runColumnTest` would return here, when it fails. */
  reason?: string;
}

/** One consumed group's size, against what the test needs. */
export interface GroupDiagnostic {
  name: string;
  valueCount: number;
  meetsMinValues: boolean;
}

/** What a column test would do with these columns and params, before it runs. */
export interface ColumnDiagnosis {
  testType: DiagnoseParams["testType"];
  /** The columns the test actually consumes: `parseGroups` (default `dataGroups`)
   *  after the `maxGroups` cap, in order. */
  consumedColumns: string[];
  /** Per consumed group: its value count and whether it reaches `minValues`. */
  groups: GroupDiagnostic[];
  /** True exactly when `runColumnTest` would not return an `error`. */
  precheckPassed: boolean;
  /** The error `runColumnTest` would return, when it wouldn't pass. */
  precheckError?: string;
  /** The R `runColumnTest` would evaluate; `null` when the prechecks fail (it
   *  would never reach R). */
  rCode: string | null;
  /** The validation steps, in order, up to and including the first failure. */
  checks: DiagnosticCheck[];
}

const SPECS = {
  "compare-two-groups": compareTwoGroupsSpec,
  anova: anovaSpec,
};

/** Diagnose a column test run without running it. Never throws on bad data: bad
 *  data is exactly what it reports. */
export function diagnoseColumnTest(columns: Column[], params: DiagnoseParams): ColumnDiagnosis {
  // The cast is confined here: each spec stays type-checked against its own params.
  const spec = SPECS[params.testType] as ColumnTestSpec<Partial<CompareTwoGroupsParams & AnovaParams>>;
  // `testType` is the diagnosis's own; the spec sees the same params runColumnTest would.
  const { testType, ...specParams } = params;
  const need = spec.minValues ?? 1;
  const checks: DiagnosticCheck[] = [];

  // The groups as runColumnTest derives them, computed even when a check fails so
  // the diagnosis can show what the test would have consumed.
  const available = (spec.parseGroups ?? dataGroups)(columns, specParams);
  const groups = spec.maxGroups ? available.slice(0, spec.maxGroups) : available;

  // The same steps, in the same order, with the same messages as runColumnTest.
  let error = spec.check?.(columns, specParams);
  checks.push(error === undefined ? { name: "check", ok: true } : { name: "check", ok: false, reason: error });
  if (error === undefined) {
    if (available.length < spec.minGroups) {
      error = `This test needs at least ${spec.minGroups} column${spec.minGroups > 1 ? "s" : ""} containing numeric data.`;
      checks.push({ name: "minGroups", ok: false, reason: error });
    } else {
      checks.push({ name: "minGroups", ok: true });
      const few = groups.find((g) => g.values.length < need);
      if (few) {
        const n = few.values.length;
        error = spec.matched?.(specParams)
          ? `This test needs at least ${need} rows holding a value in every group; the table has ${n}.`
          : `“${few.name}” holds ${n} value${n === 1 ? "" : "s"}; this test needs at least ${need} in each group.`;
        checks.push({ name: "minValues", ok: false, reason: error });
      } else {
        checks.push({ name: "minValues", ok: true });
      }
    }
  }

  return {
    testType,
    consumedColumns: groups.map((g) => g.name),
    groups: groups.map((g) => ({ name: g.name, valueCount: g.values.length, meetsMinValues: g.values.length >= need })),
    precheckPassed: error === undefined,
    precheckError: error,
    rCode: error === undefined ? spec.rCode(groups, specParams) : null,
    checks,
  };
}
