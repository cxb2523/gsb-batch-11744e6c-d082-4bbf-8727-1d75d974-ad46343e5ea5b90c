import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditThemeMesh } from '../src/index.js';

// ── Local, dependency-free GLB fixtures ─────────────────────────────────────
// Everything below is built by hand per the glTF 2.0 binary spec:
//   12-byte header (magic "glTF", version 2, total length)
//   chunk 0: JSON  (u32 length, u32 type 0x4E4F534A, padded with spaces)
//   chunk 1: BIN   (u32 length, u32 type 0x004E4942, padded with zero bytes)
// No network, no three / glTF libraries.

// Unit cube: 8 unique corners, 12 triangles (36 indices), one indexed mesh.
const CUBE_POSITIONS = new Float32Array([
	-0.5, -0.5, -0.5, // 0
	0.5, -0.5, -0.5, // 1
	0.5, 0.5, -0.5, // 2
	-0.5, 0.5, -0.5, // 3
	-0.5, -0.5, 0.5, // 4
	0.5, -0.5, 0.5, // 5
	0.5, 0.5, 0.5, // 6
	-0.5, 0.5, 0.5, // 7
]);

const CUBE_INDICES = new Uint16Array([
	0, 1, 2, 0, 2, 3, // back
	4, 6, 5, 4, 7, 6, // front
	0, 4, 5, 0, 5, 1, // bottom
	3, 2, 6, 3, 6, 7, // top
	0, 3, 7, 0, 7, 4, // left
	1, 5, 6, 1, 6, 2, // right
]);

const THEME = {
	name: 'Three Token',
	symbol: 'THREE',
	color: [0.92, 0.45, 0.18],
	imageUrl: null,
	hasImage: false,
};

function pad4(u8) {
	const out = new Uint8Array(Math.ceil(u8.length / 4) * 4);
	out.set(u8);
	return out; // zero-filled padding (BIN) — JSON callers pass 0x20 themselves
}

/**
 * Build a minimal themed-cube GLB. `overrides` can mutate the glTF JSON before
 * serialization or swap the BIN payload; `headerPatch` rewrites header fields
 * after assembly (used for the tampered-length negative test).
 */
function buildCubeGlb(options = {}) {
	const {
		hasImage = false,
		mutateGltf = null,
		headerPatch = null,
		imageBytes = null,
	} = options;

	// BIN layout: positions (96 B) + indices (72 B) + optional image.
	const imagePayload = imageBytes ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const positionOffset = 0;
	const indicesOffset = CUBE_POSITIONS.byteLength; // 96, naturally aligned
	let imageOffset = indicesOffset + CUBE_INDICES.byteLength; // 168

	const binParts = [
		new Uint8Array(CUBE_POSITIONS.buffer, CUBE_POSITIONS.byteOffset, CUBE_POSITIONS.byteLength),
		new Uint8Array(CUBE_INDICES.buffer, CUBE_INDICES.byteOffset, CUBE_INDICES.byteLength),
	];
	if (hasImage) {
		binParts.push(imagePayload);
	}
	const binUnpadded = concatBytes(binParts);
	const bin = pad4(binUnpadded);

	const gltf = {
		asset: {
			version: '2.0',
			generator: 'glb-tools test fixture',
			extras: { name: THEME.name, symbol: THEME.symbol, timestamp: '2026-01-01T00:00:00.000Z' },
		},
		scenes: [{ nodes: [0] }],
		scene: 0,
		nodes: [{ mesh: 0 }],
		meshes: [
			{
				name: 'themed-cube',
				primitives: [
					{
						attributes: { POSITION: 0 },
						indices: 1,
						material: 0,
						mode: 4,
					},
				],
			},
		],
		accessors: [
			{
				bufferView: 0,
				componentType: 5126, // FLOAT
				count: 8,
				type: 'VEC3',
				min: [-0.5, -0.5, -0.5],
				max: [0.5, 0.5, 0.5],
			},
			{
				bufferView: 1,
				componentType: 5123, // UNSIGNED_SHORT
				count: 36,
				type: 'SCALAR',
			},
		],
		bufferViews: [
			{ buffer: 0, byteOffset: positionOffset, byteLength: CUBE_POSITIONS.byteLength, target: 34962 },
			{ buffer: 0, byteOffset: indicesOffset, byteLength: CUBE_INDICES.byteLength, target: 34963 },
		],
		materials: [
			{
				name: 'mint-hash-material',
				pbrMetallicRoughness: {
					baseColorFactor: [...THEME.color, 1.0],
					metallicFactor: 0,
					roughnessFactor: 1,
				},
			},
		],
	};

	if (hasImage) {
		gltf.bufferViews.push({ buffer: 0, byteOffset: imageOffset, byteLength: imagePayload.byteLength });
		gltf.images = [{ bufferView: 2, mimeType: 'image/png' }];
		gltf.textures = [{ source: 0 }];
		gltf.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
	}

	if (typeof mutateGltf === 'function') mutateGltf(gltf);

	const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
	const jsonPadded = pad4(jsonBytes);
	// JSON chunk padding must be spaces (0x20), not zero bytes.
	for (let i = jsonBytes.length; i < jsonPadded.length; i++) jsonPadded[i] = 0x20;

	const totalLength = 12 + 8 + jsonPadded.length + 8 + bin.length;
	const out = new Uint8Array(totalLength);
	const dv = new DataView(out.buffer);
	dv.setUint32(0, 0x46546c67, true); // "glTF"
	dv.setUint32(4, 2, true);
	dv.setUint32(8, totalLength, true);
	dv.setUint32(12, jsonPadded.length, true);
	dv.setUint32(16, 0x4e4f534a, true); // "JSON"
	out.set(jsonPadded, 20);
	const binHeader = 20 + jsonPadded.length;
	dv.setUint32(binHeader, bin.length, true);
	dv.setUint32(binHeader + 4, 0x004e4942, true); // "BIN\0"
	out.set(bin, binHeader + 8);

	if (typeof headerPatch === 'function') headerPatch(dv, out);
	return out;
}

