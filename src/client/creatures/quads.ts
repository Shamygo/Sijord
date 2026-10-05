import * as THREE from 'three';
import { smoothstep } from '../player/anim-math';
import { bushyTail, collarRuff, fluffBib, legGrad, mane, quadBuilt, shortTail, torsoPaint, type Built } from './defs';
import { along, blob, cone, ellipsoid, facing, heartLeaf, layered, leaf, maxOf, mul, paint, solid, spots, sweep, symX, type Mask, type Paint, type V3 } from './geo';
import { mamHead } from './heads';
import type { Kit, MatKind } from './kit';
import { addTufts, blobPart, type JiggleSpec } from './parts';
import type { LegPaint, QuadDef } from './quadruped';

/**
 * The four-legged species: the Fire line (cats), the Grass line (deer), the herding dogs, the
 * rodents and the rabbits. Each is authored in roughly real metres on the quadruped body plan.
 */

// ---------------------------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------------------------

const _up = new THREE.Vector3(0, 1, 0);

/** Orient a freshly added mesh so its +Y points along `dir`, with an optional twist about it. */
function aim(m: THREE.Object3D, dir: V3, twist = 0): void {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  m.quaternion.setFromUnitVectors(_up, d);
  if (twist) m.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(_up, twist));
}

/** A small low-poly leaf pointing along `dir`. */
function smallLeaf(k: Kit, bone: THREE.Object3D, w: number, len: number, pos: V3, dir: V3, p: Paint, twist = 0): void {
  const g = leaf(w, len, Math.max(0.0015, w * 0.1), 0.25, 0.45, 6, 6);
  paint(g, p);
  const m = k.add(g, 'leaf', bone, { pos });
  aim(m, dir, twist);
}

/** A mirrored pair of branching antlers on the head. Returns the tine tips per side. */
interface AntlerOpts {
  root: V3;
  beam: V3[];
  r: [number, number];
  tines: { u: number; dir: V3; len: number; r: number }[];
  paint: Paint;
  kind?: MatKind;
  radial?: number;
  /** Decorations per side: `at(u)` is a point on the beam, `tips` the tine and beam tips. */
  deco?: (bone: THREE.Bone, side: number, at: (u: number) => V3, tips: V3[], tineBase: V3[]) => void;
}

function antlers(k: Kit, head: THREE.Bone, o: AntlerOpts): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  for (const side of [1, -1]) {
    const b = k.bone(head, side > 0 ? 'antlerL' : 'antlerR', side * o.root[0], o.root[1], o.root[2]);
    const pts = o.beam.map((p) => [side * p[0], p[1], p[2]] as V3);
    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false,
      'centripetal',
    );
    const at = (u: number): V3 => {
      const v = curve.getPointAt(Math.min(1, Math.max(0, u)));
      return [v.x, v.y, v.z];
    };
    const beam = sweep(pts, [
      [0, o.r[0]],
      [1, o.r[1]],
    ], { radial: o.radial ?? 7, segs: 8, capRings: 2, cap1: 1.2 });
    paint(beam, o.paint);
    k.add(beam, o.kind ?? 'fur', b);
    const tips: V3[] = [at(1)];
    const bases: V3[] = [];
    for (const t of o.tines) {
      const s = at(t.u);
      const d: V3 = [side * t.dir[0], t.dir[1], t.dir[2]];
      const dl = Math.hypot(d[0], d[1], d[2]);
      const e: V3 = [s[0] + (d[0] / dl) * t.len, s[1] + (d[1] / dl) * t.len, s[2] + (d[2] / dl) * t.len];
      const m: V3 = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2 + t.len * 0.12, (s[2] + e[2]) / 2];
      const g = sweep([s, m, e], [
        [0, t.r],
        [1, t.r * 0.4],
      ], { radial: (o.radial ?? 7) - 1, segs: 5, capRings: 2, cap1: 1.2 });
      paint(g, o.paint);
      k.add(g, o.kind ?? 'fur', b);
      tips.push(e);
      bases.push(s);
    }
    o.deco?.(b, side, at, tips, bases);
    bones.push(b);
  }
  return bones;
}

/** Hoof-style leg paint: coat down to `to`, then a darker hoof. */
function hoofLegs(coat: string, lower: string, hoof: string, from = 0.4, to = 0.8): LegPaint {
  return legGrad(coat, lower, from, to, hoof, 0.94);
}

// ---------------------------------------------------------------------------------------------
// Fire line: Cindlet -> Pyrolynx -> Forgelynx
// ---------------------------------------------------------------------------------------------

const CINDLET = {
  fur: '#f2782a',
  furDeep: '#d65a1e',
  cream: '#fde8c8',
  dark: '#4a2a22',
  nose: '#4b2328',
  inner: '#ffd0bb',
};

export function cindlet(k: Kit): Built {
  const P = CINDLET;
  const def: QuadDef = {
    gait: 'cat',
    bodyY: 0.19,
    hipZ: -0.07,
    shoulderZ: 0.07,
    torso: [
      { t: -0.125, w: 0.054, h: 0.054, hb: 0.048, c: 0.012 },
      { t: -0.085, w: 0.071, h: 0.069, hb: 0.061, c: 0.01 },
      { t: -0.02, w: 0.07, h: 0.066, hb: 0.066, c: 0.002 },
      { t: 0.045, w: 0.076, h: 0.072, hb: 0.076, c: 0.004 },
      { t: 0.095, w: 0.069, h: 0.069, hb: 0.069, c: 0.016 },
      { t: 0.125, w: 0.052, h: 0.052, hb: 0.052, c: 0.03 },
    ],
    torsoPaint: torsoPaint(P.fur, P.cream, { back: P.furDeep, backK: 0.4, bellyY: 0.005, soft: 0.04 }),
    hind: { x: 0.043, y: -0.005, z: -0.005, lens: [0.07, 0.065, 0.045], radii: [0.046, 0.027, 0.02, 0.018], pawH: 0.017, a0: 0.3, bulge: 0.2, paw: { len: 0.028, w: 0.024, h: 0.017 } },
    fore: { x: 0.041, y: -0.015, z: 0.005, lens: [0.07, 0.065, 0.03], radii: [0.039, 0.025, 0.02, 0.018], pawH: 0.017, a0: 0.12, footZ: 0.004, paw: { len: 0.027, w: 0.024, h: 0.017 } },
    legPaint: () => legGrad(P.fur, P.furDeep, 0.25, 0.7, P.cream, 0.86),
    neck: { pos: [0, 0.035, 0.045], len: 0.05, pitch: 0.45, r0: 0.056, r1: 0.05, paint: layered(P.fur, { color: P.cream, mask: facing(0, 0, 1, -0.1, 0.5) }) },
    head: mamHead({
      R: 0.1,
      fur: P.fur,
      cream: P.cream,
      nose: P.nose,
      inner: P.inner,
      iris: '#b0561a',
      eye: { size: 0.27 },
      ruff: 0.75,
      ear: { len: 1.05, w: 0.48, out: 0.32, back: 0.1, tip: P.dark, tipLen: 0.2 },
      emberTufts: ['#ff4a10', '#ff9a24', '#ffe68a'],
    }),
    // The reference fox's tail is a huge cream-tipped plume, nearly as big as the body.
    tail: bushyTail([0, 0.03, -0.052], 0.27, 0.092, P.fur, P.cream, 0.56, 0.72),
    extras: (kk, r) => fluffBib(kk, r.chest, [0, 0.035, 0.035], 0.058, P.cream, '#f0cfa0'),
    headUp: 0.05,
  };
  return quadBuilt(k, def, ['tilt', 'look', 'sniff', 'flick', 'stretch', 'swish', 'yawn', 'tilt']);
}

