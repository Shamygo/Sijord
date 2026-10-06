import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { boneChain } from '../src/client/player/bone-chain';

const OPTS = { stiffness: 0.008, damping: 0.92, drag: 0.012 };

/** A body with a four-bone tail on its neck, pointing straight out behind (+Z is ahead), or hanging down it. */
function rig(hanging = false) {
  const root = new THREE.Group();
  const spine = new THREE.Object3D(); spine.name = 'spine'; spine.position.set(0, 1, 0);
  const neck = new THREE.Object3D(); neck.name = 'neck'; neck.position.set(0, 0.5, 0);
  root.add(spine); spine.add(neck);
  let parent: THREE.Object3D = neck;
  const names = ['t1', 't2', 't3', 't4'];
  names.forEach((name, i) => {
    const b = new THREE.Object3D(); b.name = name;
    if (i === 0) { b.position.set(0, 0, -0.1); b.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), hanging ? -Math.PI : -Math.PI / 2); }
    else b.position.set(0, 0.125, 0);
    parent.add(b); parent = b;
  });
  root.updateMatrixWorld(true);
  return { root, names, tip: parent };
}

const tipWorld = (tip: THREE.Object3D) => tip.localToWorld(new THREE.Vector3(0, 0.125, 0));

describe('bone chain (scarf tail)', () => {
  it('lets a tail that sticks out stiffly hang down, keeping its length', () => {
    const { root, names, tip } = rig();
    const before = tipWorld(tip);
    expect(before.y).toBeCloseTo(1.5, 3);
    const chain = boneChain(root, names, OPTS)!;
    for (let i = 0; i < 300; i++) chain.step(1 / 60);
    const after = tipWorld(tip);
    expect(after.y).toBeLessThan(1.5 - 0.4);
    // Joints stay a bone's length apart.
    const { sim } = chain.joints;
    for (let i = 1; i < sim.length; i++) expect(sim[i].distanceTo(sim[i - 1])).toBeCloseTo(0.125, 3);
    // The bones follow the simulated joints.
    expect(after.distanceTo(sim[sim.length - 1])).toBeLessThan(1e-3);
  });

  it('stays put when the pose already hangs and the body is still', () => {
    const { root, names, tip } = rig(true);
    const posed = tipWorld(tip);
    const chain = boneChain(root, names, OPTS)!;
    for (let i = 0; i < 300; i++) chain.step(1 / 60);
    const settled = tipWorld(tip);
    for (let i = 0; i < 60; i++) chain.step(1 / 60);
    expect(tipWorld(tip).distanceTo(settled)).toBeLessThan(0.005);
    expect(settled.distanceTo(posed)).toBeLessThan(0.02);
  });

  it('trails a little behind a run, but does not stream out flat', () => {
    const { root, names, tip } = rig(true);
    const chain = boneChain(root, names, OPTS)!;
    for (let i = 0; i < 300; i++) chain.step(1 / 60);
    // Run ahead (+Z) at 6 m/s for two seconds.
    for (let i = 0; i < 120; i++) { root.position.z += 6 / 60; root.updateMatrixWorld(true); chain.step(1 / 60); }
    const t = tipWorld(tip).sub(chain.joints.sim[0]);
    const trail = Math.atan2(-t.z, -t.y) * 180 / Math.PI;
    expect(trail).toBeGreaterThan(10);
    expect(trail).toBeLessThan(35);
  });

  it('swings forward when the body stops dead, but never through the chest', () => {
    const { root, names } = rig(true);
    const chain = boneChain(root, names, { ...OPTS, body: { from: 'spine', to: 'neck', radius: [0.09, 0.09], facing: root, behind: 0.05 } })!;
    for (let i = 0; i < 300; i++) chain.step(1 / 60);
    for (let i = 0; i < 60; i++) { root.position.z += 8 / 60; root.updateMatrixWorld(true); chain.step(1 / 60); }
    let most = -Infinity;
    for (let i = 0; i < 90; i++) {
      chain.step(1 / 60);
      for (const p of chain.joints.sim.slice(1)) most = Math.max(most, p.z - root.position.z);
    }
    // Facing +Z: every joint stays at least 5 cm behind the spine.
    expect(most).toBeLessThan(-0.05 + 1e-3);
    expect(most).toBeGreaterThan(-0.1);
  });

  it('starts from the pose after a teleport rather than whipping across', () => {
    const { root, names, tip } = rig();
    const chain = boneChain(root, names, OPTS)!;
    for (let i = 0; i < 300; i++) chain.step(1 / 60);
    const hang = tipWorld(tip).clone().sub(chain.joints.sim[0]);
    root.position.set(50, 0, 50); root.updateMatrixWorld(true);
    chain.step(1 / 60);
    // Back to the stiff pose for a frame, then it falls again; it never stretches across the gap.
    const offset = tipWorld(tip).sub(chain.joints.sim[0]);
    expect(offset.length()).toBeLessThan(0.55);
    for (let i = 0; i < 300; i++) chain.step(1 / 60);
    expect(tipWorld(tip).sub(chain.joints.sim[0]).distanceTo(hang)).toBeLessThan(0.02);
  });
});
