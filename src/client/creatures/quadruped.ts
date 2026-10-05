import * as THREE from 'three';
import {
  blend1D,
  clamp,
  footRoll,
  legCycleZ,
  smoothstep,
  solveTwoBone,
  spring,
  stepSpring,
  type IkResult,
  type LegZ,
  type Spring,
} from '../player/anim-math';
import { CH, CreatureBase, wobble, type BaseInit } from './core';
import { JiggleSet } from './secondary';
import { ellipsoid, loft, paint, sweep, type Paint, type Sec, type V3 } from './geo';
import { chainWeights, skin, type Kit } from './kit';
import type { JiggleSpec } from './parts';

/**
 * Four-legged body plan (deer, lynx, dogs, rodents, rabbits).
 *
 *   body ─┬─ pelvis ─┬─ hind legs: upper ─ lower ─ end (metatarsus) ─ paw      (x2)
 *         │          └─ tail chain (springs)
 *         ├─ chest ──┬─ fore legs: upper ─ lower ─ end (pastern) ─ paw          (x2)
 *         │          └─ neck ─ head ─ ears (springs), eyes, jaw
 *         └─ belly (breathing)
 *
 * The torso is one smooth loft skinned to pelvis / chest / belly, so the spine can flex in a
 * gallop. Legs are placed with two-bone IK plus an end segment whose angle follows the stride
 * (hock / wrist flex and the paw flip in swing). The stride phase advances with distance
 * travelled, so planted paws stay put on the ground at any speed; gaits blend by Froude-scaled
 * speed (walk -> trot -> gallop, or hops for rabbits), each with its own phase offsets, duty
 * factor, stride length, body bob, pitch and spine flex.
 */

export type GaitFamily = 'cat' | 'dog' | 'deer' | 'hop' | 'scurry';

interface Gait {
  /** Froude speed factor: this gait is fully in use at k * sqrt(g * L). */
  k: number;
  duty: number;
  /** Stride length / leg length. */
  stride: number;
  /** Phase offsets: LH, RH, LF, RF. */
  off: [number, number, number, number];
  bob: number;
  bobN: number;
  /** Phase of the lowest point of the bob. */
  bobPh: number;
  pitch: number;
  pitchPh: number;
  flex: number;
  flexPh: number;
  roll: number;
  /** Swing height / leg length. */
  lift: number;
  head: number;
  tail: number;
}

const g = (o: Partial<Gait> & Pick<Gait, 'k' | 'duty' | 'stride' | 'off'>): Gait => ({
  bob: 0.02,
  bobN: 2,
  bobPh: 0.1,
  pitch: 0.02,
  pitchPh: 0,
  flex: 0.02,
  flexPh: 0,
  roll: 0.02,
  lift: 0.15,
  head: 0.03,
  tail: 0.05,
  ...o,
});

const WALK = (k: number, stride = 1.25): Gait =>
  g({ k, duty: 0.64, stride, off: [0, 0.5, 0.25, 0.75], bob: 0.022, bobN: 2, bobPh: 0.12, roll: 0.03, lift: 0.15, head: 0.035 });
const TROT = (k: number, stride = 1.9): Gait =>
  g({ k, duty: 0.44, stride, off: [0, 0.5, 0.5, 1.0], bob: 0.045, bobN: 2, bobPh: 0.16, roll: 0.02, lift: 0.22, head: 0.05, flex: 0.03 });

