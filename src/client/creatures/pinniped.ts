import * as THREE from 'three';
import { clamp, smoothstep, spring, stepSpring, type Spring } from '../player/anim-math';
import { clip, CH, CreatureBase, wobble, type BaseInit, type Clip } from './core';
import { leaf, loft, paint, sweep, type Paint, type Sec, type V3 } from './geo';
import { chainWeights, skin, type Kit, type MatKind } from './kit';
import type { JiggleSpec } from './parts';
import type { HeadParts } from './quadruped';
import { JiggleSet } from './secondary';

/**
 * Seal body plan (Splashpup, Sealkin, Selkira).
 *
 *   body ─┬─ chest ─┬─ neck ─ head
 *         │         └─ fore flippers (x2)
 *         ├─ belly (breathing)
 *         └─ hips ─ tail0 ─ tail1 ─ hind flippers (x2, springs)
 *
 * The torso is one loft authored in its resting curve (chest propped up on the fore flippers,
 * hips and tail lying on the ground), skinned along the spine. On land seals "galumph": the
 * chest lifts and reaches forward on the flippers, then the hips hump up and pull through; the
 * phase advances with distance. Splashpup bounces instead: whole-body hops with squash and
 * stretch and flippers flung out in the air.
 */

export interface PinDef {
  bodyY: number;
  /** Torso sections along z in the body frame (y up, ground at y = -bodyY). */
  torso: Sec[];
  torsoPaint: Paint;
  /** Spine joints (body frame): chest, hips, tail0, tail1. */
  chest: V3;
  hips: V3;
  tail0: V3;
  tail1: V3;
  neck: { pos: V3; len: number; pitch: number; r0: number; r1: number; paint: Paint };
  head: (k: Kit, head: THREE.Bone) => HeadParts;
  /** Fore flipper: shoulder position (left, chest frame), size, rest euler (x fwd, z out). */
  fore: { pos: V3; len: number; w: number; paint: Paint; rest: V3; kind?: MatKind };
  /** Hind flippers on tail1. */
  hind: { len: number; w: number; paint: Paint; spread: number; kind?: MatKind };
  /** Whole-body bouncing instead of galumphing. */
  bounce?: boolean;
  extras?: (k: Kit, r: { body: THREE.Bone; chest: THREE.Bone; hips: THREE.Bone; tail0: THREE.Bone; tail1: THREE.Bone; neck: THREE.Bone; head: THREE.Bone }) => {
    jiggles?: JiggleSpec[];
    glow?: THREE.Bone[];
  } | void;
  headUp?: number;
}

export interface PinRig {
  body: THREE.Bone;
  chest: THREE.Bone;
  belly: THREE.Bone;
  hips: THREE.Bone;
  tail0: THREE.Bone;
  tail1: THREE.Bone;
  neck: THREE.Bone;
  head: THREE.Bone;
  jaw: THREE.Bone | null;
  fore: THREE.Bone[];
  foreRest: THREE.Quaternion[];
  hindRest: THREE.Quaternion[];
  hind: THREE.Bone[];
  eyes: THREE.Bone[];
  glow: THREE.Bone[];
  jiggles: JiggleSpec[];
  bodyY: number;
  hipsZ: number;
  len: number;
  halfWidth: number;
  neckRest: number;
  headRest: number;
  jawRest: number;
  bounce: boolean;
  headUp: number;
}

