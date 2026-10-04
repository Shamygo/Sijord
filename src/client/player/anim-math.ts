import * as THREE from 'three';

/**
 * Pure animation maths shared by the avatar: easing, frame-rate independent smoothing, damped
 * springs, keyframe curves with auto-clamped tangents, a 1D blend space, the stride/foot cycle
 * and a two-bone IK solver. Nothing in here touches the scene graph, so it is unit tested.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function smootherstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
/** Frame-rate independent exponential approach (rate in 1/s). */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
/** Wraps into [0, 1). */
export function fract(x: number): number {
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------------------------
// Springs
// ---------------------------------------------------------------------------------------------

/** A damped spring scalar: x is pulled towards a target, v is its velocity. */
export interface Spring {
  x: number;
  v: number;
}
export function spring(x = 0): Spring {
  return { x, v: 0 };
}

/** Longest integration sub-step; keeps stiff springs stable and identical at 30, 60 or 144 fps. */
const SPRING_STEP = 1 / 240;

/**
 * Advance a damped spring towards `target`. `freq` is the natural angular frequency (rad/s) and
 * `zeta` the damping ratio (1 = critical, < 1 overshoots). Sub-stepped semi-implicit Euler.
 */
export function stepSpring(s: Spring, target: number, freq: number, zeta: number, dt: number): void {
  if (dt <= 0) return;
  const k = freq * freq;
  const c = 2 * freq * zeta;
  const n = Math.max(1, Math.ceil(dt / SPRING_STEP - 1e-9));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
  }
}

// ---------------------------------------------------------------------------------------------
// Keyframe curves
// ---------------------------------------------------------------------------------------------

/** Keyframes as [time, value] pairs with increasing times. */
export type Keys = readonly (readonly [number, number])[];

function hermite(p0: number, p1: number, m0: number, m1: number, h: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * h * m1;
}

/**
 * Auto-clamped tangent (Fritsch-Butland): flat at extrema, never overshoots between keys. This
 * is how animators' "auto clamped" handles behave, so curves ease in and out of every extreme.
 */
function clampedTangent(dPrev: number, dNext: number, hPrev: number, hNext: number): number {
  if (dPrev * dNext <= 0) return 0;
  return (3 * (hPrev + hNext)) / ((2 * hNext + hPrev) / dPrev + (hNext + 2 * hPrev) / dNext);
}

/** Sample a looping curve on [0, 1); keys cover one period. */
export function sampleCyclic(keys: Keys, u: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (n === 1) return keys[0][1];
  const x = fract(u);
  // Find segment i: keys[i].t <= x < keys[i+1].t (wrapping past the end).
  let i = n - 1;
  for (let k = 0; k < n; k++) {
    if (keys[k][0] > x) {
      i = k - 1;
      break;
    }
  }
  const at = (k: number): [number, number] => {
    const m = ((k % n) + n) % n;
    const wrap = Math.floor(k / n);
    return [keys[m][0] + wrap, keys[m][1]];
  };
  const [t0, v0] = at(i);
  const [t1, v1] = at(i + 1);
  const [tp, vp] = at(i - 1);
  const [tn, vn] = at(i + 2);
  const h = t1 - t0;
  const hp = t0 - tp;
  const hn = tn - t1;
  const d = (v1 - v0) / h;
  const m0 = clampedTangent((v0 - vp) / hp, d, hp, h);
  const m1 = clampedTangent(d, (vn - v1) / hn, h, hn);
  const xx = x < t0 ? x + 1 : x;
  return hermite(v0, v1, m0, m1, h, (xx - t0) / h);
}

/** Sample a one-shot curve; holds the first/last value outside the keyed range. */
export function sampleClamped(keys: Keys, t: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && keys[i + 1][0] <= t) i++;
  const [t0, v0] = keys[i];
  const [t1, v1] = keys[i + 1];
  const h = t1 - t0;
  const d = (v1 - v0) / h;
  const m0 = i > 0 ? clampedTangent((v0 - keys[i - 1][1]) / (t0 - keys[i - 1][0]), d, t0 - keys[i - 1][0], h) : 0;
  const m1 = i + 2 < n ? clampedTangent(d, (keys[i + 2][1] - v1) / (keys[i + 2][0] - t1), h, keys[i + 2][0] - t1) : 0;
  return hermite(v0, v1, m0, m1, h, (t - t0) / h);
}

// ---------------------------------------------------------------------------------------------
// Blend space
// ---------------------------------------------------------------------------------------------

/**
 * 1D blend space: piecewise-linear weights for `x` between sorted sample positions. Weights sum
 * to 1 and at most two are non-zero. Writes into `out` (resized) and returns it.
 */
