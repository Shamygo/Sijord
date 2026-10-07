import { SUNRISE, SUNSET } from './daynight';

/**
 * The lantern (DESIGN §6.2): a copper lantern hung from the belt, lit and put out with L. It
 * burns oil while lit, and once the oil is gone it's spent, like a worn-out tool, so a lantern
 * lasts about two nights of use. It lights the way and shows fallen stardust (`stardust.ts`).
 */
export const LANTERN = {
  item: 'lantern',
  /** Real seconds of light in one lantern. */
  seconds: 20 * 60,
  /** How far its light reaches, in metres. */
  reach: 10,
};

/** Whether the sun is down, so a lantern does anything. */
export function isDark(minutes: number): boolean {
  const m = ((minutes % 1440) + 1440) % 1440;
  return m >= SUNSET || m < SUNRISE;
}

/**
 * Burn a lit lantern's oil for `dt` seconds. The oil left is kept in `wear` (the same map tools
 * keep their uses in); a lantern burned dry leaves the bag. Returns the seconds left in the one
 * in use (0 if none) and whether one just burned out.
 */
export function burnLantern(bag: Record<string, number>, wear: Record<string, number>, dt: number): { left: number; burnedOut: boolean } {
  const id = LANTERN.item;
  if (!bag[id]) return { left: 0, burnedOut: false };
  const left = Math.min(LANTERN.seconds, wear[id] ?? LANTERN.seconds) - Math.max(0, dt);
  if (left > 0) {
    wear[id] = left;
    return { left, burnedOut: false };
  }
  bag[id]--;
  if (!bag[id]) delete bag[id];
  delete wear[id];
  return { left: 0, burnedOut: true };
}

/** Oil left in the lantern in use, in real seconds (a fresh one if it hasn't been lit). */
export function lanternOil(bag: Record<string, number>, wear: Record<string, number>): number {
  if (!bag[LANTERN.item]) return 0;
  const w = wear[LANTERN.item];
  return Number.isFinite(w) && w > 0 ? Math.min(LANTERN.seconds, w) : LANTERN.seconds;
}
