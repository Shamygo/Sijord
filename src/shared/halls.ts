import type { Rect } from './gym-interior';

/**
 * The great halls that aren't gyms: the Battle Tower at Tornhavn and the League at Crownspire.
 * Like the gym interiors (shared/gym-interior.ts) they're built out over the northern sea, raised
 * on a floor, drawn only for a player inside, and walked into through their building's door.
 * Local coordinates: x across (-halfW..halfW), z from the entrance (0) inward.
 *
 * Each hall is a row of rooms separated by cross walls with a doorway; doors are shut unless the
 * hall's state opens them. Spots name where people stand and where the prompts are.
 */

export type HallId = 'battle-tower' | 'league';

export interface HallProp {
  kind: 'counter' | 'board' | 'ring' | 'dais' | 'pad' | 'banner' | 'pillar' | 'plant' | 'heal';
  x: number;
  z: number;
  /** Half extents (boxes) or radius (rings, pillars, plants). */
  w?: number;
  d?: number;
  /** Colour override (otherwise the room's accent). */
  color?: string;
  /** Solid: people walk round it. */
  solid?: boolean;
}

export interface HallRoom {
  id: string;
  z0: number;
  z1: number;
  /** Floor, wall, trim and accent colours. */
  theme: { floor: string; wall: string; trim: string; accent: string; pattern: 'square' | 'hex' | 'plank' | 'diamond' };
}

export interface HallInterior {
  id: HallId;
  name: string;
  ox: number;
  oz: number;
  floorY: number;
  halfW: number;
  length: number;
  rooms: HallRoom[];
  walls: Rect[];
  /** Doorways between rooms, closed unless opened. */
  doors: { id: string; rect: Rect }[];
  props: HallProp[];
  spots: Record<string, { x: number; z: number }>;
}

export const HALL_FLOOR_Y = 30;
const WALL = 0.6;
/**
 * The halls carry on the gyms' row over the northern sea (the ten gyms take x -3000 to -2370),
 * inside the region's bounds.
 */
const ORIGIN = { x: -2290, z: 4572 };
const r = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });

function shell(halfW: number, length: number, crossAt: number[]): { walls: Rect[]; doors: { id: string; rect: Rect }[] } {
  const walls = [r(-halfW - WALL, -halfW, 0, length), r(halfW, halfW + WALL, 0, length), r(-halfW, halfW, -WALL, 0), r(-halfW, halfW, length, length + WALL)];
  const doors: { id: string; rect: Rect }[] = [];
  crossAt.forEach((z, i) => {
    walls.push(r(-halfW, -2, z - WALL / 2, z + WALL / 2), r(2, halfW, z - WALL / 2, z + WALL / 2));
    doors.push({ id: `door-${i}`, rect: r(-2, 2, z - WALL / 2, z + WALL / 2) });
  });
  return { walls, doors };
}

const TOWER_THEME: HallRoom['theme'] = { floor: '#2c3550', wall: '#d9dce6', trim: '#1e2540', accent: '#e8b84a', pattern: 'diamond' };
const TOWER_ARENA: HallRoom['theme'] = { floor: '#3a4258', wall: '#c4c9d8', trim: '#1e2540', accent: '#58b8ff', pattern: 'square' };

/**
 * The Battle Tower: a lobby (the entry desk, the BP exchange, the record board) and, through the
 * lift doors, the battle floor where each challenger waits across the ring.
 */
