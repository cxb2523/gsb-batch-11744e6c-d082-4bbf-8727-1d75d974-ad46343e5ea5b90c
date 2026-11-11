import { BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, Vector3 } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PLANET_RADIUS, SEA_RADIUS } from '../chapter/data';
import { PALETTE } from '../art/toon';
import { mulberry32, shade, toColor } from './kit';
import { terrainHeight, WADE_DEPTH } from './terrain';

/** Faceted terrain shell (non-indexed, flat shaded) with biome vertex colors,
 * a chunked render split for frustum culling, and the invisible walls that
 * keep the player out of water deeper than WADE_DEPTH. */

export type PaintHook = (n: Vector3, height: number, color: Color) => void;

export interface TerrainBuild {
  /** Complete shell, used for collision and ground queries. */
  geometry: BufferGeometry;
  /** Eight octant pieces of the same shell for culling. */
  chunks: BufferGeometry[];
}

export function buildTerrain(detail: number, hooks: PaintHook[]): TerrainBuild {
  let source = new IcosahedronGeometry(1, detail) as BufferGeometry;
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  source = mergeVertices(source, 1e-5);
  const position = source.getAttribute('position') as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    v.multiplyScalar(terrainHeight(v));
    position.setXYZ(i, v.x, v.y, v.z);
  }
  const geometry = source.toNonIndexed();
  geometry.computeVertexNormals();
  const pos = geometry.getAttribute('position') as BufferAttribute;
  const nor = geometry.getAttribute('normal') as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const random = mulberry32(2024);
  const grass = toColor(PALETTE.grass), light = toColor(PALETTE.grassLight), sand = toColor(PALETTE.sand);
  const wet = shade(PALETTE.sand, -0.16), rock = toColor(PALETTE.rock);
  const seabed = shade(PALETTE.sand, -0.28);
  const meadow = shade(PALETTE.grass, -0.07);
  const centroid = new Vector3(), face = new Vector3(), up = new Vector3(), color = new Color();
  for (let i = 0; i < pos.count; i += 3) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k++) centroid.add(v.fromBufferAttribute(pos, i + k));
    centroid.divideScalar(3);
    face.fromBufferAttribute(nor, i);
    const height = centroid.length();
    up.copy(centroid).normalize();
    const slope = face.dot(up);
    const n = Math.sin(up.x * 21 + up.y * 7) * Math.sin(up.z * 17 - up.y * 11);
    const m = Math.sin(up.x * 7.3 + 1.7) * Math.sin(up.z * 6.1 + up.y * 5.3);
    if (height < SEA_RADIUS - WADE_DEPTH + 0.05) color.copy(seabed);
    else if (height < SEA_RADIUS + 0.02) color.copy(wet);
    else if (height < SEA_RADIUS + 0.11) color.copy(sand).lerp(wet, Math.max(0, 1 - (height - SEA_RADIUS) / 0.06) * 0.45);
    else if (height < SEA_RADIUS + 0.23) color.copy(sand).lerp(grass, (height - SEA_RADIUS - 0.11) / 0.12 * 0.8);
    else color.copy(grass).lerp(light, Math.min(1, Math.max(0, 0.5 + 0.7 * n + 0.45 * m)));
    if (height >= SEA_RADIUS + 0.23 && m < -0.55) color.lerp(meadow, 0.65);
    if (slope < 0.8 && height > SEA_RADIUS + 0.4) color.lerp(rock, Math.min(1, (0.8 - slope) * 6));
    if (height > PLANET_RADIUS + 2.55) color.lerp(rock, 0.45);
    for (const hook of hooks) hook(up, height, color);
    const j = 1 + (random() - 0.5) * 0.05;
    for (let k = 0; k < 3; k++) colors.set([color.r * j, color.g * j, color.b * j], (i + k) * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return { geometry, chunks: splitOctants(geometry) };
}

