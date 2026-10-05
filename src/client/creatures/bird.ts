import * as THREE from 'three';
import { clamp, legCycleZ, smoothstep, solveTwoBone, spring, stepSpring, type IkResult, type LegZ, type Spring } from '../player/anim-math';
import { CH, CreatureBase, wobble, type BaseInit } from './core';
import { ellipsoid, loft, paint, sweep, type Paint, type Sec, type V3 } from './geo';
import type { Kit, MatKind } from './kit';
import { addEyes, addTufts, type JiggleSpec } from './parts';
import type { HeadParts } from './quadruped';
import { JiggleSet } from './secondary';

/**
 * Bird body plan (Finchlet, Fjordling, Skjaldhawk).
 *
 *   body ─┬─ neck ─ head (beak, eyes, crest)
 *         ├─ wing ─ hand (x2): folded against the flanks, spread and flapped in flight
 *         ├─ tail fan (spring)
 *         └─ hip ─ thigh ─ shank ─ foot (x2, two-bone IK)
 *
 * Ground locomotion is either two-footed hopping (both feet planted together, body arcing
 * between hops) or walking with alternating steps and a pigeon-style head bob. Birds that fly
 * blend into flight at speed (or always fly): the body rises, wings flap with a downstroke-heavy
 * curve, legs tuck back and the body banks into turns. All phases advance with distance (or
 * time while hovering), so planted feet stay put.
 */

export interface BirdDef {
  ground: 'hop' | 'walk';
  /** 'never': ground only; 'fast': takes off above `takeoff` m/s; 'always': always airborne. */
  fly: 'never' | 'fast' | 'always';
  takeoff?: number;
  bodyY: number;
  /** Body sections along z (body frame). */
  body: Sec[];
  bodyPaint: Paint;
  /** Rest body pitch (+ = nose up). */
  pitch: number;
  hip: V3;
  leg: { thigh: number; shank: number; r: [number, number, number]; toe: number; paint: Paint; thighPaint: Paint };
  neck: { pos: V3; len: number; pitch: number; r0: number; r1: number; paint: Paint };
  head: (k: Kit, head: THREE.Bone) => HeadParts;
  wing: {
    pos: V3;
    /** Arm and hand span. */
    arm: number;
    hand: number;
    /** Chord at the shoulder, wrist and tip. */
    chord: [number, number, number];
    paint: Paint;
    kind?: MatKind;
    /** Back-sweep of the spread wing. */
    sweep?: number;
    /** Feather fingers along the trailing edge of the hand (count). */
    fingers?: number;
  };
  tail: { pos: V3; len: number; w: number; paint: Paint; pitch: number; fork?: number };
  /** Body centre height in flight / hover. */
  flightY: number;
  /** Flap frequency at hover (Hz) and in cruise. */
  flapHz: [number, number];
  extras?: (k: Kit, r: { body: THREE.Bone; neck: THREE.Bone; head: THREE.Bone; tail: THREE.Bone }) => { jiggles?: JiggleSpec[]; glow?: THREE.Bone[] } | void;
  headUp?: number;
}

interface BirdLeg {
  hip: THREE.Bone;
  thigh: THREE.Bone;
  shank: THREE.Bone;
  foot: THREE.Bone;
  side: number;
  l1: number;
  l2: number;
  footH: number;
  restX: number;
  restZ: number;
}

export interface BirdRig {
  body: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  jaw: THREE.Bone | null;
  tail: THREE.Bone;
  wings: THREE.Bone[];
  hands: THREE.Bone[];
  fold: THREE.Quaternion[];
  legs: BirdLeg[];
  eyes: THREE.Bone[];
  glow: THREE.Bone[];
  jiggles: JiggleSpec[];
  ground: 'hop' | 'walk';
  fly: 'never' | 'fast' | 'always';
  takeoff: number;
  bodyY: number;
  flightY: number;
  pitch: number;
  neckRest: number;
  headRest: number;
  jawRest: number;
  tailRest: number;
  L: number;
  span: number;
  sweep: number;
  flapHz: [number, number];
  halfWidth: number;
  headUp: number;
}

