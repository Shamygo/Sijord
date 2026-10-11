import * as THREE from 'three';
import ASSETS from '../../shared/data/world-assets.json';
import { assetUrl, loadAsset } from '../assets/loader';
import { paintPropMaterial } from './materials';
import { worldUniforms } from './shared';

/**
 * The Blender-built world kit (scripts/blender): houses in nine styles, Pokémon Centers, shops,
 * inns, gyms, landmarks and props, each as a detailed and a low-detail mesh with baked ambient
 * occlusion in its vertex colours, plus a glow mesh for windows and lanterns.
 */
export interface KitModel {
  hi: THREE.BufferGeometry;
  lo: THREE.BufferGeometry;
  glowHi: THREE.BufferGeometry | null;
  glowLo: THREE.BufferGeometry | null;
}

const PACKS = (ASSETS as unknown as { packs: Record<string, { file: string }> }).packs;

let models: Map<string, KitModel> | null = null;
let loading: Promise<Map<string, KitModel>> | null = null;

/** Load every pack once (they are small: about 6 MB in all, Draco-compressed). */
export function loadWorldKit(): Promise<Map<string, KitModel>> {
  if (models) return Promise.resolve(models);
  if (loading) return loading;
  loading = (async () => {
    const out = new Map<string, KitModel>();
    const parts = new Map<string, THREE.BufferGeometry>();
    await Promise.all(Object.values(PACKS).map(async (p) => {
      try {
        const gltf = await loadAsset(assetUrl(p.file), true);
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const g = mesh.geometry.clone();
          g.applyMatrix4(mesh.matrixWorld);
          for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
          if (!g.attributes.color) {
            const c = new Float32Array(g.attributes.position.count * 3).fill(0.8);
            g.setAttribute('color', new THREE.BufferAttribute(c, 3));
          }
          // BatchedMesh wants matching attribute layouts: plain float colours, 3 components.
          g.setAttribute('color', toFloat3(g.attributes.color as THREE.BufferAttribute));
          g.setAttribute('normal', toFloat3(g.attributes.normal as THREE.BufferAttribute));
          g.setAttribute('position', toFloat3(g.attributes.position as THREE.BufferAttribute));
          parts.set(mesh.name, g);
        });
      } catch {
        // A pack that fails to load leaves its settlements without those buildings.
      }
    }));
    const names = new Set([...parts.keys()].filter((n) => !n.includes('__')));
    for (const n of names) {
      const hi = parts.get(n)!;
      out.set(n, { hi, lo: parts.get(`${n}__lod`) ?? hi, glowHi: parts.get(`${n}__glow`) ?? null, glowLo: parts.get(`${n}__lod__glow`) ?? parts.get(`${n}__glow`) ?? null });
    }
    models = out;
    return out;
  })();
  return loading;
}

export function worldKit(): Map<string, KitModel> | null {
  return models;
}

function toFloat3(a: THREE.BufferAttribute): THREE.BufferAttribute {
  const n = a.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = a.getX(i);
    out[i * 3 + 1] = a.getY(i);
    out[i * 3 + 2] = a.itemSize > 2 ? a.getZ(i) : 0;
  }
  return new THREE.BufferAttribute(out, 3);
}

/** Matte vertex-coloured material for the kit (the same painterly grain as the vale's props). */
export const kitMaterial = paintPropMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 }), 'kit');

/**
 * Windows, lanterns, forge vents and the like: glass by day, warm light by night (`uNight`).
 */
export const kitGlowMaterial = (() => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0, emissive: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = worldUniforms.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sjLit = diffuseColor.rgb;
        // By day a lit window reads as glass with a faint warm glint; a hot vent always glows a little.
        float sjHot = smoothstep(0.5, 0.72, sjLit.r - sjLit.g);
        diffuseColor.rgb = mix(mix(vec3(0.28, 0.42, 0.52), sjLit, 0.25 + sjHot * 0.6), sjLit, uNight);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = sjLit * (uNight * 1.9 + sjHot * 0.9 + 0.04);`);
  };
  m.customProgramCacheKey = () => 'sj-kit-glow';
  return m;
})();
