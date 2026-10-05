import * as THREE from 'three';
import { clamp, damp, lerp, sampleClamped, smoothstep, type Keys } from '../player/anim-math';
import type { CreatureAction } from './index';
import { makeMaterial, type MatKind, type VcGlow } from './kit';

/**
 * Shared animation machinery for every body plan:
 *
 * - a flat pose of named channels built from layers: locomotion + idle life (base), a one-shot
 *   action clip and an idle fidget clip (both additive keyframe curves with auto-clamped
 *   tangents), plus blinking;
 * - `Jiggle`: a rotational spring on a bone driven by the real world-space acceleration of the
 *   part's tip, so ears, tails, antler saplings and scarves lag, overshoot and settle;
 * - `Fx`: hit flash, element glow and the special-move burst (per-instance materials are only
 *   created when an effect first needs them; until then instances share the template's).
 */

/** Pose channels. Translations are in units of the creature's design height S. */
export const CH = {
  X: 0,
  Y: 1,
  Z: 2,
  PITCH: 3,
  ROLL: 4,
  YAW: 5,
  /** Pitch about the hips (rear up > 0, play-bow < 0). */
  REAR: 6,
  /** Vertical stretch (> 0) / squash (< 0), volume preserving. */
  SQUASH: 7,
  /** Spine flex: chest pitched up relative to the pelvis. */
  FLEX: 8,
  NECK: 9,
  HEAD_P: 10,
  HEAD_Y: 11,
  HEAD_R: 12,
  JAW: 13,
  /** Ears laid back (> 0) or perked forward (< 0). */
  EARS: 14,
  /** Ear flick impulse (> 0 left ear, < 0 right ear). */
  EAR_FLICK: 15,
  TAIL_UP: 16,
  /** Tail wag amplitude (radians). */
  WAG: 17,
  /** Eye closure, 0 open .. 1 shut. */
  EYES: 18,
  FORE_Z: 19,
  FORE_LIFT: 20,
  HIND_Z: 21,
  HIND_LIFT: 22,
  /** Legs go limp (faint). */
  LIMP: 23,
  /** Element glow on the body. */
  GLOW: 24,
  /** Hit flash (white) and its red tint. */
  FLASH: 25,
  RED: 26,
  /** Special-move burst progress (0 = none, 0..1 = expanding). */
  BURST: 27,
  /** Charge-up trembling amplitude. */
  TREMBLE: 28,
  /** Quick sniffing head bobs. */
  SNIFF: 29,
  /** Wet-dog shake amplitude. */
  SHAKE: 30,
  /** Wings spread (0 folded .. 1 open). */
  WINGS: 31,
  /** Wing flap amplitude override. */
  FLAP: 32,
  /** Curiosity (ember tufts flare, ears perk). */
  CURIOUS: 33,
  /** Hover height offset (fliers), in S. */
  HOVER: 34,
} as const;
export type Channel = keyof typeof CH;
export const NCH = 35;

export interface Clip {
  dur: number;
  /** Hold the last frame until reset (faint). */
  hold?: boolean;
  /** Channels mirrored when the clip plays "to the other side". */
  tracks: [number, Keys][];
}

export function clip(dur: number, keys: Partial<Record<Channel, Keys>>, hold = false): Clip {
  const tracks: [number, Keys][] = [];
  for (const k of Object.keys(keys) as Channel[]) tracks.push([CH[k], keys[k]!]);
  return { dur, hold, tracks };
}

const MIRRORED = new Set<number>([CH.X, CH.ROLL, CH.YAW, CH.HEAD_Y, CH.HEAD_R, CH.EAR_FLICK]);

