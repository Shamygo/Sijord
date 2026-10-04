import * as THREE from 'three';
import { fbm, ridged, valueNoise, smoothstep, lerp, smax, clamp01, mulberry32 } from './noise';
import {
  CELL, GRID_HALF, GRID_N, MESAS, POI, POND, RIVER_HALF_WIDTH, RIVER_IN, RIVER_OUT, ROADS, TOWN,
  TOWN_DIRT_CIRCLES, TOWN_PATHS, WATER_LEVEL, distToPolyline, lakeDist,
} from './layout';
import { getNoiseTexture } from './textures';
import { GLSL_HASH, lambertWrapChunk } from './materials';

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

/** Big snowy massifs on the horizon: a ring of peaks plus a hero range due north (up Route 1). */
const PEAKS: [number, number, number, number][] = (() => {
  const rnd = mulberry32(99);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + (rnd() - 0.5) * 0.25;
    const d = 1350 + rnd() * 850;
    out.push([Math.cos(a) * d, Math.sin(a) * d, 420 + rnd() * 380, 170 + rnd() * 300]);
  }
  out.push([-420, 2050, 700, 560], [260, 2250, 520, 420], [-1100, 1800, 480, 400]);
  return out;
})();

function massif(x: number, z: number): number {
  let h = 0;
  for (const [px, pz, r, H] of PEAKS) {
    const dx = x - px, dz = z - pz;
    if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= r) continue;
    const t = 1 - d / r;
    const v = H * Math.pow(t, 1.35);
    h = smax(h, v, 60);
  }
  if (h <= 0) return 0;
  // erosion: ridges and gullies scale with the mountain
  const r1 = ridged(x / 260, z / 260, 4, S + 520);
  return h * (0.62 + 0.55 * r1);
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
    const spread = Math.min(22, m.r * 0.42);
    const s = smoothstep(m.r + 9, m.r - spread, d);
    if (s > 0) h += m.h * terrace(s, 3);
    if (m.tier > 0) h += m.h * m.tier * smoothstep(m.r * 0.5 + 5, m.r * 0.5, d);
  }

  const ax = Math.abs(x);
  const az = Math.abs(z);
  const e = Math.max(ax, az) + (fbm(x / 110, z / 110, 3, S + 300) - 0.5) * 80;
  if (e > 440) {
    const m1 = smoothstep(450, 640, e);
    // rounded green foothills (half ridged, half smooth) so the boundary range does not spike
    const r = 0.55 * ridged(x / 230, z / 230, 3, S + 400) + 0.45 * fbm(x / 170, z / 170, 3, S + 401);
    h += m1 * m1 * (40 + r * 110);
    if (e > 640) {
      const m2 = smoothstep(640, 1500, e);
      const mass = fbm(x / 700, z / 700, 2, S + 510);
      h += m2 * (40 + mass * 150) + massif(x, z) * smoothstep(600, 1100, e);
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

// ---------- colours (sRGB hex -> linear) ----------
const C = (hex: number) => new THREE.Color(hex);
export const PAL = {
  grassDeep: C(0x7ea247),
  grassMid: C(0x9bb553),
  grassLight: C(0xaec05c),
  grassYellow: C(0xb6c262),
  dirt: C(0xc8ac7c),
  townDirt: C(0xd0b78e),
  sand: C(0xecd09e),
  rockLight: C(0xb1a99b),
  rockDark: C(0x767a82),
  rockWarm: C(0xa8977e),
  snow: C(0xf3f7fd),
  mountainRock: C(0x7c8494),
  lakeBed: C(0x7d8c63),
  water: C(0x3d86c6),
};

const tmpA = new THREE.Color();

export function grassColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const n1 = fbm(x / 170, z / 170, 3, S + 700);
  const n2 = valueNoise(x / 23, z / 23, S + 701);
  const t = clamp01((n1 - 0.5) * 2.4 + 0.5) * 0.78 + n2 * 0.22;
  if (t < 0.38) out.copy(PAL.grassDeep).lerp(PAL.grassMid, t / 0.38);
  else if (t < 0.72) out.copy(PAL.grassMid).lerp(PAL.grassLight, (t - 0.38) / 0.34);
  else out.copy(PAL.grassLight).lerp(PAL.grassYellow, Math.min(1, (t - 0.72) / 0.28));
  // forests read a little darker / bluer
  const forest = smoothstep(0.55, 0.7, fbm(x / 150, z / 150, 3, 4242));
  out.multiplyScalar(1 - forest * 0.16);
  out.b *= 1 + forest * 0.08;
  return out;
}

export interface TerrainData {
  heights: Float32Array;
  /** Base (biome) colour per vertex, linear RGB. */
  colors: Float32Array;
  /** dirt, sand per vertex. */
  splat: Float32Array;
  /** Where grass blades may grow (0..1), ignoring paths/sand which the shaders cut with noise. */
  grass: Float32Array;
  normalsY: Float32Array;
}

const V = GRID_N + 1;

function computeVertex(x: number, z: number, h: number, ny: number, outColor: THREE.Color, withSplat: boolean): [number, number, number] {
  const slope = 1 - ny;
  grassColor(x, z, outColor);
  const dTown = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (dTown < 90) outColor.lerp(PAL.grassMid, smoothstep(90, 50, dTown) * 0.45);
  const rockW = Math.max(smoothstep(0.3, 0.5, slope), smoothstep(65, 115, h) * 0.85);
  if (h > 60) outColor.lerp(tmpA.copy(PAL.mountainRock), smoothstep(60, 140, h) * 0.5);
  const n2 = valueNoise(x / 31, z / 31, S + 703);
  const snowW = smoothstep(150, 185, h + (n2 - 0.5) * 50) * (1 - smoothstep(0.5, 0.8, slope));
  if (h < 0.4) outColor.lerp(PAL.lakeBed, smoothstep(0.4, -1.5, h));

  let dirt = 0;
  let sand = 0;
  if (withSplat) {
    for (const r of ROADS) {
      const d = distToPolyline(x, z, r.pts);
      if (d < r.width + 3) dirt = Math.max(dirt, smoothstep(r.width + 1.6, r.width - 0.8, d));
    }
    if (dTown < 70) {
      for (const r of TOWN_PATHS) {
        const d = distToPolyline(x, z, r.pts);
        if (d < r.width + 3) dirt = Math.max(dirt, smoothstep(r.width + 1.4, r.width - 0.6, d));
      }
      for (const c of TOWN_DIRT_CIRCLES) {
        const d = Math.hypot(x - c.x, z - c.z);
        dirt = Math.max(dirt, smoothstep(c.r + 1.5, c.r - 0.8, d));
      }
    }
    // worn patches in the meadows
    if (dTown > 75) dirt = Math.max(dirt, smoothstep(0.76, 0.88, fbm(x / 34, z / 34, 2, S + 704)) * 0.7 * (1 - rockW));
    dirt *= 1 - rockW * 0.8;
    // beaches come and go along the banks; elsewhere the meadow runs almost to the waterline
    const beach = smoothstep(0.3, 0.68, fbm(x / 150, z / 150, 2, S + 705));
    const sTop = 0.6 + beach * 1.7, sFull = 0.3 + beach * 0.7;
    sand = smoothstep(sTop, sFull, h) * (h > -0.3 ? 1 : smoothstep(-1.2, -0.3, h));
  }
  const grass = (1 - rockW) * (1 - snowW) * smoothstep(0.45, 0.95, h);
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
  constructor(readonly data: TerrainData) {}

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
    const k = this.nearest(x, z);
    return this.data.grass[k] * (1 - smoothstep(0.35, 0.55, this.data.splat[k * 2])) * (1 - smoothstep(0.3, 0.6, this.data.splat[k * 2 + 1]));
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
    const slope = 1 - this.data.normalsY[k];
    if (slope > 0.45) out.lerp(PAL.rockLight, 0.8);
    const dirt = this.data.splat[k * 2];
    const sand = this.data.splat[k * 2 + 1];
    if (sand > 0.5) out.copy(PAL.sand);
    if (dirt > 0.5) out.copy(Math.hypot(x - TOWN.x, z - TOWN.z) < 70 ? PAL.townDirt : PAL.dirt);
    return out;
  }
}

