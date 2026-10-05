import * as THREE from 'three';
import type { MoveAnim, PlayerSnapshot } from '../../shared/types';
import { resolveCircle } from '../core/collision';
import type { World, ClimbPoint } from '../world/types';
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
  exhaustRecoverTo: 0.25,

  /** Physics sub-step length and frame dt cap. */
  maxStep: 1 / 120,
  maxFrameDt: 0.1,
};

export type PlayerTuning = typeof PLAYER_TUNING;

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
  private terrainClimbing = false;
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

  constructor(tuning: Partial<PlayerTuning> = {}) {
    this.tuning = { ...PLAYER_TUNING, ...tuning };
  }

  teleport(pos: THREE.Vector3, yaw: number): void {
    this.activeClimb=null;this.terrainClimbing=false;this.climbCooldown=0;
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
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dtIn: number, input: MoveInput, cameraYaw: number, world: World): void {
    const T = this.tuning;
    const dt = clamp(dtIn, 0, T.maxFrameDt);
    if (dt <= 0) return;

    this.terrainClimbing=false;
    this.climbCooldown=Math.max(0,this.climbCooldown-dt);
    // Jump edge detection happens once per frame; the buffer carries it across sub-steps.
    if (input.jump && !this.prevJump) this.jumpBufferT = T.jumpBuffer;
    this.prevJump = input.jump;

    const steps = Math.max(1, Math.ceil(dt / T.maxStep - 1e-6));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, input, cameraYaw, world);
  }

  private step(dt: number, input: MoveInput, cameraYaw: number, world: World): void {
    const T = this.tuning;
    const pos = this.position;
    const vel = this.velocity;

    if(this.activeClimb){
      const ladder=this.activeClimb;
      if(input.jump || this.stamina<=0){
        this.activeClimb=null;this.climbCooldown=.6;this.grounded=false;
        pos.x-=Math.sin(ladder.yaw)*.8;pos.z-=Math.cos(ladder.yaw)*.8;vel.y=input.jump?4:0;this.jumpBufferT=0;return;
      }
      const speed=input.climb?(input.forward<-.1?-1.5:1.5):0;
      this.stamina=Math.max(0,this.stamina-Math.abs(speed)*.055*dt);
      pos.x=ladder.bottom.x;pos.z=ladder.bottom.z;pos.y+=speed*dt;this.yaw=ladder.yaw;
      vel.set(0,speed,0);this.grounded=false;this.sprinting=false;
      if(pos.y>=ladder.top.y){pos.set(ladder.landing.x,ladder.landing.y,ladder.landing.z);vel.set(0,0,0);this.activeClimb=null;this.grounded=true;this.climbCooldown=.5;}
      else if(pos.y<ladder.bottom.y){pos.y=ladder.bottom.y;pos.x-=Math.sin(ladder.yaw)*.65;pos.z-=Math.cos(ladder.yaw)*.65;vel.set(0,0,0);this.activeClimb=null;this.grounded=true;this.climbCooldown=.5;}
      return;
    }
    if(input.climb && this.climbCooldown===0 && !this.exhausted){
      const ladder=this.nearClimb(world);
      if(ladder){this.activeClimb=ladder;pos.set(ladder.bottom.x,Math.max(pos.y,ladder.bottom.y),ladder.bottom.z);vel.set(0,0,0);this.yaw=ladder.yaw;this.grounded=false;return;}
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

    const slope=this.gradient(world,pos.x,pos.z);const steepness=Math.hypot(slope.x,slope.z);
    if(input.climb && hasInput && this.grounded && !this.exhausted && steepness>Math.tan(T.maxSlope) && steepness<5.7 && (slope.x*dirX+slope.z*dirZ)>0.35 && this.stamina>0){
      const horizontal=1.45/Math.sqrt(1+steepness*steepness);
      const x=pos.x+dirX*horizontal*dt,z=pos.z+dirZ*horizontal*dt,h=world.heightAt(x,z);
      const resolved=resolveCircle(x,z,T.radius,world.colliders,pos.y);
      if(Math.hypot(resolved.x-x,resolved.z-z)<.001 && h>=world.waterLevel-T.maxWaterDepth && Math.abs(x)<world.halfSize-T.radius && Math.abs(z)<world.halfSize-T.radius){
        const oldY=pos.y;pos.set(x,h,z);vel.set(dirX*horizontal,(h-oldY)/dt,dirZ*horizontal);this.yaw=Math.atan2(dirX,dirZ);this.terrainClimbing=true;this.sprinting=false;this.stamina=Math.max(0,this.stamina-.1*dt);return;
      }
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

    // Slide down slopes that are too steep to stand on.
    if (this.grounded && this.onSteep) {
      const g = this.gradient(world, pos.x, pos.z);
      const gl = Math.hypot(g.x, g.z) || 1;
      vel.x -= (g.x / gl) * T.slideAccel * dt;
      vel.z -= (g.z / gl) * T.slideAccel * dt;
    }

    // ---- Facing: damped spring towards the move direction, rate-limited -----------------------
    let faceTarget: number | null = null;
    if (speed > 0.4) faceTarget = Math.atan2(vel.x, vel.z);
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
    const canJump = this.landingRecoveryT === 0 && !this.jumpedSinceGrounded && this.timeSinceGrounded <= T.coyoteTime && !this.onSteep;
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
      this.onSteep = Math.hypot(g.x, g.z) > Math.tan(T.maxSlope);
    } else {
      this.timeSinceGrounded += dt;
      this.airTime += dt;
      this.onSteep = false;
    }
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
  get climbing():boolean {return !!this.activeClimb || this.terrainClimbing;}
  get anim(): MoveAnim {
    if(this.climbing)return 'climb';
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
      speed: this.climbing?Math.abs(this.velocity.y):this.horizontalSpeed,
      anim: this.anim,
      // Animation hint (avatars play the out-of-breath pose); optional for receivers.
      tired: this.exhausted,
    };
    return s;
  }
}
