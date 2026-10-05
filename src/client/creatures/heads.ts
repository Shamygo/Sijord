import * as THREE from 'three';
import type { JiggleOpts } from './core';
import { along, blob, ellipsoid, facing, layered, loft, mul, paint, solid, sweep, symX, tuft, type Mask, type Paint, type V3 } from './geo';
import type { Kit } from './kit';
import { addEars, addEyes, addTufts, blobPart, type EarSpec, type JiggleSpec } from './parts';
import type { HeadParts } from './quadruped';

/**
 * Parametric mammal head (cats, foxes, dogs, deer, rodents, rabbits, seals), built in the head
 * bone's frame (+Z forward). All sizes are multiples of the cranium radius R.
 *
 * Big, low-set eyes, a short face and round volumes keep every species in the same chunky,
 * readable style as the art reference; the snout length, ears, cheeks and markings make each
 * one its own silhouette.
 */

export interface EarOpts {
  len: number;
  w: number;
  out: number;
  back: number;
  turn?: number;
  widest?: number;
  round?: number;
  cup?: number;
  flop?: number;
  thick?: number;
  tip?: string;
  tipLen?: number;
  /** Back-of-ear colour (default: fur). */
  backColor?: string;
  outer?: string;
  inner?: string;
  /** Base position (left ear) as multiples of R relative to the cranium centre. */
  at?: V3;
  /** Fern-frond lobes along the edges. */
  lobes?: number;
  lobeDepth?: number;
  jiggle?: Partial<JiggleOpts>;
}

export interface HeadOpts {
  R: number;
  fur: string;
  cream: string;
  nose: string;
  inner: string;
  iris: string;
  /** Cranium radii as multiples of R. */
  skull?: V3;
  /**
   * Face pattern: 'lower' = cream lower face (fox / lynx), 'muzzle' = cream snout only,
   * 'blaze' = white blaze up the forehead plus muzzle (sheepdog), 'none'.
   */
  face?: 'lower' | 'muzzle' | 'blaze' | 'none';
  /** Snout length (R); 0 = short kitten muzzle puff. */
  snout?: number;
  /** Snout width / height factors and how much it drops towards the tip. */
  snoutW?: number;
  snoutH?: number;
  snoutDrop?: number;
  /** Fluffy cheek size (0 = none; > 1 = rodent pouches). */
  cheeks?: number;
  cheekColor?: string;
  /** Cheek ruff tufts (lynx / fox), 0 = none. */
  ruff?: number;
  ruffColor?: string;
  eye: { size: number; yaw?: number; pitch?: number; tall?: number; inset?: number; toward?: number; rim?: string };
  /** Ears; omit for earless heads (seals get tiny nubs via `nubs`). */
  ear?: EarOpts;
  nubs?: boolean;
  noseSize?: number;
  mouth?: 'w' | 'line' | 'y';
  whiskers?: string;
  /** Lynx ear-tip tufts. */
  earTuft?: string;
  /** Ember / flame ear tufts (glow colours base -> tip). */
  emberTufts?: [string, string, string];
  /** Forehead marks colour. */
  marks?: string;
  /** Extra decorations; c = cranium centre, R = radius. */
  extra?: (k: Kit, head: THREE.Bone, c: V3, R: number, ears: THREE.Bone[]) => { glow?: THREE.Bone[]; jiggles?: JiggleSpec[] } | void;
}