export function buildPinniped(k: Kit, d: PinDef): PinRig {
  const body = k.bone(k.scaled, 'body', 0, d.bodyY, 0);
  const chest = k.bone(body, 'chest', d.chest[0], d.chest[1], d.chest[2]);
  const belly = k.bone(body, 'belly', 0, (d.chest[1] + d.hips[1]) / 2, (d.chest[2] + d.hips[2]) / 2);
  const hips = k.bone(body, 'hips', d.hips[0], d.hips[1], d.hips[2]);
  const tail0 = k.bone(hips, 'tail0', d.tail0[0] - d.hips[0], d.tail0[1] - d.hips[1], d.tail0[2] - d.hips[2]);
  const tail1 = k.bone(tail0, 'tail1', d.tail1[0] - d.tail0[0], d.tail1[1] - d.tail0[1], d.tail1[2] - d.tail0[2]);

  // Torso skinned along the spine (tail1 -> tail0 -> hips -> chest) plus a belly bulge.
  const torso = loft(d.torso, { radial: 18, rings: 16, capRings: 4 });
  const knots = [d.tail1[2] - 1, (d.tail1[2] + d.tail0[2]) / 2, (d.tail0[2] + d.hips[2]) / 2, (d.hips[2] + d.chest[2]) / 2];
  const span = d.chest[2] - d.hips[2];
  const mid = (d.chest[2] + d.hips[2]) / 2;
  const blend = span * 0.25;
  skin(torso, (p, _i, out) => {
    chainWeights(p.z, knots, blend, out);
    const bw = 0.5 * Math.max(0, 1 - Math.abs(p.z - mid) / (span * 0.6));
    out.w[0] *= 1 - bw;
    out.w[1] *= 1 - bw;
    out.idx[2] = 4;
    out.w[2] = bw;
  });
  paint(torso, d.torsoPaint);
  k.addSkinned(torso, 'fur', body, [tail1, tail0, hips, chest, belly]);
  let halfWidth = 0;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const s of d.torso) {
    halfWidth = Math.max(halfWidth, s.w);
    zMin = Math.min(zMin, s.t);
    zMax = Math.max(zMax, s.t);
  }

  // Fore flippers.
  const fore: THREE.Bone[] = [];
  const foreRest: THREE.Quaternion[] = [];
  const fg = leaf(d.fore.w, d.fore.len, d.fore.w * 0.32, 0.15, 0.55, 10, 8);
  fg.rotateX(Math.PI);
  paint(fg, d.fore.paint);
  for (const side of [1, -1]) {
    const b = k.bone(chest, side > 0 ? 'flipL' : 'flipR', side * d.fore.pos[0], d.fore.pos[1], d.fore.pos[2]);
    b.rotation.set(d.fore.rest[0], side * d.fore.rest[1], side * d.fore.rest[2], 'YXZ');
    k.add(fg, d.fore.kind ?? 'fur', b);
    fore.push(b);
    foreRest.push(b.quaternion.clone());
  }
  // Hind flippers: two fans lying flat, pointing back.
  const hind: THREE.Bone[] = [];
  const hindRest: THREE.Quaternion[] = [];
  const jiggles: JiggleSpec[] = [];
  const hg = leaf(d.hind.w, d.hind.len, d.hind.w * 0.28, 0.2, 0.7, 10, 8);
  hg.rotateX(-Math.PI / 2);
  paint(hg, d.hind.paint);
  for (const side of [1, -1]) {
    const b = k.bone(tail1, side > 0 ? 'hindL' : 'hindR', side * d.hind.w * 0.35, 0, -d.hind.w * 0.3);
    b.rotation.set(0.12, side * d.hind.spread, side * 0.15, 'YXZ');
    k.add(hg, d.hind.kind ?? 'fur', b);
    hind.push(b);
    hindRest.push(b.quaternion.clone());
    jiggles.push({ bone: b, tip: new THREE.Vector3(0, 0, -d.hind.len), opts: { freq: 10, zeta: 0.3, gain: 0.012, limit: 0.7 }, role: 'tail', side, up: 0.25, wag: 0.6, delay: side > 0 ? 0 : 0.4 });
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
    { radial: 14, segs: 3, up: [0, 0, 1], capRings: 3 },
  );
  k.add(neckGeo, 'fur', neck, { paint: nk.paint });
  const head = k.bone(neck, 'head', 0, nk.len, 0);
  head.rotation.x = -nk.pitch;
  const hp = d.head(k, head);
  jiggles.push(...(hp.jiggles ?? []));
  const glow: THREE.Bone[] = [...(hp.glow ?? [])];
  const ex = d.extras?.(k, { body, chest, hips, tail0, tail1, neck, head });
  if (ex) {
    if (ex.jiggles) jiggles.push(...ex.jiggles);
    if (ex.glow) glow.push(...ex.glow);
  }
  return {
    body,
    chest,
    belly,
    hips,
    tail0,
    tail1,
    neck,
    head,
    jaw: hp.jaw ?? null,
    fore,
    foreRest,
    hind,
    hindRest,
    eyes: hp.eyes,
    glow,
    jiggles,
    bodyY: d.bodyY,
    hipsZ: d.hips[2],
    len: zMax - zMin,
    halfWidth,
    neckRest: nk.pitch,
    headRest: -nk.pitch,
    jawRest: hp.jaw ? hp.jaw.rotation.x : 0,
    bounce: !!d.bounce,
    headUp: d.headUp ?? 0,
  };
}

export function pinClipParams(r: PinRig, S: number): { lieY: number; faintRoll: number; lunge: number; rear: number; hop: number } {
  return {
    lieY: (r.halfWidth * 0.95 - r.bodyY) / S,
    faintRoll: 2.55,
    lunge: (0.3 * r.len) / S,
    rear: 0.32,
    hop: (0.16 * r.len) / S,
  };
}

