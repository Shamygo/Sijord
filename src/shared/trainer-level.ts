/**
 * The trainer's own level (DESIGN §7.1), separate from their Pokémon's. Experience comes from
 * catching, winning battles, finding things in the world and crafting a recipe for the first
 * time. Levels raise max HP (`trainerMaxHp`) and unlock crafting tiers (`src/shared/crafting.ts`).
 */
export const TRAINER_MAX_LEVEL = 50;

/** Experience for each source. Small numbers on purpose: levels should take a while. */
export const TRAINER_XP = {
  /** A species you hadn't caught before, and one you had. */
  catchNew: 60,
  catchAgain: 15,
  /** Per wild Pokémon beaten in battle, and a trainer battle won. */
  wildWin: 8,
  trainerWin: 60,
  cache: 15,
  tablet: 25,
  note: 10,
  /** The first time you craft each recipe. */
  firstCraft: 25,
};

/** Experience needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(80 * Math.max(1, level) ** 1.4);
}

/** Level, progress into it and what the next one needs, for a running experience total. */
export function trainerLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (level < TRAINER_MAX_LEVEL && left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: level >= TRAINER_MAX_LEVEL ? 0 : left, need: level >= TRAINER_MAX_LEVEL ? 0 : xpToNext(level) };
}

/** Total experience to reach a level from scratch. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.min(level, TRAINER_MAX_LEVEL); l++) total += xpToNext(l);
  return total;
}

/**
 * Experience a save from before trainer levels has already earned: its caught species, the
 * rival win and its finds. Repeat catches and wild wins weren't recorded, so they don't count.
 */
export function earnedXp(save: { dex?: { caught: string[] }; flags?: string[]; found?: string[]; starter?: string }): number {
  // Hazel's two gifts count as caught in the Dex but weren't catches.
  const caught = (save.dex?.caught ?? []).filter((id) => id !== save.starter && id !== 'hjordpup');
  let xp = caught.length * TRAINER_XP.catchNew;
  if (save.flags?.includes('beat-rival')) xp += TRAINER_XP.trainerWin;
  for (const id of save.found ?? []) {
    const kind = id.split('-')[0];
    xp += kind === 'cache' ? TRAINER_XP.cache : kind === 'tablet' ? TRAINER_XP.tablet : kind === 'note' ? TRAINER_XP.note : 0;
  }
  return xp;
}
