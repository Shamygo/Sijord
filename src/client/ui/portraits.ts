import * as THREE from 'three';
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
    const look = new THREE.Vector3(0, h * 0.62, h * 0.12);
    const dist = Math.max(0.55, h * 1.25);
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
