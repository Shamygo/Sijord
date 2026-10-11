import * as THREE from 'three';
import { smoothstep } from './noise';
import { CELL, GRID_HALF, GRID_N, TOWN, WATER_LEVEL } from './layout';
import { terrainHeight, sampleGround, meadowColor, type GroundSample } from './heightfield';
import { PATCH_N, PATCH_V } from './stream/lattice';
import { PATCH_VERTS, writeSkirts, type PatchData, type L0Data } from './stream/patch';
import { getNoiseTexture } from './textures';
import { GLSL_HASH, lambertWrapChunk } from './materials';
import { worldUniforms } from './shared';

export { terrainHeight, waterDistance } from './heightfield';

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

const tmpRGB: [number, number, number] = [0, 0, 0];

/** The meadow's base grass colour at a point (linear). */
export function grassColor(x: number, z: number, out: THREE.Color): THREE.Color {
  meadowColor(x, z, tmpRGB);
  return out.setRGB(tmpRGB[0], tmpRGB[1], tmpRGB[2]);
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
  const g: GroundSample = { r: 0, g: 0, b: 0, dirt: 0, sand: 0, grass: 0, snow: 0, tr: 1, tg: 1, tb: 1, lava: 0 };
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
      sampleGround(-GRID_HALF + i * CELL, -GRID_HALF + j * CELL, heights[k], ny / len, g, true);
      colors[k * 3] = g.r;
      colors[k * 3 + 1] = g.g;
      colors[k * 3 + 2] = g.b;
      splat[k * 2] = g.dirt;
      splat[k * 2 + 1] = g.sand;
      grass[k] = g.grass;
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

  /** Grass weight at the nearest vertex, before paths and sand cut it. */
  rawGrassAt(x: number, z: number): number {
    return this.data.grass[this.nearest(x, z)];
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
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splat;\nattribute vec4 tint;\nvarying vec4 vSplat;\nvarying vec4 vTint;\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat;\nvTint = tint;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGrassR; uniform vec2 uTown; uniform float uTime;
        varying vec4 vSplat; varying vec4 vTint; varying vec3 vWPos; varying vec3 vWNormal;
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
        // How grassy the ground is (vertex grass weight): bare ash, sand and snow skip the
        // brush-stroke turf and get a rough, gritty ground instead.
        float grassy = clamp(vSplat.z * 1.6, 0.0, 1.0);
        vec3 g = mix(diffuseColor.rgb, sjMeadowTint(diffuseColor.rgb, p), grassy);
        float ang = nL.g * 9.0;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 sp = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
        float st1 = texture2D(uGroundNoise, vec2(sp.x * 0.09, sp.y * 0.42)).g;
        float st2 = texture2D(uGroundNoise, vec2(sp.x * 0.3, sp.y * 1.5) + 0.37).a;
        vec3 turf = g * (0.9 + (st1 - 0.5) * 0.3 + (st2 - 0.5) * 0.18 * nearK + (nS.r - 0.5) * 0.08);
        turf = mix(turf, turf * vec3(1.16, 1.1, 0.8), smoothstep(0.66, 0.84, st1) * 0.55);
        turf = mix(turf, turf * vec3(0.8, 0.9, 1.0), smoothstep(0.34, 0.18, st1) * 0.45);
        float grit = texture2D(uGroundNoise, p * 0.71 + 0.2).r;
        vec3 bare = g * (0.86 + (nS.r - 0.5) * 0.22 + (nM.g - 0.5) * 0.2 + (nL.b - 0.5) * 0.16 + (grit - 0.5) * 0.12 * nearK);
        g = mix(bare, turf, grassy);
        // beyond the blades: clumpy, mottled turf so the far meadow keeps a grassy texture
        float farK = smoothstep(18.0, 60.0, camD) * (1.0 - smoothstep(260.0, 600.0, camD)) * grassy;
        float clump = texture2D(uGroundNoise, p * (1.0 / 6.5)).b;
        float clump2 = texture2D(uGroundNoise, p * (1.0 / 2.3) + 0.4).g;
        float patchy = texture2D(uGroundNoise, p * (1.0 / 19.0) + 0.13).g;
        g *= mix(1.0, (0.8 + clump * 0.3 + (clump2 - 0.5) * 0.12) * (0.84 + patchy * 0.32), farK);
        // ground under nearby blades is in their shade
        float under = (1.0 - smoothstep(uGrassR * 0.6, uGrassR, camD)) * grassy;
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
          rock *= vTint.rgb;
          float crackV = 1.0 - smoothstep(0.0, 0.045 + 0.04 * (1.0 - nearK), min(cf, 1.0 - cf));
          float crackH = 1.0 - smoothstep(0.0, 0.06, min(lf, 1.0 - lf));
          float crackK = 1.0 - smoothstep(120.0, 400.0, camD);
          rock *= 1.0 - 0.42 * max(crackV, crackH * 0.75) * crackK;
          rock *= 0.9 + texture2D(uGroundNoise, vec2(u, y) * 0.37).a * 0.2 * detK + 0.1 * (1.0 - detK);
          float streak = texture2D(uGroundNoise, vec2(u * 0.25, y * 0.015)).g;
          rock *= 1.0 - smoothstep(0.62, 0.9, streak) * 0.16 * detK;
          // distant mountains turn bluish grey; sheer faces darker than scree
          rock = mix(rock, ROCK_FAR * vTint.rgb * (0.85 + hr * 0.3 + (nL.g - 0.5) * 0.3), smoothstep(150.0, 700.0, camD));
          rock *= mix(1.0, mix(1.12, 0.74, smoothstep(0.3, 0.75, slope)), smoothstep(200.0, 600.0, camD));
          // Bedding layers only read on steep faces; on gentle high ground they would draw
          // contour stripes, so it is broken scree there instead.
          float strataK = smoothstep(0.16, 0.4, slope);
          vec3 scree = mix(ROCK_DARK, ROCK_LIGHT, 0.45 + (nS.g - 0.5) * 0.3 + (nM.g - 0.5) * 0.28 + (nL.g - 0.5) * 0.3) * vTint.rgb;
          float pebs = texture2D(uGroundNoise, p * 0.9 + 0.31).a;
          scree *= 0.86 + pebs * 0.22 * nearK + (nM.b - 0.5) * 0.12;
          scree = mix(scree, ROCK_FAR * vTint.rgb * (0.9 + (nL.g - 0.5) * 0.3), smoothstep(150.0, 700.0, camD));
          rock = mix(scree, rock, strataK);
          // every block faces a slightly different way: chiselled, faceted look
          float fa = (hr - 0.5) * 0.8 * crackK;
          vec3 t3 = vec3(tang.x, 0.0, tang.y);
          vec3 Nf = normalize(Nw * cos(fa) + t3 * sin(fa) + vec3(0.0, (hr2 - 0.5) * 0.35 + (lf - 0.5) * 0.3, 0.0));
          Nb = normalize(mix(Nw, Nf, 0.9 * strataK));
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
        snowW = max(snowW, smoothstep(snowLine + 260.0, snowLine + 340.0, vWPos.y) * (0.6 + couloir * 0.4) * (1.0 - smoothstep(0.62, 0.9, slope)));
        // snowfields painted by biome (the tundra), drifting in and out
        snowW = max(snowW, smoothstep(0.2, 0.7, vSplat.w + (nM.r - 0.5) * 0.45 + (nS.b - 0.5) * 0.15));
        // Snow: wind-blown drifts, blue shade on lee slopes and in hollows, a glitter up close.
        float drift = nL.r * 0.55 + nM.g * 0.3 + nS.b * 0.15;
        vec3 snowC = SNOW * (0.88 + drift * 0.16);
        snowC = mix(snowC, snowC * vec3(0.8, 0.88, 1.04), smoothstep(0.45, 0.2, Nw.y + (drift - 0.5) * 0.3) * 0.7 + smoothstep(0.62, 0.35, drift) * 0.25);
        float ripple = texture2D(uGroundNoise, vec2(sp.x * 0.5, sp.y * 2.6)).g;
        snowC *= 1.0 - (ripple - 0.5) * 0.08 * nearK;
        float glint = step(0.985, sjHash2(floor(p * 9.0))) * nearK;
        snowC += glint * 0.35;
        g = mix(g, snowC * mix(vec3(1.0), vec3(0.9, 0.94, 1.03), smoothstep(0.35, 0.7, slope)), snowW);

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

        // ---- lava channels: black crust at the edges, molten and glowing in the middle ----
        if (vTint.a > 0.001) {
          float crust = smoothstep(0.0, 0.35, vTint.a);
          float molten = smoothstep(0.55, 0.95, vTint.a + (nS.r - 0.5) * 0.3);
          g = mix(g, vec3(0.05, 0.045, 0.045) * (0.8 + nS.g * 0.4), crust);
          float flow = texture2D(uGroundNoise, p * 0.08 + vec2(uTime * 0.012, uTime * 0.007)).r;
          vec3 hot = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.2), smoothstep(0.45, 0.8, flow));
          g = mix(g, hot * 0.25, molten);
          totalEmissiveRadiance += hot * molten * (1.6 + flow * 1.4);
        }

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