export function blend1D(samples: readonly number[], x: number, out: number[] = []): number[] {
  const n = samples.length;
  out.length = n;
  out.fill(0);
  if (n === 0) return out;
  if (x <= samples[0]) {
    out[0] = 1;
    return out;
  }
  if (x >= samples[n - 1]) {
    out[n - 1] = 1;
    return out;
  }
  for (let i = 0; i < n - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (x >= a && x <= b) {
      const t = b > a ? (x - a) / (b - a) : 0;
      out[i] = 1 - t;
      out[i + 1] = t;
      return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Stride cycle
// ---------------------------------------------------------------------------------------------

/**
 * Maps a leg's cycle phase u ∈ [0, 1) (0 = foot contact) to a warped phase where stance always
 * covers [0, 0.5) and swing [0.5, 1). Gaits with different duty factors can then share curves
 * keyed in warped time and still blend with contacts lined up.
 */
export function warpPhase(u: number, duty: number): number {
  const x = fract(u);
  return x < duty ? (0.5 * x) / duty : 0.5 + (0.5 * (x - duty)) / (1 - duty);
}

export interface LegZ {
  /** Forward offset of the (flat) foot relative to the hip, metres. */
  z: number;
  /** True while the foot is on the ground. */
  stance: boolean;
  /** Normalised time within the stance (or swing) segment. */
  t: number;
}

/**
 * Fore-aft foot position for one leg over a stride. During stance the foot moves backwards
 * linearly, at exactly the body speed when `sweep = duty * cycleLength`, so it stays planted.
 * The swing is a Hermite curve whose end tangents match the stance velocity (scaled by `liftTan`
 * and `reachTan`), so lift-off and touch-down have no velocity pops: the foot follows through
 * after toe-off and reaches forward then pulls back before contact, like a real step.
 */
export function legCycleZ(u: number, duty: number, sweep: number, liftTan: number, reachTan: number, out: LegZ): LegZ {
  const x = fract(u);
  const half = sweep / 2;
  if (x < duty) {
    const t = x / duty;
    out.z = half - sweep * t;
    out.stance = true;
    out.t = t;
    return out;
  }
  const t = (x - duty) / (1 - duty);
  // Stance velocity in z per unit swing-time.
  const v = (-sweep / duty) * (1 - duty);
  out.z = hermite(-half, half, v * liftTan, v * reachTan, 1, t);
  out.stance = false;
  out.t = t;
  return out;
}

/**
 * Ankle offset from the foot's ground pivot for a pitched foot. Toes-up pitch (> 0) rolls on the
 * heel, toes-down (< 0) on the ball, so the pivot stays put on the ground like a real foot.
 * `zFlat` is where the ankle would be with the foot flat; returns the ankle's (z, y) offset.
 */
export function footRoll(pitch: number, ankleH: number, heelBack: number, ballFwd: number, out: { z: number; y: number }): { z: number; y: number } {
  const dz = pitch >= 0 ? heelBack : -ballFwd;
  const pz = -dz; // pivot relative to the flat ankle projection
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  out.z = pz + dz * c - ankleH * s;
  out.y = dz * s + ankleH * c;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Two-bone IK
// ---------------------------------------------------------------------------------------------

const _dir = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

export interface IkResult {
  /** Hinge bend of the middle joint (radians, 0 = straight). */
  bend: number;
  /** Fraction of full extension used (1 = target at or beyond reach). */
  reach: number;
}

/**
 * Analytic two-bone IK for a limb whose bones rest along -Y with a hinge about local +X.
 *
 * `target` is the end effector position relative to the root joint, in the parent space.
 * `pole` is the direction the middle joint should point (knee forward, elbow back).
 * `bendSign` +1: the lower bone bends towards local -Z (knees; apply `lower.rotation.x = bend`);
 * -1: towards +Z (elbows; apply `lower.rotation.x = -bend`).
 * Writes the upper bone's local rotation to `outUpper`.
 */
export function solveTwoBone(
  target: THREE.Vector3,
  pole: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
  bendSign: 1 | -1,
  outUpper: THREE.Quaternion,
  out: IkResult = { bend: 0, reach: 0 },
): IkResult {
  const a = upperLen;
  const b = lowerLen;
  const len = target.length();
  const maxReach = (a + b) * 0.9995;
  const minReach = Math.abs(a - b) + 1e-4;
  const d = clamp(len, minReach, maxReach);
  out.reach = len / (a + b);
  if (len < 1e-6) _dir.set(0, -1, 0);
  else _dir.copy(target).divideScalar(len);

  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const cosK = clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1);
  const alpha = Math.acos(cosA);
  out.bend = Math.PI - Math.acos(cosK);

  // Bend plane normal towards the pole.
  _n.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_n.lengthSq() < 1e-8) {
    // Pole parallel to the limb: pick any perpendicular, preferring forward.
    _n.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
    if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0);
  }
  _n.normalize();
  // Upper bone direction.
  _u.copy(_dir).multiplyScalar(Math.cos(alpha)).addScaledVector(_n, Math.sin(alpha)).normalize();
  // Local frame: bone along -Y, joint bulge on +Z for knees (bendSign 1) or -Z for elbows.
  _y.copy(_u).negate();
  _z.copy(_n).addScaledVector(_u, -_n.dot(_u));
  if (_z.lengthSq() < 1e-10) _z.set(0, 0, 1);
  _z.normalize().multiplyScalar(bendSign);
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  outUpper.setFromRotationMatrix(_m);
  return out;
}
