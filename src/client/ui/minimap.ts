import * as THREE from 'three';
import type { World } from '../world/types';
import { CHUNK_M, ORIGIN_X, ORIGIN_Z, PATCH_N, PATCH_V } from '../world/stream/lattice';
import type { ChunkEntry } from '../world/stream/streamer';
import { TREE_STRIDE } from '../world/stream/scatter';

const SIZE = 256;
/** Metres shown across the minimap's diameter. */
const VIEW = 140;

/** Circular minimap that rotates with the camera, painted once from the world's ground colours. */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  /** Top-down painting of the whole map; x maps to world x, y to world z. Shared with the full map. */
  readonly terrain: HTMLCanvasElement;
  readonly metresPerPx: number;
  /** The whole region at 20 m a pixel, painted from the streamed root tiles as they arrive. */
  readonly region: HTMLCanvasElement = document.createElement('canvas');
  private regionVersion = -1;
  /** Fine 2.5 m tiles of streamed chunks near the player, painted when each chunk arrives. */
  private readonly tiles = new Map<number, { x0: number; z0: number; canvas: HTMLCanvasElement }>();

  constructor(private world: World) {
    world.streamer?.chunkListeners.push({ add: (e) => this.paintChunk(e), drop: (e) => this.tiles.delete(e.key) });
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    // One pixel per ~2 m of world.
    const res = Math.min(1024, Math.ceil(world.halfSize));
    this.metresPerPx = (world.halfSize * 2) / res;
    this.terrain = document.createElement('canvas');
    this.terrain.width = this.terrain.height = res;
    const tctx = this.terrain.getContext('2d')!;
    const img = tctx.createImageData(res, res);
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const x = -world.halfSize + (px + 0.5) * this.metresPerPx;
        const z = -world.halfSize + (py + 0.5) * this.metresPerPx;
        const c = world.groundColorAt(x, z);
        const h = world.heightAt(x,z);
        const shade = 0.95 + Math.max(-0.18, Math.min(0.18, (world.heightAt(x + 2, z + 2) - h) * 0.09));
        const water = h < world.waterLevel;
        const grass = c.g > c.r * 1.12;
        const i = (py * res + px) * 4;
        img.data[i] = Math.min(255, (water ? 51 : grass ? 72+c.r*125 : 155+c.r*70) * shade);
        img.data[i + 1] = Math.min(255, (water ? 123 : grass ? 105+c.g*125 : 135+c.g*70) * shade);
        img.data[i + 2] = Math.min(255, (water ? 162 : grass ? 55+c.b*100 : 89+c.b*70) * shade);
        img.data[i + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    // Paint the actual tree locations and building footprints, not a fictional map backdrop.
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
    world.root.traverse(object => {
      if (!(object instanceof THREE.BatchedMesh) || object.name !== 'trees') return;
      for (let i=0;i<object.instanceCount;i++) {
        object.getMatrixAt(i,matrix); matrix.decompose(position,rotation,scale);
        const x=(position.x+world.halfSize)/this.metresPerPx,z=(position.z+world.halfSize)/this.metresPerPx,r=Math.max(1.1,scale.x*2.2/this.metresPerPx);
        tctx.fillStyle='#345d48bb';tctx.beginPath();tctx.ellipse(x+.6,z+.8,r,r*.8,0,0,Math.PI*2);tctx.fill();
        tctx.fillStyle='#527f55';tctx.beginPath();tctx.ellipse(x,z,r*.85,r*.72,0,0,Math.PI*2);tctx.fill();
        tctx.fillStyle='#88a96899';tctx.beginPath();tctx.arc(x-r*.25,z-r*.2,r*.4,0,Math.PI*2);tctx.fill();
      }
    });
    for(const c of world.colliders) if(c.kind === 'box' && c.maxX-c.minX>3 && c.maxZ-c.minZ>3 && c.maxX-c.minX<60) {
      const x=(c.minX+world.halfSize)/this.metresPerPx,z=(c.minZ+world.halfSize)/this.metresPerPx,w=(c.maxX-c.minX)/this.metresPerPx,h=(c.maxZ-c.minZ)/this.metresPerPx;
      tctx.fillStyle='#987661';tctx.fillRect(x,z,w,h);tctx.strokeStyle='#efe1bf';tctx.lineWidth=.7;tctx.strokeRect(x,z,w,h);
    }
  }

  /** Repaint the coarse region canvas when new root tiles have streamed in. */
  refreshRegion(): void {
    const c = this.world.streamer?.coarse;
    if (!c || c.version === this.regionVersion) return;
    this.regionVersion = c.version;
    const n = c.n;
    if (this.region.width !== n) this.region.width = this.region.height = n;
    const ctx = this.region.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i, o = k * 4;
        const h = c.heights[k];
        const hn = c.heights[Math.min(n - 1, j + 1) * n + Math.min(n - 1, i + 1)];
        const shade = 0.95 + Math.max(-0.2, Math.min(0.2, (hn - h) * 0.012));
        const r = (c.colors[o] / 255) ** 2, g = (c.colors[o + 1] / 255) ** 2, b = (c.colors[o + 2] / 255) ** 2;
        paint(img.data, o, h < 0 ? 'water' : c.colors[o + 3] > 128 ? 'snow' : g > r * 1.12 ? 'grass' : 'bare', r, g, b, shade, h);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Paint a fine tile for a streamed chunk (outside the vale, which has its own painting). */
  private paintChunk(e: ChunkEntry): void {
    if (e.core) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PATCH_N;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(PATCH_N, PATCH_N);
    const L = e.l0;
    for (let j = 0; j < PATCH_N; j++) {
      for (let i = 0; i < PATCH_N; i++) {
        const k = j * PATCH_V + i, o = (j * PATCH_N + i) * 4;
        const h = L.heights[k];
        const shade = 0.95 + Math.max(-0.18, Math.min(0.18, (L.heights[k + PATCH_V + 1] - h) * 0.09));
        const r = (L.ground[k * 4] / 255) ** 2, g = (L.ground[k * 4 + 1] / 255) ** 2, b = (L.ground[k * 4 + 2] / 255) ** 2;
        const kind = h < 0 ? 'water' : L.mask[k * 4 + 3] > 128 ? 'lava' : L.mask[k * 4] > 128 ? 'dirt' : L.mask[k * 4 + 1] > 128 ? 'sand' : L.mask[k * 4 + 2] > 128 ? 'snow' : g > r * 1.12 ? 'grass' : 'bare';
        paint(img.data, o, kind, r, g, b, shade, h);
      }
    }
    ctx.putImageData(img, 0, 0);
    // Trees as little canopies, like the vale's painting.
    const t = e.scatter?.trees;
    if (t) {
      for (let q = 0; q < t.length; q += TREE_STRIDE) {
        const px = (t[q] - e.x0) / (CHUNK_M / PATCH_N), pz = (t[q + 2] - e.z0) / (CHUNK_M / PATCH_N), rr = Math.max(0.9, t[q + 4] * 0.9);
        ctx.fillStyle = '#345d48cc';
        ctx.beginPath();
        ctx.ellipse(px + 0.4, pz + 0.5, rr, rr * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#527f55';
        ctx.beginPath();
        ctx.ellipse(px, pz, rr * 0.85, rr * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.tiles.set(e.key, { x0: e.x0, z0: e.z0, canvas });
  }

  /** Draw the region and the fine streamed tiles in a frame where world (x, z) maps to ((x - ox) * k, (z - oz) * k). */
  drawStreamed(ctx: CanvasRenderingContext2D, ox: number, oz: number, k: number, fine: boolean): void {
    this.refreshRegion();
    if (this.region.width > 1) {
      const c = this.world.streamer!.coarse;
      ctx.drawImage(this.region, (ORIGIN_X - ox) * k, (ORIGIN_Z - oz) * k, c.n * c.cell * k, c.n * c.cell * k);
    }
    if (!fine) return;
    for (const t of this.tiles.values()) ctx.drawImage(t.canvas, (t.x0 - ox) * k, (t.z0 - oz) * k, CHUNK_M * k + 0.5, CHUNK_M * k + 0.5);
  }

  /**
   * Draw centred on (x, z). `camYaw` rotates the map so "up" is where the camera looks.
   * Markers are world points; `partner` is drawn as a blue dot.
   */
  draw(x: number, z: number, playerYaw: number, camYaw: number, markers: { x: number; z: number; color: string; label?: string }[], partner?: { x: number; z: number }): void {
    const ctx = this.ctx;
    const scale = SIZE / VIEW; // px per metre
    ctx.save();
    ctx.fillStyle = '#4a7fb0';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.translate(SIZE / 2, SIZE / 2);
    // Texture x = world x, texture y = world z. Rotating by (camYaw + PI) puts the camera's forward at screen-up.
    ctx.rotate(Math.PI + camYaw);
    const tx = (x + this.world.halfSize) / this.metresPerPx;
    const tz = (z + this.world.halfSize) / this.metresPerPx;
    const k = scale * this.metresPerPx;
    ctx.imageSmoothingEnabled = true;
    this.drawStreamed(ctx, x, z, scale, true);
    ctx.drawImage(this.terrain, -tx * k, -tz * k, this.terrain.width * k, this.terrain.height * k);
    const dot = (wx: number, wz: number, color: string, r: number) => {
      ctx.beginPath();
      ctx.arc((wx - x) * scale, (wz - z) * scale, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    };
    for (const m of markers) dot(clampToView(m.x, x), clampToView(m.z, z), m.color, 7);
    if (partner) dot(partner.x, partner.z, '#2e86de', 8);
    ctx.restore();

    // Player arrow, rotated by facing relative to the camera.
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(-(playerYaw - camYaw));
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 11);
    ctx.lineTo(0, 5);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fillStyle = '#3fb5ff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fill();
    ctx.restore();

    function clampToView(v: number, c: number) {
      const half = VIEW / 2 - 6;
      return c + Math.max(-half, Math.min(half, v - c));
    }
  }
}

/** The map's painterly palette (shared by the vale, region and streamed tiles). */
function paint(d: Uint8ClampedArray, o: number, kind: 'water' | 'grass' | 'bare' | 'snow' | 'sand' | 'dirt' | 'lava', r: number, g: number, b: number, shade: number, h: number): void {
  let R: number, G: number, B: number;
  switch (kind) {
    case 'water': { const deep = Math.min(1, Math.max(0, -h / 12)); R = 51 - deep * 20; G = 123 - deep * 35; B = 162 - deep * 25; break; }
    case 'grass': R = 72 + r * 125; G = 105 + g * 125; B = 55 + b * 100; break;
    case 'snow': R = 226; G = 234; B = 242; break;
    case 'sand': R = 222; G = 196; B = 140; break;
    case 'dirt': R = 196; G = 160; B = 112; break;
    case 'lava': R = 236; G = 92; B = 30; break;
    default: R = 155 + r * 70; G = 135 + g * 70; B = 89 + b * 70;
  }
  d[o] = Math.min(255, R * shade);
  d[o + 1] = Math.min(255, G * shade);
  d[o + 2] = Math.min(255, B * shade);
  d[o + 3] = 255;
}
