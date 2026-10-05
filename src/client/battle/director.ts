import * as THREE from 'three';
import { chooseAction } from '../../shared/battle/ai';
import { displayName } from '../../shared/battle/creature';
import { Battle, type AiKind, type BattleEvent, type Choice, type Pos } from '../../shared/battle/engine';
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
/** Lens per shot: a longer lens over the shoulder, so the foes fill more of the frame. */
const SHOT_FOV = { overview: 50, command: 42, action: 46, catch: 40 } as const;
const FOE_ID = 'foe';

export interface WildActor {
  uid: string;
  root: THREE.Group;
  model: CreatureModel;
}

export interface BattleStart {
  kind: 'wild' | 'trainer';
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
  /** Balls in the bag (id -> count); offered in wild battles. */
  balls?: Record<string, number>;
  /** Catch multiplier from the player's class. */
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
  /** Balls thrown (id -> count). */
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

type Shot = { kind: 'overview' } | { kind: 'command'; pos: Pos } | { kind: 'action'; from: Pos; to: Pos | null; flip: boolean } | { kind: 'catch'; pos: Pos };

/**
 * Runs one battle from start to finish: builds the engine and the in-world stage, plays every
 * event as animation with captions, asks the player for decisions, and frames the action with
 * a battle camera. The game loop calls update() every frame while it runs.
 */
export class BattleDirector {
  readonly stage: BattleStage;
  readonly ui = new BattleUi();
  readonly battle: Battle;
  private waits: { left: number; resolve: () => void }[] = [];
  private shot: Shot = { kind: 'overview' };
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  /** Jump straight to the next shot's framing instead of easing into it. */
  private cut = false;
  private wantPos = new THREE.Vector3();
  private wantLook = new THREE.Vector3();
  private hurry = false;
  private fainted = new Set<string>();
  /** Wild creatures standing in the world, by uid, until they step into the ring. */
  private wildActors = new Map<string, WildActor>();
  /** Balls thrown so far (id -> count). */
  private ballsUsed: Record<string, number> = {};
  private keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') this.hurry = true;
  };
  private keyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') this.hurry = false;
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
      kind: start.kind,
      sides: [
        { teams: [{ owner: PLAYER_ID, name: start.playerName, creatures: start.party, levelCap: start.levelCap, xpMult: start.xpMult, catchMult: start.catchMult }], slots: [PLAYER_ID, PLAYER_ID] },
        { teams: [{ owner: FOE_ID, name: start.foeName, creatures: start.foes, ai: start.foeAi }], slots: [FOE_ID, FOE_ID] },
      ],
    });
    this.camPos.copy(deps.camera.position);
    const fwd = new THREE.Vector3();
    deps.camera.getWorldDirection(fwd);
    this.camLook.copy(deps.camera.position).addScaledVector(fwd, 10);
    if (start.kind === 'trainer') deps.placeFoeTrainer?.(this.stage.foeTrainerSpot, start.facing + Math.PI);
    addEventListener('keydown', this.keyDown);
    addEventListener('keyup', this.keyUp);
    this.ui.el.addEventListener('pointerdown', this.pointer);
    addEventListener('pointerup', this.pointerUp);
  }

  // ------------------------------------------------------------------------------------------

  async run(): Promise<BattleOutcome> {
    this.ui.show();
    this.shot = { kind: 'overview' };
    if (this.start.intro) await this.say(this.start.intro, 1.4);
    await this.play(this.battle.start());
    while (this.battle.phase !== 'ended') {
      const human = this.battle.requests().filter((r) => !this.battle.isAi(r.owner));
      if (this.battle.phase === 'move') {
        const chosen: Choice[] = [];
        for (let i = 0; i < human.length; ) {
          const r = human[i];
          // Cut, don't pan, from the wide shot: a pan would sweep through the trainer's head.
          if (this.shot.kind === 'overview') this.cut = true;
          this.shot = { kind: 'command', pos: r.pos };
          this.ui.caption(null);
          const c = await this.ui.promptMove(this.movePrompt(r.pos, i > 0, chosen.slice(0, i)));
          if (c === 'back') {
            i = Math.max(0, i - 1);
            continue;
          }
          chosen[i] = c;
          this.battle.choose(r.pos, c);
          // Running ends the decision round for the whole side.
          if (c.kind === 'run') break;
          i++;
        }
      } else if (this.battle.phase === 'replace') {
        for (const r of human) {
          this.shot = { kind: 'overview' };
          const team = this.battle.team(r.owner);
          const bench = this.battle.bench(r.owner).map((m) => ({ index: team.indexOf(m), label: `${m.name}  Lv. ${m.creature.level}`, hp: m.hp, maxHp: m.maxHp, portrait: this.deps.portraits.get(m.species.id) }));
          const pick = await this.ui.promptReplace('Who will you send in next?', bench);
          this.battle.choose(r.pos, { kind: 'switch', team: pick });
        }
      }
      this.ui.caption(null);
      await this.play(this.battle.resolve(chooseAction));
    }
    this.battle.commit();
    this.shot = { kind: 'overview' };
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
    const team = b.team(PLAYER_ID);
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
      bench: b.bench(PLAYER_ID).map((m) => ({ index: team.indexOf(m), label: `${m.name}  Lv. ${m.creature.level}`, hp: m.hp, maxHp: m.maxHp, portrait: this.deps.portraits.get(m.species.id) })),
      canRun: b.kind === 'wild',
      canBack,
      balls: b.kind === 'wild' ? this.ballsLeft(pending) : [],
      ballTargets: b.kind === 'wild' ? foes.map((t) => ({ pos: t, label: this.targetLabel(t, pos) })) : [],
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
      switch (e.t) {
        case 'turn':
          break;
        case 'switch-in': {
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
            dur = this.stage.sendOut(e.pos, e.species, mine ? this.stage.trainerSpot : this.stage.foeTrainerSpot);
          }
          this.ui.setPlate(k, {
            name: e.name, level: e.level, hp: e.hp, maxHp: e.maxHp, status: e.status, mine,
            tag: mine ? '' : this.start.kind === 'wild' ? 'Wild' : this.start.foeName,
            portrait: mine ? this.deps.portraits.get(e.species) : undefined,
          });
          this.shot = { kind: 'overview' };
          await this.say(e.text, Math.max(dur, 0.9));
          break;
        }
        case 'switch-out': {
          this.ui.removePlate(key(e.pos));
          const d = this.stage.recall(e.pos);
          await this.say(e.text, Math.max(0.6, d));
          break;
        }
        case 'move': {
          await this.until(() => !this.stage.busy);
          const target = e.targets.find((t) => t.side !== e.pos.side) ?? e.targets[0] ?? null;
          this.shot = { kind: 'action', from: e.pos, to: target, flip: e.pos.side === 1 };
          this.ui.caption(e.text ?? null);
          await this.wait(0.35);
          const m = moveData(e.move);
          const { impact } = this.stage.attack(e.pos, e.type, m.target === 'self' || m.target === 'ally-side' ? 'status' : e.category, e.targets);
          await this.wait(impact);
          break;
        }
        case 'damage': {
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
          this.shot = { kind: 'catch', pos: e.target };
          this.ui.caption(e.text ?? null);
          if (e.pos.side === 0) this.deps.onThrow?.(0);
          await this.wait(THROW_RELEASE);
          break;
        }
        case 'catch': {
          this.ballsUsed[e.ball] = (this.ballsUsed[e.ball] ?? 0) + 1;
          const from = e.pos.side === 0 ? this.stage.trainerSpot : this.stage.foeTrainerSpot;
          const d = this.stage.catchSequence(e.target, from, e.ball, e.shakes, e.caught);
          await this.wait(d);
          if (e.caught) this.ui.removePlate(key(e.target));
          await this.say(e.text, e.caught ? 1.6 : 1.1);
          this.shot = { kind: 'overview' };
          break;
        }
        case 'end':
          this.shot = { kind: 'overview' };
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
    this.updateCamera(dt);
    for (const p of this.battle.activePositions()) {
      const k = key(p);
      if (!this.stage.occupied(p)) continue;
      const s = this.deps.project(this.stage.headOf(p));
      this.ui.placePlate(k, s.x, s.y, s.visible);
    }
  }

  private updateCamera(dt: number): void {
    const st = this.stage;
    const up = new THREE.Vector3(0, 1, 0);
    switch (this.shot.kind) {
      case 'overview':
        // High behind the trainer and off their right shoulder, so both of your creatures clear them.
        this.wantPos.copy(st.trainerSpot).addScaledVector(st.axis, -4).addScaledVector(st.right, 1.8).addScaledVector(up, 3.2);
        this.wantLook.copy(st.center).addScaledVector(st.axis, 0.9).addScaledVector(up, 0.3);
        break;
      case 'command': {
        // Over the right shoulder of the creature being commanded, looking at the foes. The
        // creature sits left of centre (the move menu is on the right) and its partner is off-frame.
        const s = st.spot(this.shot.pos);
        const h = st.model(this.shot.pos)?.height ?? 0.6;
        const lookSide = this.shot.pos.slot === 0 ? -0.8 : 1.2;
        this.wantPos.copy(s).addScaledVector(st.axis, -2.1 - h * 1.2).addScaledVector(st.right, 0.8).addScaledVector(up, 1.0 + h * 0.75);
        this.wantLook.copy(st.center).addScaledVector(st.axis, ARENA.line).addScaledVector(st.right, lookSide).addScaledVector(up, 0.1);
        break;
      }
      case 'catch': {
        // From the thrower's side, close on the creature (and then the ball at its feet).
        const s = st.spot(this.shot.pos);
        const h = st.model(this.shot.pos)?.height ?? 0.6;
        const side = this.shot.pos.slot === 0 ? -1 : 1;
        this.wantPos.copy(s).addScaledVector(st.axis, -2.4 - h * 0.9).addScaledVector(st.right, side * 1.3).addScaledVector(up, 0.9 + h * 0.5);
        this.wantLook.copy(s).addScaledVector(up, Math.min(0.45, h * 0.4));
        break;
      }
      case 'action': {
        const a = st.focusOf(this.shot.from);
        const b = this.shot.to ? st.focusOf(this.shot.to) : a.clone().addScaledVector(st.axis, this.shot.from.side === 0 ? 2.5 : -2.5);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const span = Math.max(2.4, a.distanceTo(b));
        const side = this.shot.flip ? -1 : 1;
        this.wantPos.copy(mid).addScaledVector(st.right, side * (1.9 + span * 0.62)).addScaledVector(st.axis, -1.1).addScaledVector(up, 1.0 + span * 0.16);
        this.wantLook.copy(mid).addScaledVector(up, 0.1);
        break;
      }
    }
    const floor = this.deps.world.heightAt(this.wantPos.x, this.wantPos.z) + 1.2;
    if (this.wantPos.y < floor) this.wantPos.y = floor;
    // Each shot has its own lens (SHOT_FOV); a cut jumps straight there.
    const cam = this.deps.camera;
    const k = this.cut ? 1 : 1 - Math.exp(-3.2 * dt);
    cam.fov += (SHOT_FOV[this.shot.kind] - cam.fov) * (this.cut ? 1 : 1 - Math.exp(-3 * dt));
    cam.updateProjectionMatrix();
    this.camPos.lerp(this.wantPos, k);
    this.camLook.lerp(this.wantLook, this.cut ? 1 : 1 - Math.exp(-4.5 * dt));
    this.cut = false;
    this.deps.camera.position.copy(this.camPos);
    this.deps.camera.lookAt(this.camLook);
    // Plates are placed from this frame's camera, not the last rendered one.
    this.deps.camera.updateMatrixWorld();
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
