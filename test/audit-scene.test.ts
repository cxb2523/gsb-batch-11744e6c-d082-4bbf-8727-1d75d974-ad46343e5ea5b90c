/**
 * Scene render audit (src/core/scene/audit-scene.ts): the audit of a pure
 * snapshot must match the real scene builders item-for-item — trend line
 * stats box at statsPosition 2, Auto (3) hiding off-pane, the horizontal
 * line's middle-label cut-out — and must report `unsupported` (never throw)
 * for unknown kinds and missing anchors.
 */
import { describe, expect, it } from "vitest";
import type { Time } from "lightweight-charts";
import { auditScene, type AuditCoordsDesc } from "../src/core/scene/audit-scene";
import {
  sceneHorizontalLine,
  sceneTrendAngle,
  sceneTrendLine,
  statsBoxItems,
  tvStatRows,
} from "../src/core/scene/lines";
import type { Coords } from "../src/core/coords";
import type { Drawing, DrawingStyle } from "../src/core/types";
import type { Pt } from "../src/core/_shared";

// Text is measured on a canvas; under Node there is none and the core falls back to an estimate.
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ getContext: () => null }) };

const W = 800;
const H = 500;

/** Linear axis maps shared by the audit snapshot and the equivalent Coords. */
const DESC: Required<AuditCoordsDesc> = {
  priceSlope: -0.5, // price = 250 - 0.5 * y
  priceIntercept: 250,
  timeSlope: 60, // time = 1_700_000_000 + 60 * x (1 px = 1 minute)
  timeIntercept: 1_700_000_000,
  pipSize: 0.01,
  barSeconds: 300,
};

/** An independently written Coords implementing the same linear maps. */
function testCoords(): Coords {
  return {
    priceToY: (p) => (p - DESC.priceIntercept) / DESC.priceSlope,
    yToPrice: (y) => DESC.priceSlope * y + DESC.priceIntercept,
    isLog: () => false,
    timeToX: (t) => ((t as number) - DESC.timeIntercept) / DESC.timeSlope,
    xToTime: (x) => (DESC.timeSlope * x + DESC.timeIntercept) as Time,
    barAt: () => null,
    timeToBarIndex: (t) => Math.round(((t as number) - DESC.timeIntercept) / DESC.barSeconds),
    barIndexToTime: (i) => (DESC.timeIntercept + i * DESC.barSeconds) as Time,
    bars: () => [],
    visibleTimeRange: () => null,
    indicatorValuesAt: () => [],
    pipSize: () => DESC.pipSize,
    addPriceLine: () => ({}) as ReturnType<Coords["addPriceLine"]>,
    removePriceLine: () => {},
    zoomToScreenRect: () => {},
    formatTime: (t) => String(t),
    timeAxis: () => ({ height: 0, width: 0, fontSize: 12, fontFamily: "sans-serif" }),
    timeInfo: () => ({ timeZone: "UTC", intraday: false }),
  };
}

const dataPoint = (p: Pt) => ({
  time: (DESC.timeSlope * p.x + DESC.timeIntercept) as Time,
  price: DESC.priceSlope * p.y + DESC.priceIntercept,
});

const STATS_STYLE: DrawingStyle = {
  color: "#2962ff",
  width: 2,
  lineStyle: "solid",
  showStats: true,
  statsPosition: 2,
  showPriceRange: true,
  showPercentPriceRange: true,
  showBarsRange: true,
  showAngle: true,
};

