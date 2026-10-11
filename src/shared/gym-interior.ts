import { GYMS, type GymDef } from './gyms';

/**
 * Inside the gyms (DESIGN §13): a foyer, three co-operative puzzle chambers, a hall with two gym
 * trainers, a rest stop with a healing machine, and the leader's arena. Everything here is plain
 * data and pure functions, so both players' games agree on what is open from where everyone
 * stands, and tests can prove a chamber can't be solved alone.
 *
 * The interiors are built out over the sea north of the region (each gym in its own slot), raised
 * on a floor at GYM_FLOOR_Y, and only drawn for a player who is inside. Local coordinates: x across
 * (-HALF_W..HALF_W), z from the entrance (0) to the arena's back wall (LENGTH).
 *
 * Three kinds of chamber, each impossible for one trainer:
 * - relay: two lanes, each with a gate. A plate before lane A's gate opens lane B's; a plate past
 *   lane B's gate opens lane A's. One holds while the other runs, then the other way round.
 * - hazard: a band of lava / deep water / dark pit across the room. A plate on the near side makes
 *   one half safe; a plate on the far side makes the other half safe.
 * - mirror: two lanes of floor tiles, only some of them solid. A lane's tiles hold only while
 *   someone stands on its watch plate, which is in the other lane, and only the watcher sees which
 *   tiles are safe. Talk your partner across.
 * A chamber is solved when two trainers stand in its goal zone; solved chambers stay open.
 */

export const GYM_FLOOR_Y = 30;
export const HALF_W = 18;
export const LENGTH = 156;
const WALL = 0.6;
/** Where the first gym's interior sits; the others follow every SLOT metres west. */
const ORIGIN = { x: -3000, z: 4572 };
const SLOT = 70;

export type ChamberKind = 'relay' | 'hazard' | 'mirror';

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Plate {
  id: string;
  x: number;
  z: number;
  r: number;
}

export interface Gate {
  id: string;
  rect: Rect;
}

export interface Chamber {
  index: number;
  kind: ChamberKind;
  z0: number;
  z1: number;
  plates: Plate[];
  gates: Gate[];
  /** Where both trainers stand to solve it. */
  goal: Rect;
  /** Back to the start after a fall. */
  reset: { x: number; z: number };
  /** Hazard band (hazard chambers). */
  band?: Rect;
  /** Mirror tiles: per lane, the path's column in each row (see safeTile). */
  tiles?: { lanes: [Rect, Rect]; rows: number; cols: number; size: number; z0: number; path: [number[], number[]] };
}

export interface GymInterior {
  gym: GymDef;
  slot: number;
  /** World position of local (0, 0). */
  ox: number;
  oz: number;
  floorY: number;
  spawn: { x: number; z: number };
  exit: { x: number; z: number };
  chambers: Chamber[];
  /** Static walls (local). */
  walls: Rect[];
  /** Gates between the sections, opened by progress. */
  doors: Gate[];
  hall: { z0: number; z1: number; trainers: [{ x: number; z: number }, { x: number; z: number }] };
  ante: { z0: number; z1: number; heal: { x: number; z: number } };
  arena: { z0: number; z1: number; leader: { x: number; z: number } };
  /** Chamber walls that only some chambers have (dividers, glass). */
  glass: Rect[];
}

/** Each gym's chamber order. */
const ORDERS: ChamberKind[][] = [
  ['relay', 'hazard', 'mirror'],
  ['hazard', 'relay', 'mirror'],
  ['hazard', 'mirror', 'relay'],
  ['relay', 'mirror', 'hazard'],
  ['mirror', 'relay', 'hazard'],
  ['mirror', 'hazard', 'relay'],
];

/** Sections along z: foyer, chamber 0, chamber 1, hall, chamber 2, rest stop, arena. */
const Z = { foyer: 0, c0: 14, c1: 42, hall: 70, c2: 88, ante: 116, arena: 126, end: LENGTH };
const CHAMBER_LEN = 28;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });

function chamber(index: number, kind: ChamberKind, z0: number, seed: number): { c: Chamber; walls: Rect[]; glass: Rect[] } {
  const z1 = z0 + CHAMBER_LEN;
  const id = `c${index}`;
  const walls: Rect[] = [];
  const glass: Rect[] = [];
  const reset = { x: 0, z: z0 + 2 };
  if (kind === 'relay') {
    walls.push(r(-0.3, 0.3, z0 + 3, z0 + 21));
    return {
      c: {
        index, kind, z0, z1, reset,
        plates: [{ id: `${id}-pa`, x: -9, z: z0 + 7, r: 1.3 }, { id: `${id}-pb`, x: 9, z: z0 + 17, r: 1.3 }],
        gates: [{ id: `${id}-a`, rect: r(-HALF_W, -0.3, z0 + 11.7, z0 + 12.3) }, { id: `${id}-b`, rect: r(0.3, HALF_W, z0 + 11.7, z0 + 12.3) }],
        goal: r(-HALF_W, HALF_W, z0 + 21, z1),
      },
      walls, glass,
    };
  }
  if (kind === 'hazard') {
    return {
      c: {
        index, kind, z0, z1, reset,
        plates: [{ id: `${id}-near`, x: -10, z: z0 + 5, r: 1.3 }, { id: `${id}-far`, x: 10, z: z0 + 23, r: 1.3 }],
        gates: [],
        band: r(-HALF_W, HALF_W, z0 + 10, z0 + 17),
        goal: r(-HALF_W, HALF_W, z0 + 19, z1),
      },
      walls, glass,
    };
  }
  // Mirror: a glass wall between two lanes of tiles.
  glass.push(r(-0.15, 0.15, z0 + 3, z0 + 24));
  const rows = 5;
  const cols = 6;
  const size = 3;
  const rand = rng(seed);
  const path = (): number[] => {
    const out: number[] = [];
    let c = Math.floor(rand() * cols);
    for (let i = 0; i < rows; i++) {
      out.push(c);
      c = Math.max(0, Math.min(cols - 1, c + Math.floor(rand() * 3) - 1));
    }
    return out;
  };
  return {
    c: {
      index, kind, z0, z1, reset,
      // Lane A's watch plate is in lane B's start area; lane B's is at lane A's far end.
      plates: [{ id: `${id}-watch-a`, x: 9, z: z0 + 4, r: 1.2 }, { id: `${id}-watch-b`, x: -9, z: z0 + 23, r: 1.2 }],
      gates: [],
      goal: r(-HALF_W, HALF_W, z0 + 22, z1),
      tiles: { lanes: [r(-HALF_W, -0.15, z0 + 6, z0 + 21), r(0.15, HALF_W, z0 + 6, z0 + 21)], rows, cols, size, z0: z0 + 6, path: [path(), path()] },
    },
    walls, glass,
  };
}

const cache = new Map<string, GymInterior>();

