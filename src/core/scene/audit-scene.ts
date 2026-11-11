/*
 * Scene render audit: a pure, DOM-free inspector for the line-tool scene
 * builders (lines.ts). It takes a plain-data snapshot (kind, pane size,
 * screen anchors, a DrawingStyle subset, optional linear axis maps) and
 * returns a plain-data report: the scene item type sequence, the stats box
 * geometry, the stat row texts, the trend-angle arc endpoints, the label
 * cut-out flag and an ordered list of named checks.
 *
 * The audit builds an equivalent Drawing + Coords from the snapshot and runs
 * the REAL scene builders, so its report matches sceneHorizontalLine /
 * sceneTrendLine / sceneTrendAngle / sceneExtendedSegment / … by
 * construction; the checks then cross-verify the scene against independently
 * re-derived values (stats box, stat rows, arc path). No DOM, no canvas, no
 * Drawing or global-state mutation; the report is JSON-serializable and
 * holds no function references. Unknown kinds and missing anchors report
 * `supported: false` with a reason instead of throwing.
 */
import type { Time } from "lightweight-charts";
import { timeToSec, type Pt } from "../_shared";
import type { Coords } from "../coords";
import { DEFAULT_STYLE, type DataPoint, type Drawing, type DrawingStyle } from "../types";
import type { Scene, SceneItem } from "./types";
import {
  sceneCrossLine,
  sceneExtendedSegment,
  sceneHorizontalLine,
  sceneHorizontalRay,
  sceneInfoLine,
  sceneTrendAngle,
  sceneTrendLine,
  sceneVerticalLine,
  statsBoxItems,
  tvStatRows,
  TREND_ANGLE_ARC_R,
  type StatRow,
} from "./lines";

/** Line-family kinds the audit can replay (the scene builders of lines.ts). */
export type AuditLineKind =
  | "horizontal-line"
  | "vertical-line"
  | "cross-line"
  | "horizontal-ray"
  | "trend-line"
  | "ray"
  | "extended-line"
  | "info-line"
  | "trend-angle"
  | "arrow";

/** Anchors each supported kind needs (the rest are reported unsupported). */
const KIND_ANCHORS: Record<AuditLineKind, number> = {
  "horizontal-line": 1,
  "vertical-line": 1,
  "cross-line": 1,
  "horizontal-ray": 1,
  "trend-line": 2,
  ray: 2,
  "extended-line": 2,
  "info-line": 2,
  "trend-angle": 2,
  arrow: 2,
};

/** Pure-data linear axis maps: enough to rebuild the stat-row texts. */
export type AuditCoordsDesc = {
  /** price = priceSlope * y + priceIntercept (screen y → price). */
  priceSlope: number;
  priceIntercept: number;
  /** time (epoch seconds) = timeSlope * x + timeIntercept (screen x → time). */
  timeSlope: number;
  timeIntercept: number;
  /** Pip size for the pips stat (default 0.01, the coords-less fallback). */
  pipSize?: number;
  /** Bar interval in seconds for the bars-range stat; absent/0 = no bar data
   *  (timeToBarIndex returns null, the stat reads "0 bars"). */
  barSeconds?: number;
};

/** The pure-data snapshot a scene render audit runs on. */
export type AuditSnapshot = {
  /** Drawing kind (a line-family kind; anything else reports unsupported). */
  kind: string;
  /** Pane size in px. */
  w: number;
  h: number;
  /** Anchor screen coordinates, in drawing-point order. */
  anchors: Pt[];
  /** DrawingStyle subset; unset fields fall back to DEFAULT_STYLE. */
  style?: Partial<DrawingStyle>;
  /** Linear axis maps for the stat-row texts; absent = the coords-less path
   *  (pip 0.01, "0 bars") with data points read off the screen (time = x,
   *  price = y). */
  coords?: AuditCoordsDesc;
  /** Selected / hovered state (drives anchors, the middle point and the
   *  stats badge's active visibility). */
  selected?: boolean;
  hovered?: boolean;
};

/** One ordered audit check. */
export type AuditCheck = { name: string; pass: boolean; reason?: string };

/** The stats box result: visibility and the final box geometry. */
export type AuditStatsBox = {
  visible: boolean;
  /** Top-left corner and size (px); null when the box is not drawn. */
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  rowCount: number;
};

/** The trend-angle arc (TREND_ANGLE_ARC_R around p0): ray start on the
 *  0-degree axis and the arc end point. Null for the other kinds. */
export type AuditTrendAngleArc = {
  start: Pt;
  end: Pt;
  radius: number;
  angleDeg: number;
};

