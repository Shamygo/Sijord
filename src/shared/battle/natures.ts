import type { NatureData, StatName } from './types';

/** The classic 25 natures: +10% to one stat and -10% to another (or neutral). */
export const NATURES: Record<string, NatureData> = {
  hardy: { name: 'Hardy' },
  lonely: { name: 'Lonely', plus: 'atk', minus: 'def' },
  brave: { name: 'Brave', plus: 'atk', minus: 'spe' },
  adamant: { name: 'Adamant', plus: 'atk', minus: 'spa' },
  naughty: { name: 'Naughty', plus: 'atk', minus: 'spd' },
  bold: { name: 'Bold', plus: 'def', minus: 'atk' },
  docile: { name: 'Docile' },
  relaxed: { name: 'Relaxed', plus: 'def', minus: 'spe' },
  impish: { name: 'Impish', plus: 'def', minus: 'spa' },
  lax: { name: 'Lax', plus: 'def', minus: 'spd' },
  timid: { name: 'Timid', plus: 'spe', minus: 'atk' },
  hasty: { name: 'Hasty', plus: 'spe', minus: 'def' },
  serious: { name: 'Serious' },
  jolly: { name: 'Jolly', plus: 'spe', minus: 'spa' },
  naive: { name: 'Naive', plus: 'spe', minus: 'spd' },
  modest: { name: 'Modest', plus: 'spa', minus: 'atk' },
  mild: { name: 'Mild', plus: 'spa', minus: 'def' },
  quiet: { name: 'Quiet', plus: 'spa', minus: 'spe' },
  bashful: { name: 'Bashful' },
  rash: { name: 'Rash', plus: 'spa', minus: 'spd' },
  calm: { name: 'Calm', plus: 'spd', minus: 'atk' },
  gentle: { name: 'Gentle', plus: 'spd', minus: 'def' },
  sassy: { name: 'Sassy', plus: 'spd', minus: 'spe' },
  careful: { name: 'Careful', plus: 'spd', minus: 'spa' },
  quirky: { name: 'Quirky' },
};

export const NATURE_IDS = Object.keys(NATURES);

/** 1.1, 0.9 or 1 for a stat under a nature. */
export function natureMultiplier(nature: string, stat: StatName): number {
  const n = NATURES[nature];
  if (!n || stat === 'hp') return 1;
  if (n.plus === stat) return 1.1;
  if (n.minus === stat) return 0.9;
  return 1;
}
