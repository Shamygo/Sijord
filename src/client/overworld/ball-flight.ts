/**
 * Overworld Poke Ball flight (DESIGN §5.1): a physical arc under gravity that bounces off the
 * terrain, glances off walls and trunks, rolls and comes to rest. Pure maths with no rendering,
 * so the aim preview and the real throw run exactly the same fixed steps (and tests can check
 * them). Positions are metres, velocities m/s.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Ground height at a world (x, z). */
export type GroundFn = (x: number, z: number) => number;
/** Pushes a ball centre out of solid obstacles at height y; returns the corrected (x, z). */
export type PushFn = (x: number, z: number, y: number) => { x: number; z: number };

export const BALL_FLIGHT = {
  /** Launch speed. */
  speed: 15,
  /** A little heavier than real gravity so throws read as a crisp arc rather than floating. */
  gravity: 13,
  radius: 0.11,
  /** Share of the speed into the ground that a bounce gives back. */
  restitution: 0.38,
  /** Share of the speed along the ground kept through a bounce. */
  friction: 0.55,
  /** Rolling slow-down on the ground (m/s²): grass soaks up a rolling ball quickly. */
  rollDrag: 6,
  /** A rolling ball stays on the ground over dips this deep instead of hopping. */
  rollSnap: 0.08,
  /** Below this speed on the ground the ball stops. */
  restSpeed: 0.45,
  /** A touch slower than this into the ground is rolling contact, not a bounce. */
  bounceSpeed: 1.2,
  /** Fixed physics step shared by the preview and the real flight. */
  step: 1 / 120,
  /** A ball still moving after this long simply stops. */
  maxTime: 8,
  /** Camera pitch to launch elevation: the default camera pitch gives a mid lob; look up to throw further. */
  baseElevation: 0.42,
  pitchGain: 1.1,
  minElevation: -0.35,
  maxElevation: 1.1,
  /** A ball only catches what it hits while still flying: before its second bounce and while fast. */
  hitMaxBounces: 1,
  hitMinSpeed: 3,
};

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds since launch. */
  t: number;
  /** Bounces off the ground so far. */
  bounces: number;
  resting: boolean;
  /** Came down in deep water: lost. */
  sunk: boolean;
  /** Touching the ground last step (rolling). */
  contact: boolean;
}

export type StepResult = 'fly' | 'bounce' | 'roll' | 'rest' | 'sink';

/** Launch elevation (radians above horizontal) from the camera pitch (positive looks down). */
export function launchElevation(pitch: number, defaultPitch: number): number {
  const F = BALL_FLIGHT;
  const e = F.baseElevation - F.pitchGain * (pitch - defaultPitch);
  return Math.max(F.minElevation, Math.min(F.maxElevation, e));
}

/** Velocity for a throw along `yaw` (0 faces +Z, positive turns towards +X) at `elevation`. */
export function launchVelocity(yaw: number, elevation: number, speed = BALL_FLIGHT.speed): Vec3 {
  const c = Math.cos(elevation);
  return { x: Math.sin(yaw) * c * speed, y: Math.sin(elevation) * speed, z: Math.cos(yaw) * c * speed };
}

/**
 * Launch velocity at `speed` that lands the ball on `to` from `from`, taking the flatter of the
 * two possible arcs; null when the point is out of reach.
 */
export function solveLaunch(from: Vec3, to: Vec3, speed = BALL_FLIGHT.speed, g = BALL_FLIGHT.gravity): Vec3 | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = to.y - from.y;
  if (d < 1e-3) return { x: 0, y: h >= 0 ? speed : -speed, z: 0 };
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
  if (disc < 0) return null;
  const theta = Math.atan2(v2 - Math.sqrt(disc), g * d);
  const c = Math.cos(theta) * speed;
  return { x: (dx / d) * c, y: Math.sin(theta) * speed, z: (dz / d) * c };
}

export function newBall(from: Vec3, vel: Vec3): BallState {
  return { x: from.x, y: from.y, z: from.z, vx: vel.x, vy: vel.y, vz: vel.z, t: 0, bounces: 0, resting: false, sunk: false, contact: false };
}

/** Speed of the ball. */
export function ballSpeed(b: BallState): number {
  return Math.hypot(b.vx, b.vy, b.vz);
}

/** True while a ball can still catch what it hits (DESIGN: a rolling ball is just a ball on the ground). */
export function canCatch(b: BallState): boolean {
  return !b.resting && !b.sunk && b.bounces <= BALL_FLIGHT.hitMaxBounces && ballSpeed(b) >= BALL_FLIGHT.hitMinSpeed;
}

