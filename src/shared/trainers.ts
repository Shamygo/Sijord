import { createCreature } from './battle/creature';
import type { AiKind } from './battle/engine';
import { Rng } from './battle/rng';
import type { Creature } from './battle/types';
import { trainerPrize } from './economy';
import type { Appearance } from './types';

/**
 * Roaming trainers (DESIGN §12.3: 4-6 per km², "doubles specialists with themed teams and
 * banter"). Each walks a short beat along a road or footpath. One who spots you walks up and
 * challenges you, Pokémon style; sneak past behind their back and you can skip the fight. Beat
 * one for prize money and trainer XP the first time, and talk to them again on a later day for
 * a rematch at a smaller prize.
 */
export interface TrainerMon {
  species: string;
  level: number;
  /** Its moves, picked for the trainer's doubles plan (else the species' latest four). */
  moves?: string[];
  item?: string;
  nickname?: string;
}

export interface RoamingTrainerDef {
  id: string;
  /** "Bug Catcher" */
  title: string;
  name: string;
  /** Where they walk, back and forth (world metres, two or more points). */
  path: [number, number][];
  team: TrainerMon[];
  ai: AiKind;
  look: Appearance;
  lines: {
    /** When they challenge you. */
    challenge: string[];
    /** When you beat them. */
    beaten: string[];
    /** When they beat you. */
    won: string[];
    /** Talking to them after you've beaten them today. */
    after: string;
    /** Talking to them on a later day: they ask for a rematch. */
    rematch: string;
  };
}

const look = (skinTone: string, hairColor: string, hairStyle: number, jacketColor: string, pantsColor: string, build: number): Appearance =>
  ({ trainerModel: 'custom', skinTone, hairColor, hairStyle, jacketColor, pantsColor, build });