export function pyrolynx(k: Kit): Built {
  const fur = '#e8581c';
  const deep = '#b83a14';
  const cream = '#fbe2c2';
  const coal = '#231a1c';
  const stripes: Mask = (p, n) => {
    // Faint dark tiger bands across the back.
    const band = Math.pow(Math.max(0, Math.sin(p.z * 34 + 0.6)), 6);
    return band * smoothstep(0.1, 0.6, n.y) * 0.75;
  };
  const def: QuadDef = {
    gait: 'cat',
    bodyY: 0.415,
    hipZ: -0.17,
    shoulderZ: 0.17,
    torso: [
      { t: -0.29, w: 0.1, h: 0.1, hb: 0.09, c: 0.02 },
      { t: -0.2, w: 0.125, h: 0.12, hb: 0.11, c: 0.012 },
      { t: -0.05, w: 0.12, h: 0.112, hb: 0.1, c: 0.0 },
      { t: 0.1, w: 0.13, h: 0.12, hb: 0.13, c: 0.004 },
      { t: 0.22, w: 0.125, h: 0.12, hb: 0.12, c: 0.02 },
      { t: 0.29, w: 0.095, h: 0.095, hb: 0.095, c: 0.04 },
    ],
    torsoPaint: torsoPaint(fur, cream, { back: deep, backK: 0.5, soft: 0.07, extra: [{ color: '#7a1e0c', mask: stripes }] }),
    hind: { x: 0.085, y: -0.01, z: -0.01, lens: [0.15, 0.145, 0.105], radii: [0.097, 0.057, 0.041, 0.037], pawH: 0.036, a0: 0.32, bulge: 0.2, paw: { len: 0.072, w: 0.056, h: 0.037 } },
    fore: { x: 0.08, y: -0.03, z: 0.01, lens: [0.15, 0.15, 0.065], radii: [0.087, 0.055, 0.041, 0.039], pawH: 0.036, a0: 0.1, footZ: 0.008, paw: { len: 0.072, w: 0.058, h: 0.037 } },
    legPaint: () => legGrad(fur, deep, 0.25, 0.6, coal, 0.72),
    neck: { pos: [0, 0.07, 0.11], len: 0.12, pitch: 0.55, r0: 0.105, r1: 0.09, paint: layered(fur, { color: cream, mask: facing(0, -0.2, 1, 0, 0.6) }) },
    head: mamHead({
      R: 0.145,
      fur,
      cream,
      nose: '#3a1a1c',
      inner: '#ffc0a0',
      iris: '#ffb020',
      skull: [1.02, 0.86, 0.95],
      snout: 0.18,
      snoutW: 0.95,
      snoutH: 0.85,
      snoutDrop: 0.05,
      eye: { size: 0.22, yaw: 0.46, pitch: 0.0, tall: 1.05 },
      ruff: 1.15,
      ear: { len: 1.1, w: 0.44, out: 0.28, back: 0.15, tip: coal, tipLen: 0.25 },
      emberTufts: ['#ff3a0a', '#ff9a24', '#ffe68a'],
      marks: '#7a1e0c',
    }),
    tail: (kk, pelvis) => {
      const t = bushyTail([0, 0.06, -0.27], 0.2, 0.05, fur, coal, 0.6, 0.6, 1, 2)(kk, pelvis);
      // Flame at the tip of the bob tail.
      const fb = kk.bone(t.bones[t.bones.length - 1], 'flame', 0, 0.05, -0.06);
      const flame = layered('#ff3a0a', { color: '#ff9a24', mask: along('y', 0.0, 0.06) }, { color: '#ffe68a', mask: along('y', 0.07, 0.13) });
      for (const [dx, h, rr, tilt] of [
        [0, 0.15, 0.04, -0.5],
        [0.025, 0.1, 0.03, 0],
        [-0.025, 0.1, 0.03, -0.9],
      ] as const) {
        const g = tuftG(rr, h);
        paint(g, flame);
        kk.add(g, 'glow', fb, { pos: [dx, 0, 0], rot: [tilt, 0, 0] });
      }
      return t;
    },
    extras: (kk, r) => {
      collarRuff(kk, r.chest, [0, 0.07, 0.07], 0.09, cream);
      return { glow: [] };
    },
    headUp: 0.04,
    curiosity: 0.8,
  };
  const b = quadBuilt(k, def, ['look', 'tilt', 'stretch', 'swish', 'yawn', 'flick', 'sniff']);
  return b;
}

/** Teardrop tuft geometry (flame licks, fur tufts). */
function tuftG(r: number, len: number, curl = 0): THREE.BufferGeometry {
  return sweep(
    [
      [0, 0, 0],
      [0, len * 0.45, curl * 0.25],
      [0, len, curl],
    ],
    [
      [0, r * 0.85],
      [0.28, r],
      [0.58, r * 0.72],
      [0.86, r * 0.3],
      [1, r * 0.05],
    ],
    { radial: 6, segs: 6, cap0: 1, cap1: 0.4, up: [0, 0, 1], capRings: 2 },
  );
}

export function forgelynx(k: Kit): Built {
  const fur = '#4a2a24';
  const ember = '#b2401c';
  const cream = '#e8c9a8';
  const steel = '#7c8794';
  const steelDark = '#4b535e';
  const seam = layered('#ff5a10', { color: '#ffd27a', mask: facing(0, 1, 0, 0, 1), k: 0.6 });
  const plate = layered(steel, { color: steelDark, mask: facing(0, -1, 0, -0.3, 0.6), k: 0.8 }, { color: '#c9d2dc', mask: facing(0.3, 1, 0.3, 0.6, 1), k: 0.5 });
  const def: QuadDef = {
    gait: 'cat',
    bodyY: 0.68,
    hipZ: -0.26,
    shoulderZ: 0.27,
    torso: [
      { t: -0.43, w: 0.15, h: 0.15, hb: 0.13, c: 0.03 },
      { t: -0.3, w: 0.19, h: 0.18, hb: 0.16, c: 0.02 },
      { t: -0.08, w: 0.18, h: 0.17, hb: 0.15, c: 0.0 },
      { t: 0.15, w: 0.21, h: 0.2, hb: 0.2, c: 0.01 },
      { t: 0.33, w: 0.2, h: 0.19, hb: 0.19, c: 0.03 },
      { t: 0.44, w: 0.15, h: 0.15, hb: 0.15, c: 0.06 },
    ],
    torsoPaint: torsoPaint(fur, ember, { soft: 0.1, bellyY: -0.02 }),
    hind: { x: 0.125, y: -0.015, z: -0.02, lens: [0.25, 0.24, 0.17], radii: [0.135, 0.078, 0.058, 0.052], pawH: 0.05, a0: 0.32, bulge: 0.25, paw: { len: 0.1, w: 0.078, h: 0.05 } },
    fore: { x: 0.12, y: -0.04, z: 0.01, lens: [0.25, 0.25, 0.11], radii: [0.125, 0.075, 0.058, 0.055], pawH: 0.05, a0: 0.1, footZ: 0.01, paw: { len: 0.1, w: 0.08, h: 0.05 } },
    legPaint: () => legGrad(fur, '#2a1a18', 0.3, 0.75, steelDark, 0.86),
    neck: { pos: [0, 0.1, 0.17], len: 0.17, pitch: 0.6, r0: 0.17, r1: 0.14, paint: layered(fur, { color: ember, mask: facing(0, -0.4, 1, 0, 0.6) }) },
    head: mamHead({
      R: 0.2,
      fur,
      cream,
      nose: '#1a1214',
      inner: '#ff9a5a',
      iris: '#ffcf3a',
      skull: [1.12, 0.84, 0.95],
      face: 'lower',
      snout: 0.14,
      snoutW: 1.05,
      snoutH: 0.88,
      snoutDrop: 0.04,
      cheeks: 1.15,
      eye: { size: 0.2, yaw: 0.48, pitch: 0.04, tall: 0.9, rim: '#120a0a' },
      ruff: 1.35,
      ruffColor: ember,
      ear: { len: 1.0, w: 0.42, out: 0.3, back: 0.2, tip: steelDark, tipLen: 0.35 },
      emberTufts: ['#ff3a0a', '#ff9a24', '#ffe68a'],
      extra: (kk, head, c, R) => {
        // Forehead plate with a glowing seam.
        const g = ellipsoid(0.55 * R, 0.2 * R, 0.6 * R, 'sm');
        paint(g, plate);
        kk.add(g, 'metal', head, { pos: [0, c[1] + 0.72 * R, c[2] + 0.25 * R], rot: [0.35, 0, 0] });
        const sg = sweep([[-0.32 * R, 0, 0], [0, 0.03 * R, 0.08 * R], [0.32 * R, 0, 0]], 0.035 * R, { radial: 5, segs: 6, capRings: 2 });
        paint(sg, seam);
        kk.add(sg, 'glow', head, { pos: [0, c[1] + 0.66 * R, c[2] + 0.72 * R], rot: [0.5, 0, 0] });
      },
    }),
    tail: (kk, pelvis) => {
      const t = bushyTail([0, 0.08, -0.4], 0.62, 0.075, fur, '#2a1a18', 0.8, 0.45, 1, 4)(kk, pelvis);
      // Steel rings with glowing gaps along the tail.
      t.bones.forEach((b, i) => {
        if (i === 0) return;
        const g = ellipsoid(0.085, 0.085, 0.05, 'sm');
        paint(g, plate);
        kk.add(g, 'metal', b, { pos: [0, 0, 0] });
      });
      const fb = kk.bone(t.bones[t.bones.length - 1], 'flame', 0, 0.08, -0.12);
      const flame = layered('#ff3a0a', { color: '#ff9a24', mask: along('y', 0.0, 0.1) }, { color: '#ffe68a', mask: along('y', 0.12, 0.22) });
      for (const [dx, h, rr, tilt] of [
        [0, 0.25, 0.06, -0.6],
        [0.04, 0.17, 0.045, -0.1],
        [-0.04, 0.17, 0.045, -1.0],
      ] as const) {
        const g = tuftG(rr, h);
        paint(g, flame);
        kk.add(g, 'glow', fb, { pos: [dx, 0, 0], rot: [tilt, 0, 0] });
      }
      return t;
    },
    extras: (kk, r) => {
      const glow: THREE.Bone[] = [];
      // Armour: shoulder pauldrons, a saddle of back plates and haunch plates, with glowing seams.
      // Plates are thin curved shells lying on the body; seams glow between them.
      const shell = (rx: number, rz: number, th: number): THREE.BufferGeometry => {
        const g = ellipsoid(rx, th, rz, 'sm');
        // Curve the shell over the body.
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const z = pos.getZ(i);
          pos.setY(i, pos.getY(i) - (x * x) / (rx * 1.6) - (z * z) / (rz * 4));
        }
        g.computeVertexNormals();
        paint(g, plate);
        return g;
      };
      for (const side of [1, -1]) {
        kk.add(shell(0.14, 0.16, 0.035), 'metal', r.chest, { pos: [side * 0.185, 0.125, 0.05], rot: [0, 0, -side * 0.85] });
        kk.add(shell(0.13, 0.15, 0.035), 'metal', r.pelvis, { pos: [side * 0.17, 0.11, -0.04], rot: [0, 0, -side * 0.85] });
        const s1 = sweep([[side * 0.08, 0.205, 0.17], [side * 0.2, 0.15, 0.13], [side * 0.27, 0.01, 0.1]], 0.012, { radial: 5, segs: 6, capRings: 2 });
        paint(s1, seam);
        kk.add(s1, 'glow', r.chest);
      }
      for (const [bone, z, w, y] of [
        [r.chest, 0.0, 0.17, 0.235],
        [r.belly, 0, 0.16, 0.2],
        [r.pelvis, 0.03, 0.15, 0.2],
      ] as const) {
        kk.add(shell(w, 0.12, 0.028), 'metal', bone, { pos: [0, y, z] });
        const sg = sweep([[-w * 0.85, y - 0.05, z - 0.115], [0, y + 0.012, z - 0.13], [w * 0.85, y - 0.05, z - 0.115]], 0.011, { radial: 5, segs: 6, capRings: 2 });
        paint(sg, seam);
        kk.add(sg, 'glow', bone);
      }
      return { glow };
    },
    headUp: 0.02,
    curiosity: 0.6,
  };
  return quadBuilt(k, def, ['look', 'stretch', 'swish', 'yawn', 'shake', 'look']);
}

