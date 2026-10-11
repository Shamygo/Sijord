/**
 * The ground everywhere in Sijord, as pure functions (no three.js, no DOM) so the terrain
 * workers, the main thread and the tests all compute exactly the same heights and colours.
 *
 * Inside the hand-built vale (about ±470 m round the origin) the height is the vale's own
 * function, unchanged. Beyond it the region's biomes take over (src/shared/region.ts), blended
 * across a 150 m band so there is no seam.
 */
import { fbm, ridged, valueNoise, smoothstep, lerp, smax, clamp01 } from './noise';
import { MESAS, POI, POND, RIVER_HALF_WIDTH, RIVER_IN, RIVER_OUT, ROADS, TOWN, TOWN_DIRT_CIRCLES, TOWN_PATHS, distToPolyline, lakeDist } from './layout';
import {
  BIOME_IDS, BIOME_INDEX, LAVA, VOLCANO, biomeWeights, coastDist, lakeDistRegion, lavaDist, riverDist, roadDist,
  settlementBlendR, settlementsNear, valeWeight, type BiomeId, type Settlement,
} from '../../shared/region';
import { settlementGround } from '../../shared/settlement-layout';

const S = 1337;

// ---------------------------------------------------------------------------------------------
// The vale (moved here unchanged from terrain.ts, minus the ring of boundary mountains)
// ---------------------------------------------------------------------------------------------

function baseHills(x: number, z: number, full: boolean): number {
  let h = 10 + (fbm(x / 260, z / 260, full ? 4 : 2, S) - 0.5) * 36;
  if (full) h += (fbm(x / 55, z / 55, 3, S + 100) - 0.5) * 6;
  return h;
}

/** Stepped ledges for layered cliffs. */
export function terrace(s: number, steps: number): number {
  const v = s * steps;
  const i = Math.floor(v);
  const f = v - i;
  const g = f * f * f * (f * (f * 6 - 15) + 10);
  return Math.min(1, (i + g * 0.85 + f * 0.15) / steps);
}

/** Distance to the vale's river, lake or pond edge (negative in the water) and that water's floor. */
export function waterDistance(x: number, z: number): { d: number; floor: number } {
  const dr = Math.min(distToPolyline(x, z, RIVER_IN), distToPolyline(x, z, RIVER_OUT)) -
    (RIVER_HALF_WIDTH + (valueNoise(x / 40, z / 40, S + 600) - 0.5) * 5);
  const dl = lakeDist(x, z) + (valueNoise(x / 20, z / 20, S + 601) - 0.5) * 6;
  const dp = Math.hypot(x - POND.x, z - POND.z) - POND.r + (valueNoise(x / 7, z / 7, S + 602) - 0.5) * 3;
  if (dp < dr && dp < dl) return { d: dp, floor: -1.7 };
  if (dl < dr) return { d: dl, floor: -3.4 };
  return { d: dr, floor: -2.5 };
}

/** Distance to the region's own rivers and lakes (not the vale's) and the floor they fall to. */
function regionWaterDistance(x: number, z: number): { d: number; floor: number } {
  const v = { d: Infinity, floor: -2.5 };
  const rd = riverDist(x, z);
  if (rd < v.d) v.d = rd;
  const l = lakeDistRegion(x, z);
  if (l.d < v.d) {
    v.d = l.d + (valueNoise(x / 20, z / 20, S + 601) - 0.5) * 6;
    v.floor = -3.4;
  }
  return v;
}

/** Distance to any water (vale or region) and the floor it falls to. */
export function anyWaterDistance(x: number, z: number): { d: number; floor: number } {
  const v = waterDistance(x, z);
  const rd = riverDist(x, z);
  if (rd < v.d) v.d = rd, v.floor = -2.5;
  const l = lakeDistRegion(x, z);
  if (l.d < v.d) {
    v.d = l.d + (valueNoise(x / 20, z / 20, S + 601) - 0.5) * 6;
    v.floor = -3.4;
  }
  return v;
}

/** The vale's height without its old ring of boundary mountains. */
function valeHeight(x: number, z: number): number {
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
  return h;
}

// ---------------------------------------------------------------------------------------------
// The region's biomes
// ---------------------------------------------------------------------------------------------

