import * as THREE from 'three';
import type { BattleFrame, BattleControl } from '../../shared/battle/session';
import { ACTION_RULES, spatialHit } from '../../shared/battle/action';
import { chooseAction } from '../../shared/battle/ai';
import { displayName } from '../../shared/battle/creature';
import { Battle, type AiKind, type BattleEvent, type Pos, type Choice, type TeamSetup } from '../../shared/battle/engine';
import { randomSeed } from '../../shared/battle/rng';
import type { Creature } from '../../shared/battle/types';
import { moveData } from '../../shared/data/moves';
import { ITEMS } from '../../shared/items';
import type { CreatureModel } from '../creatures';
import { THROW_RELEASE } from '../player/avatar-clips';
import type { Portraits } from '../ui/portraits';
import type { World } from '../world/types';
import { ARENA, BattleStage, key } from './stage';
import { BattleUi, type MovePrompt } from './ui';

export const PLAYER_ID = 'player';
const FOE_ID = 'foe';

export interface WildActor {
  uid: string;
  root: THREE.Group;
  model: CreatureModel;
}

export interface BattleStart {
  kind: 'wild' | 'trainer';
  progressionFlag?: 'beat-rival';
  playerName: string;
  party: Creature[];
  levelCap: number;
  xpMult: number;
  foes: Creature[];
  /** "Wild" for wild battles, the trainer's name otherwise. */
  foeName: string;
  foeAi: AiKind;
  /** The wild creatures standing in the world (matched to `foes` by uid). */
  wildActors?: WildActor[];
  /** Where the player stands and the direction to the opponents. */
  playerPos: THREE.Vector3;
  facing: number;
  /** Opening line, e.g. "Sunniva wants to battle!". */
  intro?: string;
  /** Balls in the player's bag (id -> count); only offered in wild battles. */
  balls?: Record<string, number>;
  /** The trainer class's catch-rate lean. */
  catchMult?: number;
}

export interface BattleOutcome {
  winner: 0 | 1 | null;
  escaped: boolean;
  /** uids of every creature that fainted. */
  fainted: Set<string>;
  /** Moves creatures want to learn but have no room for (uid -> moves). */
  pendingMoves: Map<string, string[]>;
  /** Wild creatures caught, in order. */
  caught: Creature[];
  /** Balls thrown (id -> count), to take out of the bag. */
  ballsUsed: Record<string, number>;
}

export interface DirectorDeps {
  world: World;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  hudRoot: HTMLElement;
  portraits: Portraits;
  /** World point to CSS pixels on screen. */
  project(p: THREE.Vector3): { x: number; y: number; visible: boolean };
  /** Move the foe trainer NPC into place (trainer battles). */
  placeFoeTrainer?(pos: THREE.Vector3, yaw: number): void;
  /** A trainer on `side` throws a ball (plays their throw gesture). */
  onThrow?(side: 0 | 1): void;
  connected?: boolean;
  trainerPosition?(): THREE.Vector3;
}

/**
 * Where a battle's ring and the opposing trainer go, for a player standing at `playerPos` and
 * facing `facing`. The player stays where they are, at the near edge of the ring.
 */
export function arenaSpots(playerPos: THREE.Vector3, facing: number): { center: THREE.Vector3; foeTrainer: THREE.Vector3 } {
  const axis = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const right = new THREE.Vector3(-Math.cos(facing), 0, Math.sin(facing));
  const center = playerPos.clone().addScaledVector(axis, ARENA.trainer).addScaledVector(right, -0.6);
  return { center, foeTrainer: center.clone().addScaledVector(axis, ARENA.trainer + 0.2).addScaledVector(right, -0.6) };
}


/**
 * Runs one battle from start to finish: builds the engine and the in-world stage, plays every
 * event as animation with captions, asks the player for decisions, and frames the action with
 * a battle camera. The game loop calls update() every frame while it runs.
 */
