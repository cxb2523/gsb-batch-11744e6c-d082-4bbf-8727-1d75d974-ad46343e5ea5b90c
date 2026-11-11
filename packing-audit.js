'use strict';

/**
 * 装箱结果审计模块 - packing-audit.js
 *
 * 纯函数：对一次装箱返回的 packed / unpacked 列表做事后审计，输出可 JSON 序列化的
 * 结构化结论。不修改任何入参，不创建 Worker，不调用 PackingJobs.run，不依赖网络或 DOM。
 *
 * 合法性判定（越界、碰撞、支撑不足、重复 id）的容差与判定流程与 packer.js 中
 * Packer.validatePackingResult 保持一致；体积利用率与最大堆高的计算与
 * Packer.packingMetrics 保持一致。tests/packing-audit.test.js 会用真实 Packer
 * 交叉校验两者逐项吻合。
 */

// 与 packer.js 保持一致的核心容差，保证审计分类与 validatePackingResult 逐项吻合。
const EPS_OVERLAP = 0.001;    // 碰撞/越界检测容差
const EPS_STABILITY = 0.05;   // 支撑高度匹配容差
const DEFAULT_SUPPORT_RATIO = 0.5; // 默认最低支撑率

const PackingAudit = {
    EPS_OVERLAP,
    EPS_STABILITY,
    DEFAULT_SUPPORT_RATIO,

    /**
     * 审计一次装箱结果。
     *
     * @param {object} input
     * @param {{w:number,h:number,d:number}|[number,number,number]|object} input.container 容器三维尺寸
     * @param {Array<{id:string|number,name:string,w:number,h:number,d:number,color?:string,weight?:number}>} input.items 原始物品列表
     * @param {Array<object>} input.packed 一次装箱返回的已装物品（含 x/y/z/rw/rh/rd/rotationType）
     * @param {Array<object>} [input.unpacked] 一次装箱返回的未装物品（只需 id）
     * @param {object} [input.meta] 本次运行的可选元信息（degraded / noAlternative / fromLayerStage）
     * @param {boolean} [input.checkStability=true] 是否检查重力支撑
     * @param {number} [input.supportRatio=0.5] 最低支撑率
     * @returns {object} 纯数据审计报告（可 JSON 序列化，不含函数或类实例）
     */
    auditPacking(input) {
        try {
            return runAudit(input);
        } catch (error) {
            // 任何意外都不应抛出未捕获异常：返回带明确状态字段的降级结果。
            return fatalResult(error);
        }
    },

    // 同时提供位置参数风格，方便 Node 测试与其它调用方使用。
    audit(container, items, packed, unpacked, meta, options = {}) {
        return this.auditPacking({
            container,
            items,
            packed,
            unpacked,
            meta,
            checkStability: options.checkStability,
            supportRatio: options.supportRatio
        });
    }
};

// 兜底降级结果：只用 JSON 安全的原始值，避免再次抛出异常。
function fatalResult(error) {
    return {
        status: 'error',
        degraded: true,
        statusReasons: ['FATAL_ERROR'],
        statusReasonDetails: [`审计过程中发生未预期错误: ${safeMessage(error)}`],
        checks: [],
        conservation: {
            conserved: false,
            totalCount: 0,
            packedCount: 0,
            unpackedCount: 0,
            inputIds: [],
            packedIds: [],
            unpackedIds: [],
            unknownPackedIds: [],
            duplicatePackedIds: [],
            missingIds: [],
            overlapIds: []
        },
        legality: emptyLegality(),
        metrics: {
            packedCount: 0,
            unpackedCount: 0,
            packedVolume: 0,
            maxHeight: 0,
            containerVolume: null,
            utilization: null
        },
        run: null
    };
}

function emptyLegality() {
    return {
        valid: false,
        invalidGeometry: { count: 0, ids: [] },
        outOfBounds: { count: 0, ids: [] },
        overlap: { count: 0, pairCount: 0, ids: [] },
        unstable: { count: 0, ids: [] },
        illegalRotation: { count: 0, ids: [] },
        duplicateId: { count: 0, ids: [] }
    };
}