/** Snow-capped summits of the Stormcrown spine (x, z, radius, height). */
const SUMMITS: [number, number, number, number][] = [
  [500, 3080, 620, 640], [-980, 3020, 560, 580], [-620, 3420, 480, 520], [220, 3450, 450, 500],
  [920, 3280, 420, 450], [-1420, 3260, 380, 430], [60, 2620, 330, 300], [-760, 2600, 320, 300],
];

/** Low-frequency (road grade) and full height of one biome at a point. */
function biomeHeight(b: BiomeId, x: number, z: number, out: { coarse: number; full: number }): void {
  switch (b) {
    case 'meadow': {
      const c = 10 + (fbm(x / 700, z / 700, 2, 2101) - 0.5) * 26 + (fbm(x / 260, z / 260, 2, S) - 0.5) * 30;
      out.coarse = c;
      out.full = c + (fbm(x / 55, z / 55, 3, S + 100) - 0.5) * 6 + (fbm(x / 130, z / 130, 2, 2102) - 0.5) * 6;
      return;
    }
    case 'elderwood': {
      const c = 24 + (fbm(x / 600, z / 600, 2, 2201) - 0.5) * 40;
      out.coarse = c;
      out.full = c + (ridged(x / 190, z / 190, 3, 2202) - 0.45) * 16 + (fbm(x / 40, z / 40, 2, 2203) - 0.5) * 4;
      return;
    }
    case 'heath': {
      const c = 50 + (fbm(x / 800, z / 800, 2, 2301) - 0.5) * 34;
      // Low rounded swells; the heath's rocks are megaliths and outcrops, not terrain spikes.
      out.coarse = c;
      out.full = c + (fbm(x / 150, z / 150, 3, 2302) - 0.5) * 12 + (fbm(x / 60, z / 60, 2, 2303) - 0.5) * 3;
      return;
    }
    case 'peaks': {
      let m = 0;
      for (const [px, pz, r, H] of SUMMITS) {
        const dx = x - px, dz = z - pz;
        if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d >= r) continue;
        m = smax(m, H * Math.pow(1 - d / r, 1.35), 60);
      }
      const c = 150 + ridged(x / 700, z / 700, 2, 2401) * 200 + m * 0.55;
      out.coarse = c;
      // Sharp ridges and gullies with cliff bands, so rock shows between the snowfields.
      const crag = ridged(x / 120, z / 120, 4, 2402);
      out.full = c + m * 0.45 * (0.62 + 0.55 * ridged(x / 260, z / 260, 4, S + 520)) + (crag - 0.5) * 80 + terrace(smoothstep(0.3, 0.9, crag), 4) * 18 + (fbm(x / 45, z / 45, 2, 2403) - 0.5) * 8;
      return;
    }
    case 'tundra': {
      const c = 18 + (fbm(x / 700, z / 700, 2, 2501) - 0.5) * 40;
      out.coarse = c;
      out.full = c + (fbm(x / 90, z / 90, 3, 2502) - 0.5) * 9 + (fbm(x / 30, z / 30, 2, 2503) - 0.5) * 1.6;
      return;
    }
    case 'fjord': {
      const c = 88 + (fbm(x / 500, z / 500, 2, 2601) - 0.5) * 60;
      out.coarse = c;
      out.full = c + (ridged(x / 140, z / 140, 3, 2602) - 0.4) * 46 + (fbm(x / 40, z / 40, 2, 2603) - 0.5) * 5;
      return;
    }
    case 'ashen': {
      const c = 78 + ridged(x / 600, z / 600, 2, 2701) * 80;
      out.coarse = c;
      // Stepped basalt benches over rough black rock.
      const bench = terrace(smoothstep(0.45, 0.7, fbm(x / 140, z / 140, 2, 2703)), 3) * 24;
      out.full = c + (fbm(x / 70, z / 70, 3, 2702) - 0.5) * 16 + bench;
      return;
    }
    case 'badlands': {
      const c = 28 + (fbm(x / 600, z / 600, 2, 2801) - 0.5) * 22;
      const m = fbm(x / 230, z / 230, 3, 2802);
      const mesa = terrace(smoothstep(0.5, 0.64, m), 3) * 52;
      out.coarse = c;
      out.full = c + mesa + (fbm(x / 50, z / 50, 2, 2803) - 0.5) * 3 + (valueNoise(x / 9, z / 9, 2804) - 0.5) * 1.2;
      return;
    }
    case 'mirefen': {
      const c = 2.4 + (fbm(x / 400, z / 400, 2, 2901) - 0.5) * 4;
      out.coarse = Math.max(c, 1.5);
      out.full = c + (fbm(x / 34, z / 34, 3, 2902) - 0.5) * 4.2;
      return;
    }
    case 'skerry': {
      const c = 6 + (fbm(x / 160, z / 160, 2, 3001) - 0.5) * 10;
      out.coarse = c;
      out.full = c + (fbm(x / 40, z / 40, 3, 3002) - 0.5) * 5;
      return;
    }
  }
}

