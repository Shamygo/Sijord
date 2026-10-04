import * as THREE from 'three';
import { createAvatar } from '../player/avatar';
import type { Avatar } from '../player/types';
import type { DialogueLine } from '../ui/dialogue';

const NAME = 'Professor Hazel';

/** Professor Hazel: stands outside her lab, turns to face whoever talks to her. */
export class Professor {
  readonly root = new THREE.Group();
  readonly name = NAME;
  private avatar: Avatar;
  private marker: THREE.Mesh;
  private baseYaw: number;
  private yaw: number;
  private lookTarget: THREE.Vector3 | null = null;
  private t = 0;

  constructor(position: THREE.Vector3, yaw: number) {
    this.avatar = createAvatar({
      skinTone: '#c68642',
      hairColor: '#e8e2d0',
      hairStyle: 3,
      jacketColor: '#f5f5f5',
      pantsColor: '#3d4e6b',
      build: 0,
    });
    this.root.add(this.avatar.root);
    this.root.position.copy(position);
    this.baseYaw = this.yaw = yaw;

    // Quest marker floating over her head until both intros are done.
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffa000, emissiveIntensity: 0.6, roughness: 0.4 }),
    );
    this.marker.scale.set(1, 1.6, 1);
    this.marker.position.y = 2.35;
    this.root.add(this.marker);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  setMarker(visible: boolean): void {
    this.marker.visible = visible;
  }

  /** Face a point while talking; pass null to drift back to her resting pose. */
  lookAt(target: THREE.Vector3 | null): void {
    this.lookTarget = target ? target.clone() : null;
  }

  update(dt: number): void {
    this.t += dt;
    const want = this.lookTarget
      ? Math.atan2(this.lookTarget.x - this.root.position.x, this.lookTarget.z - this.root.position.z)
      : this.baseYaw;
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-6 * dt));
    this.avatar.root.rotation.y = this.yaw;
    this.avatar.animate(dt, { speed: 0, anim: 'idle' });
    this.marker.position.y = 2.35 + Math.sin(this.t * 2.4) * 0.08;
    this.marker.rotation.y += dt * 1.8;
  }

  /** First conversation: the classic professor intro, adapted for two trainers. */
  introLines(playerName: string, partnerName: string | null): DialogueLine[] {
    const partner = partnerName ?? 'your partner';
    return [
      { speaker: NAME, text: `Ah, ${playerName}! Right on time. Welcome to my lab... well, the front step of it.` },
      { speaker: NAME, text: 'I study Pokemon across the Sijord region: how they live, where they roam, and how they change the land around them.' },
      { speaker: NAME, text: 'Sijord is wide open. Nothing stops you walking from here to the far coast on day one. Nothing except the Pokemon, the weather and your own stomach, that is.' },
      { speaker: NAME, text: `The region's Gym Leaders only accept challengers in pairs. You and ${partner} will need to work together inside every Gym.` },
      {
        speaker: NAME,
        text: 'Before I hand over a partner Pokemon, tell me: what draws you out into the wild?',
        choices: ['Catching every Pokemon', 'Beating every Gym', 'Seeing the whole map'],
      },
      { speaker: NAME, text: "A fine answer. My assistants are still settling this year's partner Pokemon in the lab, so they aren't ready quite yet." },
      { speaker: NAME, text: 'In the meantime, head out the north gate onto Route 1 and get a feel for the land. Come back when you have stretched your legs!' },
    ];
  }

  repeatLines(): DialogueLine[] {
    return [{ speaker: NAME, text: 'The north gate leads to Route 1. Mind the tall grass, and keep an eye on your stamina!' }];
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
