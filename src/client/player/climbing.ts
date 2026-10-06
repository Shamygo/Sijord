import { collidersNear, colliderContains, colliderNormal, resolveCircle } from '../core/collision';
import type { Collider, World } from '../world/types';

/**
 * Reaching for walls (BotW-style climbing): what is solid at a height, where the nearest surface
 * is along a direction, and where the player can pull themselves up onto.
 *
 * Solid means terrain above that height, or a collider whose top is above it. Steep terrain and
 * colliders marked `climb` (cliff columns, big rocks) can be climbed; anything else (trees,
 * walls, fences) only blocks.
 */
export interface WallHit {
  /** Horizontal distance from the probe start to the surface. */
  dist: number;
  /** Outward horizontal normal of the surface, pointing back towards the probe. */
  nx: number;
  nz: number;
  /** The collider hit, or null for terrain. */
  collider: Collider | null;
  climbable: boolean;
}

const STEP = 0.06;

/** What fills (x, z) at height y: terrain, a collider, or nothing. */
export function solidAt(world: World, x: number, z: number, y: number): Collider | 'terrain' | null {
  if (world.heightAt(x, z) > y) return 'terrain';
  for (const c of collidersNear(x, z, 0, world.colliders)) {
    if ((c.maxY ?? Infinity) > y && colliderContains(c, x, z)) return c;
  }
  return null;
}

function gradient(world: World, x: number, z: number): { x: number; z: number } {
  const e = 0.2;
  return {
    x: (world.heightAt(x + e, z) - world.heightAt(x - e, z)) / (2 * e),
    z: (world.heightAt(x, z + e) - world.heightAt(x, z - e)) / (2 * e),
  };
}

/**
 * The first surface met walking from (x, z) along the unit direction (dx, dz) at height y,
 * within `reach`. A probe that starts inside something backs out to find its surface (dist < 0).
 * Terrain counts as climbable where its gradient exceeds `steep`.
 */
export function probeWall(world: World, x: number, z: number, y: number, dx: number, dz: number, reach: number, steep: number): WallHit | null {
  let lo: number, hi: number, what: Collider | 'terrain' | null;
  if (solidAt(world, x, z, y)) {
    let s = 0;
    while (s > -1 && solidAt(world, x + dx * (s - STEP), z + dz * (s - STEP), y)) s -= STEP;
    if (s <= -1) return null;
    lo = s - STEP; hi = s;
  } else {
    let s = STEP;
    while (s <= reach + 1e-6 && !solidAt(world, x + dx * s, z + dz * s, y)) s += STEP;
    if (s > reach + 1e-6) return null;
    lo = s - STEP; hi = s;
  }
  for (let i = 0; i < 5; i++) {
    const m = (lo + hi) / 2;
    if (solidAt(world, x + dx * m, z + dz * m, y)) hi = m; else lo = m;
  }
  what = solidAt(world, x + dx * hi, z + dz * hi, y);
  const px = x + dx * lo, pz = z + dz * lo;
  if (what && what !== 'terrain') {
    const n = colliderNormal(what, px, pz);
    return { dist: lo, nx: n.x, nz: n.z, collider: what, climbable: !!what.climb };
  }
  const g = gradient(world, x + dx * hi, z + dz * hi), gl = Math.hypot(g.x, g.z);
  const n = gl > 0.3 ? { x: -g.x / gl, z: -g.z / gl } : { x: -dx, z: -dz };
  return { dist: lo, nx: n.x, nz: n.z, collider: null, climbable: gl > steep };
}

/** The nearest of several probes at heights `ys` above `y`; `top` is the highest probe that hit. */
export function probeBody(world: World, x: number, z: number, y: number, dx: number, dz: number, reach: number, steep: number, ys: readonly number[]): { hit: WallHit; highest: number } | null {
  let best: WallHit | null = null, highest = -Infinity;
  for (const h of ys) {
    const hit = probeWall(world, x, z, y + h, dx, dz, reach, steep);
    if (!hit) continue;
    highest = Math.max(highest, h);
    if (!best || hit.dist < best.dist) best = hit;
  }
  return best ? { hit: best, highest } : null;
}

/**
 * Somewhere to stand just past the top of a wall in front: feet height between a small step and
 * `maxRise` above y, on a walkable surface with head room and space for the body.
 */
export function findLedge(
  world: World, x: number, z: number, y: number, dx: number, dz: number, wallDist: number,
  maxRise: number, radius: number, maxSlope: number,
): { x: number; y: number; z: number } | null {
  for (const extra of [0.45, 0.75, 1.1]) {
    const qx = x + dx * (wallDist + extra), qz = z + dz * (wallDist + extra);
    const top = world.surfaceHeightAt?.(qx, qz, y + maxRise + 0.2) ?? world.heightAt(qx, qz);
    if (top <= y + 0.25 || top > y + maxRise) continue;
    const onRock = top > world.heightAt(qx, qz) + 0.02;
    const g = gradient(world, qx, qz);
    if (!onRock && Math.hypot(g.x, g.z) > Math.tan(maxSlope)) continue;
    if (solidAt(world, qx, qz, top + 0.3) || solidAt(world, qx, qz, top + 1.4)) continue;
    const fit = resolveCircle(qx, qz, radius * 0.8, world.colliders, top + 0.05);
    if (Math.hypot(fit.x - qx, fit.z - qz) > 0.05) continue;
    return { x: qx, y: top, z: qz };
  }
  return null;
}
