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
  /** How far it's tipped into flight (0 standing), eased. */
  private tilt = 0;

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

  /** The seat, from the mount's feet: up, and forward of its middle (a flyer's tips with it). */
  seat(): { up: number; forward: number } {
    const p = this.species ? RIDE_PROFILES[this.species] : undefined;
    if (!p || !this.model) return { up: 0, forward: 0 };
    const up = p.seat[0] * this.model.height, forward = p.seat[1] * this.model.radius;
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    // Tipping forward about the feet swings the back up and the shoulders ahead.
    return { up: up * c - forward * s, forward: up * s + forward * c };
  }

  /** Put the mount at its feet's position and facing, and step its gait. `flying`: in the air. */
  update(dt: number, x: number, y: number, z: number, yaw: number, speed: number, flying = false): void {
    if (this.provisional && this.species && creatureModelReady(this.species)) this.build();
    if (!this.model) return;
    this.t += dt;
    const swimming = this.draft() > 0;
    const pitch = (this.species && RIDE_PROFILES[this.species]?.pitch) || 0;
    this.tilt += ((flying ? pitch : 0) - this.tilt) * Math.min(1, dt * 3);
    // Water mounts rise and fall a little on the swell, and roll into their stroke; flyers ride
    // the air with a slow heave.
    const bob = swimming ? Math.sin(this.t * 1.7) * 0.05 * (1 + Math.min(1, speed / 6)) : flying ? Math.sin(this.t * 2.2) * 0.12 : 0;
    // Tipped forward, a flyer is lifted so its body (not its feet) sits at the flight height.
    const lift = this.model.height * 0.45 * Math.sin(this.tilt);
    this.root.position.set(x, y + bob + lift, z);
    this.root.rotation.set((swimming ? Math.sin(this.t * 1.3) * 0.03 : 0) + this.tilt, yaw, 0, 'YXZ');
    // Swimmers have no swim cycle of their own: a slow walk reads as paddling. Flyers beat their
    // wings in place (their idle) rather than running in the air.
    this.model.update(dt, swimming ? Math.min(speed, 1.6) : flying ? 0 : speed);
  }

  /** How far the rider leans forward (radians): low over a flyer's neck. */
  get lean(): number {
    return this.tilt * 0.3;
  }

  /** Where the rider's hips go, in world space; `back` metres further back is the second seat. */
  seatWorld(out: THREE.Vector3, back = 0): THREE.Vector3 {
    const s = this.seat(), yaw = this.yaw;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldPosition(out);
    const f = s.forward - back * Math.cos(this.tilt);
    return out.set(out.x + Math.sin(yaw) * f, out.y + s.up + back * Math.sin(this.tilt), out.z + Math.cos(yaw) * f);
  }

  /** The way it faces. */
  get yaw(): number {
    return this.root.rotation.y;
  }

  /** Room for a passenger behind the rider (DESIGN §8.3). */
  get twoSeat(): boolean {
    return !!this.species && !!RIDE_PROFILES[this.species]?.twoSeat;
  }

  dispose(): void {
    this.set(null);
    this.root.removeFromParent();
  }
}
