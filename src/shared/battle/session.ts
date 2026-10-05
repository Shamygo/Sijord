import type { BattleEvent, Choice, Pos } from './engine';
import type { Creature, MajorStatus } from './types';
import type { MovePrompt } from '../../client/battle/ui';

/** Host-authoritative battle view; cosmetic movement never changes damage or move accuracy. */
export interface BattleFrame {
  id: string;
  kind: 'wild' | 'trainer';
  progressionFlag?: 'beat-rival';
  center: [number, number, number];
  yaw: number;
  mode: 'tactical' | 'action';
  lobby: boolean;
  joinable: boolean;
  guest?: string;
  turn: number;
  ended: boolean;
  windup: boolean;
  winner: 0 | 1 | null;
  escaped: boolean;
  caption: string;
  slots: { pos: Pos; uid: string; species: string; name: string; level: number; hp: number; maxHp: number; status?: MajorStatus; position: [number, number, number] }[];
  events: { seq: number; event: BattleEvent }[];
  prompt?: { token: number; kind: 'move' | 'replace'; move?: MovePrompt; bench?: MovePrompt['bench'] };
  result?: { party: Creature[]; pendingMoves: [string, string[]][] };
}
export interface BattleControl {
  id: string;
  join?: { party: Creature[]; levelCap: number };
  token?: number;
  choice?: Choice;
  leave?: boolean;
  ack?: boolean;
  movement?: { x: number; z: number; sprint: boolean; dodge: boolean; dodgeToken?: number };
}
