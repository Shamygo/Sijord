/**
 * The mainline damage formula (Gen 5 onwards), with the same fixed-point rounding the games use,
 * so damage numbers match the community damage calculators exactly.
 */

/** Multiply by `mult` using the games' 4096-based fixed point, rounding .5 down. */
export function modify(value: number, mult: number): number {
  const m = Math.trunc(mult * 4096);
  return Math.trunc((value * m + 2048 - 1) / 4096);
}

export interface DamageInput {
  level: number;
  /** Base power after power modifiers (Technician, Helping Hand). */
  power: number;
  /** Attacking stat after stages and ability modifiers. */
  attack: number;
  /** Defending stat after stages. */
  defense: number;
  /** Hits more than one target (0.75x). */
  spread?: boolean;
  crit?: boolean;
  /** Random roll, 85-100. */
  random: number;
  stab?: boolean;
  /** Combined type effectiveness: 0, 0.25, 0.5, 1, 2 or 4. */
  effectiveness: number;
  /** Physical move from a burned attacker without Guts. */
  burned?: boolean;
  /** Final multipliers (Friend Guard, screens, ...). */
  final?: number[];
}

export function baseDamage(level: number, power: number, attack: number, defense: number): number {
  return Math.trunc(Math.trunc((Math.trunc((2 * level) / 5 + 2) * power * attack) / defense) / 50) + 2;
}

export function calcDamage(d: DamageInput): number {
  if (d.effectiveness === 0) return 0;
  let dmg = baseDamage(d.level, d.power, d.attack, d.defense);
  if (d.spread) dmg = modify(dmg, 0.75);
  if (d.crit) dmg = modify(dmg, 1.5);
  dmg = Math.trunc((dmg * d.random) / 100);
  if (d.stab) dmg = modify(dmg, 1.5);
  // Effectiveness is applied one doubling or halving at a time.
  let e = d.effectiveness;
  while (e >= 2) {
    dmg *= 2;
    e /= 2;
  }
  while (e <= 0.5) {
    dmg = Math.trunc(dmg / 2);
    e *= 2;
  }
  if (d.burned) dmg = modify(dmg, 0.5);
  for (const f of d.final ?? []) dmg = modify(dmg, f);
  return Math.max(1, dmg);
}

/** Minimum and maximum damage over the 16 random rolls (no crit). */
export function damageRange(d: Omit<DamageInput, 'random'>): [number, number] {
  return [calcDamage({ ...d, random: 85 }), calcDamage({ ...d, random: 100 })];
}