const GAITS: Record<GaitFamily, Gait[]> = {
  cat: [
    WALK(0.42, 1.2),
    TROT(1.0, 1.85),
    g({ k: 2.2, duty: 0.3, stride: 3.0, off: [0, 0.1, 0.5, 0.6], bob: 0.07, bobN: 1, bobPh: 0.45, pitch: 0.14, pitchPh: -0.05, flex: 0.26, flexPh: 0.9, roll: 0.01, lift: 0.3, head: 0.08, tail: 0.15 }),
  ],
  dog: [
    WALK(0.45, 1.3),
    TROT(1.05, 2.0),
    g({ k: 2.3, duty: 0.32, stride: 3.0, off: [0, 0.12, 0.5, 0.62], bob: 0.065, bobN: 1, bobPh: 0.45, pitch: 0.12, pitchPh: -0.05, flex: 0.22, flexPh: 0.9, roll: 0.01, lift: 0.28, head: 0.08, tail: 0.12 }),
  ],
  deer: [
    WALK(0.42, 1.25),
    TROT(1.05, 2.0),
    g({ k: 2.2, duty: 0.3, stride: 2.8, off: [0, 0.06, 0.5, 0.56], bob: 0.1, bobN: 1, bobPh: 0.45, pitch: 0.15, pitchPh: -0.05, flex: 0.12, flexPh: 0.9, roll: 0.01, lift: 0.32, head: 0.07, tail: 0.1 }),
  ],
  hop: [
    g({ k: 0.55, duty: 0.5, stride: 1.4, off: [0, 0.03, 0.55, 0.6], bob: 0.09, bobN: 1, bobPh: 0.45, pitch: 0.12, pitchPh: -0.05, flex: 0.16, flexPh: 0.92, roll: 0, lift: 0.22, head: 0.05, tail: 0.05 }),
    g({ k: 1.3, duty: 0.38, stride: 2.4, off: [0, 0.04, 0.52, 0.58], bob: 0.12, bobN: 1, bobPh: 0.45, pitch: 0.15, pitchPh: -0.05, flex: 0.24, flexPh: 0.92, roll: 0, lift: 0.3, head: 0.06, tail: 0.06 }),
    g({ k: 2.6, duty: 0.28, stride: 3.4, off: [0, 0.05, 0.5, 0.57], bob: 0.13, bobN: 1, bobPh: 0.45, pitch: 0.17, pitchPh: -0.05, flex: 0.3, flexPh: 0.92, roll: 0, lift: 0.34, head: 0.07, tail: 0.06 }),
  ],
  scurry: [
    WALK(0.5, 1.5),
    TROT(1.1, 2.2),
    g({ k: 2.2, duty: 0.34, stride: 3.0, off: [0, 0.06, 0.45, 0.55], bob: 0.08, bobN: 1, bobPh: 0.45, pitch: 0.1, pitchPh: -0.05, flex: 0.25, flexPh: 0.9, roll: 0, lift: 0.3, head: 0.06, tail: 0.08 }),
  ],
};

// ---------------------------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------------------------

