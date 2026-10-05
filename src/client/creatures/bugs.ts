import * as THREE from 'three';
import { smoothstep } from '../player/anim-math';
import { clip, type Clip } from './core';
import { fidgets, hoverClips, quadClips } from './clips';
import { BugModel, bugClipParams, solveBugLeg, type BugLeg, type BugRig } from './bug';
import type { Built } from './defs';
import { along, blob, ellipsoid, facing, layered, leaf, loft, mul, paint, panel, solid, sweep, type Paint, type Sec, type V3 } from './geo';
import { chainWeights, skin, type Kit } from './kit';
import { addEyes, addTufts, blobPart, type JiggleSpec } from './parts';

/** Bug-type species: Dewmite, Cocoonch, Auroramoth. */

const _up = new THREE.Vector3(0, 1, 0);

function bugBuilt(rig: BugRig, fid: Clip[], centreY: number, hover = false): Built {
  return {
    rig,
    create: (init, r) => new BugModel(init, r as never),
    clipParams: (S) => bugClipParams(rig, S),
    clips: hover ? hoverClips : quadClips,
    fidgets: fid,
    centreY,
  };
}

/** A small "w" mouth on a face (head-bone space). */
function smallMouth(k: Kit, bone: THREE.Object3D, at: V3, R: number, color = '#3a2228'): void {
  for (const s of [1, -1]) {
    const g = sweep(
      [
        [at[0], at[1], at[2]],
        [at[0] + s * 0.06 * R, at[1] - 0.06 * R, at[2] - 0.01 * R],
        [at[0] + s * 0.13 * R, at[1] - 0.03 * R, at[2] - 0.03 * R],
      ],
      0.016 * R,
      { radial: 5, segs: 5, capRings: 2 },
    );
    paint(g, solid(color));
    k.add(g, 'soft', bone);
  }
}

/** A springy antenna with a ball tip (optionally glowing). Returns the jiggle spec. */
function antenna(k: Kit, parent: THREE.Bone, name: string, side: number, base: V3, pts: V3[], r: number, stalk: Paint, tip: Paint, tipKind: 'gloss' | 'glow' = 'gloss', glow?: THREE.Bone[]): JiggleSpec {
  const b = k.bone(parent, name, base[0], base[1], base[2]);
  const g = sweep(pts, [
    [0, r],
    [1, r * 0.6],
  ], { radial: 5, segs: 6, capRings: 1 });
  paint(g, stalk);
  k.add(g, 'soft', b);
  const end = pts[pts.length - 1];
  const tb = k.bone(b, `${name}Tip`, end[0], end[1], end[2]);
  blobPart(k, tb, [r * 2.3, r * 2.3, r * 2.3], [0, 0, 0], tip, tipKind, undefined, 'sm');
  if (glow) glow.push(tb);
  return { bone: b, tip: new THREE.Vector3(end[0], end[1], end[2]), opts: { freq: 9, zeta: 0.22, gain: 0.03, limit: 0.7 }, role: 'antenna', side, delay: side > 0 ? 0 : 1.3 };
}

// ---------------------------------------------------------------------------------------------
// Dewmite
// ---------------------------------------------------------------------------------------------