/** Seal-specific fidgets: flipper clap, a roll of the shoulders, a big yawn. */
export const PIN_FIDGETS: Clip[] = [
  clip(1.6, {
    FORE_LIFT: [[0, 0], [0.2, 0.9], [0.3, 0.25], [0.42, 0.9], [0.52, 0.25], [0.64, 0.9], [0.74, 0.25], [0.9, 0.6], [1.2, 0]],
    HEAD_P: [[0, 0], [0.2, 0.25], [1.0, 0.25], [1.4, 0]],
    EYES: [[0, 0], [0.15, 0.85], [1.0, 0.85], [1.2, 0]],
    REAR: [[0, 0], [0.2, 0.1], [1.0, 0.1], [1.4, 0]],
  }),
  clip(2.4, {
    HEAD_Y: [[0, 0], [0.4, 0.7], [1.2, 0.65], [1.7, -0.4], [2.4, 0]],
    HEAD_R: [[0, 0], [0.4, 0.25], [1.2, 0.2], [1.7, -0.15], [2.4, 0]],
    WAG: [[0, 0], [0.3, 0.4], [1.8, 0.4], [2.4, 0]],
  }),
  clip(1.9, {
    JAW: [[0.2, 0], [0.65, 1], [1.15, 0.9], [1.45, 0]],
    HEAD_P: [[0, 0], [0.6, 0.45], [1.2, 0.4], [1.8, 0]],
    EYES: [[0.3, 0], [0.6, 1], [1.2, 1], [1.45, 0]],
    REAR: [[0, 0], [0.6, 0.08], [1.2, 0.08], [1.8, 0]],
  }),
  clip(1.3, {
    TAIL_UP: [[0, 0], [0.25, 0.8], [0.5, 0.2], [0.75, 0.8], [1.05, 0]],
    WAG: [[0, 0], [0.2, 0.6], [1.0, 0.6], [1.3, 0]],
    HEAD_Y: [[0, 0], [0.3, -0.5], [1.0, -0.5], [1.3, 0]],
  }),
];

// ---------------------------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------------------------

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const TAU = Math.PI * 2;

export class PinModel extends CreatureBase {
  private readonly r: PinRig;
  private readonly jig: JiggleSet;
  private cycle = 0;
  private breath = 0;
  private chestLift = 0;
  private hump = 0;
  private paddle = 0;
  private air = 0;
  private readonly lookY: Spring = spring();
  private readonly lookP: Spring = spring();
  private lookTY = 0;
  private lookTP = 0;
  private lookTimer = 1.2;

  constructor(init: BaseInit, rig: PinRig) {
    super(init);
    this.r = rig;
    this.jig = new JiggleSet(rig.jiggles);
    this.cycle = this.rand();
    this.update(0, 0);
  }

  protected resetPlan(): void {
    this.jig.reset();
  }

