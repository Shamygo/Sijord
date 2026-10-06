import * as THREE from 'three';
import { GeoBuilder, prismGeometry, signTexture } from './shared';
import type { Collider } from './types';

export type V3 = [number, number, number];

/** A local frame: origin + yaw. Local +Z maps to world (sin yaw, 0, cos yaw). */
export class Frame {
  readonly c: number;
  readonly s: number;
  constructor(readonly x: number, readonly y: number, readonly z: number, readonly yaw: number) {
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }
  p(lx: number, ly: number, lz: number): V3 {
    return [this.x + lx * this.c + lz * this.s, this.y + ly, this.z - lx * this.s + lz * this.c];
  }
  r(rx = 0, ry = 0, rz = 0): V3 {
    return [rx, this.yaw + ry, rz];
  }
}

/** Shared build targets for static props. */
export interface Kit {
  solid: GeoBuilder;
  glow: GeoBuilder;
  extras: THREE.Group;
  colliders: Collider[];
}

export const COL = {
  stone: 0x9e978b,
  stoneDark: 0x7c766d,
  wood: 0x8b5a33,
  woodDark: 0x5c3a1f,
  woodLight: 0xb07a46,
  plaster: 0xf4e8cc,
  white: 0xf7f6f0,
  glass: 0x9fd6f0,
  soil: 0x5e3d22,
  leaf: 0x4f9e2c,
  roofRed: 0xc8473a,
  roofBlue: 0x3d6fc4,
  roofTeal: 0x1fa79a,
  roofGreen: 0x4f8f3a,
  roofOrange: 0xd77a2f,
  roofPurple: 0x7d5bb8,
  cloth: 0xd9553f,
};

const tmpC = new THREE.Color();

export function box(b: GeoBuilder, f: Frame, size: V3, at: V3, color: THREE.ColorRepresentation, rot: V3 = [0, 0, 0]): void {
  b.add(new THREE.BoxGeometry(size[0], size[1], size[2]), color, f.p(at[0], at[1], at[2]), f.r(rot[0], rot[1], rot[2]));
}

export function cyl(b: GeoBuilder, f: Frame, r0: number, r1: number, h: number, at: V3, color: THREE.ColorRepresentation, segs = 8, rot: V3 = [0, 0, 0]): void {
  b.add(new THREE.CylinderGeometry(r1, r0, h, segs), color, f.p(at[0], at[1], at[2]), f.r(rot[0], rot[1], rot[2]));
}

/** Gable roof with shingle rows; ridge along local X. */
export function gableRoof(b: GeoBuilder, f: Frame, w: number, d: number, top: number, rise: number, overhang: number, color: number): void {
  const half = d / 2 + overhang;
  const theta = Math.atan2(rise, d / 2);
  const slopeLen = half / Math.cos(theta);
  const rows = 5;
  const base = new THREE.Color(color);
  for (const s of [1, -1]) {
    for (let r = 0; r < rows; r++) {
      const t0 = r / rows;
      const len = slopeLen / rows + 0.12;
      const mid = (t0 + 0.5 / rows) * slopeLen;
      const lz = s * Math.cos(theta) * mid;
      const ly = top + rise - Math.sin(theta) * mid + 0.12 + (r % 2) * 0.03;
      tmpC.copy(base).multiplyScalar(r % 2 ? 0.86 : 1.0);
      if (r === rows - 1) tmpC.multiplyScalar(0.8);
      box(b, f, [w + overhang * 2, 0.2, len], [0, ly, lz], tmpC.getHex(), [s * theta, 0, 0]);
    }
  }
  // Narrow tile seams break the broad roof into ceramic strips.
  for(const side of [1,-1]) for(let x=-w/2;x<=w/2;x+=.62){
    box(b,f,[.045,.045,slopeLen],[x,top+rise-half*Math.tan(theta)/2+.17,side*half/2],base.clone().multiplyScalar(.76).getHex(),[side*theta,0,0]);
  }
  // ridge cap
  box(b, f, [w + overhang * 2 + 0.1, 0.32, 0.5], [0, top + rise + 0.12, 0], base.clone().multiplyScalar(0.7).getHex());
}

function gableWalls(b: GeoBuilder, f: Frame, w: number, d: number, top: number, rise: number, color: number): void {
  for (const sx of [1, -1]) {
    const g = prismGeometry(d, rise, 0.3);
    b.add(g, color, f.p(sx * (w / 2 - 0.15), top, 0), f.r(0, Math.PI / 2, 0));
  }
}

