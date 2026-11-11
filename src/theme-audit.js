// Theme mesh audit — a dependency-free, read-only verifier for the GLB returned
// by theme() (/api/x402/mint-to-mesh). The SDK only forwards the synthesized
// bytes; this module lets a caller check locally that the payload really is a
// conformant glTF 2.0 cube: valid GLB container, TRIANGLES primitives, a sane
// triangle count, the mint-hashed baseColorFactor, an embedded token image when
// theme.hasImage says there is one, and name/symbol metadata in asset.extras.
//
// Constraints (by design):
//   - pure function: no network, no disk, no three / glTF parser dependency;
//   - never mutates the passed Uint8Array (only reads through a DataView);
//   - output is plain JSON-serializable data (no TypedArrays, functions, class
//     instances);
//   - never throws on malformed input — degrades to a structured report whose
//     affected checks fail with human-readable reasons instead.

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const COLOR_TOLERANCE = 1e-3;
const MIN_TRIANGLES = 12;
const MAX_TRIANGLES = 100000;
const DEFAULT_MODE = 4; // glTF: missing primitive.mode defaults to TRIANGLES (4)

/**
 * Audit the themed GLB carried by a ThemedMesh (or any `{ theme, bytes }`
 * equivalent). Always returns a structured report; never throws.
 *
 * @param {{ theme?: object, bytes?: Uint8Array }} input
 * @returns {import('./index.d.ts').ThemeAuditReport}
 */
