// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import url from "node:url";

import sarif from "../sarif.js";
import { auditSarifExport } from "../sarif-audit.js";

const ENV_KEYS = ["SARIF_ESLINT_EMBED", "SARIF_ESLINT_IGNORE_SUPPRESSED"];

/**
 * 在受控环境变量下调用 sarif() 并返回 JSON.parse 后的对象，
 * 调用前后恢复环境变量，避免影响其他测试。
 */
function runSarif(results, rulesMeta, { ignoreSuppressed = false } = {}) {
	const previous = ENV_KEYS.map((key) => process.env[key]);
	delete process.env.SARIF_ESLINT_EMBED;
	if (ignoreSuppressed) {
		process.env.SARIF_ESLINT_IGNORE_SUPPRESSED = "true";
	} else {
		delete process.env.SARIF_ESLINT_IGNORE_SUPPRESSED;
	}
	try {
		return JSON.parse(
			sarif(results, rulesMeta === undefined ? undefined : { rulesMeta }),
		);
	} finally {
		ENV_KEYS.forEach((key, i) => {
			if (previous[i] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = previous[i];
			}
		});
	}
}

const rulesMeta = {
	"regexp/no-super-linear-backtracking": {
		docs: {
			url: "https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-super-linear-backtracking.html",
			category: "Possible Errors",
			description: "disallow exponential and polynomial backtracking",
		},
	},
	"regexp/no-super-linear-move": {
		docs: {
			url: "https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-super-linear-move.html",
			category: "Possible Errors",
			// 故意不提供 description，覆盖 hasShortDescription === false
		},
	},
	"local/no-docs-rule": {
		// 故意不提供 docs 属性
	},
};

/** 正常路径样例：多文件、多规则、带抑制消息、带 source。 */
function normalResults() {
	return [
		{
			filePath: "/project/a.js",
			messages: [
				{
					ruleId: "regexp/no-super-linear-backtracking",
					severity: 2,
					message: "Potential exponential backtracking.",
					line: 1,
					column: 12,
					endLine: 1,
					endColumn: 20,
					source: "const re = /^(a+)+$/;",
				},
				{
					ruleId: "regexp/no-super-linear-move",
					severity: 1,
					message: "Potential quadratic move.",
					line: 2,
					column: 1,
					endLine: 2,
					endColumn: 9,
				},
			],
			suppressedMessages: [
				{
					ruleId: "regexp/no-super-linear-backtracking",
					severity: 1,
					message: "Suppressed via directive.",
					line: 3,
					column: 1,
					endLine: 3,
					endColumn: 8,
					source: "const re2 = /^(b+)+$/;",
					suppressions: [{ kind: "directive", justification: "accepted risk" }],
				},
				{
					ruleId: "local/no-docs-rule",
					severity: 2,
					message: "Suppressed via file.",
					line: 4,
					column: 2,
					endLine: 4,
					endColumn: 9,
					suppressions: [{ kind: "file", justification: "bulk suppression" }],
				},
			],
		},
		{
			filePath: "/project/b.js",
			messages: [
				{
					ruleId: "regexp/no-super-linear-move",
					severity: 2,
					message: "Another move issue without position.",
					line: 0,
					column: 0,
					endLine: 0,
					endColumn: 0,
				},
			],
			suppressedMessages: [],
		},
	];
}

