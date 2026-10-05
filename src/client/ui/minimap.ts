import * as THREE from 'three';
import type { World } from '../world/types';

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
