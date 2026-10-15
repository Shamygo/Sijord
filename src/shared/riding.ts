import { SPECIES } from './data/species';

/**
 * Riding (DESIGN §8). A Pokémon that's big enough and shaped for it can carry its trainer, once
 * they've made a saddle for that species. How fast it goes, how long it can gallop and how it
 * handles are worked out from its body, its Speed and its weight (§8.2), so every mount feels
 * different and a fast one is worth the effort of raising.
 *
 * Land mounts carry you across the region's roads and fields and can ford shallow water; water
 * mounts swim the lakes, fjords and the sea between the islands. Flying comes later.
 */
export type MountMode = 'land' | 'water';

/** How a body moves, and its base speed in m/s before Speed and skills (DESIGN §8.2). */
export const BODY_BASE = {
  /** Bulls and big grazers: steady, heavy. */
  charger: 10,
  /** Horses, stags and big dogs: built to run. */
  runner: 11,
  /** Long-legged running birds. */
  runnerBird: 12,
  /** Big cats: quick off the mark but not distance runners. */
  stalker: 9,
  /** Deer that pick their way through brush. */
  browser: 8,
  /** Big, calm swimmers that carry a rider on a broad back. */
  ferry: 9,
  /** Seals and sea lions: slow on the surface. */
  paddler: 7,
  /** Fish that dart. */
  darter: 11,
} as const;
export type BodyPlan = keyof typeof BODY_BASE;

export interface RideProfile {
  mode: MountMode;
  body: BodyPlan;
  /** Kilograms: heavier mounts accelerate and turn slower (they carry momentum). */
  weight: number;
  /**
   * Where the rider sits, as fractions of the model's height (up) and of its footprint radius
   * (forward of its middle).
   */
  seat: [number, number];
  /** Room for a second rider. */
  twoSeat?: true;
  /** Water mounts: the share of the model's height that rides below the surface. */
  draft?: number;
}

/** Every Pokémon in Sijord that can be ridden (DESIGN §8.1: big enough, and shaped for it). */
export const RIDE_PROFILES: Record<string, RideProfile> = {
  // Land. (The vale's starter lines wear Bulbasaur's, Charmander's and Squirtle's models, and a
  // flower or an upright walker makes no saddle; Charizard and Pidgeot come with flying.)
  shepherion: { mode: 'land', body: 'runner', weight: 110, seat: [0.55, 0.15] },
  rapidash: { mode: 'land', body: 'runner', weight: 95, seat: [0.52, 0.1] },
  tauros: { mode: 'land', body: 'charger', weight: 88, seat: [0.62, 0.3] },
  rhyhorn: { mode: 'land', body: 'charger', weight: 115, seat: [0.62, 0.1] },
  dodrio: { mode: 'land', body: 'runnerBird', weight: 85, seat: [0.5, 0.05] },
  // Water.
  dewgong: { mode: 'water', body: 'paddler', weight: 120, seat: [0.45, 0.1], draft: 0.3 },
  seaking: { mode: 'water', body: 'darter', weight: 39, seat: [0.6, 0], draft: 0.45 },
  lapras: { mode: 'water', body: 'ferry', weight: 220, seat: [0.42, -0.15], twoSeat: true, draft: 0.3 },
};

export type MountTier = 'D' | 'C' | 'B' | 'A' | 'S';

export const RIDING = {
  /**
   * DESIGN §8.2's speeds are pitched against a 6.5 m/s sprint; Sijord's trainer sprints at 8, so
   * every mount is scaled up by the same share to stay worth riding.
   */
  worldScale: 1.25,
  /** Without the sprint key a mount trots at this share of its top speed. */
  trot: 0.5,
  /** A mount's stamina budget (§8.2) is in quarter-seconds of galloping. */
  staminaPerSecond: 4,
  /** Share of the full gallop budget back per second once it's been resting `regenDelay`. */
  regen: 0.1,
  regenDelay: 1,
  /** Blown: no gallop until it's this far back. */
  recoverTo: 0.3,
  /** Over the level cap a mount drags its feet (DESIGN §3.5), and well over it won't be ridden. */
  overCapSpeed: 0.7,
  refuseOver: 15,
};

