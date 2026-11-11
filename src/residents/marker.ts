import { BufferAttribute, BufferGeometry, Color, Mesh } from 'three';
import { createToonMaterial } from '../art/toon';
import * as P from '../character/parts';
import type { Raw } from '../character/skin';

/** The floating speech bubble ("...") that marks a resident with something new
 * to say. One shared geometry/material for every resident (always colored,
 * self-lit). Built from code: cream bubble, a little tail, three ink dots on
 * both faces so it reads from either side. */

const BUBBLE = '#fff4d6', INK = '#2a2c3a', RIM = '#ffcf4a';

function merge(parts: { raw: Raw; color: string; at?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] }[]): BufferGeometry {
  const p: number[] = [], n: number[] = [], c: number[] = [], index: number[] = [];
  const color = new Color();
  for (const part of parts) {
    const base = p.length / 3;
    color.set(part.color);
    const [sx, sy, sz] = part.scale ?? [1, 1, 1];
    const [rx, ry, rz] = part.rot ?? [0, 0, 0];
    const [ox, oy, oz] = part.at ?? [0, 0, 0];
    const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
    const rotate = (x: number, y: number, z: number): [number, number, number] => {
      // YXZ order: Rz first, then Rx, then Ry
      let x1 = x * cz - y * szr, y1 = x * szr + y * cz, z1 = z;
      const y2 = y1 * cx - z1 * sxr, z2 = y1 * sxr + z1 * cx; y1 = y2; z1 = z2;
      const x3 = x1 * cy + z1 * syr, z3 = -x1 * syr + z1 * cy; x1 = x3; z1 = z3;
      return [x1, y1, z1];
    };
    for (let v = 0; v < part.raw.p.length; v += 3) {
      const [x, y, z] = rotate(part.raw.p[v] * sx, part.raw.p[v + 1] * sy, part.raw.p[v + 2] * sz);
      p.push(x + ox, y + oy, z + oz);
      const [nx, ny, nz] = rotate(part.raw.n[v] / sx, part.raw.n[v + 1] / sy, part.raw.n[v + 2] / sz);
      const length = Math.hypot(nx, ny, nz) || 1;
      n.push(nx / length, ny / length, nz / length);
      c.push(color.r, color.g, color.b);
    }
    for (const i of part.raw.i) index.push(base + i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(p), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(n), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(c), 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

let shared: { geometry: BufferGeometry; material: ReturnType<typeof createToonMaterial> } | undefined;

export function createMarker(): Mesh {
  if (!shared) {
    const parts: Parameters<typeof merge>[0] = [
      { raw: P.ellipsoid(1, 1, 1, 18, 10), color: BUBBLE, scale: [0.17, 0.125, 0.06] },
      { raw: P.lathe([{ r: 0, y: 0.06 }, { r: 0.05, y: 0.0 }, { r: 0.015, y: -0.075 }, { r: 0, y: -0.085 }], 6), color: BUBBLE, at: [0.0, -0.165, 0], scale: [1, 1, 0.5] },
      { raw: P.torus(0.172, 0.012, 24, 5), color: RIM, scale: [1.0, 0.73, 1], at: [0, 0, 0.0] },
    ];
    for (const sign of [1, -1]) {
      for (const x of [-0.075, 0, 0.075]) parts.push({ raw: P.ellipsoid(0.026, 0.026, 0.012, 8, 6), color: INK, at: [x * sign, 0, sign * 0.056] });
    }
    shared = {
      geometry: merge(parts),
      material: createToonMaterial({ vertexColors: true, alwaysAlive: true, emissive: 0.9, castShadow: false, name: 'ResidentMarker' }),
    };
  }
  const mesh = new Mesh(shared.geometry, shared.material);
  mesh.name = 'ResidentMarker';
  mesh.castShadow = false;
  mesh.userData.noShadowCast = true;
  return mesh;
}
