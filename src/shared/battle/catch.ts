import type { MajorStatus } from './types';
import type { Rng } from './rng';

/**
 * Catching (DESIGN §5.2): the mainline core with a level-difference term, a softened curve and
 * modifiers for how the ball was thrown. Shared so an in-battle throw and an overworld throw
 * use the same maths, and so the server can run it later.
 */

/** Ball multipliers. */
export const BALL_BONUS: Record<string, number> = {
  'poke-ball': 1,
  'great-ball': 1.5,
  'ultra-ball': 2,
};

/** How the ball reached the target. */
export type ThrowKind = 'battle' | 'overworld' | 'unaware';
const THROW_MOD: Record<ThrowKind, number> = { battle: 1, overworld: 0.6, unaware: 1.5 };

export interface CatchInput {
  maxHp: number;
  hp: number;
  /** Species catch rate, 3 (hardest) to 255 (easiest). */
  catchRate: number;
  ball: string;
  status?: MajorStatus;
  /** The wild creature's level. */
  level: number;
  /** The thrower's strongest party member's level. */
  partyLevel: number;
  /** The thrower's current level cap. */
  cap: number;
  throw: ThrowKind;
  /** Class and skill multiplier (Tamer skills, the Ranger's small edge). */
  classMod?: number;
  /** An Alpha (DESIGN §4.6) fights the ball much harder. */
  alpha?: boolean;
}

/** How much harder an Alpha is to catch. */
export const ALPHA_CATCH = 0.35;

/**
 * Easier on weaker targets (up to x1.25), steeply harder on stronger ones.
 * `d` is the wild level minus the thrower's reference level.
 */
export function levelMod(d: number): number {
  if (d <= 0) return Math.min(1.25, 1 + 0.02 * -d);
  return 1 / (1 + 0.15 * d + 0.02 * d * d);
}

/** Status multiplier: sleep and freeze help most. */
export function statusMod(status?: MajorStatus): number {
  if (status === 'slp' || status === 'frz') return 2.5;
  if (status) return 1.5;
  return 1;
}

/** Probability that the ball holds, 0-1. */
export function catchChance(i: CatchInput): number {
  const maxHp = Math.max(1, i.maxHp);
  const hp = Math.max(1, Math.min(maxHp, i.hp));
  let a = ((3 * maxHp - 2 * hp) * i.catchRate * (BALL_BONUS[i.ball] ?? 1) * statusMod(i.status)) / (3 * maxHp);
  const ref = Math.min(i.partyLevel, i.cap);
  a *= levelMod(i.level - ref);
  a *= THROW_MOD[i.throw];
  a *= i.classMod ?? 1;
  if (i.level > i.cap) a *= 0.5;
  if (i.alpha) a *= ALPHA_CATCH;
  return Math.pow(Math.max(0, Math.min(1, a / 255)), 0.75);
}

export interface CatchRoll {
  caught: boolean;
  /** Wobbles to show before it holds or breaks out (0-3). */
  shakes: number;
}

/**
 * Roll a throw as four shake checks whose combined odds equal `chance`, so the number of
 * wobbles tells the player how close it was.
 */
export function rollCatch(chance: number, rng: Rng): CatchRoll {
  if (chance >= 1) return { caught: true, shakes: 3 };
  const each = Math.pow(Math.max(0, chance), 0.25);
  let passed = 0;
  while (passed < 4 && rng.next() < each) passed++;
  return { caught: passed === 4, shakes: Math.min(3, passed) };
}