const W = new Float32Array(BIOME_IDS.length);
const tmpH = { coarse: 0, full: 0 };

/** Cached coarse ground level at each settlement's centre (its plateau height). */
const plateauCache = new Map<string, number>();
export function settlementPlateau(s: Settlement): number {
  let h = plateauCache.get(s.id);
  if (h !== undefined) return h;
  if (s.id === 'crownspire') h = 455;
  // Skarsund's quays sit at the head of its fjord, at the water line.
  else if (s.id === 'skarsund') h = 4.5;
  else {
    const w = biomeWeights(s.x, s.z, new Float32Array(BIOME_IDS.length));
    h = 0;
    for (let i = 0; i < w.length; i++) {
      if (w[i] < 0.01) continue;
      biomeHeight(BIOME_IDS[i], s.x, s.z, tmpH);
      h += w[i] * tmpH.coarse;
    }
    h = Math.max(h, s.style === 'harbour' || s.style === 'stilt' ? 2.6 : 4);
  }
  plateauCache.set(s.id, h);
  return h;
}

/**
 * Region height without the vale: biomes, volcano, coast, lakes, rivers, roads and
 * settlement plateaus.
 */
export function regionHeight(x: number, z: number): number {
  const w = biomeWeights(x, z, W);
  let coarse = 0, full = 0, fjordW = 0, mireW = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] < 0.004) continue;
    biomeHeight(BIOME_IDS[i], x, z, tmpH);
    coarse += w[i] * tmpH.coarse;
    full += w[i] * tmpH.full;
  }
  fjordW = w[BIOME_INDEX.fjord];
  mireW = w[BIOME_INDEX.mirefen];
  // Meadows never dip below the old vale floor except where water is carved.
  const dry = 1 - mireW;
  full = lerp(full, smax(full, 3.5, 4), dry);
  coarse = lerp(coarse, smax(coarse, 3.5, 4), dry);

  // The volcano: a cone with a crater, in the Ashen Highlands.
  {
    const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (d < VOLCANO.r) {
      const t = 1 - d / VOLCANO.r;
      let cone = VOLCANO.h * Math.pow(t, 1.6) * (0.9 + 0.2 * ridged(x / 120, z / 120, 2, 3101));
      cone -= smoothstep(VOLCANO.crater * 1.4, VOLCANO.crater * 0.6, d) * 90;
      full = smax(full, full * 0.3 + cone, 40);
      coarse = smax(coarse, coarse * 0.3 + cone, 40);
    }
  }

  let h = full;

  // Roads: graded towards the low-frequency height so they stay walkable.
  const dRoad = roadDist(x, z);
  if (dRoad < 18) h = lerp(h, coarse, 0.85 * smoothstep(18, 2.5, dRoad));

  // Lava channels sit a little below the rock.
  const dLava = lavaDist(x, z);
  if (dLava < 10) h -= 1.6 * smoothstep(10, 0, dLava);

  // Coast: land falls to the sea floor. Fjord cliffs drop sheer; elsewhere beaches shelve.
  const c = coastDist(x, z);
  if (c < 160) {
    const seaFloor = -5 - Math.min(30, Math.max(0, -c) * 0.06);
    const band = lerp(140, 26, fjordW);
    h = lerp(seaFloor, h, smoothstep(-20, band, c));
  }

  // Lakes and rivers carve their valleys and beds (the vale's own water carves in terrainHeight).
  const water = regionWaterDistance(x, z);
  if (water.d < 60) {
    const valley = smoothstep(58, 6, water.d);
    h = lerp(h, Math.min(h, 2.4 + Math.max(water.d, 0) * 0.07), valley);
    h = lerp(h, water.floor, smoothstep(5, -4, water.d));
  }

  // Settlements last: their ground is level inside, blending out (a harbour slopes to the sea).
  for (const s of settlementsNear(x, z)) {
    const d = Math.hypot(x - s.x, z - s.z);
    const R = settlementBlendR(s);
    if (d >= R) continue;
    h = lerp(h, settlementPlateau(s), smoothstep(R, s.r * 0.92, d));
  }
  return h;
}

