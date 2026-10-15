import { createCreature } from './battle/creature';
import type { AiKind } from './battle/engine';
import { Rng } from './battle/rng';
import { LEVEL_CAPS } from './battle/stats';
import type { Creature } from './battle/types';
import { bossMoves, spread } from './gyms';
import type { Appearance } from './types';

/**
 * The Sijord League at Crownspire (DESIGN §2, §3.2, §10 Act IV): four Elite Four rooms and the
 * Champion's hall, open to trainers with all ten badges. Every member is a co-op boss battle
 * (each player registers three at or under the cap of 76 and sends one out; the member fields
 * two), the AI is the League's (T4), and their teams carry full competitive spreads, held items
 * and hand-picked moves. Aces sit at 72 to 75, the Champion's at 76.
 *
 * A run goes room by room with no healing in between, only what's in your bag. Lose to anyone and
 * the League staff walk you back to the entrance: the run starts again from the first room.
 * Beating the Champion makes you Champion: the level cap lifts to 100.
 */

export const LEAGUE = {
  badges: 10,
  /** League rules: the cap for ten badges (DESIGN §3.6). */
  cap: LEVEL_CAPS[10],
  /** The battle id League battles share, so a friend's game knows what they joined. */
  battleId: 'league',
};

export interface LeagueMember {
  id: string;
  name: string;
  /** "Elite Four" or "Champion". */
  title: string;
  /** What they specialise in, as the guard says it. */
  speciality: string;
  ace: number;
  /** Weakest first, the ace last: [species, held item, moves]. */
  team: [string, string, string[]][];
  look: Appearance;
  /** Before the battle, and after losing to you. */
  intro: string[];
  beaten: string;
  /** Room colours. */
  accent: string;
}

const look = (skinTone: string, hairColor: string, hairStyle: number, jacketColor: string, pantsColor: string, build: number): Appearance =>
  ({ trainerModel: 'custom', skinTone, hairColor, hairStyle, jacketColor, pantsColor, build });

export const ELITE_FOUR: LeagueMember[] = [
  {
    id: 'vigdis', name: 'Vigdis', title: 'Elite Four', speciality: 'Dark', ace: 72, accent: '#8a5ad8',
    look: look('#e8b48a', '#1a1420', 3, '#2a2234', '#1c1a22', 0),
    team: [
      ['persian', 'focus-sash', ['fake-out', 'night-slash', 'play-rough', 'hypnosis']],
      ['arbok', 'black-glasses', ['crunch', 'gunk-shot', 'earthquake', 'glare']],
      ['scyther', 'life-orb', ['night-slash', 'x-scissor', 'aerial-ace', 'swords-dance']],
      ['gengar', 'expert-belt', ['shadow-ball', 'sludge-bomb', 'sucker-punch', 'thunderbolt']],
      ['greninja', 'mystic-water', ['night-slash', 'hydro-pump', 'ice-beam', 'shadow-sneak']],
      ['kingambit', 'black-glasses', ['night-slash', 'iron-head', 'sucker-punch', 'swords-dance']],
    ],
    intro: [
      'Ten badges, and you still walked in here without a second look at the shadows. Bold.',
      'I am Vigdis of the Elite Four. My Pokémon fight the way the dark does: where you aren\'t looking.',
    ],
    beaten: 'Hm. You looked. Go on, then: the next door is open.',
  },
  {
    id: 'brynja', name: 'Brynja', title: 'Elite Four', speciality: 'Fighting', ace: 73, accent: '#d8603a',
    look: look('#a8714a', '#a33a2a', 0, '#7a2a1a', '#2f2f36', 1),
    team: [
      ['hitmonchan', 'muscle-band', ['mach-punch', 'drain-punch', 'ice-punch', 'thunder-punch']],
      ['hitmonlee', 'focus-sash', ['close-combat', 'blaze-kick', 'stone-edge', 'fake-out']],
      ['primeape', 'expert-belt', ['close-combat', 'stone-edge', 'throat-chop', 'bulk-up']],
      ['poliwrath', 'leftovers', ['drain-punch', 'waterfall', 'ice-punch', 'bulk-up']],
      ['annihilape', 'lum-berry', ['drain-punch', 'shadow-punch', 'stomping-tantrum', 'bulk-up']],
      ['machamp', 'life-orb', ['close-combat', 'stone-edge', 'knock-off', 'ice-punch']],
    ],
    intro: [
      'You made it past Vigdis. Good! I was hoping somebody would.',
      'I\'m Brynja. No tricks in this room, just the hardest hits in Sijord. Brace yourselves!',
    ],
    beaten: 'Ha! That\'s the best fight I\'ve had all year. Through you go.',
  },
  {
    id: 'solveig', name: 'Sólveig', title: 'Elite Four', speciality: 'Poison and Flying', ace: 74, accent: '#9ad84a',
    look: look('#f6d7b8', '#2f5f3a', 2, '#3a5a2a', '#2f2f36', 0),
    team: [
      ['venomoth', 'focus-sash', ['bug-buzz', 'sludge-bomb', 'psychic', 'quiver-dance']],
      ['golbat', 'leftovers', ['cross-poison', 'brave-bird', 'crunch', 'confuse-ray']],
      ['weezing', 'rocky-helmet', ['sludge-bomb', 'flamethrower', 'will-o-wisp', 'thunderbolt']],
      ['tentacruel', 'assault-vest', ['sludge-bomb', 'scald', 'ice-beam', 'giga-drain']],
      ['nidoking', 'life-orb', ['earth-power', 'sludge-wave', 'ice-beam', 'thunderbolt']],
      ['aerodactyl', 'focus-sash', ['stone-edge', 'brave-bird', 'earthquake', 'crunch']],
    ],
    intro: [
      'Most trainers come into my room holding their breath. Sensible.',
      'I\'m Sólveig. My Pokémon poison the ground and own the sky. Let\'s see how long you last.',
    ],
    beaten: 'You breathed it all in and kept going. The dragon\'s room is next. Mind his temper.',
  },
  {
    id: 'haakon', name: 'Haakon', title: 'Elite Four', speciality: 'Dragon', ace: 75, accent: '#4a7ad8',
    look: look('#c68c62', '#d9d9d9', 1, '#1e2a52', '#2f2f36', 1),
    team: [
      ['gyarados', 'lum-berry', ['waterfall', 'crunch', 'earthquake', 'dragon-dance']],
      ['dragonair', 'leftovers', ['dragon-rush', 'aqua-tail', 'extreme-speed', 'thunder-wave']],
      ['forgelynx', 'charcoal', ['flamethrower', 'air-slash', 'dragon-pulse', 'earthquake']],
      ['flygon', 'soft-sand', ['earthquake', 'dragon-claw', 'rock-slide', 'dragon-dance']],
      ['archaludon', 'assault-vest', ['flash-cannon', 'dragon-pulse', 'thunderbolt', 'iron-defense']],
      ['dragonite', 'dragon-fang', ['outrage', 'extreme-speed', 'earthquake', 'dragon-dance']],
    ],
    intro: [
      'Three of my colleagues down. You two must be something.',
      'I am Haakon, last of the Elite Four. Dragons answer to no one but those they respect. Earn it.',
    ],
    beaten: 'They respect you. So do I. The Champion is waiting at the top of the stair.',
  },
];

