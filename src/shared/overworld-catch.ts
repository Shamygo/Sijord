import type { Temperament } from './battle/types';

/**
 * Overworld catching rules that don't depend on rendering (DESIGN §5.1-5.4): whether a wild
 * creature has noticed the trainer (an unaware throw is worth x1.5), how it reacts to breaking
 * out of a ball, and the trainer's own health when something charges them.
 */

/** A creature notices what is within this angle either side of where it faces. */
export const WILD_VIEW_HALF_ANGLE = (105 * Math.PI) / 180;

export interface AwarenessInput {
  /** The wild creature's overworld state ('graze', 'wander', 'watch', ...). */
  state: string;
  /** Seconds it stays alert after being disturbed (a failed throw, a ball landing nearby). */
  alert: number;
  /** Creature position and facing (yaw 0 faces +Z). */
  x: number;
  z: number;
  yaw: number;
  /** Trainer position. */
  px: number;
  pz: number;
  /** Trainer is sneaking (crouched). */
  crouched?: boolean;
}

function wrapAngle(a: number): number {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * True when the creature hasn't noticed the trainer: it is calmly grazing or wandering, isn't
 * still alert from an earlier scare, and the trainer is behind it (or sneaking). One eating a
 * Treat counts as unaware from any side, unless it is still alert.
 */
export function isUnaware(i: AwarenessInput): boolean {
  if (i.alert > 0) return false;
  // Busy with a Treat: it doesn't look up, whichever way it faces.
  if (i.state === 'eat') return true;
  if (i.state !== 'graze' && i.state !== 'wander') return false;
  if (i.crouched) return true;
  const toTrainer = Math.atan2(i.px - i.x, i.pz - i.z);
  return Math.abs(wrapAngle(toTrainer - i.yaw)) > WILD_VIEW_HALF_ANGLE;
}

/** What a wild creature does after breaking out of an overworld ball. */
export type CatchReaction = 'flee' | 'startle' | 'battle' | 'charge';

/** DESIGN §5.3 base aggression by temperament. */
export const AGGRO_BASE: Record<Temperament, number> = { skittish: 0.05, docile: 0.1, territorial: 0.4, aggressive: 0.7 };

/**
 * Chance that a failed throw makes the creature turn on the trainer. Stronger creatures (`levelDiff`
 * above the trainer's reference level) anger more easily; `calm` is armour/class calm (none yet).
 */
export function aggroChance(t: Temperament, levelDiff: number, calm = 0): number {
  return Math.max(0, Math.min(0.95, AGGRO_BASE[t] + 0.04 * Math.max(0, levelDiff) - calm));
}

/**
 * The reaction to a failed overworld catch (DESIGN §5.3). Skittish creatures flee and docile ones
 * back off warily, unless the aggro roll (`roll` in 0..1) comes up, in which case they turn and
 * fight. Territorial creatures always force a battle; aggressive ones charge the trainer
 * directly. A trainer with no Pokemon able to battle gets charged instead of challenged.
 */
export function failedCatchReaction(t: Temperament, levelDiff: number, roll: number, canBattle: boolean): CatchReaction {
  let r: CatchReaction;
  if (t === 'aggressive') r = 'charge';
  else if (t === 'territorial') r = 'battle';
  else if (roll < aggroChance(t, levelDiff)) r = 'battle';
  else r = t === 'skittish' ? 'flee' : 'startle';
  return r === 'battle' && !canBattle ? 'charge' : r;
}
