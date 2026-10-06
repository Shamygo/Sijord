import * as THREE from 'three';
import type { MoveAnim, PlayerSnapshot } from '../../shared/types';
import { resolveCircle } from '../core/collision';
import type { World, ClimbPoint } from '../world/types';
import { findLedge, probeBody } from './climbing';
import type { MoveInput } from './types';

/** Movement tunables. Speeds in m/s, accelerations in m/s², angles in radians, times in s. */
export const PLAYER_TUNING = {
  walkSpeed: 4.5,
  sprintSpeed: 8,
  /** Ground acceleration at rest; it eases off towards top speed (see accelFalloff). */
  groundAccel: 26,
  /** 0..1: how much acceleration fades as speed approaches the target (gives an ease-out curve). */
  accelFalloff: 0.65,
  /** Braking when there is no input: low enough that the body carries a little momentum. */
  groundDecel: 17,
  /** Braking when slowing from sprint to walk speed while still moving. */
  overspeedDecel: 9,
  /** Hard reversal (input roughly opposite to velocity): skid to a stop first. */
  skidDecel: 30,
  /** Reversal threshold: angle between velocity and input above which we skid. */
  skidAngle: 2.4,
  /** Rate the velocity direction can swing, at walk speed and at sprint speed (rad/s). */
  steerRateSlow: 11,
  steerRateFast: 4.2,
  /** Fraction of ground acceleration / steering available in the air. */
  airControl: 0.3,
  /** Horizontal drag in the air with no input (m/s²). */
  airDrag: 8,
  /** Facing: max turn rate at rest and at sprint (rad/s), and spring frequency. */
  turnRateMax: (720 * Math.PI) / 180,
  turnRateAtSprint: (380 * Math.PI) / 180,
  turnStiffness: 16,

  gravity: -25,
  /** Extra gravity while falling so jumps feel weighty rather than floaty. */
  fallGravityScale: 1.2,
  maxFallSpeed: 40,
  jumpSpeed: 8.2,
  coyoteTime: 0.12,
  jumpBuffer: 0.18,
  /** Brief foot plant after landing; buffered presses still work. */
  landingRecovery: 0.075,
  landingRetention: 0.9,

  /** Slopes steeper than this cannot be climbed and slide the player back down. */
  maxSlope: (45 * Math.PI) / 180,
  slideAccel: 14,
  /** Max height the ground may drop between steps while staying glued to it. */
  groundSnap: 0.45,
  /** Small ledges that can be stepped onto while airborne. */
  stepUp: 0.35,
  /** Ground deeper than this below the water surface acts as a wall. */
  maxWaterDepth: 0.6,
  radius: 0.35,

  staminaDrain: 0.2,
  staminaRegen: 0.28,
  staminaRegenDelay: 0.6,
  /** Sprint lock-out after stamina empties (also needs some stamina back). */
  exhaustLockout: 1.4,

  /** Dodge (DESIGN §5.3): a roll along the input, or a short backstep hop with none. */
  rollSpeed: 8.6,
  rollTime: 0.5,
  dodgeSpeed: 9,
  dodgeHop: 3.4,
  dodgeTime: 0.34,
  dodgeStamina: 0.16,
  dodgeCooldown: 0.3,
  /** Hits pass through for this long from the start of a dodge. */
  dodgeInvuln: 0.3,
  dodgeBuffer: 0.15,
  exhaustRecoverTo: 0.25,

  /** Climbing (BotW-style): push into any steep slope, cliff face or big rock to grab on. */
  climbSpeed: 1.25,
  climbDownSpeed: 1.7,
  climbSideSpeed: 1.2,
  /** Stamina per second while moving on a wall, and while just hanging on. */
  climbDrain: 0.075,
  climbHoldDrain: 0.02,
  /** Jump on a wall: a lunge this high, costing stamina. */
  climbJumpHeight: 1.4,
  climbJumpTime: 0.38,
  climbJumpCost: 0.18,
  /** How long to push into a wall from the ground before grabbing it. */
  climbGrabDelay: 0.15,
  /** Pulling up over a top, and the quick vault over chest-high rock while moving. */
  mantleTime: 0.9,
  vaultTime: 0.5,
  vaultHeight: 1.3,

  /** Physics sub-step length and frame dt cap. */
  maxStep: 1 / 120,
  maxFrameDt: 0.1,
};

export type PlayerTuning = typeof PLAYER_TUNING;

