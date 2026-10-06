import { POKEMON_VISUALS } from '../pokemon-visuals';
import type { LearnEntry, SpeciesData, StatTable } from '../battle/types';

/** Shorthand for a learnset: [[level, move], ...]. */
function learn(...entries: [number, string][]): LearnEntry[] {
  return entries.map(([level, move]) => ({ level, move }));
}

function stats(hp: number, atk: number, def: number, spa: number, spd: number, spe: number): StatTable {
  return { hp, atk, def, spa, spd, spe };
}

/** A species entry before its name and dex number are filled in from POKEMON_VISUALS. */
type Entry = Omit<SpeciesData, 'name' | 'dex'>;

/*
 * The species of Hearthmeadow, the meadow around Bramblewick, and Route 1. Each one is a real
 * Kanto Pokémon with its canonical data: types, base stats, growth rate, base experience, effort
 * yield, catch rate and evolution level. The first 21 ids are Sijord's original slots (kept so
 * saves load); later species use the Pokémon's own name as the id.
 *
 * Learnsets are the latest mainline level-up learnsets (Scarlet/Violet, otherwise Sword/Shield,
 * otherwise Ultra Sun/Ultra Moon), keeping the moves the engine implements. Evolution moves are
 * learned at the evolution level. A few moves are left out because Sijord has no mechanic for them
 * yet (weather, hazards, forced switching, move-locking, copying moves): Rain Dance, Whirlwind,
 * Roar, Stealth Rock, Toxic Spikes, Disable, Encore, Taunt, Metronome, Mirror Move, Low Kick and
 * similar.
 *
 * Abilities are the real ones the engine implements; a real ability Sijord cannot model yet is
 * left out, except Chlorophyll and Cloud Nine, which wait for weather (see abilities.ts).
 *
 * Evolution by item does not exist yet, so the three stone evolutions here (Pikachu, Clefairy,
 * Growlithe) use a stand-in level and their evolved forms learn by level what the earlier form
 * does. Evolutions into species that are not in Sijord yet (Arbok, Nidorina, Kadabra, ...) are
 * left out until those species arrive.
 *
 * Descriptions are original Sijord text, not Pokédex entries.
 */