/** The audit report: plain JSON-serializable data, no functions. */
export type SceneAudit = {
  kind: string;
  /** False = the audit could not run (unknown kind, too few anchors, or a
   *  builder failure); `reason` says why. */
  supported: boolean;
  reason?: string;
  /** Top-level scene item types in draw order — equal to
   *  `sceneBuilder(...).map((i) => i.t)` for the equivalent call. */
  itemTypes: string[];
  /** Depth-first item types, group children expanded in place. */
  flatItemTypes: string[];
  statsBox: AuditStatsBox;
  /** The stat rows (icon + final text) of the stats box. */
  statRows: { icon: StatRow["icon"]; text: string }[];
  trendAngleArc: AuditTrendAngleArc | null;
  /** True when the scene carries a label cut-out `clip` item. */
  hasLabelClip: boolean;
  checks: AuditCheck[];
};

/** A Coords from linear axis maps (the audit's coordinate description). Pure:
 *  no chart, no DOM; price lines / zoom are inert stubs never reached by the
 *  line scenes. */
export function coordsFromLinear(desc: AuditCoordsDesc): Coords {
  const { priceSlope, priceIntercept, timeSlope, timeIntercept } = desc;
  const pip = desc.pipSize ?? 0.01;
  const barSeconds = desc.barSeconds ?? 0;
  return {
    priceToY: (p) => (p - priceIntercept) / priceSlope,
    yToPrice: (y) => priceSlope * y + priceIntercept,
    isLog: () => false,
    timeToX: (t) => {
      const s = timeToSec(t);
      return s == null ? null : (s - timeIntercept) / timeSlope;
    },
    xToTime: (x) => (timeSlope * x + timeIntercept) as Time,
    barAt: () => null,
    timeToBarIndex: (t) => {
      const s = timeToSec(t);
      return s == null || !barSeconds ? null : Math.round((s - timeIntercept) / barSeconds);
    },
    barIndexToTime: (i) => (barSeconds ? (timeIntercept + i * barSeconds) as Time : null),
    bars: () => [],
    visibleTimeRange: () => null,
    indicatorValuesAt: () => [],
    pipSize: () => pip,
    addPriceLine: () => ({}) as ReturnType<Coords["addPriceLine"]>,
    removePriceLine: () => {},
    zoomToScreenRect: () => {},
    formatTime: (t) => String(t),
    timeAxis: () => ({ height: 0, width: 0, fontSize: 12, fontFamily: "sans-serif" }),
    timeInfo: () => ({ timeZone: "UTC", intraday: false }),
  };
}

const EMPTY_BOX: AuditStatsBox = { visible: false, x: null, y: null, w: null, h: null, rowCount: 0 };

function unsupported(kind: string, reason: string, checks: AuditCheck[]): SceneAudit {
  return {
    kind,
    supported: false,
    reason,
    itemTypes: [],
    flatItemTypes: [],
    statsBox: { ...EMPTY_BOX },
    statRows: [],
    trendAngleArc: null,
    hasLabelClip: false,
    checks,
  };
}

/** The style with defaults filled in (undefined snapshot fields dropped). */
function auditStyle(partial: Partial<DrawingStyle> | undefined): DrawingStyle {
  const s: DrawingStyle = { ...DEFAULT_STYLE };
  for (const [k, v] of Object.entries(partial ?? {})) {
    if (v !== undefined) (s as unknown as Record<string, unknown>)[k] = v;
  }
  return s;
}

/** The stats-box group inside a built scene (inert group over a #464646 rect). */
function statsGroupOf(scene: Scene): (SceneItem & { t: "group" }) | null {
  for (const it of scene) {
    if (it.t === "group" && it.inert) {
      const first = it.items[0];
      if (first && first.t === "rect" && first.fill === "#464646") return it;
    }
  }
  return null;
}

/** The box rect of a statsBoxItems result, or null when it drew nothing. */
function boxRectOf(items: SceneItem[]): { x: number; y: number; w: number; h: number } | null {
  const g = items[0];
  if (!g || g.t !== "group") return null;
  const r = g.items[0];
  return r && r.t === "rect" ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
}

/**
 * Audit the scene a line-tool snapshot renders to. Never throws: unknown
 * kinds, too few anchors and builder failures all come back as
 * `supported: false` with a human-readable reason.
 */
