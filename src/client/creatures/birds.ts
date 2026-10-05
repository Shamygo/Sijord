import * as THREE from 'three';
import { smoothstep } from '../player/anim-math';
import { birdClips, fidgets, hoverClips } from './clips';
import { BirdModel, birdClipParams, birdHead, buildBird, type BirdDef } from './bird';
import type { Built } from './defs';
import { along, facing, layered, lathe, mul, paint, ring, solid, type Paint } from './geo';
import type { Kit } from './kit';
import { blobPart } from './parts';

/** Birds: Finchlet (hopping bunting), Fjordling (cliff swift, always on the wing), Skjaldhawk. */

function birdBuilt(k: Kit, def: BirdDef, hover = false): Built {
  const rig = buildBird(k, def);
  return {
    rig,
    create: (init, r) => new BirdModel(init, r as never),
    clipParams: (S) => birdClipParams(rig, S),
    clips: hover ? hoverClips : birdClips,
    fidgets: fidgets('look', 'tilt', 'shake', 'look', 'scratch', ...(def.ground === 'hop' && !hover ? (['hop'] as const) : [])),
    centreY: def.fly === 'always' ? def.flightY : def.bodyY,
  };
}

/** Feather paint along a wing: base colour, lighter leading edge, a wing bar and dark tips. */
function wingPaint(base: string, edge: string, tip: string, span: number, bar?: string): Paint {
  const b = new THREE.Color(base);
  const e = new THREE.Color(edge);
  const t = new THREE.Color(tip);
  const w = bar ? new THREE.Color(bar) : null;
  return (p, _n, out) => {
    out.copy(b);
    // Leading edge (+z) lighter, trailing edge darker towards the tip.
    out.lerp(e, smoothstep(0.0, 0.4, p.z / Math.max(0.01, span * 0.25)) * 0.6);
    if (w) out.lerp(w, Math.max(0, 1 - Math.abs(p.z + span * 0.06) / (span * 0.05)) * 0.9);
    out.lerp(t, smoothstep(span * 0.45, span * 0.95, Math.abs(p.x)) * 0.85);
  };
}

export function finchlet(k: Kit): Built {
  const blue = '#5a7cbc';
  const deep = '#3f5a92';
  const orange = '#f28a3a';
  const cream = '#fff3df';
  const def: BirdDef = {
    ground: 'hop',
    fly: 'never',
    bodyY: 0.1,
    pitch: 0.38,
    body: [
      { t: -0.08, w: 0.034, h: 0.03, hb: 0.03 },
      { t: -0.05, w: 0.062, h: 0.058, hb: 0.06 },
      { t: -0.005, w: 0.074, h: 0.07, hb: 0.074 },
      { t: 0.038, w: 0.068, h: 0.066, hb: 0.068 },
      { t: 0.07, w: 0.046, h: 0.046, hb: 0.046 },
    ],
    bodyPaint: layered(blue, { color: orange, mask: mul(facing(0, -0.2, 1, -0.1, 0.5), along('y', 0.04, 0.0)) }, { color: cream, mask: facing(0, -1, 0, 0.2, 0.7) }, { color: deep, mask: facing(0, 0.6, -1, 0.3, 0.9), k: 0.5 }),
    hip: [0.028, -0.04, 0.0],
    leg: { thigh: 0.032, shank: 0.038, r: [0.016, 0.0055, 0.0045], toe: 0.022, paint: solid('#e59c7a'), thighPaint: solid(cream) },
    neck: { pos: [0, 0.045, 0.045], len: 0.02, pitch: 0.32, r0: 0.05, r1: 0.048, paint: layered(blue, { color: orange, mask: facing(0, -0.3, 1, 0.0, 0.5) }) },
    head: birdHead({
      R: 0.062,
      skull: [1.02, 0.97, 0.98],
      paint: layered(blue, { color: orange, mask: mul(facing(0, -0.6, 1, 0.1, 0.6), along('y', 0.03, -0.01)) }),
      beak: { len: 0.5, w: 0.26, h: 0.36, color: '#f5c242', tip: '#e2a020' },
      iris: '#3a2412',
      eye: { size: 0.3, yaw: 0.55, pitch: 0.08, tall: 1.12 },
      cheek: { color: '#ffb48a', at: [0.62, -0.2, 0.42], r: 0.16 },
      crest: {
        color: solid(deep),
        tufts: [
          [0, 0.9, -0.05, 0, 1, -0.5, 0.16, 0.42],
          [0.12, 0.85, -0.15, 0.3, 1, -0.7, 0.12, 0.32],
        ],
      },
    }),
    wing: { pos: [0.055, 0.03, 0.025], arm: 0.06, hand: 0.075, chord: [0.065, 0.058, 0.035], paint: wingPaint(deep, blue, '#23314f', 0.135, '#ffffff'), fingers: 4, sweep: 0.25 },
    tail: { pos: [0, 0.012, -0.07], len: 0.075, w: 0.03, paint: layered('#2f4372', { color: '#ffffff', mask: (p) => smoothstep(0.022, 0.03, Math.abs(p.x)), k: 0.8 }), pitch: 0.45 },
    flightY: 0.25,
    flapHz: [13, 9],
    headUp: 0.05,
  };
  return birdBuilt(k, def);
}

