import * as THREE from 'three';
import { collidersNear } from '../core/collision';
import type { Collider, World } from '../world/types';

/** Camera tunables. Angles in radians, distances in metres, rates in 1/s. */
export const CAMERA_TUNING = {
  fov: 60,
  sprintFov: 67,
  fovRate: 3,
  /** Radians per pixel of mouse movement. */
  sensitivity: 0.0028,
  /** Pitch: positive looks down on the player from above. */
  minPitch: (-35 * Math.PI) / 180,
  maxPitch: (60 * Math.PI) / 180,
  defaultPitch: (14 * Math.PI) / 180,
  minDistance: 2.5,
  maxDistance: 9,
  defaultDistance: 5.5,
  /** Metres of zoom per wheel "notch" (deltaY ≈ 100). */
  zoomStep: 0.6,
  zoomRate: 8,
  /** Orbit pivot height above the player's feet. */
  pivotHeight: 1.5,
  /** Over-the-shoulder offset to the camera's right. */
  shoulderOffset: 0.45,
  /** Follow springs (critically damped angular frequency): horizontal and vertical. */
  followFreq: 9,
  followFreqY: 5.5,
  /** 0..1: fraction of the steady follow lag removed by leading the target by its velocity.
   *  The lead builds up with smoothed velocity, so the camera trails on acceleration and then
   *  catches up. */
  followLead: 0.7,
  /** Hard cap on how far the pivot may trail the player horizontally. */
  maxLag: 1.2,
  /** Smoothing of mouse look so it glides rather than jitters. */
  lookRate: 28,
  /** Clearance kept above the terrain. */
  groundClearance: 0.4,
  /** Samples along the pivot→camera ray for line-of-sight checks. */
  losSamples: 10,
  /** Speed the boom extends back out after terrain pulled it in (m/s-ish rate). */
  boomReturnRate: 3,
  /** Auto-recentre behind the movement direction after this long without mouse input. */
  recentreDelay: 2.5,
  recentreRate: 1.1,
  recentreMinSpeed: 1.5,
  /** Aiming a throw: pull in over the shoulder and narrow the view a touch. */
  aimDistance: 3.1,
  aimShoulder: 0.85,
  aimFovDrop: 7,
  aimRate: 9,
};

export type CameraTuning = typeof CAMERA_TUNING;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Critically damped spring on one axis, integrated exactly over dt while the target moves
 * linearly from `from` to `to`. Treating the target as moving (rather than jumping to its new
 * position at the start of the frame) makes the follow lag independent of the frame time, so
 * uneven frame pacing (30 / 60 / 144 fps, dropped frames) can't make the view jitter.
 */
export function springFollow(x: number, v: number, from: number, to: number, freq: number, dt: number): [number, number] {
  const w = freq;
  if (dt <= 0) return [x, v];
  const tv = (to - from) / dt;
  // Steady state for a target moving at tv lags it by 2·tv/w; solve for the deviation from that.
  const lag = (2 * tv) / w;
  const y0 = x - (from - lag);
  const yv0 = v - tv;
  const e = Math.exp(-w * dt);
  const c = yv0 + w * y0;
  const y = (y0 + c * dt) * e;
  const yv = (yv0 - w * c * dt) * e;
  return [to - lag + y, tv + yv];
}

