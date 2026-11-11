'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Item, Packer } = require('../packer.js');
const { PackingAudit } = require('../packing-audit.js');

const BIN = { w: 20, h: 20, d: 20 };

// 构造 packed 纯数据记录（审计模块不得依赖 Item 实例，也不得修改这些对象）。
function record(id, x, y, z, w, h, d, rotationType = 0) {
    return { id, x, y, z, rw: w, rh: h, rd: d, w, h, d, rotationType };
}

function inventory(specs) {
    return specs.map(spec => new Item(spec.id, spec.name || `N-${spec.id}`, spec.w, spec.h, spec.d, spec.color || '#3b82f6', spec.weight || 0));
}

function checkMap(report) {
    return new Map(report.checks.map(check => [check.name, check]));
}

// 用 Packer.validatePackingResult 作为预言机，逐项核对共享错误分类。
function assertLegalityMatchesValidator(report, packed, binW, binH, binD, checkStability = true, supportRatio = 0.5) {
    const validation = Packer.validatePackingResult(packed, binW, binH, binD, checkStability, supportRatio);
    const idsOf = type => {
        const ids = new Set();
        for (const error of validation.errors) {
            if (error.type === type) {
                if (error.item) ids.add(error.item.id);
                if (error.itemA) ids.add(error.itemA.id);
                if (error.itemB) ids.add(error.itemB.id);
            }
        }
        return [...ids].sort();
    };
    const countOf = type => validation.errors.filter(error => error.type === type).length;

    assert.deepEqual(report.legality.outOfBounds.ids.sort(), idsOf('OUT_OF_BOUNDS').concat(idsOf('NEGATIVE_POSITION')).filter((v, i, arr) => arr.indexOf(v) === i).sort());
    assert.equal(report.legality.outOfBounds.count,
        validation.errors.filter(error => error.type === 'OUT_OF_BOUNDS' || error.type === 'NEGATIVE_POSITION').length);
    assert.equal(report.legality.overlap.pairCount, countOf('OVERLAP'));
    assert.deepEqual(report.legality.overlap.ids.sort(), idsOf('OVERLAP'));
    assert.equal(report.legality.unstable.count, countOf('UNSTABLE'));
    assert.deepEqual(report.legality.unstable.ids.sort(), idsOf('UNSTABLE'));
    assert.equal(report.legality.duplicateId.count, countOf('DUPLICATE_ID'));
    assert.deepEqual(report.legality.duplicateId.ids.sort(), idsOf('DUPLICATE_ID'));

    const geometricValid = validation.errors.filter(error => error.type === 'INVALID_GEOMETRY').length === 0 &&
        validation.errors.every(error => error.type !== 'INVALID_INPUT');
    if (geometricValid) {
        const geometryPassed = !validation.errors.some(error =>
            ['OUT_OF_BOUNDS', 'NEGATIVE_POSITION', 'OVERLAP', 'UNSTABLE', 'DUPLICATE_ID'].includes(error.type));
        const auditGeometryPassed = report.checks
            .filter(check => ['bounds', 'overlap', 'stability', 'duplicateId'].includes(check.name))
            .every(check => check.passed);
        assert.equal(auditGeometryPassed, geometryPassed);
    }
    return validation;
}

function assertMetricsMatch(report, packed) {
    const metrics = Packer.packingMetrics(packed);
    assert.ok(Math.abs(report.metrics.packedVolume - metrics.volume) < 1e-6);
    assert.ok(Math.abs(report.metrics.maxHeight - metrics.height) < 1e-6);
    assert.ok(Math.abs(report.metrics.utilization - metrics.volume / (BIN.w * BIN.h * BIN.d)) < 1e-6);
}