export function fjordling(k: Kit): Built {
  const slate = '#3e4c68';
  const deep = '#2c3650';
  const white = '#f4f6fa';
  const fjord = '#5fb0e4';
  const def: BirdDef = {
    ground: 'hop',
    fly: 'always',
    bodyY: 0.075,
    flightY: 0.43,
    pitch: 0.06,
    body: [
      { t: -0.14, w: 0.03, h: 0.025, hb: 0.022 },
      { t: -0.09, w: 0.052, h: 0.05, hb: 0.046 },
      { t: -0.01, w: 0.062, h: 0.058, hb: 0.058 },
      { t: 0.06, w: 0.056, h: 0.054, hb: 0.054 },
      { t: 0.1, w: 0.04, h: 0.04, hb: 0.04 },
    ],
    bodyPaint: layered(slate, { color: white, mask: facing(0, -1, 0.5, 0.1, 0.6) }, { color: deep, mask: facing(0, 1, -0.3, 0.4, 0.9), k: 0.5 }),
    hip: [0.022, -0.035, -0.01],
    leg: { thigh: 0.025, shank: 0.025, r: [0.016, 0.0045, 0.004], toe: 0.016, paint: solid('#4a3a40'), thighPaint: solid(white) },
    neck: { pos: [0, 0.02, 0.085], len: 0.025, pitch: 1.2, r0: 0.04, r1: 0.038, paint: layered(slate, { color: white, mask: facing(0, -1, 0.3, 0.0, 0.5) }) },
    head: birdHead({
      R: 0.064,
      skull: [1.0, 0.9, 1.05],
      paint: layered(slate, { color: white, mask: mul(facing(0, -0.7, 0.8, 0.1, 0.6), along('y', 0.03, -0.01)) }, { color: fjord, mask: facing(0, 1, 0.2, 0.6, 1), k: 0.35 }),
      beak: { len: 0.28, w: 0.24, h: 0.24, color: '#2a2a32', tip: '#15151a' },
      iris: '#1c3550',
      eye: { size: 0.31, yaw: 0.58, pitch: 0.1, tall: 1.1 },
      crest: {
        color: solid(fjord),
        tufts: [[0, 0.8, -0.4, 0, 0.3, -1, 0.13, 0.5]],
      },
    }),
    wing: { pos: [0.045, 0.025, 0.03], arm: 0.12, hand: 0.21, chord: [0.085, 0.065, 0.028], paint: wingPaint(deep, '#5a6a8a', '#1a2236', 0.33, fjord), fingers: 0, sweep: 0.55 },
    tail: { pos: [0, 0.008, -0.13], len: 0.12, w: 0.045, paint: layered(deep, { color: fjord, mask: (p) => smoothstep(0.03, 0.045, Math.abs(p.x)), k: 0.7 }), pitch: 0.05, fork: 0.55 },
    flapHz: [9, 5.5],
    headUp: 0.08,
  };
  return birdBuilt(k, def, true);
}