export function auditThemeMesh(input = {}) {
	const theme = (input && typeof input.theme === 'object' && input.theme) || {};
	const startedAt = new Date().toISOString();

	/** @type {import('./index.d.ts').ThemeAuditReport} */
	const report = {
		ok: false,
		degraded: true,
		byteLength: 0,
		container: {
			magicIsGltf: false,
			magic: null,
			version: null,
			declaredLength: null,
			actualLength: 0,
			lengthMatches: false,
		},
		jsonChunk: {
			present: false,
			length: null,
			parseable: false,
			assetVersion: null,
			generator: null,
			error: null,
		},
		extras: {
			observed: null,
			name: null,
			symbol: null,
			nameMatchesTheme: false,
			symbolMatchesTheme: false,
		},
		meshes: {
			count: 0,
			primitiveCount: 0,
			primitives: [],
			totalPositions: 0,
			totalIndices: 0,
			totalTriangles: 0,
		},
		materials: {
			count: 0,
			baseColorFactors: [],
			colorMatchesTheme: false,
			maxComponentDelta: null,
		},
		baseColorTexture: {
			present: false,
			textureCount: 0,
			mimeType: null,
			byteLength: null,
		},
		checks: [],
		errors: [],
		auditedAt: startedAt,
	};

	try {
		let bytes = input && input.bytes;
		if (!(bytes instanceof Uint8Array)) {
			report.errors.push('input.bytes is missing or not a Uint8Array; auditing an empty byte stream.');
			bytes = new Uint8Array(0);
		}
		// Snapshot length only — the buffer itself is never copied or written.
		report.byteLength = bytes.length;
		report.container.actualLength = bytes.length;

		// ── Stage 1: 12-byte GLB container header ───────────────────────────
		let headerOk = false;
		let view = null;
		if (bytes.length < 12) {
			report.container.magic = readMagicString(bytes);
			failCheck(
				report,
				'container-header',
				{ actualLength: bytes.length, minimumLength: 12 },
				`GLB container header needs 12 bytes but only ${bytes.length} were provided.`,
			);
		} else {
			view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			const magic = view.getUint32(0, true);
			const version = view.getUint32(4, true);
			const declaredLength = view.getUint32(8, true);
			report.container.magic = readMagicString(bytes);
			report.container.magicIsGltf = magic === GLB_MAGIC;
			report.container.version = version;
			report.container.declaredLength = declaredLength;
			report.container.lengthMatches = declaredLength === bytes.length;
			headerOk = report.container.magicIsGltf && report.container.lengthMatches;

			if (!report.container.magicIsGltf) {
				failCheck(
					report,
					'container-header',
					{ magic: report.container.magic, expectedMagic: 'glTF', version, declaredLength, actualLength: bytes.length },
					`Container magic is ${JSON.stringify(report.container.magic)}, expected "glTF".`,
				);
			} else if (!report.container.lengthMatches) {
				failCheck(
					report,
					'container-header',
					{ magic: 'glTF', version, declaredLength, actualLength: bytes.length },
					`Header declares ${declaredLength} bytes but the Uint8Array holds ${bytes.length} bytes.`,
				);
			} else {
				passCheck(report, 'container-header', { magic: 'glTF', version, declaredLength, actualLength: bytes.length });
			}
		}

		// ── Stage 2: JSON chunk (must be the first chunk) ───────────────────
		let gltf = null;
		if (!headerOk || !view) {
			failCheck(
				report,
				'json-chunk',
				{ present: false },
				'Skipped JSON chunk parsing because the GLB container header is invalid.',
			);
		} else {
			const chunk = readFirstChunk(view, bytes.length);
			report.jsonChunk.present = chunk.present;
			report.jsonChunk.length = chunk.length;
			if (!chunk.present) {
				report.jsonChunk.error = chunk.reason;
				failCheck(report, 'json-chunk', { present: false }, chunk.reason);
			} else {
				let parsed;
				try {
					parsed = JSON.parse(new TextDecoder('utf-8').decode(chunk.data));
				} catch (err) {
					report.jsonChunk.error = `JSON chunk is not valid JSON: ${err?.message || err}`;
					failCheck(report, 'json-chunk', { present: true, length: chunk.length }, report.jsonChunk.error);
				}
				if (parsed !== undefined) {
					if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
						report.jsonChunk.error = 'JSON chunk decoded but its root value is not a glTF object.';
						failCheck(report, 'json-chunk', { present: true, length: chunk.length, rootType: Array.isArray(parsed) ? 'array' : typeof parsed }, report.jsonChunk.error);
					} else {
						gltf = parsed;
						report.jsonChunk.parseable = true;
						const asset = gltf.asset && typeof gltf.asset === 'object' ? gltf.asset : {};
						report.jsonChunk.assetVersion = typeof asset.version === 'string' ? asset.version : null;
						report.jsonChunk.generator = typeof asset.generator === 'string' ? asset.generator : null;
						if (report.jsonChunk.assetVersion === '2.0') {
							passCheck(report, 'json-chunk', { assetVersion: '2.0', generator: report.jsonChunk.generator, chunkLength: chunk.length });
						} else {
							failCheck(
								report,
								'json-chunk',
								{ assetVersion: report.jsonChunk.assetVersion, generator: report.jsonChunk.generator },
								`asset.version is ${JSON.stringify(report.jsonChunk.assetVersion)}, expected the glTF 2.0 string "2.0".`,
							);
						}
					}
				}
			}
		}

		// Everything below needs a parsed glTF document. Emit the remaining
		// checks in their canonical order so the checklist is stable regardless
		// of where parsing aborted.
		if (!gltf) {
			const reason = 'Cannot evaluate without a parseable glTF JSON chunk.';
			for (const name of [
				'extras-name',
				'extras-symbol',
				'mesh-primitives',
				'triangle-count',
				'base-color-factor',
				'base-color-texture',
			]) {
				failCheck(report, name, { available: false }, reason);
			}
		} else {
			auditExtras(gltf, theme, report);
			auditMeshes(gltf, report);
			auditMaterials(gltf, theme, report);
			auditTexture(gltf, theme, report);
		}

		// Overall verdict: every check either passed or was not comparable.
		report.ok = report.checks.every((c) => c.passed || c.status === 'not_comparable');
		report.degraded = Boolean(report.errors.length) || report.checks.some((c) => !c.passed && c.status !== 'not_comparable');
	} catch (err) {
		// Backstop: malformed input must never escape as an uncaught exception.
		report.ok = false;
		report.degraded = true;
		const reason = `Unexpected audit failure: ${err?.message || err}`;
		report.errors.push(reason);
		for (const check of report.checks) {
			if (check.passed || check.status === 'not_comparable') continue;
			if (!check.reason) check.reason = reason;
		}
	}

	return report;
}

// ── Check-list helpers ──────────────────────────────────────────────────────

function passCheck(report, name, observed) {
	report.checks.push({ name, passed: true, status: 'passed', observed, reason: null });
}

function failCheck(report, name, observed, reason) {
	report.checks.push({ name, passed: false, status: 'failed', observed, reason });
}