function safeMessage(error) {
    try {
        if (error && typeof error.message === 'string') return error.message;
        return String(error);
    } catch {
        return 'unknown error';
    }
}

function runAudit(input) {
    const normalizedInput = input && typeof input === 'object' ? input : {};

    // ---- 1. 解析容器尺寸（支持 {w,h,d}、[w,h,d] 与 Packer 风格 {binW,binH,binD}）----
    const container = parseContainer(normalizedInput.container);
    const containerValid = Number.isFinite(container.w) && Number.isFinite(container.h) &&
        Number.isFinite(container.d) && container.w > 0 && container.h > 0 && container.d > 0;

    // ---- 2. 防御性归一化所有列表（不修改原数组，只读取）----
    const sourceItems = Array.isArray(normalizedInput.items) ? normalizedInput.items : [];
    const packedList = Array.isArray(normalizedInput.packed) ? normalizedInput.packed : [];
    const unpackedList = Array.isArray(normalizedInput.unpacked) ? normalizedInput.unpacked : [];

    const checkStability = normalizedInput.checkStability !== false;
    let supportRatio = normalizedInput.supportRatio;
    if (!Number.isFinite(supportRatio) || supportRatio < 0 || supportRatio > 1) supportRatio = DEFAULT_SUPPORT_RATIO;

    // 原始 id -> 物品（首个出现者），同时记录原始清单内的重复 id。
    const sourceById = new Map();
    const duplicateSourceIds = [];
    const seenSource = new Set();
    for (const item of sourceItems) {
        if (!item || item.id === undefined || item.id === null) continue;
        if (seenSource.has(item.id) && !duplicateSourceIds.includes(item.id)) duplicateSourceIds.push(item.id);
        seenSource.add(item.id);
        if (!sourceById.has(item.id)) sourceById.set(item.id, item);
    }

    // ---- 3. 为 packed 建立只读快照（不触碰入参对象），并做几何/重复/未知 id 检查 ----
    const records = [];
    const legality = emptyLegality();
    const seenPacked = new Set();
    const unknownPackedIds = [];

    for (const entry of packedList) {
        if (!entry || typeof entry !== 'object') {
            legality.invalidGeometry.count++;
            continue;
        }
        const id = entry.id;
        const record = {
            id,
            x: numberOrNaN(entry.x),
            y: numberOrNaN(entry.y),
            z: numberOrNaN(entry.z),
            rw: numberOrNaN(entry.rw !== undefined ? entry.rw : entry.w),
            rh: numberOrNaN(entry.rh !== undefined ? entry.rh : entry.h),
            rd: numberOrNaN(entry.rd !== undefined ? entry.rd : entry.d),
            rotationType: entry.rotationType,
            geometryValid: false,
            known: sourceById.has(id)
        };
        record.geometryValid = [record.x, record.y, record.z, record.rw, record.rh, record.rd].every(Number.isFinite) &&
            record.rw > 0 && record.rh > 0 && record.rd > 0;

        if (!record.geometryValid) legality.invalidGeometry.count++;

        if (id !== undefined && id !== null) {
            if (seenPacked.has(id)) {
                legality.duplicateId.count++;
                if (!legality.duplicateId.ids.includes(id)) legality.duplicateId.ids.push(id);
            }
            seenPacked.add(id);
            if (!record.known && !unknownPackedIds.includes(id)) unknownPackedIds.push(id);
        } else {
            legality.invalidGeometry.count++;
        }
        records.push(record);
    }
    legality.invalidGeometry.ids = records.filter(r => !r.geometryValid).map(r => r.id).filter(id => id !== undefined && id !== null);

    // ---- 4. 守恒检查：已装 id 集合与未装 id 集合互不相交且并集等于输入 id 集合 ----
    const inputIds = [...sourceById.keys()];
    const packedIds = [...seenPacked];
    const unpackedIds = [];
    const seenUnpacked = new Set();
    for (const entry of unpackedList) {
        if (!entry || entry.id === undefined || entry.id === null) continue;
        if (!seenUnpacked.has(entry.id)) {
            seenUnpacked.add(entry.id);
            unpackedIds.push(entry.id);
        }
    }
    const overlapIds = packedIds.filter(id => seenUnpacked.has(id));
    const missingIds = inputIds.filter(id => !seenPacked.has(id) && !seenUnpacked.has(id));
    const unknownUnpackedIds = unpackedIds.filter(id => !sourceById.has(id));
    const conserved = unknownPackedIds.length === 0 && unknownUnpackedIds.length === 0 &&
        overlapIds.length === 0 && missingIds.length === 0;

    // ---- 5. 越界检查（与 validatePackingResult 相同的 eps 与判定）----
    const outOfBoundsIds = [];
    for (const record of records) {
        if (!record.geometryValid || !containerValid) continue;
        let violated = false;
        if (record.x < -EPS_OVERLAP || record.y < -EPS_OVERLAP || record.z < -EPS_OVERLAP) violated = true;
        if (record.x + record.rw > container.w + EPS_OVERLAP ||
            record.y + record.rh > container.h + EPS_OVERLAP ||
            record.z + record.rd > container.d + EPS_OVERLAP) {
            violated = true;
        }
        if (violated) {
            legality.outOfBounds.count++;
            if (!outOfBoundsIds.includes(record.id)) outOfBoundsIds.push(record.id);
        }
    }
    legality.outOfBounds.ids = sortIds(outOfBoundsIds);

    // ---- 6. 碰撞检查：sweep-and-prune，按 X 起点排序后扫描（同 validatePackingResult）----
    const overlapPairs = [];
    const overlapIdSet = new Set();
    const geometric = records.filter(r => r.geometryValid);
    const byMinX = geometric.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < byMinX.length; i++) {
        const a = byMinX[i];
        for (let j = i + 1; j < byMinX.length; j++) {
            const b = byMinX[j];
            if (b.x >= a.x + a.rw - EPS_OVERLAP) break;
            if (boxesOverlap(a, b)) {
                overlapPairs.push([a.id, b.id]);
                overlapIdSet.add(a.id);
                overlapIdSet.add(b.id);
            }
        }
    }
    legality.overlap.pairCount = overlapPairs.length;
    legality.overlap.count = overlapPairs.length;
    legality.overlap.ids = sortIds([...overlapIdSet]);
    legality.overlap.pairs = overlapPairs.map(pair => sortIds(pair.slice()));

    // ---- 7. 支撑检查：复刻 createSupportIndex 的分桶逻辑与支撑率公式 ----
    const unstableIds = [];
    if (checkStability && containerValid) {
        const supportIndex = createSupportIndex();
        for (const record of geometric) supportIndex.add(record);
        for (const record of geometric) {
            if (!(record.y > 0)) continue;
            let supportedArea = 0;
            const bottomArea = record.rw * record.rd;
            const supporters = supportIndex.get(record.y);
            for (const supporter of supporters) {
                if (supporter === record) continue;
                const xOverlap = Math.max(0, Math.min(record.x + record.rw, supporter.x + supporter.rw) - Math.max(record.x, supporter.x));
                const zOverlap = Math.max(0, Math.min(record.z + record.rd, supporter.z + supporter.rd) - Math.max(record.z, supporter.z));
                supportedArea += xOverlap * zOverlap;
            }
            if (bottomArea > 0 && (supportedArea / bottomArea) < supportRatio - EPS_OVERLAP) {
                legality.unstable.count++;
                if (!unstableIds.includes(record.id)) unstableIds.push(record.id);
            }
        }
    }
    legality.unstable.ids = sortIds(unstableIds);

    // ---- 8. 非法旋转检查：rotationType 必须在 0-5，且旋转后尺寸必须与原始尺寸吻合 ----
    const illegalRotationIds = [];
    for (const record of records) {
        if (!record.geometryValid || !record.known) continue;
        const source = sourceById.get(record.id);
        const rotationType = record.rotationType === undefined || record.rotationType === null ? 0 : record.rotationType;
        let illegal = false;
        if (!Number.isInteger(rotationType) || rotationType < 0 || rotationType > 5) {
            illegal = true;
        } else {
            const expected = rotatedDimensions(source.w, source.h, source.d, rotationType);
            if (!expected) {
                illegal = true;
            } else {
                const diffs = [record.rw - expected[0], record.rh - expected[1], record.rd - expected[2]];
                if (diffs.some(value => !Number.isFinite(value) || Math.abs(value) > EPS_OVERLAP)) illegal = true;
            }
        }
        if (illegal) {
            legality.illegalRotation.count++;
            if (!illegalRotationIds.includes(record.id)) illegalRotationIds.push(record.id);
        }
    }
    legality.illegalRotation.ids = sortIds(illegalRotationIds);

    // ---- 9. 指标：与 Packer.packingMetrics 同口径（体积用 rw*rh*rd，高度取 y+rh 最大值）----
    let packedVolume = 0;
    let maxHeight = 0;
    for (const record of geometric) {
        packedVolume += record.rw * record.rh * record.rd;
        const top = record.y + record.rh;
        if (top > maxHeight) maxHeight = top;
    }
    const containerVolume = containerValid ? container.w * container.h * container.d : null;
    const utilization = containerValid && containerVolume > 0 ? packedVolume / containerVolume : null;

    // ---- 10. 降级状态与可读原因 ----
    const statusReasons = [];
    const statusReasonDetails = [];
    if (!containerValid) {
        statusReasons.push('INVALID_CONTAINER');
        statusReasonDetails.push(`容器尺寸非法: (${container.w}, ${container.h}, ${container.d})，必须均为大于 0 的有限数`);
    }
    if (unknownPackedIds.length) {
        statusReasons.push('UNKNOWN_PACKED_ID');
        statusReasonDetails.push(`packed 中出现原始清单不存在的 id: ${formatIdList(unknownPackedIds)}`);
    }
    if (legality.duplicateId.count > 0) {
        statusReasons.push('DUPLICATE_PACKED_ID');
        statusReasonDetails.push(`packed 中存在重复 id: ${formatIdList(legality.duplicateId.ids)}`);
    }
    if (legality.invalidGeometry.count > 0) {
        statusReasons.push('INVALID_GEOMETRY');
        statusReasonDetails.push(`packed 中存在 ${legality.invalidGeometry.count} 条缺失或几何字段非法的记录`);
    }
    if (unknownUnpackedIds.length) {
        statusReasons.push('UNKNOWN_UNPACKED_ID');
        statusReasonDetails.push(`unpacked 中出现原始清单不存在的 id: ${formatIdList(unknownUnpackedIds)}`);
    }
    if (duplicateSourceIds.length) {
        statusReasons.push('DUPLICATE_SOURCE_ID');
        statusReasonDetails.push(`原始物品清单自身存在重复 id: ${formatIdList(duplicateSourceIds)}`);
    }

    // ---- 11. 按固定顺序排列的检查项列表 ----
    const checks = [
        {
            name: 'container',
            label: '容器尺寸合法',
            passed: containerValid,
            reason: containerValid ? null : `容器尺寸 (${container.w}, ${container.h}, ${container.d}) 必须均为大于 0 的有限数`
        },
        {
            name: 'inputIntegrity',
            label: '输入 id 完整且无重复',
            passed: statusReasons.filter(reason => ['UNKNOWN_PACKED_ID', 'DUPLICATE_PACKED_ID', 'INVALID_GEOMETRY',
                'UNKNOWN_UNPACKED_ID', 'DUPLICATE_SOURCE_ID'].includes(reason)).length === 0,
            reason: statusReasonDetails.filter((_, index) => statusReasons[index] !== 'INVALID_CONTAINER').join('；') || null
        },
        {
            name: 'conservation',
            label: '物品守恒（已装与未装互不相交且并集等于输入）',
            passed: conserved,
            reason: conserved ? null : buildConservationReason(unknownPackedIds, unknownUnpackedIds, overlapIds, missingIds)
        },
        {
            name: 'bounds',
            label: '越界检查',
            passed: legality.outOfBounds.count === 0,
            reason: legality.outOfBounds.count === 0 ? null
                : `有 ${legality.outOfBounds.count} 件物品越出容器边界，涉及 id: ${formatIdList(legality.outOfBounds.ids)}`
        },
        {
            name: 'overlap',
            label: '碰撞检查',
            passed: legality.overlap.pairCount === 0,
            reason: legality.overlap.pairCount === 0 ? null
                : `检测到 ${legality.overlap.pairCount} 对重叠物品，涉及 id: ${formatIdList(legality.overlap.ids)}`
        },
        {
            name: 'stability',
            label: '支撑检查',
            passed: !checkStability || legality.unstable.count === 0,
            reason: !checkStability ? '已关闭支撑检查，跳过'
                : legality.unstable.count === 0 ? null
                    : `有 ${legality.unstable.count} 件物品支撑率低于 ${supportRatio}，涉及 id: ${formatIdList(legality.unstable.ids)}`
        },
        {
            name: 'rotation',
            label: '旋转合法性检查',
            passed: legality.illegalRotation.count === 0,
            reason: legality.illegalRotation.count === 0 ? null
                : `有 ${legality.illegalRotation.count} 件物品旋转类型或旋转后尺寸非法，涉及 id: ${formatIdList(legality.illegalRotation.ids)}`
        },
        {
            name: 'duplicateId',
            label: '重复 id 检查',
            passed: legality.duplicateId.count === 0,
            reason: legality.duplicateId.count === 0 ? null
                : `packed 中存在 ${legality.duplicateId.count} 次重复 id，涉及 id: ${formatIdList(legality.duplicateId.ids)}`
        }
    ];

    legality.valid = checks.filter(check => check.name !== 'inputIntegrity' && check.name !== 'container' && check.name !== 'conservation')
        .every(check => check.passed);

    return {
        status: statusReasons.length === 0 ? 'ok' : 'degraded',
        degraded: statusReasons.length > 0,
        statusReasons,
        statusReasonDetails,
        checks,
        conservation: {
            conserved,
            totalCount: inputIds.length,
            packedCount: seenPacked.size,
            unpackedCount: seenUnpacked.size,
            inputIds: sortIds(inputIds),
            packedIds: sortIds(packedIds),
            unpackedIds: sortIds(unpackedIds),
            unknownPackedIds: sortIds(unknownPackedIds),
            unknownUnpackedIds: sortIds(unknownUnpackedIds),
            duplicatePackedIds: sortIds(legality.duplicateId.ids),
            missingIds: sortIds(missingIds),
            overlapIds: sortIds(overlapIds)
        },
        legality,
        metrics: {
            packedCount: seenPacked.size,
            unpackedCount: seenUnpacked.size,
            packedVolume,
            maxHeight,
            containerVolume,
            utilization
        },
        container: { w: container.w, h: container.h, d: container.d },
        run: normalizeMeta(normalizedInput.meta)
    };
}

