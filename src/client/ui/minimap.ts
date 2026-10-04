import type { World } from '../world/types';

const SIZE = 256;
/** Metres shown across the minimap's diameter. */
const VIEW = 140;

/** Circular minimap that rotates with the camera, painted once from the world's ground colours. */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private metresPerPx: number;

  constructor(private world: World) {
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
        const shade = 0.9 + Math.max(-0.15, Math.min(0.15, (world.heightAt(x + 2, z + 2) - world.heightAt(x, z)) * 0.08));
        const i = (py * res + px) * 4;
        img.data[i] = Math.min(255, c.r * 255 * shade);
        img.data[i + 1] = Math.min(255, c.g * 255 * shade);
        img.data[i + 2] = Math.min(255, c.b * 255 * shade);
        img.data[i + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
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