export function skjaldhawk(k: Kit): Built {
  const brown = '#7d5230';
  const deep = '#5a3820';
  const cream = '#f3e5c9';
  const bar = '#a8774a';
  const breast: Paint = (p, n, out) => {
    out.set(cream);
    const b = Math.pow(Math.max(0, Math.sin(p.y * 70)), 6) * smoothstep(0.1, 0.6, n.z);
    out.lerp(new THREE.Color(bar), b * 0.7);
  };
  const def: BirdDef = {
    ground: 'walk',
    fly: 'fast',
    takeoff: 3.2,
    bodyY: 0.55,
    flightY: 0.95,
    pitch: 0.6,
    body: [
      { t: -0.24, w: 0.09, h: 0.08, hb: 0.07 },
      { t: -0.15, w: 0.16, h: 0.15, hb: 0.15 },
      { t: -0.02, w: 0.185, h: 0.17, hb: 0.18 },
      { t: 0.1, w: 0.17, h: 0.16, hb: 0.17 },
      { t: 0.19, w: 0.12, h: 0.12, hb: 0.12 },
    ],
    bodyPaint: (p, n, out) => {
      breast(p, n, out);
      const back = new THREE.Color(brown);
      out.lerp(back, smoothstep(-0.1, 0.5, n.y * 0.7 - n.z * 0.9));
    },
    hip: [0.08, -0.1, -0.02],
    leg: { thigh: 0.17, shank: 0.2, r: [0.06, 0.024, 0.019], toe: 0.085, paint: solid('#f0c040'), thighPaint: breast },
    neck: { pos: [0, 0.12, 0.13], len: 0.07, pitch: 0.55, r0: 0.12, r1: 0.11, paint: layered(brown, { color: cream, mask: facing(0, -0.3, 1, 0.2, 0.7) }) },
    head: birdHead({
      R: 0.155,
      skull: [0.98, 0.92, 1.05],
      paint: layered(brown, { color: cream, mask: mul(facing(0, -0.6, 1, 0.1, 0.6), along('y', 0.07, 0.0)) }, { color: deep, mask: facing(0, 1, -0.4, 0.5, 1), k: 0.6 }),
      beak: { len: 0.62, w: 0.28, h: 0.46, hook: 0.6, color: '#f0c040', tip: '#2a2420' },
      iris: '#f2a21a',
      eye: { size: 0.27, yaw: 0.5, pitch: 0.12, tall: 1.0, rim: '#1a1210' },
      brow: deep,
      crest: {
        color: solid(deep),
        tufts: [
          [0, 0.75, -0.55, 0, 0.3, -1, 0.14, 0.5],
          [0.15, 0.7, -0.5, 0.3, 0.3, -1, 0.11, 0.4],
          [-0.15, 0.7, -0.5, -0.3, 0.3, -1, 0.11, 0.4],
        ],
      },
    }),
    wing: { pos: [0.15, 0.06, 0.07], arm: 0.32, hand: 0.42, chord: [0.26, 0.23, 0.12], paint: wingPaint(brown, '#9a6a40', '#2e1e12', 0.74, cream), fingers: 5, sweep: 0.15 },
    tail: { pos: [0, 0.03, -0.22], len: 0.32, w: 0.12, paint: (p, _n, out) => out.set(Math.sin(p.z * 45) > 0.4 ? deep : '#9a6a40'), pitch: 0.55 },
    flapHz: [4.2, 2.6],
    extras: (kk, r) => {
      // The round shield crest on the breast: a domed steel disc with a bronze rim and boss.
      const sb = kk.bone(r.body, 'shield', 0, -0.07, 0.218);
      sb.rotation.x = 0.55;
      const disc = lathe(
        [
          [0, -0.012],
          [0.125, -0.012],
          [0.128, 0.006],
          [0.105, 0.024],
          [0.055, 0.036],
          [0, 0.04],
        ],
        28,
      );
      disc.rotateX(Math.PI / 2);
      paint(disc, (p, _n, out) => {
        out.set('#8f9cab');
        // Blue wing emblem.
        const a = Math.atan2(p.y, p.x);
        const rr = Math.hypot(p.x, p.y);
        const wing = rr > 0.035 && rr < 0.095 && Math.abs(Math.sin(a * 2)) > 0.75 && p.y > -0.02;
        if (wing) out.set('#3a6ab8');
      });
      kk.add(disc, 'metal', sb);
      const rim = ring(0.126, 0.013, 6, 32);
      paint(rim, solid('#c8923a'));
      kk.add(rim, 'metal', sb, { pos: [0, 0, 0.004] });
      blobPart(kk, sb, [0.03, 0.03, 0.022], [0, 0, 0.035], solid('#d9a24a'), 'metal', undefined, 'sm');
      return {};
    },
    headUp: 0.04,
  };
  return birdBuilt(k, def);
}