export function auditScene(snapshot: AuditSnapshot): SceneAudit {
  const checks: AuditCheck[] = [];
  const kind = snapshot.kind;
  const need = (KIND_ANCHORS as Record<string, number | undefined>)[kind];
  if (need == null) {
    checks.push({
      name: "kind-supported",
      pass: false,
      reason: `unknown kind "${kind}" (supported: ${Object.keys(KIND_ANCHORS).join(", ")})`,
    });
    return unsupported(kind, checks[0].reason ?? "unknown kind", checks);
  }
  checks.push({ name: "kind-supported", pass: true });

  const anchors = Array.isArray(snapshot.anchors) ? snapshot.anchors : [];
  if (anchors.length < need) {
    checks.push({
      name: "anchors-sufficient",
      pass: false,
      reason: `kind "${kind}" needs ${need} anchor(s), got ${anchors.length}`,
    });
    return unsupported(kind, checks[1].reason ?? "not enough anchors", checks);
  }
  checks.push({ name: "anchors-sufficient", pass: true });

  try {
    return runAudit(snapshot, kind as AuditLineKind, anchors.slice(0, need), checks);
  } catch (err) {
    const reason = `scene builder failed: ${err instanceof Error ? err.message : String(err)}`;
    checks.push({ name: "scene-built", pass: false, reason });
    return unsupported(kind, reason, checks);
  }
}

