import type { MoveData } from '../battle/types';

type Def = Omit<MoveData, 'id' | 'priority' | 'target'> & Partial<Pick<MoveData, 'priority' | 'target'>>;

/**
 * Every move in the game so far (about 70). Numbers follow the mainline games so competitive
 * knowledge carries over. Targets are in double-battle terms (see MoveTarget).
 */
const DEFS: Record<string, Def> = {
  // ---- Normal ----
  'tackle': { name: 'Tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, contact: true, description: 'A full-body charge.' },
  'scratch': { name: 'Scratch', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, contact: true, description: 'Rakes the target with sharp claws.' },
  'quick-attack': { name: 'Quick Attack', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true, description: 'A lightning-fast dash. Almost always strikes first.' },
  'headbutt': { name: 'Headbutt', type: 'normal', category: 'physical', power: 70, accuracy: 100, pp: 15, contact: true, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'body-slam': { name: 'Body Slam', type: 'normal', category: 'physical', power: 85, accuracy: 100, pp: 15, contact: true, secondary: { chance: 30, status: 'par' }, description: '30% chance to paralyse.' },
  'take-down': { name: 'Take Down', type: 'normal', category: 'physical', power: 90, accuracy: 85, pp: 20, contact: true, recoil: 1 / 4, description: 'A reckless charge. The user takes 1/4 of the damage dealt.' },
  'double-edge': { name: 'Double-Edge', type: 'normal', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, recoil: 1 / 3, description: 'A life-risking tackle. The user takes 1/3 of the damage dealt.' },
  'fake-out': { name: 'Fake Out', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 10, priority: 3, contact: true, special: 'fake-out', secondary: { chance: 100, flinch: true }, description: 'Only works on the first turn out. Always makes the target flinch.' },
  'swift': { name: 'Swift', type: 'normal', category: 'special', power: 60, accuracy: true, pp: 20, target: 'all-adjacent-foes', description: 'Star-shaped rays hit both foes. Never misses.' },
  'hyper-voice': { name: 'Hyper Voice', type: 'normal', category: 'special', power: 90, accuracy: 100, pp: 10, target: 'all-adjacent-foes', sound: true, description: 'A loud, damaging shout that hits both foes.' },
  'growl': { name: 'Growl', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 40, target: 'all-adjacent-foes', sound: true, boosts: { atk: -1 }, description: "Lowers both foes' Attack." },
  'tail-whip': { name: 'Tail Whip', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 30, target: 'all-adjacent-foes', boosts: { def: -1 }, description: "Lowers both foes' Defense." },
  'leer': { name: 'Leer', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 30, target: 'all-adjacent-foes', boosts: { def: -1 }, description: "An intimidating stare that lowers both foes' Defense." },
  'work-up': { name: 'Work Up', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 30, target: 'self', selfBoosts: { atk: 1, spa: 1 }, description: 'Raises the user\'s Attack and Sp. Atk.' },
  'protect': { name: 'Protect', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 10, priority: 4, target: 'self', special: 'protect', description: 'Blocks every attack this turn. Likely to fail if used twice in a row.' },
  'helping-hand': { name: 'Helping Hand', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 20, priority: 5, target: 'ally', special: 'helping-hand', description: "Boosts the ally's move power by half this turn." },
  'follow-me': { name: 'Follow Me', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 20, priority: 2, target: 'self', special: 'follow-me', description: 'Draws every foe\'s single-target attacks to the user this turn.' },
  'tailwind': { name: 'Tailwind', type: 'flying', category: 'status', power: 0, accuracy: true, pp: 15, target: 'ally-side', special: 'tailwind', description: "Doubles your side's Speed for 4 turns." },
  'sand-attack': { name: 'Sand Attack', type: 'ground', category: 'status', power: 0, accuracy: 100, pp: 15, boosts: { accuracy: -1 }, description: "Kicks sand in the target's eyes, lowering accuracy." },
  // ---- Grass ----
  'leafage': { name: 'Leafage', type: 'grass', category: 'physical', power: 40, accuracy: 100, pp: 40, description: 'Strikes with a flurry of leaves.' },
  'vine-whip': { name: 'Vine Whip', type: 'grass', category: 'physical', power: 45, accuracy: 100, pp: 25, contact: true, description: 'Whips the target with slender vines.' },
  'absorb': { name: 'Absorb', type: 'grass', category: 'special', power: 20, accuracy: 100, pp: 25, drain: 0.5, description: 'Restores half the damage dealt.' },
  'mega-drain': { name: 'Mega Drain', type: 'grass', category: 'special', power: 40, accuracy: 100, pp: 15, drain: 0.5, description: 'Restores half the damage dealt.' },
  'giga-drain': { name: 'Giga Drain', type: 'grass', category: 'special', power: 75, accuracy: 100, pp: 10, drain: 0.5, description: 'Restores half the damage dealt.' },
  'magical-leaf': { name: 'Magical Leaf', type: 'grass', category: 'special', power: 60, accuracy: true, pp: 20, description: 'Strange leaves that never miss.' },
  'razor-leaf': { name: 'Razor Leaf', type: 'grass', category: 'physical', power: 55, accuracy: 95, pp: 25, target: 'all-adjacent-foes', critStage: 1, description: 'Sharp leaves hit both foes. High critical-hit ratio.' },
  'seed-bomb': { name: 'Seed Bomb', type: 'grass', category: 'physical', power: 80, accuracy: 100, pp: 15, description: 'Slams a barrage of hard seeds into the target.' },
  'horn-leech': { name: 'Horn Leech', type: 'grass', category: 'physical', power: 75, accuracy: 100, pp: 10, contact: true, drain: 0.5, description: 'Drains energy with its horns. Restores half the damage dealt.' },
  'wood-hammer': { name: 'Wood Hammer', type: 'grass', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, recoil: 1 / 3, description: 'Slams its rugged body down. The user takes 1/3 of the damage dealt.' },
  'leech-seed': { name: 'Leech Seed', type: 'grass', category: 'status', power: 0, accuracy: 90, pp: 10, special: 'leech-seed', description: 'Plants a seed that drains the target every turn.' },
  'sleep-powder': { name: 'Sleep Powder', type: 'grass', category: 'status', power: 0, accuracy: 75, pp: 15, status: 'slp', powder: true, description: 'Puts the target to sleep.' },
  'stun-spore': { name: 'Stun Spore', type: 'grass', category: 'status', power: 0, accuracy: 75, pp: 30, status: 'par', powder: true, description: 'Paralyses the target.' },
  // ---- Fire ----
  'ember': { name: 'Ember', type: 'fire', category: 'special', power: 40, accuracy: 100, pp: 25, secondary: { chance: 10, status: 'brn' }, description: '10% chance to burn.' },
  'flame-charge': { name: 'Flame Charge', type: 'fire', category: 'physical', power: 50, accuracy: 100, pp: 20, contact: true, secondary: { chance: 100, self: { spe: 1 } }, description: 'Cloaks itself in flame and attacks, raising its Speed.' },
  'fire-fang': { name: 'Fire Fang', type: 'fire', category: 'physical', power: 65, accuracy: 95, pp: 15, contact: true, secondary: { chance: 10, status: 'brn' }, description: '10% chance to burn.' },
  'flamethrower': { name: 'Flamethrower', type: 'fire', category: 'special', power: 90, accuracy: 100, pp: 15, secondary: { chance: 10, status: 'brn' }, description: '10% chance to burn.' },
  'heat-wave': { name: 'Heat Wave', type: 'fire', category: 'special', power: 95, accuracy: 90, pp: 10, target: 'all-adjacent-foes', secondary: { chance: 10, status: 'brn' }, description: 'A hot gust that hits both foes. 10% chance to burn.' },
  'flare-blitz': { name: 'Flare Blitz', type: 'fire', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, recoil: 1 / 3, secondary: { chance: 10, status: 'brn' }, description: 'A blazing charge. The user takes 1/3 of the damage dealt.' },
  'will-o-wisp': { name: 'Will-O-Wisp', type: 'fire', category: 'status', power: 0, accuracy: 85, pp: 15, status: 'brn', description: 'A sinister flame that burns the target.' },
  // ---- Water ----
  'water-gun': { name: 'Water Gun', type: 'water', category: 'special', power: 40, accuracy: 100, pp: 25, description: 'Squirts water at the target.' },
  'aqua-jet': { name: 'Aqua Jet', type: 'water', category: 'physical', power: 40, accuracy: 100, pp: 20, priority: 1, contact: true, description: 'Lunges at incredible speed. Almost always strikes first.' },
  'bubble-beam': { name: 'Bubble Beam', type: 'water', category: 'special', power: 65, accuracy: 100, pp: 20, secondary: { chance: 10, boosts: { spe: -1 } }, description: '10% chance to lower Speed.' },
  'water-pulse': { name: 'Water Pulse', type: 'water', category: 'special', power: 60, accuracy: 100, pp: 20, secondary: { chance: 20, confuse: true }, description: '20% chance to confuse.' },
  'aqua-tail': { name: 'Aqua Tail', type: 'water', category: 'physical', power: 90, accuracy: 90, pp: 10, contact: true, description: 'Swings its tail like a crashing wave.' },
  'surf': { name: 'Surf', type: 'water', category: 'special', power: 90, accuracy: 100, pp: 15, target: 'all-adjacent', description: 'A huge wave that hits everyone else on the field, ally included.' },
  'muddy-water': { name: 'Muddy Water', type: 'water', category: 'special', power: 90, accuracy: 85, pp: 10, target: 'all-adjacent-foes', secondary: { chance: 30, boosts: { accuracy: -1 } }, description: 'Hits both foes. 30% chance to lower accuracy.' },
  // ---- Flying ----
  'peck': { name: 'Peck', type: 'flying', category: 'physical', power: 35, accuracy: 100, pp: 35, contact: true, description: 'Jabs with a pointed beak.' },
  'gust': { name: 'Gust', type: 'flying', category: 'special', power: 40, accuracy: 100, pp: 35, description: 'Whips up a strong gust of wind.' },
  'wing-attack': { name: 'Wing Attack', type: 'flying', category: 'physical', power: 60, accuracy: 100, pp: 35, contact: true, description: 'Strikes with wide-spread wings.' },
  'aerial-ace': { name: 'Aerial Ace', type: 'flying', category: 'physical', power: 60, accuracy: true, pp: 20, contact: true, description: 'An extremely fast attack that never misses.' },
  'air-slash': { name: 'Air Slash', type: 'flying', category: 'special', power: 75, accuracy: 95, pp: 15, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'brave-bird': { name: 'Brave Bird', type: 'flying', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, recoil: 1 / 3, description: 'A low dive. The user takes 1/3 of the damage dealt.' },
  'roost': { name: 'Roost', type: 'flying', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', heal: 0.5, description: 'Lands and rests, restoring half its max HP.' },
  // ---- Bug ----
  'string-shot': { name: 'String Shot', type: 'bug', category: 'status', power: 0, accuracy: 95, pp: 40, target: 'all-adjacent-foes', boosts: { spe: -2 }, description: "Sticky silk sharply lowers both foes' Speed." },
  'bug-bite': { name: 'Bug Bite', type: 'bug', category: 'physical', power: 60, accuracy: 100, pp: 20, contact: true, description: 'Bites the target.' },
  'struggle-bug': { name: 'Struggle Bug', type: 'bug', category: 'special', power: 50, accuracy: 100, pp: 20, target: 'all-adjacent-foes', secondary: { chance: 100, boosts: { spa: -1 } }, description: "Hits both foes and lowers their Sp. Atk." },
  'bug-buzz': { name: 'Bug Buzz', type: 'bug', category: 'special', power: 90, accuracy: 100, pp: 10, sound: true, secondary: { chance: 10, boosts: { spd: -1 } }, description: '10% chance to lower Sp. Def.' },
  'harden': { name: 'Harden', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 30, target: 'self', selfBoosts: { def: 1 }, description: 'Stiffens its body, raising Defense.' },
  'quiver-dance': { name: 'Quiver Dance', type: 'bug', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { spa: 1, spd: 1, spe: 1 }, description: 'A mystic dance that raises Sp. Atk, Sp. Def and Speed.' },
  // ---- Psychic ----
  'confusion': { name: 'Confusion', type: 'psychic', category: 'special', power: 50, accuracy: 100, pp: 25, secondary: { chance: 10, confuse: true }, description: '10% chance to confuse.' },
  'psybeam': { name: 'Psybeam', type: 'psychic', category: 'special', power: 65, accuracy: 100, pp: 20, secondary: { chance: 10, confuse: true }, description: '10% chance to confuse.' },
  'psychic': { name: 'Psychic', type: 'psychic', category: 'special', power: 90, accuracy: 100, pp: 10, secondary: { chance: 10, boosts: { spd: -1 } }, description: '10% chance to lower Sp. Def.' },
  // ---- Ground / Rock ----
  'mud-slap': { name: 'Mud-Slap', type: 'ground', category: 'special', power: 20, accuracy: 100, pp: 10, secondary: { chance: 100, boosts: { accuracy: -1 } }, description: 'Hurls mud, lowering accuracy.' },
  'bulldoze': { name: 'Bulldoze', type: 'ground', category: 'physical', power: 60, accuracy: 100, pp: 20, target: 'all-adjacent', secondary: { chance: 100, boosts: { spe: -1 } }, description: 'Stomps the ground, hitting everyone else (ally too) and lowering Speed.' },
  'dig-in': { name: 'Dig In', type: 'ground', category: 'physical', power: 80, accuracy: 100, pp: 10, contact: true, description: 'Burrows under the target and bursts up beneath it.' },
  'rock-throw': { name: 'Rock Throw', type: 'rock', category: 'physical', power: 50, accuracy: 90, pp: 15, description: 'Throws a small rock.' },
  'rock-tomb': { name: 'Rock Tomb', type: 'rock', category: 'physical', power: 60, accuracy: 95, pp: 15, secondary: { chance: 100, boosts: { spe: -1 } }, description: 'Boulders that lower the target\'s Speed.' },
  // ---- Fighting ----
  'double-kick': { name: 'Double Kick', type: 'fighting', category: 'physical', power: 30, accuracy: 100, pp: 30, contact: true, multihit: [2, 2], description: 'Kicks twice in a row.' },
  'rock-smash': { name: 'Rock Smash', type: 'fighting', category: 'physical', power: 40, accuracy: 100, pp: 15, contact: true, secondary: { chance: 50, boosts: { def: -1 } }, description: '50% chance to lower Defense.' },
  'brick-break': { name: 'Brick Break', type: 'fighting', category: 'physical', power: 75, accuracy: 100, pp: 15, contact: true, description: 'A karate chop.' },
  'close-combat': { name: 'Close Combat', type: 'fighting', category: 'physical', power: 120, accuracy: 100, pp: 5, contact: true, selfBoosts: { def: -1, spd: -1 }, description: 'All-out fighting. Lowers the user\'s Defense and Sp. Def.' },
  'bulk-up': { name: 'Bulk Up', type: 'fighting', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { atk: 1, def: 1 }, description: 'Tenses its muscles, raising Attack and Defense.' },
  // ---- Fairy ----
  'fairy-wind': { name: 'Fairy Wind', type: 'fairy', category: 'special', power: 40, accuracy: 100, pp: 30, description: 'Stirs up a fairy wind.' },
  'draining-kiss': { name: 'Draining Kiss', type: 'fairy', category: 'special', power: 50, accuracy: 100, pp: 10, contact: true, drain: 0.75, description: 'Restores 3/4 of the damage dealt.' },
  'moonblast': { name: 'Moonblast', type: 'fairy', category: 'special', power: 95, accuracy: 100, pp: 15, secondary: { chance: 30, boosts: { spa: -1 } }, description: '30% chance to lower Sp. Atk.' },
  'baby-doll-eyes': { name: 'Baby-Doll Eyes', type: 'fairy', category: 'status', power: 0, accuracy: 100, pp: 30, priority: 1, boosts: { atk: -1 }, description: 'Lowers Attack. Almost always goes first.' },
  'charm': { name: 'Charm', type: 'fairy', category: 'status', power: 0, accuracy: 100, pp: 20, boosts: { atk: -2 }, description: 'Sharply lowers Attack.' },
  // ---- Steel ----
  'metal-claw': { name: 'Metal Claw', type: 'steel', category: 'physical', power: 50, accuracy: 95, pp: 35, contact: true, secondary: { chance: 10, self: { atk: 1 } }, description: '10% chance to raise the user\'s Attack.' },
  'iron-head': { name: 'Iron Head', type: 'steel', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'iron-defense': { name: 'Iron Defense', type: 'steel', category: 'status', power: 0, accuracy: true, pp: 15, target: 'self', selfBoosts: { def: 2 }, description: 'Sharply raises Defense.' },
  // ---- Dark ----
  'bite': { name: 'Bite', type: 'dark', category: 'physical', power: 60, accuracy: 100, pp: 25, contact: true, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'crunch': { name: 'Crunch', type: 'dark', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, secondary: { chance: 20, boosts: { def: -1 } }, description: '20% chance to lower Defense.' },
  'snarl': { name: 'Snarl', type: 'dark', category: 'special', power: 55, accuracy: 95, pp: 15, target: 'all-adjacent-foes', sound: true, secondary: { chance: 100, boosts: { spa: -1 } }, description: "Hits both foes and lowers their Sp. Atk." },
  // ---- Electric / Ice / Poison / Ghost / Dragon ----
  'thunder-shock': { name: 'Thunder Shock', type: 'electric', category: 'special', power: 40, accuracy: 100, pp: 30, secondary: { chance: 10, status: 'par' }, description: '10% chance to paralyse.' },
  'thunder-wave': { name: 'Thunder Wave', type: 'electric', category: 'status', power: 0, accuracy: 90, pp: 20, status: 'par', description: 'Paralyses the target.' },
  'ice-shard': { name: 'Ice Shard', type: 'ice', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, description: 'Flings ice chunks. Almost always strikes first.' },
  'icy-wind': { name: 'Icy Wind', type: 'ice', category: 'special', power: 55, accuracy: 95, pp: 15, target: 'all-adjacent-foes', secondary: { chance: 100, boosts: { spe: -1 } }, description: "Hits both foes and lowers their Speed." },
  'poison-powder': { name: 'Poison Powder', type: 'poison', category: 'status', power: 0, accuracy: 75, pp: 35, status: 'psn', powder: true, description: 'Poisons the target.' },
  'poison-sting': { name: 'Poison Sting', type: 'poison', category: 'physical', power: 15, accuracy: 100, pp: 35, secondary: { chance: 30, status: 'psn' }, description: '30% chance to poison.' },
  'astonish': { name: 'Astonish', type: 'ghost', category: 'physical', power: 30, accuracy: 100, pp: 15, contact: true, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'twister': { name: 'Twister', type: 'dragon', category: 'special', power: 40, accuracy: 100, pp: 20, target: 'all-adjacent-foes', secondary: { chance: 20, flinch: true }, description: 'A vicious twister that hits both foes.' },
};

export const MOVES: Record<string, MoveData> = Object.fromEntries(
  Object.entries(DEFS).map(([id, d]) => [id, { id, priority: 0, target: 'normal', ...d } as MoveData]),
);

/** Used when a creature has no PP left in any move. */
export const STRUGGLE: MoveData = {
  id: 'struggle', name: 'Struggle', type: 'normal', category: 'physical', power: 50, accuracy: true, pp: 1,
  priority: 0, target: 'adjacent-foe', contact: true, description: 'A desperate attack used when out of PP.',
};

export function moveData(id: string): MoveData {
  return MOVES[id] ?? (id === 'struggle' ? STRUGGLE : MOVES['tackle']);
}
