import * as THREE from 'three';
import TerrainWorker from './terrain.worker?worker&inline';
import { terrainHeight, sampleGround, type GroundSample } from '../heightfield';
import { CELL } from '../layout';
import { corePatch, terrainPatchIndex, type TerrainData, type TerrainQuery } from '../terrain';
import {
  CHUNK_M, CORE_CI0, CORE_CJ0, ORIGIN_X, ORIGIN_Z, PATCH_N, PATCH_V, ROOTS_X, ROOTS_Z, ROOT_LEVEL,
  chunkKey, inCore, isCoreChunk, nodeOrigin, nodeSize,
} from './lattice';
import { buildPatch, type L0Data, type PatchData } from './patch';
import { scatterChunk, type ChunkScatter } from './scatter';

/**
 * Streams Sijord's terrain around the camera: a quadtree of 64 x 64-cell patches per 1280 m root
 * tile, finer near the camera (2.5 m cells within about 300 m, 20 m cells far away), built in
 * Web Workers. Level-0 chunks near the player also keep their heights, masks and vegetation
 * scatter (`chunks`), which the physics, grass, water and vegetation read. Inside the vale the
 * level-0 chunks come straight from the vale's precomputed grid, so it looks exactly as before.
 */

export interface ChunkEntry {
  ci: number;
  cj: number;
  key: number;
  x0: number;
  z0: number;
  core: boolean;
  l0: L0Data;
  scatter: ChunkScatter | null;
  /** Vertex data, kept while the chunk is near enough to be drawn at full detail. */
  patch: PatchData | null;
}

interface QNode {
  level: number;
  ix: number;
  iz: number;
  x0: number;
  z0: number;
  size: number;
  minY: number;
  maxY: number;
  /** 0 nothing, 1 requested, 2 mesh ready. */
  state: 0 | 1 | 2;
  mesh: THREE.Mesh | null;
  children: QNode[] | null;
  lastUsed: number;
}

interface Job {
  id: number;
  level: number;
  ix: number;
  iz: number;
  prio: number;
  worker: number;
}

type Result = { id: number; patch: PatchData; scatter?: ChunkScatter };

const DATA_RADIUS = 620;
const DROP_RADIUS = 860;
const KEEP_PATCH_RADIUS = 480;

export class TerrainStreamer {
  readonly group = new THREE.Group();
  readonly chunks = new Map<number, ChunkEntry>();
  /** Called when a level-0 chunk's data arrives, and when it is dropped. */
  readonly chunkListeners: { add: (e: ChunkEntry) => void; drop: (e: ChunkEntry) => void }[] = [];
  /** Coarse heights over the whole region from the root tiles (20 m), for far water and the map. */
  readonly coarse: { heights: Float32Array; colors: Uint8Array; n: number; cell: number; version: number };

  private readonly workers: Worker[] = [];
  private readonly inflight: number[] = [];
  private readonly queue: Job[] = [];
  private readonly pending = new Map<string, Job>();
  private readonly byId = new Map<number, Job>();
  private nextId = 1;
  private readonly roots: QNode[] = [];
  private frame = 0;
  private lodScale = 1;
  private readonly cam = new THREE.Vector3();
  private readonly focus = new THREE.Vector3(1e9, 0, 1e9);
  private lastData = new THREE.Vector3(1e9, 0, 1e9);
  private readonly analytic = new Map<number, number>();
  private readonly g: GroundSample = { r: 0, g: 0, b: 0, dirt: 0, sand: 0, grass: 0, snow: 0, tr: 1, tg: 1, tb: 1, lava: 0 };
  private disposed = false;

  constructor(private readonly core: TerrainData, private readonly coreQuery: TerrainQuery, private readonly material: THREE.Material) {
    this.group.name = 'terrain';
    for (let iz = 0; iz < ROOTS_Z; iz++) {
      for (let ix = 0; ix < ROOTS_X; ix++) this.roots.push(this.node(ROOT_LEVEL, ix, iz));
    }
    const n = ROOTS_X * PATCH_N + 1;
    this.coarse = { heights: new Float32Array(n * n).fill(-10), colors: new Uint8Array(n * n * 4), n, cell: nodeSize(ROOT_LEVEL) / PATCH_N, version: 0 };
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
    const count = Math.max(2, Math.min(4, cores - 1));
    try {
      for (let i = 0; i < count; i++) {
        const w = new TerrainWorker();
        w.onmessage = (e: MessageEvent<Result>) => this.onResult(e.data);
        this.workers.push(w);
        this.inflight.push(0);
      }
    } catch {
      // No workers (very old browser): patches are built on the main thread instead.
    }
  }

