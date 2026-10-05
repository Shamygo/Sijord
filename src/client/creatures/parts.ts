import * as THREE from 'three';
import type { Keys } from '../player/anim-math';
import type { JiggleOpts } from './core';
import {
  along,
  blob,
  ellipsoid,
  facing,
  layered,
  leaf,
  loft,
  mul,
  paint,
  solid,
  sweep,
  tuft,
  type Detail,
  type Mask,
  type Paint,
  type Sec,
  type V3,
} from './geo';
import { chainWeights, skin, type Kit, type MatKind } from './kit';

/**
 * Reusable creature parts: eyes, ears, snouts, tails, ruffs, antlers. Everything is built in
 * the local frame of the bone it is attached to (+Z forward, +Y up, +X the creature's left).
 */

export interface JiggleSpec {
  bone: THREE.Bone;
  /** Tip offset in the bone's own frame. */
  tip: THREE.Vector3;
  opts: JiggleOpts;
  role: 'ear' | 'tail' | 'misc' | 'wing' | 'antenna';
  side: number;
  /** Tail: weight of TAIL_UP and WAG on this bone, wag phase delay. */
  up?: number;
  wag?: number;
  delay?: number;
}

/** A point on an ellipsoid's surface (centre c, radii r) in direction (yaw, pitch) and its normal. */
export function onEllipsoid(
  c: V3,
  r: V3,
  yaw: number,
  pitch: number,
  inset = 0,
): { p: THREE.Vector3; n: THREE.Vector3 } {
  const dx = Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = Math.cos(yaw) * Math.cos(pitch);
  const n = new THREE.Vector3(dx / r[0], dy / r[1], dz / r[2]).normalize();
  const p = new THREE.Vector3(c[0] + r[0] * dx, c[1] + r[1] * dy, c[2] + r[2] * dz).addScaledVector(n, -inset);
  return { p, n };
}

const Z = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------------------------

export interface EyeSpec {
  /** Ellipsoid the eyes sit on (centre, radii) and the direction of the left eye. */
  on: { c: V3; r: V3 };
  yaw: number;
  pitch: number;
  /** Eye radius (width); height = size * tall. */
  size: number;
  tall?: number;
  /** How far the eye sinks into the surface (fraction of size). */
  inset?: number;
  iris?: string;
  pupil?: string;
  /** Rotate the eye's look a little forward from the surface normal (radians). */
  toward?: number;
  /** Optional rim (eyelid / eye-shadow) colour drawn as a slightly bigger dark ring. */
  rim?: string;
}

/**
 * Two glossy anime-style eyes: near-black with a warm iris glow at the bottom, two highlights
 * and a dark upper lid line. Returns the eye bones (scale Y to blink).
 */
export function addEyes(k: Kit, head: THREE.Bone, e: EyeSpec): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  const tall = e.tall ?? 1.2;
  const sz = e.size;
  const iris = new THREE.Color(e.iris ?? '#8a4a1c');
  const pupil = new THREE.Color(e.pupil ?? '#140d10');
  const eyePaint: Paint = (p, _n, out) => {
    const yy = p.y / (sz * tall);
    const xx = p.x / sz;
    const rr = Math.hypot(xx, yy);
    const ring = Math.max(0, Math.min(1, (rr - 0.42) / 0.2));
    const bottom = Math.max(0, Math.min(1, (0.25 - yy) / 0.9));
    out.copy(pupil).lerp(iris, ring * (0.15 + 0.85 * bottom));
  };
  const lidPaint = solid(e.rim ?? '#1c1214');
  for (const side of [1, -1]) {
    const { p, n } = onEllipsoid(e.on.c, e.on.r, side * e.yaw, e.pitch, (e.inset ?? 0.42) * sz);
    const b = k.bone(head, side > 0 ? 'eyeL' : 'eyeR', p.x, p.y, p.z);
    // Face the surface normal, nudged forward.
    const dir = n.clone().lerp(Z, e.toward ?? 0.25).normalize();
    b.quaternion.setFromUnitVectors(Z, dir);
    const g = ellipsoid(sz, sz * tall, sz * 0.5, 'eye');
    paint(g, eyePaint);
    k.add(g, 'gloss', b);
    // Upper lid line: a thin arc over the top of the eye, heavier at the outer corner.
    const lid: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (0.08 + 0.84 * (i / 6));
      lid.push([side * Math.cos(a) * sz * 1.02, Math.sin(a) * sz * tall * 1.0, sz * 0.2 + Math.sin(a) * sz * 0.12]);
    }
    const lidG = sweep(lid, [
      [0, sz * 0.06],
      [0.45, sz * 0.11],
      [1, sz * 0.05],
    ], { radial: 5, segs: 8, cap0: 1, cap1: 1, capRings: 2 });
    paint(lidG, lidPaint);
    k.add(lidG, 'soft', b);
    // Highlights: big one up and to the outside, small one low on the inside.
    const big = ellipsoid(sz * 0.3, sz * 0.38, sz * 0.12, 'tiny');
    k.add(big, 'glint', b, { pos: [side * sz * 0.3, sz * tall * 0.36, sz * 0.44] });
    const small = ellipsoid(sz * 0.13, sz * 0.13, sz * 0.08, 'tiny');
    k.add(small, 'glint', b, { pos: [-side * sz * 0.28, -sz * tall * 0.4, sz * 0.44] });
    bones.push(b);
  }
  return bones;
}

