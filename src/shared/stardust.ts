import { Rng } from './battle/rng';
import { DAY_CYCLE_MS } from './daynight';

/**
 * Fallen stardust (DESIGN §12, "Meteor shower"): every night a dozen bits of stardust come down
 * in the meadows, in places seeded by the world's name and the night, so both friends find the
 * same ones. They glitter from a distance, but you can only find one in the grass with a light:
 * your lantern or your friend's. They're gone at dawn. Mostly Stardust, now and then a Star
 * Piece, both worth good money at the shops. Each friend picks up their own.
 */
export const STARDUST = {
  perNight: 12,
  /** Picked up within this many metres. */
  reach: 2,
  /** Seen glittering in the dark from this far. */
  glitter: 80,
  /** Share that are Star Pieces. */
  pieceChance: 0.15,
  /** Closest two can fall to each other, in metres. */
  spacing: 45,
};

export interface StardustSpot {
  /** Unique to the night: `night.k`. */
  id: string;
  x: number;
  z: number;
  /** A Star Piece rather than Stardust. */
  piece: boolean;
}

/** Which night a moment belongs to: one number per day cycle, the same on every machine. */
export function nightOf(ms: number): number {
  return Math.floor(ms / DAY_CYCLE_MS);
}

/** FNV-style mix of integers into a 32-bit seed. */
function mix(...values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= v | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/**
 * Where tonight's stardust lies, within `half` metres of the centre on ground `ok` accepts. The
 * same world seed and night always give the same spots.
 */
export function stardustSpots(seed: number, night: number, half: number, ok: (x: number, z: number) => boolean): StardustSpot[] {
  const rng = new Rng(mix(seed, night, 0x57a2));
  const out: StardustSpot[] = [];
  for (let tries = 0; out.length < STARDUST.perNight && tries < STARDUST.perNight * 40; tries++) {
    const x = (rng.next() * 2 - 1) * half;
    const z = (rng.next() * 2 - 1) * half;
    const piece = rng.next() < STARDUST.pieceChance;
    if (!ok(x, z)) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.z - z) < STARDUST.spacing)) continue;
    out.push({ id: `${night}.${out.length}`, x, z, piece });
  }
  return out;
}

/** What a player picked up: only tonight's count. */
export interface StardustSave {
  night: number;
  taken: string[];
}

/** Read the save's stardust for a night: anything from an earlier night is forgotten. */
export function stardustState(raw: unknown, night: number): StardustSave {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StardustSave>;
  if (r.night !== night || !Array.isArray(r.taken)) return { night, taken: [] };
  return { night, taken: [...new Set(r.taken.filter((t): t is string => typeof t === 'string' && t.startsWith(`${night}.`)))].slice(0, STARDUST.perNight) };
}

/**
 * Whether a spot is lit enough to find: within a lit lantern's reach (yours or your friend's),
 * given as points with their reach.
 */
export function litAt(x: number, z: number, lights: readonly { x: number; z: number; r: number }[]): boolean {
  return lights.some((l) => Math.hypot(l.x - x, l.z - z) <= l.r);
}