// ---------- GPU-side data (grass placement and shading) ----------

export interface TerrainTextures {
  /** R32F heights, one texel per grid vertex (sample with texelFetch). */
  height: THREE.DataTexture;
  /** RGBA8: sqrt-encoded biome colour + grass weight in alpha. */
  ground: THREE.DataTexture;
  /** RGBA8: dirt, sand. */
  mask: THREE.DataTexture;
}

export function makeTerrainTextures(data: TerrainData): TerrainTextures {
  const height = new THREE.DataTexture(data.heights, V, V, THREE.RedFormat, THREE.FloatType);
  height.magFilter = height.minFilter = THREE.NearestFilter;
  height.unpackAlignment = 1;
  height.needsUpdate = true;
  const g = new Uint8Array(V * V * 4);
  const m = new Uint8Array(V * V * 4);
  for (let k = 0; k < V * V; k++) {
    g[k * 4] = Math.round(Math.sqrt(Math.min(1, data.colors[k * 3])) * 255);
    g[k * 4 + 1] = Math.round(Math.sqrt(Math.min(1, data.colors[k * 3 + 1])) * 255);
    g[k * 4 + 2] = Math.round(Math.sqrt(Math.min(1, data.colors[k * 3 + 2])) * 255);
    g[k * 4 + 3] = Math.round(clamp01(data.grass[k]) * 255);
    m[k * 4] = Math.round(clamp01(data.splat[k * 2]) * 255);
    m[k * 4 + 1] = Math.round(clamp01(data.splat[k * 2 + 1]) * 255);
    m[k * 4 + 3] = 255;
  }
  const mk = (arr: Uint8Array) => {
    const t = new THREE.DataTexture(arr, V, V, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  return { height, ground: mk(g), mask: mk(m) };
}

/**
 * Ground masks shared by the terrain fragment shader and the grass vertex shader, so blades end
 * exactly where the painted dirt / sand begins. Uses LOD 0 lookups for identical results in both.
 */
export const GLSL_GROUND = /* glsl */ `
uniform sampler2D uGroundNoise;
float sjDirtMask(float splat, vec2 p) {
  float a = textureLod(uGroundNoise, p * (1.0 / 29.0), 0.0).r;
  float b = textureLod(uGroundNoise, p * (1.0 / 5.3), 0.0).g;
  return smoothstep(0.43, 0.57, splat + (a - 0.5) * 0.42 + (b - 0.5) * 0.3);
}
float sjSandMask(float splat, vec2 p) {
  float a = textureLod(uGroundNoise, p * (1.0 / 29.0) + 0.5, 0.0).r;
  float b = textureLod(uGroundNoise, p * (1.0 / 5.3) + 0.3, 0.0).g;
  return smoothstep(0.42, 0.58, splat + (a - 0.5) * 0.4 + (b - 0.5) * 0.18);
}
/** Large-scale painterly hue drift of the meadow: warm yellow-green <-> cool blue-green. */
vec3 sjMeadowTint(vec3 base, vec2 p) {
  float l = textureLod(uGroundNoise, p * (1.0 / 131.0), 0.0).r;
  float m = textureLod(uGroundNoise, p * (1.0 / 37.0) + 0.21, 0.0).r;
  float drift = smoothstep(0.22, 0.78, l * 0.62 + m * 0.38);
  return mix(base * vec3(0.84, 0.96, 1.06), base * vec3(1.1, 1.05, 0.86), drift);
}
`;

/** Painterly terrain: brush-stroke meadows, chiselled layered rock on slopes, soft paths, beaches, snow. */
export function makeTerrainMaterial(grassRadius: { value: number }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const noise = getNoiseTexture();
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundNoise = { value: noise };
    shader.uniforms.uGrassR = grassRadius;
    shader.uniforms.uTown = { value: new THREE.Vector2(TOWN.x, TOWN.z) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 splat;\nvarying vec3 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGrassR; uniform vec2 uTown;
        varying vec3 vSplat; varying vec3 vWPos; varying vec3 vWNormal;
        ${GLSL_HASH}
        ${GLSL_GROUND}
        const vec3 ROCK_LIGHT = ${glslColor(PAL.rockLight)};
        const vec3 ROCK_DARK = ${glslColor(PAL.rockDark)};
        const vec3 ROCK_FAR = ${glslColor(PAL.mountainRock)};
        const vec3 DIRT = ${glslColor(PAL.dirt)};
        const vec3 TOWN_DIRT = ${glslColor(PAL.townDirt)};
        const vec3 SAND = ${glslColor(PAL.sand)};
        const vec3 SNOW = ${glslColor(PAL.snow)};
        const vec3 LAKEBED = ${glslColor(PAL.lakeBed)};`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 Nw = normalize(vWNormal);
        vec2 p = vWPos.xz;
        float camD = distance(vWPos, cameraPosition);
        float nearK = 1.0 - smoothstep(35.0, 140.0, camD);
        vec4 nM = texture2D(uGroundNoise, p * (1.0 / 29.0));
        vec4 nS = texture2D(uGroundNoise, p * (1.0 / 5.3));
        vec4 nL = texture2D(uGroundNoise, p * (1.0 / 211.0));
        float slope = 1.0 - Nw.y;

        // ---- meadow ----
        vec3 g = sjMeadowTint(diffuseColor.rgb, p);
        float ang = nL.g * 9.0;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 sp = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
        float st1 = texture2D(uGroundNoise, vec2(sp.x * 0.09, sp.y * 0.42)).g;
        float st2 = texture2D(uGroundNoise, vec2(sp.x * 0.3, sp.y * 1.5) + 0.37).a;
        g *= 0.9 + (st1 - 0.5) * 0.3 + (st2 - 0.5) * 0.18 * nearK + (nS.r - 0.5) * 0.08;
        g = mix(g, g * vec3(1.16, 1.1, 0.8), smoothstep(0.66, 0.84, st1) * 0.55);
        g = mix(g, g * vec3(0.8, 0.9, 1.0), smoothstep(0.34, 0.18, st1) * 0.45);
        // beyond the blades: clumpy, mottled turf so the far meadow keeps a grassy texture
        float farK = smoothstep(18.0, 60.0, camD) * (1.0 - smoothstep(260.0, 600.0, camD));
        float clump = texture2D(uGroundNoise, p * (1.0 / 6.5)).b;
        float clump2 = texture2D(uGroundNoise, p * (1.0 / 2.3) + 0.4).g;
        float patchy = texture2D(uGroundNoise, p * (1.0 / 19.0) + 0.13).g;
        g *= mix(1.0, (0.8 + clump * 0.3 + (clump2 - 0.5) * 0.12) * (0.84 + patchy * 0.32), farK);
        // ground under nearby blades is in their shade
        float under = (1.0 - smoothstep(uGrassR * 0.6, uGrassR, camD));
        g *= 1.0 - under * 0.32;

        // ---- rock on steep slopes and high ground ----
        float rockW = smoothstep(0.4, 0.56, slope + (nM.r - 0.5) * 0.24);
        rockW = max(rockW, smoothstep(70.0, 120.0, vWPos.y + (nL.r - 0.5) * 60.0) * 0.9);
        vec3 Nb = Nw;
        if (rockW > 0.001) {
          vec2 hz = normalize(Nw.xz + vec2(1e-4, 0.0));
          vec2 tang = vec2(-hz.y, hz.x);
          float u = dot(p, tang);
          float y = vWPos.y;
          float warp = (texture2D(uGroundNoise, vec2(u * 0.017, y * 0.04)).r - 0.5) * 3.0;
          float ly = (y + warp) / 3.1;
          float layer = floor(ly);
          float lf = fract(ly);
          float cu = u / 3.8 + sjHash1(layer) * 0.9 + (texture2D(uGroundNoise, vec2(u * 0.04, layer * 0.137)).g - 0.5) * 0.7;
          float colId = floor(cu);
          float cf = fract(cu);
          float hr = sjHash2(vec2(colId, layer));
          float hr2 = sjHash2(vec2(colId * 1.3 + 17.0, layer * 1.7));
          // per-block variation fades out with distance (3 m blocks alias into moire far away)
          float detK = 1.0 - smoothstep(140.0, 420.0, camD);
          hr = mix(0.5, hr, detK);
          hr2 = mix(0.5, hr2, detK);
          lf = mix(0.5, lf, detK);
          vec3 rock = mix(ROCK_DARK, ROCK_LIGHT, 0.42 + hr * 0.38 + (nS.g - 0.5) * 0.22 * detK + (nL.g - 0.5) * 0.3 + (nM.g - 0.5) * 0.18);
          rock *= mix(vec3(0.97, 0.99, 1.04), vec3(1.05, 1.0, 0.92), hr2);
          float crackV = 1.0 - smoothstep(0.0, 0.045 + 0.04 * (1.0 - nearK), min(cf, 1.0 - cf));
          float crackH = 1.0 - smoothstep(0.0, 0.06, min(lf, 1.0 - lf));
          float crackK = 1.0 - smoothstep(120.0, 400.0, camD);
          rock *= 1.0 - 0.42 * max(crackV, crackH * 0.75) * crackK;
          rock *= 0.9 + texture2D(uGroundNoise, vec2(u, y) * 0.37).a * 0.2 * detK + 0.1 * (1.0 - detK);
          float streak = texture2D(uGroundNoise, vec2(u * 0.25, y * 0.015)).g;
          rock *= 1.0 - smoothstep(0.62, 0.9, streak) * 0.16 * detK;
          // distant mountains turn bluish grey; sheer faces darker than scree
          rock = mix(rock, ROCK_FAR * (0.85 + hr * 0.3 + (nL.g - 0.5) * 0.3), smoothstep(150.0, 700.0, camD));
          rock *= mix(1.0, mix(1.12, 0.74, smoothstep(0.3, 0.75, slope)), smoothstep(200.0, 600.0, camD));
          // every block faces a slightly different way: chiselled, faceted look
          float fa = (hr - 0.5) * 0.8 * crackK;
          vec3 t3 = vec3(tang.x, 0.0, tang.y);
          vec3 Nf = normalize(Nw * cos(fa) + t3 * sin(fa) + vec3(0.0, (hr2 - 0.5) * 0.35 + (lf - 0.5) * 0.3, 0.0));
          Nb = normalize(mix(Nw, Nf, 0.9));
          // moss / grass on ledges
          float moss = smoothstep(0.62, 0.9, nM.g * 0.6 + (1.0 - slope) * 0.75 - (1.0 - lf) * 0.15) * (1.0 - smoothstep(60.0, 110.0, y));
          rock = mix(rock, g * 0.85, moss);
          g = mix(g, rock, rockW);
        }

        // ---- snow ----
        float couloir = texture2D(uGroundNoise, vec2(p.x * 0.004 + p.y * 0.002, vWPos.y * 0.01)).g;
        float snowLine = 290.0 + (nL.r - 0.5) * 120.0 + (nM.r - 0.5) * 40.0 - smoothstep(0.5, 0.8, couloir) * 70.0;
        float snowW = smoothstep(snowLine, snowLine + 50.0, vWPos.y) * (1.0 - smoothstep(0.46, 0.72, slope + (couloir - 0.5) * 0.5 + (nL.b - 0.5) * 0.25));
        // high summits are capped even where steep
        snowW = max(snowW, smoothstep(snowLine + 170.0, snowLine + 260.0, vWPos.y) * (0.6 + couloir * 0.4) * (1.0 - smoothstep(0.72, 0.95, slope)));
        g = mix(g, SNOW * (0.93 + nS.r * 0.08) * mix(vec3(1.0), vec3(0.9, 0.94, 1.03), smoothstep(0.35, 0.7, slope)), snowW);

        // ---- paths ----
        float townK = smoothstep(75.0, 60.0, distance(p, uTown));
        float dirtM = sjDirtMask(vSplat.x, p);
        vec3 dirtCol = mix(DIRT, TOWN_DIRT, townK) * (0.86 + nS.g * 0.18 + (nM.b - 0.5) * 0.1);
        float peb = smoothstep(0.08, 0.0, texture2D(uGroundNoise, p * 0.8).b);
        dirtCol = mix(dirtCol, dirtCol * vec3(0.7, 0.68, 0.66), peb * 0.7 * nearK);
        dirtCol = mix(dirtCol, dirtCol * 1.08, smoothstep(0.85, 1.0, vSplat.x));
        float edge = dirtM * (1.0 - dirtM) * 4.0;
        g = mix(g, dirtCol, dirtM);
        g *= 1.0 - edge * 0.14;

        // ---- beaches and lake bed ----
        float sandM = sjSandMask(vSplat.y, p);
        vec3 sandCol = SAND * (0.95 + nS.a * 0.08);
        sandCol = mix(sandCol * vec3(0.8, 0.78, 0.74), sandCol, smoothstep(-0.2, 0.6, vWPos.y));
        g = mix(g, sandCol, sandM);
        g = mix(g, LAKEBED * (0.85 + nS.r * 0.2), smoothstep(-0.2, -1.6, vWPos.y));

        diffuseColor.rgb = g;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(Nb, 0.0)).xyz);`)
      .replace('#include <lights_lambert_pars_fragment>', lambertWrapChunk('0.28'));
  };
  mat.customProgramCacheKey = () => 'sj-terrain';
  return mat;
}

function glslColor(c: THREE.Color): string {
  return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
}

const CHUNK = 64;

export interface TerrainMeshes {
  group: THREE.Group;
  /** Pick a level of detail per chunk around the focus (full res near, 1/2 and 1/4 further away). */
  update(focus: THREE.Vector3): void;
  /** Scale the LOD distances (quality setting). */
  setLodScale(s: number): void;
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
      const spl = new Float32Array(nVerts * 3);
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
        spl[o * 3] = data.splat[k * 2];
        spl[o * 3 + 1] = data.splat[k * 2 + 1];
        spl[o * 3 + 2] = data.grass[k];
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
      geo.setAttribute('splat', new THREE.BufferAttribute(spl, 3));
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
  for (const m of buildOuterTerrain(material)) group.add(m);
  const last = new THREE.Vector3(1e9, 0, 1e9);
  let lodScale = 1;
  return {
    group,
    setLodScale(s: number) {
      lodScale = s;
      last.set(1e9, 0, 1e9);
    },
    update(focus: THREE.Vector3) {
      if (Math.abs(focus.x - last.x) + Math.abs(focus.z - last.z) < 8) return;
      last.copy(focus);
      for (const r of recs) {
        const dx = Math.max(r.minX - focus.x, 0, focus.x - r.maxX);
        const dz = Math.max(r.minZ - focus.z, 0, focus.z - r.maxZ);
        const d = Math.hypot(dx, dz);
        const lod = d < 200 * lodScale ? 0 : d < 480 * lodScale ? 1 : 2;
        if (lod !== r.lod) {
          r.lod = lod;
          r.geo.setIndex(indices[lod]);
        }
      }
    },
  };
}

/**
 * Far terrain: a polar ring from the edge of the playable grid out to the horizon, carrying the
 * snowy mountain ranges (not walkable). Split into sectors so off-screen parts are culled.
 */
function buildOuterTerrain(material: THREE.Material): THREE.Mesh[] {
  const R0 = 560, R1 = 3000;
  const radial = 86;
  const SECTORS = 8;
  const perSector = 64;
  const meshes: THREE.Mesh[] = [];
  const c = new THREE.Color();
  const radii: number[] = [];
  for (let i = 0; i < radial; i++) radii.push(R0 * Math.pow(R1 / R0, i / (radial - 1)));
  for (let s = 0; s < SECTORS; s++) {
    const cols = perSector + 1;
    const n = cols * radial;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < radial; i++) {
      for (let a = 0; a < cols; a++) {
        const ang = ((s * perSector + a) / (SECTORS * perSector)) * Math.PI * 2;
        const x = Math.cos(ang) * radii[i];
        const z = Math.sin(ang) * radii[i];
        const inner = Math.max(Math.abs(x), Math.abs(z));
        let h = terrainHeight(x, z);
        if (inner < GRID_HALF - 1) h -= 40 * smoothstep(GRID_HALF - 1, GRID_HALF - 60, inner) + 2;
        const o = (i * cols + a) * 3;
        pos[o] = x;
        pos[o + 1] = h;
        pos[o + 2] = z;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < radial - 1; i++) {
      for (let a = 0; a < cols - 1; a++) {
        const p0 = i * cols + a, p1 = p0 + 1, p2 = p0 + cols, p3 = p2 + 1;
        // counter-clockwise seen from above (upward normals, front faces visible from the sky side)
        idx.push(p0, p1, p2, p1, p3, p2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    const col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      computeVertex(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], nor.getY(k), c, false);
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'terrain-far';
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }
  return meshes;
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

