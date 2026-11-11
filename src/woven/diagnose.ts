/** 织线渲染诊断：纯函数、纯数据模块。
 * 不导入 three、不访问 window/document、不发起网络请求；输出可 JSON 序列化。
 * 语义与 src/woven/index.ts 的 createWoven 及 src/main.ts 的预算截断循环逐项对齐。 */

/** 与 createWoven 相同的调色板（THREAD_COLORS 的 power/water/lights/voice/root 加米白）。
 * 放在这里而不是从 chapter/data 引入，是为了让本模块保持零依赖（chapter/data 会拉入 three）。
 * tests/woven-diagnose.test.ts 会断言它与 THREAD_COLORS 同步。 */
export const PALETTE = ['#ffcf4a', '#4fb3e8', '#ff8a5c', '#e8505b', '#8fd16a', '#fff1d6'];

/** createWoven 的默认线宽（material uniform uWidth）。 */
export const DEFAULT_WIDTH = 0.022;
/** main.ts 的设备点预算：粗指针或低内存设备更少。 */
export const COARSE_BUDGET = 40000;
export const DEFAULT_BUDGET = 120000;

/** 一条旅行路线：给点坐标数组（与 Traveler.p 相同，xyz 连续）或直接给点数。 */
export interface DiagnoseTraveler {
  c: number;
  p?: ArrayLike<number>;
  points?: number;
}

export interface DiagnoseCamera {
  fov?: number;
  viewportHeight?: number;
  /** 调用方已按 update() 的公式算好时直接给。 */
  uPixel?: number;
}

export interface DiagnoseInput {
  travelers?: DiagnoseTraveler[] | null;
  width?: number;
  lift?: number;
  /** 显式预算；省略时按 coarsePointer/lowMemory 复现 main.ts 的设备预算；null 表示不做预算截断。 */
  budget?: number | null;
  coarsePointer?: boolean;
  /** navigator.deviceMemory；<= 4 视为低内存（与 main.ts 一致）。 */
  lowMemory?: number;
  camera?: DiagnoseCamera;
  /** 调用方从真实几何体采到的实际计数，用于交叉核对（audit() 会填）。 */
  actual?: { vertices: number; indices: number };
}

export interface DiagnoseCheck {
  name: string;
  pass: boolean;
  /** 未通过时的可读原因；通过时为 null。 */
  reason: string | null;
}

export interface RouteDiagnosis {
  index: number;
  /** 原始颜色索引；非法（非有限数）时为 null。 */
  colorIndex: number | null;
  /** JS 取模结果（与 PALETTE[t.c % PALETTE.length] 一致，可能为负）；无法计算时为 null。 */
  paletteIndex: number | null;
  /** 实际取到的调色板颜色；取模结果不是有效下标（负索引、非整数）时为 null 并在 notes 标注。 */
  color: string | null;
  points: number;
  adopted: boolean;
  /** adopted=采纳；truncated=累加后超预算、本条不采纳；skipped=预算已断、本条未被考虑。 */
  status: 'adopted' | 'truncated' | 'skipped';
  reason: string | null;
  /** 采纳后的顶点数（点数 × 2，与 createWoven 计数循环一致）。 */
  vertices: number;
  /** 四边形数 max(0, 点数 - 1)；点数 0/1 时为 0 并在 notes 标注“不可成带”。 */
  quads: number;
  ribbonable: boolean;
  notes: string[];
}

export interface WovenDiagnosis {
  ok: boolean;
  summary: string;
  paletteSize: number;
  budget: {
    /** null 表示本次诊断不做预算截断。 */
    value: number | null;
    source: 'explicit' | 'device' | 'none';
    coarsePointer: boolean;
    lowMemory: number | null;
  };
  material: { width: number; lift: number; uPixel: number | null };
  routes: RouteDiagnosis[];
  totals: {
    travelers: number;
    adopted: number;
    truncated: number;
    skipped: number;
    points: number;
    vertices: number;
    quads: number;
    indices: number;
  };
  checks: DiagnoseCheck[];
}

/** 复现 main.ts：matchMedia('(pointer: coarse)') 或 deviceMemory <= 4 时用低预算。 */
export function resolveBudget(input: { budget?: number | null; coarsePointer?: boolean; lowMemory?: number }): {
  value: number | null; source: 'explicit' | 'device' | 'none';
} {
  if (input.budget === null) return { value: null, source: 'none' };
  if (typeof input.budget === 'number') return { value: input.budget, source: 'explicit' };
  const coarse = input.coarsePointer === true || (typeof input.lowMemory === 'number' && input.lowMemory <= 4);
  return { value: coarse ? COARSE_BUDGET : DEFAULT_BUDGET, source: 'device' };
}

