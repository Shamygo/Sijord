import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paintPropMaterial } from './materials';

/** Uniforms shared by every animated world material. */
export const worldUniforms = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.45) },
  uFocus: { value: new THREE.Vector3() },
};

/** Collects vertex-coloured primitives and merges them into one geometry (one draw call). */
export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly c = new THREE.Color();

  get count(): number {
    return this.parts.length;
  }

  /** Add a geometry, transformed by (pos, rotation, scale), coloured uniformly or by a per-vertex function. */
  add(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation | ((x: number, y: number, z: number, ny: number) => THREE.Color),
    pos: [number, number, number] = [0, 0, 0],
    rot: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
  ): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    this.e.set(rot[0], rot[1], rot[2], 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(pos[0], pos[1], pos[2]), this.q, this.s.set(scale[0], scale[1], scale[2]));
    g.applyMatrix4(this.m);
    const pa = g.attributes.position as THREE.BufferAttribute;
    const na = g.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pa.count * 3);
    if (typeof color === 'function') {
      for (let i = 0; i < pa.count; i++) {
        const cc = color(pa.getX(i), pa.getY(i), pa.getZ(i), na.getY(i));
        col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      }
    } else {
      this.c.set(color);
      for (let i = 0; i < pa.count; i++) {
        col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  /** Add an already-built geometry with a transform matrix (keeps its colours if it has them). */
  addMatrix(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color?: THREE.ColorRepresentation): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(matrix);
    if (color !== undefined || !g.attributes.color) {
      this.c.set(color ?? 0xffffff);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = this.c.r; col[i * 3 + 1] = this.c.g; col[i * 3 + 2] = this.c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    this.parts.push(g);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Triangular prism (gable roof body): width along X, depth along Z, apex height h, base at y=0. */
export function prismGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** A canvas texture with centred text on a wooden board, for signs. */
export function signTexture(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = opts.bg ?? '#9a6a3c';
  ctx.fillRect(0, 0, w, h);
  // wood grain
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(60,35,15,${0.08 + (i % 3) * 0.04})`;
    ctx.lineWidth = 2 + (i % 4);
    ctx.beginPath();
    const y = (i / 26) * h + Math.sin(i * 7.1) * 6;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(50,28,10,0.6)';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = opts.fg ?? '#fff6e0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.floor((h * 0.62) / lines.length);
  ctx.font = opts.font ?? `bold ${size}px Georgia, 'Times New Roman', serif`;
  ctx.shadowColor = 'rgba(40,20,5,0.7)';
  ctx.shadowBlur = 6;
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h * ((i + 0.5) / lines.length) * 0.9 + h * 0.05, w * .9));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Shared materials. */
export const mats = {
  vc: paintPropMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), 'vc'),
  vcLambert: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color(0xffb347), emissiveIntensity: 1.4, roughness: 0.6 }),
};