// ---------------------------------------------------------------------------------------------
// Grass line: Fernfawn -> Bramblebuck -> Elkwarden
// ---------------------------------------------------------------------------------------------

export function fernfawn(k: Kit): Built {
  const coat = '#c98a4b';
  const deep = '#a8693a';
  const cream = '#fbeed6';
  const sp: [number, number, number, number][] = [];
  for (const side of [1, -1]) {
    for (const [z, y, r] of [
      [-0.07, 0.035, 0.012],
      [-0.035, 0.045, 0.011],
      [0.0, 0.04, 0.012],
      [0.035, 0.046, 0.011],
      [0.065, 0.038, 0.01],
      [-0.05, 0.015, 0.009],
      [0.015, 0.02, 0.01],
      [0.05, 0.02, 0.009],
    ]) sp.push([side * 0.035, y, z, r]);
  }
  const def: QuadDef = {
    gait: 'deer',
    bodyY: 0.245,
    hipZ: -0.065,
    shoulderZ: 0.065,
    torso: [
      { t: -0.11, w: 0.048, h: 0.05, hb: 0.044, c: 0.012 },
      { t: -0.075, w: 0.06, h: 0.06, hb: 0.054, c: 0.008 },
      { t: -0.01, w: 0.057, h: 0.056, hb: 0.054, c: 0.0 },
      { t: 0.05, w: 0.06, h: 0.06, hb: 0.064, c: 0.004 },
      { t: 0.095, w: 0.054, h: 0.056, hb: 0.056, c: 0.014 },
      { t: 0.12, w: 0.04, h: 0.042, hb: 0.042, c: 0.024 },
    ],
    torsoPaint: torsoPaint(coat, cream, { back: deep, backK: 0.45, soft: 0.04, extra: [{ color: cream, mask: mul(spots(sp), facing(0, 1, 0, -0.3, 0.2)), k: 0.95 }] }),
    hind: { x: 0.035, y: -0.005, z: -0.005, lens: [0.085, 0.085, 0.07], radii: [0.04, 0.02, 0.014, 0.012], pawH: 0.02, a0: 0.36, bulge: 0.15, paw: { len: 0.02, w: 0.014, h: 0.016 } },
    fore: { x: 0.032, y: -0.015, z: 0.004, lens: [0.085, 0.09, 0.045], radii: [0.032, 0.018, 0.013, 0.012], pawH: 0.02, a0: 0.08, footZ: 0.004, paw: { len: 0.02, w: 0.014, h: 0.016 } },
    legPaint: () => hoofLegs(coat, deep, '#3a2a22', 0.35, 0.75),
    neck: { pos: [0, 0.035, 0.05], len: 0.085, pitch: 0.32, r0: 0.05, r1: 0.04, paint: layered(coat, { color: cream, mask: facing(0, -0.4, 1, 0.45, 0.85) }) },
    head: mamHead({
      R: 0.085,
      fur: coat,
      cream,
      nose: '#3a2622',
      inner: '#b8ec82',
      iris: '#6b3a1a',
      skull: [1.0, 0.92, 0.95],
      face: 'muzzle',
      snout: 0.5,
      snoutW: 0.82,
      snoutH: 0.85,
      snoutDrop: 0.12,
      cheeks: 0.6,
      cheekColor: cream,
      eye: { size: 0.29, yaw: 0.5, pitch: 0.0, tall: 1.2 },
      noseSize: 0.9,
      mouth: 'line',
      ear: { len: 1.5, w: 0.5, out: 1.0, back: 0.15, turn: 0.35, widest: 0.38, round: 0.0, cup: 0.25, outer: '#4f9a35', inner: '#9ee06a', tip: '#3c7f2a', tipLen: 0.3, at: [0.5, 0.55, -0.15], lobes: 5, lobeDepth: 0.35, jiggle: { freq: 11 } },
      extra: (kk, head, c, R) => {
        // A little fern sprout on the forehead.
        const lp = layered('#5fae3a', { color: '#9ee06a', mask: along('y', 0, 0.05) });
        smallLeaf(kk, head, 0.12 * R, 0.6 * R, [0, c[1] + 0.82 * R, c[2] + 0.1 * R], [0.25, 1, 0.3], lp);
        smallLeaf(kk, head, 0.1 * R, 0.45 * R, [0.04 * R, c[1] + 0.8 * R, c[2] + 0.12 * R], [0.9, 0.9, 0.2], lp);
        smallLeaf(kk, head, 0.1 * R, 0.45 * R, [-0.04 * R, c[1] + 0.8 * R, c[2] + 0.12 * R], [-0.8, 1, 0.1], lp);
      },
    }),
    tail: shortTail([0, 0.035, -0.105], 0.045, 0.018, layered(coat, { color: cream, mask: facing(0, -0.3, -1, 0, 0.5) }), 0.9),
    headUp: 0.08,
    curiosity: 1.2,
  };
  return quadBuilt(k, def, ['look', 'tilt', 'flick', 'sniff', 'look', 'flick', 'hop']);
}

