import { createCreature, maxHp } from './battle/creature';
import type { AiKind } from './battle/engine';
import { Rng } from './battle/rng';
import { xpForLevel } from './battle/stats';
import type { Creature, TypeName } from './battle/types';
import { MOVES } from './data/moves';
import { SPECIES, species } from './data/species';
import { bossMoves, spread } from './gyms';
import type { Appearance } from './types';

/**
 * The Battle Tower at Tornhavn (DESIGN §2, §3.6, §4.1). Trainers with five badges climb it in
 * streaks of battles against hand-built teams, for Battle Points (BP) that buy the region's best
 * held items. Nothing here is handed out: a streak ends at the first loss, and BP come slowly.
 *
 * - Two brackets with their own levels: Level 50 and Open (everyone at 100). Your Pokémon are
 *   entered at the bracket's level for the battle only; nothing they do in the Tower changes them.
 * - Solo: four entered, two out at once. Co-op: three each, one out each, against two trainers.
 * - Streaks run in sets of seven. Every set the opponents get stronger: tougher species, better
 *   spreads, held items, and smarter trainers (T4 from the fourth set). Tower Tycoon Freya waits at
 *   the 21st and 49th battles.
 * - The Tower heals your entrants between battles, and you can rest in the lobby between battles
 *   without losing the streak.
 */

export type TowerBracket = 'level50' | 'open';
export type TowerMode = 'solo' | 'coop';

export const TOWER = {
  /** Battles in a set; the last of each set pays a bonus. */
  setLength: 7,
  /** Battle numbers (in a streak) where the Tower Tycoon fights. */
  tycoonAt: [21, 49] as readonly number[],
  /** How many Pokémon each player enters. */
  entrants: { solo: 4, coop: 3 } as const,
  level: { level50: 50, open: 100 } as const,
  /** Badges needed to enter (the ferry pass, DESIGN §2). */
  badges: 5,
};

export const BRACKET_NAME: Record<TowerBracket, string> = { level50: 'Level 50', open: 'Open Level' };
export const MODE_NAME: Record<TowerMode, string> = { solo: 'Solo', coop: 'Co-op' };

/** The battle id the Tower's co-op battles share, so a friend's game knows what they joined. */
export const TOWER_BATTLE_ID = 'battle-tower';

/** Saved Tower progress: BP in hand, the streak under way and the best one, per bracket and mode. */
export interface TowerRecord {
  bp: number;
  /** Battles won in the current streak. */
  streak: Partial<Record<string, number>>;
  best: Partial<Record<string, number>>;
  /** The Tycoon's prints: "level50-silver", "open-gold"... */
  prints?: string[];
}

export function towerKey(bracket: TowerBracket, mode: TowerMode): string {
  return `${bracket}-${mode}`;
}

export function emptyTowerRecord(): TowerRecord {
  return { bp: 0, streak: {}, best: {} };
}

/** Which set (0 = battles 1 to 7) a battle number is in. */
export function towerSet(battle: number): number {
  return Math.floor((Math.max(1, battle) - 1) / TOWER.setLength);
}

/** The computer's tier for a battle: sharp from the start, near-flawless from the fourth set. */
export function towerAi(battle: number): AiKind {
  const s = towerSet(battle);
  return s === 0 ? 't2' : s < 3 ? 't3' : 't4';
}

export function isTycoon(battle: number): boolean {
  return TOWER.tycoonAt.includes(battle);
}

/** BP for winning battle `battle` of a streak. */
export function towerReward(battle: number): number {
  if (isTycoon(battle)) return battle >= 49 ? 20 : 10;
  const s = towerSet(battle);
  const base = Math.min(4, 1 + s);
  return base + (battle % TOWER.setLength === 0 ? 3 : 0);
}

/**
 * Your entrants, at the bracket's level: copies, healed, under their own uids so the battle's
 * experience, PP and HP never reach the real ones. The first ones in party order are entered.
 */
export function towerEntrants(party: readonly Creature[], mode: TowerMode, bracket: TowerBracket): Creature[] {
  const level = TOWER.level[bracket];
  return party.filter((c) => SPECIES[c.species]).slice(0, TOWER.entrants[mode]).map((c) => {
    const copy: Creature = JSON.parse(JSON.stringify(c));
    copy.uid = `tower:${c.uid}`;
    copy.level = level;
    copy.xp = xpForLevel(species(c.species).growth, level);
    copy.bankedXp = undefined;
    copy.status = undefined;
    for (const m of copy.moves) m.pp = MOVES[m.id]?.pp ?? m.pp;
    copy.hp = maxHp(copy);
    return copy;
  });
}

