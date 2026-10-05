import { POKEMON_VISUALS } from '../pokemon-visuals';
import type { LearnEntry, SpeciesData, StatTable } from '../battle/types';

/** Shorthand for a learnset: [[level, move], ...]. */
function learn(...entries: [number, string][]): LearnEntry[] {
  return entries.map(([level, move]) => ({ level, move }));
}

function stats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): StatTable {
  return { hp, atk, def, spa, spd, spe };
}

/**
 * The first 21 species: the three starter lines and the creatures of Hearthmeadow, the meadow
 * biome around Bramblewick (docs/DEX_PLAN.md §4). Base stat totals follow the dex plan's
 * guidelines: starters 318 / 405 / 530, the regional bird finishing at 490.
 */
const LIST: SpeciesData[] = [
  // ---- Grass starter: fawn line ----
  {
    id: 'fernfawn', dex: 'S001', name: 'Fernfawn', types: ['grass'], baseStats: stats(45, 52, 50, 49, 60, 62),
    abilities: ['overgrow'], hiddenAbility: 'sap-sipper', growth: 'medium-slow', baseExp: 64, evYield: { spe: 1 },
    catchRate: 45, temperament: 'docile', height: 0.55, evolution: { into: 'bramblebuck', level: 16 },
    description: 'A fawn with unfurling fern ears. It leaves a trail of clover wherever it naps.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [3, 'leafage'], [6, 'leech-seed'], [9, 'quick-attack'], [12, 'magical-leaf'], [15, 'double-kick'], [18, 'razor-leaf'], [22, 'stun-spore'], [25, 'seed-bomb'], [30, 'giga-drain']),
  },
  {
    id: 'bramblebuck', dex: 'S002', name: 'Bramblebuck', types: ['grass'], baseStats: stats(60, 70, 62, 60, 73, 80),
    abilities: ['overgrow'], hiddenAbility: 'sap-sipper', growth: 'medium-slow', baseExp: 142, evYield: { atk: 1, spe: 1 },
    catchRate: 45, temperament: 'docile', height: 1.3, evolution: { into: 'elkwarden', level: 36 },
    description: 'A lanky young stag. It trims its own bramble antlers with its teeth.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'leafage'], [1, 'leech-seed'], [9, 'quick-attack'], [12, 'magical-leaf'], [15, 'double-kick'], [16, 'horn-leech'], [20, 'razor-leaf'], [24, 'stun-spore'], [28, 'seed-bomb'], [32, 'work-up'], [34, 'giga-drain'], [38, 'protect'], [42, 'wood-hammer']),
  },
  {
    id: 'elkwarden', dex: 'S003', name: 'Elkwarden', types: ['grass', 'fighting'], baseStats: stats(85, 115, 90, 75, 90, 75),
    abilities: ['overgrow'], hiddenAbility: 'sap-sipper', growth: 'medium-slow', baseExp: 236, evYield: { atk: 3 },
    catchRate: 45, temperament: 'territorial', height: 2.3,
    description: 'A towering moss elk. Saplings take root in its antlers, and it guards the forest with shoulder charges.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'leafage'], [1, 'leech-seed'], [9, 'quick-attack'], [12, 'magical-leaf'], [15, 'double-kick'], [16, 'horn-leech'], [20, 'razor-leaf'], [24, 'stun-spore'], [28, 'seed-bomb'], [32, 'work-up'], [34, 'giga-drain'], [36, 'close-combat'], [40, 'bulk-up'], [44, 'brick-break'], [48, 'wood-hammer'], [54, 'protect']),
  },
  // ---- Fire starter: lynx line ----
  {
    id: 'cindlet', dex: 'S004', name: 'Cindlet', types: ['fire'], baseStats: stats(42, 56, 42, 58, 50, 70),
    abilities: ['blaze'], hiddenAbility: 'flash-fire', growth: 'medium-slow', baseExp: 62, evYield: { spe: 1 },
    catchRate: 45, temperament: 'docile', height: 0.5, evolution: { into: 'pyrolynx', level: 16 },
    description: 'A lynx kitten whose ember ear-tufts flare up whenever it gets curious.',
    learnset: learn([1, 'scratch'], [1, 'leer'], [3, 'ember'], [6, 'quick-attack'], [9, 'bite'], [12, 'flame-charge'], [15, 'fire-fang'], [19, 'will-o-wisp'], [23, 'work-up'], [27, 'flamethrower']),
  },
  {
    id: 'pyrolynx', dex: 'S005', name: 'Pyrolynx', types: ['fire'], baseStats: stats(57, 78, 55, 70, 60, 85),
    abilities: ['blaze'], hiddenAbility: 'flash-fire', growth: 'medium-slow', baseExp: 142, evYield: { atk: 1, spe: 1 },
    catchRate: 45, temperament: 'territorial', height: 1.1, evolution: { into: 'forgelynx', level: 36 },
    description: 'A sleek hunting lynx. Its coal-black paws leave smouldering prints.',
    learnset: learn([1, 'scratch'], [1, 'leer'], [1, 'ember'], [1, 'quick-attack'], [9, 'bite'], [12, 'flame-charge'], [15, 'fire-fang'], [16, 'fake-out'], [20, 'will-o-wisp'], [24, 'crunch'], [28, 'flamethrower'], [33, 'heat-wave'], [38, 'flare-blitz']),
  },
  {
    id: 'forgelynx', dex: 'S006', name: 'Forgelynx', types: ['fire', 'steel'], baseStats: stats(75, 110, 95, 80, 70, 100),
    abilities: ['blaze'], hiddenAbility: 'flash-fire', growth: 'medium-slow', baseExp: 236, evYield: { atk: 2, spe: 1 },
    catchRate: 45, temperament: 'territorial', height: 1.6,
    description: 'An armoured lynx whose plates are forged in its own inner furnace. Smiths revere it.',
    learnset: learn([1, 'scratch'], [1, 'leer'], [1, 'ember'], [1, 'quick-attack'], [9, 'bite'], [12, 'flame-charge'], [15, 'fire-fang'], [16, 'fake-out'], [20, 'will-o-wisp'], [24, 'crunch'], [28, 'flamethrower'], [33, 'heat-wave'], [36, 'iron-head'], [42, 'iron-defense'], [46, 'flare-blitz'], [52, 'close-combat']),
  },
  // ---- Water starter: seal line ----
  {
    id: 'splashpup', dex: 'S007', name: 'Splashpup', types: ['water'], baseStats: stats(54, 46, 52, 56, 58, 52),
    abilities: ['torrent'], hiddenAbility: 'thick-fat', growth: 'medium-slow', baseExp: 63, evYield: { spa: 1 },
    catchRate: 45, temperament: 'docile', height: 0.5, evolution: { into: 'sealkin', level: 16 },
    description: 'A round seal pup that bounces along the ground like a ball.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [3, 'water-gun'], [6, 'baby-doll-eyes'], [9, 'aqua-jet'], [12, 'water-pulse'], [15, 'fairy-wind'], [18, 'bubble-beam'], [23, 'protect'], [27, 'surf']),
  },
  {
    id: 'sealkin', dex: 'S008', name: 'Sealkin', types: ['water'], baseStats: stats(70, 56, 65, 75, 74, 65),
    abilities: ['torrent'], hiddenAbility: 'thick-fat', growth: 'medium-slow', baseExp: 142, evYield: { spa: 1, spd: 1 },
    catchRate: 45, temperament: 'docile', height: 1.1, evolution: { into: 'selkira', level: 36 },
    description: 'A playful seal wearing a kelp scarf. It carries pebbles to give as gifts.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'water-gun'], [1, 'baby-doll-eyes'], [9, 'aqua-jet'], [12, 'water-pulse'], [15, 'fairy-wind'], [16, 'helping-hand'], [20, 'bubble-beam'], [24, 'draining-kiss'], [28, 'aqua-tail'], [32, 'protect'], [35, 'surf']),
  },
  {
    id: 'selkira', dex: 'S009', name: 'Selkira', types: ['water', 'fairy'], baseStats: stats(90, 60, 80, 110, 105, 85),
    abilities: ['torrent'], hiddenAbility: 'thick-fat', growth: 'medium-slow', baseExp: 239, evYield: { spa: 3 },
    catchRate: 45, temperament: 'docile', height: 1.8,
    description: 'A selkie-like guardian in a shimmering sealskin cloak. It sings ships home through the fog.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'water-gun'], [1, 'baby-doll-eyes'], [9, 'aqua-jet'], [12, 'water-pulse'], [15, 'fairy-wind'], [16, 'helping-hand'], [20, 'bubble-beam'], [24, 'draining-kiss'], [28, 'aqua-tail'], [32, 'protect'], [35, 'surf'], [36, 'moonblast'], [42, 'muddy-water'], [48, 'icy-wind']),
  },
  // ---- Regional bird ----
  {
    id: 'finchlet', dex: 'S010', name: 'Finchlet', types: ['normal', 'flying'], baseStats: stats(40, 45, 38, 30, 34, 58),
    abilities: ['keen-eye', 'big-pecks'], hiddenAbility: 'technician', growth: 'medium-slow', baseExp: 50, evYield: { spe: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.3, evolution: { into: 'fjordling', level: 17 },
    description: 'A plump bunting that steals crumbs from picnics.',
    learnset: learn([1, 'peck'], [1, 'growl'], [5, 'quick-attack'], [9, 'sand-attack'], [13, 'gust'], [17, 'wing-attack'], [21, 'tailwind'], [25, 'aerial-ace'], [29, 'roost'], [33, 'air-slash']),
  },
  {
    id: 'fjordling', dex: 'S011', name: 'Fjordling', types: ['normal', 'flying'], baseStats: stats(58, 65, 52, 42, 46, 82),
    abilities: ['keen-eye', 'big-pecks'], hiddenAbility: 'technician', growth: 'medium-slow', baseExp: 122, evYield: { spe: 2 },
    catchRate: 120, temperament: 'skittish', height: 0.7, evolution: { into: 'skjaldhawk', level: 34 },
    description: 'A cliff-nesting swift that races the updrafts along the fjord walls.',
    learnset: learn([1, 'peck'], [1, 'growl'], [1, 'quick-attack'], [9, 'sand-attack'], [13, 'gust'], [17, 'wing-attack'], [22, 'tailwind'], [27, 'aerial-ace'], [31, 'roost'], [34, 'air-slash']),
  },
  {
    id: 'skjaldhawk', dex: 'S012', name: 'Skjaldhawk', types: ['normal', 'flying'], baseStats: stats(80, 95, 85, 55, 70, 105),
    abilities: ['keen-eye', 'big-pecks'], hiddenAbility: 'technician', growth: 'medium-slow', baseExp: 216, evYield: { spe: 3 },
    catchRate: 45, temperament: 'territorial', height: 1.5,
    description: 'A great hawk whose chest plumage forms a round shield crest. It dives like a falling shield.',
    learnset: learn([1, 'peck'], [1, 'growl'], [1, 'quick-attack'], [9, 'sand-attack'], [13, 'gust'], [17, 'wing-attack'], [22, 'tailwind'], [27, 'aerial-ace'], [31, 'roost'], [34, 'iron-defense'], [38, 'air-slash'], [42, 'brave-bird'], [48, 'double-edge']),
  },
  // ---- Regional rodent ----
  {
    id: 'nibblet', dex: 'S013', name: 'Nibblet', types: ['normal'], baseStats: stats(48, 52, 40, 30, 40, 45),
    abilities: ['cheek-pouch', 'pickup'], hiddenAbility: 'run-away', growth: 'medium-fast', baseExp: 51, evYield: { atk: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.3, evolution: { into: 'stashquill', level: 20 },
    description: 'A vole with enormous cheek pouches. It hoards anything shiny it can find.',
    learnset: learn([1, 'tackle'], [1, 'tail-whip'], [4, 'quick-attack'], [7, 'sand-attack'], [10, 'bite'], [14, 'headbutt'], [18, 'take-down'], [22, 'dig-in']),
  },
  {
    id: 'stashquill', dex: 'S014', name: 'Stashquill', types: ['normal', 'ground'], baseStats: stats(85, 85, 80, 45, 60, 55),
    abilities: ['cheek-pouch', 'pickup'], hiddenAbility: 'sturdy', growth: 'medium-fast', baseExp: 145, evYield: { def: 2 },
    catchRate: 127, temperament: 'territorial', height: 0.7,
    description: 'A hedgehog-vole that digs pantry tunnels. It always knows where something useful is buried.',
    learnset: learn([1, 'tackle'], [1, 'tail-whip'], [1, 'quick-attack'], [1, 'sand-attack'], [10, 'bite'], [14, 'headbutt'], [18, 'take-down'], [20, 'mud-slap'], [24, 'dig-in'], [28, 'bulldoze'], [32, 'body-slam'], [36, 'crunch'], [42, 'double-edge']),
  },
  // ---- Early bug ----
  {
    id: 'dewmite', dex: 'S015', name: 'Dewmite', types: ['bug'], baseStats: stats(35, 30, 35, 35, 30, 40),
    abilities: ['shield-dust'], hiddenAbility: 'compound-eyes', growth: 'medium-fast', baseExp: 39, evYield: { hp: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.25, evolution: { into: 'cocoonch', level: 8 },
    description: 'A tiny mite that sips morning dew off spider silk. It carries one perfect drop on its back.',
    learnset: learn([1, 'tackle'], [1, 'string-shot'], [5, 'absorb'], [9, 'bug-bite']),
  },
  {
    id: 'cocoonch', dex: 'S016', name: 'Cocoonch', types: ['bug', 'grass'], baseStats: stats(45, 25, 75, 30, 60, 20),
    abilities: ['shed-skin'], growth: 'medium-fast', baseExp: 72, evYield: { def: 2 },
    catchRate: 120, temperament: 'docile', height: 0.6, evolution: { into: 'auroramoth', level: 18 },
    description: 'A cocoon wrapped in moss. It sways slowly through the day to soak up sunlight.',
    learnset: learn([1, 'tackle'], [1, 'string-shot'], [1, 'absorb'], [8, 'harden'], [12, 'mega-drain'], [15, 'struggle-bug']),
  },
  {
    id: 'auroramoth', dex: 'S017', name: 'Auroramoth', types: ['bug', 'psychic'], baseStats: stats(65, 45, 60, 100, 80, 90),
    abilities: ['compound-eyes', 'shield-dust'], growth: 'medium-fast', baseExp: 178, evYield: { spa: 2, spe: 1 },
    catchRate: 45, temperament: 'docile', height: 1.2,
    description: 'A moth with aurora-banded wings. Whole swarms take to the sky on Aurora Nights.',
    learnset: learn([1, 'tackle'], [1, 'string-shot'], [1, 'absorb'], [8, 'harden'], [12, 'mega-drain'], [15, 'struggle-bug'], [18, 'confusion'], [21, 'sleep-powder'], [25, 'psybeam'], [29, 'stun-spore'], [33, 'quiver-dance'], [37, 'bug-buzz'], [42, 'psychic'], [47, 'tailwind']),
  },
  // ---- Clover hare ----
  {
    id: 'cloveret', dex: 'S020', name: 'Cloveret', types: ['grass'], baseStats: stats(44, 40, 40, 50, 50, 66),
    abilities: ['super-luck', 'run-away'], hiddenAbility: 'serene-grace', growth: 'fast', baseExp: 55, evYield: { spe: 1 },
    catchRate: 190, temperament: 'skittish', height: 0.4,
    // The dex plan has it evolve by friendship; until friendship exists it evolves at Lv 22.
    evolution: { into: 'luckhare', level: 22 },
    description: 'A bunny with four-leaf-clover ears. Finding one is said to bring luck for a year.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [4, 'absorb'], [7, 'quick-attack'], [11, 'baby-doll-eyes'], [14, 'mega-drain'], [18, 'double-kick'], [22, 'magical-leaf'], [26, 'charm'], [30, 'giga-drain']),
  },
  {
    id: 'luckhare', dex: 'S021', name: 'Luckhare', types: ['grass', 'fairy'], baseStats: stats(70, 65, 60, 85, 80, 110),
    abilities: ['super-luck'], hiddenAbility: 'serene-grace', growth: 'fast', baseExp: 168, evYield: { spe: 2 },
    catchRate: 60, temperament: 'skittish', height: 0.9,
    description: 'A lean hare that leaves patches of lucky clover behind it. Travellers carry one for good fortune.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'absorb'], [7, 'quick-attack'], [11, 'baby-doll-eyes'], [14, 'mega-drain'], [18, 'double-kick'], [22, 'draining-kiss'], [26, 'magical-leaf'], [30, 'helping-hand'], [34, 'protect'], [38, 'giga-drain'], [44, 'moonblast']),
  },
  // ---- Sheepdog ----
  {
    id: 'hjordpup', dex: 'S028', name: 'Hjordpup', types: ['normal'], baseStats: stats(50, 58, 45, 30, 40, 62),
    abilities: ['own-tempo', 'inner-focus'], hiddenAbility: 'intimidate', growth: 'medium-fast', baseExp: 56, evYield: { atk: 1 },
    catchRate: 190, temperament: 'territorial', height: 0.45, evolution: { into: 'shepherion', level: 32 },
    description: 'A fluffy herding puppy that nips at the heels of anything that strays from the flock.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [4, 'tail-whip'], [7, 'quick-attack'], [10, 'bite'], [14, 'rock-smash'], [18, 'headbutt'], [22, 'helping-hand'], [26, 'take-down'], [30, 'crunch']),
  },
  {
    id: 'shepherion', dex: 'S029', name: 'Shepherion', types: ['normal', 'fighting'], baseStats: stats(85, 105, 80, 45, 75, 90),
    abilities: ['own-tempo', 'inner-focus'], hiddenAbility: 'intimidate', growth: 'medium-fast', baseExp: 172, evYield: { atk: 2 },
    catchRate: 60, temperament: 'territorial', height: 1.2,
    description: 'A loyal herding hound that throws its body in front of stampedes to protect the flock.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'tail-whip'], [7, 'quick-attack'], [10, 'bite'], [14, 'rock-smash'], [18, 'headbutt'], [22, 'helping-hand'], [26, 'take-down'], [30, 'crunch'], [32, 'follow-me'], [36, 'brick-break'], [40, 'bulk-up'], [44, 'close-combat'], [50, 'double-edge']),
  },
];

for (const s of LIST) {
  const visual = POKEMON_VISUALS[s.id];
  if (visual) { s.name = visual.name; s.description = `${visual.name} · National Pokédex #${visual.dex}.`; }
}

export const SPECIES: Record<string, SpeciesData> = Object.fromEntries(LIST.map((s) => [s.id, s]));
export const SPECIES_IDS = LIST.map((s) => s.id);

export function species(id: string): SpeciesData {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species "${id}"`);
  return s;
}

/** The three partner choices at Professor Hazel's lab. */
export const STARTERS = ['fernfawn', 'cindlet', 'splashpup'] as const;