/** The interior of a gym. */
export function gymInterior(g: GymDef): GymInterior {
  const hit = cache.get(g.id);
  if (hit) return hit;
  const slot = GYMS.indexOf(g);
  const order = ORDERS[slot % ORDERS.length];
  const walls: Rect[] = [];
  const glass: Rect[] = [];
  // The shell.
  walls.push(r(-HALF_W - WALL, -HALF_W, 0, LENGTH), r(HALF_W, HALF_W + WALL, 0, LENGTH), r(-HALF_W, HALF_W, -WALL, 0), r(-HALF_W, HALF_W, LENGTH, LENGTH + WALL));
  // Cross walls with a 4 m doorway in the middle.
  const cross = (z: number) => walls.push(r(-HALF_W, -2, z - WALL / 2, z + WALL / 2), r(2, HALF_W, z - WALL / 2, z + WALL / 2));
  for (const z of [Z.c0, Z.c1, Z.hall, Z.c2, Z.ante, Z.arena]) cross(z);
  const door = (id: string, z: number): Gate => ({ id, rect: r(-2, 2, z - WALL / 2, z + WALL / 2) });
  const chambers: Chamber[] = [];
  [Z.c0, Z.c1, Z.c2].forEach((z0, i) => {
    const made = chamber(i, order[i], z0, slot * 31 + i * 7 + 1);
    chambers.push(made.c);
    walls.push(...made.walls);
    glass.push(...made.glass);
  });
  const g2: GymInterior = {
    gym: g, slot,
    ox: ORIGIN.x + slot * SLOT, oz: ORIGIN.z, floorY: GYM_FLOOR_Y,
    spawn: { x: 0, z: 4 }, exit: { x: 0, z: 1.4 },
    chambers, walls, glass,
    doors: [door('exit-0', Z.c1), door('exit-1', Z.hall), door('hall', Z.c2), door('exit-2', Z.ante)],
    hall: { z0: Z.hall, z1: Z.c2, trainers: [{ x: -3, z: Z.c2 - 4 }, { x: 3, z: Z.c2 - 4 }] },
    ante: { z0: Z.ante, z1: Z.arena, heal: { x: -12, z: Z.ante + 5 } },
    arena: { z0: Z.arena, z1: Z.end, leader: { x: 0, z: Z.end - 6 } },
  };
  cache.set(g.id, g2);
  return g2;
}

/** The gym interior a world point is in, if any (with its local coordinates). */
export function interiorAt(x: number, z: number): { interior: GymInterior; lx: number; lz: number } | null {
  // Quick reject: the interiors are all far out over the northern sea.
  if (!(z > ORIGIN.z - 2 && z < ORIGIN.z + LENGTH + 2)) return null;
  const slot = Math.round((x - ORIGIN.x) / SLOT);
  if (!(slot >= 0 && slot < GYMS.length)) return null;
  const it = gymInterior(GYMS[slot]);
  const lx = x - it.ox;
  const lz = z - it.oz;
  if (Math.abs(lx) > HALF_W + 1 || lz < -1 || lz > LENGTH + 1) return null;
  return { interior: it, lx, lz };
}

export const toWorld = (it: GymInterior, p: { x: number; z: number }): { x: number; z: number } => ({ x: it.ox + p.x, z: it.oz + p.z });

/** Saved progress through one gym: chambers solved, the trainers beaten. Kept between visits. */
export interface GymProgress {
  solved: number[];
  trainers?: boolean;
}

/** Everything that changes as people move: which gates are open, which floor is safe. */
export interface GymState {
  open: Set<string>;
  pressed: Set<string>;
}

const inside = (rc: Rect, x: number, z: number) => x >= rc.x0 && x <= rc.x1 && z >= rc.z0 && z <= rc.z1;
const onPlate = (p: Plate, people: readonly { x: number; z: number }[]) => people.some((q) => Math.hypot(q.x - p.x, q.z - p.z) <= p.r);

/** What is open with these people (local coordinates) standing where they are. */
export function gymState(it: GymInterior, people: readonly { x: number; z: number }[], progress: GymProgress): GymState {
  const open = new Set<string>();
  const pressed = new Set<string>();
  for (const c of it.chambers) {
    for (const p of c.plates) if (onPlate(p, people)) pressed.add(p.id);
    if (c.kind === 'relay') {
      // Plate A opens gate B and plate B opens gate A. A solved chamber stays open.
      const solved = progress.solved.includes(c.index);
      if (solved || pressed.has(`c${c.index}-pa`)) open.add(`c${c.index}-b`);
      if (solved || pressed.has(`c${c.index}-pb`)) open.add(`c${c.index}-a`);
    }
  }
  progress.solved.forEach((i) => open.add(`exit-${i}`));
  if (progress.trainers) open.add('hall');
  return { open, pressed };
}

/** Walls and closed gates (local rects) that block movement right now. */
export function blockers(it: GymInterior, state: GymState): Rect[] {
  const out = [...it.walls, ...it.glass];
  for (const c of it.chambers) for (const g of c.gates) if (!state.open.has(g.id)) out.push(g.rect);
  for (const d of it.doors) if (!state.open.has(d.id)) out.push(d.rect);
  return out;
}

