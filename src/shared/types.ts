import type { BattleFrame, BattleControl } from './battle/session';
/** Data shared by the browser client and the co-op server. */

export type PlayerClassId = 'ranger' | 'tamer' | 'artisan' | 'scholar' | 'medic';

export interface Appearance {
  /** Omitted in old saves: defaults to Rei. */
  trainerModel?: 'rei' | 'red' | 'custom';
  /** CSS hex colours, e.g. "#f1c27d". */
  skinTone: string;
  hairColor: string;
  /** 0 short, 1 spiky, 2 long, 3 ponytail. */
  hairStyle: number;
  jacketColor: string;
  pantsColor: string;
  /** 0 slimmer build, 1 broader build. */
  build: number;
}

export interface PlayerProfile {
  name: string;
  appearance: Appearance;
  playerClass: PlayerClassId;
}

/** Locomotion state a remote avatar needs to animate itself. */
export type MoveAnim = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'climb';

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  /** Facing yaw in radians. */
  yaw: number;
  /** Locomotion speed in metres per second: horizontal on ground, vertical while climbing. */
  speed: number;
  anim: MoveAnim;
  /** Species of the lead creature walking beside the player, if one is out. */
  lead?: string;
  /** True while the player is in a battle. */
  battle?: boolean;
  battleFrame?: BattleFrame;
  battleControl?: BattleControl;
  /** The latest overworld ball throw, repeated for a moment so the partner sees it. */
  ballThrow?: BallThrowFx;
  /** The latest overworld catch attempt's result, likewise. */
  ballCatch?: BallCatchFx;
  /** Knockdown pose, 0 standing to 1 flat on the ground. */
  down?: number;
}

/** A thrown ball: the partner replays the same physical flight from the same launch. */
export interface BallThrowFx {
  id: number;
  ball: string;
  from: [number, number, number];
  vel: [number, number, number];
}

/** Where a thrown ball caught (or failed to catch) something, and how it went. */
export interface BallCatchFx {
  id: number;
  ball: string;
  at: [number, number, number];
  shakes: number;
  caught: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: '#e0ac69',
  hairColor: '#4a2f1b',
  hairStyle: 0,
  jacketColor: '#d63a2f',
  pantsColor: '#2b2b33',
  build: 0,
};
