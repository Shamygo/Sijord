import * as THREE from 'three';
import { STARDUST, stardustSpots, type StardustSpot } from '../../shared/stardust';
import { resolveCircle } from '../core/collision';
import { MESAS, TOWN } from './layout';
import { sparkleTexture } from './discoveries';
import type { World } from './types';

/** A night's stardust on the ground, where it fell. */
export interface FallenStar extends StardustSpot {
  y: number;
  taken: boolean;
  root: THREE.Group;
  sparkle: THREE.Sprite;
  /** The thin column of starlight over it, seen from far off. */
  beam: THREE.Mesh;
}

let beamTex: THREE.Texture | null = null;
/** Bright down the middle and at the foot, fading out to the sides and upwards. */
function beamTexture(): THREE.Texture {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) {
    const up = y / 127;
    const v = (1 - up) ** 1.6;
    for (let x = 0; x < 32; x++) {
      const a = Math.max(0, 1 - Math.abs(x - 15.5) / 15.5) ** 1.3 * v;
      const i = (y * 32 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  beamTex = new THREE.CanvasTexture(c);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  return beamTex;
}
const BEAM_H = 16;

let parts: { geo: THREE.BufferGeometry; beam: THREE.BufferGeometry; dust: THREE.Material; piece: THREE.Material } | undefined;
const shared = () => parts ??= {
  geo: new THREE.OctahedronGeometry(1, 0),
  // Flipped (V runs downwards in the canvas) and standing on its foot.
  beam: new THREE.PlaneGeometry(1.5, BEAM_H).translate(0, BEAM_H / 2, 0).scale(1, -1, 1).translate(0, BEAM_H, 0),
  dust: new THREE.MeshStandardMaterial({ color: 0xffb8a0, emissive: new THREE.Color(0xff7a5a), emissiveIntensity: 1.6, roughness: 0.35, flatShading: true }),
  piece: new THREE.MeshStandardMaterial({ color: 0xffd0c0, emissive: new THREE.Color(0xff4060), emissiveIntensity: 2.2, roughness: 0.25, flatShading: true }),
};

/**
 * Tonight's fallen stardust (`src/shared/stardust.ts`): a few glowing grains in the grass, and
 * a twinkle above them you can see from far off in the dark. Hidden by day.
 */
export class StardustField {
  readonly root = new THREE.Group();
  spots: FallenStar[] = [];
  night = -1;

  constructor(private readonly world: World, private readonly seed: number) {
    this.root.name = 'stardust';
    this.root.visible = false;
  }

  /** Ground stardust can fall on: open meadow away from town, water and the mesa tops. */
  private ground = (x: number, z: number): boolean => {
    const w = this.world;
    if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.fenceR + 30) return false;
    if (w.heightAt(x, z) < w.waterLevel + 0.6) return false;
    for (const m of MESAS) if (Math.hypot(x - m.x, z - m.z) < m.r + 4) return false;
    return true;
  };

  /** Lay out a night's stardust (both friends get the same spots), with what's been taken. */
  setNight(night: number, taken: readonly string[]): void {
    if (night === this.night) return;
    this.night = night;
    for (const s of this.spots) s.root.removeFromParent();
    const p = shared();
    this.spots = stardustSpots(this.seed, night, this.world.halfSize - 50, this.ground).map((s) => {
      // Out from under a tree or boulder that grew on the spot.
      const at = resolveCircle(s.x, s.z, 0.7, this.world.colliders);
      const y = this.world.heightAt(at.x, at.z);
      const root = new THREE.Group();
      root.position.set(at.x, y, at.z);
      let r = Math.abs(Math.sin(s.x * 12.9898 + s.z * 78.233)) * 1000;
      const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
      const n = s.piece ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(p.geo, s.piece ? p.piece : p.dust);
        const size = s.piece ? 0.09 + rnd() * 0.05 : 0.04 + rnd() * 0.03;
        m.scale.set(size, size * (s.piece ? 1.6 : 1), size);
        m.position.set((rnd() - 0.5) * 0.35, size * 0.6, (rnd() - 0.5) * 0.35);
        m.rotation.set(rnd() * 0.6, rnd() * Math.PI, rnd() * 0.6);
        root.add(m);
      }
      const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTexture(), color: s.piece ? 0xffb0c0 : 0xfff0d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sparkle.position.y = 0.35;
      sparkle.renderOrder = 2;
      const beam = new THREE.Mesh(p.beam, new THREE.MeshBasicMaterial({ map: beamTexture(), color: s.piece ? 0xff9ab4 : 0xffe2b8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, side: THREE.DoubleSide }));
      beam.renderOrder = 2;
      root.add(sparkle, beam);
      const star: FallenStar = { ...s, x: at.x, z: at.z, y, taken: taken.includes(s.id), root, sparkle, beam };
      root.visible = !star.taken;
      this.root.add(root);
      return star;
    });
  }

  take(id: string): void {
    const s = this.spots.find((p) => p.id === id);
    if (s) {
      s.taken = true;
      s.root.visible = false;
    }
  }

  /** The closest stardust within reach of the trainer's feet, while it's out. */
  nearest(pos: THREE.Vector3): FallenStar | null {
    if (!this.root.visible) return null;
    let best: FallenStar | null = null, bestD = STARDUST.reach;
    for (const s of this.spots) {
      if (s.taken || Math.abs(pos.y - s.y) > 1.8) continue;
      const d = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }

  /** `out`: whether it's dark enough for stardust to be lying about. */
  update(elapsed: number, focus: THREE.Vector3, out: boolean): void {
    this.root.visible = out;
    if (!out) return;
    for (const s of this.spots) {
      if (s.taken) continue;
      const d = Math.hypot(focus.x - s.x, focus.z - s.z);
      s.root.visible = d < STARDUST.glitter * 2;
      if (!s.root.visible) continue;
      // A slow twinkle with a bright flash now and then. From afar it rises over the grass and
      // grows so it stays a point of light; up close it sinks to the grains.
      const ph = elapsed * 2.4 + s.x * 0.31;
      const flash = Math.max(0, Math.sin(elapsed * 0.7 + s.z)) ** 30;
      const far = THREE.MathUtils.clamp(d / 25, 0.7, 3);
      const fade = 1 - THREE.MathUtils.smoothstep(d, STARDUST.glitter, STARDUST.glitter * 2);
      s.sparkle.position.y = THREE.MathUtils.lerp(0.3, 1.2, THREE.MathUtils.smoothstep(d, 4, 20));
      s.sparkle.scale.setScalar((0.32 + 0.1 * Math.sin(ph) + flash * 0.8) * far);
      s.sparkle.material.opacity = (0.55 + 0.25 * Math.sin(ph * 1.3) + flash * 0.2) * fade;
      // The column of light faces the player and fades as they walk up to it.
      s.beam.rotation.y = Math.atan2(focus.x - s.x, focus.z - s.z);
      (s.beam.material as THREE.MeshBasicMaterial).opacity = (0.42 + 0.08 * Math.sin(ph * 0.5)) * fade * THREE.MathUtils.smoothstep(d, 5, 16);
    }
  }
}