/** Hearthmeadow's trainers, nearest Bramblewick first (their levels follow the wild zones). */
export const ROAMING_TRAINERS: readonly RoamingTrainerDef[] = [
  {
    id: 'tobin', title: 'Bug Catcher', name: 'Tobin',
    path: [[1.5, -232], [6.5, -200]],
    team: [
      { species: 'weedle', level: 6, moves: ['string-shot', 'poison-sting'] },
      { species: 'dewmite', level: 6, moves: ['string-shot', 'tackle'] },
      { species: 'kakuna', level: 7, moves: ['harden', 'poison-sting'] },
    ],
    ai: 't1',
    look: look('#e8b98f', '#5a3a22', 1, '#7fa63a', '#6b5a3e', 0),
    lines: {
      challenge: ['Hey! You just came out of Bramblewick, right? Then you have to battle me. Route rules!', "Bugs are the toughest Pokémon there are. Small, quick, and they never complain."],
      beaten: ["Aww, my bugs got squashed...", "They'll grow up big and scary one day. You'll see."],
      won: ["Ha! String Shot slows everything down, and then my bugs pick it apart.", 'Go and rest up. And respect the bugs!'],
      after: "I'm going to find a bug that evolves into something huge. Then I'll be the one winning.",
      rematch: "You're back! My bugs have been training on the leaves all week. Battle again?",
    },
  },
  {
    id: 'marit', title: 'Picnicker', name: 'Marit',
    path: [[88, -243], [116, -255]],
    team: [
      { species: 'cloveret', level: 7, moves: ['sing', 'disarming-voice', 'pound'] },
      { species: 'nibblet', level: 6, moves: ['quick-attack', 'tackle', 'tail-whip'] },
    ],
    ai: 't1',
    look: look('#f1c27d', '#c8662e', 3, '#e58fa6', '#f3ead6', 0),
    lines: {
      challenge: ["Oh! A visitor on the way to the campsite. I was just packing a picnic.", "Let's work up an appetite first. A battle!"],
      beaten: ['Goodness, you work fast.', 'Cook what you gather out here: berries on a campfire keep you going much longer than raw ones.'],
      won: ['Clefairy sings, and then Rattata nibbles. Works every time.', 'Have something to eat before you go.'],
      after: 'A full belly and a rested team. That\'s the whole secret to the meadow.',
      rematch: 'Hello again! I brought extra snacks this time. Shall we battle before lunch?',
    },
  },
  {
    id: 'oskar', title: 'Angler', name: 'Oskar',
    path: [[-76, -260.5], [-100, -268.7]],
    team: [
      { species: 'poliwag', level: 6, moves: ['hypnosis', 'water-gun', 'pound'] },
      { species: 'psyduck', level: 6, moves: ['water-gun', 'scratch', 'tail-whip'] },
    ],
    ai: 't1',
    look: look('#c99a6e', '#8a8a8a', 0, '#3f6e8c', '#4b4a3a', 1),
    lines: {
      challenge: ['Shh! You\'ll scare the fish.', "Well, they're gone now anyway. You owe me a battle."],
      beaten: ["Slipped right off the hook, that one.", 'Plenty more in the lake.'],
      won: ['Poliwag puts them to sleep, Psyduck does the rest. Patience, like fishing.', 'Now off you go, and quietly.'],
      after: "The big ones only bite at dawn. Don't tell anyone I told you.",
      rematch: 'Nothing biting today. Fancy a battle to pass the time?',
    },
  },
  {
    id: 'sigrun', title: 'Bird Keeper', name: 'Sigrun',
    path: [[-9, -96], [-15.6, -62]],
    team: [
      { species: 'finchlet', level: 10, moves: ['sand-attack', 'gust', 'tackle'] },
      { species: 'spearow', level: 10, moves: ['leer', 'peck', 'pursuit'] },
      { species: 'spearow', level: 11, moves: ['fury-attack', 'peck', 'pursuit'] },
    ],
    ai: 't1',
    look: look('#f3d3b5', '#d9d9e0', 2, '#4a7fb8', '#2f3346', 0),
    lines: {
      challenge: ['The wind on Route 1 is perfect today. My birds want to fly.', "Let's see if your team can hit what it can't see!"],
      beaten: ['Grounded...', "You kept your eyes open through all that sand. I'm impressed."],
      won: ['Sand in the eyes, then a peck from above. Birds fight smart.', 'Come back when you can keep up.'],
      after: 'Watch the sky past the ruins. Bigger birds nest up on the mesas.',
      rematch: 'The wind changed. My birds are restless. Another round?',
    },
  },
  {
    id: 'ylva', title: 'Herder', name: 'Ylva',
    path: [[-45, -37.1], [-75, -33.7]],
    team: [
      { species: 'hjordpup', level: 10, moves: ['howl', 'bite', 'ember', 'leer'] },
      { species: 'nibblet', level: 10, moves: ['quick-attack', 'bite', 'focus-energy'] },
    ],
    ai: 't1',
    look: look('#e0ac69', '#2b1b12', 3, '#8c3b2e', '#4e5b3a', 1),
    lines: {
      challenge: ["Steady there. You're walking right through my herd's grazing.", "Growlithe! Round them up. We've got a challenger."],
      beaten: ['Hah. Even my best dog can\'t herd you.', 'Fair win. Mind the herd on your way past.'],
      won: ['One howl and the whole pack fights twice as hard. That\'s herding.', 'Rest your team before you wander any further.'],
      after: 'Growlithe howls at strangers, then decides if they\'re friends. It likes you now.',
      rematch: "The herd's settled, so I've got time. Want a rematch?",
    },
  },
  {
    id: 'haldor', title: 'Black Belt', name: 'Haldor',
    path: [[-150, -24.5], [-185, -20]],
    team: [
      { species: 'mankey', level: 11, moves: ['focus-energy', 'fury-swipes', 'leer'], nickname: 'Tor' },
      { species: 'mankey', level: 11, moves: ['focus-energy', 'fury-swipes', 'scratch'], nickname: 'Bjorn' },
    ],
    ai: 't1',
    look: look('#b07a4f', '#111111', 0, '#f2f2f2', '#f2f2f2', 1),
    lines: {
      challenge: ['HYAH! I train by the river every day with my two brothers in arms!', 'Tor! Bjorn! Focus! Today we test ourselves against a traveller!'],
      beaten: ['...We have much to learn. Thank you, traveller!', 'Tor, Bjorn: two hundred laps of the bridge. Now.'],
      won: ['Focus first, then strike, again and again! Discipline wins!', 'Train harder, traveller. The road east is not kind.'],
      after: 'The bridge is our dojo. The river is our teacher. Also, it is very cold.',
      rematch: 'Traveller! Tor and Bjorn have trained day and night for this. FIGHT US!',
    },
  },
  {
    id: 'liv', title: 'Ace Trainer', name: 'Liv',
    path: [[8, 54], [34, 100]],
    team: [
      { species: 'eevee', level: 12, moves: ['helping-hand', 'quick-attack', 'sand-attack', 'covet'], item: 'oran-berry' },
      { species: 'pikachu', level: 13, moves: ['thunder-wave', 'nuzzle', 'quick-attack', 'thunder-shock'] },
      { species: 'vulpix', level: 12, moves: ['ember', 'quick-attack', 'tail-whip'] },
    ],
    ai: 't1',
    look: look('#f1c27d', '#e6c35c', 2, '#202a44', '#b8323a', 0),
    lines: {
      challenge: ["You've made it this far north? Then you've beaten a few trainers already.", "Doubles are about partners, not just strong Pokémon. Let me show you."],
      beaten: ['...You read my combos. Not many people do.', "Good. Then you're ready for what's past the mesas."],
      won: ['Paralyse the fast one, help the strong one. Two Pokémon, one plan.', "Come back with a plan of your own."],
      after: "Pikachu's Thunder Wave plus Eevee's Helping Hand. Steal it if you like, I don't mind.",
      rematch: "I've changed my plan since last time. Want to see if you can read it?",
    },
  },
  {
    id: 'brann', title: 'Hiker', name: 'Brann',
    path: [[150, 202], [178, 214]],
    team: [
      { species: 'geodude', level: 14, moves: ['bulldoze', 'defense-curl', 'rock-polish', 'tackle'] },
      { species: 'zubat', level: 13, moves: ['supersonic', 'astonish', 'absorb'] },
    ],
    ai: 't1',
    look: look('#c68642', '#6b4a2a', 1, '#c27a2c', '#5a4632', 1),
    lines: {
      challenge: ["Ho there! Up from the meadow, are you? Rocks don't move, but my Geodude does!", "Let's see your team keep its feet. Hah!"],
      beaten: ['Well, I\'ll be. Knocked flat like a cairn in a gale!', 'Here, you earned it. Mind the cliffs up past the ruins.'],
      won: ['Bulldoze shakes the whole ground, and my Zubat just flies over it! Hah!', "Back down the hill with you. Rest up."],
      after: 'Every stone on these mesas has a story. Most of them are about falling over.',
      rematch: 'Back for another shake-up? Hah! Let\'s go!',
    },
  },
];

