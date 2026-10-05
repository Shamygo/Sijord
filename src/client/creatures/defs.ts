import * as THREE from 'three';
import { smoothstep } from '../player/anim-math';
import { quadClips, fidgets, type ClipParams, type FidgetName } from './clips';
import type { BaseInit, Clip, CreatureBase } from './core';
import type { CreatureAction } from './index';
import { blob, facing, layered, mul, along, solid, type Mask, type Paint, type V3 } from './geo';
import type { Kit } from './kit';
import { addTail, addTufts, blobPart, type JiggleSpec } from './parts';
import { QuadModel, buildQuad, quadClipParams, type LegPaint, type QuadDef } from './quadruped';

/** What a species builder hands back: plan rig data plus how to animate it. */
export interface Built {
  /** Plan-specific rig data; Object3D references are remapped onto each instance's bones. */
  rig: object;
  create(init: BaseInit, rig: object): CreatureBase;
  clipParams(S: number): ClipParams;
  clips?: (p: ClipParams) => Record<CreatureAction, Clip>;
  fidgets: Clip[];
  /** Height of the special-move burst centre (design units). */
  centreY: number;
}

export interface SpeciesDef {
  /** Standing height in metres. */
  height: number;
  /** Element colour for the special-move glow and burst. */
  element: string;
  build(k: Kit): Built;
}

export const EL = {
  grass: '#7bea4c',
  fire: '#ff7a1c',
  water: '#38b6ff',
  fairy: '#ff9ce8',
  normal: '#fff1c9',
  bug: '#b8f04a',
  psychic: '#d77bff',
  steel: '#ffb35c',
  flying: '#bfe8ff',
  fighting: '#ffb070',
  ground: '#e0b060',
};

/** Builds a quadruped and wires its rig + clip params into a Built. */
export function quadBuilt(k: Kit, def: QuadDef, fid: FidgetName[]): Built {
  const rig = buildQuad(k, def);
  return {
    rig,
    create: (init, r) => new QuadModel(init, r as never),
    clipParams: (S) => quadClipParams(rig, S),
    clips: quadClips,
    fidgets: fidgets(...fid),
    centreY: def.bodyY,
  };
}

/** Leg gradient: colour `top` above `from`, `bottom` below `to`, and a paw colour. */
export function legGrad(top: string, bottom: string, from: number, to: number, pawC?: string, pawFrom = 0.93): LegPaint {
  const a = new THREE.Color(top);
  const b = new THREE.Color(bottom);
  const c = pawC ? new THREE.Color(pawC) : null;
  return (f, _p, _n, out) => {
    out.copy(a).lerp(b, smoothstep(from, to, f));
    if (c) out.lerp(c, smoothstep(pawFrom - 0.06, pawFrom + 0.02, f));
  };
}

/** A fluffy collar: overlapping soft blobs around the neck base with a soft hem. */
export function collarRuff(k: Kit, chest: THREE.Bone, at: V3, w: number, color: string, under?: string): void {
  const p = under ? layered(color, { color: under, mask: facing(0, 1, -0.4, 0.2, 0.8), k: 0.6 }) : solid(color);
  const [x0, y0, z0] = at;
  const blobs: [V3, V3][] = [
    [[0, 0.1 * w, 0.95 * w], [0.75 * w, 0.85 * w, 0.62 * w]],
    [[0.6 * w, 0.3 * w, 0.6 * w], [0.55 * w, 0.75 * w, 0.6 * w]],
    [[-0.6 * w, 0.3 * w, 0.6 * w], [0.55 * w, 0.75 * w, 0.6 * w]],
    [[0, -0.55 * w, 0.85 * w], [0.6 * w, 0.6 * w, 0.55 * w]],
  ];
  for (const [pp, rr] of blobs) blobPart(k, chest, rr, [x0 + pp[0], y0 + pp[1], z0 + pp[2]], p, 'fur', undefined, 'sm');
  for (const sx of [1, -1]) blobPart(k, chest, [0.42 * w, 0.42 * w, 0.4 * w], [x0 + sx * 0.32 * w, y0 - 0.8 * w, z0 + 0.72 * w], p, 'fur', undefined, 'sm');
}

/**
 * A fox-style chest fluff: one smooth cream bib with a fringe of soft pointed tufts along its
 * lower edge (reads as a single fluffy mass, not a cluster of lumps).
 */
