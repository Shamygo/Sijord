import * as THREE from 'three';
import { GLSL_NOISE, mulberry32 } from './noise';

/** Sky, sun and atmosphere settings (colours are sRGB hex, converted to linear by THREE.Color). */
export const SKY = {
  zenith: new THREE.Color(0x538fae),
  mid: new THREE.Color(0x83b4c3),
  horizon: new THREE.Color(0xc1d9d1),
  /** Aerial-perspective haze: distant land fades toward this blue. */
  fog: new THREE.Color(0xa0bfc5),
  sunHaze: new THREE.Color(0xf4e6cf),
  sunColor: new THREE.Color(0xfff0da),
  /** Direction towards the sun (from the south, slightly east, fairly high): looking north up
   *  Route 1 the land is front-lit and shadows fall away from the camera, like the key art. */
  sunDir: new THREE.Vector3(-0.32, 0.7, -0.64).normalize(),
  fogDensity: 0.0007,
  /** Height fog falls off with altitude at this rate (1/m) above FOG_BASE. */
  fogFalloff: 0.0036,
  fogBase: 0,
  fogMax: 0.9,
};

/**
 * The sky's colours as uniforms shared by every material that draws sky (the dome, clouds and
 * water reflections), so the time of day (`daynight.ts`) can change them all at once. They start
 * at the daytime values above. `SKY.sunDir` and `SKY.sunColor` are shared by reference the same
 * way: by night they point at the moon and carry its light.
 */
export const SKY_UNIFORMS = {
  uZenith: { value: SKY.zenith.clone() },
  uMid: { value: SKY.mid.clone() },
  uHorizon: { value: SKY.horizon.clone() },
  uSkyFog: { value: SKY.fog.clone() },
  /** How bright the sun's disc and glow are: 1 by day, low for the moon. */
  uSunDisc: { value: 1 },
  /** Stars, 0 by day and 1 at night. */
  uStars: { value: 0 },
  /** Tints clouds and water foam with the light: white by day, warm at sunset, dim blue at night. */
  uLightTint: { value: new THREE.Color(1, 1, 1) },
};
/** Daytime fog brightness: the sun-side haze fades with the fog at dusk. */
const FOG_DAY_LUMA = SKY.fog.r * 0.2126 + SKY.fog.g * 0.7152 + SKY.fog.b * 0.0722;

// -------------------------------------------------------------------------------------------
// Aerial perspective: replaces three's FogExp2 with height fog whose colour leans toward the sun.
// Linear fog (scene.fog = Fog) is untouched, so other scenes are unaffected.
// -------------------------------------------------------------------------------------------

const v3 = (v: THREE.Vector3) => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
const c3 = (c: THREE.Color) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

let atmospherePatched = false;
function patchFogChunks(): void {
  if (atmospherePatched) return;
  atmospherePatched = true;
  const SC = THREE.ShaderChunk as unknown as Record<string, string>;
  SC.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef FOG_EXP2
    varying vec3 vFogWorldPos;
  #endif
#endif`;
  SC.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef FOG_EXP2
    vFogWorldPos = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
  #endif
#endif`;
  SC.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
    varying vec3 vFogWorldPos;
    vec3 sijordAerial( vec3 col, vec3 wp ) {
      vec3 rd = wp - cameraPosition;
      float dist = length( rd );
      rd /= max( dist, 1e-3 );
      const float b = ${SKY.fogFalloff.toFixed(6)};
      float k = rd.y * b * dist;
      float f = abs( k ) > 1e-4 ? ( 1.0 - exp( - k ) ) / k : 1.0 - 0.5 * k;
      float optical = fogDensity * dist * exp( - b * max( cameraPosition.y - ${SKY.fogBase.toFixed(1)}, -50.0 ) ) * f;
      float amt = min( 1.0 - exp( - optical ), ${SKY.fogMax.toFixed(3)} );
      float sunAmt = max( dot( rd, ${v3(SKY.sunDir)} ), 0.0 );
      float dayK = clamp( dot( fogColor, vec3( 0.2126, 0.7152, 0.0722 ) ) / ${FOG_DAY_LUMA.toFixed(5)}, 0.0, 1.0 );
      vec3 haze = mix( fogColor, ${c3(SKY.sunHaze)} * dayK, pow( sunAmt, 6.0 ) * 0.45 * dayK );
      // looking down into the valley the haze is a touch deeper blue
      haze = mix( haze, haze * vec3( 0.86, 0.92, 1.0 ), clamp( - rd.y * 4.0, 0.0, 1.0 ) * 0.5 );
      return mix( col, haze, amt );
    }
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  SC.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    gl_FragColor.rgb = sijordAerial( gl_FragColor.rgb, vFogWorldPos );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #endif
#endif`;
}
patchFogChunks();