test('normal path: a real Packer run is fully approved with matching metrics', () => {
    const items = [
        new Item('a', 'A', 9, 7, 5),
        new Item('b', 'B', 8, 6, 4),
        new Item('c', 'C', 7, 5, 3),
        new Item('d', 'D', 6, 4, 2),
        new Item('e', 'E', 5, 5, 5)
    ];
    const packer = new Packer(BIN.w, BIN.h, BIN.d);
    packer.pack(items, { checkStability: true, supportRatio: 0.5 });
    assert.ok(packer.items.length > 0);

    const report = PackingAudit.auditPacking({
        container: BIN,
        items,
        packed: packer.items,
        unpacked: packer.unpacked,
        meta: { degraded: false, noAlternative: false, fromLayerStage: false }
    });

    assert.equal(report.status, 'ok');
    assert.equal(report.degraded, false);
    assert.deepEqual(report.statusReasons, []);
    assert.ok(report.checks.every(check => check.passed), JSON.stringify(report.checks));
    assert.equal(report.legality.valid, true);
    assert.equal(report.conservation.conserved, true);
    assert.equal(report.conservation.totalCount, items.length);
    assert.equal(report.conservation.packedCount, packer.items.length);
    assert.equal(report.conservation.unpackedCount, packer.unpacked.length);
    assertLegalityMatchesValidator(report, packer.items, BIN.w, BIN.h, BIN.d);
    assertMetricsMatch(report, packer.items);
    assert.equal(report.metrics.utilization > 0, true);
    assert.deepEqual(report.run, { degraded: false, noAlternative: false, fromLayerStage: false });
});

test('normal path: representative 49-item layer-style layout stays consistent with the validator', () => {
    const items = [];
    for (let i = 0; i < 9; i++) items.push(new Item(`A_${i}`, 'A', 16, 8, 29));
    for (let i = 0; i < 24; i++) items.push(new Item(`B_${i}`, 'B', 13, 6, 29));
    for (let i = 0; i < 16; i++) items.push(new Item(`C_${i}`, 'C', 6, 6, 29));

    const packer = new Packer(40, 50, 60);
    packer.pack(items, { checkStability: true, supportRatio: 0.5 });
    const report = PackingAudit.auditPacking({
        container: { w: 40, h: 50, d: 60 },
        items,
        packed: packer.items,
        unpacked: packer.unpacked,
        meta: { fromLayerStage: true }
    });

    assert.equal(report.status, 'ok');
    assert.ok(report.checks.every(check => check.passed), JSON.stringify(report.checks));
    assert.equal(report.run.fromLayerStage, true);
    const validation = Packer.validatePackingResult(packer.items, 40, 50, 60);
    assert.equal(validation.valid, true);
    const metrics = Packer.packingMetrics(packer.items);
    assert.ok(Math.abs(report.metrics.packedVolume - metrics.volume) < 1e-6);
    assert.ok(Math.abs(report.metrics.maxHeight - metrics.height) < 1e-6);
});

test('negative path: overlapping boxes fail the overlap check with the right id list', () => {
    const items = inventory([
        { id: 'a', w: 4, h: 4, d: 4 },
        { id: 'b', w: 4, h: 4, d: 4 },
        { id: 'c', w: 4, h: 4, d: 4 }
    ]);
    const packed = [
        record('a', 0, 0, 0, 4, 4, 4),
        record('b', 2, 0, 0, 4, 4, 4), // 与 a 在 X 轴重叠 2 个单位
        record('c', 6, 0, 0, 4, 4, 4)  // 与 b 恰好贴合（b 终于 x=6），不重叠
    ];
    const report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });

    const checks = checkMap(report);
    assert.equal(checks.get('overlap').passed, false);
    assert.match(checks.get('overlap').reason, /a/);
    assert.match(checks.get('overlap').reason, /b/);
    assert.equal(report.legality.overlap.pairCount, 1);
    assert.deepEqual(report.legality.overlap.ids, ['a', 'b']);
    assert.equal(checks.get('bounds').passed, true);
    assert.equal(checks.get('stability').passed, true);
    assert.equal(checks.get('duplicateId').passed, true);
    assert.equal(report.legality.valid, false);
    assertLegalityMatchesValidator(report, packed, BIN.w, BIN.h, BIN.d);
});

