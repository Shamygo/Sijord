import * as THREE from 'three';
import type { Appearance } from '../../shared/types';
import { instantiateAsset, loadAsset, loadedAsset, trainerUrl } from '../assets/loader';
import { REI_STANCE_SPEED } from './locomotion';
import type { AnimateInput, Avatar, GroundFn } from './types';

/**
 * Rei's overhand throw clip, measured on the final rig: the arm is cocked furthest back at
 * about 0.18 s and the hand passes the shoulder going forward at about 0.26 s.
 */
export const THROW_CLIP = { windup: 0.18, release: 0.26 };

/** Rei's gaits, blended by speed on one shared stride phase so the feet never skip a beat. */
const GAITS = ['walk', 'jog', 'run'] as const;
type Gait = typeof GAITS[number];
const LOOPED = new Set(['idle', 'walk', 'jog', 'run', 'fall', 'climb']);
/** Speeds (m/s) where walk hands over to jog, and jog to run. */
const GAIT_BLEND = { jog: [1.4, 2.6], run: [5.4, 7.0] } as const;
/** Metres climbed per cycle of the climbing loop. */
const CLIMB_STRIDE = 1.0;
/**
 * Playback rates for one-shot clips, matched to the controller: a 0.5 s roll and a 0.5 s vault.
 * The roll clip finishes getting up while locomotion blends back in.
 */