export function dewmite(k: Kit): Built {
  const mint = '#8fdcb2';
  const stripe = '#5cbf8e';
  const pale = '#e6f8ec';
  const legC = '#4a9670';
  const bodyY = 0.075;
  const body = k.bone(k.scaled, 'body', 0, bodyY, 0);
  // Round abdomen with soft back stripes and a pale belly.
  const ab = ellipsoid(0.078, 0.066, 0.085, 'hi');
  paint(
    ab,
    layered(
      mint,
      { color: stripe, mask: (p, n) => Math.pow(Math.max(0, Math.sin(p.z * 70)), 3) * smoothstep(0.2, 0.7, n.y) * 0.8 },
      { color: pale, mask: facing(0, -1, 0, 0.0, 0.6) },
    ),
  );
  k.add(ab, 'fur', body, { pos: [0, 0, -0.01] });
  const tailSeg = k.bone(body, 'abdomen', 0, 0, -0.01);
  // Head.
  const head = k.bone(body, 'head', 0, 0.012, 0.07);
  const R = 0.052;
  const hc: V3 = [0, 0.01, 0.02];
  const hr: V3 = [R * 1.08, R, R * 0.95];
  blobPart(k, head, hr, hc, layered('#a8ecc6', { color: pale, mask: mul(facing(0, -0.6, 1, 0.1, 0.6), along('y', 0.0, -0.03)) }), 'fur', undefined, 'hi');
  const eyes = addEyes(k, head, { on: { c: hc, r: hr }, yaw: 0.45, pitch: 0.12, size: 0.34 * R, tall: 1.18, iris: '#1d6a70', inset: 0.42, toward: 0.4 });
  for (const s of [1, -1]) blobPart(k, head, [0.17 * R, 0.11 * R, 0.06 * R], [s * 0.62 * R, hc[1] - 0.3 * R, hc[2] + 0.72 * R], solid('#ffb0b8'), 'soft', [0, s * 0.7, 0], 'tiny');
  smallMouth(k, head, [0, hc[1] - 0.38 * R, hc[2] + 0.93 * R], R);
  const glow: THREE.Bone[] = [];
  const jiggles: JiggleSpec[] = [];
  for (const s of [1, -1]) {
    jiggles.push(
      antenna(k, head, s > 0 ? 'antL' : 'antR', s, [s * 0.35 * R, hc[1] + 0.8 * R, hc[2] + 0.3 * R], [[0, 0, 0], [s * 0.2 * R, 0.6 * R, 0.25 * R], [s * 0.45 * R, 1.0 * R, 0.15 * R]], 0.05 * R, solid(legC), solid('#bff5d6')),
    );
  }
  // Dew drop on the back, cradled by two little leaves; it wobbles on a spring.
  const dew = k.bone(body, 'dew', 0, 0.058, -0.012);
  const drop = ellipsoid(0.046, 0.05, 0.046, 'mid');
  // Teardrop: pull the top up into a point.
  {
    const pos = drop.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) {
        const f = y / 0.05;
        pos.setY(i, y * (1 + 0.55 * f * f));
        pos.setX(i, pos.getX(i) * (1 - 0.55 * f * f * f));
        pos.setZ(i, pos.getZ(i) * (1 - 0.55 * f * f * f));
      }
    }
    drop.computeVertexNormals();
  }
  paint(drop, layered('#9fe2ff', { color: '#e8fbff', mask: facing(-0.4, 1, 0.4, 0.4, 1), k: 0.8 }, { color: '#4ab0e8', mask: facing(0, -1, 0, 0, 1), k: 0.6 }));
  k.add(drop, 'water', dew, { pos: [0, 0.048, 0] });
  k.add(ellipsoid(0.011, 0.016, 0.006, 'tiny'), 'glint', dew, { pos: [-0.016, 0.07, 0.036], rot: [0, -0.4, 0.3] });
  for (const s of [1, -1]) {
    const lg = leaf(0.022, 0.06, 0.003, 0.4, 0.45, 6, 6);
    paint(lg, layered('#4fb04a', { color: '#9be070', mask: along('y', 0.0, 0.05) }));
    const m = k.add(lg, 'leaf', dew, { pos: [s * 0.008, 0.005, 0] });
    m.quaternion.setFromUnitVectors(_up, new THREE.Vector3(s * 1, 0.55, 0).normalize());
  }
  jiggles.push({ bone: dew, tip: new THREE.Vector3(0, 0.1, 0), opts: { freq: 13, zeta: 0.18, gain: 0.02, limit: 0.5 }, role: 'misc', side: 0 });

  // Six legs, alternating tripods.
  const legs: BugLeg[] = [];
  const l1 = 0.045;
  const l2 = 0.052;
  const upperG = sweep([[0, 0, 0], [0, -l1 * 0.5, 0], [0, -l1, 0]], [
    [0, 0.011],
    [1, 0.0085],
  ], { radial: 6, segs: 2, capRings: 2 });
  paint(upperG, solid(legC));
  const lowerG = sweep([[0, 0, 0], [0, -l2 * 0.5, 0], [0, -l2, 0]], [
    [0, 0.0085],
    [1, 0.005],
  ], { radial: 6, segs: 2, capRings: 2 });
  paint(lowerG, solid(legC));
  const rows: [number, number, number][] = [
    [0.042, 0.07, 0.095],
    [0.0, 0.0, 0.115],
    [-0.042, -0.07, 0.1],
  ];
  rows.forEach(([hz, fz, fx], row) => {
    for (const side of [1, -1]) {
      const hip = k.bone(body, `leg${row}${side > 0 ? 'L' : 'R'}`, side * 0.058, -0.022, hz);
      const upper = k.bone(hip, `leg${row}${side > 0 ? 'L' : 'R'}Up`, 0, 0, 0);
      const lower = k.bone(upper, `leg${row}${side > 0 ? 'L' : 'R'}Lo`, 0, -l1, 0);
      k.add(upperG, 'soft', upper);
      k.add(lowerG, 'soft', lower);
      blobPart(k, lower, [0.009, 0.007, 0.011], [0, -l2, 0.003], solid('#3f7f5e'), 'soft', undefined, 'tiny');
      const group = (row + (side > 0 ? 0 : 1)) % 2;
      legs.push({ hip, upper, lower, l1, l2, foot: [side * fx, 0.007, fz], group, side });
    }
  });
  const rig: BugRig = {
    mode: 'mite',
    body,
    head,
    eyes,
    glow,
    jiggles,
    bodyY,
    hoverY: bodyY,
    halfWidth: 0.08,
    legs,
    spine: [],
    segH: 0,
    wings: [],
    wingRest: [],
    tailSeg,
    size: 0.17,
    headRest: new THREE.Euler(0, 0, 0, 'YXZ'),
  };
  const ft = new THREE.Vector3();
  for (const leg of legs) solveBugLeg(leg, body, ft.set(leg.foot[0], leg.foot[1], leg.foot[2]));
  return bugBuilt(rig, fidgets('look', 'tilt', 'sniff', 'shake', 'hop', 'tilt', 'scratch'), bodyY);
}