test('negative path: a floating box with insufficient support fails the stability check', () => {
    const items = inventory([
        { id: 'base', w: 8, h: 2, d: 8 },
        { id: 'floating', w: 8, h: 2, d: 8 }
    ]);
    const packed = [
        record('base', 0, 0, 0, 8, 2, 8),
        // 仅 4x4=16 的底面落在 base（顶面 y=2）上，支撑率 16/64=0.25 < 0.5
        record('floating', 4, 2, 4, 8, 2, 8)
    ];
    const report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });

    const checks = checkMap(report);
    assert.equal(checks.get('stability').passed, false);
    assert.deepEqual(report.legality.unstable.ids, ['floating']);
    assert.equal(report.legality.unstable.count, 1);
    assert.match(checks.get('stability').reason, /floating/);
    assert.equal(checks.get('overlap').passed, true);
    assert.equal(checks.get('bounds').passed, true);
    assertLegalityMatchesValidator(report, packed, BIN.w, BIN.h, BIN.d);
});

test('negative path: boxes crossing container walls fail the bounds check', () => {
    const items = inventory([
        { id: 'low', w: 4, h: 4, d: 4 },
        { id: 'tall', w: 4, h: 4, d: 4 }
    ]);
    const packed = [
        record('low', -1, 0, 0, 4, 4, 4),    // 负坐标
        record('tall', 0, 18, 0, 4, 4, 4)    // y+rh=22 > 20
    ];
    const report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });

    const checks = checkMap(report);
    assert.equal(checks.get('bounds').passed, false);
    assert.deepEqual(report.legality.outOfBounds.ids.sort(), ['low', 'tall']);
    assert.equal(report.legality.outOfBounds.count, 2);
    assertLegalityMatchesValidator(report, packed, BIN.w, BIN.h, BIN.d);
});

test('negative path: a rotated box whose dimensions do not match any legal orientation is flagged', () => {
    const items = inventory([{ id: 'a', w: 4, h: 2, d: 1 }]);
    const packed = [record('a', 0, 0, 0, 4, 4, 4, 1)]; // rotationType=1 应为 [4,1,2]，尺寸对不上
    const report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });

    const checks = checkMap(report);
    assert.equal(checks.get('rotation').passed, false);
    assert.deepEqual(report.legality.illegalRotation.ids, ['a']);
    assert.equal(report.legality.illegalRotation.count, 1);

    // 合法旋转（rotationType=1 -> [w,d,h]=[4,1,2]）应当通过。
    const legal = [record('a', 0, 0, 0, 4, 1, 2, 1)];
    const legalReport = PackingAudit.auditPacking({ container: BIN, items, packed: legal, unpacked: [] });
    assert.equal(checkMap(legalReport).get('rotation').passed, true);
});

test('boundary: empty packing keeps conservation and reports zero utilization', () => {
    const items = inventory([
        { id: 'a', w: 2, h: 2, d: 2 },
        { id: 'b', w: 3, h: 3, d: 3 }
    ]);
    const report = PackingAudit.auditPacking({ container: BIN, items, packed: [], unpacked: items });

    assert.equal(report.status, 'ok');
    assert.equal(report.conservation.conserved, true);
    assert.equal(report.conservation.packedCount, 0);
    assert.equal(report.conservation.unpackedCount, 2);
    assert.equal(report.metrics.packedVolume, 0);
    assert.equal(report.metrics.maxHeight, 0);
    assert.equal(report.metrics.utilization, 0);
    assert.ok(report.checks.every(check => check.passed), JSON.stringify(report.checks));
    assert.equal(report.legality.valid, true);
    assertMetricsMatch(report, []);
});

