import * as THREE from 'three';
import { clamp, legCycleZ, smoothstep, solveTwoBone, spring, stepSpring, type IkResult, type LegZ, type Spring } from '../player/anim-math';
import { CH, CreatureBase, wobble, type BaseInit } from './core';
import type { V3 } from './geo';
import type { JiggleSpec } from './parts';
import { JiggleSet } from './secondary';

/**
 * Small-creature body plans that don't fit the vertebrate rigs:
 *
 * - 'mite'   (Dewmite): a round body on six little legs walking in alternating tripods, each
 *            foot planted by distance-driven phase and placed with two-bone IK;
 * - 'cocoon' (Cocoonch): a legless upright pod on a spine chain that inches along like a
 *            caterpillar (the top reaches forward, then the base scrunches up after it) and
 *            sways when idle;
 * - 'moth'   (Auroramoth): permanently hovering on four flapping wings, body bobbing with the
 *            beat, banking into turns; when it faints it drops to the ground.
 *
 * The rigs are authored by the species builders (see `bugs.ts`); this file only animates them.
 */

export interface BugLeg {
  hip: THREE.Bone;
  upper: THREE.Bone;
  lower: THREE.Bone;
  l1: number;
  l2: number;
  /** Rest foot position in the scaled root's space. */
  foot: V3;
  /** Tripod group (0 / 1). */
  group: number;
  side: number;
}

export interface BugRig {
  mode: 'mite' | 'cocoon' | 'moth';
  body: THREE.Bone;
  head: THREE.Bone;
  eyes: THREE.Bone[];
  glow: THREE.Bone[];
  jiggles: JiggleSpec[];
  bodyY: number;
  /** Hover height of the body (moths). */
  hoverY: number;
  /** Ground-contact half width when lying on the side (for the faint). */
  halfWidth: number;
  /** Mite legs. */
  legs: BugLeg[];
  /** Cocoon spine (bottom to top) and its segment height. */
  spine: THREE.Bone[];
  segH: number;
  /** Moth wings: fore L, fore R, hind L, hind R, with rest quaternions. */
  wings: THREE.Bone[];
  wingRest: THREE.Quaternion[];
  /** Abdomen bone (moth / mite) that bobs with breathing. */
  tailSeg: THREE.Bone | null;
  size: number;
  headRest: THREE.Euler;
}

export function bugClipParams(r: BugRig, S: number): { lieY: number; faintRoll: number; lunge: number; rear: number; hop: number } {
  if (r.mode === 'mite') return { lieY: (r.halfWidth - r.bodyY) / S, faintRoll: 1.5, lunge: (0.5 * r.size) / S, rear: 0.4, hop: (0.35 * r.size) / S };
  if (r.mode === 'cocoon') return { lieY: (r.halfWidth - r.bodyY) / S, faintRoll: 1.45, lunge: (0.3 * r.size) / S, rear: 0.25, hop: (0.25 * r.size) / S };
  // Moth: drops onto its belly with the wings splayed flat on the ground.
  return { lieY: (r.halfWidth * 0.75 - r.bodyY) / S, faintRoll: 0.3, lunge: (0.35 * r.size) / S, rear: 0.35, hop: (0.15 * r.size) / S };
}

const TAU = Math.PI * 2;
const _ik: IkResult = { bend: 0, reach: 0 };
const _P = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _Minv = new THREE.Matrix4();
const _M = new THREE.Matrix4();
const _Q = new THREE.Quaternion();
const _Q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const X_AXIS = new THREE.Vector3(1, 0, 0);
const _lz: LegZ = { z: 0, stance: true, t: 0 };

/** Place one mite leg on a foot target given in the scaled root's space. */
export function solveBugLeg(leg: BugLeg, body: THREE.Bone, target: THREE.Vector3): void {
  body.updateMatrix();
  leg.hip.updateMatrix();
  _M.multiplyMatrices(body.matrix, leg.hip.matrix);
  _Minv.copy(_M).invert();
  _Q.copy(body.quaternion).multiply(leg.hip.quaternion);
  _P.copy(target).applyMatrix4(_Minv);
  // Knees up and out.
  _pole.set(leg.side * 0.6, 1, 0).normalize().applyQuaternion(_Q2.copy(_Q).invert());
  solveTwoBone(_P, _pole, leg.l1, leg.l2, 1, leg.upper.quaternion, _ik);
  leg.lower.quaternion.setFromAxisAngle(X_AXIS, _ik.bend);
}

export class BugModel extends CreatureBase {
  private readonly r: BugRig;
  private readonly jig: JiggleSet;
  private cycle = 0;
  private flap = 0;
  private breath = 0;
  private move = 0;
  private readonly foot = new THREE.Vector3();
  private readonly lookY: Spring = spring();
  private readonly lookP: Spring = spring();
  private readonly sway: Spring = spring();
  private lookTY = 0;
  private lookTP = 0;
  private lookTimer = 1;
  /** Cocoon inching offsets of the base and top (design units). */
  private baseZ = 0;
  private topZ = 0;

