import * as THREE from 'three';
import type { Appearance } from '../../shared/types';
import { instantiateAsset, loadAsset, loadedAsset, trainerUrl } from '../assets/loader';
import { locomotionRate, REI_STANCE_SPEED } from './locomotion';
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
  let plantedFoot = -1;
  const footAnchor = new THREE.Vector3();
  let runFootHeight = 0;
  let stanceSpeed: Record<'walk'|'run',number> = {...REI_STANCE_SPEED};
  let stanceFeet: THREE.Object3D[] = [], stanceHeight = 0;
  let lastPosition: {x:number;z:number} | undefined;
  const setClip = (name: string, once = false) => {
    const clip = clips.find(c => c.name === name);
    if (!clip || !mixer) return;
    const next = mixer.clipAction(clip);
    if (next === active && !once) return;
    const locomotion = active && ['walk', 'run'].includes(active.getClip().name) && ['walk', 'run'].includes(name);
    const phase = locomotion ? (active!.time / active!.getClip().duration) % 1 : 0;
    next.reset();
    next.time = phase * clip.duration;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (active && active !== next) next.crossFadeFrom(active, .18, false);
    active = next;
    root.userData.currentClip = name;
  };
  let procedural = root.getObjectByName('avatar-body')!;
  let pelvis = procedural.getObjectByName('pelvis')!;
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion();

  const removeVisual = () => {
    mixer?.stopAllAction();if(mixer&&visual)mixer.uncacheRoot(visual.scene);mixer=undefined;active=undefined;clips=[];lastPosition=undefined;stanceFeet=[];plantedFoot=-1;
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
      stanceFeet=['left_foot','right_foot'].flatMap(name=>{const foot=visual!.scene.getObjectByName(name);return foot?[foot]:[];});
      if(mixer && stanceFeet.length===2) {
        for(const name of ['walk','run'] as const) {
          const clip=clips.find(c=>c.name===name);if(!clip)continue;
          mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().play();
          const samples:THREE.Vector3[][]=[];
          for(let i=0;i<=120;i++) {
            mixer.setTime(clip.duration*i/120);root.updateMatrixWorld(true);
            samples.push(stanceFeet.map(f=>f.getWorldPosition(new THREE.Vector3())));
          }
          const low=stanceFeet.map((_,f)=>Math.min(...samples.map(row=>row[f].y)));
          if(name==='run')runFootHeight=Math.min(...low);
          const velocities:number[]=[];
          for(let i=1;i<samples.length;i++)for(let f=0;f<2;f++) {
            const previous=samples[i-1][f],foot=samples[i][f];
            const backwards=(previous.z-foot.z)*120/clip.duration;
            if(Math.max(previous.y,foot.y)<low[f]+.07 && backwards>0)velocities.push(backwards);
          }
          velocities.sort((a,b)=>a-b);
          if(velocities.length)stanceSpeed[name]=velocities[Math.floor(velocities.length/2)];
        }
        mixer.stopAllAction();active=undefined;setClip('idle');mixer.update(0);root.updateMatrixWorld(true);
        root.userData.stanceSpeed={...stanceSpeed};
      }
      if(stanceFeet.length)stanceHeight=Math.min(...stanceFeet.map(f=>f.getWorldPosition(new THREE.Vector3()).y));
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
      let travelSpeed = snapshot.speed;
      if(snapshot.x!==undefined && snapshot.z!==undefined) {
        if(lastPosition && dt>0) {
          const distance=Math.hypot(snapshot.x-lastPosition.x,snapshot.z-lastPosition.z);
          // A teleport is not a footstep. Normal motion uses resolved displacement, including walls.
          if(distance<=Math.max(1,snapshot.speed*dt*4))travelSpeed=distance/dt;
          else {plantedFoot=-1;if(motion){motion.position.x=0;motion.position.z=0;}}
        }
        lastPosition={x:snapshot.x,z:snapshot.z};
      }
      if(mixer){
        gestureTime=Math.max(0,gestureTime-dt);landingTime=Math.max(0,landingTime-dt);
        if((previousAnim==='jump'||previousAnim==='fall')&&snapshot.anim==='idle'&&!gestureTime){setClip('land',true);landingTime=.3;}
        if(snapshot.anim!=='idle')landingTime=0;
        // 4.5 m/s exploration is a jog: use the running stride rather than a frantic walk.
        const gait=snapshot.anim==='walk'&&travelSpeed>(active?.getClip().name==='run'?2.2:2.7)?'run':snapshot.anim;
        if(!gestureTime&&!landingTime)setClip(gait);
        if(active) {
          active.timeScale=1;
          if(!gestureTime&&!landingTime) {
            if(gait==='climb')active.timeScale=snapshot.speed>.05?1:0;
            else if(gait==='walk'||gait==='run')active.timeScale=locomotionRate(gait,travelSpeed,stanceSpeed[gait]);
          }
        }
        root.userData.locomotionSpeed=travelSpeed;root.userData.animationRate=active?.timeScale;
        if(motion)motion.position.y=0;
        mixer.update(dt);
        if(motion && stanceFeet.length && (snapshot.anim==='walk'||snapshot.anim==='run'||snapshot.anim==='idle') && snapshot.grounded!==false) {
          root.updateMatrixWorld(true);
          const footHeight=Math.min(...stanceFeet.map(f=>f.getWorldPosition(new THREE.Vector3()).y))-root.position.y;
          // Keep the support foot at its idle sole height; the source rig has a different hip bob.
          const planted=stanceHeight-footHeight;
          // Runs include a flight phase; retain it instead of pinning the feet during every frame.
          motion.position.y=gait==='run'?Math.max(stanceHeight-runFootHeight,planted):planted;
          root.updateMatrixWorld(true);
          const feet=stanceFeet.map(f=>f.getWorldPosition(new THREE.Vector3()));
          const support=feet[0].y<feet[1].y?0:1;
          if((gait==='walk'||gait==='run')&&feet[support].y-root.position.y<stanceHeight+.07) {
            if(plantedFoot===support) {
              // Retargeted left/right strides differ slightly. Hold the support foot in the world
              // with a small visual hip correction; physics and the collision capsule stay authoritative.
              const correction=footAnchor.clone().sub(feet[support]);correction.y=0;
              correction.applyQuaternion(root.quaternion.clone().invert());
              motion.position.x=THREE.MathUtils.clamp(motion.position.x+correction.x,-.3,.3);
              motion.position.z=THREE.MathUtils.clamp(motion.position.z+correction.z,-.3,.3);
            } else {plantedFoot=support;footAnchor.copy(feet[support]);}
          } else plantedFoot=-1;
        } else plantedFoot=-1;
        if(plantedFoot<0 && motion) {
          const decay=Math.exp(-14*dt);motion.position.x*=decay;motion.position.z*=decay;
        }
        root.userData.plantedFoot=plantedFoot;
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