/** Ground height everywhere: the vale inside, the region outside, blended between. */
export function terrainHeight(x: number, z: number): number {
  const vw = valeWeight(x, z);
  let h: number;
  if (vw >= 1) h = valeHeight(x, z);
  else if (vw <= 0) h = regionHeight(x, z);
  else h = lerp(regionHeight(x, z), valeHeight(x, z), vw);
  // The vale's rivers and lake carve last, so they continue cleanly through the blend band.
  const wd = waterDistance(x, z);
  if (wd.d < 60) {
    const valley = smoothstep(58, 6, wd.d);
    h = lerp(h, Math.min(h, 2.4 + Math.max(wd.d, 0) * 0.07), valley);
    h = lerp(h, wd.floor, smoothstep(5, -4, wd.d));
  }
  return h;
}

// ---------------------------------------------------------------------------------------------
// Ground colour and masks
// ---------------------------------------------------------------------------------------------

/** sRGB hex to linear RGB, matching THREE.Color with colour management on. */
export function lin(hex: number): [number, number, number] {
  const f = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
  return [f(((hex >> 16) & 255) / 255), f(((hex >> 8) & 255) / 255), f((hex & 255) / 255)];
}

export const GROUND_PAL = {
  grassDeep: lin(0x7ea247), grassMid: lin(0x9bb553), grassLight: lin(0xaec05c), grassYellow: lin(0xb6c262),
  mountainRock: lin(0x7c8494), lakeBed: lin(0x7d8c63), sand: lin(0xecd09e),
  heather: lin(0x8f6b8e), heatherGreen: lin(0x8c8f55), mireOlive: lin(0x7d8a45), mireBrown: lin(0x6b6640), mireDark: lin(0x56703a),
  snow: lin(0xeef3fa), tundraMoss: lin(0x98a687), ash: lin(0x4b4847), ashDark: lin(0x33302f), ashRust: lin(0x6e4b3a),
  redSand: lin(0xc9824f), orangeSand: lin(0xd99a62), paleSand: lin(0xe0bb8c), skerryGreen: lin(0xa6c65e),
};

type RGB = [number, number, number];
function mixInto(o: RGB, a: RGB, b: RGB, t: number): RGB {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
  return o;
}
function lerpTo(o: RGB, b: RGB, t: number): void {
  o[0] += (b[0] - o[0]) * t;
  o[1] += (b[1] - o[1]) * t;
  o[2] += (b[2] - o[2]) * t;
}

/** The meadow's grass colour (exactly the vale's original). */
export function meadowColor(x: number, z: number, out: RGB): RGB {
  const P = GROUND_PAL;
  const n1 = fbm(x / 170, z / 170, 3, S + 700);
  const n2 = valueNoise(x / 23, z / 23, S + 701);
  const t = clamp01((n1 - 0.5) * 2.4 + 0.5) * 0.78 + n2 * 0.22;
  if (t < 0.38) mixInto(out, P.grassDeep, P.grassMid, t / 0.38);
  else if (t < 0.72) mixInto(out, P.grassMid, P.grassLight, (t - 0.38) / 0.34);
  else mixInto(out, P.grassLight, P.grassYellow, Math.min(1, (t - 0.72) / 0.28));
  const forest = smoothstep(0.55, 0.7, fbm(x / 150, z / 150, 3, 4242));
  out[0] *= 1 - forest * 0.16;
  out[1] *= 1 - forest * 0.16;
  out[2] *= (1 - forest * 0.16) * (1 + forest * 0.08);
  return out;
}