function concatBytes(parts) {
	const total = parts.reduce((n, p) => n + p.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.byteLength;
	}
	return out;
}

function audit(bytes, theme = THEME) {
	return auditThemeMesh({ theme, bytes });
}

function checkNamed(report, name) {
	const check = report.checks.find((c) => c.name === name);
	assert.ok(check, `expected a check named ${name}`);
	return check;
}

// ── Happy path ──────────────────────────────────────────────────────────────

test('audit: minimal conformant cube GLB passes every check with 12 triangles', () => {
	const bytes = buildCubeGlb();
	const report = audit(bytes);

	assert.equal(report.ok, true);
	assert.equal(report.degraded, false);
	assert.equal(report.container.magicIsGltf, true);
	assert.equal(report.container.version, 2);
	assert.equal(report.container.declaredLength, bytes.length);
	assert.equal(report.container.lengthMatches, true);
	assert.equal(report.jsonChunk.parseable, true);
	assert.equal(report.jsonChunk.assetVersion, '2.0');
	assert.equal(report.jsonChunk.generator, 'glb-tools test fixture');

	assert.equal(report.meshes.count, 1);
	assert.equal(report.meshes.primitiveCount, 1);
	assert.equal(report.meshes.primitives[0].mode, 4);
	assert.equal(report.meshes.primitives[0].positionCount, 8);
	assert.equal(report.meshes.primitives[0].indexCount, 36);
	assert.equal(report.meshes.totalTriangles, 12);

	assert.equal(report.extras.name, THEME.name);
	assert.equal(report.extras.symbol, THEME.symbol);
	assert.equal(report.extras.nameMatchesTheme, true);
	assert.equal(report.extras.symbolMatchesTheme, true);

	assert.deepEqual(report.materials.baseColorFactors[0].slice(0, 3), THEME.color);
	assert.equal(report.materials.colorMatchesTheme, true);
	assert.equal(report.baseColorTexture.present, false);

	assert.deepEqual(
		report.checks.map((c) => c.name),
		[
			'container-header',
			'json-chunk',
			'extras-name',
			'extras-symbol',
			'mesh-primitives',
			'triangle-count',
			'base-color-factor',
			'base-color-texture',
		],
	);
	assert.ok(report.checks.every((c) => c.passed && c.reason === null), 'every check passes without a reason string');
});

test('audit: hasImage=true GLB with an embedded PNG passes the texture check and reports mime/byteLength', () => {
	const imageBytes = new Uint8Array(64).fill(7);
	const bytes = buildCubeGlb({ hasImage: true, imageBytes });
	const report = audit(bytes, { ...THEME, hasImage: true, imageUrl: 'https://example.io/token.png' });

	assert.equal(report.ok, true);
	const textureCheck = checkNamed(report, 'base-color-texture');
	assert.equal(textureCheck.passed, true);
	assert.equal(report.baseColorTexture.present, true);
	assert.equal(report.baseColorTexture.mimeType, 'image/png');
	assert.equal(report.baseColorTexture.byteLength, 64);
});

