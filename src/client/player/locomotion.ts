/** Fallback metres/second of backwards support-foot travel on the Rei rig.
 * The adapter measures each instantiated rig after final world-size normalization.
 * Playback advances by travelled distance, so neither starting nor braking slides the gait.
 */
export const REI_STANCE_SPEED = { walk: 1.15, run: 8.8 } as const;

export function locomotionRate(clip: 'walk' | 'run', speed: number, stanceSpeed: number = REI_STANCE_SPEED[clip]): number {
  return Math.max(0, speed) / Math.max(.01,stanceSpeed);
}

/** Frame-rate independent shortest-path facing, including crossing ±PI. */
export function smoothFacing(yaw: number, target: number, dt: number, response = 14): number {
  const difference = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  return yaw + difference * (1 - Math.exp(-response * Math.max(0, dt)));
}
