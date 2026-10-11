/**
 * Vegetation and rocks for one level-0 chunk outside the vale (pure, runs in the terrain
 * workers). Seeded by the chunk's index, so both players' games place every tree, bush and rock
 * identically. The vale keeps its own scatter (vegetation.ts) inside ±592 m.
 */
import { fbm, mulberry32, smoothstep } from '../noise';
import { anyWaterDistance } from '../heightfield';
import { BIOME_IDS, biomeWeights, roadDist, settlementAt, type BiomeId } from '../../../shared/region';
import { PATCH_N, PATCH_V, cellSize, nodeOrigin } from './lattice';

/** Tree kinds the outer world can place; the main thread maps each to a model. */
export const OUTER_TREE_KINDS = ['round', 'tall', 'wide', 'pine', 'snowpine', 'giant', 'dead', 'birch', 'willow', 'cactus'] as const;
export type OuterTreeKind = (typeof OUTER_TREE_KINDS)[number];
const TK = Object.fromEntries(OUTER_TREE_KINDS.map((k, i) => [k, i])) as Record<OuterTreeKind, number>;

/** Trunk collider radius per kind (scaled by the tree's size). */
export const OUTER_TREE_RADIUS: Record<OuterTreeKind, number> = {
  round: 0.45, tall: 0.4, wide: 0.55, pine: 0.4, snowpine: 0.4, giant: 0.9, dead: 0.3, birch: 0.3, willow: 0.5, cactus: 0.35,
};

/** Floats per placed item in the packed arrays. */
export const TREE_STRIDE = 10; // x y z rot sx sy r g b kind
export const BUSH_STRIDE = 9; // x y z rot sx sy r g b
export const ROCK_STRIDE = 13; // x y z rot sx sy r g b k top colliderR dome (top<0: no collider)

export interface ChunkScatter {
  ci: number;
  cj: number;
  trees: Float32Array;
  bushes: Float32Array;
  rocks: Float32Array;
}

interface Grid { heights: Float32Array; normalY: Float32Array }

/** Per-biome forest density, tree mix and rock look. */
interface BiomeFlora {
  forest: number; // 0..1 base woodland cover multiplier
  open: number; // scattered lone trees in the open
  trees: [OuterTreeKind, number][]; // weighted picks
  scale: [number, number];
  tint: [number, number, number];
  bushes: number;
  rocks: number;
  rockTint: [number, number, number];
  stones?: boolean; // standing stones
}

const FLORA: Record<BiomeId, BiomeFlora> = {
  meadow: { forest: 0.85, open: 0.035, trees: [['round', 5], ['wide', 3], ['tall', 2]], scale: [0.8, 1.35], tint: [1, 1, 1], bushes: 1, rocks: 1, rockTint: [1, 1, 1] },
  elderwood: { forest: 1.0, open: 0.25, trees: [['giant', 3], ['tall', 3], ['wide', 2], ['pine', 1]], scale: [1.1, 2.0], tint: [0.82, 0.92, 0.86], bushes: 1.6, rocks: 0.7, rockTint: [0.9, 1, 0.88] },
  fjord: { forest: 0.8, open: 0.06, trees: [['pine', 6], ['birch', 2], ['tall', 1]], scale: [0.9, 1.5], tint: [0.92, 0.98, 1.02], bushes: 0.6, rocks: 1.6, rockTint: [0.95, 0.98, 1.04] },
  skerry: { forest: 0.3, open: 0.04, trees: [['round', 3], ['wide', 2]], scale: [0.7, 1.1], tint: [1.04, 1.06, 0.95], bushes: 1.2, rocks: 1.3, rockTint: [1.04, 1.02, 0.98] },
  mirefen: { forest: 0.55, open: 0.06, trees: [['willow', 4], ['dead', 2], ['wide', 2]], scale: [0.85, 1.4], tint: [0.82, 0.86, 0.72], bushes: 1.5, rocks: 0.3, rockTint: [0.84, 0.88, 0.78] },
  heath: { forest: 0.25, open: 0.02, trees: [['wide', 3], ['pine', 2], ['dead', 1]], scale: [0.8, 1.2], tint: [0.95, 0.92, 0.85], bushes: 0.8, rocks: 1.8, rockTint: [1.02, 0.98, 0.97], stones: true },
  peaks: { forest: 0.6, open: 0.03, trees: [['pine', 5], ['snowpine', 3]], scale: [0.85, 1.4], tint: [0.95, 1, 1.02], bushes: 0.3, rocks: 2.2, rockTint: [1, 1, 1] },
  tundra: { forest: 0.25, open: 0.012, trees: [['snowpine', 6], ['dead', 1]], scale: [0.8, 1.3], tint: [1, 1, 1], bushes: 0.15, rocks: 1.0, rockTint: [1.05, 1.08, 1.12] },
  ashen: { forest: 0.0, open: 0.012, trees: [['dead', 1]], scale: [0.8, 1.3], tint: [0.4, 0.38, 0.36], bushes: 0.05, rocks: 2.4, rockTint: [0.46, 0.43, 0.43] },
  badlands: { forest: 0.0, open: 0.018, trees: [['cactus', 4], ['dead', 1]], scale: [0.8, 1.6], tint: [1, 1, 1], bushes: 0.25, rocks: 1.6, rockTint: [1.3, 0.82, 0.62] },
};