function splitOctants(geometry: BufferGeometry): BufferGeometry[] {
  const pos = geometry.getAttribute('position') as BufferAttribute;
  const nor = geometry.getAttribute('normal') as BufferAttribute;
  const col = geometry.getAttribute('color') as BufferAttribute;
  const buckets: number[][] = Array.from({ length: 8 }, () => []);
  for (let i = 0; i < pos.count; i += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cx += pos.getX(i + k); cy += pos.getY(i + k); cz += pos.getZ(i + k); }
    buckets[(cx > 0 ? 1 : 0) | (cy > 0 ? 2 : 0) | (cz > 0 ? 4 : 0)].push(i);
  }
  return buckets.filter(b => b.length).map(faces => {
    const p = new Float32Array(faces.length * 9), n = new Float32Array(faces.length * 9), c = new Float32Array(faces.length * 9);
    faces.forEach((start, f) => {
      for (let k = 0; k < 3; k++) {
        const o = f * 9 + k * 3;
        p[o] = pos.getX(start + k); p[o + 1] = pos.getY(start + k); p[o + 2] = pos.getZ(start + k);
        n[o] = nor.getX(start + k); n[o + 1] = nor.getY(start + k); n[o + 2] = nor.getZ(start + k);
        c[o] = col.getX(start + k); c[o + 1] = col.getY(start + k); c[o + 2] = col.getZ(start + k);
      }
    });
    const chunk = new BufferGeometry();
    chunk.setAttribute('position', new BufferAttribute(p, 3));
    chunk.setAttribute('normal', new BufferAttribute(n, 3));
    chunk.setAttribute('color', new BufferAttribute(c, 3));
    chunk.computeBoundingSphere();
    return chunk;
  });
}

/** Region where the wall is left open (piers, docks, boat ramps). */
export type OpenTest = (point: Vector3) => boolean;

const WALL_TOP = SEA_RADIUS + 1.75;
const WALL_BOTTOM = SEA_RADIUS - WADE_DEPTH - 1.1;

/** Vertical walls along the WADE_DEPTH contour, front faces toward deep water.
 * Returns world-space triangle positions. */
export function buildSeaBlockers(terrain: BufferGeometry, open: OpenTest): Float32Array {
  const pos = terrain.getAttribute('position') as BufferAttribute;
  const threshold = SEA_RADIUS - WADE_DEPTH;
  const out: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const pts: Vector3[] = [];
  const deepDir = new Vector3(), shallowDir = new Vector3();
  const push = (p: Vector3, radius: number) => {
    const q = p.clone().normalize().multiplyScalar(radius);
    out.push(q.x, q.y, q.z);
  };
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const vs = [a.clone(), b.clone(), c.clone()];
    const below = vs.map(vertex => vertex.length() < threshold);
    const count = below.filter(Boolean).length;
    if (count === 0 || count === 3) continue;
    pts.length = 0;
    deepDir.set(0, 0, 0); shallowDir.set(0, 0, 0);
    for (let k = 0; k < 3; k++) (below[k] ? deepDir : shallowDir).add(vs[k]);
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3;
      if (below[k] === below[j]) continue;
      const rk = vs[k].length(), rj = vs[j].length();
      const t = (threshold - rk) / (rj - rk);
      pts.push(vs[k].clone().lerp(vs[j], t));
    }
    if (pts.length !== 2) continue;
    const mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
    if (open(mid) || open(pts[0]) || open(pts[1])) continue;
    const upMid = mid.clone().normalize();
    const toDeep = deepDir.divideScalar(count).sub(shallowDir.divideScalar(3 - count)).projectOnPlane(upMid).normalize();
    const along = pts[1].clone().sub(pts[0]);
    // Winding so that the front face looks toward the deep side.
    const normal = new Vector3().crossVectors(along, upMid);
    const [p0, p1] = normal.dot(toDeep) > 0 ? [pts[0], pts[1]] : [pts[1], pts[0]];
    // quad: p0 bottom, p1 bottom, p1 top, p0 top; normal = (p1-p0) x up must face deep.
    push(p0, WALL_BOTTOM); push(p1, WALL_BOTTOM); push(p1, WALL_TOP);
    push(p0, WALL_BOTTOM); push(p1, WALL_TOP); push(p0, WALL_TOP);
  }
  return new Float32Array(out);
}
