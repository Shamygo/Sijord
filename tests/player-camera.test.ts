import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThirdPersonCamera, springFollow } from '../src/client/player/camera';
import type { World } from '../src/client/world/types';

function flatWorld(): World {
  return {
    root: new THREE.Object3D(),
    heightAt: () => 0,
    waterLevel: -50,
    colliders: [],
    regions: [],
    anchors: {
      playerSpawns: [new THREE.Vector3(), new THREE.Vector3()],
      playerSpawnYaw: [0, 0],
      professor: new THREE.Vector3(),
      professorYaw: 0,
      landmarks: [],
    },
    halfSize: 500,
    sun: new THREE.DirectionalLight(),
    update: () => {},
    groundColorAt: () => new THREE.Color(),
  } as World;
}

describe('springFollow', () => {
  it('trails a constant-velocity target by 2v/w regardless of the time step', () => {
    const w = 9;
    const v = 6;
    for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
      let x = 0;
      let xv = 0;
      let t = 0;
      while (t < 3) {
        [x, xv] = springFollow(x, xv, v * t, v * (t + dt), w, dt);
        t += dt;
      }
      expect(v * t - x).toBeCloseTo((2 * v) / w, 6);
      expect(xv).toBeCloseTo(v, 6);
    }
  });

  it('is exact: one long step equals two half steps along the same linear motion', () => {
    const w = 7;
    const [x1, v1] = springFollow(0.3, -1, 1, 2, w, 0.05);
    const [xa, va] = springFollow(0.3, -1, 1, 1.5, w, 0.025);
    const [x2, v2] = springFollow(xa, va, 1.5, 2, w, 0.025);
    expect(x2).toBeCloseTo(x1, 12);
    expect(v2).toBeCloseTo(v1, 12);
    // dt = 0 is a no-op.
    expect(springFollow(0.3, -1, 1, 2, w, 0)).toEqual([0.3, -1]);
  });
});

describe('ThirdPersonCamera', () => {
  /** Run the player along +Z at `speed`, return the camera offset from the player at the end. */
  function follow(dts: () => number, seconds: number, speed = 6): { offset: THREE.Vector3; spread: number } {
    const world = flatWorld();
    const cam = new ThirdPersonCamera(16 / 9);
    const target = new THREE.Vector3();
    cam.snapBehind(target, 0);
    let t = 0;
    let lo = Infinity;
    let hi = -Infinity;
    while (t < seconds) {
      const dt = Math.min(dts(), seconds - t);
      t += dt;
      target.set(0, 0, speed * t);
      cam.update(dt, target, world, false);
      if (t > seconds - 1) {
        const dz = cam.camera.position.z - target.z;
        lo = Math.min(lo, dz);
        hi = Math.max(hi, dz);
      }
    }
    return { offset: cam.camera.position.clone().sub(target), spread: hi - lo };
  }

  it('follows identically at 30, 60 and 144 fps', () => {
    const a = follow(() => 1 / 30, 4);
    const b = follow(() => 1 / 60, 4);
    const c = follow(() => 1 / 144, 4);
    expect(a.offset.distanceTo(b.offset)).toBeLessThan(0.01);
    expect(c.offset.distanceTo(b.offset)).toBeLessThan(0.01);
    // The camera is behind the player (yaw 0 looks along +Z).
    expect(b.offset.z).toBeLessThan(-3);
  });

  it('does not jitter with uneven frame times at constant speed', () => {
    let seed = 3;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    // Frame times between 4 ms and 45 ms, randomly mixed.
    const jittery = follow(() => 0.004 + rnd() * 0.041, 5);
    const steady = follow(() => 1 / 60, 5);
    expect(jittery.spread).toBeLessThan(0.002);
    expect(jittery.offset.distanceTo(steady.offset)).toBeLessThan(0.01);
  });

  it('applies the sensitivity multiplier and inverted Y', () => {
    const world = flatWorld();
    const settle = (cam: ThirdPersonCamera): void => {
      for (let i = 0; i < 120; i++) cam.update(1 / 60, new THREE.Vector3(), world, false);
    };
    const base = new ThirdPersonCamera();
    base.snapBehind(new THREE.Vector3(), 0);
    base.onMouseDelta(100, 40);
    settle(base);

    const fast = new ThirdPersonCamera();
    fast.snapBehind(new THREE.Vector3(), 0);
    fast.setSensitivity(2);
    fast.onMouseDelta(100, 0);
    settle(fast);
    expect(fast.yaw).toBeCloseTo(base.yaw * 2, 4);

    const inv = new ThirdPersonCamera();
    inv.snapBehind(new THREE.Vector3(), 0);
    const p0 = inv.pitch;
    inv.setInvertY(true);
    inv.onMouseDelta(0, 40);
    settle(inv);
    expect(base.pitch).toBeGreaterThan(p0);
    expect(inv.pitch).toBeLessThan(p0);
    expect(inv.pitch - p0).toBeCloseTo(-(base.pitch - p0), 4);

    // Out-of-range values are clamped rather than breaking the camera.
    inv.setSensitivity(Number.NaN);
    inv.onMouseDelta(10, 0);
    settle(inv);
    expect(Number.isFinite(inv.yaw)).toBe(true);
  });

  it('sets the base field of view, still widening while sprinting', () => {
    const world = flatWorld();
    const cam = new ThirdPersonCamera();
    cam.setFov(80);
    expect(cam.camera.fov).toBe(80);
    const target = new THREE.Vector3();
    cam.snapBehind(target, 0);
    for (let i = 0; i < 300; i++) cam.update(1 / 60, target, world, true);
    expect(cam.camera.fov).toBeGreaterThan(85);
    for (let i = 0; i < 300; i++) cam.update(1 / 60, target, world, false);
    expect(cam.camera.fov).toBeCloseTo(80, 1);
    cam.setFov(500);
    expect(cam.camera.fov).toBe(120);
    cam.setFov(1);
    expect(cam.camera.fov).toBe(30);
  });
});
