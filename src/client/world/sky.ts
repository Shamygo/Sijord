import * as THREE from 'three';
import { GLSL_NOISE } from './noise';
import { worldUniforms } from './shared';

export const SKY = {
  zenith: new THREE.Color(0x1f66cc),
  horizon: new THREE.Color(0xb2d7f2),
  fog: new THREE.Color(0xb2d7f2),
  sunColor: new THREE.Color(0xfff0d6),
  /** Direction towards the sun (from the south-west, high): shadows fall north-east. */
  sunDir: new THREE.Vector3(0.45, 0.78, -0.43).normalize(),
  fogDensity: 0.00062,
};

export function createLights(root: THREE.Object3D): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight } {
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a8a3c, 1.55);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.sunColor, 3.1);
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
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  root.add(sun);
  root.add(sun.target);
  return { sun, hemi };
}

/** Keep the sun + its shadow frustum centred on a point (snapped to shadow texels to avoid shimmer). */
export function centreSun(sun: THREE.DirectionalLight, focus: THREE.Vector3): void {
  const texel = 120 / 2048;
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
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uSunDir: { value: SKY.sunDir },
      uSunColor: { value: SKY.sunColor },
      uTime: worldUniforms.uTime,
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
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uTime;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.6));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.06);
        if (y > -0.02) {
          vec2 uv = d.xz / (y + 0.12);
          vec2 drift = vec2(uTime * 0.006, uTime * 0.0025);
          vec2 p = uv * 0.9 + drift;
          float n = wFbm(p);
          float n2 = wFbm(p * 2.1 + 3.7);
          float shape = n * 0.75 + n2 * 0.25;
          float cover = smoothstep(0.52, 0.72, shape) * smoothstep(-0.02, 0.18, y);
          // light comes from the sun side: compare density with a sample offset towards the sun
          float nl = wFbm(p + uSunDir.xz * 0.12);
          float lit = clamp(0.62 + (n - nl) * 3.5, 0.0, 1.0);
          vec3 shadowCol = mix(uHorizon, vec3(0.7, 0.77, 0.9), 0.5);
          vec3 cloud = mix(shadowCol, vec3(1.04, 1.02, 0.98), lit);
          cloud += uSunColor * pow(s, 8.0) * 0.25;
          // soften the painterly edges
          cover *= 0.82 + 0.18 * smoothstep(0.55, 0.8, shape);
          col = mix(col, cloud, cover);
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

export function applyAtmosphere(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(SKY.fog.getHex(), SKY.fogDensity);
  scene.background = SKY.horizon.clone();
}
