import { ABILITIES } from '../data/abilities';
import { moveData, STRUGGLE } from '../data/moves';
import { species } from '../data/species';
import { catchChance, rollCatch } from './catch';
import { addEvs, gainXp, maxHp } from './creature';
import { calcDamage, modify } from './damage';
import { Rng } from './rng';
import { accuracyStageMultiplier, calcStats, stageMultiplier, xpYield } from './stats';
import { effectiveness } from './typechart';
import {
  emptyBoosts,
  type BoostName,
  type Boosts,
  type Creature,
  type MajorStatus,
  type MoveData,
  type SpeciesData,
  type StatTable,
  type TypeName,
} from './types';

/**
 * The battle engine: deterministic double battles with a seeded RNG (DESIGN §4).
 *
 * Every battle has two sides with two positions each. A position is controlled by one owner
 * (a player id, or "wild"/a trainer id), and each owner brings their own team, so the same
 * engine runs a solo double battle (one owner holds both positions) and a co-op boss battle
 * (each player holds one). The engine never touches the screen: callers submit choices and get
 * back a list of events to animate.
 */

export type SideId = 0 | 1;
export interface Pos {
  side: SideId;
  slot: 0 | 1;
}

export type Choice =
  | { kind: 'move'; move: number; target?: Pos }
  | { kind: 'switch'; team: number }
  | { kind: 'run' }
  /** Throw a ball at a wild creature; the trainer throws it, using this position's turn. */
  | { kind: 'ball'; ball: string; target: Pos }
  | { kind: 'pass' };

export type AiKind = 'wild' | 't1';

export interface TeamSetup {
  owner: string;
  /** Display name: the player's name, "Wild" or the trainer's name. */
  name: string;
  creatures: Creature[];
  /** Set for computer-controlled teams. */
  ai?: AiKind;
  /** Highest level this team's creatures can reach from experience (player teams). */
  levelCap?: number;
  /** Experience multiplier (the Scholar class). */
  xpMult?: number;
  /** Catch multiplier from class and skills. */
  catchMult?: number;
}

export interface SideSetup {
  teams: TeamSetup[];
  /** Owner of each of the two positions. */
  slots: [string, string];
}

export interface BattleSetup {
  seed: number;
  kind: 'wild' | 'trainer';
  sides: [SideSetup, SideSetup];
  hitTest?: (from: Pos, target: Pos, move: MoveData) => boolean;
}

export interface BattleMon {
  uid: string;
  owner: string;
  /** Index into its team. */
  index: number;
  creature: Creature;
  species: SpeciesData;
  name: string;
  types: TypeName[];
  stats: StatTable;
  maxHp: number;
  hp: number;
  status?: MajorStatus;
  sleepTurns: number;
  toxicCounter: number;
  boosts: Boosts;
  ability: string;
  item?: string;
  moves: { id: string; pp: number; maxPp: number }[];
  active: boolean;
  fainted: boolean;
  /** Caught by the other side's ball; it has left the field for good. */
  caught: boolean;
  /** Turns since it last switched in (1 on its first turn). */
  turnsOut: number;
  confused: number;
  flinch: boolean;
  protect: boolean;
  protectChain: number;
  helpingHand: boolean;
  followMe: boolean;
  /** Position that planted Leech Seed on it. */
  seededBy: Pos | null;
  flashFire: boolean;
  movedThisTurn: boolean;
  /** Foes (uids) it has faced on the field; they share the experience when it faints. */
  faced: Set<string>;
}

interface Team {
  setup: TeamSetup;
  mons: BattleMon[];
}

interface Side {
  teams: Team[];
  slots: [string, string];
  active: [BattleMon | null, BattleMon | null];
  tailwind: number;
}

export type BattlePhase = 'move' | 'replace' | 'ended';

/** A position whose owner must decide something before the battle can continue. */
export interface Request {
  pos: Pos;
  owner: string;
  kind: 'move' | 'replace';
}

interface EventBase {
  /** Human-readable line for the battle log. */
  text?: string;
}
export type BattleEvent = EventBase &
  (
    | { t: 'turn'; turn: number }
    | { t: 'switch-in'; pos: Pos; uid: string; species: string; name: string; level: number; hp: number; maxHp: number; status?: MajorStatus; owner: string }
    | { t: 'switch-out'; pos: Pos; uid: string }
    | { t: 'move'; pos: Pos; move: string; type: TypeName; category: MoveData['category']; targets: Pos[] }
    | { t: 'damage'; pos: Pos; amount: number; hp: number; maxHp: number; effect?: number; crit?: boolean; cause: 'move' | 'recoil' | 'status' | 'confusion' | 'seed' }
    | { t: 'heal'; pos: Pos; amount: number; hp: number; maxHp: number }
    | { t: 'miss'; pos: Pos; target: Pos }
    | { t: 'fail'; pos: Pos }
    | { t: 'immune'; pos: Pos }
    | { t: 'protect'; pos: Pos }
    | { t: 'status'; pos: Pos; status: MajorStatus | null }
    | { t: 'confused'; pos: Pos; on: boolean }
    | { t: 'boost'; pos: Pos; stat: BoostName; amount: number }
    | { t: 'cant'; pos: Pos; reason: 'slp' | 'par' | 'frz' | 'flinch' | 'confusion' }
    | { t: 'faint'; pos: Pos; uid: string }
    | { t: 'ability'; pos: Pos; ability: string }
    | { t: 'item'; pos: Pos; item: string }
    | { t: 'xp'; uid: string; owner: string; amount: number }
    | { t: 'level'; uid: string; owner: string; level: number; learned: string[] }
    | { t: 'run'; success: boolean }
    | { t: 'throw'; pos: Pos; target: Pos; ball: string }
    | { t: 'catch'; pos: Pos; target: Pos; uid: string; ball: string; shakes: number; caught: boolean }
    | { t: 'msg' }
    | { t: 'end'; winner: SideId | null; reason: 'faint' | 'run' | 'catch' }
  );

export const STATUS_NAMES: Record<MajorStatus, string> = {
  brn: 'burned', par: 'paralysed', psn: 'poisoned', tox: 'badly poisoned', slp: 'asleep', frz: 'frozen',
};

const STAT_LABEL: Record<BoostName, string> = {
  atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed', accuracy: 'accuracy', evasion: 'evasiveness',
};

/** Held items that do something in battle. */
const BERRIES: Record<string, (m: BattleMon) => number> = {
  'oran-berry': () => 10,
  'sitrus-berry': (m) => Math.floor(m.maxHp / 4),
};

interface QueuedAction {
  mon: BattleMon;
  pos: Pos;
  choice: Choice;
  priority: number;
  speed: number;
  tie: number;
}

function alive(m: BattleMon | null | undefined): m is BattleMon {
  return !!m && !m.fainted && m.hp > 0;
}

export function posKey(p: Pos): string {
  return `${p.side}:${p.slot}`;
}

export function samePos(a: Pos | null | undefined, b: Pos | null | undefined): boolean {
  return !!a && !!b && a.side === b.side && a.slot === b.slot;
}