function skipCheck(report, name, observed, reason) {
	report.checks.push({ name, passed: true, status: 'not_comparable', observed, reason });
}

// ── Container / chunk parsing ───────────────────────────────────────────────

function readMagicString(bytes) {
	const n = Math.min(4, bytes.length);
	let s = '';
	for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
	return n === 4 ? s : `${s} (truncated)`;
}

// Locate and slice the first GLB chunk. Returns plain data (the slice is a
// separate Uint8Array, so the caller's buffer is still never mutated).
function readFirstChunk(view, totalLength) {
	if (totalLength < 20) {
		return { present: false, length: null, reason: 'No room for a chunk header after the 12-byte GLB header (need 8 more bytes).' };
	}
	const chunkLength = view.getUint32(12, true);
	const chunkType = view.getUint32(16, true);
	const dataStart = 20;
	const dataEnd = dataStart + chunkLength;
	if (dataEnd > totalLength) {
		return {
			present: false,
			length: chunkLength,
			reason: `First chunk declares ${chunkLength} bytes but only ${totalLength - dataStart} bytes follow its header.`,
		};
	}
	if (chunkType !== CHUNK_JSON) {
		return {
			present: false,
			length: chunkLength,
			reason: `First chunk type is 0x${chunkType.toString(16).padStart(8, '0')}, expected the JSON chunk type 0x${CHUNK_JSON.toString(16)}.`,
		};
	}
	return { present: true, length: chunkLength, data: new Uint8Array(view.buffer, view.byteOffset + dataStart, chunkLength) };
}

// ── glTF document audits ────────────────────────────────────────────────────

function auditExtras(gltf, theme, report) {
	const extras = gltf.asset && typeof gltf.asset.extras === 'object' && gltf.asset.extras !== null
		? gltf.asset.extras
		: null;
	report.extras.observed = extras; // plain JSON object → serializable
	report.extras.name = extras && typeof extras.name === 'string' ? extras.name : null;
	report.extras.symbol = extras && typeof extras.symbol === 'string' ? extras.symbol : null;

	const themeName = typeof theme.name === 'string' ? theme.name : null;
	const themeSymbol = typeof theme.symbol === 'string' ? theme.symbol : null;

	if (themeName === null) {
		skipCheck(report, 'extras-name', { extrasName: report.extras.name, themeName: null }, 'theme.name is null — no metadata to compare against.');
	} else {
		report.extras.nameMatchesTheme = report.extras.name === themeName;
		if (report.extras.nameMatchesTheme) {
			passCheck(report, 'extras-name', { extrasName: report.extras.name, themeName });
		} else {
			failCheck(
				report,
				'extras-name',
				{ extrasName: report.extras.name, themeName },
				`asset.extras.name is ${JSON.stringify(report.extras.name)}, expected ${JSON.stringify(themeName)} from the theme.`,
			);
		}
	}

	// The required special case: a null theme symbol is "nothing to compare",
	// not a failure.
	if (themeSymbol === null) {
		skipCheck(report, 'extras-symbol', { extrasSymbol: report.extras.symbol, themeSymbol: null }, 'theme.symbol is null — no metadata to compare against.');
	} else {
		report.extras.symbolMatchesTheme = report.extras.symbol === themeSymbol;
		if (report.extras.symbolMatchesTheme) {
			passCheck(report, 'extras-symbol', { extrasSymbol: report.extras.symbol, themeSymbol });
		} else {
			failCheck(
				report,
				'extras-symbol',
				{ extrasSymbol: report.extras.symbol, themeSymbol },
				`asset.extras.symbol is ${JSON.stringify(report.extras.symbol)}, expected ${JSON.stringify(themeSymbol)} from the theme.`,
			);
		}
	}
}

