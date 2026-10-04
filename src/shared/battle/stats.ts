import { natureMultiplier } from './natures';
import { STATS, type GrowthRate, type StatName, type StatTable } from './types';

/** Mainline stat formula (Gen 3 onwards). */
export function calcStat(stat: StatName, base: number, iv: number, ev: number, level: number, nature: string): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (stat === 'hp') return core + level + 10;
  return Math.floor((core + 5) * natureMultiplier(nature, stat));
}

export function calcStats(base: StatTable, ivs: StatTable, evs: StatTable, level: number, nature: string): StatTable {
  const out = {} as StatTable;
  for (const s of STATS) out[s] = calcStat(s, base[s], ivs[s], evs[s], level, nature);
  return out;
}

/** Total experience needed to reach `level` on a growth curve. */
export function xpForLevel(rate: GrowthRate, level: number): number {
  if (level <= 1) return 0;
  const n = level;
  switch (rate) {
    case 'fast':
      return Math.floor((4 * n ** 3) / 5);
    case 'medium-fast':
      return n ** 3;
    case 'medium-slow':
      return Math.max(0, Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140));
    case 'slow':
      return Math.floor((5 * n ** 3) / 4);
  }
}

/**
 * Experience for defeating a creature (Gen 5 scaled formula): beating something above your
 * level pays more, farming weaker creatures pays less.
 */
export function xpYield(baseExp: number, foeLevel: number, winnerLevel: number, trainer: boolean, mult = 1): number {
  const scale = Math.pow((2 * foeLevel + 10) / (foeLevel + winnerLevel + 10), 2.5);
  const xp = Math.floor(((baseExp * foeLevel) / 5) * scale) + 1;
  return Math.floor(xp * (trainer ? 1.5 : 1) * mult);
}

/**
 * Level caps by badge count (DESIGN §3.2): the highest level reachable through experience and
 * the highest level that fully obeys. Index = badges held, 0-10.
 */
export const LEVEL_CAPS = [15, 21, 27, 33, 39, 45, 51, 57, 63, 69, 76] as const;
export const CHAMPION_CAP = 100;

export function levelCap(badges: number, championBeaten = false): number {
  if (championBeaten) return CHAMPION_CAP;
  return LEVEL_CAPS[Math.max(0, Math.min(LEVEL_CAPS.length - 1, badges))];
}

export const MAX_EV_TOTAL = 510;
export const MAX_EV_STAT = 252;

/** Stage multiplier for atk/def/spa/spd/spe: +1 = 1.5x, -1 = 2/3x, clamped to ±6. */
export function stageMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

/** Stage multiplier for accuracy and evasion: +1 = 4/3x, -1 = 3/4x. */
export function accuracyStageMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
}