// ---------------------------------------------------------------------------------------------
// Cocoonch
// ---------------------------------------------------------------------------------------------

const WRIGGLE = clip(1.4, {
  SHAKE: [[0, 0], [0.15, 0.7], [0.9, 0.6], [1.2, 0]],
  SQUASH: [[0, 0], [0.2, -0.06], [0.45, 0.05], [0.7, -0.05], [0.95, 0.03], [1.2, 0]],
  EYES: [[0, 0], [0.1, 0.9], [1.0, 0.9], [1.2, 0]],
});
const PEEK = clip(2.2, {
  HEAD_P: [[0, 0], [0.4, -0.25], [1.4, -0.22], [1.9, 0]],
  HEAD_Y: [[0, 0], [0.5, 0.5], [1.1, -0.45], [1.8, 0]],
  NECK: [[0, 0], [0.4, 0.25], [1.5, 0.25], [2.0, 0]],
  CURIOUS: [[0, 0], [0.3, 1], [1.6, 1], [2.1, 0]],
});
const BOUNCE = clip(1.1, {
  Y: [[0, 0], [0.12, -0.02], [0.28, 0.08], [0.45, 0], [0.55, -0.015], [0.7, 0.05], [0.85, 0], [1.0, 0]],
  SQUASH: [[0, 0], [0.12, -0.1], [0.26, 0.08], [0.45, -0.1], [0.55, -0.04], [0.68, 0.06], [0.85, -0.07], [1.0, 0]],
});

