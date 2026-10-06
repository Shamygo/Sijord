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
  /** Hold to ascend a nearby ladder or a steep rock slope. */
  climb?: boolean;
  /** Pressed this frame: hop out of the way. */
  dodge?: boolean;
}

/** Terrain height at a world (x, z). */
export type GroundFn = (x: number, z: number) => number;

/**
 * What the avatar needs each frame. `speed` and `anim` are required; everything else is
 * optional and improves the animation when present. A full PlayerSnapshot (which includes
 * x/y/z/yaw) is a valid input: with world position and yaw the avatar plants its feet in the
 * world, detects turns, acceleration, take-offs and landings, and leans accordingly.
 */
export interface AnimateInput extends Pick<PlayerSnapshot, 'speed' | 'anim'> {
  /** World position of the feet (the avatar root) and facing yaw. */
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  /** Overrides grounded detection from `anim`. */
  grounded?: boolean;
  /** Out of stamina (controller `exhausted`); estimated from sprinting when omitted. */
  tired?: boolean;
}

/** A humanoid trainer model. Built from the Appearance, animated procedurally. */
export interface Avatar {
  root: THREE.Group;
  setAppearance(a: Appearance): void;
  /** Drive the walk/run/idle/jump pose. `speed` is horizontal m/s. */
  animate(dt: number, snapshot: AnimateInput): void;
  /** Play a one-shot upper-body gesture while standing, e.g. throwing a ball. */
  gesture(name: 'throw'): void;
  /**
   * Hold the throw wound up while aiming (true), or drop the pose without throwing (false).
   * A gesture('throw') while held releases from the wound-up pose. Optional: models without
   * clips just throw from the start.
   */
  aim?(on: boolean): void;
  /** Terrain height function used to plant the feet on slopes (null: estimate from motion). */
  setGround(fn: GroundFn | null): void;
  dispose(): void;
}