test('audit: baseColorFactor within 1e-3 tolerance passes; beyond it fails with a reason', () => {
	const close = buildCubeGlb({
		mutateGltf: (g) => {
			g.materials[0].pbrMetallicRoughness.baseColorFactor = [0.9205, 0.4505, 0.1805, 1];
		},
	});
	const closeReport = audit(close);
	assert.equal(closeReport.materials.colorMatchesTheme, true);
	assert.equal(checkNamed(closeReport, 'base-color-factor').passed, true);

	const far = buildCubeGlb({
		mutateGltf: (g) => {
			g.materials[0].pbrMetallicRoughness.baseColorFactor = [0.1, 0.2, 0.3, 1];
		},
	});
	const farReport = audit(far);
	assert.equal(farReport.ok, false);
	const factorCheck = checkNamed(farReport, 'base-color-factor');
	assert.equal(factorCheck.passed, false);
	assert.match(factorCheck.reason, /tolerance/);
	assert.ok(farReport.materials.maxComponentDelta > 1e-3);
});

test('audit: null theme.symbol marks extras-symbol as not_comparable rather than failed', () => {
	const bytes = buildCubeGlb();
	const report = audit(bytes, { ...THEME, symbol: null });
	const symbolCheck = checkNamed(report, 'extras-symbol');
	assert.equal(symbolCheck.passed, true);
	assert.equal(symbolCheck.status, 'not_comparable');
	assert.match(symbolCheck.reason, /no metadata/i);
	// A not_comparable check must not fail the overall audit.
	assert.equal(report.ok, true);
});

test('audit: mismatched extras name/symbol fail their checks with readable reasons', () => {
	const bytes = buildCubeGlb({
		mutateGltf: (g) => {
			g.asset.extras.name = 'Rug';
			g.asset.extras.symbol = 'RUGGED';
		},
	});
	const report = audit(bytes);
	assert.equal(checkNamed(report, 'extras-name').passed, false);
	assert.equal(checkNamed(report, 'extras-symbol').passed, false);
	assert.match(checkNamed(report, 'extras-name').reason, /Rug/);
});

// ── Negative path ───────────────────────────────────────────────────────────

test('audit: tampered declared length fails container-header and lengthMatches', () => {
	const bytes = buildCubeGlb({
		headerPatch: (dv) => dv.setUint32(8, dv.getUint32(8, true) + 100, true),
	});
	const report = audit(bytes);
	assert.equal(report.ok, false);
	assert.equal(report.container.lengthMatches, false);
	const headerCheck = checkNamed(report, 'container-header');
	assert.equal(headerCheck.passed, false);
	assert.match(headerCheck.reason, /declares/);
	// Downstream JSON parsing is skipped cleanly and also reported.
	assert.equal(checkNamed(report, 'json-chunk').passed, false);
	assert.equal(checkNamed(report, 'mesh-primitives').passed, false);
});

test('audit: a non-4 primitive mode fails mesh-primitives and gives the offending mode', () => {
	const bytes = buildCubeGlb({
		mutateGltf: (g) => {
			g.meshes[0].primitives[0].mode = 5; // TRIANGLE_STRIP
		},
	});
	const report = audit(bytes);
	assert.equal(report.ok, false);
	const meshCheck = checkNamed(report, 'mesh-primitives');
	assert.equal(meshCheck.passed, false);
	assert.match(meshCheck.reason, /mode 4/);
	assert.deepEqual(meshCheck.observed.modes, [5]);
});

test('audit: bad magic fails the container header and the whole report degrades', () => {
	const bytes = buildCubeGlb();
	bytes[0] = 0x00;
	const report = audit(bytes);
	assert.equal(report.container.magicIsGltf, false);
	assert.equal(checkNamed(report, 'container-header').passed, false);
	assert.equal(report.ok, false);
	assert.equal(report.degraded, true);
});

test('audit: corrupt JSON chunk fails json-chunk without throwing', () => {
	const bytes = buildCubeGlb();
	// Clobber the start of the JSON payload (offset 20) with invalid JSON.
	bytes.set(new TextEncoder().encode('{not json!!'), 20);
	const report = audit(bytes);
	const jsonCheck = checkNamed(report, 'json-chunk');
	assert.equal(jsonCheck.passed, false);
	assert.match(jsonCheck.reason, /not valid JSON/);
	assert.equal(report.jsonChunk.parseable, false);
	assert.equal(report.ok, false);
});

test('audit: asset.version other than 2.0 fails the json-chunk check', () => {
	const bytes = buildCubeGlb({
		mutateGltf: (g) => {
			g.asset.version = '1.0';
		},
	});
	const report = audit(bytes);
	const jsonCheck = checkNamed(report, 'json-chunk');
	assert.equal(jsonCheck.passed, false);
	assert.match(jsonCheck.reason, /2\.0/);
});