export function cocoonch(k: Kit): Built {
  const moss = '#6e9c3c';
  const mossDark = '#4c7428';
  const mossLight = '#a8cc62';
  const silk = '#efe7cf';
  const body = k.bone(k.scaled, 'body', 0, 0, 0);
  const segH = 0.17;
  const spine: THREE.Bone[] = [];
  let prev: THREE.Object3D = body;
  for (let i = 0; i < 3; i++) {
    const b = k.bone(prev, `seg${i}`, 0, i === 0 ? 0 : segH, 0);
    spine.push(b);
    prev = b;
  }
  // Pod: a loft up +Y, skinned along the spine.
  const prof: [number, number][] = [
    [0.0, 0.085],
    [0.05, 0.15],
    [0.14, 0.188],
    [0.25, 0.195],
    [0.36, 0.178],
    [0.45, 0.14],
    [0.52, 0.085],
    [0.56, 0.04],
  ];
  const secs: Sec[] = prof.map(([y, r]) => ({ t: y, w: r, h: r * 1.02, hb: r * 0.95 }));
  const pod = loft(secs, { axis: 'y', radial: 20, rings: 18, cap0: 0.03, cap1: 0.035, capRings: 3 });
  skin(pod, (p, _i, out) => chainWeights(p.y, [-1, segH, segH * 2], segH * 0.4, out));
  const podPaint: Paint = (p, n, out) => {
    out.set(moss);
    // Mottled moss, a darker base and silk threads wrapped diagonally.
    const mott = 0.5 + 0.5 * Math.sin(p.x * 60 + p.y * 40) * Math.sin(p.z * 55 - p.y * 30);
    out.lerp(new THREE.Color(mossLight), smoothstep(0.55, 0.9, mott) * 0.6 * smoothstep(-0.2, 0.6, n.y + 0.4));
    out.lerp(new THREE.Color(mossDark), smoothstep(0.12, 0.0, p.y) * 0.7);
    const a = Math.atan2(p.x, p.z);
    const band = Math.pow(Math.max(0, Math.sin(p.y * 38 + a * 2)), 14);
    out.lerp(new THREE.Color(silk), band * 0.85);
  };
  paint(pod, podPaint);
  k.addSkinned(pod, 'fur', body, [spine[0], spine[1], spine[2]]);
  // Face peeking out of an opening near the top.
  const head = k.bone(spine[2], 'head', 0, 0.06, 0.14);
  head.rotation.x = -0.15;
  const R = 0.11;
  const fc: V3 = [0, 0, 0];
  const fr: V3 = [0.95 * R, 0.85 * R, 0.5 * R];
  blobPart(k, head, fr, fc, layered('#e2f0bc', { color: '#c8e09a', mask: facing(0, 1, 0, 0.3, 1), k: 0.5 }), 'fur', undefined, 'mid');
  // Moss hood rim around the face.
  const rimPts: V3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rimPts.push([Math.sin(a) * fr[0] * 1.05, Math.cos(a) * fr[1] * 1.05, -0.02 * R - 0.05 * R * Math.cos(a)]);
  }
  const rim = sweep(rimPts, 0.17 * R, { radial: 7, segs: 24, ratio: 0.8, capRings: 1, cap0: 0.1, cap1: 0.1 });
  paint(rim, layered(moss, { color: mossLight, mask: facing(0, 1, 0.3, 0.2, 1), k: 0.6 }));
  k.add(rim, 'fur', head);
  const eyes = addEyes(k, head, { on: { c: fc, r: fr }, yaw: 0.36, pitch: 0.08, size: 0.3 * R, tall: 1.2, iris: '#3c6a20', inset: 0.38, toward: 0.2 });
  for (const s of [1, -1]) blobPart(k, head, [0.15 * R, 0.09 * R, 0.05 * R], [s * 0.55 * R, -0.3 * R, 0.4 * R], solid('#ffb6a8'), 'soft', undefined, 'tiny');
  smallMouth(k, head, [0, -0.38 * R, 0.46 * R], R);
  // Wrapped leaves and a sprout on top.
  const leafP = layered('#4f8f30', { color: '#8ccf58', mask: along('y', 0, 0.12) });
  const wraps: [number, number, number, number][] = [
    [0, 0.1, 0.7, 2.2],
    [1, 0.04, -0.9, 2.6],
    [0, 0.06, 2.6, 2.3],
    [1, 0.1, 1.9, 2.0],
  ];
  for (const [si, y, a, tilt] of wraps) {
    const lg = leaf(0.07, 0.2, 0.006, -0.5, 0.45, 8, 8);
    paint(lg, leafP);
    const r0 = prof[2][1] * 0.98;
    const m = k.add(lg, 'leaf', spine[si], { pos: [Math.sin(a) * r0, y, Math.cos(a) * r0] });
    m.rotation.set(0, a, tilt - Math.PI / 2, 'YXZ');
  }
  const sprout = k.bone(spine[2], 'sprout', 0, prof[7][0] - segH * 2 + 0.03, 0);
  const jiggles: JiggleSpec[] = [];
  for (const [dx, dir] of [
    [0.01, [0.8, 1, 0.1]],
    [-0.01, [-0.7, 1, -0.2]],
  ] as const) {
    const lg = leaf(0.035, 0.1, 0.004, 0.3, 0.45, 6, 6);
    paint(lg, leafP);
    const m = k.add(lg, 'leaf', sprout, { pos: [dx, 0, 0] });
    m.quaternion.setFromUnitVectors(_up, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
  }
  const st = sweep([[0, -0.02, 0], [0, 0.01, 0]], 0.007, { radial: 5, segs: 2, capRings: 1 });
  paint(st, solid('#5a8a2a'));
  k.add(st, 'leaf', sprout);
  jiggles.push({ bone: sprout, tip: new THREE.Vector3(0, 0.08, 0), opts: { freq: 10, zeta: 0.2, gain: 0.03, limit: 0.7 }, role: 'misc', side: 0 });
  const rig: BugRig = {
    mode: 'cocoon',
    body,
    head,
    eyes,
    glow: [],
    jiggles,
    bodyY: 0,
    hoverY: 0,
    halfWidth: 0.19,
    legs: [],
    spine,
    segH,
    wings: [],
    wingRest: [],
    tailSeg: null,
    size: 0.56,
    headRest: new THREE.Euler(-0.15, 0, 0, 'YXZ'),
  };
  return bugBuilt(rig, [WRIGGLE, PEEK, BOUNCE, ...fidgets('look', 'tilt')], 0.3);
}

