import * as THREE from 'three';
import { fbm, mulberry32, smoothstep, valueNoise } from './noise';
import { worldUniforms } from './shared';
import type { TerrainQuery } from './terrain';
import type { Collider } from './types';
import { getLeafTexture, LEAF_SOLID_U } from './textures';
import { lambertWrapChunk, makeStoneMaterial } from './materials';

// ---------------------------------------------------------------------------------------------
// Foliage material: camera-facing leaf-cluster cards around round canopies (soft, painterly
// silhouettes), spherical normals for volumetric shading, wrap lighting + translucency, wind sway.
// ---------------------------------------------------------------------------------------------

const FOLIAGE_VERT_COMMON = /* glsl */ `
attribute vec4 aCard;
uniform float uTime;
uniform vec2 uWind;
varying float vLeaf;
varying float vShade;
#if defined(USE_BATCHING)
  #define SJ_INST_SCALE length(batchingMatrix[0].xyz)
  #define SJ_INST_POS batchingMatrix[3].xyz
#elif defined(USE_INSTANCING)
  #define SJ_INST_SCALE length(instanceMatrix[0].xyz)
  #define SJ_INST_POS instanceMatrix[3].xyz
#else
  #define SJ_INST_SCALE 1.0
  #define SJ_INST_POS modelMatrix[3].xyz
#endif
`;

const FOLIAGE_SWAY = /* glsl */ `
  {
    vec3 ip = SJ_INST_POS;
    float hgt = max(position.y - 1.6, 0.0);
    float ph = ip.x * 0.13 + ip.z * 0.17;
    float sw = sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7 + position.x * 0.8) * 0.25;
    float fl = sin(uTime * 5.3 + position.x * 3.1 + position.z * 2.3 + ph) * 0.04 * aCard.w;
    transformed.xz += uWind * sw * hgt * 0.012 + vec2(fl);
    transformed.y += fl * 0.5;
  }
`;

const FOLIAGE_BILLBOARD = /* glsl */ `
  if (aCard.z > 0.0) {
    vec2 sjCorner = aCard.xy * aCard.z * SJ_INST_SCALE;
    mvPosition.xy += sjCorner;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export function makeFoliageMaterial(alphaToCoverage = true): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: getLeafTexture(),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    alphaToCoverage,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWind = worldUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOLIAGE_VERT_COMMON}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FOLIAGE_SWAY}\nvLeaf = aCard.w;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${FOLIAGE_BILLBOARD}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          if (aCard.z > 0.0) worldPosition.xyz += vec3(aCard.xy * aCard.z * SJ_INST_SCALE, 0.0) * mat3(viewMatrix);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLeaf;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec4 sjLeaf = texture2D(map, vMapUv);
        diffuseColor.a *= sjLeaf.a;
        // foliage right in front of the camera dissolves instead of filling the screen with giant leaves
        if (vLeaf > 0.01) {
          float sjFade = smoothstep(1.2, 3.6, length(vViewPosition));
          if (sjFade < 1.0 && sjLeaf.r * 0.85 + 0.1 > sjFade) discard;
        }
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.7 + sjLeaf.r * 0.42) * mix(vec3(0.9, 0.95, 1.05), vec3(1.08, 1.04, 0.9), sjLeaf.g), vLeaf);`)
      .replace('#include <lights_lambert_pars_fragment>', lambertWrapChunk('(0.15 + vLeaf * 0.5)', 'vLeaf * 0.42'));
  };
  mat.customProgramCacheKey = () => `sj-foliage-${alphaToCoverage}`;
  return mat;
}