const ONE_SHOT_RATE: Record<string, number> = { roll: 1.6, vault: 1.07, climbup: 1, jump: 1, land: 1 };

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Imported trainer skins, with baked keyframes where supplied and a terrain-aware fallback. */
export function withTrainerAsset(driver: Avatar, appearance: Appearance): Avatar {
  const root = driver.root;
  let visual: ReturnType<typeof instantiateAsset> | undefined;
  let motion: THREE.Group | undefined;
  let disposed = false, generation = 0, current = appearance;
  type Link = { source: THREE.Object3D; target: THREE.Object3D; alignment: THREE.Quaternion };
  let links: Link[] = [];
  let mixer: THREE.AnimationMixer | undefined;
  let clips: THREE.AnimationClip[] = [];
  const actions = new Map<string, THREE.AnimationAction>();
  const weights = new Map<string, number>();
  let gesture: string | null = null, gestureTime = 0, landingTime = 0, aimHold = false;
  let previousAnim: AnimateInput['anim'] = 'idle';
  /** Per gait: metres per cycle at natural speed, and the phase where the left foot is furthest forward. */
  let stride: Record<Gait, { length: number; offset: number }> = {
    walk: { length: REI_STANCE_SPEED.walk * 1.0667, offset: 0 }, jog: { length: 3.4, offset: 0.95 }, run: { length: REI_STANCE_SPEED.run * 0.5333, offset: 0.867 },
  };
  let phase = 0, phaseRate = 0, smoothSpeed = 0;
  let lastPosition: {x:number;z:number} | undefined;

  const action = (name: string) => actions.get(name);
  /** Restart a one-shot (or loop) from its first frame. */
  const start = (name: string, rate = ONE_SHOT_RATE[name] ?? 1) => {
    const a = action(name);
    if (!a) return;
    a.reset();
    a.timeScale = rate;
    a.play();
  };
  let procedural = root.getObjectByName('avatar-body')!;
  let pelvis = procedural.getObjectByName('pelvis')!;
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion();

  const removeVisual = () => {
    mixer?.stopAllAction();if(mixer&&visual)mixer.uncacheRoot(visual.scene);mixer=undefined;clips=[];actions.clear();weights.clear();lastPosition=undefined;
    motion?.removeFromParent(); visual?.release(); visual = undefined; motion = undefined; links = [];
    procedural.visible = true;
  };
  /** Pose the rig at one time of one clip (for measuring), everything else off. */
  const solo = (name: string, time: number) => {
    for (const [n, a] of actions) { a.enabled = n === name; a.setEffectiveWeight(n === name ? 1 : 0); a.timeScale = 0; a.time = n === name ? time : 0; }
    mixer!.update(0);
    root.updateMatrixWorld(true);
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
      if(clips.length){
        mixer=new THREE.AnimationMixer(visual.scene);
        for (const clip of clips) {
          const a = mixer.clipAction(clip);
          const loop = LOOPED.has(clip.name);
          a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
          a.clampWhenFinished = !loop;
          a.play();
          actions.set(clip.name, a);
          weights.set(clip.name, clip.name === 'idle' ? 1 : 0);
        }
        solo('idle', 0);
      }
      root.updateMatrixWorld(true);
      // Measure in trainer-local space; root may already have a world position and yaw.
      const savedPos = root.position.clone(), savedQ = root.quaternion.clone();
      root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(visual.scene), size = box.getSize(new THREE.Vector3());
      visual.scene.scale.multiplyScalar(1.75 / Math.max(0.01, size.y));
      visual.scene.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2).multiplyScalar(1.75 / Math.max(0.01, size.y)));
      root.updateMatrixWorld(true);
      const feet=['left_foot','right_foot'].flatMap(name=>{const foot=visual!.scene.getObjectByName(name);return foot?[foot]:[];});
      const hips=visual.scene.getObjectByName('waist');
      if(mixer && feet.length===2 && hips) {
        // Measure each gait on the final-sized rig: how far the support foot travels per cycle,
        // and where in the cycle the left foot reaches furthest forward (to line the gaits up).
        const measured = { ...stride };
        for(const name of GAITS) {
          const clip=clips.find(c=>c.name===name);if(!clip)continue;
          const samples:THREE.Vector3[][]=[];let reach=-Infinity,offset=0;
          for(let i=0;i<=120;i++) {
            solo(name, clip.duration*i/120);
            samples.push(feet.map(f=>f.getWorldPosition(new THREE.Vector3())));
            const ahead=samples[i][0].z-hips.getWorldPosition(new THREE.Vector3()).z;
            if(i<120&&ahead>reach){reach=ahead;offset=i/120;}
          }
          // Each foot's ground contact: how far it sweeps back while down, over how long. The
          // average over the contact (not the fastest moment) is what keeps a sprint from skating.
          let swept=0,time=0;
          for(let f=0;f<2;f++) {
            const low=Math.min(...samples.map(row=>row[f].y));
            for(let i=1;i<samples.length;i++) {
              const previous=samples[i-1][f],foot=samples[i][f];
              if(Math.max(previous.y,foot.y)<low+.035 && previous.z>foot.z){swept+=previous.z-foot.z;time+=clip.duration/120;}
            }
          }
          if(time>0)measured[name]={length:swept/time*clip.duration,offset};
        }
        stride = measured;
        root.userData.stride={...stride};
      }
      if (mixer) {
        solo('idle', 0);
        for (const a of actions.values()) a.timeScale = 1;
      }
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

  /** Which clips should hold the pose this frame (weights sum to 1). */
  const targets = (dt: number, snapshot: AnimateInput, travelSpeed: number): Record<string, number> => {
    const anim = snapshot.anim, entering = anim !== previousAnim;
    if (aimHold) {
      // Draw the arm back, then hold the wound-up pose until the throw is released.
      const a = action('throw');
      if (a) { if (a.time >= THROW_CLIP.windup) { a.time = THROW_CLIP.windup; a.timeScale = 0; } else a.timeScale = 1; }
      return { throw: 1 };
    }
    if (gesture && gestureTime > 0) return { [gesture]: 1 };
    if (anim === 'roll' || anim === 'mantle' || anim === 'vault') {
      const name = anim === 'mantle' ? 'climbup' : anim;
      if (entering) start(name);
      return { [name]: 1 };
    }
    if (anim === 'climb') {
      const a = action('climb');
      if (a) a.timeScale = Math.max(0, snapshot.speed) / CLIMB_STRIDE;
      return { climb: 1 };
    }
    if (anim === 'jump') {
      if (entering) start('jump');
      return { jump: 1 };
    }
    if (anim === 'fall') return { fall: 1 };
    if ((previousAnim === 'jump' || previousAnim === 'fall') && anim === 'idle') { start('land'); landingTime = .3; }
    if (anim !== 'idle') landingTime = 0;
    if (landingTime > 0) return { land: 1 };
    // On the ground: idle, walk, jog and run, weighted by speed, sharing one stride phase.
    const s = smoothSpeed, toJog = smooth(GAIT_BLEND.jog[0], GAIT_BLEND.jog[1], s), toRun = smooth(GAIT_BLEND.run[0], GAIT_BLEND.run[1], s);
    const mix: Record<Gait, number> = { walk: 1 - toJog, jog: toJog * (1 - toRun), run: toRun };
    let cycle = 0;
    for (const g of GAITS) cycle += mix[g] * stride[g].length;
    phaseRate = s / Math.max(0.3, cycle);
    phase = (phase + dt * phaseRate) % 1;
    for (const g of GAITS) {
      const a = action(g);
      if (!a) continue;
      a.timeScale = 0;
      a.time = ((phase + stride[g].offset) % 1) * a.getClip().duration;
    }
    const still = anim === 'idle' && travelSpeed < 0.3 ? 1 : 1 - smooth(0.15, 0.8, s);
    return { idle: still, walk: (1 - still) * mix.walk, jog: (1 - still) * mix.jog, run: (1 - still) * mix.run };
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
        }
        lastPosition={x:snapshot.x,z:snapshot.z};
      }
      if(!mixer){pose();previousAnim=snapshot.anim;return;}
      if (dt > 0) smoothSpeed += (travelSpeed - smoothSpeed) * (1 - Math.exp(-dt / 0.09));
      gestureTime = Math.max(0, gestureTime - dt);
      landingTime = Math.max(0, landingTime - dt);
      if (gestureTime === 0) gesture = null;
      const want = targets(dt, snapshot, travelSpeed);
      // Ease every clip's weight towards its target, then normalise so the pose never sags
      // towards the bind pose mid-blend.
      const k = dt > 0 ? 1 - Math.exp(-dt / 0.07) : 0;
      let total = 0;
      for (const [name, w] of weights) {
        const next = w + ((want[name] ?? 0) - w) * k;
        weights.set(name, next < 1e-3 ? 0 : next);
        total += weights.get(name)!;
      }
      if (total < 1e-3) for (const name of Object.keys(want)) { weights.set(name, want[name]); total += want[name]; }
      let top = '', best = -1;
      for (const [name, a] of actions) {
        const w = (weights.get(name) ?? 0) / Math.max(1e-6, total);
        a.enabled = w > 0;
        a.setEffectiveWeight(w);
        if (w > best) { best = w; top = name; }
      }
      root.userData.currentClip = top;
      root.userData.locomotionSpeed = smoothSpeed;
      // Playback speed of the leading clip; gaits are posed by hand from the shared stride phase.
      const lead = action(top);
      root.userData.animationRate = lead && (GAITS as readonly string[]).includes(top) ? phaseRate * lead.getClip().duration : lead?.timeScale;
      mixer.update(dt);
      if (motion) motion.position.set(0, 0, 0);
      previousAnim = snapshot.anim;
    },
    gesture(name) {
      if(!mixer){driver.gesture(name);return;}
      const a = action(name);
      const duration = a?.getClip().duration ?? 1;
      if(aimHold && name==='throw' && a) {
        // Release from the wound-up pose rather than starting the wind-up again.
        aimHold=false;a.timeScale=1;gesture=name;gestureTime=Math.max(.1,duration-a.time);return;
      }
      aimHold=false;start(name);gesture=name;gestureTime=duration;
    },
    aim(on: boolean) {
      if(!mixer)return;
      if(on===aimHold)return;
      aimHold=on;
      if(on){start('throw');gesture=null;gestureTime=0;landingTime=0;}
      else{const a=action('throw');if(a)a.timeScale=1;gesture=null;gestureTime=0;}
    },
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