function buildConservationReason(unknownPackedIds, unknownUnpackedIds, overlapIds, missingIds) {
    const parts = [];
    if (unknownPackedIds.length) parts.push(`packed 含未知 id: ${formatIdList(unknownPackedIds)}`);
    if (unknownUnpackedIds.length) parts.push(`unpacked 含未知 id: ${formatIdList(unknownUnpackedIds)}`);
    if (overlapIds.length) parts.push(`同一 id 同时出现在 packed 与 unpacked: ${formatIdList(overlapIds)}`);
    if (missingIds.length) parts.push(`输入 id 既未装入也未标记未装: ${formatIdList(missingIds)}`);
    return parts.join('；') || '物品集合不守恒';
}

// 透传本次运行的可选元信息，只保留布尔语义与 JSON 安全值。
function normalizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const pickBoolean = (...keys) => {
        for (const key of keys) {
            if (typeof meta[key] === 'boolean') return meta[key];
        }
        return false;
    };
    return {
        degraded: pickBoolean('degraded'),
        noAlternative: pickBoolean('noAlternative'),
        fromLayerStage: pickBoolean('fromLayerStage', 'fromLayer', 'layerStage')
    };
}

function parseContainer(raw) {
    const invalid = { w: NaN, h: NaN, d: NaN };
    if (raw === undefined || raw === null) return invalid;
    if (Array.isArray(raw)) {
        return { w: numberOrNaN(raw[0]), h: numberOrNaN(raw[1]), d: numberOrNaN(raw[2]) };
    }
    if (typeof raw !== 'object') return invalid;
    const w = raw.w !== undefined ? raw.w : raw.binW;
    const h = raw.h !== undefined ? raw.h : raw.binH;
    const d = raw.d !== undefined ? raw.d : raw.binD;
    return { w: numberOrNaN(w), h: numberOrNaN(h), d: numberOrNaN(d) };
}

