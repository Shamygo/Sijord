import type { Collider } from '../world/types';

const CELL = 8;

/** Uniform grid over a collider list so a query only touches nearby colliders. */
class ColliderGrid {
  private cells = new Map<number, Collider[]>();
  private out: Collider[] = [];
  private seen = new Set<Collider>();

  constructor(colliders: readonly Collider[]) {
    for (const c of colliders) {
      const [minX, maxX, minZ, maxZ] = bounds(c);
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

function bounds(c: Collider): [number, number, number, number] {
  if (c.kind === 'circle') return [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r];
  if (c.kind === 'box') return [c.minX, c.maxX, c.minZ, c.maxZ];
  const r = Math.hypot(c.hw, c.hd);
  return [c.x - r, c.x + r, c.z - r, c.z + r];
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
      if (c.maxY !== undefined && feetY >= colliderTop(c, x, z) - 0.05) continue;
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
      } else if (c.kind === 'obox') {
        // Same as a box, in the box's own frame: lx across, lz along (sin yaw, cos yaw).
        const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
        const dx = x - c.x, dz = z - c.z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
        const qx = Math.max(-c.hw, Math.min(lx, c.hw)), qz = Math.max(-c.hd, Math.min(lz, c.hd));
        let ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            ex *= (r - d) / d; ez *= (r - d) / d;
          } else {
            const m = Math.min(c.hw - lx, c.hw + lx, c.hd - lz, c.hd + lz);
            ex = ez = 0;
            if (m === c.hw - lx) ex = c.hw + r - lx;
            else if (m === c.hw + lx) ex = -c.hw - r - lx;
            else if (m === c.hd - lz) ez = c.hd + r - lz;
            else ez = -c.hd - r - lz;
          }
          x += ex * cs + ez * sn;
          z += -ex * sn + ez * cs;
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

/** Whether (x, z) lies inside a collider's footprint, grown by `pad`. */
export function colliderContains(c: Collider, x: number, z: number, pad = 0): boolean {
  if (c.kind === 'circle') return (x - c.x) ** 2 + (z - c.z) ** 2 <= (c.r + pad) ** 2;
  if (c.kind === 'box') return x >= c.minX - pad && x <= c.maxX + pad && z >= c.minZ - pad && z <= c.maxZ + pad;
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), dx = x - c.x, dz = z - c.z;
  return Math.abs(dx * cs - dz * sn) <= c.hw + pad && Math.abs(dx * sn + dz * cs) <= c.hd + pad;
}

/** Height of a collider's top at (x, z), with a rounded top falling away by `dome` at the rim. */
export function colliderTop(c: Collider, x: number, z: number): number {
  const top = c.maxY ?? Infinity;
  if (!c.dome || c.kind !== 'circle') return top;
  const f = Math.min(1, ((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r));
  return top - c.dome * f;
}

/** Outward horizontal normal of the collider face nearest (x, z). */
export function colliderNormal(c: Collider, x: number, z: number): { x: number; z: number } {
  if (c.kind === 'circle') {
    const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }
  if (c.kind === 'box') {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    const ox = (x - cx) / Math.max(1e-3, (c.maxX - c.minX) / 2), oz = (z - cz) / Math.max(1e-3, (c.maxZ - c.minZ) / 2);
    return Math.abs(ox) > Math.abs(oz) ? { x: Math.sign(ox), z: 0 } : { x: 0, z: Math.sign(oz) };
  }
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), dx = x - c.x, dz = z - c.z;
  const lx = (dx * cs - dz * sn) / c.hw, lz = (dx * sn + dz * cs) / c.hd;
  // Local x is (cos, -sin) in the world, local z is (sin, cos).
  return Math.abs(lx) > Math.abs(lz) ? { x: Math.sign(lx) * cs, z: -Math.sign(lx) * sn } : { x: Math.sign(lz) * sn, z: Math.sign(lz) * cs };
}
