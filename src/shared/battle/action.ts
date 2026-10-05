/** Action-mode timing and spatial rules. Core stats, PP and type damage stay in Battle. */
export const ACTION_RULES = { commandSeconds: 2.5, windupSeconds: 0.9, walkSpeed: 4, sprintSpeed: 6, dodgeSpeed: 13, dodgeSeconds: 0.24, dodgeCooldown: 1.4, fieldRadius: 24, hitRadius: 1.35 };
export function spatialHit(aim: {x: number; z: number}, target: {x: number; z: number}, dodging: boolean): boolean {
  return !dodging && Math.hypot(target.x - aim.x, target.z - aim.z) <= ACTION_RULES.hitRadius;
}
