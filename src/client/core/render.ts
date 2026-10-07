import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Sijord's render pipeline: HDR scene render -> (AO) -> (bloom) -> painterly grade -> screen.
 *
 * Every quality renders the scene into a half-float target and finishes with one grade pass that
 * does exposure, a hue-preserving filmic curve, the painterly colour grade (warm light, blue-lifted
 * shadows, vibrance), vignette and dithering. Medium adds a soft dual-filter bloom; high adds a
 * cheap depth-only ambient occlusion and a wider bloom. Shadow map size, shadow coverage and the
 * pixel ratio also scale with quality.
 */
export type GraphicsQuality = 'low' | 'medium' | 'high';

interface Preset {
  /** Upper bound on the device pixel ratio. */
  pixelRatio: number;
  /** MSAA samples on the HDR scene target. */
  samples: number;
  shadowSize: number;
  /** Half-width (m) of the sun's shadow frustum. */
  shadowExtent: number;
  /** PCF blur radius in shadow texels. */
  shadowRadius: number;
  /** Bloom mip levels (0 = no bloom). */
  bloomLevels: number;
  bloomStrength: number;
  ao: boolean;
}

const PRESETS: Record<GraphicsQuality, Preset> = {
  low: { pixelRatio: 1, samples: 2, shadowSize: 1024, shadowExtent: 38, shadowRadius: 1.5, bloomLevels: 0, bloomStrength: 0, ao: false },
  medium: { pixelRatio: 1.25, samples: 4, shadowSize: 2048, shadowExtent: 58, shadowRadius: 2.5, bloomLevels: 5, bloomStrength: 0.2, ao: false },
  high: { pixelRatio: 2, samples: 4, shadowSize: 4096, shadowExtent: 80, shadowRadius: 3, bloomLevels: 6, bloomStrength: 0.22, ao: true },
};

const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Soft-threshold prefilter + 4-tap box downsample with a Karis average (no fireflies from water glints). */
const BLOOM_PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform vec4 uThreshold; // threshold, knee, knee*2, 0.25/knee
varying vec2 vUv;
vec4 tap(vec2 o) {
  vec3 c = min(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(64.0));
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - uThreshold.x + uThreshold.y, 0.0, uThreshold.z);
  rq = uThreshold.w * rq * rq;
  float w = max(rq, br - uThreshold.x) / max(br, 1e-4);
  c *= w;
  // Karis weight
  float kw = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
  return vec4(c * kw, kw);
}
void main() {
  vec4 s = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  gl_FragColor = vec4(s.rgb / max(s.a, 1e-4), 1.0);
}`;

const BLOOM_DOWN_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  s = s * 0.125 + texture2D(tSrc, vUv).rgb * 0.5;
  gl_FragColor = vec4(s, 1.0);
}`;

