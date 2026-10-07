import * as THREE from 'three';
import { mulberry32 } from './noise';
import { Frame, box, cyl, signpost, campsite, cart, type Kit } from './buildings';
import { MESAS, POI, WATER_LEVEL, findBridge, LAKE, PATH_LAKE } from './layout';

const RUIN = 0xcfc6b2;
const RUIN_DARK = 0xa59c8a;
const MOSS = 0x6fae3c;

type HeightFn = (x: number, z: number) => number;

function ruinColor(rnd: () => number): number {
  const r = rnd();
  return r < 0.55 ? RUIN : r < 0.85 ? RUIN_DARK : 0xd9d2c1;
}

/** Stone arch: two block pillars and a semicircle of voussoirs. `broken` removes part of the arc. */
export function arch(kit: Kit, x: number, z: number, yaw: number, h: HeightFn, rnd: () => number, span = 4.4, pillarH = 4.2, broken = false): void {
  const y = Math.min(h(x, z), h(x + 2, z), h(x - 2, z), h(x, z + 2), h(x, z - 2)) - 0.3;
  const f = new Frame(x, y, z, yaw);
  const bw = 1.1;
  for (const sx of [-1, 1]) {
    const px = sx * (span / 2 + bw / 2);
    box(kit.solid, f, [bw + 0.4, 0.5, bw + 0.4], [px, 0.25, 0], RUIN_DARK);
    const blocks = Math.round(pillarH / 0.6);
    for (let i = 0; i < blocks; i++) {
      box(kit.solid, f, [bw - (i % 2) * 0.06, 0.58, bw - ((i + 1) % 2) * 0.06], [px + (rnd() - 0.5) * 0.06, 0.5 + 0.3 + i * 0.6, (rnd() - 0.5) * 0.06], ruinColor(rnd), [0, (rnd() - 0.5) * 0.06, 0]);
    }
    const p = f.p(px, 0, 0);
    kit.colliders.push({ kind: 'circle', x: p[0], z: p[2], r: bw * 0.75 });
  }
  const r = span / 2 + bw / 2;
  const n = 11;
  const top = 0.5 + pillarH;
  for (let i = 0; i < n; i++) {
    if (broken && i > n * 0.62) continue;
    const a = Math.PI - (i + 0.5) * (Math.PI / n);
    const lx = Math.cos(a) * r, ly = top + Math.sin(a) * r;
    box(kit.solid, f, [0.62, bw, bw], [lx, ly, 0], ruinColor(rnd), [0, 0, a - Math.PI / 2]);
    if (Math.sin(a) > 0.8) box(kit.solid, f, [0.66, 0.12, bw * 0.9], [lx, ly + 0.55, 0], MOSS, [0, 0, a - Math.PI / 2]);
  }
  if (broken) {
    for (let i = 0; i < 3; i++) {
      const lx = r * 0.7 + rnd() * 2, lz = (rnd() - 0.5) * 3;
      const p = f.p(lx, 0, lz);
      box(kit.solid, new Frame(p[0], h(p[0], p[2]), p[2], rnd() * 6), [0.62, bw, bw], [0, 0.4, 0], ruinColor(rnd), [rnd() * 0.5, 0, rnd() * 0.5]);
    }
  }
}

export function brokenPillar(kit: Kit, x: number, z: number, h: HeightFn, rnd: () => number, height: number): void {
  const y = h(x, z) - 0.25;
  const f = new Frame(x, y, z, rnd() * 6);
  box(kit.solid, f, [1.5, 0.5, 1.5], [0, 0.25, 0], RUIN_DARK);
  const segs = Math.max(1, Math.round(height / 1.1));
  for (let i = 0; i < segs; i++) {
    cyl(kit.solid, f, 0.52, 0.5, 1.05, [(rnd() - 0.5) * 0.05, 0.5 + 0.53 + i * 1.08, (rnd() - 0.5) * 0.05], ruinColor(rnd), 10);
  }
  // jagged top shard
  kit.solid.add(new THREE.ConeGeometry(0.45, 0.7, 6), RUIN, f.p(0.1, 0.5 + segs * 1.08 + 0.3, 0), [0.25, rnd() * 3, 0.15]);
  if (rnd() < 0.6) kit.solid.add(new THREE.IcosahedronGeometry(0.45, 0), MOSS, f.p(0.2, 0.5 + segs * 1.08 - 0.05, 0.1), f.r(), [1, 0.35, 1]);
  kit.colliders.push({ kind: 'circle', x, z, r: 0.8 });
}