/** 逐项断言审计结果与 sarif() 解析结果一致。 */
function assertParity(audit, parsed) {
	const run = parsed.runs[0];

	// artifacts：顺序与 index 一致
	const parsedArtifacts = run.artifacts ?? [];
	assert.equal(
		audit.artifacts.length,
		parsedArtifacts.length,
		"artifacts 数量不一致",
	);
	for (let i = 0; i < audit.artifacts.length; i++) {
		assert.equal(
			audit.artifacts[i].index,
			i,
			`artifacts[${i}] 的 index 与下标不一致`,
		);
		assert.equal(
			url.pathToFileURL(audit.artifacts[i].filePath).href,
			parsedArtifacts[i].location.uri,
			`artifacts[${i}] 的路径不一致`,
		);
	}

	// driver.rules：ruleId 顺序与 index 一致
	const parsedRules = run.tool.driver.rules;
	assert.equal(
		audit.rules.length,
		parsedRules.length,
		"driver.rules 数量不一致",
	);
	for (let i = 0; i < audit.rules.length; i++) {
		assert.equal(audit.rules[i].index, i, `rules[${i}] 的 index 与下标不一致`);
		assert.equal(
			audit.rules[i].ruleId,
			parsedRules[i].id,
			`rules[${i}] 的 ruleId 不一致`,
		);
		assert.equal(
			audit.rules[i].helpUri,
			parsedRules[i].helpUri,
			`rules[${i}] 的 helpUri 不一致`,
		);
		assert.equal(
			audit.rules[i].category,
			parsedRules[i].properties.category,
			`rules[${i}] 的 category 不一致`,
		);
		assert.equal(
			audit.rules[i].hasShortDescription,
			Boolean(parsedRules[i].shortDescription),
			`rules[${i}] 的 shortDescription 存在性不一致`,
		);
	}

	// results：level、ruleIndex、region、artifact index、suppressions 一致
	const parsedResults = run.results;
	assert.equal(
		audit.results.length,
		parsedResults.length,
		"results 数量不一致",
	);
	for (let i = 0; i < audit.results.length; i++) {
		const audited = audit.results[i];
		const actual = parsedResults[i];
		const label = `results[${i}]（ruleId=${audited.ruleId}）`;

		assert.equal(audited.level, actual.level, `${label} 的 level 不一致`);
		assert.equal(
			audited.ruleId,
			actual.ruleId ?? null,
			`${label} 的 ruleId 不一致`,
		);
		assert.equal(
			audited.ruleIndex,
			actual.ruleIndex ?? null,
			`${label} 的 ruleIndex 不一致`,
		);
		assert.equal(
			audited.artifactIndex,
			actual.locations[0].physicalLocation.artifactLocation.index,
			`${label} 的 artifact index 不一致`,
		);

		const parsedRegion = actual.locations[0].physicalLocation.region;
		assert.equal(
			audited.region !== null,
			parsedRegion !== undefined,
			`${label} 的 region 存在性不一致`,
		);
		for (const key of ["startLine", "startColumn", "endLine", "endColumn"]) {
			assert.equal(
				audited.region?.[key] ?? undefined,
				parsedRegion?.[key] ?? undefined,
				`${label} 的 region.${key} 不一致`,
			);
		}
		assert.equal(
			audited.hasSnippet,
			Boolean(parsedRegion?.snippet),
			`${label} 的 snippet 存在性不一致`,
		);

		const parsedSuppressions = actual.suppressions ?? null;
		assert.equal(
			audited.suppressions !== null,
			parsedSuppressions !== null,
			`${label} 的 suppressions 存在性不一致`,
		);
		if (audited.suppressions !== null) {
			assert.equal(audited.suppressions.length, parsedSuppressions.length);
			for (let j = 0; j < audited.suppressions.length; j++) {
				assert.equal(
					audited.suppressions[j].kind,
					parsedSuppressions[j].kind,
					`${label} 的 suppressions[${j}].kind 不一致`,
				);
				assert.equal(
					audited.suppressions[j].justification,
					parsedSuppressions[j].justification ?? null,
					`${label} 的 suppressions[${j}].justification 不一致`,
				);
			}
		}
	}

	// toolConfigurationNotifications 与 executionSuccessful 一致
	const invocation = run.invocations?.[0];
	const parsedNotifications = invocation?.toolConfigurationNotifications ?? [];
	assert.equal(
		audit.toolConfigurationNotifications.length,
		parsedNotifications.length,
		"toolConfigurationNotifications 数量不一致",
	);
	for (let i = 0; i < audit.toolConfigurationNotifications.length; i++) {
		assert.equal(
			audit.toolConfigurationNotifications[i].level,
			parsedNotifications[i].level,
			`toolConfigurationNotifications[${i}] 的 level 不一致`,
		);
		assert.equal(
			audit.toolConfigurationNotifications[i].descriptorId,
			parsedNotifications[i].descriptor.id,
			`toolConfigurationNotifications[${i}] 的 descriptor.id 不一致`,
		);
	}
	assert.equal(
		audit.executionSuccessful,
		invocation?.executionSuccessful ?? true,
		"executionSuccessful 不一致",
	);
}

