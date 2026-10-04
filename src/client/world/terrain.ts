import * as THREE from 'three';
import { fbm, ridged, valueNoise, smoothstep, lerp, smax, clamp01, hash2i } from './noise';
import {
  CELL, GRID_HALF, GRID_N, MESAS, POI, POND, RIVER_HALF_WIDTH, RIVER_IN, RIVER_OUT, ROADS, TOWN,
  TOWN_DIRT_CIRCLES, TOWN_PATHS, WATER_LEVEL, distToPolyline, lakeDist,
} from './layout';

const S = 1337;

function baseHills(x: number, z: number, full: boolean): number {
  let h = 10 + (fbm(x / 260, z / 260, full ? 4 : 2, S) - 0.5) * 36;
  if (full) h += (fbm(x / 55, z / 55, 3, S + 100) - 0.5) * 6;
  return h;
}

/** Stepped ledges for the layered mesa cliffs. */
function terrace(s: number, steps: number): number {
  const v = s * steps;
  const i = Math.floor(v);
  const f = v - i;
  const g = f * f * f * (f * (f * 6 - 15) + 10);
  return Math.min(1, (i + g * 0.85 + f * 0.15) / steps);
}

export function waterDistance(x: number, z: number): { d: number; floor: number } {
  const dr = Math.min(distToPolyline(x, z, RIVER_IN), distToPolyline(x, z, RIVER_OUT)) -
    (RIVER_HALF_WIDTH + (valueNoise(x / 40, z / 40, S + 600) - 0.5) * 5);
  const dl = lakeDist(x, z) + (valueNoise(x / 20, z / 20, S + 601) - 0.5) * 6;
  const dp = Math.hypot(x - POND.x, z - POND.z) - POND.r + (valueNoise(x / 7, z / 7, S + 602) - 0.5) * 3;
  if (dp < dr && dp < dl) return { d: dp, floor: -1.7 };
  if (dl < dr) return { d: dl, floor: -3.4 };
  return { d: dr, floor: -2.5 };
}

/** Analytic terrain height (expensive; the grid caches it). */
export function terrainHeight(x: number, z: number): number {
  let h = baseHills(x, z, true);
  const dLone = Math.hypot(x - POI.loneTree.x, z - POI.loneTree.z);
  if (dLone < 80) h += 10 * smoothstep(80, 0, dLone);
  h = smax(h, 3.5, 4);

  let dRoad = Infinity;
  for (const r of ROADS) dRoad = Math.min(dRoad, distToPolyline(x, z, r.pts) - r.width);
  if (dRoad < 16) {
    const target = smax(baseHills(x, z, false), 3.5, 4);
    h = lerp(h, target, 0.8 * smoothstep(16, 3, dRoad));
  }

  const dT = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (dT < TOWN.blendR) h = lerp(h, TOWN.h, smoothstep(TOWN.blendR, TOWN.plateauR, dT));

  for (const m of MESAS) {
    const dx = x - m.x;
    const dz = z - m.z;
    if (Math.abs(dx) > m.r + 40 || Math.abs(dz) > m.r + 40) continue;
    const d = Math.hypot(dx, dz) + (valueNoise(x / 18, z / 18, S + 200) - 0.5) * m.r * 0.45 +
      (valueNoise(x / 5, z / 5, S + 201) - 0.5) * 2.5;
    const s = smoothstep(m.r + 9, m.r, d);
    if (s > 0) h += m.h * terrace(s, 3);
    if (m.tier > 0) h += m.h * m.tier * smoothstep(m.r * 0.5 + 5, m.r * 0.5, d);
  }

  const ax = Math.abs(x);
  const az = Math.abs(z);
  const e = Math.max(ax, az) + (fbm(x / 110, z / 110, 3, S + 300) - 0.5) * 80;
  if (e > 440) {
    const m1 = smoothstep(450, 640, e);
    const r = ridged(x / 210, z / 210, 4, S + 400);
    h += m1 * m1 * (55 + r * 180);
    if (e > 640) {
      const m2 = smoothstep(640, 1500, e);
      h += m2 * (90 + ridged(x / 380, z / 380, 4, S + 500) * 330);
    }
  }

  const w = waterDistance(x, z);
  if (w.d < 60) {
    const valley = smoothstep(58, 6, w.d);
    h = lerp(h, Math.min(h, 2.4 + Math.max(w.d, 0) * 0.07), valley);
    h = lerp(h, w.floor, smoothstep(5, -4, w.d));
  }
  return h;
}

