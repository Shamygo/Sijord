import * as THREE from 'three';
import { quadClips, fidgets } from './clips';
import type { Built } from './defs';
import { along, blob, facing, layered, mul, paint, solid, spots, sweep, symX, type Mask, type Paint, type V3 } from './geo';
import { mamHead } from './heads';
import { chainWeights, skin, type Kit } from './kit';
import { addTufts, blobPart, type JiggleSpec } from './parts';
import { PIN_FIDGETS, PinModel, buildPinniped, pinClipParams, type PinDef } from './pinniped';

/** Water line: Splashpup -> Sealkin -> Selkira, on the seal body plan. */

function pinBuilt(k: Kit, def: PinDef): Built {
  const rig = buildPinniped(k, def);
  return {
    rig,
    create: (init, r) => new PinModel(init, r as never),
    clipParams: (S) => pinClipParams(rig, S),
    clips: quadClips,
    fidgets: [...PIN_FIDGETS, ...fidgets('look', 'tilt', 'shake')],
    centreY: def.bodyY + def.chest[1],
  };
}

/** Section helper: a torso ring at z with half width w, top h, bottom hb, resting `lift` above the ground. */
function sec(t: number, w: number, h: number, hb: number, bodyY: number, lift: number) {
  return { t, w, h, hb, c: -bodyY + hb + lift };
}

/** Soft dappled spots on the back (mirrored), for seal coats. */
function dapple(list: [number, number, number, number][]): Mask {
  return mul(symX(spots(list, 0.4)), facing(0, 1, 0, -0.2, 0.4));
}

/** A ribbon along `pts` (flat, cupped), skinned to a chain of spring bones so it trails and sways. */
function ribbon(
  k: Kit,
  parent: THREE.Bone,
  name: string,
  pts: V3[],
  width: number,
  p: Paint,
  kind: 'leaf' | 'fur' | 'shell' = 'leaf',
  bones = 2,
  side = 0,
): JiggleSpec[] {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])),
    false,
    'centripetal',
  );
  const knots: number[] = [];
  const bs: THREE.Bone[] = [];
  let prev: THREE.Object3D = parent;
  let prevP = new THREE.Vector3();
  for (let i = 0; i < bones; i++) {
    const u = i / bones;
    knots.push(u);
    const at = curve.getPointAt(u);
    const local = i === 0 ? at.clone() : at.clone().sub(prevP);
    const b = k.bone(prev, `${name}${i}`, local.x, local.y, local.z);
    bs.push(b);
    prev = b;
    prevP = at;
  }
  const us: number[] = [];
  const g = sweep(pts, [
    [0, width * 0.8],
    [0.5, width],
    [0.9, width * 0.9],
    [1, width * 0.5],
  ], { radial: 8, segs: 8, ratio: 0.18, up: [1, 0, 0], cup: 0.25, capRings: 2, cap0: 0.3, cap1: 0.5, onVertex: (u) => us.push(u) });
  skin(g, (_p, i, out) => chainWeights(us[i], knots, 0.5 / bones, out));
  paint(g, p);
  k.addSkinned(g, kind, parent, bs);
  const jig: JiggleSpec[] = [];
  for (let i = 0; i < bones; i++) {
    const a = curve.getPointAt(i / bones);
    const e = curve.getPointAt((i + 1) / bones);
    jig.push({ bone: bs[i], tip: e.sub(a), opts: { freq: 8 - i * 1.5, zeta: 0.25, gain: 0.02 + i * 0.01, limit: 0.9 }, role: 'misc', side });
  }
  return jig;
}

// ---------------------------------------------------------------------------------------------