export function sampleClip(c: Clip, t: number, out: Float32Array, weight = 1, sign = 1): void {
  for (const [ch, keys] of c.tracks) {
    const v = sampleClamped(keys, t) * weight;
    out[ch] += MIRRORED.has(ch) ? v * sign : v;
  }
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Smooth 1D noise in [-1, 1] (sum of incommensurate sines; cheap and allocation free). */
export function wobble(t: number, seed: number): number {
  return (
    Math.sin(t * 1.7 + seed) * 0.5 +
    Math.sin(t * 2.9 + seed * 1.3) * 0.3 +
    Math.sin(t * 4.3 + seed * 2.1) * 0.2
  );
}

// ---------------------------------------------------------------------------------------------
// Jiggle: rotational spring on a bone, driven by its tip's acceleration
// ---------------------------------------------------------------------------------------------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const SUB = 1 / 240;

export interface JiggleOpts {
  /** Natural frequency (rad/s). */
  freq: number;
  /** Damping ratio. */
  zeta: number;
  /** Radians of deflection per (m/s²) of lateral tip acceleration (scaled by 1/freq²). */
  gain: number;
  /** Clamp on deflection magnitude (radians). */
  limit?: number;
}

export class Jiggle {
  /** Rotation vector (axis * angle) in the parent's frame, applied on top of the rest pose. */
  readonly w = new THREE.Vector3();
  readonly wv = new THREE.Vector3();
  /** Animated target rotation vector (parent frame). */
  readonly target = new THREE.Vector3();
  readonly rest: THREE.Quaternion;
  /** Unit direction from pivot to tip in the parent frame (rest). */
  private readonly dir: THREE.Vector3;
  private readonly tip: THREE.Vector3;
  private readonly prevTip = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly prevVel = new THREE.Vector3();
  private frames = 0;

  constructor(
    readonly bone: THREE.Object3D,
    tipLocal: THREE.Vector3,
    readonly o: JiggleOpts,
  ) {
    this.rest = bone.quaternion.clone();
    this.tip = tipLocal.clone();
    this.dir = tipLocal.clone().applyQuaternion(this.rest).normalize();
  }

  reset(): void {
    this.w.set(0, 0, 0);
    this.wv.set(0, 0, 0);
    this.frames = 0;
  }

  /**
   * Step the spring. The bone's parent must have an up-to-date matrixWorld. Writes the bone's
   * quaternion (rest * deflection) and refreshes its subtree's world matrices.
   */
  update(dt: number): void {
    const parent = this.bone.parent!;
    // Tip position (using the rest orientation, so our own deflection isn't measured).
    _t.copy(this.tip).applyQuaternion(this.rest).add(this.bone.position).applyMatrix4(parent.matrixWorld);
    _a.set(0, 0, 0);
    if (dt > 1e-5) {
      if (this.frames > 0) this.vel.copy(_t).sub(this.prevTip).divideScalar(dt);
      if (this.frames > 1) _a.copy(this.vel).sub(this.prevVel).divideScalar(dt);
      this.prevVel.copy(this.vel);
      this.prevTip.copy(_t);
      this.frames++;
      // Teleports / first frames: ignore absurd accelerations.
      const al = _a.length();
      if (al > 80) _a.multiplyScalar(80 / al);
    }
    // Into the parent's frame.
    _m.extractRotation(parent.matrixWorld);
    _q.setFromRotationMatrix(_m);
    _qi.copy(_q).invert();
    _a.applyQuaternion(_qi);
    // Inertial torque direction: tip lags opposite to acceleration => axis = dir x (-a).
    _v.crossVectors(this.dir, _a).multiplyScalar(-this.o.gain);
    const k = this.o.freq * this.o.freq;
    const c = 2 * this.o.freq * this.o.zeta;
    if (dt > 0) {
      const n = Math.max(1, Math.ceil(dt / SUB - 1e-9));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        // wv += (-k (w - target) - c wv + k * drive) h
        this.wv.x += (-k * (this.w.x - this.target.x) - c * this.wv.x + k * _v.x) * h;
        this.wv.y += (-k * (this.w.y - this.target.y) - c * this.wv.y + k * _v.y) * h;
        this.wv.z += (-k * (this.w.z - this.target.z) - c * this.wv.z + k * _v.z) * h;
        this.w.addScaledVector(this.wv, h);
      }
    }
    const lim = this.o.limit ?? 1.2;
    const len = this.w.length();
    if (len > lim) this.w.multiplyScalar(lim / len);
    const ang = this.w.length();
    if (ang > 1e-6) _q.setFromAxisAngle(_v.copy(this.w).divideScalar(ang), ang);
    else _q.identity();
    this.bone.quaternion.copy(_q).multiply(this.rest);
    this.bone.updateMatrixWorld(true);
  }

  /** Add an angular velocity kick (parent frame). */
  kick(x: number, y: number, z: number): void {
    this.wv.x += x;
    this.wv.y += y;
    this.wv.z += z;
  }
}

// ---------------------------------------------------------------------------------------------
// Effects: flash, element glow, burst
// ---------------------------------------------------------------------------------------------

