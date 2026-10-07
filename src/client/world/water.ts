import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { CELL, GRID_HALF, GRID_N, WATER_LEVEL } from './layout';
import { GLSL_SKY, SKY, SKY_UNIFORMS } from './sky';
import { worldUniforms } from './shared';

/**
 * Stylised water over the east of the map (river, lake, pond): turquoise shallows over sand that
 * deepen to blue, sky + cloud reflections with Fresnel, darker bank reflections near the shore,
 * sun glints and sparkles, and soft animated foam lines along the beaches.
 */
export function createWater(depthTex: THREE.Texture): THREE.Mesh {
  const minX = -GRID_HALF, maxX = -60, minZ = -GRID_HALF, maxZ = GRID_HALF;
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, WATER_LEVEL, (minZ + maxZ) / 2);
  const V = GRID_N + 1;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDepth: { value: null },
        uSunDir: { value: SKY.sunDir },
        uSunColor: { value: SKY.sunColor },
        uGrid: { value: new THREE.Vector3(GRID_HALF, CELL, V) },
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
      uniform sampler2D uDepth; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform vec3 uGrid; uniform float uTime;
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
      void main() {
        vec2 g = (vW.xz + uGrid.x) / uGrid.y;
        vec2 uv = (g + 0.5) / uGrid.z;
        float depth = texture2D(uDepth, uv).r * 6.6 - 0.6;
        if (depth < -0.05) discard;
        float t = uTime;
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
  mat.uniforms.uDepth.value = depthTex;
  mat.uniforms.uTime = worldUniforms.uTime;
  // Merging copies uniform values: share the sky's instead, so they follow the time of day.
  Object.assign(mat.uniforms, SKY_UNIFORMS, { uSunDir: { value: SKY.sunDir }, uSunColor: { value: SKY.sunColor } });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  return mesh;
}
