import * as THREE from 'three';
import { fbm, hash2i, mulberry32, smoothstep, valueNoise } from './noise';
import { worldUniforms } from './shared';
import type { TerrainQuery } from './terrain';
import type { Collider } from './types';

// ---------------------------------------------------------------------------------------------
// Materials with wind sway
// ---------------------------------------------------------------------------------------------

/** Lambert material whose vertices above `pivot` sway gently in the wind (trees, bushes). */
export function makeFoliageMaterial(amount: number, pivot: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWind = worldUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        #if defined(USE_BATCHING)
          vec3 ip = vec3(batchingMatrix[3][0], batchingMatrix[3][1], batchingMatrix[3][2]);
        #elif defined(USE_INSTANCING)
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        #endif
        float hgt = max(position.y - ${pivot.toFixed(2)}, 0.0);
        float ph = ip.x * 0.13 + ip.z * 0.17;
        float sw = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7 + position.x) * 0.25;
        transformed.xz += uWind * sw * hgt * ${amount.toFixed(4)};`);
  };
  mat.customProgramCacheKey = () => `foliage-${amount}-${pivot}`;
  return mat;
}

/** Grass / flower material: instanced tufts that fade out around the focus radius, sway and bend away from the player. */
function makeGrassMaterial(radius: number, petals: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWind = worldUniforms.uWind;
    shader.uniforms.uFocus = worldUniforms.uFocus;
    shader.uniforms.uRadius = { value: radius };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; uniform vec3 uFocus; uniform float uRadius;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        vec2 away = ip.xz - uFocus.xz;
        float dist = length(away);
        float fade = 1.0 - smoothstep(uRadius * 0.62, uRadius, dist);
        transformed *= fade;
        float k = position.y * position.y * 1.6;
        float gust = sin(uTime * 1.1 + ip.x * 0.05 + ip.z * 0.04) * 0.5 + 0.5;
        float w = sin(uTime * 2.4 + ip.x * 0.45 + ip.z * 0.37) * 0.55 + sin(uTime * 4.1 + ip.x * 1.3 - ip.z * 0.7) * 0.2;
        vec2 wv = uWind * (w * (0.35 + gust * 0.65) + gust * 0.6) * 0.45;
        float push = smoothstep(1.4, 0.2, dist);
        wv += normalize(away + 1e-4) * push * 0.9;
        mat3 gIm = mat3(instanceMatrix);
        float s2 = max(dot(gIm[0], gIm[0]), 1e-4);
        vec3 lw = transpose(gIm) * vec3(wv.x, -push * 0.3, wv.y) / s2;
        transformed += lw * k;`)
      .replace('#include <color_vertex>', petals
        ? /* glsl */ `vColor = vec4(color, 1.0); if (color.r > 0.9 && color.g > 0.9) vColor.rgb *= instanceColor.rgb;`
        : '#include <color_vertex>');
    // blades are lit like the ground below them on both sides
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => `grass-${petals}`;
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

type Blob = [number, number, number, number];
interface Palette { dark: number; mid: number; light: number; }

function noise3(x: number, y: number, z: number, seed: number): number {
  return (valueNoise(x * 1.3 + z * 0.7, y * 1.3, seed) + valueNoise(z * 1.3 - y * 0.5, x * 1.3, seed + 7)) * 0.5;
}