  private node(level: number, ix: number, iz: number): QNode {
    const [x0, z0] = nodeOrigin(level, ix, iz);
    return { level, ix, iz, x0, z0, size: nodeSize(level), minY: 0, maxY: 0, state: 0, mesh: null, children: null, lastUsed: -1 };
  }

  setLodScale(s: number): void {
    this.lodScale = s;
  }

  /**
   * Resolves once the root tiles and the level-0 chunks round `at` are loaded, so the first
   * frame has ground under the player. Keeps pumping on its own while it waits.
   */
  async warmUp(at: THREE.Vector3, camera: THREE.Vector3): Promise<void> {
    const t0 = performance.now();
    for (;;) {
      this.update(camera, at);
      const rootsReady = this.roots.every((r) => r.state === 2);
      let near = true;
      const [ci, cj] = [Math.floor((at.x - ORIGIN_X) / CHUNK_M), Math.floor((at.z - ORIGIN_Z) / CHUNK_M)];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!this.chunks.has(chunkKey(ci + di, cj + dj))) near = false;
      if ((rootsReady && near) || performance.now() - t0 > 30000) return;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  /** Per-frame: pick levels of detail round the camera, stream chunks round the player. */
  update(camera: THREE.Vector3, focus: THREE.Vector3): void {
    if (this.disposed) return;
    this.frame++;
    this.cam.copy(camera);
    this.focus.copy(focus);
    for (const r of this.roots) this.select(r);
    // Hide what wasn't selected this frame; free meshes nobody has drawn for a while.
    this.forEachNode((n) => {
      if (!n.mesh) return;
      const used = n.lastUsed === this.frame;
      n.mesh.visible = used;
      if (!used && n.level < ROOT_LEVEL && this.frame - n.lastUsed > 900) this.freeNode(n);
    });
    if (Math.abs(focus.x - this.lastData.x) + Math.abs(focus.z - this.lastData.z) > 12) {
      this.lastData.copy(focus);
      this.streamChunks();
    }
    this.pump();
  }

  private forEachNode(fn: (n: QNode) => void): void {
    const stack = [...this.roots];
    while (stack.length) {
      const n = stack.pop()!;
      fn(n);
      if (n.children) stack.push(...n.children);
    }
  }

  private distTo(n: QNode): number {
    const c = this.cam;
    const dx = Math.max(n.x0 - c.x, 0, c.x - (n.x0 + n.size));
    const dz = Math.max(n.z0 - c.z, 0, c.z - (n.z0 + n.size));
    const dy = n.state === 2 ? Math.max(0, c.y - n.maxY, n.minY - c.y) : 0;
    return Math.hypot(dx, dz, dy);
  }

  private wantSplit(n: QNode): boolean {
    return n.level > 0 && this.distTo(n) < n.size * 1.0 * this.lodScale;
  }

  private select(n: QNode): void {
    if (this.wantSplit(n)) {
      if (!n.children) {
        const l = n.level - 1;
        n.children = [this.node(l, n.ix * 2, n.iz * 2), this.node(l, n.ix * 2 + 1, n.iz * 2), this.node(l, n.ix * 2, n.iz * 2 + 1), this.node(l, n.ix * 2 + 1, n.iz * 2 + 1)];
      }
      let ready = true;
      for (const c of n.children) if (!this.ensure(c)) ready = false;
      if (ready) {
        for (const c of n.children) this.select(c);
        return;
      }
    }
    if (this.ensure(n)) {
      n.lastUsed = this.frame;
      return;
    }
    // Not ready yet: fall back to children that happen to be loaded, if they all are.
    if (n.children && n.children.every((c) => c.state === 2)) for (const c of n.children) c.lastUsed = this.frame;
  }

  /** Make sure a node has (or is getting) a mesh. True if it has one now. */
  private ensure(n: QNode): boolean {
    if (n.state === 2) return true;
    if (n.level === 0) {
      const e = this.chunkEntry(n.ix, n.iz);
      if (e?.patch) {
        this.meshFor(n, e.patch);
        return true;
      }
      if (!e || !e.patch) this.request(0, n.ix, n.iz, this.distTo(n) - 150);
      return false;
    }
    if (n.state === 0) {
      n.state = 1;
      this.request(n.level, n.ix, n.iz, n.level === ROOT_LEVEL ? -1e6 + this.distTo(n) : this.distTo(n) - 120 * n.level);
    }
    return false;
  }

  /** The level-0 entry for a chunk, building core chunks on the spot. */
  private chunkEntry(ci: number, cj: number): ChunkEntry | undefined {
    const key = chunkKey(ci, cj);
    let e = this.chunks.get(key);
    if (e) return e;
    if (!isCoreChunk(ci, cj)) return undefined;
    const patch = corePatch(this.core, (ci - CORE_CI0) * PATCH_N, (cj - CORE_CJ0) * PATCH_N, { ix: ci, iz: cj });
    const [x0, z0] = nodeOrigin(0, ci, cj);
    // Only the vale's outermost band (beyond its own scatter) needs streamed trees.
    const edge = Math.abs(x0 + CHUNK_M / 2) + CHUNK_M / 2 > 592 || Math.abs(z0 + CHUNK_M / 2) + CHUNK_M / 2 > 592;
    e = { ci, cj, key, x0, z0, core: true, l0: patch.l0!, scatter: edge ? scatterChunk(ci, cj, patch.l0!) : null, patch };
    this.chunks.set(key, e);
    for (const l of this.chunkListeners) l.add(e);
    return e;
  }

  private streamChunks(): void {
    const f = this.focus;
    const r = Math.ceil(DATA_RADIUS / CHUNK_M);
    const [fc, fj] = [Math.floor((f.x - ORIGIN_X) / CHUNK_M), Math.floor((f.z - ORIGIN_Z) / CHUNK_M)];
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const ci = fc + di, cj = fj + dj;
        if (ci < 0 || cj < 0 || ci >= ROOTS_X << ROOT_LEVEL || cj >= ROOTS_Z << ROOT_LEVEL) continue;
        const [x0, z0] = nodeOrigin(0, ci, cj);
        const d = Math.hypot(Math.max(x0 - f.x, 0, f.x - x0 - CHUNK_M), Math.max(z0 - f.z, 0, f.z - z0 - CHUNK_M));
        if (d > DATA_RADIUS) continue;
        const e = this.chunkEntry(ci, cj);
        if (!e) this.request(0, ci, cj, d);
      }
    }
    for (const e of [...this.chunks.values()]) {
      const d = Math.hypot(Math.max(e.x0 - f.x, 0, f.x - e.x0 - CHUNK_M), Math.max(e.z0 - f.z, 0, f.z - e.z0 - CHUNK_M));
      if (d > DROP_RADIUS) {
        this.chunks.delete(e.key);
        for (const l of this.chunkListeners) l.drop(e);
      } else if (d > KEEP_PATCH_RADIUS && !e.core) e.patch = null;
    }
    // Requests for chunks that have since fallen out of range are dropped from the queue.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const j = this.queue[i];
      if (j.level !== 0) continue;
      const [x0, z0] = nodeOrigin(0, j.ix, j.iz);
      if (Math.hypot(x0 + 80 - f.x, z0 + 80 - f.z) > DROP_RADIUS && Math.hypot(x0 + 80 - this.cam.x, z0 + 80 - this.cam.z) > 400) {
        this.queue.splice(i, 1);
        this.pending.delete(`0:${j.ix}:${j.iz}`);
        this.byId.delete(j.id);
      }
    }
  }

  private request(level: number, ix: number, iz: number, prio: number): void {
    const k = `${level}:${ix}:${iz}`;
    const p = this.pending.get(k);
    if (p) {
      if (p.worker < 0) p.prio = Math.min(p.prio, prio);
      return;
    }
    const job: Job = { id: this.nextId++, level, ix, iz, prio, worker: -1 };
    this.pending.set(k, job);
    this.byId.set(job.id, job);
    this.queue.push(job);
  }

  private pump(): void {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.prio - b.prio);
    if (!this.workers.length) {
      // Main-thread fallback: a couple of patches a frame.
      for (let n = 0; n < 2 && this.queue.length; n++) {
        const j = this.queue.shift()!;
        const patch = buildPatch(j.level, j.ix, j.iz);
        const scatter = j.level === 0 && patch.l0 ? scatterChunk(j.ix, j.iz, patch.l0) : undefined;
        this.onResult({ id: j.id, patch, scatter });
      }
      return;
    }
    for (let w = 0; w < this.workers.length && this.queue.length; w++) {
      while (this.inflight[w] < 2 && this.queue.length) {
        const j = this.queue.shift()!;
        j.worker = w;
        this.inflight[w]++;
        this.workers[w].postMessage({ id: j.id, level: j.level, ix: j.ix, iz: j.iz });
      }
    }
  }

  private onResult(r: Result): void {
    const job = this.byId.get(r.id);
    if (!job) return;
    this.byId.delete(r.id);
    this.pending.delete(`${job.level}:${job.ix}:${job.iz}`);
    if (job.worker >= 0) this.inflight[job.worker]--;
    if (this.disposed) return;
    const p = r.patch;
    if (p.level === ROOT_LEVEL) this.writeCoarse(p);
    if (p.level === 0) {
      const key = chunkKey(p.ix, p.iz);
      const had = this.chunks.get(key);
      const [x0, z0] = nodeOrigin(0, p.ix, p.iz);
      const e: ChunkEntry = had ?? { ci: p.ix, cj: p.iz, key, x0, z0, core: false, l0: p.l0!, scatter: r.scatter ?? null, patch: p };
      e.patch = p;
      if (!had) {
        this.chunks.set(key, e);
        for (const l of this.chunkListeners) l.add(e);
      }
      return;
    }
    const n = this.findNode(p.level, p.ix, p.iz);
    if (n && n.state !== 2) this.meshFor(n, p);
    this.pump();
  }

  private findNode(level: number, ix: number, iz: number): QNode | null {
    let n: QNode | undefined = this.roots[(iz >> (ROOT_LEVEL - level)) * ROOTS_X + (ix >> (ROOT_LEVEL - level))];
    for (let l = ROOT_LEVEL - 1; n && l >= level; l--) {
      if (!n.children) return null;
      const cx = (ix >> (l - level)) & 1, cz = (iz >> (l - level)) & 1;
      n = n.children[cz * 2 + cx];
    }
    return n ?? null;
  }

  private meshFor(n: QNode, p: PatchData): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(p.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(p.color, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(p.splat, 4));
    geo.setAttribute('tint', new THREE.BufferAttribute(p.tint, 4));
    geo.setIndex(terrainPatchIndex());
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(n.x0, p.minY - 40, n.z0), new THREE.Vector3(n.x0 + n.size, p.maxY + 1, n.z0 + n.size));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.name = `terrain-${n.level}`;
    mesh.visible = false;
    this.group.add(mesh);
    if (n.mesh) this.freeNode(n);
    n.mesh = mesh;
    n.minY = p.minY;
    n.maxY = p.maxY;
    n.state = 2;
  }

  private freeNode(n: QNode): void {
    if (!n.mesh) return;
    this.group.remove(n.mesh);
    // The index is shared by every patch: detach it so dispose doesn't free it.
    n.mesh.geometry.setIndex(null);
    n.mesh.geometry.dispose();
    n.mesh = null;
    n.state = 0;
  }

  private writeCoarse(p: PatchData): void {
    const c = this.coarse;
    const i0 = p.ix * PATCH_N, j0 = p.iz * PATCH_N;
    for (let j = 0; j < PATCH_V; j++) {
      for (let i = 0; i < PATCH_V; i++) {
        const gi = i0 + i, gj = j0 + j;
        if (gi >= c.n || gj >= c.n) continue;
        const k = j * PATCH_V + i, o = gj * c.n + gi;
        c.heights[o] = p.position[k * 3 + 1];
        c.colors[o * 4] = Math.round(Math.sqrt(Math.min(1, p.color[k * 3])) * 255);
        c.colors[o * 4 + 1] = Math.round(Math.sqrt(Math.min(1, p.color[k * 3 + 1])) * 255);
        c.colors[o * 4 + 2] = Math.round(Math.sqrt(Math.min(1, p.color[k * 3 + 2])) * 255);
        c.colors[o * 4 + 3] = Math.round(Math.max(0, Math.min(1, p.splat[k * 4 + 3])) * 255);
      }
    }
    c.version++;
  }

  // ---------------------------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------------------------

  /** Ground height, matching the drawn level-0 triangles. Cheap where chunks are loaded. */
  heightAt(x: number, z: number): number {
    if (inCore(x, z)) return this.coreQuery.heightAt(x, z);
    const ci = Math.floor((x - ORIGIN_X) / CHUNK_M), cj = Math.floor((z - ORIGIN_Z) / CHUNK_M);
    const e = this.chunks.get(chunkKey(ci, cj));
    if (e) return interp(e.l0.heights, (x - e.x0) / CELL, (z - e.z0) / CELL);
    // Not streamed in: evaluate the four lattice corners (cached).
    const gx = (x - ORIGIN_X) / CELL, gz = (z - ORIGIN_Z) / CELL;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = this.lattice(i, j), b = this.lattice(i + 1, j), c = this.lattice(i, j + 1), d = this.lattice(i + 1, j + 1);
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }

  private lattice(i: number, j: number): number {
    const k = i * 8192 + j;
    let h = this.analytic.get(k);
    if (h === undefined) {
      if (this.analytic.size > 200000) this.analytic.clear();
      h = terrainHeight(ORIGIN_X + i * CELL, ORIGIN_Z + j * CELL);
      this.analytic.set(k, h);
    }
    return h;
  }

  /** 0 (flat) .. 1 (vertical). */
  slopeAt(x: number, z: number): number {
    if (inCore(x, z)) return this.coreQuery.slopeAt(x, z);
    const e = this.entryAt(x, z);
    if (e) return 1 - e.l0.normalY[nearestIndex(e, x, z)];
    const s = 1.25;
    const dx = this.heightAt(x + s, z) - this.heightAt(x - s, z), dz = this.heightAt(x, z + s) - this.heightAt(x, z - s);
    return 1 - (2 * s) / Math.hypot(dx, 2 * s, dz);
  }

  /** Grass density 0..1, minus paths and sand (as in the vale's TerrainQuery.grassAt). */
  grassAt(x: number, z: number): number {
    if (inCore(x, z)) return this.coreQuery.grassAt(x, z);
    const e = this.entryAt(x, z);
    if (!e) return 0;
    const k = nearestIndex(e, x, z) * 4;
    const ss = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    return (e.l0.ground[k + 3] / 255) * (1 - ss(0.35, 0.55, e.l0.mask[k] / 255)) * (1 - ss(0.3, 0.6, e.l0.mask[k + 1] / 255));
  }

  /** Raw grass weight 0..1 at the nearest lattice vertex (before paths and sand). */
  rawGrassAt(x: number, z: number): number {
    if (inCore(x, z)) return this.coreQuery.rawGrassAt(x, z);
    const e = this.entryAt(x, z);
    return e ? e.l0.ground[nearestIndex(e, x, z) * 4 + 3] / 255 : 0;
  }

  /** Whether streamed data covers this point (always true in the vale). */
  hasData(x: number, z: number): boolean {
    return inCore(x, z) || !!this.entryAt(x, z);
  }

  entryAt(x: number, z: number): ChunkEntry | undefined {
    return this.chunks.get(chunkKey(Math.floor((x - ORIGIN_X) / CHUNK_M), Math.floor((z - ORIGIN_Z) / CHUNK_M)));
  }

  /** Ground colour (linear) for the minimap. */
  groundColorAt(x: number, z: number, out: THREE.Color): THREE.Color {
    if (inCore(x, z)) return out.copy(this.coreQuery.groundColorAt(x, z));
    const h = this.heightAt(x, z);
    if (h < 0) return out.setRGB(0.047, 0.24, 0.56);
    sampleGround(x, z, h, 1 - this.slopeAt(x, z), this.g, true);
    out.setRGB(this.g.r, this.g.g, this.g.b);
    if (this.g.snow > 0.5) out.setRGB(0.86, 0.9, 0.95);
    if (this.g.sand > 0.5) out.setRGB(0.83, 0.63, 0.34);
    if (this.g.dirt > 0.5) out.setRGB(0.58, 0.42, 0.21);
    if (this.g.lava > 0.5) out.setRGB(0.9, 0.25, 0.03);
    return out;
  }

  /** Total queued and running jobs (for the loading screen and tests). */
  get busy(): number {
    return this.queue.length + this.byId.size;
  }

  dispose(): void {
    this.disposed = true;
    for (const w of this.workers) w.terminate();
    this.forEachNode((n) => this.freeNode(n));
  }
}

function interp(h: Float32Array, gx: number, gz: number): number {
  if (gx < 0) gx = 0; else if (gx > PATCH_N - 1e-6) gx = PATCH_N - 1e-6;
  if (gz < 0) gz = 0; else if (gz > PATCH_N - 1e-6) gz = PATCH_N - 1e-6;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, k = j * PATCH_V + i;
  const a = h[k], b = h[k + 1], c = h[k + PATCH_V], d = h[k + PATCH_V + 1];
  return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
}

function nearestIndex(e: ChunkEntry, x: number, z: number): number {
  const i = Math.max(0, Math.min(PATCH_N, Math.round((x - e.x0) / CELL)));
  const j = Math.max(0, Math.min(PATCH_N, Math.round((z - e.z0) / CELL)));
  return j * PATCH_V + i;
}

