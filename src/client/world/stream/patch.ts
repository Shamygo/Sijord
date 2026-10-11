/**
 * Builds the vertex data for one terrain patch (pure: runs in the terrain workers, and on the
 * main thread as a fallback). A patch is 65 x 65 vertices plus a skirt of 4 x 65 vertices that
 * hangs down from its edge to hide cracks against neighbours drawn at another level of detail.
 */
import { terrainHeight, sampleGround, type GroundSample } from '../heightfield';
import { PATCH_N, PATCH_V, cellSize, nodeOrigin } from './lattice';

export interface PatchData {
  level: number;
  ix: number;
  iz: number;
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** dirt, sand, grass, snow */
  splat: Float32Array;
  /** rock tint rgb, lava */
  tint: Float32Array;
  minY: number;
  maxY: number;
  /** Level 0 only: what the physics, grass and water need, one value per grid vertex. */
  l0?: L0Data;
}

export interface L0Data {
  heights: Float32Array;
  normalY: Float32Array;
  /** sqrt-encoded colour rgb + grass weight (RGBA8). */
  ground: Uint8Array;
  /** dirt, sand, snow, lava (RGBA8). */
  mask: Uint8Array;
}

export const SKIRT_VERTS = 4 * PATCH_V;
export const PATCH_VERTS = PATCH_V * PATCH_V + SKIRT_VERTS;

/** How far each level's skirt hangs below the edge. */
export function skirtDrop(level: number): number {
  return 3 + 4 * (1 << level);
}

const g: GroundSample = { r: 0, g: 0, b: 0, dirt: 0, sand: 0, grass: 0, snow: 0, tr: 1, tg: 1, tb: 1, lava: 0 };

export function buildPatch(level: number, ix: number, iz: number): PatchData {
  const step = cellSize(level);
  const [x0, z0] = nodeOrigin(level, ix, iz);
  const B = PATCH_V + 2; // with a one-vertex border for normals
  const hb = new Float32Array(B * B);
  for (let j = 0; j < B; j++) {
    const z = z0 + (j - 1) * step;
    for (let i = 0; i < B; i++) hb[j * B + i] = terrainHeight(x0 + (i - 1) * step, z);
  }
  const n = PATCH_VERTS;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const splat = new Float32Array(n * 4);
  const tint = new Float32Array(n * 4);
  const l0: L0Data | undefined = level === 0 ? {
    heights: new Float32Array(PATCH_V * PATCH_V),
    normalY: new Float32Array(PATCH_V * PATCH_V),
    ground: new Uint8Array(PATCH_V * PATCH_V * 4),
    mask: new Uint8Array(PATCH_V * PATCH_V * 4),
  } : undefined;
  let minY = Infinity, maxY = -Infinity;
  const withSplat = level <= 1;
  for (let j = 0; j < PATCH_V; j++) {
    for (let i = 0; i < PATCH_V; i++) {
      const k = j * PATCH_V + i;
      const b = (j + 1) * B + (i + 1);
      const h = hb[b];
      const nx = hb[b - 1] - hb[b + 1], nz = hb[b - B] - hb[b + B], ny = 2 * step;
      const len = Math.hypot(nx, ny, nz);
      const x = x0 + i * step, z = z0 + j * step;
      position[k * 3] = x;
      position[k * 3 + 1] = h;
      position[k * 3 + 2] = z;
      normal[k * 3] = nx / len;
      normal[k * 3 + 1] = ny / len;
      normal[k * 3 + 2] = nz / len;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
      sampleGround(x, z, h, ny / len, g, withSplat);
      color[k * 3] = g.r;
      color[k * 3 + 1] = g.g;
      color[k * 3 + 2] = g.b;
      splat[k * 4] = g.dirt;
      splat[k * 4 + 1] = g.sand;
      splat[k * 4 + 2] = g.grass;
      splat[k * 4 + 3] = g.snow;
      tint[k * 4] = g.tr;
      tint[k * 4 + 1] = g.tg;
      tint[k * 4 + 2] = g.tb;
      tint[k * 4 + 3] = g.lava;
      if (l0) {
        l0.heights[k] = h;
        l0.normalY[k] = ny / len;
        const o = k * 4;
        l0.ground[o] = Math.round(Math.sqrt(Math.min(1, g.r)) * 255);
        l0.ground[o + 1] = Math.round(Math.sqrt(Math.min(1, g.g)) * 255);
        l0.ground[o + 2] = Math.round(Math.sqrt(Math.min(1, g.b)) * 255);
        l0.ground[o + 3] = Math.round(Math.max(0, Math.min(1, g.grass)) * 255);
        l0.mask[o] = Math.round(Math.max(0, Math.min(1, g.dirt)) * 255);
        l0.mask[o + 1] = Math.round(Math.max(0, Math.min(1, g.sand)) * 255);
        l0.mask[o + 2] = Math.round(Math.max(0, Math.min(1, g.snow)) * 255);
        l0.mask[o + 3] = Math.round(Math.max(0, Math.min(1, g.lava)) * 255);
      }
    }
  }
  writeSkirts(position, normal, color, splat, tint, skirtDrop(level));
  return { level, ix, iz, position, normal, color, splat, tint, minY, maxY, l0 };
}

/** Copy each edge vertex down by `drop` into the skirt ring (same attributes otherwise). */
export function writeSkirts(position: Float32Array, normal: Float32Array, color: Float32Array, splat: Float32Array, tint: Float32Array, drop: number): void {
  const V = PATCH_V;
  const base = V * V;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < V; k++) {
      const li = side === 0 ? k : side === 1 ? PATCH_N : side === 2 ? k : 0;
      const lj = side === 0 ? 0 : side === 1 ? k : side === 2 ? PATCH_N : k;
      const src = lj * V + li;
      const dst = base + side * V + k;
      for (let c = 0; c < 3; c++) {
        position[dst * 3 + c] = position[src * 3 + c];
        normal[dst * 3 + c] = normal[src * 3 + c];
        color[dst * 3 + c] = color[src * 3 + c];
      }
      position[dst * 3 + 1] -= drop;
      for (let c = 0; c < 4; c++) {
        splat[dst * 4 + c] = splat[src * 4 + c];
        tint[dst * 4 + c] = tint[src * 4 + c];
      }
    }
  }
}

/** The arrays a PatchData carries, for transferring out of a worker without copying. */
export function patchTransferables(p: PatchData): ArrayBuffer[] {
  const out = [p.position.buffer, p.normal.buffer, p.color.buffer, p.splat.buffer, p.tint.buffer] as ArrayBuffer[];
  if (p.l0) out.push(p.l0.heights.buffer as ArrayBuffer, p.l0.normalY.buffer as ArrayBuffer, p.l0.ground.buffer as ArrayBuffer, p.l0.mask.buffer as ArrayBuffer);
  return out;
}