export class Battle {
  readonly kind: 'wild' | 'trainer';
  readonly rng: Rng;
  private sides: [Side, Side];
  phase: BattlePhase = 'move';
  turn = 0;
  winner: SideId | null = null;
  /** Set when the player side ran from a wild battle. */
  escaped = false;
  private runAttempts = 0;
  /** The most recent creature to leave the field was caught (rather than fainting). */
  private lastCatch = false;
  private choices = new Map<string, Choice>();
  private events: BattleEvent[] = [];
  /** Moves creatures wanted to learn while already knowing four (uid -> moves). */
  readonly pendingMoves = new Map<string, string[]>();

  constructor(private setup: BattleSetup) {
    this.kind = setup.kind;
    this.rng = new Rng(setup.seed);
    this.sides = setup.sides.map((s, side) => this.buildSide(s, side as SideId)) as [Side, Side];
  }

  private buildSide(s: SideSetup, side: SideId): Side {
    const teams: Team[] = s.teams.map((t) => ({
      setup: t,
      mons: t.creatures.map((c, i) => this.buildMon(c, t.owner, i)),
    }));
    void side;
    return { teams, slots: s.slots, active: [null, null], tailwind: 0 };
  }

  private buildMon(c: Creature, owner: string, index: number): BattleMon {
    const sp = species(c.species);
    const stats = calcStats(sp.baseStats, c.ivs, c.evs, c.level, c.nature);
    return {
      uid: c.uid,
      owner,
      index,
      creature: c,
      species: sp,
      name: c.nickname || sp.name,
      types: [...sp.types],
      stats,
      maxHp: stats.hp,
      hp: Math.min(c.hp, stats.hp),
      status: c.status,
      sleepTurns: c.status === 'slp' ? 1 + this.rng.int(0, 2) : 0,
      toxicCounter: 0,
      boosts: emptyBoosts(),
      ability: c.ability,
      item: c.item,
      moves: c.moves.map((m) => ({ id: m.id, pp: m.pp, maxPp: moveData(m.id).pp })),
      active: false,
      fainted: c.hp <= 0,
      caught: false,
      turnsOut: 0,
      confused: 0,
      flinch: false,
      protect: false,
      protectChain: 0,
      helpingHand: false,
      followMe: false,
      seededBy: null,
      flashFire: false,
      movedThisTurn: false,
      faced: new Set(),
    };
  }

  // ------------------------------------------------------------------------------------------
  // Public queries
  // ------------------------------------------------------------------------------------------

  /** Co-op invitation is accepted before the opening send-outs, never halfway through a turn. */
  invitePartner(team: TeamSetup): boolean {
    if (this.turn !== 0 || this.activePositions().length || this.sides[0].teams.length !== 1 || !team.creatures.some(c => c.hp > 0)) return false;
    if (this.sides[0].teams[0].mons.some(m => team.creatures.some(c => c.uid === m.uid))) return false;
    this.sides[0].teams.push({ setup: team, mons: team.creatures.map((c, i) => this.buildMon(c, team.owner, i)) });
    this.sides[0].slots[1] = team.owner;
    return true;
  }

  /** The creature at a position, or null when the position is empty. */
  at(p: Pos): BattleMon | null {
    return this.sides[p.side].active[p.slot];
  }

  team(owner: string): BattleMon[] {
    for (const s of this.sides) for (const t of s.teams) if (t.setup.owner === owner) return t.mons;
    return [];
  }

  teamSetup(owner: string): TeamSetup | undefined {
    for (const s of this.sides) for (const t of s.teams) if (t.setup.owner === owner) return t.setup;
    return undefined;
  }

  sideOf(owner: string): SideId {
    return this.sides[0].teams.some((t) => t.setup.owner === owner) ? 0 : 1;
  }

  slotOwner(p: Pos): string {
    return this.sides[p.side].slots[p.slot];
  }

  /** Every occupied position, in side then slot order. */
  activePositions(): Pos[] {
    const out: Pos[] = [];
    for (const side of [0, 1] as SideId[]) for (const slot of [0, 1] as const) if (this.sides[side].active[slot]) out.push({ side, slot });
    return out;
  }

  /** Decisions still needed from computer and human owners for the current phase. */
  requests(): Request[] {
    if (this.phase === 'ended') return [];
    const out: Request[] = [];
    for (const side of [0, 1] as SideId[]) {
      for (const slot of [0, 1] as const) {
        const pos = { side, slot };
        const mon = this.at(pos);
        const owner = this.slotOwner(pos);
        if (this.phase === 'move' && mon && !mon.fainted) out.push({ pos, owner, kind: 'move' });
        if (this.phase === 'replace' && mon?.fainted && this.bench(owner).length) out.push({ pos, owner, kind: 'replace' });
      }
    }
    return out;
  }

  /** Healthy team members of an owner that are not on the field. */
  bench(owner: string): BattleMon[] {
    return this.team(owner).filter((m) => !m.fainted && !m.active && !m.caught);
  }

  /** Creatures caught during this battle, in the order they were caught. */
  readonly caught: Creature[] = [];

  isAi(owner: string): boolean {
    return !!this.teamSetup(owner)?.ai;
  }

  /** Foe positions that a single-target move from `pos` may aim at (occupied ones first). */
  foesOf(pos: Pos): Pos[] {
    const side = (1 - pos.side) as SideId;
    return ([0, 1] as const).map((slot) => ({ side, slot })).filter((p) => alive(this.at(p)));
  }

  allyOf(pos: Pos): Pos | null {
    const p = { side: pos.side, slot: (1 - pos.slot) as 0 | 1 };
    return alive(this.at(p)) ? p : null;
  }

  /** Valid targets for a move used from a position (empty when the move picks its own targets). */
  targetOptions(pos: Pos, move: MoveData): Pos[] {
    switch (move.target) {
      case 'normal': {
        const ally = this.allyOf(pos);
        return [...this.foesOf(pos), ...(ally ? [ally] : [])];
      }
      case 'adjacent-foe':
        return this.foesOf(pos);
      case 'ally': {
        const ally = this.allyOf(pos);
        return ally ? [ally] : [];
      }
      default:
        return [];
    }
  }

  // ------------------------------------------------------------------------------------------
  // Flow
  // ------------------------------------------------------------------------------------------

  /** Send out the leads. Call once; returns the opening events. */
  start(): BattleEvent[] {
    this.events = [];
    for (const side of [0, 1] as SideId[]) {
      const s = this.sides[side];
      const used = new Set<BattleMon>();
      for (const slot of [0, 1] as const) {
        const owner = s.slots[slot];
        const next = this.team(owner).find((m) => !m.fainted && !used.has(m));
        if (next) {
          used.add(next);
          this.switchIn(next, { side, slot }, false);
        }
      }
    }
    for (const p of this.speedOrder(this.activePositions())) this.onSwitchIn(p);
    this.trackFacing();
    this.checkEnd();
    return this.flush();
  }

  /** Record a decision for one position. Invalid choices are corrected rather than rejected. */
  choose(pos: Pos, choice: Choice): void {
    this.choices.set(posKey(pos), choice);
  }

  /** Whether every human decision for this phase is in. */
  ready(): boolean {
    return this.requests().every((r) => this.isAi(r.owner) || this.choices.has(posKey(r.pos)));
  }