function runAudit(snapshot: AuditSnapshot, kind: AuditLineKind, pts: Pt[], checks: AuditCheck[]): SceneAudit {
  const w = snapshot.w;
  const h = snapshot.h;
  const s = auditStyle(snapshot.style);
  const selected = !!snapshot.selected;
  const active = selected || !!snapshot.hovered;
  const desc = snapshot.coords;
  const coords = desc ? coordsFromLinear(desc) : null;
  // Data points from the anchors through the inverse axis maps (no maps:
  // read the data point straight off the screen, time = x, price = y).
  const points = pts.map(
    (p): DataPoint =>
      desc
        ? { time: (desc.timeSlope * p.x + desc.timeIntercept) as Time, price: desc.priceSlope * p.y + desc.priceIntercept }
        : { time: p.x as Time, price: p.y },
  );
  const d = { id: "__audit__", kind, points, style: s } as unknown as Drawing;

  // The same dispatch sceneOf uses for the line family (index.ts buildScene).
  let scene: Scene;
  switch (kind) {
    case "horizontal-line":
      scene = sceneHorizontalLine(pts, selected, w, s);
      break;
    case "vertical-line":
      scene = sceneVerticalLine(pts, selected, h, s);
      break;
    case "cross-line":
      scene = sceneCrossLine(pts, selected, w, h, s);
      break;
    case "horizontal-ray":
      scene = sceneHorizontalRay(pts, selected, w, s);
      break;
    case "trend-line":
      scene = s.extendLeft || s.extendRight
        ? sceneExtendedSegment(d, pts, selected, w, h, s, !!s.extendLeft, !!s.extendRight, coords, active)
        : sceneTrendLine(d, pts, selected, w, h, s, coords, active);
      break;
    case "ray":
      scene = sceneExtendedSegment(d, pts, selected, w, h, s, s.extendLeft ?? false, s.extendRight ?? true, coords, active);
      break;
    case "extended-line":
      scene = sceneExtendedSegment(d, pts, selected, w, h, s, s.extendLeft ?? true, s.extendRight ?? true, coords, active);
      break;
    case "info-line":
      scene = sceneInfoLine(d, pts, selected, w, h, s, coords, active);
      break;
    case "trend-angle":
      scene = sceneTrendAngle(d, pts, selected, w, h, s, coords, active);
      break;
    case "arrow": {
      const as = { ...s, leftEnd: s.leftEnd ?? 0, rightEnd: s.rightEnd ?? 1 };
      scene = as.extendLeft || as.extendRight
        ? sceneExtendedSegment(d, pts, selected, w, h, as, !!as.extendLeft, !!as.extendRight, coords, active)
        : sceneTrendLine(d, pts, selected, w, h, as, coords, active);
      break;
    }
  }
  checks.push(
    scene.length
      ? { name: "scene-built", pass: true }
      : { name: "scene-built", pass: false, reason: "the scene builder returned an empty scene" },
  );

  // ── Stats box, re-derived straight from tvStatRows + statsBoxItems. ──────
  const twoPoint = pts.length >= 2;
  const a = pts[0];
  const b = pts[1];
  const rows: StatRow[] = twoPoint ? tvStatRows(d, a, b, s, coords, kind !== "trend-angle") : [];
  const statsPos = s.statsPosition ?? (kind === "info-line" ? 1 : 2);
  const boxItems = twoPoint ? statsBoxItems(a, b, rows, statsPos, active || !!s.showStats, w, h) : [];
  const rect = boxRectOf(boxItems);
  const statsBox: AuditStatsBox = rect
    ? { visible: true, x: rect.x, y: rect.y, w: rect.w, h: rect.h, rowCount: rows.length }
    : { ...EMPTY_BOX, rowCount: rows.length };

  // Cross-check the re-derived box against the one embedded in the scene.
  const sceneGroup = statsGroupOf(scene);
  const sceneRect = sceneGroup ? boxRectOf([sceneGroup]) : null;
  const boxMatch =
    rect === null && sceneRect === null
      ? true
      : rect !== null &&
        sceneRect !== null &&
        rect.x === sceneRect.x &&
        rect.y === sceneRect.y &&
        rect.w === sceneRect.w &&
        rect.h === sceneRect.h;
  checks.push(
    boxMatch
      ? { name: "stats-box-matches-scene", pass: true }
      : {
          name: "stats-box-matches-scene",
          pass: false,
          reason: `re-derived box ${JSON.stringify(rect)} != scene box ${JSON.stringify(sceneRect)}`,
        },
  );

  const sceneRowTexts = sceneGroup ? sceneGroup.items.filter((it) => it.t === "text").map((it) => (it as { text: string }).text) : [];
  // The rows the box actually draws (empty when the box is hidden).
  const boxGroup = boxItems[0];
  const boxRowTexts =
    boxGroup && boxGroup.t === "group" ? boxGroup.items.filter((it) => it.t === "text").map((it) => (it as { text: string }).text) : [];
  const rowsMatch =
    sceneRowTexts.length === boxRowTexts.length && sceneRowTexts.every((t, i) => t === boxRowTexts[i]);
  checks.push(
    rowsMatch
      ? { name: "stat-rows-match-scene", pass: true }
      : {
          name: "stat-rows-match-scene",
          pass: false,
          reason: `re-derived rows ${JSON.stringify(boxRowTexts)} != scene rows ${JSON.stringify(sceneRowTexts)}`,
        },
  );

  // ── Label cut-out clip. ──────────────────────────────────────────────────
  const clipNames = scene.filter((it) => it.t === "clip").map((it) => (it as { name: string }).name);
  const hasLabelClip = clipNames.length > 0;
  const dangling = clipNames.filter((name) => !scene.some((it) => "clip" in it && it.clip === name));
  checks.push(
    dangling.length === 0
      ? { name: "label-clip-referenced", pass: true }
      : { name: "label-clip-referenced", pass: false, reason: `clip(s) ${dangling.join(", ")} cut nothing` },
  );

  // ── Trend-angle arc. ─────────────────────────────────────────────────────
  let trendAngleArc: AuditTrendAngleArc | null = null;
  if (kind === "trend-angle") {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const angleDeg = s.angle ?? (Math.atan2(-dy, dx) * 180) / Math.PI;
    const th = (angleDeg * Math.PI) / 180;
    const r = TREND_ANGLE_ARC_R;
    trendAngleArc = {
      start: { x: a.x + r, y: a.y },
      end: { x: a.x + r * Math.cos(th), y: a.y - r * Math.sin(th) },
      radius: r,
      angleDeg,
    };
    const arcPath = `M ${a.x} ${a.y} L ${a.x + r} ${a.y} A ${r} ${r} 0 ${Math.abs(th) > Math.PI ? 1 : 0} ${th > 0 ? 0 : 1} ${trendAngleArc.end.x} ${trendAngleArc.end.y}`;
    checks.push(
      scene.some((it) => it.t === "path" && it.d === arcPath)
        ? { name: "arc-path-matches-scene", pass: true }
        : { name: "arc-path-matches-scene", pass: false, reason: `no arc path "${arcPath}" in the scene` },
    );
  }

  // ── Item type sequences. ─────────────────────────────────────────────────
  const itemTypes = scene.map((it) => it.t);
  const flatItemTypes: string[] = [];
  const walk = (items: SceneItem[]) => {
    for (const it of items) {
      flatItemTypes.push(it.t);
      if (it.t === "group") walk(it.items);
    }
  };
  walk(scene);

  const report: SceneAudit = {
    kind,
    supported: true,
    itemTypes,
    flatItemTypes,
    statsBox,
    statRows: rows.map((r) => ({ icon: r.icon, text: r.text })),
    trendAngleArc,
    hasLabelClip,
    checks,
  };

  // The report must stay JSON-serializable (no functions, no cycles).
  try {
    const roundTrip = JSON.parse(JSON.stringify({ ...report, checks: [] })) as Record<string, unknown>;
    checks.push(
      roundTrip && typeof roundTrip === "object"
        ? { name: "json-serializable", pass: true }
        : { name: "json-serializable", pass: false, reason: "JSON round-trip lost the report" },
    );
  } catch (err) {
    checks.push({
      name: "json-serializable",
      pass: false,
      reason: `JSON.stringify failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  return report;
}