export function splashpup(k: Kit): Built {
  const fur = '#b4cfe2';
  const back = '#85a6c0';
  const belly = '#f2f8fc';
  const speck = '#6d8dab';
  const Y = 0.12;
  const def: PinDef = {
    bodyY: Y,
    torso: [
      sec(-0.3, 0.035, 0.022, 0.02, Y, 0.004),
      sec(-0.245, 0.06, 0.045, 0.042, Y, 0.002),
      sec(-0.16, 0.1, 0.09, 0.088, Y, 0),
      sec(-0.05, 0.128, 0.118, 0.116, Y, 0.002),
      sec(0.05, 0.13, 0.124, 0.118, Y, 0.012),
      sec(0.13, 0.104, 0.106, 0.096, Y, 0.018),
      sec(0.19, 0.07, 0.074, 0.068, Y, 0.036),
    ],
    torsoPaint: layered(
      fur,
      { color: back, mask: facing(0, 1, -0.3, 0.2, 0.9), k: 0.6 },
      { color: belly, mask: mul(facing(0, -1, 0.3, -0.2, 0.3), along('y', 0.0, -0.06)) },
      { color: speck, mask: dapple([[0.06, 0.08, -0.1, 0.022], [0.08, 0.05, -0.02, 0.018], [0.03, 0.1, 0.03, 0.016], [0.05, 0.04, -0.17, 0.016], [0.09, 0.02, 0.07, 0.015]]), k: 0.8 },
    ),
    chest: [0, 0.03, 0.08],
    hips: [0, -0.02, -0.12],
    tail0: [0, -0.07, -0.21],
    tail1: [0, -0.095, -0.27],
    neck: { pos: [0, 0.07, 0.07], len: 0.05, pitch: 0.25, r0: 0.095, r1: 0.088, paint: layered(fur, { color: belly, mask: facing(0, -0.2, 1, 0.1, 0.6) }) },
    head: mamHead({
      R: 0.105,
      fur,
      cream: belly,
      nose: '#2a2f3a',
      inner: '#f2b8c0',
      iris: '#2c4a6a',
      skull: [1.05, 0.95, 0.98],
      face: 'muzzle',
      snout: 0,
      cheeks: 0.75,
      cheekColor: belly,
      eye: { size: 0.32, yaw: 0.5, pitch: 0.02, tall: 1.15 },
      nubs: true,
      mouth: 'w',
      whiskers: '#e8f2f8',
      noseSize: 1.0,
      extra: (kk, head, c, R) => {
        // Pup fluff: a soft white cowlick.
        addTufts(
          kk,
          head,
          [
            { pos: [0, c[1] + 0.86 * R, c[2] + 0.1 * R], dir: [0, 1, 0.6], r: 0.17 * R, len: 0.36 * R, curl: 0.12 * R },
            { pos: [0.1 * R, c[1] + 0.84 * R, c[2] - 0.02 * R], dir: [0.5, 1, 0.3], r: 0.13 * R, len: 0.28 * R, curl: 0.08 * R },
          ],
          solid('#ffffff'),
        );
      },
    }),
    fore: { pos: [0.095, -0.06, 0.03], len: 0.1, w: 0.04, paint: layered(back, { color: fur, mask: facing(0, 0, 1, 0, 0.8) }), rest: [0.35, 0, 0.95] },
    hind: { len: 0.09, w: 0.045, paint: layered(back, { color: fur, mask: facing(0, 1, 0, 0, 1), k: 0.5 }), spread: 0.4 },
    bounce: true,
    headUp: 0.05,
  };
  return pinBuilt(k, def);
}