/** GLSL for the sky gradient, shared by the sky dome, clouds and water reflections. */
export const GLSL_SKY = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSkyFog;
uniform float uSunDisc; uniform float uStars; uniform vec3 uLightTint;
vec3 skyGradient(vec3 d) {
  float y = d.y;
  vec3 zen = uZenith;
  vec3 mid = uMid;
  vec3 hor = uHorizon;
  float t = clamp(y, 0.0, 1.0);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, t));
  col = mix(col, zen, smoothstep(0.12, 0.85, t));
  // milky band right at the horizon
  col = mix(col, hor * 1.04, exp(-max(y, 0.0) * 28.0) * 0.55);
  if (y < 0.0) col = mix(hor, uSkyFog, smoothstep(0.0, -0.15, y));
  return col;
}
`;

export function createLights(root: THREE.Object3D): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const hemi = new THREE.HemisphereLight(0xc4dce5, 0x6d7c60, 1.2);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.sunColor, 2.6);
  sun.position.copy(SKY.sunDir).multiplyScalar(150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -60;
  cam.right = 60;
  cam.top = 60;
  cam.bottom = -60;
  cam.near = 1;
  cam.far = 420;
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.05;
  sun.shadow.radius = 2.5;
  sun.shadow.intensity = 0.92;
  root.add(sun);
  root.add(sun.target);
  return { sun, hemi };
}

/** Keep the sun + its shadow frustum centred on a point (snapped to shadow texels to avoid shimmer). */
export function centreSun(sun: THREE.DirectionalLight, focus: THREE.Vector3): void {
  const span = sun.shadow.camera.right - sun.shadow.camera.left;
  const texel = span / sun.shadow.mapSize.x;
  const x = Math.round(focus.x / texel) * texel;
  const z = Math.round(focus.z / texel) * texel;
  sun.target.position.set(x, focus.y, z);
  sun.position.set(x, focus.y, z).addScaledVector(SKY.sunDir, 150);
  sun.target.updateMatrixWorld();
}

export function createSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1000, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SKY.sunDir },
      uSunColor: { value: SKY.sunColor },
      ...SKY_UNIFORMS,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
        gl_Position.z = p.w * 0.99999;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform vec3 uSunColor;
      varying vec3 vDir;
      ${GLSL_SKY}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyGradient(d);
        float s = max(dot(d, uSunDir), 0.0);
        // The sun's disc and glow by day; by night the same light is the moon, a smaller, paler disc.
        float disc = mix(smoothstep(0.99935, 0.9996, s) * 1.6, smoothstep(0.99955, 0.9998, s) * 18.0, step(0.5, uSunDisc));
        col += uSunColor * (disc + (pow(s, 700.0) * 1.6 + pow(s, 40.0) * 0.22 + pow(s, 6.0) * 0.07) * uSunDisc);
        // A soft halo round the moon.
        col += uSunColor * (1.0 - step(0.5, uSunDisc)) * (pow(s, 900.0) * 1.2 + pow(s, 60.0) * 0.25);
        // Stars: one in about 170 cells of a fine grid on the sky, fading out near the horizon.
        if (uStars > 0.0 && d.y > 0.0) {
          vec3 p = d * 210.0;
          vec3 c = floor(p);
          float h = fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          float star = step(0.994, h) * smoothstep(0.34, 0.0, length(fract(p) - 0.5));
          col += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.02, 0.3, d.y) * (0.6 + 1.9 * fract(h * 113.0));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  return mesh;
}

// -------------------------------------------------------------------------------------------
// Cumulus clouds: clusters of soft, sun-shaded billboard puffs on a ring far beyond the valley.
// -------------------------------------------------------------------------------------------

function puffTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const rnd = mulberry32(5);
  // a few soft lumps on the upper rim; the base stays smooth
  const lumps: [number, number, number][] = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.15 + rnd() * 0.7);
    const r = 0.16 + rnd() * 0.1;
    lumps.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.12 + rnd() * 0.08]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const dx = u - 0.5, dy = v - 0.5;
      let field = Math.max(0, 1 - Math.hypot(dx, dy) / 0.42);
      for (const [lx, ly, lr] of lumps) field = Math.max(field, Math.max(0, 1 - Math.hypot(u - lx, v - ly) / lr) * 0.6);
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(Math.min(1, field) * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export interface Clouds {
  mesh: THREE.Mesh;
  update(focus: THREE.Vector3, elapsed: number): void;
}

export function createClouds(count = 24): Clouds {
  const rnd = mulberry32(4711);
  const offsets: number[] = [];
  const sizes: number[] = [];
  const bases: number[] = [];
  type Puff = { x: number; y: number; z: number; s: number; base: number; top: number };
  const puffs: Puff[] = [];
  for (let c = 0; c < count; c++) {
    const az = (c / count) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const dist = 2100 + rnd() * 700;
    // most clouds sit low over the horizon; a few drift higher
    const elev = (3 + Math.pow(rnd(), 1.8) * 13) * (Math.PI / 180);
    const cx = Math.cos(az) * dist, cz = Math.sin(az) * dist;
    const base = 160 + Math.tan(elev) * dist;
    const width = 300 + rnd() * 480;
    const height = width * (0.22 + rnd() * 0.26);
    // tangent direction (cloud stretches sideways across the view)
    const tx = -Math.sin(az), tz = Math.cos(az);
    const n = Math.round(10 + width / 26);
    for (let i = 0; i < n; i++) {
      const u = (rnd() - 0.5);
      const prof = 1 - (2 * u) * (2 * u);
      const r = width * (0.07 + rnd() * 0.08) * (0.5 + prof * 0.7);
      const lift = Math.pow(rnd(), 1.2) * height * prof;
      const depth = (rnd() - 0.5) * width * 0.3;
      puffs.push({
        x: cx + tx * u * width + Math.cos(az) * depth,
        y: base + r * 0.45 + lift,
        z: cz + tz * u * width + Math.sin(az) * depth,
        s: r * 1.2,
        base,
        top: base + height + r,
      });
    }
  }
  // far puffs first so nearer ones blend over them
  puffs.sort((a, b) => Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z));
  for (const p of puffs) {
    offsets.push(p.x, p.y, p.z);
    sizes.push(p.s, rnd());
    bases.push(p.base, p.top);
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 2));
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(new Float32Array(bases), 2));
  geo.instanceCount = puffs.length;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4000);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: puffTexture() },
      uSunDir: { value: SKY.sunDir },
      uSunColor: { value: SKY.sunColor },
      ...SKY_UNIFORMS,
    },
    vertexShader: /* glsl */ `
      attribute vec3 aOffset; attribute vec2 aSize; attribute vec2 aBase;
      varying vec2 vUv; varying float vY; varying vec2 vBase; varying vec3 vSunView; varying float vSeed; varying vec3 vDir;
      uniform vec3 uSunDir;
      void main() {
        vUv = uv;
        vec4 wc = modelMatrix * vec4(aOffset, 1.0);
        vec3 mv = (viewMatrix * wc).xyz;
        vec2 corner = position.xy * aSize.x;
        float a = aSize.y * 6.2831;
        corner = mat2(cos(a), -sin(a), sin(a), cos(a)) * corner * 0.15 + corner * 0.85;
        corner.x *= 1.7;
        mv.xy += corner;
        vec3 worldOff = vec3(corner, 0.0) * mat3(viewMatrix);
        vY = wc.y + worldOff.y;
        vBase = aBase;
        vSeed = aSize.y;
        vSunView = mat3(viewMatrix) * uSunDir;
        vDir = normalize(wc.xyz + worldOff - cameraPosition);
        gl_Position = projectionMatrix * vec4(mv, 1.0);
        // painted backdrop: always behind the land, so mountains stand in front of the clouds
        gl_Position.z = gl_Position.w * 0.99998;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uSunColor;
      varying vec2 vUv; varying float vY; varying vec2 vBase; varying vec3 vSunView; varying float vSeed; varying vec3 vDir;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main() {
        vec4 t = texture2D(uTex, vUv);
        // wispy, eroded edges: noise eats into the soft outline
        vec2 nuv = vUv * vec2(3.0, 2.2) + vSeed * 37.0;
        float er = wNoise(nuv) * 0.65 + wNoise(nuv * 2.7 + 5.0) * 0.35;
        float field = t.r - (er - 0.5) * 0.5 * min(t.r * 4.0, 1.0);
        float alpha = smoothstep(0.05, 0.55, field) * smoothstep(vBase.x - 8.0, vBase.x + 40.0, vY);
        if (alpha < 0.01) discard;
        vec2 q = vUv * 2.0 - 1.0;
        vec3 n = normalize(vec3(q * 0.9, max(0.2, sqrt(max(0.0, 1.0 - dot(q, q))))));
        float lambert = dot(n, normalize(vSunView)) * 0.5 + 0.5;
        float h = clamp((vY - vBase.x) / max(vBase.y - vBase.x, 1.0), 0.0, 1.0);
        vec3 shadowCol = vec3(0.6, 0.68, 0.84);
        vec3 litCol = vec3(1.06, 1.05, 1.02);
        float k = clamp(lambert * 0.55 + h * 0.6 - 0.05 + t.r * 0.12 + (er - 0.5) * 0.2, 0.0, 1.0);
        vec3 col = mix(shadowCol, litCol, smoothstep(0.1, 0.85, k)) * uLightTint;
        col += uSunColor * pow(lambert, 6.0) * 0.1;
        // thin edges let the sky through; distant clouds sink into the horizon haze
        vec3 sky = skyGradient(vDir);
        col = mix(col, sky, (1.0 - smoothstep(0.1, 0.6, field)) * 0.35);
        col = mix(col, sky, clamp(0.5 - vDir.y * 5.0, 0.0, 0.55));
        gl_FragColor = vec4(col, alpha * 0.96);
      }`,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    update(focus: THREE.Vector3, elapsed: number) {
      mesh.position.set(focus.x, 0, focus.z);
      mesh.rotation.y = elapsed * 0.0012;
    },
  };
}

export function applyAtmosphere(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(SKY.fog.getHex(), SKY.fogDensity);
  scene.background = SKY.horizon.clone();
}