/** Heights above the feet probed for a wall: grabbing (shin, chest) and holding on (feet to head). */
const GRAB_PROBES = [0.3, 1.1] as const;
const CLIMB_PROBES = [0.25, 0.9, 1.5] as const;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
function moveTowards(v: number, target: number, maxDelta: number): number {
  if (Math.abs(target - v) <= maxDelta) return target;
  return v + Math.sign(target - v) * maxDelta;
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Third-person locomotion with weight: eased acceleration, momentum on release, speed-dependent
 * steering, a damped facing spring, coyote time / jump buffering, slope limits and water walls.
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  /** World-space velocity (x/z horizontal, y vertical). */
  readonly velocity = new THREE.Vector3();
  /** Facing yaw; 0 faces +Z, positive turns towards +X. */
  yaw = 0;
  grounded = false;
  /** 0..1 */
  stamina = 1;
  /** True while sprint is locked out after emptying stamina. */
  exhausted = false;
  /** True while sprint is actually being applied this frame. */
  sprinting = false;
  /** Downward speed at the last landing (m/s), for camera shake / sounds. */
  lastLandingSpeed = 0;

  readonly tuning: PlayerTuning;

  private activeClimb: ClimbPoint | null = null;
  private climbCooldown = 0;
  private yawVel = 0;
  private timeSinceGrounded = 0;
  private jumpBufferT = 0;
  private prevJump = false;
  private jumpedSinceGrounded = false;
  private sinceSprint = 10;
  private exhaustT = 0;
  private airTime = 0;
  private landingRecoveryT = 0;
  private airSpeedLimit = PLAYER_TUNING.walkSpeed;
  private onSteep = false;
  private dodgeT = 0;
  private dodgeAge = 0;
  private dodgeCooldownT = 0;
  private dodgeBufferT = 0;
  private prevDodge = false;
  private dodgeX = 0;
  private dodgeZ = 0;
  private dodgeFace = 0;
  private dodgeAhead = false;
  private dodgeRoll = false;
  /** Climbing a wall: its outward normal. */
  private wall: { x: number; z: number } | null = null;
  private grabT = 0;
  private climbJumpT = 0;
  private climbJumpUp = 0;
  private climbJumpSide = 0;
  private climbSpeedNow = 0;
  private letGoBufferT = 0;
  private prevClimb = false;
  private mantle: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; t: number; dur: number; vault: boolean; carry: number } | null = null;

  constructor(tuning: Partial<PlayerTuning> = {}) {
    this.tuning = { ...PLAYER_TUNING, ...tuning };
  }

  teleport(pos: THREE.Vector3, yaw: number): void {
    this.activeClimb=null;this.climbCooldown=0;this.wall=null;this.mantle=null;this.grabT=this.climbJumpT=0;
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.yawVel = 0;
    // Let the first update settle onto the ground (snap if close, otherwise fall).
    this.grounded = true;
    this.timeSinceGrounded = 0;
    this.jumpBufferT = 0;
    this.airTime = 0;
    this.landingRecoveryT = 0;
    this.jumpedSinceGrounded = false;
    this.prevJump = false;
    this.dodgeT = this.dodgeCooldownT = this.dodgeBufferT = 0;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dtIn: number, input: MoveInput, cameraYaw: number, world: World): void {
    const T = this.tuning;
    const dt = clamp(dtIn, 0, T.maxFrameDt);
    if (dt <= 0) return;

    this.climbCooldown=Math.max(0,this.climbCooldown-dt);
    if (input.climb && !this.prevClimb) this.letGoBufferT = 0.15;
    this.prevClimb = !!input.climb;
    // Jump edge detection happens once per frame; the buffer carries it across sub-steps.
    if (input.jump && !this.prevJump) this.jumpBufferT = T.jumpBuffer;
    this.prevJump = input.jump;
    if (input.dodge && !this.prevDodge) this.dodgeBufferT = T.dodgeBuffer;
    this.prevDodge = !!input.dodge;

    const steps = Math.max(1, Math.ceil(dt / T.maxStep - 1e-6));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, input, cameraYaw, world);
  }

  private step(dt: number, input: MoveInput, cameraYaw: number, world: World): void {
    const T = this.tuning;
    const pos = this.position;
    const vel = this.velocity;
    this.letGoBufferT = Math.max(0, this.letGoBufferT - dt);
    if (this.mantle) {
      this.stepMantle(dt);
      return;
    }

    // ---- Camera-relative wish direction ----------------------------------------------------
    const fx = Math.sin(cameraYaw);
    const fz = Math.cos(cameraYaw);
    // Camera right: forward × up.
    const rx = -fz;
    const rz = fx;
    let wx = fx * clamp(input.forward, -1, 1) + rx * clamp(input.right, -1, 1);
    let wz = fz * clamp(input.forward, -1, 1) + rz * clamp(input.right, -1, 1);
    let wishMag = Math.hypot(wx, wz);
    if (wishMag > 1) {
      wx /= wishMag;
      wz /= wishMag;
      wishMag = 1;
    }
    const hasInput = wishMag > 0.05;
    const dirX = hasInput ? wx / wishMag : 0;
    const dirZ = hasInput ? wz / wishMag : 0;

    // ---- Ladders: hold climb or push into one ----------------------------------------------
    if (this.activeClimb) {
      const ladder = this.activeClimb;
      if (this.jumpBufferT > 0 || this.stamina <= 0) {
        this.activeClimb = null; this.climbCooldown = .6; this.grounded = false;
        pos.x -= Math.sin(ladder.yaw) * .8; pos.z -= Math.cos(ladder.yaw) * .8; vel.set(0, this.jumpBufferT > 0 ? 4 : 0, 0); this.jumpBufferT = 0;
        return;
      }
      const speed = input.forward < -.1 ? -1.5 : input.forward > .1 || input.climb ? 1.5 : 0;
      this.stamina = Math.max(0, this.stamina - Math.abs(speed) * .055 * dt);
      pos.x = ladder.bottom.x; pos.z = ladder.bottom.z; pos.y += speed * dt; this.yaw = ladder.yaw;
      vel.set(0, speed, 0); this.climbSpeedNow = Math.abs(speed); this.grounded = false; this.sprinting = false; this.sinceSprint = 0;
      if (pos.y >= ladder.top.y) { pos.set(ladder.landing.x, ladder.landing.y, ladder.landing.z); vel.set(0, 0, 0); this.activeClimb = null; this.grounded = true; this.climbCooldown = .5; }
      else if (pos.y < ladder.bottom.y) { pos.y = ladder.bottom.y; pos.x -= Math.sin(ladder.yaw) * .65; pos.z -= Math.cos(ladder.yaw) * .65; vel.set(0, 0, 0); this.activeClimb = null; this.grounded = true; this.climbCooldown = .5; }
      return;
    }
    if (this.climbCooldown === 0 && !this.exhausted && this.stamina > 0 && !this.wall) {
      const ladder = this.nearClimb(world);
      const towards = ladder && hasInput && dirX * Math.sin(ladder.yaw) + dirZ * Math.cos(ladder.yaw) > 0.6;
      if (ladder && (input.climb || towards)) {
        this.activeClimb = ladder; pos.set(ladder.bottom.x, Math.max(pos.y, ladder.bottom.y), ladder.bottom.z); vel.set(0, 0, 0); this.yaw = ladder.yaw; this.grounded = false;
        return;
      }
    }
    if (this.wall) {
      this.stepWall(dt, input, world);
      return;
    }

    // ---- Stamina / sprint ------------------------------------------------------------------
    if (this.exhausted) {
      this.exhaustT -= dt;
      if (this.exhaustT <= 0 && this.stamina >= T.exhaustRecoverTo) this.exhausted = false;
    }
    const wantsSprint = input.sprint && hasInput && wishMag > 0.5 && !this.exhausted;
    this.sprinting = wantsSprint && (this.grounded || this.sprinting);
    if (this.sprinting) {
      this.sinceSprint = 0;
      this.stamina = Math.max(0, this.stamina - T.staminaDrain * dt);
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.exhaustT = T.exhaustLockout;
        this.sprinting = false;
      }
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint >= T.staminaRegenDelay) this.stamina = Math.min(1, this.stamina + T.staminaRegen * dt);
    }

    // ---- Dodge -------------------------------------------------------------------------------
    this.dodgeCooldownT = Math.max(0, this.dodgeCooldownT - dt);
    this.dodgeBufferT = Math.max(0, this.dodgeBufferT - dt);
    if (this.dodgeBufferT > 0 && this.dodgeT === 0 && this.dodgeCooldownT === 0 && this.grounded && !this.onSteep && !this.exhausted && this.stamina > 0) {
      this.dodgeX = hasInput ? dirX : -Math.sin(this.yaw);
      this.dodgeZ = hasInput ? dirZ : -Math.cos(this.yaw);
      // With a direction held it's a roll that way, turning into it; with none, a backstep hop
      // that keeps facing the threat.
      this.dodgeRoll = hasInput;
      this.dodgeAhead = hasInput;
      this.dodgeFace = hasInput ? Math.atan2(dirX, dirZ) : this.yaw;
      this.dodgeT = hasInput ? T.rollTime : T.dodgeTime;
      this.dodgeAge = 0;
      this.dodgeBufferT = 0;
      this.jumpBufferT = 0;
      if (!hasInput) {
        vel.y = T.dodgeHop;
        this.grounded = false;
        this.jumpedSinceGrounded = true;
        this.timeSinceGrounded = T.coyoteTime + 1;
        this.airSpeedLimit = T.walkSpeed;
      }
      this.sinceSprint = 0;
      this.stamina = Math.max(0, this.stamina - T.dodgeStamina);
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.exhaustT = T.exhaustLockout;
      }
    }

    // ---- Horizontal velocity -----------------------------------------------------------------
    const ground = this.grounded && !this.onSteep;
    const control = ground ? 1 : T.airControl;
    const topSpeed = this.sprinting ? T.sprintSpeed : T.walkSpeed;
    const targetSpeed = hasInput ? topSpeed * wishMag : 0;
    let speed = Math.hypot(vel.x, vel.z);
    let vdx = speed > 1e-4 ? vel.x / speed : dirX;
    let vdz = speed > 1e-4 ? vel.z / speed : dirZ;

    let skidding = false;
    if (!ground) {
      // Apply limited forces along input, rather than steering existing momentum like a car.
      // A jump cannot increase the take-off speed; releasing input brakes in the air as well.
      const limit = Math.min(topSpeed, this.airSpeedLimit);
      const tx = hasInput ? dirX * limit * wishMag : 0;
      const tz = hasInput ? dirZ * limit * wishMag : 0;
      const delta = Math.hypot(tx - vel.x, tz - vel.z);
      const amount = Math.min(1, (hasInput ? T.groundAccel * T.airControl : T.airDrag) * dt / Math.max(delta, 1e-6));
      vel.x += (tx - vel.x) * amount;
      vel.z += (tz - vel.z) * amount;
      speed = Math.hypot(vel.x, vel.z);
      vdx = speed > 1e-4 ? vel.x / speed : 0;
      vdz = speed > 1e-4 ? vel.z / speed : 0;
    } else if (hasInput) {
      if (speed < 0.4) {
        // From (near) rest, push straight along the wish direction.
        vdx = dirX;
        vdz = dirZ;
      } else {
        const diff = wrapAngle(Math.atan2(dirX, dirZ) - Math.atan2(vdx, vdz));
        if (Math.abs(diff) > T.skidAngle && ground) {
          // Hard reversal: plant and skid to a stop before turning round (no push along the
          // old direction while sliding).
          speed = moveTowards(speed, 0, T.skidDecel * dt);
          skidding = true;
        } else {
          const fast = smoothstep(T.walkSpeed * 0.8, T.sprintSpeed, speed);
          const steer = (T.steerRateSlow + (T.steerRateFast - T.steerRateSlow) * fast) * control;
          const turn = clamp(diff, -steer * dt, steer * dt);
          const a = Math.atan2(vdx, vdz) + turn;
          vdx = Math.sin(a);
          vdz = Math.cos(a);
        }
      }
      if (skidding) {
        // Speed already handled above.
      } else if (speed < targetSpeed) {
        const falloff = 1 - T.accelFalloff * clamp(speed / Math.max(targetSpeed, 1e-3), 0, 1);
        speed = Math.min(targetSpeed, speed + T.groundAccel * falloff * control * dt);
      } else if (speed > targetSpeed) {
        speed = moveTowards(speed, targetSpeed, (ground ? T.overspeedDecel : T.airDrag) * dt);
      }
    } else {
      speed = moveTowards(speed, 0, (ground ? T.groundDecel : T.airDrag) * dt);
    }
    vel.x = vdx * speed;
    vel.z = vdz * speed;
    if (this.dodgeT > 0) {
      // Fast off the mark, easing towards the end; input doesn't steer a dodge.
      this.dodgeAge += dt;
      const k = Math.min(1, this.dodgeAge / (this.dodgeRoll ? T.rollTime : T.dodgeTime));
      const s = this.dodgeRoll ? T.rollSpeed * (1 - 0.6 * k * k) : T.dodgeSpeed * (1 - 0.55 * k * k);
      vel.x = this.dodgeX * s;
      vel.z = this.dodgeZ * s;
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      if (this.dodgeT === 0) {
        this.dodgeCooldownT = T.dodgeCooldown;
        // A roll carries on at a jog; a backstep lands planted, still facing the threat.
        const out = this.dodgeAhead ? Math.min(T.walkSpeed, s) : 0;
        vel.x = this.dodgeX * out;
        vel.z = this.dodgeZ * out;
      }
    }

    // Slide down slopes that are too steep to stand on.
    if (this.grounded && this.onSteep) {
      const g = this.gradient(world, pos.x, pos.z);
      const gl = Math.hypot(g.x, g.z) || 1;
      vel.x -= (g.x / gl) * T.slideAccel * dt;
      vel.z -= (g.z / gl) * T.slideAccel * dt;
    }

    // ---- Facing: damped spring towards the move direction, rate-limited -----------------------
    let faceTarget: number | null = null;
    if (this.dodgeT > 0) faceTarget = this.dodgeFace;
    else if (speed > 0.4) faceTarget = Math.atan2(vel.x, vel.z);
    else if (hasInput) faceTarget = Math.atan2(dirX, dirZ);
    else if (speed > 1.0) faceTarget = Math.atan2(vel.x, vel.z);
    if (faceTarget !== null) {
      const diff = wrapAngle(faceTarget - this.yaw);
      const k = T.turnStiffness;
      const acc = k * k * diff - 2 * k * this.yawVel;
      this.yawVel += acc * dt;
    } else {
      this.yawVel *= Math.exp(-T.turnStiffness * dt);
    }
    const fast = smoothstep(T.walkSpeed, T.sprintSpeed, Math.hypot(vel.x, vel.z));
    const maxTurn = T.turnRateMax + (T.turnRateAtSprint - T.turnRateMax) * fast;
    this.yawVel = clamp(this.yawVel, -maxTurn, maxTurn);
    this.yaw = wrapAngle(this.yaw + this.yawVel * dt);

    // ---- Jump --------------------------------------------------------------------------------
    this.landingRecoveryT = Math.max(0, this.landingRecoveryT - dt);
    this.jumpBufferT = Math.max(0, this.jumpBufferT - dt);
    const canJump = this.landingRecoveryT === 0 && !this.jumpedSinceGrounded && this.timeSinceGrounded <= T.coyoteTime && !this.onSteep && this.dodgeT === 0;
    if (this.jumpBufferT > 0 && canJump) {
      this.airSpeedLimit = Math.max(T.walkSpeed, this.horizontalSpeed);
      vel.y = T.jumpSpeed;
      this.grounded = false;
      this.jumpedSinceGrounded = true;
      this.jumpBufferT = 0;
      this.timeSinceGrounded = T.coyoteTime + 1;
    }

    // ---- Vertical ----------------------------------------------------------------------------
    if (!this.grounded) {
      const g = vel.y < 0 ? T.gravity * T.fallGravityScale : T.gravity;
      vel.y = Math.max(-T.maxFallSpeed, vel.y + g * dt);
    } else {
      vel.y = 0;
    }

    // ---- Horizontal move with terrain rules ---------------------------------------------------
    const ox = pos.x;
    const oz = pos.z;
    let nx = ox + vel.x * dt;
    let nz = oz + vel.z * dt;
    const yAfter = pos.y + vel.y * dt;
    if (!this.canEnter(world, ox, oz, nx, nz, yAfter)) {
      // Try sliding along each axis.
      if (this.canEnter(world, ox, oz, nx, oz, yAfter)) {
        nz = oz;
        vel.z = 0;
      } else if (this.canEnter(world, ox, oz, ox, nz, yAfter)) {
        nx = ox;
        vel.x = 0;
      } else {
        nx = ox;
        nz = oz;
        vel.x = 0;
        vel.z = 0;
      }
    }

    // Static colliders.
    const r = resolveCircle(nx, nz, T.radius, world.colliders,yAfter);
    const pushX = r.x - nx;
    const pushZ = r.z - nz;
    const pushLen = Math.hypot(pushX, pushZ);
    if (pushLen > 1e-6) {
      const nX = pushX / pushLen;
      const nZ = pushZ / pushLen;
      const into = vel.x * nX + vel.z * nZ;
      if (into < 0) {
        vel.x -= into * nX;
        vel.z -= into * nZ;
      }
      // Don't let a collider shove us into deep water or up a cliff.
      if (this.canEnter(world, ox, oz, r.x, r.z, yAfter)) {
        nx = r.x;
        nz = r.z;
      } else {
        nx = ox;
        nz = oz;
      }
    }

    // Map bounds.
    const lim = world.halfSize - T.radius;
    if (nx < -lim || nx > lim) {
      nx = clamp(nx, -lim, lim);
      vel.x = 0;
    }
    if (nz < -lim || nz > lim) {
      nz = clamp(nz, -lim, lim);
      vel.z = 0;
    }
    pos.x = nx;
    pos.z = nz;

    // ---- Ground contact ----------------------------------------------------------------------
    const gy = this.groundAt(world,nx,nz,yAfter);
    if (this.grounded) {
      // Stay glued over bumps and down walkable slopes (uphill steps were vetted by canEnter).
      if (pos.y - gy <= T.groundSnap) {
        pos.y = gy;
      } else {
        // Walked off a ledge: start falling, coyote time running.
        this.airSpeedLimit = Math.max(T.walkSpeed, this.horizontalSpeed);
        this.grounded = false;
        vel.y = 0;
      }
    } else {
      pos.y = yAfter;
      if (pos.y <= gy) {
        this.lastLandingSpeed = Math.max(0, -vel.y);
        if (this.airTime > 0.12) {
          this.landingRecoveryT = T.landingRecovery;
          vel.x *= T.landingRetention; vel.z *= T.landingRetention;
        }
        pos.y = gy;
        vel.y = 0;
        this.grounded = true;
      }
    }

    if (this.grounded) {
      this.timeSinceGrounded = 0;
      this.jumpedSinceGrounded = false;
      this.airTime = 0;
      const g = this.gradient(world, nx, nz);
      this.onSteep = Math.hypot(g.x, g.z) > Math.tan(T.maxSlope) && this.groundAt(world, nx, nz, pos.y) <= world.heightAt(nx, nz) + 0.01;
    } else {
      this.timeSinceGrounded += dt;
      this.airTime += dt;
      this.onSteep = false;
    }
    this.tryGrab(dt, hasInput, dirX, dirZ, world);
  }

  // ---- Climbing ----------------------------------------------------------------------------

  /** Pushing into something climbable: pull up onto it if the top is in reach, else grab on. */
  private tryGrab(dt: number, hasInput: boolean, dirX: number, dirZ: number, world: World): void {
    const T = this.tuning, pos = this.position;
    if (!hasInput || this.dodgeT > 0 || this.climbCooldown > 0 || this.exhausted || this.stamina <= 0) { this.grabT = 0; return; }
    const body = probeBody(world, pos.x, pos.z, pos.y, dirX, dirZ, T.radius + 0.3, Math.tan(T.maxSlope), GRAB_PROBES);
    const hit = body?.hit;
    // Only walls you can't walk up, met head on; everything else is ordinary collision.
    if (!hit || !hit.climbable || -(hit.nx * dirX + hit.nz * dirZ) < 0.5) { this.grabT = 0; return; }
    this.grabT += dt;
    // From the ground: a quick vault over anything chest-high, otherwise a moment's push first.
    if (this.grounded && this.grabT < T.climbGrabDelay * 0.5) return;
    const ledge = findLedge(world, pos.x, pos.z, pos.y, dirX, dirZ, Math.max(0, hit.dist), 1.9, T.radius, T.maxSlope);
    const low = !!ledge && this.grounded && ledge.y - pos.y <= T.vaultHeight;
    if (this.grounded && !low && this.grabT < T.climbGrabDelay) return;
    this.grabT = 0;
    if (ledge) {
      this.startMantle(ledge, low);
      return;
    }
    this.wall = { x: hit.nx, z: hit.nz };
    this.grounded = false;
    this.velocity.set(0, 0, 0);
    this.climbJumpT = 0;
    this.yaw = Math.atan2(-hit.nx, -hit.nz);
    this.yawVel = 0;
  }

  private dropWall(push: number, up: number): void {
    const n = this.wall ?? { x: 0, z: 0 };
    this.wall = null;
    this.velocity.set(n.x * push, up, n.z * push);
    this.grounded = false;
    this.climbCooldown = 0.5;
    this.climbJumpT = 0;
    this.airSpeedLimit = this.tuning.walkSpeed;
    this.jumpedSinceGrounded = true;
    this.timeSinceGrounded = this.tuning.coyoteTime + 1;
    this.airTime = 0.2;
  }

  private stepWall(dt: number, input: MoveInput, world: World): void {
    const T = this.tuning, pos = this.position, n = this.wall!;
    const fx = -n.x, fz = -n.z, rx = n.z, rz = -n.x;
    const up = clamp(input.forward, -1, 1), side = clamp(input.right, -1, 1);
    this.sprinting = false;
    this.sinceSprint = 0;
    this.grounded = false;
    this.airTime = 0;
    if (this.letGoBufferT > 0) {
      this.letGoBufferT = 0;
      this.dropWall(1.2, 0);
      return;
    }
    if (this.jumpBufferT > 0) {
      this.jumpBufferT = 0;
      if (up < -0.5) {
        // Kick off the wall, turning away from it.
        this.stamina = Math.max(0, this.stamina - T.climbJumpCost * 0.5);
        this.yaw = Math.atan2(n.x, n.z);
        this.dropWall(4.5, 5.5);
        return;
      }
      if (this.climbJumpT === 0 && this.stamina > 0) {
        const sideways = Math.abs(side) > 0.5 && up < 0.5;
        const u = sideways ? 0.3 : 1, sd = sideways ? Math.sign(side) : 0, l = Math.hypot(u, sd);
        this.climbJumpUp = u / l;
        this.climbJumpSide = sd / l;
        this.climbJumpT = T.climbJumpTime;
        this.stamina = Math.max(0, this.stamina - T.climbJumpCost);
      }
    }
    let vy: number, vs: number;
    if (this.climbJumpT > 0) {
      // A lunge that starts fast and slows, covering climbJumpHeight.
      const s = ((2 * T.climbJumpHeight) / T.climbJumpTime) * (this.climbJumpT / T.climbJumpTime);
      vy = this.climbJumpUp * s;
      vs = this.climbJumpSide * s;
      this.climbJumpT = Math.max(0, this.climbJumpT - dt);
    } else {
      vy = up > 0 ? up * T.climbSpeed : up * T.climbDownSpeed;
      vs = side * T.climbSideSpeed;
      const m = Math.hypot(vy, vs), cap = Math.max(T.climbSpeed, Math.abs(vy));
      if (m > cap) { vy *= cap / m; vs *= cap / m; }
    }
    const moving = Math.hypot(vy, vs) > 0.05;
    this.stamina = Math.max(0, this.stamina - (moving ? T.climbDrain : T.climbHoldDrain) * dt);
    if (this.stamina <= 0) {
      this.exhausted = true;
      this.exhaustT = T.exhaustLockout;
      this.dropWall(0.8, 0);
      return;
    }
    let y = pos.y + vy * dt;
    // Trees, posts and the like still block a sideways shuffle.
    const r = resolveCircle(pos.x + rx * vs * dt, pos.z + rz * vs * dt, T.radius, world.colliders, y);
    let x = r.x, z = r.z;
    let body = probeBody(world, x, z, y, fx, fz, T.radius + 0.7, Math.tan(T.maxSlope), CLIMB_PROBES);
    // Nothing to hold at head height while going up: the top. Pull up onto it if there's room.
    if (!body || (vy > 0 && body.highest < CLIMB_PROBES[CLIMB_PROBES.length - 1])) {
      const ledge = findLedge(world, x, z, y, fx, fz, body ? Math.max(0, body.hit.dist) : T.radius, 1.9, T.radius, T.maxSlope);
      if (ledge) {
        pos.set(x, y, z);
        this.startMantle(ledge, false);
        return;
      }
    }
    // Past a step too narrow to stand on: reach across to the wall set back behind it.
    if (!body && vy > 0) body = probeBody(world, x, z, y, fx, fz, T.radius + 1.6, Math.tan(T.maxSlope), CLIMB_PROBES);
    if (!body || !body.hit.climbable) {
      pos.set(x, y, z);
      this.dropWall(0.3, 0);
      return;
    }
    // Hold a hand's length off the surface, and turn with it.
    const pull = clamp(body.hit.dist - (T.radius + 0.04), -3 * dt, 3 * dt);
    x += fx * pull;
    z += fz * pull;
    const a = 1 - Math.exp(-10 * dt);
    const nx = n.x + (body.hit.nx - n.x) * a, nz = n.z + (body.hit.nz - n.z) * a, nl = Math.hypot(nx, nz) || 1;
    n.x = nx / nl;
    n.z = nz / nl;
    const lim = world.halfSize - T.radius;
    x = clamp(x, -lim, lim);
    z = clamp(z, -lim, lim);
    // Back on walkable ground at the foot of the wall: stand up.
    const ground = this.groundAt(world, x, z, y + 0.05);
    if (y < ground) y = ground;
    if (vy < 0 && y <= ground + 0.02) {
      const g = this.gradient(world, x, z);
      if (Math.hypot(g.x, g.z) <= Math.tan(T.maxSlope)) {
        pos.set(x, y, z);
        this.wall = null;
        this.grounded = true;
        this.velocity.set(0, 0, 0);
        this.climbCooldown = 0.35;
        return;
      }
    }
    this.velocity.set((x - pos.x) / dt, vy, (z - pos.z) / dt);
    pos.set(x, y, z);
    this.climbSpeedNow = Math.hypot(vy, vs);
    const face = Math.atan2(-n.x, -n.z);
    this.yaw = wrapAngle(this.yaw + wrapAngle(face - this.yaw) * (1 - Math.exp(-12 * dt)));
    this.yawVel = 0;
  }

  private startMantle(to: { x: number; y: number; z: number }, vault: boolean): void {
    const T = this.tuning, p = this.position;
    const carry = vault ? T.walkSpeed * 0.7 : 0;
    this.mantle = { x0: p.x, y0: p.y, z0: p.z, x1: to.x, y1: to.y, z1: to.z, t: 0, dur: vault ? T.vaultTime : T.mantleTime, vault, carry };
    if (Math.hypot(to.x - p.x, to.z - p.z) > 0.05) this.yaw = Math.atan2(to.x - p.x, to.z - p.z);
    this.yawVel = 0;
    this.wall = null;
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.climbJumpT = 0;
  }

  /** Kinematic pull-up: rise to the top first, then step forward onto it. */
  private stepMantle(dt: number): void {
    const m = this.mantle!, p = this.position;
    m.t += dt;
    const f = Math.min(1, m.t / m.dur);
    const rise = m.vault ? smoothstep(0, 0.55, f) : smoothstep(0.05, 0.55, f);
    const along = m.vault ? f : 0.15 * smoothstep(0, 0.4, f) + 0.85 * smoothstep(0.35, 0.95, f);
    const hop = m.vault ? 0.25 * Math.sin(Math.PI * f) : 0;
    const x = m.x0 + (m.x1 - m.x0) * along, z = m.z0 + (m.z1 - m.z0) * along, y = m.y0 + (m.y1 - m.y0) * rise + hop;
    this.velocity.set((x - p.x) / dt, (y - p.y) / dt, (z - p.z) / dt);
    p.set(x, y, z);
    this.climbSpeedNow = 0;
    this.sprinting = false;
    if (f < 1) return;
    this.mantle = null;
    this.grounded = true;
    this.airTime = 0;
    this.timeSinceGrounded = 0;
    this.jumpedSinceGrounded = false;
    this.climbCooldown = 0.3;
    this.velocity.set(Math.sin(this.yaw) * m.carry, 0, Math.cos(this.yaw) * m.carry);
  }

  /** Terrain rules for stepping from (ox, oz) to (nx, nz): bounds of slope and water. */
  private canEnter(world: World, ox: number, oz: number, nx: number, nz: number, y: number): boolean {
    const T = this.tuning;
    if (nx === ox && nz === oz) return true;
    const h0 = this.groundAt(world,ox,oz,y);
    const h1 = this.groundAt(world,nx,nz,y);
    // Deep water is a wall, unless we're already in it (then allow moving out / shallower).
    const deep = world.waterLevel - T.maxWaterDepth;
    if (h1 < deep && h1 < h0) return false;
    const d = Math.hypot(nx - ox, nz - oz);
    const rise = h1 - Math.max(h0, this.grounded ? h0 : y);
    if (this.grounded) {
      if (rise <= 0) return true;
      // Too steep uphill: compare the rise to the slope limit, and the local gradient there.
      if (rise > d * Math.tan(T.maxSlope) + 0.01) {
        const g = this.gradient(world, nx, nz);
        const gl = Math.hypot(g.x, g.z);
        const uphill = (g.x * (nx - ox) + g.z * (nz - oz)) / (d || 1);
        if (gl > Math.tan(T.maxSlope) && uphill > 0) return false;
        if (rise > T.stepUp * 0.5 + d * Math.tan(T.maxSlope)) return false;
      }
      return true;
    }
    // Airborne: terrain above our feet is a wall unless it's a small ledge we can land on.
    if (h1 <= y) return true;
    if (h1 - y > T.stepUp) return false;
    const g = this.gradient(world, nx, nz);
    return Math.hypot(g.x, g.z) <= Math.tan(T.maxSlope);
  }

  private gradient(world: World, x: number, z: number): { x: number; z: number } {
    const e = 0.2;
    return {
      x: (world.heightAt(x + e, z) - world.heightAt(x - e, z)) / (2 * e),
      z: (world.heightAt(x, z + e) - world.heightAt(x, z - e)) / (2 * e),
    };
  }

  private groundAt(world:World,x:number,z:number,y:number):number {return world.surfaceHeightAt?.(x,z,y) ?? world.heightAt(x,z);}

  nearClimb(world:World):ClimbPoint | null {
    return world.climbs?.find(c=>Math.hypot(this.position.x-c.bottom.x,this.position.z-c.bottom.z)<1.35 && Math.abs(this.position.y-c.bottom.y)<1.1) ?? null;
  }
  /** Mid-dodge. */
  get dodging(): boolean {
    return this.dodgeT > 0;
  }

  /** Early in a dodge, when hits pass through. */
  get invulnerable(): boolean {
    return this.dodgeT > 0 && this.dodgeAge < this.tuning.dodgeInvuln;
  }

  get onLadder(): boolean { return !!this.activeClimb; }
  get onWall(): boolean { return !!this.wall; }
  /** On a ladder or a wall, or pulling up over the top. */
  get climbing(): boolean { return !!this.activeClimb || !!this.wall || !!this.mantle; }
  get anim(): MoveAnim {
    if (this.mantle) return this.mantle.vault ? 'vault' : 'mantle';
    if (this.climbing) return 'climb';
    if (this.dodgeT > 0 && this.dodgeRoll && (this.grounded || this.airTime < 0.15)) return 'roll';
    // The slide out of a dodge hop plays the landing, not a run cycle going the wrong way.
    if (this.dodgeT > 0 && this.grounded) return 'idle';
    // Brief drops (stairs, bumps) keep the grounded animation.
    if (!this.grounded && (this.velocity.y > 0.5 || this.airTime > 0.12)) {
      return this.velocity.y > 0 ? 'jump' : 'fall';
    }
    const s = this.horizontalSpeed;
    if (s < 0.25) return 'idle';
    return s > (this.tuning.walkSpeed + this.tuning.sprintSpeed) / 2 - 0.5 ? 'run' : 'walk';
  }

  snapshot(): PlayerSnapshot {
    const s: PlayerSnapshot & { tired: boolean } = {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      speed: this.climbing ? this.climbSpeedNow : this.horizontalSpeed,
      anim: this.anim,
      // Animation hint (avatars play the out-of-breath pose); optional for receivers.
      tired: this.exhausted,
    };
    return s;
  }
}
