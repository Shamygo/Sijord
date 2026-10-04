/**
 * World layout constants. Conventions: 1 unit = 1 m, Y up, NORTH = +Z, EAST = -X (west = +X).
 * The playable square is ±HALF; the terrain grid extends a bit further for the boundary mountains.
 */
export type P2 = [number, number];

export const HALF = 600;
export const GRID_HALF = 640;
export const CELL = 2.5;
export const GRID_N = Math.round((GRID_HALF * 2) / CELL); // cells per side (512)
export const WATER_LEVEL = 0;

/** Hometown Bramblewick: south-centre, gate on the north (+Z) side. */
export const TOWN = { x: 0, z: -330, fenceR: 55, plateauR: 64, blendR: 122, h: 9 };
export const GATE_HALF_WIDTH = 3.4;

export interface Polyline {
  pts: P2[];
  width: number; // half width of the dirt strip
}

/** Route 1: from the town gate north into the wider world, ending near the north-west ruins. */
export const ROAD_MAIN: Polyline = {
  pts: [[0, -276], [0, -240], [10, -180], [-6, -110], [-20, -40], [0, 40], [45, 120], [110, 185], [180, 215], [215, 222]],
  width: 2.6,
};
/** Branch east (-X) over the river bridge. */
export const ROAD_EAST: Polyline = {
  pts: [[-20, -40], [-90, -32], [-170, -22], [-250, -12], [-330, -4], [-440, 30], [-520, 60]],
  width: 2.3,
};
/** Footpath from Route 1 to the lake dock. */
export const PATH_LAKE: Polyline = {
  pts: [[0, -238], [-40, -246], [-80, -262], [-104, -270]],
  width: 1.5,
};
/** Footpath to the campsite. */
export const PATH_CAMP: Polyline = {
  pts: [[6, -200], [50, -222], [100, -250], [126, -258]],
  width: 1.3,
};

export const ROADS: Polyline[] = [ROAD_MAIN, ROAD_EAST, PATH_LAKE, PATH_CAMP];

/** River flowing from the north-east mountains into the lake east of town, then out to the south-east. */
export const RIVER_IN: P2[] = [[-560, 700], [-430, 450], [-315, 235], [-238, 40], [-198, -70], [-172, -170], [-170, -250]];
export const RIVER_OUT: P2[] = [[-205, -310], [-255, -365], [-320, -440], [-400, -540], [-470, -700]];
export const RIVER_HALF_WIDTH = 8;

export const LAKE = { x: -172, z: -288, rx: 58, rz: 40 };
export const POND = { x: -110, z: 130, r: 13 };

export interface Mesa { x: number; z: number; r: number; h: number; tier: number; }
/** Grey layered stone mesas with ruins, north-west (+X, +Z). */
export const MESAS: Mesa[] = [
  { x: 265, z: 175, r: 58, h: 30, tier: 0.35 },
  { x: 165, z: 300, r: 38, h: 22, tier: 0 },
  { x: 345, z: 25, r: 44, h: 38, tier: 0.3 },
  { x: 410, z: 260, r: 56, h: 46, tier: 0.4 },
  { x: 95, z: 375, r: 26, h: 18, tier: 0 },
];

export const POI = {
  arch: { x: 62, z: -128 },
  camp: { x: 132, z: -262 },
  junction: { x: -20, z: -40 },
  loneTree: { x: 215, z: -125 },
  pond: POND,
  dock: { x: -112, z: -273 },
  stones: { x: -300, z: 300 },
};

// ---------- geometry helpers ----------

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px;
  const ez = az + dz * t - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

export function distToPolyline(px: number, pz: number, pts: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    // cheap reject using bounding box
    const minX = Math.min(a[0], b[0]) - best;
    const maxX = Math.max(a[0], b[0]) + best;
    if (px < minX || px > maxX) continue;
    const minZ = Math.min(a[1], b[1]) - best;
    const maxZ = Math.max(a[1], b[1]) + best;
    if (pz < minZ || pz > maxZ) continue;
    const d = distToSegment(px, pz, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best;
}

/** Normalised distance to the lake ellipse, in metres (approx), negative inside. */
export function lakeDist(x: number, z: number): number {
  const nx = (x - LAKE.x) / LAKE.rx;
  const nz = (z - LAKE.z) / LAKE.rz;
  const r = Math.sqrt(nx * nx + nz * nz);
  return (r - 1) * Math.min(LAKE.rx, LAKE.rz);
}

/** Intersection of segment AB with polyline; returns point + index or null. */
export function intersectPolyline(a: P2, b: P2, pts: P2[]): { x: number; z: number; seg: number } | null {
  for (let i = 0; i < pts.length - 1; i++) {
    const c = pts[i];
    const d = pts[i + 1];
    const r1x = b[0] - a[0], r1z = b[1] - a[1];
    const r2x = d[0] - c[0], r2z = d[1] - c[1];
    const den = r1x * r2z - r1z * r2x;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((c[0] - a[0]) * r2z - (c[1] - a[1]) * r2x) / den;
    const u = ((c[0] - a[0]) * r1z - (c[1] - a[1]) * r1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: a[0] + r1x * t, z: a[1] + r1z * t, seg: i };
  }
  return null;
}

/** Where the east road crosses the river: bridge centre and direction (along the road). */
export function findBridge(): { x: number; z: number; dirX: number; dirZ: number } {
  const pts = ROAD_EAST.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const hit = intersectPolyline(pts[i], pts[i + 1], RIVER_IN);
    if (hit) {
      const dx = pts[i + 1][0] - pts[i][0];
      const dz = pts[i + 1][1] - pts[i][1];
      const l = Math.hypot(dx, dz);
      return { x: hit.x, z: hit.z, dirX: dx / l, dirZ: dz / l };
    }
  }
  return { x: -205, z: -30, dirX: -1, dirZ: 0 };
}

// ---------- Bramblewick local layout (offsets from TOWN centre; +Z north, +X west) ----------
const T = (pts: P2[]): P2[] => pts.map(([x, z]) => [TOWN.x + x, TOWN.z + z] as P2);

export const TOWN_PATHS: Polyline[] = [
  { pts: T([[0, 8], [0, 62]]), width: 2.4 },
  { pts: T([[0, -8], [0, -23]]), width: 2.1 },
  { pts: T([[33, 13], [0, 13], [-16, 13], [-16, 18]]), width: 1.5 },
  { pts: T([[27, 13], [27, 16]]), width: 1.2 },
  { pts: T([[14, 13], [14, 16]]), width: 1.2 },
  { pts: T([[-8, -2], [-23.5, -2]]), width: 1.4 },
  { pts: T([[8, -10], [23.5, -10]]), width: 1.4 },
];
export const TOWN_DIRT_CIRCLES: { x: number; z: number; r: number }[] = [
  { x: TOWN.x, z: TOWN.z, r: 8 },
  { x: TOWN.x, z: TOWN.z - 21.5, r: 4.5 },
  { x: TOWN.x, z: TOWN.z + 56, r: 4 },
];
