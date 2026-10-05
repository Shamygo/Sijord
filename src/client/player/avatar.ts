import * as THREE from 'three';
import { withTrainerAsset } from './imported-trainer';
import type { Appearance } from '../../shared/types';
import {
  clamp,
  damp,
  fract,
  footRoll,
  legCycleZ,
  lerp,
  smootherstep,
  smoothstep,
  solveTwoBone,
  spring,
  stepSpring,
  warpPhase,
  wrapAngle,
  type IkResult,
  type LegZ,
  type Spring,
} from './anim-math';
import {
  AIR_APEX,
  AIR_FALL,
  AIR_RISE_RUN,
  AIR_RISE_STAND,
  ARM,
  ARM_L,
  ARM_R,
  BODY_CHANNELS,
  CH,
  FIDGETS,
  GESTURES,
  type GestureName,
  GAITS,
  IDLE,
  JUMP_CROUCH,
  LAND_HEAVY,
  LEG,
  LEG_L,
  LEG_R,
  POSE_SIZE,
  SKID,
  TIRED_MOVE,
  TIRED_STAND,
  addGaitUpper,
  gaitFoot,
  gaitWeights,
  mirrorPose,
  newPose,
  sampleClip,
  strideParams,
  type Clip,
  type Pose,
  type StrideParams,
} from './avatar-clips';
import { RIG, buildRig, disposeTree, type Rig } from './avatar-rig';
import { PLAYER_TUNING } from './controller';
import type { AnimateInput, Avatar, GroundFn } from './types';

/**
 * Procedural trainer avatar animated like a keyframed character:
 *
 * - Locomotion is a 1D blend space (walk / jog / sprint) of hand-keyed cycles sharing one phase
 *   that advances with distance travelled, so stride length and cadence always match the speed.
 * - Feet are placed with two-bone IK: stance feet are locked to the world (no skating, even
 *   through turns), heel strike and toe-off roll around the heel and ball, and on terrain the
 *   feet follow the ground and the hips drop so the downhill leg can reach.
 * - Standing feet stay planted and take small steps when the body turns or drifts away from
 *   them (turn-in-place, settling after a stop).
 * - The body leans into acceleration (start, brake, turns) through a spring, so it overshoots
 *   and settles; skids, jumps (crouch, launch, tuck, apex, reach), landings (squash scaled by
 *   fall speed), exhaustion and idle fidgets are layered on top.
 * - The head stays level and looks along the direction of travel; backpack, hood, drawstrings,
 *   hair and hem are simulated as damped pendulums driven by the real motion of their anchors.
 *
 * The root origin is at the feet and faces +Z. Pass world position and yaw in `animate` (a full
 * PlayerSnapshot does) to get foot locking and turn/acceleration detection; without them the
 * avatar animates in place.
 */

/** Tunables for the avatar's animation. */
export const AVATAR_ANIM = {
  /** Multiplies stride length (> 1: fewer, longer steps; feet slide when far from 1). */
  strideScale: 1,
  /** Upper-body blend rate between idle and locomotion (1/s). */
  locoBlendRate: 8,
  /** Air pose blend rates in and out (1/s). */
  airBlendIn: 20,
  airBlendOut: 32,
  /** Lean into acceleration: gain on atan(a/g), clamps, and the lean spring (overshoots a little). */
  leanGain: 0.42,
  rollGain: 0.22,
  maxLean: 0.3,
  maxRoll: 0.2,
  leanFreq: 9,
  leanDamping: 0.55,
  /** Visual take-off: feet stay planted this long while the body coils, then launch. */
  takeoffHold: 0.05,
  takeoffRelease: 0.08,
  /** Landing: hips drop proportional to fall speed, sprung recovery. */
  landSquash: 1,
  landFreq: 12,
  landDamping: 0.45,
  /** Fall speed (m/s) for the heavy crouch landing. */
  heavyLandSpeed: 13,
  heavyLandHold: 0.3,
  /** Stance-foot lock: released if the planted foot drifts this far from the cycle (m). */
  footLockDrift: 0.32,
  /** Stepping in place. */
  stepDistance: 0.12,
  stepYaw: 0.5,
  stepDuration: 0.25,
  stepHeight: 0.075,
  /** Head stabilisation (0 = follows the chest, 1 = locked level) and look lead into turns (s). */
  headStabilize: 0.88,
  lookLead: 0.16,
  /** Skid detection: braking deceleration (m/s²) above this while moving faster than skidMinSpeed. */
  skidDecel: 21,
  skidMinSpeed: 2.2,
  /** How long the out-of-breath look lingers after sprint is available again (s). */
  tiredLinger: 1.2,
  /** Idle fidgets: first after this long standing still, then every min..max seconds. */
  fidgetFirst: 5,
  fidgetMin: 7,
  fidgetMax: 12,
};

const GRAVITY = 9.81;
const STAND_TO_LOCO = 0.3;
const LOCO_TO_STAND = 0.12;

// Scratch objects.
const _e = new THREE.Euler();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const _qPelvis = new THREE.Quaternion();
const _qChest = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _target = new THREE.Vector3();
const _hip = new THREE.Vector3();
const _pelvisPos = new THREE.Vector3();
const _ik: IkResult = { bend: 0, reach: 0 };
const _lz: LegZ = { z: 0, stance: true, t: 0 };
const _foot = { lift: 0, pitch: 0 };
const _roll = { z: 0, y: 0 };
const _identity = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);

function quatYXZ(pitch: number, yaw: number, roll: number, out: THREE.Quaternion): THREE.Quaternion {
  _e.set(pitch, yaw, roll, 'YXZ');
  return out.setFromEuler(_e);
}

/** A foot's planting state across stand and locomotion modes. */
interface FootState {
  side: 1 | -1;
  base: number;
  // Standing: world anchor and an optional step towards the rest pose.
  anchor: THREE.Vector3;
  anchorYaw: number;
  stepping: boolean;
  stepT: number;
  stepFrom: THREE.Vector3;
  stepFromYaw: number;
  stepFromLift: number;
  // Locomotion: stance lock and the offset blended out over the swing.
  wasStance: boolean;
  lockW: number;
  lockPos: THREE.Vector3;
  lockYaw: number;
  offX: number;
  offZ: number;
  offYaw: number;
  swX: number;
  swZ: number;
  swYaw: number;
  // Cross-fade of lift/pitch after a mode switch.
  fadeW: number;
  fadeLift: number;
  fadePitch: number;
  // Last output in world space (hand-over between modes).
  outWorld: THREE.Vector3;
  outYaw: number;
  outLift: number;
  outPitch: number;
  outZ: number;
  /** Ground height under the foot relative to the reference height (last frame). */
  ground: number;
}

function newFoot(side: 1 | -1): FootState {
  return {
    side,
    base: side > 0 ? LEG_L : LEG_R,
    anchor: new THREE.Vector3(),
    anchorYaw: 0,
    stepping: false,
    stepT: 0,
    stepFrom: new THREE.Vector3(),
    stepFromYaw: 0,
    stepFromLift: 0,
    wasStance: true,
    lockW: 0,
    lockPos: new THREE.Vector3(),
    lockYaw: 0,
    offX: 0,
    offZ: 0,
    offYaw: 0,
    swX: 0,
    swZ: 0,
    swYaw: 0,
    fadeW: 0,
    fadeLift: 0,
    fadePitch: 0,
    outWorld: new THREE.Vector3(),
    outYaw: 0,
    outLift: 0,
    outPitch: 0,
    outZ: 0,
    ground: 0,
  };
}

/**
 * A dangling part (backpack, hood, drawstring, ponytail) simulated as a damped point mass on a
 * rigid rod hanging from a pivot. The pivot moves with the body; the tip lags, swings and
 * settles, and the resulting direction becomes the part's local rotation (clamped).
 */
