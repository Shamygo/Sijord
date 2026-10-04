import * as THREE from 'three';
import { hash2i, mulberry32 } from './noise';

/**
 * Procedural textures shared by the world shaders (no external assets).
 * The noise texture is tileable RGBA:
 *  R = smooth fbm, G = mid-frequency "brush" fbm, B = cellular (distance to nearest feature point),
 *  A = fine grain.
 */
let noiseTex: THREE.DataTexture | null = null;

export function getNoiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const per = (x: number, z: number, cell: number, seed: number) => {
    const p = size / cell;
    const xi = Math.floor(x / cell), zi = Math.floor(z / cell);
    const fx = x / cell - xi, fz = z / cell - zi;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const hh = (a: number, b: number) => hash2i(((a % p) + p) % p, ((b % p) + p) % p, seed);
    const a = hh(xi, zi), b = hh(xi + 1, zi), c = hh(xi, zi + 1), d = hh(xi + 1, zi + 1);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  };
  // cellular: 16x16 feature points, tileable
  const cells = 16;
  const cs = size / cells;
  const pts: number[] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push((i + hash2i(i, j, 91)) * cs, (j + hash2i(i, j, 92)) * cs);
  const cell = (x: number, z: number) => {
    const ci = Math.floor(x / cs), cj = Math.floor(z / cs);
    let best = 1e9;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj;
        const wi = ((ii % cells) + cells) % cells, wj = ((jj % cells) + cells) % cells;
        const px = pts[(wj * cells + wi) * 2] + (ii - wi) * cs;
        const pz = pts[(wj * cells + wi) * 2 + 1] + (jj - wj) * cs;
        const d = Math.hypot(px - x, pz - z);
        if (d < best) best = d;
      }
    }
    return Math.min(1, best / (cs * 0.9));
  };
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const k = (z * size + x) * 4;
      const r = per(x, z, 64, 1) * 0.45 + per(x, z, 32, 2) * 0.27 + per(x, z, 16, 3) * 0.16 + per(x, z, 8, 4) * 0.12;
      const g = per(x, z, 32, 11) * 0.4 + per(x, z, 16, 12) * 0.3 + per(x, z, 8, 13) * 0.2 + per(x, z, 4, 14) * 0.1;
      const b = cell(x, z);
      const a = per(x, z, 4, 21) * 0.6 + per(x, z, 2, 22) * 0.4;
      // stretch contrast a little so thresholds in the shaders have range to work with
      data[k] = clamp((r - 0.5) * 1.6 + 0.5);
      data[k + 1] = clamp((g - 0.5) * 1.7 + 0.5);
      data[k + 2] = clamp(b);
      data[k + 3] = clamp((a - 0.5) * 1.5 + 0.5);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  noiseTex = tex;
  return tex;
}

/**
 * Leaf-cluster atlas for tree and bush cards: the left 7/8 holds a round cluster of pointed leaves
 * (alpha-cut), each leaf with its own shade in the red channel; the green channel is a "facing"
 * term (lighter toward the upper-left). The far-right column is solid white, for trunks.
 */
let leafTex: THREE.Texture | null = null;
export const LEAF_SOLID_U = 0.97;

export function getLeafTexture(): THREE.Texture {
  if (leafTex) return leafTex;
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  const rnd = mulberry32(77);
  // two cluster variants side by side (u 0..0.45 and 0.45..0.9)
  const drawCluster = (cx: number, cy: number, R: number) => {
    const leaves = 70;
    for (let i = 0; i < leaves; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd()) * R * 0.78;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const len = R * (0.2 + rnd() * 0.14);
      const wid = len * (0.38 + rnd() * 0.16);
      const rot = a + (rnd() - 0.5) * 1.6;
      const shade = 0.62 + rnd() * 0.38;
      // facing: leaves on the upper-left of the cluster face the sun more
      const facing = 0.5 + 0.5 * (-(x - cx) * 0.6 - (y - cy) * 0.8) / R;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = `rgb(${Math.round(shade * 255)},${Math.round(Math.max(0, Math.min(1, facing)) * 255)},255)`;
      ctx.beginPath();
      ctx.moveTo(-len * 0.5, 0);
      ctx.quadraticCurveTo(0, -wid, len * 0.5, 0);
      ctx.quadraticCurveTo(0, wid, -len * 0.5, 0);
      ctx.fill();
      // midrib
      ctx.strokeStyle = `rgba(${Math.round(shade * 200)},${Math.round(facing * 200)},230,0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-len * 0.45, 0);
      ctx.lineTo(len * 0.45, 0);
      ctx.stroke();
      ctx.restore();
    }
  };
  drawCluster(W * 0.225, H * 0.5, H * 0.48);
  drawCluster(W * 0.675, H * 0.5, H * 0.48);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(W * 0.94, 0, W * 0.06, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  leafTex = tex;
  return tex;
}
