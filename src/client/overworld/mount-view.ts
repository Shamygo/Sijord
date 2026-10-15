import * as THREE from 'three';
import { RIDE_PROFILES } from '../../shared/riding';
import { createCreatureModel, creatureModelReady, type CreatureModel } from '../creatures';

/**
 * A Pokémon being ridden, drawn under its rider: its own model at the mount's feet, playing its
 * gait from the speed, with a seat on its back where the trainer sits. Water mounts ride low in
 * the water and bob. Used for the local player and for a co-op partner alike.
 */
export class MountView {
  readonly root = new THREE.Group();
  model: CreatureModel | null = null;
  species: string | null = null;
  alpha = false;
  private provisional = false;
  private t = 0;

  set(species: string | null, alpha = false): void {
    if (species === this.species && alpha === this.alpha) return;
    this.species = species;
    this.alpha = alpha;
    this.build();
  }

  private build(): void {
    if (this.model) {
      this.root.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
    const id = this.species;
    this.provisional = !!id && !creatureModelReady(id);
    if (id) {
      this.model = createCreatureModel(id, { alpha: this.alpha });
      this.root.add(this.model.root);
    }
    this.root.visible = !!this.model;
  }

  /** How far below the surface a swimming mount's feet sit (0 on land). */
  draft(): number {
    const p = this.species ? RIDE_PROFILES[this.species] : undefined;
    return p?.mode === 'water' && this.model ? (p.draft ?? 0.35) * this.model.height : 0;
  }

  /** The seat, from the mount's feet: up, and forward of its middle. */
  seat(): { up: number; forward: number } {
    const p = this.species ? RIDE_PROFILES[this.species] : undefined;
    if (!p || !this.model) return { up: 0, forward: 0 };
    return { up: p.seat[0] * this.model.height, forward: p.seat[1] * this.model.radius };
  }

  /** Put the mount at its feet's position and facing, and step its gait. */
  update(dt: number, x: number, y: number, z: number, yaw: number, speed: number): void {
    if (this.provisional && this.species && creatureModelReady(this.species)) this.build();
    if (!this.model) return;
    this.t += dt;
    const swimming = this.draft() > 0;
    // Water mounts rise and fall a little on the swell, and roll into their stroke.
    const bob = swimming ? Math.sin(this.t * 1.7) * 0.05 * (1 + Math.min(1, speed / 6)) : 0;
    this.root.position.set(x, y + bob, z);
    this.root.rotation.set(swimming ? Math.sin(this.t * 1.3) * 0.03 : 0, yaw, 0, 'YXZ');
    // Swimmers have no swim cycle of their own: a slow walk reads as paddling.
    this.model.update(dt, swimming ? Math.min(speed, 1.6) : speed);
  }

  /** Where the rider's hips go, in world space. */
  seatWorld(out: THREE.Vector3): THREE.Vector3 {
    const s = this.seat(), yaw = this.root.rotation.y;
    return out.set(this.root.position.x + Math.sin(yaw) * s.forward, this.root.position.y + s.up, this.root.position.z + Math.cos(yaw) * s.forward);
  }

  dispose(): void {
    this.set(null);
    this.root.removeFromParent();
  }
}