  constructor(init: BaseInit, rig: BugRig) {
    super(init);
    this.r = rig;
    this.jig = new JiggleSet(rig.jiggles);
    this.cycle = this.rand();
    this.flap = this.rand();
    this.update(0, 0);
  }

  protected resetPlan(): void {
    this.jig.reset();
  }

  protected locomote(dt: number): void {
    const r = this.r;
    const b = this.base;
    const S = this.S;
    const L = r.size;
    const turnV = Math.abs(this.yawRate) * L * 0.4;
    const v = Math.max(this.speed, turnV);
    if (r.mode === 'mite') {
      const fMax = 4.5 / Math.sqrt(Math.max(0.05, L * this.scale));
      const strideLen = Math.max(L * 0.55, v / fMax);
      this.cycle += (v * dt) / strideLen;
      this.move = smoothstep(0, 0.25 * L * fMax, v);
      const u = this.cycle;
      b[CH.Y] += (-0.02 * L * Math.cos(TAU * 2 * u) * this.move) / S;
      b[CH.ROLL] += 0.08 * Math.sin(TAU * u) * this.move;
      b[CH.YAW] += 0.05 * Math.sin(TAU * u) * this.move;
    } else if (r.mode === 'cocoon') {
      const fMax = 2.2 / Math.sqrt(Math.max(0.05, L * this.scale));
      const strideLen = Math.max(L * 0.32, v / fMax);
      this.cycle += (v * dt) / strideLen;
      this.move = smoothstep(0, 0.2 * L * fMax, v);
      const u = this.cycle - Math.floor(this.cycle);
      // The top reaches forward first, then the base scrunches up after it.
      const top = smoothstep(0, 0.5, u);
      const bot = smoothstep(0.45, 0.95, u);
      this.topZ = strideLen * (top - u) * this.move;
      this.baseZ = strideLen * (bot - u) * this.move;
      b[CH.SQUASH] += (0.1 * Math.sin(Math.PI * Math.min(1, u * 2)) - 0.12 * Math.sin(Math.PI * Math.max(0, u * 2 - 1))) * this.move;
      b[CH.ROLL] += 0.06 * Math.sin(TAU * this.cycle * 0.5) * this.move;
    } else {
      // Moth: always aloft; flap rate rises a little when moving.
      const vw = v * this.scale;
      const cruise = smoothstep(0.3, 3, vw);
      this.move = cruise;
      this.flap += dt * (3.2 + 1.4 * cruise);
      b[CH.PITCH] += -0.2 * cruise;
      b[CH.ROLL] += clamp(-this.yawRate * Math.max(vw, 0.8) * 0.12, -0.55, 0.55);
      b[CH.Y] += (0.05 * L * Math.sin(TAU * this.flap - 0.6)) / S;
      b[CH.X] += (0.03 * L * wobble(this.time * 0.5, this.seed)) / S;
    }
    this.idleW = 1 - this.move;
    b[CH.HEAD_Y] += clamp(this.yawRate * 0.2, -0.5, 0.5);

    // Idle life.
    const iw = this.idleW;
    this.breath = Math.sin((this.time * TAU) / (1.4 + S * this.scale));
    if (r.mode === 'cocoon') {
      // Pendulum sway with a slow wander.
      stepSpring(this.sway, 0.12 * wobble(this.time * 0.35, this.seed), 3, 0.4, dt);
      b[CH.ROLL] += this.sway.x * iw;
      b[CH.PITCH] += 0.04 * wobble(this.time * 0.27, this.seed + 5) * iw;
    } else {
      b[CH.ROLL] += 0.02 * wobble(this.time * 0.4, this.seed) * iw;
    }
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTY = (this.rand() * 2 - 1) * 0.5;
      this.lookTP = this.rand() * 0.3 - 0.1;
      this.lookTimer = 1 + this.rand() * 2.5;
    }
    stepSpring(this.lookY, this.lookTY, 8, 0.75, dt);
    stepSpring(this.lookP, this.lookTP, 8, 0.75, dt);
    b[CH.HEAD_Y] += this.lookY.x * iw;
    b[CH.HEAD_P] += this.lookP.x * iw;
  }

  protected apply(dt: number): void {
    const r = this.r;
    const p = this.pose;
    const S = this.S;
    const t = this.time;
    const limp = p[CH.LIMP];

    const sy = 1 + clamp(p[CH.SQUASH], -0.4, 0.4);
    const sxz = 1 / Math.sqrt(sy);
    this.scaled.scale.set(this.scale * sxz, this.scale * sy, this.scale * sxz);

    let x = p[CH.X] * S;
    let y = (r.mode === 'moth' ? r.bodyY + (r.hoverY - r.bodyY) * (1 - limp) : r.bodyY) + (p[CH.Y] + p[CH.HOVER]) * S;
    let z = p[CH.Z] * S;
    const tr = p[CH.TREMBLE];
    if (tr > 0) {
      x += tr * 0.006 * S * Math.sin(t * TAU * 21);
      y += tr * 0.004 * S * Math.sin(t * TAU * 17 + 1);
    }
    const roll = p[CH.ROLL] + p[CH.SHAKE] * 0.3 * Math.sin(t * TAU * 8);
    const pitch = p[CH.PITCH] + p[CH.REAR] * (r.mode === 'moth' ? 0.8 : 0.5);
    if (r.mode === 'cocoon') z += this.baseZ;
    r.body.position.set(x, y, z);
    r.body.rotation.set(-pitch, p[CH.YAW], roll, 'YXZ');

    // Head.
    const hr = r.headRest;
    r.head.rotation.set(
      hr.x - p[CH.HEAD_P] * 0.8 - p[CH.NECK] * 0.5 + p[CH.SNIFF] * 0.08 * Math.sin(t * TAU * 7),
      hr.y + p[CH.HEAD_Y] * 0.7,
      hr.z + p[CH.HEAD_R] - p[CH.SHAKE] * 0.2 * Math.sin(t * TAU * 8 + 0.6),
      'YXZ',
    );
    this.applyFace(r.eyes, r.glow);
    if (r.tailSeg) r.tailSeg.scale.set(1 + this.breath * 0.04, 1 + this.breath * 0.04, 1 + this.breath * 0.02);

    if (r.mode === 'mite') this.applyMite(p, limp);
    else if (r.mode === 'cocoon') this.applyCocoon(p, limp);
    else this.applyMoth(p, limp);

    this.root.updateMatrixWorld(true);
    this.jig.update(p, dt, t, this.idleW);
  }

  private applyMite(p: Float32Array, limp: number): void {
    const r = this.r;
    const L = r.size;
    const fMax = 4.5 / Math.sqrt(Math.max(0.05, L * this.scale));
    const strideLen = Math.max(L * 0.55, Math.max(this.speed, 0) / fMax);
    const duty = 0.55;
    const sweepLen = strideLen * duty;
    const m = this.move;
    for (const leg of r.legs) {
      legCycleZ(this.cycle + leg.group * 0.5, duty, sweepLen, 0.5, 0.5, _lz);
      const lift = _lz.stance ? 0 : 0.18 * L * Math.sin(Math.PI * _lz.t) * m;
      const fz = leg.group === 0 ? p[CH.FORE_Z] : p[CH.HIND_Z];
      const fl = Math.max(0, leg.group === 0 ? p[CH.FORE_LIFT] : p[CH.HIND_LIFT]);
      this.foot.set(leg.foot[0], leg.foot[1] + lift + fl * this.S, leg.foot[2] + _lz.z * m + fz * this.S * 0.5);
      if (limp > 0) {
        // Fainted: the legs curl in against the body (following it as it topples).
        r.body.updateMatrix();
        _P.set(leg.foot[0] * 0.75, leg.foot[1] - r.bodyY + L * 0.22, leg.foot[2] * 0.8).applyMatrix4(r.body.matrix);
        this.foot.lerp(_P, limp);
      }
      solveBugLeg(leg, r.body, this.foot);
    }
  }

  private applyCocoon(p: Float32Array, limp: number): void {
    const r = this.r;
    const n = r.spine.length;
    // Lean so the top leads the base by (topZ - baseZ); the bend is spread over the segments.
    const total = r.segH * n;
    const lean = Math.atan2(this.topZ - this.baseZ, total) + p[CH.FLEX] * 0.4;
    const wag = p[CH.WAG] * 0.3 * Math.sin(this.time * TAU * 3);
    for (let i = 0; i < n; i++) {
      const w = (i + 1) / n;
      r.spine[i].rotation.set((lean * 2) / n + p[CH.NECK] * 0.15 * w - limp * 0.05, 0, wag * w + 0.04 * Math.sin(this.time * 1.7 - i) * this.idleW * (1 - limp), 'YXZ');
    }
  }

  private applyMoth(p: Float32Array, limp: number): void {
    const r = this.r;
    const ph = TAU * this.flap;
    const amt = clamp(1 - limp, 0, 1) * (0.75 + 0.5 * clamp(p[CH.FLAP], 0, 1.5));
    const spread = clamp(p[CH.WINGS], 0, 1);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const hind = i >= 2;
      // Fore and hind wings beat together, the hind pair slightly behind.
      const s = Math.sin(ph - (hind ? 0.35 : 0));
      // Butterfly stroke around a raised V, so the wing faces (and their bands) read from the
      // side and front instead of edge-on.
      const up = 0.5 * (1 - limp) + (0.75 * s + 0.1) * amt + spread * 0.25 - limp * 0.25;
      const sweepB = 0.12 * Math.cos(ph) * amt;
      _e.set(0, side * sweepB, side * up, 'YXZ');
      _Q.setFromEuler(_e);
      r.wings[i].quaternion.copy(_Q).multiply(r.wingRest[i]);
    }
  }
}