// ---------------------------------------------------------------------------------------------
// Ears
// ---------------------------------------------------------------------------------------------

export interface EarSpec {
  /** Base position of the left ear (mirrored for the right). */
  pos: V3;
  len: number;
  /** Half width at the base. */
  w: number;
  /** Thickness. */
  thick?: number;
  /** Rest orientation of the left ear: tilt outward (roll), back (pitch) and turn (yaw). */
  out: number;
  back: number;
  turn?: number;
  /** Where the ear is widest (0..1 along its length). */
  widest?: number;
  /** How rounded the tip is (0 pointy .. 1 round). */
  round?: number;
  cup?: number;
  outer: string;
  inner: string;
  /** Tip colour and how far down it reaches (fraction of length). */
  tip?: string;
  tipLen?: number;
  /** Back-of-ear colour (defaults to outer). */
  backColor?: string;
  /** Fern-frond ears: number of scalloped lobes along each edge, and their depth (0..1). */
  lobes?: number;
  lobeDepth?: number;
  /** Floppy ears: bend the upper part forward/down by this angle. */
  flop?: number;
  jiggle?: Partial<JiggleOpts>;
}

/** A pair of ears (cupped blades) on spring pivots. Returns bones + jiggle specs. */
export function addEars(k: Kit, head: THREE.Bone, e: EarSpec): { bones: THREE.Bone[]; jiggles: JiggleSpec[] } {
  const bones: THREE.Bone[] = [];
  const jiggles: JiggleSpec[] = [];
  const thick = e.thick ?? e.w * 0.28;
  const widest = e.widest ?? 0.3;
  const round = e.round ?? 0.2;
  const secs: Sec[] = [];
  const lobes = e.lobes ?? 0;
  const n = lobes ? lobes * 4 : 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let wt = t < widest ? 0.75 + 0.25 * Math.sin((t / widest) * (Math.PI / 2)) : Math.pow(Math.cos(((t - widest) / (1 - widest)) * (Math.PI / 2)), 1 - round * 0.6);
    if (lobes) wt *= 1 - (e.lobeDepth ?? 0.3) * Math.pow(Math.abs(Math.cos(t * lobes * Math.PI)), 3) * Math.min(1, t * 4);
    secs.push({ t: t * e.len, w: Math.max(e.w * 0.08, e.w * wt), h: thick, hb: thick * 0.8 });
  }
  const base = loft(secs, { axis: 'y', radial: 10, rings: lobes ? n : 8, cap0: thick, cap1: e.w * (0.1 + round * 0.5), capRings: 2 });
  // Cup: the front face is concave; flop bends the top.
  const cup = e.cup ?? 0.35;
  const flop = e.flop ?? 0;
  const pos = base.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y / e.len;
    let z = v.z - cup * e.w * (1 - Math.min(1, (v.x / e.w) ** 2)) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * 0.5;
    let y = v.y;
    if (flop) {
      const a = flop * Math.max(0, t - 0.35) / 0.65;
      const r = v.y - e.len * 0.35;
      if (r > 0) {
        // Fold the tip forward, over the ear's front face.
        y = e.len * 0.35 - Math.sin(a) * z + Math.cos(a) * r;
        z = Math.cos(a) * z + Math.sin(a) * r;
      }
    }
    pos.setXYZ(i, v.x, y, z);
  }
  base.computeVertexNormals();
  const inner = new THREE.Color(e.inner);
  const outer = new THREE.Color(e.outer);
  const backC = new THREE.Color(e.backColor ?? e.outer);
  const tipC = e.tip ? new THREE.Color(e.tip) : null;
  const tipFrom = 1 - (e.tipLen ?? 0.3);
  paint(base, (p, nn, out) => {
    const t = p.y / e.len;
    // Front face (normal +Z) shows the inner colour, framed by a rim of outer colour.
    const rim = Math.abs(p.x) / Math.max(1e-4, e.w * (1 - 0.7 * t));
    const front = Math.max(0, Math.min(1, (nn.z - 0.1) / 0.5)) * (1 - Math.min(1, Math.max(0, (rim - 0.55) / 0.3))) * (1 - Math.min(1, Math.max(0, (t - 0.85) / 0.15)));
    out.copy(nn.z < -0.2 ? backC : outer).lerp(inner, front);
    if (tipC) out.lerp(tipC, Math.max(0, Math.min(1, (t - tipFrom) / 0.12)));
  });
  for (const side of [1, -1]) {
    const b = k.bone(head, side > 0 ? 'earL' : 'earR', side * e.pos[0], e.pos[1], e.pos[2]);
    b.rotation.set(-e.back, side * (e.turn ?? 0), -side * e.out, 'YXZ');
    // The blade is symmetric in x, so both ears share it.
    k.add(base, 'fur', b);
    bones.push(b);
    jiggles.push({
      bone: b,
      tip: new THREE.Vector3(0, e.len, 0),
      opts: { freq: 14, zeta: 0.35, gain: 0.012, limit: 0.9, ...e.jiggle },
      role: 'ear',
      side,
    });
  }
  return { bones, jiggles };
}

