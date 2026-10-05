import * as THREE from 'three';
import { hashString, type BaseInit, type Clip } from './core';
import { quadClips } from './clips';
import { Kit, cloneTemplate, remap } from './kit';
import { SPECIES, fallbackSpecies, type Built, type SpeciesDef } from './species';

/**
 * Procedural creature models for Sijord's species, built in code on shared body plans
 * (quadruped, pinniped, bird, bug) with per-species parts and palettes, and animated
 * procedurally: distance-driven gaits with planted feet, idle life (breathing, blinking, looks,
 * fidgets), spring-driven ears / tails / extras, and keyed battle actions.
 *
 * Each species is built once into a template (one skinned mesh per material) and cloned per
 * instance; templates are reference counted and freed when the last instance is disposed.
 */

export type CreatureAction = 'attack' | 'special' | 'hit' | 'faint' | 'happy';

export interface CreatureModel {
  /** Origin at the feet, model faces +Z (same convention as the trainer). */
  readonly root: THREE.Group;
  /** Approximate standing height in metres (for floating HP bars / name tags). */
  readonly height: number;
  /** Footprint radius in metres (for spacing and collision). */
  readonly radius: number;
  /** Call every frame. `speed` is ground speed in m/s and blends idle -> walk -> run. */
  update(dt: number, speed: number): void;
  /** Start a one-shot action; returns its duration in seconds. 'faint' holds its final pose until reset(). */
  play(action: CreatureAction): number;
  /** Back to idle (e.g. after being healed from faint). */
  reset(): void;
  dispose(): void;
}

/** All species ids that have a model. */
export const MODELLED_SPECIES: string[] = [
  'fernfawn',
  'bramblebuck',
  'elkwarden',
  'cindlet',
  'pyrolynx',
  'forgelynx',
  'splashpup',
  'sealkin',
  'selkira',
  'finchlet',
  'fjordling',
  'skjaldhawk',
  'nibblet',
  'stashquill',
  'dewmite',
  'cocoonch',
  'auroramoth',
  'cloveret',
  'luckhare',
  'hjordpup',
  'shepherion',
];

interface Template {
  id: string;
  def: SpeciesDef;
  root: THREE.Group;
  built: Built;
  clips: Record<CreatureAction, Clip>;
  S: number;
  scale: number;
  radius: number;
  tris: number;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  refs: number;
}

const templates = new Map<string, Template>();
let instanceCounter = 0;

function buildTemplate(id: string): Template {
  const def = SPECIES[id] ?? fallbackSpecies();
  const k = new Kit(id);
  const built = def.build(k);
  const box = k.measure();
  const S = Math.max(1e-3, box.max.y);
  const scale = def.height / S;
  const radius = (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2) * scale;
  const { tris } = k.consolidate();
  k.scaled.scale.setScalar(scale);
  const cp = built.clipParams(S);
  const clips = (built.clips ?? quadClips)(cp);
  return {
    id,
    def,
    root: k.root,
    built,
    clips,
    S,
    scale,
    radius,
    tris,
    materials: k.materials,
    geometries: k.geometries,
    refs: 0,
  };
}

function acquire(id: string): Template {
  let t = templates.get(id);
  if (!t) {
    t = buildTemplate(id);
    templates.set(id, t);
  }
  t.refs++;
  return t;
}

function release(t: Template): void {
  t.refs--;
  if (t.refs > 0) return;
  templates.delete(t.id);
  for (const g of t.geometries) g.dispose();
  for (const m of t.materials) m.dispose();
}

export function createCreatureModel(speciesId: string): CreatureModel {
  const id = speciesId.toLowerCase();
  const t = acquire(id);
  const { root, meshes, lookup } = cloneTemplate(t.root);
  root.name = `creature:${id}`;
  const scaled = root.getObjectByName('scaled') as THREE.Group;
  const rig = remap(t.built.rig, lookup);
  let released = false;
  const init: BaseInit = {
    root,
    scaled,
    meshes,
    S: t.S,
    scale: t.scale,
    height: t.def.height,
    radius: t.radius,
    element: t.def.element,
    seed: (hashString(id) + instanceCounter++ * 7919) >>> 0,
    centreY: t.built.centreY,
    clips: t.clips,
    fidgets: t.built.fidgets,
    onDispose: () => {
      if (released) return;
      released = true;
      release(t);
    },
  };
  return t.built.create(init, rig);
}

/** Debug info for the gallery and tests: triangle count and draw calls of a species' template. */
export function creatureStats(speciesId: string): { tris: number; draws: number; scale: number; S: number } {
  const t = acquire(speciesId.toLowerCase());
  const draws = t.root.getObjectByName('scaled')!.children.filter((c) => (c as THREE.Mesh).isMesh).length;
  const out = { tris: t.tris, draws, scale: t.scale, S: t.S };
  release(t);
  return out;
}