export function fallenPillar(kit: Kit, x: number, z: number, h: HeightFn, rnd: () => number): void {
  const f = new Frame(x, h(x, z) + 0.2, z, rnd() * 6);
  for (let i = 0; i < 3; i++) {
    cyl(kit.solid, f, 0.5, 0.5, 1.05, [0, 0.3, -1.1 + i * 1.12 + (i === 2 ? 0.4 : 0)], ruinColor(rnd), 10, [Math.PI / 2, 0, i === 2 ? 0.3 : 0]);
  }
  const p1 = f.p(0, 0, -0.8), p2 = f.p(0, 0, 1.0);
  kit.colliders.push({ kind: 'circle', x: p1[0], z: p1[2], r: 0.7 }, { kind: 'circle', x: p2[0], z: p2[2], r: 0.7 });
}

export function ruinWall(kit: Kit, x: number, z: number, yaw: number, len: number, h: HeightFn, rnd: () => number): void {
  const y = h(x, z) - 0.3;
  const f = new Frame(x, y, z, yaw);
  const cols = Math.round(len / 1.0);
  for (let c = 0; c < cols; c++) {
    const lx = -len / 2 + (c + 0.5) * 1.0;
    const rows = 1 + Math.floor(rnd() * 4 * Math.sin((c / cols) * Math.PI) + 1);
    for (let r = 0; r < rows; r++) box(kit.solid, f, [0.95 - (r % 2) * 0.05, 0.62, 0.8], [lx + (r % 2) * 0.12, 0.31 + r * 0.64, 0], ruinColor(rnd));
    if (rnd() < 0.4) box(kit.solid, f, [0.9, 0.12, 0.75], [lx, rows * 0.64 + 0.02, 0], MOSS);
    const p = f.p(lx, 0, 0);
    kit.colliders.push({ kind: 'circle', x: p[0], z: p[2], r: 0.6 });
  }
}