function canopy(blobs: Blob[], pal: Palette, detail: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let cx = 0, cy = 0, cz = 0, minY = Infinity, maxY = -Infinity;
  for (const b of blobs) { cx += b[0]; cy += b[1]; cz += b[2]; minY = Math.min(minY, b[1] - b[3]); maxY = Math.max(maxY, b[1] + b[3]); }
  cx /= blobs.length; cy /= blobs.length; cz /= blobs.length;
  const dark = new THREE.Color(pal.dark), mid = new THREE.Color(pal.mid), light = new THREE.Color(pal.light);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();
  blobs.forEach((b, bi) => {
    const g = new THREE.IcosahedronGeometry(b[3], detail);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      nb.copy(v).normalize();
      const n = noise3(v.x * 0.9 + bi, v.y * 0.9, v.z * 0.9, seed);
      v.addScaledVector(nb, b[3] * (n - 0.5) * 0.38);
      v.x += b[0]; v.y += b[1] - (nb.y < -0.3 ? b[3] * 0.18 : 0); v.z += b[2];
      pos.setXYZ(i, v.x, v.y, v.z);
      nc.set(v.x - cx, (v.y - cy) * 0.8, v.z - cz).normalize();
      nc.lerp(nb, 0.3).normalize();
      nor.setXYZ(i, nc.x, nc.y, nc.z);
      const t = (v.y - minY) / (maxY - minY);
      c.copy(dark).lerp(mid, smoothstep(0.05, 0.6, t));
      c.lerp(light, smoothstep(0.1, 0.95, nc.y) * smoothstep(0.35, 1.0, t) * 0.85);
      const sp = noise3(v.x * 2.5, v.y * 2.5, v.z * 2.5, seed + 3);
      c.multiplyScalar(0.88 + sp * 0.24);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  });
  return mergeAll(parts);
}

function trunk(h: number, r0: number, r1: number, segs: number, color: number, branches: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const g = new THREE.CylinderGeometry(r1, r0, h, segs, 2);
  g.translate(0, h / 2, 0);
  parts.push(g);
  if (branches) {
    const b1 = new THREE.CylinderGeometry(r1 * 0.45, r1 * 0.7, h * 0.5, 5);
    b1.translate(0, h * 0.25, 0); b1.rotateZ(0.7); b1.translate(0.1, h * 0.7, 0);
    parts.push(b1);
    const b2 = new THREE.CylinderGeometry(r1 * 0.4, r1 * 0.65, h * 0.45, 5);
    b2.translate(0, h * 0.22, 0); b2.rotateX(-0.7); b2.translate(0, h * 0.65, 0.1);
    parts.push(b2);
  }
  const c = new THREE.Color(color);
  const c2 = new THREE.Color();
  for (const p of parts) {
    p.deleteAttribute('uv');
    const pos = p.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      c2.copy(c).multiplyScalar(0.75 + 0.35 * Math.min(1, pos.getY(i) / h));
      col[i * 3] = c2.r; col[i * 3 + 1] = c2.g; col[i * 3 + 2] = c2.b;
    }
    p.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return mergeAll(parts);
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const ni = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let total = 0;
  for (const p of ni) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of ni) {
    if (!p.attributes.normal) p.computeVertexNormals();
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const TRUNK = 0x7a5232;

export interface TreeKind { hi: THREE.BufferGeometry; lo: THREE.BufferGeometry; radius: number; }

export function makeTreeKinds(): Record<string, TreeKind> {
  const green: Palette = { dark: 0x2f7428, mid: 0x55a830, light: 0xaedb4f };
  const fresh: Palette = { dark: 0x367a2a, mid: 0x66b834, light: 0xc4e25c };
  const blue: Palette = { dark: 0x276a32, mid: 0x46963c, light: 0x96cf5c };
  const pine: Palette = { dark: 0x1b4d28, mid: 0x2f7438, light: 0x6aa84c };
  const round: Blob[] = [[0, 4.4, 0, 2.3], [1.3, 3.8, 0.5, 1.7], [-1.2, 3.9, -0.6, 1.8], [0.2, 5.6, -0.2, 1.5], [-0.3, 3.7, 1.3, 1.5]];
  const tall: Blob[] = [[0, 4.2, 0, 1.7], [0.3, 5.6, 0.2, 1.45], [-0.2, 6.8, -0.1, 1.1], [0.1, 4.3, -0.8, 1.3]];
  const wide: Blob[] = [[0, 4.8, 0, 2.4], [2.1, 4.1, 0.5, 1.9], [-2.0, 4.2, -0.4, 2.0], [0.5, 4.0, 2.0, 1.8], [-0.4, 4.1, -2.0, 1.8]];
  const pineGeo = (lowDetail: boolean): THREE.BufferGeometry => {
    const parts: THREE.BufferGeometry[] = [];
    const tiers = lowDetail ? [[1.8, 2.3, 3.2]] : [[2.0, 2.4, 1.5], [3.4, 2.0, 1.25], [4.6, 1.6, 1.0], [5.6, 1.0, 0.8]];
    const dark = new THREE.Color(pine.dark), light = new THREE.Color(pine.light), c = new THREE.Color();
    for (const [y, r, hgt] of tiers) {
      const g = new THREE.ConeGeometry(r, hgt * 1.6, lowDetail ? 6 : 9, 1, lowDetail);
      g.translate(0, y + hgt * 0.8, 0);
      g.deleteAttribute('uv');
      const pos = g.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        c.copy(dark).lerp(light, smoothstep(y, y + hgt * 1.6, pos.getY(i)) * 0.8);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g);
    }
    parts.push(trunk(2.4, 0.28, 0.2, lowDetail ? 4 : 6, TRUNK, false));
    return mergeAll(parts);
  };
  const lo = (blobs: Blob[], pal: Palette, th: number) => {
    let cx = 0, cy = 0, cz = 0, r = 0;
    for (const b of blobs) { cx += b[0]; cy += b[1]; cz += b[2]; }
    cx /= blobs.length; cy /= blobs.length; cz /= blobs.length;
    for (const b of blobs) r = Math.max(r, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3] * 0.8);
    return mergeAll([trunk(th, 0.3, 0.22, 4, TRUNK, false), canopy([[cx, cy, cz, r * 0.92]], pal, 0, 5)]);
  };
  return {
    round: { hi: mergeAll([trunk(3.0, 0.34, 0.24, 7, TRUNK, true), canopy(round, green, 1, 11)]), lo: lo(round, green, 3.0), radius: 0.45 },
    tall: { hi: mergeAll([trunk(3.4, 0.3, 0.2, 7, TRUNK, true), canopy(tall, blue, 1, 12)]), lo: lo(tall, blue, 3.4), radius: 0.4 },
    wide: { hi: mergeAll([trunk(3.0, 0.42, 0.3, 7, TRUNK, true), canopy(wide, fresh, 1, 13)]), lo: lo(wide, fresh, 3.0), radius: 0.55 },
    pine: { hi: pineGeo(false), lo: pineGeo(true), radius: 0.4 },
  };
}

