/**
 * Crafting (DESIGN §6.4), tiers T0 and T1. Tools and cloth are made by hand anywhere; food is
 * cooked and water boiled at a campfire; Poke Balls, Potions, canteens and cloth armour need the
 * workbench in Bramblewick and trainer level 3. Newer recipes are learned with Technology Points.
 * Costs are deliberately steep: crafting is how supplies come in, but it takes a trip out.
 */
export type Station = 'hand' | 'campfire' | 'workbench';

export interface Recipe {
  id: string;
  /** Item made, and how many. */
  out: string;
  count: number;
  cost: Record<string, number>;
  station: Station;
  /** Trainer level needed. */
  level: number;
  /** Seconds to make one, before the class lean. */
  seconds: number;
  /** Technology Points to learn it (DESIGN §6.4). Missing: every trainer knows it. */
  tp?: number;
  /** Won rather than learned: how to get it (it can't be bought with Technology Points). */
  prize?: string;
}

export const STATION_LABEL: Record<Station, string> = { hand: 'By hand', campfire: 'Campfire', workbench: 'Workbench' };

export const RECIPES: Recipe[] = [
  { id: 'stone-hatchet', out: 'stone-hatchet', count: 1, cost: { wood: 3, stone: 2, fiber: 2 }, station: 'hand', level: 1, seconds: 2 },
  { id: 'stone-pick', out: 'stone-pick', count: 1, cost: { wood: 3, stone: 3, fiber: 2 }, station: 'hand', level: 1, seconds: 2 },
  { id: 'woven-cloth', out: 'woven-cloth', count: 1, cost: { fiber: 3 }, station: 'hand', level: 1, seconds: 2 },
  { id: 'stone-sickle', out: 'stone-sickle', count: 1, cost: { wood: 2, stone: 2, fiber: 1 }, station: 'hand', level: 2, seconds: 2, tp: 1 },
  { id: 'treat', out: 'treat', count: 1, cost: { 'bramble-berry': 2, 'red-apricorn': 1 }, station: 'campfire', level: 1, seconds: 3 },
  { id: 'mushroom-skewer', out: 'mushroom-skewer', count: 1, cost: { 'wild-mushroom': 3, wood: 1 }, station: 'campfire', level: 1, seconds: 4 },
  { id: 'boiled-water', out: 'water-flask', count: 1, cost: { 'river-water': 1, wood: 1 }, station: 'campfire', level: 1, seconds: 3 },
  { id: 'hearty-stew', out: 'hearty-stew', count: 1, cost: { 'wild-mushroom': 2, 'bramble-berry': 2, 'river-water': 1, wood: 1 }, station: 'campfire', level: 1, seconds: 6, prize: "Win it in Gudrun's cook-off under the lone tree" },
  { id: 'potion', out: 'bandage', count: 1, cost: { 'bramble-berry': 2, fiber: 1 }, station: 'workbench', level: 3, seconds: 2.5 },
  { id: 'poke-ball', out: 'poke-ball', count: 1, cost: { 'red-apricorn': 1, 'copper-ore': 1, fiber: 2 }, station: 'workbench', level: 3, seconds: 3 },
  { id: 'canteen', out: 'canteen', count: 1, cost: { 'copper-ore': 1, fiber: 2, wood: 2 }, station: 'workbench', level: 3, seconds: 3 },
  { id: 'cloth-cap', out: 'cloth-cap', count: 1, cost: { 'woven-cloth': 2, fiber: 1 }, station: 'workbench', level: 3, seconds: 3, tp: 1 },
  { id: 'cloth-trousers', out: 'cloth-trousers', count: 1, cost: { 'woven-cloth': 3, fiber: 2 }, station: 'workbench', level: 3, seconds: 3.5, tp: 1 },
  { id: 'cloth-tunic', out: 'cloth-tunic', count: 1, cost: { 'woven-cloth': 4, fiber: 2 }, station: 'workbench', level: 4, seconds: 4, tp: 1 },
];

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export type CraftBlock = 'level' | 'learn' | 'station' | 'materials' | null;

/** Why a recipe can't be made right now (the first reason that applies), or null if it can. */
export function craftBlock(r: Recipe, bag: Record<string, number>, level: number, stations: readonly Station[], learned: readonly string[] = []): CraftBlock {
  if (level < r.level) return 'level';
  if ((r.tp || r.prize) && !learned.includes(r.id)) return 'learn';
  if (r.station !== 'hand' && !stations.includes(r.station)) return 'station';
  for (const [id, n] of Object.entries(r.cost)) if ((bag[id] ?? 0) < n) return 'materials';
  return null;
}

/**
 * Technology Points (DESIGN §6.4, §7.1): one per trainer level past the first and one per Lysfolk
 * tablet read, spent to learn recipes. Returns what's left to spend.
 */
export function techPoints(level: number, tabletsRead: number, learned: readonly string[]): { earned: number; spent: number; left: number } {
  const earned = Math.max(0, level - 1) + Math.max(0, tabletsRead);
  const spent = learned.reduce((n, id) => n + (recipeById(id)?.tp ?? 0), 0);
  return { earned, spent, left: earned - spent };
}

/** Whether a recipe can be learned now (and isn't already). */
export function canLearn(r: Recipe, level: number, left: number, learned: readonly string[]): boolean {
  return !!r.tp && !learned.includes(r.id) && level >= r.level && left >= r.tp;
}

/**
 * What one craft actually uses. You need the full cost to start; a class that saves materials
 * (the Artisan, 0.92) then keeps some back, so over many crafts it pays `mod` of the cost.
 */
export function craftSpend(r: Recipe, mod: number, rand: () => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(r.cost)) {
    const exact = n * Math.min(1, mod), whole = Math.floor(exact);
    out[id] = whole + (rand() < exact - whole ? 1 : 0);
  }
  return out;
}

/** Make one: take the materials and add the result. The caller checks `craftBlock` first. */
export function applyCraft(r: Recipe, bag: Record<string, number>, spend: Record<string, number>): void {
  for (const [id, n] of Object.entries(spend)) {
    bag[id] = (bag[id] ?? 0) - n;
    if (bag[id] <= 0) delete bag[id];
  }
  bag[r.out] = (bag[r.out] ?? 0) + r.count;
}