export function floorSlabs(kit: Kit, x: number, z: number, r: number, h: HeightFn, rnd: () => number): void {
  for (let i = 0; i < 24; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const f = new Frame(px, h(px, pz), pz, Math.round(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.1);
    box(kit.solid, f, [1.4 + rnd() * 0.4, 0.2, 1.4 + rnd() * 0.4], [0, 0.0, 0], rnd() < 0.5 ? 0xbdb4a1 : 0xa89f8c, [(rnd() - 0.5) * 0.08, 0, (rnd() - 0.5) * 0.08]);
  }
}

/** All ruins: on the mesas (north-west) and the lone arch in the meadow. */
export function buildRuins(kit: Kit, h: HeightFn): { x: number; z: number; r: number }[] {
  const rnd = mulberry32(777);
  const reserved: { x: number; z: number; r: number }[] = [];
  // meadow arch POI
  arch(kit, POI.arch.x, POI.arch.z, 0.4, h, rnd, 4.6, 4.4, true);
  brokenPillar(kit, POI.arch.x + 6, POI.arch.z - 3, h, rnd, 2.2);
  fallenPillar(kit, POI.arch.x - 5, POI.arch.z + 4, h, rnd);
  floorSlabs(kit, POI.arch.x, POI.arch.z, 7, h, rnd);
  reserved.push({ x: POI.arch.x, z: POI.arch.z, r: 12 });

  // mesa 0: colonnade around an arch
  const m0 = MESAS[0];
  arch(kit, m0.x, m0.z, -0.5, h, rnd, 5.2, 5.0, false);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (i === 3) continue;
    const px = m0.x + Math.cos(a) * 11, pz = m0.z + Math.sin(a) * 11;
    if (i % 3 === 1) fallenPillar(kit, px, pz, h, rnd);
    else brokenPillar(kit, px, pz, h, rnd, 1.5 + rnd() * 4);
  }
  ruinWall(kit, m0.x + 16, m0.z - 8, 1.2, 9, h, rnd);
  floorSlabs(kit, m0.x, m0.z, 9, h, rnd);
  reserved.push({ x: m0.x, z: m0.z, r: 22 });

  // mesa 2: twin arches and walls
  const m2 = MESAS[2];
  arch(kit, m2.x - 4, m2.z, 1.2, h, rnd, 4.2, 4.0, false);
  arch(kit, m2.x + 6, m2.z + 5, 1.2, h, rnd, 4.2, 4.0, true);
  ruinWall(kit, m2.x, m2.z - 10, 0.1, 12, h, rnd);
  brokenPillar(kit, m2.x - 10, m2.z + 8, h, rnd, 3);
  reserved.push({ x: m2.x, z: m2.z, r: 20 });

  // mesa 3: temple rows
  const m3 = MESAS[3];
  for (let i = 0; i < 6; i++) {
    for (const s of [-1, 1]) {
      const px = m3.x - 12 + i * 4.8, pz = m3.z + s * 6;
      if (rnd() < 0.25) fallenPillar(kit, px, pz + s * 2, h, rnd);
      else brokenPillar(kit, px, pz, h, rnd, i === 2 || i === 3 ? 6 + rnd() * 2 : 1.5 + rnd() * 4.5);
    }
  }
  arch(kit, m3.x + 17, m3.z, Math.PI / 2, h, rnd, 5.0, 5.4, false);
  floorSlabs(kit, m3.x, m3.z, 12, h, rnd);
  reserved.push({ x: m3.x, z: m3.z, r: 24 });

  // standing stones ring
  const st = POI.stones;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const px = st.x + Math.cos(a) * 9, pz = st.z + Math.sin(a) * 9;
    const tall = 2.5 + rnd() * 2.5;
    const f = new Frame(px, h(px, pz) - 0.3, pz, -a);
    box(kit.solid, f, [1.4, tall, 0.8], [0, tall / 2, 0], ruinColor(rnd), [(rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15]);
    kit.colliders.push({ kind: 'circle', x: px, z: pz, r: 0.9 });
  }
  const cf = new Frame(st.x, h(st.x, st.z) - 0.2, st.z, 0);
  box(kit.solid, cf, [2.6, 0.9, 1.6], [0, 0.45, 0], RUIN_DARK);
  kit.colliders.push({ kind: 'circle', x: st.x, z: st.z, r: 1.5 });
  reserved.push({ x: st.x, z: st.z, r: 14 });
  return reserved;
}

// ---------------------------------------------------------------------------------------------

export interface Walkable {
  test(x: number, z: number): number; // returns deck height or -Infinity
}

