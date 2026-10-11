/**
 * The terrain lattice: every terrain vertex in Sijord sits on one 2.5 m grid, the same grid the
 * vale's core height data uses, so streamed patches meet the vale's exactly.
 *
 * Patches are 64 x 64 cells. A level-0 patch has 2.5 m cells (160 m square); each level up
 * doubles the cell, up to the 1280 m root tiles at level 3.
 */
import { CELL, GRID_HALF } from '../layout';
import { REGION } from '../../../shared/region';

export const PATCH_N = 64;
export const PATCH_V = PATCH_N + 1;
export const CHUNK_M = PATCH_N * CELL; // 160 m
export const ROOT_LEVEL = 3;
export const ORIGIN_X = REGION.minX;
export const ORIGIN_Z = REGION.minZ;
/** Root tiles across and down the region. */
export const ROOTS_X = Math.round((REGION.maxX - REGION.minX) / (CHUNK_M << ROOT_LEVEL));
export const ROOTS_Z = Math.round((REGION.maxZ - REGION.minZ) / (CHUNK_M << ROOT_LEVEL));

/** Level-0 chunk index range covered by the vale's precomputed core grid. */
export const CORE_CI0 = Math.round((-GRID_HALF - ORIGIN_X) / CHUNK_M);
export const CORE_CJ0 = Math.round((-GRID_HALF - ORIGIN_Z) / CHUNK_M);
export const CORE_CHUNKS = Math.round((GRID_HALF * 2) / CHUNK_M);

export function cellSize(level: number): number {
  return CELL * (1 << level);
}

export function nodeSize(level: number): number {
  return CHUNK_M * (1 << level);
}

/** World-space minimum corner of node (ix, iz) at a level. */
export function nodeOrigin(level: number, ix: number, iz: number): [number, number] {
  const s = nodeSize(level);
  return [ORIGIN_X + ix * s, ORIGIN_Z + iz * s];
}

export function isCoreChunk(ci: number, cj: number): boolean {
  return ci >= CORE_CI0 && ci < CORE_CI0 + CORE_CHUNKS && cj >= CORE_CJ0 && cj < CORE_CJ0 + CORE_CHUNKS;
}

export function chunkKey(ci: number, cj: number): number {
  return ci * 4096 + cj;
}

/** Level-0 chunk containing a point. */
export function chunkOf(x: number, z: number): [number, number] {
  return [Math.floor((x - ORIGIN_X) / CHUNK_M), Math.floor((z - ORIGIN_Z) / CHUNK_M)];
}

export function inCore(x: number, z: number): boolean {
  return x >= -GRID_HALF && x < GRID_HALF && z >= -GRID_HALF && z < GRID_HALF;
}
