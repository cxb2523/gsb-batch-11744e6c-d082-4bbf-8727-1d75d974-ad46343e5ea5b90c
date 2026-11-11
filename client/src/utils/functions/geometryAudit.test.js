import fs from "fs";
import path from "path";
import * as THREE from "three";
import { auditClippingSnapshot, auditOffsetSTL, POSITION_EPSILON, OFFSET_EPSILON } from "./geometryAudit";

const vecToPlain = (vector) => ({
  x: Object.is(vector.x, -0) ? 0 : vector.x,
  y: Object.is(vector.y, -0) ? 0 : vector.y,
  z: Object.is(vector.z, -0) ? 0 : vector.z,
});

const approxEqual = (actual, expected, epsilon = 1e-9) =>
  Math.abs(actual.x - expected.x) <= epsilon && Math.abs(actual.y - expected.y) <= epsilon && Math.abs(actual.z - expected.z) <= epsilon;

const allChecksPassed = (report) => report.checks.every((item) => item.passed);
const failedChecks = (report) => report.checks.filter((item) => !item.passed);

describe("geometryAudit module constraints", () => {
  const source = fs.readFileSync(path.join(__dirname, "geometryAudit.js"), "utf8");

  it("does not import three", () => {
    expect(source).not.toMatch(/from\s+["']three/);
    expect(source).not.toMatch(/require\(\s*["']three/);
  });

  it("does not access window or document", () => {
    expect(source).not.toMatch(/\bwindow\s*(?:\.|\[)/);
    expect(source).not.toMatch(/\bdocument\s*(?:\.|\[)/);
  });

  it("does not read or write the file system", () => {
    expect(source).not.toMatch(/\bfs\s*(?:\.|\[)/);
    expect(source).not.toMatch(/readFile|writeFile|require\(\s*["']fs["']\s*\)|from\s+["']fs["']/);
  });

  const assertJsonSerializable = (value) => {
    const roundTrip = JSON.parse(JSON.stringify(value));
    expect(roundTrip).toEqual(value);

    const visit = (node) => {
      if (node === null || node === undefined) {
        return;
      }
      expect(typeof node).not.toBe("function");
      if (Array.isArray(node)) {
        node.forEach(visit);
      } else if (typeof node === "object") {
        expect(["Object", "Array"]).toContain(node.constructor.name);
        Object.values(node).forEach(visit);
      }
    };
    visit(value);
  };

  it("produces JSON-serializable reports for both entries", () => {
    const clippingReport = auditClippingSnapshot(
      {
        planes: [
          {
            center: { x: 0, y: 0, z: 0 },
            normal: { x: 1, y: 0, z: 0 },
            boundingBoxCenter: { x: 0, y: 0, z: 0 },
          },
        ],
        meshes: [{ name: "Femur", color: "#ff0000", clips: true }],
      },
      undefined,
    );
    const offsetReport = auditOffsetSTL("solid x\nendsolid x", 1);
    assertJsonSerializable(clippingReport);
    assertJsonSerializable(offsetReport);
  });
});

describe("auditClippingSnapshot", () => {
  // Two planes: plane 0 has a positive barycenter distance, plane 1 a negative one.
  const planes = [
    {
      center: { x: 0, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      boundingBoxCenter: { x: 0, y: 0, z: 0 },
    },
    {
      center: { x: 10, y: 0, z: 0 },
      normal: { x: 1, y: 0, z: 0 },
      boundingBoxCenter: { x: 10, y: 0, z: 0 },
    },
  ];
  const meshes = [
    { name: "Femur", color: "#ff0000", clips: true },
    { name: "Tibia", color: "#00ff00", clips: true },
  ];

  it("negates exactly the plane with negative barycenter distance and matches THREE.Plane math", () => {
    const report = auditClippingSnapshot({ planes, meshes });

    // Barycenter of the bounding-box centers: ((0+10)/2, 0, 0)
    expect(report.barycenter).toEqual({ x: 5, y: 0, z: 0 });

    // Cross-check every plane against the actual three implementation used by the source.
    const barycenter = new THREE.Vector3(5, 0, 0);
    planes.forEach((item, index) => {
      const threePlane = new THREE.Plane();
      threePlane.setFromNormalAndCoplanarPoint(
        new THREE.Vector3(item.normal.x, item.normal.y, item.normal.z),
        new THREE.Vector3(item.center.x, item.center.y, item.center.z),
      );
      const distance = threePlane.distanceToPoint(barycenter);
      const shouldNegate = distance < 0;
      if (shouldNegate) {
        threePlane.negate();
      }
      const coplanar = threePlane.coplanarPoint(new THREE.Vector3());

      const audited = report.planes[index];
      expect(audited.barycenterDistance).toBeCloseTo(distance, 10);
      expect(audited.negated).toBe(shouldNegate);
      expect(typeof audited.negateReason).toBe("string");
      expect(audited.negateReason).not.toBe("");
      expect(audited.effectiveNormal).toEqual(vecToPlain(threePlane.normal));
      expect(audited.effectiveConstant).toBeCloseTo(threePlane.constant, 10);
      expect(approxEqual(audited.coplanarPoint, vecToPlain(coplanar), POSITION_EPSILON)).toBe(true);
    });

    expect(report.planes[0].negated).toBe(false);
    expect(report.planes[0].negateReason).toMatch(/non-negative/);
    expect(report.planes[1].negated).toBe(true);
    expect(report.planes[1].negateReason).toMatch(/negative/);

    // Negated plane: normal flips and constant flips sign.
    expect(report.planes[1].effectiveNormal).toEqual({ x: -1, y: 0, z: 0 });
    expect(report.planes[1].effectiveConstant).toBeCloseTo(10, 10);
    expect(report.planes[1].coplanarPoint).toEqual({ x: 10, y: 0, z: 0 });
  });

  it("replays stencil groups and caps with source names, positions, colors and render orders", () => {
    const report = auditClippingSnapshot({ planes, meshes });
    const active = report.meshPlanes.filter((record) => !record.skipped);
    expect(active).toHaveLength(4);

    // Source order: outer loop over meshes, inner over planes, y++ per pair.
    const expected = [
      { mesh: "Femur", plane: 0, y: 0, capPosition: { x: 0, y: 0, z: 0 }, orientation: { x: -1, y: 0, z: 0 }, clipping: [1] },
      { mesh: "Femur", plane: 1, y: 1, capPosition: { x: 10, y: 0, z: 0 }, orientation: { x: 1, y: 0, z: 0 }, clipping: [0] },
      { mesh: "Tibia", plane: 0, y: 2, capPosition: { x: 0, y: 0, z: 0 }, orientation: { x: -1, y: 0, z: 0 }, clipping: [1] },
      { mesh: "Tibia", plane: 1, y: 3, capPosition: { x: 10, y: 0, z: 0 }, orientation: { x: 1, y: 0, z: 0 }, clipping: [0] },
    ];

    expected.forEach((item, index) => {
      const record = active[index];
      const meshColor = meshes.find((mesh) => mesh.name === item.mesh).color;

      expect(record.meshName).toBe(item.mesh);
      expect(record.planeIndex).toBe(item.plane);
      expect(record.stencilGroup.name).toBe(`planeStencilGroup${item.mesh}`);
      expect(record.stencilGroup.renderOrder).toBe(item.y);
      expect(record.cap.name).toBe(`Clipping${item.mesh}`);
      expect(record.cap.color).toBe(meshColor);
      expect(record.cap.renderOrder).toBe(item.y + 0.1);
      expect(record.cap.position).toEqual(item.capPosition);
      expect(record.cap.orientation).toEqual(item.orientation);
      expect(record.cap.clippingPlaneIndexes).toEqual(item.clipping);
      expect(record.cap.excludesOwnPlane).toBe(true);
    });

    expect(allChecksPassed(report)).toBe(true);
    expect(failedChecks(report)).toEqual([]);

    // Every required rule family is represented in the ordered check list.
    const names = report.checks.map((item) => item.name);
    expect(names.some((name) => name.includes("cap-color-matches-mesh-color"))).toBe(true);
    expect(names.some((name) => name.includes("cap-position-matches-coplanar-point"))).toBe(true);
    expect(names.some((name) => name.includes("cap-clipping-planes-exclude-own-plane"))).toBe(true);
    expect(names.some((name) => name.includes("render-order-follows-y-sequence"))).toBe(true);
    expect(names.some((name) => name.includes("negation-rule"))).toBe(true);
    expect(names.some((name) => name === "render-order-monotonic-sequence")).toBe(true);
  });

  it("skips meshes flagged as not participating in clipping", () => {
    const report = auditClippingSnapshot({
      planes,
      meshes: [
        { name: "Femur", color: "#ff0000", clips: true },
        { name: "Screw", color: "#0000ff", clips: false },
      ],
    });
    const screwRecords = report.meshPlanes.filter((record) => record.meshName === "Screw");
    expect(screwRecords.every((record) => record.skipped && record.stencilGroup === null && record.cap === null)).toBe(true);
    // y sequence only counts the participating Femur pairs.
    const femurRecords = report.meshPlanes.filter((record) => record.meshName === "Femur");
    expect(femurRecords.map((record) => record.orderIndex)).toEqual([0, 1]);
  });

  it("does not negate a plane whose barycenter distance is positive and explains why", () => {
    const report = auditClippingSnapshot({
      planes: [
        {
          center: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 0, z: 1 },
          boundingBoxCenter: { x: 0, y: 0, z: 5 },
        },
      ],
      meshes: [{ name: "Femur", color: "#ff0000", clips: true }],
    });

    const plane = report.planes[0];
    expect(plane.barycenterDistance).toBeCloseTo(5, 10);
    expect(plane.negated).toBe(false);
    expect(plane.effectiveNormal).toEqual({ x: 0, y: 0, z: 1 });
    expect(plane.negateReason).toMatch(/kept as-is/);
    expect(plane.negateReason).toMatch(/5/);
  });

  it("treats a zero barycenter distance as non-negative (no negation)", () => {
    const report = auditClippingSnapshot({
      planes: [
        {
          center: { x: 0, y: 0, z: 0 },
          normal: { x: 0, y: 1, z: 0 },
          boundingBoxCenter: { x: 0, y: 0, z: 0 },
        },
      ],
      meshes: [],
    });
    expect(report.planes[0].barycenterDistance).toBe(0);
    expect(report.planes[0].negated).toBe(false);
  });

  it("flags a mismatched observed cap color and clipping plane set with readable reasons", () => {
    const observed = {
      meshPlanes: [
        {
          meshName: "Femur",
          planeIndex: 0,
          stencilGroupName: "planeStencilGroupFemur",
          stencilRenderOrder: 0,
          capName: "ClippingFemur",
          capColor: "#123456",
          capRenderOrder: 0.1,
          capPosition: { x: 0, y: 0, z: 0 },
          capOrientation: { x: -1, y: 0, z: 0 },
          capClippingPlaneIndexes: [0, 1],
        },
        {
          meshName: "Femur",
          planeIndex: 1,
          stencilGroupName: "planeStencilGroupFemur",
          stencilRenderOrder: 1,
          capName: "ClippingFemur",
          capColor: "#ff0000",
          capRenderOrder: 1.1,
          capPosition: { x: 10, y: 0, z: 0 },
          capOrientation: { x: 1, y: 0, z: 0 },
          capClippingPlaneIndexes: [0],
        },
        {
          meshName: "Tibia",
          planeIndex: 0,
          stencilGroupName: "planeStencilGroupTibia",
          stencilRenderOrder: 2,
          capName: "ClippingTibia",
          capColor: "#00ff00",
          capRenderOrder: 2.1,
          capPosition: { x: 0, y: 0, z: 0 },
          capOrientation: { x: -1, y: 0, z: 0 },
          capClippingPlaneIndexes: [1],
        },
        {
          meshName: "Tibia",
          planeIndex: 1,
          stencilGroupName: "planeStencilGroupTibia",
          stencilRenderOrder: 3,
          capName: "ClippingTibia",
          capColor: "#00ff00",
          capRenderOrder: 3.1,
          capPosition: { x: 10, y: 0, z: 0 },
          capOrientation: { x: 1, y: 0, z: 0 },
          capClippingPlaneIndexes: [0],
        },
      ],
    };
    const report = auditClippingSnapshot({ planes, meshes }, observed);
    const failures = failedChecks(report);
    expect(failures.some((item) => item.name.includes("cap-color-matches-mesh-color") && item.reason.includes("#123456"))).toBe(true);
    expect(failures.some((item) => item.name.includes("cap-clipping-planes-exclude-own-plane"))).toBe(true);
    failures.forEach((item) => {
      expect(typeof item.reason).toBe("string");
      expect(item.reason.length).toBeGreaterThan(0);
    });
  });
});

describe("auditOffsetSTL", () => {
  // Two triangles sharing vertices (0,0,0) and (1,0,0).
  const stlText = [
    "solid audit",
    "facet normal 0 0 1",
    "  outer loop",
    "    vertex 0 0 0",
    "    vertex 1 0 0",
    "    vertex 0 1 0",
    "  endloop",
    "endfacet",
    "facet normal 0 1 0",
    "  outer loop",
    "    vertex 0 0 0",
    "    vertex 0 0 1",
    "    vertex 1 0 0",
    "  endloop",
    "endfacet",
    "endsolid audit",
  ].join("\n");

  it("parses faces, counts vertices and reports merged shared-vertex groups", () => {
    const report = auditOffsetSTL(stlText, 2);

    expect(report.faceCount).toBe(2);
    expect(report.vertexCount).toBe(6);
    expect(report.uniqueVertexCount).toBe(4);
    expect(report.mergedGroupCount).toBe(2);

    const sharedOrigin = report.vertices.find((vertex) => vertex.key === "0|0|0");
    const sharedEdge = report.vertices.find((vertex) => vertex.key === "1|0|0");
    expect(sharedOrigin.merged).toBe(true);
    expect(sharedOrigin.occurrenceCount).toBe(2);
    expect(sharedEdge.merged).toBe(true);
    expect(sharedEdge.occurrenceCount).toBe(2);

    // Each face exposes its original STL normal and a recomputed unit normal.
    expect(report.faces[0].originalNormal).toEqual([0, 0, 1]);
    expect(report.faces[1].originalNormal).toEqual([0, 1, 0]);
    report.faces.forEach((face) => {
      expect(face.recomputedNormal).toHaveLength(3);
      const length = Math.hypot(face.recomputedNormal[0], face.recomputedNormal[1], face.recomputedNormal[2]);
      expect(Math.abs(length - 1)).toBeLessThanOrEqual(OFFSET_EPSILON);
    });
  });

  it("moves every unique vertex by exactly the absolute offset along the merged normal", () => {
    const report = auditOffsetSTL(stlText, 2);

    report.vertices.forEach((vertex) => {
      expect(Math.abs(vertex.displacementLength - 2)).toBeLessThanOrEqual(OFFSET_EPSILON);
      vertex.newCoordinates.forEach((value, component) => {
        expect(value).toBeCloseTo(vertex.originalCoordinates[component] + 2 * vertex.offsetDirection[component], 10);
      });
    });

    // The shared vertex direction is the normalized sum of the two face normals.
    const sharedOrigin = report.vertices.find((vertex) => vertex.key === "0|0|0");
    const expectedDirection = [0, 1 / Math.sqrt(2), 1 / Math.sqrt(2)];
    expectedDirection.forEach((value, component) => {
      expect(sharedOrigin.offsetDirection[component]).toBeCloseTo(value, 10);
    });

    expect(allChecksPassed(report)).toBe(true);
  });

  it("keeps every coordinate unchanged when the offset is 0 (boundary path)", () => {
    const report = auditOffsetSTL(stlText, 0);

    expect(() => auditOffsetSTL(stlText, 0)).not.toThrow();
    report.vertices.forEach((vertex) => {
      expect(vertex.displacementLength).toBe(0);
      expect(vertex.newCoordinates).toEqual(vertex.originalCoordinates);
    });
    report.faces.forEach((face) => {
      expect(face.newVertices).toEqual(face.originalVertices);
    });
    expect(allChecksPassed(report)).toBe(true);
    expect(report.checks.some((item) => item.name.includes("zero-offset-keeps-coordinates"))).toBe(true);
  });

  it("returns an empty result with a readable reason for empty or facet-less text and never throws", () => {
    const emptyReports = [auditOffsetSTL("", 1), auditOffsetSTL("this is not an stl file", 1), auditOffsetSTL("solid empty\nendsolid empty", 1)];

    emptyReports.forEach((report) => {
      expect(report.faceCount).toBe(0);
      expect(report.vertexCount).toBe(0);
      expect(report.uniqueVertexCount).toBe(0);
      expect(report.mergedGroupCount).toBe(0);
      expect(report.faces).toEqual([]);
      expect(report.vertices).toEqual([]);
      const facetCheck = report.checks.find((item) => item.name === "stl-contains-facets");
      expect(facetCheck).toBeDefined();
      expect(facetCheck.passed).toBe(false);
      expect(typeof facetCheck.reason).toBe("string");
      expect(facetCheck.reason.length).toBeGreaterThan(0);
    });

    expect(() => auditOffsetSTL(undefined, 1)).not.toThrow();
    expect(auditOffsetSTL(undefined, 1).faceCount).toBe(0);
  });

  it("produces a JSON-serializable offset report without class instances or functions", () => {
    const report = auditOffsetSTL(stlText, -1.5);
    const json = JSON.stringify(report);
    expect(typeof json).toBe("string");
    expect(JSON.parse(json)).toEqual(report);

    const visit = (node) => {
      if (node === null || node === undefined) {
        return;
      }
      expect(typeof node).not.toBe("function");
      if (typeof node === "object") {
        expect(["Object", "Array"]).toContain(node.constructor.name);
        Object.values(node).forEach(visit);
      }
    };
    visit(report);

    // Negative offset: displacement length still equals |offset|.
    report.vertices.forEach((vertex) => {
      expect(Math.abs(vertex.displacementLength - 1.5)).toBeLessThanOrEqual(OFFSET_EPSILON);
    });
  });
});