/**
 * Orbiting third-person camera with an over-the-shoulder offset, weighted follow, terrain
 * avoidance and gentle auto-recentring. `yaw` follows the controller's convention: at yaw 0 the
 * camera looks along +Z.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly tuning: CameraTuning;

  /** Current (smoothed) view yaw; feed this to the controller. */
  yaw = 0;
  /** Current (smoothed) pitch; positive looks down. */
  pitch: number;

  private targetYaw = 0;
  private targetPitch: number;
  private targetDistance: number;
  private distance: number;
  /** Boom length after terrain avoidance (smoothed). */
  private boom: number;
  private readonly pivot = new THREE.Vector3();
  private readonly pivotVel = new THREE.Vector3();
  /** Follow target of the previous frame (the spring integrates towards it linearly). */
  private readonly followPrev = new THREE.Vector3();
  private sensitivityMult = 1;
  private invertY = false;
  private baseFov: number;
  private sprintFovBoost: number;
  private readonly lastTarget = new THREE.Vector3();
  private readonly moveVel = new THREE.Vector3();
  private moveVelY = 0;
  private hasTarget = false;
  private idleMouse = 0;
  /** 0 normal follow, 1 fully in the aiming view. */
  private aimBlend = 0;
  private aimTarget = 0;

  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();

  constructor(aspect = 16 / 9, tuning: Partial<CameraTuning> = {}) {
    this.tuning = { ...CAMERA_TUNING, ...tuning };
    this.camera = new THREE.PerspectiveCamera(this.tuning.fov, aspect, 0.1, 3200);
    this.baseFov = this.tuning.fov;
    this.sprintFovBoost = this.tuning.sprintFov - this.tuning.fov;
    this.pitch = this.targetPitch = this.tuning.defaultPitch;
    this.distance = this.targetDistance = this.boom = this.tuning.defaultDistance;
  }

  /** Mouse-look sensitivity multiplier (1 = default). */
  setSensitivity(mult: number): void {
    this.sensitivityMult = clamp(Number.isFinite(mult) ? mult : 1, 0.05, 10);
  }

  /** Invert vertical mouse look. */
  setInvertY(v: boolean): void {
    this.invertY = !!v;
  }

  /** Base field of view in degrees (sprinting widens it by the same amount as before). */
  setFov(deg: number): void {
    if (!Number.isFinite(deg)) return;
    this.baseFov = clamp(deg, 30, 120);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  onMouseDelta(dx: number, dy: number): void {
    if (!dx && !dy) return;
    const s = this.tuning.sensitivity * this.sensitivityMult;
    // Mouse right turns the view right; right of a +Z-facing view is -X, i.e. decreasing yaw.
    this.targetYaw -= dx * s;
    const sy = this.invertY ? -1 : 1;
    this.targetPitch = clamp(this.targetPitch + dy * s * sy, this.tuning.minPitch, this.tuning.maxPitch);
    this.idleMouse = 0;
  }

  onWheel(deltaY: number): void {
    if (!deltaY) return;
    const T = this.tuning;
    // Normalise pixel / line deltas: ~100 per notch.
    const notches = clamp(deltaY / 100, -3, 3);
    this.targetDistance = clamp(this.targetDistance + notches * T.zoomStep, T.minDistance, T.maxDistance);
  }

  /** Point the view straight away (scripted tests and cut-ins). */
  setLook(yaw: number, pitch: number): void {
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = clamp(pitch, this.tuning.minPitch, this.tuning.maxPitch);
  }

  /** Over-the-shoulder aiming view for throws (eased in and out). */
  setAim(on: boolean): void {
    this.aimTarget = on ? 1 : 0;
  }

  /** Jump the camera behind a facing yaw immediately (spawns, teleports). */
  snapBehind(target: THREE.Vector3, facingYaw: number): void {
    this.yaw = this.targetYaw = facingYaw;
    this.pitch = this.targetPitch = this.tuning.defaultPitch;
    this.pivot.set(target.x, target.y + this.tuning.pivotHeight, target.z);
    this.pivotVel.set(0, 0, 0);
    this.followPrev.copy(this.pivot);
    this.lastTarget.copy(target);
    this.moveVel.set(0, 0, 0);
    this.hasTarget = true;
    this.boom = this.distance;
    this.idleMouse = 0;
    this.place(null);
  }

  update(dtIn: number, target: THREE.Vector3, world: World, sprinting: boolean): void {
    const T = this.tuning;
    const dt = clamp(dtIn, 0, 0.1);
    if (!this.hasTarget) {
      this.snapBehind(target, this.yaw);
    }
    if (dt <= 0) return;

    // Target velocity (for recentring), smoothed.
    this.tmpP.copy(target).sub(this.lastTarget).divideScalar(dt);
    if (this.tmpP.lengthSq() > 30 * 30) {
      // Teleport: snap the follow rather than swooping across the map.
      this.pivot.set(target.x, target.y + T.pivotHeight, target.z);
      this.pivotVel.set(0, 0, 0);
      this.followPrev.copy(this.pivot);
      this.tmpP.set(0, 0, 0);
      this.moveVel.set(0, 0, 0);
    }
    this.moveVel.x = damp(this.moveVel.x, this.tmpP.x, 6, dt);
    this.moveVel.z = damp(this.moveVel.z, this.tmpP.z, 6, dt);
    this.moveVelY = this.tmpP.y;
    this.lastTarget.copy(target);

    // Gentle auto-recentre behind the direction of travel.
    this.idleMouse += dt;
    const moveSpeed = Math.hypot(this.moveVel.x, this.moveVel.z);
    if (this.idleMouse > T.recentreDelay && moveSpeed > T.recentreMinSpeed) {
      const heading = Math.atan2(this.moveVel.x, this.moveVel.z);
      const diff = wrapAngle(heading - this.targetYaw);
      // Don't swing round when running towards the camera.
      if (Math.abs(diff) < Math.PI * 0.7) {
        const ramp = clamp((this.idleMouse - T.recentreDelay) / 1.5, 0, 1);
        const strength = ramp * clamp(moveSpeed / 6, 0.3, 1);
        this.targetYaw += diff * (1 - Math.exp(-T.recentreRate * strength * dt));
        this.targetPitch = damp(this.targetPitch, T.defaultPitch, 0.6 * strength, dt);
      }
    }

    // Smooth look.
    const yawDiff = wrapAngle(this.targetYaw - this.yaw);
    this.yaw = wrapAngle(this.yaw + yawDiff * (1 - Math.exp(-T.lookRate * dt)));
    this.targetYaw = this.yaw + wrapAngle(this.targetYaw - this.yaw);
    this.pitch = damp(this.pitch, this.targetPitch, T.lookRate, dt);
    this.distance = damp(this.distance, this.targetDistance, T.zoomRate, dt);
    this.aimBlend = damp(this.aimBlend, this.aimTarget, T.aimRate, dt);
    if (Math.abs(this.aimBlend - this.aimTarget) < 1e-3) this.aimBlend = this.aimTarget;

    // Weighted follow of the pivot: lags behind fast movement, then settles.
    const lead = (2 / T.followFreq) * T.followLead;
    const tx = target.x + this.moveVel.x * lead;
    const ty = target.y + T.pivotHeight;
    const tz = target.z + this.moveVel.z * lead;
    const fp = this.followPrev;
    [this.pivot.x, this.pivotVel.x] = springFollow(this.pivot.x, this.pivotVel.x, fp.x, tx, T.followFreq, dt);
    [this.pivot.z, this.pivotVel.z] = springFollow(this.pivot.z, this.pivotVel.z, fp.z, tz, T.followFreq, dt);
    [this.pivot.y, this.pivotVel.y] = springFollow(this.pivot.y, this.pivotVel.y, fp.y, ty, T.followFreqY, dt);
    fp.set(tx, ty, tz);
    // Never let the lag grow unbounded (very fast motion / long frames).
    const maxLag = T.maxLag;
    this.tmpP.set(this.pivot.x - target.x, 0, this.pivot.z - target.z);
    const lag = this.tmpP.length();
    if (lag > maxLag) {
      this.pivot.x = target.x + (this.tmpP.x / lag) * maxLag;
      this.pivot.z = target.z + (this.tmpP.z / lag) * maxLag;
    }
    if (Math.abs(this.pivot.y - ty) > 1.5) {
      // Long falls: ride along at the limit instead of fighting the spring.
      this.pivot.y = ty + Math.sign(this.pivot.y - ty) * 1.5;
      this.pivotVel.y = this.moveVelY;
    }

    // FOV widens a touch while sprinting.
    const fovTarget = this.baseFov + (sprinting ? this.sprintFovBoost : 0) - this.aimBlend * T.aimFovDrop;
    const fov = damp(this.camera.fov, fovTarget, this.aimTarget || this.aimBlend ? T.aimRate : T.fovRate, dt);
    if (Math.abs(fov - this.camera.fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.place(world, dt);
  }

  /** Position the camera from pivot/yaw/pitch/distance, with terrain avoidance when a world is given. */
  private place(world: World | null, dt = 0): void {
    const T = this.tuning;
    const cp = Math.cos(this.pitch);
    const fwd = this.tmpFwd.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = this.tmpRight.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    // Boom origin: pivot shifted over the shoulder (further while aiming).
    const aim = this.aimBlend;
    const origin = this.tmpLook.copy(this.pivot).addScaledVector(right, T.shoulderOffset + (T.aimShoulder - T.shoulderOffset) * aim);
    const distance = aim > 0 ? this.distance + (Math.min(T.aimDistance, this.distance) - this.distance) * aim : this.distance;

    let want = distance;
    if (world) {
      // Pull in if terrain or a building blocks the line of sight from the pivot to the camera.
      const n = T.losSamples;
      const walls = collidersNear(origin.x, origin.z, distance + 1, world.colliders);
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const d = distance * t;
        const px = origin.x - fwd.x * d;
        const py = origin.y - fwd.y * d;
        const pz = origin.z - fwd.z * d;
        const ground = world.heightAt(px, pz);
        if (py < ground + T.groundClearance || insideWall(px, py - ground, pz, walls)) {
          want = Math.max(0.6, d - distance / n);
          break;
        }
      }
      // Snap in immediately, ease back out.
      this.boom = want < this.boom ? want : damp(this.boom, want, T.boomReturnRate, dt);
    } else {
      this.boom = want;
    }

    const pos = this.tmpPos.copy(origin).addScaledVector(fwd, -this.boom);
    if (world) {
      const floor = world.heightAt(pos.x, pos.z) + T.groundClearance;
      if (pos.y < floor) pos.y = floor;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(pos.x + fwd.x, pos.y + fwd.y, pos.z + fwd.z);
  }
}

/** Boxes are buildings and walls; treat them as solid up to roof height so the camera never ends up inside one. */
function insideWall(x: number, heightAboveGround: number, z: number, walls: readonly Collider[]): boolean {
  if (heightAboveGround > 7) return false;
  for (const c of walls) {
    if (c.kind !== 'box') continue;
    if (x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) return true;
  }
  return false;
}