/** A wing panel spanning +X: chord along z (leading edge +z), thickness along y. */
function wingPanel(span: number, c0: number, c1: number, th: number, fingers: number, paintFn: Paint): THREE.BufferGeometry {
  const secs: Sec[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const chord = c0 + (c1 - c0) * t;
    // Leading edge (h, +z) slim; trailing edge (hb, -z) carries the feathers.
    const fing = fingers ? 0.18 * Math.pow(Math.abs(Math.sin(t * fingers * Math.PI)), 2) * chord : 0;
    secs.push({ t: t * span, w: th * (1 - 0.5 * t), h: chord * 0.28, hb: chord * 0.72 + fing });
  }
  const g = loft(secs, { axis: 'y', radial: 10, rings: fingers ? n * 2 : n, cap0: th, cap1: Math.max(th, c1 * 0.3), capRings: 2 });
  g.rotateZ(-Math.PI / 2);
  paint(g, paintFn);
  return g;
}

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

/** Folded-wing orientation: span back, leading edge up, a little droop and toe-in. */
function foldQuat(side: number, droop: number): THREE.Quaternion {
  _x.set(0, 0, -side);
  _y.set(-side, 0, 0);
  _z.set(0, 1, 0);
  _m4.makeBasis(_x, _y, _z);
  const q = new THREE.Quaternion().setFromRotationMatrix(_m4);
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-droop, side * 0.08, 0, 'YXZ'));
  return tilt.multiply(q);
}

