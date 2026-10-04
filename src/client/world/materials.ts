import * as THREE from 'three';
import { getNoiseTexture } from './textures';

/** Small GLSL helpers shared by world shaders. */
export const GLSL_HASH = /* glsl */ `
float sjHash1(float n) { return fract(sin(n * 127.1) * 43758.5453123); }
float sjHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;

/**
 * Lambert lighting with a wrapped terminator (soft, painterly falloff) and optional translucency
 * for leaves/grass (light glowing through when the sun is behind them). `wrap` 0 = plain Lambert.
 */
export function lambertWrapChunk(wrap: string, translucency?: string): string {
  let s = THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
    'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
    `float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${wrap} ) / ( 1.0 + ${wrap} ) );`,
  );
  if (translucency) {
    s = s.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      `vec3 irradiance = dotNL * directLight.color;
      float sjBack = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 3.0 );
      irradiance += directLight.color * sjBack * ( ${translucency} );`,
    );
  }
  return s;
}

/**
 * GLSL stone shading (rocks, cliff blocks, ruins): layered strata, vertical joints, grain and moss
 * on upward faces. Works in world space; `n` is the world normal. Returns albedo and a facet-bent normal.
 */
export const GLSL_STONE = /* glsl */ `
uniform sampler2D uStoneNoise;
vec3 sjStone(vec3 wp, vec3 n, vec3 tint, float mossAmt, float strata, out vec3 nOut) {
  vec3 an = abs(n);
  // triplanar grain
  vec3 bw = pow(an, vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
  vec4 gx = texture2D(uStoneNoise, wp.zy * 0.21);
  vec4 gy = texture2D(uStoneNoise, wp.xz * 0.21);
  vec4 gz = texture2D(uStoneNoise, wp.xy * 0.21);
  vec4 g = gx * bw.x + gy * bw.y + gz * bw.z;
  vec4 gxL = texture2D(uStoneNoise, wp.zy * 0.035);
  vec4 gyL = texture2D(uStoneNoise, wp.xz * 0.035);
  vec4 gzL = texture2D(uStoneNoise, wp.xy * 0.035);
  vec4 gL = gxL * bw.x + gyL * bw.y + gzL * bw.z;
  // strata along world height, warped
  float ly = (wp.y + (gL.r - 0.5) * 2.2) / 1.9;
  float lf = fract(ly);
  float layer = floor(ly);
  vec3 col = tint * (0.86 + (sjHash1(layer + 3.1) - 0.5) * 0.16 + (g.g - 0.5) * 0.22 + (gL.g - 0.5) * 0.2);
  // warm / cool variation between layers
  col *= mix(vec3(0.97, 0.99, 1.04), vec3(1.05, 1.0, 0.93), sjHash1(layer * 1.7 + 9.0));
  float side = 1.0 - an.y;
  // horizontal bedding cracks + vertical joints on steep faces
  float crackH = 1.0 - smoothstep(0.0, 0.06, min(lf, 1.0 - lf));
  float joint = smoothstep(0.08, 0.0, g.b) * 0.8;
  col *= 1.0 - (crackH * 0.35 * strata + joint * 0.4) * side;
  // vertical weathering streaks running down the faces
  float sx = dot(wp.xz, normalize(vec2(-n.z, n.x) + 1e-4));
  float streak = texture2D(uStoneNoise, vec2(sx * 0.11, wp.y * 0.012)).g;
  col *= 1.0 - smoothstep(0.58, 0.86, streak) * 0.2 * side * (1.0 - strata * 0.5);
  col *= 1.0 + smoothstep(0.4, 0.2, streak) * 0.07 * side;
  // speckles
  col *= 0.92 + g.a * 0.14;
  // moss on top faces
  float moss = smoothstep(0.45, 0.85, n.y + (gL.r - 0.5) * 0.7 + (g.r - 0.5) * 0.3) * mossAmt;
  vec3 mossCol = mix(vec3(0.16, 0.26, 0.06), vec3(0.32, 0.4, 0.1), g.g);
  col = mix(col, mossCol, moss);
  // per-layer facet tilt for a chiselled look
  float fa = (sjHash1(layer * 3.3 + floor(g.b * 3.0)) - 0.5) * 0.5;
  vec3 t = normalize(vec3(-n.z, 0.0, n.x) + 1e-4);
  nOut = normalize(n + t * fa * side * strata + t * (gL.b - 0.5) * 0.5 * side + vec3(0.0, (lf - 0.5) * 0.25 * side * strata, 0.0));
  return col;
}
`;

/**
 * Stone material for rock meshes (boulders, cliff blocks): vertex colour tints, shader adds
 * strata/joints/moss and chiselled shading.
 */
export function makeStoneMaterial(mossAmt = 1.0, strata = 1.0): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStoneNoise = { value: getNoiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSjWPos;\nvarying vec3 vSjWNormal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 sjwp = vec4(transformed, 1.0);
          #ifdef USE_BATCHING
            sjwp = batchingMatrix * sjwp;
          #endif
          #ifdef USE_INSTANCING
            sjwp = instanceMatrix * sjwp;
          #endif
          sjwp = modelMatrix * sjwp;
          vSjWPos = sjwp.xyz;
          vSjWNormal = normalize(inverseTransformDirection(transformedNormal, viewMatrix));
        }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vSjWPos;\nvarying vec3 vSjWNormal;\n${GLSL_HASH}\n${GLSL_STONE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sjN;
        diffuseColor.rgb = sjStone(vSjWPos, normalize(vSjWNormal), diffuseColor.rgb, ${mossAmt.toFixed(2)}, ${strata.toFixed(2)}, sjN);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(sjN, 0.0)).xyz);`)
      .replace('#include <lights_lambert_pars_fragment>', lambertWrapChunk('0.2'));
  };
  mat.customProgramCacheKey = () => `sj-stone-${mossAmt}-${strata}`;
  return mat;
}

/**
 * Gives vertex-coloured props (houses, fences, ruins, bridge) a painterly grain: world-space noise
 * modulates albedo so flat colours read as hand-painted surfaces.
 */
export function paintPropMaterial<T extends THREE.MeshStandardMaterial | THREE.MeshLambertMaterial>(mat: T, key: string): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPropNoise = { value: getNoiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSjWPos;\nvarying vec3 vSjWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vSjWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSjWN = normalize(inverseTransformDirection(transformedNormal, viewMatrix));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPropNoise;\nvarying vec3 vSjWPos;\nvarying vec3 vSjWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 an = abs(normalize(vSjWN));
          vec3 bw = an / (an.x + an.y + an.z);
          vec4 g = texture2D(uPropNoise, vSjWPos.zy * 0.6) * bw.x + texture2D(uPropNoise, vSjWPos.xz * 0.6) * bw.y + texture2D(uPropNoise, vSjWPos.xy * 0.6) * bw.z;
          vec4 gL = texture2D(uPropNoise, vSjWPos.zy * 0.09) * bw.x + texture2D(uPropNoise, vSjWPos.xz * 0.09) * bw.y + texture2D(uPropNoise, vSjWPos.xy * 0.09) * bw.z;
          diffuseColor.rgb *= 0.9 + (g.g - 0.5) * 0.16 + (gL.r - 0.5) * 0.14 + g.a * 0.06;
        }`);
  };
  mat.customProgramCacheKey = () => `sj-prop-${key}`;
  return mat;
}
