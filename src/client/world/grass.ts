import * as THREE from 'three';
import { CELL, GRID_HALF, GRID_N } from './layout';
import { mulberry32 } from './noise';
import { worldUniforms } from './shared';
import { GLSL_GROUND, type TerrainQuery, type TerrainTextures } from './terrain';
import { getNoiseTexture } from './textures';
import { lambertWrapChunk } from './materials';
import type { Collider } from './types';

/**
 * GPU grass: fixed patches of blades (generated once) are stamped around the camera every frame.
 * Blade roots are placed on the terrain in the vertex shader from a height texture (exact same
 * triangle interpolation as heightAt), thinned by the ground masks (paths, sand, rock, town
 * buildings) and animated by wind waves and the player brushing through. Patches are frustum-culled
 * on the CPU right before drawing, so there is no per-frame rebuild and no lag.
 */

export type GrassQualityName = 'low' | 'medium' | 'high';

interface LayerSpec {
  patch: number;
  density: number;
  segs: number;
  /** Blade height (m), width (m), width growth per metre of distance. */
  height: number;
  width: number;
  widthGrowth: number;
  /** Visible band: fade in over [r0, r1], fade out over [r2, r3] (metres from the camera). */
  r0: number; r1: number; r2: number; r3: number;
}

const QUALITY: Record<GrassQualityName, { detail: LayerSpec; base: LayerSpec; flowers: number; flowerR: number }> = {
  low: {
    detail: { patch: 8, density: 12, segs: 2, height: 0.55, width: 0.07, widthGrowth: 0.02, r0: -1, r1: 0, r2: 8, r3: 12 },
    base: { patch: 10, density: 4.5, segs: 1, height: 0.58, width: 0.1, widthGrowth: 0.03, r0: -1, r1: 0, r2: 24, r3: 32 },
    flowers: 1.0, flowerR: 22,
  },
  medium: {
    detail: { patch: 8, density: 30, segs: 3, height: 0.56, width: 0.06, widthGrowth: 0.012, r0: -1, r1: 0, r2: 12, r3: 18 },
    base: { patch: 10, density: 8, segs: 2, height: 0.6, width: 0.085, widthGrowth: 0.022, r0: -1, r1: 0, r2: 36, r3: 48 },
    flowers: 1.6, flowerR: 34,
  },
  high: {
    detail: { patch: 8, density: 40, segs: 3, height: 0.58, width: 0.06, widthGrowth: 0.01, r0: -1, r1: 0, r2: 18, r3: 25 },
    base: { patch: 10, density: 11, segs: 2, height: 0.62, width: 0.08, widthGrowth: 0.018, r0: -1, r1: 0, r2: 52, r3: 68 },
    flowers: 2.2, flowerR: 46,
  },
};

const MAX_PATCHES = 1024;
const GRID_V = GRID_N + 1;

const GLSL_TERRAIN_SAMPLE = /* glsl */ `
uniform sampler2D uHeight;
const float SJ_GRID_HALF = ${GRID_HALF.toFixed(1)};
const float SJ_CELL = ${CELL.toFixed(3)};
const float SJ_GRID_N = ${GRID_N.toFixed(1)};
const float SJ_GRID_V = ${GRID_V.toFixed(1)};
/** Exact triangle interpolation (diagonal b-c), plus a smooth gradient for shading. */
float sjTerrainH(vec2 xz, out vec2 grad) {
  vec2 g = clamp((xz + SJ_GRID_HALF) / SJ_CELL, vec2(0.0), vec2(SJ_GRID_N - 1e-3));
  ivec2 i = ivec2(floor(g));
  vec2 f = g - vec2(i);
  float a = texelFetch(uHeight, i, 0).r;
  float b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r;
  float d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
  grad = vec2(mix(b - a, d - c, f.y), mix(c - a, d - b, f.x)) / SJ_CELL;
  if (f.x + f.y <= 1.0) return a + (b - a) * f.x + (c - a) * f.y;
  return d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
}
vec2 sjGridUv(vec2 xz) { return ((xz + SJ_GRID_HALF) / SJ_CELL + 0.5) / SJ_GRID_V; }
`;

