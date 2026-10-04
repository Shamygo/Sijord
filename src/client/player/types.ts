import type * as THREE from 'three';
import type { Appearance, PlayerSnapshot } from '../../shared/types';

/** Frame input sampled by the game from keyboard / mouse / gamepad. */
export interface MoveInput {
  /** -1..1, +1 is forward (W). */
  forward: number;
  /** -1..1, +1 is right (D). */
  right: number;
  sprint: boolean;
  jump: boolean;
}

/** A humanoid trainer model. Built from the Appearance, animated procedurally. */
export interface Avatar {
  root: THREE.Group;
  setAppearance(a: Appearance): void;
  /** Drive the walk/run/idle/jump pose. `speed` is horizontal m/s. */
  animate(dt: number, snapshot: Pick<PlayerSnapshot, 'speed' | 'anim'>): void;
  dispose(): void;
}
