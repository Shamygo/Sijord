import { MOVES } from '../data/moves';
import { SPECIES, species } from '../data/species';
import { NATURE_IDS } from './natures';
import { Rng } from './rng';
import { MAX_EV_STAT, MAX_EV_TOTAL, calcStats, xpForLevel } from './stats';
import { STATS, type Creature, type StatTable } from './types';

let uidCounter = 0;
export function newUid(rng?: Rng): string {
  const r = rng ? rng.int(0, 0xffffff) : Math.floor(Math.random() * 0xffffff);
  return `${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${r.toString(36)}`;
}

/** The four most recent moves a species knows at a level (what a wild creature has). */
export function defaultMoves(speciesId: string, level: number): string[] {
  const seen: string[] = [];
  for (const e of species(speciesId).learnset) {
    if (e.level > level) break;
    const i = seen.indexOf(e.move);
    if (i >= 0) seen.splice(i, 1);
    seen.push(e.move);
  }
  return seen.slice(-4);
}

/** Moves a species learns exactly at `level`. */
export function movesLearnedAt(speciesId: string, level: number): string[] {
  return species(speciesId).learnset.filter((e) => e.level === level).map((e) => e.move);
}

export interface CreateOptions {
  nature?: string;
  ivs?: Partial<StatTable>;
  evs?: Partial<StatTable>;
  ability?: string;
  moves?: string[];
  item?: string;
  nickname?: string;
  ot?: string;
  uid?: string;
}

export function createCreature(speciesId: string, level: number, rng: Rng, opts: CreateOptions = {}): Creature {
  const sp = species(speciesId);
  const ivs = {} as StatTable;
  for (const s of STATS) ivs[s] = opts.ivs?.[s] ?? rng.int(0, 31);
  const evs = {} as StatTable;
  for (const s of STATS) evs[s] = opts.evs?.[s] ?? 0;
  const moves = opts.moves ?? defaultMoves(speciesId, level);
  const c: Creature = {
    uid: opts.uid ?? newUid(rng),
    species: speciesId,
    nickname: opts.nickname,
    level,
    xp: xpForLevel(sp.growth, level),
    nature: opts.nature ?? rng.pick(NATURE_IDS),
    ivs,
    evs,
    ability: opts.ability ?? rng.pick(sp.abilities),
    moves: moves.map((id) => ({ id, pp: MOVES[id]?.pp ?? 10 })),
    hp: 1,
    item: opts.item,
    ot: opts.ot,
  };
  c.hp = creatureStats(c).hp;
  return c;
}

export function creatureStats(c: Creature): StatTable {
  return calcStats(species(c.species).baseStats, c.ivs, c.evs, c.level, c.nature);
}

export function maxHp(c: Creature): number {
  return creatureStats(c).hp;
}

export function displayName(c: Creature): string {
  return c.nickname || species(c.species).name;
}

/** Full heal: HP, status and PP (a rest at home or at the lab). */
export function healCreature(c: Creature): void {
  c.hp = maxHp(c);
  c.status = undefined;
  for (const m of c.moves) m.pp = MOVES[m.id]?.pp ?? m.pp;
}

export function isUsable(c: Creature): boolean {
  return c.hp > 0;
}

/** What happened when experience was applied. */
export interface GrowthResult {
  levelsGained: number;
  /** Moves learned automatically (there was a free slot). */
  learned: string[];
  /** Moves it wants to learn but already knows four; the player decides. */
  pendingMoves: string[];
  /** Species it can now evolve into. */
  evolveInto?: string;
  /** Experience banked because it is at the level cap. */
  banked: number;
}

/**
 * Add experience, respecting the level cap (DESIGN §3.4): a creature at the cap stops levelling
 * and banks up to one level's worth of extra experience, applied when the cap rises.
 */
export function gainXp(c: Creature, amount: number, cap: number): GrowthResult {
  const sp = species(c.species);
  const res: GrowthResult = { levelsGained: 0, learned: [], pendingMoves: [], banked: 0 };
  const bank = (xp: number) => {
    const levelWorth = xpForLevel(sp.growth, c.level + 1) - xpForLevel(sp.growth, c.level);
    const add = Math.max(0, Math.min(xp, levelWorth - (c.bankedXp ?? 0)));
    c.bankedXp = (c.bankedXp ?? 0) + add;
    res.banked += add;
  };
  if (c.level >= cap) {
    bank(amount);
    return res;
  }
  c.xp += amount;
  while (c.level < cap && c.level < 100 && c.xp >= xpForLevel(sp.growth, c.level + 1)) levelUp(c, res);
  if (c.level >= cap) {
    // Experience past the cap goes into the bank instead.
    const capXp = xpForLevel(sp.growth, c.level);
    const over = c.xp - capXp;
    c.xp = capXp;
    if (over > 0) bank(over);
  }
  if (sp.evolution && c.level >= sp.evolution.level) res.evolveInto = sp.evolution.into;
  return res;
}