const WHITE = new THREE.Color(1, 1, 1);
const RED = new THREE.Color(1.0, 0.18, 0.12);

export class Fx {
  private owned = false;
  private readonly own: THREE.Material[] = [];
  private readonly emissive = new THREE.Color();
  private readonly flashC = new THREE.Color();
  private burst: THREE.Group | null = null;
  private burstMats: THREE.MeshBasicMaterial[] = [];
  private burstGeos: THREE.BufferGeometry[] = [];
  private lastKey = '';
  /** Extra multiplier on the vertex-colour glow of 'glow' parts (1 = template default). */
  glowBoost = 1;

  constructor(
    private readonly meshes: THREE.SkinnedMesh[],
    private readonly parent: THREE.Object3D,
    private readonly element: THREE.Color,
    /** Design height, to size the burst. */
    private readonly S: number,
    /** Burst centre height (design units). */
    private readonly centreY: number,
  ) {}

  private ensureOwn(): void {
    if (this.owned) return;
    this.owned = true;
    for (const m of this.meshes) {
      const src = m.material as THREE.Material;
      const kind = src.userData.kind as MatKind;
      const mine = makeMaterial(kind);
      m.material = mine;
      this.own.push(mine);
    }
  }

  /** Apply flash / glow / burst from the pose. */
  update(glow: number, flash: number, red: number, burst: number): void {
    const g = clamp(glow, 0, 3);
    const f = clamp(flash, 0, 1);
    const boost = this.glowBoost;
    const key = `${g.toFixed(3)}|${f.toFixed(3)}|${red.toFixed(2)}|${boost.toFixed(3)}`;
    if (key !== this.lastKey) {
      const idle = g === 0 && f === 0 && Math.abs(boost - 1) < 1e-3;
      if (!idle || this.owned) {
        this.ensureOwn();
        this.flashC.copy(WHITE).lerp(RED, clamp(red, 0, 1));
        this.emissive.copy(this.element).multiplyScalar(g * 0.55);
        this.emissive.r += this.flashC.r * f * 1.1;
        this.emissive.g += this.flashC.g * f * 1.1;
        this.emissive.b += this.flashC.b * f * 1.1;
        for (const m of this.own) {
          const sm = m as THREE.MeshStandardMaterial;
          if (sm.isMeshStandardMaterial) {
            sm.emissive.copy(this.emissive);
            const vc = sm.userData.vcGlow as VcGlow;
            vc.value = (sm.userData.baseGlow as number) * boost * (1 + g * 0.6);
          }
        }
      }
      this.lastKey = key;
    }
    this.updateBurst(burst);
  }

