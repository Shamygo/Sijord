import * as THREE from 'three';
import { preloadGameplayAssets } from '../assets/loader';
import { POKEMON_VISUALS } from '../../shared/pokemon-visuals';
await preloadGameplayAssets();
import { RenderPipeline, type GraphicsQuality } from '../core/render';
import { createAvatar, type Avatar } from '../player';
import { DEFAULT_APPEARANCE } from '../../shared/types';
import { applyAtmosphere, createWorld } from '../world';
import { MODELLED_SPECIES, createCreatureModel, creatureStats, type CreatureAction, type CreatureModel } from './index';

/**
 * Dev gallery (creatures.html): every creature model standing in the real game world with the
 * game's lighting and render pipeline, cycling through its animations.
 *
 * URL parameters (all optional):
 *   only=cindlet,fernfawn   species to show (default: all 21)
 *   anim=cycle|idle|walk|trot|run|attack|special|hit|faint|happy   (default cycle)
 *   t=0.3        freeze: simulate this many seconds into the animation, render one frame
 *   cam=row|close|side|front|back|top|ref|game   (default row, or close for a single species)
 *   az=40        camera azimuth around the subject in degrees (0 = in front)
 *   dist=1       camera distance multiplier
 *   speed=2.5    ground speed (m/s) for walk/run views
 *   q=high       graphics quality (low | medium | high)
 *   trainer=1    put the trainer in for scale; labels=0 hides name tags; grass=0 hides grass
 *
 * `window.gallery.show({...same keys...})` re-stages the scene without reloading the world
 * (used by the screenshot script); `window.__galleryReady` counts rendered stagings.
 */

const ACTIONS: CreatureAction[] = ['attack', 'special', 'hit', 'faint', 'happy'];

interface View {
  only: string[];
  anim: string;
  t: number | null;
  cam: string;
  az: number | null;
  el: number | null;
  dist: number;
  speed: number | null;
  trainer: boolean;
  labels: boolean;
  grass: boolean;
}

type Params = Record<string, string | number | boolean | undefined>;