/** Wooden arched bridge where the east road crosses the river. */
export function buildBridge(kit: Kit, h: HeightFn): { walk: Walkable; x: number; z: number } {
  const br = findBridge();
  const W = 4.2;
  let L = 10;
  const endH = (s: number) => h(br.x + br.dirX * s, br.z + br.dirZ * s);
  while (L < 24 && (endH(L) < 1.4 || endH(-L) < 1.4)) L += 1;
  const hA = endH(-L), hB = endH(L);
  const archH = Math.max(0.5, WATER_LEVEL + 2.2 - (hA + hB) / 2);
  const deckY = (s: number) => hA + (hB - hA) * ((s + L) / (2 * L)) + archH * (1 - (s / L) * (s / L));
  const yaw = Math.atan2(br.dirX, br.dirZ);
  const f = new Frame(br.x, 0, br.z, yaw);
  const step = 0.55;
  for (let s = -L; s <= L; s += step) {
    const y = deckY(s);
    const slope = Math.atan2(deckY(s + 0.1) - deckY(s - 0.1), 0.2);
    box(kit.solid, f, [W, 0.18, step - 0.06], [0, y, s], (Math.round(s / step) % 3) ? 0xa8713f : 0x96633a, [-slope, 0, 0]);
  }
  // beams under deck
  for (const t of [-W / 2 + 0.3, W / 2 - 0.3]) {
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const s0 = -L + (i / segs) * 2 * L, s1 = -L + ((i + 1) / segs) * 2 * L;
      const y0 = deckY(s0), y1 = deckY(s1);
      const len = Math.hypot(s1 - s0, y1 - y0);
      box(kit.solid, f, [0.25, 0.35, len + 0.05], [t, (y0 + y1) / 2 - 0.25, (s0 + s1) / 2], 0x6b4426, [-Math.atan2(y1 - y0, s1 - s0), 0, 0]);
    }
  }
  // rails and posts
  for (const t of [-W / 2, W / 2]) {
    for (let s = -L; s <= L + 0.01; s += 2 * L / 10) {
      const y = deckY(s);
      box(kit.solid, f, [0.18, 1.25, 0.18], [t, y + 0.55, s], 0x6b4426);
    }
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const s0 = -L + (i / segs) * 2 * L, s1 = -L + ((i + 1) / segs) * 2 * L;
      const y0 = deckY(s0), y1 = deckY(s1);
      const len = Math.hypot(s1 - s0, y1 - y0);
      for (const ry of [0.6, 1.1]) box(kit.solid, f, [0.12, 0.12, len + 0.05], [t, (y0 + y1) / 2 + ry, (s0 + s1) / 2], 0xb07a46, [-Math.atan2(y1 - y0, s1 - s0), 0, 0]);
    }
    for (let s = -L + 0.8; s <= L - 0.8; s += 0.9) {
      const p = f.p(t + Math.sign(t) * 0.15, 0, s);
      kit.colliders.push({ kind: 'circle', x: p[0], z: p[2], r: 0.25 });
    }
  }
  // support piles in the water
  for (const s of [-L * 0.45, 0, L * 0.45]) {
    for (const t of [-W / 2 + 0.3, W / 2 - 0.3]) {
      const top = deckY(s) - 0.3;
      cyl(kit.solid, f, 0.25, 0.25, top + 3.5, [t, top - (top + 3.5) / 2, s], 0x5c3a1f, 8);
    }
  }
  const cos = br.dirX, sin = br.dirZ;
  return {
    x: br.x, z: br.z,
    walk: {
      test(x: number, z: number): number {
        const dx = x - br.x, dz = z - br.z;
        const s = dx * cos + dz * sin;
        const t = -dx * sin + dz * cos;
        if (s < -L || s > L || t < -W / 2 - 0.2 || t > W / 2 + 0.2) return -Infinity;
        return deckY(s) + 0.09;
      },
    },
  };
}

/** Small wooden dock into the lake, with a rowing boat. */
export function buildDock(kit: Kit): Walkable {
  const start = PATH_LAKE.pts[PATH_LAKE.pts.length - 1];
  let dx = LAKE.x - start[0], dz = LAKE.z - start[1];
  const l = Math.hypot(dx, dz);
  dx /= l; dz /= l;
  const yaw = Math.atan2(dx, dz);
  const len = 20, W = 2.6, deck = WATER_LEVEL + 1.0;
  const f = new Frame(start[0], 0, start[1], yaw);
  for (let s = 0; s < len; s += 0.5) box(kit.solid, f, [W, 0.14, 0.44], [0, deck, s + 0.25], (Math.round(s * 2) % 3) ? 0xa8713f : 0x96633a);
  for (let s = 2; s <= len; s += 3) for (const t of [-W / 2, W / 2]) cyl(kit.solid, f, 0.16, 0.16, 4.5, [t, deck - 1.6, s], 0x5c3a1f, 7);
  for (const t of [-W / 2, W / 2]) cyl(kit.solid, f, 0.17, 0.17, 1.4, [t, deck + 0.5, len - 0.2], 0x5c3a1f, 7);
  // rowing boat
  const bf = new Frame(...f.p(W / 2 + 1.4, 0, len - 5), yaw + 0.15);
  const hull = new THREE.CylinderGeometry(0.85, 0.85, 3.6, 12, 1, false, Math.PI / 2, Math.PI);
  kit.solid.add(hull, 0xb5553a, bf.p(0, 0.4, 0), bf.r(Math.PI / 2, 0, Math.PI), [1, 1, 0.55]);
  box(kit.solid, bf, [1.5, 0.08, 0.35], [0, 0.35, 0.3], 0x8b5a33);
  box(kit.solid, bf, [0.08, 0.06, 2.4], [0.5, 0.4, -0.4], 0x8b5a33, [0, 0.2, 0]);
  return {
    test(x: number, z: number): number {
      const ox = x - start[0], oz = z - start[1];
      const s = ox * dx + oz * dz;
      const t = -ox * dz + oz * dx;
      if (s < 0 || s > len || Math.abs(t) > W / 2 + 0.1) return -Infinity;
      return deck + 0.07;
    },
  };
}