  private updateBurst(p: number): void {
    if (p <= 0 || p >= 1) {
      if (this.burst) this.burst.visible = false;
      return;
    }
    if (!this.burst) {
      const g = new THREE.Group();
      g.name = 'fx-burst';
      const c = this.element;
      const sphereGeo = new THREE.SphereGeometry(1, 20, 12);
      const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 40);
      const glowC = c.clone().multiplyScalar(2.2);
      const m1 = new THREE.MeshBasicMaterial({ color: glowC, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
      const m2 = new THREE.MeshBasicMaterial({ color: glowC, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
      const core = new THREE.MeshBasicMaterial({ color: c.clone().lerp(WHITE, 0.6).multiplyScalar(2.5), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const sphere = new THREE.Mesh(sphereGeo, m1);
      sphere.name = 'shell';
      const inner = new THREE.Mesh(sphereGeo, core);
      inner.name = 'core';
      const ring = new THREE.Mesh(ringGeo, m2);
      ring.name = 'ring';
      ring.rotation.x = Math.PI / 2;
      g.add(sphere, inner, ring);
      for (const o of [sphere, inner, ring]) o.frustumCulled = false;
      this.parent.add(g);
      this.burst = g;
      this.burstMats = [m1, m2, core];
      this.burstGeos = [sphereGeo, ringGeo];
    }
    const b = this.burst;
    b.visible = true;
    const S = this.S;
    const e = 1 - Math.pow(1 - p, 3);
    const [shell, core, ring] = b.children as THREE.Mesh[];
    shell.position.set(0, this.centreY, S * 0.25);
    shell.scale.setScalar(S * lerp(0.25, 1.6, e));
    core.position.copy(shell.position);
    core.scale.setScalar(S * lerp(0.35, 0.05, smoothstep(0, 0.6, p)));
    ring.position.set(0, S * 0.04, S * 0.1);
    ring.scale.setScalar(S * lerp(0.2, 2.2, e));
    this.burstMats[0].opacity = 0.45 * (1 - p) * (1 - p);
    this.burstMats[1].opacity = 0.85 * (1 - p);
    this.burstMats[2].opacity = 0.9 * (1 - smoothstep(0.1, 0.6, p));
  }

  dispose(): void {
    for (const m of this.own) m.dispose();
    for (const m of this.burstMats) m.dispose();
    for (const g of this.burstGeos) g.dispose();
    this.burst?.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------------
// Base model
// ---------------------------------------------------------------------------------------------

export interface BaseInit {
  root: THREE.Group;
  scaled: THREE.Group;
  meshes: THREE.SkinnedMesh[];
  /** Design height (model units). */
  S: number;
  /** World metres per model unit. */
  scale: number;
  height: number;
  radius: number;
  element: string;
  seed: number;
  /** Burst centre height (model units). */
  centreY: number;
  clips: Record<CreatureAction, Clip>;
  fidgets: Clip[];
  onDispose: () => void;
}

/**
 * Common driver: time, speed smoothing, turn rate, action and fidget layers, blinking, effects.
 * Subclasses implement `locomote` (writes base channels from speed) and `apply` (pose -> bones).
 */
export abstract class CreatureBase {
  readonly root: THREE.Group;
  readonly height: number;
  readonly radius: number;
  protected readonly scaled: THREE.Group;
  protected readonly S: number;
  protected readonly scale: number;
  protected readonly rand: () => number;
  protected readonly seed: number;
  protected readonly pose = new Float32Array(NCH);
  protected readonly base = new Float32Array(NCH);
  private readonly act = new Float32Array(NCH);
  private readonly fid = new Float32Array(NCH);
  protected time = 0;
  /** Smoothed ground speed in model units / s (includes turning-in-place stepping). */
  protected speed = 0;
  /** Raw ground speed (model units / s). */
  protected rawSpeed = 0;
  /** Smoothed longitudinal acceleration (model units / s²). */
  protected accel = 0;
  /** Smoothed yaw rate of the root (rad/s, + = turning left). */
  protected yawRate = 0;
  /** 0 while moving, 1 when fully idle. */
  protected idleW = 1;
  /** Weight of the current action (0..1). */
  protected actionW = 0;
  protected fainted = false;
  private lastYaw: number | null = null;
  private lastSpeed = 0;
  private action: { name: CreatureAction; clip: Clip; t: number } | null = null;
  private fidget: { clip: Clip; t: number; sign: number } | null = null;
  private fidgetTimer: number;
  private blinkTimer: number;
  private blinkT = -1;
  private doubleBlink = false;
  protected readonly clips: Record<CreatureAction, Clip>;
  protected readonly fidgets: Clip[];
  protected readonly fx: Fx;
  private readonly onDispose: () => void;
  private disposed = false;

  constructor(init: BaseInit) {
    this.root = init.root;
    this.scaled = init.scaled;
    this.S = init.S;
    this.scale = init.scale;
    this.height = init.height;
    this.radius = init.radius;
    this.seed = init.seed;
    this.rand = rng(init.seed);
    this.clips = init.clips;
    this.fidgets = init.fidgets;
    this.fidgetTimer = 2 + this.rand() * 3;
    this.blinkTimer = 1 + this.rand() * 2.5;
    this.fx = new Fx(init.meshes, init.scaled, new THREE.Color(init.element), init.S, init.centreY);
    this.onDispose = init.onDispose;
  }

  /** Locomotion + idle: write `this.base`. Called with smoothed speed already updated. */
  protected abstract locomote(dt: number): void;
  /** Drive bones from `this.pose`. */
  protected abstract apply(dt: number): void;
  /** Reset springs and plan state (called by reset()). */
  protected abstract resetPlan(): void;

  update(dt: number, speed: number): void {
    if (this.disposed) return;
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    this.time += dt;
    // Turn rate from the root's yaw (the caller drives it).
    const yaw = this.root.rotation.y;
    if (this.lastYaw !== null && dt > 0) {
      let d = yaw - this.lastYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yawRate = damp(this.yawRate, clamp(d / dt, -12, 12), 10, dt);
    }
    this.lastYaw = yaw;
    const v = this.fainted ? 0 : Math.max(0, Number.isFinite(speed) ? speed : 0) / this.scale;
    this.rawSpeed = v;
    const prev = this.speed;
    this.speed = damp(this.speed, v, 9, dt);
    if (dt > 0) this.accel = damp(this.accel, (this.speed - prev) / dt, 6, dt);
    this.lastSpeed = v;

    this.base.fill(0);
    this.act.fill(0);
    this.fid.fill(0);
    this.locomote(dt);

    // Action layer.
    this.actionW = 0;
    if (this.action) {
      const a = this.action;
      a.t += dt;
      const c = a.clip;
      if (a.t >= c.dur && !c.hold) {
        this.action = null;
      } else {
        const t = Math.min(a.t, c.dur);
        this.actionW = c.hold ? 1 : 1 - smoothstep(c.dur - 0.12, c.dur, t);
        sampleClip(c, t, this.act, 1);
      }
    }

    // Fidget layer (idle only).
    const canFidget = this.idleW > 0.5 && !this.action && !this.fainted;
    if (this.fidget) {
      const f = this.fidget;
      f.t += dt;
      if (f.t >= f.clip.dur) this.fidget = null;
      else {
        const w = Math.min(this.idleW, 1 - this.actionW);
        sampleClip(f.clip, f.t, this.fid, w, f.sign);
      }
    } else if (canFidget && this.fidgets.length) {
      this.fidgetTimer -= dt;
      if (this.fidgetTimer <= 0) {
        const c = this.fidgets[Math.floor(this.rand() * this.fidgets.length) % this.fidgets.length];
        this.fidget = { clip: c, t: 0, sign: this.rand() < 0.5 ? -1 : 1 };
        this.fidgetTimer = 3 + this.rand() * 4.5;
      }
    }

    // Blink.
    if (!this.fainted) {
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const d = 0.16;
        const b = this.blinkT < d ? Math.sin((this.blinkT / d) * Math.PI) : 0;
        this.base[CH.EYES] += b;
        if (this.blinkT >= d) {
          if (this.doubleBlink) {
            this.doubleBlink = false;
            this.blinkT = -0.08;
          } else {
            this.blinkT = -1;
            this.blinkTimer = 1.8 + this.rand() * 3.5;
          }
        }
      } else if (this.blinkT > -0.5) {
        this.blinkT += dt;
        if (this.blinkT >= 0) this.blinkT = 0;
      } else {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkT = 0;
          this.doubleBlink = this.rand() < 0.2;
        }
      }
    }

    const p = this.pose;
    for (let i = 0; i < NCH; i++) p[i] = this.base[i] + this.act[i] + this.fid[i];
    p[CH.EYES] = clamp(p[CH.EYES], 0, 1);
    p[CH.LIMP] = clamp(p[CH.LIMP], 0, 1);
    this.fx.update(p[CH.GLOW], p[CH.FLASH], p[CH.RED], p[CH.BURST]);
    this.apply(dt);
  }

  play(action: CreatureAction): number {
    const c = this.clips[action];
    if (!c) return 0;
    if (action !== 'faint' && this.fainted) return 0;
    this.action = { name: action, clip: c, t: 0 };
    this.fidget = null;
    if (action === 'faint') this.fainted = true;
    return c.dur;
  }

  reset(): void {
    this.action = null;
    this.fidget = null;
    this.fainted = false;
    this.fidgetTimer = 2 + this.rand() * 3;
    this.resetPlan();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.fx.dispose();
    this.onDispose();
  }

  /** Blink (eye bones scale on Y) and the curiosity flare of glow bones (ember tufts etc.). */
  protected applyFace(eyes: readonly THREE.Object3D[], glow: readonly THREE.Object3D[]): void {
    const p = this.pose;
    const open = Math.max(0.08, 1 - p[CH.EYES]);
    for (const e of eyes) e.scale.y = open;
    const cur = clamp(p[CH.CURIOUS], 0, 1.5);
    const s = 1 + cur * (0.45 + 0.08 * Math.sin(this.time * 11));
    for (const g of glow) g.scale.setScalar(s);
    this.fx.glowBoost = 1 + cur * 1.6;
  }

  /** True while a one-shot action is running (or a faint is being held). */
  get busy(): boolean {
    return this.action !== null;
  }

  /** Last speed passed to update(), in m/s (debug / gallery). */
  get speedInput(): number {
    return this.lastSpeed * this.scale;
  }
}
