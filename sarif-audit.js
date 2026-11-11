// SPDX-License-Identifier: Apache-2.0

/**
 * @fileoverview SARIF 导出审计（纯函数）。
 *
 * 在不读写磁盘、不访问网络的前提下，复现 sarif.js 中 sarif() 的
 * SARIF v2.1 导出逻辑，输出一份结构化的纯数据审计对象，并附带一组
 * 有序检查项，用于核对导出结果的一致性不变量。
 *
 * 对同一份输入，本模块给出的 artifacts 顺序与 index、driver.rules 的
 * ruleId 顺序与 index、每条 result 的 level / ruleIndex / region、以及
 * executionSuccessful，与直接调用 sarif() 后 JSON.parse 得到的对应
 * 字段逐项相等。
 */

/**
 * 与 sarif.js 中 getResultLevel 保持一致。
 * @param {Object} message 消息对象
 * @returns {string} 严重级别（'error' 或 'warning'）
 */
function getResultLevel(message) {
	if (message && (message.fatal || message.severity === 2)) {
		return "error";
	}
	return "warning";
}

/**
 * 与 sarif.js 中抑制信息 kind 的映射保持一致。
 * @param {string} kind ESLint 抑制信息的 kind
 * @returns {string} SARIF 抑制信息的 kind
 */
function mapSuppressionKind(kind) {
	return kind === "directive" ? "inSource" : "external";
}

/**
 * 对一份 ESLint 结果数组执行 SARIF 导出审计。
 *
 * 本函数是纯函数：不读写磁盘、不访问网络、不修改传入的 results 与
 * rulesMeta，返回值只包含可 JSON 序列化的纯数据。
 *
 * @param {Array} results ESLint 结果数组（每项含 filePath、messages、
 *   可选的 suppressedMessages）
 * @param {Object} [rulesMeta] 规则元数据映射（ruleId -> meta）
 * @param {Object} [options] 开关选项
 * @param {boolean} [options.embedFileContents=false] 对应
 *   SARIF_ESLINT_EMBED；审计不读盘，仅记录是否请求嵌入
 * @param {boolean} [options.ignoreSuppressed=false] 对应
 *   SARIF_ESLINT_IGNORE_SUPPRESSED
 * @returns {Object} 结构化审计结果（纯数据，可 JSON 序列化）
 */