function auditMeshes(gltf, report) {
	const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];
	const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
	report.meshes.count = meshes.length;

	let primitiveCount = 0;
	let totalPositions = 0;
	let totalIndices = 0;
	let totalTriangles = 0;
	let allModesTriangles = true;

	meshes.forEach((mesh, meshIndex) => {
		const primitives = mesh && Array.isArray(mesh.primitives) ? mesh.primitives : [];
		for (const primitive of primitives) {
			primitiveCount += 1;
			const mode = Number.isInteger(primitive?.mode) ? primitive.mode : DEFAULT_MODE;
			if (mode !== 4) allModesTriangles = false;

			// glTF attribute semantics are uppercase (POSITION); tolerate the
			// lowercase spelling too for hand-rolled documents.
			const positionIndex = primitive?.attributes?.POSITION ?? primitive?.attributes?.position;
			const positionAccessor = accessors[positionIndex];
			const positionCount = positionAccessor && Number.isFinite(positionAccessor.count)
				? positionAccessor.count
				: null;
			if (positionCount !== null) totalPositions += positionCount;

			let indexCount = null;
			let triangles = null;
			if (Number.isInteger(primitive?.indices)) {
				const indexAccessor = accessors[primitive.indices];
				if (indexAccessor && Number.isFinite(indexAccessor.count)) {
					indexCount = indexAccessor.count;
					totalIndices += indexCount;
				}
			}
			// Triangle derivation only makes sense for TRIANGLES (mode 4). A
			// non-4 mode is already flagged by the mesh-primitives check.
			if (mode === 4) {
				triangles = indexCount !== null ? Math.floor(indexCount / 3) : positionCount;
				if (triangles !== null) totalTriangles += triangles;
			}

			report.meshes.primitives.push({ meshIndex, mode, positionCount, indexCount, triangles });
		}
	});

	report.meshes.primitiveCount = primitiveCount;
	report.meshes.totalPositions = totalPositions;
	report.meshes.totalIndices = totalIndices;
	report.meshes.totalTriangles = totalTriangles;

	if (meshes.length >= 1 && primitiveCount >= 1 && allModesTriangles) {
		passCheck(report, 'mesh-primitives', {
			meshCount: meshes.length,
			primitiveCount,
			modes: report.meshes.primitives.map((p) => p.mode),
		});
	} else if (meshes.length < 1 || primitiveCount < 1) {
		failCheck(
			report,
			'mesh-primitives',
			{ meshCount: meshes.length, primitiveCount },
			`Expected at least one mesh with one primitive, found ${meshes.length} meshes and ${primitiveCount} primitives.`,
		);
	} else {
		const bad = report.meshes.primitives
			.filter((p) => p.mode !== 4)
			.map((p) => `primitive mesh#${p.meshIndex} mode=${p.mode}`);
		failCheck(
			report,
			'mesh-primitives',
			{ meshCount: meshes.length, primitiveCount, modes: report.meshes.primitives.map((p) => p.mode) },
			`Every primitive must use mode 4 (TRIANGLES); offending primitives: ${bad.join(', ')}.`,
		);
	}

	if (totalTriangles >= MIN_TRIANGLES && totalTriangles <= MAX_TRIANGLES) {
		passCheck(report, 'triangle-count', {
			triangles: totalTriangles,
			range: { min: MIN_TRIANGLES, max: MAX_TRIANGLES },
		});
	} else {
		failCheck(
			report,
			'triangle-count',
			{ triangles: totalTriangles, range: { min: MIN_TRIANGLES, max: MAX_TRIANGLES } },
			`Triangle count ${totalTriangles} is outside the expected range ${MIN_TRIANGLES}–${MAX_TRIANGLES}.`,
		);
	}
}