  /**
   * Fill in computer decisions with `ai`, then resolve the current phase (a full turn, or the
   * replacements after a faint). Returns everything that happened.
   */
  resolve(ai: (b: Battle, pos: Pos, kind: 'move' | 'replace') => Choice): BattleEvent[] {
    this.events = [];
    for (const r of this.requests()) {
      if (this.isAi(r.owner) && !this.choices.has(posKey(r.pos))) this.choices.set(posKey(r.pos), ai(this, r.pos, r.kind));
    }
    if (this.phase === 'move') this.runTurn();
    else if (this.phase === 'replace') this.runReplacements();
    this.choices.clear();
    return this.flush();
  }

  private flush(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(e: BattleEvent): void {
    this.events.push(e);
  }

  private runTurn(): void {
    this.turn++;
    this.emit({ t: 'turn', turn: this.turn });
    for (const p of this.activePositions()) {
      const m = this.at(p)!;
      m.movedThisTurn = false;
      m.turnsOut++;
    }

    // Running from a wild battle happens before anything else.
    const runChoice = [...this.choices.entries()].find(([, c]) => c.kind === 'run');
    if (runChoice && this.kind === 'wild') {
      const [key] = runChoice;
      const side = Number(key[0]) as SideId;
      if (this.tryRun(side)) return;
    }

    const queue: QueuedAction[] = [];
    for (const pos of this.activePositions()) {
      const mon = this.at(pos)!;
      if (mon.fainted) continue;
      let choice = this.choices.get(posKey(pos)) ?? this.defaultMove(pos);
      // A failed escape costs the whole side its turn.
      if (choice.kind === 'run') choice = this.kind === 'wild' ? { kind: 'pass' } : this.defaultMove(pos);
      if (choice.kind === 'switch' && !this.validSwitch(mon.owner, choice.team)) choice = this.defaultMove(pos);
      if (choice.kind === 'ball' && !this.validBall(pos, choice.target)) choice = { kind: 'pass' };
      if (choice.kind === 'pass') continue;
      let priority = 0;
      if (choice.kind === 'switch') priority = 7;
      else if (choice.kind === 'ball') priority = 6;
      else if (choice.kind === 'move') priority = this.choiceMove(mon, choice).priority;
      queue.push({ mon, pos, choice, priority, speed: this.speed(mon), tie: this.rng.next() });
    }
    queue.sort((a, b) => b.priority - a.priority || b.speed - a.speed || a.tie - b.tie);

    for (const q of queue) {
      if (this.phase === 'ended') return;
      if (q.mon.fainted || !q.mon.active) continue;
      const pos = this.posOf(q.mon);
      if (!pos) continue;
      if (q.choice.kind === 'switch') this.doSwitch(pos, q.choice.team);
      else if (q.choice.kind === 'move') this.useMove(pos, q.mon, q.choice);
      else if (q.choice.kind === 'ball') this.throwBall(pos, q.choice.ball, q.choice.target);
      q.mon.movedThisTurn = true;
      this.checkFaints();
      if (this.checkEnd()) return;
    }

    this.endOfTurn();
    this.checkFaints();
    if (this.checkEnd()) return;
    this.enterReplacePhase();
  }

  private enterReplacePhase(): void {
    const pending: Pos[] = [];
    for (const side of [0, 1] as SideId[]) {
      for (const slot of [0, 1] as const) {
        const pos = { side, slot };
        const m = this.at(pos);
        if (!m?.fainted) continue;
        if (this.bench(this.slotOwner(pos)).length) pending.push(pos);
        else this.sides[side].active[slot] = null;
      }
    }
    this.phase = pending.length ? 'replace' : 'move';
  }

  private runReplacements(): void {
    const order: Pos[] = [];
    for (const r of this.requests()) {
      const c = this.choices.get(posKey(r.pos));
      const bench = this.bench(r.owner);
      let pick = c?.kind === 'switch' ? this.team(r.owner)[c.team] : undefined;
      if (!pick || pick.fainted || pick.active) pick = bench[0];
      if (!pick) continue;
      const old = this.at(r.pos);
      if (old) old.active = false;
      this.switchIn(pick, r.pos, true);
      order.push(r.pos);
    }
    for (const p of this.speedOrder(order)) this.onSwitchIn(p);
    this.trackFacing();
    this.phase = 'move';
    this.enterReplacePhase();
  }

  /** Balls only work on wild creatures still on the field. */
  private validBall(pos: Pos, target: Pos): boolean {
    if (this.kind !== 'wild' || target.side === pos.side) return false;
    const t = this.at(target);
    return alive(t) && this.teamSetup(t.owner)?.ai === 'wild';
  }

  private throwBall(pos: Pos, ball: string, target: Pos): void {
    const thrower = this.at(pos)!;
    const setup = this.teamSetup(thrower.owner);
    const trainer = setup?.name ?? 'You';
    const ballName = ball === 'great-ball' ? 'Great Ball' : ball === 'ultra-ball' ? 'Ultra Ball' : 'Poke Ball';
    let t = this.at(target);
    // The first target went down earlier this turn: aim at the other wild one instead.
    if (!alive(t)) {
      const other = this.foesOf(pos)[0];
      if (!other) return;
      target = other;
      t = this.at(target)!;
    }
    this.emit({ t: 'throw', pos, target, ball, text: `${trainer} threw a ${ballName}!` });
    const party = this.team(thrower.owner);
    const chance = catchChance({
      maxHp: t.maxHp,
      hp: t.hp,
      catchRate: t.species.catchRate,
      ball,
      status: t.status,
      level: t.creature.level,
      partyLevel: Math.max(1, ...party.map((m) => m.creature.level)),
      cap: setup?.levelCap ?? 100,
      throw: 'battle',
      classMod: setup?.catchMult,
    });
    const roll = rollCatch(chance, this.rng);
    if (roll.caught) {
      this.emit({ t: 'catch', pos, target, uid: t.uid, ball, shakes: roll.shakes, caught: true, text: `Gotcha! ${t.name} was caught!` });
      t.caught = true;
      t.status = t.status === 'tox' ? 'psn' : t.status;
      this.awardExperience(t);
      t.active = false;
      this.sides[target.side].active[target.slot] = null;
      this.caught.push(t.creature);
      this.lastCatch = true;
      return;
    }
    const near = ['Oh no! It broke free!', 'Aww! It appeared to be caught!', 'Argh! Almost had it!', 'Gah! It was so close, too!'][roll.shakes];
    this.emit({ t: 'catch', pos, target, uid: t.uid, ball, shakes: roll.shakes, caught: false, text: near });
    // Territorial and aggressive creatures don't take kindly to it (DESIGN §5.3).
    if ((t.species.temperament === 'territorial' || t.species.temperament === 'aggressive') && t.boosts.atk < 6) {
      t.boosts.atk++;
      this.emit({ t: 'boost', pos: target, stat: 'atk', amount: 1, text: `${this.label(target)} is enraged! Its Attack rose!` });
    }
  }

  private validSwitch(owner: string, team: number): boolean {
    const m = this.team(owner)[team];
    return !!m && !m.fainted && !m.active;
  }

  private defaultMove(pos: Pos): Choice {
    const mon = this.at(pos)!;
    const i = mon.moves.findIndex((m) => m.pp > 0);
    return { kind: 'move', move: i, target: this.foesOf(pos)[0] };
  }

  private choiceMove(mon: BattleMon, c: { move: number }): MoveData {
    const slot = mon.moves[c.move];
    if (!slot || slot.pp <= 0) return mon.moves.some((m) => m.pp > 0) ? moveData(mon.moves.find((m) => m.pp > 0)!.id) : STRUGGLE;
    return moveData(slot.id);
  }

  private posOf(mon: BattleMon): Pos | null {
    for (const side of [0, 1] as SideId[]) for (const slot of [0, 1] as const) if (this.sides[side].active[slot] === mon) return { side, slot };
    return null;
  }

  speed(mon: BattleMon): number {
    const side = this.posOf(mon)?.side;
    let s = Math.floor(mon.stats.spe * stageMultiplier(mon.boosts.spe));
    if (mon.status === 'par') s = Math.floor(s / 2);
    if (side !== undefined && this.sides[side].tailwind > 0) s *= 2;
    return s;
  }

  private speedOrder(ps: Pos[]): Pos[] {
    return ps
      .map((p) => ({ p, s: this.at(p) ? this.speed(this.at(p)!) : 0, r: this.rng.next() }))
      .sort((a, b) => b.s - a.s || a.r - b.r)
      .map((x) => x.p);
  }

  private tryRun(side: SideId): boolean {
    this.runAttempts++;
    const mine = this.sides[side].active.filter((m): m is BattleMon => !!m && !m.fainted);
    const theirs = this.sides[1 - side].active.filter((m): m is BattleMon => !!m && !m.fainted);
    const a = Math.max(1, ...mine.map((m) => this.speed(m)));
    const b = Math.max(1, ...theirs.map((m) => this.speed(m)));
    const sure = mine.some((m) => m.ability === 'run-away');
    const f = Math.floor((a * 128) / b) + 30 * this.runAttempts;
    const ok = sure || f > 255 || this.rng.int(0, 255) < f;
    this.emit({ t: 'run', success: ok, text: ok ? 'Got away safely!' : "Couldn't get away!" });
    if (ok) {
      this.escaped = true;
      this.phase = 'ended';
      this.winner = null;
      this.emit({ t: 'end', winner: null, reason: 'run' });
    }
    return ok;
  }

  // ------------------------------------------------------------------------------------------
  // Switching
  // ------------------------------------------------------------------------------------------

  private switchIn(mon: BattleMon, pos: Pos, announce: boolean): void {
    this.sides[pos.side].active[pos.slot] = mon;
    mon.active = true;
    mon.turnsOut = 0;
    mon.boosts = emptyBoosts();
    mon.confused = 0;
    mon.flinch = mon.protect = mon.helpingHand = mon.followMe = false;
    mon.protectChain = 0;
    mon.seededBy = null;
    mon.flashFire = false;
    mon.toxicCounter = 0;
    const trainer = this.teamSetup(mon.owner)?.name ?? '';
    const isWild = this.teamSetup(mon.owner)?.ai === 'wild';
    this.emit({
      t: 'switch-in', pos, uid: mon.uid, species: mon.species.id, name: mon.name, level: mon.creature.level,
      hp: mon.hp, maxHp: mon.maxHp, status: mon.status, owner: mon.owner,
      text: isWild ? `A wild ${mon.name} appeared!` : announce || trainer ? `${trainer} sent out ${mon.name}!` : `Go, ${mon.name}!`,
    });
  }

  private doSwitch(pos: Pos, teamIndex: number): void {
    const out = this.at(pos)!;
    const next = this.team(out.owner)[teamIndex];
    if (!next || next.fainted || next.active) return;
    this.emit({ t: 'switch-out', pos, uid: out.uid, text: `${out.name}, come back!` });
    if (out.ability === 'natural-cure' && out.status) out.status = undefined;
    if (out.ability === 'regenerator' && out.hp > 0) out.hp = Math.min(out.maxHp, out.hp + Math.floor(out.maxHp / 3));
    out.active = false;
    this.switchIn(next, pos, true);
    this.onSwitchIn(pos);
    this.trackFacing();
  }

  private onSwitchIn(pos: Pos): void {
    const mon = this.at(pos);
    if (!mon || mon.fainted) return;
    if (mon.ability === 'intimidate') {
      this.emit({ t: 'ability', pos, ability: 'intimidate', text: `${mon.name}'s Intimidate!` });
      for (const f of this.foesOf(pos)) {
        const foe = this.at(f)!;
        if (['inner-focus', 'own-tempo', 'scrappy'].includes(foe.ability)) {
          this.emit({ t: 'ability', pos: f, ability: foe.ability, text: `${foe.name}'s ${ABILITIES[foe.ability].name} kept it from being intimidated!` });
          continue;
        }
        this.applyBoost(f, 'atk', -1, false);
      }
    }
  }

  /** Remember who faced whom, so experience goes to everyone who fought a creature. */
  private trackFacing(): void {
    for (const p of this.activePositions()) {
      const m = this.at(p)!;
      if (m.fainted) continue;
      for (const f of this.foesOf(p)) this.at(f)!.faced.add(m.uid);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Moves
  // ------------------------------------------------------------------------------------------

  private useMove(pos: Pos, mon: BattleMon, choice: { move: number; target?: Pos }): void {
    if (!this.canAct(pos, mon)) {
      mon.protectChain = 0;
      return;
    }
    const slot = mon.moves[choice.move];
    let move: MoveData;
    if (slot && slot.pp > 0) {
      move = moveData(slot.id);
      slot.pp--;
    } else {
      const other = mon.moves.find((m) => m.pp > 0);
      if (other) {
        move = moveData(other.id);
        other.pp--;
      } else move = STRUGGLE;
    }
    if (move.special !== 'protect') mon.protectChain = 0;

    const targets = this.resolveTargets(pos, move, choice.target);
    this.emit({
      t: 'move', pos, move: move.id, type: move.type, category: move.category, targets,
      text: `${this.label(pos)} used ${move.name}!`,
    });

    switch (move.special) {
      case 'protect': {
        const ok = this.rng.next() < 1 / 3 ** mon.protectChain;
        if (ok) {
          mon.protect = true;
          mon.protectChain++;
          this.emit({ t: 'protect', pos, text: `${mon.name} protected itself!` });
        } else {
          mon.protectChain = 0;
          this.emit({ t: 'fail', pos, text: 'But it failed!' });
        }
        return;
      }
      case 'helping-hand': {
        const ally = this.allyOf(pos);
        if (!ally || this.at(ally)!.movedThisTurn) {
          this.emit({ t: 'fail', pos, text: 'But it failed!' });
          return;
        }
        this.at(ally)!.helpingHand = true;
        this.emit({ t: 'msg', text: `${mon.name} is ready to help ${this.at(ally)!.name}!` });
        return;
      }
      case 'follow-me':
        mon.followMe = true;
        this.emit({ t: 'msg', text: `${mon.name} became the centre of attention!` });
        return;
      case 'tailwind': {
        const side = this.sides[pos.side];
        if (side.tailwind > 0) {
          this.emit({ t: 'fail', pos, text: 'But it failed!' });
          return;
        }
        side.tailwind = 4;
        this.emit({ t: 'msg', text: 'A tailwind blew from behind your team!' });
        return;
      }
      case 'fake-out':
        if (mon.turnsOut > 1) {
          this.emit({ t: 'fail', pos, text: 'But it failed!' });
          return;
        }
        break;
      default:
        break;
    }

    if (move.target === 'self' || move.target === 'ally-side') {
      if (move.heal) {
        if (mon.hp >= mon.maxHp) this.emit({ t: 'fail', pos, text: `${mon.name}'s HP is full!` });
        else this.heal(pos, Math.ceil(mon.maxHp * move.heal), `${mon.name} regained health!`);
      }
      if (move.selfBoosts) for (const [s, n] of Object.entries(move.selfBoosts)) this.applyBoost(pos, s as BoostName, n, true);
      return;
    }

    if (!targets.length) {
      this.emit({ t: 'fail', pos, text: 'But there was no target...' });
      return;
    }

    const spread = targets.length > 1;
    let totalDamage = 0;
    for (const t of targets) {
      const target = this.at(t);
      if (!target || !alive(target)) continue;
      totalDamage += this.hitTarget(pos, mon, t, target, move, spread);
      if (!alive(mon)) break;
    }
    if (move.category !== 'status' && move.selfBoosts && totalDamage > 0 && alive(mon)) {
      for (const [s, n] of Object.entries(move.selfBoosts)) this.applyBoost(pos, s as BoostName, n, true);
    }
    if (move === STRUGGLE && alive(mon)) this.damage(pos, Math.max(1, Math.floor(mon.maxHp / 4)), 'recoil', `${mon.name} is hit with recoil!`);
    else if (move.recoil && totalDamage > 0 && alive(mon)) this.damage(pos, Math.max(1, Math.floor(totalDamage * move.recoil)), 'recoil', `${mon.name} is hit with recoil!`);
    if (move.drain && totalDamage > 0 && alive(mon)) this.heal(pos, Math.max(1, Math.floor(totalDamage * move.drain)), `${mon.name} drained some energy!`);
  }

  /** Status checks before acting. Returns false if the creature loses its turn. */
  private canAct(pos: Pos, mon: BattleMon): boolean {
    if (mon.status === 'slp') {
      mon.sleepTurns--;
      if (mon.sleepTurns > 0) {
        this.emit({ t: 'cant', pos, reason: 'slp', text: `${mon.name} is fast asleep.` });
        return false;
      }
      mon.status = undefined;
      this.emit({ t: 'status', pos, status: null, text: `${mon.name} woke up!` });
    }
    if (mon.status === 'frz') {
      if (this.rng.chance(20)) {
        mon.status = undefined;
        this.emit({ t: 'status', pos, status: null, text: `${mon.name} thawed out!` });
      } else {
        this.emit({ t: 'cant', pos, reason: 'frz', text: `${mon.name} is frozen solid!` });
        return false;
      }
    }
    if (mon.flinch) {
      mon.flinch = false;
      this.emit({ t: 'cant', pos, reason: 'flinch', text: `${mon.name} flinched and couldn't move!` });
      if (mon.ability === 'steadfast') this.applyBoost(pos, 'spe', 1, true);
      return false;
    }
    if (mon.confused > 0) {
      mon.confused--;
      if (mon.confused === 0) {
        this.emit({ t: 'confused', pos, on: false, text: `${mon.name} snapped out of its confusion!` });
      } else {
        this.emit({ t: 'msg', text: `${mon.name} is confused!` });
        if (this.rng.chance(33)) {
          const atk = Math.floor(mon.stats.atk * stageMultiplier(mon.boosts.atk));
          const def = Math.floor(mon.stats.def * stageMultiplier(mon.boosts.def));
          const dmg = calcDamage({ level: mon.creature.level, power: 40, attack: atk, defense: def, random: this.rng.int(85, 100), effectiveness: 1 });
          this.emit({ t: 'cant', pos, reason: 'confusion', text: 'It hurt itself in its confusion!' });
          this.damage(pos, dmg, 'confusion');
          return false;
        }
      }
    }
    if (mon.status === 'par' && this.rng.chance(25)) {
      this.emit({ t: 'cant', pos, reason: 'par', text: `${mon.name} is paralysed! It can't move!` });
      return false;
    }
    return true;
  }

  private resolveTargets(pos: Pos, move: MoveData, chosen?: Pos): Pos[] {
    switch (move.target) {
      case 'self':
      case 'ally-side':
        return [pos];
      case 'foe-side':
        return this.foesOf(pos);
      case 'ally': {
        const a = this.allyOf(pos);
        return a ? [a] : [];
      }
      case 'all-adjacent-foes':
        return this.foesOf(pos);
      case 'all-adjacent': {
        const a = this.allyOf(pos);
        return [...this.foesOf(pos), ...(a ? [a] : [])];
      }
      case 'normal':
      case 'adjacent-foe': {
        const foes = this.foesOf(pos);
        // Follow Me pulls single-target attacks aimed at its side.
        const aimingFoes = !chosen || chosen.side !== pos.side;
        if (aimingFoes) {
          const decoy = foes.find((f) => this.at(f)!.followMe);
          if (decoy) return [decoy];
        }
        if (chosen && alive(this.at(chosen)) && !samePos(chosen, pos)) {
          if (move.target === 'adjacent-foe' && chosen.side === pos.side) return foes.slice(0, 1);
          return [chosen];
        }
        // The chosen target is gone: aim at the other foe instead.
        if (chosen && chosen.side === pos.side) return [];
        const other = foes.find((f) => !chosen || f.slot !== chosen.slot) ?? foes[0];
        return other ? [other] : [];
      }
    }
  }

  /** One move against one target. Returns damage dealt. */
  private hitTarget(pos: Pos, user: BattleMon, tPos: Pos, target: BattleMon, move: MoveData, spread: boolean): number {
    if (target.protect && !samePos(pos, tPos)) {
      this.emit({ t: 'protect', pos: tPos, text: `${target.name} protected itself!` });
      return 0;
    }

    // Immunities from abilities.
    if (!samePos(pos, tPos)) {
      if (move.type === 'ground' && target.ability === 'levitate' && move.category !== 'status') {
        this.emit({ t: 'immune', pos: tPos, text: `${target.name} floats above the attack!` });
        return 0;
      }
      if (move.type === 'fire' && target.ability === 'flash-fire') {
        target.flashFire = true;
        this.emit({ t: 'ability', pos: tPos, ability: 'flash-fire', text: `${target.name}'s Flash Fire powered up its Fire moves!` });
        return 0;
      }
      if (move.type === 'water' && target.ability === 'water-absorb') {
        this.emit({ t: 'ability', pos: tPos, ability: 'water-absorb', text: `${target.name}'s Water Absorb!` });
        this.heal(tPos, Math.floor(target.maxHp / 4));
        return 0;
      }
      if (move.type === 'grass' && target.ability === 'sap-sipper') {
        this.emit({ t: 'ability', pos: tPos, ability: 'sap-sipper', text: `${target.name}'s Sap Sipper!` });
        this.applyBoost(tPos, 'atk', 1, true);
        return 0;
      }
      if (move.powder && target.types.includes('grass')) {
        this.emit({ t: 'immune', pos: tPos, text: `It doesn't affect ${target.name}...` });
        return 0;
      }
    }

    const typeEff = move === STRUGGLE ? 1 : this.typeEffect(user, move, target);
    const checksType = move.category !== 'status' || (move.status === 'par' && move.type === 'electric');
    if (checksType && typeEff === 0) {
      this.emit({ t: 'immune', pos: tPos, text: `It doesn't affect ${target.name}...` });
      return 0;
    }

    if ((this.setup.hitTest && !this.setup.hitTest(pos, tPos, move)) || !this.accuracyCheck(user, target, move)) {
      this.emit({ t: 'miss', pos, target: tPos, text: `${target.name} avoided the attack!` });
      return 0;
    }

    if (move.category === 'status') {
      this.applyStatusMove(pos, user, tPos, target, move);
      return 0;
    }

    const hits = move.multihit ? this.rollHits(move.multihit) : 1;
    let dealt = 0;
    let landed = 0;
    for (let i = 0; i < hits; i++) {
      if (!alive(target) || !alive(user)) break;
      const crit = this.rollCrit(user, move);
      let dmg = this.computeDamage(user, target, tPos, move, typeEff, spread, crit, this.rng.int(85, 100));
      // Sturdy: survive a hit from full HP.
      if (target.ability === 'sturdy' && target.hp === target.maxHp && dmg >= target.hp) {
        dmg = target.hp - 1;
        this.emit({ t: 'ability', pos: tPos, ability: 'sturdy', text: `${target.name} endured the hit!` });
      }
      dmg = Math.min(dmg, target.hp);
      landed++;
      dealt += dmg;
      this.damage(tPos, dmg, 'move', undefined, { effect: typeEff, crit });
      if (crit) this.emit({ t: 'msg', text: 'A critical hit!' });
      this.afterHit(pos, user, tPos, target, move);
    }
    if (hits > 1) this.emit({ t: 'msg', text: `Hit ${landed} time${landed === 1 ? '' : 's'}!` });
    if (typeEff > 1) this.emit({ t: 'msg', text: "It's super effective!" });
    else if (typeEff < 1) this.emit({ t: 'msg', text: "It's not very effective..." });

    if (alive(target) || move.secondary?.self) this.applySecondary(pos, user, tPos, target, move);
    this.checkBerry(tPos);
    return dealt;
  }

  private rollHits([min, max]: [number, number]): number {
    if (min === max) return min;
    // 2-5 hits: 35% / 35% / 15% / 15%.
    const r = this.rng.next();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }

  private rollCrit(user: BattleMon, move: MoveData): boolean {
    const stage = (move.critStage ?? 0) + (user.ability === 'super-luck' ? 1 : 0);
    const odds = stage <= 0 ? 1 / 24 : stage === 1 ? 1 / 8 : stage === 2 ? 1 / 2 : 1;
    return this.rng.next() < odds;
  }

  typeEffect(user: BattleMon, move: MoveData, target: BattleMon): number {
    let types = target.types;
    if (user.ability === 'scrappy' && (move.type === 'normal' || move.type === 'fighting')) types = types.filter((t) => t !== 'ghost');
    if (!types.length) return 1;
    return effectiveness(move.type, types);
  }

  private accuracyCheck(user: BattleMon, target: BattleMon, move: MoveData): boolean {
    if (move.accuracy === true) return true;
    if (move.target === 'self' || move.target === 'ally') return true;
    const accStage = user.boosts.accuracy - target.boosts.evasion;
    let acc = move.accuracy * accuracyStageMultiplier(accStage);
    if (user.ability === 'compound-eyes') acc *= 1.3;
    if (user.ability === 'hustle' && move.category === 'physical') acc *= 0.8;
    return this.rng.next() * 100 < acc;
  }

  /**
   * Damage of one hit, without side effects. `random` is the 85-100 roll. Exposed (as
   * estimateDamage) so the AI can reason with the same numbers.
   */
  private computeDamage(user: BattleMon, target: BattleMon, tPos: Pos, move: MoveData, typeEff: number, spread: boolean, crit: boolean, random: number): number {
    const physical = move.category === 'physical';
    let power = move.power;
    if (user.ability === 'technician' && power <= 60) power = modify(power, 1.5);
    if (user.helpingHand) power = modify(power, 1.5);

    const atkStat = physical ? 'atk' : 'spa';
    const defStat = physical ? 'def' : 'spd';
    let atkStage = user.boosts[atkStat];
    let defStage = target.boosts[defStat];
    if (crit) {
      atkStage = Math.max(0, atkStage);
      defStage = Math.min(0, defStage);
    }
    let attack = Math.floor(user.stats[atkStat] * stageMultiplier(atkStage));
    const defense = Math.max(1, Math.floor(target.stats[defStat] * stageMultiplier(defStage)));

    const pinch = user.hp <= Math.floor(user.maxHp / 3);
    const pinchType: Record<string, TypeName> = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' };
    if (pinch && pinchType[user.ability] === move.type) attack = modify(attack, 1.5);
    if (user.flashFire && move.type === 'fire') attack = modify(attack, 1.5);
    if (physical && user.ability === 'guts' && user.status) attack = modify(attack, 1.5);
    if (physical && user.ability === 'hustle') attack = modify(attack, 1.5);
    if (target.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) attack = modify(attack, 0.5);

    const final: number[] = [];
    const allyPos = { side: tPos.side, slot: (1 - tPos.slot) as 0 | 1 };
    const targetAlly = this.at(allyPos);
    if (targetAlly && !targetAlly.fainted && targetAlly.ability === 'friend-guard') final.push(0.75);

    return calcDamage({
      level: user.creature.level,
      power,
      attack,
      defense,
      spread,
      crit,
      random,
      stab: move !== STRUGGLE && user.types.includes(move.type),
      effectiveness: typeEff,
      burned: physical && user.status === 'brn' && user.ability !== 'guts',
      final,
    });
  }

  /** Average damage of a move from one position to another (for AI and UI hints). */
  estimateDamage(from: Pos, moveId: string, to: Pos): { min: number; max: number; effect: number } {
    const user = this.at(from);
    const target = this.at(to);
    const move = moveData(moveId);
    if (!user || !target || move.category === 'status') return { min: 0, max: 0, effect: 1 };
    const effect = this.typeEffect(user, move, target);
    if (effect === 0) return { min: 0, max: 0, effect };
    if (move.type === 'ground' && target.ability === 'levitate') return { min: 0, max: 0, effect: 0 };
    if (move.type === 'fire' && target.ability === 'flash-fire') return { min: 0, max: 0, effect: 0 };
    if (move.type === 'water' && target.ability === 'water-absorb') return { min: 0, max: 0, effect: 0 };
    if (move.type === 'grass' && target.ability === 'sap-sipper') return { min: 0, max: 0, effect: 0 };
    const spread = (move.target === 'all-adjacent-foes' || move.target === 'all-adjacent') && this.resolveTargets(from, move).length > 1;
    const hits = move.multihit ? (move.multihit[0] + move.multihit[1]) / 2 : 1;
    return {
      min: Math.floor(this.computeDamage(user, target, to, move, effect, spread, false, 85) * hits),
      max: Math.floor(this.computeDamage(user, target, to, move, effect, spread, false, 100) * hits),
      effect,
    };
  }

  private afterHit(pos: Pos, user: BattleMon, tPos: Pos, target: BattleMon, move: MoveData): void {
    if (!move.contact || !alive(user)) return;
    if (target.ability === 'static' && !user.status && this.rng.chance(30)) {
      this.emit({ t: 'ability', pos: tPos, ability: 'static', text: `${target.name}'s Static!` });
      this.setStatus(pos, 'par', false);
    }
    if (target.ability === 'flame-body' && !user.status && this.rng.chance(30)) {
      this.emit({ t: 'ability', pos: tPos, ability: 'flame-body', text: `${target.name}'s Flame Body!` });
      this.setStatus(pos, 'brn', false);
    }
  }

  private applySecondary(pos: Pos, user: BattleMon, tPos: Pos, target: BattleMon, move: MoveData): void {
    const sec = move.secondary;
    if (!sec) return;
    const chance = user.ability === 'serene-grace' ? sec.chance * 2 : sec.chance;
    if (!this.rng.chance(chance)) return;
    if (sec.self && alive(user)) for (const [s, n] of Object.entries(sec.self)) this.applyBoost(pos, s as BoostName, n, true);
    if (!alive(target) || target.ability === 'shield-dust') return;
    if (sec.status) this.setStatus(tPos, sec.status, false);
    if (sec.confuse) this.confuse(tPos, false);
    if (sec.flinch && !target.movedThisTurn && target.ability !== 'inner-focus') target.flinch = true;
    if (sec.boosts) for (const [s, n] of Object.entries(sec.boosts)) this.applyBoost(tPos, s as BoostName, n, false);
  }

  private applyStatusMove(pos: Pos, user: BattleMon, tPos: Pos, target: BattleMon, move: MoveData): void {
    let did = false;
    if (move.special === 'leech-seed') {
      if (target.types.includes('grass') || target.seededBy) {
        this.emit({ t: 'fail', pos, text: `${target.name} evaded the seed!` });
        return;
      }
      target.seededBy = pos;
      this.emit({ t: 'msg', text: `${target.name} was seeded!` });
      return;
    }
    if (move.status) did = this.setStatus(tPos, move.status, true) || did;
    if (move.confuse) did = this.confuse(tPos, true) || did;
    if (move.boosts) for (const [s, n] of Object.entries(move.boosts)) did = this.applyBoost(tPos, s as BoostName, n, false) || did;
    if (move.selfBoosts) for (const [s, n] of Object.entries(move.selfBoosts)) this.applyBoost(pos, s as BoostName, n, true);
    void user;
    if (!did && !move.boosts && !move.selfBoosts) this.emit({ t: 'fail', pos, text: 'But it failed!' });
  }

  // ------------------------------------------------------------------------------------------
  // State changes
  // ------------------------------------------------------------------------------------------

  /** Apply damage and emit an event. Fainting is handled by checkFaints. */
  private damage(pos: Pos, amount: number, cause: 'move' | 'recoil' | 'status' | 'confusion' | 'seed', text?: string, extra: { effect?: number; crit?: boolean } = {}): number {
    const m = this.at(pos);
    if (!m || !alive(m)) return 0;
    const dealt = Math.max(0, Math.min(m.hp, Math.round(amount)));
    m.hp -= dealt;
    this.emit({ t: 'damage', pos, amount: dealt, hp: m.hp, maxHp: m.maxHp, cause, ...extra, text });
    if (cause !== 'move') this.checkBerry(pos);
    return dealt;
  }

  private heal(pos: Pos, amount: number, text?: string): number {
    const m = this.at(pos);
    if (!m || !alive(m)) return 0;
    const healed = Math.max(0, Math.min(m.maxHp - m.hp, amount));
    if (!healed) return 0;
    m.hp += healed;
    this.emit({ t: 'heal', pos, amount: healed, hp: m.hp, maxHp: m.maxHp, text });
    return healed;
  }

  private checkBerry(pos: Pos): void {
    const m = this.at(pos);
    if (!m || !alive(m) || !m.item || !BERRIES[m.item] || m.hp > m.maxHp / 2) return;
    const item = m.item;
    m.item = undefined;
    const name = item === 'oran-berry' ? 'Oran Berry' : 'Sitrus Berry';
    this.emit({ t: 'item', pos, item, text: `${m.name} ate its ${name}!` });
    this.heal(pos, BERRIES[item](m));
    if (m.ability === 'cheek-pouch') this.heal(pos, Math.floor(m.maxHp / 3));
  }

  private setStatus(pos: Pos, status: MajorStatus, fromMove: boolean): boolean {
    const m = this.at(pos);
    if (!m || !alive(m)) return false;
    const fail = (why: string) => {
      if (fromMove) this.emit({ t: 'fail', pos, text: why });
      return false;
    };
    if (m.status) return fail(`${m.name} is already ${STATUS_NAMES[m.status]}.`);
    if (m.protect) return false;
    if (status === 'brn' && m.types.includes('fire')) return fail(`It doesn't affect ${m.name}...`);
    if (status === 'par' && m.types.includes('electric')) return fail(`It doesn't affect ${m.name}...`);
    if ((status === 'psn' || status === 'tox') && (m.types.includes('poison') || m.types.includes('steel'))) return fail(`It doesn't affect ${m.name}...`);
    if (status === 'frz' && m.types.includes('ice')) return false;
    m.status = status;
    if (status === 'slp') m.sleepTurns = this.rng.int(2, 4);
    if (status === 'tox') m.toxicCounter = 0;
    const verb: Record<MajorStatus, string> = {
      brn: 'was burned!', par: 'is paralysed! It may be unable to move!', psn: 'was poisoned!',
      tox: 'was badly poisoned!', slp: 'fell asleep!', frz: 'was frozen solid!',
    };
    this.emit({ t: 'status', pos, status, text: `${m.name} ${verb[status]}` });
    return true;
  }

  private confuse(pos: Pos, fromMove: boolean): boolean {
    const m = this.at(pos);
    if (!m || !alive(m)) return false;
    if (m.confused > 0 || m.ability === 'own-tempo') {
      if (fromMove) this.emit({ t: 'fail', pos, text: m.ability === 'own-tempo' ? `${m.name}'s Own Tempo prevents confusion!` : `${m.name} is already confused!` });
      return false;
    }
    m.confused = this.rng.int(2, 5);
    this.emit({ t: 'confused', pos, on: true, text: `${m.name} became confused!` });
    return true;
  }

  /** Change a stat stage. `self` marks changes a creature makes to itself (never blocked). */
  private applyBoost(pos: Pos, stat: BoostName, amount: number, self: boolean): boolean {
    const m = this.at(pos);
    if (!m || !alive(m)) return false;
    if (!self && amount < 0) {
      if (stat === 'accuracy' && m.ability === 'keen-eye') {
        this.emit({ t: 'ability', pos, ability: 'keen-eye', text: `${m.name}'s Keen Eye prevents accuracy loss!` });
        return false;
      }
      if (stat === 'def' && m.ability === 'big-pecks') {
        this.emit({ t: 'ability', pos, ability: 'big-pecks', text: `${m.name}'s Big Pecks prevents Defense loss!` });
        return false;
      }
      if (m.protect) return false;
    }
    const before = m.boosts[stat];
    const after = Math.max(-6, Math.min(6, before + amount));
    if (after === before) {
      this.emit({ t: 'msg', text: `${m.name}'s ${STAT_LABEL[stat]} won't go any ${amount > 0 ? 'higher' : 'lower'}!` });
      return false;
    }
    m.boosts[stat] = after;
    const d = after - before;
    const how = d >= 2 ? 'rose sharply' : d > 0 ? 'rose' : d <= -2 ? 'harshly fell' : 'fell';
    this.emit({ t: 'boost', pos, stat, amount: d, text: `${m.name}'s ${STAT_LABEL[stat]} ${how}!` });
    return true;
  }

  private endOfTurn(): void {
    for (const p of this.speedOrder(this.activePositions())) {
      const m = this.at(p);
      if (!m || m.fainted) continue;
      if (m.seededBy) {
        const src = this.at(m.seededBy);
        const amt = Math.max(1, Math.floor(m.maxHp / 8));
        const dealt = this.damage(p, amt, 'seed', `${m.name}'s health is sapped by Leech Seed!`);
        if (src && !src.fainted && dealt) this.heal(m.seededBy, dealt);
      }
      if (!alive(m)) continue;
      if (m.status === 'brn') this.damage(p, Math.max(1, Math.floor(m.maxHp / 16)), 'status', `${m.name} is hurt by its burn!`);
      else if (m.status === 'psn') this.damage(p, Math.max(1, Math.floor(m.maxHp / 8)), 'status', `${m.name} is hurt by poison!`);
      else if (m.status === 'tox') {
        m.toxicCounter = Math.min(15, m.toxicCounter + 1);
        this.damage(p, Math.max(1, Math.floor((m.maxHp * m.toxicCounter) / 16)), 'status', `${m.name} is hurt by poison!`);
      }
      if (m.hp > 0 && m.status && m.ability === 'shed-skin' && this.rng.chance(30)) {
        m.status = undefined;
        this.emit({ t: 'status', pos: p, status: null, text: `${m.name} shed its skin and was cured!` });
      }
    }
    for (const side of [0, 1] as SideId[]) {
      const s = this.sides[side];
      if (s.tailwind > 0) {
        s.tailwind--;
        if (s.tailwind === 0) this.emit({ t: 'msg', text: side === 0 ? 'Your tailwind petered out.' : "The foes' tailwind petered out." });
      }
    }
    for (const p of this.activePositions()) {
      const m = this.at(p)!;
      m.protect = m.helpingHand = m.followMe = m.flinch = false;
    }
  }

  private checkFaints(): void {
    for (const p of this.activePositions()) {
      const m = this.at(p)!;
      if (m.fainted || m.hp > 0) continue;
      m.fainted = true;
      m.status = undefined;
      this.emit({ t: 'faint', pos: p, uid: m.uid, text: `${this.label(p)} fainted!` });
      this.lastCatch = false;
      this.awardExperience(m);
    }
  }

  /** Experience and effort for everyone on the winning side who fought the fainted creature. */
  private awardExperience(fallen: BattleMon): void {
    const winnerSide = (1 - (this.posOf(fallen)?.side ?? 0)) as SideId;
    for (const t of this.sides[winnerSide].teams) {
      if (t.setup.ai) continue;
      for (const m of t.mons) {
        if (m.fainted || !fallen.faced.has(m.uid)) continue;
        const amount = xpYield(fallen.species.baseExp, fallen.creature.level, m.creature.level, this.kind === 'trainer', t.setup.xpMult ?? 1);
        addEvs(m.creature, fallen.species.evYield);
        const before = m.creature.level;
        const growth = gainXp(m.creature, amount, t.setup.levelCap ?? 100);
        this.emit({ t: 'xp', uid: m.uid, owner: m.owner, amount, text: `${m.name} gained ${amount} Exp. Points!` });
        if (growth.levelsGained) {
          // Stats grow straight away, mid-battle, as in the mainline games.
          const stats = calcStats(m.species.baseStats, m.creature.ivs, m.creature.evs, m.creature.level, m.creature.nature);
          const gained = stats.hp - m.maxHp;
          m.stats = stats;
          m.maxHp = stats.hp;
          m.hp = Math.min(m.maxHp, m.hp + gained);
          for (const id of growth.learned) m.moves.push({ id, pp: moveData(id).pp, maxPp: moveData(id).pp });
          const pending = this.pendingMoves.get(m.uid) ?? [];
          for (const id of growth.pendingMoves) if (!pending.includes(id)) pending.push(id);
          if (pending.length) this.pendingMoves.set(m.uid, pending);
          const learnText = growth.learned.map((id) => ` ${m.name} learned ${moveData(id).name}!`).join('');
          this.emit({ t: 'level', uid: m.uid, owner: m.owner, level: m.creature.level, learned: growth.learned, text: `${m.name} grew to Lv. ${m.creature.level}!${learnText}` });
        } else if (growth.banked && before >= (t.setup.levelCap ?? 100)) {
          this.emit({ t: 'msg', text: `${m.name} is at the level cap. The experience was banked.` });
        }
      }
    }
  }

  private checkEnd(): boolean {
    if (this.phase === 'ended') return true;
    const out = ([0, 1] as SideId[]).map((side) => this.sides[side].teams.every((t) => t.mons.every((m) => m.fainted || m.caught)));
    if (!out[0] && !out[1]) return false;
    this.phase = 'ended';
    this.winner = out[0] && out[1] ? null : out[0] ? 1 : 0;
    // Catching the last wild creature ends the battle on the catch, with no "You won".
    if (this.winner === 0 && this.lastCatch) {
      this.emit({ t: 'end', winner: 0, reason: 'catch' });
      return true;
    }
    const text = this.winner === 0 ? 'You won the battle!' : this.winner === 1 ? 'You lost the battle...' : 'The battle ended in a draw.';
    this.emit({ t: 'end', winner: this.winner, reason: 'faint', text });
    return true;
  }

  /** "Wild Nibblet", "Sunniva's Cindlet" or just the creature's name for the player's side. */
  label(p: Pos): string {
    const m = this.at(p);
    if (!m) return '';
    const setup = this.teamSetup(m.owner);
    if (setup?.ai === 'wild') return `The wild ${m.name}`;
    if (setup?.ai) return `${setup.name}'s ${m.name}`;
    return m.name;
  }

  /**
   * Write battle results back onto the creatures (HP, status, PP, held item, level and
   * experience were updated in place). Call when the battle has ended.
   */
  commit(): void {
    for (const s of this.sides) {
      for (const t of s.teams) {
        for (const m of t.mons) {
          const c = m.creature;
          c.hp = Math.max(0, Math.min(m.hp, maxHp(c)));
          c.status = m.fainted ? undefined : m.status;
          c.item = m.item;
          c.moves = m.moves.map((x) => ({ id: x.id, pp: x.pp }));
        }
      }
    }
  }
}
