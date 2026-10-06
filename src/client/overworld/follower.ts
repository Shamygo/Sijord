import * as THREE from 'three';
import { createCreatureModel, creatureModelReady, type CreatureModel } from '../creatures';
import type { World } from '../world/types';
import { Mover } from './mover';

/**
 * The lead creature walking beside its trainer, as in the art reference: a little behind and to
 * the trainer's left, keeping pace at a walk and a sprint, and catching up (or reappearing next
 * to the trainer) if it falls far behind.
 */
export class Follower {
  readonly root = new THREE.Group();
  model: CreatureModel | null = null;
  species: string | null = null;
  readonly mover = new Mover(0.35, 16, 8);
  private visible = true;
  private placed = false;
  private idleTime = 0;
  /** Showing a stand-in while the species' real model is still downloading. */
  private provisional = false;
  /** Where it's rushing to intercept a charging wild creature, instead of following. */
  private rush: THREE.Vector3 | null = null;

  /** Sprint at a charging wild creature (DESIGN §5.3 interception); null goes back to following. */
  rushAt(target: THREE.Vector3 | null): void {
    if (!target) this.rush = null;
    else (this.rush ??= new THREE.Vector3()).copy(target);
  }

  setSpecies(id: string | null): void {
    if (id === this.species) return;
    this.species = id;
    this.placed = false;
    this.buildModel();
  }

  private buildModel(): void {
    if (this.model) {
      this.root.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
    const id = this.species;
    this.provisional = !!id && !creatureModelReady(id);
    if (id) {
      this.model = createCreatureModel(id);
      this.root.add(this.model.root);
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.root.visible = v && !!this.model;
    if (!v) this.placed = false;
  }

  get active(): boolean {
    return this.visible && !!this.model;
  }

  /** Where the follower wants to be: beside the leader's left shoulder, a step behind. */
  private slot(leader: THREE.Vector3, yaw: number, size: number): [number, number] {
    const side = 0.9 + size * 0.9;
    const back = 0.5 + size * 0.6;
    // Facing yaw: forward is (sin, cos); the leader's left is (cos, -sin).
    return [leader.x + Math.cos(yaw) * side - Math.sin(yaw) * back, leader.z - Math.sin(yaw) * side - Math.cos(yaw) * back];
  }

  update(dt: number, leader: THREE.Vector3, leaderYaw: number, leaderSpeed: number, world: World): void {
    // Swap in the real model once it has downloaded.
    if (this.provisional && this.species && creatureModelReady(this.species)) this.buildModel();
    if (!this.model || !this.visible) return;
    const size = this.model.radius;
    const [tx, tz] = this.slot(leader, leaderYaw, size);
    if (!this.placed || (!this.rush && this.mover.pos.distanceTo(leader) > 26)) {
      this.mover.place(tx, tz, world, leaderYaw);
      this.placed = true;
    }
    if (this.rush) {
      this.mover.steer(dt, this.rush.x, this.rush.z, 13, world, 0.2);
      this.root.position.copy(this.mover.pos);
      this.root.rotation.y = this.mover.yaw;
      this.model.update(dt, this.mover.speed);
      return;
    }
    const far = this.mover.pos.distanceTo(leader);
    // Keep up with a sprint, and hurry when it falls behind.
    const max = Math.max(2.5, leaderSpeed * 1.05) + Math.max(0, far - 3) * 1.2;
    const rem = this.mover.steer(dt, tx, tz, Math.min(max, 11), world, 0.25);
    if (rem < 0.4 && leaderSpeed < 0.3) {
      this.idleTime += dt;
      // Settled: turn to face the same way as the trainer (or glance at them now and then).
      const look = Math.sin(this.idleTime * 0.4) > 0.85 ? Math.atan2(leader.x - this.mover.pos.x, leader.z - this.mover.pos.z) : leaderYaw;
      this.mover.face(dt, look);
    } else this.idleTime = 0;
    this.root.position.copy(this.mover.pos);
    this.root.rotation.y = this.mover.yaw;
    this.model.update(dt, this.mover.speed);
  }

  dispose(): void {
    this.setSpecies(null);
  }
}
