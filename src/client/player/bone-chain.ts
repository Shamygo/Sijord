import * as THREE from 'three';

const GRAVITY = new THREE.Vector3(0, -9.8, 0);
const STEP = 1 / 60;
/** Steps simulated per frame at most: real time down to 10 fps (frames are capped at 0.1 s). */
const MAX_STEPS = 6;

/**
 * A short chain of bones that no clip moves (Rei's scarf tail), left to hang, swing and trail
 * instead of sticking out stiffly whenever the body leans. Each joint is a verlet point pulled
 * down by gravity and gently back to where the pose would put it, kept at its bone's length
 * from the joint before, and pushed out of a capsule round the spine so it drapes over the back.
 */
export interface BoneChain {
  /** Simulate `dt` seconds and pose the bones. Call after the clips have posed the body. */
  step(dt: number): void;
  /** Where each joint is now and where the pose alone would put it (world space, for probes). */
  readonly joints: { sim: THREE.Vector3[]; pose: THREE.Vector3[] };
}

export interface BoneChainOptions {
  /** Pull back towards the posed joint per 1/60 s step, 0..1, at the knot end (it fades to the tip). */
  stiffness: number;
  /** Velocity kept per 1/60 s step, relative to the body (so moving along doesn't drag it). */
  damping: number;
  /** Velocity lost to the air per 1/60 s step, so it trails a little behind a run. */
  drag: number;
  /**
   * The body it can't pass through: a capsule round the spine from one named bone to another,
   * its radius at each end in metres, and how far behind the spine (along `facing`, the way the
   * character faces) the joints must stay, so a sudden stop can't swing it through the chest.
   */
  body?: { from: string; to: string; radius: [number, number]; facing: THREE.Object3D; behind: number };
}

export function boneChain(scene: THREE.Object3D, names: readonly string[], opts: BoneChainOptions): BoneChain | null {
  const bones = names.map((n) => scene.getObjectByName(n));
  if (bones.length < 2 || bones.some((b) => !b?.parent)) return null;
  const chain = bones as THREE.Object3D[];
  const lo = opts.body ? scene.getObjectByName(opts.body.from) : undefined;
  const hi = opts.body ? scene.getObjectByName(opts.body.to) : undefined;
  const rest = chain.map((b) => b.quaternion.clone());
  // Each bone points at its child; the last one at a tip as far along it as it sits from its parent.
  const last = chain[chain.length - 1];
  const tipLocal = last.position.lengthSq() > 1e-10 ? last.position.clone() : new THREE.Vector3(0, 0.1, 0);
  const childLocal = chain.map((_, i) => (i + 1 < chain.length ? chain[i + 1].position.clone() : tipLocal.clone()));
  const n = chain.length + 1;
  const pose = Array.from({ length: n }, () => new THREE.Vector3());
  const sim = Array.from({ length: n }, () => new THREE.Vector3());
  const prev = Array.from({ length: n }, () => new THREE.Vector3());
  const len = new Array<number>(n - 1).fill(0);
  let live = false, carry = 0;
  const anchor = new THREE.Vector3(), body = new THREE.Vector3();
  const spineLo = new THREE.Vector3(), spine = new THREE.Vector3(), ahead = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Quaternion();

  /** Where the pose puts each joint with the chain at rest. */
  const measure = () => {
    chain.forEach((bone, i) => bone.quaternion.copy(rest[i]));
    chain[0].updateWorldMatrix(true, true);
    chain.forEach((bone, i) => bone.getWorldPosition(pose[i]));
    last.localToWorld(pose[n - 1].copy(tipLocal));
    for (let i = 0; i < n - 1; i++) len[i] = pose[i].distanceTo(pose[i + 1]);
    if (lo && hi && opts.body) {
      lo.getWorldPosition(spineLo);
      spine.subVectors(hi.getWorldPosition(spine), spineLo);
      opts.body.facing.getWorldDirection(ahead).setY(0).normalize();
    }
  };

  const offBody = (v: THREE.Vector3) => {
    const o = opts.body;
    if (!lo || !hi || !o) return;
    const along = d.subVectors(v, spineLo).dot(spine) / Math.max(1e-8, spine.lengthSq());
    const t = THREE.MathUtils.clamp(along, 0, 1);
    const near = c.copy(spineLo).addScaledVector(spine, t);
    // Keep behind the chest (but free to fall past the neck when bent over), then outside the capsule.
    if (along < 1) {
      const front = d.subVectors(v, near).dot(ahead) + o.behind;
      if (front > 0) v.addScaledVector(ahead, -front);
    }
    const r = o.radius[0] + (o.radius[1] - o.radius[0]) * t;
    const off = d.subVectors(v, near), dist = off.length();
    if (dist < r && dist > 1e-6) v.copy(near).addScaledVector(off, r / dist);
  };

  return {
    joints: { sim, pose },
    step(dt) {
      measure();
      // The first frame, or a teleport: start from the pose.
      if (!live || anchor.distanceTo(pose[0]) > 1.5) {
        for (let i = 0; i < n; i++) { sim[i].copy(pose[i]); prev[i].copy(pose[i]); }
        anchor.copy(pose[0]);
        live = true; carry = 0;
      }
      carry += Math.max(0, dt);
      const steps = Math.min(MAX_STEPS, Math.floor(carry / STEP));
      carry = Math.min(carry - steps * STEP, STEP);
      // How far the knot moves each step: the body's own motion, which the damping leaves alone.
      body.subVectors(pose[0], anchor).divideScalar(Math.max(1, steps));
      for (let k = 0; k < steps; k++) {
        sim[0].lerpVectors(anchor, pose[0], (k + 1) / steps);
        for (let i = 1; i < n; i++) {
          const v = a.subVectors(sim[i], prev[i]);
          v.sub(body).multiplyScalar(opts.damping).add(body).multiplyScalar(1 - opts.drag);
          prev[i].copy(sim[i]);
          sim[i].add(v).addScaledVector(GRAVITY, STEP * STEP);
          sim[i].lerp(pose[i], opts.stiffness * (1 - (i - 1) / n));
        }
        for (let i = 1; i < n; i++) {
          offBody(sim[i]);
          const dir = b.subVectors(sim[i], sim[i - 1]), l = dir.length();
          if (l > 1e-6) sim[i].copy(sim[i - 1]).addScaledVector(dir, len[i - 1] / l);
        }
      }
      if (steps) anchor.copy(pose[0]);
      // Turn each bone so its child lands on the simulated joint.
      chain.forEach((bone, i) => {
        const from = a.copy(childLocal[i]).multiply(bone.scale).applyQuaternion(bone.quaternion);
        const to = bone.parent!.worldToLocal(b.copy(sim[i + 1])).sub(bone.position);
        if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
        bone.quaternion.premultiply(q.setFromUnitVectors(from.normalize(), to.normalize()));
        bone.updateWorldMatrix(false, true);
      });
    },
  };
}
