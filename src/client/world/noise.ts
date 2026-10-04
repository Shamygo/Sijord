/** Small deterministic noise helpers (no deps). */

export function hash2i(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1]. */
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2i(ix, iz, seed);
  const b = hash2i(ix + 1, iz, seed);
  const c = hash2i(ix, iz + 1, seed);
  const d = hash2i(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

const ROT_C = Math.cos(0.6);
const ROT_S = Math.sin(0.6);

/** Fractal value noise, normalised to roughly [0,1]. Octaves are rotated to hide grid artefacts. */
export function fbm(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x, z, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    const nx = (x * ROT_C - z * ROT_S) * 2.03 + 17.1;
    const nz = (x * ROT_S + z * ROT_C) * 2.03 - 9.7;
    x = nx;
    z = nz;
  }
  return sum / norm;
}

/** Ridged fractal noise in [0,1], sharp crests at 1. */
export function ridged(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(valueNoise(x, z, seed + o * 57) * 2 - 1);
    n *= n;
    sum += amp * n * prev;
    prev = n;
    norm += amp;
    amp *= 0.5;
    const nx = (x * ROT_C - z * ROT_S) * 2.1 + 3.3;
    const nz = (x * ROT_S + z * ROT_C) * 2.1 + 7.9;
    x = nx;
    z = nz;
  }
  return sum / norm;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** GLSL-style smoothstep; works with e0 > e1 too (inverted). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Polynomial smooth max. */
export function smax(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (a - b)) / k);
  return lerp(b, a, h) + k * h * (1 - h);
}

/** GLSL source for value noise / fbm used by shaders. */
export const GLSL_NOISE = /* glsl */ `
float wHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = wHash(i), b = wHash(i + vec2(1.0, 0.0)), c = wHash(i + vec2(0.0, 1.0)), d = wHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float wFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * wNoise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s / 0.96875;
}
`;