export function fluffBib(k: Kit, chest: THREE.Bone, at: V3, w: number, color: string, shade?: string): void {
  const p = shade ? layered(color, { color: shade, mask: facing(0, -1, 0.2, 0.3, 0.9), k: 0.35 }) : solid(color);
  const [x0, y0, z0] = at;
  blobPart(k, chest, [0.86 * w, 0.95 * w, 0.62 * w], [x0, y0 - 0.05 * w, z0 + 0.72 * w], p, 'fur', [-0.25, 0, 0], 'mid');
  addTufts(
    k,
    chest,
    [
      { pos: [x0, y0 - 0.55 * w, z0 + 0.95 * w], dir: [0, -1, 0.5], r: 0.44 * w, len: 0.62 * w, curl: 0.1 * w },
      { pos: [x0 + 0.42 * w, y0 - 0.45 * w, z0 + 0.85 * w], dir: [0.5, -1, 0.4], r: 0.4 * w, len: 0.56 * w, curl: 0.1 * w },
      { pos: [x0 - 0.42 * w, y0 - 0.45 * w, z0 + 0.85 * w], dir: [-0.5, -1, 0.4], r: 0.4 * w, len: 0.56 * w, curl: 0.1 * w },
      { pos: [x0 + 0.7 * w, y0 - 0.1 * w, z0 + 0.55 * w], dir: [1, -0.6, 0.1], r: 0.38 * w, len: 0.5 * w, curl: 0.08 * w },
      { pos: [x0 - 0.7 * w, y0 - 0.1 * w, z0 + 0.55 * w], dir: [-1, -0.6, 0.1], r: 0.38 * w, len: 0.5 * w, curl: 0.08 * w },
    ],
    p,
  );
}

/** A mane of soft tufts along the top of the neck / shoulders. */
export function mane(k: Kit, bone: THREE.Bone, from: V3, to: V3, n: number, r: number, len: number, p: Paint, lean = -0.6): void {
  const list = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const pos: V3 = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
    list.push({ pos, dir: [0, 1, lean] as V3, r: r * (1 - 0.25 * Math.abs(t - 0.4)), len: len * (1 - 0.2 * Math.abs(t - 0.4)), curl: -len * 0.25 });
  }
  addTufts(k, bone, list, p);
}

/** Standard 4-bone bushy tail sweeping back and up. */
export function bushyTail(pos: V3, len: number, r: number, base: string, tip: string, tipFrom = 0.7, lift = 0.6, ratio = 1, bones = 4) {
  return (k: Kit, pelvis: THREE.Bone): { bones: THREE.Bone[]; jiggles: JiggleSpec[] } => {
    const pts: V3[] = [
      [0, 0, 0],
      [0, len * 0.25 * lift, -len * 0.35],
      [0, len * 0.6 * lift, -len * 0.62],
      [0, len * 1.0 * lift, -len * 0.75],
    ];
    const tipP = new THREE.Vector3(pos[0] + pts[3][0], pos[1] + pts[3][1], pos[2] + pts[3][2]);
    const span = len * (1 - tipFrom) * 1.6;
    return addTail(k, pelvis, {
      pos,
      pts,
      radius: [
        [0, r * 0.45],
        [0.3, r * 0.85],
        [0.62, r],
        [0.88, r * 0.72],
        [1, r * 0.25],
      ],
      bones,
      ratio,
      paint: layered(base, { color: tip, mask: (p) => 1 - smoothstep(span * 0.7, span, p.distanceTo(tipP)) }),
    });
  };
}

/** A short tail (deer flag, rabbit puff, bob): one or two bones. */
export function shortTail(pos: V3, len: number, r: number, paint: Paint, up = 0.6, bones = 2) {
  return (k: Kit, pelvis: THREE.Bone): { bones: THREE.Bone[]; jiggles: JiggleSpec[] } =>
    addTail(k, pelvis, {
      pos,
      pts: [
        [0, 0, 0],
        [0, len * 0.5 * up, -len * 0.6],
        [0, len * up, -len * 0.9],
      ],
      radius: [
        [0, r * 0.7],
        [0.45, r],
        [1, r * 0.55],
      ],
      bones,
      radial: 9,
      segs: 5,
      paint,
      jiggle: { freq: 12, zeta: 0.35 },
    });
}

/** Common torso paint: top colour, optional darker back, cream belly. */
export function torsoPaint(
  top: string,
  belly: string,
  opts: { back?: string; backK?: number; bellyY?: number; soft?: number; extra?: { color: string; mask: Mask; k?: number }[] } = {},
): Paint {
  const layers: { color: string; mask: Mask; k?: number }[] = [];
  if (opts.back) layers.push({ color: opts.back, mask: facing(0, 1, -0.2, 0.3, 0.9), k: opts.backK ?? 0.5 });
  const by = opts.bellyY ?? 0;
  const soft = opts.soft ?? 0.03;
  layers.push({ color: belly, mask: mul(facing(0, -1, 0.2, -0.15, 0.4), along('y', by + soft * 0.3, by - soft)) });
  if (opts.extra) layers.push(...opts.extra);
  return layered(top, ...layers);
}

export { blob };
