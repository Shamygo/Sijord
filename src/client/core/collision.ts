import type { Collider } from '../world/types';

const CELL = 8;

/** Uniform grid over a collider list so a query only touches nearby colliders. */
class ColliderGrid {
  private cells = new Map<number, Collider[]>();
  private out: Collider[] = [];
  private seen = new Set<Collider>();

  constructor(colliders: readonly Collider[]) {
    for (const c of colliders) {
      const [minX, maxX, minZ, maxZ] =
        c.kind === 'circle' ? [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r] : [c.minX, c.maxX, c.minZ, c.maxZ];
      for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
        for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
          const k = key(cx, cz);
          const list = this.cells.get(k);
          if (list) list.push(c);
          else this.cells.set(k, [c]);
        }
      }
    }
  }

  query(x: number, z: number, r: number): Collider[] {
    this.out.length = 0;
    this.seen.clear();
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        const list = this.cells.get(key(cx, cz));
        if (!list) continue;
        for (const c of list) {
          if (!this.seen.has(c)) {
            this.seen.add(c);
            this.out.push(c);
          }
        }
      }
    }
    return this.out;
  }
}

function key(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

// Large lists (the world has thousands of colliders) get a grid, built once per list.
// A list must not change after it is first resolved against.
const grids = new WeakMap<readonly Collider[], ColliderGrid>();
const GRID_THRESHOLD = 64;

/** Colliders whose bounds come within `r` of (x, z). The returned array is reused between calls. */
export function collidersNear(x: number, z: number, r: number, all: readonly Collider[]): readonly Collider[] {
  if (all.length <= GRID_THRESHOLD) return all;
  let grid = grids.get(all);
  if (!grid) grids.set(all, (grid = new ColliderGrid(all)));
  return grid.query(x, z, r);
}

/**
 * Push a circle of radius `r` at (x, z) out of every collider it overlaps.
 * Returns the corrected position. Runs a couple of passes so corners settle.
 */
export function resolveCircle(x: number, z: number, r: number, all: readonly Collider[], feetY = -Infinity): { x: number; z: number } {
  const colliders = collidersNear(x, z, r + 2, all);
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of colliders) {
      if(c.maxY!==undefined && feetY>=c.maxY-.05)continue;
      if (c.kind === 'circle') {
        const dx = x - c.x;
        const dz = z - c.z;
        const min = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          const push = min - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
          moved = true;
        }
      } else {
        const cx = Math.max(c.minX, Math.min(x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x += (dx / d) * (r - d);
            z += (dz / d) * (r - d);
          } else {
            // Centre is inside the box: push out along the shallowest axis.
            const left = x - c.minX, right = c.maxX - x, down = z - c.minZ, up = c.maxZ - z;
            const m = Math.min(left, right, down, up);
            if (m === left) x = c.minX - r;
            else if (m === right) x = c.maxX + r;
            else if (m === down) z = c.minZ - r;
            else z = c.maxZ + r;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return { x, z };
}