/** 9-tap tent upsample, blended additively into the next larger level. */
const BLOOM_UP_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(-1.0, 0.0) * uTexel).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(1.0, 0.0) * uTexel).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -1.0) * uTexel).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, 1.0) * uTexel).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  s += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(s * (uWeight / 16.0), 1.0);
}`;

/** Depth-only ambient occlusion at half resolution (normals rebuilt from depth). */
const AO_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uProj;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uRadius;
varying vec2 vUv;
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  float d = texture2D(tDepth, vUv).r;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 px = viewPos(vUv + vec2(uTexel.x, 0.0)) - P;
  vec3 nx = P - viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 py = viewPos(vUv + vec2(0.0, uTexel.y)) - P;
  vec3 ny = P - viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(px.z) < abs(nx.z) ? px : nx;
  vec3 dy = abs(py.z) < abs(ny.z) ? py : ny;
  vec3 N = normalize(cross(dx, dy));
  float dist = -P.z;
  float rad = uRadius * (1.0 + dist * 0.02);
  float screenR = rad * uProj[1][1] / max(dist, 0.1) * 0.5;
  float phi = ign(gl_FragCoord.xy) * 6.2831853;
  float ao = 0.0;
  const int N_SAMPLES = 10;
  for (int i = 0; i < N_SAMPLES; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(N_SAMPLES));
    float a = fi * 2.39996323 + phi;
    vec2 o = vec2(cos(a), sin(a)) * r * screenR;
    vec3 S = viewPos(vUv + o);
    vec3 v = S - P;
    float l = length(v);
    float occ = max(dot(N, v / max(l, 1e-4)) - 0.12, 0.0);
    occ *= 1.0 - smoothstep(rad * 0.6, rad * 1.6, l);
    ao += occ;
  }
  ao = 1.0 - ao / float(N_SAMPLES) * 1.6;
  ao = mix(1.0, clamp(ao, 0.0, 1.0), 1.0 - smoothstep(60.0, 140.0, dist));
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const GRADE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tAO;
uniform vec2 uTexel;
uniform vec2 uAOTexel;
uniform float uExposure;
uniform float uBloom;
uniform float uAO;
uniform float uVignette;
uniform float uTime;
varying vec2 vUv;

// Khronos PBR Neutral: keeps hues and saturation of authored colours, only rolls off highlights.
vec3 neutralCurve(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.12;
  float x = min(color.r, min(color.g, color.b));
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  #ifdef USE_AO
    float ao = texture2D(tAO, vUv).r * 0.4;
    ao += texture2D(tAO, vUv + vec2(uAOTexel.x, 0.0)).r * 0.15;
    ao += texture2D(tAO, vUv - vec2(uAOTexel.x, 0.0)).r * 0.15;
    ao += texture2D(tAO, vUv + vec2(0.0, uAOTexel.y)).r * 0.15;
    ao += texture2D(tAO, vUv - vec2(0.0, uAOTexel.y)).r * 0.15;
    // occlusion tints toward cool blue rather than grey
    col *= mix(vec3(1.0), mix(vec3(0.55, 0.62, 0.78), vec3(1.0), ao), uAO);
  #endif
  #ifdef USE_BLOOM
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    col += bloom * uBloom;
  #endif
  col *= uExposure;
  col = neutralCurve(col);

  // ---- painterly grade (linear, 0..1) ----
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // vibrance: push muted colours more than already-saturated ones
  float mx = max(col.r, max(col.g, col.b));
  float mn = min(col.r, min(col.g, col.b));
  float sat = (mx - mn) / max(mx, 1e-4);
  col = max(mix(vec3(luma), col, 1.0 + 0.16 * (1.0 - sat)), 0.0);
  // split tone: shadows lifted toward blue, highlights warmed by the sun
  float shadowK = 1.0 - smoothstep(0.0, 0.32, luma);
  float highK = smoothstep(0.35, 0.95, luma);
  col += vec3(0.004, 0.012, 0.03) * shadowK;
  col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.97), highK);

  vec3 s = toSRGB(col);
  // gentle S-curve in display space
  s = mix(s, s * s * (3.0 - 2.0 * s), 0.12);
  // vignette
  vec2 q = vUv - 0.5;
  float vig = 1.0 - dot(q, q) * uVignette;
  s *= mix(vec3(0.92, 0.95, 1.0), vec3(1.0), vig) * vig;
  // dither away banding in the sky gradient
  float n = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  s += (n - 0.5) / 255.0;
  gl_FragColor = vec4(s, 1.0);
}`;

function makeTarget(w: number, h: number, opts: THREE.RenderTargetOptions = {}): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    ...opts,
  });
}