export function makeFoliageDepthMaterial(): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ map: getLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWind = worldUniforms.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FOLIAGE_VERT_COMMON}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FOLIAGE_SWAY}\nvLeaf = aCard.w;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${FOLIAGE_BILLBOARD}`);
  };
  mat.customProgramCacheKey = () => 'sj-foliage-depth';
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------------------------

type Blob = [number, number, number, number];
interface Palette { dark: number; mid: number; light: number; }

function noise3(x: number, y: number, z: number, seed: number): number {
  return (valueNoise(x * 1.3 + z * 0.7, y * 1.3, seed) + valueNoise(z * 1.3 - y * 0.5, x * 1.3, seed + 7)) * 0.5;
}

/** Accumulates foliage vertices (position, normal, color, uv, aCard) for a single geometry. */
class FoliageBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  card: number[] = [];
  idx: number[] = [];

  /** Add an ordinary mesh (trunk, cone, core) with uniform/vertex colour; leaf 0 = wood, 1 = foliage. */
  addMesh(g: THREE.BufferGeometry, color: (x: number, y: number, z: number, i: number) => THREE.Color, leaf: number, normalFrom?: THREE.Vector3, normalBlend = 0): void {
    const geo = g.index ? g : g;
    const pa = geo.attributes.position as THREE.BufferAttribute;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const na = geo.attributes.normal as THREE.BufferAttribute;
    const base = this.pos.length / 3;
    const n = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      this.pos.push(x, y, z);
      n.set(na.getX(i), na.getY(i), na.getZ(i));
      if (normalFrom && normalBlend > 0) {
        s.set(x - normalFrom.x, (y - normalFrom.y) * 0.85, z - normalFrom.z).normalize();
        n.lerp(s, normalBlend).normalize();
      }
      this.nor.push(n.x, n.y, n.z);
      const c = color(x, y, z, i);
      this.col.push(c.r, c.g, c.b);
      this.uv.push(LEAF_SOLID_U, 0.5);
      this.card.push(0, 0, 0, leaf);
    }
    if (geo.index) {
      const ia = geo.index;
      for (let i = 0; i < ia.count; i++) this.idx.push(base + ia.getX(i));
    } else {
      for (let i = 0; i < pa.count; i++) this.idx.push(base + i);
    }
  }

  /** A camera-facing leaf card centred at p, half-size `size`, rotated by `rot` in screen space. */
  addCard(p: THREE.Vector3, size: number, rot: number, normal: THREE.Vector3, color: THREE.Color, variant: number): void {
    const base = this.pos.length / 3;
    const u0 = variant ? 0.45 : 0.0, u1 = variant ? 0.9 : 0.45;
    const corners: [number, number, number, number][] = [[-1, -1, u0, 0], [1, -1, u1, 0], [1, 1, u1, 1], [-1, 1, u0, 1]];
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [cx, cy, u, v] of corners) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(normal.x, normal.y, normal.z);
      this.col.push(color.r, color.g, color.b);
      this.uv.push(u, v);
      this.card.push(cx * c - cy * s, cx * s + cy * c, size, 1);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.card, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    // cards extend beyond their centres
    if (g.boundingSphere) g.boundingSphere.radius += 1.5;
    g.computeBoundingBox();
    if (g.boundingBox) g.boundingBox.expandByScalar(1.5);
    return g;
  }
}

function canopy(fb: FoliageBuilder, blobs: Blob[], pal: Palette, cardsPerM2: number, seed: number, coreDetail: number, cardScale = 1): void {
  const rnd = mulberry32(seed);
  let cx = 0, cy = 0, cz = 0, minY = Infinity, maxY = -Infinity;
  for (const b of blobs) { cx += b[0]; cy += b[1]; cz += b[2]; minY = Math.min(minY, b[1] - b[3]); maxY = Math.max(maxY, b[1] + b[3]); }
  cx /= blobs.length; cy /= blobs.length; cz /= blobs.length;
  const centre = new THREE.Vector3(cx, cy, cz);
  const dark = new THREE.Color(pal.dark), mid = new THREE.Color(pal.mid), light = new THREE.Color(pal.light);
  const c = new THREE.Color();
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3();
  blobs.forEach((b, bi) => {
    // dark core fills gaps between cards
    if (coreDetail >= 0) {
      const core = new THREE.IcosahedronGeometry(b[3] * 0.74, coreDetail);
      const pa = core.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) {
        p.fromBufferAttribute(pa, i);
        const k = noise3(p.x + bi, p.y, p.z, seed) - 0.5;
        p.multiplyScalar(1 + k * 0.35);
        pa.setXYZ(i, p.x + b[0], p.y + b[1], p.z + b[2]);
      }
      core.deleteAttribute('normal');
      core.deleteAttribute('uv');
      core.computeVertexNormals();
      fb.addMesh(core, (_x, y) => {
        const t = (y - minY) / (maxY - minY);
        return c.copy(dark).lerp(mid, t * 0.45).multiplyScalar(0.75);
      }, 1, centre, 0.75);
    }
    const area = 4 * Math.PI * b[3] * b[3];
    const count = Math.max(6, Math.round(area * cardsPerM2));
    for (let k = 0; k < count; k++) {
      // directions biased upward and outward from the whole canopy
      d.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (d.lengthSq() > 1 || d.lengthSq() < 1e-3) { k--; continue; }
      d.normalize();
      d.y = d.y * 0.85 + 0.2;
      d.normalize();
      const r = b[3] * (0.5 + 0.48 * Math.sqrt(rnd()));
      p.set(b[0], b[1], b[2]).addScaledVector(d, r);
      n.copy(p).sub(centre);
      n.y *= 0.9;
      n.normalize().lerp(d, 0.35).normalize();
      const t = (p.y - minY) / (maxY - minY);
      const out = r / b[3];
      c.copy(dark).lerp(mid, smoothstep(0.0, 0.55, t * 0.6 + out * 0.4));
      c.lerp(light, smoothstep(0.45, 1.0, n.y * 0.6 + t * 0.5) * 0.85);
      c.multiplyScalar(0.84 + rnd() * 0.3);
      const size = b[3] * (0.5 + rnd() * 0.32) * cardScale;
      fb.addCard(p, size, rnd() * Math.PI * 2, n, c, rnd() < 0.5 ? 0 : 1);
    }
  });
}

const BARK = 0x6a5646;
const BARK_DARK = 0x4a3a30;

function trunk(fb: FoliageBuilder, h: number, r0: number, r1: number, segs: number, branches: number, seed: number): void {
  const rnd = mulberry32(seed);
  const bark = new THREE.Color(BARK), barkD = new THREE.Color(BARK_DARK), c = new THREE.Color();
  const g = new THREE.CylinderGeometry(r1, r0, h, segs, 3);
  g.translate(0, h / 2, 0);
  // gentle lean and a flared root
  const pa = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const flare = 1 + smoothstep(0.6, 0, y) * 0.35;
    pa.setX(i, pa.getX(i) * flare + Math.sin(y * 0.9) * 0.06);
    pa.setZ(i, pa.getZ(i) * flare);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  fb.addMesh(g, (_x, y) => c.copy(barkD).lerp(bark, Math.min(1, y / h)), 0);
  for (let b = 0; b < branches; b++) {
    const a = (b / branches) * Math.PI * 2 + rnd();
    const len = h * (0.42 + rnd() * 0.2);
    const bg = new THREE.CylinderGeometry(r1 * 0.35, r1 * 0.7, len, Math.max(4, segs - 2));
    bg.translate(0, len / 2, 0);
    bg.rotateZ(0.65 + rnd() * 0.3);
    bg.rotateY(a);
    bg.translate(0, h * (0.62 + rnd() * 0.25), 0);
    bg.deleteAttribute('uv');
    fb.addMesh(bg, () => c.copy(bark).multiplyScalar(0.92), 0);
  }
}

export interface TreeKind { hi: THREE.BufferGeometry; lo: THREE.BufferGeometry; radius: number; }

function loCanopy(fb: FoliageBuilder, blobs: Blob[], pal: Palette, seed: number): void {
  let cx = 0, cy = 0, cz = 0, r = 0;
  for (const b of blobs) { cx += b[0]; cy += b[1]; cz += b[2]; }
  cx /= blobs.length; cy /= blobs.length; cz /= blobs.length;
  for (const b of blobs) r = Math.max(r, Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz) + b[3] * 0.85);
  // two merged blobs keep a lumpy outline
  const bigs: Blob[] = [[cx, cy + r * 0.1, cz, r * 0.82], [cx + r * 0.25, cy - r * 0.15, cz - r * 0.15, r * 0.62]];
  canopy(fb, bigs, pal, 0.2, seed, 0, 1.35);
}

function pineGeometry(lowDetail: boolean, pal: Palette, seed: number): THREE.BufferGeometry {
  const fb = new FoliageBuilder();
  const rnd = mulberry32(seed);
  const tiers = lowDetail ? [[1.6, 2.4, 4.6]] : [[1.7, 2.5, 1.8], [2.9, 2.15, 1.65], [4.0, 1.75, 1.5], [5.0, 1.3, 1.3], [5.9, 0.8, 1.1]];
  const dark = new THREE.Color(pal.dark), light = new THREE.Color(pal.light), c = new THREE.Color();
  for (const [y, r, hgt] of tiers) {
    const segs = lowDetail ? 7 : 11;
    const g = new THREE.ConeGeometry(r, hgt * 1.7, segs, 2, true);
    g.translate(0, y + hgt * 0.85, 0);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const px = pa.getX(i), pz = pa.getZ(i), py = pa.getY(i);
      const rr = Math.hypot(px, pz);
      if (rr > 0.05) {
        const a = Math.atan2(pz, px);
        const jag = 1 + (Math.sin(a * segs * 0.5 + seed) * 0.5 + 0.5) * 0.18 + (rnd() - 0.5) * 0.1;
        pa.setX(i, px * jag);
        pa.setZ(i, pz * jag);
        if (py < y + 0.2) pa.setY(i, py - 0.25 * (rnd()));
      }
    }
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    fb.addMesh(g, (_x, py) => c.copy(dark).lerp(light, smoothstep(y, y + hgt * 1.7, py) * 0.75), 1, new THREE.Vector3(0, 3.5, 0), 0.5);
  }
  trunk(fb, 2.2, 0.26, 0.18, lowDetail ? 4 : 6, 0, seed);
  return fb.build();
}

export function makeTreeKinds(): Record<string, TreeKind> {
  const green: Palette = { dark: 0x2e4d2a, mid: 0x4d7632, light: 0x98b44c };
  const fresh: Palette = { dark: 0x34572b, mid: 0x588536, light: 0xa8c255 };
  const blue: Palette = { dark: 0x2a4a30, mid: 0x46703a, light: 0x8cac50 };
  const pine: Palette = { dark: 0x1a3826, mid: 0x2b5432, light: 0x5d8a48 };
  const round: Blob[] = [[0, 4.5, 0, 2.2], [1.4, 3.9, 0.5, 1.7], [-1.3, 4.0, -0.6, 1.8], [0.2, 5.7, -0.2, 1.6], [-0.3, 3.8, 1.4, 1.6], [0.8, 4.9, -1.3, 1.4]];
  const tall: Blob[] = [[0, 4.3, 0, 1.6], [0.3, 5.6, 0.2, 1.45], [-0.2, 6.8, -0.1, 1.15], [0.1, 4.4, -0.8, 1.3], [-0.5, 5.2, 0.6, 1.2]];
  const wide: Blob[] = [[0, 4.9, 0, 2.3], [2.2, 4.3, 0.5, 1.9], [-2.1, 4.4, -0.4, 2.0], [0.5, 4.2, 2.1, 1.8], [-0.4, 4.3, -2.1, 1.8], [0.3, 6.1, 0.2, 1.6]];
  const build = (blobs: Blob[], pal: Palette, th: number, r0: number, seed: number, hi: boolean) => {
    const fb = new FoliageBuilder();
    if (hi) {
      trunk(fb, th, r0, r0 * 0.7, 7, 3, seed);
      canopy(fb, blobs, pal, 0.5, seed, 0);
    } else {
      trunk(fb, th, r0, r0 * 0.7, 4, 0, seed);
      loCanopy(fb, blobs, pal, seed);
    }
    return fb.build();
  };
  return {
    round: { hi: build(round, green, 3.2, 0.36, 11, true), lo: build(round, green, 3.2, 0.36, 11, false), radius: 0.45 },
    tall: { hi: build(tall, blue, 3.6, 0.3, 12, true), lo: build(tall, blue, 3.6, 0.3, 12, false), radius: 0.4 },
    wide: { hi: build(wide, fresh, 3.2, 0.44, 13, true), lo: build(wide, fresh, 3.2, 0.44, 13, false), radius: 0.55 },
    pine: { hi: pineGeometry(false, pine, 14), lo: pineGeometry(true, pine, 14), radius: 0.4 },
  };
}

export function makeBushGeometry(lowDetail: boolean): THREE.BufferGeometry {
  const pal: Palette = { dark: 0x26482a, mid: 0x4a7a30, light: 0x92b448 };
  const fb = new FoliageBuilder();
  if (lowDetail) canopy(fb, [[0, 0.6, 0, 0.9]], pal, 0.9, 21, 0, 1.15);
  else canopy(fb, [[0, 0.62, 0, 0.8], [0.62, 0.48, 0.2, 0.6], [-0.52, 0.48, -0.25, 0.62]], pal, 1.6, 21, 0);
  return fb.build();
}

/** Rounded boulder or blocky slab (stone material does the surface detail). */
export function makeRockGeometry(seed: number, detail = 1, blocky = false): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  const v = new THREE.Vector3();
  if (blocky) {
    g = new THREE.BoxGeometry(1.6, 1.2, 1.2, 2, 2, 2);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const n = noise3(v.x * 1.2, v.y * 1.2, v.z * 1.2, seed) - 0.5;
      // chamfer the corners
      const k = Math.abs(v.x) / 0.8 + Math.abs(v.y) / 0.6 + Math.abs(v.z) / 0.6;
      if (k > 2.4) v.multiplyScalar(0.9);
      v.x += n * 0.25; v.z += n * 0.2; v.y += n * 0.1;
      pa.setXYZ(i, v.x, v.y + 0.45, v.z);
    }
    g = g.toNonIndexed();
  } else {
    g = new THREE.IcosahedronGeometry(1, detail);
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const n = noise3(v.x * 1.6, v.y * 1.6, v.z * 1.6, seed);
      v.multiplyScalar(0.8 + n * 0.45);
      v.y *= 0.62;
      if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.3;
      pa.setXYZ(i, v.x, v.y + 0.2, v.z);
    }
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const pa = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pa.count * 3);
  const grey = new THREE.Color(0xb3ab9d), dark = new THREE.Color(0x8a8780), c = new THREE.Color();
  for (let i = 0; i < pa.count; i++) {
    c.copy(dark).lerp(grey, smoothstep(-0.1, 0.9, pa.getY(i)));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
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
  private lodScale = 1;
  constructor(geos: THREE.BufferGeometry[], maxInstances: number, material: THREE.Material, private readonly lodDist: number, name: string) {
    let verts = 0, inds = 0;
    const uniq = [...new Set(geos)];
    for (const g of uniq) {
      verts += g.attributes.position.count;
      inds += g.index ? g.index.count : 0;
    }
    this.mesh = new THREE.BatchedMesh(Math.max(1, maxInstances), verts, inds || undefined, material);
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

  setLodScale(s: number): void {
    this.lodScale = s;
    this.last.set(1e9, 0, 1e9);
  }

  update(focus: THREE.Vector3): void {
    const dx = focus.x - this.last.x, dz = focus.z - this.last.z;
    if (dx * dx + dz * dz < 16) return;
    this.last.copy(focus);
    const ld = this.lodDist * this.lodScale;
    const d2 = ld * ld;
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
// Scatter
// ---------------------------------------------------------------------------------------------

export interface FixedTree { kind: string; x: number; y: number; z: number; s: number }

export interface ScatterContext {
  terrain: TerrainQuery;
  /** True where nothing should be scattered (town, roads, POIs, ruins). */
  reserved: (x: number, z: number, margin: number) => boolean;
  waterDist: (x: number, z: number) => number;
  colliders: Collider[];
  half: number;
  /** Hand-placed trees (town, landmarks): colliders are the caller's job. */
  fixedTrees?: FixedTree[];
  /** Hand-placed bushes / hedges. */
  fixedBushes?: { x: number; y: number; z: number; s: number; sy?: number }[];
}

export function scatterVegetation(ctx: ScatterContext): { group: THREE.Group; batches: VegBatch[]; foliage: THREE.MeshLambertMaterial } {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const kinds = makeTreeKinds();
  const foliage = makeFoliageMaterial(true);
  const depth = makeFoliageDepthMaterial();
  const rockMat = makeStoneMaterial(1.0);
  const bushHi = makeBushGeometry(false), bushLo = makeBushGeometry(true);
  const rockGeos = [makeRockGeometry(1), makeRockGeometry(2), makeRockGeometry(3), makeRockGeometry(4, 1, true), makeRockGeometry(5, 1, true)];
  const rockLo = [makeRockGeometry(1, 0), makeRockGeometry(2, 0), makeRockGeometry(3, 0), rockGeos[3], rockGeos[4]];

  type P = { kind: string; x: number; y: number; z: number; rot: number; sx: number; sy: number; c: THREE.Color };
  const treeList: P[] = [];
  const bushList: P[] = [];
  const rockList: (P & { k: number })[] = [];

  const rnd = mulberry32(2024);
  const t = ctx.terrain;
  const H = ctx.half - 8;
  const tint = (v: number) => new THREE.Color(v * (0.94 + rnd() * 0.12), v * (0.96 + rnd() * 0.08), v * (0.88 + rnd() * 0.14));

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
      else kind = r < 0.5 ? 'round' : r < 0.8 ? 'wide' : 'tall';
      const sc = 0.8 + rnd() * 0.55;
      treeList.push({ kind, x: px, y: y - 0.15, z: pz, rot: rnd() * Math.PI * 2, sx: sc, sy: sc * (0.9 + rnd() * 0.2), c: tint(0.88 + rnd() * 0.24) });
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
      const kind = y > 50 ? 'pine' : r < 0.45 ? 'round' : r < 0.75 ? 'tall' : 'wide';
      const sc = 0.85 + rnd() * 0.5;
      treeList.push({ kind, x: px, y: y - 0.15, z: pz, rot: rnd() * Math.PI * 2, sx: sc, sy: sc * (0.95 + rnd() * 0.25), c: tint(0.8 + rnd() * 0.22) });
      ctx.colliders.push({ kind: 'circle', x: px, z: pz, r: kinds[kind].radius * sc });
    }
  }
  for (const f of ctx.fixedTrees ?? []) {
    treeList.push({ kind: f.kind, x: f.x, y: f.y, z: f.z, rot: rnd() * Math.PI * 2, sx: f.s, sy: f.s, c: tint(0.95 + rnd() * 0.1) });
  }

  // bushes: around forest edges and in a few meadow clumps
  const bcell = 7;
  for (let z = -H; z < H; z += bcell) {
    for (let x = -H; x < H; x += bcell) {
      const px = x + rnd() * bcell, pz = z + rnd() * bcell;
      const f = fbm(px / 150, pz / 150, 3, 4242);
      const p = smoothstep(0.46, 0.6, f) * 0.3 + smoothstep(0.72, 0.86, fbm(px / 40, pz / 40, 2, 99)) * 0.08;
      if (rnd() > p) continue;
      const y = t.heightAt(px, pz);
      if (y > 90 || t.slopeAt(px, pz) > 0.35 || ctx.waterDist(px, pz) < 3 || ctx.reserved(px, pz, 2.5)) continue;
      const sc = 0.85 + rnd() * 0.85;
      bushList.push({ kind: 'bush', x: px, y: y - 0.1, z: pz, rot: rnd() * 6.28, sx: sc, sy: sc * (0.8 + rnd() * 0.3), c: tint(0.85 + rnd() * 0.25) });
    }
  }
  for (const b of ctx.fixedBushes ?? []) {
    bushList.push({ kind: 'bush', x: b.x, y: b.y, z: b.z, rot: rnd() * 6.28, sx: b.s, sy: b.sy ?? b.s, c: tint(0.9 + rnd() * 0.15) });
  }

  // rocks: on slopes, at cliff feet, a few in meadows; some blocky slabs like broken-off cliff
  const rcell = 12;
  for (let z = -H; z < H; z += rcell) {
    for (let x = -H; x < H; x += rcell) {
      const px = x + rnd() * rcell, pz = z + rnd() * rcell;
      const slope = t.slopeAt(px, pz);
      const y = t.heightAt(px, pz);
      const p = 0.05 + smoothstep(0.12, 0.3, slope) * 0.3 * (1 - smoothstep(30, 60, y));
      if (rnd() > p || slope > 0.5 || y > 80) continue;
      if (ctx.reserved(px, pz, 3) || ctx.waterDist(px, pz) < -1) continue;
      const big = rnd() < 0.25;
      const blocky = rnd() < (big ? 0.3 : 0.12);
      const sc = big ? 1.4 + rnd() * 1.6 : 0.4 + rnd() * 0.8;
      const v = 0.9 + rnd() * 0.2;
      const c = new THREE.Color(v, v * 0.99, v * 0.96);
      const k = blocky ? 3 + Math.floor(rnd() * 2) : Math.floor(rnd() * 3);
      rockList.push({ kind: 'rock', k, x: px, y: y - sc * (blocky ? 0.35 : 0.15), z: pz, rot: rnd() * 6.28, sx: sc, sy: sc * (blocky ? 0.8 + rnd() * 0.9 : 0.7 + rnd() * 0.6), c });
      if (sc > 0.9) ctx.colliders.push({ kind: 'circle', x: px, z: pz, r: sc * (blocky ? 0.95 : 0.85) });
      if (big) {
        for (let n = 0; n < 3; n++) {
          const a = rnd() * 6.28, d = sc * (1.1 + rnd());
          const qx = px + Math.cos(a) * d, qz = pz + Math.sin(a) * d;
          const s2 = 0.25 + rnd() * 0.35;
          rockList.push({ kind: 'rock', k: Math.floor(rnd() * 3), x: qx, y: t.heightAt(qx, qz) - 0.05, z: qz, rot: rnd() * 6.28, sx: s2, sy: s2, c });
        }
      }
    }
  }

  const treeGeos = Object.values(kinds).flatMap((k) => [k.hi, k.lo]);
  const trees = new VegBatch(treeGeos, treeList.length, foliage, 85, 'trees');
  for (const p of treeList) trees.add(kinds[p.kind].hi, kinds[p.kind].lo, p.x, p.y, p.z, p.rot, p.sx, p.sy, p.c);
  trees.mesh.castShadow = true;
  trees.mesh.customDepthMaterial = depth;
  const bushes = new VegBatch([bushHi, bushLo], bushList.length, foliage, 60, 'bushes');
  for (const p of bushList) bushes.add(bushHi, bushLo, p.x, p.y, p.z, p.rot, p.sx, p.sy, p.c);
  bushes.mesh.castShadow = true;
  bushes.mesh.customDepthMaterial = depth;
  const rocks = new VegBatch([...rockGeos, ...rockLo], rockList.length, rockMat, 110, 'rocks');
  for (const p of rockList) rocks.add(rockGeos[p.k], rockLo[p.k], p.x, p.y, p.z, p.rot, p.sx, p.sy, p.c);
  rocks.mesh.castShadow = true;
  group.add(trees.mesh, bushes.mesh, rocks.mesh);
  return { group, batches: [trees, bushes, rocks], foliage };
}

/** Small instanced flowers for the town flower beds. */
export function makeBedFlowers(spots: [number, number, number][], seed: number): THREE.InstancedMesh {
  const pos: number[] = [];
  const col: number[] = [];
  const g0 = [0.16, 0.34, 0.09];
  for (const [dx, dz] of [[0.012, 0], [0, 0.012]]) {
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 0.3, dz, -dx, 0, -dz, dx, 0.3, dz, -dx, 0.3, -dz);
    for (let i = 0; i < 6; i++) col.push(...g0);
  }
  const P = 10;
  for (let i = 0; i < P; i++) {
    const a0 = (i / P) * Math.PI * 2, a1 = ((i + 1) / P) * Math.PI * 2;
    const r0 = i % 2 === 0 ? 0.1 : 0.06, r1 = (i + 1) % 2 === 0 ? 0.1 : 0.06;
    pos.push(0, 0.32, 0, Math.cos(a1) * r1, 0.31, Math.sin(a1) * r1, Math.cos(a0) * r0, 0.31, Math.sin(a0) * r0);
    for (let k = 0; k < 3; k++) col.push(1, 1, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  const rnd = mulberry32(seed);
  const palette = [0xfff4e0, 0xffd23a, 0xff6fa0, 0xa77bff, 0xff7a4a, 0xfff4e0].map((c) => new THREE.Color(c));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((sp, i) => {
    q.setFromAxisAngle(up, rnd() * 6.28);
    const sc = 1.1 + rnd() * 0.5;
    im.setMatrixAt(i, m.compose(p.set(sp[0], sp[1], sp[2]), q, s.set(sc, sc * (0.8 + rnd() * 0.5), sc)));
    im.setColorAt(i, palette[Math.floor(rnd() * palette.length)]);
  });
  im.count = spots.length;
  im.receiveShadow = true;
  im.name = 'bed-flowers';
  return im;
}