/** Paint along a leg: f = 0 at the hip/shoulder, 1 at the ground. */
export type LegPaint = (f: number, p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

export interface LegDef {
  /** Joint position (left leg) on the pelvis / chest bone. */
  x: number;
  y: number;
  z: number;
  /** Upper, lower and end (metatarsus / pastern) lengths. */
  lens: [number, number, number];
  /** Radius at the top, knee, ankle and the paw joint. */
  radii: [number, number, number, number];
  /** Height of the paw joint above the ground at rest. */
  pawH: number;
  /** Rest angle of the end segment from vertical (+ = upper joint behind the paw). */
  a0: number;
  /** How much the end angle follows the paw's fore-aft offset (per leg length). */
  ka?: number;
  /** End-segment flip during swing (radians; paw folds back). */
  flip?: number;
  /** Paw rest offset (outward x, forward z) relative to the joint. */
  splay?: number;
  footZ?: number;
  paw: { len: number; w: number; h: number; fwd?: number };
  /** Muscle bulge of the upper segment. */
  bulge?: number;
  /** Sideways flattening of the leg tube (1 = round). */
  ratio?: number;
}

export interface HeadParts {
  eyes: THREE.Bone[];
  jiggles?: JiggleSpec[];
  jaw?: THREE.Bone;
  /** Bones that flare with curiosity (scaled up, glow boosted). */
  glow?: THREE.Bone[];
}

export interface QuadDef {
  gait: GaitFamily;
  bodyY: number;
  hipZ: number;
  shoulderZ: number;
  /** Torso sections along z in the body bone's frame. */
  torso: Sec[];
  torsoPaint: Paint;
  torsoExp?: number;
  hind: LegDef;
  fore: LegDef;
  legPaint: (fore: boolean) => LegPaint;
  neck: { pos: V3; len: number; pitch: number; r0: number; r1: number; paint: Paint };
  head: (k: Kit, head: THREE.Bone) => HeadParts;
  tail?: (k: Kit, pelvis: THREE.Bone) => { bones: THREE.Bone[]; jiggles: JiggleSpec[] };
  extras?: (k: Kit, r: { body: THREE.Bone; pelvis: THREE.Bone; chest: THREE.Bone; belly: THREE.Bone; neck: THREE.Bone; head: THREE.Bone }) => {
    jiggles?: JiggleSpec[];
    glow?: THREE.Bone[];
  } | void;
  /** Idle head carriage (radians, + = nose up). */
  headUp?: number;
  /** Multiplier on idle look-around amplitude. */
  curiosity?: number;
}

export interface LegRig {
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
  paw: THREE.Bone;
  fore: boolean;
  side: number;
  hip: THREE.Vector3;
  lens: [number, number, number];
  pawH: number;
  a0: number;
  ka: number;
  flip: number;
  restX: number;
  restZ: number;
  heel: number;
  ball: number;
  limp: THREE.Quaternion[];
}

export interface QuadRig {
  body: THREE.Bone;
  pelvis: THREE.Bone;
  chest: THREE.Bone;
  belly: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  jaw: THREE.Bone | null;
  legs: LegRig[];
  eyes: THREE.Bone[];
  jiggles: JiggleSpec[];
  glow: THREE.Bone[];
  bodyY: number;
  hipZ: number;
  shoulderZ: number;
  neckRest: number;
  headRest: number;
  jawRest: number;
  /** Hind hip height (leg length scale). */
  L: number;
  halfWidth: number;
  halfLen: number;
  gait: GaitFamily;
  headUp: number;
  curiosity: number;
}

// ---------------------------------------------------------------------------------------------
// IK
// ---------------------------------------------------------------------------------------------

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_DOWN = new THREE.Vector3(0, -1, 0);
const _J = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _d = new THREE.Vector3();
const _Q = new THREE.Quaternion();
const _Q2 = new THREE.Quaternion();
const _Qi = new THREE.Quaternion();
const _ik: IkResult = { bend: 0, reach: 0 };

/**
 * Place one leg: `P` is the paw joint target and `a` the end segment's angle from vertical, in
 * the scaled root's space. `M`/`Minv`/`Q` are the leg parent's transform relative to that space.
 */
function solveLeg(leg: LegRig, Minv: THREE.Matrix4, Q: THREE.Quaternion, P: THREE.Vector3, a: number, pawPitch: number): void {
  const [l1, l2, l3] = leg.lens;
  _J.set(P.x, P.y + l3 * Math.cos(a), P.z - l3 * Math.sin(a)).applyMatrix4(Minv).sub(leg.hip);
  _Qi.copy(Q).invert();
  _pole.set(0, 0, leg.fore ? -1 : 1).applyQuaternion(_Qi);
  // Splay the knees/elbows slightly outwards.
  _pole.x += leg.side * 0.15;
  solveTwoBone(_J, _pole, l1, l2, leg.fore ? -1 : 1, leg.upper.quaternion, _ik);
  leg.lower.quaternion.setFromAxisAngle(X_AXIS, leg.fore ? -_ik.bend : _ik.bend);
  _Q.copy(Q).multiply(leg.upper.quaternion).multiply(leg.lower.quaternion);
  _d.set(0, -Math.cos(a), Math.sin(a)).applyQuaternion(_Q2.copy(_Q).invert());
  leg.end.quaternion.setFromUnitVectors(Y_DOWN, _d);
  _Q.multiply(leg.end.quaternion);
  _Q2.setFromAxisAngle(X_AXIS, pawPitch);
  leg.paw.quaternion.copy(_Q).invert().multiply(_Q2);
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

export function buildQuad(k: Kit, d: QuadDef): QuadRig {
  const body = k.bone(k.scaled, 'body', 0, d.bodyY, 0);
  const pelvis = k.bone(body, 'pelvis', 0, 0, d.hipZ);
  const chest = k.bone(body, 'chest', 0, 0, d.shoulderZ);
  const mid = (d.hipZ + d.shoulderZ) / 2;
  const belly = k.bone(body, 'belly', 0, 0, mid);

  // Torso: one smooth loft, skinned to pelvis / chest / belly.
  const torso = loft(d.torso, { radial: 16, rings: 14, capRings: 4, exp: d.torsoExp });
  const span = d.shoulderZ - d.hipZ;
  skin(torso, (p, _i, out) => {
    const tc = smoothstep(d.hipZ + span * 0.1, d.shoulderZ - span * 0.1, p.z);
    const bw = 0.6 * Math.max(0, 1 - Math.abs(p.z - mid) / (span * 0.55));
    out.idx[0] = 0;
    out.w[0] = (1 - tc) * (1 - bw);
    out.idx[1] = 1;
    out.w[1] = tc * (1 - bw);
    out.idx[2] = 2;
    out.w[2] = bw;
  });
  paint(torso, d.torsoPaint);
  k.addSkinned(torso, 'fur', body, [pelvis, chest, belly]);
  let halfWidth = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const s of d.torso) {
    halfWidth = Math.max(halfWidth, s.w);
    zMin = Math.min(zMin, s.t);
    zMax = Math.max(zMax, s.t);
  }

  // Legs: LH, RH, LF, RF.
  const legs: LegRig[] = [];
  const order: [boolean, number][] = [
    [false, 1],
    [false, -1],
    [true, 1],
    [true, -1],
  ];
  for (const [fore, side] of order) {
    const def = fore ? d.fore : d.hind;
    const parent = fore ? chest : pelvis;
    const nm = (fore ? 'fore' : 'hind') + (side > 0 ? 'L' : 'R');
    const [l1, l2, l3] = def.lens;
    const upper = k.bone(parent, `${nm}Upper`, side * def.x, def.y, def.z);
    const lower = k.bone(upper, `${nm}Lower`, 0, -l1, 0);
    const end = k.bone(lower, `${nm}End`, 0, -l2, 0);
    const paw = k.bone(end, `${nm}Paw`, 0, -l3, 0);
    const lp = d.legPaint(fore);
    const pw = def.paw;
    const fwd = pw.fwd ?? pw.len * 0.35;
    k.add(ellipsoid(pw.w, pw.h, pw.len, 'lo'), 'fur', paw, {
      pos: [0, -def.pawH + pw.h, fwd],
      paint: (p, n, out) => lp(1, p, n, out),
    });
    legs.push({
      upper,
      lower,
      end,
      paw,
      fore,
      side,
      hip: upper.position.clone(),
      lens: [l1, l2, l3],
      pawH: def.pawH,
      a0: def.a0,
      ka: def.ka ?? 0.9,
      flip: def.flip ?? (fore ? 1.3 : 0.8),
      restX: side * (def.x + (def.splay ?? 0)),
      restZ: (fore ? d.shoulderZ : d.hipZ) + def.z + (def.footZ ?? 0),
      heel: pw.len - fwd,
      ball: pw.len * 0.7 + fwd,
      limp: [],
    });
  }

  // Neck and head.
  const nk = d.neck;
  const neck = k.bone(chest, 'neck', nk.pos[0], nk.pos[1], nk.pos[2]);
  neck.rotation.x = nk.pitch;
  const neckGeo = sweep(
    [
      [0, 0, 0],
      [0, nk.len * 0.5, 0],
      [0, nk.len, 0],
    ],
    [
      [0, nk.r0],
      [1, nk.r1],
    ],
    { radial: 12, segs: 2, up: [0, 0, 1], capRings: 3 },
  );
  k.add(neckGeo, 'fur', neck, { paint: nk.paint });
  const head = k.bone(neck, 'head', 0, nk.len, 0);
  head.rotation.x = -nk.pitch;
  const hp = d.head(k, head);

  const jiggles: JiggleSpec[] = [...(hp.jiggles ?? [])];
  if (d.tail) jiggles.push(...d.tail(k, pelvis).jiggles);
  const glow: THREE.Bone[] = [...(hp.glow ?? [])];
  const ex = d.extras?.(k, { body, pelvis, chest, belly, neck, head });
  if (ex) {
    if (ex.jiggles) jiggles.push(...ex.jiggles);
    if (ex.glow) glow.push(...ex.glow);
  }

  const rig: QuadRig = {
    body,
    pelvis,
    chest,
    belly,
    neck,
    head,
    jaw: hp.jaw ?? null,
    legs,
    eyes: hp.eyes,
    jiggles,
    glow,
    bodyY: d.bodyY,
    hipZ: d.hipZ,
    shoulderZ: d.shoulderZ,
    neckRest: nk.pitch,
    headRest: -nk.pitch,
    jawRest: hp.jaw ? hp.jaw.rotation.x : 0,
    L: d.bodyY + d.hind.y,
    halfWidth,
    halfLen: (zMax - zMin) / 2,
    gait: d.gait,
    headUp: d.headUp ?? 0,
    curiosity: d.curiosity ?? 1,
  };

  // Rest pose: solve the legs standing, skin one smooth tube per leg to that pose, then record
  // limp poses for fainting.
  poseLegsAtRest(rig);
  k.root.updateMatrixWorld(true);
  for (const leg of legs) legMesh(k, leg, leg.fore ? d.fore : d.hind, d.legPaint(leg.fore));
  for (const leg of legs) {
    const fold = leg.fore ? 1 : -1;
    const q = (x: number, y = 0, z = 0): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    leg.limp = [q(fold * 0.55, 0, leg.side * 0.25), q(-fold * 0.8), q(fold * 0.5), q(0.6)];
  }
  return rig;
}

/**
 * One continuous tube from inside the torso through hip, knee, ankle and the paw joint, skinned
 * to the leg bones with soft blends at the joints (no capsule seams), flattened sideways a little
 * so thighs and shoulders read as muscle rather than pipes.
 */
function legMesh(k: Kit, leg: LegRig, def: LegDef, lp: LegPaint): void {
  const parent = leg.upper.parent!;
  const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const at = (b: THREE.Object3D): THREE.Vector3 => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv);
  const hip = at(leg.upper);
  const knee = at(leg.lower);
  const ankle = at(leg.end);
  const pawJ = at(leg.paw);
  const [r0, r1, r2, r3] = def.radii;
  const top = hip.clone().add(hip.clone().sub(knee).normalize().multiplyScalar(r0 * 0.9));
  const d0 = top.distanceTo(hip);
  const [l1, l2, l3] = leg.lens;
  const T = d0 + l1 + l2 + l3;
  const uHip = d0 / T;
  const uKnee = (d0 + l1) / T;
  const uAnkle = (d0 + l1 + l2) / T;
  const bulge = 1 + (def.bulge ?? 0);
  const radius: [number, number][] = [
    [0, r0 * 0.72],
    [uHip, r0 * Math.min(1.1, bulge)],
    [uHip + (uKnee - uHip) * 0.4, (r0 * 0.6 + r1 * 0.4) * bulge],
    [uKnee, r1],
    [uKnee + (uAnkle - uKnee) * 0.45, r1 * 0.55 + r2 * 0.45],
    [uAnkle, r2],
    [1, r3],
  ];
  const us: number[] = [];
  const v3 = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];
  const geo = sweep([v3(top), v3(hip), v3(knee), v3(ankle), v3(pawJ)], radius, {
    radial: 10,
    segs: 12,
    ratio: def.ratio ?? (leg.fore ? 0.86 : 0.8),
    up: [0, 0, 1],
    cap0: 0.8,
    cap1: 0.9,
    capRings: 3,
    onVertex: (u) => us.push(u),
  });
  const knots = [0, uKnee, uAnkle, 1 - 1e-4];
  const blend = (r1 * 0.9) / T;
  skin(geo, (_p, i, out) => chainWeights(us[i], knots, blend, out));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const span = l1 + l2 + l3 + leg.pawH;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    lp(clamp((us[i] * T - d0) / span, 0, 1), p, n, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  k.addSkinned(geo, 'fur', parent, [leg.upper, leg.lower, leg.end, leg.paw]);
}