/** Unit ground normal from central differences of the height function. */
export function groundNormal(ground: GroundFn, x: number, z: number, e = 0.15): Vec3 {
  const dx = (ground(x + e, z) - ground(x - e, z)) / (2 * e);
  const dz = (ground(x, z + e) - ground(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  return { x: -dx / l, y: 1 / l, z: -dz / l };
}

export interface StepEnv {
  ground: GroundFn;
  /** Water surface; a ball that comes down where the ground is below it sinks. */
  waterLevel?: number;
  push?: PushFn;
}

/** Advance a ball by one fixed step. */
export function stepBall(b: BallState, env: StepEnv, dt = BALL_FLIGHT.step): StepResult {
  const F = BALL_FLIGHT;
  if (b.sunk) return 'sink';
  if (b.resting) return 'rest';
  b.t += dt;
  b.vy -= F.gravity * dt;
  let nx = b.x + b.vx * dt;
  let nz = b.z + b.vz * dt;
  b.y += b.vy * dt;
  if (env.push) {
    // Walls and trunks: push out and reflect the horizontal velocity off the contact normal.
    const r = env.push(nx, nz, b.y);
    const ox = r.x - nx;
    const oz = r.z - nz;
    const d = Math.hypot(ox, oz);
    if (d > 1e-6) {
      const n = { x: ox / d, z: oz / d };
      const vn = b.vx * n.x + b.vz * n.z;
      if (vn < 0) {
        b.vx -= (1 + F.restitution) * vn * n.x;
        b.vz -= (1 + F.restitution) * vn * n.z;
        b.vx *= F.friction;
        b.vz *= F.friction;
      }
      nx = r.x;
      nz = r.z;
    }
  }
  b.x = nx;
  b.z = nz;
  const floor = env.ground(b.x, b.z);
  const gap = b.y - F.radius - floor;
  // A rolling ball follows the ground down gentle dips rather than hopping off every one.
  if (gap > 0 && !(b.contact && gap < F.rollSnap && b.vy < 1.5)) {
    b.contact = false;
    if (b.t >= F.maxTime) b.resting = true;
    return b.resting ? 'rest' : 'fly';
  }
  b.contact = true;
  if (env.waterLevel !== undefined && floor < env.waterLevel - 0.05) {
    b.sunk = true;
    b.vx = b.vy = b.vz = 0;
    b.y = env.waterLevel - F.radius;
    return 'sink';
  }
  b.y = floor + F.radius;
  const n = groundNormal(env.ground, b.x, b.z);
  const vn = b.vx * n.x + b.vy * n.y + b.vz * n.z;
  let result: StepResult = 'roll';
  if (vn < 0) {
    // Split into the part into the ground and the part along it.
    const tx = b.vx - vn * n.x;
    const ty = b.vy - vn * n.y;
    const tz = b.vz - vn * n.z;
    const bounce = -vn > F.bounceSpeed;
    const keepT = bounce ? F.friction : 1;
    const keepN = bounce ? F.restitution : 0;
    b.vx = tx * keepT - vn * keepN * n.x;
    b.vy = ty * keepT - vn * keepN * n.y;
    b.vz = tz * keepT - vn * keepN * n.z;
    if (bounce) {
      b.bounces++;
      result = 'bounce';
    }
  }
  if (result === 'roll') {
    const s = Math.hypot(b.vx, b.vy, b.vz);
    const ns = Math.max(0, s - F.rollDrag * dt);
    if (s > 1e-6) {
      b.vx *= ns / s;
      b.vy *= ns / s;
      b.vz *= ns / s;
    }
    // It only settles where the slope can't keep it rolling.
    const slopeAccel = F.gravity * Math.sqrt(Math.max(0, 1 - n.y * n.y));
    if ((ns < F.restSpeed && slopeAccel < F.rollDrag) || b.t >= F.maxTime) {
      b.resting = true;
      b.vx = b.vy = b.vz = 0;
      return 'rest';
    }
  }
  return result;
}

export interface ArcPrediction {
  /** Sampled points along the flight, ending at the first ground contact or hit. */
  points: Vec3[];
  /** Where the ball first touches the ground (or the hit point). */
  end: Vec3;
  /** Index of the first target the flight would hit, or -1. */
  hit: number;
  /** Seconds to the first contact. */
  time: number;
}

/**
 * Preview a throw: the same steps as the real flight up to the first ground contact (or the
 * first target hit, when `hitTest` is given). `sampleEvery` controls the spacing of points.
 */
export function predictArc(
  from: Vec3,
  vel: Vec3,
  env: StepEnv,
  hitTest?: (b: BallState) => number,
  opts: { maxTime?: number; sampleEvery?: number } = {},
): ArcPrediction {
  const b = newBall(from, vel);
  const maxTime = opts.maxTime ?? 3;
  const every = opts.sampleEvery ?? 0.04;
  const points: Vec3[] = [{ x: b.x, y: b.y, z: b.z }];
  let next = every;
  let hit = -1;
  while (b.t < maxTime) {
    const r = stepBall(b, env);
    if (hitTest) {
      hit = hitTest(b);
      if (hit >= 0) break;
    }
    if (r !== 'fly') break;
    if (b.t >= next) {
      points.push({ x: b.x, y: b.y, z: b.z });
      next += every;
    }
  }
  const end = { x: b.x, y: b.y, z: b.z };
  points.push(end);
  return { points, end, hit, time: b.t };
}