/** Mirror a geometry across X (fixing winding and normals). */
export function mirrorX(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.scale(-1, 1, 1);
  const idx = g.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  idx.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Tails
// ---------------------------------------------------------------------------------------------

export interface TailSpec {
  /** Root position on the parent (pelvis) bone. */
  pos: V3;
  /** Rest curve points relative to the root (first should be [0,0,0]). */
  pts: V3[];
  /** Radius keys over u in [0,1]. */
  radius: Keys;
  bones: number;
  paint: Paint;
  /** Flatten the cross-section (ratio of the vertical half-axis), e.g. for beaver/seal tails. */
  ratio?: number;
  up?: V3;
  kind?: MatKind;
  radial?: number;
  segs?: number;
  jiggle?: Partial<JiggleOpts>;
  /** Weight of TAIL_UP per bone (defaults to decreasing) and of WAG (increasing). */
  upW?: number[];
  wagW?: number[];
}

/**
 * A skinned tail: one smooth swept mesh bound to a chain of bones placed along its rest curve,
 * each with a spring so the tail follows through and wags in a wave.
 */
export function addTail(k: Kit, parent: THREE.Bone, t: TailSpec, name = 'tail'): { bones: THREE.Bone[]; jiggles: JiggleSpec[] } {
  const curve = new THREE.CatmullRomCurve3(
    t.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
  );
  const n = t.bones;
  const knots: number[] = [];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (i < n) knots.push(u);
    pts.push(curve.getPointAt(u));
  }
  const bones: THREE.Bone[] = [];
  let prev: THREE.Object3D = parent;
  let prevPos = new THREE.Vector3(t.pos[0], t.pos[1], t.pos[2]);
  for (let i = 0; i < n; i++) {
    const world = new THREE.Vector3(t.pos[0], t.pos[1], t.pos[2]).add(pts[i]);
    const local = i === 0 ? world : world.clone().sub(prevPos);
    const b = k.bone(prev, `${name}${i}`, local.x, local.y, local.z);
    bones.push(b);
    prev = b;
    prevPos = world;
  }
  const us: number[] = [];
  const geo = sweep(t.pts, t.radius, {
    radial: t.radial ?? 11,
    segs: t.segs ?? 10,
    ratio: t.ratio ?? 1,
    up: t.up ?? [0, 1, 0],
    cap0: 0.6,
    cap1: 0.8,
    onVertex: (u) => us.push(u),
  });
  geo.translate(t.pos[0], t.pos[1], t.pos[2]);
  skin(geo, (_p, i, out) => chainWeights(us[i], knots, 0.6 / n, out));
  paint(geo, t.paint);
  k.addSkinned(geo, t.kind ?? 'fur', parent, bones);
  const jiggles: JiggleSpec[] = [];
  for (let i = 0; i < n; i++) {
    const tip = pts[i + 1].clone().sub(pts[i]);
    jiggles.push({
      bone: bones[i],
      tip,
      opts: { freq: 9 - i * 1.2, zeta: 0.38, gain: 0.01 + i * 0.004, limit: 0.8, ...t.jiggle },
      role: 'tail',
      side: 0,
      up: t.upW?.[i] ?? [0.5, 0.3, 0.2, 0.15, 0.1][i] ?? 0.1,
      wag: t.wagW?.[i] ?? [0.35, 0.45, 0.55, 0.6, 0.6][i] ?? 0.6,
      delay: i * 0.7,
    });
  }
  return { bones, jiggles };
}

