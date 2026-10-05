import * as THREE from 'three';
import { CH, Jiggle } from './core';
import type { JiggleSpec } from './parts';

/**
 * Runtime for a creature's spring-driven parts (ears, tails, antennae, scarves, sapling
 * branches): each spec gets a `Jiggle` and its animated rest target comes from pose channels:
 *
 * - ears: EARS lays them back (> 0) or perks them (< 0); EAR_FLICK kicks one ear;
 * - tails: TAIL_UP raises, WAG wags (as a travelling wave), plus a slow idle sway;
 * - antennae: CURIOUS perks them forward, with a slow idle bob;
 * - misc / wing: physics only.
 */

const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0, -1);
const TAU = Math.PI * 2;

interface JigRt {
  j: Jiggle;
  s: JiggleSpec;
  /** Axis that lays an ear back / raises a tail (parent frame). */
  axisA: THREE.Vector3;
  /** Axis that splays an ear outward. */
  axisB: THREE.Vector3;
}

export class JiggleSet {
  private readonly list: JigRt[];
  private flickPrev = 0;

  constructor(specs: JiggleSpec[]) {
    this.list = specs.map((s) => {
      const j = new Jiggle(s.bone, s.tip, s.opts);
      const dir = s.tip.clone().applyQuaternion(s.bone.quaternion).normalize();
      const axisA = new THREE.Vector3().crossVectors(dir, s.role === 'tail' ? UP : BACK);
      if (axisA.lengthSq() < 1e-6) axisA.set(1, 0, 0);
      axisA.normalize();
      const axisB = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(s.side || 1, 0, 0));
      if (axisB.lengthSq() > 1e-6) axisB.normalize();
      return { j, s, axisA, axisB };
    });
  }

  reset(): void {
    for (const r of this.list) r.j.reset();
  }

  /** Step every spring. World matrices of the parents must be current. */
  update(p: Float32Array, dt: number, t: number, idleW: number): void {
    const limp = p[CH.LIMP];
    const flick = p[CH.EAR_FLICK];
    const flickEdge = Math.abs(flick) > 0.5 && Math.abs(this.flickPrev) <= 0.5 ? Math.sign(flick) : 0;
    this.flickPrev = flick;
    const ears = p[CH.EARS] + limp * 0.4;
    const wag = p[CH.WAG];
    const cur = p[CH.CURIOUS];
    const idleSway = 0.14 * idleW * (1 - limp);
    for (const jr of this.list) {
      const { j, s } = jr;
      j.target.set(0, 0, 0);
      if (s.role === 'ear') {
        j.target.addScaledVector(jr.axisA, ears * 0.75);
        j.target.addScaledVector(jr.axisB, Math.max(0, ears) * 0.3);
        if (flickEdge !== 0 && Math.sign(s.side) === flickEdge) j.kick(jr.axisA.x * 16, jr.axisA.y * 16, jr.axisA.z * 16);
      } else if (s.role === 'tail') {
        const d = s.delay ?? 0;
        const up = (p[CH.TAIL_UP] - limp * 0.6) * (s.up ?? 0.3);
        j.target.addScaledVector(jr.axisA, up);
        const w = (s.wag ?? 0.5) * (wag * Math.sin(t * TAU * 3.4 - d) + idleSway * Math.sin(t * TAU * 0.33 - d * 0.35));
        j.target.y += w;
      } else if (s.role === 'antenna') {
        const d = s.delay ?? 0;
        j.target.addScaledVector(jr.axisA, -0.35 * cur + 0.5 * limp + 0.06 * Math.sin(t * 1.9 + d) * (1 - limp));
        j.target.addScaledVector(jr.axisB, 0.05 * Math.sin(t * 1.3 + d * 2));
      }
      j.update(dt);
    }
  }
}