export function bramblebuck(k: Kit): Built {
  const coat = '#8c5a34';
  const deep = '#6a4026';
  const cream = '#efdcc0';
  const wood = '#4a2f22';
  const def: QuadDef = {
    gait: 'deer',
    bodyY: 0.66,
    hipZ: -0.19,
    shoulderZ: 0.2,
    torso: [
      { t: -0.31, w: 0.11, h: 0.12, hb: 0.1, c: 0.03 },
      { t: -0.22, w: 0.135, h: 0.14, hb: 0.12, c: 0.02 },
      { t: -0.03, w: 0.13, h: 0.13, hb: 0.12, c: 0.0 },
      { t: 0.15, w: 0.14, h: 0.14, hb: 0.15, c: 0.01 },
      { t: 0.27, w: 0.12, h: 0.13, hb: 0.13, c: 0.03 },
      { t: 0.33, w: 0.09, h: 0.1, hb: 0.1, c: 0.05 },
    ],
    torsoPaint: torsoPaint(coat, cream, { back: deep, backK: 0.55, soft: 0.08, extra: [{ color: cream, mask: mul(along('z', -0.22, -0.32), facing(0, 0.2, -1, 0, 0.5)) }] }),
    hind: { x: 0.08, y: -0.01, z: -0.01, lens: [0.23, 0.25, 0.19], radii: [0.09, 0.045, 0.03, 0.026], pawH: 0.045, a0: 0.38, bulge: 0.2, paw: { len: 0.045, w: 0.03, h: 0.036 } },
    fore: { x: 0.075, y: -0.04, z: 0.01, lens: [0.23, 0.26, 0.13], radii: [0.075, 0.04, 0.028, 0.026], pawH: 0.045, a0: 0.06, footZ: 0.01, paw: { len: 0.045, w: 0.03, h: 0.036 } },
    legPaint: () => hoofLegs(coat, deep, '#2a1c16', 0.35, 0.75),
    neck: { pos: [0, 0.09, 0.15], len: 0.28, pitch: 0.5, r0: 0.11, r1: 0.075, paint: layered(coat, { color: cream, mask: facing(0, -0.5, 1, 0.5, 0.9) }, { color: deep, mask: facing(0, 0.3, -1, 0.3, 0.9) }) },
    head: mamHead({
      R: 0.12,
      fur: coat,
      cream,
      nose: '#2a1c1a',
      inner: '#e8b8a0',
      iris: '#4a2a14',
      skull: [0.95, 0.88, 1.0],
      face: 'muzzle',
      snout: 0.85,
      snoutW: 0.8,
      snoutH: 0.82,
      snoutDrop: 0.18,
      cheeks: 0.4,
      eye: { size: 0.24, yaw: 0.6, pitch: 0.06, tall: 1.1 },
      mouth: 'line',
      ear: { len: 1.1, w: 0.42, out: 1.15, back: 0.25, turn: 0.4, widest: 0.45, round: 0.35, cup: 0.4, at: [0.55, 0.45, -0.3], jiggle: { freq: 10 } },
      extra: (kk, head, c, R) => {
        const bark = layered(wood, { color: '#6b4a34', mask: facing(0, 1, 0, 0.3, 1), k: 0.5 });
        antlers(kk, head, {
          root: [0.3 * R, c[1] + 0.75 * R, c[2] - 0.15 * R],
          beam: [
            [0, 0, 0],
            [0.35 * R, 0.55 * R, -0.3 * R],
            [0.85 * R, 1.15 * R, -0.3 * R],
            [1.0 * R, 1.8 * R, -0.05 * R],
            [1.25 * R, 2.4 * R, -0.1 * R],
            [1.1 * R, 2.95 * R, 0.15 * R],
          ],
          r: [0.15 * R, 0.05 * R],
          tines: [
            { u: 0.22, dir: [0.1, 0.7, 1], len: 0.8 * R, r: 0.08 * R },
            { u: 0.45, dir: [1, 0.6, 0.1], len: 0.8 * R, r: 0.075 * R },
            { u: 0.62, dir: [-0.5, 0.9, 0.6], len: 0.75 * R, r: 0.065 * R },
            { u: 0.8, dir: [0.9, 0.8, -0.3], len: 0.6 * R, r: 0.055 * R },
          ],
          paint: bark,
          radial: 7,
          deco: (b, side, at, tips) => {
            // Thorns along the beam, a few leaves and red berries.
            for (let i = 0; i < 10; i++) {
              const u = 0.08 + i * 0.09;
              const p = at(u);
              const g = cone(0.04 * R, 0.22 * R, 4);
              paint(g, solid('#2e1d16'));
              const m = kk.add(g, 'fur', b, { pos: p });
              aim(m, [side * (i % 3 === 0 ? -0.6 : 1), 0.35 - (i % 2) * 0.5, i % 2 ? -0.6 : 0.8]);
            }
            const lp = layered('#4f8f34', { color: '#86c95a', mask: along('y', 0, 0.04) });
            smallLeaf(kk, b, 0.16 * R, 0.55 * R, at(0.35), [side * 1, 0.4, 0.5], lp, 0.5);
            smallLeaf(kk, b, 0.14 * R, 0.5 * R, tips[2], [side * 0.6, 1, -0.4], lp, -0.4);
            smallLeaf(kk, b, 0.14 * R, 0.5 * R, at(0.7), [-side * 0.5, 0.6, 1], lp, 0.8);
            for (const [ti, dx] of [
              [1, 0.06],
              [3, -0.05],
              [0, 0.05],
            ] as const) {
              const t = tips[ti];
              blobPart(kk, b, [0.09 * R, 0.09 * R, 0.09 * R], [t[0] + side * dx * R, t[1] - 0.06 * R, t[2]], solid('#d8304a'), 'gloss', undefined, 'tiny');
              blobPart(kk, b, [0.07 * R, 0.07 * R, 0.07 * R], [t[0] - side * dx * R, t[1] - 0.12 * R, t[2] + 0.05 * R], solid('#b01e3a'), 'gloss', undefined, 'tiny');
            }
          },
        });
      },
    }),
    tail: shortTail([0, 0.08, -0.3], 0.1, 0.035, layered(coat, { color: cream, mask: facing(0, -0.3, -1, 0, 0.5) }), 0.7),
    extras: (kk, r) => {
      // Dark bramble mane down the neck.
      mane(kk, r.neck, [0, 0.03, -0.07], [0, 0.26, -0.05], 4, 0.035, 0.09, solid(deep), -0.9);
    },
    headUp: 0.1,
    curiosity: 0.8,
  };
  return quadBuilt(k, def, ['look', 'flick', 'sniff', 'look', 'shake', 'flick']);
}