function numberOrNaN(value) {
    return typeof value === 'number' ? value : Number(value);
}

// 与 packer.js boxesOverlap 同公式（容差 EPS_OVERLAP）。
function boxesOverlap(a, b) {
    return (
        a.x < b.x + b.rw - EPS_OVERLAP && a.x + a.rw > b.x + EPS_OVERLAP &&
        a.y < b.y + b.rh - EPS_OVERLAP && a.y + a.rh > b.y + EPS_OVERLAP &&
        a.z < b.z + b.rd - EPS_OVERLAP && a.z + a.rd > b.z + EPS_OVERLAP
    );
}

// 复刻 Packer.createSupportIndex 的分桶与相邻桶查询逻辑。
function createSupportIndex() {
    const index = new Map();
    return {
        add(item) {
            if (!Number.isFinite(item.y + item.rh)) return;
            const key = Math.round((item.y + item.rh) / EPS_STABILITY);
            if (!index.has(key)) index.set(key, []);
            index.get(key).push(item);
        },
        get(y) {
            const key = Math.round(y / EPS_STABILITY);
            const matches = [];
            for (let offset = -1; offset <= 1; offset++) {
                const bucket = index.get(key + offset) || [];
                for (const item of bucket) {
                    if (Math.abs((item.y + item.rh) - y) < EPS_STABILITY) matches.push(item);
                }
            }
            return matches;
        }
    };
}