// ---------------------------------------------------------------------------------------------
// Auroramoth
// ---------------------------------------------------------------------------------------------

/** Aurora band paint across a wing (distance from the wing root, normalised by span). */
function auroraPaint(span: number, eyeAt: [number, number] | null): Paint {
  const stops: [number, THREE.Color][] = [
    [0.0, new THREE.Color('#2a2a78')],
    [0.2, new THREE.Color('#2b3f9a')],
    [0.34, new THREE.Color('#38f0a0')],
    [0.46, new THREE.Color('#2ad8f0')],
    [0.6, new THREE.Color('#6a5cff')],
    [0.76, new THREE.Color('#ff6fd0')],
    [0.9, new THREE.Color('#ffc2ec')],
    [1.0, new THREE.Color('#fff6fc')],
  ];
  const tmp = new THREE.Color();
  return (p, _n, out) => {
    // The wing lies in XZ after orientation; the outline was drawn in XY (y = forward).
    const d = Math.hypot(p.x, p.z * 0.9) / span + 0.04 * Math.sin(p.x * 40 + p.z * 25);
    out.copy(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      if (d >= a && d <= b) {
        out.copy(ca).lerp(cb, smoothstep(a, b, d));
        break;
      }
      if (d > b) out.copy(cb);
    }
    if (eyeAt) {
      const e = Math.hypot(p.x - eyeAt[0] * span, p.z - eyeAt[1] * span) / span;
      if (e < 0.13) out.copy(tmp.set('#141a38').lerp(new THREE.Color('#ffe9a8'), smoothstep(0.07, 0.1, e) * (1 - smoothstep(0.1, 0.13, e))));
    }
    // Veins.
    const a = Math.atan2(p.z, p.x);
    const vein = Math.pow(Math.max(0, Math.cos(a * 9)), 40) * smoothstep(0.15, 0.4, d);
    out.multiplyScalar(1 - vein * 0.35);
  };
}