test('degraded: unknown packed id returns a degraded result without throwing', () => {
    const items = inventory([{ id: 'a', w: 2, h: 2, d: 2 }]);
    const packed = [
        record('a', 0, 0, 0, 2, 2, 2),
        record('ghost', 0, 0, 0, 1, 1, 1)
    ];
    let report;
    assert.doesNotThrow(() => {
        report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });
    });

    assert.equal(report.status, 'degraded');
    assert.equal(report.degraded, true);
    assert.ok(report.statusReasons.includes('UNKNOWN_PACKED_ID'));
    assert.deepEqual(report.conservation.unknownPackedIds, ['ghost']);
    assert.equal(report.conservation.conserved, false);
    assert.equal(checkMap(report).get('inputIntegrity').passed, false);
    assert.equal(checkMap(report).get('conservation').passed, false);
    assert.match(report.statusReasonDetails.join('；'), /ghost/);
});

test('degraded: duplicate packed ids are counted and listed without throwing', () => {
    const items = inventory([
        { id: 'a', w: 2, h: 2, d: 2 },
        { id: 'b', w: 2, h: 2, d: 2 }
    ]);
    const packed = [
        record('a', 0, 0, 0, 2, 2, 2),
        record('a', 2, 0, 0, 2, 2, 2),
        record('b', 4, 0, 0, 2, 2, 2)
    ];
    let report;
    assert.doesNotThrow(() => {
        report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });
    });

    assert.equal(report.status, 'degraded');
    assert.ok(report.statusReasons.includes('DUPLICATE_PACKED_ID'));
    assert.equal(report.legality.duplicateId.count, 1);
    assert.deepEqual(report.legality.duplicateId.ids, ['a']);
    assert.equal(checkMap(report).get('duplicateId').passed, false);
    // 集合意义上的守恒仍成立（重复 id 在集合中去重），重复问题由独立检查项与降级状态暴露。
    assert.equal(report.conservation.conserved, true);
    assert.deepEqual(report.conservation.duplicatePackedIds, ['a']);
    assertLegalityMatchesValidator(report, packed, BIN.w, BIN.h, BIN.d);
});

test('degraded: invalid container dimensions produce a status field instead of throwing', () => {
    const items = inventory([{ id: 'a', w: 2, h: 2, d: 2 }]);
    for (const bad of [{ w: 0, h: 20, d: 20 }, { w: 20, h: -1, d: 20 }, { w: Number.NaN, h: 20, d: 20 }]) {
        let report;
        assert.doesNotThrow(() => {
            report = PackingAudit.auditPacking({ container: bad, items, packed: [], unpacked: items });
        });
        assert.equal(report.status, 'degraded');
        assert.ok(report.statusReasons.includes('INVALID_CONTAINER'));
        assert.equal(checkMap(report).get('container').passed, false);
        assert.equal(report.metrics.utilization, null);
        assert.equal(report.metrics.containerVolume, null);
    }
});

test('audit never mutates input arrays or item objects', () => {
    const items = inventory([
        { id: 'a', w: 4, h: 4, d: 4 },
        { id: 'b', w: 4, h: 4, d: 4 }
    ]);
    const packed = [record('a', 0, 0, 0, 4, 4, 4), record('b', 0, 4, 0, 4, 4, 4)];
    const unpacked = [];
    const snapshots = {
        items: JSON.stringify(items),
        packed: JSON.stringify(packed),
        unpacked: JSON.stringify(unpacked)
    };
    const packedBefore = packed.slice();
    const report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked });

    assert.equal(JSON.stringify(items), snapshots.items);
    assert.equal(JSON.stringify(packed), snapshots.packed);
    assert.equal(JSON.stringify(unpacked), snapshots.unpacked);
    assert.equal(packed.length, packedBefore.length);
    assert.ok(report.checks.every(check => check.passed));
});

test('audit output is JSON-serializable with no functions or class instances', () => {
    const items = inventory([{ id: 'a', w: 2, h: 2, d: 2 }]);
    const itemInstance = new Item('a', 'A', 2, 2, 2);
    const report = PackingAudit.auditPacking({
        container: BIN,
        items,
        packed: [itemInstance],
        unpacked: [],
        meta: { degraded: true }
    });
    const roundTripped = JSON.parse(JSON.stringify(report));
    assert.deepEqual(roundTripped, report);
    assert.equal(roundTripped.run.degraded, true);
    assert.equal(roundTripped.status, 'ok');

    const walk = value => {
        if (value === null || typeof value !== 'object') return;
        assert.equal(typeof value, 'object');
        for (const child of Object.values(value)) walk(child);
    };
    walk(roundTripped);
});