export function buildBird(k: Kit, d: BirdDef): BirdRig {
  const body = k.bone(k.scaled, 'body', 0, d.fly === 'always' ? d.flightY : d.bodyY, 0);
  body.rotation.x = -d.pitch;
  const bg = loft(d.body, { radial: 18, rings: 14, capRings: 4 });
  paint(bg, d.bodyPaint);
  k.add(bg, 'fur', body);
  let halfWidth = 0;
  for (const s of d.body) halfWidth = Math.max(halfWidth, s.w);

  // Legs.
  const legs: BirdLeg[] = [];
  const lg = d.leg;
  for (const side of [1, -1]) {
    const hip = k.bone(body, side > 0 ? 'hipL' : 'hipR', side * d.hip[0], d.hip[1], d.hip[2]);
    hip.rotation.x = d.pitch;
    const thigh = k.bone(hip, side > 0 ? 'thighL' : 'thighR', 0, 0, 0);
    const shank = k.bone(thigh, side > 0 ? 'shankL' : 'shankR', 0, -lg.thigh, 0);
    const foot = k.bone(shank, side > 0 ? 'footL' : 'footR', 0, -lg.shank, 0);
    // Feathered drumstick, thin scaly shank, toes.
    k.add(ellipsoid(lg.r[0], lg.thigh * 0.62, lg.r[0] * 0.95, 'sm'), 'fur', thigh, { pos: [0, -lg.thigh * 0.45, 0], paint: lg.thighPaint });
    const sh = sweep([[0, 0, 0], [0, -lg.shank * 0.5, 0], [0, -lg.shank, 0]], [
      [0, lg.r[1]],
      [1, lg.r[2]],
    ], { radial: 7, segs: 2, capRings: 2 });
    paint(sh, lg.paint);
    k.add(sh, 'soft', shank);
    const toes: [number, number][] = [
      [0, 1],
      [0.5, 0.82],
      [-0.5, 0.82],
      [Math.PI, 0.55],
    ];
    for (const [a, l] of toes) {
      const len = lg.toe * l;
      const dx = Math.sin(a) * len;
      const dz = Math.cos(a) * len;
      const g = sweep([[0, 0, 0], [dx * 0.55, -lg.r[2] * 0.6, dz * 0.55], [dx, -lg.r[2] * 0.9, dz]], [
        [0, lg.r[2] * 0.95],
        [1, lg.r[2] * 0.55],
      ], { radial: 6, segs: 3, capRings: 2 });
      paint(g, lg.paint);
      k.add(g, 'soft', foot);
    }
    legs.push({
      hip,
      thigh,
      shank,
      foot,
      side,
      l1: lg.thigh,
      l2: lg.shank,
      footH: lg.r[2] * 1.1,
      restX: side * d.hip[0] * 1.05,
      restZ: 0,
    });
  }

  // Wings.
  const w = d.wing;
  const wings: THREE.Bone[] = [];
  const hands: THREE.Bone[] = [];
  const fold: THREE.Quaternion[] = [];
  const th = Math.max(w.chord[0] * 0.07, 0.004);
  const armG = wingPanel(w.arm, w.chord[0], w.chord[1], th, 0, w.paint);
  const handG = wingPanel(w.hand, w.chord[1], w.chord[2], th * 0.8, w.fingers ?? 0, w.paint);
  const mirror = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const m = g.clone();
    m.scale(-1, 1, 1);
    const idx = m.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    m.computeVertexNormals();
    return m;
  };
  for (const side of [1, -1]) {
    const wb = k.bone(body, side > 0 ? 'wingL' : 'wingR', side * w.pos[0], w.pos[1], w.pos[2]);
    // Folded wings follow the body line down towards the tail rather than staying level.
    const q = foldQuat(side, 0.12 - d.pitch * 0.4);
    wb.quaternion.copy(q);
    fold.push(q.clone());
    k.add(side > 0 ? armG : mirror(armG), w.kind ?? 'fur', wb);
    const hb = k.bone(wb, side > 0 ? 'handL' : 'handR', side * w.arm * 0.96, 0, 0);
    k.add(side > 0 ? handG : mirror(handG), w.kind ?? 'fur', hb);
    wings.push(wb);
    hands.push(hb);
  }

  // Tail fan.
  const t = d.tail;
  const tail = k.bone(body, 'tail', t.pos[0], t.pos[1], t.pos[2]);
  tail.rotation.x = t.pitch;
  {
    const secs: Sec[] = [];
    const n = 6;
    for (let i = n; i >= 0; i--) {
      const u = i / n;
      secs.push({ t: -u * t.len, w: t.w * (0.35 + 0.65 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.5)), h: t.w * 0.08, hb: t.w * 0.06 });
    }
    const g = loft(secs, { radial: 10, rings: 8, cap0: t.w * 0.08, cap1: t.w * 0.08, capRings: 2, exp: 3 });
    if (t.fork) {
      // Forked tail: pull the centre of the trailing edge forward.
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        const x = pos.getX(i);
        const f = smoothstep(-t.len * 0.5, -t.len, z) * Math.max(0, 1 - Math.abs(x) / (t.w * 0.9));
        pos.setZ(i, z + f * t.len * t.fork);
      }
      g.computeVertexNormals();
    }
    paint(g, t.paint);
    k.add(g, w.kind ?? 'fur', tail);
  }

  // Neck and head.
  const nk = d.neck;
  const neck = k.bone(body, 'neck', nk.pos[0], nk.pos[1], nk.pos[2]);
  neck.rotation.x = nk.pitch;
  const ng = sweep([[0, 0, 0], [0, nk.len * 0.5, 0], [0, nk.len, 0]], [
    [0, nk.r0],
    [1, nk.r1],
  ], { radial: 14, segs: 2, up: [0, 0, 1], capRings: 3 });
  k.add(ng, 'fur', neck, { paint: nk.paint });
  const head = k.bone(neck, 'head', 0, nk.len, 0);
  head.rotation.x = -nk.pitch + d.pitch;
  const hp = d.head(k, head);
  const jiggles: JiggleSpec[] = [...(hp.jiggles ?? [])];
  jiggles.push({ bone: tail, tip: new THREE.Vector3(0, 0, -t.len), opts: { freq: 11, zeta: 0.3, gain: 0.012, limit: 0.6 }, role: 'misc', side: 0 });
  const glow: THREE.Bone[] = [...(hp.glow ?? [])];
  const ex = d.extras?.(k, { body, neck, head, tail });
  if (ex) {
    if (ex.jiggles) jiggles.push(...ex.jiggles);
    if (ex.glow) glow.push(...ex.glow);
  }

  const rig: BirdRig = {
    body,
    neck,
    head,
    jaw: hp.jaw ?? null,
    tail,
    wings,
    hands,
    fold,
    legs,
    eyes: hp.eyes,
    glow,
    jiggles,
    ground: d.ground,
    fly: d.fly,
    takeoff: d.takeoff ?? 2.5,
    bodyY: d.bodyY,
    flightY: d.flightY,
    pitch: d.pitch,
    neckRest: nk.pitch,
    headRest: -nk.pitch + d.pitch,
    jawRest: hp.jaw ? hp.jaw.rotation.x : 0,
    tailRest: t.pitch,
    L: lg.thigh + lg.shank,
    span: w.arm + w.hand,
    sweep: w.sweep ?? 0.2,
    flapHz: d.flapHz,
    halfWidth,
    headUp: d.headUp ?? 0,
  };
  // Stand the legs (or tuck them for permanent fliers) so the template's bounds are right.
  poseBirdLegs(rig, 0, 0, d.fly === 'always' ? 1 : 0, null);
  return rig;
}

