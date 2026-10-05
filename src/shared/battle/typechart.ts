import type { TypeName } from './types';

/**
 * The standard 18-type chart. SUPER[attacker] lists defenders it hits for 2x, RESIST lists
 * defenders that take 0.5x and IMMUNE lists defenders that take nothing.
 */
const SUPER: Record<TypeName, TypeName[]> = {
  normal: [],
  fire: ['grass', 'ice', 'bug', 'steel'],
  water: ['fire', 'ground', 'rock'],
  grass: ['water', 'ground', 'rock'],
  electric: ['water', 'flying'],
  ice: ['grass', 'ground', 'flying', 'dragon'],
  fighting: ['normal', 'ice', 'rock', 'dark', 'steel'],
  poison: ['grass', 'fairy'],
  ground: ['fire', 'electric', 'poison', 'rock', 'steel'],
  flying: ['grass', 'fighting', 'bug'],
  psychic: ['fighting', 'poison'],
  bug: ['grass', 'psychic', 'dark'],
  rock: ['fire', 'ice', 'flying', 'bug'],
  ghost: ['psychic', 'ghost'],
  dragon: ['dragon'],
  dark: ['psychic', 'ghost'],
  steel: ['ice', 'rock', 'fairy'],
  fairy: ['fighting', 'dragon', 'dark'],
};

const RESIST: Record<TypeName, TypeName[]> = {
  normal: ['rock', 'steel'],
  fire: ['fire', 'water', 'rock', 'dragon'],
  water: ['water', 'grass', 'dragon'],
  grass: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
  electric: ['electric', 'grass', 'dragon'],
  ice: ['fire', 'water', 'ice', 'steel'],
  fighting: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
  poison: ['poison', 'ground', 'rock', 'ghost'],
  ground: ['grass', 'bug'],
  flying: ['electric', 'rock', 'steel'],
  psychic: ['psychic', 'steel'],
  bug: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
  rock: ['fighting', 'ground', 'steel'],
  ghost: ['dark'],
  dragon: ['steel'],
  dark: ['fighting', 'dark', 'fairy'],
  steel: ['fire', 'water', 'electric', 'steel'],
  fairy: ['fire', 'poison', 'steel'],
};

const IMMUNE: Record<TypeName, TypeName[]> = {
  normal: ['ghost'],
  fire: [],
  water: [],
  grass: [],
  electric: ['ground'],
  ice: [],
  fighting: ['ghost'],
  poison: ['steel'],
  ground: ['flying'],
  flying: [],
  psychic: ['dark'],
  bug: [],
  rock: [],
  ghost: ['normal'],
  dragon: ['fairy'],
  dark: [],
  steel: [],
  fairy: [],
};

/** Multiplier of one attacking type against one defending type: 0, 0.5, 1 or 2. */
export function typeMultiplier(attack: TypeName, defend: TypeName): number {
  if (IMMUNE[attack].includes(defend)) return 0;
  if (SUPER[attack].includes(defend)) return 2;
  if (RESIST[attack].includes(defend)) return 0.5;
  return 1;
}

/** Combined multiplier against a (possibly dual-typed) defender: 0, 0.25, 0.5, 1, 2 or 4. */
export function effectiveness(attack: TypeName, defenders: readonly TypeName[]): number {
  let m = 1;
  for (const d of defenders) m *= typeMultiplier(attack, d);
  return m;
}