function poseLegsAtRest(r: QuadRig): void {
  const M = new THREE.Matrix4();
  const Minv = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  r.body.updateMatrix();
  r.pelvis.updateMatrix();
  r.chest.updateMatrix();
  for (const leg of r.legs) {
    const parent = leg.fore ? r.chest : r.pelvis;
    M.multiplyMatrices(r.body.matrix, parent.matrix);
    Minv.copy(M).invert();
    Q.copy(r.body.quaternion).multiply(parent.quaternion);
    P.set(leg.restX, leg.pawH, leg.restZ);
    solveLeg(leg, Minv, Q, P, leg.a0, 0);
  }
}

/** Faint / hit / lunge parameters for this rig, given its measured design height S. */
export function quadClipParams(r: QuadRig, S: number): { lieY: number; faintRoll: number; lunge: number; rear: number; hop: number } {
  return {
    lieY: (r.halfWidth * 1.05 - r.bodyY) / S,
    faintRoll: 1.42,
    lunge: (0.5 * r.halfLen) / S,
    rear: r.gait === 'hop' ? 0.35 : 0.42,
    hop: (0.28 * r.L) / S,
  };
}

// ---------------------------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------------------------

const _M = new THREE.Matrix4();
const _Minv = new THREE.Matrix4();
const _QP = new THREE.Quaternion();
const _P = new THREE.Vector3();
const _roll = { z: 0, y: 0 };
const _lz: LegZ = { z: 0, stance: true, t: 0 };