export class BattleDirector {
  readonly stage: BattleStage;
  readonly ui = new BattleUi();
  readonly battle: Battle;
  readonly id = crypto.randomUUID();
  mode: BattleFrame['mode'] = 'tactical';
  lobby = true;
  guest: string | undefined;
  guestAcknowledged = false;
  private guestGone = false;
  private readyResult = false;
  private nextToken = 0;
  private remotePrompt: BattleFrame['prompt'];
  private remoteChoice: Choice | undefined;
  private sequence = 0;
  private displayed = new Map<string, BattleFrame['slots'][number]>();
  private recentEvents: BattleFrame['events'] = [];
  private captionText = '';
  private guestDodge = 0;
  private windup = false;
  private aims = new Map<string, THREE.Vector3>();

  private waits: { left: number; resolve: () => void }[] = [];
  private hurry = false;
  private fainted = new Set<string>();
  /** Wild creatures standing in the world, by uid, until they step into the ring. */
  private wildActors = new Map<string, WildActor>();
  /** Balls thrown so far (id -> count). */
  private ballsUsed: Record<string, number> = {};
  private keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Enter') this.hurry = true;
  };
  private keyUp = (e: KeyboardEvent) => {
    if (e.code === 'Enter') this.hurry = false;
  };
  private pointer = () => (this.hurry = true);
  private pointerUp = () => (this.hurry = false);

  constructor(private deps: DirectorDeps, private start: BattleStart) {
    // The ring sits ahead of the player so the trainer stands at its near edge.
    this.stage = new BattleStage(deps.world, arenaSpots(start.playerPos, start.facing).center, start.facing);
    for (const w of start.wildActors ?? []) this.wildActors.set(w.uid, w);
    deps.scene.add(this.stage.root);
    deps.hudRoot.append(this.ui.el);
    this.battle = new Battle({
      seed: randomSeed(),
      hitTest: (from, target, move) => this.mode !== 'action' || from.side === target.side || move.target === 'self' || spatialHit(this.aims.get(key(target)) ?? this.stage.spot(target), this.stage.spot(target), this.stage.dodging(target)),
      kind: start.kind,
      sides: [
        { teams: [{ owner: PLAYER_ID, name: start.playerName, creatures: start.party, levelCap: start.levelCap, xpMult: start.xpMult, catchMult: start.catchMult }], slots: [PLAYER_ID, PLAYER_ID] },
        { teams: [{ owner: FOE_ID, name: start.foeName, creatures: start.foes, ai: start.foeAi }], slots: [FOE_ID, FOE_ID] },
      ],
    });
    if (start.kind === 'trainer') deps.placeFoeTrainer?.(this.stage.foeTrainerSpot, start.facing + Math.PI);
    addEventListener('keydown', this.keyDown);
    addEventListener('keyup', this.keyUp);
    this.ui.el.addEventListener('pointerdown', this.pointer);
    addEventListener('pointerup', this.pointerUp);
  }

  // ------------------------------------------------------------------------------------------

  async run(): Promise<BattleOutcome> {
    this.ui.show();
    this.mode = await this.ui.lobby(!!this.deps.connected);
    this.lobby = false; this.ui.setMode(this.mode);
    if (this.mode === 'action') this.stage.setActionMode();
    if (this.start.intro) await this.say(this.start.intro, 1.4);
    await this.play(this.battle.start());
    while (this.battle.phase !== 'ended') {
      const human = this.battle.requests().filter((r) => !this.battle.isAi(r.owner));
      if (this.mode === 'action' && this.battle.phase === 'move') {
        await Promise.all(human.map(async r => {
          let c: Choice | 'back';
          if (r.owner === 'partner') c = await this.askPartner('move', this.movePrompt(r.pos, false), undefined, ACTION_RULES.commandSeconds);
          else if (r.pos.slot === 1) c = chooseAction(this.battle, r.pos, 'move');
          else c = await this.timedMove(this.movePrompt(r.pos, false));
          this.battle.choose(r.pos, c === 'back' ? {kind: 'pass'} : c);
        }));
        this.windup = true;
        this.aims.clear();
        for (const p of this.battle.activePositions()) this.aims.set(key(p), this.stage.spot(p).clone());
        this.captionText = 'Attacks incoming — move out of the marked positions or dodge!';
        this.ui.caption(this.captionText);
        for (const p of this.battle.activePositions()) this.stage.telegraph(p, ACTION_RULES.windupSeconds);
        await this.wait(ACTION_RULES.windupSeconds);
        this.windup = false;
        await this.play(this.battle.resolve(chooseAction));
        continue;
      }
      if (this.battle.phase === 'move') {
        const chosen: Choice[] = [];
        for (let i = 0; i < human.length; ) {
          const r = human[i];
          this.ui.caption(null);
          const c = r.owner === 'partner' ? await this.askPartner('move', this.movePrompt(r.pos, false)) : await this.ui.promptMove(this.movePrompt(r.pos, i > 0, chosen.slice(0, i)));
          if (c === 'back') {
            i = Math.max(0, i - 1);
            continue;
          }
          this.battle.choose(r.pos, c);
          chosen[i] = c;
          // Running ends the decision round for the whole side.
          if (c.kind === 'run') break;
          i++;
        }
      } else if (this.battle.phase === 'replace') {
        for (const r of human) {
          const team = this.battle.team(r.owner);
          const bench = this.battle.bench(r.owner).map((m) => ({ index: team.indexOf(m), label: `${m.name}  Lv. ${m.creature.level}`, hp: m.hp, maxHp: m.maxHp, portrait: this.deps.portraits.get(m.species.id) }));
          const choice = r.owner === 'partner' ? await this.askPartner('replace', undefined, bench) : {kind: 'switch' as const, team: await this.ui.promptReplace('Who will you send in next?', bench)};
          this.battle.choose(r.pos, choice);
        }
      }
      this.ui.caption(null);
      await this.play(this.battle.resolve(chooseAction));
    }
    this.battle.commit();
    this.readyResult = true;
    await this.wait(0.6);
    return {
      winner: this.battle.winner,
      escaped: this.battle.escaped,
      fainted: this.fainted,
      pendingMoves: new Map(this.battle.pendingMoves),
      caught: [...this.battle.caught],
      ballsUsed: this.ballsUsed,
    };
  }

  acceptPartner(id: string, team: TeamSetup): boolean {
    if (!this.lobby || this.guest) return false;
    const ok = this.battle.invitePartner({...team, owner: 'partner'});
    if (ok) { this.guest = id; this.ui.caption(`${team.name} joined. Each player commands their own Pokémon.`); }
    return ok;
  }

  partnerControl(id: string, c: BattleControl): void {
    if (id !== this.guest || c.id !== this.id) return;
    if (c.leave) this.partnerLeft(id);
    if (c.ack) this.guestAcknowledged = true;
    if (c.movement && !this.guestGone && this.mode === 'action') { const token = c.movement.dodgeToken ?? 0; this.stage.pilot({side: 0, slot: 1}, {...c.movement,dodge:token > this.guestDodge}); this.guestDodge = Math.max(this.guestDodge,token); }
    if (this.remotePrompt && c.token === this.remotePrompt.token && c.choice && !this.remoteChoice) {
      const p = this.remotePrompt;
      const choice = c.choice;
      const valid = choice.kind === 'pass' || (choice.kind === 'run' && p.move?.canRun) ||
        (choice.kind === 'switch' && (p.bench ?? p.move?.bench)?.some(b => b.index === choice.team)) ||
        (choice.kind === 'move' && p.move && p.move.moves[choice.move]?.pp! > 0 && (!p.move.moves[choice.move].targets.length || p.move.moves[choice.move].targets.some(t => t.pos.side === choice.target?.side && t.pos.slot === choice.target?.slot)));
      if (valid) this.remoteChoice = choice;
    }
  }

  partnerLeft(id: string): void { if (id === this.guest) { this.guestGone = true; this.stage.pilot({side:0,slot:1},{x:0,z:0,sprint:false,dodge:false}); } }

  snapshot(): BattleFrame {
    return { id: this.id, center: this.stage.center.toArray() as [number,number,number], yaw: this.start.facing,
      progressionFlag:this.start.progressionFlag, kind:this.start.kind, mode: this.mode, lobby: this.lobby, joinable: this.lobby && !this.guest, guest: this.guest, turn: this.battle.turn,
      winner:this.battle.winner, escaped:this.battle.escaped, windup: this.windup, ended: this.readyResult, caption: this.captionText,
      slots: [...this.displayed.values()].map(s => ({...s,position:this.stage.snapshotPosition(s.pos)})),
      events: this.recentEvents, prompt: this.remotePrompt ? {...this.remotePrompt, move:this.remotePrompt.move ? {...this.remotePrompt.move,portrait:undefined,bench:this.remotePrompt.move.bench.map(b => ({...b,portrait:undefined}))} : undefined, bench:this.remotePrompt.bench?.map(b => ({...b,portrait:undefined}))} : undefined,
      result: this.guest ? {party: this.battle.team('partner').map(m => ({...m.creature,hp:m.hp,status:m.fainted ? undefined : m.status,item:m.item,moves:m.moves.map(s => ({id:s.id,pp:s.pp}))})), pendingMoves: [...this.battle.pendingMoves].filter(([uid]) => this.battle.team('partner').some(m => m.uid === uid))} : undefined,
    };
  }

  private async timedMove(prompt: MovePrompt): Promise<Choice | 'back'> {
    let done = false;
    const choice = this.ui.promptMove(prompt).then(c => {done = true; return c;});
    void this.wait(ACTION_RULES.commandSeconds).then(() => {if (!done) this.ui.cancelPrompt();});
    return choice;
  }

  private async askPartner(kind: 'move' | 'replace', move?: MovePrompt, bench?: MovePrompt['bench'], timeout = 30): Promise<Choice> {
    this.remoteChoice = undefined;
    this.remotePrompt = {token: ++this.nextToken, kind, move, bench};
    let left = timeout;
    while (!this.remoteChoice && !this.guestGone && left > 0) { await this.wait(0.05); left -= 0.05; }
    const c = this.remoteChoice;
    this.remotePrompt = undefined; this.remoteChoice = undefined;
    if (c) return c;
    const pos: Pos = {side: 0, slot: 1};
    return kind === 'replace' || this.guestGone ? chooseAction(this.battle, pos, kind) : {kind: 'pass'};
  }

  /** Balls still in the bag, less those already thrown and those picked earlier this round. */
  private ballsLeft(pending: Choice[]): { id: string; name: string; count: number }[] {
    const out: { id: string; name: string; count: number }[] = [];
    for (const [id, n] of Object.entries(this.start.balls ?? {})) {
      const reserved = pending.filter((c) => c.kind === 'ball' && c.ball === id).length;
      const count = n - (this.ballsUsed[id] ?? 0) - reserved;
      if (count > 0) out.push({ id, name: ITEMS[id]?.name ?? id, count });
    }
    return out;
  }

  private movePrompt(pos: Pos, canBack: boolean, pending: Choice[] = []): MovePrompt {
    const b = this.battle;
    const mon = b.at(pos)!;
    const owner = b.slotOwner(pos);
    // Only the host's own trainer throws from the host's bag.
    const throws = b.kind === 'wild' && owner === PLAYER_ID;
    const team = b.team(owner);
    const foes = b.foesOf(pos);
    return {
      name: mon.name,
      portrait: this.deps.portraits.get(mon.species.id),
      moves: mon.moves.map((slot) => {
        const m = moveData(slot.id);
        const effects = foes.map((f) => b.typeEffect(mon, m, b.at(f)!));
        return {
          name: m.name, type: m.type, category: m.category, power: m.power, accuracy: m.accuracy,
          pp: slot.pp, maxPp: slot.maxPp, description: m.description,
          effect: effects.length ? Math.max(...effects) : null,
          targets: b.targetOptions(pos, m).map((t) => ({ pos: t, label: this.targetLabel(t, pos) })),
        };
      }),
      bench: b.bench(owner).map((m) => ({ index: team.indexOf(m), label: `${m.name}  Lv. ${m.creature.level}`, hp: m.hp, maxHp: m.maxHp, portrait: this.deps.portraits.get(m.species.id) })),
      canRun: b.kind === 'wild',
      canBack,
      balls: throws ? this.ballsLeft(pending) : [],
      ballTargets: throws ? foes.map((t) => ({ pos: t, label: this.targetLabel(t, pos) })) : [],
    };
  }

  private targetLabel(t: Pos, from: Pos): string {
    const m = this.battle.at(t)!;
    if (t.side === from.side) return `${m.name} (ally)`;
    const pct = Math.max(1, Math.round((m.hp / m.maxHp) * 100));
    return `${this.battle.kind === 'wild' ? 'Wild ' : ''}${m.name}  Lv. ${m.creature.level}  ·  ${pct}%`;
  }

  // ------------------------------------------------------------------------------------------
  // Event playback
  // ------------------------------------------------------------------------------------------

  private async play(events: BattleEvent[]): Promise<void> {
    for (const e of events) {
      this.recentEvents.push({seq: ++this.sequence, event: e});
      this.recentEvents = this.recentEvents.slice(-24);
      if (e.text) this.captionText = e.text;
      switch (e.t) {
        case 'turn':
          break;
        case 'switch-in': {
          this.displayed.set(key(e.pos),{...e,position:this.stage.snapshotPosition(e.pos)});
          const k = key(e.pos);
          const mine = e.pos.side === 0;
          let dur: number;
          const wild = mine ? undefined : this.wildActors.get(e.uid);
          this.wildActors.delete(e.uid);
          if (wild) dur = this.stage.adopt(e.pos, wild.root, wild.model);
          else {
            // Wind up first so the ball leaves the trainer's hand.
            this.deps.onThrow?.(e.pos.side);
            await this.wait(THROW_RELEASE);
            dur = this.stage.sendOut(e.pos, e.species, mine ? (this.deps.trainerPosition?.() ?? this.stage.trainerSpot) : this.stage.foeTrainerSpot);
          }
          this.ui.setPlate(k, {
            name: e.name, level: e.level, hp: e.hp, maxHp: e.maxHp, status: e.status, mine,
            tag: mine ? '' : this.start.kind === 'wild' ? 'Wild' : this.start.foeName,
            portrait: mine ? this.deps.portraits.get(e.species) : undefined,
          });
          await this.say(e.text, Math.max(dur, 0.9));
          break;
        }
        case 'switch-out': {
          this.displayed.delete(key(e.pos));
          this.ui.removePlate(key(e.pos));
          const d = this.stage.recall(e.pos);
          await this.say(e.text, Math.max(0.6, d));
          break;
        }
        case 'move': {
          await this.until(() => !this.stage.busy);
          this.ui.caption(e.text ?? null);
          await this.wait(0.35);
          const m = moveData(e.move);
          const { impact } = this.stage.attack(e.pos, e.type, m.target === 'self' || m.target === 'ally-side' ? 'status' : e.category, e.targets);
          await this.wait(impact);
          break;
        }
        case 'damage': {
          const shown = this.displayed.get(key(e.pos)); if(shown) shown.hp = e.hp;
          const k = key(e.pos);
          this.ui.setHp(k, e.hp, e.maxHp);
          if (e.cause === 'move') this.stage.hit(e.pos, !!e.crit);
          const head = this.deps.project(this.stage.headOf(e.pos));
          if (head.visible && e.amount > 0) this.ui.popNumber(head.x, head.y, `-${e.amount}`, e.crit ? 'crit' : (e.effect ?? 1) > 1 ? 'super' : (e.effect ?? 1) < 1 ? 'weak' : 'damage');
          if (e.text) await this.say(e.text, 0.8);
          else await this.wait(0.45);
          break;
        }
        case 'heal': {
          const shown = this.displayed.get(key(e.pos)); if(shown) shown.hp = e.hp;
          this.ui.setHp(key(e.pos), e.hp, e.maxHp);
          this.stage.heal(e.pos);
          const head = this.deps.project(this.stage.headOf(e.pos));
          if (head.visible) this.ui.popNumber(head.x, head.y, `+${e.amount}`, 'heal');
          await this.say(e.text, 0.6);
          break;
        }
        case 'miss': {
          const head = this.deps.project(this.stage.headOf(e.target));
          if (head.visible) this.ui.popNumber(head.x, head.y, 'Miss', 'miss');
          await this.say(e.text, 0.8);
          break;
        }
        case 'status':
          {const shown = this.displayed.get(key(e.pos)); if(shown) shown.status = e.status ?? undefined;}
          this.stage.status(e.pos, e.status);
          this.ui.setStatus(key(e.pos), e.status);
          await this.say(e.text, 0.9);
          break;
        case 'boost':
          this.stage.boost(e.pos, e.amount > 0);
          await this.say(e.text, 0.8);
          break;
        case 'faint': {
          this.fainted.add(e.uid);
          await this.until(() => !this.stage.busy);
          this.displayed.delete(key(e.pos));
          const d = this.stage.faint(e.pos);
          this.ui.removePlate(key(e.pos));
          await this.say(e.text, Math.max(1, d));
          break;
        }
        case 'xp':
          await this.say(e.text, 0.9);
          break;
        case 'level': {
          const m = this.battle.team(e.owner).find((x) => x.uid === e.uid);
          const p = m ? this.posOfMon(m.uid) : null;
          if (m && p) {
            this.ui.setPlate(key(p), { name: m.name, level: m.creature.level, hp: m.hp, maxHp: m.maxHp, status: m.status, mine: true, portrait: this.deps.portraits.get(m.species.id) });
            this.stage.boost(p, true);
          }
          await this.say(e.text, 1.4);
          break;
        }
        case 'throw': {
          await this.until(() => !this.stage.busy);
          this.ui.caption(e.text ?? null);
          if (e.pos.side === 0) this.deps.onThrow?.(0);
          await this.wait(THROW_RELEASE);
          break;
        }
        case 'catch': {
          this.ballsUsed[e.ball] = (this.ballsUsed[e.ball] ?? 0) + 1;
          const from = e.pos.side === 0 ? (this.deps.trainerPosition?.() ?? this.stage.trainerSpot) : this.stage.foeTrainerSpot;
          const d = this.stage.catchSequence(e.target, from, e.ball, e.shakes, e.caught);
          await this.wait(d);
          if (e.caught) {
            this.displayed.delete(key(e.target));
            this.ui.removePlate(key(e.target));
          }
          await this.say(e.text, e.caught ? 1.6 : 1.1);
          break;
        }
        case 'end':
          await this.say(e.text, e.reason === 'catch' ? 0.4 : 1.4);
          break;
        default:
          await this.say(e.text, 0.85);
      }
    }
    await this.until(() => !this.stage.busy);
  }

  private posOfMon(uid: string): Pos | null {
    for (const p of this.battle.activePositions()) if (this.battle.at(p)?.uid === uid) return p;
    return null;
  }

  /** Show a caption and hold it long enough to read. */
  private async say(text: string | undefined, min = 0.8): Promise<void> {
    if (text) this.ui.caption(text);
    const read = text ? Math.min(2.2, 0.45 + text.length * 0.022) : 0;
    await this.wait(Math.max(min, read));
  }

  private wait(seconds: number): Promise<void> {
    if (seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => this.waits.push({ left: seconds, resolve }));
  }

  private async until(cond: () => boolean, max = 3): Promise<void> {
    let t = 0;
    while (!cond() && t < max) {
      await this.wait(0.05);
      t += 0.05;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Per frame
  // ------------------------------------------------------------------------------------------

  update(dt: number): void {
    const speed = this.hurry ? 3 : 1;
    this.stage.update(dt * (this.hurry ? 1.6 : 1));
    const pending = this.waits;
    this.waits = [];
    for (const w of pending) {
      w.left -= dt * speed;
      if (w.left <= 0) w.resolve();
      else this.waits.push(w);
    }
    // The normal orbit camera remains under player control in both modes.
    for (const p of this.battle.activePositions()) {
      const k = key(p);
      if (!this.stage.occupied(p)) continue;
      const s = this.deps.project(this.stage.headOf(p));
      this.ui.placePlate(k, s.x, s.y, s.visible);
    }
  }

  /** Remove the ring and UI. Wild creatures stay in the world (the wild manager owns them). */
  dispose(): void {
    removeEventListener('keydown', this.keyDown);
    removeEventListener('keyup', this.keyUp);
    removeEventListener('pointerup', this.pointerUp);
    this.ui.dispose();
    this.stage.dispose();
  }
}

export function partyLabel(c: Creature): string {
  return `${displayName(c)} Lv. ${c.level}`;
}
