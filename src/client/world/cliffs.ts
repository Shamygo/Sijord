import * as THREE from 'three';
import { MESAS } from './layout';
import { mulberry32, smoothstep, valueNoise } from './noise';
import type { TerrainQuery } from './terrain';
import type { Collider } from './types';
import { makeStoneMaterial } from './materials';

/**
 * Layered stone cliffs for the mesas: every steep riser of a mesa's terraced heightfield is faced
 * with tall, irregular rock columns (columnar jointing). Columns vary in how far they stand out,
 * where they stop at the top (notches, the odd spire) and lean back slightly; tall faces get a
 * stepped ledge whose top grows moss. Every block is a climbable collider the player can stand on
 * top of, so the rock face, not the slope behind it, is what stops and carries the player.
 */
const ROCK = new THREE.Color(0xc0b9ad);

export interface CliffResult {
  group: THREE.Group;
  /** Bushes hanging over the cliff rims (breaks up the top edge). */
  rimBushes: { x: number; y: number; z: number; s: number; sy?: number }[];
  /** A few trees on the mesa tops. */
  topTrees: { kind: string; x: number; y: number; z: number; s: number }[];
}

export function buildCliffs(terrain: TerrainQuery, colliders: Collider[]): CliffResult {
  const rimBushes: CliffResult['rimBushes'] = [];
  const topTrees: CliffResult['topTrees'] = [];
  const group = new THREE.Group();
  group.name = 'cliffs';
  const mat = makeStoneMaterial(1.0, 0.5);
  const rnd = mulberry32(8080);
  const tmpM = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  let mi = 0;
  for (const m of MESAS) {
    mi++;
    const parts: THREE.BufferGeometry[] = [];
    const maxR = m.r + 22;
    const step = 0.5;
    const circ = 2 * Math.PI * (m.r + 4);
    let along = rnd() * 2;
    while (along < circ - 0.8) {
      // columns of mixed widths: narrow joints next to broad slabs
      const cw = Math.min(circ - along, 1.6 + Math.pow(rnd(), 1.6) * 4.4);
      const ang = ((along + cw / 2) / circ) * Math.PI * 2;
      along += cw;
      const cx = Math.cos(ang), cz = Math.sin(ang);
      // march outward and collect risers
      const hs: number[] = [];
      for (let r = 0; r <= maxR; r += step) hs.push(terrain.heightAt(m.x + cx * r, m.z + cz * r));
      let i = 1;
      const risers: { rIn: number; rOut: number; hTop: number; hBot: number }[] = [];
      while (i < hs.length) {
        if ((hs[i - 1] - hs[i]) / step > 1.1) {
          const start = i - 1;
          while (i < hs.length && (hs[i - 1] - hs[i]) / step > 0.6) i++;
          const end = Math.min(hs.length - 1, i);
          const hTop = hs[Math.max(0, start - 1)];
          const hBot = hs[Math.min(hs.length - 1, end + 1)];
          if (hTop - hBot > 3.5) risers.push({ rIn: start * step, rOut: end * step, hTop, hBot });
        }
        i++;
      }
      // outermost riser is the one reachable from the ground
      risers.sort((a, b) => b.rOut - a.rOut);
      let level = 0;
      for (const rs of risers) {
        const rMid = (rs.rIn + rs.rOut) / 2;
        // local face normal from the terrain gradient
        const px = m.x + cx * rMid, pz = m.z + cz * rMid;
        const gx = terrain.heightAt(px + 1, pz) - terrain.heightAt(px - 1, pz);
        const gz = terrain.heightAt(px, pz + 1) - terrain.heightAt(px, pz - 1);
        let nx = -gx, nz = -gz;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl; nz /= nl;
        if (nx * cx + nz * cz < 0.3) { nx = cx; nz = cz; }
        // coherent groups of columns stand out together; single columns jitter around that
        const al = ang * (m.r + 4);
        const grp = valueNoise(al / 11, level * 3.7 + mi * 13, 4100);
        const grp2 = valueNoise(al / 6.5, level * 5.1 + mi * 7, 4200);
        const w = cw * (1.1 + rnd() * 0.25);
        const depth = 4 + rnd() * 3;
        const protrude = 0.2 + grp * 1.2 + rnd() * 0.5;
        let top = rs.hTop - 0.2 - Math.abs(grp2 - 0.45) * 3.0 - rnd() * 0.7;
        const r = rnd();
        if (r < 0.1) top -= 1.8 + rnd() * 3.2; // notch
        else if (r > 0.96) top = rs.hTop + 0.6 + rnd() * 2.2; // spire
        const bottom = rs.hBot - 1.6;
        const h = top - bottom;
        if (h < 2) continue;
        const fx = m.x + cx * rs.rOut, fz = m.z + cz * rs.rOut;
        const yaw0 = Math.atan2(nx, nz) + (rnd() - 0.5) * 0.16;
        const v = 0.78 + rnd() * 0.34 + (grp2 - 0.5) * 0.2;
        const warm = rnd();
        col.copy(ROCK).multiplyScalar(v);
        col.r *= 0.97 + warm * 0.07; col.b *= 1.03 - warm * 0.09;
        const lean = 0.25 + rnd() * 0.75;
        const addBlock = (b0: number, b1: number, prot: number, wScale: number, tint: number, ln: number, top: boolean) => {
          const hh = b1 - b0;
          if (hh < 0.8) return;
          const g = columnGeometry(w * wScale, hh, depth, ln, rnd);
          e.set((rnd() - 0.5) * 0.05, yaw0 + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.05, 'YXZ');
          q.setFromEuler(e);
          const bx = fx + nx * (prot - depth / 2), bz = fz + nz * (prot - depth / 2);
          // The top's outer edge is chamfered down and the column leans back, so stand a little low.
          colliders.push({ kind: 'obox', x: bx, z: bz, hw: (w * wScale) / 2, hd: depth / 2, yaw: e.y, maxY: b1 - (top ? 0.25 : 0.05), climb: true });
          tmpM.compose(new THREE.Vector3(bx, b0 + hh / 2, bz), q, new THREE.Vector3(1, 1, 1));
          g.applyMatrix4(tmpM);
          const n = g.attributes.position.count;
          const ca = new Float32Array(n * 3);
          const pa = g.attributes.position as THREE.BufferAttribute;
          for (let k = 0; k < n; k++) {
            // painted occlusion: each block darkens toward its foot, the whole cliff toward the ground
            const yy = pa.getY(k);
            const t = tint * (0.8 + 0.25 * smoothstep(b0, b0 + Math.min(3, hh * 0.6), yy)) * (0.86 + 0.14 * smoothstep(bottom, bottom + 8, yy));
            ca[k * 3] = col.r * t; ca[k * 3 + 1] = col.g * t; ca[k * 3 + 2] = col.b * t;
          }
          g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
          parts.push(g);
        };
        // stack the column from a few fractured blocks (split heights differ per column)
        let nSeg = h > 16 ? 3 : h > 8 ? 2 : 1;
        if (nSeg > 1 && rnd() < 0.3) nSeg--;
        const splits = [bottom];
        for (let k = 1; k < nSeg; k++) splits.push(bottom + h * ((k + (rnd() - 0.5) * 0.6) / nSeg));
        splits.push(top);
        const plinth = rnd() < 0.4 ? 0.5 + rnd() * 0.8 : 0;
        for (let k = 0; k < nSeg; k++) {
          const isTop = k === nSeg - 1;
          const p = protrude + (k === 0 ? plinth : 0) + (rnd() - 0.5) * 0.5 * (isTop ? 0.5 : 1);
          const b1 = isTop ? splits[k + 1] : splits[k + 1] + 0.12;
          addBlock(splits[k] - (k ? 0.12 : 0), b1, p, 1 + (rnd() - 0.5) * 0.1, 0.92 + rnd() * 0.14, isTop ? lean * ((b1 - splits[k]) / h + 0.3) : rnd() * 0.25, isTop);
        }
        // greenery spilling over the rim
        if (rnd() < 0.42) {
          const rr = rs.rIn - 0.4 - rnd() * 1.6;
          const bx = m.x + cx * rr, bz = m.z + cz * rr;
          const sc = 0.9 + rnd() * 1.2;
          rimBushes.push({ x: bx, y: terrain.heightAt(bx, bz) - 0.25, z: bz, s: sc * 1.15, sy: sc * (0.75 + rnd() * 0.35) });
        }
        level++;
      }
    }
    // trees on the plateau(s)
    const nTrees = Math.round(m.r / 9);
    for (let k = 0; k < nTrees * 3 && k < 60; k++) {
      if (topTrees.length && k >= nTrees * 3) break;
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * m.r * 0.6;
      const tx = m.x + Math.cos(a) * rr, tz = m.z + Math.sin(a) * rr;
      const h0 = terrain.heightAt(tx, tz);
      if (Math.abs(terrain.heightAt(tx + 2, tz) - h0) + Math.abs(terrain.heightAt(tx, tz + 2) - h0) > 0.8) continue;
      if (rnd() > 0.34) continue;
      const kr = rnd();
      const sc = 0.85 + rnd() * 0.45;
      topTrees.push({ kind: kr < 0.45 ? 'round' : kr < 0.75 ? 'wide' : 'tall', x: tx, y: h0 - 0.15, z: tz, s: sc });
      colliders.push({ kind: 'circle', x: tx, z: tz, r: 0.45 * sc });
    }
    if (!parts.length) continue;
    const merged = mergeFlat(parts);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'cliff';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return { group, rimBushes, topTrees };
}

/**
 * A rock column: box with jittered vertices (+z is the outer face), its top leaning back by
 * `lean` and the top outer edge chamfered; flat-shaded.
 */
function columnGeometry(w: number, h: number, d: number, lean: number, rnd: () => number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 2, 1, 1);
  const pa = g.attributes.position as THREE.BufferAttribute;
  // jitter shared positions consistently (box vertices are duplicated per face)
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const off = new Map<string, [number, number, number]>();
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
    const k = key(x, y, z);
    let o = off.get(k);
    if (!o) {
      const isTop = y > h / 2 - 1e-3;
      const outer = z > 0;
      o = [(rnd() - 0.5) * 0.4, isTop ? (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.35];
      if (isTop) {
        o[2] -= lean;
        if (outer) { o[1] -= 0.2 + rnd() * 0.45; o[2] -= rnd() * 0.3; }
      }
      // the middle seam folds the face a little
      if (Math.abs(x) < 1e-3 && outer) o[2] += (rnd() - 0.3) * 0.35;
      off.set(k, o);
    }
    pa.setXYZ(i, x + o[0], y + o[1], z + o[2]);
  }
  const ng = g.toNonIndexed();
  g.dispose();
  ng.deleteAttribute('uv');
  ng.deleteAttribute('normal');
  ng.computeVertexNormals();
  return ng;
}

function mergeFlat(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    col.set(p.attributes.color.array as Float32Array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