test('audit: hasImage=true but GLB has no baseColor texture fails base-color-texture', () => {
	const bytes = buildCubeGlb({ hasImage: false });
	const report = audit(bytes, { ...THEME, hasImage: true });
	const textureCheck = checkNamed(report, 'base-color-texture');
	assert.equal(textureCheck.passed, false);
	assert.equal(textureCheck.observed.present, false);
	assert.match(textureCheck.reason, /hasImage is true/);
	assert.equal(report.ok, false);
});

test('audit: hasImage=false but GLB embeds a texture fails base-color-texture', () => {
	const bytes = buildCubeGlb({ hasImage: true });
	const report = audit(bytes, { ...THEME, hasImage: false });
	const textureCheck = checkNamed(report, 'base-color-texture');
	assert.equal(textureCheck.passed, false);
	assert.match(textureCheck.reason, /hasImage is false/);
});

test('audit: a zero-byte image fails the texture check instead of silently passing', () => {
	const bytes = buildCubeGlb({ hasImage: true, imageBytes: new Uint8Array(0) });
	const report = audit(bytes, { ...THEME, hasImage: true });
	const textureCheck = checkNamed(report, 'base-color-texture');
	assert.equal(textureCheck.passed, false);
	assert.match(textureCheck.reason, /byteLength/);
});

// ── Boundary / robustness path ──────────────────────────────────────────────

test('audit: empty bytes never throw and mark the header check failed', () => {
	const report = audit(new Uint8Array(0));
	assert.equal(report.ok, false);
	assert.equal(report.degraded, true);
	assert.equal(report.byteLength, 0);
	const headerCheck = checkNamed(report, 'container-header');
	assert.equal(headerCheck.passed, false);
	assert.match(headerCheck.reason, /12 bytes/);
	// All eight checks still exist, in canonical order, and none silently passed.
	assert.equal(report.checks.length, 8);
	assert.deepEqual(
		report.checks.map((c) => c.name),
		[
			'container-header',
			'json-chunk',
			'extras-name',
			'extras-symbol',
			'mesh-primitives',
			'triangle-count',
			'base-color-factor',
			'base-color-texture',
		],
	);
	assert.ok(report.checks.filter((c) => c.passed && c.status === 'passed').length === 0);
});

test('audit: bytes truncated to 8 never throw and report a short-container reason', () => {
	const full = buildCubeGlb();
	const report = audit(full.subarray(0, 8));
	assert.equal(report.byteLength, 8);
	const headerCheck = checkNamed(report, 'container-header');
	assert.equal(headerCheck.passed, false);
	assert.match(headerCheck.reason, /12 bytes/);
	assert.equal(report.ok, false);
});

test('audit: missing/non-Uint8Array bytes and missing input never throw', () => {
	const noBytes = auditThemeMesh({ theme: THEME });
	assert.equal(noBytes.ok, false);
	assert.equal(noBytes.byteLength, 0);
	assert.ok(noBytes.errors.length > 0);

	const empty = auditThemeMesh();
	assert.equal(empty.ok, false);
	assert.equal(empty.degraded, true);
	assert.equal(empty.checks.length, 8);

	const wrongType = auditThemeMesh({ theme: THEME, bytes: [1, 2, 3] });
	assert.equal(wrongType.ok, false);
	assert.match(wrongType.errors[0], /Uint8Array/);
});

// ── Purity / serialization guarantees ────────────────────────────────────────

test('audit: never mutates the input bytes', () => {
	const bytes = buildCubeGlb();
	const before = Uint8Array.from(bytes);
	audit(bytes);
	assert.deepEqual(Array.from(bytes), Array.from(before));
});

test('audit: report is fully JSON-serializable with no TypedArrays or class instances', () => {
	const bytes = buildCubeGlb({ hasImage: true });
	const report = audit(bytes, { ...THEME, hasImage: true });

	const roundTrip = JSON.parse(JSON.stringify(report));
	assert.deepEqual(roundTrip, report);

	// Walk every value: only JSON primitives, plain objects, and arrays.
	function walk(value, path) {
		if (value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return;
		if (Array.isArray(value)) {
			value.forEach((v, i) => walk(v, `${path}[${i}]`));
			return;
		}
		if (typeof value === 'object') {
			assert.equal(Object.getPrototypeOf(value), Object.prototype, `${path} must be a plain object`);
			for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
			return;
		}
		assert.fail(`${path} holds a non-JSON value of type ${typeof value}`);
	}
	walk(report, 'report');
});
