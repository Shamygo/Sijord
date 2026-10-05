import * as THREE from 'three';
import type { Creature } from '../../shared/battle/types';
import { createCreature } from '../../shared/battle/creature';
import { Rng } from '../../shared/battle/rng';
import { Mover } from '../overworld/mover';
import { createAvatar } from '../player/avatar';
import type { Avatar } from '../player/types';
import type { DialogueLine } from '../ui/dialogue';
import type { World } from '../world/types';

const NAME = 'Sunniva';

/** The starter that beats each starter: Sunniva always picks the one with the edge. */
const COUNTER: Record<string, string> = { fernfawn: 'cindlet', cindlet: 'splashpup', splashpup: 'fernfawn' };

/**
 * Sunniva, Hazel's ambitious niece and the player's rival (DESIGN §14). She runs out of the lab
 * once the player has a partner, challenges them on the spot, and waits by the lab for a
 * rematch until she's beaten.
 */
export class Rival {
  readonly root = new THREE.Group();
  readonly name = NAME;
  private avatar: Avatar;
  private marker: THREE.Mesh;
  private mover = new Mover(0.35, 18, 9);
  private target: THREE.Vector3 | null = null;
  private running = false;
  private arrive: (() => void) | null = null;
  private lookTarget: THREE.Vector3 | null = null;
  private t = 0;

  constructor(private world: World, private home: THREE.Vector3, private homeYaw: number) {
    this.avatar = createAvatar({
      skinTone: '#f1d2b0',
      hairColor: '#f0cf72',
      hairStyle: 3,
      jacketColor: '#1f9e93',
      pantsColor: '#2f3346',
      build: 0,
    });
    this.avatar.setGround((x, z) => world.heightAt(x, z));
    this.root.add(this.avatar.root);
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff5a00, emissiveIntensity: 0.6, roughness: 0.4 }),
    );
    this.marker.scale.set(1, 1.6, 1);
    this.marker.position.y = 2.3;
    this.marker.visible = false;
    this.root.add(this.marker);
    this.place(home, homeYaw);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get yaw(): number {
    return this.mover.yaw;
  }

  gesture(name: 'throw'): void {
    this.avatar.gesture(name);
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  setMarker(v: boolean): void {
    this.marker.visible = v;
  }

  place(p: THREE.Vector3, yaw: number): void {
    this.mover.place(p.x, p.z, this.world, yaw);
    this.target = null;
    this.root.position.copy(this.mover.pos);
  }

  goHome(): Promise<void> {
    return this.walkTo(this.home, false);
  }

  get homeSpot(): THREE.Vector3 {
    return this.home;
  }

  /** Walk (or run) to a point; resolves on arrival. */
  walkTo(p: THREE.Vector3, run: boolean): Promise<void> {
    this.arrive?.();
    this.target = p.clone();
    this.running = run;
    return new Promise((resolve) => (this.arrive = resolve));
  }

  /** Face a point (null: face where she's headed or her resting direction). */
  lookAt(p: THREE.Vector3 | null): void {
    this.lookTarget = p ? p.clone() : null;
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.root.visible) return;
    if (this.target) {
      const rem = this.mover.steer(dt, this.target.x, this.target.z, this.running ? 6.2 : 2.4, this.world, 0.2);
      if (rem < 0.35 && this.mover.speed < 0.4) {
        this.target = null;
        const done = this.arrive;
        this.arrive = null;
        done?.();
      }
    } else {
      this.mover.idle(dt, this.world);
      const want = this.lookTarget
        ? Math.atan2(this.lookTarget.x - this.mover.pos.x, this.lookTarget.z - this.mover.pos.z)
        : this.mover.pos.distanceTo(this.home) < 1 ? this.homeYaw : this.mover.yaw;
      this.mover.face(dt * 1.6, want);
    }
    this.root.position.copy(this.mover.pos);
    this.avatar.root.rotation.y = this.mover.yaw;
    const speed = this.mover.speed;
    this.avatar.animate(dt, {
      speed,
      anim: speed < 0.25 ? 'idle' : speed > 4 ? 'run' : 'walk',
      x: this.mover.pos.x,
      y: this.mover.pos.y,
      z: this.mover.pos.z,
      yaw: this.mover.yaw,
    });
    this.marker.position.y = 2.3 + Math.sin(this.t * 2.4) * 0.08;
    this.marker.rotation.y += dt * 1.8;
  }

  /**
   * Her team for the first battle: the starter with the type edge (holding an Oran Berry), plus a
   * Finchlet she caught last week. She focuses the player's starter, so the fight is hard but
   * winnable by ganging up on her starter first (or training on the meadow and coming back).
   */
  team(playerStarter: string, seed: number): Creature[] {
    const rng = new Rng(seed);
    const starter = createCreature(COUNTER[playerStarter] ?? 'cindlet', 5, rng, { item: 'oran-berry' });
    const bird = createCreature('finchlet', 4, rng);
    starter.ot = NAME;
    bird.ot = NAME;
    return [starter, bird];
  }

  challengeLines(playerName: string, starterName: string): DialogueLine[] {
    return [
      { speaker: NAME, text: 'Aunt Hazel! Is that them? The new trainer?' },
      { speaker: NAME, text: `So you're ${playerName}. I'm ${NAME}. I've been helping in the lab all year, and I picked my partner this morning.` },
      { speaker: NAME, text: `A ${starterName}, huh? Then I'd better make this quick. Let's battle, two on two, right here!` },
    ];
  }

  winLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: "...What? We lost? I had the type advantage!" },
      { speaker: NAME, text: "Fine. You're good. But I'm going to train every single day, and next time it won't even be close." },
      { speaker: NAME, text: "See you out there, rival." },
    ];
  }

  loseLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: 'Ha! Told you. Type matchups matter, and so does picking your targets.' },
      { speaker: NAME, text: "Get your team patched up by Aunt Hazel. I'll be right here by the lab when you want a rematch." },
    ];
  }

  rematchLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: 'Back for more? Good. I was getting bored.', choices: ['Battle!', 'Not yet'] },
    ];
  }

  idleLines(): DialogueLine[] {
    return [{ speaker: NAME, text: "Don't get comfortable. I'm training on Route 1 every morning, and I'll catch up." }];
  }

  dispose(): void {
    this.avatar.dispose();
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
  }
}
