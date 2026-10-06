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
      trainerModel: 'custom',
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
      { speaker: NAME, text: 'A fine answer. Whatever it is, you will need a partner for it.' },
    ];
  }

  /** The three starters, then the pick. The choice index maps to STARTERS. */
  starterLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: "My assistants have this year's partners settled at last. Three of them, and every one is waiting for a trainer." },
      { speaker: NAME, text: 'Bulbasaur, the Grass type: steady and patient, and tougher than it looks. Charmander, the Fire type: quick and fierce, but fragile. Squirtle, the Water type: bouncy, sturdy and hard to knock down.' },
      { speaker: NAME, text: 'Which one will walk with you?', choices: ['Bulbasaur (Grass)', 'Charmander (Fire)', 'Squirtle (Water)'] },
    ];
  }

  starterChosenLines(starterName: string): DialogueLine[] {
    return [
      { speaker: NAME, text: `${starterName}! I thought so. It hasn't taken its eyes off you since you walked up.` },
      { speaker: NAME, text: 'One more thing. Every battle in Sijord is a double battle: two Pokemon a side, all at once. One partner is not enough.' },
      { speaker: NAME, text: "My Growlithe had a litter this spring, and this pup keeps herding everyone towards you. Take her along. She'll fight beside your new partner." },
      { speaker: '', text: `You received ${starterName} and Growlithe!` },
      { speaker: NAME, text: 'Bring them back to me whenever they get hurt, and I will patch them up. Wild Pokemon out on the meadow do not go easy on beginners.' },
    ];
  }

  /** Balls handed over with the starter, or on the first visit after this update for older saves. */
  ballGiftLines(count: number): DialogueLine[] {
    return [
      { speaker: NAME, text: "Here, you'll want these. Wear a wild Pokemon down first, and don't bother throwing at one that's fresh and far above your team's level." },
      { speaker: '', text: `You received ${count} Poke Balls!` },
      { speaker: NAME, text: "That's all I can spare. Once you have a workbench you can make your own." },
    ];
  }

  /** The player ran out of balls and came back. */
  ballRefillLines(count: number): DialogueLine[] {
    return [
      { speaker: NAME, text: 'Out of Poke Balls already? I have a few left over from the last batch. Make them count.' },
      { speaker: '', text: `You received ${count} Poke Balls.` },
    ];
  }

  /** Treats (DESIGN §5.3), the first time she sees the player after they set out. */
  treatGiftLines(count: number): DialogueLine[] {
    return [
      { speaker: NAME, text: "One more thing. I baked these honey Treats. Toss one in front of an angry Pokemon and it will usually stop to eat instead of flattening you." },
      { speaker: '', text: `You received ${count} Treats!` },
      { speaker: NAME, text: "A calm one will happily eat one too, and it won't look up while it does. Hold your aim key and use the wheel to pick a Treat." },
    ];
  }

  /** Out of Treats and back at the lab. */
  treatRefillLines(count: number): DialogueLine[] {
    return [
      { speaker: NAME, text: 'All gone? I suppose that means they worked. Here, the last of this batch.' },
      { speaker: '', text: `You received ${count} Treats.` },
    ];
  }

  /** Rubbings of Lysfolk tablets: a Great Ball for every few. */
  tabletLines(balls: number): DialogueLine[] {
    return [
      { speaker: NAME, text: "You've been reading Lysfolk tablets out in the vale? Let me see your rubbings... These are older than anything in Bramblewick." },
      { speaker: NAME, text: "This is exactly the kind of thing I can't get out to see myself any more. Here, it's the least I can do." },
      { speaker: '', text: balls > 1 ? `You received ${balls} Great Balls!` : 'You received a Great Ball!' },
      { speaker: NAME, text: 'I can only spare one for every three tablets you bring me, mind. Great Balls are not cheap.' },
    ];
  }

  /** The first time the player has found a page of her old field notes. */
  fieldNoteLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: "Wait, is that my handwriting? Those are my old survey notes! I lost a whole satchel of them in a storm years ago." },
      { speaker: NAME, text: 'Keep them. If you find any more pages, read them. I was a good deal more careful out there than I am now.' },
    ];
  }

  healLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: 'Your team looks worn out. Let me take a look at them.' },
      { speaker: '', text: 'Professor Hazel healed your Pokemon.' },
    ];
  }

  repeatLines(): DialogueLine[] {
    return [{ speaker: NAME, text: 'The north gate leads to Route 1. Wild Pokemon there live in herds, and they always fight in pairs. Mind your stamina, and come back here if your team gets hurt.' }];
  }

  blackoutLines(): DialogueLine[] {
    return [
      { speaker: NAME, text: 'There you are! Your Pokemon gave everything they had out there.' },
      { speaker: NAME, text: 'Rest is part of training too. They are healed now. Pick your fights a little more carefully next time.' },
    ];
  }

  dispose(): void {
    this.avatar.dispose();
  }
}