const _ik: IkResult = { bend: 0, reach: 0 };
const _P = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _Minv = new THREE.Matrix4();
const _Q = new THREE.Quaternion();
const _Q2 = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _lz: LegZ = { z: 0, stance: true, t: 0 };
const _hipW = new THREE.Vector3();

/**
 * Pose both legs. `zs`/`lifts` are per-leg foot offsets (null = rest); `tuck` 0..1 folds them up
 * under the body for flight.
 */
function poseBirdLegs(r: BirdRig, _z: number, _lift: number, tuck: number, feet: { z: number; y: number }[] | null): void {
  r.body.updateMatrix();
  for (let i = 0; i < 2; i++) {
    const leg = r.legs[i];
    leg.hip.updateMatrix();
    _Minv.multiplyMatrices(r.body.matrix, leg.hip.matrix).invert();
    _Q.copy(r.body.quaternion).multiply(leg.hip.quaternion);
    const f = feet ? feet[i] : { z: 0, y: 0 };
    // Ground target (scaled-root space); tucked target is up under the belly, behind the hip.
    _P.set(leg.restX, leg.footH + f.y, leg.restZ + f.z);
    if (tuck > 0) {
      const hipW = _hipW.setFromMatrixPosition(_m4.multiplyMatrices(r.body.matrix, leg.hip.matrix));
      const tx = leg.restX * 0.8;
      const ty = hipW.y - (leg.l1 + leg.l2) * 0.42;
      const tz = hipW.z - (leg.l1 + leg.l2) * 0.55;
      _P.x += (tx - _P.x) * tuck;
      _P.y += (ty - _P.y) * tuck;
      _P.z += (tz - _P.z) * tuck;
    }
    _P.applyMatrix4(_Minv);
    _pole.set(0, 0, -1).applyQuaternion(_Q2.copy(_Q).invert());
    solveTwoBone(_P, _pole, leg.l1, leg.l2, -1, leg.thigh.quaternion, _ik);
    leg.shank.quaternion.setFromAxisAngle(X_AXIS, -_ik.bend);
    // Keep the foot level with the ground (toes curl a little when tucked).
    _Q2.copy(_Q).multiply(leg.thigh.quaternion).multiply(leg.shank.quaternion).invert();
    leg.foot.quaternion.copy(_Q2);
    if (tuck > 0) leg.foot.quaternion.multiply(_Q2.setFromAxisAngle(X_AXIS, 0.9 * tuck));
  }
}

export function birdClipParams(r: BirdRig, S: number): { lieY: number; faintRoll: number; lunge: number; rear: number; hop: number } {
  return {
    lieY: (r.halfWidth * 1.0 - r.bodyY) / S,
    faintRoll: 1.35,
    lunge: (0.6 * r.halfWidth * 2) / S,
    rear: 0.3,
    hop: (0.5 * r.L) / S,
  };
}

// ---------------------------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _qs = new THREE.Quaternion();
const _qh = new THREE.Quaternion();

export class BirdModel extends CreatureBase {
  private readonly r: BirdRig;
  private readonly jig: JiggleSet;
  private cycle = 0;
  private flapPh = 0;
  private air = 0;
  private hoverW = 0;
  private readonly airS: Spring = spring();
  private breath = 0;
  private readonly feet = [
    { z: 0, y: 0 },
    { z: 0, y: 0 },
  ];
  private hopY = 0;
  private headBob = 0;
  private readonly lookY: Spring = spring();
  private readonly lookP: Spring = spring();
  private lookTY = 0;
  private lookTP = 0;
  private lookTimer = 1;

  constructor(init: BaseInit, rig: BirdRig) {
    super(init);
    this.r = rig;
    this.jig = new JiggleSet(rig.jiggles);
    this.cycle = this.rand();
    this.flapPh = this.rand();
    if (rig.fly === 'always') {
      this.air = 1;
      this.airS.x = 1;
    }
    this.update(0, 0);
  }