/** A trainer by id, for ids that come off the wire (anything unknown is undefined). */
export function trainerById(id: unknown): RoamingTrainerDef | undefined {
  return typeof id === 'string' ? ROAMING_TRAINERS.find((t) => t.id === id) : undefined;
}

export const TRAINER_TUNING = {
  /** Walking pace on their beat (m/s), and seconds spent looking around at each end. */
  walk: 1.15,
  pause: 6,
  /** They spot a trainer this far ahead of them, within this half-angle (radians)... */
  sight: 13,
  cone: 1.05,
  /** ...or anyone right beside them, whichever way they face. */
  near: 3,
  /** After any trainer battle, seconds before another trainer will spot you. */
  grace: 20,
  /** Rematches: once a day (UTC), so both friends agree. */
  dayMs: 86_400_000,
};

export function trainerName(t: RoamingTrainerDef): string {
  return `${t.title} ${t.name}`;
}

/** The trainer's team for a battle. Their stats come from their id, so they're the same each time. */
export function trainerTeam(t: RoamingTrainerDef): Creature[] {
  const rng = new Rng(seedFrom(t.id));
  return t.team.map((m) => {
    const c = createCreature(m.species, m.level, rng, { moves: m.moves, item: m.item, nickname: m.nickname, ot: trainerName(t) });
    return c;
  });
}