/** Apply banked experience after the cap rises. */
export function releaseBankedXp(c: Creature, cap: number): GrowthResult {
  const banked = c.bankedXp ?? 0;
  c.bankedXp = 0;
  return gainXp(c, banked, cap);
}

function levelUp(c: Creature, res: GrowthResult): void {
  const before = maxHp(c);
  c.level++;
  res.levelsGained++;
  // HP rises by as much as the max does, so levelling never hurts.
  if (c.hp > 0) c.hp = Math.min(maxHp(c), c.hp + (maxHp(c) - before));
  for (const m of movesLearnedAt(c.species, c.level)) learnOrQueue(c, m, res);
}

function learnOrQueue(c: Creature, move: string, res: GrowthResult): void {
  if (c.moves.some((m) => m.id === move)) return;
  if (c.moves.length < 4) {
    c.moves.push({ id: move, pp: MOVES[move]?.pp ?? 10 });
    res.learned.push(move);
  } else if (!res.pendingMoves.includes(move)) res.pendingMoves.push(move);
}

/** Replace move slot `slot` with `move` (or pass slot -1 to give up learning it). */
export function teachMove(c: Creature, move: string, slot: number): void {
  if (slot < 0 || slot >= c.moves.length) return;
  c.moves[slot] = { id: move, pp: MOVES[move]?.pp ?? 10 };
}

/** Evolve in place, keeping HP damage taken. Returns moves learned on evolving. */
export function evolve(c: Creature, into: string): GrowthResult {
  const res: GrowthResult = { levelsGained: 0, learned: [], pendingMoves: [], banked: 0 };
  const before = maxHp(c);
  c.species = into;
  if (c.hp > 0) c.hp = Math.min(maxHp(c), c.hp + (maxHp(c) - before));
  // Abilities line up by slot across an evolution line.
  const sp = species(into);
  if (!sp.abilities.includes(c.ability) && sp.hiddenAbility !== c.ability) c.ability = sp.abilities[0];
  for (const m of movesLearnedAt(into, c.level)) learnOrQueue(c, m, res);
  return res;
}

/**
 * Bring a saved creature in line with the current species data. The original 21 species became
 * their canonical Pokémon, which changed some abilities, growth rates and stats: an ability the
 * species no longer has becomes its first regular ability, experience is moved into the right
 * range for its level on the new growth curve (the level never changes), and HP and PP are
 * capped at their new maximums. Known moves are kept even if the species no longer learns them.
 * Anything that doesn't look like a whole creature of a known species is left untouched.
 * Returns whether anything changed.
 */
export function normalizeCreature(c: Creature): boolean {
  if (!c || typeof c !== 'object' || typeof c.species !== 'string' || !SPECIES[c.species]) return false;
  if (typeof c.level !== 'number' || !c.ivs || !c.evs || !Array.isArray(c.moves)) return false;
  const sp = SPECIES[c.species];
  let changed = false;
  if (!sp.abilities.includes(c.ability) && sp.hiddenAbility !== c.ability) {
    c.ability = sp.abilities[0];
    changed = true;
  }
  const level = Math.max(1, Math.min(100, Math.round(c.level)));
  const lo = xpForLevel(sp.growth, level);
  const hi = level >= 100 ? lo : xpForLevel(sp.growth, level + 1) - 1;
  if (typeof c.xp !== 'number' || !(c.xp >= lo && c.xp <= hi)) {
    c.xp = typeof c.xp === 'number' && c.xp > hi ? hi : lo;
    changed = true;
  }
  if (typeof c.hp === 'number') {
    const max = maxHp(c);
    if (c.hp > max) {
      c.hp = max;
      changed = true;
    }
  }
  for (const m of c.moves) {
    const data = m && MOVES[m.id];
    if (data && m.pp > data.pp) {
      m.pp = data.pp;
      changed = true;
    }
  }
  return changed;
}

/** Add effort values, respecting the 252 per stat and 510 total limits. */
export function addEvs(c: Creature, gain: Partial<StatTable>): void {
  let total = STATS.reduce((a, s) => a + c.evs[s], 0);
  for (const s of STATS) {
    const g = gain[s] ?? 0;
    if (!g) continue;
    const add = Math.max(0, Math.min(g, MAX_EV_STAT - c.evs[s], MAX_EV_TOTAL - total));
    c.evs[s] += add;
    total += add;
  }
}
