import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { POKEMON_VISUALS } from '../../shared/pokemon-visuals';

/** Local files use the same paths on Pages and Vite. Single-file downloads use the published assets. */
export function assetUrl(path: string): string {
  const base = typeof location !== 'undefined' && location.protocol === 'file:'
    ? 'https://shamygo.github.io/Sijord/' : import.meta.env.BASE_URL;
  return base + path;
}

interface Entry { promise: Promise<GLTF>; asset?: GLTF; refs: number; used: number; pinned: boolean }
const cache = new Map<string, Entry>();
let loader: GLTFLoader | undefined;
export const assetStatus = { loaded: new Set<string>(), failed: new Set<string>(), loading: new Set<string>() };

function getLoader(): GLTFLoader {
  if (!loader) {
    const draco = new DRACOLoader().setDecoderPath(assetUrl('draco/'));
    draco.setWorkerLimit(2);
    loader = new GLTFLoader().setDRACOLoader(draco);
  }
  return loader;
}

export function loadAsset(url: string, pinned = false): Promise<GLTF> {
  const old = cache.get(url);
  if (old) { old.used = performance.now(); old.pinned ||= pinned; return old.promise; }
  assetStatus.loading.add(url);
  const entry: Entry = { promise: null!, refs: 0, used: performance.now(), pinned };
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<GLTF>((_, reject) => { timeout = setTimeout(() => reject(new Error('Model load timed out')), 30000); });
  const request = url.endsWith('.gz') ? (async () => {
    const response = await fetch(url); if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const buffer = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : bytes.buffer;
    return getLoader().parseAsync(buffer, url.slice(0,url.lastIndexOf('/')+1));
  })() : getLoader().loadAsync(url);
  entry.promise = Promise.race([request, deadline]).then((gltf) => {
    gltf.scene.userData.assetUrl = url;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; }
    });
    entry.asset = gltf;
    assetStatus.loaded.add(url); assetStatus.failed.delete(url);
    return gltf;
  }).catch((error: unknown) => {
    cache.delete(url); assetStatus.failed.add(url);
    throw error;
  }).finally(() => { clearTimeout(timeout); assetStatus.loading.delete(url); });
  cache.set(url, entry);
  return entry.promise;
}

export function loadedAsset(url: string): GLTF | undefined { return cache.get(url)?.asset; }
export function pokemonUrl(dex: number): string { return assetUrl(`models/pokemon/${String(dex).padStart(3, '0')}.glb`); }
export const trainerUrl = (): string => assetUrl('models/trainer/red.glb');

/** Complete gameplay assets before constructing portraits or the initial world creatures. */
export async function preloadGameplayAssets(): Promise<void> {
  const urls = [trainerUrl(), ...Object.values(POKEMON_VISUALS).map((v) => pokemonUrl(v.dex))];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try { await loadAsset(url, true); } catch { /* Keep the playable procedural fallback on an unavailable asset. */ }
    }
  }));
}

/** Independent skeletons and materials; immutable geometries/textures are shared between instances. */
export function instantiateAsset(asset: GLTF): { scene: THREE.Group; release: () => void } {
  const url = asset.scene.userData.assetUrl as string;
  const entry = cache.get(url);
  if (entry) entry.refs++;
  const scene = clone(asset.scene) as THREE.Group;
  const materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const copy = (m: THREE.Material) => { const c = m.clone(); materials.add(c); return c; };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
  });
  let disposed = false;
  return { scene, release: () => {
    if (disposed) return; disposed = true;
    for (const m of materials) m.dispose();
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose(); });
    if (entry) { entry.refs--; entry.used = performance.now(); }
    // Retain the small gameplay pack; bound the much larger optional catalogue's GPU memory.
    const unused = [...cache.entries()].filter(([, e]) => !e.pinned && e.asset && e.refs === 0).sort((a, b) => a[1].used - b[1].used);
    for (const [key, e] of unused.slice(0, Math.max(0, unused.length - 4))) {
      disposeTemplate(e.asset!); cache.delete(key); assetStatus.loaded.delete(key);
    }
  } };
}

function disposeTemplate(asset: GLTF): void {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  asset.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geometry.add(m.geometry);
    for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
      materials.add(material);
      for (const v of Object.values(material)) if (v instanceof THREE.Texture) textures.add(v);
    }
  });
  for (const g of geometry) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
}
