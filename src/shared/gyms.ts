import { createCreature, defaultMoves } from './battle/creature';
import type { AiKind } from './battle/engine';
import { Rng } from './battle/rng';
import { calcStats, LEVEL_CAPS } from './battle/stats';
import type { Creature, StatTable, TypeName } from './battle/types';
import { moveData } from './data/moves';
import { species } from './data/species';
import { SETTLEMENTS, type Settlement } from './region';
import type { Appearance } from './types';

/**
 * Sijord's ten gyms (DESIGN §3.3, §13). Gyms can be taken in any order, so every unbeaten gym
 * scales to the world's progress: the gym you happen to fight third is always a third-gym fight.
 *
 * - The ace sits at the level cap for the badges held, and never below the best ace already
 *   beaten plus six (the level record), so a gym never steps backwards.
 * - Each leader has four hand-picked teams, for 0-2, 3-5, 6-8 and 9 badges. Team size grows from
 *   three to six, and IVs, EVs, natures, held items and the AI tier step up with the band.
 * - Two gym trainers stand between the chambers and fight together as a tag team.
 */

export interface GymDef {
  id: string;
  /** The city it stands in. */
  city: Settlement;
  type: TypeName;
  leader: string;
  title: string;
  puzzle: string;
  /** Species per band (badges 0-2, 3-5, 6-8, 9), weakest first, the ace last. */
  bands: [string[], string[], string[], string[]];
  /** The badge's name. */
  badge: string;
  /** What the gym trainers are called ("Beekeeper"). */
  trainerTitle: string;
  /** Held items its creatures favour (type boosters first). */
  items: string[];
  look: Appearance;
}

const look = (skinTone: string, hairColor: string, hairStyle: number, jacketColor: string, pantsColor: string, build: number): Appearance =>
  ({ trainerModel: 'custom', skinTone, hairColor, hairStyle, jacketColor, pantsColor, build });

const city = (id: string): Settlement => {
  const s = SETTLEMENTS.find((x) => x.id === id);
  if (!s?.gym) throw new Error(`No gym in ${id}`);
  return s;
};

function gym(cityId: string, badge: string, trainerTitle: string, items: string[], appearance: Appearance, bands: GymDef['bands']): GymDef {
  const c = city(cityId);
  const g = c.gym!;
  return { id: cityId, city: c, type: g.type as TypeName, leader: g.leader, title: g.title, puzzle: g.puzzle, bands, badge, trainerTitle, items, look: appearance };
}