describe("auditScene: trend line with stats at statsPosition 2", () => {
  const anchors: Pt[] = [
    { x: 100, y: 300 },
    { x: 400, y: 100 },
  ];
  const drawing: Drawing = {
    id: "t1",
    kind: "trend-line",
    points: [dataPoint(anchors[0]), dataPoint(anchors[1])],
    style: STATS_STYLE,
  };
  const audit = auditScene({ kind: "trend-line", w: W, h: H, anchors, style: STATS_STYLE, coords: DESC });
  const scene = sceneTrendLine(drawing, anchors, false, W, H, STATS_STYLE, testCoords(), false);

  it("is supported and every check passes", () => {
    expect(audit.supported).toBe(true);
    expect(audit.checks.map((c) => c.name)).toEqual([
      "kind-supported",
      "anchors-sufficient",
      "scene-built",
      "stats-box-matches-scene",
      "stat-rows-match-scene",
      "label-clip-referenced",
      "json-serializable",
    ]);
    for (const c of audit.checks) expect(c.pass, c.reason).toBe(true);
  });

  it("reports the scene item type sequence of sceneTrendLine, item for item", () => {
    expect(audit.itemTypes).toEqual(scene.map((i) => i.t));
  });

  it("reports the stats box of statsBoxItems exactly", () => {
    const rows = tvStatRows(drawing, anchors[0], anchors[1], STATS_STYLE, testCoords(), true);
    const box = statsBoxItems(anchors[0], anchors[1], rows, 2, true, W, H);
    const group = box[0];
    expect(group?.t).toBe("group");
    const rect = group.t === "group" ? group.items[0] : null;
    expect(rect?.t).toBe("rect");
    if (!rect || rect.t !== "rect") return;
    expect(audit.statsBox).toEqual({ visible: true, x: rect.x, y: rect.y, w: rect.w, h: rect.h, rowCount: rows.length });
    // Anchor = p1 (statsPosition 2), 12px right, below the anchor (line runs up-right).
    expect(audit.statsBox.x).toBe(Math.floor(anchors[1].x + 12));
    expect(audit.statsBox.y).toBe(Math.floor(anchors[1].y + 12));
  });

  it("reports the stat row texts of tvStatRows under an equivalent Coords", () => {
    const rows = tvStatRows(drawing, anchors[0], anchors[1], STATS_STYLE, testCoords(), true);
    expect(rows.length).toBe(3); // price, bars, angle
    expect(audit.statRows.map((r) => r.text)).toEqual(rows.map((r) => r.text));
    expect(audit.statRows.map((r) => r.icon)).toEqual(rows.map((r) => r.icon));
  });

  it("has no trend-angle arc and no label clip", () => {
    expect(audit.trendAngleArc).toBeNull();
    expect(audit.hasLabelClip).toBe(false);
    expect(JSON.parse(JSON.stringify(audit))).toBeTruthy();
  });
});

describe("auditScene: unsupported inputs report, never throw", () => {
  it("trend line with a single anchor is unsupported", () => {
    let audit: ReturnType<typeof auditScene> | null = null;
    expect(() => {
      audit = auditScene({ kind: "trend-line", w: W, h: H, anchors: [{ x: 10, y: 20 }], style: STATS_STYLE, coords: DESC });
    }).not.toThrow();
    expect(audit!.supported).toBe(false);
    expect(audit!.reason).toBe('kind "trend-line" needs 2 anchor(s), got 1');
    expect(audit!.itemTypes).toEqual([]);
    expect(audit!.statsBox.visible).toBe(false);
    const failed = audit!.checks.filter((c) => !c.pass);
    expect(failed.map((c) => c.name)).toEqual(["anchors-sufficient"]);
    expect(() => JSON.stringify(audit)).not.toThrow();
  });

  it("an unknown kind is unsupported", () => {
    const audit = auditScene({ kind: "fib-retracement", w: W, h: H, anchors: [{ x: 1, y: 2 }], style: {} });
    expect(audit.supported).toBe(false);
    expect(audit.reason).toMatch(/unknown kind "fib-retracement"/);
    expect(audit.checks[0]).toMatchObject({ name: "kind-supported", pass: false });
  });
});