/** 复现 update()：uPixel = 2 * tan(fov°/2) / max(1, viewportHeight)。 */
export function computeUPixel(fov: number, viewportHeight: number): number {
  return 2 * Math.tan(fov * Math.PI / 360) / Math.max(1, viewportHeight);
}

function travelerPoints(t: DiagnoseTraveler, notes: string[]): number {
  if (t.p != null && typeof (t.p as ArrayLike<number>).length === 'number') {
    const n = t.p.length / 3;
    if (!Number.isInteger(n)) notes.push(`坐标数组长度 ${t.p.length} 不是 3 的整数倍，点数按 ${Math.floor(n)} 计（真实实现会得到非整数计数）`);
    return Math.max(0, Math.floor(n));
  }
  if (typeof t.points === 'number') {
    if (!Number.isFinite(t.points) || t.points < 0) { notes.push(`点数 ${t.points} 非法，按 0 计`); return 0; }
    if (!Number.isInteger(t.points)) notes.push(`点数 ${t.points} 不是整数，按 ${Math.floor(t.points)} 计`);
    return Math.floor(t.points);
  }
  notes.push('既没有点坐标数组也没有点数字段，按 0 点计');
  return 0;
}

/** 一份“不可诊断”的降级结果（mesh 已移除、属性缺失等），绝不抛异常。 */
export function undiagnosableDiagnosis(reason: string): WovenDiagnosis {
  return {
    ok: false,
    summary: `不可诊断：${reason}`,
    paletteSize: PALETTE.length,
    budget: { value: null, source: 'none', coarsePointer: false, lowMemory: null },
    material: { width: DEFAULT_WIDTH, lift: 0, uPixel: null },
    routes: [],
    totals: { travelers: 0, adopted: 0, truncated: 0, skipped: 0, points: 0, vertices: 0, quads: 0, indices: 0 },
    checks: [{ name: 'auditable', pass: false, reason }],
  };
}