export function makeBushGeometry(lowDetail: boolean): THREE.BufferGeometry {
  const pal: Palette = { dark: 0x2a6a22, mid: 0x55a830, light: 0xa5d84c };
  if (lowDetail) return canopy([[0, 0.55, 0, 0.95]], pal, 0, 21);
  return canopy([[0, 0.6, 0, 0.8], [0.6, 0.45, 0.2, 0.6], [-0.5, 0.45, -0.25, 0.62]], pal, 1, 21);
}

export function makeRockGeometry(seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise3(v.x * 1.6, v.y * 1.6, v.z * 1.6, seed);
    v.multiplyScalar(0.8 + n * 0.45);
    v.y *= 0.62;
    if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.3;
    pos.setXYZ(i, v.x, v.y + 0.2, v.z);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const grey = new THREE.Color(0xbab4a8), dark = new THREE.Color(0x8e897f), moss = new THREE.Color(0x6aa83a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(dark).lerp(grey, smoothstep(-0.1, 0.8, pos.getY(i)));
    c.lerp(moss, smoothstep(0.55, 0.9, nor.getY(i)) * 0.8);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function grassTuftGeometry(): THREE.BufferGeometry {
  const rnd = mulberry32(99);
  const pos: number[] = [];
  const col: number[] = [];
  const base = 0.68, tip = 1.06;
  const blades = 8;
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 0.34;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const h = 0.26 + rnd() * 0.3;
    const w = 0.08 + rnd() * 0.05;
    const face = rnd() * Math.PI;
    const fx = Math.cos(face) * w, fz = Math.sin(face) * w;
    const lean = 0.12 + rnd() * 0.12;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    const p0 = [ox - fx, 0, oz - fz], p1 = [ox + fx, 0, oz + fz];
    const m0 = [ox - fx * 0.7 + lx * 0.4, h * 0.5, oz - fz * 0.7 + lz * 0.4], m1 = [ox + fx * 0.7 + lx * 0.4, h * 0.5, oz + fz * 0.7 + lz * 0.4];
    const t = [ox + lx, h, oz + lz];
    const cm = (base + tip) / 2;
    const tri = (a1: number[], c1: number, a2: number[], c2: number, a3: number[], c3: number) => {
      pos.push(...a1, ...a2, ...a3);
      col.push(c1, c1, c1 * 0.92, c2, c2, c2 * 0.92, c3, c3 * 1.02, c3 * 0.85);
    };
    tri(p0, base, p1, base, m1, cm);
    tri(p0, base, m1, cm, m0, cm);
    tri(m0, cm, m1, cm, t, tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const green = [0.18, 0.45, 0.12];
  const H = 0.32;
  // stem (two crossed thin quads)
  for (const [dx, dz] of [[0.012, 0], [0, 0.012]]) {
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, H, dz, -dx, 0, -dz, dx, H, dz, -dx, H, -dz);
    for (let i = 0; i < 6; i++) col.push(...green);
  }
  // 5 petals around a centre
  const petals = 5;
  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2;
    const a1 = a - 0.42, a2 = a + 0.42;
    const r = 0.1;
    pos.push(0, H, 0, Math.cos(a1) * r, H + 0.02, Math.sin(a1) * r, Math.cos(a) * r * 1.3, H + 0.035, Math.sin(a) * r * 1.3);
    pos.push(0, H, 0, Math.cos(a) * r * 1.3, H + 0.035, Math.sin(a) * r * 1.3, Math.cos(a2) * r, H + 0.02, Math.sin(a2) * r);
    for (let i = 0; i < 6; i++) col.push(1, 1, 1);
  }
  // centre
  for (let p = 0; p < 5; p++) {
    const a = (p / 5) * Math.PI * 2, b = ((p + 1) / 5) * Math.PI * 2;
    pos.push(0, H + 0.05, 0, Math.cos(b) * 0.03, H + 0.04, Math.sin(b) * 0.03, Math.cos(a) * 0.03, H + 0.04, Math.sin(a) * 0.03);
    for (let i = 0; i < 3; i++) col.push(1.0, 0.75, 0.15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export const FLOWER_COLORS = [0xfff4d0, 0xffd21f, 0xff5c9a, 0x9a6bff, 0xff5533, 0x5fb8ff].map((c) => new THREE.Color(c));

export function makeFlowerMaterial(): THREE.MeshLambertMaterial {
  return makeGrassMaterial(1e5, true);
}

// ---------------------------------------------------------------------------------------------
// Batched vegetation (one draw call per material, per-instance culling, 2-level LOD)
// ---------------------------------------------------------------------------------------------

interface BatchItem { id: number; x: number; z: number; hi: number; lo: number; isHi: boolean; }

export class VegBatch {
  readonly mesh: THREE.BatchedMesh;
  private readonly geoIds = new Map<THREE.BufferGeometry, number>();
  private readonly items: BatchItem[] = [];
  private readonly last = new THREE.Vector3(1e9, 0, 1e9);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  constructor(geos: THREE.BufferGeometry[], maxInstances: number, material: THREE.Material, private readonly lodDist: number, name: string) {
    let verts = 0;
    const uniq = [...new Set(geos)];
    for (const g of uniq) verts += g.attributes.position.count;
    this.mesh = new THREE.BatchedMesh(maxInstances, verts, 0, material);
    for (const g of uniq) this.geoIds.set(g, this.mesh.addGeometry(g));
    this.mesh.sortObjects = false;
    this.mesh.perObjectFrustumCulled = true;
    this.mesh.name = name;
    this.mesh.receiveShadow = true;
  }

  add(hi: THREE.BufferGeometry, lo: THREE.BufferGeometry, x: number, y: number, z: number, rot: number, sx: number, sy: number, color: THREE.Color): void {
    const hiId = this.geoIds.get(hi)!;
    const loId = this.geoIds.get(lo)!;
    const id = this.mesh.addInstance(loId);
    this.q.setFromAxisAngle(this.up, rot);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sx));
    this.mesh.setMatrixAt(id, this.m);
    this.mesh.setColorAt(id, color);
    this.items.push({ id, x, z, hi: hiId, lo: loId, isHi: false });
  }

  update(focus: THREE.Vector3): void {
    const dx = focus.x - this.last.x, dz = focus.z - this.last.z;
    if (dx * dx + dz * dz < 16) return;
    this.last.copy(focus);
    const d2 = this.lodDist * this.lodDist;
    for (const it of this.items) {
      if (it.hi === it.lo) continue;
      const ex = it.x - focus.x, ez = it.z - focus.z;
      const near = ex * ex + ez * ez < d2;
      if (near !== it.isHi) {
        it.isHi = near;
        this.mesh.setGeometryIdAt(it.id, near ? it.hi : it.lo);
      }
    }
  }

  get count(): number {
    return this.items.length;
  }
}

// ---------------------------------------------------------------------------------------------
// Grass + flowers around the focus
// ---------------------------------------------------------------------------------------------

export class GrassField {
  readonly group = new THREE.Group();
  private readonly grass: THREE.InstancedMesh;
  private readonly flowers: THREE.InstancedMesh;
  private readonly last = new THREE.Vector3(1e9, 0, 1e9);
  private readonly col = new THREE.Color();
  private readonly spacing = 0.7;
  constructor(
    private readonly terrain: TerrainQuery,
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly radius = 38,
  ) {
    const n = Math.ceil((radius * 2) / this.spacing) + 1;
    const max = Math.ceil(n * n * 0.8);
    this.grass = new THREE.InstancedMesh(grassTuftGeometry(), makeGrassMaterial(radius, false), max);
    this.grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grass.setColorAt(0, this.col.set(1, 1, 1));
    this.grass.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.grass.count = 0;
    this.grass.name = 'grass';
    this.flowers = new THREE.InstancedMesh(flowerGeometry(), makeGrassMaterial(radius, true), 6000);
    this.flowers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flowers.setColorAt(0, this.col.set(1, 1, 1));
    this.flowers.frustumCulled = false;
    this.flowers.receiveShadow = true;
    this.flowers.count = 0;
    this.flowers.name = 'flowers';
    this.group.add(this.grass, this.flowers);
  }

  update(focus: THREE.Vector3): void {
    const dx = focus.x - this.last.x, dz = focus.z - this.last.z;
    if (dx * dx + dz * dz < 2.5 * 2.5) return;
    this.last.copy(focus);
    this.rebuild(focus.x, focus.z);
  }

  private rebuild(fx: number, fz: number): void {
    const sp = this.spacing;
    const R = this.radius;
    const i0 = Math.floor((fx - R) / sp), i1 = Math.ceil((fx + R) / sp);
    const j0 = Math.floor((fz - R) / sp), j1 = Math.ceil((fz + R) / sp);
    const gm = this.grass.instanceMatrix.array as Float32Array;
    const gc = this.grass.instanceColor!.array as Float32Array;
    const fm = this.flowers.instanceMatrix.array as Float32Array;
    const fc = this.flowers.instanceColor!.array as Float32Array;
    const gMax = this.grass.instanceMatrix.count;
    const fMax = this.flowers.instanceMatrix.count;
    let g = 0, f = 0;
    const R2 = R * R;
    const t = this.terrain;
    const col = this.col;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const h1 = hash2i(i, j, 71);
        const h2 = hash2i(i, j, 72);
        const x = (i + h1) * sp;
        const z = (j + h2) * sp;
        const ddx = x - fx, ddz = z - fz;
        if (ddx * ddx + ddz * ddz > R2) continue;
        const gw = t.grassAt(x, z);
        const h3 = hash2i(i, j, 73);
        if (h3 > gw * 1.15 - 0.05) continue;
        if (this.blocked(x, z)) continue;
        const y = t.heightAt(x, z) - 0.02;
        const rot = h1 * 6.283;
        const c = Math.cos(rot), s = Math.sin(rot);
        const h4 = hash2i(i, j, 74);
        const flowerD = smoothstep(0.6, 0.78, fbm(x / 22, z / 22, 2, 808)) * 0.12 + 0.004;
        if (h4 < flowerD && f < fMax) {
          const sc = 1.1 + h2 * 0.7;
          const o = f * 16;
          fm[o] = c * sc; fm[o + 1] = 0; fm[o + 2] = -s * sc; fm[o + 3] = 0;
          fm[o + 4] = 0; fm[o + 5] = sc * (0.8 + h3 * 0.6); fm[o + 6] = 0; fm[o + 7] = 0;
          fm[o + 8] = s * sc; fm[o + 9] = 0; fm[o + 10] = c * sc; fm[o + 11] = 0;
          fm[o + 12] = x; fm[o + 13] = y; fm[o + 14] = z; fm[o + 15] = 1;
          // patches share a colour
          const pick = Math.floor(valueNoise(x / 9, z / 9, 809) * FLOWER_COLORS.length * 0.999 + (h4 < flowerD * 0.15 ? 2 : 0)) % FLOWER_COLORS.length;
          const fcol = FLOWER_COLORS[pick];
          fc[f * 3] = fcol.r; fc[f * 3 + 1] = fcol.g; fc[f * 3 + 2] = fcol.b;
          f++;
        }
        if (g >= gMax) continue;
        const sc = 0.85 + h4 * 0.5;
        const sy = sc * (0.75 + gw * 0.45) * (0.85 + fbm(x / 14, z / 14, 2, 810) * 0.5);
        const o = g * 16;
        gm[o] = c * sc; gm[o + 1] = 0; gm[o + 2] = -s * sc; gm[o + 3] = 0;
        gm[o + 4] = 0; gm[o + 5] = sy; gm[o + 6] = 0; gm[o + 7] = 0;
        gm[o + 8] = s * sc; gm[o + 9] = 0; gm[o + 10] = c * sc; gm[o + 11] = 0;
        gm[o + 12] = x; gm[o + 13] = y; gm[o + 14] = z; gm[o + 15] = 1;
        t.vertexColor(x, z, col);
        const v = 0.92 + h3 * 0.2;
        gc[g * 3] = col.r * v; gc[g * 3 + 1] = col.g * v; gc[g * 3 + 2] = col.b * v;
        g++;
      }
    }
    this.grass.count = g;
    this.flowers.count = f;
    this.grass.instanceMatrix.needsUpdate = true;
    this.grass.instanceColor!.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;
    this.flowers.instanceColor!.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Scatter
// ---------------------------------------------------------------------------------------------

export interface ScatterContext {
  terrain: TerrainQuery;
  /** True where nothing should be scattered (town, roads, POIs, ruins). */
  reserved: (x: number, z: number, margin: number) => boolean;
  waterDist: (x: number, z: number) => number;
  colliders: Collider[];
  half: number;
}

export function scatterVegetation(ctx: ScatterContext): { group: THREE.Group; batches: VegBatch[] } {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const kinds = makeTreeKinds();
  const foliage = makeFoliageMaterial(0.012, 2.2);
  const bushMat = makeFoliageMaterial(0.04, 0.3);
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bushHi = makeBushGeometry(false), bushLo = makeBushGeometry(true);
  const rockGeos = [makeRockGeometry(1), makeRockGeometry(2), makeRockGeometry(3)];
  const rockLo = [makeRockGeometry(1, 0), makeRockGeometry(2, 0), makeRockGeometry(3, 0)];

  type P = { kind: string; x: number; y: number; z: number; rot: number; sx: number; sy: number; c: THREE.Color };
  const treeList: P[] = [];
  const bushList: P[] = [];
  const rockList: (P & { k: number })[] = [];

  const rnd = mulberry32(2024);
  const t = ctx.terrain;
  const H = ctx.half - 8;

  // trees: jittered grid, clustered by a forest noise
  const cell = 10;
  for (let z = -H; z < H; z += cell) {
    for (let x = -H; x < H; x += cell) {
      const px = x + rnd() * cell, pz = z + rnd() * cell;
      const forest = smoothstep(0.5, 0.68, fbm(px / 150, pz / 150, 3, 4242));
      const p = forest * 0.85 + 0.035;
      if (rnd() > p) continue;
      const y = t.heightAt(px, pz);
      if (y > 115 || t.slopeAt(px, pz) > 0.33) continue;
      if (ctx.waterDist(px, pz) < 6 || ctx.reserved(px, pz, 5)) continue;
      let kind: string;
      const r = rnd();
      if (y > 50) kind = r < 0.75 ? 'pine' : 'tall';
      else kind = r < 0.45 ? 'round' : r < 0.75 ? 'wide' : r < 0.9 ? 'tall' : 'pine';
      const sc = 0.8 + rnd() * 0.55;
      const v = 0.88 + rnd() * 0.22;
      treeList.push({ kind, x: px, y: y - 0.15, z: pz, rot: rnd() * Math.PI * 2, sx: sc, sy: sc * (0.9 + rnd() * 0.2), c: new THREE.Color(v * (0.95 + rnd() * 0.1), v, v * (0.9 + rnd() * 0.1)) });
      ctx.colliders.push({ kind: 'circle', x: px, z: pz, r: kinds[kind].radius * sc });
    }
  }

  // forest interiors get extra trees so they read as woods, not dots
  for (let z = -H; z < H; z += 6) {
    for (let x = -H; x < H; x += 6) {
      const px = x + rnd() * 6, pz = z + rnd() * 6;
      const forest = smoothstep(0.6, 0.75, fbm(px / 150, pz / 150, 3, 4242));
      if (rnd() > forest * 0.7) continue;
      const y = t.heightAt(px, pz);
      if (y > 110 || t.slopeAt(px, pz) > 0.33) continue;
      if (ctx.waterDist(px, pz) < 6 || ctx.reserved(px, pz, 5)) continue;
      const r = rnd();
      const kind = y > 50 ? 'pine' : r < 0.4 ? 'round' : r < 0.7 ? 'tall' : r < 0.85 ? 'wide' : 'pine';
      const sc = 0.85 + rnd() * 0.5;
      const v = 0.8 + rnd() * 0.22;
      treeList.push({ kind, x: px, y: y - 0.15, z: pz, rot: rnd() * Math.PI * 2, sx: sc, sy: sc * (0.95 + rnd() * 0.25), c: new THREE.Color(v * 0.95, v, v * 0.92) });
      ctx.colliders.push({ kind: 'circle', x: px, z: pz, r: kinds[kind].radius * sc });
    }
  }

  // bushes: around forest edges and in a few meadow clumps
  const bcell = 7;
  for (let z = -H; z < H; z += bcell) {
    for (let x = -H; x < H; x += bcell) {
      const px = x + rnd() * bcell, pz = z + rnd() * bcell;
      const f = fbm(px / 150, pz / 150, 3, 4242);
      const p = smoothstep(0.42, 0.56, f) * 0.4 + smoothstep(0.66, 0.82, fbm(px / 40, pz / 40, 2, 99)) * 0.2;
      if (rnd() > p) continue;
      const y = t.heightAt(px, pz);
      if (y > 90 || t.slopeAt(px, pz) > 0.35 || ctx.waterDist(px, pz) < 3 || ctx.reserved(px, pz, 2.5)) continue;
      const sc = 0.7 + rnd() * 0.8;
      const v = 0.85 + rnd() * 0.25;
      bushList.push({ kind: 'bush', x: px, y: y - 0.1, z: pz, rot: rnd() * 6.28, sx: sc, sy: sc * (0.8 + rnd() * 0.3), c: new THREE.Color(v, v, v * 0.95) });
    }
  }

  // rocks: on slopes, at cliff feet, a few in meadows
  const rcell = 12;
  for (let z = -H; z < H; z += rcell) {
    for (let x = -H; x < H; x += rcell) {
      const px = x + rnd() * rcell, pz = z + rnd() * rcell;
      const slope = t.slopeAt(px, pz);
      const y = t.heightAt(px, pz);
      const p = 0.04 + smoothstep(0.12, 0.3, slope) * 0.3 * (1 - smoothstep(30, 60, y));
      if (rnd() > p || slope > 0.5 || y > 80) continue;
      if (ctx.reserved(px, pz, 3) || ctx.waterDist(px, pz) < -1) continue;
      const big = rnd() < 0.25;
      const sc = big ? 1.6 + rnd() * 1.8 : 0.4 + rnd() * 0.8;
      const v = 0.85 + rnd() * 0.25;
      const c = new THREE.Color(v, v * 0.98, v * 0.95);
      const k = Math.floor(rnd() * 3);
      rockList.push({ kind: 'rock', k, x: px, y: y - sc * 0.15, z: pz, rot: rnd() * 6.28, sx: sc, sy: sc * (0.7 + rnd() * 0.6), c });
      if (sc > 0.9) ctx.colliders.push({ kind: 'circle', x: px, z: pz, r: sc * 0.85 });
      if (big) {
        for (let n = 0; n < 3; n++) {
          const a = rnd() * 6.28, d = sc * (1.1 + rnd());
          const qx = px + Math.cos(a) * d, qz = pz + Math.sin(a) * d;
          const s2 = 0.25 + rnd() * 0.35;
          rockList.push({ kind: 'rock', k: (k + 1) % 3, x: qx, y: t.heightAt(qx, qz) - 0.05, z: qz, rot: rnd() * 6.28, sx: s2, sy: s2, c });
        }
      }
    }
  }

  const treeGeos = Object.values(kinds).flatMap((k) => [k.hi, k.lo]);
  const trees = new VegBatch(treeGeos, treeList.length, foliage, 110, 'trees');
  for (const p of treeList) trees.add(kinds[p.kind].hi, kinds[p.kind].lo, p.x, p.y, p.z, p.rot, p.sx, p.sy, p.c);
  trees.mesh.castShadow = true;
  const bushes = new VegBatch([bushHi, bushLo], bushList.length, bushMat, 90, 'bushes');
  for (const p of bushList) bushes.add(bushHi, bushLo, p.x, p.y, p.z, p.rot, p.sx, p.sy, p.c);
  const rocks = new VegBatch([...rockGeos, ...rockLo], rockList.length, rockMat, 110, 'rocks');
  for (const p of rockList) rocks.add(rockGeos[p.k], rockLo[p.k], p.x, p.y, p.z, p.rot, p.sx, p.sy, p.c);
  rocks.mesh.castShadow = true;
  group.add(trees.mesh, bushes.mesh, rocks.mesh);
  return { group, batches: [trees, bushes, rocks] };
}