function parseView(src: Params): View {
  const str = (k: string): string | undefined => (src[k] === undefined || src[k] === '' ? undefined : String(src[k]));
  const num = (k: string): number | null => {
    const v = str(k);
    if (v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const only = (str('only') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const list = only.length ? only : [...MODELLED_SPECIES];
  return {
    only: list,
    anim: str('anim') ?? 'cycle',
    t: num('t'),
    cam: str('cam') ?? (list.length === 1 ? 'close' : 'row'),
    az: num('az'),
    el: num('el'),
    dist: num('dist') ?? 1,
    speed: num('speed'),
    trainer: str('trainer') === '1' || str('trainer') === 'true',
    labels: str('labels') !== '0',
    grass: str('grass') !== '0',
  };
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

const qs = new URLSearchParams(location.search);
const quality = (['low', 'medium', 'high'].includes(qs.get('q') ?? '') ? qs.get('q') : 'high') as GraphicsQuality;
const canvas = document.createElement('canvas');
document.body.prepend(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 2500);
const world = createWorld();
applyAtmosphere(scene);
scene.add(world.root);
world.setQuality?.(quality);
const pipeline = new RenderPipeline(renderer, scene, camera, quality);
const hud = document.getElementById('hud')!;

function resize(): void {
  pipeline.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const grassGroup = (() => {
  let g: THREE.Object3D | null = null;
  world.root.traverse((o) => {
    if (!g && /grass/i.test(o.name)) g = o;
  });
  return g as THREE.Object3D | null;
})();

// ---------------------------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------------------------

/** The gallery stands on the east road just past the Route 1 junction, facing south (sun side). */
const ROW_A = new THREE.Vector2(-27, -39.2);
const ROW_B = new THREE.Vector2(-88, -32.2);
/** Route 1 heading north, for the reference-style trainer + partner shot. */
const REF_START = new THREE.Vector2(1.2, -232);
const REF_DIR = new THREE.Vector2(10, 60).normalize();

interface Actor {
  id: string;
  model: CreatureModel;
  slot: THREE.Vector2;
  /** Facing yaw at the slot. */
  yaw: number;
  tag: HTMLDivElement | null;
  /** Live-mode state. */
  clock: number;
  stage: number;
  stageT: number;
  ang: number;
  speedNow: number;
}

let actors: Actor[] = [];
let trainer: Avatar | null = null;
let trainerPos = new THREE.Vector3();
let view = parseView(Object.fromEntries(qs.entries()));
let live = true;
let elapsed = 0;
let ready = 0;
const focus = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function gaitSpeed(h: number, kind: string): number {
  const base = Math.sqrt(9.8 * 0.35 * h);
  if (kind === 'walk') return 0.55 * base;
  if (kind === 'trot') return 1.15 * base;
  if (kind === 'run') return Math.max(4.5, 2.6 * base);
  return 0;
}

function ground(x: number, z: number): number {
  return world.heightAt(x, z);
}

function clearActors(): void {
  for (const a of actors) {
    a.model.dispose();
    a.tag?.remove();
  }
  actors = [];
  if (trainer) {
    scene.remove(trainer.root);
    trainer.dispose();
    trainer = null;
  }
}

function stage(v: View): void {
  clearActors();
  view = v;
  if (grassGroup) grassGroup.visible = v.grass;
  const models = v.only.map((id) => ({ id, model: createCreatureModel(id) }));
  const dir = ROW_B.clone().sub(ROW_A).normalize();
  // Facing: perpendicular to the row, towards the south side (the sun and the camera).
  const nrm = new THREE.Vector2(dir.y, -dir.x);
  if (nrm.y > 0) nrm.multiplyScalar(-1);
  const faceYaw = Math.atan2(nrm.x, nrm.y);
  const moving = ['walk', 'trot', 'run'].includes(v.anim);
  const alongYaw = Math.atan2(dir.x, dir.y);
  if (v.cam === 'ref') {
    // Partner walks to the trainer's left (west, +X) up Route 1.
    const m = models[0];
    actors.push(makeActor(m.id, m.model, REF_START.clone().add(new THREE.Vector2(REF_DIR.y, -REF_DIR.x).multiplyScalar(-1.25)), Math.atan2(REF_DIR.x, REF_DIR.y)));
    for (const extra of models.slice(1)) extra.model.dispose();
    trainer = createAvatar(DEFAULT_APPEARANCE);
    trainer.setGround(ground);
    scene.add(trainer.root);
    trainerPos.set(REF_START.x, ground(REF_START.x, REF_START.y), REF_START.y);
  } else {
    // Line them up along the row, centred, spaced by footprint.
    const gaps = models.map((m) => m.model.radius * (moving ? 1.6 : 1.15) + 0.3);
    let total = 0;
    for (let i = 0; i < models.length; i++) total += i === 0 ? 0 : gaps[i - 1] + gaps[i];
    let s = (ROW_A.distanceTo(ROW_B) - total) / 2;
    models.forEach((m, i) => {
      if (i > 0) s += gaps[i - 1] + gaps[i];
      const p = ROW_A.clone().addScaledVector(dir, s);
      actors.push(makeActor(m.id, m.model, p, moving ? alongYaw : faceYaw));
    });
    if (v.trainer) {
      trainer = createAvatar(DEFAULT_APPEARANCE);
      trainer.setGround(ground);
      scene.add(trainer.root);
      const p = ROW_A.clone().addScaledVector(dir, s + gaps[gaps.length - 1] + 0.8);
      trainerPos.set(p.x, ground(p.x, p.y), p.y);
      trainer.root.position.copy(trainerPos);
      trainer.root.rotation.y = faceYaw;
    }
  }
  elapsed = 0;
  live = v.t === null;
  if (!live) simulate(v.t!);
  frameCamera();
  draw(1 / 60);
  ready++;
  (window as unknown as { __galleryReady: number }).__galleryReady = ready;
}

function makeActor(id: string, model: CreatureModel, slot: THREE.Vector2, yaw: number): Actor {
  scene.add(model.root);
  model.root.position.set(slot.x, ground(slot.x, slot.y), slot.y);
  model.root.rotation.y = yaw;
  let tag: HTMLDivElement | null = null;
  if (view.labels && view.cam === 'row') {
    tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = POKEMON_VISUALS[id]?.name ?? id;
    document.body.append(tag);
  }
  return { id, model, slot: slot.clone(), yaw, tag, clock: 0, stage: 0, stageT: 0, ang: 0, speedNow: 0 };
}

/** Deterministic run-up for frozen shots. */
function simulate(t: number): void {
  const dt = 1 / 60;
  const v = view;
  const action = ACTIONS.includes(v.anim as CreatureAction) ? (v.anim as CreatureAction) : null;
  // Settle in idle first so springs are at rest, then start the action / locomotion.
  for (let i = 0; i < 30; i++) for (const a of actors) a.model.update(dt, 0);
  for (const a of actors) if (action) a.model.play(action);
  const steps = Math.round(t / dt);
  for (let i = 0; i < steps; i++) {
    for (const a of actors) {
      const sp = action ? 0 : v.speed ?? gaitSpeed(a.model.height, v.anim);
      if (sp > 0) {
        a.model.root.position.x += Math.sin(a.yaw) * sp * dt;
        a.model.root.position.z += Math.cos(a.yaw) * sp * dt;
      }
      a.model.update(dt, sp);
    }
    if (trainer) stepTrainer(dt, v.cam === 'ref' ? 4.5 : 0);
    elapsed += dt;
  }
  if (v.cam !== 'ref') {
    // Put everyone back on their slot (the pose is in place, so this is purely framing).
    for (const a of actors) {
      a.model.root.position.set(a.slot.x, ground(a.slot.x, a.slot.y), a.slot.y);
      a.model.root.updateMatrixWorld(true);
    }
  } else {
    for (const a of actors) a.model.root.position.y = ground(a.model.root.position.x, a.model.root.position.z);
  }
}

function stepTrainer(dt: number, speed: number): void {
  if (!trainer) return;
  const yaw = view.cam === 'ref' ? Math.atan2(REF_DIR.x, REF_DIR.y) : trainer.root.rotation.y;
  trainerPos.x += Math.sin(yaw) * speed * dt;
  trainerPos.z += Math.cos(yaw) * speed * dt;
  trainerPos.y = ground(trainerPos.x, trainerPos.z);
  trainer.root.position.copy(trainerPos);
  trainer.root.rotation.y = yaw;
  trainer.animate(dt, { speed, anim: speed > 0.1 ? 'walk' : 'idle', x: trainerPos.x, y: trainerPos.y, z: trainerPos.z, yaw });
  if (view.cam === 'ref' && actors[0]) {
    // Partner keeps pace beside the trainer.
    const a = actors[0];
    const side = new THREE.Vector2(REF_DIR.y, -REF_DIR.x).multiplyScalar(-1.25);
    a.model.root.position.set(trainerPos.x + side.x + REF_DIR.x * 0.6, 0, trainerPos.z + side.y + REF_DIR.y * 0.6);
    a.model.root.position.y = ground(a.model.root.position.x, a.model.root.position.z);
  }
}

// ---------------------------------------------------------------------------------------------
// Live cycle
// ---------------------------------------------------------------------------------------------

const CYCLE: { kind: string; dur: number }[] = [
  { kind: 'idle', dur: 3.5 },
  { kind: 'walk', dur: 5 },
  { kind: 'run', dur: 3 },
  { kind: 'idle', dur: 1.2 },
  { kind: 'attack', dur: 0 },
  { kind: 'idle', dur: 1.2 },
  { kind: 'special', dur: 0 },
  { kind: 'idle', dur: 1.2 },
  { kind: 'hit', dur: 0 },
  { kind: 'idle', dur: 1 },
  { kind: 'happy', dur: 0 },
  { kind: 'idle', dur: 1 },
  { kind: 'faint', dur: 0 },
  { kind: 'hold', dur: 2.5 },
];

function liveStep(dt: number): void {
  for (const a of actors) {
    let sp = 0;
    let kind = view.anim;
    if (kind === 'cycle') {
      const st = CYCLE[a.stage % CYCLE.length];
      if (a.stageT === 0 && ACTIONS.includes(st.kind as CreatureAction)) {
        const d = a.model.play(st.kind as CreatureAction);
        a.stageT = 1e-6;
        a.clock = d;
      }
      kind = st.kind;
      a.stageT += dt;
      const dur = ACTIONS.includes(st.kind as CreatureAction) ? a.clock : st.dur;
      if (a.stageT >= dur) {
        if (st.kind === 'hold') a.model.reset();
        a.stage++;
        a.stageT = 0;
      }
    } else if (ACTIONS.includes(kind as CreatureAction)) {
      a.clock -= dt;
      if (a.clock <= 0) {
        a.model.reset();
        a.clock = a.model.play(kind as CreatureAction) + (kind === 'faint' ? 2 : 1);
      }
    }
    if (kind === 'walk' || kind === 'trot' || kind === 'run') sp = view.speed ?? gaitSpeed(a.model.height, kind);
    a.speedNow += (sp - a.speedNow) * (1 - Math.exp(-4 * dt));
    // Walk loops: a circle that starts at the slot heading forward and turns left.
    const r = Math.max(0.9, a.model.radius * 2.2);
    if (a.speedNow > 0.01) a.ang += (a.speedNow * dt) / r;
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const lx = Math.cos(a.yaw);
    const lz = -Math.sin(a.yaw);
    const c = 1 - Math.cos(a.ang);
    const s = Math.sin(a.ang);
    const px = a.slot.x + (lx * c + fx * s) * r;
    const pz = a.slot.y + (lz * c + fz * s) * r;
    a.model.root.position.set(px, ground(px, pz), pz);
    a.model.root.rotation.y = a.yaw + a.ang;
    a.model.update(dt, a.speedNow);
  }
  if (trainer) stepTrainer(dt, view.cam === 'ref' ? 4.5 : 0);
}

// ---------------------------------------------------------------------------------------------
// Camera + render
// ---------------------------------------------------------------------------------------------

function frameCamera(): void {
  const v = view;
  if (!actors.length) return;
  const deg = Math.PI / 180;
  if (v.cam === 'row') {
    camera.fov = 42;
    const a0 = actors[0].slot;
    const a1 = actors[actors.length - 1].slot;
    const mid = a0.clone().add(a1).multiplyScalar(0.5);
    const span = a0.distanceTo(a1) + actors[0].model.radius + actors[actors.length - 1].model.radius + 1.5;
    const maxH = Math.max(...actors.map((a) => a.model.height));
    const dir = a1.clone().sub(a0).normalize();
    const n = new THREE.Vector2(dir.y, -dir.x);
    if (n.y > 0) n.multiplyScalar(-1);
    const hfov = 2 * Math.atan(Math.tan((camera.fov * deg) / 2) * camera.aspect);
    const d = Math.max(span / (2 * Math.tan(hfov / 2)), maxH * 2.2) * 1.02 * v.dist;
    const el = (v.el ?? 14) * deg;
    const gy = ground(mid.x, mid.y);
    camTarget.set(mid.x, gy + maxH * 0.42, mid.y);
    camera.position.set(mid.x + n.x * d * Math.cos(el), camTarget.y + d * Math.sin(el), mid.y + n.y * d * Math.cos(el));
  } else if (v.cam === 'ref' || v.cam === 'game') {
    camera.fov = 60;
    const a = actors[0].model.root;
    const fx = v.cam === 'ref' ? REF_DIR.x : Math.sin(a.rotation.y);
    const fz = v.cam === 'ref' ? REF_DIR.y : Math.cos(a.rotation.y);
    const piv = v.cam === 'ref' ? trainerPos.clone() : a.position.clone();
    piv.y += v.cam === 'ref' ? 1.5 : Math.max(0.8, a.position.y - a.position.y + actors[0].model.height * 1.2);
    const pitch = 14 * deg;
    const dist = 5.5 * v.dist;
    // Over-the-shoulder offset to the right.
    const rx = -fz;
    const rz = fx;
    camTarget.copy(piv).add(new THREE.Vector3(rx * -0.45, 0, rz * -0.45));
    camera.position.set(piv.x - fx * dist * Math.cos(pitch) - rx * 0.45, piv.y + dist * Math.sin(pitch), piv.z - fz * dist * Math.cos(pitch) - rz * 0.45);
  } else {
    const a = actors[0];
    const h = a.model.height;
    const presets: Record<string, [number, number, number]> = {
      // azimuth (deg, + towards the creature's left), elevation (deg), fov
      close: [38, 9, 32],
      front: [0, 6, 32],
      side: [90, 6, 32],
      back: [150, 12, 32],
      top: [30, 48, 32],
    };
    const [az0, el0, fov] = presets[v.cam] ?? presets.close;
    camera.fov = fov;
    const az = (v.az ?? az0) * deg;
    const el = (v.el ?? el0) * deg;
    const yaw = a.model.root.rotation.y + az;
    const ext = Math.max(h, a.model.radius * 1.5);
    const d = (ext / (0.6 * 2 * Math.tan((fov * deg) / 2))) * v.dist;
    const p = a.model.root.position;
    camTarget.set(p.x, p.y + h * 0.48, p.z);
    camera.position.set(p.x + Math.sin(yaw) * d * Math.cos(el), camTarget.y + d * Math.sin(el), p.z + Math.cos(yaw) * d * Math.cos(el));
  }
  camera.updateProjectionMatrix();
  camera.lookAt(camTarget);
  focus.copy(camTarget);
}

const tmp = new THREE.Vector3();
function draw(dt: number): void {
  world.update(dt, 10 + elapsed, focus);
  pipeline.render(dt);
  // Name tags.
  for (const a of actors) {
    if (!a.tag) continue;
    tmp.copy(a.model.root.position);
    tmp.y += a.model.height * 1.08 + 0.05;
    tmp.project(camera);
    a.tag.style.left = `${((tmp.x + 1) / 2) * innerWidth}px`;
    a.tag.style.top = `${((1 - tmp.y) / 2) * innerHeight}px`;
    a.tag.style.display = tmp.z < 1 ? '' : 'none';
  }
  const one = actors.length === 1 ? actors[0].id : null;
  const st = one ? creatureStats(one) : null;
  hud.textContent =
    `Sijord creatures · ${view.anim}${view.t !== null ? ` @ ${view.t}s` : ''} · cam ${view.cam} · ${quality}` +
    (st ? `\n${one}: ${actors[0].model.height.toFixed(2)} m · ${st.tris} tris · ${st.draws} draws` : `\n${actors.length} species`);
}

let last = performance.now();
function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (live) {
    elapsed += dt;
    liveStep(dt);
    if (view.cam !== 'row') frameCamera();
    draw(dt);
  }
  requestAnimationFrame(loop);
}

(window as unknown as { gallery: unknown }).gallery = {
  show: (p: Params): Promise<number> => {
    stage(parseView(p));
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(ready))));
  },
  species: MODELLED_SPECIES,
};

stage(view);
requestAnimationFrame(loop);