  protected locomote(dt: number): void {
    const r = this.r;
    const b = this.base;
    const S = this.S;
    const L = r.len;
    const turnV = Math.abs(this.yawRate) * L * 0.35;
    const v = Math.max(this.speed, turnV);
    // Galumph / bounce stride; past the cadence cap the stride stretches into a belly slide.
    const fMax = (r.bounce ? 3.4 : 2.6) / Math.sqrt(Math.max(0.2, L * this.scale));
    const strideLen = Math.max(L * (r.bounce ? 0.5 : 0.42), v / fMax);
    this.cycle += (v * dt) / strideLen;
    const m = smoothstep(0, 0.25 * L * fMax, v);
    this.idleW = 1 - m;
    const u = this.cycle;
    const slide = smoothstep(L * 0.42 * fMax, L * 0.42 * fMax * 1.8, v);
    if (r.bounce) {
      // Hop: airborne for most of the cycle, squash on landing.
      const ph = u - Math.floor(u);
      const h = Math.sin(Math.PI * ph);
      this.air = h * m;
      b[CH.Y] += (0.16 * L * Math.pow(h, 0.8) * m) / S;
      b[CH.SQUASH] += (-0.14 * (1 - smoothstep(0, 0.18, ph)) * (1 - smoothstep(0.82, 1, ph)) + 0.08 * h - 0.04) * m;
      b[CH.PITCH] += -0.12 * Math.cos(Math.PI * ph) * m;
      b[CH.TAIL_UP] += 0.4 * h * m;
      this.chestLift = 0;
      this.hump = 0;
      this.paddle = 0.4 * h * m;
    } else {
      // Galumph: chest lifts and reaches, then the hips hump through.
      const a = 1 - slide * 0.7;
      this.chestLift = 0.18 * Math.max(0, Math.sin(TAU * u)) * m * a;
      this.hump = 0.32 * Math.max(0, Math.sin(TAU * (u - 0.45))) * m * a;
      this.paddle = Math.sin(TAU * u) * m;
      this.air = 0;
      b[CH.Y] += ((0.035 * L * Math.max(0, Math.sin(TAU * u)) + 0.025 * L * Math.max(0, Math.sin(TAU * (u - 0.45)))) * m * a) / S;
      b[CH.Z] += (0.02 * L * Math.sin(TAU * u) * m * a) / S;
      b[CH.HEAD_P] += 0.08 * Math.sin(TAU * u + 0.6) * m;
      b[CH.ROLL] += 0.04 * Math.sin(TAU * u * 0.5) * m;
    }
    b[CH.ROLL] += clamp(-this.yawRate * this.speed * 0.06, -0.3, 0.3);
    b[CH.HEAD_Y] += clamp(this.yawRate * 0.18, -0.5, 0.5);

    // Idle life.
    const iw = this.idleW;
    const period = 2.2 + 1.2 * S * this.scale;
    this.breath = Math.sin((this.time * TAU) / period);
    b[CH.Y] += (0.006 * L * this.breath) / S;
    b[CH.ROLL] += 0.03 * wobble(this.time * 0.3, this.seed) * iw;
    b[CH.HEAD_P] += r.headUp;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTY = (this.rand() * 2 - 1) * 0.5;
      this.lookTP = this.rand() * 0.35 - 0.1;
      this.lookTimer = 1.2 + this.rand() * 3;
    }
    stepSpring(this.lookY, this.lookTY, 6, 0.7, dt);
    stepSpring(this.lookP, this.lookTP, 6, 0.7, dt);
    b[CH.HEAD_Y] += this.lookY.x * iw;
    b[CH.HEAD_P] += this.lookP.x * iw;
    b[CH.TAIL_UP] += 0.15 * wobble(this.time * 0.5, this.seed + 7) * iw;
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
    let y = r.bodyY + p[CH.Y] * S;
    let z = p[CH.Z] * S;
    const tr = p[CH.TREMBLE];
    if (tr > 0) {
      x += tr * 0.006 * S * Math.sin(t * TAU * 21);
      y += tr * 0.004 * S * Math.sin(t * TAU * 17 + 1);
    }
    const roll = p[CH.ROLL] + p[CH.SHAKE] * 0.3 * Math.sin(t * TAU * 6.5);
    const rear = p[CH.REAR];
    // Rear-ups pivot about the hips.
    const oz = -r.hipsZ;
    y += -oz * Math.sin(-rear);
    z += oz * Math.cos(-rear) - oz;
    const pitch = p[CH.PITCH] + rear * 0.5;
    r.body.position.set(x, y, z);
    r.body.rotation.set(-pitch, p[CH.YAW], roll, 'YXZ');
    const flex = p[CH.FLEX];
    // Chest up for rears and the galumph reach; hump arches the back.
    r.chest.rotation.set(-(rear * 0.5 + this.chestLift + flex * 0.4) + this.hump * 0.3, 0, 0, 'YXZ');
    r.hips.rotation.set(-this.hump * 0.35 + rear * 0.25, clamp(-this.yawRate * 0.08, -0.25, 0.25), 0, 'YXZ');
    const tailUp = p[CH.TAIL_UP] * 0.35 + p[CH.HIND_LIFT] * 2 - limp * 0.1;
    r.tail0.rotation.set(this.hump * 0.45 - tailUp * 0.5 - rear * 0.25, 0, 0, 'YXZ');
    r.tail1.rotation.set(this.hump * 0.2 - tailUp * 0.6, Math.sin(t * 1.3) * 0.05 * this.idleW, 0, 'YXZ');
    r.belly.scale.set(1 + this.breath * 0.04, 1 + this.breath * 0.035, 1);

    const stab = 0.6 * pitch;
    r.neck.rotation.set(r.neckRest - p[CH.NECK] - p[CH.HEAD_P] * 0.35 + stab * 0.4, p[CH.HEAD_Y] * 0.4, -roll * 0.3, 'YXZ');
    r.head.rotation.set(
      r.headRest - p[CH.HEAD_P] * 0.65 + stab * 0.6 + p[CH.SNIFF] * 0.06 * Math.sin(t * TAU * 7),
      p[CH.HEAD_Y] * 0.6,
      p[CH.HEAD_R] - roll * 0.4 - p[CH.SHAKE] * 0.35 * Math.sin(t * TAU * 6.5 + 0.6),
      'YXZ',
    );
    if (r.jaw) r.jaw.rotation.x = r.jawRest + p[CH.JAW] * 0.5;
    this.applyFace(r.eyes, r.glow);

    // Fore flippers: paddle with the galumph, swing forward for lunges, raise to clap / wave.
    const raise = clamp(p[CH.FORE_LIFT] * 3, -0.5, 1.6);
    const spread = this.air * 0.9 + limp * 1.1;
    const fwd = p[CH.FORE_Z] * 4 + this.paddle * 0.45;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      _e.set(-fwd - raise * 0.9, 0, side * (spread - raise * 0.45), 'YXZ');
      _q.setFromEuler(_e);
      r.fore[i].quaternion.copy(r.foreRest[i]).multiply(_q);
    }

    this.root.updateMatrixWorld(true);
    this.jig.update(p, dt, t, this.idleW);
  }
}