export const CHAMPION: LeagueMember = {
  id: 'ragna', name: 'Ragna Stormhild', title: 'Champion', speciality: 'Dragon and Ice', ace: 76, accent: '#7ad8f0',
  look: look('#f2c9a0', '#f4f4f4', 3, '#e8f2fb', '#3a4a6a', 0),
  team: [
    ['jynx', 'focus-sash', ['ice-beam', 'psychic', 'lovely-kiss', 'nasty-plot']],
    ['dewgong', 'leftovers', ['icicle-crash', 'waterfall', 'aqua-jet', 'rest']],
    ['cloyster', 'focus-sash', ['icicle-spear', 'rock-blast', 'ice-shard', 'shell-smash']],
    ['flygon', 'life-orb', ['earthquake', 'dragon-claw', 'stone-edge', 'dragon-dance']],
    ['lapras', 'assault-vest', ['surf', 'ice-beam', 'thunderbolt', 'dragon-pulse']],
    ['dragonite', 'lum-berry', ['outrage', 'ice-punch', 'extreme-speed', 'dragon-dance']],
  ],
  intro: [
    'So. Ten badges, four of the best trainers I know, and you\'re still standing. Together.',
    'I\'m Ragna Stormhild, Champion of Sijord. The storm on this summit never stops, and neither will I. Show me everything!',
  ],
  beaten: 'That\'s it. That\'s really it. Sijord has new Champions. Come: the hall keeps your names now.',
};

export const LEAGUE_MEMBERS: LeagueMember[] = [...ELITE_FOUR, CHAMPION];

/** The member whose ace is `ace` (each has their own), for a friend's game after a shared battle. */
export function memberByAce(ace: number): LeagueMember | undefined {
  return LEAGUE_MEMBERS.find((m) => m.ace === ace);
}

/** A member's team: the ace at their ace level, the rest one to four below, every move one the engine has. */
export function leagueTeam(m: LeagueMember, seed = 1): { creatures: Creature[]; ai: AiKind } {
  const rng = new Rng(seed);
  const owner = `league-${m.id}`;
  const n = m.team.length;
  const creatures = m.team.map(([id, item, moves], i) => {
    const isAce = i === n - 1;
    const level = isAce ? m.ace : m.ace - Math.min(4, n - 1 - i);
    return createCreature(id, level, rng, { ...spread(id, 3, true), moves, item, uid: `${owner}:${i}`, ot: owner });
  });
  return { creatures, ai: 't4' };
}

/**
 * The Echo at the League (DESIGN open question 1, option b): three of its own, two under the cap.
 * It helps; it doesn't carry you.
 */
export function leagueEcho(): Creature[] {
  const level = LEAGUE.cap - 2;
  const rng = new Rng(11);
  return ['persian', 'golduck', 'machamp'].map((sp, i) => createCreature(sp, level, rng, { ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, moves: bossMoves(sp, level), uid: `echo:league:${i}`, ot: 'Echo' }));
}

/** Saved League progress: how far the current run has gone, and the Hall of Fame. */
export interface LeagueRecord {
  /** Members beaten in this run (0 to 5): the rooms open as you go. */
  run: number;
  /** Times the Champion has been beaten. */
  wins?: number;
  /** Hall of Fame entries: the date and the team that won. */
  fame?: { at: number; team: string[] }[];
}