interface Dangle {
  obj: THREE.Object3D;
  /** Rest direction in the parent's space and the rod length. */
  rest: THREE.Vector3;
  len: number;
  freq: number;
  zeta: number;
  /** 0..1: how much the rest direction leans towards world-down (gravity). */
  gravity: number;
  /** Local angle limits (radians) around X (pitch) and Z (roll). */
  minPitch: number;
  maxPitch: number;
  maxRoll: number;
  /** Fraction of the simulated swing applied. */
  amount: number;
  tip: THREE.Vector3;
  vel: THREE.Vector3;
  /** Previous target tip, to damp relative to the pivot's own motion. */
  prevTarget: THREE.Vector3;
  init: boolean;
  /** Base local rotation (from the model) the swing is applied on top of. */
  baseQ: THREE.Quaternion;
}

function makeDangle(
  obj: THREE.Object3D,
  opts: { len: number; freq: number; zeta: number; gravity: number; minPitch: number; maxPitch: number; maxRoll: number; amount?: number; rest?: THREE.Vector3 },
): Dangle {
  return {
    obj,
    rest: (opts.rest ?? new THREE.Vector3(0, -1, 0)).clone().normalize(),
    len: opts.len,
    freq: opts.freq,
    zeta: opts.zeta,
    gravity: opts.gravity,
    minPitch: opts.minPitch,
    maxPitch: opts.maxPitch,
    maxRoll: opts.maxRoll,
    amount: opts.amount ?? 1,
    tip: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    prevTarget: new THREE.Vector3(),
    init: false,
    baseQ: obj.quaternion.clone(),
  };
}