/** Can this party enter? Returns why not, or null. */
export function towerBlock(party: readonly Creature[], mode: TowerMode): string | null {
  const need = TOWER.entrants[mode];
  const n = party.filter((c) => SPECIES[c.species]).length;
  return n < need ? `${MODE_NAME[mode]} challengers enter ${need} Pokémon. You have ${n}.` : null;
}

export interface TowerTeam {
  name: string;
  title: string;
  creatures: Creature[];
  ai: AiKind;
  look: Appearance;
}

const look = (skinTone: string, hairColor: string, hairStyle: number, jacketColor: string, pantsColor: string, build: number): Appearance =>
  ({ trainerModel: 'custom', skinTone, hairColor, hairStyle, jacketColor, pantsColor, build });

const CLASSES = ['Ace Trainer', 'Veteran', 'Ranger', 'Sailor', 'Scientist', 'Skier', 'Fisher', 'Hiker', 'Gentleman', 'Lady', 'Breeder', 'Expert'];
const NAMES = ['Asbjørn', 'Liv', 'Henrik', 'Ingrid', 'Torvald', 'Maren', 'Steinar', 'Karin', 'Odd', 'Sigrid', 'Ragnvald', 'Tuva', 'Einar', 'Hedda', 'Bjarne', 'Vilde', 'Leif', 'Ronja', 'Trygve', 'Embla', 'Harald', 'Siri', 'Knut', 'Frøya'];
const SKIN = ['#f6d7b8', '#e8b48a', '#c68c62', '#a8714a', '#8a5a3a', '#6e4630'];
const HAIR = ['#2b1d14', '#5a3a22', '#c9a26a', '#e6d3a3', '#a33a2a', '#8b8b8b'];
const JACKET = ['#2a3a6a', '#6a2a3a', '#2f5f4a', '#4a4a52', '#7a5a2a', '#3d5a7a'];

/** Type boosters, for teams that hold one. */
const BOOSTER: Partial<Record<TypeName, string>> = {
  fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed', electric: 'magnet', ice: 'never-melt-ice', fighting: 'black-belt',
  poison: 'poison-barb', ground: 'soft-sand', flying: 'sharp-beak', psychic: 'twisted-spoon', bug: 'silver-powder', rock: 'hard-stone',
  ghost: 'spell-tag', dragon: 'dragon-fang', dark: 'black-glasses', steel: 'metal-coat', normal: 'silk-scarf', fairy: 'fairy-feather',
};
const COMPETITIVE = ['leftovers', 'life-orb', 'focus-sash', 'sitrus-berry', 'lum-berry', 'expert-belt', 'assault-vest', 'rocky-helmet', 'muscle-band', 'wise-glasses'];

const bst = (id: string) => Object.values(SPECIES[id].baseStats).reduce((a, b) => a + b, 0);

/** Fully evolved species the Tower's trainers use, by set: the field gets tougher as you climb. */
export function towerPool(set: number): string[] {
  const finals = Object.values(SPECIES).filter((s) => !s.evolution).map((s) => s.id);
  const [lo, hi] = set === 0 ? [0, 490] : set === 1 ? [450, 510] : set === 2 ? [480, 535] : set === 3 ? [490, 560] : [490, 999];
  return finals.filter((id) => bst(id) >= lo && bst(id) <= hi);
}

function towerCreature(id: string, level: number, set: number, index: number, item: string | undefined, rng: Rng, owner: string): Creature {
  // Set 1 trains like a mid-band gym team; from the second set every spread is a full one.
  const s = spread(id, set === 0 ? 1 : 3, set > 0);
  if (set === 1) s.ivs = { hp: 25, atk: 25, def: 25, spa: 25, spd: 25, spe: 25 };
  return createCreature(id, level, rng, { ...s, moves: bossMoves(id, level), item, uid: `${owner}:${index}`, ot: owner });
}

/** One Tower trainer: `size` different species, no two holding the same item. */
function towerTrainer(bracket: TowerBracket, battle: number, size: number, rng: Rng, slot: number, avoid: Set<string>): TowerTeam {
  const set = towerSet(battle);
  const level = TOWER.level[bracket];
  const pool = rng.shuffle(towerPool(set).filter((id) => !avoid.has(id)));
  const picks = pool.slice(0, size);
  picks.forEach((id) => avoid.add(id));
  const items = rng.shuffle([...COMPETITIVE]);
  const owner = `tower-${battle}-${slot}`;
  const creatures = picks.map((id, i) => {
    let item: string | undefined;
    if (set === 0) item = i === 0 ? 'sitrus-berry' : undefined;
    else item = i === 0 ? BOOSTER[SPECIES[id].types[0]] ?? items[i] : items[i];
    return towerCreature(id, level, set, i, item, rng, owner);
  });
  const k = rng.int(0, 1000);
  return {
    name: NAMES[k % NAMES.length],
    title: CLASSES[(k >> 3) % CLASSES.length],
    creatures,
    ai: towerAi(battle),
    look: look(SKIN[k % SKIN.length], HAIR[(k >> 2) % HAIR.length], k % 4, JACKET[(k >> 4) % JACKET.length], '#2f2f36', k % 2),
  };
}

