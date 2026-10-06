import * as THREE from 'three';
import type { BattleControl, BattleFrame } from '../../shared/battle/session';
import type { World } from '../world/types';
import type { Portraits } from '../ui/portraits';
import { BattleStage, key } from './stage';
import { BattleUi } from './ui';

/** View and input only. The host alone resolves combat and returns the committed party. */
export class RemoteBattle {
  readonly stage: BattleStage;
  readonly ui = new BattleUi();
  private sequence = 0;
  private token = 0;
  private latest?: BattleFrame;
  private windingUp = false;
  private caption = '';
  constructor(frame: BattleFrame, world: World, scene: THREE.Scene, hud: HTMLElement, private portraits: Portraits, private control: (c: BattleControl) => void, private project: (p: THREE.Vector3) => {x: number; y: number; visible: boolean}) {
    this.stage = new BattleStage(world, new THREE.Vector3(...frame.center), frame.yaw);
    scene.add(this.stage.root); hud.append(this.ui.el); this.ui.show(); this.receive(frame);
  }
  receive(frame: BattleFrame): void {
    if (frame.windup && !this.windingUp) for (const s of frame.slots) this.stage.telegraph(s.pos,0.9);
    this.windingUp = frame.windup;
    this.latest = frame; this.ui.setMode(frame.mode);
    if (frame.caption !== this.caption) {this.caption = frame.caption; this.ui.caption(frame.caption || (frame.lobby ? 'Joined. Waiting for your friend to choose a mode.' : null));}
    const occupied = new Set(frame.slots.map(s => key(s.pos)));
    for (const side of [0,1] as const) for (const slot of [0,1] as const) if (!occupied.has(key({side,slot}))) {this.stage.removeMirror({side,slot}); this.ui.removePlate(key({side,slot}));}
    for (const s of frame.slots) {
      this.stage.mirror(s.pos, s.species, s.position, s.hp > 0, !!s.alpha);
      this.ui.setPlate(key(s.pos), {...s, mine: s.pos.side === 0, tag: s.pos.side === 1 && s.alpha ? 'Alpha' : undefined, portrait: s.pos.side === 0 ? this.portraits.get(s.species) : undefined});
    }
    for (const e of frame.events) if (e.seq > this.sequence) {
      this.sequence = e.seq;
      if (e.event.t === 'move') this.stage.model(e.event.pos)?.play(e.event.category === 'physical' ? 'attack' : 'special');
      else if (e.event.t === 'damage') this.stage.hit(e.event.pos, !!e.event.crit);
      else if (e.event.t === 'status') this.stage.status(e.event.pos, e.event.status);
      else if (e.event.t === 'faint') this.stage.model(e.event.pos)?.play('faint');
    }
    const prompt = frame.prompt;
    if (!prompt) { if (this.token) this.ui.cancelPrompt(); this.token = 0; }
    else if (prompt.token !== this.token) {
      this.ui.cancelPrompt(); this.token = prompt.token;
      const token = prompt.token;
      const choice = prompt.kind === 'move' ? this.ui.promptMove({...prompt.move!, canBack:false}) : this.ui.promptReplace('Send in your next Pokémon', prompt.bench!).then(team => ({kind:'switch' as const,team}));
      void choice.then(c => {if (this.token === token && c !== 'back') this.control({id: frame.id, token, choice:c});});
    }
  }
  get focus(): THREE.Vector3 { return this.latest?.mode === 'action' ? this.stage.spot({side:0,slot:1}) : this.stage.center; }
  update(dt: number): void {
    this.stage.update(dt);
    for (const s of this.latest?.slots ?? []) {const p = this.project(this.stage.headOf(s.pos));this.ui.placePlate(key(s.pos),p.x,p.y,p.visible);}
  }
  dispose(): void { this.token = 0; this.ui.cancelPrompt(); this.ui.dispose(); this.stage.dispose(); }
}
