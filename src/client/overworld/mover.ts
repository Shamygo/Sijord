import * as THREE from 'three';
import { resolveCircle } from '../core/collision';
import type { World } from '../world/types';

function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Ground movement for creatures in the overworld: eased acceleration, turning that respects a
 * turn rate, collision with the world's colliders and no wandering into deep water. Speed is
 * exposed so models can drive their gait from it.
 */
export class Mover {
  readonly pos = new THREE.Vector3();
  yaw = 0;
  speed = 0;
  private vx = 0;
  private vz = 0;

  constructor(
    private radius: number,
    /** Acceleration in m/s². */
    private accel = 14,
    /** Turn rate in rad/s. */
    private turnRate = 7,
  ) {}

  place(x: number, z: number, world: World, yaw = this.yaw): void {
    this.pos.set(x, world.heightAt(x, z), z);
    this.yaw = yaw;
    this.vx = this.vz = this.speed = 0;
  }

  /**
   * Move towards (tx, tz), arriving smoothly. `stopAt` is how close counts as there. Returns
   * the remaining distance.
   */
  steer(dt: number, tx: number, tz: number, maxSpeed: number, world: World, stopAt = 0.15): number {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // Slow down over the last couple of metres so it doesn't overshoot.
    const want = dist > stopAt ? Math.min(maxSpeed, (dist - stopAt) * 2.2) : 0;
    const wx = dist > 1e-4 ? (dx / dist) * want : 0;
    const wz = dist > 1e-4 ? (dz / dist) * want : 0;
    this.integrate(dt, wx, wz, world);
    return dist;
  }

  /** Brake to a stop in place. */
  idle(dt: number, world: World): void {
    this.integrate(dt, 0, 0, world);
  }

  /** Turn on the spot to face a yaw. */
  face(dt: number, yaw: number): void {
    const d = wrapAngle(yaw - this.yaw);
    const step = Math.min(Math.abs(d), this.turnRate * 0.6 * dt);
    this.yaw = wrapAngle(this.yaw + Math.sign(d) * step);
  }

  private integrate(dt: number, wx: number, wz: number, world: World): void {
    const ax = wx - this.vx;
    const az = wz - this.vz;
    const a = Math.hypot(ax, az);
    const maxDv = this.accel * dt;
    if (a > maxDv) {
      this.vx += (ax / a) * maxDv;
      this.vz += (az / a) * maxDv;
    } else {
      this.vx = wx;
      this.vz = wz;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.05) {
      const heading = Math.atan2(this.vx, this.vz);
      const d = wrapAngle(heading - this.yaw);
      const step = Math.min(Math.abs(d), this.turnRate * dt);
      this.yaw = wrapAngle(this.yaw + Math.sign(d) * step);
    }
    let nx = this.pos.x + this.vx * dt;
    let nz = this.pos.z + this.vz * dt;
    const r = resolveCircle(nx, nz, this.radius, world.colliders);
    nx = r.x;
    nz = r.z;
    // Creatures on land stay out of deep water.
    if (world.heightAt(nx, nz) < world.waterLevel - 0.2) {
      nx = this.pos.x;
      nz = this.pos.z;
      this.vx *= -0.3;
      this.vz *= -0.3;
    }
    this.pos.set(nx, world.heightAt(nx, nz), nz);
  }
}