export function auroramoth(k: Kit): Built {
  const fluff = '#f2eeff';
  const thoraxC = '#6f5fa8';
  const bodyY = 0.13;
  const hoverY = 0.5;
  const body = k.bone(k.scaled, 'body', 0, hoverY, 0);
  // Fluffy thorax and collar.
  blobPart(k, body, [0.085, 0.085, 0.1], [0, 0, 0], layered(thoraxC, { color: fluff, mask: facing(0, 0.3, 1, 0.0, 0.7) }), 'fur', undefined, 'mid');
  addTufts(
    k,
    body,
    [
      { pos: [0, 0.05, 0.07], dir: [0, 0.6, 1], r: 0.05, len: 0.09, curl: 0.02 },
      { pos: [0.05, 0.03, 0.06], dir: [0.7, 0.3, 1], r: 0.045, len: 0.08, curl: 0.02 },
      { pos: [-0.05, 0.03, 0.06], dir: [-0.7, 0.3, 1], r: 0.045, len: 0.08, curl: 0.02 },
      { pos: [0.04, -0.03, 0.07], dir: [0.5, -0.6, 1], r: 0.04, len: 0.07, curl: 0.02 },
      { pos: [-0.04, -0.03, 0.07], dir: [-0.5, -0.6, 1], r: 0.04, len: 0.07, curl: 0.02 },
      { pos: [0, 0.07, 0.0], dir: [0, 1, -0.3], r: 0.045, len: 0.07, curl: -0.02 },
    ],
    solid(fluff),
  );
  // Abdomen: striped, tapering back.
  const abd = k.bone(body, 'abdomen', 0, -0.015, -0.07);
  const ag = loft(
    [
      { t: -0.3, w: 0.022, h: 0.022 },
      { t: -0.24, w: 0.045, h: 0.045 },
      { t: -0.13, w: 0.068, h: 0.066 },
      { t: -0.03, w: 0.072, h: 0.07 },
      { t: 0.0, w: 0.06, h: 0.06 },
    ],
    { radial: 14, rings: 12, capRings: 3 },
  );
  paint(ag, (p, n, out) => {
    const band = Math.pow(Math.max(0, Math.sin(p.z * 70)), 2);
    out.set('#7a62c0').lerp(new THREE.Color('#47c9c8'), band * 0.8).lerp(new THREE.Color(fluff), smoothstep(0.0, -0.8, n.y) * 0.5);
  });
  k.add(ag, 'fur', abd);
  // Head with big glossy eyes and feathery antennae.
  const head = k.bone(body, 'head', 0, 0.035, 0.1);
  const R = 0.07;
  const hc: V3 = [0, 0.01, 0.02];
  const hr: V3 = [R * 1.05, R * 0.95, R * 0.9];
  blobPart(k, head, hr, hc, layered(fluff, { color: '#d8ccff', mask: facing(0, 1, -0.3, 0.2, 0.9), k: 0.5 }), 'fur', undefined, 'hi');
  const eyes = addEyes(k, head, { on: { c: hc, r: hr }, yaw: 0.5, pitch: 0.1, size: 0.36 * R, tall: 1.15, iris: '#43d8c0', inset: 0.42, toward: 0.35 });
  for (const s of [1, -1]) blobPart(k, head, [0.16 * R, 0.1 * R, 0.06 * R], [s * 0.6 * R, hc[1] - 0.32 * R, hc[2] + 0.7 * R], solid('#ffb8e0'), 'soft', [0, s * 0.7, 0], 'tiny');
  smallMouth(k, head, [0, hc[1] - 0.42 * R, hc[2] + 0.86 * R], R);
  const glow: THREE.Bone[] = [];
  const jiggles: JiggleSpec[] = [];
  for (const s of [1, -1]) {
    const pts: V3[] = [
      [0, 0, 0],
      [s * 0.25 * R, 1.1 * R, 0.35 * R],
      [s * 0.75 * R, 2.2 * R, 0.25 * R],
      [s * 1.3 * R, 2.8 * R, -0.15 * R],
    ];
    const spec = antenna(k, head, s > 0 ? 'antL' : 'antR', s, [s * 0.35 * R, hc[1] + 0.75 * R, hc[2] + 0.3 * R], pts, 0.05 * R, solid('#4a3a7a'), layered('#7ff0d0', { color: '#ffffff', mask: facing(0, 1, 1, 0.3, 1), k: 0.6 }), 'glow', glow);
    jiggles.push(spec);
    // Feathery side barbs along the antenna.
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])), false, 'centripetal');
    const barbs = [];
    for (let i = 1; i <= 5; i++) {
      const u = 0.15 + i * 0.14;
      const q = curve.getPointAt(u);
      barbs.push({ pos: [q.x, q.y, q.z] as V3, dir: [s * 0.6, 0.2, 1] as V3, r: 0.07 * R, len: 0.45 * R * (1 - u * 0.4) });
      barbs.push({ pos: [q.x, q.y, q.z] as V3, dir: [s * 0.6, 0.2, -1] as V3, r: 0.07 * R, len: 0.45 * R * (1 - u * 0.4) });
    }
    addTufts(k, spec.bone as THREE.Bone, barbs, solid('#8a76c8'));
  }
  // Four wings: aurora-banded panels, fore wings angled forward, hind wings back.
  const foreSpan = 0.5;
  const hindSpan = 0.36;
  const foreOutline: [number, number][] = [
    [0, -0.03],
    [0.12, -0.11],
    [0.3, -0.18],
    [0.45, -0.13],
    [0.52, 0.0],
    [0.47, 0.13],
    [0.3, 0.15],
    [0.12, 0.09],
    [0, 0.04],
  ];
  const hindOutline: [number, number][] = [
    [0, 0.03],
    [0.1, 0.08],
    [0.24, 0.07],
    [0.34, 0.0],
    [0.33, -0.1],
    [0.24, -0.18],
    [0.12, -0.15],
    [0, -0.05],
  ];
  const wingGeo = (outline: [number, number][], span: number, eye: [number, number] | null, side: number): THREE.BufferGeometry => {
    // Smooth the control outline into a soft rounded wing (a closed centripetal spline).
    const curve = new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
    const pts = curve.getSpacedPoints(30).slice(0, 30).map((q) => [q.x * side, q.y] as [number, number]);
    if (side < 0) pts.reverse();
    const g = panel(pts, 0.007);
    g.rotateX(Math.PI / 2);
    // Gentle camber so the wings catch the light.
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setY(i, pos.getY(i) + 0.05 * Math.sin((Math.abs(x) / span) * Math.PI) * span * 0.25);
    }
    g.computeVertexNormals();
    paint(g, auroraPaint(span, eye ? [eye[0] * side, eye[1]] : null));
    return g;
  };
  const wings: THREE.Bone[] = [];
  const wingRest: THREE.Quaternion[] = [];
  for (const [hind, span, outline, eye, at, yaw] of [
    [false, foreSpan, foreOutline, [0.62, 0.0], [0.055, 0.035, 0.03], -0.22],
    [true, hindSpan, hindOutline, [0.55, -0.22], [0.05, 0.015, -0.035], 0.38],
  ] as const) {
    for (const side of [1, -1]) {
      const b = k.bone(body, `${hind ? 'hind' : 'fore'}Wing${side > 0 ? 'L' : 'R'}`, side * at[0], at[1], at[2]);
      b.rotation.set(0, side * yaw, 0, 'YXZ');
      k.add(wingGeo(outline as unknown as [number, number][], span, eye as unknown as [number, number], side), 'shell', b);
      wings.push(b);
      wingRest.push(b.quaternion.clone());
    }
  }
  // Reorder to fore L, fore R, hind L, hind R (already in that order).
  // Little dangling legs.
  for (const [z, s] of [
    [0.04, 1],
    [0.04, -1],
    [0.0, 1],
    [0.0, -1],
    [-0.04, 1],
    [-0.04, -1],
  ] as const) {
    const g = sweep([[s * 0.03, -0.06, z], [s * 0.06, -0.1, z + 0.01], [s * 0.055, -0.15, z - 0.01]], [
      [0, 0.008],
      [1, 0.005],
    ], { radial: 5, segs: 4, capRings: 1 });
    paint(g, solid('#4a3a7a'));
    k.add(g, 'soft', body);
  }
  const rig: BugRig = {
    mode: 'moth',
    body,
    head,
    eyes,
    glow,
    jiggles,
    bodyY,
    hoverY,
    halfWidth: 0.12,
    legs: [],
    spine: [],
    segH: 0,
    wings,
    wingRest,
    tailSeg: abd,
    size: 0.5,
    headRest: new THREE.Euler(0, 0, 0, 'YXZ'),
  };
  return bugBuilt(rig, fidgets('look', 'tilt', 'shake', 'look'), hoverY, true);
}

void blob;
