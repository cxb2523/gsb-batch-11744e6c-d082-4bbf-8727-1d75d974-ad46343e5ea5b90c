import { BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector2, Vector3 } from 'three';
import { revivalGlsl, revivalUniforms } from '../art/revival';
import { PALETTE, toonShared } from '../art/toon';
import { groundAt, walk } from './layout';

/** Flowing water for the workshop: stream, tail race and troughs share one
 * mesh. `uFill.x` advances the stream front from the spring to the wheel,
 * `uFill.y` the tail race to the terrace troughs (which also rise). Water is
 * paper-colored until the area revives, like everything else. */

export function createFlowMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'UnspoolFlow',
    uniforms: {
      ...revivalUniforms,
      ...toonShared,
      uFill: { value: new Vector2(0, 0) },
      uLen: { value: new Vector2(1, 1) },
      uDeep: { value: new Color('#3d9fb5') },
      uShallow: { value: new Color(PALETTE.water) },
      uFoam: { value: new Color('#f4fbf6') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uFill;
      attribute float aU;
      attribute float aGroup;
      attribute float aDrop;
      varying float vU;
      varying float vGroup;
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 up = normalize(w.xyz);
        float rise = smoothstep(0.82, 1.0, uFill.y);
        w.xyz -= up * aDrop * (1.0 - rise) * step(0.5, aGroup);
        w.xyz += up * sin(uTime * 2.0 + aU * 3.0) * 0.006;
        vU = aU; vGroup = aGroup; vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${revivalGlsl}
      uniform float uTime;
      uniform vec2 uFill;
      uniform vec2 uLen;
      uniform vec3 uDeep, uShallow, uFoam, uPaper, uFringe;
      varying float vU;
      varying float vGroup;
      varying vec3 vWorld;
      void main() {
        float fill = vGroup < 0.5 ? uFill.x : uFill.y;
        float len = vGroup < 0.5 ? uLen.x : uLen.y;
        float front = fill * (len + 0.4);
        if (vU >= front) discard;
        float behind = front - vU;
        float stripes = sin(vU * 9.0 - uTime * 3.2 + sin(vWorld.x * 6.0 + vWorld.z * 4.0) * 0.8);
        stripes *= sin(vU * 3.1 - uTime * 1.7 + vWorld.y * 5.0);
        vec3 color = mix(uDeep, uShallow, 0.55 + 0.3 * stripes);
        color = mix(color, uFoam, step(0.78, stripes) * 0.7);
        color = mix(uFoam, color, smoothstep(0.0, 0.22, behind));
        vec2 life = revivalAt(vWorld);
        vec3 paper = uPaper * mix(0.84, 0.95, 0.5 + 0.5 * stripes);
        color = mix(paper, color, life.x);
        color = mix(color, uFringe, life.y * 0.4);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

/** Builder for the shared water geometry. Quads are added along polylines. */
export class FlowGeometry {
  private positions: number[] = [];
  private u: number[] = [];
  private group: number[] = [];
  private drop: number[] = [];
  length = [0, 0];

  /** Ribbon along unit directions with explicit bed radii (so aqueducts can float). */
  stream(line: Vector3[], radii: number[], width: number, group: 0 | 1, startU = 0): number {
    let u = startU;
    const sides = line.map((p, i) => {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      const t = b.clone().sub(a).projectOnPlane(p).normalize();
      return new Vector3().crossVectors(p, t).normalize();
    });
    const corner = (i: number, j: number) => {
      const n = walk(line[i], sides[i], (j - 0.5) * width);
      return n.multiplyScalar(radii[i]);
    };
    for (let i = 0; i + 1 < line.length; i++) {
      const a = corner(i, 0), b = corner(i, 1), c = corner(i + 1, 1), d = corner(i + 1, 0);
      const seg = line[i].angleTo(line[i + 1]) * 14;
      const u0 = u, u1 = u + seg;
      this.tri(a, c, b, u0, u1, u0, group);
      this.tri(a, d, c, u0, u1, u1, group);
      u = u1;
    }
    this.length[group] = Math.max(this.length[group], u);
    return u;
  }

  /** Flat surface quad (troughs, pools) at a fixed U with a vertical drop when empty. */
  quad(corners: Vector3[], uAt: number, group: 0 | 1, drop: number): void {
    const [a, b, c, d] = corners;
    this.tri(a, b, c, uAt, uAt, uAt, group, drop);
    this.tri(a, c, d, uAt, uAt, uAt, group, drop);
  }

  private tri(a: Vector3, b: Vector3, c: Vector3, ua: number, ub: number, uc: number, group: number, drop = 0): void {
    for (const [p, u] of [[a, ua], [b, ub], [c, uc]] as [Vector3, number][]) {
      this.positions.push(p.x, p.y, p.z);
      this.u.push(u); this.group.push(group); this.drop.push(drop);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    g.setAttribute('aU', new BufferAttribute(new Float32Array(this.u), 1));
    g.setAttribute('aGroup', new BufferAttribute(new Float32Array(this.group), 1));
    g.setAttribute('aDrop', new BufferAttribute(new Float32Array(this.drop), 1));
    g.computeBoundingSphere();
    return g;
  }
}

void groundAt;
