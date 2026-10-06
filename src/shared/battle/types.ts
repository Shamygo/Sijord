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
  /**
   * Special behaviour that needs code in the engine. Fixed-damage and variable-power moves
   * (Seismic Toss, Super Fang, Electro Ball) list power 0, as the games show "—".
   */
  special?:
    | 'protect' | 'fake-out' | 'helping-hand' | 'follow-me' | 'tailwind' | 'leech-seed'
    /** Ends a wild battle (the user flees); fails in trainer battles or beside an ally. */
    | 'teleport'
    /** Hits through Protect. */
    | 'feint'
    /** Raises the user's critical-hit stage by 2 until it leaves the field. */
    | 'focus-energy'
    /** Wrap, Fire Spin: the target takes 1/8 of its max HP for 4-5 turns. */
    | 'bind'
    /** Sleeps for two turns and restores all HP and status. */
    | 'rest'
    /** Makes the target pure Water type. */
    | 'soak'
    /** 1.5x power against a held item, which is knocked away for the rest of the battle. */
    | 'knock-off'
    /** Burns up the target's berry. */
    | 'incinerate'
    /** Only works if the target is about to use a damaging move. */
    | 'sucker-punch'
    /** Self-Destruct and Explosion: the user faints. Blocked by Damp. */
    | 'self-destruct'
    /** Damage equal to the user's level. */
    | 'seismic-toss'
    /** Damage equal to half the target's current HP. */
    | 'super-fang'
    /** Power from the speed ratio: 40 / 60 / 80 / 120 / 150. */
    | 'electro-ball'
    /** 20 power plus 20 for every stage the user's stats are raised. */
    | 'stored-power'
    /** Double power against a poisoned target. */
    | 'venoshock'
    /** Double power if the target was already hurt this turn. */
    | 'assurance'
    /** Frees the user from Leech Seed and binding moves. */
    | 'rapid-spin';
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
  /** National Pokédex number for display, e.g. "#001". */
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
  /** Short dex entry (original Sijord text). */
  description: string;
  /** Height in metres, as listed in the Pokédex. Display sizes live with the models. */
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
