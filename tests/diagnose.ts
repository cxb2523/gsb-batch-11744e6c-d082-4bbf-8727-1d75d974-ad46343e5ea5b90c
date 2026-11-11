/// <reference types="node" />
// Checks for the pre-analysis diagnostics (src/stats/column/diagnose.ts): the
// diagnosis must agree with the real execution chain — same pass/fail and same
// error text as `runColumnTest`, same consumed columns as parseGroups + maxGroups,
// same R as the spec's rCode — without ever starting R. Run by `npm test` (before
// reference.ts, which needs the R runtime; these don't).
import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import type { Column } from "../src/lib/dataset";
import type { AnovaParams, CompareTwoGroupsParams } from "../src/stats/types";
import { dataGroups, runColumnTest } from "../src/stats/column/base";
import { compareTwoGroupsSpec } from "../src/stats/column/compare-two-groups";
import { anovaSpec } from "../src/stats/column/anova";
import { diagnoseColumnTest, type DiagnoseParams } from "../src/stats/column/diagnose";

/** A column with its values on rows 0..n-1 (so paired tests see complete rows). */
const col = (name: string, values: number[]): Column => ({
  name,
  cells: values.map(String),
  byRow: values,
  values,
  rows: values.map((_, i) => i),
});

/** The params as the spec sees them (diagnose strips `testType`). */
const specParams = (p: DiagnoseParams) => {
  const { testType: _, ...rest } = p;
  return rest as CompareTwoGroupsParams & AnovaParams;
};

// --- Normal path: three groups, ANOVA without post-hoc -------------------------
{
  const columns = [col("A", [1, 2, 3]), col("B", [2, 3, 4]), col("C", [3, 4, 5])];
  const params: DiagnoseParams = { testType: "anova", posthoc: "none" };
  const d = diagnoseColumnTest(columns, params);

  strictEqual(d.precheckPassed, true);
  strictEqual(d.precheckError, undefined);
  deepStrictEqual(d.consumedColumns, ["A", "B", "C"]);
  deepStrictEqual(
    d.groups,
    ["A", "B", "C"].map((name) => ({ name, valueCount: 3, meetsMinValues: true })),
  );
  deepStrictEqual(d.checks, [
    { name: "check", ok: true },
    { name: "minGroups", ok: true },
    { name: "minValues", ok: true },
  ]);
  // The R is the spec's, for the same groups and params — character for character.
  strictEqual(d.rCode, anovaSpec.rCode(dataGroups(columns), specParams(params)));
  ok(d.rCode!.includes("aov(v~gr)"));
}

// --- Negative path: ratio paired t test with a non-positive value --------------
{
  const columns = [col("A", [-1, 2, 3]), col("B", [2, 3, 4])];
  const params: DiagnoseParams = {
    testType: "compare-two-groups",
    paired: true,
    gaussian: true,
    equalVariance: true,
    ratio: true,
    tails: "two-sided",
  };
  const d = diagnoseColumnTest(columns, params);
  // runColumnTest returns this error before ever reaching R, so it is safe to call.
  const outcome = await runColumnTest(columns, compareTwoGroupsSpec, specParams(params));

  strictEqual(d.precheckPassed, false);
  ok("error" in outcome && outcome.error !== undefined);
  strictEqual(d.precheckError, outcome.error);
  ok(d.precheckError!.includes("The ratio t test needs values above 0"));
  ok(d.precheckError!.includes("“A” holds -1"));
  strictEqual(d.rCode, null);
  strictEqual(d.checks.length, 1);
  deepStrictEqual(d.checks[0], { name: "check", ok: false, reason: outcome.error });

  // Same for a zero, on the second group this time.
  const zero = diagnoseColumnTest([col("A", [1, 2, 3]), col("B", [2, 0, 4])], params);
  strictEqual(zero.precheckPassed, false);
  ok(zero.precheckError!.includes("“B” holds 0"));
}

// --- Boundary: Dunnett's control group is not in the data ----------------------
{
  const columns = [col("A", [1, 2, 3]), col("B", [2, 3, 4]), col("C", [3, 4, 5])];
  const params: DiagnoseParams = { testType: "anova", posthoc: "dunnett", control: "Z" };
  const d = diagnoseColumnTest(columns, params);
  const outcome = await runColumnTest(columns, anovaSpec, specParams(params));

  strictEqual(d.precheckPassed, false);
  ok("error" in outcome && outcome.error !== undefined);
  strictEqual(d.precheckError, outcome.error);
  ok(d.precheckError!.includes("The control group “Z” holds no data"));
  strictEqual(d.rCode, null);
}

// --- Boundary: a group holding a single value (Welch's ANOVA) ------------------
{
  const columns = [col("A", [1, 2, 3]), col("B", [5]), col("C", [2, 3, 4])];
  const params: DiagnoseParams = { testType: "anova", posthoc: "none", equalSd: false };
  const d = diagnoseColumnTest(columns, params);
  const outcome = await runColumnTest(columns, anovaSpec, specParams(params));

  strictEqual(d.precheckPassed, false);
  ok("error" in outcome && outcome.error !== undefined);
  strictEqual(d.precheckError, outcome.error);
  ok(d.precheckError!.includes("“B” holds 1 value; this test needs at least 2 in each group."));
  // The failing group is visible in the per-group detail too.
  deepStrictEqual(
    d.groups.find((g) => g.name === "B"),
    { name: "B", valueCount: 1, meetsMinValues: true },
  );
  strictEqual(d.rCode, null);
}

// --- maxGroups: a third column is left out of a two-group test -----------------
{
  const columns = [col("A", [1, 2, 3]), col("B", [2, 3, 4]), col("C", [3, 4, 5])];
  const params: DiagnoseParams = {
    testType: "compare-two-groups",
    paired: false,
    gaussian: true,
    equalVariance: true,
    ratio: false,
    tails: "two-sided",
  };
  const d = diagnoseColumnTest(columns, params);

  strictEqual(d.precheckPassed, true);
  // "C" is filtered by maxGroups = 2, and the exclusion is visible in the diagnosis.
  deepStrictEqual(d.consumedColumns, ["A", "B"]);
  strictEqual(d.groups.length, 2);
  const consumed = dataGroups(columns).slice(0, compareTwoGroupsSpec.maxGroups);
  strictEqual(d.rCode, compareTwoGroupsSpec.rCode(consumed, specParams(params)));
  ok(!d.rCode!.includes("3,4,5"), "the excluded column's values must not reach the R code");
}

console.log("diagnose.ts: all checks passed");