// 与 Item.getRotatedDimensions 的 6 种朝向定义完全一致。
function rotatedDimensions(w, h, d, rotationType) {
    if (![w, h, d].every(Number.isFinite)) return null;
    switch (rotationType) {
        case 0: return [w, h, d];
        case 1: return [w, d, h];
        case 2: return [h, w, d];
        case 3: return [h, d, w];
        case 4: return [d, w, h];
        case 5: return [d, h, w];
        default: return null;
    }
}

// 混合类型 id 的稳定排序（数字按数值，其余按字符串），保证输出确定性且 JSON 安全。
function sortIds(ids) {
    return ids.slice().sort((a, b) => {
        const bothNumbers = typeof a === 'number' && typeof b === 'number';
        if (bothNumbers) return a - b;
        return String(a).localeCompare(String(b));
    });
}

function formatIdList(ids) {
    const sorted = sortIds(ids);
    if (sorted.length <= 20) return sorted.map(id => String(id)).join(', ');
    return `${sorted.slice(0, 20).map(id => String(id)).join(', ')} 等 ${sorted.length} 个`;
}

// 浏览器全局与 Node.js 测试环境双兼容（与 packer.js 的导出风格保持一致）。
if (typeof window !== 'undefined') {
    window.PackingAudit = PackingAudit;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PackingAudit };
}