export function elkwarden(k: Kit): Built {
  const coat = '#5e3e28';
  const deep = '#46301f';
  const moss = '#5f8f36';
  const mossLight = '#8cc152';
  const cream = '#d9c6a0';
  const bark = layered('#c4ab82', { color: '#8e7656', mask: facing(0, -1, 0, -0.2, 0.6), k: 0.7 });
  const mossy: Mask = (p, n) => {
    const patch = 0.5 + 0.5 * Math.sin(p.x * 13 + p.z * 9) * Math.sin(p.z * 7 - p.x * 5);
    return smoothstep(0.45, 0.85, n.y) * smoothstep(0.3, 0.7, patch);
  };
  const def: QuadDef = {
    gait: 'deer',
    bodyY: 1.0,
    hipZ: -0.38,
    shoulderZ: 0.42,
    torso: [
      { t: -0.62, w: 0.27, h: 0.27, hb: 0.24, c: 0.05 },
      { t: -0.45, w: 0.34, h: 0.33, hb: 0.31, c: 0.04 },
      { t: -0.05, w: 0.36, h: 0.35, hb: 0.34, c: 0.04 },
      { t: 0.3, w: 0.39, h: 0.44, hb: 0.38, c: 0.1 },
      { t: 0.55, w: 0.34, h: 0.42, hb: 0.34, c: 0.14 },
      { t: 0.7, w: 0.24, h: 0.3, hb: 0.25, c: 0.17 },
    ],
    torsoPaint: torsoPaint(coat, deep, {
      soft: 0.2,
      bellyY: -0.05,
      extra: [
        { color: moss, mask: mossy, k: 0.9 },
        { color: cream, mask: mul(along('z', -0.45, -0.66), facing(0, 0.1, -1, 0, 0.6)), k: 0.8 },
      ],
    }),
    hind: { x: 0.2, y: -0.03, z: -0.02, lens: [0.34, 0.34, 0.25], radii: [0.2, 0.11, 0.078, 0.07], pawH: 0.08, a0: 0.36, bulge: 0.25, paw: { len: 0.1, w: 0.078, h: 0.07 } },
    fore: { x: 0.2, y: -0.1, z: 0.04, lens: [0.33, 0.35, 0.18], radii: [0.19, 0.105, 0.078, 0.072], pawH: 0.08, a0: 0.06, footZ: 0.02, paw: { len: 0.1, w: 0.08, h: 0.07 } },
    legPaint: () => hoofLegs(coat, '#3a281a', '#24180f', 0.4, 0.8),
    neck: { pos: [0, 0.24, 0.32], len: 0.4, pitch: 0.8, r0: 0.28, r1: 0.2, paint: layered(coat, { color: deep, mask: facing(0, -0.5, 1, 0.1, 0.7) }) },
    head: mamHead({
      R: 0.23,
      fur: coat,
      cream,
      nose: '#2a1d16',
      inner: '#b89a7a',
      iris: '#3a2410',
      skull: [0.95, 0.9, 1.0],
      face: 'muzzle',
      snout: 1.05,
      snoutW: 0.95,
      snoutH: 1.0,
      snoutDrop: 0.2,
      cheeks: 0.45,
      cheekColor: coat,
      eye: { size: 0.2, yaw: 0.62, pitch: 0.1, tall: 1.0 },
      mouth: 'line',
      noseSize: 1.3,
      ear: { len: 0.9, w: 0.38, out: 1.2, back: 0.25, turn: 0.4, widest: 0.45, round: 0.3, at: [0.6, 0.4, -0.3], jiggle: { freq: 9 } },
      extra: (kk, head, c, R) => {
        const jig: JiggleSpec[] = [];
        antlers(kk, head, {
          root: [0.4 * R, c[1] + 0.65 * R, c[2] - 0.2 * R],
          beam: [
            [0, 0, 0],
            [0.8 * R, 0.25 * R, -0.3 * R],
            [1.8 * R, 0.55 * R, -0.5 * R],
            [2.6 * R, 1.0 * R, -0.45 * R],
            [3.0 * R, 1.6 * R, -0.25 * R],
          ],
          r: [0.17 * R, 0.1 * R],
          tines: [
            { u: 0.2, dir: [0.1, 0.5, 1], len: 0.8 * R, r: 0.1 * R },
            { u: 0.45, dir: [0.1, 1, 0.4], len: 0.9 * R, r: 0.09 * R },
            { u: 0.62, dir: [0.2, 1, -0.2], len: 1.0 * R, r: 0.085 * R },
            { u: 0.8, dir: [0.4, 1, -0.6], len: 0.8 * R, r: 0.075 * R },
            { u: 0.92, dir: [1, 0.6, 0.2], len: 0.7 * R, r: 0.07 * R },
          ],
          paint: bark,
          radial: 7,
          deco: (b, side, at, tips) => {
            // Moss on the beam and saplings growing from the antlers (they sway on springs).
            // A broad palm between the upper tines (palmate antlers).
            const pc = at(0.68);
            const palm = ellipsoid(0.75 * R, 0.5 * R, 0.09 * R, 'sm');
            paint(palm, bark);
            kk.add(palm, 'fur', b, { pos: [pc[0], pc[1] + 0.25 * R, pc[2]], rot: [0, -side * 0.35, side * 0.5] });
            for (const u of [0.25, 0.55]) blobPart(kk, b, [0.24 * R, 0.12 * R, 0.2 * R], at(u), layered(moss, { color: mossLight, mask: facing(0, 1, 0, 0.4, 1) }), 'fur', undefined, 'sm');
            for (const [ti, h] of [
              [2, 1.0],
              [5, 0.8],
            ] as const) {
              const t = tips[ti];
              const sb = kk.bone(b, 'sapling', t[0], t[1] - 0.05 * R, t[2]);
              const H = h * R;
              const trunk = sweep([[0, 0, 0], [side * 0.05 * R, H * 0.5, 0], [0, H, 0.03 * R]], [
                [0, 0.05 * R],
                [1, 0.025 * R],
              ], { radial: 5, segs: 5, capRings: 1 });
              paint(trunk, solid('#6b4a2e'));
              kk.add(trunk, 'fur', sb);
              const leafP = layered('#3f8a34', { color: '#86cf5a', mask: facing(0, 1, 0, 0.2, 1) }, { color: '#2c6a2a', mask: facing(0, -1, 0, 0, 0.8) });
              blobPart(kk, sb, [0.3 * R, 0.24 * R, 0.28 * R], [0, H * 1.05, 0.02 * R], leafP, 'leaf', undefined, 'sm');
              blobPart(kk, sb, [0.24 * R, 0.2 * R, 0.22 * R], [side * 0.24 * R, H * 0.85, -0.05 * R], leafP, 'leaf', undefined, 'sm');
              blobPart(kk, sb, [0.22 * R, 0.18 * R, 0.2 * R], [-side * 0.2 * R, H * 0.9, 0.08 * R], leafP, 'leaf', undefined, 'sm');
              jig.push({ bone: sb, tip: new THREE.Vector3(0, H, 0), opts: { freq: 7, zeta: 0.25, gain: 0.02, limit: 0.5 }, role: 'misc', side });
            }
          },
        });
        // Mossy beard.
        addTufts(
          kk,
          head,
          [
            { pos: [0, c[1] - 0.6 * R, c[2] + 0.2 * R], dir: [0, -1, 0.15], r: 0.18 * R, len: 0.5 * R },
            { pos: [0.15 * R, c[1] - 0.55 * R, c[2] + 0.1 * R], dir: [0.3, -1, 0], r: 0.14 * R, len: 0.4 * R },
            { pos: [-0.15 * R, c[1] - 0.55 * R, c[2] + 0.1 * R], dir: [-0.3, -1, 0], r: 0.14 * R, len: 0.4 * R },
          ],
          layered(moss, { color: mossLight, mask: facing(0, 0, 1, 0, 1), k: 0.5 }),
        );
        return { jiggles: jig };
      },
    }),
    tail: shortTail([0, 0.14, -0.62], 0.16, 0.06, layered(coat, { color: cream, mask: facing(0, -0.3, -1, 0, 0.5) }), 0.5),
    extras: (kk, r) => {
      // Shaggy moss mane over the neck and shoulders.
      const mp = layered(moss, { color: mossLight, mask: facing(0, 1, 0.3, 0.3, 1), k: 0.6 });
      mane(kk, r.neck, [0, 0.12, -0.2], [0, 0.42, -0.16], 5, 0.1, 0.2, mp, -1.2);
      const shag = layered('#4f3a26', { color: moss, mask: facing(0, 1, 0, 0.0, 0.9), k: 0.9 });
      addTufts(
        kk,
        r.chest,
        [
          { pos: [0, 0.38, 0.12], dir: [0, 1, -0.7], r: 0.13, len: 0.24, curl: -0.05 },
          { pos: [0.2, 0.33, 0.1], dir: [0.5, 1, -0.6], r: 0.11, len: 0.2, curl: -0.04 },
          { pos: [-0.2, 0.33, 0.1], dir: [-0.5, 1, -0.6], r: 0.11, len: 0.2, curl: -0.04 },
        ],
        shag,
      );
    },
    headUp: 0.02,
    curiosity: 0.5,
  };
  return quadBuilt(k, def, ['look', 'flick', 'shake', 'sniff', 'look']);
}

// ---------------------------------------------------------------------------------------------
// Herding dogs: Hjordpup -> Shepherion
// ---------------------------------------------------------------------------------------------

const SHEEPDOG = { black: '#2a2830', white: '#f7f3ea', tan: '#c98a4e', nose: '#1a1416', inner: '#f2a9a6' };