export class QuadModel extends CreatureBase {
  private readonly r: QuadRig;
  private readonly jig: JiggleSet;
  private readonly gaits: Gait[];
  private readonly samples: number[];
  private readonly wts: number[] = [];
  private readonly gb: Gait;
  private cycle = 0;
  private move = 0;
  private sweepLen = 0;
  private duty = 0.6;
  private breath = 0;
  private readonly lean: Spring = spring();
  private readonly lookY: Spring = spring();
  private readonly lookP: Spring = spring();
  private lookTY = 0;
  private lookTP = 0;
  private lookTimer = 1.5;

  constructor(init: BaseInit, rig: QuadRig) {
    super(init);
    this.r = rig;
    this.gaits = GAITS[rig.gait];
    // Froude speeds from the real (world) leg length, expressed back in design units.
    const sq = Math.sqrt(9.8 * rig.L * init.scale) / init.scale;
    this.samples = [0, ...this.gaits.map((x) => x.k * sq)];
    this.gb = { ...this.gaits[0], off: [...this.gaits[0].off] };
    this.jig = new JiggleSet(rig.jiggles);
    this.cycle = this.rand();
    this.update(0, 0);
  }

  protected resetPlan(): void {
    this.jig.reset();
    this.lean.x = 0;
    this.lean.v = 0;
  }

