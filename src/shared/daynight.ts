/**
 * Day and night (ROADMAP M5). The clock comes from the wall clock, not from when you loaded the
 * page, so both friends in a world always see the same time of day without sending anything.
 * One day lasts 30 real minutes: 20 of daylight (06:00 to 19:00) and 10 of night.
 */
export const DAY_CYCLE_MS = 30 * 60 * 1000;
/** The share of the real cycle spent between sunrise and sunset. */
const DAY_SHARE = 2 / 3;
/** Game minutes since midnight. */
export const SUNRISE = 6 * 60;
export const SUNSET = 19 * 60;
const DAY_LEN = SUNSET - SUNRISE;
const NIGHT_LEN = 24 * 60 - DAY_LEN;

/** How far through the real cycle a moment is, 0..1 (0 is sunrise). */
function cycleAt(ms: number): number {
  return (((ms % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
}

/** The time of day at a moment, in game minutes since midnight (0 up to 1440). */
export function clockAt(ms: number): number {
  const f = cycleAt(ms);
  if (f < DAY_SHARE) return SUNRISE + (f / DAY_SHARE) * DAY_LEN;
  return (SUNSET + ((f - DAY_SHARE) / (1 - DAY_SHARE)) * NIGHT_LEN) % 1440;
}

/** Where in the real cycle a time of day falls, 0..1: the inverse of `clockAt`. */
export function cycleFor(minutes: number): number {
  const m = (((minutes - SUNRISE) % 1440) + 1440) % 1440;
  return m < DAY_LEN ? (m / DAY_LEN) * DAY_SHARE : DAY_SHARE + ((m - DAY_LEN) / NIGHT_LEN) * (1 - DAY_SHARE);
}

/** How far to shift the clock so it reads `minutes` at the moment `ms` (for debugging and tests). */
export function offsetFor(minutes: number, ms: number): number {
  let d = (cycleFor(minutes) - cycleAt(ms)) * DAY_CYCLE_MS;
  if (d < 0) d += DAY_CYCLE_MS;
  return d;
}

/** "07:05". */
export function clockText(minutes: number): string {
  const m = Math.floor(((minutes % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Dark enough that a lamp or a lantern matters: from dusk to the first light. */
export function isNight(minutes: number): boolean {
  const m = ((minutes % 1440) + 1440) % 1440;
  return m >= SUNSET + 50 || m < SUNRISE - 25;
}

/** Real milliseconds until the next sunrise, from a moment. */
export function msUntilSunrise(ms: number): number {
  return (1 - cycleAt(ms)) * DAY_CYCLE_MS;
}