export function hjordpup(k: Kit): Built {
  const P = SHEEPDOG;
  const chestWhite: Mask = mul(along('z', 0.03, 0.09), facing(0, -0.3, 1, -0.4, 0.2));
  const def: QuadDef = {
    gait: 'dog',
    bodyY: 0.165,
    hipZ: -0.055,
    shoulderZ: 0.06,
    torso: [
      { t: -0.115, w: 0.058, h: 0.058, hb: 0.052, c: 0.012 },
      { t: -0.075, w: 0.078, h: 0.074, hb: 0.068, c: 0.008 },
      { t: -0.01, w: 0.08, h: 0.072, hb: 0.072, c: 0.0 },
      { t: 0.05, w: 0.084, h: 0.078, hb: 0.082, c: 0.004 },
      { t: 0.095, w: 0.072, h: 0.07, hb: 0.072, c: 0.014 },
      { t: 0.12, w: 0.052, h: 0.052, hb: 0.052, c: 0.024 },
    ],
    torsoPaint: torsoPaint(P.black, P.white, { soft: 0.05, bellyY: 0.01, extra: [{ color: P.white, mask: chestWhite }] }),
    hind: { x: 0.046, y: -0.005, z: 0.0, lens: [0.055, 0.05, 0.036], radii: [0.044, 0.028, 0.022, 0.02], pawH: 0.018, a0: 0.3, bulge: 0.15, paw: { len: 0.03, w: 0.027, h: 0.019 } },
    fore: { x: 0.044, y: -0.012, z: 0.006, lens: [0.055, 0.05, 0.026], radii: [0.038, 0.027, 0.021, 0.02], pawH: 0.018, a0: 0.1, footZ: 0.004, paw: { len: 0.03, w: 0.027, h: 0.019 } },
    legPaint: (fore) => (fore ? legGrad(P.white, P.white, 0, 1) : legGrad(P.black, P.white, 0.25, 0.6)),
    neck: { pos: [0, 0.03, 0.045], len: 0.045, pitch: 0.5, r0: 0.058, r1: 0.052, paint: layered(P.black, { color: P.white, mask: facing(0, -0.2, 1, -0.3, 0.3) }) },
    head: mamHead({
      R: 0.1,
      fur: P.black,
      cream: P.white,
      nose: P.nose,
      inner: P.inner,
      iris: '#6a3c1a',
      skull: [1.06, 0.94, 0.93],
      face: 'blaze',
      snout: 0.42,
      snoutW: 1.0,
      snoutH: 0.92,
      snoutDrop: 0.08,
      cheeks: 1.0,
      cheekColor: P.white,
      eye: { size: 0.27, yaw: 0.46, pitch: -0.02 },
      noseSize: 1.15,
      mouth: 'line',
      marks: P.tan,
      ear: { len: 0.8, w: 0.46, out: 0.75, back: 0.05, turn: 0.2, widest: 0.35, round: 0.6, flop: 1.25, cup: 0.3, at: [0.6, 0.52, -0.12], jiggle: { freq: 9, zeta: 0.25, gain: 0.02 } },
      extra: (kk, head, c, R) => {
        // Puppy fluff on the crown.
        addTufts(
          kk,
          head,
          [
            { pos: [0, c[1] + 0.82 * R, c[2] + 0.05 * R], dir: [0, 1, 0.5], r: 0.16 * R, len: 0.32 * R, curl: 0.08 * R },
            { pos: [0.12 * R, c[1] + 0.8 * R, c[2] - 0.05 * R], dir: [0.4, 1, 0.2], r: 0.13 * R, len: 0.26 * R, curl: 0.06 * R },
          ],
          solid(P.black),
        );
      },
    }),
    tail: bushyTail([0, 0.035, -0.105], 0.17, 0.05, P.black, P.white, 0.62, 1.0),
    extras: (kk, r) => collarRuff(kk, r.chest, [0, 0.03, 0.035], 0.064, P.white),
    headUp: 0.08,
    curiosity: 1.2,
  };
  return quadBuilt(k, def, ['tilt', 'look', 'sniff', 'shake', 'scratch', 'hop', 'swish', 'tilt']);
}

export function shepherion(k: Kit): Built {
  const P = SHEEPDOG;
  const saddle: Mask = mul(facing(0, 1, 0, -0.1, 0.5), along('z', 0.25, 0.1));
  const def: QuadDef = {
    gait: 'dog',
    bodyY: 0.52,
    hipZ: -0.19,
    shoulderZ: 0.2,
    torso: [
      { t: -0.33, w: 0.13, h: 0.13, hb: 0.11, c: 0.03 },
      { t: -0.24, w: 0.155, h: 0.15, hb: 0.13, c: 0.02 },
      { t: -0.04, w: 0.15, h: 0.145, hb: 0.12, c: 0.0 },
      { t: 0.15, w: 0.165, h: 0.16, hb: 0.17, c: 0.01 },
      { t: 0.28, w: 0.15, h: 0.15, hb: 0.15, c: 0.03 },
      { t: 0.35, w: 0.11, h: 0.11, hb: 0.11, c: 0.05 },
    ],
    torsoPaint: torsoPaint(P.tan, P.white, { soft: 0.08, extra: [{ color: P.black, mask: saddle }] }),
    hind: { x: 0.09, y: -0.01, z: -0.01, lens: [0.19, 0.18, 0.13], radii: [0.1, 0.058, 0.043, 0.04], pawH: 0.04, a0: 0.32, bulge: 0.2, paw: { len: 0.07, w: 0.052, h: 0.04 } },
    fore: { x: 0.085, y: -0.035, z: 0.01, lens: [0.19, 0.19, 0.085], radii: [0.088, 0.055, 0.042, 0.04], pawH: 0.04, a0: 0.1, footZ: 0.01, paw: { len: 0.07, w: 0.054, h: 0.04 } },
    legPaint: () => legGrad(P.tan, P.white, 0.45, 0.8),
    neck: { pos: [0, 0.08, 0.13], len: 0.15, pitch: 0.6, r0: 0.12, r1: 0.1, paint: layered(P.black, { color: P.white, mask: facing(0, -0.2, 1, -0.2, 0.4) }) },
    head: mamHead({
      R: 0.15,
      fur: P.black,
      cream: P.white,
      nose: P.nose,
      inner: P.inner,
      iris: '#c7861e',
      skull: [1.0, 0.9, 0.98],
      face: 'blaze',
      snout: 0.8,
      snoutW: 0.92,
      snoutH: 0.85,
      snoutDrop: 0.08,
      cheeks: 0.8,
      cheekColor: P.tan,
      eye: { size: 0.21, yaw: 0.5, pitch: 0.04, tall: 1.05 },
      mouth: 'line',
      noseSize: 1.2,
      marks: P.tan,
      ear: { len: 1.1, w: 0.44, out: 0.35, back: 0.12, turn: 0.15, widest: 0.3, round: 0.3, flop: 0.55, cup: 0.35, at: [0.5, 0.58, -0.15], jiggle: { freq: 11 } },
    }),
    tail: bushyTail([0, 0.06, -0.31], 0.5, 0.085, P.black, P.white, 0.75, 0.35),
    extras: (kk, r) => {
      // Big white mane: the herd-guardian's ruff.
      collarRuff(kk, r.chest, [0, 0.08, 0.1], 0.14, P.white);
      mane(kk, r.neck, [0, 0.0, -0.08], [0, 0.12, -0.08], 3, 0.06, 0.13, solid(P.black), -1.0);
    },
    headUp: 0.12,
    curiosity: 0.9,
  };
  return quadBuilt(k, def, ['look', 'tilt', 'sniff', 'shake', 'look', 'swish', 'scratch']);
}

// ---------------------------------------------------------------------------------------------
// Rodents: Nibblet -> Stashquill
// ---------------------------------------------------------------------------------------------

export function nibblet(k: Kit): Built {
  const fur = '#a8723e';
  const deep = '#86562c';
  const cream = '#f6e6c8';
  const def: QuadDef = {
    gait: 'scurry',
    bodyY: 0.085,
    hipZ: -0.035,
    shoulderZ: 0.035,
    torso: [
      { t: -0.085, w: 0.052, h: 0.05, hb: 0.04, c: 0.012 },
      { t: -0.055, w: 0.07, h: 0.066, hb: 0.054, c: 0.01 },
      { t: 0.0, w: 0.072, h: 0.068, hb: 0.058, c: 0.008 },
      { t: 0.045, w: 0.066, h: 0.062, hb: 0.056, c: 0.01 },
      { t: 0.075, w: 0.048, h: 0.048, hb: 0.044, c: 0.016 },
    ],
    torsoPaint: torsoPaint(fur, cream, { back: deep, backK: 0.4, soft: 0.03, bellyY: -0.01 }),
    hind: { x: 0.04, y: -0.012, z: -0.005, lens: [0.03, 0.028, 0.02], radii: [0.03, 0.017, 0.012, 0.011], pawH: 0.009, a0: 0.5, bulge: 0.2, paw: { len: 0.02, w: 0.012, h: 0.009, fwd: 0.01 } },
    fore: { x: 0.032, y: -0.025, z: 0.008, lens: [0.026, 0.026, 0.012], radii: [0.02, 0.014, 0.011, 0.01], pawH: 0.009, a0: 0.15, footZ: 0.004, paw: { len: 0.016, w: 0.011, h: 0.008 } },
    legPaint: () => legGrad(fur, deep, 0.3, 0.6, '#f0b8a8', 0.85),
    neck: { pos: [0, 0.02, 0.045], len: 0.022, pitch: 0.6, r0: 0.05, r1: 0.05, paint: layered(fur, { color: cream, mask: facing(0, -0.3, 1, -0.2, 0.4) }) },
    head: mamHead({
      R: 0.068,
      fur,
      cream,
      nose: '#e88a8a',
      inner: '#f2a8a0',
      iris: '#2a1a14',
      skull: [1.0, 0.9, 0.98],
      face: 'muzzle',
      snout: 0.32,
      snoutW: 0.8,
      snoutH: 0.75,
      snoutDrop: 0.05,
      cheeks: 1.75,
      cheekColor: cream,
      eye: { size: 0.27, yaw: 0.52, pitch: 0.05, tall: 1.1 },
      mouth: 'y',
      noseSize: 0.9,
      whiskers: '#3a2a22',
      ear: { len: 0.55, w: 0.46, out: 0.75, back: 0.15, turn: 0.35, widest: 0.5, round: 1, cup: 0.5, at: [0.58, 0.55, -0.25], jiggle: { freq: 16 } },
    }),
    tail: (kk, pelvis) => {
      // Short thin vole tail.
      const g = sweep([[0, 0, 0], [0, -0.008, -0.03], [0, -0.006, -0.055]], [
        [0, 0.008],
        [1, 0.004],
      ], { radial: 5, segs: 4, capRings: 1 });
      paint(g, solid('#c98a7a'));
      const b = kk.bone(pelvis, 'tail0', 0, 0.01, -0.075);
      kk.add(g, 'soft', b);
      return { bones: [b], jiggles: [{ bone: b, tip: new THREE.Vector3(0, -0.006, -0.055), opts: { freq: 14, zeta: 0.3, gain: 0.01 }, role: 'tail', side: 0, up: 0.3, wag: 0.4 }] };
    },
    headUp: 0.1,
    curiosity: 1.4,
  };
  return quadBuilt(k, def, ['sniff', 'tilt', 'look', 'scratch', 'sniff', 'flick', 'hop']);
}