export class RenderPipeline {
  private preset: Preset;
  private quality: GraphicsQuality;
  private width = 1;
  private height = 1;
  private sceneRT!: THREE.WebGLRenderTarget;
  private aoRT: THREE.WebGLRenderTarget | null = null;
  private bloomRTs: THREE.WebGLRenderTarget[] = [];
  private readonly quad = new FullScreenQuad();
  private readonly prefilterMat: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  private readonly aoMat: THREE.ShaderMaterial;
  private gradeMat: THREE.ShaderMaterial;
  private sun: THREE.DirectionalLight | null = null;
  private sunScanTimer = 0;
  private time = 0;
  /** Scene exposure, raised at night so moonlight stays readable (`daynight.ts`). */
  private exposure = 1;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    quality: GraphicsQuality,
  ) {
    this.quality = quality;
    this.preset = PRESETS[quality];
    // Tone mapping and colour-space conversion happen in the grade pass; the scene renders linear HDR.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.info.autoReset = false;

    const shader = (frag: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.prefilterMat = shader(BLOOM_PREFILTER_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: new THREE.Vector4() },
    });
    this.downMat = shader(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = shader(BLOOM_UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, {
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    this.aoMat = shader(AO_FRAG, {
      tDepth: { value: null },
      uProjInv: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
      uRadius: { value: 0.9 },
    });
    this.gradeMat = this.makeGradeMaterial();
    this.setThreshold(1.0, 0.6);
    this.applyQuality();
    const size = renderer.getSize(new THREE.Vector2());
    this.setSize(size.x || innerWidth, size.y || innerHeight);
  }

  get currentQuality(): GraphicsQuality {
    return this.quality;
  }

  setQuality(q: GraphicsQuality): void {
    if (q === this.quality) return;
    this.quality = q;
    this.preset = PRESETS[q];
    this.applyQuality();
    this.gradeMat.dispose();
    this.gradeMat = this.makeGradeMaterial();
    this.setSize(this.width, this.height);
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    const pr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, this.preset.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.width, this.height, false);
    const W = Math.max(1, Math.round(this.width * pr));
    const H = Math.max(1, Math.round(this.height * pr));
    this.disposeTargets();
    const opts: THREE.RenderTargetOptions = { depthBuffer: true, samples: this.preset.samples };
    if (this.preset.ao) opts.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
    this.sceneRT = makeTarget(W, H, opts);
    this.sceneRT.texture.name = 'sijord.scene';
    if (this.preset.ao) {
      this.aoRT = makeTarget(Math.ceil(W / 2), Math.ceil(H / 2), { type: THREE.UnsignedByteType });
    }
    this.bloomRTs = [];
    let bw = W, bh = H;
    for (let i = 0; i < this.preset.bloomLevels; i++) {
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
      this.bloomRTs.push(makeTarget(bw, bh));
    }
    const u = this.gradeMat.uniforms;
    u.uTexel.value.set(1 / W, 1 / H);
    if (this.aoRT) u.uAOTexel.value.set(1 / this.aoRT.width, 1 / this.aoRT.height);
  }

  setExposure(exposure: number): void {
    this.exposure = exposure;
  }

  render(dt: number): void {
    const r = this.renderer;
    this.time += dt;
    r.info.reset();
    this.followShadow(dt);

    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(this.scene, this.camera);

    if (this.aoRT && this.sceneRT.depthTexture) {
      const u = this.aoMat.uniforms;
      u.tDepth.value = this.sceneRT.depthTexture;
      u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
      u.uProj.value.copy(this.camera.projectionMatrix);
      u.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      u.uNear.value = this.camera.near;
      u.uFar.value = this.camera.far;
      this.blit(this.aoMat, this.aoRT);
    }

    if (this.bloomRTs.length) {
      const pre = this.prefilterMat.uniforms;
      pre.tSrc.value = this.sceneRT.texture;
      pre.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      this.blit(this.prefilterMat, this.bloomRTs[0]);
      for (let i = 1; i < this.bloomRTs.length; i++) {
        const src = this.bloomRTs[i - 1];
        this.downMat.uniforms.tSrc.value = src.texture;
        this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.blit(this.downMat, this.bloomRTs[i]);
      }
      for (let i = this.bloomRTs.length - 1; i > 0; i--) {
        const src = this.bloomRTs[i];
        this.upMat.uniforms.tSrc.value = src.texture;
        this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.upMat.uniforms.uWeight.value = 0.85;
        this.blit(this.upMat, this.bloomRTs[i - 1], false);
      }
    }

    const g = this.gradeMat.uniforms;
    g.tScene.value = this.sceneRT.texture;
    g.tBloom.value = this.bloomRTs[0]?.texture ?? null;
    g.tAO.value = this.aoRT?.texture ?? null;
    g.uTime.value = this.time;
    g.uExposure.value = this.exposure;
    this.blit(this.gradeMat, null);
  }

  dispose(): void {
    this.disposeTargets();
    this.quad.dispose();
    for (const m of [this.prefilterMat, this.downMat, this.upMat, this.aoMat, this.gradeMat]) m.dispose();
  }

  // ------------------------------------------------------------------------------------------

  private makeGradeMaterial(): THREE.ShaderMaterial {
    const p = this.preset;
    const defines: Record<string, string> = {};
    if (p.bloomLevels > 0) defines.USE_BLOOM = '';
    if (p.ao) defines.USE_AO = '';
    return new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: GRADE_FRAG,
      defines,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tAO: { value: null },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uAOTexel: { value: new THREE.Vector2(1, 1) },
        uExposure: { value: 1.0 },
        uBloom: { value: p.bloomStrength },
        uAO: { value: 0.55 },
        uVignette: { value: 0.55 },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
  }

  private setThreshold(threshold: number, knee: number): void {
    this.prefilterMat.uniforms.uThreshold.value.set(threshold, knee, knee * 2, 0.25 / knee);
  }

  private blit(mat: THREE.Material, target: THREE.WebGLRenderTarget | null, clear = true): void {
    const r = this.renderer;
    r.setRenderTarget(target);
    if (clear) r.clear(true, false, false);
    this.quad.material = mat;
    this.quad.render(r);
  }

  private applyQuality(): void {
    const p = this.preset;
    const sun = this.findSun();
    if (sun) this.configureSun(sun);
    void p;
  }

  private configureSun(sun: THREE.DirectionalLight): void {
    const p = this.preset;
    const sh = sun.shadow;
    if (sh.mapSize.x !== p.shadowSize) {
      sh.mapSize.set(p.shadowSize, p.shadowSize);
      sh.map?.dispose();
      sh.map = null;
    }
    const cam = sh.camera;
    cam.left = -p.shadowExtent;
    cam.right = p.shadowExtent;
    cam.top = p.shadowExtent;
    cam.bottom = -p.shadowExtent;
    cam.updateProjectionMatrix();
    sh.radius = p.shadowRadius;
    // keep the bias proportional to the texel size
    const texel = (p.shadowExtent * 2) / p.shadowSize;
    sh.normalBias = texel * 0.9;
    sh.bias = -0.0002;
  }

  private findSun(): THREE.DirectionalLight | null {
    if (this.sun && this.sun.parent) return this.sun;
    let found: THREE.DirectionalLight | null = null;
    this.scene.traverse((o) => {
      if (!found && (o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) found = o as THREE.DirectionalLight;
    });
    this.sun = found;
    return found;
  }

  /** Centre the shadow frustum ahead of the camera (what is on screen), snapped to shadow texels. */
  private followShadow(dt: number): void {
    let sun = this.sun && this.sun.parent ? this.sun : null;
    if (!sun) {
      this.sunScanTimer -= dt;
      if (this.sunScanTimer > 0) return;
      this.sunScanTimer = 1;
      sun = this.findSun();
      if (!sun) return;
      this.configureSun(sun);
    }
    const p = this.preset;
    const target = sun.target;
    const dir = this.tmpV.copy(sun.position).sub(target.position);
    const dist = dir.length() || 150;
    dir.divideScalar(dist);
    const fwd = this.tmpV2.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();
    const ahead = p.shadowExtent * 0.55;
    let cx = this.camera.position.x + fwd.x * ahead;
    let cz = this.camera.position.z + fwd.z * ahead;
    let cy = target.position.y;
    // snap in light space so the shadow texels don't crawl as the camera moves
    const view = this.tmpM.lookAt(dir, new THREE.Vector3(0, 0, 0), THREE.Object3D.DEFAULT_UP);
    const right = new THREE.Vector3().setFromMatrixColumn(view, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(view, 1);
    const texel = (p.shadowExtent * 2) / p.shadowSize;
    const c = new THREE.Vector3(cx, cy, cz);
    const rx = Math.round(c.dot(right) / texel) * texel;
    const uy = Math.round(c.dot(up) / texel) * texel;
    const along = c.dot(dir);
    c.copy(right).multiplyScalar(rx).addScaledVector(up, uy).addScaledVector(dir, along);
    cx = c.x; cy = c.y; cz = c.z;
    target.position.set(cx, cy, cz);
    target.updateMatrixWorld();
    sun.position.set(cx, cy, cz).addScaledVector(dir, dist);
    sun.updateMatrixWorld();
  }

  private disposeTargets(): void {
    this.sceneRT?.depthTexture?.dispose();
    this.sceneRT?.dispose();
    this.aoRT?.dispose();
    this.aoRT = null;
    for (const t of this.bloomRTs) t.dispose();
    this.bloomRTs = [];
  }
}
