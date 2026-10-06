import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { instantiateAsset } from '../assets/loader';
import type { CreatureAction, CreatureModel } from './index';

export interface ImportedCreatureModel extends CreatureModel {
  readonly animations: string[];
  setAnimation(name: string | null): void;
}

/** An Alpha's eyes (DESIGN §4.6): a red glow that reads from across a field. */
const ALPHA_EYES = new THREE.Color(1, 0.01, 0);

/**
 * Keyframed Pokémon skeletons, with generated reactions when a source has no matching clip.
 * `glowEyes` lights up the eye materials red (an Alpha).
 */
export function importedCreature(asset: GLTF, height: number, opts: { glowEyes?: boolean } = {}): ImportedCreatureModel {
  const { scene, release } = instantiateAsset(asset);
  if (opts.glowEyes) {
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const p = mat as THREE.MeshStandardMaterial;
        if (!p.isMeshStandardMaterial || !/eye/i.test(p.name)) continue;
        // Light of its own over a near-black base. Kept just over the bloom threshold: brighter,
        // the grade's highlight roll-off washes the red out to pink.
        p.emissive.copy(ALPHA_EYES);
        p.emissiveIntensity = 1.15;
        p.color.setRGB(0.12, 0, 0);
      }
    });
  }
  const root = new THREE.Group(), motion = new THREE.Group(), sized = new THREE.Group();
  root.add(motion); motion.add(sized); sized.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const clips = asset.animations;
  const referenceIdle = clips.find((c) => /idle|wait|stand/i.test(c.name));
  if (referenceIdle) { mixer.clipAction(referenceIdle).play(); mixer.update(0); }
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update(); });
  // Bound the posed vertices, not the exporter's oversized bind-pose box.
  const box = new THREE.Box3().setFromObject(scene, true), size = box.getSize(new THREE.Vector3());
  const scale = height / Math.max(size.y, 0.01);
  scene.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  sized.scale.setScalar(scale);
  const radius = Math.max(0.1, Math.min(2.3, Math.max(size.x, size.z) * scale * 0.42));
  const find = (re: RegExp) => clips.find((c) => re.test(c.name));
  const idle = find(/idle|wait|stand/i), walk = find(/walk/i), run = find(/run|dash/i);
  const actions = new Map<THREE.AnimationClip, THREE.AnimationAction>();
  const actionFor = (clip: THREE.AnimationClip) => {
    let a = actions.get(clip); if (!a) { a = mixer.clipAction(clip); actions.set(clip, a); } return a;
  };
  let manual: string | null = null;
  let current: THREE.AnimationAction | undefined, oneShot: CreatureAction | null = null, time = 0, duration = 0, elapsed = 0, disposed = false;
  const switchClip = (clip?: THREE.AnimationClip, once = false) => {
    if (!clip) return;
    const a = actionFor(clip);
    if (a === current && !once) return;
    const previous = current;
    a.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    a.clampWhenFinished = once; a.enabled = true; a.setEffectiveTimeScale(1); a.setEffectiveWeight(1); a.play();
    if (previous && previous !== a) { a.crossFadeFrom(previous, 0.15, false); }
    current = a;
  };
  switchClip(idle ?? clips[0]);
  const mats: { mat: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }[] = [];
  scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
    if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) { const p = mat as THREE.MeshStandardMaterial; mats.push({ mat: p, emissive: p.emissive.clone(), intensity: p.emissiveIntensity }); }
  } });
  const resetPose = () => { motion.position.set(0, 0, 0); motion.rotation.set(0, 0, 0); motion.scale.set(1, 1, 1); };
  root.userData.pokemon = { source: asset.scene.userData.assetUrl, animations: clips.map((c) => c.name), height, radius };
  return {
    root, height, radius,
    animations: clips.map((c) => c.name),
    setAnimation(name) { manual = name; oneShot = null; resetPose(); switchClip(name ? clips.find((c) => c.name === name) : idle ?? clips[0]); },
    update(dt, speed) {
      if (disposed) return;
      elapsed += dt; time += dt;
      if (oneShot && time >= duration && oneShot !== 'faint') { oneShot = null; resetPose(); }
      if (!oneShot && !manual) {
        switchClip(speed > 2.5 ? run ?? walk ?? idle : speed > 0.15 ? walk ?? run ?? idle : idle ?? clips[0]);
        if (current) current.timeScale = speed > 0.15 ? THREE.MathUtils.clamp(speed / (speed > 2.5 ? 4 : 1.4), 0.6, 1.8) : 1;
      }
      mixer.update(dt);
      if (!clips.length && !oneShot) {
        // Static models remain visibly alive; these are generated motions, not extracted game clips.
        motion.position.y = Math.sin(elapsed * (speed > 0.2 ? 9 : 2.5)) * height * (speed > 0.2 ? 0.035 : 0.007);
        motion.rotation.z = speed > 0.2 ? Math.sin(elapsed * 7) * 0.035 : 0;
      }
      if (oneShot === 'hit') motion.rotation.z = Math.sin(Math.min(1, time / duration) * Math.PI * 5) * 0.12 * Math.max(0, 1 - time / duration);
      if (oneShot === 'special') motion.scale.setScalar(1 + Math.sin(Math.min(1, time / duration) * Math.PI) * 0.035);
      if (oneShot === 'faint') { const k = Math.min(1, time / 0.65); motion.rotation.z = k * 0.85; motion.position.y = -height * 0.16 * k; }
      for (const { mat, emissive, intensity } of mats) {
        mat.emissive.copy(emissive); mat.emissiveIntensity = intensity;
        if (oneShot === 'hit' && time < duration) { mat.emissive.setRGB(1, 0.18, 0.12); mat.emissiveIntensity = Math.max(0, 0.65 * (1 - time / duration)); }
      }
    },
    play(action) {
      const clip = action === 'attack' ? find(/attack|fight_b|physical/i) : action === 'special' ? find(/special|fight_d|attack/i)
        : action === 'happy' ? find(/happy|jump|cheer/i) : action === 'faint' ? find(/faint|ko|sleep/i) : find(/hit|damage/i);
      oneShot = action; time = 0; resetPose();
      duration = clip?.duration ?? (action === 'faint' ? 1 : 0.65);
      switchClip(clip, true); return duration;
    },
    reset() { oneShot = null; time = 0; resetPose(); current?.stop(); current = undefined; switchClip(idle ?? clips[0]); },
    dispose() { if (disposed) return; disposed = true; mixer.stopAllAction(); mixer.uncacheRoot(scene); release(); root.removeFromParent(); root.clear(); },
  };
}