/** Deterministic per-avatar random numbers. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

class AvatarImpl implements Avatar {
  readonly root = new THREE.Group();
  private rig: Rig;
  private appearance: Appearance;
  private ground: GroundFn | null = null;
  private dangles: Dangle[] = [];
  private readonly rand = rng(Math.floor(Math.random() * 1e9));

  // ---- Sensing ----
  private first = true;
  private hasWorld = false;
  private readonly pos = new THREE.Vector3();
  private yaw = 0;
  private readonly vel = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private vy = 0;
  private minVy = 0;
  private yawRate = 0;
  private speed = 0;
  private recentSpeed = 0;
  private airborne = false;
  private airTime = 0;
  private lastGroundY = 0;
  private slopeX = 0;
  private slopeZ = 0;
  /** Smoothed ground slope along the facing (rise per metre). */
  private slopeFwd = 0;
  /** Visual body offset (take-off hold) and the reference height feet are measured from. */
  private bodyOffsetY = 0;
  private refY = 0;

  // ---- Locomotion ----
  private mode: 'stand' | 'loco' = 'stand';
  private standTimer = 0;
  private phase = 0;
  private readonly gw: number[] = [1, 0, 0];
  private readonly stride: StrideParams = { cycleLen: 1, duty: 0.6, liftTan: 0, reachTan: 0, footX: 0, footYaw: 0, kneeOut: 0, footZ: 0 };
  private locoW = 0;
  private airW = 0;
  private readonly feet: FootState[] = [newFoot(1), newFoot(-1)];

  // ---- Events ----
  private takeoffT = -1;
  private takeoffGroundY = 0;
  private jumpRun = 0;
  private jumpLeadR = false;
  private readonly land: Spring = spring();
  private heavyT = -1;
  private skidW = 0;
  private skidHold = 0;
  private stamina = 1;
  private exhausted = false;
  private exhaustT = 0;
  private sinceSprint = 10;
  private tiredLinger = 0;
  private tiredW = 0;
  private tiredStandW = 0;
  private readonly leanP: Spring = spring();
  private readonly leanR: Spring = spring();
  private lookYaw = 0;
  private time = 0;

  // ---- Idle ----
  private idleT = 0;
  private readonly shift: Spring = spring();
  private shiftTarget = 0;
  private shiftTimer = 3;
  private fidget: Clip | null = null;
  private fidgetT = 0;
  private fidgetW = 0;
  private lastFidget = -1;
  private nextFidget = AVATAR_ANIM.fidgetFirst;
  private glanceYaw = 0;
  private glancePitch = 0;
  private glanceTimer = 2;
  private glanceYawS = 0;
  private glancePitchS = 0;
  private breath = 0;
  private breathRate = 0.25;
  private blinkT = 2;
  private blinkPhase = -1;
  private doubleBlink = false;
  private packKicked = false;

  // ---- Pose buffers ----
  private readonly pose = newPose();
  private readonly standPose = newPose();
  private readonly locoPose = newPose();
  private readonly airPose = newPose();
  private readonly tmpPose = newPose();
  private readonly tmpPose2 = newPose();
  private readonly mirrored = {
    riseRun: mirrorPose(AIR_RISE_RUN),
  };

  // ---- Secondary ----
  private readonly hemYaw: Spring = spring();
  private readonly hemPitch: Spring = spring();
  private prevChestYaw = 0;

  constructor(appearance: Appearance) {
    this.root.name = 'avatar';
    this.appearance = { ...appearance };
    this.rig = buildRig(this.appearance);
    this.root.add(this.rig.body);
    this.makeDangles();
    this.animate(1 / 60, { speed: 0, anim: 'idle' });
  }

  setAppearance(a: Appearance): void {
    this.appearance = { ...a };
    this.root.remove(this.rig.body);
    disposeTree(this.rig.body);
    this.rig = buildRig(this.appearance);
    this.root.add(this.rig.body);
    this.makeDangles();
    this.applyPose(this.pose, 0);
  }

  gesture(name: GestureName): void {
    const c = GESTURES[name];
    this.fidget = c;
    this.fidgetT = 0;
    this.fidgetW = 0;
    this.packKicked = false;
    this.nextFidget = this.idleT + c.duration + AVATAR_ANIM.fidgetMin;
  }

  setGround(fn: GroundFn | null): void {
    this.ground = fn;
  }

  dispose(): void {
    disposeTree(this.rig.body);
    this.root.remove(this.rig.body);
  }

  private makeDangles(): void {
    const r = this.rig;
    this.dangles = [
      makeDangle(r.pack, { len: 0.22, freq: 14, zeta: 0.3, gravity: 0.25, minPitch: -0.02, maxPitch: 0.22, maxRoll: 0.14, amount: 0.38 }),
      makeDangle(r.hood, { len: 0.1, freq: 13, zeta: 0.3, gravity: 0.3, minPitch: -0.12, maxPitch: 0.35, maxRoll: 0.2, amount: 0.7 }),
      ...r.strings.map((s) => makeDangle(s, { len: 0.12, freq: 15, zeta: 0.22, gravity: 1, minPitch: -0.15, maxPitch: 0.9, maxRoll: 0.6 })),
    ];
    if (r.hairSway) {
      const long = this.appearance.hairStyle % 4 === 2;
      this.dangles.push(
        long
          ? makeDangle(r.hairSway, { len: 0.2, freq: 11, zeta: 0.35, gravity: 0.25, minPitch: -0.05, maxPitch: 0.4, maxRoll: 0.25, amount: 0.8 })
          : makeDangle(r.hairSway, { len: 0.2, freq: 9, zeta: 0.22, gravity: 0.7, minPitch: -0.35, maxPitch: 0.8, maxRoll: 0.6 }),
      );
    }
  }

  // =============================================================================================
  // Frame update
  // =============================================================================================
  animate(dtIn: number, info: AnimateInput): void {
    const dt = clamp(dtIn, 0, 0.1);
    this.sense(dt, info);
    if (dt > 0) {
      this.time += dt;
      this.updateStates(dt, info);
    }
    this.buildPose(dt);
    this.applyPose(this.pose, dt);
    if (dt > 0) {
      this.secondary(dt);
      this.blink(dt);
    }
  }

  // ---- Sensing ------------------------------------------------------------------------------
  private sense(dt: number, info: AnimateInput): void {
    const hasWorld = typeof info.x === 'number' && typeof info.z === 'number' && typeof info.yaw === 'number';
    const x = hasWorld ? info.x! : 0;
    const y = hasWorld ? (info.y ?? 0) : 0;
    const z = hasWorld ? info.z! : 0;
    const yaw = hasWorld ? info.yaw! : 0;
    const air = info.grounded !== undefined ? !info.grounded : info.anim === 'jump' || info.anim === 'fall';
    const jumped = Math.hypot(x - this.pos.x, z - this.pos.z) > 4 || Math.abs(y - this.pos.y) > 6;
    if (this.first || hasWorld !== this.hasWorld || jumped || dt <= 0) {
      const reset = this.first || hasWorld !== this.hasWorld || jumped;
      this.hasWorld = hasWorld;
      this.pos.set(x, y, z);
      this.yaw = yaw;
      if (reset) {
        this.first = false;
        this.vel.set(0, 0, 0);
        this.prevVel.set(0, 0, 0);
        this.acc.set(0, 0, 0);
        this.vy = 0;
        this.yawRate = 0;
        this.speed = hasWorld ? 0 : info.speed;
        this.airborne = air;
        this.lastGroundY = y;
        this.refY = y;
        this.resetFeet();
        for (const d of this.dangles) d.init = false;
      }
      return;
    }
    if (hasWorld) {
      const vx = (x - this.pos.x) / dt;
      const vz = (z - this.pos.z) / dt;
      const vyRaw = (y - this.pos.y) / dt;
      this.vel.x = damp(this.vel.x, vx, 30, dt);
      this.vel.z = damp(this.vel.z, vz, 30, dt);
      this.vy = damp(this.vy, vyRaw, 30, dt);
      this.yawRate = damp(this.yawRate, wrapAngle(yaw - this.yaw) / dt, 20, dt);
    } else {
      const s = Math.max(0, info.speed || 0);
      this.vel.set(0, 0, s);
      this.vy = info.anim === 'jump' ? 4 : info.anim === 'fall' ? -5 : 0;
      this.yawRate = 0;
    }
    const ax = (this.vel.x - this.prevVel.x) / dt;
    const az = (this.vel.z - this.prevVel.z) / dt;
    this.acc.x = damp(this.acc.x, clamp(ax, -60, 60), 14, dt);
    this.acc.z = damp(this.acc.z, clamp(az, -60, 60), 14, dt);
    this.prevVel.copy(this.vel);
    this.pos.set(x, y, z);
    this.yaw = yaw;
    const planar = Math.hypot(this.vel.x, this.vel.z);
    this.speed = damp(this.speed, planar, 16, dt);
    this.recentSpeed = Math.max(this.speed, this.recentSpeed - dt * 6);

    // Slope estimate along the direction of travel (used when no ground function is set).
    if (!air && hasWorld && planar > 0.6 && !this.ground) {
      const g = clamp(this.vy / planar, -1.5, 1.5);
      this.slopeX = damp(this.slopeX, (g * this.vel.x) / planar, 6, dt);
      this.slopeZ = damp(this.slopeZ, (g * this.vel.z) / planar, 6, dt);
    }

    // Take-off / landing.
    if (air && !this.airborne) {
      this.airTime = 0;
      this.minVy = 0;
      if (this.vy > 1.5) {
        this.takeoffT = 0;
        this.takeoffGroundY = this.lastGroundY;
        this.jumpRun = smoothstep(1.2, 4, this.speed);
        // The leg in swing drives up; the stance leg pushes off and trails.
        const uL = fract(this.phase);
        this.jumpLeadR = this.mode === 'loco' && uL < this.stride.duty;
      }
    } else if (!air && this.airborne) {
      this.onLand(Math.max(0, -this.minVy));
    }
    if (air) {
      this.airTime += dt;
      this.minVy = Math.min(this.minVy, this.vy);
    } else {
      this.lastGroundY = y;
    }
    this.airborne = air;
  }

  private resetFeet(): void {
    for (const f of this.feet) {
      const s = f.side;
      const bx = s * (this.hipX() + IDLE[f.base + LEG.x]);
      const bz = IDLE[f.base + LEG.z];
      this.toWorld(bx, bz, f.anchor);
      f.anchorYaw = this.yaw + s * IDLE[f.base + LEG.yaw];
      f.stepping = false;
      f.lockW = 0;
      f.fadeW = 0;
      f.outWorld.copy(f.anchor);
      f.outYaw = f.anchorYaw;
      f.outLift = 0;
      f.outPitch = 0;
    }
    this.mode = 'stand';
    this.takeoffT = -1;
  }

  private hipX(): number {
    return Math.abs(this.rig.legL.thigh.position.x);
  }

  /** Body space (x, z) → world (x, z) in `out`. */
  private toWorld(bx: number, bz: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    out.set(this.pos.x + c * bx + s * bz, 0, this.pos.z - s * bx + c * bz);
    return out;
  }

  /** World (x, z) → body space (x, z) in `out`. */
  private toBody(wx: number, wz: number, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const dx = wx - this.pos.x;
    const dz = wz - this.pos.z;
    out.set(c * dx - s * dz, 0, s * dx + c * dz);
    return out;
  }

  /** Ground height relative to the feet reference height at body-space (bx, bz). */
  private groundAt(bx: number, bz: number): number {
    if (!this.hasWorld) return 0;
    const w = this.toWorld(bx, bz, _v3);
    if (this.ground) return this.ground(w.x, w.z) - this.refY;
    return (w.x - this.pos.x) * this.slopeX + (w.z - this.pos.z) * this.slopeZ + (this.pos.y - this.refY);
  }

  // ---- State machine --------------------------------------------------------------------------
  private updateStates(dt: number, info: AnimateInput): void {
    const T = AVATAR_ANIM;
    const P = PLAYER_TUNING;

    // Take-off hold: the body coils on the ground for a few frames, then launches.
    let holding = false;
    if (this.takeoffT >= 0) {
      this.takeoffT += dt;
      holding = this.takeoffT < T.takeoffHold;
      if (this.takeoffT > T.takeoffHold + T.takeoffRelease) this.takeoffT = -1;
    }
    const inAir = this.airborne && !holding;
    let holdW = 0;
    if (this.takeoffT >= 0) {
      holdW = holding ? 1 : 1 - smootherstep(0, 1, (this.takeoffT - T.takeoffHold) / T.takeoffRelease);
    }
    this.bodyOffsetY = -Math.max(0, this.pos.y - this.takeoffGroundY) * holdW;
    this.refY = this.pos.y + this.bodyOffsetY;

    this.airW = damp(this.airW, inAir ? 1 : 0, inAir ? T.airBlendIn : T.airBlendOut, dt);

    // Gait blend and stride.
    gaitWeights(this.speed, this.gw);
    strideParams(this.speed, this.gw, this.stride);
    // Slope along the facing (rise per metre): shorter, quicker steps on inclines.
    const slope = this.hasWorld && !inAir ? (this.groundAt(0, 0.45) - this.groundAt(0, -0.45)) / 0.9 : 0;
    this.slopeFwd = damp(this.slopeFwd, clamp(slope, -1.2, 1.2), 6, dt);
    this.stride.cycleLen *= T.strideScale * (1 - 0.28 * Math.max(0, this.slopeFwd) - 0.12 * Math.max(0, -this.slopeFwd));

    // Stand ↔ locomotion with hysteresis.
    if (!inAir) {
      if (this.mode === 'stand' && this.speed > STAND_TO_LOCO) this.startLoco();
      else if (this.mode === 'loco') {
        this.standTimer = this.speed < LOCO_TO_STAND ? this.standTimer + dt : 0;
        if (this.standTimer > 0.08) this.startStand();
      }
    }
    const locoTarget = this.mode === 'loco' ? smoothstep(0.05, 1.0, this.speed) : 0;
    this.locoW = damp(this.locoW, locoTarget, T.locoBlendRate, dt);

    // Phase advances with distance travelled on the ground.
    if (!inAir) this.phase = fract(this.phase + (this.speed * dt) / Math.max(0.2, this.stride.cycleLen));

    // Lean into the horizontal acceleration (body space), through an underdamped spring.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const aSide = c * this.acc.x - s * this.acc.z;
    const aFwd = s * this.acc.x + c * this.acc.z;
    const grounded = 1 - this.airW;
    const leanT = clamp(Math.atan2(aFwd, GRAVITY) * T.leanGain, -T.maxLean, T.maxLean) * grounded;
    const rollT = clamp(-Math.atan2(aSide, GRAVITY) * T.rollGain, -T.maxRoll, T.maxRoll) * grounded;
    stepSpring(this.leanP, leanT, T.leanFreq, T.leanDamping, dt);
    stepSpring(this.leanR, rollT, T.leanFreq, T.leanDamping, dt);

    // Skid: hard braking at speed (input reversed).
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const aLong = sp > 0.1 ? (this.acc.x * this.vel.x + this.acc.z * this.vel.z) / sp : 0;
    if (!inAir && sp > T.skidMinSpeed && -aLong > T.skidDecel) this.skidHold = 0.16;
    this.skidHold = Math.max(0, this.skidHold - dt);
    this.skidW = damp(this.skidW, this.skidHold > 0 && sp > 0.8 ? 1 : 0, this.skidHold > 0 ? 24 : 7, dt);

    // Exhaustion: use the controller's flag when given, else mirror its stamina model.
    const sprinting = !this.airborne && this.speed > P.walkSpeed + 0.5;
    let exhausted: boolean;
    if (info.tired !== undefined) {
      exhausted = info.tired;
    } else {
      if (sprinting) {
        this.sinceSprint = 0;
        this.stamina = Math.max(0, this.stamina - P.staminaDrain * dt);
        if (this.stamina <= 0 && !this.exhausted) {
          this.exhausted = true;
          this.exhaustT = P.exhaustLockout;
        }
      } else {
        this.sinceSprint += dt;
        if (this.sinceSprint >= P.staminaRegenDelay) this.stamina = Math.min(1, this.stamina + P.staminaRegen * dt);
      }
      if (this.exhausted) {
        this.exhaustT -= dt;
        if (this.exhaustT <= 0 && this.stamina >= P.exhaustRecoverTo) this.exhausted = false;
      }
      exhausted = this.exhausted;
    }
    // The out-of-breath look lingers a little after sprint is available again.
    this.tiredLinger = exhausted ? T.tiredLinger : Math.max(0, this.tiredLinger - dt);
    const tiredOn = (exhausted || this.tiredLinger > 0) && !sprinting;
    this.tiredW = damp(this.tiredW, tiredOn ? 1 : 0, tiredOn ? 3 : 1.4, dt);
    // Hands on knees once stopped while out of breath.
    const standTired = tiredOn && this.mode === 'stand' && !this.airborne;
    this.tiredStandW = damp(this.tiredStandW, standTired ? 1 : 0, standTired ? 4 : 1.8, dt);

    // Breathing: faster and deeper after exertion.
    const exertion = Math.max(this.tiredW, smoothstep(2, 8, this.recentSpeed) * 0.5, (1 - this.stamina) * 0.6);
    this.breathRate = damp(this.breathRate, lerp(0.26, 0.85, exertion), 0.8, dt);
    this.breath = fract(this.breath + this.breathRate * dt);

    // Landing spring and heavy landing hold.
    stepSpring(this.land, 0, T.landFreq, T.landDamping, dt);
    if (this.heavyT >= 0) {
      this.heavyT += dt;
      if (this.heavyT > T.heavyLandHold + 0.5 || (this.speed > 2 && this.heavyT > 0.12)) this.heavyT = -1;
    }

    // Head look: along the velocity, leading into turns, plus idle glances.
    let lookT = 0;
    if (this.speed > 0.6) {
      const vbx = c * this.vel.x - s * this.vel.z;
      const vbz = s * this.vel.x + c * this.vel.z;
      lookT = clamp(Math.atan2(vbx, vbz), -1.0, 1.0) * smoothstep(0.6, 2, this.speed);
    }
    lookT = clamp(lookT + this.yawRate * T.lookLead, -1.1, 1.1);
    this.lookYaw = damp(this.lookYaw, lookT, 10, dt);

    this.updateIdle(dt);
  }

  private onLand(fallSpeed: number): void {
    const T = AVATAR_ANIM;
    const impact = smoothstep(1.5, 14, fallSpeed);
    this.land.v -= T.landSquash * (0.35 + 2.6 * impact);
    if (fallSpeed > T.heavyLandSpeed) this.heavyT = 0;
    this.takeoffT = -1;
    // Hand the feet over from the air pose.
    if (this.speed > 0.6) {
      // The more forward foot takes the first contact.
      const [fl, fr] = this.feet;
      const leadR = fr.outZ > fl.outZ;
      this.phase = leadR ? 0.5 : 0.0;
      this.mode = 'loco';
      this.handOverToLoco(0.08);
    } else {
      this.mode = 'stand';
      for (const f of this.feet) {
        f.anchor.copy(f.outWorld);
        f.anchorYaw = f.outYaw;
        f.stepping = false;
        f.fadeW = 1;
        f.fadeLift = 0;
        f.fadePitch = f.outPitch;
      }
    }
  }

  private startLoco(): void {
    this.mode = 'loco';
    // The foot further behind along the travel direction steps first.
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const dirX = this.speed > 0.01 ? this.vel.x / Math.max(this.speed, 1e-3) : s;
    const dirZ = this.speed > 0.01 ? this.vel.z / Math.max(this.speed, 1e-3) : c;
    const [fl, fr] = this.feet;
    const dl = (fl.anchor.x - this.pos.x) * dirX + (fl.anchor.z - this.pos.z) * dirZ;
    const dr = (fr.anchor.x - this.pos.x) * dirX + (fr.anchor.z - this.pos.z) * dirZ;
    const stepR = dr < dl;
    const duty = this.stride.duty;
    // Stepping foot at lift-off.
    this.phase = stepR ? fract(duty - 0.5 + 0.02) : duty + 0.02;
    this.handOverToLoco(0.14);
  }

  /** Initialise stance locks and swing offsets from the current foot outputs. */
  private handOverToLoco(fade: number): void {
    for (const f of this.feet) {
      const u = fract(this.phase + (f.side < 0 ? 0.5 : 0));
      const stance = u < this.stride.duty;
      f.wasStance = stance;
      f.stepping = false;
      f.fadeW = fade > 0 ? 1 : 0;
      f.fadeLift = f.outLift;
      f.fadePitch = f.outPitch;
      if (stance) {
        f.lockPos.copy(f.outWorld);
        f.lockYaw = f.outYaw;
        f.lockW = this.hasWorld ? 1 : 0;
        f.offX = f.offZ = f.offYaw = 0;
      } else {
        f.lockW = 0;
        // The swing offset is measured on the first locomotion frame (see locoFeet).
        f.swX = f.swZ = f.swYaw = Number.NaN;
      }
    }
  }

  private startStand(): void {
    this.mode = 'stand';
    this.standTimer = 0;
    for (const f of this.feet) {
      f.anchor.copy(f.outWorld);
      f.anchorYaw = f.outYaw;
      f.stepping = false;
      f.fadeW = 0;
      // A foot still in the air finishes its step down to the rest pose.
      if (f.outLift > 0.015) this.beginStep(f);
    }
    // Plant and settle: a little give in the knees scaled by how fast we were going.
    this.land.v -= 0.12 * smoothstep(1.5, 8, this.recentSpeed);
    this.idleT = 0;
  }

  private beginStep(f: FootState): void {
    f.stepping = true;
    f.stepT = 0;
    f.stepFrom.copy(f.outWorld);
    f.stepFromYaw = f.outYaw;
    f.stepFromLift = f.outLift;
  }

  // ---- Idle state -----------------------------------------------------------------------------
  private updateIdle(dt: number): void {
    const T = AVATAR_ANIM;
    const still = this.mode === 'stand' && this.airW < 0.1 && this.tiredStandW < 0.2 && this.heavyT < 0;
    if (still) this.idleT += dt;
    else this.idleT = 0;

    // Weight shifts between the feet every few seconds.
    this.shiftTimer -= dt;
    if (this.shiftTimer <= 0) {
      const options = [-1, -0.6, 0.6, 1, 0.2];
      let next = options[Math.floor(this.rand() * options.length)];
      if (Math.abs(next - this.shiftTarget) < 0.3) next = -next;
      this.shiftTarget = next;
      this.shiftTimer = 3.5 + this.rand() * 4;
    }
    stepSpring(this.shift, this.shiftTarget, 2.2, 0.85, dt);

    // Idle glances.
    this.glanceTimer -= dt;
    if (this.glanceTimer <= 0) {
      const big = this.rand() < 0.3;
      this.glanceYaw = (this.rand() - 0.5) * (big ? 0.9 : 0.35);
      this.glancePitch = (this.rand() - 0.5) * 0.18;
      this.glanceTimer = 1.6 + this.rand() * 3;
    }
    this.glanceYawS = damp(this.glanceYawS, still ? this.glanceYaw : 0, 5, dt);
    this.glancePitchS = damp(this.glancePitchS, still ? this.glancePitch : 0, 5, dt);

    // Fidgets.
    if (this.fidget) {
      this.fidgetT += dt;
      const c = this.fidget;
      const out = !still || this.fidgetT > c.duration - c.fadeOut;
      if (still && !out) this.fidgetW = Math.min(1, this.fidgetW + dt / c.fadeIn);
      else this.fidgetW = Math.max(0, this.fidgetW - dt / (still ? c.fadeOut : 0.18));
      if (c.packKick !== undefined && !this.packKicked && this.fidgetT >= c.packKick && this.fidgetW > 0.5) {
        this.packKicked = true;
        const pack = this.dangles[0];
        if (pack) pack.vel.y += 1.4;
      }
      if (this.fidgetT >= c.duration || (this.fidgetW <= 0 && (out || !still))) {
        this.fidget = null;
        this.fidgetW = 0;
      }
    } else if (still && this.idleT > this.nextFidget) {
      let i = Math.floor(this.rand() * FIDGETS.length);
      if (i === this.lastFidget) i = (i + 1) % FIDGETS.length;
      this.lastFidget = i;
      this.fidget = FIDGETS[i];
      this.fidgetT = 0;
      this.fidgetW = 0;
      this.packKicked = false;
      this.nextFidget = this.idleT + FIDGETS[i].duration + T.fidgetMin + this.rand() * (T.fidgetMax - T.fidgetMin);
    }
    if (!still) this.nextFidget = Math.min(this.nextFidget, T.fidgetFirst);
    if (!still && this.idleT === 0 && !this.fidget) this.nextFidget = T.fidgetFirst + this.rand() * 2;
  }

  // =============================================================================================
  // Pose construction
  // =============================================================================================
  private buildPose(dt: number): void {
    const P = this.pose;
    this.buildStand(dt, this.standPose);
    this.buildLoco(this.locoPose);
    this.buildAir(this.airPose);

    // Upper body / pelvis: stand ↔ loco ↔ air.
    P.set(this.standPose);
    const lw = this.locoW;
    for (let i = 0; i < POSE_SIZE; i++) P[i] += (this.locoPose[i] - P[i]) * lw;
    // Feet come from the active ground mode (hand-overs keep them continuous).
    const feetSrc = this.mode === 'loco' ? this.locoPose : this.standPose;
    for (const f of this.feet) for (let k = 0; k < 6; k++) P[f.base + k] = feetSrc[f.base + k];
    if (this.mode === 'loco') {
      // Knee pole and toe-out follow the gait, but blend from idle at low speed.
      for (const f of this.feet) {
        P[f.base + LEG.knee] = lerp(this.standPose[f.base + LEG.knee], this.locoPose[f.base + LEG.knee], lw);
      }
    }
    const aw = this.airW;
    if (aw > 0) for (let i = 0; i < POSE_SIZE; i++) P[i] += (this.airPose[i] - P[i]) * aw;

    this.applyOverlays(P);
  }

  private buildStand(dt: number, out: Pose): void {
    out.set(IDLE);
    const b = Math.sin(this.breath * Math.PI * 2);
    const deep = lerp(1, 2.6, Math.max(this.tiredW, this.tiredStandW));
    out[CH.chestPitch] += -0.016 * b * deep;
    out[CH.spinePitch] += 0.006 * b * deep;
    out[CH.pelvisY] += 0.003 * b;
    out[CH.headPitch] += 0.012 * b;
    out[ARM_L + ARM.clavRaise] += 0.018 * b * deep;
    out[ARM_R + ARM.clavRaise] += 0.018 * b * deep;
    out[ARM_L + ARM.out] += 0.012 * b;
    out[ARM_R + ARM.out] += 0.012 * b;

    // Weight shift: hips slide over one foot, that hip rises, the other knee relaxes.
    const sh = this.shift.x;
    out[CH.pelvisX] += 0.028 * sh;
    out[CH.pelvisRoll] += 0.045 * sh;
    out[CH.pelvisY] -= 0.008 * Math.abs(sh);
    out[CH.spineRoll] -= 0.03 * sh;
    out[CH.chestRoll] -= 0.025 * sh;
    out[CH.headRoll] -= 0.02 * sh;
    out[CH.pelvisYaw] += 0.04 * sh;
    out[ARM_L + ARM.out] += 0.03 * Math.max(0, -sh);
    out[ARM_R + ARM.out] += 0.03 * Math.max(0, sh);

    out[CH.headYaw] += this.glanceYawS;
    out[CH.headPitch] += this.glancePitchS;

    if (this.fidget && this.fidgetW > 0) {
      const w = smootherstep(0, 1, this.fidgetW);
      sampleClip(this.fidget, this.fidgetT, out, w);
    }

    // Out of breath: hands on knees, heaving.
    const tw = this.tiredStandW;
    if (tw > 0.001) {
      const heave = Math.sin(this.breath * Math.PI * 2);
      const tp = this.tmpPose;
      tp.set(TIRED_STAND);
      tp[CH.chestPitch] += 0.05 * heave;
      tp[CH.spinePitch] += 0.03 * heave;
      tp[CH.pelvisY] += 0.006 * heave;
      tp[ARM_L + ARM.clavRaise] += 0.04 * heave;
      tp[ARM_R + ARM.clavRaise] += 0.04 * heave;
      this.lerpUpper(out, tp, smootherstep(0, 1, tw));
    }

    this.standFeet(dt, out);
  }

  /** Blend body + arm channels and foot pitch (feet stay planted). */
  private lerpUpper(out: Pose, p: Pose, w: number): void {
    if (w <= 0) return;
    for (let i = 0; i < BODY_CHANNELS; i++) out[i] += (p[i] - out[i]) * w;
    for (let i = ARM_L; i < POSE_SIZE; i++) out[i] += (p[i] - out[i]) * w;
    for (const base of [LEG_L, LEG_R]) {
      out[base + LEG.pitch] += (p[base + LEG.pitch] - out[base + LEG.pitch]) * w;
      out[base + LEG.knee] += (p[base + LEG.knee] - out[base + LEG.knee]) * w;
    }
  }

  private standFeet(dt: number, out: Pose): void {
    const T = AVATAR_ANIM;
    const hx = this.hipX();
    const active = this.mode === 'stand' && this.airW < 0.5;
    // Pick a foot to step when the body has turned or drifted away from the planted feet.
    if (active && this.hasWorld && !this.feet[0].stepping && !this.feet[1].stepping) {
      let worst: FootState | null = null;
      let worstErr = 0;
      for (const f of this.feet) {
        const s = f.side;
        const rest = this.toWorld(s * (hx + IDLE[f.base + LEG.x]), IDLE[f.base + LEG.z], _v1);
        const d = Math.hypot(rest.x - f.anchor.x, rest.z - f.anchor.z);
        const dy = Math.abs(wrapAngle(f.anchorYaw - (this.yaw + s * IDLE[f.base + LEG.yaw])));
        const err = Math.max(d / T.stepDistance, dy / T.stepYaw);
        if (err > 1 && err > worstErr) {
          worst = f;
          worstErr = err;
        }
      }
      if (worst) this.beginStep(worst);
    }

    for (const f of this.feet) {
      const s = f.side;
      const restBx = s * (hx + out[f.base + LEG.x]);
      const restBz = out[f.base + LEG.z];
      const restYaw = this.yaw + s * out[f.base + LEG.yaw];
      let wx = f.anchor.x;
      let wz = f.anchor.z;
      let wyaw = f.anchorYaw;
      let lift = 0;
      let pitch = 0;
      if (f.stepping) {
        f.stepT = Math.min(1, f.stepT + dt / T.stepDuration);
        const t = f.stepT;
        const e = smootherstep(0, 1, t);
        const rest = this.toWorld(restBx, restBz, _v1);
        wx = lerp(f.stepFrom.x, rest.x, e);
        wz = lerp(f.stepFrom.z, rest.z, e);
        wyaw = f.stepFromYaw + wrapAngle(restYaw - f.stepFromYaw) * e;
        const arc = Math.sin(Math.PI * Math.min(1, t * 1.1));
        lift = Math.max(0, f.stepFromLift * (1 - e) + T.stepHeight * arc * Math.min(1, 0.4 + Math.hypot(rest.x - f.stepFrom.x, rest.z - f.stepFrom.z) * 5));
        pitch = lerp(-0.35, 0.18, smoothstep(0.1, 0.8, t)) * arc;
        if (t >= 1) {
          f.stepping = false;
          f.anchor.set(rest.x, 0, rest.z);
          f.anchorYaw = restYaw;
        }
      } else if (!this.hasWorld) {
        // Animating in place: feet simply hold the rest pose.
        const rest = this.toWorld(restBx, restBz, _v1);
        wx = f.anchor.x = rest.x;
        wz = f.anchor.z = rest.z;
        wyaw = f.anchorYaw = restYaw;
      }
      const b = this.toBody(wx, wz, _v2);
      out[f.base + LEG.x] = s * b.x - hx;
      out[f.base + LEG.z] = b.z;
      out[f.base + LEG.yaw] = s * wrapAngle(wyaw - this.yaw);
      out[f.base + LEG.y] = lift;
      out[f.base + LEG.pitch] += pitch;
      // Weight goes over the planted foot while the other one steps.
      if (f.stepping) {
        const k = Math.sin(Math.PI * f.stepT);
        out[CH.pelvisX] += -s * 0.022 * k;
        out[CH.pelvisRoll] += -s * 0.03 * k;
      }
    }
  }

  private buildLoco(out: Pose): void {
    out.fill(0);
    const u = this.phase;
    for (let i = 0; i < GAITS.length; i++) addGaitUpper(GAITS[i], u, this.gw[i], out);
    // At walking pace and below, ease the cycle's amplitude towards idle.
    const amp = smoothstep(0.0, 1.2, this.speed);
    for (let i = 0; i < POSE_SIZE; i++) out[i] = lerp(IDLE[i], out[i], amp);

    // Exhausted jog overlay: slumped, loose arms, scuffing feet.
    const tw = this.tiredW;
    if (tw > 0) {
      const t = TIRED_MOVE;
      out[CH.spinePitch] += t.spinePitch * tw;
      out[CH.chestPitch] += t.chestPitch * tw;
      out[CH.headPitch] += t.headPitch * tw;
      out[CH.pelvisY] += t.pelvisY * tw;
      out[CH.pelvisRoll] *= lerp(1, t.rollScale, tw);
      out[CH.chestRoll] *= lerp(1, t.rollScale, tw);
      for (const base of [ARM_L, ARM_R]) {
        out[base + ARM.clavRaise] += t.clavRaise * tw;
        out[base + ARM.swing] *= lerp(1, t.armSwingScale, tw);
        out[base + ARM.elbow] = lerp(out[base + ARM.elbow], t.elbow, tw);
      }
      // Heavy breathing shows in the shoulders.
      const heave = Math.sin(this.breath * Math.PI * 2);
      out[ARM_L + ARM.clavRaise] += 0.03 * heave * tw;
      out[ARM_R + ARM.clavRaise] += 0.03 * heave * tw;
    }

    this.locoFeet(out);
  }

  private locoFeet(out: Pose): void {
    const T = AVATAR_ANIM;
    const st = this.stride;
    const hx = this.hipX();
    const sweep = st.duty * st.cycleLen;
    const liftScale = lerp(1, TIRED_MOVE.liftScale, this.tiredW);
    const lockOk = this.hasWorld && this.mode === 'loco' && this.airW < 0.2 && this.skidW < 0.35;
    for (const f of this.feet) {
      const s = f.side;
      const u = this.phase + (s < 0 ? 0.5 : 0);
      legCycleZ(u, st.duty, sweep, st.liftTan, st.reachTan, _lz);
      gaitFoot(this.gw, warpPhase(u, st.duty), _foot);
      let x = st.footX;
      let z = _lz.z + st.footZ;
      let yaw = st.footYaw;
      let lift = _foot.lift * liftScale;
      let pitch = _foot.pitch;
      // Fade lift/pitch in after a mode switch.
      if (f.fadeW > 0) {
        lift = lerp(lift, f.fadeLift, f.fadeW);
        pitch = lerp(pitch, f.fadePitch, f.fadeW);
      }

      if (this.mode === 'loco') {
        if (_lz.stance) {
          if (!f.wasStance) {
            // Contact: plant this foot where it lands.
            this.toWorld(s * (hx + x), z, f.lockPos);
            f.lockYaw = this.yaw + s * yaw;
            f.lockW = lockOk ? 1 : 0;
          }
          if (f.lockW > 0) {
            if (!lockOk) f.lockW = Math.max(0, f.lockW - 0.15);
            const lb = this.toBody(f.lockPos.x, f.lockPos.z, _v2);
            const lx = s * lb.x - hx;
            const drift = Math.hypot(lx - x, lb.z - z);
            if (drift > T.footLockDrift) f.lockW = Math.max(0, f.lockW - 0.12);
            const lyaw = clamp(s * wrapAngle(f.lockYaw - this.yaw), -0.8, 0.8);
            const k = f.lockW;
            f.offX = (lx - x) * k;
            f.offZ = (lb.z - z) * k;
            f.offYaw = (lyaw - yaw) * k;
          } else {
            f.offX = f.offZ = f.offYaw = 0;
          }
          x += f.offX;
          z += f.offZ;
          yaw += f.offYaw;
        } else {
          if (f.wasStance) {
            // Lift-off: carry the planted offset into the swing and blend it out.
            f.swX = f.offX;
            f.swZ = f.offZ;
            f.swYaw = f.offYaw;
            f.lockW = 0;
          } else if (Number.isNaN(f.swX)) {
            // First frame after a hand-over: start the swing from where the foot is.
            const ob = this.toBody(f.outWorld.x, f.outWorld.z, _v2);
            f.swX = s * ob.x - hx - x;
            f.swZ = ob.z - z;
            f.swYaw = clamp(s * wrapAngle(f.outYaw - this.yaw), -0.8, 0.8) - yaw;
          }
          const k = 1 - smoothstep(0, 0.75, _lz.t);
          x += f.swX * k;
          z += f.swZ * k;
          yaw += f.swYaw * k;
        }
        f.wasStance = _lz.stance;
      }
      out[f.base + LEG.x] = x;
      out[f.base + LEG.z] = z;
      out[f.base + LEG.yaw] = yaw;
      out[f.base + LEG.y] = lift;
      out[f.base + LEG.pitch] = pitch;
      out[f.base + LEG.knee] = st.kneeOut;
    }
  }

  private buildAir(out: Pose): void {
    if (this.airW <= 0.001) {
      out.set(this.pose);
      return;
    }
    const vy = this.vy;
    const rise = smoothstep(0.5, 4.5, vy);
    const fall = smoothstep(-0.5, -6, vy);
    const apex = Math.max(0, 1 - rise - fall);
    const tp = this.tmpPose2;
    // Rising: standing tuck vs. running bound (mirrored for the lead leg).
    tp.set(AIR_RISE_STAND);
    const runRise = this.jumpLeadR ? this.mirrored.riseRun : AIR_RISE_RUN;
    for (let i = 0; i < POSE_SIZE; i++) tp[i] = lerp(tp[i], runRise[i], this.jumpRun);
    out.fill(0);
    for (let i = 0; i < POSE_SIZE; i++) out[i] = tp[i] * rise + AIR_APEX[i] * apex + AIR_FALL[i] * fall;

    // Long falls: windmilling arms and bicycling legs.
    const flail = smoothstep(0.7, 1.4, this.airTime) * fall;
    const t = this.time;
    if (flail > 0) {
      out[ARM_L + ARM.swing] += Math.sin(t * 9) * 0.9 * flail;
      out[ARM_R + ARM.swing] += Math.sin(t * 9 + 2.4) * 0.9 * flail;
      out[ARM_L + ARM.out] += Math.sin(t * 6.3) * 0.25 * flail;
      out[ARM_R + ARM.out] += Math.sin(t * 6.3 + 1.7) * 0.25 * flail;
      out[LEG_L + LEG.z] += Math.cos(t * 7) * 0.14 * flail;
      out[LEG_R + LEG.z] -= Math.cos(t * 7) * 0.14 * flail;
      out[LEG_L + LEG.y] += Math.max(0, Math.sin(t * 7)) * 0.12 * flail;
      out[LEG_R + LEG.y] += Math.max(0, -Math.sin(t * 7)) * 0.12 * flail;
      out[CH.headPitch] += 0.15 * flail;
    }
    // Secondary flutter on the arms while airborne.
    const flutter = Math.sin(t * 13) * 0.05 + Math.sin(t * 7.7) * 0.04;
    out[ARM_L + ARM.out] += flutter;
    out[ARM_R + ARM.out] -= flutter;
  }

  private applyOverlays(P: Pose): void {
    const T = AVATAR_ANIM;
    const grounded = 1 - this.airW;

    // Jump wind-up while the take-off hold plays, released into the launch.
    if (this.takeoffT >= 0) {
      const t = this.takeoffT;
      const coil = t < T.takeoffHold ? smoothstep(0, T.takeoffHold * 0.8, t) : 1 - smoothstep(0, T.takeoffRelease * 0.6, t - T.takeoffHold);
      if (coil > 0) this.lerpUpper(P, JUMP_CROUCH, coil * lerp(1, 0.6, this.jumpRun));
    }

    // Skid: feet placed along the slide, body braced back against it.
    if (this.skidW > 0.001 && this.speed > 0.2) {
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      const vbx = c * this.vel.x - s * this.vel.z;
      const vbz = s * this.vel.x + c * this.vel.z;
      const rel = Math.atan2(vbx, vbz);
      const tp = this.tmpPose;
      tp.set(SKID);
      const hx = this.hipX();
      const cr = Math.cos(rel);
      const sr = Math.sin(rel);
      for (const base of [LEG_L, LEG_R]) {
        const sd = base === LEG_L ? 1 : -1;
        const bx = sd * (hx + tp[base + LEG.x]);
        const bz = tp[base + LEG.z];
        const rx = cr * bx + sr * bz;
        const rz = -sr * bx + cr * bz;
        tp[base + LEG.x] = sd * rx - hx;
        tp[base + LEG.z] = rz;
        tp[base + LEG.yaw] += sd * rel;
      }
      tp[CH.pelvisYaw] += rel * 0.5;
      const w = smootherstep(0, 1, this.skidW) * grounded;
      for (let i = 0; i < POSE_SIZE; i++) P[i] += (tp[i] - P[i]) * w;
    }

    // Heavy landing crouch.
    if (this.heavyT >= 0) {
      const h = this.heavyT;
      const w = Math.min(smoothstep(0, 0.06, h), 1 - smoothstep(T.heavyLandHold, T.heavyLandHold + 0.45, h)) * grounded;
      this.lerpUpper(P, LAND_HEAVY, w);
    }

    // Landing / settle spring: hips drop, chest folds, arms swing down and out.
    const drop = clamp(this.land.x, -0.3, 0.06) * grounded;
    P[CH.pelvisY] += drop;
    P[CH.pelvisPitch] -= drop * 1.1;
    P[CH.spinePitch] -= drop * 1.2;
    P[CH.chestPitch] -= drop * 0.6;
    for (const base of [ARM_L, ARM_R]) {
      P[base + ARM.swing] -= drop * 1.6;
      P[base + ARM.out] -= drop * 1.4;
      P[base + ARM.elbow] -= drop * 1.5;
    }

    // Lean into acceleration and turns: pivot around the feet.
    const lp = this.leanP.x * grounded;
    const lr = this.leanR.x * grounded;
    P[CH.pelvisPitch] += lp * 0.45;
    P[CH.spinePitch] += lp * 0.35;
    P[CH.chestPitch] += lp * 0.25;
    P[CH.pelvisZ] += lp * 0.18;
    P[CH.pelvisY] -= Math.abs(lp) * 0.06;
    P[CH.pelvisRoll] += lr * 0.6;
    P[CH.spineRoll] += lr * 0.3;
    P[CH.chestRoll] += lr * 0.2;
    P[CH.pelvisX] -= lr * 0.25;
    // Arms trail the acceleration a touch.
    for (const base of [ARM_L, ARM_R]) {
      P[base + ARM.swing] -= lp * 0.5;
    }

    // Lean into climbs, sit back a little going downhill.
    const sl = this.slopeFwd * this.locoW * grounded;
    const slopeLean = sl > 0 ? sl * 0.42 : sl * 0.22;
    P[CH.spinePitch] += slopeLean * 0.6;
    P[CH.chestPitch] += slopeLean * 0.3;
    P[CH.pelvisPitch] += slopeLean * 0.3;
    P[CH.headPitch] -= slopeLean * 0.4;
  }

  // =============================================================================================
  // Apply pose to the rig: terrain, IK, head stabilisation, arms
  // =============================================================================================
  private applyPose(P: Pose, dt: number): void {
    const r = this.rig;
    const A = RIG.ankleH;
    const hx = this.hipX();
    const groundW = 1 - this.airW;
    r.body.position.y = this.bodyOffsetY;

    // Ground under each foot (relative), and how far the hips must drop to reach the lower one.
    let minG = 0;
    for (const f of this.feet) {
      const s = f.side;
      const bx = s * (hx + P[f.base + LEG.x]);
      const bz = P[f.base + LEG.z];
      const g = this.groundAt(bx, bz) * groundW;
      f.ground = dt > 0 ? damp(f.ground, g, 30, dt) : g;
      minG = Math.min(minG, f.ground);
    }

    // Pelvis.
    _pelvisPos.set(P[CH.pelvisX], RIG.hipsY + P[CH.pelvisY] + minG, P[CH.pelvisZ]);
    quatYXZ(P[CH.pelvisPitch], P[CH.pelvisYaw], P[CH.pelvisRoll], _qPelvis);
    r.pelvis.position.copy(_pelvisPos);
    r.pelvis.quaternion.copy(_qPelvis);
    quatYXZ(P[CH.spinePitch], P[CH.spineYaw], P[CH.spineRoll], r.spine.quaternion);
    quatYXZ(P[CH.chestPitch], P[CH.chestYaw], P[CH.chestRoll], r.chest.quaternion);

    // Legs: two-bone IK onto the ground.
    for (const f of this.feet) {
      const s = f.side;
      const leg = s > 0 ? r.legL : r.legR;
      const yawB = s * P[f.base + LEG.yaw];
      const pitch = P[f.base + LEG.pitch];
      const bx = s * (hx + P[f.base + LEG.x]);
      const bz = P[f.base + LEG.z];
      const lift = Math.max(0, P[f.base + LEG.y]);
      footRoll(pitch, A, RIG.heelBack, RIG.ballFwd, _roll);
      const cy = Math.cos(yawB);
      const sy = Math.sin(yawB);
      _target.set(bx + sy * _roll.z, lift + _roll.y + f.ground, bz + cy * _roll.z);
      // Hip joint in body space.
      _hip.set(leg.thigh.position.x, leg.thigh.position.y, leg.thigh.position.z).applyQuaternion(_qPelvis).add(_pelvisPos);
      _qa.copy(_qPelvis).invert();
      _target.sub(_hip).applyQuaternion(_qa);
      const kneeYaw = yawB + s * P[f.base + LEG.knee];
      _pole.set(Math.sin(kneeYaw), 0, Math.cos(kneeYaw)).applyQuaternion(_qa);
      solveTwoBone(_target, _pole, RIG.thigh, RIG.shin, 1, leg.thigh.quaternion, _ik);
      leg.shin.quaternion.setFromAxisAngle(_xAxis, _ik.bend);

      // Foot orientation in body space: yaw, ground slope when planted, then the roll pitch.
      const plant = groundW * (1 - smoothstep(0.02, 0.12, lift));
      let gp = 0;
      let gr = 0;
      if (plant > 0 && this.hasWorld) {
        const e = 0.12;
        const gf = this.groundAt(bx + sy * e, bz + cy * e) - this.groundAt(bx - sy * e, bz - cy * e);
        const gs = this.groundAt(bx + cy * e, bz - sy * e) - this.groundAt(bx - cy * e, bz + sy * e);
        gp = clamp(Math.atan2(gf, 2 * e), -0.6, 0.6) * plant;
        gr = clamp(Math.atan2(gs, 2 * e), -0.5, 0.5) * plant;
      }
      _qb.setFromAxisAngle(_yAxis, yawB);
      _qc.setFromAxisAngle(_xAxis, -gp - pitch);
      _qd.setFromAxisAngle(_zAxis, gr);
      _qb.multiply(_qd).multiply(_qc); // desired foot (body space)
      _qc.copy(_qPelvis).multiply(leg.thigh.quaternion).multiply(leg.shin.quaternion).invert();
      leg.foot.quaternion.copy(_qc.multiply(_qb));
      // Toes stay flat on the ground when the heel peels up.
      const toe = Math.max(0, -pitch) * (1 - smoothstep(0.03, 0.15, lift)) * groundW;
      leg.toe.rotation.set(-toe * 0.9, 0, 0);

      // Remember the output (world) for hand-overs.
      this.toWorld(bx, bz, f.outWorld);
      f.outYaw = this.yaw + yawB;
      f.outLift = lift;
      f.outPitch = pitch;
      f.outZ = bz;
    }

    // Fade-in after a hand-over.
    if (dt > 0) for (const f of this.feet) f.fadeW = Math.max(0, f.fadeW - dt / 0.14);

    // Head: stabilised towards a level, travel-facing orientation.
    _qChest.copy(_qPelvis).multiply(r.spine.quaternion).multiply(r.chest.quaternion);
    const T = AVATAR_ANIM;
    const stab = lerp(0.65, T.headStabilize, smoothstep(0.2, 2, this.speed)) * lerp(1, 0.75, this.airW);
    quatYXZ(P[CH.headPitch], P[CH.headYaw] + this.lookYaw, P[CH.headRoll], _qa); // desired, body space
    _qb.copy(_qChest).invert().multiply(_qa); // stabilised, relative to chest
    quatYXZ(P[CH.headPitch], P[CH.headYaw] + this.lookYaw, P[CH.headRoll], _qc); // unstabilised (FK)
    _qb.slerp(_qc, 1 - stab);
    // Neck takes part of the turn, the head the rest.
    r.neck.quaternion.copy(_identity).slerp(_qb, 0.38);
    r.head.quaternion.copy(r.neck.quaternion).invert().multiply(_qb);

    // Arms (FK).
    for (const [arm, base, s] of [
      [r.armL, ARM_L, 1],
      [r.armR, ARM_R, -1],
    ] as const) {
      arm.clav.rotation.set(0, -s * P[base + ARM.clavFwd], s * P[base + ARM.clavRaise]);
      arm.upper.rotation.set(-P[base + ARM.swing], -s * P[base + ARM.twist], s * P[base + ARM.out], 'XZY');
      arm.fore.rotation.set(-Math.max(0, P[base + ARM.elbow]), 0, 0);
      arm.hand.rotation.set(-P[base + ARM.wrist], 0, s * P[base + ARM.wristSide]);
    }
  }

  // =============================================================================================
  // Secondary motion
  // =============================================================================================
  private secondary(dt: number): void {
    const r = this.rig;
    this.root.updateWorldMatrix(true, true);

    for (const d of this.dangles) {
      const parent = d.obj.parent;
      if (!parent) continue;
      // Pivot (world) and the parent's world rotation.
      d.obj.getWorldPosition(_v1);
      parent.getWorldQuaternion(_qa);
      // Rest direction: the model's direction, leaning towards world-down.
      _v2.copy(d.rest).applyQuaternion(_qa);
      _v2.lerp(_down, d.gravity).normalize();
      // Target tip.
      _target.copy(_v1).addScaledVector(_v2, d.len);
      if (!d.init || d.tip.distanceToSquared(_target) > 1) {
        d.tip.copy(_target);
        d.prevTarget.copy(_target);
        d.vel.set(0, 0, 0);
        d.init = true;
      }
      // Damped spring towards the target, sub-stepped. Damping acts on the velocity relative
      // to the anchor, so steady motion carries the part along and only changes of motion
      // (starts, stops, bobs, turns) make it swing. The target moves linearly across sub-steps.
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      const k = d.freq * d.freq;
      const c = 2 * d.freq * d.zeta;
      const tvx = (_target.x - d.prevTarget.x) / dt;
      const tvy = (_target.y - d.prevTarget.y) / dt;
      const tvz = (_target.z - d.prevTarget.z) / dt;
      for (let i = 1; i <= n; i++) {
        const f = i / n - 1;
        const gx = _target.x + tvx * f * dt;
        const gy = _target.y + tvy * f * dt;
        const gz = _target.z + tvz * f * dt;
        d.vel.x += (k * (gx - d.tip.x) - c * (d.vel.x - tvx)) * h;
        d.vel.y += (k * (gy - d.tip.y) - c * (d.vel.y - tvy)) * h;
        d.vel.z += (k * (gz - d.tip.z) - c * (d.vel.z - tvz)) * h;
        d.tip.addScaledVector(d.vel, h);
      }
      d.prevTarget.copy(_target);
      // Keep the rod length.
      _v3.copy(d.tip).sub(_v1);
      const len = _v3.length() || 1;
      _v3.divideScalar(len);
      d.tip.copy(_v1).addScaledVector(_v3, d.len);
      // Direction in the parent's space → swing angles relative to the rest direction.
      _qb.copy(_qa).invert();
      _v3.applyQuaternion(_qb);
      _v2.copy(d.rest);
      // Pitch: rotation about X from rest to the simulated direction (in the y-z plane).
      const pitch = Math.atan2(-_v3.z, -_v3.y) - Math.atan2(-_v2.z, -_v2.y);
      const roll = Math.atan2(_v3.x, -_v3.y) - Math.atan2(_v2.x, -_v2.y);
      const px = clamp(wrapAngle(pitch) * d.amount, d.minPitch, d.maxPitch);
      const rz = clamp(wrapAngle(roll) * d.amount, -d.maxRoll, d.maxRoll);
      quatYXZ(px, 0, rz, _qc);
      d.obj.quaternion.copy(d.baseQ).premultiply(_qc);
    }

    // Hem: lags the chest's twist a little and flares with speed.
    const chestYaw = this.pose[CH.chestYaw] + this.pose[CH.spineYaw];
    const yawVel = (chestYaw - this.prevChestYaw) / dt;
    this.prevChestYaw = chestYaw;
    stepSpring(this.hemYaw, clamp(-yawVel * 0.02, -0.12, 0.12) - this.pose[CH.spineYaw] * 0.4, 14, 0.4, dt);
    stepSpring(this.hemPitch, clamp(-this.leanP.x * 0.3 + this.speed * 0.006, -0.1, 0.1), 12, 0.4, dt);
    r.hem.rotation.set(this.hemPitch.x, this.hemYaw.x, 0, 'YXZ');
  }

  private blink(dt: number): void {
    const eyes = this.rig.eyes;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt;
      const close = 0.055;
      const open = 0.11;
      const t = this.blinkPhase;
      const k = t < close ? t / close : 1 - (t - close) / open;
      const sy = 1 - 0.9 * clamp(k, 0, 1);
      for (const e of eyes) e.scale.y = sy;
      if (t > close + open) {
        this.blinkPhase = -1;
        for (const e of eyes) e.scale.y = 1;
        if (this.doubleBlink) {
          this.doubleBlink = false;
          this.blinkT = 0.12;
        } else {
          this.blinkT = 2 + this.rand() * 3.5;
        }
      }
    } else {
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blinkPhase = 0;
        if (this.rand() < 0.18) this.doubleBlink = true;
      }
    }
  }
}

const _xAxis = new THREE.Vector3(1, 0, 0);
const _yAxis = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3(0, 0, 1);

export function createAvatar(appearance: Appearance): Avatar {
  const procedural = new AvatarImpl(appearance);
  return typeof document === 'undefined' ? procedural : withTrainerAsset(procedural, appearance);
}