export function mamHead(o: HeadOpts) {
  return (k: Kit, head: THREE.Bone): HeadParts => {
    const R = o.R;
    const sk = o.skull ?? [1.04, 0.92, 0.9];
    const c: V3 = [0, 0.38 * R, 0.25 * R];
    const cr: V3 = [sk[0] * R, sk[1] * R, sk[2] * R];
    const face = o.face ?? 'lower';
    const snoutLen = o.snout ?? 0;
    const front = c[2] + cr[2];

    // --- Cranium -------------------------------------------------------------------------
    const layers: { color: string; mask: Mask; k?: number }[] = [];
    if (face === 'lower') {
      layers.push(
        { color: o.cream, mask: mul(along('y', c[1] - 0.02 * R, c[1] - 0.3 * R), facing(0, -0.3, 1, -0.4, 0.3)) },
        { color: o.cream, mask: mul(along('y', c[1] - 0.4 * R, c[1] - 0.7 * R), facing(0, -0.5, 1, -0.6, 0.0)) },
      );
    } else if (face === 'blaze') {
      layers.push(
        { color: o.cream, mask: mul(blob(0, c[1] + 0.2 * R, front, 0.42 * R, 0.5), facing(0, 0.2, 1, 0.0, 0.5)) },
        { color: o.cream, mask: mul(along('y', c[1] - 0.15 * R, c[1] - 0.5 * R), facing(0, -0.3, 1, -0.4, 0.3)) },
      );
    } else if (face === 'muzzle') {
      layers.push({ color: o.cream, mask: mul(along('y', c[1] - 0.35 * R, c[1] - 0.7 * R), facing(0, -0.4, 1, -0.5, 0.2)), k: 0.8 });
    }
    if (o.marks) {
      const m = o.marks;
      layers.push(
        { color: m, mask: mul(symX(blob(0.15 * R, c[1] + 0.68 * R, c[2] + 0.55 * R, 0.11 * R, 0.6)), facing(0, 0.4, 1, -0.2, 0.4)), k: 0.85 },
        { color: m, mask: mul(blob(0, c[1] + 0.8 * R, c[2] + 0.5 * R, 0.1 * R, 0.6), facing(0, 0.4, 1, -0.2, 0.4)), k: 0.85 },
      );
    }
    blobPart(k, head, cr, c, layered(o.fur, ...layers), 'fur', undefined, 'hi');

    // --- Cheeks ----------------------------------------------------------------------------
    const ch = o.cheeks ?? 1;
    if (ch > 0) {
      const cc = o.cheekColor ?? (face === 'none' ? o.fur : o.cream);
      const cheekPaint = layered(cc, { color: o.fur, mask: mul(along('y', c[1] - 0.2 * R, c[1] + 0.1 * R), facing(0, 0.3, -0.6, -0.3, 0.4)), k: 0.9 });
      for (const s of [1, -1]) {
        const g = ellipsoid(0.5 * R * ch, 0.38 * R * Math.sqrt(ch), 0.46 * R * Math.sqrt(ch), ch > 1.2 ? 'lo' : 'sm');
        g.translate(s * (0.5 + 0.08 * (ch - 1)) * R, c[1] - 0.36 * R, c[2] + 0.2 * R);
        paint(g, cheekPaint);
        k.add(g, 'fur', head);
      }
    }
    const rf = o.ruff ?? 0;
    if (rf > 0) {
      const rc = o.ruffColor ?? o.cream;
      addTufts(
        k,
        head,
        [
          { pos: [0.74 * R, c[1] - 0.32 * R, c[2] + 0.0 * R], dir: [1, -0.3, -0.4], r: 0.3 * R * rf, len: 0.48 * R * rf, curl: -0.06 * R },
          { pos: [0.62 * R, c[1] - 0.54 * R, c[2] + 0.04 * R], dir: [0.7, -0.75, -0.25], r: 0.27 * R * rf, len: 0.42 * R * rf, curl: -0.05 * R },
        ],
        layered(rc, { color: o.fur, mask: facing(0, 0.6, -0.6, -0.2, 0.5), k: 0.7 }),
        'fur',
        true,
      );
    }

    // --- Muzzle / snout, nose, mouth and jaw -----------------------------------------------
    let noseP: V3;
    let jawAt: V3;
    let jawLen: number;
    const ns = o.noseSize ?? 1;
    const snoutC = face === 'none' ? o.fur : o.cream;
    if (snoutLen <= 0.05) {
      const mzc: V3 = [0, c[1] - 0.33 * R, c[2] + 0.66 * R];
      blobPart(k, head, [0.34 * R, 0.24 * R, 0.28 * R], mzc, solid(snoutC), 'fur', undefined, 'lo');
      for (const s of [1, -1]) {
        blobPart(k, head, [0.18 * R, 0.15 * R, 0.15 * R], [s * 0.14 * R, mzc[1] - 0.05 * R, mzc[2] + 0.15 * R], solid(snoutC), 'fur', undefined, 'sm');
      }
      noseP = [0, mzc[1] + 0.13 * R, mzc[2] + 0.25 * R];
      jawAt = [0, mzc[1] - 0.1 * R, c[2] + 0.3 * R];
      jawLen = 0.3 * R;
      blobPart(k, head, [0.2 * R, 0.1 * R, 0.22 * R], [0, mzc[1] - 0.15 * R, mzc[2] - 0.02 * R], solid('#7a2c34'), 'soft', undefined, 'sm');
    } else {
      const sw = o.snoutW ?? 1;
      const sh = o.snoutH ?? 1;
      const drop = (o.snoutDrop ?? 0.12) * R;
      const y0 = c[1] - 0.28 * R;
      const z0 = c[2] + 0.3 * R;
      const L = snoutLen * R;
      const zTip = front + L;
      const secs = [
        { t: z0, w: 0.5 * R * sw, h: 0.4 * R * sh, c: 0 },
        { t: front - 0.05 * R, w: 0.42 * R * sw, h: 0.32 * R * sh, c: -drop * 0.25 },
        { t: front + L * 0.55, w: 0.33 * R * sw, h: 0.26 * R * sh, c: -drop * 0.65 },
        { t: zTip, w: 0.25 * R * sw, h: 0.21 * R * sh, c: -drop },
      ];
      const g = loft(secs, { radial: 14, rings: 7, cap0: 0, cap1: 0.2 * R * sh, capRings: 3 });
      g.translate(0, y0, 0);
      const sp: Paint =
        face === 'none'
          ? solid(o.fur)
          : face === 'lower' || face === 'blaze'
            ? solid(o.cream)
            : layered(o.fur, { color: o.cream, mask: mul(along('z', front - 0.15 * R, front + 0.15 * R), facing(0, -0.2, 1, -0.8, -0.2)) }, { color: o.cream, mask: facing(0, -1, 0.3, -0.2, 0.4) });
      paint(g, sp);
      k.add(g, 'fur', head);
      noseP = [0, y0 - drop + 0.12 * R * sh, zTip + 0.14 * R * sh];
      jawAt = [0, y0 - 0.2 * R * sh, c[2] + 0.35 * R];
      jawLen = front + L * 0.85 - jawAt[2];
      blobPart(k, head, [0.24 * R * sw, 0.1 * R, (jawLen * 0.5) * 0.9], [0, y0 - drop * 0.6 - 0.22 * R * sh, jawAt[2] + jawLen * 0.5], solid('#7a2c34'), 'soft', undefined, 'sm');
    }
    const ng = ellipsoid(0.12 * R * ns, 0.08 * R * ns, 0.08 * R * ns, 'sm');
    paint(ng, layered(o.nose, { color: '#ffffff', mask: blob(0.03 * R, 0.045 * R, 0.05 * R, 0.045 * R), k: 0.3 }));
    k.add(ng, 'gloss', head, { pos: noseP, rot: [0.4, 0, 0] });
    const mouth = o.mouth ?? 'w';
    const [nx, ny, nz] = noseP;
    const mouthC = solid('#4a2026');
    if (mouth === 'w' || mouth === 'y') {
      for (const s of [1, -1]) {
        const pts: V3[] =
          mouth === 'w'
            ? [
                [nx, ny - 0.07 * R, nz - 0.005 * R],
                [s * 0.045 * R, ny - 0.13 * R, nz - 0.02 * R],
                [s * 0.1 * R, ny - 0.115 * R, nz - 0.04 * R],
              ]
            : [
                [nx, ny - 0.06 * R, nz - 0.005 * R],
                [s * 0.03 * R, ny - 0.12 * R, nz - 0.02 * R],
                [s * 0.075 * R, ny - 0.15 * R, nz - 0.045 * R],
              ];
        const g = sweep(pts, 0.012 * R, { radial: 5, segs: 6, capRings: 2 });
        paint(g, mouthC);
        k.add(g, 'soft', head);
      }
    } else {
      for (const s of [1, -1]) {
        const pts: V3[] = [
          [nx, ny - 0.08 * R, nz - 0.01 * R],
          [s * 0.08 * R, ny - 0.17 * R, nz - 0.08 * R],
          [s * 0.18 * R, ny - 0.18 * R, nz - 0.22 * R],
        ];
        const g = sweep(pts, 0.014 * R, { radial: 5, segs: 6, capRings: 2 });
        paint(g, mouthC);
        k.add(g, 'soft', head);
      }
    }
    if (o.whiskers) {
      for (const s of [1, -1]) {
        for (const [dy, dz] of [
          [0.02, 0],
          [-0.04, -0.02],
        ]) {
          const a: V3 = [s * 0.16 * R, ny - 0.05 * R + dy * R, nz - 0.1 * R + dz * R];
          const g = sweep([a, [a[0] + s * 0.28 * R, a[1] + dy * 2 * R, a[2] - 0.05 * R], [a[0] + s * 0.5 * R, a[1] + dy * 3 * R - 0.04 * R, a[2] - 0.12 * R]], 0.007 * R, { radial: 3, segs: 4, capRings: 1 });
          paint(g, solid(o.whiskers));
          k.add(g, 'soft', head);
        }
      }
    }
    const jaw = k.bone(head, 'jaw', jawAt[0], jawAt[1], jawAt[2]);
    const jw = snoutLen > 0.05 ? (o.snoutW ?? 1) * 0.3 * R : 0.25 * R;
    blobPart(k, jaw, [jw, 0.11 * R, jawLen * 0.55], [0, -0.08 * R, jawLen * 0.5], solid(snoutC), 'fur', undefined, 'sm');
    blobPart(k, jaw, [jw * 0.6, 0.05 * R, jawLen * 0.35], [0, -0.03 * R, jawLen * 0.55], solid('#d9707c'), 'soft', undefined, 'tiny');

    // --- Eyes ------------------------------------------------------------------------------
    const e = o.eye;
    const eyes = addEyes(k, head, {
      on: { c, r: cr },
      yaw: e.yaw ?? 0.44,
      pitch: e.pitch ?? -0.06,
      size: e.size * R,
      tall: e.tall ?? 1.22,
      iris: o.iris,
      inset: e.inset ?? 0.45,
      toward: e.toward ?? 0.35,
      rim: e.rim,
    });

    // --- Ears ------------------------------------------------------------------------------
    const glow: THREE.Bone[] = [];
    const jiggles: JiggleSpec[] = [];
    const earBones: THREE.Bone[] = [];
    if (o.ear) {
      const a = o.ear;
      const at = a.at ?? [0.52, 0.58, -0.12];
      const earSpec: EarSpec = {
        pos: [at[0] * R, c[1] + at[1] * R, c[2] + at[2] * R],
        len: a.len * R,
        w: a.w * R,
        thick: a.thick !== undefined ? a.thick * R : undefined,
        out: a.out,
        back: a.back,
        turn: a.turn ?? 0.12,
        widest: a.widest ?? 0.22,
        round: a.round ?? 0.12,
        cup: a.cup,
        flop: a.flop,
        outer: a.outer ?? o.fur,
        inner: a.inner ?? o.inner,
        backColor: a.backColor ?? a.outer ?? o.fur,
        tip: a.tip,
        tipLen: a.tipLen,
        jiggle: a.jiggle,
        lobes: a.lobes,
        lobeDepth: a.lobeDepth,
      };
      const ears = addEars(k, head, earSpec);
      earBones.push(...ears.bones);
      jiggles.push(...ears.jiggles);
      for (const eb of ears.bones) {
        if (o.emberTufts) {
          const tb = k.bone(eb, 'ember', 0, a.len * R * 0.9, 0.0);
          const [c0, c1, c2] = o.emberTufts;
          const flame = layered(c0, { color: c1, mask: along('y', 0.05 * R, 0.25 * R) }, { color: c2, mask: along('y', 0.3 * R, 0.55 * R) });
          for (const [dx, h, rr, tilt] of [
            [0.0, 0.62, 0.085, -0.12],
            [-0.05, 0.38, 0.06, 0.5],
          ] as const) {
            const g = tuft(rr * R, h * R, 0.06 * R, 6);
            paint(g, flame);
            k.add(g, 'glow', tb, { pos: [dx * R, -0.05 * R, 0], rot: [0, 0, tilt] });
          }
          glow.push(tb);
        } else if (o.earTuft) {
          const g = tuft(0.06 * R, 0.4 * R, 0.05 * R, 6);
          paint(g, solid(o.earTuft));
          k.add(g, 'fur', eb, { pos: [0, a.len * R * 0.92, 0] });
        }
      }
    } else if (o.nubs) {
      for (const s of [1, -1]) blobPart(k, head, [0.09 * R, 0.07 * R, 0.06 * R], [s * 0.62 * R, c[1] + 0.42 * R, c[2] - 0.2 * R], solid(o.fur), 'fur', undefined, 'tiny');
    }

    const ex = o.extra?.(k, head, c, R, earBones);
    if (ex) {
      if (ex.glow) glow.push(...ex.glow);
      if (ex.jiggles) jiggles.push(...ex.jiggles);
    }
    return { eyes, jaw, jiggles, glow };
  };
}