export function diagnoseWoven(input: DiagnoseInput = {}): WovenDiagnosis {
  const checks: DiagnoseCheck[] = [];
  const check = (name: string, pass: boolean, reason: string | null = null) => { checks.push({ name, pass, reason: pass ? null : reason }); };

  const travelers = Array.isArray(input.travelers) ? input.travelers : [];
  const width = input.width ?? DEFAULT_WIDTH;
  const lift = input.lift ?? 0;
  const budget = resolveBudget(input);

  let uPixel: number | null = null;
  if (input.camera) {
    if (typeof input.camera.uPixel === 'number') uPixel = input.camera.uPixel;
    else if (typeof input.camera.fov === 'number') uPixel = computeUPixel(input.camera.fov, input.camera.viewportHeight ?? 1);
  }

  check('travelers.non-empty', travelers.length > 0, '旅行者列表为空或缺失：没有可渲染的路线，标题画面将没有任何织线');
  check('options.width', Number.isFinite(width) && width >= 0, `宽度 ${width} 非法（需为不小于 0 的有限数）：条带半宽 max(uWidth, uPixel·distance·1.6) 会退化`);
  check('options.lift', Number.isFinite(lift) && lift >= 0, `抬升 ${lift} 非法（需为不小于 0 的有限数）：织线会沉入星球表面之下`);
  check('budget.available', budget.value === null || budget.value > 0, `预算为 ${budget.value}：任何路线累加后立即超过预算，全部不采纳`);

  // 复现 main.ts：points += n; if (points > budget) break; shown.push(thread)
  const routes: RouteDiagnosis[] = [];
  let accumulated = 0;
  let broken = false;
  travelers.forEach((raw, index) => {
    const t: DiagnoseTraveler = raw && typeof raw === 'object' ? raw : { c: NaN };
    const notes: string[] = [];
    const n = travelerPoints(t, notes);

    const c = typeof t.c === 'number' ? t.c : NaN;
    let colorIndex: number | null = null, paletteIndex: number | null = null, color: string | null = null;
    if (!Number.isFinite(c)) {
      notes.push(`颜色索引 ${String(t.c)} 不是有限数值，真实渲染中 PALETTE 取不到颜色`);
    } else {
      colorIndex = c;
      // 与实现一致的 JS 取模：负数保持负号，小数保持小数
      const mod = c % PALETTE.length;
      paletteIndex = mod;
      if (mod < 0) {
        notes.push(`负索引 ${c} 按 JS 取模得 ${mod}，PALETTE[${mod}] 为 undefined：真实渲染中 Color.set 忽略之，颜色保持默认白`);
      } else if (!Number.isInteger(mod)) {
        notes.push(`颜色索引 ${c} 不是整数，PALETTE[${mod}] 为 undefined：真实渲染颜色保持默认白`);
      } else {
        color = PALETTE[mod];
      }
    }

    const ribbonable = n >= 2;
    if (n === 0) notes.push('点数 0，不可成带：四边形数按 0 计（注意 createWoven 的真实计数会得到 -1 并抛 RangeError，诊断不抛异常）');
    else if (n === 1) notes.push('点数 1，不可成带：只产生 2 个孤立顶点，四边形数按 0 计');
    const vertices = n * 2;
    const quads = Math.max(0, n - 1);

    let adopted = true, status: RouteDiagnosis['status'] = 'adopted', reason: string | null = null;
    if (broken) {
      adopted = false; status = 'skipped';
      reason = '预算已在先前路线处耗尽，本条未被考虑（与 main.ts 的 break 一致）';
    } else if (budget.value !== null) {
      accumulated += n;
      if (accumulated > budget.value) {
        adopted = false; status = 'truncated'; broken = true;
        reason = `累加点数 ${accumulated} 超过预算 ${budget.value}，本条不采纳（与 main.ts 先累加再判断的顺序一致）`;
      }
    }
    routes.push({ index, colorIndex, paletteIndex, color, points: n, adopted, status, reason, vertices, quads, ribbonable, notes });
  });

  const adoptedRoutes = routes.filter(r => r.adopted);
  const totals = {
    travelers: routes.length,
    adopted: adoptedRoutes.length,
    truncated: routes.filter(r => r.status === 'truncated').length,
    skipped: routes.filter(r => r.status === 'skipped').length,
    points: adoptedRoutes.reduce((s, r) => s + r.points, 0),
    vertices: adoptedRoutes.reduce((s, r) => s + r.vertices, 0),
    quads: adoptedRoutes.reduce((s, r) => s + r.quads, 0),
    indices: 0,
  };
  totals.indices = totals.quads * 6;

  const dropped = totals.truncated + totals.skipped;
  check('budget.fits-all-routes', dropped === 0,
    `预算 ${budget.value ?? '无'} 不足：${dropped} 条路线未被采纳（首条超限路线即停止，后续不再考虑）`);
  const notRibbonable = adoptedRoutes.filter(r => !r.ribbonable).map(r => r.index);
  check('routes.ribbonable', notRibbonable.length === 0,
    `路线 ${notRibbonable.join(', ')} 点数不足 2，不可成带：不产生四边形`);
  const badColors = routes.filter(r => r.color === null).map(r => r.index);
  check('colors.resolvable', badColors.length === 0,
    `路线 ${badColors.join(', ')} 的颜色索引无法解析到 PALETTE（负索引/非整数/非数值），真实渲染颜色为默认白`);
  check('counts.consistent', totals.vertices === totals.points * 2 && totals.indices === totals.quads * 6,
    '内部计数不一致（顶点应等于点数×2，索引应等于四边形×6）');
  if (input.actual) {
    const a = input.actual;
    check('counts.match-actual', totals.vertices === a.vertices && totals.indices === a.indices,
      `诊断计数（顶点 ${totals.vertices} / 索引 ${totals.indices}）与几何体实际（顶点 ${a.vertices} / 索引 ${a.indices}）不一致`);
  }
  if (input.camera) {
    check('camera.u-pixel', uPixel !== null && Number.isFinite(uPixel) && uPixel > 0,
      `uPixel 为 ${uPixel}：半宽下限 uPixel·distance·1.6 失效，远处织线会退化为走样`);
  }

  const ok = checks.every(c => c.pass);
  const summary = routes.length === 0
    ? '没有旅行路线，织线为空'
    : `采纳 ${totals.adopted}/${totals.travelers} 条路线，共 ${totals.points} 点 / ${totals.vertices} 顶点 / ${totals.quads} 四边形`
      + (dropped > 0 ? `；${dropped} 条因预算未采纳` : '');

  return {
    ok,
    summary,
    paletteSize: PALETTE.length,
    budget: {
      value: budget.value,
      source: budget.source,
      coarsePointer: input.coarsePointer === true,
      lowMemory: typeof input.lowMemory === 'number' ? input.lowMemory : null,
    },
    material: { width, lift, uPixel },
    routes,
    totals,
    checks,
  };
}
