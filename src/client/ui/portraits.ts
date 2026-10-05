import * as THREE from 'three';
import { POKEMON_VISUALS } from '../../shared/pokemon-visuals';
import type { Appearance } from '../../shared/types';
import { createAvatar } from '../player/avatar';
import { createCreatureModel } from '../creatures';

/**
 * Small rendered portraits of creatures for the HUD, party screen and battle menus, drawn once
 * per species from the real 3D model (three-quarter view of the head and shoulders) and cached
 * as image URLs.
 */
export class Portraits {
  private cache = new Map<string, string>();
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private failed = false;

  constructor(private size = 160) {
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x5a7a3a, 1.6));
    const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
    key.position.set(2, 3, 3);
    const rim = new THREE.DirectionalLight(0xbfe0ff, 1.4);
    rim.position.set(-3, 2, -2);
    this.scene.add(key, rim);
  }

  private ensure(): THREE.WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = this.size;
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.renderer.setSize(this.size, this.size, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
    } catch {
      this.failed = true;
    }
    return this.renderer;
  }

  async trainer(appearance: Appearance): Promise<string> {
    const r = this.ensure(); if (!r) return '';
    const avatar = createAvatar(appearance);
    await new Promise(resolve => setTimeout(resolve, 50));
    avatar.animate(0.016,{speed:0,anim:'idle'});
    this.scene.add(avatar.root); avatar.root.rotation.y = -0.2;
    r.setSize(320,440); this.camera.aspect = 320/440; this.camera.updateProjectionMatrix();
    this.camera.position.set(0,1.2,3.5); this.camera.lookAt(0,0.95,0);
    r.render(this.scene,this.camera); const url = r.domElement.toDataURL('image/png');
    this.scene.remove(avatar.root); avatar.dispose();
    r.setSize(this.size,this.size); this.camera.aspect = 1; this.camera.updateProjectionMatrix();
    return url;
  }

  /** Image URL of a species' portrait ('' if WebGL is unavailable). */
  get(species: string): string {
    const hit = this.cache.get(species);
    if (hit !== undefined) return hit;
    const r = this.ensure();
    if (!r) return '';
    const model = createCreatureModel(species);
    model.update(0.016, 0);
    this.scene.add(model.root);
    const h = model.height;
    // Frame the head: three-quarter view from the front-left, slightly above.
    // Wide quadrupeds have low faces; the upright crop otherwise shows only their back.
    const dex=POKEMON_VISUALS[species]?.dex;
    const wide = (dex !== undefined && dex <= 3) || model.radius > h * .6;
    const look = new THREE.Vector3(0, h * (wide ? .38 : .62), h * .12);
    const dist = Math.max(.55, h * (wide ? 1.9 : 1.25), wide ? model.radius * 2.2 : 0);
    this.camera.position.set(look.x + dist * 0.55, look.y + dist * 0.18, look.z + dist * 0.85);
    this.camera.lookAt(look);
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    this.scene.remove(model.root);
    model.dispose();
    this.cache.set(species, url);
    return url;
  }
}