const GLSL_PLACEMENT = /* glsl */ `
uniform sampler2D uGround;
uniform sampler2D uMask;
uniform sampler2D uTownMask;
uniform vec4 uTownBox;
uniform sampler2D uPatches;
uniform float uTime;
uniform vec2 uWind;
uniform vec3 uFocus;
uniform vec4 uRange;
uniform vec4 uBlade;
attribute vec4 aBlade;
varying vec3 vSjCol;
varying float vSjGlow;
${GLSL_TERRAIN_SAMPLE}
${GLSL_GROUND}
float sjGrassWeight(vec2 root, out vec4 ground) {
  vec2 guv = sjGridUv(root);
  ground = textureLod(uGround, guv, 0.0);
  vec4 msk = textureLod(uMask, guv, 0.0);
  float w = ground.a;
  w *= 1.0 - sjDirtMask(msk.r, root);
  w *= 1.0 - sjSandMask(msk.g, root);
  vec2 tuv = (root - uTownBox.xy) / uTownBox.zw;
  if (tuv.x > 0.0 && tuv.y > 0.0 && tuv.x < 1.0 && tuv.y < 1.0) w *= 1.0 - textureLod(uTownMask, tuv, 0.0).r;
  return w;
}
`;

function bladeGeometry(spec: LayerSpec, seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const n = Math.round(spec.patch * spec.patch * spec.density);
  const segs = spec.segs;
  const vpb = 2 * segs + 1;
  const pos = new Float32Array(n * vpb * 3);
  const blade = new Float32Array(n * vpb * 4);
  const idx: number[] = [];
  // stratified jitter keeps coverage even
  const side = Math.ceil(Math.sqrt(n));
  const cellSz = spec.patch / side;
  let b = 0;
  for (let gy = 0; gy < side && b < n; gy++) {
    for (let gx = 0; gx < side && b < n; gx++, b++) {
      const lx = (gx + rnd()) * cellSz, lz = (gy + rnd()) * cellSz;
      const r1 = rnd(), r2 = rnd();
      const base = b * vpb;
      for (let s = 0; s < segs; s++) {
        const t = Math.pow(s / segs, 0.85);
        for (const sd of [-1, 1]) {
          const v = base + s * 2 + (sd > 0 ? 1 : 0);
          pos[v * 3] = sd; pos[v * 3 + 1] = t; pos[v * 3 + 2] = 0;
        }
      }
      const tip = base + segs * 2;
      pos[tip * 3] = 0; pos[tip * 3 + 1] = 1; pos[tip * 3 + 2] = 0;
      for (let v = base; v < base + vpb; v++) {
        blade[v * 4] = lx; blade[v * 4 + 1] = lz; blade[v * 4 + 2] = r1; blade[v * 4 + 3] = r2;
      }
      for (let s = 0; s < segs - 1; s++) {
        const l0 = base + s * 2, r0 = l0 + 1, l1 = l0 + 2, rr1 = l0 + 3;
        idx.push(l0, r0, l1, r0, rr1, l1);
      }
      const ll = base + (segs - 1) * 2;
      idx.push(ll, ll + 1, tip);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // normals are computed in the shader; the attribute only keeps three from treating it as flat-shaded
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('aBlade', new THREE.BufferAttribute(blade, 4));
  g.setIndex(idx);
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

/** Small daisies / buttercups: a stem quad, a 6-petal star and a centre. */
function flowerGeometry(patch: number, density: number, seed: number): THREE.BufferGeometry {
  const rnd = mulberry32(seed);
  const n = Math.max(1, Math.round(patch * patch * density));
  const pos: number[] = [];
  const blade: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  for (let f = 0; f < n; f++) {
    const lx = rnd() * patch, lz = rnd() * patch, r1 = rnd(), r2 = rnd();
    const base = pos.length / 3;
    const push = (x: number, y: number, z: number, p: number) => {
      pos.push(x, y, z);
      blade.push(lx, lz, r1, r2);
      part.push(p);
    };
    // stem
    push(-0.012, 0, 0, 0); push(0.012, 0, 0, 0); push(-0.008, 1, 0, 0); push(0.008, 1, 0, 0);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    // petals (fan around the centre), slightly cupped
    const c = pos.length / 3;
    push(0, 1.0, 0, 2);
    const P = 10;
    for (let i = 0; i < P; i++) {
      const a = (i / P) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.075 : 0.045;
      push(Math.cos(a) * r, 1.0 + (i % 2 === 0 ? 0.012 : 0.0), Math.sin(a) * r, 1);
    }
    for (let i = 0; i < P; i++) idx.push(c, c + 1 + i, c + 1 + ((i + 1) % P));
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('aBlade', new THREE.Float32BufferAttribute(blade, 4));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setIndex(idx);
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

interface Shared {
  tex: TerrainTextures;
  townMask: THREE.Texture;
  townBox: THREE.Vector4;
}

function makeBladeMaterial(shared: Shared, patches: THREE.DataTexture, spec: LayerSpec): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const range = new THREE.Vector4(spec.r0, spec.r1, spec.r2, spec.r3);
  const bladeU = new THREE.Vector4(spec.height, spec.width, spec.widthGrowth, 0);
  mat.userData.range = range;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uHeight: { value: shared.tex.height },
      uGround: { value: shared.tex.ground },
      uMask: { value: shared.tex.mask },
      uTownMask: { value: shared.townMask },
      uTownBox: { value: shared.townBox },
      uPatches: { value: patches },
      uGroundNoise: { value: getNoiseTexture() },
      uTime: worldUniforms.uTime,
      uWind: worldUniforms.uWind,
      uFocus: worldUniforms.uFocus,
      uRange: { value: range },
      uBlade: { value: bladeU },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_PLACEMENT}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec4 sjPatch = texelFetch(uPatches, ivec2(gl_InstanceID, 0), 0);
        vec2 root = sjPatch.xy + aBlade.xy;
        float r1 = aBlade.z, r2 = aBlade.w;
        float t = position.y;
        float side = position.x;
        float dCam = distance(root, cameraPosition.xz);
        vec4 ground;
        float w = sjGrassWeight(root, ground);
        float band = smoothstep(uRange.x, uRange.y, dCam) * (1.0 - smoothstep(uRange.z, uRange.w, dCam));
        float keep = step(r1, w * 1.25 - 0.08);
        float s = band * keep;
        float clump = textureLod(uGroundNoise, root * 0.23, 0.0).g;
        vec2 guv0 = sjGridUv(root);
        vec4 msk0 = textureLod(uMask, guv0, 0.0);
        float edgeN = textureLod(uGroundNoise, root * 0.19, 0.0).g;
        float nearPath = smoothstep(0.08, 0.5, msk0.r + (edgeN - 0.5) * 0.25) + smoothstep(0.1, 0.5, msk0.g);
        // kept lawns in town: shorter blades inside the fence
        float townK = 1.0 - smoothstep(uTownBox.z * 0.32, uTownBox.z * 0.45, distance(root, uTownBox.xy + uTownBox.zw * 0.5));
        float H = uBlade.x * (0.5 + 0.8 * r2) * (0.6 + 0.75 * clump) * (0.35 + 0.65 * w) * (1.0 - 0.7 * clamp(nearPath, 0.0, 1.0)) * (1.0 - 0.45 * townK) * s;
        float Wd = uBlade.y * (0.7 + 0.6 * fract(r1 * 13.7)) * (1.0 + dCam * uBlade.z) * step(0.001, s);
        float yaw = fract(r1 * 7.13) * 6.2831;
        vec2 axis = vec2(cos(yaw), sin(yaw));
        vec2 vd = normalize(root - cameraPosition.xz + 1e-4);
        axis = normalize(mix(axis, vec2(-vd.y, vd.x), 0.45) + 1e-4);
        vec2 lean = vec2(cos(r2 * 6.2831 + 1.0), sin(r2 * 6.2831 + 1.0)) * (0.15 + 0.4 * fract(r1 * 5.31));
        float wl = length(uWind) + 1e-4;
        vec2 wdir = uWind / wl;
        float wphase = dot(root, wdir) * 0.13 - uTime * 1.7 + textureLod(uGroundNoise, root * 0.011, 0.0).r * 5.0;
        float gust = 0.5 + 0.5 * sin(wphase);
        gust *= gust;
        float flutter = sin(uTime * 3.9 + r1 * 40.0 + root.x * 0.7) * 0.07;
        vec2 bend = lean + uWind * (0.2 + gust * 0.6) + axis * flutter;
        vec2 away = root - uFocus.xz;
        float dA = length(away);
        bend += away / max(dA, 1e-3) * smoothstep(1.3, 0.1, dA) * 1.4;
        float bl2 = min(dot(bend, bend), 1.6);
        vec2 grad;
        float gy = sjTerrainH(root, grad);
        vec3 bladePos = vec3(root.x, gy - 0.03, root.y);
        bladePos.xz += bend * H * t * t + axis * side * Wd * (1.0 - t * 0.85);
        bladePos.y += H * t * (1.0 - 0.32 * bl2 * t);
        vec3 tN = normalize(vec3(-grad.x, 1.0, -grad.y));
        vec3 objectNormal = normalize(tN + vec3(bend.x, 0.0, bend.y) * 0.3 * t);
        // colour: root shade -> sunlit tip, painted per blade
        vec3 base = ground.rgb * ground.rgb;
        base = sjMeadowTint(base, root);
        float bv = fract(r2 * 31.7);
        base *= 0.74 + 0.46 * bv * bv;
        base = mix(base, base * vec3(1.2, 1.1, 0.78), smoothstep(0.85, 1.0, fract(r1 * 17.3)) * 0.7);
        base = mix(base, base * vec3(0.8, 0.95, 1.1), smoothstep(0.7, 0.95, clump) * 0.5);
        vec3 rootCol = base * vec3(0.42, 0.48, 0.44);
        vec3 tipCol = base * vec3(1.14, 1.11, 0.92);
        vSjCol = mix(rootCol, tipCol, smoothstep(0.0, 0.95, t));
        vSjCol *= 1.0 + gust * 0.14 * t;
        vSjGlow = t * t;
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSjCol;\nvarying float vSjGlow;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vSjCol;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <lights_lambert_pars_fragment>', lambertWrapChunk('0.4', 'vSjGlow * 0.32'));
  };
  mat.customProgramCacheKey = () => `sj-grass-${spec.segs}`;
  return mat;
}

function makeFlowerMaterial(shared: Shared, patches: THREE.DataTexture, range: THREE.Vector4): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uHeight: { value: shared.tex.height },
      uGround: { value: shared.tex.ground },
      uMask: { value: shared.tex.mask },
      uTownMask: { value: shared.townMask },
      uTownBox: { value: shared.townBox },
      uPatches: { value: patches },
      uGroundNoise: { value: getNoiseTexture() },
      uTime: worldUniforms.uTime,
      uWind: worldUniforms.uWind,
      uFocus: worldUniforms.uFocus,
      uRange: { value: range },
      uBlade: { value: new THREE.Vector4() },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aPart;\n${GLSL_PLACEMENT}`)
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        vec4 sjPatch = texelFetch(uPatches, ivec2(gl_InstanceID, 0), 0);
        vec2 root = sjPatch.xy + aBlade.xy;
        float r1 = aBlade.z, r2 = aBlade.w;
        float dCam = distance(root, cameraPosition.xz);
        vec4 ground;
        float w = sjGrassWeight(root, ground);
        float meadow = smoothstep(0.5, 0.75, textureLod(uGroundNoise, root * (1.0 / 47.0) + 0.7, 0.0).g);
        float band = 1.0 - smoothstep(uRange.z, uRange.w, dCam);
        float keep = step(r1, (meadow * 0.85 + 0.12) * w);
        float s = band * keep * (0.75 + 0.6 * r2);
        float yaw = r1 * 37.0;
        float cy = cos(yaw), sy = sin(yaw);
        float stemH = 0.3 + 0.22 * r2;
        vec3 lp = position;
        float isHead = step(0.5, aPart);
        float headScale = 1.0 + 0.5 * fract(r1 * 9.1);
        lp.xz *= mix(1.0, headScale, isHead);
        lp.y *= stemH;
        lp.xz = vec2(lp.x * cy - lp.z * sy, lp.x * sy + lp.z * cy);
        float gust = 0.5 + 0.5 * sin(dot(root, normalize(uWind + 1e-4)) * 0.13 - uTime * 1.7);
        vec2 sway = (uWind * (0.15 + gust * 0.4) + vec2(sin(uTime * 2.3 + r1 * 20.0), cos(uTime * 1.9 + r2 * 20.0)) * 0.05) * stemH;
        vec2 away = root - uFocus.xz;
        float dA = length(away);
        sway += away / max(dA, 1e-3) * smoothstep(1.0, 0.1, dA) * 0.35;
        float k = position.y;
        vec2 grad;
        float gy = sjTerrainH(root, grad);
        vec3 bladePos = vec3(root.x + lp.x * s + sway.x * k * s, gy - 0.02 + lp.y * s, root.y + lp.z * s + sway.y * k * s);
        vec3 objectNormal = normalize(vec3(-grad.x, 1.0, -grad.y));
        // palette by patch: mostly white daisies, some buttercups, a few pink / violet
        float pick = textureLod(uGroundNoise, root * (1.0 / 23.0) + 0.13, 0.0).r + (r2 - 0.5) * 0.25;
        vec3 petal = pick < 0.45 ? vec3(1.0, 0.98, 0.94) : pick < 0.62 ? vec3(1.0, 0.82, 0.18) : pick < 0.74 ? vec3(1.0, 0.98, 0.94) : pick < 0.86 ? vec3(0.98, 0.52, 0.72) : vec3(0.66, 0.5, 0.98);
        vec3 stem = vec3(0.16, 0.32, 0.08);
        vSjCol = aPart < 0.5 ? stem : aPart < 1.5 ? petal : vec3(1.0, 0.72, 0.1);
        vSjGlow = isHead * 0.5;
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = bladePos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSjCol;\nvarying float vSjGlow;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vSjCol;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <lights_lambert_pars_fragment>', lambertWrapChunk('0.5', 'vSjGlow * 0.3'));
  };
  mat.customProgramCacheKey = () => 'sj-flowers';
  return mat;
}

/** A layer of identical patches drawn with one instanced draw call. */
class PatchLayer {
  readonly mesh: THREE.Mesh;
  private readonly data = new Float32Array(MAX_PATCHES * 4);
  readonly tex: THREE.DataTexture;
  private readonly frustum = new THREE.Frustum();
  private readonly pm = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private outer: number;

  constructor(
    private readonly terrain: TerrainQuery,
    private readonly patch: number,
    outer: number,
    private readonly info: PatchInfo,
    build: (tex: THREE.DataTexture) => { geo: THREE.BufferGeometry; mat: THREE.Material },
    name: string,
  ) {
    this.outer = outer;
    this.tex = new THREE.DataTexture(this.data, MAX_PATCHES, 1, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    const { geo, mat } = build(this.tex);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.onBeforeRender = (_r, _s, camera) => this.select(camera);
  }

  setOuter(r: number): void {
    this.outer = r;
  }

  private select(camera: THREE.Camera): void {
    const geo = this.mesh.geometry as THREE.InstancedBufferGeometry;
    this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const S = this.patch;
    const cx = camera.position.x, cz = camera.position.z;
    const R = this.outer;
    const i0 = Math.floor((cx - R) / S), i1 = Math.floor((cx + R) / S);
    const j0 = Math.floor((cz - R) / S), j1 = Math.floor((cz + R) / S);
    let n = 0;
    for (let j = j0; j <= j1 && n < MAX_PATCHES; j++) {
      for (let i = i0; i <= i1 && n < MAX_PATCHES; i++) {
        const px = i * S, pz = j * S;
        const dx = Math.max(px - cx, 0, cx - (px + S));
        const dz = Math.max(pz - cz, 0, cz - (pz + S));
        if (dx * dx + dz * dz > R * R) continue;
        const pi = this.info.get(px, pz, S);
        if (pi.grass <= 0) continue;
        this.sphere.center.set(px + S / 2, (pi.minY + pi.maxY) / 2 + 0.4, pz + S / 2);
        this.sphere.radius = Math.hypot(S * 0.71, (pi.maxY - pi.minY) / 2 + 1);
        if (!this.frustum.intersectsSphere(this.sphere)) continue;
        this.data[n * 4] = px;
        this.data[n * 4 + 1] = pz;
        n++;
      }
    }
    geo.instanceCount = n;
    this.tex.needsUpdate = true;
    void this.terrain;
  }
}

/** Cached per-patch grass coverage and height range. */
class PatchInfo {
  private readonly cache = new Map<string, { grass: number; minY: number; maxY: number }>();
  constructor(private readonly terrain: TerrainQuery, private readonly blocked: (x: number, z: number) => boolean) {}
  get(px: number, pz: number, S: number): { grass: number; minY: number; maxY: number } {
    const key = `${S}:${px}:${pz}`;
    let v = this.cache.get(key);
    if (v) return v;
    let grass = 0, minY = Infinity, maxY = -Infinity;
    const n = 4;
    for (let b = 0; b <= n; b++) {
      for (let a = 0; a <= n; a++) {
        const x = px + (a / n) * S, z = pz + (b / n) * S;
        const y = this.terrain.heightAt(x, z);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const g = this.terrain.data.grass[this.terrainIndex(x, z)];
        if (g > 0.02 && !this.blocked(x, z)) grass = Math.max(grass, g);
      }
    }
    // neighbours of the sample points may still grow grass; keep a little margin
    if (grass === 0) {
      for (const [x, z] of [[px - CELL, pz - CELL], [px + S + CELL, pz + S + CELL], [px - CELL, pz + S + CELL], [px + S + CELL, pz - CELL]]) {
        if (this.terrain.data.grass[this.terrainIndex(x, z)] > 0.02) grass = 0.01;
      }
    }
    v = { grass, minY, maxY: maxY + 0.8 };
    this.cache.set(key, v);
    return v;
  }
  private terrainIndex(x: number, z: number): number {
    const i = Math.max(0, Math.min(GRID_N, Math.round((x + GRID_HALF) / CELL)));
    const j = Math.max(0, Math.min(GRID_N, Math.round((z + GRID_HALF) / CELL)));
    return j * GRID_V + i;
  }
}

/** R8 mask over the town square: 1 where buildings, beds and plazas should have no grass. */
export function makeTownMask(colliders: Collider[], cx: number, cz: number, half: number, res = 256): { tex: THREE.DataTexture; box: THREE.Vector4 } {
  const arr = new Uint8Array(res * res);
  const boxes = colliders.filter((c): c is Extract<Collider, { kind: 'box' }> =>
    c.kind === 'box' && c.maxX - c.minX < 60 && Math.abs((c.minX + c.maxX) / 2 - cx) < half + 10 && Math.abs((c.minZ + c.maxZ) / 2 - cz) < half + 10);
  const x0 = cx - half, z0 = cz - half, step = (half * 2) / res;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step;
      let v = 0;
      for (const b of boxes) {
        const dx = Math.max(b.minX - x, 0, x - b.maxX);
        const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
        const d = Math.hypot(dx, dz);
        if (d < 0.6) v = Math.max(v, 1 - d / 0.6);
      }
      arr[j * res + i] = Math.round(v * 255);
    }
  }
  const tex = new THREE.DataTexture(arr, res, res, THREE.RedFormat, THREE.UnsignedByteType);
  tex.unpackAlignment = 1;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return { tex, box: new THREE.Vector4(x0, z0, half * 2, half * 2) };
}

export class GrassSystem {
  readonly group = new THREE.Group();
  private layers: PatchLayer[] = [];
  private readonly info: PatchInfo;
  private readonly shared: Shared;
  private quality: GrassQualityName = 'medium';
  /** Radius within which the ground under the blades is darkened (shared with the terrain shader). */
  readonly grassRadius: { value: number };

  constructor(
    private readonly terrain: TerrainQuery,
    tex: TerrainTextures,
    townMask: { tex: THREE.Texture; box: THREE.Vector4 },
    blocked: (x: number, z: number) => boolean,
    grassRadius: { value: number } = { value: 40 },
  ) {
    this.grassRadius = grassRadius;
    this.group.name = 'grass';
    this.info = new PatchInfo(terrain, blocked);
    this.shared = { tex, townMask: townMask.tex, townBox: townMask.box };
    this.build('medium');
  }

  setQuality(q: GrassQualityName): void {
    if (q === this.quality && this.layers.length) return;
    this.build(q);
  }

  private build(q: GrassQualityName): void {
    this.quality = q;
    for (const l of this.layers) {
      this.group.remove(l.mesh);
      l.mesh.geometry.dispose();
      (l.mesh.material as THREE.Material).dispose();
      l.tex.dispose();
    }
    this.layers = [];
    const cfg = QUALITY[q];
    const mkBlades = (spec: LayerSpec, seed: number, name: string) =>
      new PatchLayer(this.terrain, spec.patch, spec.r3 + 2, this.info, (tex) => ({ geo: bladeGeometry(spec, seed), mat: makeBladeMaterial(this.shared, tex, spec) }), name);
    this.layers.push(mkBlades(cfg.base, 101, 'grass-base'));
    this.layers.push(mkBlades(cfg.detail, 202, 'grass-detail'));
    const fr = new THREE.Vector4(0, 0, cfg.flowerR * 0.75, cfg.flowerR);
    this.layers.push(new PatchLayer(this.terrain, 10, cfg.flowerR + 2, this.info, (tex) => ({ geo: flowerGeometry(10, cfg.flowers * 0.35, 303), mat: makeFlowerMaterial(this.shared, tex, fr) }), 'flowers'));
    for (const l of this.layers) this.group.add(l.mesh);
    this.grassRadius.value = cfg.base.r3;
  }
}
