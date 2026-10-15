import * as THREE from 'three';
import { RIDING, stepMountStamina, type MountStats } from '../../shared/riding';
import { resolveCircle } from '../core/collision';
import type { World } from '../world/types';
import type { MoveInput } from './types';

/** Mount handling. Speeds in m/s, accelerations in m/s², turn rates in rad/s. */
export const RIDE_TUNING = {
  /** Acceleration and braking at handling 0.5 and at 1.2 (a heavy mount takes a while to get going). */
  accel: [5, 13] as const,
  brake: [7, 16] as const,
  /** Turning at a standstill, and how much of it is left at full gallop. */
  turnRate: [1.7, 3.6] as const,
  turnAtSpeed: 0.45,
  /** A land mount can ford water this deep, and climb slopes up to this steep. */
  fordDepth: 0.9,
  maxSlope: (40 * Math.PI) / 180,
  /** Jumping (land mounts) and falling. */
  jumpSpeed: 7.4,
  gravity: -25,
  groundSnap: 0.7,
  /** A water mount needs at least this much water under it. */
  swimDepth: 0.5,
  maxStep: 1 / 60,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Riding physics (DESIGN §8.2). The mount goes where it faces, so steering turns its whole body at
 * a rate set by its handling; it trots by default and gallops while sprint is held, spending its
 * stamina. Land mounts follow the ground, ford shallow water and jump; water mounts keep to water
 * deep enough to swim and sit at the surface. Position and yaw are the mount's feet and facing.
 */
export class RideController {
  readonly position = new THREE.Vector3();
  /** Facing yaw; 0 faces +Z. */
  yaw = 0;
  speed = 0;
  vy = 0;
  grounded = true;
  galloping = false;
  /** Stamina as a share of the full bar, how long it's been resting, and whether it's blown. */
  readonly stamina = { value: 1, rest: 0, blown: false };
  private prevJump = false;

  constructor(
    readonly stats: MountStats,
    /** Top speed for this Pokémon (over the level cap it drags its feet). */
    readonly topSpeed: number,
    readonly radius: number,
    /** Water mounts: how far below the surface the feet sit. */
    readonly draft: number,
  ) {}

  get swimming(): boolean {
    return this.stats.mode === 'water';
  }

  place(x: number, z: number, yaw: number, world: World): void {
    this.position.set(x, this.swimming ? world.waterLevel - this.draft : this.groundAt(world, x, z, Infinity), z);
    this.yaw = yaw;
    this.speed = this.vy = 0;
    this.grounded = true;
  }

  update(dtIn: number, input: MoveInput, cameraYaw: number, world: World): void {
    const dt = clamp(dtIn, 0, 0.1);
    if (dt <= 0) return;
    const jumpPressed = input.jump && !this.prevJump;
    this.prevJump = input.jump;
    const steps = Math.max(1, Math.ceil(dt / RIDE_TUNING.maxStep - 1e-6));
    for (let i = 0; i < steps; i++) this.step(dt / steps, input, cameraYaw, world, jumpPressed && i === 0);
  }

  private step(dt: number, input: MoveInput, cameraYaw: number, world: World, jump: boolean): void {
    const T = RIDE_TUNING, S = this.stats, h = S.handling;
    const k = clamp((h - 0.5) / 0.7, 0, 1);
    // Camera-relative wish, as on foot.
    const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
    let wx = fx * clamp(input.forward, -1, 1) - fz * clamp(input.right, -1, 1);
    let wz = fz * clamp(input.forward, -1, 1) + fx * clamp(input.right, -1, 1);
    const mag = Math.min(1, Math.hypot(wx, wz));
    const has = mag > 0.05;
    if (has) { const l = Math.hypot(wx, wz); wx /= l; wz /= l; }

    // Turn the body towards the wish; the faster it goes the wider it turns.
    const top = this.topSpeed;
    if (has) {
      const diff = wrapAngle(Math.atan2(wx, wz) - this.yaw);
      const rate = (T.turnRate[0] + (T.turnRate[1] - T.turnRate[0]) * k) * (1 - T.turnAtSpeed * clamp(this.speed / top, 0, 1));
      this.yaw = wrapAngle(this.yaw + clamp(diff, -rate * dt, rate * dt));
    }
    // Speed along the facing: ease off while it's still turning round towards the wish.
    const facing = has ? Math.max(0, Math.cos(wrapAngle(Math.atan2(wx, wz) - this.yaw))) : 0;
    this.galloping = has && input.sprint && !this.stamina.blown && mag > 0.5 && this.grounded;
    stepMountStamina(this.stamina, this.galloping, dt, S);
    const want = has ? top * (this.galloping ? 1 : RIDING.trot) * mag * facing : 0;
    const accel = T.accel[0] + (T.accel[1] - T.accel[0]) * k, brake = T.brake[0] + (T.brake[1] - T.brake[0]) * k;
    if (this.speed < want) this.speed = Math.min(want, this.speed + accel * (1 - 0.5 * this.speed / top) * dt);
    else this.speed = Math.max(want, this.speed - (has ? brake * 0.6 : brake) * dt);

    // Vertical: land mounts jump and fall.
    const pos = this.position;
    if (!this.swimming) {
      if (jump && this.grounded) { this.vy = T.jumpSpeed; this.grounded = false; }
      if (!this.grounded) this.vy = Math.max(-40, this.vy + T.gravity * dt);
    }

    const ox = pos.x, oz = pos.z;
    let nx = ox + Math.sin(this.yaw) * this.speed * dt;
    let nz = oz + Math.cos(this.yaw) * this.speed * dt;
    if (!this.canEnter(world, ox, oz, nx, nz)) {
      if (this.canEnter(world, ox, oz, nx, oz)) nz = oz;
      else if (this.canEnter(world, ox, oz, ox, nz)) nx = ox;
      else { nx = ox; nz = oz; }
      this.speed *= 0.6;
    }
    const y = this.swimming ? world.waterLevel - this.draft : pos.y + this.vy * dt;
    const r = resolveCircle(nx, nz, this.radius, world.colliders, y);
    if (this.canEnter(world, ox, oz, r.x, r.z)) { nx = r.x; nz = r.z; } else { nx = ox; nz = oz; }
    if (Math.hypot(r.x - nx, r.z - nz) > 1e-4) this.speed *= 0.9;
    const b = world.bounds;
    if (b) { nx = clamp(nx, b.minX + this.radius, b.maxX - this.radius); nz = clamp(nz, b.minZ + this.radius, b.maxZ - this.radius); }
    pos.x = nx; pos.z = nz;

    if (this.swimming) { pos.y = y; return; }
    const gy = this.groundAt(world, nx, nz, y);
    if (this.grounded) {
      if (y - gy > T.groundSnap) { this.grounded = false; this.vy = 0; pos.y = y; } else pos.y = gy;
    } else if (y <= gy) { pos.y = gy; this.vy = 0; this.grounded = true; }
    else pos.y = y;
  }

  /** Whether the mount can move from (ox, oz) to (nx, nz): water depth and steepness. */
  private canEnter(world: World, ox: number, oz: number, nx: number, nz: number): boolean {
    if (nx === ox && nz === oz) return true;
    const T = RIDE_TUNING;
    const g1 = world.heightAt(nx, nz);
    if (this.swimming) return g1 < world.waterLevel - T.swimDepth || g1 < world.heightAt(ox, oz);
    const g0 = this.groundAt(world, ox, oz, this.position.y), h1 = this.groundAt(world, nx, nz, this.position.y);
    if (h1 < world.waterLevel - T.fordDepth && h1 < g0) return false;
    const rise = h1 - g0, d = Math.hypot(nx - ox, nz - oz);
    return !this.grounded || rise <= d * Math.tan(T.maxSlope) + 0.05;
  }

  private groundAt(world: World, x: number, z: number, y: number): number {
    return world.surfaceHeightAt?.(x, z, y) ?? world.heightAt(x, z);
  }
}