export const GYMS: readonly GymDef[] = [
  gym('verdhavn', 'Hive Badge', 'Beekeeper', ['silver-powder', 'focus-sash', 'leftovers'], look('#e8b48a', '#c9a26a', 2, '#d9a24a', '#5a4632', 0), [
    ['weedle', 'dewmite', 'paras', 'venonat'],
    ['paras', 'venonat', 'beedrill', 'parasect', 'venomoth'],
    ['beedrill', 'parasect', 'pinsir', 'auroramoth', 'venomoth', 'scyther'],
    ['parasect', 'beedrill', 'pinsir', 'venomoth', 'auroramoth', 'scyther'],
  ]),
  gym('skarsund', 'Tide Badge', 'Deckhand', ['mystic-water', 'leftovers', 'sitrus-berry'], look('#c68c62', '#2b1d14', 1, '#2f4f5f', '#3d4a5c', 1), [
    ['horsea', 'krabby', 'goldeen', 'poliwhirl'],
    ['seaking', 'seadra', 'kingler', 'golduck', 'starmie'],
    ['kingler', 'golduck', 'starmie', 'cloyster', 'selkira', 'gyarados'],
    ['kingler', 'starmie', 'cloyster', 'lapras', 'poliwrath', 'gyarados'],
  ]),
  gym('emberholt', 'Anvil Badge', 'Smith', ['charcoal', 'life-orb', 'focus-sash'], look('#a8714a', '#a33a2a', 3, '#8a3a2c', '#2f2f36', 1), [
    ['cindlet', 'hjordpup', 'vulpix', 'ponyta'],
    ['hjordpup', 'vulpix', 'ponyta', 'pyrolynx', 'magmar'],
    ['ponyta', 'pyrolynx', 'ninetales', 'shepherion', 'magmar', 'rapidash'],
    ['rapidash', 'ninetales', 'magmar', 'shepherion', 'pyrolynx', 'forgelynx'],
  ]),
  gym('voltavik', 'Turbine Badge', 'Engineer', ['magnet', 'expert-belt', 'focus-sash'], look('#f2c9a0', '#e6d3a3', 0, '#5a6878', '#3d4a5c', 0), [
    ['voltorb', 'magnemite', 'pikachu', 'electabuzz'],
    ['magnemite', 'electrode', 'pikachu', 'magneton', 'electabuzz'],
    ['golduck', 'electrode', 'magneton', 'raichu', 'electabuzz'],
    ['gyarados', 'electrode', 'raichu', 'magneton', 'golduck', 'electabuzz'],
  ]),
  gym('grusdal', 'Canyon Badge', 'Miner', ['soft-sand', 'rocky-helmet', 'sitrus-berry'], look('#d9a77e', '#5a3a22', 2, '#d9553f', '#6a5a4a', 1), [
    ['diglett', 'sandshrew', 'cubone', 'geodude'],
    ['dugtrio', 'sandslash', 'graveler', 'marowak', 'rhyhorn'],
    ['dugtrio', 'sandslash', 'marowak', 'golem', 'nidoqueen', 'rhydon'],
    ['sandslash', 'dugtrio', 'marowak', 'golem', 'nidoking', 'rhydon'],
  ]),
  gym('isfjell', 'Floe Badge', 'Skater', ['never-melt-ice', 'leftovers', 'focus-sash'], look('#f6d7b8', '#d9d9d9', 3, '#8ab4d8', '#4a5a5a', 0), [
    ['seel', 'shellder', 'slowpoke', 'jynx'],
    ['seel', 'shellder', 'slowbro', 'jynx', 'dewgong'],
    ['dewgong', 'cloyster', 'jynx', 'slowbro', 'golduck', 'lapras'],
    ['dewgong', 'jynx', 'slowbro', 'cloyster', 'dragonair', 'lapras'],
  ]),
  gym('runeby', 'Glyph Badge', 'Scholar', ['twisted-spoon', 'wise-glasses', 'focus-sash'], look('#8a5a3a', '#2b1d14', 1, '#7a5a8a', '#2f2f36', 0), [
    ['slowpoke', 'exeggcute', 'drowzee', 'kadabra'],
    ['drowzee', 'exeggcute', 'slowbro', 'hypno', 'kadabra'],
    ['hypno', 'slowbro', 'exeggutor', 'starmie', 'jynx', 'alakazam'],
    ['hypno', 'slowbro', 'exeggutor', 'starmie', 'jynx', 'alakazam'],
  ]),
  gym('myrkvald', 'Lantern Badge', 'Lamplighter', ['spell-tag', 'black-glasses', 'focus-sash'], look('#6e4630', '#3a2a1a', 3, '#4a5a5a', '#2f2f36', 1), [
    ['zubat', 'grimer', 'gastly', 'haunter'],
    ['koffing', 'golbat', 'grimer', 'arbok', 'haunter'],
    ['golbat', 'muk', 'weezing', 'arbok', 'haunter', 'gengar'],
    ['muk', 'weezing', 'golbat', 'haunter', 'arbok', 'gengar'],
  ]),
  gym('blomstad', 'Bloom Badge', 'Gardener', ['fairy-feather', 'leftovers', 'sitrus-berry'], look('#f2c9a0', '#8b5a2b', 2, '#4fa86a', '#5a4632', 0), [
    ['oddish', 'jigglypuff', 'cloveret', 'luckhare'],
    ['gloom', 'jigglypuff', 'cloveret', 'wigglytuff', 'luckhare'],
    ['vileplume', 'wigglytuff', 'chansey', 'exeggutor', 'ninetales', 'luckhare'],
    ['vileplume', 'wigglytuff', 'chansey', 'exeggutor', 'ninetales', 'luckhare'],
  ]),
  gym('jernhamn', 'Cog Badge', 'Machinist', ['metal-coat', 'assault-vest', 'life-orb'], look('#c68c62', '#8b8b8b', 0, '#3a3836', '#2f2f36', 1), [
    ['machop', 'geodude', 'magnemite', 'onix'],
    ['magnemite', 'machop', 'onix', 'machoke', 'magneton'],
    ['onix', 'machoke', 'golem', 'electrode', 'machamp', 'magneton'],
    ['electrode', 'rhydon', 'golem', 'onix', 'machamp', 'magneton'],
  ]),
];