function auditMaterials(gltf, theme, report) {
	const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
	report.materials.count = materials.length;
	report.materials.baseColorFactors = materials.map((m) =>
		Array.isArray(m?.pbrMetallicRoughness?.baseColorFactor)
			? m.pbrMetallicRoughness.baseColorFactor.map((n) => (Number.isFinite(n) ? n : null))
			: null,
	);

	const themeColor = Array.isArray(theme.color) && theme.color.length >= 3 && theme.color.slice(0, 3).every(Number.isFinite)
		? theme.color.slice(0, 3)
		: null;

	if (themeColor === null) {
		skipCheck(report, 'base-color-factor', { themeColor: null, baseColorFactors: report.materials.baseColorFactors }, 'theme.color is null — no baseColorFactor to compare against.');
		return;
	}

	let maxDelta = 0;
	let allMatch = materials.length > 0;
	for (const factor of report.materials.baseColorFactors) {
		if (!factor || factor.length < 3) {
			allMatch = false;
			maxDelta = null;
			break;
		}
		for (let i = 0; i < 3; i++) {
			if (factor[i] === null) {
				allMatch = false;
				maxDelta = null;
				break;
			}
			maxDelta = Math.max(maxDelta, Math.abs(factor[i] - themeColor[i]));
		}
		if (maxDelta === null) break;
	}
	report.materials.maxComponentDelta = maxDelta;
	report.materials.colorMatchesTheme = allMatch && maxDelta !== null && maxDelta <= COLOR_TOLERANCE;

	if (report.materials.colorMatchesTheme) {
		passCheck(report, 'base-color-factor', {
			themeColor,
			baseColorFactors: report.materials.baseColorFactors,
			tolerance: COLOR_TOLERANCE,
			maxComponentDelta: maxDelta,
		});
	} else if (materials.length === 0) {
		failCheck(report, 'base-color-factor', { themeColor, baseColorFactors: [] }, 'theme.color is set but the GLB defines no materials carrying a baseColorFactor.');
	} else if (maxDelta === null) {
		failCheck(report, 'base-color-factor', { themeColor, baseColorFactors: report.materials.baseColorFactors, tolerance: COLOR_TOLERANCE }, 'At least one material lacks a numeric RGB baseColorFactor to compare against theme.color.');
	} else {
		failCheck(
			report,
			'base-color-factor',
			{ themeColor, baseColorFactors: report.materials.baseColorFactors, tolerance: COLOR_TOLERANCE, maxComponentDelta: maxDelta },
			`baseColorFactor differs from theme.color by up to ${maxDelta.toExponential(2)}, beyond the ${COLOR_TOLERANCE} per-component tolerance.`,
		);
	}
}

function auditTexture(gltf, theme, report) {
	const textures = Array.isArray(gltf.textures) ? gltf.textures : [];
	const images = Array.isArray(gltf.images) ? gltf.images : [];
	const materials = Array.isArray(gltf.materials) ? gltf.materials : [];
	report.baseColorTexture.textureCount = textures.length;

	// A "present" baseColor texture means some material actually references one.
	let referenced = null;
	for (const material of materials) {
		const info = material?.pbrMetallicRoughness?.baseColorTexture;
		if (info && Number.isInteger(info.index)) {
			referenced = info.index;
			break;
		}
	}

	let image = null;
	if (referenced !== null && textures[referenced] && Number.isInteger(textures[referenced].source)) {
		image = images[textures[referenced].source] || null;
	}
	const mimeType = image && typeof image.mimeType === 'string' ? image.mimeType : null;
	const byteLength = image ? byteLengthOfBufferView(gltf, image.bufferView) : null;
	report.baseColorTexture.present = referenced !== null && image !== null;
	report.baseColorTexture.mimeType = mimeType;
	report.baseColorTexture.byteLength = byteLength;

	const wantsImage = Boolean(theme.hasImage);
	if (wantsImage) {
		if (report.baseColorTexture.present && byteLength !== null && byteLength > 0) {
			passCheck(report, 'base-color-texture', {
				themeHasImage: true,
				present: true,
				mimeType,
				byteLength,
			});
		} else if (!report.baseColorTexture.present) {
			failCheck(
				report,
				'base-color-texture',
				{ themeHasImage: true, present: false, textureCount: textures.length },
				'theme.hasImage is true but no material references a baseColor texture with a resolvable image.',
			);
		} else {
			failCheck(
				report,
				'base-color-texture',
				{ themeHasImage: true, present: true, mimeType, byteLength },
				`baseColor texture image has no non-zero byteLength (observed ${byteLength}).`,
			);
		}
	} else {
		// hasImage false: the GLB must not claim a baseColor texture.
		if (!report.baseColorTexture.present) {
			passCheck(report, 'base-color-texture', { themeHasImage: false, present: false, textureCount: textures.length });
		} else {
			failCheck(
				report,
				'base-color-texture',
				{ themeHasImage: false, present: true, mimeType, byteLength },
				'theme.hasImage is false but the GLB embeds a baseColor texture anyway.',
			);
		}
	}
}

function byteLengthOfBufferView(gltf, bufferViewIndex) {
	if (!Number.isInteger(bufferViewIndex)) return null;
	const bufferView = gltf.bufferViews?.[bufferViewIndex];
	if (!bufferView || !Number.isFinite(bufferView.byteLength)) return null;
	return bufferView.byteLength;
}