export function buildPOIs(kit: Kit, h: HeightFn): { reserved: { x: number; z: number; r: number }[]; fire: THREE.Vector3 } {
  const reserved: { x: number; z: number; r: number }[] = [];
  const j = POI.junction;
  signpost(kit, j.x + 4, h(j.x + 4, j.z - 3), j.z - 3, 0, [['Bramblewick'], ['Old Ruins'], ['Riverside']], [Math.PI, 0.75, -Math.PI / 2]);
  reserved.push({ x: j.x + 4, z: j.z - 3, r: 3 });
  const c = POI.camp;
  const fire = campsite(kit, c.x, h(c.x, c.z), c.z, -2.1, h);
  signpost(kit, c.x - 7, h(c.x - 7, c.z + 4), c.z + 4, 0, [['Campsite']], [-1.9]);
  reserved.push({ x: c.x, z: c.z, r: 9 });
  // cart by the road
  cart(kit, 14, h(14, -150), -150, 0.3);
  reserved.push({ x: 14, z: -150, r: 3 });
  // pond: little jetty stones
  const p = POI.pond;
  for (let i = 0; i < 5; i++) {
    const a = 2.4 + i * 0.25;
    const px = p.x + Math.cos(a) * (p.r + 1.5), pz = p.z + Math.sin(a) * (p.r + 1.5);
    kit.solid.add(new THREE.DodecahedronGeometry(0.6, 0), 0xa7a197, [px, h(px, pz) - 0.1, pz], [i, i * 2, 0], [1, 0.45, 1]);
  }
  // fishing spot by the pond
  const fx = p.x + Math.cos(2.0) * (p.r + 2.5), fz = p.z + Math.sin(2.0) * (p.r + 2.5);
  // The rod leans out over the water.
  const ff = new Frame(fx, h(fx, fz), fz, Math.atan2(-Math.cos(2.0), -Math.sin(2.0)));
  box(kit.solid, ff, [0.8, 0.5, 0.8], [0, 0.25, 0], 0x8b5a33);
  cyl(kit.solid, ff, 0.03, 0.02, 3.2, [0, 1.5, 1.2], 0x6b4426, 5, [0.9, 0, 0]);
  return { reserved, fire };
}

/** Lily pads + reeds around a water body (static). */
export function lilyPads(kit: Kit, cx: number, cz: number, r: number, n: number, h: HeightFn, seed: number): void {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = r * (0.55 + rnd() * 0.4);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const ground = h(x, z);
    if (ground > WATER_LEVEL - 0.3) continue;
    const s = 0.4 + rnd() * 0.45;
    kit.solid.add(new THREE.CylinderGeometry(s, s, 0.04, 9, 1, false, 0.4, Math.PI * 2 - 0.5), rnd() < 0.5 ? 0x4fa83a : 0x6cbf45, [x, WATER_LEVEL + 0.03, z], [0, rnd() * 6, 0]);
    if (rnd() < 0.2) kit.solid.add(new THREE.ConeGeometry(0.14, 0.18, 6), 0xffb3d1, [x + 0.1, WATER_LEVEL + 0.12, z], [Math.PI, 0, 0]);
  }
  // reeds on the shore band
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = r * (0.95 + rnd() * 0.35);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const ground = h(x, z);
    if (ground < WATER_LEVEL - 0.8 || ground > WATER_LEVEL + 0.8) continue;
    for (let k = 0; k < 4; k++) {
      const hh = 1.0 + rnd() * 0.8;
      kit.solid.add(new THREE.ConeGeometry(0.04, hh, 4), 0x5f9a3a, [x + (rnd() - 0.5) * 0.5, ground + hh / 2, z + (rnd() - 0.5) * 0.5], [(rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3]);
      if (k === 0) kit.solid.add(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), 0x7a4a26, [x, ground + hh + 0.05, z]);
    }
  }
}

