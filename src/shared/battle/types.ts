/**
 * Core data types for creatures and battles. Shared by the browser client and (later) the
 * authoritative server, so nothing here may touch the DOM or Three.js.
 */

export const TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type TypeName = (typeof TYPES)[number];

export const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatName = (typeof STATS)[number];
export type StatTable = Record<StatName, number>;

/** Stats that take in-battle stages, plus accuracy and evasion. */
export type BoostName = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion';
export type Boosts = Record<BoostName, number>;

export type MajorStatus = 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';

export type GrowthRate = 'fast' | 'medium-fast' | 'medium-slow' | 'slow';

/** How a wild creature reacts when things go wrong (DESIGN §5.3). */
export type Temperament = 'skittish' | 'docile' | 'territorial' | 'aggressive';

export type MoveCategory = 'physical' | 'special' | 'status';

/**
 * Who a move hits, in double-battle terms. "Adjacent" is everyone on the field in a double
 * battle (every position touches every other).
 */
export type MoveTarget =
  | 'normal' // one adjacent creature, chosen (usually a foe)
  | 'adjacent-foe' // one foe, chosen
  | 'all-adjacent-foes' // both foes (spread)
  | 'all-adjacent' // both foes and the ally (spread)
  | 'self'
  | 'ally'
  | 'foe-side' // the foes' side as a whole (no per-target checks)
  | 'ally-side'; // your own side as a whole

export interface MoveSecondary {
  /** Percent chance, 0-100. */
  chance: number;
  status?: MajorStatus;
  /** Inflict confusion. */
  confuse?: boolean;
  flinch?: boolean;
  /** Stage changes applied to the target. */
  boosts?: Partial<Boosts>;
  /** Stage changes applied to the user. */
  self?: Partial<Boosts>;
}

export interface MoveData {
  id: string;
  name: string;
  type: TypeName;
  category: MoveCategory;
  /** Base power; 0 for status moves. */
  power: number;
  /** Percent; `true` means it never misses. */
  accuracy: number | true;
  pp: number;
  priority: number;
  target: MoveTarget;
  contact?: boolean;
  /** Higher critical-hit stage (Razor Leaf and friends). */
  critStage?: number;
  /** Hits a fixed range of times, e.g. [2, 2] or [2, 5]. */
  multihit?: [number, number];
  /** Fraction of damage dealt that the user regains. */
  drain?: number;
  /** Fraction of damage dealt that the user takes as recoil. */
  recoil?: number;
  /** Fraction of the user's max HP restored (Roost). */
  heal?: number;
  /** Status the move inflicts as its main effect (status moves). */
  status?: MajorStatus;
  /** Confusion as a main effect. */
  confuse?: boolean;
  /** Stage changes to the target as the main effect (status moves). */
  boosts?: Partial<Boosts>;
  /** Stage changes to the user that always happen (status moves, Close Combat drops). */
  selfBoosts?: Partial<Boosts>;
  secondary?: MoveSecondary;
  /** Special behaviour that needs code. */
  special?: 'protect' | 'fake-out' | 'helping-hand' | 'follow-me' | 'tailwind' | 'leech-seed';
  /** Powder and spore moves (Grass types are immune). */
  powder?: boolean;
  sound?: boolean;
  /** Short line for the move info panel. */
  description: string;
}

export interface AbilityData {
  id: string;
  name: string;
  description: string;
}

export interface LearnEntry {
  level: number;
  move: string;
}

export interface SpeciesData {
  id: string;
  /** Dex number, e.g. "S001" for Sijord originals. */
  dex: string;
  name: string;
  types: [TypeName] | [TypeName, TypeName];
  baseStats: StatTable;
  /** Regular abilities; a wild creature rolls one of these. */
  abilities: string[];
  hiddenAbility?: string;
  growth: GrowthRate;
  /** Base experience yield when defeated. */
  baseExp: number;
  /** Effort values given to whoever defeats it. */
  evYield: Partial<StatTable>;
  /** 3 (hardest) to 255 (easiest), as in the mainline games. */
  catchRate: number;
  temperament: Temperament;
  learnset: LearnEntry[];
  evolution?: { into: string; level: number };
  /** Short dex entry. */
  description: string;
  /** Rough height in metres, also used by the world for spacing. */
  height: number;
}

export interface NatureData {
  name: string;
  plus?: Exclude<StatName, 'hp'>;
  minus?: Exclude<StatName, 'hp'>;
}

/** A move slot on a creature. */
export interface MoveSlot {
  id: string;
  pp: number;
}

/**
 * A creature the player owns (or a wild/trainer creature before battle). This is what is
 * saved; everything derived (stats, max HP) is recomputed from it.
 */
export interface Creature {
  uid: string;
  species: string;
  nickname?: string;
  level: number;
  /** Total experience points earned. */
  xp: number;
  /** Experience earned at the level cap, applied when the cap rises (at most one level's worth). */
  bankedXp?: number;
  nature: string;
  ivs: StatTable;
  evs: StatTable;
  ability: string;
  moves: MoveSlot[];
  /** Current HP; persists between battles. */
  hp: number;
  status?: MajorStatus;
  item?: string;
  /** Trainer name of the original owner, for caught creatures. */
  ot?: string;
}

export function emptyBoosts(): Boosts {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
}

export function statTable(v: number): StatTable {
  return { hp: v, atk: v, def: v, spa: v, spd: v, spe: v };
}