function windowAt(b: GeoBuilder, f: Frame, lx: number, ly: number, lz: number, face: number, shutter: number, flowers: boolean): void {
  // face: rotation offset (0 => window on +Z wall facing +Z)
  const wf = new Frame(...f.p(0, 0, 0), f.yaw + face);
  const [ax, , az] = [lx, ly, lz];
  box(b, wf, [1.15, 1.15, 0.12], [ax, ly, az + 0.02], COL.woodDark);
  box(b, wf, [0.9, 0.9, 0.1], [ax, ly, az + 0.07], COL.glass);
  box(b, wf, [0.08, 0.9, 0.12], [ax, ly, az + 0.1], COL.woodDark);
  box(b, wf, [0.9, 0.08, 0.12], [ax, ly, az + 0.1], COL.woodDark);
  box(b, wf, [0.42, 1.05, 0.07], [ax - 0.82, ly, az + 0.08], shutter);
  box(b, wf, [0.42, 1.05, 0.07], [ax + 0.82, ly, az + 0.08], shutter);
  if (flowers) {
    box(b, wf, [1.2, 0.25, 0.3], [ax, ly - 0.7, az + 0.2], COL.wood);
    const cols = [0xff5a7a, 0xffd23f, 0xff8fc8, 0xffffff];
    for (let i = 0; i < 6; i++) {
      b.add(new THREE.IcosahedronGeometry(0.12, 0), cols[i % cols.length], wf.p(ax - 0.5 + i * 0.2, ly - 0.5 + (i % 2) * 0.05, az + 0.22), wf.r());
    }
    for (let i = 0; i < 4; i++) b.add(new THREE.IcosahedronGeometry(0.14, 0), COL.leaf, wf.p(ax - 0.45 + i * 0.3, ly - 0.58, az + 0.3), wf.r());
  }
}

export interface CottageOpts {
  w: number;
  d: number;
  wallH: number;
  roof: number;
  shutter: number;
  wall?: number;
  chimney?: boolean;
  floors?: number;
}

