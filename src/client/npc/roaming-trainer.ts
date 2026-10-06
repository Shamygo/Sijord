import * as THREE from 'three';
import { patrolAt, trainerName, TRAINER_TUNING, type RoamingTrainerDef } from '../../shared/trainers';
import { Mover } from '../overworld/mover';
import { createAvatar } from '../player/avatar';
import type { Avatar } from '../player/types';
import type { World } from '../world/types';

/** Past this distance from the player a trainer isn't drawn or animated (they keep their place on the beat). */
const DRAW_RANGE = 170;

let bubble: THREE.SpriteMaterial | null = null;
/** The "!" a trainer shows when they spot you: one texture shared by all of them. */
function exclaimMaterial(): THREE.SpriteMaterial {
  if (bubble) return bubble;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1d2433';
  g.lineWidth = 7;
  g.beginPath();
  g.roundRect(22, 8, 84, 92, 26);
  g.moveTo(52, 98); g.lineTo(64, 122); g.lineTo(76, 98);
  g.fill();
  g.stroke();
  // Cover the seam between the speech tail and the bubble.
  g.fillRect(55, 92, 18, 9);
  g.fillStyle = '#e8402a';
  g.font = 'bold 76px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('!', 64, 56);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  bubble = new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false });
  return bubble;
}

/**
 * A roaming trainer in the overworld (DESIGN §12.3). On their own they walk their beat, which
 * comes from the clock so both friends see them in the same place. The game takes them over
 * to walk up to the player and battle (`walkTo`, `lookAt`), or to stand at a friend's battle
 * (`standAt`), then hands them back to their beat (`resume`).
 */
export class RoamingTrainer {
  readonly root = new THREE.Group();
  readonly name: string;
  private avatar: Avatar;
  private mark: THREE.Sprite | null = null;
  private markT = 0;
  private mover = new Mover(0.35, 16, 8);
  private scripted = false;
  private target: THREE.Vector3 | null = null;
  private running = false;
  private arrive: (() => void) | null = null;
  private lookTarget: THREE.Vector3 | null = null;
  private stand: { p: THREE.Vector3; yaw: number } | null = null;
  private placed = false;

  constructor(readonly def: RoamingTrainerDef, private world: World) {
    this.name = trainerName(def);
    this.avatar = createAvatar(def.look);
    this.avatar.setGround((x, z) => world.heightAt(x, z));
    this.root.add(this.avatar.root);
    this.root.name = `trainer:${def.id}`;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get yaw(): number {
    return this.mover.yaw;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** On their beat (not walking up to someone, battling, or standing at a friend's battle). */
  get patrolling(): boolean {
    return !this.scripted && !this.stand;
  }

  gesture(name: 'throw'): void {
    this.avatar.gesture(name);
  }

  /** Spotted you: a "!" pops up over their head. */
  exclaim(): void {
    if (!this.mark && typeof document !== 'undefined') {
      this.mark = new THREE.Sprite(exclaimMaterial());
      this.mark.renderOrder = 10;
      this.root.add(this.mark);
    }
    this.markT = 1.6;
  }

  /** The game takes over (true) or hands them back to their beat (false). */
  setScripted(on: boolean): void {
    this.scripted = on;
    if (!on) {
      this.target = null;
      this.lookTarget = null;
      this.arrive?.();
      this.arrive = null;
    }
  }

  /** Stand at a spot facing `yaw` (a friend is battling them there), or null to go back to the beat. */
  standAt(spot: { p: THREE.Vector3; yaw: number } | null): void {
    this.stand = spot;
  }

  place(p: THREE.Vector3, yaw: number): void {
    this.mover.place(p.x, p.z, this.world, yaw);
    this.target = null;
    this.root.position.copy(this.mover.pos);
  }

  /** Walk (or run) to a point; resolves on arrival. */
  walkTo(p: THREE.Vector3, run: boolean): Promise<void> {
    this.arrive?.();
    this.target = p.clone();
    this.running = run;
    return new Promise((resolve) => (this.arrive = resolve));
  }

  lookAt(p: THREE.Vector3 | null): void {
    this.lookTarget = p ? p.clone() : null;
  }

  update(dt: number, seconds: number, player: THREE.Vector3): void {
    const beat = patrolAt(this.def, seconds);
    const far = Math.hypot(beat.x - player.x, beat.z - player.z) > DRAW_RANGE && Math.hypot(this.mover.pos.x - player.x, this.mover.pos.z - player.z) > DRAW_RANGE;
    if (far && !this.scripted) {
      // Out of sight: keep them on their beat without animating.
      this.root.visible = false;
      this.stand = null;
      this.placed = false;
      return;
    }
    this.root.visible = true;
    if (!this.placed) {
      this.placed = true;
      this.place(new THREE.Vector3(beat.x, 0, beat.z), beat.yaw);
    }
    let speed = TRAINER_TUNING.walk;
    let goal: { x: number; z: number } | null = null;
    let face: number | null = null;
    if (this.scripted) {
      if (this.target) { goal = this.target; speed = this.running ? 5.6 : 2.2; }
      else if (this.lookTarget) face = Math.atan2(this.lookTarget.x - this.mover.pos.x, this.lookTarget.z - this.mover.pos.z);
    } else if (this.stand) {
      const d = Math.hypot(this.stand.p.x - this.mover.pos.x, this.stand.p.z - this.mover.pos.z);
      if (d > 0.4) { goal = this.stand.p; speed = d > 4 ? 5.6 : 2.2; } else face = this.stand.yaw;
    } else {
      const d = Math.hypot(beat.x - this.mover.pos.x, beat.z - this.mover.pos.z);
      // Back to the beat after a battle: hurry; on it, keep pace (a little quicker to catch up).
      if (d > 3) { goal = beat; speed = 4.2; }
      else if (beat.walking || d > 0.4) { goal = beat; speed = TRAINER_TUNING.walk * 1.25; }
      else face = beat.yaw;
    }
    if (goal) {
      const rem = this.mover.steer(dt, goal.x, goal.z, speed, this.world, 0.2);
      if (this.scripted && this.target && rem < 0.35 && this.mover.speed < 0.4) {
        this.target = null;
        const done = this.arrive;
        this.arrive = null;
        done?.();
      }
    } else {
      this.mover.idle(dt, this.world);
      if (face !== null) this.mover.face(dt * 1.8, face);
    }
    this.root.position.copy(this.mover.pos);
    this.avatar.root.rotation.y = this.mover.yaw;
    const v = this.mover.speed;
    this.avatar.animate(dt, { speed: v, anim: v < 0.25 ? 'idle' : v > 4 ? 'run' : 'walk', x: this.mover.pos.x, y: this.mover.pos.y, z: this.mover.pos.z, yaw: this.mover.yaw });
    if (this.mark) {
      this.markT -= dt;
      this.mark.visible = this.markT > 0;
      // Pops in, then settles.
      const age = 1.6 - this.markT;
      const s = 0.85 * (age < 0.15 ? age / 0.15 * 1.25 : age < 0.3 ? 1.25 - (age - 0.15) / 0.15 * 0.25 : 1);
      this.mark.scale.set(s, s, s);
      this.mark.position.set(0, 2.25 + Math.min(age, 0.3) * 0.5, 0);
    }
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