export const GYM_BY_ID: Record<string, GymDef> = Object.fromEntries(GYMS.map((g) => [g.id, g]));

/** Which band of a leader's teams applies with `tier` badges (0-2, 3-5, 6-8, 9+). */
export function gymBand(tier: number): 0 | 1 | 2 | 3 {
  return tier >= 9 ? 3 : tier >= 6 ? 2 : tier >= 3 ? 1 : 0;
}

/** Leaders think one tier ahead of their gym trainers (DESIGN §4.5, tuned harder: "really hard"). */
export function gymAi(tier: number, leader: boolean): AiKind {
  const b = gymBand(tier);
  if (leader) return b === 0 ? 't2' : 't3';
  return b === 0 ? 't1' : b === 1 ? 't2' : 't3';
}

/** World progress that scales gyms: the higher badge count of the players, and the level record. */
export interface WorldProgress {
  tier: number;
  record: number;
}

/** The ace's level: the cap for the badges held, never below the level record plus six. */
export function aceLevel(w: WorldProgress): number {
  const cap = LEVEL_CAPS[Math.max(0, Math.min(LEVEL_CAPS.length - 1, w.tier))];
  return Math.min(100, Math.max(cap, w.record ? w.record + 6 : 0));
}

/**
 * How many creatures a leader brings. DESIGN §3.3 started at three, but two players bring six
 * between them, so leaders start at four and field a full six from four badges.
 */
export function gymTeamSize(tier: number): number {
  return Math.min(6, 4 + Math.floor(tier / 2));
}

/**
 * Four moves for a boss creature: its best STAB attacks, the strongest coverage it knows and
 * one useful status move, chosen from everything it could have learned by now.
 */
export function bossMoves(speciesId: string, level: number): string[] {
  const sp = species(speciesId);
  const known = new Set<string>();
  for (const e of sp.learnset) if (e.level <= level) known.add(e.move);
  const all = [...known].map((id) => moveData(id));
  const value = (id: string) => {
    const m = moveData(id);
    const acc = m.accuracy === true ? 1 : m.accuracy / 100;
    const hits = m.multihit ? (m.multihit[0] + m.multihit[1]) / 2 : 1;
    let v = m.power * hits * acc * (sp.types.includes(m.type) ? 1.5 : 1);
    if (m.special === 'self-destruct') v *= 0.1;
    if (m.recoil) v *= 0.85;
    if (m.selfBoosts && Object.values(m.selfBoosts).some((x) => x < 0)) v *= 0.85;
    if (m.special === 'seismic-toss' || m.special === 'super-fang') v = level * 0.9;
    return v;
  };
  const attacks = all.filter((m) => m.category !== 'status').sort((a, b) => value(b.id) - value(a.id));
  const pick: string[] = [];
  const types = new Set<string>();
  // Best attack of each type first, so the set has coverage.
  for (const m of attacks) {
    if (pick.length >= 3) break;
    if (types.has(m.type)) continue;
    pick.push(m.id);
    types.add(m.type);
  }
  const status = all.filter((m) => m.category === 'status');
  const useful = status.find((m) => m.special === 'protect') ?? status.find((m) => m.status === 'slp' || m.status === 'par')
    ?? status.find((m) => m.heal) ?? status.find((m) => m.selfBoosts && Object.values(m.selfBoosts).some((x) => x > 0) && (m.selfBoosts.atk || m.selfBoosts.spa || m.selfBoosts.spe));
  if (useful) pick.push(useful.id);
  for (const m of attacks) {
    if (pick.length >= 4) break;
    if (!pick.includes(m.id)) pick.push(m.id);
  }
  if (!pick.length) return defaultMoves(speciesId, level);
  return pick.slice(0, 4);
}