/** Per-biome ground look: base colour, grass density, snow cover and rock tint. */
function biomeGround(b: BiomeId, x: number, z: number, out: RGB): { grass: number; snow: number; tint: RGB; sand: number } {
  const P = GROUND_PAL;
  meadowColor(x, z, out);
  switch (b) {
    case 'meadow': return { grass: 1, snow: 0, tint: T_PLAIN, sand: 0 };
    case 'elderwood':
      out[0] *= 0.72; out[1] *= 0.8; out[2] *= 0.86;
      return { grass: 0.9, snow: 0, tint: T_MOSS, sand: 0 };
    case 'fjord':
      out[0] *= 0.86; out[1] *= 0.95; out[2] *= 1.04;
      return { grass: 0.85, snow: 0, tint: T_COOL, sand: 0 };
    case 'skerry':
      lerpTo(out, P.skerryGreen, 0.5);
      return { grass: 0.8, snow: 0, tint: T_PLAIN, sand: 0 };
    case 'mirefen': {
      const n = fbm(x / 60, z / 60, 3, 3201);
      if (n < 0.45) mixInto(out, P.mireDark, P.mireOlive, n / 0.45);
      else mixInto(out, P.mireOlive, P.mireBrown, Math.min(1, (n - 0.45) / 0.3));
      return { grass: 0.95, snow: 0, tint: T_MIRE, sand: 0 };
    }
    case 'heath': {
      const n = fbm(x / 45, z / 45, 3, 3301) * 0.75 + valueNoise(x / 9, z / 9, 3302) * 0.25;
      mixInto(out, P.heatherGreen, P.heather, smoothstep(0.38, 0.62, n));
      return { grass: 0.85, snow: 0, tint: T_PLAIN, sand: 0 };
    }
    case 'peaks':
      out[0] *= 0.92; out[1] *= 0.98; out[2] *= 1.0;
      return { grass: 0.7, snow: 0, tint: T_PLAIN, sand: 0 };
    case 'tundra': {
      const n = fbm(x / 70, z / 70, 3, 3501);
      const bare = smoothstep(0.6, 0.72, n);
      mixInto(out, P.snow, P.tundraMoss, bare);
      return { grass: 0.25 * bare, snow: 1 - bare, tint: T_COOL, sand: 0 };
    }
    case 'ashen': {
      const n = fbm(x / 80, z / 80, 3, 3601);
      mixInto(out, P.ashDark, P.ash, n);
      lerpTo(out, P.ashRust, smoothstep(0.62, 0.8, fbm(x / 200, z / 200, 2, 3602)) * 0.6);
      return { grass: 0.06, snow: 0, tint: T_BASALT, sand: 0 };
    }
    case 'badlands': {
      const n = fbm(x / 120, z / 120, 3, 3701);
      if (n < 0.5) mixInto(out, P.redSand, P.orangeSand, n / 0.5);
      else mixInto(out, P.orangeSand, P.paleSand, Math.min(1, (n - 0.5) / 0.3));
      const tuft = smoothstep(0.55, 0.75, fbm(x / 30, z / 30, 2, 3702));
      return { grass: 0.3 * tuft, snow: 0, tint: T_RED, sand: 0.5 * (1 - tuft) };
    }
  }
}
const T_PLAIN: RGB = [1, 1, 1];
const T_MOSS: RGB = [0.9, 1.0, 0.88];
const T_COOL: RGB = [0.95, 0.98, 1.05];
const T_MIRE: RGB = [0.84, 0.88, 0.78];
const T_BASALT: RGB = [0.48, 0.45, 0.46];
const T_RED: RGB = [1.38, 0.82, 0.6];

/** Everything the terrain needs at one sample, in linear RGB. */
export interface GroundSample {
  r: number; g: number; b: number;
  dirt: number; sand: number; grass: number; snow: number;
  tr: number; tg: number; tb: number; lava: number;
}

const bcol: RGB = [0, 0, 0];
const acc: RGB = [0, 0, 0];
const W2 = new Float32Array(BIOME_IDS.length);

/**
 * Ground at a sample: biome colour blend, path dirt, beach sand, grass density, snow, rock tint
 * and lava. `withSplat` false skips the masks (far terrain).
 */
