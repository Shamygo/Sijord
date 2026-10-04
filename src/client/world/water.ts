import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { CELL, GRID_HALF, GRID_N, WATER_LEVEL } from './layout';
import { SKY } from './sky';
import { worldUniforms } from './shared';

/** One stylised water sheet at WATER_LEVEL over the east of the map (river, lake, pond). */
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
        uSky: { value: SKY.horizon },
        uZenith: { value: SKY.zenith },
        uShallow: { value: new THREE.Color(0x48d8c8) },
        uDeep: { value: new THREE.Color(0x1763c4) },
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
      uniform sampler2D uDepth; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uZenith;
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uGrid; uniform float uTime;
      varying vec3 vW;
      #include <fog_pars_fragment>
      ${GLSL_NOISE}
      vec2 waveGrad(vec2 p, float t) {
        float e = 0.35;
        float a = wNoise(p * 0.35 + vec2(t * 0.15, t * 0.08)) + wNoise(p * 0.9 - vec2(t * 0.22, -t * 0.12)) * 0.5;
        float bx = wNoise((p + vec2(e, 0.0)) * 0.35 + vec2(t * 0.15, t * 0.08)) + wNoise((p + vec2(e, 0.0)) * 0.9 - vec2(t * 0.22, -t * 0.12)) * 0.5;
        float bz = wNoise((p + vec2(0.0, e)) * 0.35 + vec2(t * 0.15, t * 0.08)) + wNoise((p + vec2(0.0, e)) * 0.9 - vec2(t * 0.22, -t * 0.12)) * 0.5;
        return vec2(bx - a, bz - a) / e;
      }
      void main() {
        vec2 g = (vW.xz + uGrid.x) / uGrid.y;
        vec2 uv = (g + 0.5) / uGrid.z;
        float depth = texture2D(uDepth, uv).r * 6.6 - 0.6;
        if (depth < -0.05) discard;
        float t = uTime;
        vec2 gr = waveGrad(vW.xz, t) * 0.55 + waveGrad(vW.xz * 2.7 + 13.0, t * 1.4) * 0.25;
        vec3 n = normalize(vec3(-gr.x, 1.0, -gr.y));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 base = mix(uShallow, uDeep, smoothstep(0.1, 3.2, depth));
        vec3 R = reflect(-V, n);
        vec3 skyRef = mix(uSky, uZenith, clamp(R.y, 0.0, 1.0) * 0.8);
        vec3 col = mix(base, skyRef, 0.04 + fres * 0.45);
        float diff = max(dot(n, uSunDir), 0.0);
        col *= 0.75 + diff * 0.35;
        float spec = pow(max(dot(R, uSunDir), 0.0), 140.0);
        col += uSunColor * spec * 2.2;
        // sparkles
        float sp = wNoise(vW.xz * 1.7 + t * 0.6) * wNoise(vW.xz * 2.3 - t * 0.5);
        col += uSunColor * smoothstep(0.66, 0.8, sp) * 0.15;
        // soft foam at the shoreline
        float foamN = wNoise(vW.xz * 0.9 + vec2(t * 0.3, -t * 0.2));
        float foamBand = smoothstep(0.5, 0.0, depth + (foamN - 0.5) * 0.35 + sin(t * 1.3 + vW.x * 0.25 + vW.z * 0.2) * 0.06);
        col = mix(col, vec3(0.97, 0.99, 1.0), foamBand * 0.85);
        float alpha = mix(0.55, 0.93, smoothstep(0.0, 1.6, depth));
        alpha = max(alpha, foamBand * 0.9);
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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.renderOrder = 1;
  return mesh;
}