export function stashquill(k: Kit): Built {
  const fur = '#7b5536';
  const face = '#d9b58c';
  const quillBase = '#4a3426';
  const quillTip = '#efe4c8';
  const def: QuadDef = {
    gait: 'scurry',
    bodyY: 0.2,
    hipZ: -0.08,
    shoulderZ: 0.08,
    torso: [
      { t: -0.2, w: 0.11, h: 0.11, hb: 0.07, c: 0.02 },
      { t: -0.13, w: 0.16, h: 0.15, hb: 0.1, c: 0.02 },
      { t: 0.0, w: 0.17, h: 0.16, hb: 0.11, c: 0.02 },
      { t: 0.11, w: 0.15, h: 0.14, hb: 0.11, c: 0.02 },
      { t: 0.18, w: 0.1, h: 0.1, hb: 0.09, c: 0.03 },
    ],
    torsoPaint: torsoPaint(fur, face, { soft: 0.05, bellyY: -0.03 }),
    hind: { x: 0.09, y: -0.03, z: -0.01, lens: [0.075, 0.065, 0.045], radii: [0.06, 0.035, 0.026, 0.024], pawH: 0.02, a0: 0.4, bulge: 0.2, paw: { len: 0.045, w: 0.03, h: 0.02 } },
    fore: { x: 0.09, y: -0.05, z: 0.02, lens: [0.07, 0.065, 0.03], radii: [0.05, 0.033, 0.027, 0.026], pawH: 0.02, a0: 0.15, footZ: 0.012, splay: 0.01, paw: { len: 0.045, w: 0.04, h: 0.02 } },
    legPaint: () => legGrad(fur, '#5a3c26', 0.3, 0.7, '#3a2a1e', 0.9),
    neck: { pos: [0, 0.03, 0.1], len: 0.05, pitch: 0.75, r0: 0.11, r1: 0.1, paint: solid(face) },
    head: mamHead({
      R: 0.12,
      fur: face,
      cream: '#f0dcc0',
      nose: '#2a1a16',
      inner: '#c99a80',
      iris: '#1e1410',
      skull: [1.0, 0.86, 1.0],
      face: 'muzzle',
      snout: 0.85,
      snoutW: 0.7,
      snoutH: 0.65,
      snoutDrop: 0.08,
      cheeks: 1.1,
      cheekColor: '#f0dcc0',
      eye: { size: 0.2, yaw: 0.5, pitch: 0.12, tall: 1.05 },
      mouth: 'y',
      whiskers: '#2a1c16',
      ear: { len: 0.45, w: 0.4, out: 0.9, back: 0.2, turn: 0.3, widest: 0.5, round: 1, cup: 0.5, outer: fur, at: [0.6, 0.45, -0.3], jiggle: { freq: 15 } },
      extra: (kk, head, c, R) => {
        // Crest of quills on the head.
        for (const [x, y, z, dx, dy, dz, len] of [
          [0, 0.75, -0.1, 0, 1, -0.6, 0.6],
          [0.25, 0.7, -0.15, 0.4, 1, -0.7, 0.5],
          [-0.25, 0.7, -0.15, -0.4, 1, -0.7, 0.5],
        ] as const) {
          const g = cone(0.09 * R, len * R, 5);
          paint(g, layered(quillBase, { color: quillTip, mask: along('y', len * R * 0.5, len * R) }));
          const m = kk.add(g, 'fur', head, { pos: [x * R, c[1] + y * R, c[2] + z * R] });
          aim(m, [dx, dy, dz]);
        }
      },
    }),
    tail: shortTail([0, 0.02, -0.19], 0.05, 0.022, solid(fur), 0.4, 1),
    extras: (kk, r) => {
      // Quills: rows of cones over the back, pointing back and out.
      const qp = layered(quillBase, { color: quillTip, mask: along('y', 0.05, 0.11) });
      const rows: [THREE.Bone, number, number][] = [
        [r.chest, 0.06, 0.06],
        [r.chest, -0.02, 0.07],
        [r.belly, 0, 0.075],
        [r.pelvis, 0.03, 0.075],
        [r.pelvis, -0.05, 0.065],
      ];
      for (const [bone, z, rr] of rows) {
        for (let i = -3; i <= 3; i++) {
          const a = (i / 3) * 1.25;
          const x = Math.sin(a) * rr * 2.1;
          const y = Math.cos(a) * rr * 1.9 + 0.005;
          const zz = bone === r.belly ? z : z;
          const g = cone(0.022, 0.12 + 0.02 * Math.cos(a * 2), 5);
          paint(g, qp);
          const m = kk.add(g, 'fur', bone, { pos: [x, y, zz] });
          aim(m, [Math.sin(a) * 0.9, Math.cos(a) * 0.8, -0.9]);
        }
      }
    },
    headUp: 0.0,
    curiosity: 1.0,
  };
  const b = quadBuilt(k, def, ['sniff', 'look', 'scratch', 'sniff', 'shake', 'tilt']);
  // Claws on the fore paws (found by name after the build).
  k.scaled.traverse((o) => {
    if (!(o as THREE.Bone).isBone || !/^fore[LR]Paw$/.test(o.name)) return;
    for (const dx of [-0.018, 0, 0.018]) {
      const g = cone(0.007, 0.035, 4);
      paint(g, solid('#efe2c8'));
      const m = k.add(g, 'gloss', o, { pos: [dx, -0.012, 0.045] });
      aim(m, [dx * 4, -0.4, 1]);
    }
  });
  return b;
}

// ---------------------------------------------------------------------------------------------
// Rabbits: Cloveret -> Luckhare
// ---------------------------------------------------------------------------------------------

/** Four-leaf clover patch mask centred at (x, y, z) on the +x side (mirrored). */
function cloverMask(x: number, y: number, z: number, r: number): Mask {
  const list: [number, number, number, number][] = [
    [x, y + r * 0.55, z, r * 0.6],
    [x, y - r * 0.55, z, r * 0.6],
    [x, y, z + r * 0.55, r * 0.6],
    [x, y, z - r * 0.55, r * 0.6],
  ];
  return symX(spots(list, 0.25));
}