export function sealkin(k: Kit): Built {
  const fur = '#7f8f9e';
  const back = '#5c6b7a';
  const belly = '#dfe6ec';
  const kelp = '#5d7a2c';
  const kelpLight = '#9aae46';
  const Y = 0.25;
  const def: PinDef = {
    bodyY: Y,
    torso: [
      sec(-0.64, 0.06, 0.04, 0.035, Y, 0.006),
      sec(-0.52, 0.12, 0.09, 0.085, Y, 0.003),
      sec(-0.34, 0.2, 0.18, 0.18, Y, 0),
      sec(-0.1, 0.25, 0.24, 0.24, Y, 0.004),
      sec(0.12, 0.25, 0.25, 0.24, Y, 0.03),
      sec(0.28, 0.21, 0.22, 0.2, Y, 0.075),
      sec(0.4, 0.15, 0.16, 0.15, Y, 0.13),
    ],
    torsoPaint: layered(
      fur,
      { color: back, mask: facing(0, 1, -0.3, 0.2, 0.9), k: 0.7 },
      { color: belly, mask: mul(facing(0, -1, 0.3, -0.2, 0.3), along('y', 0.0, -0.12)) },
      { color: '#465462', mask: dapple([[0.12, 0.16, -0.2, 0.04], [0.16, 0.1, 0.0, 0.035], [0.06, 0.22, 0.08, 0.03], [0.1, 0.08, -0.36, 0.03], [0.19, 0.05, 0.15, 0.03], [0.05, 0.18, -0.08, 0.025]]), k: 0.8 },
    ),
    chest: [0, 0.06, 0.16],
    hips: [0, -0.04, -0.26],
    tail0: [0, -0.14, -0.45],
    tail1: [0, -0.2, -0.57],
    neck: { pos: [0, 0.14, 0.14], len: 0.14, pitch: 0.3, r0: 0.17, r1: 0.15, paint: layered(fur, { color: belly, mask: facing(0, -0.2, 1, 0.1, 0.6) }) },
    head: mamHead({
      R: 0.16,
      fur,
      cream: belly,
      nose: '#1e2228',
      inner: '#d8a0a8',
      iris: '#203a52',
      skull: [1.0, 0.92, 1.02],
      face: 'muzzle',
      snout: 0.22,
      snoutW: 1.1,
      snoutH: 0.95,
      snoutDrop: 0.04,
      cheeks: 0.7,
      cheekColor: belly,
      eye: { size: 0.27, yaw: 0.52, pitch: 0.06, tall: 1.08 },
      nubs: true,
      mouth: 'w',
      whiskers: '#e8eef2',
    }),
    fore: { pos: [0.19, -0.13, 0.05], len: 0.22, w: 0.075, paint: layered(back, { color: fur, mask: facing(0, 0, 1, 0, 0.8) }), rest: [0.35, 0, 0.95] },
    hind: { len: 0.18, w: 0.085, paint: layered(back, { color: fur, mask: facing(0, 1, 0, 0, 1), k: 0.5 }), spread: 0.4 },
    extras: (kk, r) => {
      // Kelp scarf: a loop around the neck base with two trailing ends, and a string of pebbles.
      const scarf = layered(kelp, { color: kelpLight, mask: (q) => Math.pow(Math.max(0, Math.sin(q.z * 90 + q.x * 60)), 4) * 0.7 }, { color: '#3e5a1c', mask: facing(0, -1, 0, 0, 0.8), k: 0.6 });
      const loop: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        loop.push([Math.sin(a) * 0.205, 0.17 + 0.03 * Math.cos(a) - 0.05 * Math.max(0, Math.cos(a)), 0.13 + Math.cos(a) * 0.17]);
      }
      const g = sweep(loop, 0.045, { radial: 8, segs: 24, ratio: 0.45, up: [0, 1, 0], capRings: 1, cap0: 0.2, cap1: 0.2 });
      paint(g, scarf);
      kk.add(g, 'leaf', r.chest);
      const jig: JiggleSpec[] = [];
      jig.push(
        ...ribbon(kk, r.chest, 'kelpL', [[0.1, 0.2, -0.02], [0.17, 0.12, -0.12], [0.2, 0.0, -0.2], [0.2, -0.1, -0.24]], 0.05, scarf, 'leaf', 2, 1),
        ...ribbon(kk, r.chest, 'kelpR', [[0.03, 0.22, -0.04], [0.07, 0.18, -0.17], [0.1, 0.08, -0.28]], 0.042, scarf, 'leaf', 2, 1),
      );
      // Pebbles strung on the front of the scarf.
      const stones: [V3, V3, string][] = [
        [[0, 0.14, 0.3], [0.04, 0.032, 0.03], '#9aa6ad'],
        [[0.065, 0.15, 0.28], [0.032, 0.027, 0.025], '#5f8f8c'],
        [[-0.065, 0.15, 0.28], [0.032, 0.027, 0.025], '#b8a68e'],
      ];
      for (const [pos, rr, c] of stones) blobPart(kk, r.chest, rr, pos, layered(c, { color: '#ffffff', mask: blob(0, rr[1] * 0.6, rr[2] * 0.5, rr[0] * 0.6), k: 0.25 }), 'gloss', undefined, 'sm');
      return { jiggles: jig };
    },
    headUp: 0.08,
  };
  return pinBuilt(k, def);
}