// ---------- colours ----------
const C = (hex: number) => new THREE.Color(hex);
export const PAL = {
  grassDeep: C(0x2f8a2c),
  grassMid: C(0x55ad33),
  grassLight: C(0x86c43c),
  grassYellow: C(0xb2cf4c),
  dirt: C(0xb88a58),
  townDirt: C(0xc9a374),
  sand: C(0xead6a0),
  rockLight: C(0xb4aea3),
  rockDark: C(0x7d7973),
  rockWarm: C(0xa8977e),
  snow: C(0xf3f7fc),
  mountainRock: C(0x6c7383),
  lakeBed: C(0x6f8f62),
  water: C(0x3b9be0),
};

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

export function grassColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const n1 = fbm(x / 170, z / 170, 3, S + 700);
  const n2 = valueNoise(x / 23, z / 23, S + 701);
  const t = clamp01((n1 - 0.5) * 2.4 + 0.5) * 0.78 + n2 * 0.22;
  if (t < 0.38) out.copy(PAL.grassDeep).lerp(PAL.grassMid, t / 0.38);
  else if (t < 0.72) out.copy(PAL.grassMid).lerp(PAL.grassLight, (t - 0.38) / 0.34);
  else out.copy(PAL.grassLight).lerp(PAL.grassYellow, Math.min(1, (t - 0.72) / 0.28));
  // forests read a little darker / bluer
  const forest = smoothstep(0.55, 0.7, fbm(x / 150, z / 150, 3, 4242));
  out.multiplyScalar(1 - forest * 0.18);
  return out;
}

function rockColor(x: number, z: number, h: number, out: THREE.Color): THREE.Color {
  const n = valueNoise(x / 13, z / 13, S + 702);
  const band = Math.sin(h * 1.7 + n * 2.5) * 0.5 + 0.5;
  const band2 = Math.sin(h * 0.53 + 1.3) * 0.5 + 0.5;
  out.copy(PAL.rockDark).lerp(PAL.rockLight, band * 0.75 + n * 0.25);
  out.lerp(PAL.rockWarm, band2 * 0.35);
  return out;
}

export interface TerrainData {
  heights: Float32Array;
  colors: Float32Array;
  splat: Float32Array;
  grass: Float32Array;
  normalsY: Float32Array;
}

const V = GRID_N + 1;

function computeVertex(x: number, z: number, h: number, ny: number, outColor: THREE.Color, withSplat: boolean): [number, number, number] {
  const slope = 1 - ny;
  grassColor(x, z, outColor);
  const dTown = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (dTown < 90) outColor.lerp(PAL.grassMid, smoothstep(90, 50, dTown) * 0.55);
  let rockW = smoothstep(0.24, 0.45, slope);
  rockW = Math.max(rockW, smoothstep(65, 115, h) * 0.85);
  if (rockW > 0) {
    rockColor(x, z, h, tmpA);
    tmpA.lerp(PAL.mountainRock, smoothstep(50, 140, h) * 0.75);
    outColor.lerp(tmpA, rockW);
  }
  const n2 = valueNoise(x / 31, z / 31, S + 703);
  const snowW = smoothstep(150, 185, h + (n2 - 0.5) * 50) * (1 - smoothstep(0.5, 0.8, slope));
  if (snowW > 0) outColor.lerp(PAL.snow, snowW);
  if (h < 0.4) outColor.lerp(tmpB.copy(PAL.sand).lerp(PAL.lakeBed, smoothstep(0.2, -2.5, h)), smoothstep(0.4, -0.2, h));

  let dirt = 0;
  let sand = 0;
  if (withSplat) {
    for (const r of ROADS) {
      const d = distToPolyline(x, z, r.pts);
      if (d < r.width + 3) dirt = Math.max(dirt, smoothstep(r.width + 1.6, r.width - 0.8, d));
    }
    const dT = Math.hypot(x - TOWN.x, z - TOWN.z);
    if (dT < 70) {
      for (const r of TOWN_PATHS) {
        const d = distToPolyline(x, z, r.pts);
        if (d < r.width + 3) dirt = Math.max(dirt, smoothstep(r.width + 1.4, r.width - 0.6, d));
      }
      for (const c of TOWN_DIRT_CIRCLES) {
        const d = Math.hypot(x - c.x, z - c.z);
        dirt = Math.max(dirt, smoothstep(c.r + 1.5, c.r - 0.8, d));
      }
    }
    // worn patches in the meadows and at the foot of cliffs
    if (dT > 75) dirt = Math.max(dirt, smoothstep(0.74, 0.86, fbm(x / 34, z / 34, 2, S + 704)) * 0.75 * (1 - rockW));
    dirt *= 1 - rockW * 0.8;
    sand = smoothstep(2.1, 0.9, h) * (h > -0.3 ? 1 : smoothstep(-1.2, -0.3, h));
  }
  const grass = (1 - rockW) * (1 - snowW) * (1 - smoothstep(0.35, 0.55, dirt)) * (1 - smoothstep(0.3, 0.6, sand)) * (h > 1.2 ? 1 : 0);
  return [dirt, sand, grass];
}

