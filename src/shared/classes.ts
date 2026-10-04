import type { PlayerClassId } from './types';

/** Multipliers a class applies. 1 means no change. Kept small: a class is a lean, not a cheat code. */
export interface ClassModifiers {
  stamina: number;
  catchRate: number;
  xp: number;
  craftCost: number;
  survivalDrain: number;
  maxHp: number;
}

export interface PlayerClassInfo {
  id: PlayerClassId;
  name: string;
  tagline: string;
  strengths: string[];
  weakness: string;
  modifiers: ClassModifiers;
  /** Accent colour for UI. */
  color: string;
}

const BASE: ClassModifiers = { stamina: 1, catchRate: 1, xp: 1, craftCost: 1, survivalDrain: 1, maxHp: 1 };

/**
 * The five trainer classes. Each starts with one small edge and one real cost; the bigger
 * abilities are earned through the skill trees (docs/DESIGN.md section 7).
 */
export const PLAYER_CLASSES: PlayerClassInfo[] = [
  {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'Pathfinder of the wilds.',
    strengths: ['+8% max stamina'],
    weakness: 'Crafting takes 10% longer',
    modifiers: { ...BASE, stamina: 1.08 },
    color: '#4caf50',
  },
  {
    id: 'tamer',
    name: 'Tamer',
    tagline: 'Wild Pokemon trust you a little more.',
    strengths: ['+5% catch rate'],
    weakness: '-10% max HP',
    modifiers: { ...BASE, catchRate: 1.05, maxHp: 0.9 },
    color: '#ff9800',
  },
  {
    id: 'artisan',
    name: 'Artisan',
    tagline: 'Builds what others buy.',
    strengths: ['Crafting costs 8% fewer materials'],
    weakness: '-5% catch rate',
    modifiers: { ...BASE, craftCost: 0.92, catchRate: 0.95 },
    color: '#8d6e63',
  },
  {
    id: 'scholar',
    name: 'Scholar',
    tagline: 'Knowledge is the edge.',
    strengths: ['+8% XP for you and your Pokemon'],
    weakness: 'Hunger and thirst drain 10% faster',
    modifiers: { ...BASE, xp: 1.08, survivalDrain: 1.1 },
    color: '#3f51b5',
  },
  {
    id: 'medic',
    name: 'Medic',
    tagline: 'Keeps the team standing.',
    strengths: ['Hunger and thirst drain 10% slower'],
    weakness: '-8% max stamina',
    modifiers: { ...BASE, survivalDrain: 0.9, stamina: 0.92 },
    color: '#e91e63',
  },
];

export function classInfo(id: PlayerClassId): PlayerClassInfo {
  return PLAYER_CLASSES.find((c) => c.id === id) ?? PLAYER_CLASSES[0];
}