test('fuzz: randomized hand-built layouts keep audit and validator classifications aligned', () => {
    let state = 20261111 >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const int = (min, max) => min + Math.floor(random() * (max - min + 1));

    for (let iteration = 0; iteration < 60; iteration++) {
        const count = int(2, 8);
        const specs = Array.from({ length: count }, (_, i) => ({ id: `it-${i}`, w: int(1, 6), h: int(1, 6), d: int(1, 6) }));
        const items = inventory(specs);
        const packed = specs.map(spec => {
            const rotationType = int(0, 5);
            const dims = { 0: [spec.w, spec.h, spec.d], 1: [spec.w, spec.d, spec.h], 2: [spec.h, spec.w, spec.d],
                3: [spec.h, spec.d, spec.w], 4: [spec.d, spec.w, spec.h], 5: [spec.d, spec.h, spec.w] }[rotationType];
            return record(spec.id, int(0, 12), int(0, 8), int(0, 12), dims[0], dims[1], dims[2], rotationType);
        });
        const report = PackingAudit.auditPacking({ container: BIN, items, packed, unpacked: [] });

        assert.equal(report.status, 'ok');
        assertLegalityMatchesValidator(report, packed, BIN.w, BIN.h, BIN.d);
        assertMetricsMatch(report, packed);
        assert.equal(report.conservation.conserved, true);
    }
});

test('module is self-contained: no Worker, PackingJobs, network or DOM dependencies', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'packing-audit.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '') // 去掉块注释
        .replace(/\/\/[^\n]*/g, '');       // 去掉行注释
    assert.doesNotMatch(source, /\bWorker\b/);
    assert.doesNotMatch(source, /PackingJobs/);
    assert.doesNotMatch(source, /\bdocument\b/);
    assert.doesNotMatch(source, /\bXMLHttpRequest\b|fetch\s*\(/);
    assert.doesNotMatch(source, /https?:\/\//);
    assert.match(source, /window\.PackingAudit/);
    assert.match(source, /module\.exports/);
});

test('array and Packer-style container shapes and positional API are accepted', () => {
    const items = inventory([{ id: 'a', w: 2, h: 2, d: 2 }]);
    const packed = [record('a', 0, 0, 0, 2, 2, 2)];

    const fromArray = PackingAudit.auditPacking({ container: [20, 20, 20], items, packed, unpacked: [] });
    const fromObject = PackingAudit.auditPacking({ container: { binW: 20, binH: 20, binD: 20 }, items, packed, unpacked: [] });
    const positional = PackingAudit.audit({ w: 20, h: 20, d: 20 }, items, packed, [], { degraded: true });

    for (const report of [fromArray, fromObject, positional]) {
        assert.equal(report.status, 'ok');
        assert.equal(report.metrics.containerVolume, 8000);
        assert.ok(Math.abs(report.metrics.utilization - 8 / 8000) < 1e-12);
        assert.ok(report.checks.every(check => check.passed));
    }
    assert.equal(positional.run.degraded, true);
});

test('malformed inputs never escape an exception', () => {
    const safe = call => assert.doesNotThrow(call);
    safe(() => PackingAudit.auditPacking(undefined));
    safe(() => PackingAudit.auditPacking(null));
    safe(() => PackingAudit.auditPacking('not-an-object'));
    const report = PackingAudit.auditPacking({ container: BIN, items: [], packed: [null, { id: 'x' }], unpacked: [] });
    assert.equal(report.status, 'degraded');
    assert.ok(report.statusReasons.includes('INVALID_GEOMETRY'));
    assert.ok(report.statusReasons.includes('UNKNOWN_PACKED_ID'));
    assert.equal(report.legality.invalidGeometry.count, 2);
});