export function buildTerrainData(): TerrainData {
  const heights = new Float32Array(V * V);
  for (let j = 0; j < V; j++) {
    const z = -GRID_HALF + j * CELL;
    for (let i = 0; i < V; i++) heights[j * V + i] = terrainHeight(-GRID_HALF + i * CELL, z);
  }
  const normalsY = new Float32Array(V * V);
  const colors = new Float32Array(V * V * 3);
  const splat = new Float32Array(V * V * 2);
  const grass = new Float32Array(V * V);
  const col = new THREE.Color();
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const k = j * V + i;
      const hl = heights[j * V + Math.max(0, i - 1)];
      const hr = heights[j * V + Math.min(V - 1, i + 1)];
      const hd = heights[Math.max(0, j - 1) * V + i];
      const hu = heights[Math.min(V - 1, j + 1) * V + i];
      const nx = hl - hr;
      const nz = hd - hu;
      const ny = 2 * CELL;
      const len = Math.hypot(nx, ny, nz);
      normalsY[k] = ny / len;
      const x = -GRID_HALF + i * CELL;
      const z = -GRID_HALF + j * CELL;
      const [d, s, g] = computeVertex(x, z, heights[k], ny / len, col, true);
      colors[k * 3] = col.r;
      colors[k * 3 + 1] = col.g;
      colors[k * 3 + 2] = col.b;
      splat[k * 2] = d;
      splat[k * 2 + 1] = s;
      grass[k] = g;
    }
  }
  return { heights, colors, splat, grass, normalsY };
}

/** Fast queries over the cached grid. heightAt matches the rendered triangles exactly. */
export class TerrainQuery {
  constructor(private readonly data: TerrainData) {}