export function cloveret(k: Kit): Built {
  const fur = '#fbf5ea';
  const shade = '#e9dfcc';
  const green = '#55b844';
  const greenLight = '#a6e37a';
  const def: QuadDef = {
    gait: 'hop',
    bodyY: 0.12,
    hipZ: -0.045,
    shoulderZ: 0.04,
    torso: [
      { t: -0.1, w: 0.06, h: 0.058, hb: 0.05, c: 0.012 },
      { t: -0.065, w: 0.078, h: 0.074, hb: 0.066, c: 0.008 },
      { t: -0.01, w: 0.074, h: 0.07, hb: 0.064, c: 0.004 },
      { t: 0.04, w: 0.065, h: 0.064, hb: 0.06, c: 0.008 },
      { t: 0.075, w: 0.048, h: 0.05, hb: 0.048, c: 0.016 },
    ],
    torsoPaint: torsoPaint(fur, '#fffdf8', { back: shade, backK: 0.3, soft: 0.03, extra: [{ color: green, mask: cloverMask(0.07, 0.02, -0.045, 0.018), k: 0.9 }] }),
    hind: { x: 0.048, y: -0.01, z: -0.005, lens: [0.05, 0.05, 0.055], radii: [0.046, 0.026, 0.017, 0.016], pawH: 0.014, a0: 1.05, bulge: 0.25, ka: 0.6, flip: 0.5, paw: { len: 0.05, w: 0.022, h: 0.015, fwd: 0.028 } },
    fore: { x: 0.03, y: -0.025, z: 0.012, lens: [0.04, 0.04, 0.016], radii: [0.022, 0.016, 0.013, 0.012], pawH: 0.012, a0: 0.12, footZ: 0.008, paw: { len: 0.02, w: 0.014, h: 0.011 } },
    legPaint: () => legGrad(fur, shade, 0.5, 0.9),
    neck: { pos: [0, 0.03, 0.04], len: 0.03, pitch: 0.35, r0: 0.05, r1: 0.05, paint: solid(fur) },
    head: mamHead({
      R: 0.088,
      fur,
      cream: '#fffdf8',
      nose: '#f08aa0',
      inner: '#f7c0c8',
      iris: '#2f8a3e',
      skull: [1.04, 0.95, 0.95],
      face: 'none',
      snout: 0,
      cheeks: 1.15,
      cheekColor: '#fffdf8',
      eye: { size: 0.29, yaw: 0.46, pitch: 0.0, tall: 1.18 },
      mouth: 'y',
      noseSize: 0.8,
      extra: (kk, head, c, R) => {
        // Four-leaf-clover ears: two springy stems, each carrying a pair of heart leaflets.
        const jig: JiggleSpec[] = [];
        const leafP = layered(green, { color: greenLight, mask: (p) => 1 - smoothstep(0.004, 0.012, Math.abs(p.x)), k: 0.8 }, { color: '#3f9a34', mask: facing(0, 0, -1, 0, 0.6), k: 0.6 });
        const stemP = solid('#4aa83c');
        for (const side of [1, -1]) {
          const b = kk.bone(head, side > 0 ? 'earL' : 'earR', side * 0.3 * R, c[1] + 0.78 * R, c[2] - 0.12 * R);
          b.rotation.set(-0.2, side * 0.1, -side * 0.28, 'YXZ');
          const stem = sweep([[0, -0.1 * R, 0], [0, 0.12 * R, 0.01 * R], [0, 0.25 * R, 0]], [
            [0, 0.09 * R],
            [1, 0.06 * R],
          ], { radial: 6, segs: 3, capRings: 1 });
          paint(stem, stemP);
          kk.add(stem, 'fur', b);
          // A long heart-leaf ear and a smaller leaflet beside it: four leaves in all.
          const big = heartLeaf(0.36 * R, 0.05 * R, 10, 9);
          big.scale(1, 1.75, 1);
          big.computeVertexNormals();
          paint(big, leafP);
          kk.add(big, 'leaf', b, { pos: [0, 0.18 * R, 0] });
          const small = heartLeaf(0.36 * R, 0.045 * R, 10, 8);
          paint(small, leafP);
          kk.add(small, 'leaf', b, { pos: [side * 0.05 * R, 0.14 * R, -0.03 * R], rot: [-0.1, side * 0.3, -side * 1.25] });
          jig.push({ bone: b, tip: new THREE.Vector3(0, 1.2 * R, 0), opts: { freq: 12, zeta: 0.3, gain: 0.014, limit: 0.8 }, role: 'ear', side });
        }
        // Little clover mark on the forehead.
        return { jiggles: jig };
      },
    }),
    tail: (kk, pelvis) => {
      const b = kk.bone(pelvis, 'tail0', 0, 0.025, -0.085);
      blobPart(kk, b, [0.032, 0.03, 0.03], [0, 0, -0.01], solid('#ffffff'), 'fur', undefined, 'sm');
      return { bones: [b], jiggles: [{ bone: b, tip: new THREE.Vector3(0, 0.01, -0.03), opts: { freq: 16, zeta: 0.3, gain: 0.01 }, role: 'tail', side: 0, up: 0.3, wag: 0.3 }] };
    },
    headUp: 0.1,
    curiosity: 1.3,
  };
  return quadBuilt(k, def, ['sniff', 'tilt', 'look', 'scratch', 'hop', 'flick', 'sniff']);
}

export function luckhare(k: Kit): Built {
  const fur = '#c9a06a';
  const deep = '#a37a48';
  const cream = '#f4e8d0';
  const green = '#4fae3e';
  const def: QuadDef = {
    gait: 'hop',
    bodyY: 0.3,
    hipZ: -0.11,
    shoulderZ: 0.1,
    torso: [
      { t: -0.22, w: 0.1, h: 0.1, hb: 0.085, c: 0.02 },
      { t: -0.15, w: 0.115, h: 0.115, hb: 0.1, c: 0.015 },
      { t: -0.02, w: 0.1, h: 0.1, hb: 0.085, c: 0.01 },
      { t: 0.1, w: 0.095, h: 0.095, hb: 0.09, c: 0.015 },
      { t: 0.18, w: 0.075, h: 0.08, hb: 0.075, c: 0.03 },
    ],
    torsoPaint: torsoPaint(fur, cream, { back: deep, backK: 0.4, soft: 0.06, extra: [{ color: green, mask: cloverMask(0.105, 0.03, -0.1, 0.035), k: 0.9 }] }),
    hind: { x: 0.085, y: -0.02, z: -0.01, lens: [0.13, 0.13, 0.14], radii: [0.08, 0.042, 0.028, 0.026], pawH: 0.03, a0: 1.0, bulge: 0.25, ka: 0.6, flip: 0.5, paw: { len: 0.12, w: 0.035, h: 0.028, fwd: 0.065 } },
    fore: { x: 0.055, y: -0.05, z: 0.02, lens: [0.11, 0.11, 0.04], radii: [0.042, 0.03, 0.023, 0.021], pawH: 0.022, a0: 0.12, footZ: 0.02, paw: { len: 0.04, w: 0.026, h: 0.02 } },
    legPaint: () => legGrad(fur, deep, 0.4, 0.8, cream, 0.92),
    neck: { pos: [0, 0.06, 0.09], len: 0.09, pitch: 0.4, r0: 0.075, r1: 0.065, paint: layered(fur, { color: cream, mask: facing(0, -0.3, 1, 0, 0.6) }) },
    head: mamHead({
      R: 0.115,
      fur,
      cream,
      nose: '#c06070',
      inner: '#f2c2b0',
      iris: '#3f7a2a',
      skull: [0.98, 0.9, 1.0],
      face: 'muzzle',
      snout: 0.3,
      snoutW: 0.9,
      snoutH: 0.85,
      snoutDrop: 0.06,
      cheeks: 0.8,
      eye: { size: 0.24, yaw: 0.56, pitch: 0.06, tall: 1.12 },
      mouth: 'y',
      whiskers: '#5a4430',
      ear: { len: 2.5, w: 0.42, out: 0.22, back: 0.4, turn: 0.15, widest: 0.42, round: 0.45, cup: 0.45, tip: '#2a2024', tipLen: 0.14, at: [0.32, 0.72, -0.2], jiggle: { freq: 8, zeta: 0.3, gain: 0.02 } },
      extra: (kk, head, c, R) => {
        // A four-leaf clover sprig tucked at the base of the ears.
        const lp = layered(green, { color: '#9ee06a', mask: facing(0, 0, 1, 0.2, 1), k: 0.5 });
        for (let i = 0; i < 4; i++) {
          const g = heartLeaf(0.3 * R, 0.04 * R, 8, 7);
          paint(g, lp);
          const m = kk.add(g, 'leaf', head, { pos: [0.3 * R, c[1] + 0.62 * R, c[2] + 0.3 * R] });
          m.rotation.set(-0.5, 0.4, (i * Math.PI) / 2 + 0.3, 'YXZ');
        }
      },
    }),
    tail: (kk, pelvis) => {
      const b = kk.bone(pelvis, 'tail0', 0, 0.05, -0.2);
      blobPart(kk, b, [0.05, 0.05, 0.045], [0, 0, -0.015], layered('#ffffff', { color: fur, mask: facing(0, 1, 0, 0.3, 1), k: 0.6 }), 'fur', undefined, 'sm');
      return { bones: [b], jiggles: [{ bone: b, tip: new THREE.Vector3(0, 0.02, -0.05), opts: { freq: 14, zeta: 0.3, gain: 0.01 }, role: 'tail', side: 0, up: 0.3, wag: 0.3 }] };
    },
    headUp: 0.12,
    curiosity: 1.0,
  };
  return quadBuilt(k, def, ['look', 'sniff', 'flick', 'scratch', 'look', 'hop']);
}

void [blob, maxOf];
