import * as THREE from 'three';
import { CELL, GRID_HALF, GRID_N } from '../layout';
import type { TerrainData } from '../terrain';
import { CHUNK_M, ORIGIN_X, ORIGIN_Z, PATCH_V, chunkKey, inCore } from './lattice';
import type { ChunkEntry, TerrainStreamer } from './streamer';

/**
 * A square of ground data that follows the player, one texel per 2.5 m lattice vertex: heights
 * (R32F), colour + grass weight and the dirt / sand / snow / lava masks (RGBA8). The grass and
 * water shaders sample it instead of a texture of the whole map, so the world can be any size.
 * Texel (0, 0) is at `origin`; the window re-centres when the player wanders 50 m off-centre.
 */
export class GroundWindow {
  static readonly SIZE = 192; // 480 m
  readonly height: THREE.DataTexture;
  readonly ground: THREE.DataTexture;
  readonly mask: THREE.DataTexture;
  /** World x, z of texel (0, 0), and the texel count per side, for the shaders. */
  readonly origin = new THREE.Vector2(1e9, 1e9);
  readonly uniforms: { uWinOrigin: { value: THREE.Vector2 }; uWinSize: { value: number } };
  /** Bumps whenever the contents change (grass patch caches key on it). */
  version = 0;
  private readonly h: Float32Array;
  private readonly g: Uint8Array;
  private readonly m: Uint8Array;

  constructor(private readonly streamer: TerrainStreamer, private readonly core: TerrainData) {
    const N = GroundWindow.SIZE;
    this.h = new Float32Array(N * N);
    this.g = new Uint8Array(N * N * 4);
    this.m = new Uint8Array(N * N * 4);
    this.height = new THREE.DataTexture(this.h, N, N, THREE.RedFormat, THREE.FloatType);
    this.height.magFilter = this.height.minFilter = THREE.NearestFilter;
    this.height.unpackAlignment = 1;
    const mk = (arr: Uint8Array) => {
      const t = new THREE.DataTexture(arr, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    };
    this.ground = mk(this.g);
    this.mask = mk(this.m);
    this.uniforms = { uWinOrigin: { value: this.origin }, uWinSize: { value: N } };
    streamer.chunkListeners.push({ add: (e) => this.onChunk(e), drop: () => {} });
  }

  /** Re-centre on the player when needed. */
  update(x: number, z: number): void {
    const N = GroundWindow.SIZE;
    const half = (N / 2) * CELL;
    if (Math.abs(x - (this.origin.x + half)) < 50 && Math.abs(z - (this.origin.y + half)) < 50) return;
    // Snap to the lattice so texels sit exactly on terrain vertices.
    const ox = ORIGIN_X + Math.round((x - half - ORIGIN_X) / CELL) * CELL;
    const oz = ORIGIN_Z + Math.round((z - half - ORIGIN_Z) / CELL) * CELL;
    this.origin.set(ox, oz);
    this.fill(0, 0, N, N);
  }

  /** Grass patches that were judged before their chunk arrived must be judged again. */
  private onChunk(e: ChunkEntry): void {
    const N = GroundWindow.SIZE;
    const i0 = Math.round((e.x0 - this.origin.x) / CELL), j0 = Math.round((e.z0 - this.origin.y) / CELL);
    if (i0 >= N || j0 >= N || i0 + PATCH_V <= 0 || j0 + PATCH_V <= 0) return;
    this.fill(Math.max(0, i0), Math.max(0, j0), Math.min(N, i0 + PATCH_V), Math.min(N, j0 + PATCH_V));
  }

  /** Refill a texel rectangle (after grass is trampled in the vale, say). */
  refreshAround(x: number, z: number, r: number): void {
    const N = GroundWindow.SIZE;
    const i0 = Math.floor((x - r - this.origin.x) / CELL), j0 = Math.floor((z - r - this.origin.y) / CELL);
    const i1 = Math.ceil((x + r - this.origin.x) / CELL) + 1, j1 = Math.ceil((z + r - this.origin.y) / CELL) + 1;
    if (i0 >= N || j0 >= N || i1 <= 0 || j1 <= 0) return;
    this.fill(Math.max(0, i0), Math.max(0, j0), Math.min(N, i1), Math.min(N, j1));
  }

  private fill(i0: number, j0: number, i1: number, j1: number): void {
    const N = GroundWindow.SIZE;
    const V = GRID_N + 1;
    const d = this.core;
    let entry: ChunkEntry | undefined;
    let entryKey = -1;
    for (let j = j0; j < j1; j++) {
      const z = this.origin.y + j * CELL;
      for (let i = i0; i < i1; i++) {
        const x = this.origin.x + i * CELL;
        const o = j * N + i;
        if (inCore(x, z)) {
          const gi = Math.round((x + GRID_HALF) / CELL), gj = Math.round((z + GRID_HALF) / CELL);
          const k = gj * V + gi;
          this.h[o] = d.heights[k];
          this.g[o * 4] = Math.round(Math.sqrt(Math.min(1, d.colors[k * 3])) * 255);
          this.g[o * 4 + 1] = Math.round(Math.sqrt(Math.min(1, d.colors[k * 3 + 1])) * 255);
          this.g[o * 4 + 2] = Math.round(Math.sqrt(Math.min(1, d.colors[k * 3 + 2])) * 255);
          this.g[o * 4 + 3] = Math.round(Math.max(0, Math.min(1, d.grass[k])) * 255);
          this.m[o * 4] = Math.round(Math.max(0, Math.min(1, d.splat[k * 2])) * 255);
          this.m[o * 4 + 1] = Math.round(Math.max(0, Math.min(1, d.splat[k * 2 + 1])) * 255);
          this.m[o * 4 + 2] = 0;
          this.m[o * 4 + 3] = 0;
          continue;
        }
        const ci = Math.floor((x - ORIGIN_X) / CHUNK_M), cj = Math.floor((z - ORIGIN_Z) / CHUNK_M);
        const key = chunkKey(ci, cj);
        if (key !== entryKey) {
          entryKey = key;
          entry = this.streamer.chunks.get(key);
        }
        if (!entry) {
          this.h[o] = this.streamer.heightAt(x, z);
          this.g[o * 4 + 3] = 0;
          this.m[o * 4] = this.m[o * 4 + 1] = this.m[o * 4 + 2] = this.m[o * 4 + 3] = 0;
          continue;
        }
        const li = Math.round((x - entry.x0) / CELL), lj = Math.round((z - entry.z0) / CELL);
        const k = lj * PATCH_V + li;
        this.h[o] = entry.l0.heights[k];
        for (let c = 0; c < 4; c++) {
          this.g[o * 4 + c] = entry.l0.ground[k * 4 + c];
          this.m[o * 4 + c] = entry.l0.mask[k * 4 + c];
        }
      }
    }
    this.height.needsUpdate = this.ground.needsUpdate = this.mask.needsUpdate = true;
    this.version++;
  }
}