/** A boss creature's spread for its band: IVs, EVs and a nature that suits its better attack. */
export function spread(speciesId: string, band: number, ace: boolean): { ivs: StatTable; evs: StatTable; nature: string } {
  const base = species(speciesId).baseStats;
  const physical = base.atk >= base.spa;
  const iv = band === 0 ? 15 : band === 1 ? 20 : 31;
  const ivs: StatTable = { hp: iv, atk: iv, def: iv, spa: iv, spd: iv, spe: iv };
  let evs: StatTable = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
  if (band >= 2 || (band === 1 && ace)) {
    // A full competitive spread: max the better attack and speed (or bulk, for slow creatures).
    const fast = base.spe >= 70;
    evs = { hp: fast ? 4 : 252, atk: physical ? 252 : 0, def: 0, spa: physical ? 0 : 252, spd: fast ? 0 : 4, spe: fast ? 252 : 0 };
  }
  const nature = band === 0 ? 'hardy' : physical ? (base.spe >= 70 ? 'jolly' : 'adamant') : base.spe >= 70 ? 'timid' : 'modest';
  return { ivs, evs, nature };
}

/** Held items for a band (DESIGN §4.5 table): berries early, competitive items late. */
function heldItem(g: GymDef, band: number, index: number, ace: boolean): string | undefined {
  if (band === 0) return ace ? 'sitrus-berry' : index % 2 ? 'oran-berry' : undefined;
  if (band === 1) return ace ? g.items[0] : ['sitrus-berry', 'leftovers', 'focus-sash', undefined][index % 4];
  const pool = band === 2 ? [g.items[1], 'sitrus-berry', 'expert-belt', 'lum-berry', 'leftovers'] : [g.items[1], g.items[2], 'life-orb', 'assault-vest', 'lum-berry', 'focus-sash'];
  return ace ? g.items[0] : pool[index % pool.length];
}

function bossCreature(g: GymDef, speciesId: string, level: number, band: number, index: number, ace: boolean, rng: Rng, owner: string): Creature {
  const s = spread(speciesId, band, ace);
  return createCreature(speciesId, level, rng, { ...s, moves: bossMoves(speciesId, level), item: heldItem(g, band, index, ace), uid: `${owner}:${index}`, ot: owner });
}

export interface GymTeam {
  name: string;
  title: string;
  creatures: Creature[];
  ai: AiKind;
}

/** The leader's team for the world's progress. */
export function leaderTeam(g: GymDef, w: WorldProgress, seed = 1): GymTeam {
  const band = gymBand(w.tier);
  const ace = aceLevel(w);
  const list = g.bands[band];
  const size = Math.min(gymTeamSize(w.tier), list.length);
  const chosen = list.slice(list.length - size);
  const rng = new Rng(seed);
  // Offsets 1-4 below the ace, strongest nearest the ace.
  const creatures = chosen.map((sp, i) => {
    const isAce = i === chosen.length - 1;
    const level = isAce ? ace : Math.max(2, ace - Math.min(4, chosen.length - 1 - i));
    return bossCreature(g, sp, level, band, i, isAce, rng, `${g.id}-leader`);
  });
  // Listed weakest first, so the ace waits at the back until the end.
  return { name: g.leader, title: 'Leader', creatures, ai: gymAi(w.tier, true) };
}

