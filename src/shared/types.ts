/** Data shared by the browser client and the co-op server. */

export type PlayerClassId = 'ranger' | 'tamer' | 'artisan' | 'scholar' | 'medic';

export interface Appearance {
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
export type MoveAnim = 'idle' | 'walk' | 'run' | 'jump' | 'fall';

export interface PlayerSnapshot {
  x: number;
  y: number;
  z: number;
  /** Facing yaw in radians. */
  yaw: number;
  /** Horizontal speed in metres per second, used to blend walk/run. */
  speed: number;
  anim: MoveAnim;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: '#e0ac69',
  hairColor: '#4a2f1b',
  hairStyle: 0,
  jacketColor: '#d63a2f',
  pantsColor: '#2b2b33',
  build: 0,
};
