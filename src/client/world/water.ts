import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { CELL, WATER_LEVEL } from './layout';
import { LAKES } from '../../shared/region';
import type { GroundWindow } from './stream/window';
import type { TerrainStreamer } from './stream/streamer';
import { ORIGIN_X, ORIGIN_Z } from './stream/lattice';
import { GLSL_SKY, SKY, SKY_UNIFORMS } from './sky';
import { worldUniforms } from './shared';

const FROZEN = LAKES.filter((l) => l.frozen);

export interface Water {
  mesh: THREE.Mesh;
  /** Keep the sheet under the camera and the far depth texture current. */
  update(camera: THREE.Vector3): void;
}

/**
 * Stylised water at sea level everywhere (sea, fjords, rivers, lakes, ponds): turquoise shallows
 * over sand that deepen to blue, sky + cloud reflections with Fresnel, darker bank reflections
 * near the shore, sun glints and sparkles, and soft animated foam lines along the beaches. Depth
 * comes from the ground window near the player and from the coarse region heights further out.
 * Frozen lakes in the tundra are drawn as snow-dusted ice.
 */
export function createWater(win: GroundWindow, streamer: TerrainStreamer): Water {
  const SIZE = 9000;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, WATER_LEVEL, 0);
  const c = streamer.coarse;
  const coarseTex = new THREE.DataTexture(c.heights, c.n, c.n, THREE.RedFormat, THREE.FloatType);
  coarseTex.magFilter = coarseTex.minFilter = THREE.NearestFilter;
  coarseTex.unpackAlignment = 1;
  coarseTex.needsUpdate = true;
  let coarseVersion = c.version;
  const ice = Array.from({ length: 4 }, (_, i) => FROZEN[i] ? new THREE.Vector4(FROZEN[i].x, FROZEN[i].z, FROZEN[i].rx, FROZEN[i].rz) : new THREE.Vector4(1e9, 1e9, 1, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uSunDir: { value: SKY.sunDir },
        uSunColor: { value: SKY.sunColor },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uTime;
      uniform sampler2D uHeight; uniform vec2 uWinOrigin; uniform float uWinSize;
      uniform sampler2D uCoarse; uniform vec3 uCoarseBox;
      uniform vec4 uIce[4];
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      ${GLSL_SKY}
      vec2 waveGrad(vec2 p, float t) {
        float e = 0.35;
        vec2 o1 = vec2(t * 0.15, t * 0.08), o2 = -vec2(t * 0.22, -t * 0.12);
        float a = wNoise(p * 0.35 + o1) + wNoise(p * 0.9 + o2) * 0.5;
        float bx = wNoise((p + vec2(e, 0.0)) * 0.35 + o1) + wNoise((p + vec2(e, 0.0)) * 0.9 + o2) * 0.5;
        float bz = wNoise((p + vec2(0.0, e)) * 0.35 + o1) + wNoise((p + vec2(0.0, e)) * 0.9 + o2) * 0.5;
        return vec2(bx - a, bz - a) / e;
      }
      float bilerp(sampler2D tex, vec2 g, float n) {
        vec2 gc = clamp(g, vec2(0.0), vec2(n - 1.001));
        ivec2 i = ivec2(floor(gc));
        vec2 f = gc - vec2(i);
        float a = texelFetch(tex, i, 0).r, b = texelFetch(tex, i + ivec2(1, 0), 0).r;
        float c = texelFetch(tex, i + ivec2(0, 1), 0).r, d = texelFetch(tex, i + ivec2(1, 1), 0).r;
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float groundAt(vec2 xz) {
        vec2 g = (xz - uWinOrigin) / ${CELL.toFixed(3)};
        if (g.x > 1.0 && g.y > 1.0 && g.x < uWinSize - 2.0 && g.y < uWinSize - 2.0) return bilerp(uHeight, g, uWinSize);
        return bilerp(uCoarse, (xz - uCoarseBox.xy) / uCoarseBox.z, ${c.n.toFixed(1)});
      }
      void main() {
        float depth = ${WATER_LEVEL.toFixed(2)} - groundAt(vW.xz);
        if (depth < -0.05) discard;
        float t = uTime;
        // Frozen lakes: snow-dusted ice with cracks instead of open water.
        for (int k = 0; k < 4; k++) {
          vec2 e = (vW.xz - uIce[k].xy) / uIce[k].zw;
          float r = length(e);
          if (r < 1.05) {
            float n1 = wFbm(vW.xz * 0.06), n2 = wNoise(vW.xz * 0.9);
            vec3 iceCol = mix(vec3(0.62, 0.78, 0.86), vec3(0.86, 0.93, 0.97), smoothstep(0.35, 0.7, n1));
            float crack = smoothstep(0.03, 0.0, abs(wNoise(vW.xz * 0.18) - 0.5)) * 0.35;
            iceCol *= 1.0 - crack;
            iceCol = mix(iceCol, vec3(0.95, 0.97, 1.0), smoothstep(0.55, 0.85, n1 + n2 * 0.2) * 0.8 + smoothstep(0.8, 1.02, r) * 0.6);
            float lit = 0.62 + 0.38 * max(uSunDir.y, 0.0);
            gl_FragColor = vec4(iceCol * lit * uLightTint, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <fog_fragment>
            return;
          }
        }
        vec3 Vv = cameraPosition - vW;
        float dist = length(Vv);
        Vv /= dist;
        float calm = smoothstep(60.0, 300.0, dist);
        vec2 gr = waveGrad(vW.xz * 0.6, t) * 0.3 + waveGrad(vW.xz * 1.9 + 13.0, t * 1.4) * 0.12;
        // at grazing angles ripples merge into a calm sheen
        float graze = 1.0 - smoothstep(0.03, 0.35, Vv.y);
        gr *= (1.0 - calm * 0.75) * (1.0 - graze * 0.55);
        vec3 n = normalize(vec3(-gr.x, 1.0, -gr.y));
        float ndv = max(dot(normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.5)), Vv), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        // body colour by depth
        vec3 overSand = vec3(0.36, 0.62, 0.56);
        vec3 shallow = vec3(0.08, 0.42, 0.52);
        vec3 mid = vec3(0.035, 0.22, 0.4);
        vec3 deep = vec3(0.02, 0.12, 0.28);
        vec3 base = mix(overSand, shallow, smoothstep(0.0, 0.55, depth));
        base = mix(base, mid, smoothstep(0.4, 1.7, depth));
        base = mix(base, deep, smoothstep(1.5, 3.4, depth));
        float diff = max(dot(n, uSunDir), 0.0);
        // Lit by the sky and the sun or moon, so it darkens at night like everything else.
        vec3 body = base * (0.55 + diff * 0.55) * uLightTint;
        // reflection: sky gradient + soft cloud blobs, darker green banks near the shore
        vec3 R = reflect(-Vv, n);
        R.y = abs(R.y);
        vec3 refl = skyGradient(R);
        vec2 cuv = R.xz / (R.y + 0.15) * 0.9 + vec2(t * 0.004, 0.0);
        float cl = smoothstep(0.55, 0.78, wFbm(cuv * 0.8));
        refl = mix(refl, vec3(0.95, 0.96, 1.0) * uLightTint, cl * 0.5);
        float bank = smoothstep(2.2, 0.2, depth) * (1.0 - smoothstep(0.0, 0.3, R.y));
        refl = mix(refl, vec3(0.1, 0.17, 0.1), bank * 0.6);
        vec3 col = mix(body, refl * 0.92, clamp(fres * 1.05, 0.0, 0.85));
        // sun glint + sparkles
        float spec = pow(max(dot(R, uSunDir), 0.0), 220.0);
        col += uSunColor * spec * 3.0;
        float sp = wNoise(vW.xz * 2.1 + t * 0.7) * wNoise(vW.xz * 2.9 - t * 0.55);
        col += uSunColor * smoothstep(0.78, 0.9, sp) * (0.12 + spec * 2.0) * (1.0 - calm) * (1.0 - graze * 0.7);
        // foam lines lapping at the shore
        float fn = wNoise(vW.xz * 0.8 + vec2(t * 0.25, -t * 0.18));
        float wave = sin(t * 1.2 - depth * 9.0 + fn * 3.0) * 0.5 + 0.5;
        float foamBand = smoothstep(0.3, 0.0, depth + (fn - 0.5) * 0.2);
        float foam = foamBand * (0.45 + 0.4 * smoothstep(0.55, 0.95, wave));
        foam = max(foam, smoothstep(0.92, 1.0, wave) * smoothstep(0.7, 0.2, depth) * 0.4);
        col = mix(col, vec3(0.92, 0.96, 0.98) * uLightTint, foam * 0.7);
        float alpha = mix(0.5, 0.95, smoothstep(0.0, 1.4, depth));
        alpha = max(alpha, foam * 0.9);
        alpha = max(alpha, fres);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  mat.uniforms.uTime = worldUniforms.uTime;
  mat.uniforms.uHeight = { value: win.height };
  mat.uniforms.uWinOrigin = win.uniforms.uWinOrigin;
  mat.uniforms.uWinSize = win.uniforms.uWinSize;
  mat.uniforms.uCoarse = { value: coarseTex };
  mat.uniforms.uCoarseBox = { value: new THREE.Vector3(ORIGIN_X, ORIGIN_Z, c.cell) };
  mat.uniforms.uIce = { value: ice };
  // Merging copies uniform values: share the sky's instead, so they follow the time of day.
  Object.assign(mat.uniforms, SKY_UNIFORMS, { uSunDir: { value: SKY.sunDir }, uSunColor: { value: SKY.sunColor } });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera: THREE.Vector3) {
      mesh.position.set(Math.round(camera.x / 100) * 100, 0, Math.round(camera.z / 100) * 100);
      if (c.version !== coarseVersion) {
        coarseVersion = c.version;
        coarseTex.needsUpdate = true;
      }
    },
  };
}