test("sarif-audit", async (t) => {
	await t.test(
		"正常路径：审计与 sarif() 解析结果逐项相等且全部检查项通过",
		() => {
			const results = normalResults();
			const resultsBefore = JSON.stringify(results);
			const rulesMetaBefore = JSON.stringify(rulesMeta);

			const audit = auditSarifExport(results, rulesMeta, {
				embedFileContents: false,
				ignoreSuppressed: false,
			});
			const parsed = runSarif(results, rulesMeta);

			assertParity(audit, parsed);

			assert.equal(audit.degraded, false);
			assert.deepEqual(audit.degradedReasons, []);
			assert.ok(audit.checks.length > 0, "应至少有一个检查项");
			for (const check of audit.checks) {
				assert.equal(
					check.passed,
					true,
					`检查项 ${check.name} 未通过：${check.reasons}`,
				);
				assert.deepEqual(check.reasons, []);
			}

			// 抑制消息并入 results，且 kind 映射为 inSource / external
			const suppressionKinds = audit.results
				.filter((result) => result.suppressions !== null)
				.flatMap((result) =>
					result.suppressions.map((suppression) => suppression.kind),
				);
			assert.ok(suppressionKinds.includes("inSource"));
			assert.ok(suppressionKinds.includes("external"));

			// 审计不得修改传入的数组与 rulesMeta
			assert.equal(
				JSON.stringify(results),
				resultsBefore,
				"审计修改了传入的 results",
			);
			assert.equal(
				JSON.stringify(rulesMeta),
				rulesMetaBefore,
				"审计修改了传入的 rulesMeta",
			);
		},
	);

	await t.test(
		"负向路径：ruleId 不在 rulesMeta 中时不分配 ruleIndex 但仍进入 results",
		() => {
			const results = [
				{
					filePath: "/project/c.js",
					messages: [
						{
							ruleId: "unknown/rule",
							severity: 2,
							message: "Message from an unknown rule.",
							line: 1,
							column: 1,
							endLine: 1,
							endColumn: 5,
						},
					],
					suppressedMessages: [],
				},
			];

			const audit = auditSarifExport(results, rulesMeta, {});
			const parsed = runSarif(results, rulesMeta);

			assertParity(audit, parsed);

			assert.equal(
				audit.results.length,
				1,
				"未知规则的消息仍应出现在 results 中",
			);
			assert.equal(audit.results[0].ruleId, "unknown/rule");
			assert.equal(
				audit.results[0].ruleIndex,
				null,
				"未知规则不得分配 ruleIndex",
			);
			assert.ok(
				!audit.rules.some((rule) => rule.ruleId === "unknown/rule"),
				"不得凭空生成规则条目",
			);
			assert.ok(
				!Object.hasOwn(parsed.runs[0].results[0], "ruleIndex"),
				"sarif() 输出中未知规则同样没有 ruleIndex",
			);
			for (const check of audit.checks) {
				assert.equal(
					check.passed,
					true,
					`检查项 ${check.name} 未通过：${check.reasons}`,
				);
			}
		},
	);

	await t.test("边界路径：空结果数组返回带可读原因的降级结果且不抛异常", () => {
		const audit = auditSarifExport([], rulesMeta, {});
		const parsed = runSarif([], rulesMeta);

		assertParity(audit, parsed);

		assert.deepEqual(audit.artifacts, []);
		assert.deepEqual(audit.rules, []);
		assert.deepEqual(audit.results, []);
		assert.deepEqual(audit.toolConfigurationNotifications, []);
		assert.equal(audit.executionSuccessful, true);
		assert.equal(audit.degraded, true);
		assert.ok(audit.degradedReasons.length > 0, "降级结果应附带可读原因");
	});

	await t.test(
		"边界路径：ignoreSuppressed 为真时抑制消息不进入 results",
		() => {
			const results = normalResults();

			const audit = auditSarifExport(results, rulesMeta, {
				ignoreSuppressed: true,
			});
			const parsed = runSarif(results, rulesMeta, { ignoreSuppressed: true });

			assertParity(audit, parsed);

			const totalMessages = results.reduce(
				(count, r) => count + r.messages.length,
				0,
			);
			assert.equal(
				audit.results.length,
				totalMessages,
				"抑制消息不应并入 results",
			);
			assert.ok(
				audit.results.every((result) => result.suppressions === null),
				"ignoreSuppressed 为真时不应写出 suppressions",
			);
			for (const check of audit.checks) {
				assert.equal(
					check.passed,
					true,
					`检查项 ${check.name} 未通过：${check.reasons}`,
				);
			}
		},
	);

	await t.test(
		"无 ruleId 的 error 级消息进入 notifications 且 executionSuccessful 为假",
		() => {
			const results = [
				{
					filePath: "/project/d.js",
					messages: [
						{
							ruleId: null,
							severity: 2,
							fatal: true,
							message: "Parsing error: Unexpected token.",
							line: 1,
							column: 7,
						},
					],
					suppressedMessages: [],
				},
			];

			const audit = auditSarifExport(results, rulesMeta, {});
			const parsed = runSarif(results, rulesMeta);

			assertParity(audit, parsed);

			assert.deepEqual(audit.results, [], "无 ruleId 的消息不得进入 results");
			assert.equal(audit.toolConfigurationNotifications.length, 1);
			assert.equal(audit.toolConfigurationNotifications[0].level, "error");
			assert.equal(audit.executionSuccessful, false);
			assert.equal(parsed.runs[0].invocations[0].executionSuccessful, false);
		},
	);

	await t.test("无 ruleId 且 severity 非 2 的消息不抛异常并降级提示", () => {
		const results = [
			{
				filePath: "/project/e.js",
				messages: [
					{
						ruleId: null,
						severity: 1,
						message: "Non-fatal internal note.",
						line: 1,
						column: 1,
					},
				],
				suppressedMessages: [],
			},
		];

		const audit = auditSarifExport(results, rulesMeta, {});
		const parsed = runSarif(results, rulesMeta);

		assertParity(audit, parsed);

		assert.equal(audit.toolConfigurationNotifications.length, 1);
		assert.equal(audit.toolConfigurationNotifications[0].level, "warning");
		assert.equal(
			audit.executionSuccessful,
			true,
			"非 error 级通知不应使执行失败",
		);
		assert.equal(audit.degraded, true);
		assert.ok(audit.degradedReasons.length > 0, "降级结果应附带可读原因");
	});

	await t.test("rulesMeta 为 undefined 时不抛异常并返回降级结果", () => {
		const results = normalResults();

		const audit = auditSarifExport(results, undefined, {});
		const parsed = runSarif(results, undefined);

		assertParity(audit, parsed);

		assert.equal(audit.degraded, true);
		assert.ok(audit.degradedReasons.length > 0, "降级结果应附带可读原因");
		assert.deepEqual(audit.rules, [], "rulesMeta 缺失时不得生成规则条目");
		assert.ok(
			audit.results.every((result) => result.ruleIndex === null),
			"rulesMeta 缺失时不得分配 ruleIndex",
		);
	});

	await t.test("同一 filePath 的重复结果项与 sarif() 行为一致", () => {
		const results = [
			{
				filePath: "/project/dup.js",
				messages: [
					{
						ruleId: "regexp/no-super-linear-move",
						severity: 2,
						message: "First entry message.",
						line: 1,
						column: 1,
						endLine: 1,
						endColumn: 4,
					},
				],
				suppressedMessages: [],
			},
			{
				filePath: "/project/dup.js",
				messages: [
					{
						ruleId: "regexp/no-super-linear-backtracking",
						severity: 2,
						message: "Second entry message (dropped by sarif).",
						line: 2,
						column: 1,
						endLine: 2,
						endColumn: 4,
					},
				],
				suppressedMessages: [],
			},
		];

		const audit = auditSarifExport(results, rulesMeta, {});
		const parsed = runSarif(results, rulesMeta);

		assertParity(audit, parsed);
		assert.equal(
			audit.artifacts.length,
			1,
			"相同 filePath 只应产生一个 artifact",
		);
		assert.equal(
			audit.results.length,
			1,
			"重复 filePath 的消息与 sarif() 一样被忽略",
		);
	});

	await t.test("审计对象可 JSON 序列化且往返相等", () => {
		const audit = auditSarifExport(normalResults(), rulesMeta, {});
		const roundTripped = JSON.parse(JSON.stringify(audit));
		assert.deepEqual(roundTripped, audit);
	});
});
