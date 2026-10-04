import type { AbilityData } from '../battle/types';

/** Abilities in play so far. Their effects live in the battle engine (src/shared/battle/engine.ts). */
export const ABILITIES: Record<string, AbilityData> = {
  'overgrow': { id: 'overgrow', name: 'Overgrow', description: 'Powers up Grass moves by half when HP is at 1/3 or below.' },
  'blaze': { id: 'blaze', name: 'Blaze', description: 'Powers up Fire moves by half when HP is at 1/3 or below.' },
  'torrent': { id: 'torrent', name: 'Torrent', description: 'Powers up Water moves by half when HP is at 1/3 or below.' },
  'swarm': { id: 'swarm', name: 'Swarm', description: 'Powers up Bug moves by half when HP is at 1/3 or below.' },
  'intimidate': { id: 'intimidate', name: 'Intimidate', description: "Lowers both foes' Attack when it enters battle." },
  'levitate': { id: 'levitate', name: 'Levitate', description: 'Floats, so Ground moves miss it entirely.' },
  'static': { id: 'static', name: 'Static', description: '30% chance to paralyse attackers that make contact.' },
  'flame-body': { id: 'flame-body', name: 'Flame Body', description: '30% chance to burn attackers that make contact.' },
  'flash-fire': { id: 'flash-fire', name: 'Flash Fire', description: 'Absorbs Fire moves, powering up its own Fire moves instead.' },
  'water-absorb': { id: 'water-absorb', name: 'Water Absorb', description: 'Water moves heal it by 1/4 of its max HP instead of hurting it.' },
  'sap-sipper': { id: 'sap-sipper', name: 'Sap Sipper', description: 'Grass moves raise its Attack instead of hurting it.' },
  'thick-fat': { id: 'thick-fat', name: 'Thick Fat', description: 'Halves damage from Fire and Ice moves.' },
  'keen-eye': { id: 'keen-eye', name: 'Keen Eye', description: 'Its accuracy cannot be lowered.' },
  'big-pecks': { id: 'big-pecks', name: 'Big Pecks', description: 'Its Defense cannot be lowered.' },
  'run-away': { id: 'run-away', name: 'Run Away', description: 'Always escapes from wild battles.' },
  'pickup': { id: 'pickup', name: 'Pickup', description: 'Sometimes finds an item after a battle.' },
  'cheek-pouch': { id: 'cheek-pouch', name: 'Cheek Pouch', description: 'Eating a berry also restores 1/3 of its max HP.' },
  'guts': { id: 'guts', name: 'Guts', description: 'Attack rises by half while it has a status problem, and burns do not weaken it.' },
  'technician': { id: 'technician', name: 'Technician', description: 'Moves with 60 power or less are boosted by half.' },
  'shield-dust': { id: 'shield-dust', name: 'Shield Dust', description: 'Blocks the added effects of moves that hit it.' },
  'compound-eyes': { id: 'compound-eyes', name: 'Compound Eyes', description: 'Raises accuracy by 30%.' },
  'shed-skin': { id: 'shed-skin', name: 'Shed Skin', description: '30% chance each turn to cure its own status problem.' },
  'inner-focus': { id: 'inner-focus', name: 'Inner Focus', description: 'Never flinches, and shrugs off Intimidate.' },
  'scrappy': { id: 'scrappy', name: 'Scrappy', description: 'Normal and Fighting moves can hit Ghost types, and it shrugs off Intimidate.' },
  'serene-grace': { id: 'serene-grace', name: 'Serene Grace', description: 'Doubles the chance of moves\' added effects.' },
  'super-luck': { id: 'super-luck', name: 'Super Luck', description: 'Lands critical hits more often.' },
  'friend-guard': { id: 'friend-guard', name: 'Friend Guard', description: 'Its ally takes 25% less damage.' },
  'natural-cure': { id: 'natural-cure', name: 'Natural Cure', description: 'Status problems heal when it switches out.' },
  'regenerator': { id: 'regenerator', name: 'Regenerator', description: 'Restores 1/3 of its max HP when it switches out.' },
  'sturdy': { id: 'sturdy', name: 'Sturdy', description: 'Survives any single hit from full HP with 1 HP left.' },
  'own-tempo': { id: 'own-tempo', name: 'Own Tempo', description: 'Cannot be confused, and shrugs off Intimidate.' },
  'hustle': { id: 'hustle', name: 'Hustle', description: 'Attack rises by half, but its physical moves are less accurate.' },
  'steadfast': { id: 'steadfast', name: 'Steadfast', description: 'Flinching raises its Speed.' },
};

export function abilityName(id: string): string {
  return ABILITIES[id]?.name ?? id;
}
