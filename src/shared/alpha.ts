import { createCreature } from './battle/creature';
import { Rng } from './battle/rng';
import { STATS, type Creature, type StatTable } from './battle/types';
import { wildPrize } from './economy';

/**
 * Alpha Pokémon (DESIGN §4.6, §12.3): one big, furious creature guarding a lair, far stronger
 * than anything else in the region. Red glowing eyes, half again as big, three perfect stats.
 * It charges any trainer who comes close. Beat it for a prize, or catch it for a partner that
 * stays an Alpha. Once it's beaten or caught it's gone until the next day, for both friends.
 */
export interface AlphaLair {
  id: string;
  species: string;
  level: number;
  /** Where it lives (world metres). */
  x: number;
  z: number;
  /** Where the lair is, for the toast when it first shows itself. */
  place: string;
}

/** Hearthmeadow's Alpha (about one per km², DESIGN §12.3): a Ponyta between the western mesas. */
export const ALPHA_LAIRS: readonly AlphaLair[] = [
  { id: 'mesa-ponyta', species: 'ponyta', level: 18, x: 300, z: 100, place: 'between the western mesas' },
];

export const ALPHA = {
  /** Size against an ordinary one of its species. */
  scale: 1.7,
  /** Shows up when a trainer comes this close to its lair. */
  spawn: 140,
  /** Notices a trainer this close. */
  notice: 18,
  /** Seconds it squares up to a trainer it has noticed before it charges. */
  roar: 1.2,
  /** Stats rolled perfect (31). */
  perfect: 3,
  /** Eaten in battle at half HP, which drags the fight out. */
  item: 'sitrus-berry',
  /** Its lunge is a stronger move than an ordinary charge (TRAINER_HP.chargePower 80): three hits floor an unarmoured trainer. */
  chargePower: 100,
  /** Back the next day (UTC), so both friends agree on when. */
  dayMs: 86_400_000,
};

/** What beating one is worth, on top of nothing else from the battle. */
export const ALPHA_REWARD = {
  /** Trainer experience, for beating or catching it. */
  xp: 120,
  /** Prize money, as a multiple of an ordinary wild win at its level. */
  prizeMult: 3,
  /** What it was guarding. */
  items: { 'great-ball': 1 } as Record<string, number>,
};

export function alphaDay(now: number): number {
  return Math.floor(now / ALPHA.dayMs);
}

/** Shared key for today's Alpha in a lair: taken (beaten or caught) by anyone, it's gone for everyone. */
export function alphaKey(lair: AlphaLair, day: number): string {
  return `alpha:${lair.id}:${day}`;
}

/** Keys from an older day are dropped from a save: that Alpha is back. Anything else in a hand-edited save is ignored. */
export function currentAlphaKeys(keys: unknown, day: number): string[] {
  if (!Array.isArray(keys)) return [];
  return keys.filter((k): k is string => typeof k === 'string' && k.startsWith('alpha:') && k.endsWith(`:${day}`));
}

export function alphaPrize(level: number): number {
  return wildPrize([level]) * ALPHA_REWARD.prizeMult;
}

/**
 * The Alpha itself. `seed` decides its nature, ability and which stats are perfect, so two
 * friends roll the same one; `uid` stays per machine (two catches in a race are two creatures).
 */
export function alphaCreature(lair: AlphaLair, seed: number, uid?: string): Creature {
  const rng = new Rng(seed);
  const perfect = rng.shuffle([...STATS]).slice(0, ALPHA.perfect);
  const ivs: Partial<StatTable> = {};
  for (const s of STATS) ivs[s] = perfect.includes(s) ? 31 : rng.int(0, 31);
  const c = createCreature(lair.species, lair.level, rng, { ivs, item: ALPHA.item, uid });
  c.alpha = true;
  return c;
}
