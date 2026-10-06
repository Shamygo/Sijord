import type { MoveData } from '../battle/types';

type Def = Omit<MoveData, 'id' | 'priority' | 'target'> & Partial<Pick<MoveData, 'priority' | 'target'>>;

/**
 * Every move in the game so far. Numbers follow the latest mainline games so competitive
 * knowledge carries over. Targets are in double-battle terms (see MoveTarget). A few moves have
 * a side effect Sijord does not model yet (Covet's theft, Pay Day's coins); their descriptions
 * say what they do here. Moves no species learns any more (Leafage, Dig In, ...) stay listed so
 * creatures in old saves keep working moves.
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

  // ==== Added with the canonical Kanto species ====
  // ---- Normal ----
  'pound': { name: 'Pound', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, contact: true, description: 'Pounds the target with a forelimb or tail.' },
  'covet': { name: 'Covet', type: 'normal', category: 'physical', power: 60, accuracy: 100, pp: 25, contact: true, description: 'An endearing lunge. (Stealing the held item is not in Sijord yet.)' },
  'pay-day': { name: 'Pay Day', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 20, description: 'Pelts the target with coins. (No money is scattered in Sijord yet.)' },
  'horn-attack': { name: 'Horn Attack', type: 'normal', category: 'physical', power: 65, accuracy: 100, pp: 25, contact: true, description: 'Jabs with a sharp horn.' },
  'stomp': { name: 'Stomp', type: 'normal', category: 'physical', power: 65, accuracy: 100, pp: 20, contact: true, secondary: { chance: 30, flinch: true }, description: '30% chance to make the target flinch.' },
  'slash': { name: 'Slash', type: 'normal', category: 'physical', power: 70, accuracy: 100, pp: 20, contact: true, critStage: 1, description: 'Slashes with claws. High critical-hit ratio.' },
  'slam': { name: 'Slam', type: 'normal', category: 'physical', power: 80, accuracy: 75, pp: 20, contact: true, description: 'Slams the target with a long tail or vine.' },
  'hyper-fang': { name: 'Hyper Fang', type: 'normal', category: 'physical', power: 80, accuracy: 90, pp: 15, contact: true, secondary: { chance: 10, flinch: true }, description: '10% chance to make the target flinch.' },
  'retaliate': { name: 'Retaliate', type: 'normal', category: 'physical', power: 70, accuracy: 100, pp: 5, contact: true, description: 'Attacks to avenge a fallen ally. (The doubled power is not in Sijord yet.)' },
  'extreme-speed': { name: 'Extreme Speed', type: 'normal', category: 'physical', power: 80, accuracy: 100, pp: 5, priority: 2, contact: true, description: 'A blindingly fast charge. Usually goes first.' },
  'feint': { name: 'Feint', type: 'normal', category: 'physical', power: 30, accuracy: 100, pp: 10, priority: 2, special: 'feint', description: 'A quick feint that hits through Protect. Usually goes first.' },
  'rapid-spin': { name: 'Rapid Spin', type: 'normal', category: 'physical', power: 50, accuracy: 100, pp: 40, contact: true, special: 'rapid-spin', secondary: { chance: 100, self: { spe: 1 } }, description: 'Spins to shake off Leech Seed and binding moves, raising Speed.' },
  'fury-attack': { name: 'Fury Attack', type: 'normal', category: 'physical', power: 15, accuracy: 85, pp: 20, contact: true, multihit: [2, 5], description: 'Jabs 2 to 5 times in a row.' },
  'fury-swipes': { name: 'Fury Swipes', type: 'normal', category: 'physical', power: 18, accuracy: 80, pp: 15, contact: true, multihit: [2, 5], description: 'Rakes 2 to 5 times in a row.' },
  'wrap': { name: 'Wrap', type: 'normal', category: 'physical', power: 15, accuracy: 90, pp: 20, contact: true, special: 'bind', description: 'Wraps the target, hurting it by 1/8 of its max HP for 4-5 turns.' },
  'super-fang': { name: 'Super Fang', type: 'normal', category: 'physical', power: 0, accuracy: 90, pp: 10, contact: true, special: 'super-fang', description: "Halves the target's current HP." },
  'self-destruct': { name: 'Self-Destruct', type: 'normal', category: 'physical', power: 200, accuracy: 100, pp: 5, target: 'all-adjacent', special: 'self-destruct', description: 'Explodes, hitting everyone else. The user faints.' },
  'explosion': { name: 'Explosion', type: 'normal', category: 'physical', power: 250, accuracy: 100, pp: 5, target: 'all-adjacent', special: 'self-destruct', description: 'A huge blast that hits everyone else. The user faints.' },
  'echoed-voice': { name: 'Echoed Voice', type: 'normal', category: 'special', power: 40, accuracy: 100, pp: 15, sound: true, description: 'Attacks with an echoing voice.' },
  'round': { name: 'Round', type: 'normal', category: 'special', power: 60, accuracy: 100, pp: 15, sound: true, description: 'Attacks with a song.' },
  'growth': { name: 'Growth', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { atk: 1, spa: 1 }, description: "Raises the user's Attack and Sp. Atk." },
  'defense-curl': { name: 'Defense Curl', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 40, target: 'self', selfBoosts: { def: 1 }, description: 'Curls up, raising Defense.' },
  'double-team': { name: 'Double Team', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 15, target: 'self', selfBoosts: { evasion: 1 }, description: 'Creates illusory copies, raising evasiveness.' },
  'swords-dance': { name: 'Swords Dance', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { atk: 2 }, description: 'A frenetic dance that sharply raises Attack.' },
  'shell-smash': { name: 'Shell Smash', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 15, target: 'self', selfBoosts: { atk: 2, spa: 2, spe: 2, def: -1, spd: -1 }, description: 'Sharply raises Attack, Sp. Atk and Speed; lowers Defense and Sp. Def.' },
  'howl': { name: 'Howl', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 40, target: 'ally-side', selfBoosts: { atk: 1 }, description: 'Raises the Attack of the user and its ally.' },
  'focus-energy': { name: 'Focus Energy', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 30, target: 'self', special: 'focus-energy', description: 'Takes a deep breath, sharply raising its critical-hit ratio.' },
  'scary-face': { name: 'Scary Face', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 10, boosts: { spe: -2 }, description: "Sharply lowers the target's Speed." },
  'screech': { name: 'Screech', type: 'normal', category: 'status', power: 0, accuracy: 85, pp: 40, sound: true, boosts: { def: -2 }, description: "A piercing screech that sharply lowers the target's Defense." },
  'smokescreen': { name: 'Smokescreen', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 20, boosts: { accuracy: -1 }, description: "Lowers the target's accuracy." },
  'sweet-scent': { name: 'Sweet Scent', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 20, target: 'all-adjacent-foes', boosts: { evasion: -2 }, description: "A sweet scent that sharply lowers both foes' evasiveness." },
  'play-nice': { name: 'Play Nice', type: 'normal', category: 'status', power: 0, accuracy: true, pp: 20, boosts: { atk: -1 }, description: "Befriends the target, lowering its Attack. Never misses." },
  'glare': { name: 'Glare', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 30, status: 'par', description: 'A terrifying glare that paralyses.' },
  'sing': { name: 'Sing', type: 'normal', category: 'status', power: 0, accuracy: 55, pp: 15, sound: true, status: 'slp', description: 'A soothing song that puts the target to sleep.' },
  'supersonic': { name: 'Supersonic', type: 'normal', category: 'status', power: 0, accuracy: 55, pp: 20, sound: true, confuse: true, description: 'Odd sound waves that confuse the target.' },
  'swagger': { name: 'Swagger', type: 'normal', category: 'status', power: 0, accuracy: 85, pp: 15, confuse: true, boosts: { atk: 2 }, description: 'Enrages and confuses the target, but sharply raises its Attack.' },
  // ---- Grass ----
  'petal-blizzard': { name: 'Petal Blizzard', type: 'grass', category: 'physical', power: 90, accuracy: 100, pp: 15, target: 'all-adjacent', description: 'A storm of petals that hits everyone else, ally included.' },
  'power-whip': { name: 'Power Whip', type: 'grass', category: 'physical', power: 120, accuracy: 85, pp: 10, contact: true, description: 'Lashes violently with vines.' },
  'synthesis': { name: 'Synthesis', type: 'grass', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', heal: 0.5, description: 'Restores half its max HP.' },
  // ---- Fire ----
  'flame-wheel': { name: 'Flame Wheel', type: 'fire', category: 'physical', power: 60, accuracy: 100, pp: 25, contact: true, secondary: { chance: 10, status: 'brn' }, description: 'A fiery charge. 10% chance to burn.' },
  'incinerate': { name: 'Incinerate', type: 'fire', category: 'special', power: 60, accuracy: 100, pp: 15, target: 'all-adjacent-foes', special: 'incinerate', description: 'Hits both foes and burns up any berries they hold.' },
  'fire-spin': { name: 'Fire Spin', type: 'fire', category: 'special', power: 35, accuracy: 85, pp: 15, special: 'bind', description: 'A vortex of fire that hurts the target by 1/8 of its max HP for 4-5 turns.' },
  'fire-blast': { name: 'Fire Blast', type: 'fire', category: 'special', power: 110, accuracy: 85, pp: 5, secondary: { chance: 10, status: 'brn' }, description: '10% chance to burn.' },
  'inferno': { name: 'Inferno', type: 'fire', category: 'special', power: 100, accuracy: 50, pp: 5, secondary: { chance: 100, status: 'brn' }, description: 'An inaccurate blaze that always burns.' },
  // ---- Water ----
  'hydro-pump': { name: 'Hydro Pump', type: 'water', category: 'special', power: 110, accuracy: 80, pp: 5, description: 'Blasts a huge volume of water.' },
  'wave-crash': { name: 'Wave Crash', type: 'water', category: 'physical', power: 120, accuracy: 100, pp: 10, contact: true, recoil: 1 / 3, description: 'A crashing charge. The user takes 1/3 of the damage dealt.' },
  'withdraw': { name: 'Withdraw', type: 'water', category: 'status', power: 0, accuracy: true, pp: 40, target: 'self', selfBoosts: { def: 1 }, description: 'Withdraws into its shell, raising Defense.' },
  'soak': { name: 'Soak', type: 'water', category: 'status', power: 0, accuracy: 100, pp: 20, special: 'soak', description: 'Drenches the target, making it pure Water type.' },
  'life-dew': { name: 'Life Dew', type: 'water', category: 'status', power: 0, accuracy: true, pp: 10, target: 'ally-side', heal: 0.25, description: 'Restores 1/4 of max HP to the user and its ally.' },
  // ---- Electric ----
  'nuzzle': { name: 'Nuzzle', type: 'electric', category: 'physical', power: 20, accuracy: 100, pp: 20, contact: true, secondary: { chance: 100, status: 'par' }, description: 'Rubs electrified cheeks on the target. Always paralyses.' },
  'spark': { name: 'Spark', type: 'electric', category: 'physical', power: 65, accuracy: 100, pp: 20, contact: true, secondary: { chance: 30, status: 'par' }, description: '30% chance to paralyse.' },
  'thunder-punch': { name: 'Thunder Punch', type: 'electric', category: 'physical', power: 75, accuracy: 100, pp: 15, contact: true, secondary: { chance: 10, status: 'par' }, description: '10% chance to paralyse.' },
  'electro-ball': { name: 'Electro Ball', type: 'electric', category: 'special', power: 0, accuracy: 100, pp: 10, special: 'electro-ball', description: 'An electric orb. The faster the user is than the target, the harder it hits (40 to 150 power).' },
  'thunderbolt': { name: 'Thunderbolt', type: 'electric', category: 'special', power: 90, accuracy: 100, pp: 15, secondary: { chance: 10, status: 'par' }, description: '10% chance to paralyse.' },
  'discharge': { name: 'Discharge', type: 'electric', category: 'special', power: 80, accuracy: 100, pp: 15, target: 'all-adjacent', secondary: { chance: 30, status: 'par' }, description: 'Hits everyone else, ally included. 30% chance to paralyse.' },
  'thunder': { name: 'Thunder', type: 'electric', category: 'special', power: 110, accuracy: 70, pp: 10, secondary: { chance: 30, status: 'par' }, description: 'A wild lightning bolt. 30% chance to paralyse.' },
  // ---- Flying ----
  'pluck': { name: 'Pluck', type: 'flying', category: 'physical', power: 60, accuracy: 100, pp: 20, contact: true, description: 'Pecks the target.' },
  'drill-peck': { name: 'Drill Peck', type: 'flying', category: 'physical', power: 80, accuracy: 100, pp: 20, contact: true, description: 'A corkscrewing peck.' },
  'air-cutter': { name: 'Air Cutter', type: 'flying', category: 'special', power: 60, accuracy: 95, pp: 25, target: 'all-adjacent-foes', critStage: 1, description: 'Razor winds hit both foes. High critical-hit ratio.' },
  'hurricane': { name: 'Hurricane', type: 'flying', category: 'special', power: 110, accuracy: 70, pp: 10, secondary: { chance: 30, confuse: true }, description: 'A fierce wind. 30% chance to confuse.' },
  'feather-dance': { name: 'Feather Dance', type: 'flying', category: 'status', power: 0, accuracy: 100, pp: 15, boosts: { atk: -2 }, description: 'Buries the target in down, sharply lowering its Attack.' },
  // ---- Bug ----
  'twineedle': { name: 'Twineedle', type: 'bug', category: 'physical', power: 25, accuracy: 100, pp: 20, multihit: [2, 2], secondary: { chance: 20, status: 'psn' }, description: 'Stabs twice. 20% chance to poison.' },
  'pin-missile': { name: 'Pin Missile', type: 'bug', category: 'physical', power: 25, accuracy: 95, pp: 20, multihit: [2, 5], description: 'Fires 2 to 5 sharp spikes.' },
  'leech-life': { name: 'Leech Life', type: 'bug', category: 'physical', power: 80, accuracy: 100, pp: 10, contact: true, drain: 0.5, description: 'Drains blood. Restores half the damage dealt.' },
  // ---- Poison ----
  'acid': { name: 'Acid', type: 'poison', category: 'special', power: 40, accuracy: 100, pp: 30, target: 'all-adjacent-foes', secondary: { chance: 10, boosts: { spd: -1 } }, description: 'Sprays both foes. 10% chance to lower Sp. Def.' },
  'acid-spray': { name: 'Acid Spray', type: 'poison', category: 'special', power: 40, accuracy: 100, pp: 20, secondary: { chance: 100, boosts: { spd: -2 } }, description: 'Melting acid that sharply lowers Sp. Def.' },
  'poison-fang': { name: 'Poison Fang', type: 'poison', category: 'physical', power: 50, accuracy: 100, pp: 15, contact: true, secondary: { chance: 50, status: 'tox' }, description: '50% chance to badly poison.' },
  'venoshock': { name: 'Venoshock', type: 'poison', category: 'special', power: 65, accuracy: 100, pp: 10, special: 'venoshock', description: 'Double power against a poisoned target.' },
  'poison-jab': { name: 'Poison Jab', type: 'poison', category: 'physical', power: 80, accuracy: 100, pp: 20, contact: true, secondary: { chance: 30, status: 'psn' }, description: '30% chance to poison.' },
  'sludge-bomb': { name: 'Sludge Bomb', type: 'poison', category: 'special', power: 90, accuracy: 100, pp: 10, secondary: { chance: 30, status: 'psn' }, description: '30% chance to poison.' },
  'gunk-shot': { name: 'Gunk Shot', type: 'poison', category: 'physical', power: 120, accuracy: 80, pp: 5, secondary: { chance: 30, status: 'psn' }, description: '30% chance to poison.' },
  'toxic': { name: 'Toxic', type: 'poison', category: 'status', power: 0, accuracy: 90, pp: 10, status: 'tox', description: 'Badly poisons the target; the damage grows every turn.' },
  'coil': { name: 'Coil', type: 'poison', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { atk: 1, def: 1, accuracy: 1 }, description: 'Coils up, raising Attack, Defense and accuracy.' },
  // ---- Ground / Rock ----
  'mud-shot': { name: 'Mud Shot', type: 'ground', category: 'special', power: 55, accuracy: 95, pp: 15, secondary: { chance: 100, boosts: { spe: -1 } }, description: "Hurls mud, lowering the target's Speed." },
  'stomping-tantrum': { name: 'Stomping Tantrum', type: 'ground', category: 'physical', power: 75, accuracy: 100, pp: 10, contact: true, description: 'Stomps about in a temper.' },
  'drill-run': { name: 'Drill Run', type: 'ground', category: 'physical', power: 80, accuracy: 95, pp: 10, contact: true, critStage: 1, description: 'Spins its body like a drill. High critical-hit ratio.' },
  'earth-power': { name: 'Earth Power', type: 'ground', category: 'special', power: 90, accuracy: 100, pp: 10, secondary: { chance: 10, boosts: { spd: -1 } }, description: '10% chance to lower Sp. Def.' },
  'earthquake': { name: 'Earthquake', type: 'ground', category: 'physical', power: 100, accuracy: 100, pp: 10, target: 'all-adjacent', description: 'A quake that hits everyone else, ally included.' },
  'smack-down': { name: 'Smack Down', type: 'rock', category: 'physical', power: 50, accuracy: 100, pp: 15, description: 'Throws a stone at the target.' },
  'rock-blast': { name: 'Rock Blast', type: 'rock', category: 'physical', power: 25, accuracy: 90, pp: 10, multihit: [2, 5], description: 'Hurls 2 to 5 boulders.' },
  'stone-edge': { name: 'Stone Edge', type: 'rock', category: 'physical', power: 100, accuracy: 80, pp: 5, critStage: 1, description: 'Stabs with sharp stones. High critical-hit ratio.' },
  'rock-polish': { name: 'Rock Polish', type: 'rock', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { spe: 2 }, description: 'Polishes its body, sharply raising Speed.' },
  // ---- Fighting ----
  'cross-chop': { name: 'Cross Chop', type: 'fighting', category: 'physical', power: 100, accuracy: 80, pp: 5, contact: true, critStage: 1, description: 'A double chop. High critical-hit ratio.' },
  'seismic-toss': { name: 'Seismic Toss', type: 'fighting', category: 'physical', power: 0, accuracy: 100, pp: 20, contact: true, special: 'seismic-toss', description: "Damage equal to the user's level." },
  // ---- Psychic ----
  'zen-headbutt': { name: 'Zen Headbutt', type: 'psychic', category: 'physical', power: 80, accuracy: 90, pp: 15, contact: true, secondary: { chance: 20, flinch: true }, description: '20% chance to make the target flinch.' },
  'extrasensory': { name: 'Extrasensory', type: 'psychic', category: 'special', power: 80, accuracy: 100, pp: 20, secondary: { chance: 10, flinch: true }, description: '10% chance to make the target flinch.' },
  'stored-power': { name: 'Stored Power', type: 'psychic', category: 'special', power: 20, accuracy: 100, pp: 10, special: 'stored-power', description: "20 power, plus 20 for every stage the user's stats are raised." },
  'agility': { name: 'Agility', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 30, target: 'self', selfBoosts: { spe: 2 }, description: 'Relaxes and lightens its body, sharply raising Speed.' },
  'amnesia': { name: 'Amnesia', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { spd: 2 }, description: 'Empties its mind, sharply raising Sp. Def.' },
  'cosmic-power': { name: 'Cosmic Power', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { def: 1, spd: 1 }, description: 'Raises Defense and Sp. Def.' },
  'hypnosis': { name: 'Hypnosis', type: 'psychic', category: 'status', power: 0, accuracy: 60, pp: 20, status: 'slp', description: 'Hypnotic suggestion that puts the target to sleep.' },
  'rest': { name: 'Rest', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', special: 'rest', description: 'Sleeps for two turns, restoring all HP and curing status problems.' },
  'teleport': { name: 'Teleport', type: 'psychic', category: 'status', power: 0, accuracy: true, pp: 20, priority: -6, target: 'self', special: 'teleport', description: 'Flees a wild battle. Fails against trainers or while an ally is on the field.' },
  // ---- Fairy ----
  'disarming-voice': { name: 'Disarming Voice', type: 'fairy', category: 'special', power: 40, accuracy: true, pp: 15, target: 'all-adjacent-foes', sound: true, description: 'A charming cry that hits both foes. Never misses.' },
  'play-rough': { name: 'Play Rough', type: 'fairy', category: 'physical', power: 90, accuracy: 90, pp: 10, contact: true, secondary: { chance: 10, boosts: { atk: -1 } }, description: '10% chance to lower Attack.' },
  'sweet-kiss': { name: 'Sweet Kiss', type: 'fairy', category: 'status', power: 0, accuracy: 75, pp: 10, confuse: true, description: 'A sweet kiss that confuses the target.' },
  'moonlight': { name: 'Moonlight', type: 'fairy', category: 'status', power: 0, accuracy: true, pp: 5, target: 'self', heal: 0.5, description: 'Restores half its max HP.' },
  // ---- Steel ----
  'iron-tail': { name: 'Iron Tail', type: 'steel', category: 'physical', power: 100, accuracy: 75, pp: 15, contact: true, secondary: { chance: 30, boosts: { def: -1 } }, description: '30% chance to lower Defense.' },
  'meteor-mash': { name: 'Meteor Mash', type: 'steel', category: 'physical', power: 90, accuracy: 90, pp: 10, contact: true, secondary: { chance: 20, self: { atk: 1 } }, description: "20% chance to raise the user's Attack." },
  'flash-cannon': { name: 'Flash Cannon', type: 'steel', category: 'special', power: 80, accuracy: 100, pp: 10, secondary: { chance: 10, boosts: { spd: -1 } }, description: '10% chance to lower Sp. Def.' },
  // ---- Dark ----
  'pursuit': { name: 'Pursuit', type: 'dark', category: 'physical', power: 40, accuracy: 100, pp: 20, contact: true, description: 'A sneaky strike. (The bonus against a switching target is not in Sijord yet.)' },
  'assurance': { name: 'Assurance', type: 'dark', category: 'physical', power: 60, accuracy: 100, pp: 10, contact: true, special: 'assurance', description: 'Double power if the target was already hurt this turn.' },
  'sucker-punch': { name: 'Sucker Punch', type: 'dark', category: 'physical', power: 70, accuracy: 100, pp: 5, priority: 1, contact: true, special: 'sucker-punch', description: 'Strikes first, but only if the target is readying an attack.' },
  'knock-off': { name: 'Knock Off', type: 'dark', category: 'physical', power: 65, accuracy: 100, pp: 20, contact: true, special: 'knock-off', description: "Knocks away the target's held item for the battle. 1.5x power if it holds one." },
  'nasty-plot': { name: 'Nasty Plot', type: 'dark', category: 'status', power: 0, accuracy: true, pp: 20, target: 'self', selfBoosts: { spa: 2 }, description: 'Plots something bad, sharply raising Sp. Atk.' },
  'flatter': { name: 'Flatter', type: 'dark', category: 'status', power: 0, accuracy: 100, pp: 15, confuse: true, boosts: { spa: 1 }, description: 'Flatters and confuses the target, but raises its Sp. Atk.' },
  // ---- Dragon / Ghost ----
  'dragon-breath': { name: 'Dragon Breath', type: 'dragon', category: 'special', power: 60, accuracy: 100, pp: 20, secondary: { chance: 30, status: 'par' }, description: '30% chance to paralyse.' },
  'dragon-claw': { name: 'Dragon Claw', type: 'dragon', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, description: 'Slashes with sharp claws.' },
  'confuse-ray': { name: 'Confuse Ray', type: 'ghost', category: 'status', power: 0, accuracy: 100, pp: 10, confuse: true, description: 'A sinister ray that confuses the target.' },
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
