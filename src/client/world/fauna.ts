import * as THREE from 'three';
import { mulberry32 } from './noise';
import { worldUniforms } from './shared';

/**
 * Ambient life: butterflies fluttering over the meadow around the player and a few birds wheeling
 * high above. Both are single instanced draws, animated in the vertex shader from per-instance seeds,
 * re-anchored around the focus so they are always nearby.
 */
export interface Fauna {
  group: THREE.Group;
  update(focus: THREE.Vector3, heightAt: (x: number, z: number) => number): void;
  setCount(butterflies: number, birds: number): void;
}

export function createFauna(maxButterflies = 28, maxBirds = 14): Fauna {
  const group = new THREE.Group();
  group.name = 'fauna';
  const rnd = mulberry32(1234);

  // ---- butterflies: two wing quads hinged on the body axis ----
  const bPos: number[] = [];
  const bWing: number[] = [];
  for (const side of [-1, 1]) {
    // a rounded wing from 2 triangles (front + hind wing)
    const w = [[0, 0, 0.0], [side * 0.11, 0, 0.07], [side * 0.12, 0, -0.02], [0, 0, 0.0], [side * 0.12, 0, -0.02], [side * 0.07, 0, -0.09]];
    for (const v of w) {
      bPos.push(v[0], v[1], v[2]);
      bWing.push(side);
    }
  }
  const bGeo = new THREE.InstancedBufferGeometry();
  bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
  bGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(bPos.length), 3));
  bGeo.setAttribute('aWing', new THREE.Float32BufferAttribute(bWing, 1));
  const bSeed = new Float32Array(maxButterflies * 4);
  const bAnchor = new Float32Array(maxButterflies * 3);
  const palette = [[1.0, 0.85, 0.2], [1.0, 1.0, 0.95], [0.4, 0.7, 1.0], [1.0, 0.55, 0.2], [0.95, 0.6, 0.9]];
  const bCol = new Float32Array(maxButterflies * 3);
  for (let i = 0; i < maxButterflies; i++) {
    bSeed.set([rnd() * 100, 0.6 + rnd() * 0.8, rnd() * 6.28, rnd()], i * 4);
    const c = palette[Math.floor(rnd() * palette.length)];
    bCol.set(c, i * 3);
  }
  const seedAttr = new THREE.InstancedBufferAttribute(bSeed, 4);
  const anchorAttr = new THREE.InstancedBufferAttribute(bAnchor, 3);
  anchorAttr.setUsage(THREE.DynamicDrawUsage);
  bGeo.setAttribute('aSeed', seedAttr);
  bGeo.setAttribute('aAnchor', anchorAttr);
  bGeo.setAttribute('aCol', new THREE.InstancedBufferAttribute(bCol, 3));
  bGeo.instanceCount = maxButterflies;
  bGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const bMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  bMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWing;\nattribute vec4 aSeed;\nattribute vec3 aAnchor;\nattribute vec3 aCol;\nvarying vec3 vBCol;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', /* glsl */ `
        float tt = uTime * aSeed.y + aSeed.x;
        // wandering path around the anchor
        vec3 c = aAnchor + vec3(sin(tt * 0.7) * 2.2 + sin(tt * 1.9) * 0.6, 0.55 + sin(tt * 1.3) * 0.25 + sin(tt * 3.7) * 0.08, cos(tt * 0.6) * 2.0 + cos(tt * 2.3) * 0.5);
        vec3 vel = vec3(cos(tt * 0.7) * 1.54 + cos(tt * 1.9) * 1.14, 0.0, -sin(tt * 0.6) * 1.2 - sin(tt * 2.3) * 1.15);
        float heading = atan(vel.x, vel.z);
        float flap = sin(uTime * 22.0 + aSeed.x * 7.0) * 1.1;
        vec3 p = position;
        float a = flap * aWing;
        p = vec3(p.x * cos(a), abs(p.x) * sin(a) * 1.0, p.z);
        float ch = cos(heading), sh = sin(heading);
        p = vec3(p.x * ch + p.z * sh, p.y, -p.x * sh + p.z * ch);
        vec3 transformed = c + p * 1.6;
        vBCol = aCol;`)
      .replace('#include <color_vertex>', '#include <color_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBCol;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vBCol;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  bMat.customProgramCacheKey = () => 'sj-butterfly';
  const butterflies = new THREE.Mesh(bGeo, bMat);
  butterflies.frustumCulled = false;
  butterflies.name = 'butterflies';
  group.add(butterflies);

  // ---- birds: chevrons wheeling slowly ----
  const brPos = [0, 0, 0.12, -0.9, 0.0, -0.2, 0, 0, -0.1, 0, 0, 0.12, 0, 0, -0.1, 0.9, 0.0, -0.2];
  const brWing = [0, -1, 0, 0, 0, 1];
  const brGeo = new THREE.InstancedBufferGeometry();
  brGeo.setAttribute('position', new THREE.Float32BufferAttribute(brPos, 3));
  brGeo.setAttribute('aWing', new THREE.Float32BufferAttribute(brWing, 1));
  const brSeed = new Float32Array(maxBirds * 4);
  for (let i = 0; i < maxBirds; i++) brSeed.set([rnd() * 100, 25 + rnd() * 40, 40 + rnd() * 40, rnd() < 0.5 ? -1 : 1], i * 4);
  brGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(brSeed, 4));
  const brAnchor = new THREE.InstancedBufferAttribute(new Float32Array(maxBirds * 3), 3);
  brAnchor.setUsage(THREE.DynamicDrawUsage);
  brGeo.setAttribute('aAnchor', brAnchor);
  brGeo.instanceCount = maxBirds;
  brGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const brMat = new THREE.MeshBasicMaterial({ color: 0x2a3140, side: THREE.DoubleSide });
  brMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWing;\nattribute vec4 aSeed;\nattribute vec3 aAnchor;')
      .replace('#include <begin_vertex>', /* glsl */ `
        float tt = uTime * (6.0 / aSeed.z) * aSeed.w + aSeed.x;
        vec3 c = aAnchor + vec3(cos(tt) * aSeed.z, aSeed.y + sin(tt * 0.7) * 4.0, sin(tt) * aSeed.z);
        float heading = atan(-sin(tt) * aSeed.w, cos(tt) * aSeed.w) ;
        vec3 p = position;
        p.y += abs(aWing) * sin(uTime * 7.0 + aSeed.x) * 0.45;
        float ch = cos(heading), sh = sin(heading);
        p = vec3(p.x * ch + p.z * sh, p.y, -p.x * sh + p.z * ch);
        vec3 transformed = c + p * 1.3;`);
  };
  brMat.customProgramCacheKey = () => 'sj-bird';
  const birds = new THREE.Mesh(brGeo, brMat);
  birds.frustumCulled = false;
  birds.name = 'birds';
  group.add(birds);

  let nB = maxButterflies, nBr = maxBirds;
  const lastB = new THREE.Vector3(1e9, 0, 1e9);
  return {
    group,
    setCount(b: number, br: number) {
      nB = Math.min(maxButterflies, b);
      nBr = Math.min(maxBirds, br);
      bGeo.instanceCount = nB;
      brGeo.instanceCount = nBr;
    },
    update(focus: THREE.Vector3, heightAt: (x: number, z: number) => number) {
      // recycle anything that drifted out of range to a fresh spot around the player
      const first = lastB.x > 1e8;
      lastB.copy(focus);
      let dirtyB = false;
      for (let i = 0; i < maxButterflies; i++) {
        const dx = bAnchor[i * 3] - focus.x, dz = bAnchor[i * 3 + 2] - focus.z;
        if (!first && dx * dx + dz * dz < 30 * 30) continue;
        const a = rnd() * Math.PI * 2;
        const r = first ? 3 + Math.sqrt(rnd()) * 24 : 20 + rnd() * 8;
        const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
        bAnchor[i * 3] = x;
        bAnchor[i * 3 + 1] = Math.max(heightAt(x, z), 0.3);
        bAnchor[i * 3 + 2] = z;
        dirtyB = true;
      }
      if (dirtyB) anchorAttr.needsUpdate = true;
      const arr = brAnchor.array as Float32Array;
      let dirtyR = false;
      for (let i = 0; i < maxBirds; i++) {
        const dx = arr[i * 3] - focus.x, dz = arr[i * 3 + 2] - focus.z;
        if (!first && dx * dx + dz * dz < 220 * 220) continue;
        const a = rnd() * Math.PI * 2, r = first ? 30 + rnd() * 140 : 150 + rnd() * 60;
        const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
        arr[i * 3] = x;
        arr[i * 3 + 1] = Math.max(heightAt(x, z), 0);
        arr[i * 3 + 2] = z;
        dirtyR = true;
      }
      if (dirtyR) brAnchor.needsUpdate = true;
    },
  };
}
