import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MODELLED_SPECIES, createCreatureModel, creatureStats, type CreatureAction } from '../src/client/creatures';

const ACTIONS: CreatureAction[] = ['attack', 'special', 'hit', 'happy', 'faint'];

function finiteTree(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((o) => {
    const p = o.position;
    const q = o.quaternion;
    const s = o.scale;
    if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z].every(Number.isFinite)) ok = false;
  });
  return ok;
}

/** Bounds of the posed (skinned) body, ignoring effect meshes. */
function skinnedBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) {
      sm.skeleton.update();
      box.expandByObject(sm, true);
    }
  });
  return box;
}

describe('creature models', () => {
  it('has all 21 species', () => {
    expect(MODELLED_SPECIES.length).toBe(21);
    expect(new Set(MODELLED_SPECIES).size).toBe(21);
  });

  for (const id of MODELLED_SPECIES) {
    describe(id, () => {
      it('builds with sensible size and budget', () => {
        const m = createCreatureModel(id);
        expect(m.root).toBeInstanceOf(THREE.Group);
        expect(m.height).toBeGreaterThan(0.15);
        expect(m.height).toBeLessThan(3);
        expect(m.radius).toBeGreaterThan(0.05);
        expect(m.radius).toBeLessThan(2.5);
        const st = creatureStats(id);
        expect(st.tris).toBeGreaterThan(300);
        expect(st.tris).toBeLessThan(m.height > 1 ? 16000 : 8000);
        expect(st.draws).toBeLessThanOrEqual(8);
        m.dispose();
      });

      it('survives walking, running and every action', () => {
        const m = createCreatureModel(id);
        const scene = new THREE.Scene();
        scene.add(m.root);
        const dt = 1 / 60;
        let x = 0;
        for (const speed of [0, 0.8, 2, 4.5, 8, 0]) {
          for (let i = 0; i < 90; i++) {
            x += speed * dt;
            m.root.position.z = x;
            m.root.rotation.y += speed > 3 ? 0.01 : 0;
            m.update(dt, speed);
          }
          expect(finiteTree(m.root)).toBe(true);
        }
        for (const a of ACTIONS) {
          const d = m.play(a);
          expect(d).toBeGreaterThan(0);
          for (let t = 0; t < d + 0.3; t += dt) m.update(dt, 0);
          expect(finiteTree(m.root)).toBe(true);
        }
        // Faint holds until reset.
        m.update(1, 0);
        m.reset();
        for (let i = 0; i < 30; i++) m.update(dt, 1);
        expect(finiteTree(m.root)).toBe(true);
        // Stays roughly on the ground and within its height.
        const box = skinnedBox(m.root);
        expect(box.min.y).toBeGreaterThan(-0.25 * m.height);
        expect(box.max.y).toBeLessThan(2.2 * m.height);
        m.dispose();
        expect(m.root.parent).toBeNull();
      });
    });
  }

  it('shares one template between instances and frees it after the last dispose', () => {
    const a = createCreatureModel('cindlet');
    const b = createCreatureModel('cindlet');
    const ga = (a.root.getObjectByName('scaled')!.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh).geometry;
    const gb = (b.root.getObjectByName('scaled')!.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh).geometry;
    expect(ga).toBe(gb);
    let disposed = 0;
    ga.addEventListener('dispose', () => disposed++);
    a.dispose();
    expect(disposed).toBe(0);
    b.dispose();
    expect(disposed).toBe(1);
  });

  it('plants its feet: stance paws hold still in the world while walking', () => {
    const m = createCreatureModel('cindlet');
    const scene = new THREE.Scene();
    scene.add(m.root);
    const dt = 1 / 120;
    const speed = 0.9;
    let z = 0;
    const paw = m.root.getObjectByName('hindLPaw')!;
    const prev = new THREE.Vector3();
    const cur = new THREE.Vector3();
    let planted = 0;
    let slipSum = 0;
    for (let i = 0; i < 600; i++) {
      z += speed * dt;
      m.root.position.z = z;
      m.update(dt, speed);
      m.root.updateMatrixWorld(true);
      paw.getWorldPosition(cur);
      if (i > 240) {
        const v = cur.distanceTo(prev) / dt;
        // A paw near the ground (within ~4% of the body height) counts as planted.
        if (cur.y < m.height * 0.038) {
          planted++;
          slipSum += v;
        }
      }
      prev.copy(cur);
    }
    expect(planted).toBeGreaterThan(50);
    // Mean speed of a planted paw is a small fraction of the body speed.
    expect(slipSum / planted).toBeLessThan(speed * 0.25);
    m.dispose();
  });
});