// ---------------------------------------------------------------------------------------------
// Fur tufts, ruffs and misc
// ---------------------------------------------------------------------------------------------

export interface TuftSpec {
  pos: V3;
  /** Direction the tuft points (will be normalised). */
  dir: V3;
  r: number;
  len: number;
  curl?: number;
  ratio?: number;
}

const _up = new THREE.Vector3(0, 1, 0);
/** A cluster of teardrop tufts (cheek ruffs, chest fluff, manes). */
export function addTufts(k: Kit, bone: THREE.Bone, list: TuftSpec[], p: Paint, kind: MatKind = 'fur', mirror = false): void {
  for (const t of list) {
    for (const side of mirror ? [1, -1] : [1]) {
      const g = tuft(t.r, t.len, t.curl ?? 0, 6, t.ratio ?? 1);
      paint(g, p);
      const m = k.add(g, kind, bone, { pos: [t.pos[0] * side, t.pos[1], t.pos[2]] });
      const d = new THREE.Vector3(t.dir[0] * side, t.dir[1], t.dir[2]).normalize();
      m.quaternion.setFromUnitVectors(_up, d);
    }
  }
}

/** Shorthand for a painted ellipsoid on a bone. */
export function blobPart(
  k: Kit,
  bone: THREE.Object3D,
  r: V3,
  pos: V3,
  p: Paint,
  kind: MatKind = 'fur',
  rot?: V3,
  detail: Detail = 'mid',
): THREE.Mesh {
  const g = ellipsoid(r[0], r[1], r[2], detail);
  paint(g, p);
  return k.add(g, kind, bone, { pos, rot });
}

/** A swept tube part (antler tine, whisker, stalk). */
export function tube(
  k: Kit,
  bone: THREE.Object3D,
  pts: V3[],
  radius: number | Keys,
  p: Paint,
  kind: MatKind = 'fur',
  radial = 8,
  segs = 8,
): THREE.Mesh {
  const g = sweep(pts, radius, { radial, segs, cap0: 1, cap1: 1 });
  paint(g, p);
  return k.add(g, kind, bone);
}

/** A leaf blade on a bone, oriented by Euler (YXZ). */
export function leafPart(
  k: Kit,
  bone: THREE.Object3D,
  w: number,
  len: number,
  pos: V3,
  rot: V3,
  p: Paint,
  cup = 0.3,
): THREE.Mesh {
  const g = leaf(w, len, Math.max(0.002, w * 0.08), cup);
  paint(g, p);
  return k.add(g, 'leaf', bone, { pos, rot });
}

/** Gradient helpers for common markings. */
export const M = {
  /** Underside: normals facing down, below a height. */
  belly(yTop: number, soft = 0.04): Mask {
    return mul(facing(0, -1, 0, -0.35, 0.25), along('y', yTop + soft, yTop - soft));
  },
  /** Below a height. */
  below(y: number, soft = 0.02): Mask {
    return along('y', y + soft, y - soft);
  },
  above(y: number, soft = 0.02): Mask {
    return along('y', y - soft, y + soft);
  },
  front(z: number, soft = 0.02): Mask {
    return along('z', z - soft, z + soft);
  },
  behind(z: number, soft = 0.02): Mask {
    return along('z', z + soft, z - soft);
  },
  blob,
};

export { layered, solid };