const TRAINER_NAMES = ['Sander', 'Mira', 'Tove', 'Halla', 'Joakim', 'Signe', 'Ottar', 'Ylva', 'Kristen', 'Brita', 'Arne', 'Hege', 'Lone', 'Matti', 'Eskil', 'Runa', 'Gunnar', 'Solvi', 'Torleif', 'Aud'];

/** The two gym trainers, who fight as a tag team between the chambers. */
export function gymTrainers(g: GymDef, w: WorldProgress, seed = 1): [GymTeam, GymTeam] {
  const band = gymBand(w.tier);
  const ace = aceLevel(w);
  const list = g.bands[band].slice(0, -1);
  const per = band === 0 ? 2 : 3;
  const i0 = GYMS.indexOf(g) * 2;
  const rng = new Rng(seed + 17);
  const make = (k: number): GymTeam => {
    const owner = `${g.id}-trainer-${k}`;
    const picks = Array.from({ length: per }, (_, j) => list[(k * per + j) % list.length]);
    return {
      name: TRAINER_NAMES[(i0 + k) % TRAINER_NAMES.length],
      title: g.trainerTitle,
      creatures: picks.map((sp, j) => bossCreature(g, sp, Math.max(2, ace - 5 + j), Math.max(0, band - 1), j, false, rng, owner)),
      ai: gymAi(w.tier, false),
    };
  };
  return [make(0), make(1)];
}

/**
 * The creatures a player registers for a boss battle (DESIGN §3.6): the first three healthy ones
 * at or under the level cap. Anything above it is "too wild for League rules".
 */
export function registerForBoss(party: readonly Creature[], cap: number, count = 3): { registered: Creature[]; tooWild: Creature[] } {
  const tooWild = party.filter((c) => c.level > cap);
  const registered = party.filter((c) => c.hp > 0 && c.level <= cap).slice(0, count);
  return { registered, tooWild };
}

/** A gym's ace level and team size as the scout board shows them. */
export function scoutLines(g: GymDef, w: WorldProgress): string[] {
  const team = leaderTeam(g, w);
  const names = team.creatures.map((c) => species(c.species).name);
  return [
    `Leader ${g.leader}, the ${g.title.toLowerCase()}. ${g.type[0].toUpperCase()}${g.type.slice(1)} type.`,
    `Expected team: ${names.join(', ')}. Their ace is around level ${aceLevel(w)}.`,
    'Leaders adapt to the trainers who challenge them. Every badge you win elsewhere makes this team stronger.',
  ];
}

/** After a win: the new badge count, the new level record. */
export function awardBadge(earned: readonly string[], gymId: string, record: number, ace: number): { earned: string[]; record: number } {
  const next = earned.includes(gymId) ? [...earned] : [...earned, gymId];
  return { earned: next, record: Math.max(record, ace) };
}

/** Stats of a creature, for tests and the scout board. */
export function statsOf(c: Creature): StatTable {
  return calcStats(species(c.species).baseStats, c.ivs, c.evs, c.level, c.nature);
}

/**
 * The Echo: a spirit partner for players with no friend online (DESIGN open question 1, option b,
 * behind a setting). It holds plates in the gyms and fights beside you with three creatures of its
 * own, a little under the cap.
 */
export function echoTeam(g: GymDef, w: WorldProgress): Creature[] {
  const cap = LEVEL_CAPS[Math.max(0, Math.min(LEVEL_CAPS.length - 1, w.tier))];
  // A plain, balanced trio, not hand-picked counters: the Echo helps, it doesn't carry you.
  const band = gymBand(w.tier);
  const trio = band === 0 ? ['meowth', 'psyduck', 'machop'] : band === 1 ? ['persian', 'golduck', 'machoke'] : ['persian', 'golduck', 'machamp'];
  const rng = new Rng(7);
  return trio.map((sp, i) => createCreature(sp, Math.max(5, cap - 2), rng, { ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, moves: bossMoves(sp, Math.max(5, cap - 2)), uid: `echo:${g.id}:${i}`, ot: 'Echo' }));
}