export interface MountStats {
  mode: MountMode;
  /** Top speed galloping (m/s), in the game's scale. */
  speed: number;
  /** The §8.2 speed the tier comes from. */
  designSpeed: number;
  tier: MountTier;
  /** Seconds of galloping on a full bar. */
  stamina: number;
  /** 0.5 (a heavy, slow-turning mount) to 1.2 (nimble). */
  handling: number;
  twoSeat: boolean;
}

export function mountTier(designSpeed: number): MountTier {
  return designSpeed < 6 ? 'D' : designSpeed < 8 ? 'C' : designSpeed < 10 ? 'B' : designSpeed < 12 ? 'A' : 'S';
}

/** What a species is like to ride, or null if it can't be. `skills` is the riding skill bonus (later). */
export function mountStats(speciesId: string, skills = 0): MountStats | null {
  const p = RIDE_PROFILES[speciesId];
  const s = SPECIES[speciesId];
  if (!p || !s) return null;
  const b = s.baseStats;
  const designSpeed = BODY_BASE[p.body] * (0.75 + b.spe / 400) * (1 + skills);
  const budget = 60 + (b.hp + b.def) / 4;
  return {
    mode: p.mode,
    speed: designSpeed * RIDING.worldScale,
    designSpeed,
    tier: mountTier(designSpeed),
    stamina: budget / RIDING.staminaPerSecond,
    handling: Math.min(1.2, Math.max(0.5, 1.3 - p.weight / 600)),
    twoSeat: !!p.twoSeat,
  };
}

export function canRide(speciesId: string): boolean {
  return !!RIDE_PROFILES[speciesId] && !!SPECIES[speciesId];
}

export function saddleId(speciesId: string): string {
  return `saddle-${speciesId}`;
}

/** Saddles by the mount's tier (DESIGN §8.1: T1 to T3): what they take to make at the workbench. */
export const SADDLE_TIERS: Record<MountTier, { level: number; tp: number; seconds: number; value: number; cost: Record<string, number> }> = {
  D: { level: 8, tp: 1, seconds: 8, value: 3000, cost: { hide: 4, 'woven-cloth': 3, wood: 4, fiber: 4 } },
  C: { level: 8, tp: 1, seconds: 8, value: 3000, cost: { hide: 4, 'woven-cloth': 3, wood: 4, fiber: 4 } },
  B: { level: 12, tp: 2, seconds: 10, value: 5200, cost: { hide: 6, 'woven-cloth': 4, 'copper-ore': 3, wood: 4 } },
  A: { level: 18, tp: 2, seconds: 12, value: 8400, cost: { hide: 8, 'woven-cloth': 5, 'copper-ore': 6, wood: 6 } },
  S: { level: 24, tp: 3, seconds: 15, value: 14000, cost: { hide: 12, 'woven-cloth': 6, 'copper-ore': 10, 'star-piece': 1 } },
};

/** Why this Pokémon can't be ridden right now, or null if it can. */
export type RideBlock = 'not-rideable' | 'no-saddle' | 'fainted' | 'too-wild' | null;

export function rideBlock(c: { species: string; level: number; hp: number }, bag: Record<string, number> | undefined, cap: number): RideBlock {
  if (!canRide(c.species)) return 'not-rideable';
  if (!(bag?.[saddleId(c.species)] ?? 0)) return 'no-saddle';
  if (c.hp <= 0) return 'fainted';
  if (c.level - cap > RIDING.refuseOver) return 'too-wild';
  return null;
}

/** Top speed for this particular Pokémon: one over the level cap drags its feet. */
export function riddenSpeed(stats: MountStats, level: number, cap: number): number {
  return stats.speed * (level > cap ? RIDING.overCapSpeed : 1);
}

/**
 * One step of a mount's stamina: galloping spends it, resting brings it back after a moment.
 * Values are shares of the full bar (0..1); `rest` is seconds since it last galloped.
 */
export function stepMountStamina(st: { value: number; rest: number; blown: boolean }, galloping: boolean, dt: number, stats: MountStats): void {
  if (galloping && !st.blown) {
    st.value = Math.max(0, st.value - dt / stats.stamina);
    st.rest = 0;
    if (st.value <= 0) st.blown = true;
  } else {
    st.rest += dt;
    if (st.rest >= RIDING.regenDelay) st.value = Math.min(1, st.value + RIDING.regen * dt);
  }
  if (st.blown && st.value >= RIDING.recoverTo) st.blown = false;
}