  protected locomote(dt: number): void {
    const r = this.r;
    const b = this.base;
    const S = this.S;
    const L = r.L;
    // Turning on the spot still steps the feet.
    const turnV = Math.abs(this.yawRate) * r.halfLen * 0.9;
    const v = Math.max(this.speed, turnV);
    blend1D(this.samples, v, this.wts);
    // Blend gait parameters (the standing weight uses the slowest gait's shape).
    const gb = this.gb;
    const keys: (keyof Gait)[] = ['duty', 'stride', 'bob', 'bobN', 'bobPh', 'pitch', 'pitchPh', 'flex', 'flexPh', 'roll', 'lift', 'head', 'tail'];
    for (const key of keys) (gb[key] as number) = 0;
    gb.off[0] = gb.off[1] = gb.off[2] = gb.off[3] = 0;
    for (let i = 0; i < this.wts.length; i++) {
      const w = this.wts[i];
      if (w === 0) continue;
      const gi = this.gaits[Math.max(0, i - 1)];
      for (const key of keys) (gb[key] as number) += (gi[key] as number) * w;
      for (let q = 0; q < 4; q++) gb.off[q] += gi.off[q] * w;
    }
    const fMax = 2.4 / Math.sqrt(L * this.scale);
    const strideLen = Math.max(gb.stride * L, v / fMax);
    this.duty = Math.min(gb.duty, (0.9 * L) / strideLen);
    this.sweepLen = strideLen * this.duty;
    this.cycle += (v * dt) / strideLen;
    const m = smoothstep(0, this.samples[1] * 0.45, v);
    this.move = m;
    this.idleW = 1 - m;
    const u = this.cycle;
    const TAU = Math.PI * 2;

    // Gait body motion (Y in units of S).
    const bobN = Math.max(1, Math.round(gb.bobN));
    b[CH.Y] += (-gb.bob * L * Math.cos(TAU * bobN * (u - gb.bobPh)) * m) / S;
    b[CH.PITCH] += gb.pitch * Math.sin(TAU * (u - gb.pitchPh)) * m;
    b[CH.FLEX] += gb.flex * Math.cos(TAU * (u - gb.flexPh)) * m;
    b[CH.ROLL] += gb.roll * Math.sin(TAU * u) * m;
    b[CH.HEAD_P] += gb.head * Math.cos(TAU * bobN * (u - gb.bobPh)) * m;
    b[CH.TAIL_UP] += gb.tail * Math.sin(TAU * bobN * (u - gb.bobPh)) * m + 0.12 * m;
    // Lean into acceleration (spring, so it overshoots a little on stops), and into turns.
    stepSpring(this.lean, clamp(-this.accel * 0.05 * (L / Math.max(L, 0.3)), -0.22, 0.22), 9, 0.55, dt);
    b[CH.PITCH] += this.lean.x;
    b[CH.ROLL] += clamp(-this.yawRate * this.speed * 0.05, -0.25, 0.25);
    b[CH.HEAD_Y] += clamp(this.yawRate * 0.14, -0.45, 0.45);
    b[CH.EARS] += 0.25 * smoothstep(this.samples[2], this.samples[3], v);

    // Idle life.
    const iw = this.idleW;
    const period = 1.7 + 1.5 * S * this.scale;
    this.breath = Math.sin((this.time * TAU) / period);
    b[CH.FLEX] += 0.012 * this.breath;
    b[CH.X] += 0.008 * wobble(this.time * 0.35, this.seed) * iw;
    b[CH.ROLL] += 0.018 * wobble(this.time * 0.3, this.seed + 3) * iw;
    b[CH.HEAD_P] += r.headUp;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      const c = r.curiosity;
      this.lookTY = (this.rand() * 2 - 1) * 0.45 * c;
      this.lookTP = (this.rand() * 0.35 - 0.12) * c;
      this.lookTimer = 1.2 + this.rand() * 3.2;
    }
    stepSpring(this.lookY, this.lookTY, 7, 0.75, dt);
    stepSpring(this.lookP, this.lookTP, 7, 0.75, dt);
    b[CH.HEAD_Y] += this.lookY.x * iw;
    b[CH.HEAD_P] += this.lookP.x * iw;
  }

  protected apply(dt: number): void {
    const r = this.r;
    const p = this.pose;
    const S = this.S;
    const t = this.time;
    const TAU = Math.PI * 2;
    const limp = p[CH.LIMP];

    // Squash & stretch about the feet.
    const sy = 1 + clamp(p[CH.SQUASH], -0.4, 0.4);
    const sxz = 1 / Math.sqrt(sy);
    this.scaled.scale.set(this.scale * sxz, this.scale * sy, this.scale * sxz);

    // Body.
    let x = p[CH.X] * S;
    let y = r.bodyY + p[CH.Y] * S;
    let z = p[CH.Z] * S;
    const tr = p[CH.TREMBLE];
    if (tr > 0) {
      x += tr * 0.006 * S * Math.sin(t * TAU * 21);
      y += tr * 0.004 * S * Math.sin(t * TAU * 17 + 1);
    }
    const roll = p[CH.ROLL] + p[CH.SHAKE] * 0.24 * Math.sin(t * TAU * 7.5);
    const rear = p[CH.REAR];
    // Rear-ups pivot about the hips.
    const oy = 0;
    const oz = -r.hipZ;
    const c = Math.cos(-rear);
    const s = Math.sin(-rear);
    y += oy * c - oz * s - oy;
    z += oy * s + oz * c - oz;
    const pitch = p[CH.PITCH] + rear;
    r.body.position.set(x, y, z);
    r.body.rotation.set(-pitch, p[CH.YAW], roll, 'YXZ');
    const flex = p[CH.FLEX];
    const twist = clamp(this.yawRate * 0.07, -0.2, 0.2);
    r.pelvis.rotation.set(-flex * 0.5, -twist, 0, 'YXZ');
    r.chest.rotation.set(flex * 0.5, twist, 0, 'YXZ');
    r.belly.scale.set(1 + this.breath * 0.035, 1 + this.breath * 0.03, 1);

    // Neck & head, keeping the gaze steadier than the body.
    // Nose-up angle the head inherits from the body (pitch) and the chest (flex).
    const stab = 0.65 * (pitch - flex * 0.5);
    r.neck.rotation.set(r.neckRest - p[CH.NECK] - p[CH.HEAD_P] * 0.3 + stab * 0.4, p[CH.HEAD_Y] * 0.35, -roll * 0.3, 'YXZ');
    r.head.rotation.set(
      r.headRest - p[CH.HEAD_P] * 0.7 + stab * 0.6 + p[CH.SNIFF] * 0.06 * Math.sin(t * TAU * 7),
      p[CH.HEAD_Y] * 0.65,
      p[CH.HEAD_R] - roll * 0.4 - p[CH.SHAKE] * 0.3 * Math.sin(t * TAU * 7.5 + 0.6),
      'YXZ',
    );
    if (r.jaw) r.jaw.rotation.x = r.jawRest + p[CH.JAW] * 0.5;
    this.applyFace(r.eyes, r.glow);

    // Legs.
    r.body.updateMatrix();
    r.pelvis.updateMatrix();
    r.chest.updateMatrix();
    const L = r.L;
    const m = this.move;
    for (let i = 0; i < 4; i++) {
      const leg = r.legs[i];
      const parent = leg.fore ? r.chest : r.pelvis;
      _M.multiplyMatrices(r.body.matrix, parent.matrix);
      _Minv.copy(_M).invert();
      _QP.copy(r.body.quaternion).multiply(parent.quaternion);
      legCycleZ(this.cycle + this.gb.off[i], this.duty, this.sweepLen, 0.45, 0.55, _lz);
      const zc = _lz.z * m;
      let lift = 0;
      let flipA = 0;
      let pp = 0;
      if (!_lz.stance) {
        const st = _lz.t;
        lift = this.gb.lift * L * Math.sin(Math.PI * Math.pow(st, 0.8)) * m;
        flipA = leg.flip * Math.sin(Math.PI * Math.min(1, st * 1.15)) * m;
        pp = 0.55 * Math.sin(Math.PI * st) * m;
      } else {
        pp = 0.4 * smoothstep(0.72, 1, _lz.t) * m;
      }
      const fz = (leg.fore ? p[CH.FORE_Z] : p[CH.HIND_Z]) * S;
      const fl = Math.max(0, (leg.fore ? p[CH.FORE_LIFT] : p[CH.HIND_LIFT]) * S);
      flipA += leg.flip * 0.8 * clamp(fl / (0.12 * S), 0, 1);
      pp += 0.4 * clamp(fl / (0.12 * S), 0, 1);
      const a = leg.a0 + (leg.ka * (zc + (leg.fore ? 0 : fz * 0.3))) / L - flipA;
      footRoll(-pp, leg.pawH, leg.heel, leg.ball, _roll);
      _P.set(leg.restX, _roll.y + lift + fl, leg.restZ + zc + fz + _roll.z);
      solveLeg(leg, _Minv, _QP, _P, a, pp);
      if (limp > 0) {
        leg.upper.quaternion.slerp(leg.limp[0], limp);
        leg.lower.quaternion.slerp(leg.limp[1], limp);
        leg.end.quaternion.slerp(leg.limp[2], limp);
        leg.paw.quaternion.slerp(leg.limp[3], limp);
      }
    }

    // Secondary motion.
    this.root.updateMatrixWorld(true);
    this.jig.update(p, dt, t, this.idleW);
  }
}