  protected resetPlan(): void {
    this.jig.reset();
  }

  protected locomote(dt: number): void {
    const r = this.r;
    const b = this.base;
    const S = this.S;
    const L = r.L;
    const v = this.speed;
    const vw = v * this.scale;
    // Flight weight: a spring so take-off and landing take a moment.
    const wantAir = r.fly === 'always' ? 1 : r.fly === 'fast' ? (vw > r.takeoff ? 1 : vw < r.takeoff * 0.7 ? 0 : this.air > 0.5 ? 1 : 0) : 0;
    stepSpring(this.airS, wantAir, 4, 0.9, dt);
    this.air = clamp(this.airS.x, 0, 1);
    const air = this.air;
    const ground = 1 - air;

    // --- Ground gait ---------------------------------------------------------------------
    const turnV = Math.abs(this.yawRate) * r.halfWidth * 1.5;
    const gv = Math.max(v, turnV) * ground;
    const hop = r.ground === 'hop';
    const fMax = (hop ? 3.2 : 2.6) / Math.sqrt(Math.max(0.05, L * this.scale));
    const strideLen = Math.max(L * (hop ? 1.5 : 1.3), gv / fMax);
    this.cycle += (gv * dt) / strideLen;
    const m = smoothstep(0, 0.3 * L * fMax, gv);
    const duty = hop ? 0.42 : 0.6;
    const sweepLen = strideLen * duty;
    this.hopY = 0;
    for (let i = 0; i < 2; i++) {
      const off = hop ? 0 : i * 0.5;
      legCycleZ(this.cycle + off, duty, sweepLen, 0.5, 0.5, _lz);
      this.feet[i].z = _lz.z * m;
      this.feet[i].y = _lz.stance ? 0 : 0.35 * L * Math.sin(Math.PI * _lz.t) * m;
      if (hop && i === 0) {
        // Body arcs between hops; crouch at take-off and landing.
        const u = this.cycle - Math.floor(this.cycle);
        if (u < duty) {
          const t = u / duty;
          b[CH.SQUASH] += -0.1 * Math.sin(Math.PI * t) * m;
          this.hopY = -0.06 * L * Math.sin(Math.PI * t) * m;
        } else {
          const t = (u - duty) / (1 - duty);
          this.hopY = 0.55 * L * Math.sin(Math.PI * t) * m;
          b[CH.SQUASH] += 0.06 * Math.sin(Math.PI * t) * m;
          b[CH.PITCH] += 0.12 * Math.cos(Math.PI * t) * m;
          b[CH.WINGS] += 0.12 * Math.sin(Math.PI * t) * m;
        }
      }
    }
    if (!hop) {
      const u = this.cycle;
      b[CH.Y] += (-0.04 * L * Math.cos(TAU * 2 * u) * m) / S;
      b[CH.ROLL] += 0.06 * Math.sin(TAU * u) * m;
      // Pigeon head bob: the head holds still, then thrusts forward with each step.
      const ph = (u * 2) % 1;
      this.headBob = (ph < 0.55 ? -ph / 0.55 : -1 + (ph - 0.55) / 0.45) * m;
    } else {
      this.headBob = 0;
    }
    b[CH.Y] += (this.hopY * ground) / S;

    // --- Flight ----------------------------------------------------------------------------
    if (air > 0) {
      const cruise = smoothstep(0.5, 3, vw);
      this.hoverW = air * (1 - cruise);
      const hz = r.flapHz[0] + (r.flapHz[1] - r.flapHz[0]) * cruise;
      // Cruising birds glide between bursts of flapping.
      const glide = cruise * (0.5 + 0.5 * Math.sin(this.time * 0.9 + this.seed));
      this.flapPh += dt * hz * (1 - 0.6 * glide);
      b[CH.WINGS] += air;
      b[CH.FLAP] += air * (1 - glide * 0.85);
      b[CH.PITCH] += air * (-0.25 * cruise + 0.15 * (1 - cruise));
      b[CH.ROLL] += air * clamp(-this.yawRate * Math.max(vw, 1) * 0.12, -0.6, 0.6);
      // Body bobs with the wingbeat.
      b[CH.Y] += (air * 0.025 * r.span * Math.sin(TAU * this.flapPh) * (1 - glide)) / S;
      b[CH.TAIL_UP] += air * 0.2;
    }
    this.idleW = (1 - m) * (1 - air * 0.5);
    b[CH.ROLL] += clamp(-this.yawRate * this.speed * 0.04, -0.2, 0.2) * ground;
    b[CH.HEAD_Y] += clamp(this.yawRate * 0.2, -0.5, 0.5);

    // --- Idle life ------------------------------------------------------------------------
    const iw = 1 - m;
    this.breath = Math.sin((this.time * TAU) / (1.2 + S * this.scale));
    b[CH.ROLL] += 0.02 * wobble(this.time * 0.4, this.seed) * iw;
    b[CH.HEAD_P] += r.headUp;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      // Birds look around in quick snaps.
      this.lookTY = (this.rand() * 2 - 1) * 0.8;
      this.lookTP = this.rand() * 0.4 - 0.15;
      this.lookTimer = 0.5 + this.rand() * 1.6;
    }
    stepSpring(this.lookY, this.lookTY, 16, 0.8, dt);
    stepSpring(this.lookP, this.lookTP, 16, 0.8, dt);
    b[CH.HEAD_Y] += this.lookY.x * iw;
    b[CH.HEAD_P] += this.lookP.x * iw;
  }

  protected apply(dt: number): void {
    const r = this.r;
    const p = this.pose;
    const S = this.S;
    const t = this.time;
    const limp = p[CH.LIMP];
    const air = this.air * (1 - limp);

    const sy = 1 + clamp(p[CH.SQUASH], -0.4, 0.4);
    const sxz = 1 / Math.sqrt(sy);
    this.scaled.scale.set(this.scale * sxz, this.scale * sy, this.scale * sxz);

    let x = p[CH.X] * S;
    let y = r.bodyY + (r.flightY - r.bodyY) * air + (p[CH.Y] + p[CH.HOVER]) * S;
    const z = p[CH.Z] * S;
    const tr = p[CH.TREMBLE];
    if (tr > 0) {
      x += tr * 0.006 * S * Math.sin(t * TAU * 21);
      y += tr * 0.004 * S * Math.sin(t * TAU * 17 + 1);
    }
    const roll = p[CH.ROLL] + p[CH.SHAKE] * 0.25 * Math.sin(t * TAU * 9);
    const pitch = r.pitch + p[CH.PITCH] + p[CH.REAR] * 0.6;
    r.body.position.set(x, y, z);
    r.body.rotation.set(-pitch, p[CH.YAW], roll, 'YXZ');
    r.body.scale.set(1 + this.breath * 0.02, 1 + this.breath * 0.02, 1);

    // Neck & head (head counter-rotates the body pitch so the gaze stays level).
    const bob = this.headBob * 0.05 * r.L;
    r.neck.rotation.set(r.neckRest - p[CH.NECK] - p[CH.HEAD_P] * 0.3 - bob * 4 + (pitch - r.pitch) * 0.3, p[CH.HEAD_Y] * 0.35, -roll * 0.3, 'YXZ');
    r.head.rotation.set(
      r.headRest - p[CH.HEAD_P] * 0.7 + (pitch - r.pitch) * 0.6 + bob * 4 + p[CH.SNIFF] * 0.08 * Math.sin(t * TAU * 8),
      p[CH.HEAD_Y] * 0.65,
      p[CH.HEAD_R] - roll * 0.5 - p[CH.SHAKE] * 0.3 * Math.sin(t * TAU * 9 + 0.6),
      'YXZ',
    );
    if (r.jaw) r.jaw.rotation.x = r.jawRest + p[CH.JAW] * 0.6;
    this.applyFace(r.eyes, r.glow);

    // Wings: blend folded <-> spread, flap with a fast downstroke and a slower upstroke.
    // Fainted birds fold their wings (a little droop) rather than leaving one sticking up.
    const spread = clamp(p[CH.WINGS] * (1 - limp * 0.85) + limp * 0.1, 0, 1);
    const flapAmt = clamp(p[CH.FLAP], 0, 1.5);
    const ph = TAU * this.flapPh;
    const stroke = Math.sin(ph) + 0.25 * Math.sin(2 * ph);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      // Hovering strokes are shallower and held higher than cruising ones.
      const amp = 0.95 - 0.25 * this.hoverW;
      // Clamped so hard strokes (attacks, take-off) never swing the wings down like legs.
      const up = clamp(amp * stroke * flapAmt + 0.15 + 0.2 * this.hoverW - limp * 0.5, -0.7, 1.35) * spread;
      _e.set(0, side * r.sweep * (1 - 0.4 * flapAmt), side * up, 'YXZ');
      _qs.setFromEuler(_e);
      r.wings[i].quaternion.copy(r.fold[i]).slerp(_qs, smoothstep(0, 1, spread));
      // The hand lags the arm through the stroke and folds in on the upstroke.
      // Folded, the hands angle in so the primaries cross over the rump instead of jutting out.
      const hand = (0.5 * Math.sin(ph - 0.7) * flapAmt) * spread + 0.26 * (1 - smoothstep(0, 1, spread));
      _e.set(0, side * (0.15 * flapAmt * Math.max(0, -Math.cos(ph)) * spread), side * hand, 'YXZ');
      _qh.setFromEuler(_e);
      r.hands[i].quaternion.copy(_qh);
    }
    // Tail: lifts and fans in flight.
    r.tail.rotation.set(r.tailRest - p[CH.TAIL_UP] * 0.4 + air * 0.15, Math.sin(t * 2.1) * 0.04 * this.idleW + p[CH.WAG] * 0.3 * Math.sin(t * TAU * 4), 0, 'YXZ');
    r.tail.scale.set(1 + air * 0.35 + spread * 0.1, 1, 1);

    // Legs: planted, hopping or tucked.
    const tuck = clamp(Math.max(air, limp * 0.6), 0, 1);
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const lift = i === 0 ? p[CH.HIND_LIFT] : p[CH.FORE_LIFT];
      f.y = f.y * (1 - this.air) + Math.max(0, lift) * S + Math.max(0, this.hopY * (1 - this.air) * 0.85);
      f.z = f.z * (1 - this.air) + (i === 0 ? p[CH.HIND_Z] : p[CH.FORE_Z]) * S;
    }
    poseBirdLegs(r, 0, 0, tuck, this.feet);

    this.root.updateMatrixWorld(true);
    this.jig.update(p, dt, t, this.idleW);
  }
}