  heightAt(x: number, z: number): number {
    let gx = (x + GRID_HALF) / CELL;
    let gz = (z + GRID_HALF) / CELL;
    if (gx < 0) gx = 0; else if (gx > GRID_N - 1e-6) gx = GRID_N - 1e-6;
    if (gz < 0) gz = 0; else if (gz > GRID_N - 1e-6) gz = GRID_N - 1e-6;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const fx = gx - i;
    const fz = gz - j;
    const h = this.data.heights;
    const k = j * V + i;
    const a = h[k];
    const b = h[k + 1];
    const c = h[k + V];
    const d = h[k + V + 1];
    // triangles (a, c, b) and (b, c, d): diagonal from b to c
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  private nearest(x: number, z: number): number {
    const i = Math.max(0, Math.min(GRID_N, Math.round((x + GRID_HALF) / CELL)));
    const j = Math.max(0, Math.min(GRID_N, Math.round((z + GRID_HALF) / CELL)));
    return j * V + i;
  }

  grassAt(x: number, z: number): number {
    return this.data.grass[this.nearest(x, z)];
  }

  slopeAt(x: number, z: number): number {
    return 1 - this.data.normalsY[this.nearest(x, z)];
  }

  dirtAt(x: number, z: number): number {
    return this.data.splat[this.nearest(x, z) * 2];
  }

  /** Base colour (linear working space) at a vertex near (x,z), for grass tinting. */
  vertexColor(x: number, z: number, out: THREE.Color): THREE.Color {
    const k = this.nearest(x, z) * 3;
    return out.setRGB(this.data.colors[k], this.data.colors[k + 1], this.data.colors[k + 2]);
  }

  groundColorAt(x: number, z: number): THREE.Color {
    const out = new THREE.Color();
    if (this.heightAt(x, z) < WATER_LEVEL) return out.copy(PAL.water);
    const k = this.nearest(x, z);
    out.setRGB(this.data.colors[k * 3], this.data.colors[k * 3 + 1], this.data.colors[k * 3 + 2]);
    const dirt = this.data.splat[k * 2];
    const sand = this.data.splat[k * 2 + 1];
    if (sand > 0.5) out.copy(PAL.sand);
    if (dirt > 0.5) out.copy(Math.hypot(x - TOWN.x, z - TOWN.z) < 70 ? PAL.townDirt : PAL.dirt);
    return out;
  }
}

// ---------- rendering ----------

export function makeNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size);
  const per = (x: number, z: number, cell: number, seed: number) => {
    const p = size / cell;
    const xi = Math.floor(x / cell), zi = Math.floor(z / cell);
    const fx = x / cell - xi, fz = z / cell - zi;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const hh = (a: number, b: number) => hash2i(((a % p) + p) % p, ((b % p) + p) % p, seed);
    const a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const v = per(x, z, 32, 1) * 0.5 + per(x, z, 16, 2) * 0.25 + per(x, z, 8, 3) * 0.15 + per(x, z, 4, 4) * 0.1;
      data[z * size + x] = Math.round(clamp01(v) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function makeTerrainMaterial(noiseTex: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noiseTex };
    shader.uniforms.uDirt = { value: PAL.dirt };
    shader.uniforms.uTownDirt = { value: PAL.townDirt };
    shader.uniforms.uSand = { value: PAL.sand };
    shader.uniforms.uTown = { value: new THREE.Vector2(TOWN.x, TOWN.z) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 splat;\nvarying vec2 vSplat;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform vec3 uDirt; uniform vec3 uTownDirt; uniform vec3 uSand; uniform vec2 uTown;\nvarying vec2 vSplat;\nvarying vec3 vWPos;')
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        float nA = texture2D(uNoise, vWPos.xz / 11.0).r;
        float nB = texture2D(uNoise, vWPos.xz / 53.0).r;
        float nC = texture2D(uNoise, vWPos.xz / 2.7).r;
        float nS = texture2D(uNoise, vec2(vWPos.x * 0.6 + vWPos.z * 0.2, vWPos.z * 0.05) / 3.0).r; // brushy streaks
        vec3 base = diffuseColor.rgb * (0.84 + nA * 0.2 + nB * 0.14 + nS * 0.08);
        base = mix(base, base * vec3(1.06, 1.04, 0.86), smoothstep(0.55, 0.8, nB));
        float townK = smoothstep(75.0, 60.0, distance(vWPos.xz, uTown));
        vec3 dirtCol = mix(uDirt, uTownDirt, townK) * (0.84 + nC * 0.26 + nA * 0.1);
        float dirt = smoothstep(0.44, 0.56, vSplat.x + (nA - 0.5) * 0.45 + (nC - 0.5) * 0.25);
        base = mix(base, dirtCol, dirt);
        float sand = smoothstep(0.42, 0.58, vSplat.y + (nA - 0.5) * 0.4 + (nC - 0.5) * 0.15);
        base = mix(base, uSand * (0.92 + nC * 0.14), sand);
        diffuseColor.rgb = base;`);
  };
  return mat;
}

const CHUNK = 64;

export interface TerrainMeshes {
  group: THREE.Group;
  /** Pick a level of detail per chunk around the focus (full res near, 1/2 and 1/4 further away). */
  update(focus: THREE.Vector3): void;
}

/** Index buffers for one chunk at a stride, with double-sided skirts to hide LOD cracks. */
function chunkIndex(stride: number): THREE.BufferAttribute {
  const cv = CHUNK + 1;
  const idx: number[] = [];
  for (let j = 0; j < CHUNK; j += stride) {
    for (let i = 0; i < CHUNK; i += stride) {
      const a = j * cv + i;
      const b = a + stride;
      const c = a + stride * cv;
      const d = c + stride;
      idx.push(a, c, b, b, c, d);
    }
  }
  const base = cv * cv;
  // sides: 0 = j=0, 1 = i=C, 2 = j=C, 3 = i=0 ; skirt vertex for side s, k = base + s*cv + k
  const grid = (side: number, k: number) => side === 0 ? k : side === 1 ? k * cv + CHUNK : side === 2 ? CHUNK * cv + k : k * cv;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < CHUNK; k += stride) {
      const g0 = grid(side, k), g1 = grid(side, k + stride);
      const s0 = base + side * cv + k, s1 = base + side * cv + k + stride;
      idx.push(g0, s0, g1, g1, s0, s1, g0, g1, s0, g1, s1, s0);
    }
  }
  return new THREE.BufferAttribute(new Uint16Array(idx), 1);
}

export function buildTerrainMeshes(data: TerrainData, material: THREE.Material): TerrainMeshes {
  const group = new THREE.Group();
  group.name = 'terrain';
  const cv = CHUNK + 1;
  const indices = [chunkIndex(1), chunkIndex(2), chunkIndex(4)];
  const chunks = GRID_N / CHUNK;
  const recs: { geo: THREE.BufferGeometry; minX: number; maxX: number; minZ: number; maxZ: number; lod: number }[] = [];
  const nVerts = cv * cv + 4 * cv;
  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const pos = new Float32Array(nVerts * 3);
      const nor = new Float32Array(nVerts * 3);
      const col = new Float32Array(nVerts * 3);
      const spl = new Float32Array(nVerts * 2);
      const write = (o: number, gi: number, gj: number, drop: number) => {
        const k = gj * V + gi;
        pos[o * 3] = -GRID_HALF + gi * CELL;
        pos[o * 3 + 1] = data.heights[k] - drop;
        pos[o * 3 + 2] = -GRID_HALF + gj * CELL;
        const hl = data.heights[gj * V + Math.max(0, gi - 1)];
        const hr = data.heights[gj * V + Math.min(V - 1, gi + 1)];
        const hd = data.heights[Math.max(0, gj - 1) * V + gi];
        const hu = data.heights[Math.min(V - 1, gj + 1) * V + gi];
        const nx = hl - hr, nz = hd - hu, ny = 2 * CELL;
        const len = Math.hypot(nx, ny, nz);
        nor[o * 3] = nx / len;
        nor[o * 3 + 1] = ny / len;
        nor[o * 3 + 2] = nz / len;
        col[o * 3] = data.colors[k * 3];
        col[o * 3 + 1] = data.colors[k * 3 + 1];
        col[o * 3 + 2] = data.colors[k * 3 + 2];
        spl[o * 2] = data.splat[k * 2];
        spl[o * 2 + 1] = data.splat[k * 2 + 1];
      };
      for (let j = 0; j < cv; j++) for (let i = 0; i < cv; i++) write(j * cv + i, ci * CHUNK + i, cj * CHUNK + j, 0);
      for (let side = 0; side < 4; side++) {
        for (let k = 0; k < cv; k++) {
          const li = side === 0 ? k : side === 1 ? CHUNK : side === 2 ? k : 0;
          const lj = side === 0 ? 0 : side === 1 ? k : side === 2 ? CHUNK : k;
          write(cv * cv + side * cv + k, ci * CHUNK + li, cj * CHUNK + lj, 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('splat', new THREE.BufferAttribute(spl, 2));
      geo.setIndex(indices[0]);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'terrain';
      group.add(mesh);
      const minX = -GRID_HALF + ci * CHUNK * CELL, minZ = -GRID_HALF + cj * CHUNK * CELL;
      recs.push({ geo, minX, maxX: minX + CHUNK * CELL, minZ, maxZ: minZ + CHUNK * CELL, lod: 0 });
    }
  }
  group.add(buildOuterTerrain(material));
  const last = new THREE.Vector3(1e9, 0, 1e9);
  return {
    group,
    update(focus: THREE.Vector3) {
      if (Math.abs(focus.x - last.x) + Math.abs(focus.z - last.z) < 8) return;
      last.copy(focus);
      for (const r of recs) {
        const dx = Math.max(r.minX - focus.x, 0, focus.x - r.maxX);
        const dz = Math.max(r.minZ - focus.z, 0, focus.z - r.maxZ);
        const d = Math.hypot(dx, dz);
        const lod = d < 220 ? 0 : d < 520 ? 1 : 2;
        if (lod !== r.lod) {
          r.lod = lod;
          r.geo.setIndex(indices[lod]);
        }
      }
    },
  };
}

/** Coarse far terrain: the snowy mountain ring on the horizon (not walkable). */
function buildOuterTerrain(material: THREE.Material): THREE.Mesh {
  const OUT = 2800;
  const STEP = 40;
  const n = (OUT * 2) / STEP;
  const geo = new THREE.PlaneGeometry(OUT * 2, OUT * 2, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const inner = Math.max(Math.abs(x), Math.abs(z));
    let h = terrainHeight(x, z);
    if (inner < GRID_HALF - 1) h -= 40 * smoothstep(GRID_HALF - 1, GRID_HALF - 60, inner) + 2;
    pos.setY(i, h);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    computeVertex(pos.getX(i), pos.getZ(i), pos.getY(i), nor.getY(i), c, false);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  geo.deleteAttribute('uv');
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'terrain-far';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** R8 texture of water depth over the grid, for shore foam and shallow tint in the water shader. */
export function makeDepthTexture(data: TerrainData): THREE.DataTexture {
  const arr = new Uint8Array(V * V);
  for (let k = 0; k < V * V; k++) {
    const d = (WATER_LEVEL - data.heights[k] + 0.6) / 6.6;
    arr[k] = Math.round(clamp01(d) * 255);
  }
  const tex = new THREE.DataTexture(arr, V, V, THREE.RedFormat, THREE.UnsignedByteType);
  tex.unpackAlignment = 1;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