const W = new Float32Array(BIOME_IDS.length);

function dominant(x: number, z: number): BiomeId {
  const w = biomeWeights(x, z, W);
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
  return BIOME_IDS[best];
}

function pick(rnd: () => number, list: [OuterTreeKind, number][]): OuterTreeKind {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = rnd() * total;
  for (const [k, w] of list) if ((r -= w) <= 0) return k;
  return list[0][0];
}

export function scatterChunk(ci: number, cj: number, grid: Grid): ChunkScatter {
  const step = cellSize(0);
  const [x0, z0] = nodeOrigin(0, ci, cj);
  const size = PATCH_N * step;
  const rnd = mulberry32((ci * 73856093) ^ (cj * 19349663) ^ 0x5eed);
  const hAt = (x: number, z: number): number => {
    const gx = Math.max(0, Math.min(PATCH_N - 1e-4, (x - x0) / step)), gz = Math.max(0, Math.min(PATCH_N - 1e-4, (z - z0) / step));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, k = j * PATCH_V + i;
    const h = grid.heights;
    const a = h[k], b = h[k + 1], c = h[k + PATCH_V], d = h[k + PATCH_V + 1];
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
  const slopeAt = (x: number, z: number): number => {
    const i = Math.max(0, Math.min(PATCH_N, Math.round((x - x0) / step))), j = Math.max(0, Math.min(PATCH_N, Math.round((z - z0) / step)));
    return 1 - grid.normalY[j * PATCH_V + i];
  };
  /** Nothing grows in the vale's own scatter area, in settlements, on roads or in water. */
  const blocked = (x: number, z: number, margin: number): boolean => {
    if (Math.abs(x) < 592 && Math.abs(z) < 592) return true;
    if (settlementAt(x, z, 12 + margin)) return true;
    if (roadDist(x, z) < 2 + margin) return true;
    return anyWaterDistance(x, z).d < 4 + margin;
  };
  const trees: number[] = [];
  const bushes: number[] = [];
  const rocks: number[] = [];

  // Trees: a jittered 10 m grid thinned by a forest noise and the biome's cover.
  const cell = 10;
  for (let z = z0; z < z0 + size; z += cell) {
    for (let x = x0; x < x0 + size; x += cell) {
      const px = x + rnd() * cell, pz = z + rnd() * cell;
      const roll = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd();
      const b = dominant(px, pz);
      const f = FLORA[b];
      const forest = smoothstep(0.5, 0.68, fbm(px / 150, pz / 150, 3, 4242));
      const p = forest * 0.85 * f.forest + f.open;
      if (roll > p) continue;
      const y = hAt(px, pz);
      if (y < 0.6 || slopeAt(px, pz) > 0.38) continue;
      if (b === 'peaks' && y > 330) continue;
      if (blocked(px, pz, 4)) continue;
      let kind = pick(() => r2, f.trees);
      if (b === 'peaks' && y > 220 && kind === 'pine') kind = 'snowpine';
      if (b !== 'peaks' && b !== 'tundra' && y > 160 && kind !== 'dead') kind = 'pine';
      const sc = f.scale[0] + r3 * (f.scale[1] - f.scale[0]);
      const v = 0.86 + r4 * 0.26;
      trees.push(px, y - 0.15, pz, r5 * Math.PI * 2, sc, sc * (0.9 + r4 * 0.2), v * f.tint[0], v * f.tint[1], v * f.tint[2], TK[kind]);
    }
  }
  // Forest interiors: extra trees so woods read as woods.
  for (let z = z0; z < z0 + size; z += 6) {
    for (let x = x0; x < x0 + size; x += 6) {
      const px = x + rnd() * 6, pz = z + rnd() * 6;
      const roll = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
      const b = dominant(px, pz);
      const f = FLORA[b];
      if (f.forest <= 0.2) continue;
      const forest = smoothstep(0.6, 0.75, fbm(px / 150, pz / 150, 3, 4242));
      if (roll > forest * 0.7 * f.forest) continue;
      const y = hAt(px, pz);
      if (y < 0.6 || y > 300 || slopeAt(px, pz) > 0.36 || blocked(px, pz, 4)) continue;
      const kind = pick(() => r2, f.trees);
      const sc = f.scale[0] + r3 * (f.scale[1] - f.scale[0]);
      const v = 0.8 + r4 * 0.24;
      trees.push(px, y - 0.15, pz, r4 * 6.283, sc, sc * (0.95 + r3 * 0.25), v * f.tint[0], v * f.tint[1], v * f.tint[2], TK[kind]);
    }
  }

  // Bushes: forest edges and meadow clumps.
  const bcell = 7;
  for (let z = z0; z < z0 + size; z += bcell) {
    for (let x = x0; x < x0 + size; x += bcell) {
      const px = x + rnd() * bcell, pz = z + rnd() * bcell;
      const roll = rnd(), r2 = rnd(), r3 = rnd();
      const b = dominant(px, pz);
      const f = FLORA[b];
      const fo = fbm(px / 150, pz / 150, 3, 4242);
      const p = (smoothstep(0.46, 0.6, fo) * 0.3 + smoothstep(0.72, 0.86, fbm(px / 40, pz / 40, 2, 99)) * 0.08) * f.bushes;
      if (roll > p) continue;
      const y = hAt(px, pz);
      if (y < 0.5 || y > 200 || slopeAt(px, pz) > 0.35 || blocked(px, pz, 2.5)) continue;
      const sc = 0.85 + r2 * 0.85;
      const v = 0.85 + r3 * 0.25;
      bushes.push(px, y - 0.1, pz, r3 * 6.28, sc, sc * (0.8 + r2 * 0.3), v * f.tint[0], v * f.tint[1], v * f.tint[2]);
    }
  }

  // Rocks: on slopes and scattered; standing stones on the heath.
  const rcell = 12;
  for (let z = z0; z < z0 + size; z += rcell) {
    for (let x = x0; x < x0 + size; x += rcell) {
      const px = x + rnd() * rcell, pz = z + rnd() * rcell;
      const roll = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd();
      const b = dominant(px, pz);
      const f = FLORA[b];
      const slope = slopeAt(px, pz);
      const y = hAt(px, pz);
      const p = (0.05 + smoothstep(0.12, 0.3, slope) * 0.3) * f.rocks;
      if (roll > p || slope > 0.5 || y < 0.3) continue;
      if (blocked(px, pz, 3)) continue;
      const standing = !!f.stones && r6 < 0.12;
      const big = standing || r2 < 0.25;
      const blocky = standing || r3 < (big ? 0.3 : 0.12);
      const sc = standing ? 0.9 + r4 * 0.5 : big ? 1.4 + r4 * 1.6 : 0.4 + r4 * 0.8;
      const sy = standing ? sc * (2.2 + r5 * 1.4) : sc * (blocky ? 0.8 + r5 * 0.9 : 0.7 + r5 * 0.6);
      const v = 0.9 + r5 * 0.2;
      const k = blocky ? 3 + Math.floor(r6 * 2) : Math.floor(r6 * 3);
      const ry = y - sc * (blocky ? 0.35 : 0.15);
      let top = -1, cr = 0, dome = 0;
      if (sc > 0.9) {
        top = ry + sy * (blocky ? 0.98 : 0.82);
        cr = sc * (blocky ? 0.95 : 0.85);
        dome = sy * (blocky ? 0.12 : 0.3);
      }
      rocks.push(px, ry, pz, r4 * 6.28, sc, sy, v * f.rockTint[0], v * 0.99 * f.rockTint[1], v * 0.96 * f.rockTint[2], k, top, cr, dome);
    }
  }
  return { ci, cj, trees: new Float32Array(trees), bushes: new Float32Array(bushes), rocks: new Float32Array(rocks) };
}

export function scatterTransferables(s: ChunkScatter): ArrayBuffer[] {
  return [s.trees.buffer as ArrayBuffer, s.bushes.buffer as ArrayBuffer, s.rocks.buffer as ArrayBuffer];
}

/** Grass tufts and flowers depend on biome too; exposed for tests. */
export function floraOf(b: BiomeId): BiomeFlora {
  return FLORA[b];
}