// ---------------------------------------------------------------------------------------------
// Head and clips
// ---------------------------------------------------------------------------------------------

export interface BirdHeadOpts {
  R: number;
  skull?: V3;
  paint: Paint;
  beak: { len: number; w: number; h: number; hook?: number; color: string; tip?: string };
  iris: string;
  eye: { size: number; yaw?: number; pitch?: number; tall?: number; rim?: string };
  /** Brow ridge colour (raptors). */
  brow?: string;
  /** Crest tufts: [x, y, z, dirx, diry, dirz, r, len] in R units relative to the cranium centre. */
  crest?: { color: Paint; tufts: [number, number, number, number, number, number, number, number][] };
  cheek?: { color: string; at: V3; r: number };
  extra?: (k: Kit, head: THREE.Bone, c: V3, R: number) => { glow?: THREE.Bone[]; jiggles?: JiggleSpec[] } | void;
}

/** Round bird head with a two-part beak (lower half on a jaw bone), big eyes and an optional crest. */
export function birdHead(o: BirdHeadOpts) {
  return (k: Kit, head: THREE.Bone): HeadParts => {
    const R = o.R;
    const sk = o.skull ?? [1, 0.95, 1];
    const c: V3 = [0, 0.4 * R, 0.1 * R];
    const cr: V3 = [sk[0] * R, sk[1] * R, sk[2] * R];
    const cg = ellipsoid(cr[0], cr[1], cr[2], 'hi');
    cg.translate(c[0], c[1], c[2]);
    paint(cg, o.paint);
    k.add(cg, 'fur', head);
    if (o.cheek) {
      for (const s of [1, -1]) {
        const g = ellipsoid(o.cheek.r * R, o.cheek.r * R * 0.8, o.cheek.r * R * 0.5, 'sm');
        paint(g, (_p, _n, out) => out.set(o.cheek!.color));
        k.add(g, 'fur', head, { pos: [s * o.cheek.at[0] * R, c[1] + o.cheek.at[1] * R, c[2] + o.cheek.at[2] * R], rot: [0, s * 0.9, 0] });
      }
    }
    // Beak: upper mandible (with optional hook) and a lower mandible on the jaw.
    const b = o.beak;
    const z0 = c[2] + cr[2] * 0.88;
    const by = c[1] - 0.12 * R;
    const hook = b.hook ?? 0;
    const up = loft(
      [
        { t: 0, w: b.w * R, h: b.h * R * 0.6, hb: b.h * R * 0.1, c: 0 },
        { t: b.len * R * 0.5, w: b.w * R * 0.62, h: b.h * R * 0.42, hb: b.h * R * 0.08, c: -hook * R * 0.05 },
        { t: b.len * R, w: b.w * R * 0.18, h: b.h * R * 0.15, hb: b.h * R * 0.05, c: -hook * R * 0.25 - b.h * R * 0.05 },
      ],
      { radial: 12, rings: 6, cap0: 0, cap1: b.w * R * 0.18 + hook * R * 0.12, capRings: 2 },
    );
    if (hook) {
      // Curl the tip down.
      const pos = up.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const zz = pos.getZ(i);
        const f = smoothstep(b.len * R * 0.55, b.len * R * 1.15, zz);
        pos.setY(i, pos.getY(i) - f * f * hook * R * 0.35);
      }
      up.computeVertexNormals();
    }
    const tipC = new THREE.Color(b.tip ?? b.color);
    const baseC = new THREE.Color(b.color);
    paint(up, (p, _n, out) => out.copy(baseC).lerp(tipC, smoothstep(b.len * R * 0.5, b.len * R * 0.95, p.z)));
    k.add(up, 'gloss', head, { pos: [0, by, z0] });
    const jaw = k.bone(head, 'jaw', 0, by, z0);
    const lo = loft(
      [
        { t: 0, w: b.w * R * 0.9, h: b.h * R * 0.05, hb: b.h * R * 0.35, c: 0 },
        { t: b.len * R * 0.75, w: b.w * R * 0.25, h: b.h * R * 0.03, hb: b.h * R * 0.12, c: 0 },
      ],
      { radial: 10, rings: 4, cap0: 0, cap1: b.w * R * 0.2, capRings: 2 },
    );
    paint(lo, (p, _n, out) => out.copy(baseC).multiplyScalar(0.88).lerp(tipC, smoothstep(b.len * R * 0.4, b.len * R * 0.8, p.z)));
    k.add(lo, 'gloss', jaw);
    const eyes = addEyes(k, head, {
      on: { c, r: cr },
      yaw: o.eye.yaw ?? 0.6,
      pitch: o.eye.pitch ?? 0.05,
      size: o.eye.size * R,
      tall: o.eye.tall ?? 1.15,
      iris: o.iris,
      inset: 0.45,
      toward: 0.45,
      rim: o.eye.rim,
    });
    if (o.brow) {
      for (const s of [1, -1]) {
        const g = sweep(
          [
            [s * 0.18 * R, c[1] + 0.42 * R, c[2] + 0.82 * R],
            [s * 0.48 * R, c[1] + 0.5 * R, c[2] + 0.62 * R],
            [s * 0.72 * R, c[1] + 0.4 * R, c[2] + 0.28 * R],
          ],
          [
            [0, 0.07 * R],
            [0.5, 0.11 * R],
            [1, 0.05 * R],
          ],
          { radial: 7, segs: 6, ratio: 0.6, capRings: 2 },
        );
        paint(g, (_p, _n, out) => out.set(o.brow!));
        k.add(g, 'fur', head);
      }
    }
    if (o.crest) {
      addTufts(
        k,
        head,
        o.crest.tufts.map(([x, y, z, dx, dy, dz, r, len]) => ({ pos: [x * R, c[1] + y * R, c[2] + z * R] as V3, dir: [dx, dy, dz] as V3, r: r * R, len: len * R, curl: -len * R * 0.2 })),
        o.crest.color,
      );
    }
    const ex = o.extra?.(k, head, c, R);
    return { eyes, jaw, jiggles: (ex && ex.jiggles) || [], glow: (ex && ex.glow) || [] };
  };
}
