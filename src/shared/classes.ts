import type { PlayerClassId } from './types';

export interface PlayerClassInfo {
  id: PlayerClassId;
  name: string;
  tagline: string;
  strengths: string[];
  weakness: string;
  /** Accent colour for UI. */
  color: string;
}

/** The five trainer classes a player picks at the start. Full skill trees live in docs/DESIGN.md. */
export const PLAYER_CLASSES: PlayerClassInfo[] = [
  {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'Pathfinder of the wilds.',
    strengths: ['+15% max stamina', 'Mounts run 5% faster', 'Sees tracks of nearby rare Pokemon'],
    weakness: 'Slower crafting stations, slightly higher shop prices',
    color: '#4caf50',
  },
  {
    id: 'tamer',
    name: 'Tamer',
    tagline: 'Every creature listens to you.',
    strengths: ['+10% catch rate', 'Wild Pokemon turn aggressive less often', 'Over-cap Pokemon obey sooner'],
    weakness: 'Carries less weight',
    color: '#ff9800',
  },
  {
    id: 'artisan',
    name: 'Artisan',
    tagline: 'Builds what others buy.',
    strengths: ['Crafting costs 15% fewer materials', 'An extra base core for automation', 'Tools last twice as long'],
    weakness: 'Lower catch rate and battle XP',
    color: '#8d6e63',
  },
  {
    id: 'scholar',
    name: 'Scholar',
    tagline: 'Knowledge is the edge.',
    strengths: ['+20% XP for you and your Pokemon', 'Sees wild levels, natures and abilities', 'Scouts boss held items'],
    weakness: 'Lower max HP, gets hungry faster',
    color: '#3f51b5',
  },
  {
    id: 'medic',
    name: 'Medic',
    tagline: 'Keeps the team standing.',
    strengths: ['Pokemon heal a little after each battle', 'Hunger and thirst drain 20% slower', 'Instantly revives a downed partner'],
    weakness: 'Less stamina, fewer mounts in the party',
    color: '#e91e63',
  },
];
