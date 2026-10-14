import type { TypeName } from './battle/types';
import { ITEMS, type ArmourSlot } from './items';

/**
 * What the armour a trainer wears adds up to (DESIGN §5.4, §6.2): Defence softens a charging
 * Pokémon's hit, resistances soften hits of one type further, Calm makes wild Pokémon slower to
 * turn on you, and Warmth keeps the cold out (`temperature.ts`).
 */
export const ARMOUR = {
  /** No mix of armour shrugs off more than this share of a type's hit. */
  maxResist: 0.6,
  /** DESIGN §5.3: Calm takes 0.05 to 0.25 off the chance a creature turns on you. */
  maxCalm: 0.25,
};

export interface ArmourStats {
  defence: number;
  /** °C of warmth. */
  warmth: number;
  /** Taken off a wild creature's aggression (DESIGN §5.3). */
  calm: number;
  /** Share of a hit of each type taken off. */
  resist: Partial<Record<TypeName, number>>;
}

/** Add up what's worn (pieces no longer in the bag don't count). */
export function armourStats(equipped: Partial<Record<ArmourSlot, string>> | undefined, bag: Record<string, number> | undefined): ArmourStats {
  const out: ArmourStats = { defence: 0, warmth: 0, calm: 0, resist: {} };
  for (const id of Object.values(equipped ?? {})) {
    const a = id && bag?.[id] ? ITEMS[id]?.armour : undefined;
    if (!a) continue;
    out.defence += a.defence;
    out.warmth += a.warmth ?? 0;
    out.calm += a.calm ?? 0;
    for (const [t, r] of Object.entries(a.resist ?? {}) as [TypeName, number][]) out.resist[t] = Math.min(ARMOUR.maxResist, (out.resist[t] ?? 0) + r);
  }
  out.calm = Math.min(ARMOUR.maxCalm, out.calm);
  return out;
}

/** The share of a hit of this type the armour takes off. */
export function resistTo(stats: Pick<ArmourStats, 'resist'>, type: string | undefined): number {
  return type ? stats.resist[type as TypeName] ?? 0 : 0;
}

/**
 * How much nearer than usual a territorial or aggressive creature lets you come before it squares
 * up: at full Calm, half as near.
 */
export function calmReach(calm: number): number {
  return 1 - 2 * Math.min(ARMOUR.maxCalm, Math.max(0, calm));
}

/** Hide (DESIGN §6.3): furred and scaly wild Pokémon sometimes leave a scrap behind when beaten. */
export const HIDE = { item: 'hide', chance: 0.35 };
const HIDE_TYPES = new Set(['normal', 'fire', 'electric', 'fighting', 'poison', 'ground', 'dark', 'ice', 'dragon']);
/** Feathers, shells, leaves, fins, stone and spirits: no hide there. */
const NO_HIDE = new Set(['flying', 'bug', 'grass', 'water', 'rock', 'steel', 'ghost', 'fairy']);

/** Whether a Pokémon of these types has hide to shed. */
export function shedsHide(types: readonly string[]): boolean {
  return types.some((t) => HIDE_TYPES.has(t)) && !types.some((t) => NO_HIDE.has(t));
}

/** Hide left behind by the Pokémon beaten in a battle (their types). `rand` returns [0, 1). */
export function rollHide(beaten: readonly (readonly string[])[], rand: () => number): number {
  let n = 0;
  for (const types of beaten) if (shedsHide(types) && rand() < HIDE.chance) n++;
  return n;
}