export const TYCOON = {
  name: 'Freya',
  title: 'Tower Tycoon',
  look: look('#f2c9a0', '#e6d3a3', 3, '#1e2a52', '#2f2f36', 0),
};

/** The Tycoon's two teams (silver at 21, gold at 49), strongest last; solo she brings the last four. */
const TYCOON_TEAMS: Record<'silver' | 'gold', [string, string][]> = {
  silver: [['rhydon', 'rocky-helmet'], ['starmie', 'expert-belt'], ['machamp', 'focus-sash'], ['alakazam', 'life-orb'], ['gyarados', 'lum-berry'], ['snorlax', 'leftovers']],
  gold: [['machamp', 'assault-vest'], ['starmie', 'expert-belt'], ['gengar', 'focus-sash'], ['snorlax', 'leftovers'], ['gyarados', 'lum-berry'], ['dragonite', 'life-orb']],
};

function tycoonTeam(bracket: TowerBracket, battle: number, size: number, rng: Rng): TowerTeam {
  const tier = battle >= 49 ? 'gold' : 'silver';
  const list = TYCOON_TEAMS[tier].slice(-size);
  const level = TOWER.level[bracket];
  const owner = `tower-tycoon-${tier}`;
  return {
    ...TYCOON,
    creatures: list.map(([id, item], i) => createCreature(id, level, rng, { ...spread(id, 3, true), moves: bossMoves(id, level), item, uid: `${owner}:${i}`, ot: owner })),
    ai: 't4',
  };
}

/**
 * Who you face in battle `battle` of a streak. Solo: one trainer with four. Co-op: two trainers
 * with three each (one out each), except the Tycoon, who fields six on her own.
 */
export function towerOpponents(bracket: TowerBracket, mode: TowerMode, battle: number, seed: number): { teams: TowerTeam[]; tycoon: boolean } {
  const rng = new Rng(seed);
  if (isTycoon(battle)) return { teams: [tycoonTeam(bracket, battle, mode === 'solo' ? 4 : 6, rng)], tycoon: true };
  const avoid = new Set<string>();
  if (mode === 'solo') return { teams: [towerTrainer(bracket, battle, 4, rng, 0, avoid)], tycoon: false };
  return { teams: [towerTrainer(bracket, battle, 3, rng, 0, avoid), towerTrainer(bracket, battle, 3, rng, 1, avoid)], tycoon: false };
}

/** A battle won: the streak goes on, BP are paid, the best streak and the Tycoon's prints are kept. */
export function towerWin(rec: TowerRecord, bracket: TowerBracket, mode: TowerMode): { battle: number; bp: number; print?: string } {
  const key = towerKey(bracket, mode);
  const battle = (rec.streak[key] ?? 0) + 1;
  rec.streak[key] = battle;
  rec.best[key] = Math.max(rec.best[key] ?? 0, battle);
  const bp = towerReward(battle);
  rec.bp += bp;
  let print: string | undefined;
  if (isTycoon(battle)) {
    print = `${bracket}-${battle >= 49 ? 'gold' : 'silver'}`;
    if (!(rec.prints ??= []).includes(print)) rec.prints.push(print);
  }
  return { battle, bp, print };
}

/** A battle lost: the streak is over. Returns how far it went. */
export function towerLoss(rec: TowerRecord, bracket: TowerBracket, mode: TowerMode): number {
  const key = towerKey(bracket, mode);
  const reached = rec.streak[key] ?? 0;
  rec.streak[key] = 0;
  return reached;
}

/** The BP exchange: the region's best held items, and nothing else sells them. */
export const BP_SHOP: { id: string; bp: number }[] = [
  { id: 'sitrus-berry', bp: 4 },
  { id: 'lum-berry', bp: 6 },
  { id: 'muscle-band', bp: 24 },
  { id: 'wise-glasses', bp: 24 },
  { id: 'focus-sash', bp: 32 },
  { id: 'expert-belt', bp: 32 },
  { id: 'rocky-helmet', bp: 32 },
  { id: 'leftovers', bp: 48 },
  { id: 'life-orb', bp: 48 },
  { id: 'assault-vest', bp: 48 },
  { id: 'eviolite', bp: 48 },
];

export function buyWithBp(rec: TowerRecord, bag: Record<string, number>, id: string): boolean {
  const entry = BP_SHOP.find((e) => e.id === id);
  if (!entry || rec.bp < entry.bp) return false;
  rec.bp -= entry.bp;
  bag[id] = (bag[id] ?? 0) + 1;
  return true;
}
