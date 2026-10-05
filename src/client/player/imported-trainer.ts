import * as THREE from 'three';
import type { Appearance } from '../../shared/types';
import { instantiateAsset, loadAsset, loadedAsset, trainerUrl } from '../assets/loader';
import type { AnimateInput, Avatar, GroundFn } from './types';

/** Imported trainer skins, with baked keyframes where supplied and a terrain-aware fallback. */
export function withTrainerAsset(driver: Avatar, appearance: Appearance): Avatar {
  const root = driver.root;
  let visual: ReturnType<typeof instantiateAsset> | undefined;
  let motion: THREE.Group | undefined;
  let disposed = false, generation = 0, current = appearance;
  type Link = { source: THREE.Object3D; target: THREE.Object3D; alignment: THREE.Quaternion };
  let links: Link[] = [];
  let mixer: THREE.AnimationMixer | undefined, active: THREE.AnimationAction | undefined;
  let clips: THREE.AnimationClip[] = [], gestureTime = 0, landingTime = 0;
  let previousAnim: AnimateInput['anim'] = 'idle';
  const setClip = (name:string,once=false) => {const clip=clips.find(c=>c.name===name);if(!clip||!mixer)return;const next=mixer.clipAction(clip);if(next===active&&!once)return;next.reset().setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;next.play();if(active&&active!==next)next.crossFadeFrom(active,.18,false);active=next;root.userData.currentClip=name;};
  let procedural = root.getObjectByName('avatar-body')!;
  let pelvis = procedural.getObjectByName('pelvis')!;
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion();

  const removeVisual = () => {
    mixer?.stopAllAction();if(mixer&&visual)mixer.uncacheRoot(visual.scene);mixer=undefined;active=undefined;clips=[];
    motion?.removeFromParent(); visual?.release(); visual = undefined; motion = undefined; links = [];
    procedural.visible = true;
  };
  const attach = async () => {
    const request = ++generation;
    if (current.trainerModel === 'custom' || typeof document === 'undefined') { removeVisual(); root.userData.trainerModel = 'custom'; return; }
    try {
      const asset = loadedAsset(trainerUrl(current.trainerModel)) ?? await loadAsset(trainerUrl(current.trainerModel), true);
      if (disposed || request !== generation) return;
      removeVisual();
      visual = instantiateAsset(asset);
      motion = new THREE.Group(); motion.name = 'trainer:'+ (current.trainerModel ?? 'rei'); root.add(motion); motion.add(visual.scene);
      clips=asset.animations;
      if(clips.length){mixer=new THREE.AnimationMixer(visual.scene);setClip('idle');mixer.update(0);}
      root.updateMatrixWorld(true);
      // Measure in trainer-local space; root may already have a world position and yaw.
      const savedPos = root.position.clone(), savedQ = root.quaternion.clone();
      root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(visual.scene), size = box.getSize(new THREE.Vector3());
      visual.scene.scale.multiplyScalar(1.75 / Math.max(0.01, size.y));
      visual.scene.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2).multiplyScalar(1.75 / Math.max(0.01, size.y)));
      root.updateMatrixWorld(true);
      const source = (name: string, parent?: string) => (parent ? procedural.getObjectByName(parent)! : procedural).getObjectByName(name)!;
      const mapping: [string, THREE.Object3D, number?][] = [
        ['Hips', pelvis], ['Spine0', source('spine')], ['Spine1', source('chest')], ['Neck', source('neck')], ['Head', source('head')],
        ['LThigh', source('thighL')], ['LLeg', source('shin', 'thighL')], ['LFoot', source('foot', 'thighL')], ['LToe', source('toe', 'thighL')],
        ['RThigh', source('thighR')], ['RLeg', source('shin', 'thighR')], ['RFoot', source('foot', 'thighR')], ['RToe', source('toe', 'thighR')],
        ['LShoulder', source('clavL')], ['LArm', source('upperArm', 'clavL'), -Math.PI / 2], ['LForeArm', source('forearm', 'clavL'), -Math.PI / 2], ['LHand', source('hand', 'clavL'), -Math.PI / 2],
        ['RShoulder', source('clavR')], ['RArm', source('upperArm', 'clavR'), Math.PI / 2], ['RForeArm', source('forearm', 'clavR'), Math.PI / 2], ['RHand', source('hand', 'clavR'), Math.PI / 2],
      ];
      links = mapping.flatMap(([name, src, lowerArm]) => {
        const target = visual!.scene.getObjectByName(name);
        if (!target || !src) return [];
        const alignment = target.getWorldQuaternion(new THREE.Quaternion());
        if (lowerArm !== undefined) alignment.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), lowerArm));
        // Driver joints are authored with identity rotations and downward limbs. The target
        // retains its own bind-axis orientation; transferring world quaternions preserves it.
        return [{ source: src, target, alignment }];
      });
      root.position.copy(savedPos); root.quaternion.copy(savedQ); procedural.visible = false;
      root.userData.trainerModel = 'Red (Pokémon Masters)';
      if(clips.length){links=[];root.userData.trainerModel='Rei (Pokémon Legends: Arceus)';root.userData.animations=clips.map(c=>c.name);}
      pose();
    } catch {
      if (!disposed && request === generation) { removeVisual(); root.userData.trainerModel = 'custom (asset unavailable)'; }
    }
  };
  const pose = () => {
    if (!motion || mixer) return;
    motion.position.y = pelvis.position.y - 0.875;
    root.updateMatrixWorld(true);
    for (const link of links) {
      link.source.getWorldQuaternion(q).multiply(link.alignment);
      link.target.parent!.getWorldQuaternion(parentQ).invert();
      link.target.quaternion.copy(parentQ.multiply(q));
      link.target.updateWorldMatrix(false, true);
    }
  };
  void attach();
  return {
    root,
    animate(dt: number, snapshot: AnimateInput) {
      driver.animate(dt,snapshot);
      if(mixer){
        gestureTime=Math.max(0,gestureTime-dt);landingTime=Math.max(0,landingTime-dt);
        if((previousAnim==='jump'||previousAnim==='fall')&&snapshot.anim==='idle'&&!gestureTime){setClip('land',true);landingTime=.3;}
        if(snapshot.anim!=='idle')landingTime=0;
        if(!gestureTime&&!landingTime)setClip(snapshot.anim);
        if(active)active.timeScale=!gestureTime&&!landingTime&&snapshot.anim==='climb'?(snapshot.speed>.05?1:0):snapshot.anim==='walk'?THREE.MathUtils.clamp(snapshot.speed/4.5,.7,1.4):1;
        mixer.update(dt);
      }
      else pose();
      previousAnim=snapshot.anim;
    },
    gesture(name) { if(mixer){setClip(name,true);gestureTime=clips.find(c=>c.name===name)?.duration ?? 1;}else driver.gesture(name); },
    setGround(fn: GroundFn | null) { driver.setGround(fn); },
    setAppearance(next) {
      current = next;
      // The imported model has a fixed costume; only rebuild the procedural driver for custom.
      removeVisual(); driver.setAppearance(next); root.userData.trainerModel = 'custom';
      procedural = root.getObjectByName('avatar-body')!;
      pelvis = procedural.getObjectByName('pelvis')!;
      void attach();
    },
    dispose() { disposed = true; generation++; removeVisual(); driver.dispose(); root.removeFromParent(); },
  };
}