const LIST: Entry[] = [
  // ---- Bulbasaur line (grass starter) ----
  {
    id: 'fernfawn', types: ['grass', 'poison'], baseStats: stats(45, 49, 49, 65, 65, 45),
    abilities: ['overgrow'], hiddenAbility: 'chlorophyll', growth: 'medium-slow', baseExp: 64, evYield: { spa: 1 },
    catchRate: 45, temperament: 'docile', height: 0.7, evolution: { into: 'bramblebuck', level: 16 },
    description: 'A patient little sprout-bearer that basks in meadow sunbeams so the bulb on its back can fatten up.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [3, 'vine-whip'], [6, 'growth'], [9, 'leech-seed'], [12, 'razor-leaf'], [15, 'poison-powder'], [15, 'sleep-powder'], [18, 'seed-bomb'], [21, 'take-down'], [24, 'sweet-scent'], [27, 'synthesis'], [33, 'power-whip']),
  },
  {
    id: 'bramblebuck', types: ['grass', 'poison'], baseStats: stats(60, 62, 63, 80, 80, 60),
    abilities: ['overgrow'], hiddenAbility: 'chlorophyll', growth: 'medium-slow', baseExp: 142, evYield: { spa: 1, spd: 1 },
    catchRate: 45, temperament: 'docile', height: 1.0, evolution: { into: 'elkwarden', level: 32 },
    description: 'Its bud has grown so heavy that it walks with a careful sway, and a sweet green smell hangs around it before it blooms.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'vine-whip'], [1, 'growth'], [9, 'leech-seed'], [12, 'razor-leaf'], [15, 'poison-powder'], [15, 'sleep-powder'], [20, 'seed-bomb'], [25, 'take-down'], [30, 'sweet-scent'], [35, 'synthesis'], [45, 'power-whip']),
  },
  {
    id: 'elkwarden', types: ['grass', 'poison'], baseStats: stats(80, 82, 83, 100, 100, 80),
    abilities: ['overgrow'], hiddenAbility: 'chlorophyll', growth: 'medium-slow', baseExp: 236, evYield: { spa: 2, spd: 1 },
    catchRate: 45, temperament: 'territorial', height: 2.0,
    description: 'When its great flower opens, a calming perfume rolls across the meadow and smaller Pokémon gather in its shade.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [1, 'vine-whip'], [1, 'growth'], [9, 'leech-seed'], [12, 'razor-leaf'], [15, 'poison-powder'], [15, 'sleep-powder'], [20, 'seed-bomb'], [25, 'take-down'], [30, 'sweet-scent'], [32, 'petal-blizzard'], [37, 'synthesis'], [51, 'power-whip']),
  },
  // ---- Charmander line (fire starter) ----
  {
    id: 'cindlet', types: ['fire'], baseStats: stats(39, 52, 43, 60, 50, 65),
    abilities: ['blaze'], growth: 'medium-slow', baseExp: 62, evYield: { spe: 1 },
    catchRate: 45, temperament: 'docile', height: 0.6, evolution: { into: 'pyrolynx', level: 16 },
    description: 'The flame on its tail flickers with its mood, and trainers soon learn to read it like a lantern.',
    learnset: learn([1, 'scratch'], [1, 'growl'], [4, 'ember'], [8, 'smokescreen'], [12, 'dragon-breath'], [17, 'fire-fang'], [20, 'slash'], [24, 'flamethrower'], [28, 'scary-face'], [32, 'fire-spin'], [36, 'inferno'], [40, 'flare-blitz']),
  },
  {
    id: 'pyrolynx', types: ['fire'], baseStats: stats(58, 64, 58, 80, 65, 80),
    abilities: ['blaze'], growth: 'medium-slow', baseExp: 142, evYield: { spa: 1, spe: 1 },
    catchRate: 45, temperament: 'territorial', height: 1.1, evolution: { into: 'forgelynx', level: 36 },
    description: 'Hot-tempered and restless, it lashes its burning tail at anything that looks like a challenge.',
    learnset: learn([1, 'scratch'], [1, 'growl'], [1, 'ember'], [1, 'smokescreen'], [12, 'dragon-breath'], [19, 'fire-fang'], [24, 'slash'], [30, 'flamethrower'], [37, 'scary-face'], [48, 'inferno'], [54, 'flare-blitz']),
  },
  {
    id: 'forgelynx', types: ['fire', 'flying'], baseStats: stats(78, 84, 78, 109, 85, 100),
    abilities: ['blaze'], growth: 'medium-slow', baseExp: 240, evYield: { spa: 3 },
    catchRate: 45, temperament: 'territorial', height: 1.7,
    description: 'It circles the high fjord cliffs looking for worthy rivals, and its fire burns hotter after every hard fight.',
    learnset: learn([1, 'scratch'], [1, 'growl'], [1, 'ember'], [1, 'smokescreen'], [1, 'dragon-claw'], [1, 'heat-wave'], [12, 'dragon-breath'], [19, 'fire-fang'], [24, 'slash'], [30, 'flamethrower'], [36, 'air-slash'], [39, 'scary-face'], [46, 'fire-spin'], [54, 'inferno'], [62, 'flare-blitz']),
  },
  // ---- Squirtle line (water starter) ----
  {
    id: 'splashpup', types: ['water'], baseStats: stats(44, 48, 65, 50, 64, 43),
    abilities: ['torrent'], growth: 'medium-slow', baseExp: 63, evYield: { def: 1 },
    catchRate: 45, temperament: 'docile', height: 0.5, evolution: { into: 'sealkin', level: 16 },
    description: 'It ducks into its round shell at the first fright, then pops back out to spray whoever startled it.',
    learnset: learn([1, 'tackle'], [1, 'tail-whip'], [3, 'water-gun'], [6, 'withdraw'], [9, 'rapid-spin'], [12, 'bite'], [15, 'water-pulse'], [18, 'protect'], [24, 'aqua-tail'], [27, 'shell-smash'], [30, 'iron-defense'], [33, 'hydro-pump'], [36, 'wave-crash']),
  },
  {
    id: 'sealkin', types: ['water'], baseStats: stats(59, 63, 80, 65, 80, 58),
    abilities: ['torrent'], growth: 'medium-slow', baseExp: 142, evYield: { def: 1, spd: 1 },
    catchRate: 45, temperament: 'docile', height: 1.0, evolution: { into: 'selkira', level: 36 },
    description: 'Its feathery tail is a mark of age, and it grooms it carefully on the rocks between swims.',
    learnset: learn([1, 'tackle'], [1, 'tail-whip'], [1, 'water-gun'], [1, 'withdraw'], [9, 'rapid-spin'], [12, 'bite'], [15, 'water-pulse'], [20, 'protect'], [30, 'aqua-tail'], [35, 'shell-smash'], [40, 'iron-defense'], [45, 'hydro-pump'], [50, 'wave-crash']),
  },
  {
    id: 'selkira', types: ['water'], baseStats: stats(79, 83, 100, 85, 105, 78),
    abilities: ['torrent'], growth: 'medium-slow', baseExp: 239, evYield: { spd: 3 },
    catchRate: 45, temperament: 'docile', height: 1.6,
    description: 'The cannons on its shell can send a jet of water clean across a fjord, though it only fires when truly pushed.',
    learnset: learn([1, 'tackle'], [1, 'tail-whip'], [1, 'water-gun'], [1, 'withdraw'], [9, 'rapid-spin'], [12, 'bite'], [15, 'water-pulse'], [20, 'protect'], [30, 'aqua-tail'], [35, 'shell-smash'], [36, 'flash-cannon'], [42, 'iron-defense'], [49, 'hydro-pump'], [56, 'wave-crash']),
  },
  // ---- Caterpie line ----
  {
    id: 'dewmite', types: ['bug'], baseStats: stats(45, 30, 35, 20, 20, 45),
    abilities: ['shield-dust'], hiddenAbility: 'run-away', growth: 'medium-fast', baseExp: 39, evYield: { hp: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.3, evolution: { into: 'cocoonch', level: 7 },
    description: 'It hides among clover leaves and gives off a sharp smell from its antenna whenever a bird lands nearby.',
    learnset: learn([1, 'tackle'], [1, 'string-shot'], [9, 'bug-bite']),
  },
  {
    id: 'cocoonch', types: ['bug'], baseStats: stats(50, 20, 55, 25, 25, 30),
    abilities: ['shed-skin'], growth: 'medium-fast', baseExp: 72, evYield: { def: 2 },
    catchRate: 120, temperament: 'docile', height: 0.7, evolution: { into: 'auroramoth', level: 10 },
    description: 'Sealed in a hard green shell, it hangs perfectly still while its body is rebuilt inside.',
    learnset: learn([1, 'tackle'], [1, 'string-shot'], [7, 'harden']),
  },
  {
    id: 'auroramoth', types: ['bug', 'flying'], baseStats: stats(60, 45, 50, 90, 80, 70),
    abilities: ['compound-eyes'], hiddenAbility: 'tinted-lens', growth: 'medium-fast', baseExp: 178, evYield: { spa: 2, spd: 1 },
    catchRate: 45, temperament: 'docile', height: 1.1,
    description: 'It drifts from flower to flower on dusty wings, and the powder it sheds can lull or numb a careless foe.',
    learnset: learn([1, 'tackle'], [1, 'string-shot'], [1, 'harden'], [1, 'bug-bite'], [4, 'supersonic'], [8, 'confusion'], [10, 'gust'], [12, 'poison-powder'], [12, 'sleep-powder'], [12, 'stun-spore'], [16, 'psybeam'], [24, 'air-slash'], [32, 'bug-buzz'], [36, 'tailwind'], [44, 'quiver-dance']),
  },
  // ---- Weedle line ----
  {
    id: 'weedle', types: ['bug', 'poison'], baseStats: stats(40, 35, 30, 20, 20, 50),
    abilities: ['shield-dust'], hiddenAbility: 'run-away', growth: 'medium-fast', baseExp: 39, evYield: { spe: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.3, evolution: { into: 'kakuna', level: 7 },
    description: 'The barb on its head carries a stinging venom, so hikers check the undergrowth before they sit down.',
    learnset: learn([1, 'poison-sting'], [1, 'string-shot'], [9, 'bug-bite']),
  },
  {
    id: 'kakuna', types: ['bug', 'poison'], baseStats: stats(45, 25, 50, 25, 25, 35),
    abilities: ['shed-skin'], growth: 'medium-fast', baseExp: 72, evYield: { def: 2 },
    catchRate: 120, temperament: 'docile', height: 0.6, evolution: { into: 'beedrill', level: 10 },
    description: 'It barely moves, but anything that tries to pry it off its branch gets a jab from a poisoned barb.',
    learnset: learn([1, 'poison-sting'], [1, 'string-shot'], [7, 'harden']),
  },
  {
    id: 'beedrill', types: ['bug', 'poison'], baseStats: stats(65, 90, 40, 45, 80, 75),
    abilities: ['swarm'], hiddenAbility: 'sniper', growth: 'medium-fast', baseExp: 178, evYield: { atk: 2, spd: 1 },
    catchRate: 45, temperament: 'aggressive', height: 1.0,
    description: 'Disturb one and the whole swarm comes buzzing out of the trees, stingers first.',
    learnset: learn([1, 'poison-sting'], [1, 'string-shot'], [7, 'harden'], [10, 'twineedle'], [11, 'fury-attack'], [17, 'pursuit'], [20, 'focus-energy'], [23, 'venoshock'], [26, 'assurance'], [32, 'pin-missile'], [35, 'poison-jab'], [38, 'agility']),
  },
  // ---- Pidgey line ----
  {
    id: 'finchlet', types: ['normal', 'flying'], baseStats: stats(40, 45, 40, 35, 35, 56),
    abilities: ['keen-eye', 'tangled-feet'], hiddenAbility: 'big-pecks', growth: 'medium-slow', baseExp: 50, evYield: { spe: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.3, evolution: { into: 'fjordling', level: 18 },
    description: 'A common meadow bird that would much rather flap sand in your eyes than fight fair.',
    learnset: learn([1, 'tackle'], [5, 'sand-attack'], [9, 'gust'], [13, 'quick-attack'], [21, 'twister'], [25, 'feather-dance'], [29, 'agility'], [33, 'wing-attack'], [37, 'roost'], [41, 'tailwind'], [49, 'air-slash'], [53, 'hurricane']),
  },
  {
    id: 'fjordling', types: ['normal', 'flying'], baseStats: stats(63, 60, 55, 50, 50, 71),
    abilities: ['keen-eye', 'tangled-feet'], hiddenAbility: 'big-pecks', growth: 'medium-slow', baseExp: 122, evYield: { spe: 2 },
    catchRate: 120, temperament: 'skittish', height: 1.1, evolution: { into: 'skjaldhawk', level: 36 },
    description: 'It patrols a wide stretch of sky and dives on anything that wanders into its hunting ground.',
    learnset: learn([1, 'tackle'], [5, 'sand-attack'], [9, 'gust'], [13, 'quick-attack'], [22, 'twister'], [27, 'feather-dance'], [32, 'agility'], [37, 'wing-attack'], [42, 'roost'], [47, 'tailwind'], [57, 'air-slash'], [62, 'hurricane']),
  },
  {
    id: 'skjaldhawk', types: ['normal', 'flying'], baseStats: stats(83, 80, 75, 70, 70, 101),
    abilities: ['keen-eye', 'tangled-feet'], hiddenAbility: 'big-pecks', growth: 'medium-slow', baseExp: 216, evYield: { spe: 3 },
    catchRate: 45, temperament: 'territorial', height: 1.5,
    description: 'Its long crest streams behind it as it races the wind high above the fjords.',
    learnset: learn([1, 'tackle'], [5, 'sand-attack'], [9, 'gust'], [13, 'quick-attack'], [22, 'twister'], [27, 'feather-dance'], [32, 'agility'], [38, 'wing-attack'], [44, 'roost'], [50, 'tailwind'], [62, 'air-slash'], [68, 'hurricane']),
  },
  // ---- Rattata line ----
  {
    id: 'nibblet', types: ['normal'], baseStats: stats(30, 56, 35, 25, 35, 72),
    abilities: ['run-away', 'guts'], hiddenAbility: 'hustle', growth: 'medium-fast', baseExp: 51, evYield: { spe: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.3, evolution: { into: 'stashquill', level: 20 },
    description: 'It gnaws on fence posts, crates and anything else in reach to keep its ever-growing teeth in check.',
    learnset: learn([1, 'tackle'], [1, 'tail-whip'], [4, 'quick-attack'], [7, 'focus-energy'], [10, 'bite'], [13, 'pursuit'], [16, 'hyper-fang'], [19, 'assurance'], [22, 'crunch'], [25, 'sucker-punch'], [28, 'super-fang'], [31, 'double-edge']),
  },
  {
    id: 'stashquill', types: ['normal'], baseStats: stats(55, 81, 60, 50, 70, 97),
    abilities: ['run-away', 'guts'], hiddenAbility: 'hustle', growth: 'medium-fast', baseExp: 145, evYield: { spe: 2 },
    catchRate: 127, temperament: 'territorial', height: 0.7,
    description: 'Its stiff whiskers keep it balanced, and its fangs can chew through a cellar door in a single night.',
    learnset: learn([1, 'swords-dance'], [1, 'tackle'], [1, 'tail-whip'], [4, 'quick-attack'], [7, 'focus-energy'], [10, 'bite'], [13, 'pursuit'], [16, 'hyper-fang'], [19, 'assurance'], [20, 'scary-face'], [24, 'crunch'], [29, 'sucker-punch'], [34, 'super-fang'], [39, 'double-edge']),
  },
  // ---- Spearow line ----
  {
    id: 'spearow', types: ['normal', 'flying'], baseStats: stats(40, 60, 30, 31, 31, 70),
    abilities: ['keen-eye'], hiddenAbility: 'sniper', growth: 'medium-fast', baseExp: 52, evYield: { spe: 1 },
    catchRate: 255, temperament: 'aggressive', height: 0.3, evolution: { into: 'fearow', level: 20 },
    description: 'A loud, quarrelsome little bird that chases anything twice its size off its patch of grass.',
    learnset: learn([1, 'peck'], [1, 'growl'], [4, 'leer'], [8, 'pursuit'], [11, 'fury-attack'], [15, 'aerial-ace'], [22, 'assurance'], [25, 'agility'], [29, 'focus-energy'], [32, 'roost'], [36, 'drill-peck']),
  },
  {
    id: 'fearow', types: ['normal', 'flying'], baseStats: stats(65, 90, 65, 61, 61, 100),
    abilities: ['keen-eye'], hiddenAbility: 'sniper', growth: 'medium-fast', baseExp: 155, evYield: { spe: 2 },
    catchRate: 90, temperament: 'territorial', height: 1.2,
    description: 'Its long neck and beak let it snatch fish from the river shallows without slowing its flight.',
    learnset: learn([1, 'peck'], [1, 'growl'], [1, 'pluck'], [4, 'leer'], [8, 'pursuit'], [11, 'fury-attack'], [15, 'aerial-ace'], [23, 'assurance'], [27, 'agility'], [32, 'focus-energy'], [36, 'roost'], [41, 'drill-peck'], [45, 'drill-run']),
  },
  // ---- Ekans (Arbok is not in Sijord yet) ----
  {
    id: 'ekans', types: ['poison'], baseStats: stats(35, 60, 44, 40, 54, 55),
    abilities: ['intimidate', 'shed-skin'], hiddenAbility: 'unnerve', growth: 'medium-fast', baseExp: 58, evYield: { atk: 1 },
    catchRate: 255, temperament: 'territorial', height: 2.0,
    description: 'It slides silently through tall grass and coils around any egg it finds in an unguarded nest.',
    learnset: learn([1, 'leer'], [1, 'wrap'], [4, 'poison-sting'], [9, 'bite'], [12, 'glare'], [17, 'screech'], [20, 'acid'], [28, 'acid-spray'], [33, 'sludge-bomb'], [44, 'coil'], [49, 'gunk-shot']),
  },
  // ---- Pikachu line ----
  {
    id: 'pikachu', types: ['electric'], baseStats: stats(35, 55, 40, 50, 50, 90),
    abilities: ['static'], hiddenAbility: 'lightning-rod', growth: 'medium-fast', baseExp: 112, evYield: { spe: 2 },
    catchRate: 190, temperament: 'skittish', height: 0.4,
    // A Thunder Stone in the main games; until evolution items exist it evolves at Lv 22.
    evolution: { into: 'raichu', level: 22 },
    description: 'Where several gather in a wood, the air crackles with the static stored in their cheeks.',
    learnset: learn([1, 'charm'], [1, 'growl'], [1, 'nasty-plot'], [1, 'nuzzle'], [1, 'play-nice'], [1, 'quick-attack'], [1, 'sweet-kiss'], [1, 'tail-whip'], [1, 'thunder-shock'], [4, 'thunder-wave'], [8, 'double-team'], [12, 'electro-ball'], [16, 'feint'], [20, 'spark'], [24, 'agility'], [28, 'iron-tail'], [32, 'discharge'], [36, 'thunderbolt'], [44, 'thunder']),
  },
  {
    id: 'raichu', types: ['electric'], baseStats: stats(60, 90, 55, 90, 80, 110),
    abilities: ['static'], hiddenAbility: 'lightning-rod', growth: 'medium-fast', baseExp: 218, evYield: { spe: 3 },
    catchRate: 75, temperament: 'territorial', height: 0.8,
    description: 'Its long tail grounds the charge it builds up, leaving scorch marks wherever it has rested.',
    learnset: learn([1, 'charm'], [1, 'growl'], [1, 'nasty-plot'], [1, 'nuzzle'], [1, 'play-nice'], [1, 'quick-attack'], [1, 'sweet-kiss'], [1, 'tail-whip'], [1, 'thunder-shock'], [4, 'thunder-wave'], [8, 'double-team'], [12, 'electro-ball'], [16, 'feint'], [20, 'spark'], [22, 'thunder-punch'], [24, 'agility'], [28, 'iron-tail'], [32, 'discharge'], [36, 'thunderbolt'], [44, 'thunder']),
  },
  // ---- Nidoran (Nidorina and Nidorino are not in Sijord yet) ----
  {
    id: 'nidoran-f', types: ['poison'], baseStats: stats(55, 47, 52, 40, 40, 41),
    abilities: ['poison-point'], hiddenAbility: 'hustle', growth: 'medium-slow', baseExp: 55, evYield: { hp: 1 },
    catchRate: 235, temperament: 'docile', height: 0.4,
    description: 'Small and gentle, it only raises its poison barbs when it truly has to defend itself.',
    learnset: learn([1, 'growl'], [1, 'poison-sting'], [5, 'scratch'], [10, 'tail-whip'], [15, 'fury-swipes'], [25, 'double-kick'], [30, 'bite'], [35, 'helping-hand'], [40, 'toxic'], [45, 'flatter'], [50, 'crunch'], [55, 'earth-power']),
  },
  {
    id: 'nidoran-m', types: ['poison'], baseStats: stats(46, 57, 40, 40, 40, 50),
    abilities: ['poison-point'], hiddenAbility: 'hustle', growth: 'medium-slow', baseExp: 55, evYield: { atk: 1 },
    catchRate: 235, temperament: 'territorial', height: 0.5,
    description: 'It swivels its big ears toward every rustle, and the horn on its head hides a stinging poison.',
    learnset: learn([1, 'leer'], [1, 'poison-sting'], [5, 'peck'], [10, 'focus-energy'], [15, 'fury-attack'], [25, 'double-kick'], [30, 'horn-attack'], [35, 'helping-hand'], [40, 'toxic'], [45, 'flatter'], [50, 'poison-jab'], [55, 'earth-power']),
  },
  // ---- Clefairy line ----
  {
    id: 'cloveret', types: ['fairy'], baseStats: stats(70, 45, 48, 60, 65, 35),
    abilities: ['magic-guard'], hiddenAbility: 'friend-guard', growth: 'fast', baseExp: 113, evYield: { hp: 2 },
    catchRate: 150, temperament: 'skittish', height: 0.6,
    // A Moon Stone in the main games; until evolution items exist it evolves at Lv 22.
    evolution: { into: 'luckhare', level: 22 },
    description: 'Shy and seldom seen, it is said to dance in slow circles on the hilltops when the moon is full.',
    learnset: learn([1, 'charm'], [1, 'defense-curl'], [1, 'disarming-voice'], [1, 'growl'], [1, 'pound'], [1, 'sing'], [1, 'sweet-kiss'], [4, 'stored-power'], [16, 'life-dew'], [24, 'moonlight'], [32, 'meteor-mash'], [36, 'follow-me'], [40, 'cosmic-power'], [44, 'moonblast']),
  },
  {
    id: 'luckhare', types: ['fairy'], baseStats: stats(95, 70, 73, 95, 90, 60),
    abilities: ['magic-guard'], growth: 'fast', baseExp: 217, evYield: { hp: 3 },
    catchRate: 25, temperament: 'skittish', height: 1.3,
    description: 'Its sharp ears catch a whisper from across the valley, so it is usually hidden long before anyone arrives.',
    learnset: learn([1, 'charm'], [1, 'defense-curl'], [1, 'disarming-voice'], [1, 'growl'], [1, 'pound'], [1, 'sing'], [1, 'sweet-kiss'], [4, 'stored-power'], [16, 'life-dew'], [24, 'moonlight'], [32, 'meteor-mash'], [36, 'follow-me'], [40, 'cosmic-power'], [44, 'moonblast']),
  },
  // ---- Vulpix (Ninetales is not in Sijord yet) ----
  {
    id: 'vulpix', types: ['fire'], baseStats: stats(38, 41, 40, 50, 65, 65),
    abilities: ['flash-fire'], growth: 'medium-fast', baseExp: 60, evYield: { spe: 1 },
    catchRate: 190, temperament: 'skittish', height: 0.6,
    description: 'Its six curled tails grow fuller and warmer as it matures, and glow faintly on cold evenings.',
    learnset: learn([1, 'ember'], [1, 'tail-whip'], [8, 'quick-attack'], [16, 'incinerate'], [20, 'confuse-ray'], [24, 'will-o-wisp'], [28, 'extrasensory'], [32, 'flamethrower'], [40, 'fire-spin'], [48, 'inferno'], [52, 'fire-blast']),
  },
  // ---- Jigglypuff (Wigglytuff is not in Sijord yet) ----
  {
    id: 'jigglypuff', types: ['normal', 'fairy'], baseStats: stats(115, 45, 20, 45, 25, 20),
    abilities: ['competitive'], hiddenAbility: 'friend-guard', growth: 'fast', baseExp: 95, evYield: { hp: 2 },
    catchRate: 170, temperament: 'docile', height: 0.5,
    description: 'It puffs up its round body and hums a lullaby that few listeners manage to stay awake through.',
    learnset: learn([1, 'charm'], [1, 'defense-curl'], [1, 'disarming-voice'], [1, 'pound'], [1, 'sing'], [1, 'sweet-kiss'], [4, 'echoed-voice'], [8, 'covet'], [16, 'round'], [20, 'rest'], [24, 'body-slam'], [36, 'hyper-voice'], [44, 'double-edge']),
  },
  // ---- Zubat (Golbat is not in Sijord yet) ----
  {
    id: 'zubat', types: ['poison', 'flying'], baseStats: stats(40, 45, 35, 30, 40, 55),
    abilities: ['inner-focus'], growth: 'medium-fast', baseExp: 49, evYield: { spe: 1 },
    catchRate: 255, temperament: 'aggressive', height: 0.8,
    description: 'It flits through the dark with its eyes shut, steering by the echoes of its own thin cries.',
    learnset: learn([1, 'absorb'], [1, 'supersonic'], [5, 'astonish'], [15, 'poison-fang'], [25, 'air-cutter'], [30, 'bite'], [40, 'venoshock'], [45, 'confuse-ray'], [50, 'air-slash'], [55, 'leech-life']),
  },
  // ---- Oddish line (Vileplume is not in Sijord yet) ----
  {
    id: 'oddish', types: ['grass', 'poison'], baseStats: stats(45, 50, 55, 75, 65, 30),
    abilities: ['chlorophyll'], hiddenAbility: 'run-away', growth: 'medium-slow', baseExp: 64, evYield: { spa: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.5, evolution: { into: 'gloom', level: 21 },
    description: 'By day it plants itself in the soil to rest; by night it waddles across the meadow scattering seeds.',
    learnset: learn([1, 'absorb'], [1, 'growth'], [4, 'acid'], [8, 'sweet-scent'], [12, 'mega-drain'], [14, 'poison-powder'], [16, 'stun-spore'], [18, 'sleep-powder'], [20, 'giga-drain'], [24, 'toxic'], [28, 'moonblast'], [36, 'moonlight']),
  },
  {
    id: 'gloom', types: ['grass', 'poison'], baseStats: stats(60, 65, 70, 85, 75, 40),
    abilities: ['chlorophyll'], hiddenAbility: 'stench', growth: 'medium-slow', baseExp: 138, evYield: { spa: 2 },
    catchRate: 120, temperament: 'docile', height: 0.8,
    description: 'The sticky nectar dribbling from its mouth smells dreadful, yet a few odd collectors adore it.',
    learnset: learn([1, 'absorb'], [1, 'growth'], [1, 'acid'], [1, 'sweet-scent'], [12, 'mega-drain'], [14, 'poison-powder'], [16, 'stun-spore'], [18, 'sleep-powder'], [20, 'giga-drain'], [26, 'toxic'], [32, 'moonblast'], [44, 'moonlight']),
  },
  // ---- Meowth (Persian is not in Sijord yet) ----
  {
    id: 'meowth', types: ['normal'], baseStats: stats(40, 45, 35, 40, 40, 90),
    abilities: ['pickup', 'technician'], hiddenAbility: 'unnerve', growth: 'medium-fast', baseExp: 58, evYield: { spe: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.4,
    description: 'It prowls the village lanes at dusk for anything that glints, especially coins dropped near the market.',
    learnset: learn([1, 'fake-out'], [1, 'growl'], [4, 'feint'], [8, 'scratch'], [12, 'pay-day'], [16, 'bite'], [24, 'assurance'], [29, 'fury-swipes'], [32, 'screech'], [36, 'slash'], [40, 'nasty-plot'], [44, 'play-rough']),
  },
  // ---- Psyduck (Golduck is not in Sijord yet) ----
  {
    id: 'psyduck', types: ['water'], baseStats: stats(50, 52, 48, 65, 50, 55),
    abilities: ['damp', 'cloud-nine'], growth: 'medium-fast', baseExp: 64, evYield: { spa: 1 },
    catchRate: 190, temperament: 'docile', height: 0.8,
    description: 'Its constant headaches sometimes unleash strange psychic power that it never remembers using.',
    learnset: learn([1, 'scratch'], [1, 'tail-whip'], [3, 'water-gun'], [6, 'confusion'], [9, 'fury-swipes'], [12, 'water-pulse'], [18, 'zen-headbutt'], [21, 'screech'], [24, 'aqua-tail'], [27, 'soak'], [34, 'amnesia']),
  },
  // ---- Mankey (Primeape is not in Sijord yet) ----
  {
    id: 'mankey', types: ['fighting'], baseStats: stats(40, 80, 35, 35, 45, 70),
    abilities: ['vital-spirit', 'anger-point'], hiddenAbility: 'defiant', growth: 'medium-fast', baseExp: 61, evYield: { atk: 1 },
    catchRate: 190, temperament: 'aggressive', height: 0.5,
    description: 'Quick to anger and slow to cool off, it will chase a trainer across the meadow over an imagined slight.',
    learnset: learn([1, 'covet'], [1, 'focus-energy'], [1, 'leer'], [1, 'scratch'], [5, 'fury-swipes'], [12, 'seismic-toss'], [17, 'swagger'], [22, 'cross-chop'], [26, 'assurance'], [33, 'close-combat'], [36, 'screech'], [40, 'stomping-tantrum']),
  },
  // ---- Growlithe line ----
  {
    id: 'hjordpup', types: ['fire'], baseStats: stats(55, 70, 45, 70, 50, 60),
    abilities: ['intimidate', 'flash-fire'], hiddenAbility: 'justified', growth: 'slow', baseExp: 70, evYield: { atk: 1 },
    catchRate: 190, temperament: 'territorial', height: 0.7,
    // A Fire Stone in the main games; until evolution items exist it evolves at Lv 32.
    evolution: { into: 'shepherion', level: 32 },
    description: 'Loyal and brave, it barks fiercely to guard its trainer and stands its ground against much bigger foes.',
    learnset: learn([1, 'ember'], [1, 'leer'], [4, 'howl'], [8, 'bite'], [12, 'flame-wheel'], [16, 'helping-hand'], [20, 'agility'], [24, 'fire-fang'], [28, 'retaliate'], [32, 'crunch'], [36, 'take-down'], [40, 'flamethrower'], [48, 'play-rough'], [56, 'flare-blitz']),
  },
  {
    id: 'shepherion', types: ['fire'], baseStats: stats(90, 110, 80, 100, 80, 95),
    abilities: ['intimidate', 'flash-fire'], hiddenAbility: 'justified', growth: 'slow', baseExp: 194, evYield: { atk: 2 },
    catchRate: 75, temperament: 'territorial', height: 1.9,
    description: 'A proud hound that crosses the whole valley in an afternoon, running as if the wind carried it.',
    learnset: learn([1, 'ember'], [1, 'leer'], [4, 'howl'], [8, 'bite'], [12, 'flame-wheel'], [16, 'helping-hand'], [20, 'agility'], [24, 'fire-fang'], [28, 'retaliate'], [32, 'crunch'], [32, 'extreme-speed'], [36, 'take-down'], [40, 'flamethrower'], [48, 'play-rough'], [56, 'flare-blitz']),
  },
  // ---- Poliwag (Poliwhirl is not in Sijord yet) ----
  {
    id: 'poliwag', types: ['water'], baseStats: stats(40, 50, 40, 40, 40, 90),
    abilities: ['water-absorb', 'damp'], growth: 'medium-slow', baseExp: 60, evYield: { spe: 1 },
    catchRate: 255, temperament: 'skittish', height: 0.6,
    description: 'It waddles clumsily on its new legs, so it spends most of its day paddling around the lake shallows.',
    learnset: learn([1, 'water-gun'], [1, 'hypnosis'], [6, 'pound'], [12, 'mud-shot'], [18, 'bubble-beam'], [30, 'body-slam'], [36, 'earth-power'], [42, 'hydro-pump'], [54, 'double-edge']),
  },
  // ---- Abra (Kadabra is not in Sijord yet) ----
  {
    id: 'abra', types: ['psychic'], baseStats: stats(25, 20, 15, 105, 55, 90),
    abilities: ['inner-focus'], hiddenAbility: 'magic-guard', growth: 'medium-slow', baseExp: 62, evYield: { spa: 1 },
    catchRate: 200, temperament: 'skittish', height: 0.9,
    // As in the main games, Teleport is the only move it learns by level.
    description: 'It dozes most of the day and vanishes the instant it senses danger, which makes it very hard to catch.',
    learnset: learn([1, 'teleport']),
  },
  // ---- Bellsprout (Weepinbell is not in Sijord yet) ----
  {
    id: 'bellsprout', types: ['grass', 'poison'], baseStats: stats(50, 75, 35, 70, 30, 40),
    abilities: ['chlorophyll'], growth: 'medium-slow', baseExp: 60, evYield: { atk: 1 },
    catchRate: 255, temperament: 'docile', height: 0.7,
    description: 'It sways on its thin stem and snaps its vines out at insects that drift too close.',
    learnset: learn([1, 'vine-whip'], [7, 'growth'], [11, 'wrap'], [13, 'sleep-powder'], [15, 'poison-powder'], [17, 'stun-spore'], [23, 'acid'], [27, 'knock-off'], [29, 'sweet-scent'], [39, 'razor-leaf'], [41, 'poison-jab'], [47, 'slam'], [52, 'power-whip']),
  },
  // ---- Geodude (Graveler is not in Sijord yet) ----
  {
    id: 'geodude', types: ['rock', 'ground'], baseStats: stats(40, 80, 100, 30, 30, 20),
    abilities: ['rock-head', 'sturdy'], growth: 'medium-slow', baseExp: 60, evYield: { def: 1 },
    catchRate: 255, temperament: 'territorial', height: 0.4,
    description: 'Hikers often sit on it by mistake, and it makes them regret it the moment it sprouts arms.',
    learnset: learn([1, 'tackle'], [1, 'defense-curl'], [6, 'rock-polish'], [12, 'bulldoze'], [16, 'rock-throw'], [18, 'smack-down'], [24, 'self-destruct'], [30, 'rock-blast'], [34, 'earthquake'], [36, 'explosion'], [40, 'double-edge'], [42, 'stone-edge']),
  },
  // ---- Ponyta (Rapidash is not in Sijord yet) ----
  {
    id: 'ponyta', types: ['fire'], baseStats: stats(50, 85, 55, 65, 65, 90),
    abilities: ['run-away', 'flash-fire'], hiddenAbility: 'flame-body', growth: 'medium-fast', baseExp: 82, evYield: { spe: 1 },
    catchRate: 190, temperament: 'skittish', height: 1.0,
    description: 'Its fiery mane cannot burn anyone it trusts, and it gallops faster every season as its legs grow strong.',
    learnset: learn([1, 'tackle'], [1, 'growl'], [5, 'tail-whip'], [10, 'ember'], [15, 'flame-charge'], [20, 'agility'], [25, 'flame-wheel'], [30, 'stomp'], [35, 'fire-spin'], [41, 'take-down'], [45, 'inferno'], [50, 'fire-blast'], [55, 'flare-blitz']),
  },
  // ---- Eevee (its evolutions are not in Sijord yet) ----
  {
    id: 'eevee', types: ['normal'], baseStats: stats(55, 55, 50, 45, 65, 55),
    abilities: ['run-away', 'adaptability'], growth: 'medium-fast', baseExp: 65, evYield: { spd: 1 },
    catchRate: 45, temperament: 'skittish', height: 0.3,
    description: 'Its unsettled genes leave it brimming with hidden potential, and trainers still argue about what it might become.',
    learnset: learn([1, 'covet'], [1, 'growl'], [1, 'helping-hand'], [1, 'tackle'], [1, 'tail-whip'], [5, 'sand-attack'], [10, 'quick-attack'], [15, 'baby-doll-eyes'], [20, 'swift'], [25, 'bite'], [40, 'take-down'], [45, 'charm'], [50, 'double-edge']),
  },
];

const BUILT: SpeciesData[] = LIST.map((s) => {
  const visual = POKEMON_VISUALS[s.id];
  if (!visual) throw new Error(`Species "${s.id}" has no POKEMON_VISUALS entry`);
  return { ...s, name: visual.name, dex: `#${String(visual.dex).padStart(3, '0')}` };
});

export const SPECIES: Record<string, SpeciesData> = Object.fromEntries(BUILT.map((s) => [s.id, s]));
export const SPECIES_IDS = BUILT.map((s) => s.id);

export function species(id: string): SpeciesData {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species "${id}"`);
  return s;
}

/** The three partner choices at Professor Hazel's lab. */
export const STARTERS = ['fernfawn', 'cindlet', 'splashpup'] as const;
