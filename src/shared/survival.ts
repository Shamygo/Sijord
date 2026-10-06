/**
 * Hunger and thirst (DESIGN §6.1). Both run from 100 down to 0 while you play: hunger in about
 * an hour, thirst in about forty minutes, a quarter as fast inside a town. Low meters cost
 * stamina; empty ones cost HP until you eat or drink. Raw food and river water can leave you
 * queasy, which slows stamina recovery for a while.
 */
export const SURVIVAL = {
  max: 100,
  /** Points lost per second while active. */
  hungerRate: 1 / 36,
  thirstRate: 1 / 24,
  /** Below this a meter is "low". */
  low: 25,
  /** Drain multiplier inside a town, where food and water are easy to come by. */
  inTown: 0.25,
  /** Seconds per HP lost while a meter is empty. */
  starveEvery: 3,
  parchedEvery: 2,
  /** Stamina regeneration while hungry or queasy (each), and the stamina cap while thirsty. */
  hungryRegen: 0.5,
  queasyRegen: 0.5,
  thirstyCap: 0.7,
  /** How long queasiness lasts. */
  queasySeconds: 90,
};

export interface Meters {
  hunger: number;
  thirst: number;
  /** Seconds of queasiness left. */
  queasy: number;
}

/** What eating or drinking an item does for the trainer. `queasy` is the chance it upsets you. */
export interface FoodValue {
  hunger?: number;
  thirst?: number;
  queasy?: number;
}

export type MeterState = 'ok' | 'low' | 'empty';

export function meterState(v: number): MeterState {
  return v <= 0 ? 'empty' : v < SURVIVAL.low ? 'low' : 'ok';
}

/**
 * Advance the meters by `dt` seconds. `drain` is the class lean (1 = normal). Returns the HP an
 * empty meter costs over this step and the meters whose state changed (for warnings).
 */
export function stepMeters(m: Meters, dt: number, opts: { drain: number; inTown: boolean }): { hpLoss: number; changed: ('hunger' | 'thirst')[] } {
  const k = dt * opts.drain * (opts.inTown ? SURVIVAL.inTown : 1);
  const before = { hunger: meterState(m.hunger), thirst: meterState(m.thirst) };
  m.hunger = Math.max(0, m.hunger - SURVIVAL.hungerRate * k);
  m.thirst = Math.max(0, m.thirst - SURVIVAL.thirstRate * k);
  m.queasy = Math.max(0, m.queasy - dt);
  let hpLoss = 0;
  if (m.hunger <= 0) hpLoss += dt / SURVIVAL.starveEvery;
  if (m.thirst <= 0) hpLoss += dt / SURVIVAL.parchedEvery;
  const changed: ('hunger' | 'thirst')[] = [];
  if (meterState(m.hunger) !== before.hunger) changed.push('hunger');
  if (meterState(m.thirst) !== before.thirst) changed.push('thirst');
  return { hpLoss, changed };
}

/** How the meters bend stamina and healing right now. */
export function survivalEffects(m: Meters): { staminaRegen: number; staminaCap: number; heals: boolean } {
  let staminaRegen = 1;
  if (m.hunger < SURVIVAL.low) staminaRegen *= SURVIVAL.hungryRegen;
  if (m.queasy > 0) staminaRegen *= SURVIVAL.queasyRegen;
  return {
    staminaRegen,
    staminaCap: m.thirst < SURVIVAL.low ? SURVIVAL.thirstyCap : 1,
    // HP doesn't come back on an empty stomach or a dry throat.
    heals: m.hunger > 0 && m.thirst > 0,
  };
}

/** Eat or drink something. `rand` returns [0, 1). Returns whether it left you queasy. */
export function consume(m: Meters, food: FoodValue, rand: () => number): { queasy: boolean } {
  m.hunger = Math.min(SURVIVAL.max, m.hunger + (food.hunger ?? 0));
  m.thirst = Math.min(SURVIVAL.max, m.thirst + (food.thirst ?? 0));
  const queasy = !!food.queasy && rand() < food.queasy;
  if (queasy) m.queasy = SURVIVAL.queasySeconds;
  return { queasy };
}

/** Drinking straight from a river, lake or pond. */
export const OPEN_WATER: FoodValue = { thirst: 30, queasy: 0.35 };

/** Drinks one canteen holds. */
export const CANTEEN_DRINKS = 3;

/** River water that can still go into the canteens you carry (boiling it frees the room). */
export function canteenRoom(bag: Record<string, number>): number {
  return Math.max(0, (bag.canteen ?? 0) * CANTEEN_DRINKS - (bag['river-water'] ?? 0));
}
