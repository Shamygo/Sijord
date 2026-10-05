import * as THREE from 'three';
import { clamp, lerp, sampleClamped, smoothstep, type Keys } from '../player/anim-math';

/**
 * Procedural geometry for the creatures: smooth lofted bodies, swept tubes (tails, antlers,
 * limbs, fern fronds), ellipsoids, leaves and flat wings, all coloured with per-vertex paint so
 * one material covers a whole creature and colour boundaries stay soft (cream bellies, dark
 * paws, ember tips) instead of being seams between intersecting meshes.
 *
 * Every geometry here is indexed and carries exactly `position`, `normal` and (after painting)
 * `color`, so the kit can merge them into one skinned mesh per material.
 */

/** Per-vertex colour function: position and normal in the geometry's own space. */
export type Paint = (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void;

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

/** Adds (or replaces) a linear-space `color` attribute computed by `paint`. */
export function paint(geo: THREE.BufferGeometry, fn: Paint): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nor, i);
    _c.setRGB(1, 1, 1);
    fn(_p, _n, _c);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Drops attributes the creature pipeline doesn't use (uv) and makes sure there's an index. */
export function clean(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('uv1');
  if (!geo.index) {
    const n = (geo.getAttribute('position') as THREE.BufferAttribute).count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Paint helpers
// ---------------------------------------------------------------------------------------------

/** A 0..1 weight for a vertex. */
export type Mask = (p: THREE.Vector3, n: THREE.Vector3) => number;

export interface Layer {
  color: THREE.ColorRepresentation;
  mask: Mask;
  /** Opacity of the layer (default 1). */
  k?: number;
}

const _lc = new THREE.Color();
/** Base colour with masked layers blended on top, in order. */
export function layered(base: THREE.ColorRepresentation, ...layers: Layer[]): Paint {
  const b = new THREE.Color(base);
  const ls = layers.map((l) => ({ c: new THREE.Color(l.color), mask: l.mask, k: l.k ?? 1 }));
  return (p, n, out) => {
    out.copy(b);
    for (const l of ls) {
      const w = clamp(l.mask(p, n) * l.k, 0, 1);
      if (w > 0) out.lerp(_lc.copy(l.c), w);
    }
  };
}

export function solid(color: THREE.ColorRepresentation): Paint {
  const c = new THREE.Color(color);
  return (_p, _n, out) => {
    out.copy(c);
  };
}

/** Smooth ramp along an axis: 0 at `a`, 1 at `b` (either order). */
export function along(axis: 'x' | 'y' | 'z', a: number, b: number): Mask {
  return (p) => (a < b ? smoothstep(a, b, p[axis]) : 1 - smoothstep(b, a, p[axis]));
}
/** Normal facing a direction: 0 below cos `from`, 1 above cos `to`. */
export function facing(dx: number, dy: number, dz: number, from = 0.0, to = 0.6): Mask {
  const d = new THREE.Vector3(dx, dy, dz).normalize();
  return (_p, n) => smoothstep(from, to, n.dot(d));
}
/** Soft sphere around a point. */
export function blob(x: number, y: number, z: number, r: number, soft = 0.4): Mask {
  return (p) => {
    const d = Math.hypot(p.x - x, p.y - y, p.z - z);
    return 1 - smoothstep(r * (1 - soft), r, d);
  };
}
/** Several soft spots (e.g. fawn spots), each [x, y, z, r]. */
export function spots(list: readonly (readonly [number, number, number, number])[], soft = 0.35): Mask {
  return (p) => {
    let m = 0;
    for (const [x, y, z, r] of list) {
      const d = Math.hypot(p.x - x, p.y - y, p.z - z);
      m = Math.max(m, 1 - smoothstep(r * (1 - soft), r, d));
    }
    return m;
  };
}
export function mul(...ms: Mask[]): Mask {
  return (p, n) => {
    let v = 1;
    for (const m of ms) v *= m(p, n);
    return v;
  };
}
export function maxOf(...ms: Mask[]): Mask {
  return (p, n) => {
    let v = 0;
    for (const m of ms) v = Math.max(v, m(p, n));
    return v;
  };
}
export function inv(m: Mask): Mask {
  return (p, n) => 1 - m(p, n);
}
/** Mirror a mask in x (|x|), handy for symmetric markings. */
export function symX(m: Mask): Mask {
  const q = new THREE.Vector3();
  return (p, n) => m(q.set(Math.abs(p.x), p.y, p.z), n);
}

// ---------------------------------------------------------------------------------------------
// Loft: elliptical sections along an axis, rounded caps
// ---------------------------------------------------------------------------------------------

export interface Sec {
  /** Position along the loft axis. */
  t: number;
  /** Half width (x). */
  w: number;
  /** Half height on the "up" side of the centre line. */
  h: number;
  /** Half height on the "down" side (defaults to h). */
  hb?: number;
  /** Centre line offset on the up axis. */
  c?: number;
  /** Centre line offset in x. */
  x?: number;
}

export interface LoftOpts {
  radial?: number;
  rings?: number;
  /** Length of the rounded cap before the first / after the last section (0 = flat). */
  cap0?: number;
  cap1?: number;
  capRings?: number;
  /** 'z': sections are XY rings along +Z, "up" is +Y. 'y': XZ rings along +Y, "up" is +Z. */
  axis?: 'z' | 'y';
  /** Superellipse exponent: 2 = ellipse, larger = boxier. */
  exp?: number;
  /** Optional per-vertex callback for t (along), so the caller can skin by it. */
  onVertex?: (t: number) => void;
}

function keysOf(secs: Sec[], f: (s: Sec) => number): Keys {
  return secs.map((s) => [s.t, f(s)] as const);
}

function sexp(v: number, e: number): number {
  return e === 2 ? v : Math.sign(v) * Math.pow(Math.abs(v), 2 / e);
}

export function loft(secs: Sec[], o: LoftOpts = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 20;
  const rings = o.rings ?? 20;
  const capRings = o.capRings ?? 5;
  const e = o.exp ?? 2;
  const axisY = o.axis === 'y';
  const kw = keysOf(secs, (s) => s.w);
  const kh = keysOf(secs, (s) => s.h);
  const khb = keysOf(secs, (s) => s.hb ?? s.h);
  const kc = keysOf(secs, (s) => s.c ?? 0);
  const kx = keysOf(secs, (s) => s.x ?? 0);
  const t0 = secs[0].t;
  const t1 = secs[secs.length - 1].t;
  const cap0 = o.cap0 ?? Math.min(secs[0].w, secs[0].h);
  const cap1 = o.cap1 ?? Math.min(secs[secs.length - 1].w, secs[secs.length - 1].h);

  // Ring list: [t position, sample t, radius scale].
  const ringList: [number, number, number][] = [];
  for (let k = capRings - 1; k >= 1; k--) {
    const a = (k / capRings) * (Math.PI / 2);
    ringList.push([t0 - cap0 * Math.sin(a), t0, Math.cos(a)]);
  }
  for (let i = 0; i <= rings; i++) {
    const t = lerp(t0, t1, i / rings);
    ringList.push([t, t, 1]);
  }
  for (let k = 1; k < capRings; k++) {
    const a = (k / capRings) * (Math.PI / 2);
    ringList.push([t1 + cap1 * Math.sin(a), t1, Math.cos(a)]);
  }

  const pos: number[] = [];
  const idx: number[] = [];
  const put = (x: number, up: number, t: number): void => {
    if (axisY) pos.push(x, t, up);
    else pos.push(x, up, t);
    o.onVertex?.(t);
  };
  // apex 0
  put(sampleClamped(kx, t0), sampleClamped(kc, t0), t0 - cap0);
  for (const [t, st, sc] of ringList) {
    const w = sampleClamped(kw, st) * sc;
    const h = sampleClamped(kh, st) * sc;
    const hb = sampleClamped(khb, st) * sc;
    const c = sampleClamped(kc, st);
    const x0 = sampleClamped(kx, st);
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const cs = sexp(Math.cos(th), e);
      const sn = sexp(Math.sin(th), e);
      put(x0 + w * cs, c + (sn >= 0 ? h : hb) * sn, t);
    }
  }
  const apex1 = pos.length / 3;
  put(sampleClamped(kx, t1), sampleClamped(kc, t1), t1 + cap1);

  const tri = (a: number, b: number, c: number): void => {
    if (axisY) idx.push(a, c, b);
    else idx.push(a, b, c);
  };
  const ring = (r: number, j: number): number => 1 + r * radial + (j % radial);
  const nr = ringList.length;
  for (let j = 0; j < radial; j++) tri(0, ring(0, j + 1), ring(0, j));
  for (let r = 0; r < nr - 1; r++) {
    for (let j = 0; j < radial; j++) {
      const a = ring(r, j);
      const b = ring(r, j + 1);
      const c = ring(r + 1, j + 1);
      const d = ring(r + 1, j);
      tri(a, b, c);
      tri(a, c, d);
    }
  }
  for (let j = 0; j < radial; j++) tri(ring(nr - 1, j), ring(nr - 1, j + 1), apex1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------------------------
// Sweep: a tube along a smooth 3D curve with a radius profile
// ---------------------------------------------------------------------------------------------

export type V3 = readonly [number, number, number];

export interface SweepOpts {
  radial?: number;
  segs?: number;
  /** Cross-section aspect: the "binormal" half-axis is ratio * radius (flat ribbons < 1). */
  ratio?: number;
  /** Hint for the cross-section's normal axis at the start of the curve. */
  up?: V3;
  /** Rounded cap lengths as a multiple of the end radius (0 = flat/pointed). */
  cap0?: number;
  cap1?: number;
  capRings?: number;
  /** Receives the curve parameter u (0..1) of every vertex, in order (for skinning). */
  onVertex?: (u: number) => void;
  /** Cups a flat (ratio < 1) cross-section: the wide edges bend towards +binormal by cup * r. */
  cup?: number;
}

/**
 * Tube along a centripetal Catmull-Rom curve through `pts`. `radius` is a constant or keys over
 * u in [0, 1] (arc length). Frames are parallel-transported from the `up` hint so they don't flip.
 */
export function sweep(pts: readonly V3[], radius: number | Keys, o: SweepOpts = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 12;
  const segs = o.segs ?? 12;
  const ratio = o.ratio ?? 1;
  const capRings = o.capRings ?? 4;
  const cup = o.cup ?? 0;
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    'centripetal',
  );
  const rAt = (u: number): number => (typeof radius === 'number' ? radius : sampleClamped(radius, u));

  // Frames along the curve.
  const P: THREE.Vector3[] = [];
  const T: THREE.Vector3[] = [];
  const N: THREE.Vector3[] = [];
  const B: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    P.push(curve.getPointAt(u));
    T.push(curve.getTangentAt(u).normalize());
  }
  const up = new THREE.Vector3(...(o.up ?? [0, 1, 0]));
  let n0 = up.clone().addScaledVector(T[0], -up.dot(T[0]));
  if (n0.lengthSq() < 1e-6) n0 = new THREE.Vector3(0, 0, 1).addScaledVector(T[0], -T[0].z);
  if (n0.lengthSq() < 1e-6) n0 = new THREE.Vector3(1, 0, 0);
  N.push(n0.normalize());
  const q = new THREE.Quaternion();
  for (let i = 1; i <= segs; i++) {
    q.setFromUnitVectors(T[i - 1], T[i]);
    const n = N[i - 1].clone().applyQuaternion(q);
    n.addScaledVector(T[i], -n.dot(T[i])).normalize();
    N.push(n);
  }
  for (let i = 0; i <= segs; i++) B.push(new THREE.Vector3().crossVectors(T[i], N[i]).normalize());

  const pos: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  const ringAt = (i: number, scale: number, offT: number, u: number): void => {
    const r = rAt(u) * scale;
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      v.copy(P[i])
        .addScaledVector(T[i], offT)
        .addScaledVector(N[i], r * cs)
        .addScaledVector(B[i], r * ratio * sn + cup * r * cs * cs);
      pos.push(v.x, v.y, v.z);
      o.onVertex?.(u);
    }
  };
  const r0 = rAt(0);
  const r1 = rAt(1);
  const cap0 = (o.cap0 ?? 1) * r0;
  const cap1 = (o.cap1 ?? 1) * r1;
  // apex 0
  v.copy(P[0]).addScaledVector(T[0], -cap0);
  pos.push(v.x, v.y, v.z);
  o.onVertex?.(0);
  let ringsBuilt = 0;
  for (let k = capRings - 1; k >= 1; k--) {
    const a = (k / capRings) * (Math.PI / 2);
    ringAt(0, Math.cos(a), -cap0 * Math.sin(a), 0);
    ringsBuilt++;
  }
  for (let i = 0; i <= segs; i++) {
    ringAt(i, 1, 0, i / segs);
    ringsBuilt++;
  }
  for (let k = 1; k < capRings; k++) {
    const a = (k / capRings) * (Math.PI / 2);
    ringAt(segs, Math.cos(a), cap1 * Math.sin(a), 1);
    ringsBuilt++;
  }
  const apex1 = pos.length / 3;
  v.copy(P[segs]).addScaledVector(T[segs], cap1);
  pos.push(v.x, v.y, v.z);
  o.onVertex?.(1);

  const ring = (r: number, j: number): number => 1 + r * radial + (j % radial);
  for (let j = 0; j < radial; j++) idx.push(0, ring(0, j + 1), ring(0, j));
  for (let r = 0; r < ringsBuilt - 1; r++) {
    for (let j = 0; j < radial; j++) {
      const a = ring(r, j);
      const b = ring(r, j + 1);
      const c = ring(r + 1, j + 1);
      const d = ring(r + 1, j);
      idx.push(a, b, c, a, c, d);
    }
  }
  for (let j = 0; j < radial; j++) idx.push(ring(ringsBuilt - 1, j), ring(ringsBuilt - 1, j + 1), apex1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Tapered capsule from the origin down -Y by `len` (limb segment hanging from its joint). */
export function limb(rTop: number, rBot: number, len: number, radial = 10, bulge = 0): THREE.BufferGeometry {
  const mid = rTop * 0.5 + rBot * 0.5;
  const k: Keys = bulge
    ? [
        [0, rTop],
        [0.35, Math.max(rTop, mid) * (1 + bulge)],
        [1, rBot],
      ]
    : [
        [0, rTop],
        [1, rBot],
      ];
  return sweep(
    [
      [0, 0, 0],
      [0, -len * 0.5, 0],
      [0, -len, 0],
    ],
    k,
    { radial, segs: bulge ? 3 : 1, up: [0, 0, 1], capRings: 3 },
  );
}

// ---------------------------------------------------------------------------------------------
// Simple solids
// ---------------------------------------------------------------------------------------------

export type Detail = 'hi' | 'mid' | 'lo' | 'sm' | 'tiny' | 'eye';
const SPHERE_SEG: Record<Detail, [number, number]> = { hi: [20, 14], mid: [16, 11], lo: [11, 7], sm: [9, 6], tiny: [7, 5], eye: [12, 9] };

/** Ellipsoid with radii (rx, ry, rz), centred at the origin. */
export function ellipsoid(rx: number, ry: number, rz: number, detail: Detail = 'mid'): THREE.BufferGeometry {
  const [w, h] = SPHERE_SEG[detail];
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return clean(g);
}

/**
 * Teardrop / tuft pointing along +Y: round base of radius r, tip at `len`, optionally curved
 * towards +Z by `curl` (metres of tip offset).
 */
export function tuft(r: number, len: number, curl = 0, radial = 7, ratio = 1): THREE.BufferGeometry {
  return sweep(
    [
      [0, 0, 0],
      [0, len * 0.45, curl * 0.25],
      [0, len, curl],
    ],
    [
      [0, r * 0.85],
      [0.28, r],
      [0.58, r * 0.72],
      [0.86, r * 0.3],
      [1, r * 0.05],
    ],
    { radial, segs: 6, cap0: 1, cap1: 0.4, ratio, up: [0, 0, 1], capRings: 2 },
  );
}

/**
 * Flat-ish leaf in the XY plane pointing along +Y, thickness along Z: `w` half width, `len`
 * length, `cup` bends the blade so its face is concave towards +Z.
 */
export function leaf(w: number, len: number, thick: number, cup = 0, widest = 0.45, radial = 14, rings = 14): THREE.BufferGeometry {
  const secs: Sec[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Width profile: grows to `widest` then tapers to a point.
    const wt = t < widest ? Math.sin((t / widest) * (Math.PI / 2)) : Math.cos(((t - widest) / (1 - widest)) * (Math.PI / 2));
    const ww = Math.max(w * 0.06, w * Math.pow(Math.max(wt, 0), 0.8));
    secs.push({ t: t * len, w: ww, h: thick, hb: thick * 0.6 });
  }
  const g = loft(secs, { axis: 'y', radial, rings, cap0: thick, cap1: thick * 2, capRings: 3 });
  if (cup) bend(g, (p) => p.z + cup * (p.x / w) * (p.x / w) * w);
  return g;
}

/** Heart-shaped clover leaflet in the XY plane, notch at +Y (two lobes), thickness along Z. */
export function heartLeaf(r: number, thick: number, radial = 16, rings = 14): THREE.BufferGeometry {
  // Two overlapping lobes merged into one closed shape via a loft along Y with a split profile:
  // simplest robust approach is a flattened loft whose width follows a heart outline.
  const secs: Sec[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Heart: narrow point at the stem (t=0), widest near t=0.65, small notch at the top.
    const w = r * (0.12 + 0.95 * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.25 * smoothstep(0.85, 1, t)));
    secs.push({ t: t * r * 1.7, w, h: thick, hb: thick * 0.7 });
  }
  const g = loft(secs, { axis: 'y', radial, rings, cap0: thick, cap1: r * 0.25, capRings: 3 });
  // Notch: pull the top-centre vertices down.
  bend(g, (p) => p.z, (p) => {
    const top = r * 1.7;
    const k = Math.max(0, 1 - Math.abs(p.x) / (r * 0.35));
    return p.y - k * k * smoothstep(top * 0.75, top * 1.12, p.y) * r * 0.35;
  });
  return g;
}

/**
 * Re-maps vertex z (and optionally y) with functions of the original position, then recomputes
 * normals. Used for cupping leaves and ears.
 */
export function bend(
  geo: THREE.BufferGeometry,
  fz: (p: THREE.Vector3) => number,
  fy?: (p: THREE.Vector3) => number,
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const z = fz(p);
    const y = fy ? fy(p) : p.y;
    pos.setXYZ(i, p.x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** General per-vertex displacement. */
export function displace(geo: THREE.BufferGeometry, f: (p: THREE.Vector3) => void): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    f(p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Thin flat panel from a 2D outline (XY plane), extruded by `thick` along Z with softly rounded
 * rims. Used for wings and fins. The outline is a closed polygon (counter-clockwise).
 */
export function panel(outline: readonly (readonly [number, number])[], thick: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: true,
    bevelThickness: thick * 0.5,
    bevelSize: thick * 0.6,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -thick / 2);
  // Extrude geometry is non-indexed with split normals; keep it that way (crisp rim) but index it.
  return clean(g);
}

/** Torus (ring) in the XY plane. */
export function ring(r: number, tube: number, radial = 8, tubular = 24, arc = Math.PI * 2): THREE.BufferGeometry {
  return clean(new THREE.TorusGeometry(r, tube, radial, tubular, arc));
}

/** Cone pointing +Y with its base at the origin. */
export function cone(r: number, h: number, radial = 10): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, radial, 1);
  g.translate(0, h / 2, 0);
  return clean(g);
}

/** Lathe from (radius, y) pairs, closed at both ends. */
export function lathe(profile: readonly (readonly [number, number])[], radial = 20): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    radial,
  );
  return clean(g);
}

/** Number of triangles in a geometry. */
export function triCount(geo: THREE.BufferGeometry): number {
  return geo.index ? geo.index.count / 3 : (geo.getAttribute('position') as THREE.BufferAttribute).count / 3;
}