export function selkira(k: Kit): Built {
  const fur = '#8ea6c8';
  const back = '#6c84ad';
  const belly = '#eef1fb';
  const Y = 0.36;
  const cloakP: Paint = (q, n, out) => {
    // Iridescent sealskin: teal -> lavender -> rose shifting with the surface direction.
    const a = 0.5 + 0.5 * Math.sin(n.x * 3 + n.z * 2 + q.z * 6);
    const b = 0.5 + 0.5 * Math.sin(n.y * 4 - q.x * 9);
    out.setRGB(0.35 + 0.35 * a, 0.45 + 0.2 * b, 0.75 + 0.15 * a);
    // Darker dappled spots like a real sealskin.
    const s = Math.pow(Math.max(0, Math.sin(q.x * 40) * Math.sin(q.z * 33)), 6);
    out.multiplyScalar(1 - 0.35 * s);
  };
  const def: PinDef = {
    bodyY: Y,
    torso: [
      sec(-0.9, 0.08, 0.055, 0.05, Y, 0.008),
      sec(-0.74, 0.17, 0.13, 0.12, Y, 0.004),
      sec(-0.48, 0.27, 0.25, 0.25, Y, 0),
      sec(-0.14, 0.34, 0.33, 0.33, Y, 0.006),
      sec(0.16, 0.34, 0.34, 0.32, Y, 0.05),
      sec(0.38, 0.28, 0.3, 0.27, Y, 0.12),
      sec(0.54, 0.2, 0.22, 0.2, Y, 0.2),
    ],
    torsoPaint: layered(fur, { color: back, mask: facing(0, 1, -0.3, 0.2, 0.9), k: 0.6 }, { color: belly, mask: mul(facing(0, -1, 0.3, -0.2, 0.3), along('y', 0.0, -0.15)) }),
    chest: [0, 0.1, 0.22],
    hips: [0, -0.05, -0.36],
    tail0: [0, -0.2, -0.64],
    tail1: [0, -0.28, -0.8],
    neck: { pos: [0, 0.2, 0.17], len: 0.28, pitch: 0.3, r0: 0.25, r1: 0.18, paint: layered(fur, { color: belly, mask: facing(0, -0.4, 1, 0.45, 0.85) }) },
    head: mamHead({
      R: 0.2,
      fur,
      cream: belly,
      nose: '#2a2540',
      inner: '#e8b0d0',
      iris: '#7a3aa8',
      skull: [0.98, 0.9, 1.05],
      face: 'muzzle',
      snout: 0.3,
      snoutW: 1.0,
      snoutH: 0.9,
      snoutDrop: 0.05,
      cheeks: 0.6,
      cheekColor: belly,
      eye: { size: 0.24, yaw: 0.52, pitch: 0.08, tall: 1.0, rim: '#2a1a3a' },
      nubs: true,
      mouth: 'w',
      whiskers: '#f4eefc',
      extra: (kk, head, c, R) => {
        // Fairy circlet: a glowing pearl on the brow.
        const gb = kk.bone(head, 'pearl', 0, c[1] + 0.62 * R, c[2] + 0.68 * R);
        blobPart(kk, gb, [0.11 * R, 0.11 * R, 0.08 * R], [0, 0, 0], layered('#ffc4f0', { color: '#ffffff', mask: blob(0.03 * R, 0.04 * R, 0.06 * R, 0.06 * R), k: 0.8 }), 'glow', undefined, 'sm');
        const band = sweep([[-0.6 * R, c[1] + 0.3 * R, c[2] + 0.3 * R], [0, c[1] + 0.6 * R, c[2] + 0.66 * R], [0.6 * R, c[1] + 0.3 * R, c[2] + 0.3 * R]], 0.03 * R, { radial: 5, segs: 8, capRings: 1 });
        paint(band, solid('#e8d8ff'));
        kk.add(band, 'metal', head);
        return { glow: [gb] };
      },
    }),
    fore: { pos: [0.26, -0.18, 0.06], len: 0.32, w: 0.1, paint: layered(back, { color: fur, mask: facing(0, 0, 1, 0, 0.8) }), rest: [0.35, 0, 0.95] },
    hind: { len: 0.26, w: 0.12, paint: layered(back, { color: fur, mask: facing(0, 1, 0, 0, 1), k: 0.5 }), spread: 0.45 },
    extras: (kk, r) => {
      // Shimmering sealskin cloak over the back, clasped at the throat, hem trailing on springs.
      const pts: V3[] = [
        [0, 0.38, 0.3],
        [0, 0.38, 0.1],
        [0, 0.34, -0.18],
        [0, 0.18, -0.48],
        [0, -0.06, -0.76],
      ];
      const us: number[] = [];
      const g = sweep(pts, [
        [0, 0.3],
        [0.25, 0.39],
        [0.55, 0.39],
        [0.8, 0.31],
        [1, 0.2],
      ], { radial: 14, segs: 16, ratio: 0.05, up: [1, 0, 0], cup: 0.85, capRings: 2, cap0: 0.15, cap1: 0.3, onVertex: (u) => us.push(u) });
      skin(g, (_q, i, out) => chainWeights(us[i], [0, 0.35, 0.72], 0.12, out));
      paint(g, cloakP);
      kk.addSkinned(g, 'shell', r.body, [r.chest, r.hips, r.tail0]);
      const jig: JiggleSpec[] = [];
      const hem = layered('#9a8ae0', { color: '#7fd0e8', mask: facing(1, 0, 0, -0.5, 0.5) });
      jig.push(
        ...ribbon(kk, r.hips, 'hemL', [[0.24, 0.1, -0.1], [0.3, -0.02, -0.28], [0.3, -0.1, -0.44]], 0.07, hem, 'shell', 2, 1),
        ...ribbon(kk, r.hips, 'hemR', [[-0.24, 0.1, -0.1], [-0.3, -0.02, -0.28], [-0.3, -0.1, -0.44]], 0.07, hem, 'shell', 2, -1),
      );
      // Clasp.
      const cb = kk.bone(r.chest, 'clasp', 0, 0.36, 0.38);
      blobPart(kk, cb, [0.06, 0.06, 0.04], [0, 0, 0], layered('#7fe8ff', { color: '#ffffff', mask: blob(0.015, 0.02, 0.03, 0.03), k: 0.7 }), 'glow', undefined, 'sm');
      return { jiggles: jig, glow: [cb] };
    },
    headUp: 0.1,
  };
  return pinBuilt(k, def);
}