export function sampleGround(x: number, z: number, h: number, ny: number, out: GroundSample, withSplat = true): GroundSample {
  const P = GROUND_PAL;
  const slope = 1 - ny;
  const vw = valeWeight(x, z);
  let grassK = 1, snow = 0, sandB = 0;
  let tr = 1, tg = 1, tb = 1;
  if (vw >= 1) {
    meadowColor(x, z, acc);
  } else {
    const w = biomeWeights(x, z, W2);
    acc[0] = acc[1] = acc[2] = 0;
    grassK = 0; tr = tg = tb = 0;
    for (let i = 0; i < w.length; i++) {
      if (w[i] < 0.004) continue;
      const gnd = biomeGround(BIOME_IDS[i], x, z, bcol);
      acc[0] += bcol[0] * w[i]; acc[1] += bcol[1] * w[i]; acc[2] += bcol[2] * w[i];
      grassK += gnd.grass * w[i];
      snow += gnd.snow * w[i];
      sandB += gnd.sand * w[i];
      tr += gnd.tint[0] * w[i]; tg += gnd.tint[1] * w[i]; tb += gnd.tint[2] * w[i];
    }
    if (vw > 0) {
      meadowColor(x, z, bcol);
      lerpTo(acc, bcol, vw);
      grassK = lerp(grassK, 1, vw);
      snow *= 1 - vw;
      sandB *= 1 - vw;
      tr = lerp(tr, 1, vw); tg = lerp(tg, 1, vw); tb = lerp(tb, 1, vw);
    }
  }
  const dTown = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (dTown < 90) lerpTo(acc, P.grassMid, smoothstep(90, 50, dTown) * 0.45);
  const rockW = Math.max(smoothstep(0.3, 0.5, slope), smoothstep(65, 115, h) * 0.85);
  if (h > 60) lerpTo(acc, P.mountainRock, smoothstep(60, 140, h) * 0.5 * (1 - snow));
  const n2 = valueNoise(x / 31, z / 31, S + 703);
  const snowW = Math.max(smoothstep(150, 185, h + (n2 - 0.5) * 50) * (1 - smoothstep(0.5, 0.8, slope)), snow * (1 - smoothstep(0.45, 0.7, slope)));
  if (h < 0.4) lerpTo(acc, P.lakeBed, smoothstep(0.4, -1.5, h));

  let dirt = 0, sand = 0, lava = 0;
  if (withSplat) {
    for (const r of ROADS) {
      const d = distToPolyline(x, z, r.pts);
      if (d < r.width + 3) dirt = Math.max(dirt, smoothstep(r.width + 1.6, r.width - 0.8, d));
    }
    const rd = roadDist(x, z);
    if (rd < 3) dirt = Math.max(dirt, smoothstep(1.6, -0.8, rd));
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
    if (dTown > 75) dirt = Math.max(dirt, smoothstep(0.76, 0.88, fbm(x / 34, z / 34, 2, S + 704)) * 0.7 * (1 - rockW) * (1 - snowW));
    dirt *= 1 - rockW * 0.8;
    const beach = smoothstep(0.3, 0.68, fbm(x / 150, z / 150, 2, S + 705));
    const sTop = 0.6 + beach * 1.7, sFull = 0.3 + beach * 0.7;
    sand = smoothstep(sTop, sFull, h) * (h > -0.3 ? 1 : smoothstep(-1.2, -0.3, h));
    if (vw < 1) {
      // Sea beaches are wider than lake shores.
      const c = coastDist(x, z);
      if (c < 90 && c > -40) sand = Math.max(sand, smoothstep(3.2, 1.2, h) * smoothstep(-40, -10, c));
      sand = Math.max(sand, sandB * (1 - rockW));
      const dl = lavaDist(x, z);
      if (dl < 4) lava = smoothstep(4, -0.5, dl);
      // Streets, plazas and the ground under buildings in settlements.
      for (const st of settlementsNear(x, z)) {
        if (Math.hypot(x - st.x, z - st.z) > st.r + 3) continue;
        const sg = settlementGround(st, x, z);
        if (sg.dirt > dirt) dirt = sg.dirt;
        if (sg.built) grassK = 0;
      }
    }
  }
  const grass = (1 - rockW) * (1 - snowW) * smoothstep(0.45, 0.95, h) * grassK;
  out.r = acc[0]; out.g = acc[1]; out.b = acc[2];
  out.dirt = dirt; out.sand = sand; out.grass = grass; out.snow = vw >= 1 ? 0 : snowW * (1 - smoothstep(0.5, 0.8, slope));
  out.tr = tr; out.tg = tg; out.tb = tb; out.lava = lava;
  return out;
}

/** Whether a point lies on a frozen lake (walkable ice at the water line). */
export function onIce(x: number, z: number): boolean {
  const l = lakeDistRegion(x, z);
  return !!l.lake?.frozen && l.d < 1;
}

export { LAVA };