/** Prize money for a win: the full prize the first time, a rematch prize after that. */
export function trainerReward(t: RoamingTrainerDef, rematch: boolean): number {
  return trainerPrize(Math.max(...t.team.map((m) => m.level)), rematch);
}

export function trainerDay(now: number): number {
  return Math.floor(now / TRAINER_TUNING.dayMs);
}

export type TrainerStanding = 'unbeaten' | 'beaten-today' | 'rematch';

/** `beaten` is the save's record: trainer id -> the day you last beat them. */
export function trainerStanding(beaten: unknown, id: string, day: number): TrainerStanding {
  const last = beaten && typeof beaten === 'object' ? (beaten as Record<string, unknown>)[id] : undefined;
  if (typeof last !== 'number') return 'unbeaten';
  return last === day ? 'beaten-today' : 'rematch';
}

/** How many of Hearthmeadow's trainers this save has beaten at least once. */
export function trainersBeaten(beaten: unknown): number {
  if (!beaten || typeof beaten !== 'object') return 0;
  return ROAMING_TRAINERS.filter((t) => typeof (beaten as Record<string, unknown>)[t.id] === 'number').length;
}

/**
 * Where a trainer is on their beat at a moment (seconds), from the clock alone, so both friends
 * see them in the same place. They walk to the far end, look around, walk back, look around.
 */
export function patrolAt(t: RoamingTrainerDef, seconds: number): { x: number; z: number; yaw: number; walking: boolean } {
  const pts = t.path;
  const legs: number[] = [];
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    legs.push(l);
    length += l;
  }
  const walkT = length / TRAINER_TUNING.walk, pause = TRAINER_TUNING.pause;
  const cycle = 2 * (walkT + pause);
  // Each trainer starts at their own point in the cycle.
  let u = (((seconds + (seedFrom(t.id) % 1000)) % cycle) + cycle) % cycle;
  let forward = true, walking = true, s: number;
  if (u < walkT) s = u * TRAINER_TUNING.walk;
  else if ((u -= walkT) < pause) { s = length; walking = false; }
  else if ((u -= pause) < walkT) { s = length - u * TRAINER_TUNING.walk; forward = false; }
  else { u -= walkT; s = 0; walking = false; forward = false; }
  // The point `s` metres along the path, and the way they're facing.
  let i = 0;
  while (i < legs.length - 1 && s > legs[i]) s -= legs[i++];
  const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
  const k = legs[i] > 0 ? Math.min(1, s / legs[i]) : 0;
  let yaw = Math.atan2(bx - ax, bz - az) + (forward ? 0 : Math.PI);
  if (!walking) {
    // Looking around: back the way they came, then out to either side.
    const look = Math.sin((u / pause) * Math.PI * 2) * 1.2;
    yaw = yaw + Math.PI + look;
  }
  return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, yaw, walking };
}

/** Whether a trainer at (x, z) facing `yaw` sees someone at (px, pz). */
export function trainerSees(x: number, z: number, yaw: number, px: number, pz: number): boolean {
  const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz);
  if (d <= TRAINER_TUNING.near) return true;
  if (d > TRAINER_TUNING.sight) return false;
  let off = Math.atan2(dx, dz) - yaw;
  off = Math.atan2(Math.sin(off), Math.cos(off));
  return Math.abs(off) <= TRAINER_TUNING.cone;
}

function seedFrom(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
