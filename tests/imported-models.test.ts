import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { importedCreature } from '../src/client/creatures/imported';
import catalogue from '../src/client/assets/pokemon-catalogue.json';
import { POKEMON_VISUALS } from '../src/shared/pokemon-visuals';
import { SPECIES } from '../src/shared/data/species';

function fixture(): GLTF {
  const scene = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'testBone'; scene.add(bone);
  const geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial()); scene.add(mesh); mesh.bind(new THREE.Skeleton([bone]));
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8);
  const idle = new THREE.AnimationClip('idle', 1, [new THREE.QuaternionKeyframeTrack('testBone.quaternion', [0, 1], [0, 0, 0, 1, ...q.toArray()])]);
  return { scene, animations: [idle, idle.clone().resetDuration()], scenes: [scene], cameras: [], asset: { version: '2.0' }, parser: {} } as unknown as GLTF;
}

describe('imported Pokémon', () => {
  it('keeps skeletons and reaction materials independent between two copies', () => {
    const asset = fixture(), a = importedCreature(asset, 1), b = importedCreature(asset, 1);
    a.update(0.4, 0); b.update(0.1, 0);
    const ba = a.root.getObjectByName('testBone')!, bb = b.root.getObjectByName('testBone')!;
    expect(ba).not.toBe(bb); expect(ba.quaternion.angleTo(bb.quaternion)).toBeGreaterThan(0.1);
    a.play('hit'); a.update(0.1, 0);
    expect(a.root.children[0].rotation.z).not.toBe(b.root.children[0].rotation.z);
    a.dispose(); b.update(0.2, 1); expect(Number.isFinite(bb.quaternion.w)).toBe(true); b.dispose();
  });
  it('holds faint until reset, then resumes upright animation', () => {
    const model = importedCreature(fixture(), 1); model.play('faint'); model.update(2, 0);
    expect(model.root.children[0].rotation.z).toBeCloseTo(0.85);
    model.update(2, 0); expect(model.root.children[0].rotation.z).toBeCloseTo(0.85);
    model.reset(); model.update(0.1, 0); expect(model.root.children[0].rotation.z).toBe(0); model.dispose();
  });
  it('has unique catalogue entries, pinned source URLs and animated models for each gameplay slot', () => {
    expect(catalogue.models.length).toBe(1322);
    expect(new Set(catalogue.models.map((m) => m.id)).size).toBe(1322);
    for (const m of catalogue.models) expect(m.url).toMatch(/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);
    for (const [id, visual] of Object.entries(POKEMON_VISUALS)) {
      expect(SPECIES[id].name).toBe(visual.name);
      expect(catalogue.models.find((m) => m.id === `regular/${visual.dex}`)?.animations).toContain('walk');
    }
  });
});