/** Index buffer for one 64 x 64 patch plus its skirts (shared by every patch). */
let patchIndex: THREE.BufferAttribute | null = null;
export function terrainPatchIndex(): THREE.BufferAttribute {
  if (patchIndex) return patchIndex;
  const cv = PATCH_V;
  const idx: number[] = [];
  for (let j = 0; j < PATCH_N; j++) {
    for (let i = 0; i < PATCH_N; i++) {
      const a = j * cv + i;
      const b = a + 1;
      const c = a + cv;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const base = cv * cv;
  const grid = (side: number, k: number) => side === 0 ? k : side === 1 ? k * cv + PATCH_N : side === 2 ? PATCH_N * cv + k : k * cv;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < PATCH_N; k++) {
      const g0 = grid(side, k), g1 = grid(side, k + 1);
      const s0 = base + side * cv + k, s1 = base + side * cv + k + 1;
      idx.push(g0, s0, g1, g1, s0, s1, g0, g1, s0, g1, s1, s0);
    }
  }
  patchIndex = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  return patchIndex;
}

/**
 * A level-0 patch over the vale's precomputed core grid (chunk ci0, cj0 counted from the grid's
 * corner), in the same layout the workers produce, so core and streamed patches render alike.
 */
export function corePatch(data: TerrainData, gi0: number, gj0: number, level0: { ix: number; iz: number }): PatchData {
  const n = PATCH_VERTS;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const splat = new Float32Array(n * 4);
  const tint = new Float32Array(n * 4);
  const l0: L0Data = {
    heights: new Float32Array(PATCH_V * PATCH_V),
    normalY: new Float32Array(PATCH_V * PATCH_V),
    ground: new Uint8Array(PATCH_V * PATCH_V * 4),
    mask: new Uint8Array(PATCH_V * PATCH_V * 4),
  };
  let minY = Infinity, maxY = -Infinity;
  for (let j = 0; j < PATCH_V; j++) {
    for (let i = 0; i < PATCH_V; i++) {
      const gi = gi0 + i, gj = gj0 + j;
      const k = gj * V + gi;
      const o = j * PATCH_V + i;
      const h = data.heights[k];
      position[o * 3] = -GRID_HALF + gi * CELL;
      position[o * 3 + 1] = h;
      position[o * 3 + 2] = -GRID_HALF + gj * CELL;
      const hl = data.heights[gj * V + Math.max(0, gi - 1)];
      const hr = data.heights[gj * V + Math.min(V - 1, gi + 1)];
      const hd = data.heights[Math.max(0, gj - 1) * V + gi];
      const hu = data.heights[Math.min(V - 1, gj + 1) * V + gi];
      const nx = hl - hr, nz = hd - hu, ny = 2 * CELL;
      const len = Math.hypot(nx, ny, nz);
      normal[o * 3] = nx / len;
      normal[o * 3 + 1] = ny / len;
      normal[o * 3 + 2] = nz / len;
      color[o * 3] = data.colors[k * 3];
      color[o * 3 + 1] = data.colors[k * 3 + 1];
      color[o * 3 + 2] = data.colors[k * 3 + 2];
      splat[o * 4] = data.splat[k * 2];
      splat[o * 4 + 1] = data.splat[k * 2 + 1];
      splat[o * 4 + 2] = data.grass[k];
      tint[o * 4] = tint[o * 4 + 1] = tint[o * 4 + 2] = 1;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
      l0.heights[o] = h;
      l0.normalY[o] = data.normalsY[k];
      l0.ground[o * 4] = Math.round(Math.sqrt(Math.min(1, data.colors[k * 3])) * 255);
      l0.ground[o * 4 + 1] = Math.round(Math.sqrt(Math.min(1, data.colors[k * 3 + 1])) * 255);
      l0.ground[o * 4 + 2] = Math.round(Math.sqrt(Math.min(1, data.colors[k * 3 + 2])) * 255);
      l0.ground[o * 4 + 3] = Math.round(Math.max(0, Math.min(1, data.grass[k])) * 255);
      l0.mask[o * 4] = Math.round(Math.max(0, Math.min(1, data.splat[k * 2])) * 255);
      l0.mask[o * 4 + 1] = Math.round(Math.max(0, Math.min(1, data.splat[k * 2 + 1])) * 255);
    }
  }
  writeSkirts(position, normal, color, splat, tint, 3);
  return { level: 0, ix: level0.ix, iz: level0.iz, position, normal, color, splat, tint, minY, maxY, l0 };
}

/** Refresh just the grass weights of a core patch's l0 data (after grass is trampled). */
export function corePatchGrass(data: TerrainData, gi0: number, gj0: number, l0: L0Data): void {
  for (let j = 0; j < PATCH_V; j++) {
    for (let i = 0; i < PATCH_V; i++) {
      const k = (gj0 + j) * V + gi0 + i;
      l0.ground[(j * PATCH_V + i) * 4 + 3] = Math.round(Math.max(0, Math.min(1, data.grass[k])) * 255);
    }
  }
}

export { WATER_LEVEL };