/** The mirror tile under a point: lane, row, column. */
export function tileAt(c: Chamber, x: number, z: number): { lane: 0 | 1; row: number; col: number } | null {
  const t = c.tiles;
  if (!t) return null;
  for (const lane of [0, 1] as const) {
    const rc = t.lanes[lane];
    if (!inside(rc, x, z)) continue;
    const row = Math.min(t.rows - 1, Math.floor((z - t.z0) / t.size));
    const col = Math.min(t.cols - 1, Math.max(0, Math.floor((x - rc.x0) / t.size)));
    return { lane, row, col };
  }
  return null;
}

/**
 * Whether a mirror tile is solid (when watched). The path picks a column per row; a row is solid
 * from its column across to the next row's, so the way through never needs a diagonal step.
 */
export function safeTile(c: Chamber, lane: 0 | 1, row: number, col: number): boolean {
  const path = c.tiles!.path[lane];
  const a = path[row];
  const b = path[row + 1] ?? a;
  return col >= Math.min(a, b) && col <= Math.max(a, b);
}

/**
 * Whether standing at (x, z) sends you back to the chamber's start: an unsafe half of a hazard
 * band, or a mirror tile that isn't on the path or isn't being watched.
 */
export function unsafeAt(it: GymInterior, state: GymState, progress: GymProgress, x: number, z: number): Chamber | null {
  for (const c of it.chambers) {
    if (z < c.z0 || z > c.z1 || progress.solved.includes(c.index)) continue;
    if (c.kind === 'hazard' && c.band && inside(c.band, x, z)) {
      const safe = x >= 0 ? state.pressed.has(`c${c.index}-near`) : state.pressed.has(`c${c.index}-far`);
      if (!safe) return c;
    }
    if (c.kind === 'mirror') {
      const t = tileAt(c, x, z);
      if (!t) continue;
      const watched = state.pressed.has(`c${c.index}-watch-${t.lane === 0 ? 'a' : 'b'}`);
      if (!watched || !safeTile(c, t.lane, t.row, t.col)) return c;
    }
  }
  return null;
}

/** Which mirror lanes a person at (x, z) can see the safe path of: the lane they watch over. */
export function watchedLanes(it: GymInterior, x: number, z: number): { chamber: Chamber; lane: 0 | 1 }[] {
  const out: { chamber: Chamber; lane: 0 | 1 }[] = [];
  for (const c of it.chambers) {
    if (c.kind !== 'mirror') continue;
    c.plates.forEach((p, i) => {
      if (Math.hypot(x - p.x, z - p.z) <= p.r) out.push({ chamber: c, lane: i as 0 | 1 });
    });
  }
  return out;
}

/** Chambers whose goal zone now holds two trainers. */
export function newlySolved(it: GymInterior, people: readonly { x: number; z: number }[], progress: GymProgress): number[] {
  if (people.length < 2) return [];
  return it.chambers.filter((c) => !progress.solved.includes(c.index) && people.filter((p) => inside(c.goal, p.x, p.z)).length >= 2).map((c) => c.index);
}

/** Which section of the gym a point is in. */
export function sectionAt(it: GymInterior, z: number): 'foyer' | 'chamber' | 'hall' | 'ante' | 'arena' {
  if (z < Z.c0) return 'foyer';
  if (z >= it.hall.z0 && z < it.hall.z1) return 'hall';
  if (z >= it.ante.z0 && z < it.ante.z1) return 'ante';
  if (z >= it.arena.z0) return 'arena';
  return 'chamber';
}

export function chamberAt(it: GymInterior, z: number): Chamber | null {
  return it.chambers.find((c) => z >= c.z0 && z < c.z1) ?? null;
}

/** Is a point inside any of these rects (grown by `pad`)? */
export function hitsRect(rects: readonly Rect[], x: number, z: number, pad = 0): boolean {
  return rects.some((rc) => x >= rc.x0 - pad && x <= rc.x1 + pad && z >= rc.z0 - pad && z <= rc.z1 + pad);
}