describe("auditScene: Auto statsPosition with the segment fully off-pane", () => {
  const style: DrawingStyle = { ...STATS_STYLE, statsPosition: 3 };
  // Both anchors right of the pane: the segment never touches it.
  const anchors: Pt[] = [
    { x: 900, y: 100 },
    { x: 1100, y: 300 },
  ];
  const drawing: Drawing = {
    id: "t2",
    kind: "trend-line",
    points: [dataPoint(anchors[0]), dataPoint(anchors[1])],
    style,
  };
  const audit = auditScene({ kind: "trend-line", w: W, h: H, anchors, style, coords: DESC });
  const scene = sceneTrendLine(drawing, anchors, false, W, H, style, testCoords(), false);

  it("hides the stats box, exactly like statsBoxItems", () => {
    const rows = tvStatRows(drawing, anchors[0], anchors[1], style, testCoords(), true);
    expect(rows.length).toBeGreaterThan(0); // rows exist; Auto visibility hides the box
    expect(statsBoxItems(anchors[0], anchors[1], rows, 3, true, W, H)).toEqual([]);
    expect(audit.supported).toBe(true);
    expect(audit.statsBox).toEqual({ visible: false, x: null, y: null, w: null, h: null, rowCount: rows.length });
    expect(audit.statRows.map((r) => r.text)).toEqual(rows.map((r) => r.text));
    // The real scene carries no stats group either, and the audit sees that.
    expect(scene.some((i) => i.t === "group" && i.inert && i.items[0]?.t === "rect")).toBe(false);
    expect(audit.itemTypes).toEqual(scene.map((i) => i.t));
    for (const c of audit.checks) expect(c.pass, c.reason).toBe(true);
  });
});

describe("auditScene: horizontal line middle label cuts the line", () => {
  const style: DrawingStyle = {
    color: "#2962ff",
    width: 1,
    lineStyle: "solid",
    text: "cut me",
    vertLabelsAlign: "middle",
    horzLabelsAlign: "center",
    fontSize: 12,
  };
  const anchors: Pt[] = [{ x: 50, y: 250 }];
  const audit = auditScene({ kind: "horizontal-line", w: W, h: H, anchors, style });
  const scene = sceneHorizontalLine(anchors, false, W, style);

  it("produces a clip cut-out item referenced by the line", () => {
    expect(audit.supported).toBe(true);
    expect(audit.hasLabelClip).toBe(true);
    expect(audit.itemTypes).toEqual(scene.map((i) => i.t));
    expect(audit.itemTypes).toContain("clip");
    const clip = scene.find((i) => i.t === "clip");
    expect(clip && clip.t === "clip" ? clip.name : null).toBe("cut");
    const line = scene.find((i) => i.t === "line");
    expect(line && "clip" in line ? line.clip : null).toBe("cut");
    // No stats on a one-point kind.
    expect(audit.statsBox.visible).toBe(false);
    expect(audit.statRows).toEqual([]);
    for (const c of audit.checks) expect(c.pass, c.reason).toBe(true);
  });

  it("reports no clip when the label sits above the line", () => {
    const above = auditScene({
      kind: "horizontal-line",
      w: W,
      h: H,
      anchors,
      style: { ...style, vertLabelsAlign: "top" },
    });
    expect(above.hasLabelClip).toBe(false);
    expect(above.itemTypes).not.toContain("clip");
  });
});

describe("auditScene: trend angle arc endpoints", () => {
  const anchors: Pt[] = [
    { x: 200, y: 300 },
    { x: 500, y: 150 },
  ];
  const style: DrawingStyle = { color: "#2962ff", width: 1, lineStyle: "solid", showStats: true, showPriceRange: true };
  const drawing: Drawing = {
    id: "t3",
    kind: "trend-angle",
    points: [dataPoint(anchors[0]), dataPoint(anchors[1])],
    style,
  };
  const audit = auditScene({ kind: "trend-angle", w: W, h: H, anchors, style, coords: DESC });
  const scene = sceneTrendAngle(drawing, anchors, false, W, H, style, testCoords(), false);

  it("reports the arc endpoints of the 50px arc at p0", () => {
    expect(audit.supported).toBe(true);
    expect(audit.itemTypes).toEqual(scene.map((i) => i.t));
    const angleDeg = (Math.atan2(-(anchors[1].y - anchors[0].y), anchors[1].x - anchors[0].x) * 180) / Math.PI;
    const th = (angleDeg * Math.PI) / 180;
    expect(audit.trendAngleArc).toEqual({
      start: { x: anchors[0].x + 50, y: anchors[0].y },
      end: { x: anchors[0].x + 50 * Math.cos(th), y: anchors[0].y - 50 * Math.sin(th) },
      radius: 50,
      angleDeg,
    });
    expect(audit.statsBox.visible).toBe(true);
    for (const c of audit.checks) expect(c.pass, c.reason).toBe(true);
  });
});