export function auditSarifExport(results, rulesMeta, options = {}) {
	const embedFileContents = options.embedFileContents === true;
	const ignoreSuppressed = options.ignoreSuppressed === true;

	const degradedReasons = [];
	if (!Array.isArray(results)) {
		degradedReasons.push("输入的 results 不是数组，已按空数组处理");
	} else if (results.length === 0) {
		degradedReasons.push("输入的 ESLint 结果数组为空，没有任何可审计的消息");
	}
	const hasRulesMeta =
		rulesMeta !== null && typeof rulesMeta === "object" && !Array.isArray(rulesMeta);
	if (!hasRulesMeta) {
		degradedReasons.push(
			"rulesMeta 未提供或不是对象，所有规则都不会分配 ruleIndex，也不会生成规则条目",
		);
	}
	const artifacts = [];
	const artifactIndexByPath = new Map();
	const rules = [];
	const ruleIndexById = new Map();
	const auditedResults = [];
	const toolConfigurationNotifications = [];
	let executionSuccessful = true;

	// 各检查项的失败原因收集器，键即检查项名称，顺序即输出顺序。
	const checkFailures = new Map([
		["rule-index-points-to-matching-rule", []],
		["artifact-index-matches-artifacts-array", []],
		["region-only-when-line-or-column-positive", []],
		["snippet-only-when-source-present", []],
		["execution-successful-matches-notifications", []],
	]);
	const fail = (name, reason) => checkFailures.get(name).push(reason);

	const safeResults = Array.isArray(results) ? results : [];
	for (const result of safeResults) {
		const filePath = result && typeof result.filePath === "string" ? result.filePath : null;
		if (filePath === null) {
			degradedReasons.push("存在缺少有效 filePath 的结果项，已跳过");
			continue;
		}

		// 与 sarif() 一致：同一 filePath 只在首次出现时建立 artifact 并处理
		// 其消息，后续相同 filePath 的结果项被整体忽略。
		if (artifactIndexByPath.has(filePath)) {
			continue;
		}

		const artifactIndex = artifacts.length;
		artifactIndexByPath.set(filePath, artifactIndex);
		artifacts.push({
			filePath,
			index: artifactIndex,
			// 审计不读盘，仅记录是否请求了嵌入文件内容。
			embedFileContents,
		});

		const suppressedMessages = Array.isArray(result.suppressedMessages)
			? result.suppressedMessages
			: [];
		const containsSuppressedMessages = suppressedMessages.length > 0;
		const baseMessages = Array.isArray(result.messages) ? result.messages : [];
		const messages =
			containsSuppressedMessages && !ignoreSuppressed
				? [...baseMessages, ...suppressedMessages]
				: baseMessages;

		for (const message of messages) {
			if (message === null || typeof message !== "object") {
				degradedReasons.push(`文件 ${filePath} 中存在非对象消息，已跳过`);
				continue;
			}

			const level = getResultLevel(message);
			const ruleId = typeof message.ruleId === "string" ? message.ruleId : null;

			// region 只在 line 或 column 大于 0 时出现，字段各自只在大于 0
			// 时出现，与 sarif() 完全一致。
			let region = null;
			if (message.line > 0 || message.column > 0) {
				region = {};
				if (message.line > 0) {
					region.startLine = message.line;
				}
				if (message.column > 0) {
					region.startColumn = message.column;
				}
				if (message.endLine > 0) {
					region.endLine = message.endLine;
				}
				if (message.endColumn > 0) {
					region.endColumn = message.endColumn;
				}
			}

			// snippet 只在消息带 source 时出现。
			const hasSnippet = Boolean(message.source);
			if (hasSnippet && region === null) {
				region = {};
			}

			if (region === null && (message.line > 0 || message.column > 0)) {
				fail(
					"region-only-when-line-or-column-positive",
					`文件 ${filePath} 的消息（line=${message.line}, column=${message.column}）应带有 region`,
				);
			}
			if (region !== null && !(message.line > 0) && !(message.column > 0) && !hasSnippet) {
				fail(
					"region-only-when-line-or-column-positive",
					`文件 ${filePath} 的消息（line=${message.line}, column=${message.column}）不应带有 region`,
				);
			}
			if (hasSnippet !== Boolean(message.source)) {
				fail(
					"snippet-only-when-source-present",
					`文件 ${filePath} 的消息 snippet 与 source 不一致`,
				);
			}

			if (ruleId === null) {
				// 无 ruleId 的消息是 ESLint 内部错误，进入
				// toolConfigurationNotifications 而不是 results。
				toolConfigurationNotifications.push({
					level,
					descriptorId: "ESL0999",
					message: typeof message.message === "string" ? message.message : null,
					artifactIndex,
				});
				if (level !== "error" && message.severity !== 2 && !message.fatal) {
					degradedReasons.push(
						`文件 ${filePath} 中存在缺 ruleId 且非 error 级的消息，已按 toolConfigurationNotification 处理`,
					);
				}
				if (level === "error") {
					executionSuccessful = false;
				}
				continue;
			}

			// 有 ruleId 的消息进入 results。
			let ruleIndex = null;
			if (hasRulesMeta) {
				// 与 sarif() 一致：直接以 rulesMeta[ruleId] 取元数据；
				// meta 为空时不分配 ruleIndex，也不生成规则条目。
				const meta = rulesMeta[ruleId];
				if (meta) {
					if (!ruleIndexById.has(ruleId)) {
						const index = rules.length;
						ruleIndexById.set(ruleId, index);
						const docs = meta.docs;
						rules.push({
							ruleId,
							index,
							helpUri: docs ? docs.url : "Please see details in message",
							category: docs ? docs.category : "No category provided",
							hasShortDescription: Boolean(docs && docs.description),
						});
					}
					ruleIndex = ruleIndexById.get(ruleId);
				}
			}

			// 抑制信息只在“存在抑制消息且未忽略”时写出，kind 映射与
			// sarif() 一致：directive -> inSource，其余 -> external。
			let suppressions = null;
			if (containsSuppressedMessages && !ignoreSuppressed) {
				suppressions = Array.isArray(message.suppressions)
					? message.suppressions.map((suppression) => ({
							kind: mapSuppressionKind(suppression && suppression.kind),
							justification:
								suppression && typeof suppression.justification === "string"
									? suppression.justification
									: null,
						}))
					: [];
			}

			auditedResults.push({
				level,
				ruleId,
				ruleIndex,
				artifactIndex,
				region,
				hasSnippet,
				suppressions,
			});
		}
	}

	// 检查项 1：每个 result 的 ruleIndex 必须指向 driver.rules 中同
	// ruleId 的条目；有 ruleId 却无 ruleIndex 只允许发生在该 ruleId 不
	// 存在于 rulesMeta（或 meta 为空）的降级情形。
	for (const audited of auditedResults) {
		if (audited.ruleIndex !== null) {
			const rule = rules[audited.ruleIndex];
			if (!rule || rule.ruleId !== audited.ruleId || rule.index !== audited.ruleIndex) {
				fail(
					"rule-index-points-to-matching-rule",
					`result（ruleId=${audited.ruleId}）的 ruleIndex=${audited.ruleIndex} 未指向 driver.rules 中同 ruleId 的条目`,
				);
			}
		} else if (hasRulesMeta && rulesMeta[audited.ruleId]) {
			fail(
				"rule-index-points-to-matching-rule",
				`result（ruleId=${audited.ruleId}）的规则存在于 rulesMeta 却未分配 ruleIndex`,
			);
		}
	}

	// 检查项 2：result 与 notification 的 artifact index 必须与
	// artifacts 数组下标一致。
	for (const audited of [...auditedResults, ...toolConfigurationNotifications]) {
		const artifact = artifacts[audited.artifactIndex];
		if (!artifact || artifact.index !== audited.artifactIndex) {
			fail(
				"artifact-index-matches-artifacts-array",
				`artifact index=${audited.artifactIndex} 与 artifacts 数组下标不一致`,
			);
		}
	}

	// 检查项 5：executionSuccessful 为假当且仅当存在 error 级的
	// toolConfigurationNotification。
	const hasErrorNotification = toolConfigurationNotifications.some(
		(notification) => notification.level === "error",
	);
	if (executionSuccessful === hasErrorNotification) {
		fail(
			"execution-successful-matches-notifications",
			"executionSuccessful 与 error 级 toolConfigurationNotification 的存在性不一致",
		);
	}

	const checks = [...checkFailures.entries()].map(([name, reasons]) => ({
		name,
		passed: reasons.length === 0,
		reasons,
	}));

	return {
		artifacts,
		rules,
		results: auditedResults,
		toolConfigurationNotifications,
		executionSuccessful,
		degraded: degradedReasons.length > 0,
		degradedReasons,
		checks,
	};
}

export default auditSarifExport;