function battleTower(): HallInterior {
  const halfW = 16;
  const length = 54;
  const { walls, doors } = shell(halfW, length, [22]);
  return {
    id: 'battle-tower', name: 'Battle Tower',
    ox: ORIGIN.x, oz: ORIGIN.z, floorY: HALL_FLOOR_Y, halfW, length,
    rooms: [{ id: 'lobby', z0: 0, z1: 22, theme: TOWER_THEME }, { id: 'floor', z0: 22, z1: length, theme: TOWER_ARENA }],
    walls, doors,
    props: [
      { kind: 'pad', x: 0, z: 1.4, w: 1.6, d: 1 },
      { kind: 'counter', x: 0, z: 16.5, w: 4, d: 0.6, solid: true },
      { kind: 'counter', x: -11, z: 11, w: 0.6, d: 3, solid: true, color: '#58b8ff' },
      { kind: 'board', x: 11.5, z: 11, w: 0.2, d: 2 },
      { kind: 'plant', x: -14, z: 2.5 }, { kind: 'plant', x: 14, z: 2.5 }, { kind: 'plant', x: -14, z: 19.5 }, { kind: 'plant', x: 14, z: 19.5 },
      { kind: 'banner', x: -halfW + 0.2, z: 8 }, { kind: 'banner', x: halfW - 0.2, z: 8 },
      // The battle floor: a ring, pillars, and the pad back to the lobby.
      // The battle ring is centred where the battle stage puts it, five metres ahead of the player's spot.
      { kind: 'ring', x: -0.6, z: 34.9, w: 7.4 },
      { kind: 'pad', x: 0, z: 24.4, w: 1.6, d: 0.9, color: '#58b8ff' },
      { kind: 'pillar', x: -10, z: 26 }, { kind: 'pillar', x: 10, z: 26 }, { kind: 'pillar', x: -10, z: 48 }, { kind: 'pillar', x: 10, z: 48 },
      { kind: 'banner', x: -halfW + 0.2, z: 35 }, { kind: 'banner', x: halfW - 0.2, z: 35 },
    ],
    spots: {
      spawn: { x: 0, z: 4 },
      exit: { x: 0, z: 1.4 },
      guide: { x: 0, z: 18.4 },
      exchange: { x: -12.6, z: 11 },
      records: { x: 11.2, z: 11 },
      // On the battle floor.
      lift: { x: 0, z: 24.4 },
      player: { x: 0, z: 30 },
      partner: { x: 2.5, z: 29 },
    },
  };
}

/** The League's rooms: the foyer, then each Elite Four member's colours, then the Champion's hall. */
const LEAGUE_THEMES: HallRoom['theme'][] = [
  { floor: '#3a3440', wall: '#e4ded2', trim: '#2a2230', accent: '#e8c86a', pattern: 'diamond' },
  { floor: '#221c2c', wall: '#4a3f5c', trim: '#15111c', accent: '#8a5ad8', pattern: 'hex' },
  { floor: '#4a2a22', wall: '#d8b8a0', trim: '#2a1a14', accent: '#d8603a', pattern: 'plank' },
  { floor: '#26342a', wall: '#b8c8a8', trim: '#1a2418', accent: '#9ad84a', pattern: 'hex' },
  { floor: '#1c2440', wall: '#a8b4d0', trim: '#121830', accent: '#4a7ad8', pattern: 'square' },
  { floor: '#d8e4ee', wall: '#f2f6fa', trim: '#3a4a6a', accent: '#7ad8f0', pattern: 'diamond' },
];

/** Where the League's rooms start: the foyer runs to 16, each Elite Four room is 26 long, the Champion's 42. */
export const LEAGUE_ROOM_Z = [16, 42, 68, 94, 120];

/**
 * The League at Crownspire: a foyer (the guard and the healing machine), four Elite Four rooms,
 * and the Champion's hall with the Hall of Fame at its far end. Each member waits where the battle
 * stage puts the foe trainer, ten metres ahead of where the battle puts you.
 */