/** A cosy timber-framed cottage. Door on local +Z. Returns the door position (world, ground level). */
export function cottage(kit: Kit, x: number, y: number, z: number, yaw: number, o: CottageOpts): THREE.Vector3 {
  const f = new Frame(x, y, z, yaw);
  const b = kit.solid;
  const { w, d, wallH } = o;
  const wall = o.wall ?? COL.plaster;
  const base = 0.45;
  box(b, f, [w + 0.4, 1.2, d + 0.4], [0, base - 0.6, 0], COL.stone);
  // stones along the foundation
  for (let i = 0; i < Math.floor(w / 0.9); i++) box(b, f, [0.7, 0.32, 0.06], [-w / 2 + 0.5 + i * 0.9, 0.12 + (i % 2) * 0.15, d / 2 + 0.22], i % 2 ? COL.stoneDark : 0xb3ac9f);
  box(b, f, [w, wallH, d], [0, base + wallH / 2, 0], wall);
  const top = base + wallH;
  // timber frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, f, [0.28, wallH, 0.28], [sx * (w / 2 - 0.05), base + wallH / 2, sz * (d / 2 - 0.05)], COL.woodDark);
  box(b, f, [w + 0.1, 0.22, d + 0.1], [0, top - 0.05, 0], COL.woodDark);
  box(b, f, [w + 0.06, 0.16, d + 0.06], [0, base + 0.08, 0], COL.woodDark);
  if ((o.floors ?? 1) > 1) box(b, f, [w + 0.08, 0.18, d + 0.08], [0, base + wallH * 0.5, 0], COL.woodDark);
  // side braces
  for (const sx of [-1, 1]) {
    box(b, f, [0.16, wallH * 0.95, 0.16], [sx * (w / 2 + 0.02), base + wallH / 2, -d * 0.18], COL.woodDark, [Math.atan2(d * 0.35, wallH), 0, 0]);
    box(b, f, [0.16, wallH * 0.95, 0.16], [sx * (w / 2 + 0.02), base + wallH / 2, d * 0.18], COL.woodDark, [-Math.atan2(d * 0.35, wallH), 0, 0]);
  }
  const rise = Math.min(2.6, d * 0.42);
  gableWalls(b, f, w, d, top, rise, wall);
  gableRoof(b, f, w, d, top, rise, 0.55, o.roof);
  // gable vent window
  for (const sx of [-1, 1]) {
    const gf = new Frame(...f.p(sx * (w / 2 + 0.02), 0, 0), yaw + (sx > 0 ? Math.PI / 2 : -Math.PI / 2));
    box(b, gf, [0.7, 0.7, 0.1], [0, top + rise * 0.38, 0], COL.woodDark);
    box(b, gf, [0.5, 0.5, 0.1], [0, top + rise * 0.38, 0.04], COL.glass);
  }
  if (o.chimney !== false) {
    box(b, f, [0.8, rise + 1.6, 0.8], [w * 0.28, top + (rise + 1.6) / 2 + 0.2, -d * 0.18], COL.stoneDark);
    box(b, f, [0.95, 0.2, 0.95], [w * 0.28, top + rise + 1.9, -d * 0.18], COL.stone);
  }
  // Horizontal timber slats and deep eaves ground the village in its Hisui-inspired style.
  for(let y=.65;y<Math.min(top-.1,2.45);y+=.27){
    box(b,f,[w-.25,.035,.045],[0,y,d/2+.035],COL.woodLight);
    for(const side of [-1,1])box(b,f,[.045,.035,d-.25],[side*(w/2+.035),y,0],COL.woodLight);
  }
  // door with awning and step
  const dz = d / 2;
  box(b, f, [1.5, 2.35, 0.18], [0, base + 1.17, dz + 0.02], COL.woodDark);
  box(b, f, [1.15, 2.1, 0.12], [0, base + 1.05, dz + 0.08], COL.wood);
  for (let i = -1; i <= 1; i++) box(b, f, [0.05, 2.0, 0.04], [i * 0.3, base + 1.05, dz + 0.15], COL.woodDark);
  b.add(new THREE.SphereGeometry(0.06, 6, 4), 0xe8c050, f.p(0.4, base + 1.05, dz + 0.18), f.r());
  box(b, f, [1.9, 0.12, 0.9], [0, base + 2.55, dz + 0.42], o.roof, [-0.35, 0, 0]);
  for (const sx of [-0.85, 0.85]) box(b, f, [0.1, 0.5, 0.1], [sx, base + 2.25, dz + 0.55], COL.woodDark, [0.6, 0, 0]);
  box(b, f, [1.8, 0.25, 1.0], [0, 0.12, dz + 0.65], COL.stone);
  // windows
  const wy = base + Math.min(1.55, wallH * 0.52);
  const offs = w > 6 ? [-w * 0.3, w * 0.3] : [-w * 0.3];
  for (const ox of offs) windowAt(b, f, ox, wy, dz, 0, o.shutter, true);
  if ((o.floors ?? 1) > 1) for (const ox of [-w * 0.3, 0, w * 0.3]) windowAt(b, f, ox, base + wallH * 0.78, dz, 0, o.shutter, false);
  windowAt(b, f, 0, wy, d / 2, Math.PI, o.shutter, false);
  for (const sx of [1, -1]) windowAt(b, f, 0, wy, w / 2, sx * Math.PI / 2, o.shutter, sx > 0);
  // lantern by the door
  box(b, f, [0.08, 0.08, 0.35], [0.95, base + 2.0, dz + 0.2], COL.woodDark);
  kit.glow.add(new THREE.BoxGeometry(0.24, 0.32, 0.24), 0xffd27a, f.p(0.95, base + 1.8, dz + 0.36), f.r());
  // collider (yaw is a multiple of 90deg)
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const hw = (swap ? d : w) / 2 + 0.25, hd = (swap ? w : d) / 2 + 0.25;
  kit.colliders.push({ kind: 'box', minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  return new THREE.Vector3(...f.p(0, 0, dz + 0.1));
}

/** Professor Hazel's lab: larger, white walls, teal roof, round observatory tower and a sign. */
export function lab(kit: Kit, x: number, y: number, z: number, yaw: number): THREE.Vector3 {
  const f = new Frame(x, y, z, yaw);
  const b = kit.solid;
  const w = 18, d = 12, wallH = 6.2, base = 0.5;
  box(b, f, [w + 0.6, 1.3, d + 0.6], [0, base - 0.65, 0], COL.stone);
  box(b, f, [w, wallH, d], [0, base + wallH / 2, 0], COL.white);
  const top = base + wallH;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, f, [0.45, wallH + 0.1, 0.45], [sx * (w / 2), base + wallH / 2, sz * (d / 2)], 0xd9dfe2);
  box(b, f, [w + 0.2, 0.3, d + 0.2], [0, top, 0], 0x167a72);
  box(b, f, [w + 0.12, 0.2, d + 0.12], [0, base + wallH * 0.5, 0], 0xcfd8dc);
  const rise = 3.4;
  gableWalls(b, f, w, d, top, rise, COL.white);
  gableRoof(b, f, w, d, top, rise, 0.7, COL.roofTeal);
  // dormer-ish skylights on the front slope
  for (const ox of [-5, 5]) {
    box(b, f, [1.6, 0.9, 1.2], [ox, top + 1.5, 2.6], COL.white);
    box(b, f, [1.3, 0.6, 0.1], [ox, top + 1.55, 3.22], COL.glass);
    box(b, f, [1.9, 0.12, 1.5], [ox, top + 2.0, 2.6], COL.roofTeal, [-0.2, 0, 0]);
  }
  // entrance: double door, porch roof on pillars, steps
  const dz = d / 2;
  box(b, f, [3.2, 3.2, 0.2], [0, base + 1.6, dz + 0.02], 0x167a72);
  box(b, f, [1.25, 2.8, 0.12], [-0.66, base + 1.4, dz + 0.1], 0x8fd8e8);
  box(b, f, [1.25, 2.8, 0.12], [0.66, base + 1.4, dz + 0.1], 0x8fd8e8);
  box(b, f, [0.08, 2.8, 0.16], [0, base + 1.4, dz + 0.14], 0x167a72);
  box(b, f, [5.6, 0.25, 3.0], [0, base + 3.7, dz + 1.4], COL.roofTeal);
  for (const sx of [-2.5, 2.5]) cyl(b, f, 0.18, 0.18, 3.6, [sx, base + 1.8, dz + 2.6], COL.white, 10);
  box(b, f, [5.0, 0.3, 2.8], [0, base - 0.12, dz + 1.4], 0xc9c3b7);
  box(b, f, [5.0, 0.25, 0.6], [0, -0.05, dz + 3.1], COL.stone);
  // windows: two rows
  for (const ox of [-6.5, -3.5, 3.5, 6.5]) {
    windowAt(b, f, ox, base + 1.7, dz, 0, 0x1fa79a, ox === -3.5 || ox === 3.5);
    windowAt(b, f, ox, base + 4.6, dz, 0, 0x1fa79a, false);
  }
  for (const ox of [-6, -2, 2, 6]) windowAt(b, f, ox, base + 3, d / 2, Math.PI, 0x1fa79a, false);
  for (const sx of [1, -1]) for (const oz of [-3, 3]) windowAt(b, f, oz, base + 3, w / 2, sx * Math.PI / 2, 0x1fa79a, false);
  // round observatory tower at the back-left corner
  const tx = -w / 2 + 1.0, tz = -d / 2 + 1.0;
  cyl(b, f, 2.8, 2.6, 10.5, [tx, base + 5.25, tz], COL.white, 16);
  cyl(b, f, 2.95, 2.95, 0.35, [tx, base + 10.5, tz], 0x167a72, 16);
  b.add(new THREE.SphereGeometry(2.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), COL.roofTeal, f.p(tx, base + 10.6, tz), f.r());
  box(b, f, [0.9, 1.6, 0.2], [tx, base + 11.6, tz + 2.3], 0x2b3a45, [-0.6, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    if (Math.cos(a) > 0.3 && Math.sin(a) < -0.3) continue;
    box(b, f, [0.7, 1.0, 0.15], [tx + Math.sin(a) * 2.78, base + 7.8, tz + Math.cos(a) * 2.78], COL.glass, [0, a, 0]);
  }
  // weather vane / antenna
  cyl(b, f, 0.05, 0.05, 2.0, [w * 0.3, top + rise + 1.0, 0], 0x555b60, 6);
  b.add(new THREE.SphereGeometry(0.2, 8, 6), 0xff7043, f.p(w * 0.3, top + rise + 2.0, 0), f.r());
  // greenhouse annex on the right side
  const gx = w / 2 + 2.6;
  box(b, f, [5, 0.4, 7], [gx, 0.0, -1.0], COL.stone);
  box(b, f, [4.8, 2.6, 6.8], [gx, 1.5, -1.0], 0xbfe9f2);
  for (let i = -3; i <= 3; i++) box(b, f, [4.9, 0.08, 0.08], [gx, 2.8, -1.0 + i * 1.1], 0xe8eef0);
  for (let i = -2; i <= 2; i++) box(b, f, [0.08, 2.6, 6.9], [gx + i * 1.2, 1.5, -1.0], 0xe8eef0);
  b.add(prismGeometry(4.8, 1.3, 6.8), 0xd4f3f8, f.p(gx, 2.8, -1.0), f.r());
  // sign above the porch
  const tex = signTexture(["HAZEL'S LAB"], { w: 1024, h: 192, bg: '#167a72', fg: '#ffffff' });
  addSignBoard(kit.extras, f, tex, 4.6, 0.86, [0, base + 4.45, dz + 2.95], 0);
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const hw = (swap ? d : w) / 2 + 0.3, hd = (swap ? w : d) / 2 + 0.3;
  kit.colliders.push({ kind: 'box', minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  const gp = f.p(gx, 0, -1.0);
  kit.colliders.push({ kind: 'box', minX: gp[0] - 3, maxX: gp[0] + 3, minZ: gp[2] - 3.8, maxZ: gp[2] + 3.8 });
  const tp = f.p(tx, 0, tz);
  kit.colliders.push({ kind: 'circle', x: tp[0], z: tp[2], r: 3.0 });
  // porch pillars
  for (const sx of [-2.5, 2.5]) {
    const pp = f.p(sx, 0, dz + 2.6);
    kit.colliders.push({ kind: 'circle', x: pp[0], z: pp[2], r: 0.25 });
  }
  return new THREE.Vector3(...f.p(0, 0, dz + 0.1));
}

/** Text board (double sided) as its own mesh. */
export function addSignBoard(group: THREE.Group, f: Frame, tex: THREE.Texture, w: number, h: number, at: V3, ry: number): void {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const geo = new THREE.PlaneGeometry(w, h);
  for (const back of [0, Math.PI]) {
    const m = new THREE.Mesh(geo, mat);
    const p = f.p(at[0], at[1], at[2]);
    m.position.set(p[0], p[1], p[2]);
    m.rotation.y = f.yaw + ry + back;
    m.translateZ(0.07);
    m.castShadow = false;
    group.add(m);
  }
}

export function signpost(kit: Kit, x: number, y: number, z: number, yaw: number, lines: string[][], arrowYaws: number[]): void {
  const f = new Frame(x, y, z, yaw);
  cyl(kit.solid, f, 0.12, 0.1, 2.6, [0, 1.3, 0], COL.woodDark, 6);
  box(kit.solid, f, [0.3, 0.2, 0.3], [0, 2.65, 0], COL.wood);
  lines.forEach((ln, i) => {
    const ay = arrowYaws[i] ?? 0;
    const af = new Frame(x, y, z, yaw + ay);
    const by = 2.25 - i * 0.55;
    box(kit.solid, af, [0.12, 0.42, 1.5], [0, by, 0.7], COL.wood);
    kit.solid.add(prismGeometry(0.42, 0.3, 0.12), COL.wood, af.p(0, by - 0.21, 1.45), af.r(Math.PI / 2, 0, 0));
    const tex = signTexture(ln, { w: 512, h: 144 });
    addSignBoard(kit.extras, new Frame(x, y, z, yaw + ay - Math.PI / 2), tex, 1.4, 0.38, [0.69, by, 0], 0);
  });
  kit.colliders.push({ kind: 'circle', x, z, r: 0.25 });
}

export function lantern(kit: Kit, x: number, y: number, z: number, yaw: number): void {
  const f = new Frame(x, y, z, yaw);
  cyl(kit.solid, f, 0.1, 0.08, 2.6, [0, 1.3, 0], COL.woodDark, 6);
  box(kit.solid, f, [0.08, 0.08, 0.7], [0, 2.55, 0.3], COL.woodDark);
  box(kit.solid, f, [0.42, 0.08, 0.42], [0, 2.4, 0.6], COL.woodDark);
  kit.glow.add(new THREE.BoxGeometry(0.3, 0.4, 0.3), 0xffd27a, f.p(0, 2.15, 0.6), f.r());
  box(kit.solid, f, [0.36, 0.06, 0.36], [0, 1.93, 0.6], COL.woodDark);
  kit.colliders.push({ kind: 'circle', x, z, r: 0.2 });
}

export function crate(kit: Kit, x: number, y: number, z: number, yaw: number, s = 1): void {
  const f = new Frame(x, y, z, yaw);
  box(kit.solid, f, [s, s, s], [0, s / 2, 0], COL.woodLight);
  for (const sz of [1, -1]) {
    box(kit.solid, f, [s * 1.02, s * 0.12, 0.04], [0, s * 0.12, sz * s * 0.5], COL.wood);
    box(kit.solid, f, [s * 1.02, s * 0.12, 0.04], [0, s * 0.88, sz * s * 0.5], COL.wood);
    box(kit.solid, f, [s * 1.2, s * 0.1, 0.04], [0, s / 2, sz * s * 0.5], COL.wood, [0, 0, Math.PI / 4]);
  }
}

export function barrel(kit: Kit, x: number, y: number, z: number): void {
  const f = new Frame(x, y, z, 0);
  cyl(kit.solid, f, 0.38, 0.38, 1.0, [0, 0.5, 0], COL.woodLight, 10);
  cyl(kit.solid, f, 0.42, 0.42, 0.6, [0, 0.5, 0], COL.wood, 10);
  cyl(kit.solid, f, 0.4, 0.4, 0.08, [0, 0.12, 0], 0x555048, 10);
  cyl(kit.solid, f, 0.4, 0.4, 0.08, [0, 0.88, 0], 0x555048, 10);
  kit.colliders.push({ kind: 'circle', x, z, r: 0.45 });
}

export function well(kit: Kit, x: number, y: number, z: number): void {
  const f = new Frame(x, y, z, 0.3);
  const b = kit.solid;
  // stone ring made of blocks
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (let r = 0; r < 3; r++) {
      const aa = a + (r % 2) * (Math.PI / n);
      box(b, new Frame(x, y, z, aa), [0.75, 0.32, 0.4], [0, 0.16 + r * 0.32, 1.35], (i + r) % 3 ? COL.stone : 0xb5ae9f);
    }
  }
  cyl(b, f, 1.2, 1.2, 0.1, [0, 0.62, 0], 0x2f6f9a, 14);
  for (const sx of [-1.25, 1.25]) box(b, f, [0.22, 2.4, 0.22], [sx, 1.4, 0], COL.woodDark);
  gableRoof(b, f, 2.6, 2.4, 2.5, 0.9, 0.3, COL.roofRed);
  cyl(b, f, 0.06, 0.06, 2.6, [0, 1.95, 0], COL.woodDark, 6, [0, 0, Math.PI / 2]);
  cyl(b, f, 0.22, 0.18, 0.35, [0.3, 1.25, 0], COL.wood, 8);
  kit.colliders.push({ kind: 'circle', x, z, r: 1.75 });
}

export function bench(kit: Kit, x: number, y: number, z: number, yaw: number): void {
  const f = new Frame(x, y, z, yaw);
  box(kit.solid, f, [1.8, 0.1, 0.5], [0, 0.48, 0], COL.woodLight);
  box(kit.solid, f, [1.8, 0.4, 0.08], [0, 0.78, -0.24], COL.woodLight, [-0.15, 0, 0]);
  for (const sx of [-0.75, 0.75]) box(kit.solid, f, [0.1, 0.48, 0.45], [sx, 0.24, 0], COL.woodDark);
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const hw = swap ? 0.3 : 0.95, hd = swap ? 0.95 : 0.3;
  kit.colliders.push({ kind: 'box', minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
}

/** Raised vegetable bed. */
export function garden(kit: Kit, x: number, y: number, z: number, yaw: number, w: number, d: number, rnd: () => number): void {
  const f = new Frame(x, y, z, yaw);
  box(kit.solid, f, [w, 0.35, d], [0, 0.12, 0], COL.soil);
  for (const sz of [-1, 1]) box(kit.solid, f, [w + 0.2, 0.4, 0.12], [0, 0.15, sz * d / 2], COL.wood);
  for (const sx of [-1, 1]) box(kit.solid, f, [0.12, 0.4, d + 0.2], [sx * w / 2, 0.15, 0], COL.wood);
  const rows = Math.max(2, Math.floor(d / 0.9));
  for (let r = 0; r < rows; r++) {
    const lz = -d / 2 + (r + 0.5) * (d / rows);
    const kind = r % 3;
    for (let lx = -w / 2 + 0.45; lx < w / 2 - 0.3; lx += 0.6) {
      if (kind === 0) kit.solid.add(new THREE.IcosahedronGeometry(0.24, 1), rnd() < 0.5 ? 0x7cc04a : 0x9fd26a, f.p(lx, 0.45, lz), f.r(), [1, 0.75, 1]);
      else if (kind === 1) {
        kit.solid.add(new THREE.ConeGeometry(0.12, 0.45, 5), 0x4f9e2c, f.p(lx, 0.55, lz), f.r());
        kit.solid.add(new THREE.ConeGeometry(0.06, 0.12, 5), 0xf08a24, f.p(lx, 0.33, lz), f.r(Math.PI, 0, 0));
      } else {
        kit.solid.add(new THREE.IcosahedronGeometry(0.2, 0), 0x3d8a2a, f.p(lx, 0.45, lz), f.r());
        kit.solid.add(new THREE.SphereGeometry(0.08, 6, 4), 0xe0352b, f.p(lx + 0.1, 0.52, lz + 0.08), f.r());
      }
    }
  }
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const hw = (swap ? d : w) / 2 + 0.1, hd = (swap ? w : d) / 2 + 0.1;
  kit.colliders.push({ kind: 'box', minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
}

/** Stone-bordered flower bed. Returns flower spots for instancing. */
export function flowerBed(kit: Kit, x: number, y: number, z: number, w: number, d: number, rnd: () => number): [number, number, number][] {
  const f = new Frame(x, y, z, 0);
  box(kit.solid, f, [w, 0.22, d], [0, 0.08, 0], COL.soil);
  const per = 2 * (w + d);
  const n = Math.floor(per / 0.5);
  for (let i = 0; i < n; i++) {
    let t = (i / n) * per;
    let lx: number, lz: number;
    if (t < w) { lx = -w / 2 + t; lz = -d / 2; } else if ((t -= w) < d) { lx = w / 2; lz = -d / 2 + t; } else if ((t -= d) < w) { lx = w / 2 - t; lz = d / 2; } else { t -= w; lx = -w / 2; lz = d / 2 - t; }
    kit.solid.add(new THREE.DodecahedronGeometry(0.2, 0), i % 2 ? COL.stone : 0xb8b1a3, f.p(lx, 0.14, lz), [rnd(), rnd(), rnd()], [1, 0.7, 1]);
  }
  const spots: [number, number, number][] = [];
  for (let lx = -w / 2 + 0.3; lx < w / 2 - 0.2; lx += 0.32) for (let lz = -d / 2 + 0.3; lz < d / 2 - 0.2; lz += 0.32) spots.push([x + lx + (rnd() - 0.5) * 0.15, y + 0.15, z + lz + (rnd() - 0.5) * 0.15]);
  return spots;
}

/** Wooden fence segment between two posts (world coords). */
export function fenceSegment(kit: Kit, ax: number, az: number, bx: number, bz: number, y: number, post = true): void {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const f = new Frame((ax + bx) / 2, y, (az + bz) / 2, yaw);
  for (const ry of [0.45, 0.9]) box(kit.solid, f, [0.08, 0.12, len + 0.1], [0, ry, 0], COL.woodLight);
  if (post) {
    const pf = new Frame(ax, y, az, yaw);
    box(kit.solid, pf, [0.18, 1.25, 0.18], [0, 0.55, 0], COL.wood);
    box(kit.solid, pf, [0.22, 0.08, 0.22], [0, 1.2, 0], COL.woodDark);
  }
}

/** Tent + campfire + logs. Returns the fire position (for flicker). */
export function campsite(kit: Kit, x: number, y: number, z: number, yaw: number, heightAt: (x: number, z: number) => number): THREE.Vector3 {
  const f = new Frame(x, y, z, yaw);
  const b = kit.solid;
  // tent
  const tf = new Frame(...f.p(0, 0, -3.5), yaw);
  b.add(prismGeometry(3.2, 2.2, 3.4), COL.cloth, tf.p(0, 0, 0), tf.r());
  b.add(prismGeometry(1.2, 1.3, 0.05), 0x5a2a1e, tf.p(0, 0, 1.72), tf.r());
  box(b, tf, [0.1, 2.4, 0.1], [0, 1.1, 1.8], COL.woodDark);
  kit.colliders.push({ kind: 'circle', x: tf.x, z: tf.z, r: 1.8 });
  // fire ring
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    b.add(new THREE.DodecahedronGeometry(0.22, 0), COL.stoneDark, f.p(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75), [a, a * 2, 0]);
  }
  for (let i = 0; i < 4; i++) box(b, f, [0.14, 0.14, 1.0], [0, 0.2, 0], 0x4a2e18, [0.5, (i / 4) * Math.PI, 0]);
  // logs to sit on
  for (const [lx, lz, ry] of [[2.2, 0.4, 0.2], [-2.0, 0.8, -0.3], [0.3, 2.3, 1.5]] as [number, number, number][]) {
    const p = f.p(lx, 0, lz);
    cyl(b, new Frame(p[0], heightAt(p[0], p[2]), p[2], yaw + ry), 0.28, 0.28, 1.8, [0, 0.28, 0], COL.wood, 8, [0, 0, Math.PI / 2]);
    kit.colliders.push({ kind: 'circle', x: p[0], z: p[2], r: 0.5 });
  }
  // backpack + crate
  crate(kit, ...f.p(2.6, 0, -2.6), yaw + 0.3, 0.8);
  return new THREE.Vector3(x, y, z);
}

/**
 * The village workbench: a heavy plank bench with a vice, a mallet and a few half-made Poke
 * Balls, apricorn halves and copper on it. Returns where to stand to use it (in front).
 */
export function workbench(kit: Kit, x: number, y: number, z: number, yaw: number): THREE.Vector3 {
  const f = new Frame(x, y, z, yaw), b = kit.solid;
  // Top and legs, with a lower shelf.
  box(b, f, [1.9, 0.1, 0.85], [0, 0.92, 0], COL.woodLight);
  box(b, f, [1.94, 0.06, 0.06], [0, 0.88, 0.42], COL.woodDark);
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.34, 0.34]) box(b, f, [0.11, 0.88, 0.11], [sx, 0.44, sz], COL.wood);
  box(b, f, [1.8, 0.05, 0.7], [0, 0.22, 0], COL.wood);
  for (const sx of [-0.85, 0.85]) box(b, f, [0.07, 0.07, 0.72], [sx, 0.62, 0], COL.woodDark);
  // Vice on the left end.
  box(b, f, [0.22, 0.16, 0.3], [-0.78, 1.05, 0.28], 0x5a5853);
  box(b, f, [0.05, 0.05, 0.3], [-0.78, 1.05, 0.5], 0x77746c, [Math.PI / 2, 0, 0]);
  // Mallet and a coil of fibre cord.
  box(b, f, [0.08, 0.08, 0.32], [0.55, 1.02, 0.1], 0x8a6a45, [0, 0.4, 0]);
  box(b, f, [0.16, 0.12, 0.12], [0.62, 1.03, -0.05], COL.woodDark, [0, 0.4, 0]);
  b.add(new THREE.TorusGeometry(0.1, 0.03, 6, 14), 0xc9b98a, f.p(0.25, 0.99, -0.22), [Math.PI / 2, 0, 0]);
  // Ball shells in progress: red apricorn halves, a finished ball, copper clasps.
  for (const [lx, lz, top] of [[-0.2, 0.05, true], [0, -0.15, false], [-0.38, -0.2, true]] as [number, number, boolean][]) {
    b.add(new THREE.SphereGeometry(0.09, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), top ? 0xb83a2c : 0xefe9de, f.p(lx, 0.97, lz), [top ? 0 : Math.PI, 0, 0]);
  }
  b.add(new THREE.SphereGeometry(0.09, 12, 8), 0xc0392b, f.p(0.12, 1.06, 0.12));
  for (let i = 0; i < 3; i++) b.add(new THREE.DodecahedronGeometry(0.045, 0), 0xc87533, f.p(0.36 + i * 0.07, 0.99, 0.24 - i * 0.05));
  // A basket of apricorns and a log on the shelf.
  cyl(b, f, 0.2, 0.24, 0.2, [-0.45, 0.35, 0], 0x9a7448, 10);
  for (let i = 0; i < 4; i++) b.add(new THREE.SphereGeometry(0.075, 8, 6), 0xb83a2c, f.p(-0.5 + (i % 2) * 0.1, 0.47, -0.05 + Math.floor(i / 2) * 0.1));
  cyl(b, f, 0.13, 0.13, 0.9, [0.4, 0.33, 0], COL.wood, 8, [0, 0, Math.PI / 2]);
  const c = f.p(0, 0, 0);
  kit.colliders.push({ kind: 'obox', x: c[0], z: c[2], hw: 0.98, hd: 0.45, yaw, maxY: y + 0.97 });
  const stand = f.p(0, 0, 1.05);
  return new THREE.Vector3(stand[0], y, stand[2]);
}

/** Simple open wooden cart. */
export function cart(kit: Kit, x: number, y: number, z: number, yaw: number): void {
  const f = new Frame(x, y, z, yaw);
  box(kit.solid, f, [1.6, 0.15, 2.6], [0, 0.85, 0], COL.woodLight);
  for (const sx of [-0.8, 0.8]) box(kit.solid, f, [0.08, 0.5, 2.6], [sx, 1.1, 0], COL.wood);
  for (const sz of [-1.3, 1.3]) box(kit.solid, f, [1.6, 0.5, 0.08], [0, 1.1, sz], COL.wood);
  for (const sx of [-0.9, 0.9]) cyl(kit.solid, f, 0.55, 0.55, 0.1, [sx, 0.55, -0.3], COL.woodDark, 12, [0, 0, Math.PI / 2]);
  box(kit.solid, f, [0.1, 0.1, 1.8], [0.3, 0.8, 2.1], COL.wood);
  box(kit.solid, f, [0.1, 0.1, 1.8], [-0.3, 0.8, 2.1], COL.wood);
  for (let i = 0; i < 5; i++) kit.solid.add(new THREE.IcosahedronGeometry(0.28, 0), [0xe8b04a, 0xd84a3a, 0x8fbf4a][i % 3], f.p(-0.4 + (i % 3) * 0.4, 1.15, -0.6 + Math.floor(i / 3) * 0.6), f.r());
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const hw = swap ? 1.4 : 1.0, hd = swap ? 1.0 : 1.4;
  kit.colliders.push({ kind: 'box', minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
}

/** A substantial two-storey street shop with shaded timber porch and an illustrated sign. */
export function streetHouse(kit:Kit,x:number,y:number,z:number,yaw:number,label:string,roof:number):void {
  cottage(kit,x,y,z,yaw,{w:10,d:7,wallH:5.4,roof,shutter:0x4b625b,wall:0xd9cfb8,floors:2,chimney:false});
  const f=new Frame(x,y,z,yaw),b=kit.solid;
  // Wide overhanging porch, lattice upper windows, wood decking and exposed rafters.
  box(b,f,[10.4,.16,2.3],[0,2.85,4.45],roof,[-.12,0,0]);
  for(const sx of [-4.4,4.4]){
    box(b,f,[.16,2.75,.16],[sx,1.42,5.1],COL.woodDark);
    const p=f.p(sx,0,5.1);kit.colliders.push({kind:'circle',x:p[0],z:p[2],r:.14});
  }
  for(let sx=-4.3;sx<=4.4;sx+=.6)box(b,f,[.065,.13,2.1],[sx,2.7,4.3],COL.woodDark);
  for(let sx=-4.4;sx<=4.4;sx+=.3)box(b,f,[.28,.09,1.8],[sx,.065,4.35],sx%1<.5?COL.woodLight:COL.wood);
  for(const window of [-3,0,3])for(let sx=-.48;sx<=.5;sx+=.24)box(b,f,[.045,1,.15],[window+sx,4.68,3.68],COL.woodDark);
  box(b,f,[3.4,.75,.12],[0,3.55,3.64],COL.woodDark);
  addSignBoard(kit.extras,f,signTexture([label],{w:768,h:160,bg:'#dfdac7',fg:'#3b4b4a',font:'bold 48px Georgia'}),3.2,.62,[0,3.55,3.73],0);
  // Cloth doorway curtains and brackets for lanterns.
  for(const sx of [-.36,.36])box(b,f,[.67,.8,.035],[sx,2.05,3.75],0x38566c);
  for(const sx of [-3.8,3.8]){box(b,f,[.06,.35,.3],[sx,2.25,3.95],COL.woodDark);cyl(b,f,.15,.15,.44,[sx,2.05,4.1],0xe8dab3,12);}
}

export function marketStall(kit:Kit,x:number,y:number,z:number,yaw:number,color:number):void {
  const f=new Frame(x,y,z,yaw),b=kit.solid;
  for(const sx of [-1.8,1.8])for(const sz of [-1.1,1.1])box(b,f,[.11,2.4,.11],[sx,1.2,sz],COL.woodDark);
  for(let i=0;i<8;i++)box(b,f,[.48,.05,2.9],[-1.68+i*.48,2.47,0],i%2?0xe8dfc7:color,[-.13,0,0]);
  box(b,f,[3.5,.14,1.3],[0,1.05,.4],COL.woodLight);box(b,f,[3.5,.85,.08],[0,.57,1.03],COL.wood);
  for(let i=0;i<12;i++){const cx=-1.4+(i%6)*.52,cz=Math.floor(i/6)*.5+.15;b.add(new THREE.IcosahedronGeometry(.17,1),[0xb7583d,0xdab453,0x82934b][i%3],f.p(cx,1.26,cz),f.r());}
  kit.colliders.push({kind:'box',minX:x-1.8,maxX:x+1.8,minZ:z-.75,maxZ:z+1.1});
}