function league(): HallInterior {
  const halfW = 18;
  const length = 162;
  const { walls, doors } = shell(halfW, length, LEAGUE_ROOM_Z);
  const ends = [...LEAGUE_ROOM_Z, length];
  const rooms: HallRoom[] = [{ id: 'foyer', z0: 0, z1: LEAGUE_ROOM_Z[0], theme: LEAGUE_THEMES[0] }];
  LEAGUE_ROOM_Z.forEach((z0, k) => rooms.push({ id: `room-${k}`, z0, z1: ends[k + 1], theme: LEAGUE_THEMES[k + 1] }));
  const props: HallProp[] = [
    { kind: 'pad', x: 0, z: 1.4, w: 1.6, d: 1 },
    { kind: 'heal', x: -10.2, z: 10, w: 0.9, d: 0.7, solid: true },
    { kind: 'plant', x: -16, z: 2.5 }, { kind: 'plant', x: 16, z: 2.5 }, { kind: 'plant', x: -16, z: 14 }, { kind: 'plant', x: 16, z: 14 },
    { kind: 'banner', x: -halfW + 0.2, z: 7 }, { kind: 'banner', x: halfW - 0.2, z: 7 },
  ];
  const spots: HallInterior['spots'] = { spawn: { x: 0, z: 4 }, exit: { x: 0, z: 1.4 }, heal: { x: -8.6, z: 10 }, guard: { x: 5, z: 12.5 } };
  LEAGUE_ROOM_Z.forEach((z0, k) => {
    // The battle ring, centred where the stage puts it, five metres ahead of the player's spot (z0 + 6).
    props.push({ kind: 'ring', x: -0.6, z: z0 + 10.9, w: 7.4 });
    props.push({ kind: 'pillar', x: -12, z: z0 + 4 }, { kind: 'pillar', x: 12, z: z0 + 4 }, { kind: 'pillar', x: -12, z: z0 + 21 }, { kind: 'pillar', x: 12, z: z0 + 21 });
    props.push({ kind: 'banner', x: -halfW + 0.2, z: z0 + 12.5 }, { kind: 'banner', x: halfW - 0.2, z: z0 + 12.5 });
    spots[`m${k}`] = { x: 0, z: z0 + 16 };
  });
  // The Hall of Fame, up a step at the far end of the Champion's hall.
  props.push({ kind: 'dais', x: 0, z: 154, w: 8, d: 5, color: '#e8c86a' });
  props.push({ kind: 'pillar', x: -12, z: 146, color: '#e8c86a' }, { kind: 'pillar', x: 12, z: 146, color: '#e8c86a' }, { kind: 'pillar', x: -12, z: 158, color: '#e8c86a' }, { kind: 'pillar', x: 12, z: 158, color: '#e8c86a' });
  props.push({ kind: 'banner', x: -halfW + 0.2, z: 152, color: '#e8c86a' }, { kind: 'banner', x: halfW - 0.2, z: 152, color: '#e8c86a' });
  spots.fame = { x: 0, z: 152 };
  return { id: 'league', name: 'Sijord League', ox: ORIGIN.x + 50, oz: ORIGIN.z, floorY: HALL_FLOOR_Y, halfW, length, rooms, walls, doors, props, spots };
}

const HALLS = new Map<HallId, HallInterior>();
const BUILD: Record<HallId, () => HallInterior> = { 'battle-tower': battleTower, league };

export function hallInterior(id: HallId): HallInterior {
  let h = HALLS.get(id);
  if (!h) HALLS.set(id, (h = BUILD[id]()));
  return h;
}

const ALL = Object.keys(BUILD) as HallId[];

/** The hall a world point is in, if any (with its local coordinates). */
export function hallAt(x: number, z: number): { hall: HallInterior; lx: number; lz: number } | null {
  if (!(z > ORIGIN.z - 2 && z < ORIGIN.z + 170)) return null;
  for (const id of ALL) {
    const h = hallInterior(id);
    const lx = x - h.ox;
    const lz = z - h.oz;
    if (Math.abs(lx) <= h.halfW + 1 && lz >= -1 && lz <= h.length + 1) return { hall: h, lx, lz };
  }
  return null;
}

export const hallWorld = (h: HallInterior, p: { x: number; z: number }): { x: number; z: number } => ({ x: h.ox + p.x, z: h.oz + p.z });

export function hallRoomAt(h: HallInterior, z: number): HallRoom | null {
  return h.rooms.find((rm) => z >= rm.z0 && z < rm.z1) ?? null;
}

/** Walls, solid props and shut doors (local rects) that block movement. */
export function hallBlockers(h: HallInterior, open: ReadonlySet<string>): Rect[] {
  const out = [...h.walls];
  for (const p of h.props) if (p.solid) out.push(r(p.x - (p.w ?? 0.5), p.x + (p.w ?? 0.5), p.z - (p.d ?? 0.5), p.z + (p.d ?? 0.5)));
  for (const d of h.doors) if (!open.has(d.id)) out.push(d.rect);
  return out;
}
