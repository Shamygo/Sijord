/**
 * Lays out every settlement outside Bramblewick from the Blender-built kit (DESIGN §2.3):
 * small fenced villages round a plaza, medium towns along a main street with a Pokémon Center,
 * shop and inn, and large cities on a street grid with a market square and a gym at the end of
 * the main avenue. Pure and deterministic (seeded by the settlement's id), so the terrain
 * workers can paint the streets and both players' games build the same towns.
 *
 * Coordinates are the game's: x west, z north, yaw turns a model's front (+Z) towards
 * (sin yaw, cos yaw).
 */
import ASSETS from './data/world-assets.json';
import { REGION_ROADS, SETTLEMENTS, type P2, type Settlement, type SettlementStyle } from './region';

export type PlacementRole = 'house' | 'pokecenter' | 'mart' | 'inn' | 'gym' | 'tower' | 'league' | 'gate' | 'fence' | 'stall' | 'board' | 'landmark' | 'prop' | 'lamp';

export interface Placement {
  asset: string;
  x: number;
  z: number;
  yaw: number;
  role: PlacementRole;
}

export interface Street {
  pts: P2[];
  width: number;
}

export interface NpcSpot {
  x: number;
  z: number;
  yaw: number;
  role: 'villager' | 'nurse' | 'clerk' | 'innkeeper' | 'guide' | 'elder' | 'guard';
}

export interface SettlementLayout {
  id: string;
  placements: Placement[];
  streets: Street[];
  plazas: { x: number; z: number; r: number }[];
  npcs: NpcSpot[];
  /** Where each road enters (just inside the boundary). */
  entries: { x: number; z: number; angle: number }[];
}

interface AssetMeta {
  bounds: number[];
  colliders: ({ x: number; y: number; hw: number; hd: number; yaw: number; top: number } | { x: number; y: number; r: number; top: number })[];
  doors: { x: number; y: number; kind: string }[];
  lamps: number[][];
  anchors: Record<string, number[]>;
}

const META = (ASSETS as unknown as { assets: Record<string, AssetMeta> }).assets;

export function assetMeta(name: string): AssetMeta | undefined {
  return META[name];
}

/** A model's footprint in its own frame (game axes): centre offset and half extents. */
export function footprint(name: string): { cx: number; cz: number; hw: number; hd: number } {
  const b = META[name]?.bounds ?? [-3, -3, 0, 3, 3, 4];
  // Blender (x, y, z) -> game (x, z, -y).
  return { cx: (b[0] + b[3]) / 2, cz: -(b[1] + b[4]) / 2, hw: (b[3] - b[0]) / 2, hd: (b[4] - b[1]) / 2 };
}

/** Turn a model-local point (game axes) into the world for a placement. */
export function toWorld(p: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

/** The yaw that turns a model's front towards (tx, tz) from (x, z). */
export function faceYaw(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

function rng(id: string): () => number {
  let a = 0x9e3779b9;
  for (let i = 0; i < id.length; i++) a = Math.imul(a ^ id.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FENCE: Record<SettlementStyle, string | null> = {
  meadow: 'fence_picket', timber: 'fence_palisade', stilt: 'fence_palisade', stone: 'fence_stone', ice: 'fence_palisade',
  adobe: 'fence_rail', basalt: 'fence_stone', harbour: null, castle: 'fence_stone',
};

const CENTREPIECE: Record<SettlementStyle, string> = {
  meadow: 'well', timber: 'campfire', stilt: 'campfire', stone: 'monolith', ice: 'campfire',
  adobe: 'well', basalt: 'monolith', harbour: 'well', castle: 'fountain',
};

const PROPS: Record<SettlementStyle, string[]> = {
  meadow: ['barrels', 'crates', 'cart', 'hay', 'planter', 'beehives', 'bench'],
  timber: ['barrels', 'crates', 'cart', 'hay', 'bench'],
  stilt: ['barrels', 'crates', 'rowboat'],
  stone: ['barrels', 'crates', 'cart', 'bench', 'planter'],
  ice: ['barrels', 'crates', 'tent'],
  adobe: ['barrels', 'crates', 'cart', 'tent'],
  basalt: ['barrels', 'crates', 'cart'],
  harbour: ['barrels', 'crates', 'rowboat', 'bench'],
  castle: ['planter', 'bench', 'barrels'],
};

const GYM_ASSET: Record<string, string> = {
  bug: 'gym_bug', water: 'gym_water', fire: 'gym_fire', electric: 'gym_electric', ground: 'gym_ground',
  ice: 'gym_ice', psychic: 'gym_psychic', ghost: 'gym_ghost', fairy: 'gym_fairy', steel: 'gym_steel',
};

/** Angles (from the centre) at which region roads reach this settlement. */
function roadEntries(s: Settlement): number[] {
  const out: number[] = [];
  for (const r of REGION_ROADS) {
    for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) {
      const d = Math.hypot(p[0] - s.x, p[1] - s.z);
      if (d < s.r + 70) out.push(Math.atan2(p[0] - s.x, p[1] - s.z));
    }
  }
  // Merge entries closer than 25 degrees.
  out.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const a of out) if (!merged.some((m) => Math.abs(angleDiff(m, a)) < 0.44)) merged.push(a);
  return merged;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

class Builder {
  readonly placements: Placement[] = [];
  readonly streets: Street[] = [];
  readonly plazas: { x: number; z: number; r: number }[] = [];
  readonly npcs: NpcSpot[] = [];
  private readonly taken: { x: number; z: number; r: number }[] = [];
  constructor(readonly s: Settlement, readonly rnd: () => number) {}

  /** Place a model if its footprint is clear of everything placed so far (and of streets). */
  place(asset: string, x: number, z: number, yaw: number, role: PlacementRole, pad = 1.2, force = false, inPlaza = false): boolean {
    if (!META[asset]) return false;
    const f = footprint(asset);
    const [cx, cz] = toWorld({ x, z, yaw }, f.cx, f.cz);
    const r = Math.hypot(f.hw, f.hd) * 0.82;
    if (!force) {
      if (Math.hypot(cx - this.s.x, cz - this.s.z) + r > this.s.r - 4) return false;
      for (const t of this.taken) if (Math.hypot(t.x - cx, t.z - cz) < t.r + r + pad) return false;
      for (const st of this.streets) if (distPoly(cx, cz, st.pts) < st.width + r * 0.8) return false;
      if (!inPlaza) for (const p of this.plazas) if (Math.hypot(p.x - cx, p.z - cz) < p.r + r * 0.7) return false;
    }
    this.taken.push({ x: cx, z: cz, r });
    this.placements.push({ asset, x, z, yaw, role });
    return true;
  }

  /** Reserve space without a model (keeps houses off a spot). */
  reserve(x: number, z: number, r: number): void {
    this.taken.push({ x, z, r });
  }

  house(style: SettlementStyle, large: boolean): string {
    const v = Math.floor(this.rnd() * (large ? 2 : 3));
    return `house_${style}_${large ? 'l' : 's'}${v}`;
  }

  /** Line a street with houses on both sides, facing it; `fill` is the share of lots built on. */
  lineStreet(a: P2, b: P2, width: number, largeShare: number, spacing = 1.6, fill = 0.85): void {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    const nx = dz, nz = -dx;
    for (const side of [1, -1]) {
      let t = 6 + this.rnd() * 4;
      while (t < L - 6) {
        const large = this.rnd() < largeShare;
        const asset = this.house(this.s.style, large);
        const f = footprint(asset);
        if (this.rnd() > fill) {
          // An empty lot: a garden or a yard, with now and then a prop in it.
          t += f.hw * 2 + spacing + 4;
          continue;
        }
        const set = width + f.hd + 1.6 + this.rnd() * 1.5;
        const x = a[0] + dx * t + nx * side * set, z = a[1] + dz * t + nz * side * set;
        const yaw = Math.atan2(-nx * side, -nz * side);
        if (this.place(asset, x, z, yaw, 'house')) t += f.hw * 2 + spacing + this.rnd() * 3;
        else t += 3;
      }
    }
  }

  lamps(pts: P2[], width: number, every: number): void {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let t = every / 2, k = 0; t < L; t += every, k++) {
        const side = k % 2 ? 1 : -1;
        const x = ax + dx * t + dz * side * (width + 1.0), z = az + dz * t - dx * side * (width + 1.0);
        this.place('lamp_post', x, z, 0, 'lamp', 0.3);
      }
    }
  }

  props(n: number, near: { x: number; z: number }, r0: number, r1: number): void {
    const list = PROPS[this.s.style];
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) {
      const a = this.rnd() * Math.PI * 2, d = r0 + this.rnd() * (r1 - r0);
      const x = near.x + Math.sin(a) * d, z = near.z + Math.cos(a) * d;
      if (this.place(list[Math.floor(this.rnd() * list.length)], x, z, this.rnd() * Math.PI * 2, 'prop', 0.8)) i++;
    }
  }

  npcRing(n: number, x: number, z: number, r0: number, r1: number, role: NpcSpot['role'] = 'villager'): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd() * 0.5, d = r0 + this.rnd() * (r1 - r0);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      this.npcs.push({ x: px, z: pz, yaw: faceYaw(px, pz, x, z) + (this.rnd() - 0.5) * 1.2, role });
    }
  }

  /** A front-door spot for an NPC who works at a building. */
  npcAtDoor(p: Placement, role: NpcSpot['role'], ahead = 1.4): void {
    const door = META[p.asset]?.doors?.find((d) => d.kind !== 'door') ?? META[p.asset]?.doors?.[0];
    const lz = door ? -door.y : footprint(p.asset).hd;
    const [x, z] = toWorld(p, (door?.x ?? 0) + 1.6, lz + ahead);
    this.npcs.push({ x, z, yaw: p.yaw, role });
  }

  fence(entries: number[]): void {
    const kind = FENCE[this.s.style];
    if (!kind) return;
    const R = this.s.r - 3;
    const seg = footprint(kind).hw * 2;
    const n = Math.max(8, Math.round((Math.PI * 2 * R) / seg));
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      if (entries.some((e) => Math.abs(angleDiff(e, a)) < (seg * 1.1) / R)) continue;
      const x = this.s.x + Math.sin(a) * R, z = this.s.z + Math.cos(a) * R;
      // A fence segment runs along its local x; yaw = a lays it along the ring's tangent.
      this.place(kind, x, z, a, 'fence', 0, true);
    }
    for (const e of entries) {
      const x = this.s.x + Math.sin(e) * R, z = this.s.z + Math.cos(e) * R;
      this.place('gate_arch', x, z, e, 'gate', 0, true);
    }
  }
}

function distPoly(x: number, z: number, pts: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/** The notice board: by the plaza, wherever it fits first. */
function placeBoard(b: Builder, c: { x: number; z: number }, angle: number, d0: number): void {
  for (let d = d0; d < d0 + 30; d += 2) {
    for (const da of [0, 0.4, -0.4, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2, Math.PI]) {
      const x = c.x + Math.sin(angle + da) * d, z = c.z + Math.cos(angle + da) * d;
      if (b.place('notice_board', x, z, faceYaw(x, z, c.x, c.z), 'board', 0.5, false, true)) return;
    }
  }
}

/** Put a service building as close to the plaza as it fits, trying angles round `angle`. */
function placeService(b: Builder, asset: string, role: PlacementRole, c: { x: number; z: number }, angle: number, d0: number, d1: number): void {
  for (let d = d0; d <= d1; d += 3) {
    for (const da of [0, 0.25, -0.25, 0.5, -0.5, 0.8, -0.8]) {
      const a = angle + da;
      const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
      if (b.place(asset, x, z, faceYaw(x, z, c.x, c.z), role)) {
        b.npcAtDoor(b.placements[b.placements.length - 1], role === 'pokecenter' ? 'nurse' : role === 'mart' ? 'clerk' : 'innkeeper');
        return;
      }
    }
  }
}

function smallVillage(b: Builder, entries: number[]): void {
  const s = b.s;
  const c = { x: s.x, z: s.z };
  b.plazas.push({ x: c.x, z: c.z, r: 8 });
  b.place(CENTREPIECE[s.style], c.x, c.z, b.rnd() * Math.PI * 2, 'landmark', 0, true);
  for (const e of entries) b.streets.push({ pts: [[c.x + Math.sin(e) * 7, c.z + Math.cos(e) * 7], [c.x + Math.sin(e) * (s.r - 1), c.z + Math.cos(e) * (s.r - 1)]], width: 1.6 });
  b.fence(entries);
  const n = 6 + Math.floor(b.rnd() * 4);
  for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
    const a = b.rnd() * Math.PI * 2;
    if (entries.some((e) => Math.abs(angleDiff(e, a)) < 0.3)) continue;
    const d = s.r * (0.42 + b.rnd() * 0.3);
    const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    if (b.place(b.house(s.style, b.rnd() < 0.15), x, z, faceYaw(x, z, c.x, c.z) + (b.rnd() - 0.5) * 0.4, 'house')) i++;
  }
  const board = entries[0] ?? 0;
  placeBoard(b, c, board + 0.6, 11);
  b.place(['stall_red', 'stall_blue', 'stall_green'][Math.floor(b.rnd() * 3)], c.x + Math.sin(board - 0.9) * 12, c.z + Math.cos(board - 0.9) * 12, faceYaw(c.x + Math.sin(board - 0.9) * 12, c.z + Math.cos(board - 0.9) * 12, c.x, c.z), 'stall', 0.6);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.place('lamp_post', c.x + Math.sin(a) * 9.5, c.z + Math.cos(a) * 9.5, 0, 'lamp', 0.3);
  }
  b.props(4, c, 12, s.r * 0.75);
  b.npcRing(3 + Math.floor(b.rnd() * 2), c.x, c.z, 9, 16);
  b.npcs.push({ x: c.x + 3, z: c.z + 3, yaw: 0, role: 'elder' });
}

function mediumTown(b: Builder, entries: number[]): void {
  const s = b.s;
  const axis = entries[0] ?? b.rnd() * Math.PI * 2;
  const ax = Math.sin(axis), az = Math.cos(axis);
  const px = az, pz = -ax;
  const c = { x: s.x, z: s.z };
  const L = s.r - 3;
  const main: Street = { pts: [[c.x - ax * L, c.z - az * L], [c.x + ax * L, c.z + az * L]], width: 3.2 };
  const cross: Street = { pts: [[c.x - px * L * 0.7, c.z - pz * L * 0.7], [c.x + px * L * 0.7, c.z + pz * L * 0.7]], width: 2.4 };
  b.streets.push(main, cross);
  for (const e of entries.slice(1)) b.streets.push({ pts: [[c.x + Math.sin(e) * 14, c.z + Math.cos(e) * 14], [c.x + Math.sin(e) * L, c.z + Math.cos(e) * L]], width: 2.0 });
  b.plazas.push({ x: c.x, z: c.z, r: 13 });
  b.place('fountain', c.x, c.z, 0, 'landmark', 0, true);
  // Services face the plaza from its corners.
  const services: [string, PlacementRole][] = [['pokecenter', 'pokecenter'], ['mart', 'mart'], ['inn', 'inn']];
  services.forEach(([asset, role], k) => placeService(b, asset, role, c, axis + Math.PI / 4 + (k * Math.PI) / 2, 22, 52));
  placeBoard(b, c, axis + Math.PI / 4 + (3 * Math.PI) / 2, 16);
  for (let k = 0; k < 3; k++) {
    const a = axis + 0.3 + k * 0.5;
    b.place(['stall_red', 'stall_blue', 'stall_green'][k], c.x + Math.sin(a + Math.PI) * 10, c.z + Math.cos(a + Math.PI) * 10, faceYaw(c.x + Math.sin(a + Math.PI) * 10, c.z + Math.cos(a + Math.PI) * 10, c.x, c.z), 'stall', 0.6, false, true);
  }
  b.lineStreet(main.pts[0], [c.x - ax * 15, c.z - az * 15], main.width, 0.3);
  b.lineStreet([c.x + ax * 15, c.z + az * 15], main.pts[1], main.width, 0.3);
  b.lineStreet(cross.pts[0], [c.x - px * 15, c.z - pz * 15], cross.width, 0.2);
  b.lineStreet([c.x + px * 15, c.z + pz * 15], cross.pts[1], cross.width, 0.2);
  b.lamps(main.pts, main.width, 18);
  if (s.style === 'stone' || s.style === 'castle' || s.style === 'basalt') b.fence(entries.length ? entries : [axis, axis + Math.PI]);
  else for (const e of (entries.length ? entries : [axis])) {
    const x = c.x + Math.sin(e) * (s.r - 3), z = c.z + Math.cos(e) * (s.r - 3);
    b.place('gate_arch', x, z, e, 'gate', 0, true);
  }
  b.props(8, c, 16, s.r * 0.8);
  b.npcRing(7 + Math.floor(b.rnd() * 4), c.x, c.z, 10, s.r * 0.6);
  b.npcs.push({ x: c.x + ax * 9, z: c.z + az * 9, yaw: axis + Math.PI, role: 'elder' });
}

function largeCity(b: Builder, entries: number[]): void {
  const s = b.s;
  const axis = entries[0] ?? b.rnd() * Math.PI * 2;
  const ax = Math.sin(axis), az = Math.cos(axis);
  const px = az, pz = -ax;
  const c = { x: s.x, z: s.z };
  const L = s.r - 4;
  const off = s.r * 0.42;
  const main: Street = { pts: [[c.x - ax * L, c.z - az * L], [c.x + ax * L, c.z + az * L]], width: 4.2 };
  b.streets.push(main);
  const sides: Street[] = [-1, 1].map((k) => ({ pts: [[c.x - ax * L * 0.8 + px * off * k, c.z - az * L * 0.8 + pz * off * k], [c.x + ax * L * 0.8 + px * off * k, c.z + az * L * 0.8 + pz * off * k]] as P2[], width: 3.0 }));
  const crosses: Street[] = [-0.55, 0, 0.55].map((t) => ({ pts: [[c.x + ax * L * t - px * L * 0.85, c.z + az * L * t - pz * L * 0.85], [c.x + ax * L * t + px * L * 0.85, c.z + az * L * t + pz * L * 0.85]] as P2[], width: t === 0 ? 3.6 : 2.8 }));
  b.streets.push(...sides, ...crosses);
  for (const e of entries.slice(1)) b.streets.push({ pts: [[c.x + Math.sin(e) * 22, c.z + Math.cos(e) * 22], [c.x + Math.sin(e) * L, c.z + Math.cos(e) * L]], width: 2.6 });
  b.plazas.push({ x: c.x, z: c.z, r: 20 });
  // Landmarks: the gym (or the tower, or the League) at the head of the main avenue.
  const head = { x: c.x - ax * s.r * 0.6, z: c.z - az * s.r * 0.6 };
  if (s.gym) {
    b.place(GYM_ASSET[s.gym.type], head.x, head.z, faceYaw(head.x, head.z, c.x, c.z), 'gym', 1, true);
    b.npcAtDoor(b.placements[b.placements.length - 1], 'guide', 4.5);
  } else if (s.id === 'tornhavn') {
    b.place('battle_tower', head.x, head.z, faceYaw(head.x, head.z, c.x, c.z), 'tower', 1, true);
    b.npcAtDoor(b.placements[b.placements.length - 1], 'guide', 2);
  } else if (s.id === 'crownspire') {
    const k = { x: c.x - ax * s.r * 0.48, z: c.z - az * s.r * 0.48 };
    b.place('league_castle', k.x, k.z, faceYaw(k.x, k.z, c.x, c.z), 'league', 1, true);
    b.npcAtDoor(b.placements[b.placements.length - 1], 'guard', 3);
  }
  b.place('fountain', c.x, c.z, 0, 'landmark', 0, true);
  for (let k = 0; k < 7; k++) {
    const a = axis + Math.PI * 0.25 + (k / 7) * Math.PI * 1.5;
    const x = c.x + Math.sin(a) * 15, z = c.z + Math.cos(a) * 15;
    b.place(['stall_red', 'stall_blue', 'stall_green'][k % 3], x, z, faceYaw(x, z, c.x, c.z), 'stall', 0.4, false, true);
  }
  const services: [string, PlacementRole, number][] = [['pokecenter', 'pokecenter', 0.5], ['mart', 'mart', -0.5], ['inn', 'inn', 2.6]];
  for (const [asset, role, ang] of services) placeService(b, asset, role, c, axis + Math.PI + ang, 28, 70);
  const landmark = s.style === 'harbour' ? 'lighthouse' : s.style === 'meadow' || s.style === 'timber' ? 'windmill' : 'watchtower';
  for (let tries = 0; tries < 20; tries++) {
    const a = axis + Math.PI / 2 + (b.rnd() - 0.5) * 1.2 + (tries % 2) * Math.PI;
    const d = s.r * (0.65 + b.rnd() * 0.15);
    if (b.place(landmark, c.x + Math.sin(a) * d, c.z + Math.cos(a) * d, b.rnd() * Math.PI * 2, 'landmark')) break;
  }
  placeBoard(b, c, Math.atan2(px, pz), 22);
  for (const st of b.streets.slice()) {
    const [p0, p1] = [st.pts[0], st.pts[st.pts.length - 1]];
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2;
    const near = Math.hypot(mx - c.x, mz - c.z) < 1;
    if (near) {
      // Streets through the plaza are lined either side of it.
      const dx = p1[0] - p0[0], dz = p1[1] - p0[1], l = Math.hypot(dx, dz);
      b.lineStreet(p0, [c.x - (dx / l) * 24, c.z - (dz / l) * 24], st.width, 0.45, 2.2, 0.62);
      b.lineStreet([c.x + (dx / l) * 24, c.z + (dz / l) * 24], p1, st.width, 0.45, 2.2, 0.62);
    } else b.lineStreet(p0, p1, st.width, 0.45, 2.2, st.width >= 3 ? 0.5 : 0.36);
  }
  b.lamps(main.pts, main.width, 16);
  for (const st of crosses) b.lamps(st.pts, st.width, 22);
  if (s.style === 'stone' || s.style === 'castle' || s.style === 'basalt' || s.style === 'timber' || s.style === 'ice') b.fence(entries.length ? entries : [axis, axis + Math.PI]);
  else for (const e of (entries.length ? entries : [axis])) {
    const x = c.x + Math.sin(e) * (s.r - 3), z = c.z + Math.cos(e) * (s.r - 3);
    b.place('gate_arch', x, z, e, 'gate', 0, true);
  }
  b.props(14, c, 22, s.r * 0.85);
  b.npcRing(10 + Math.floor(b.rnd() * 6), c.x, c.z, 12, s.r * 0.55);
  b.npcRing(6, c.x, c.z, s.r * 0.55, s.r * 0.8);
  b.npcs.push({ x: c.x + ax * 12, z: c.z + az * 12, yaw: axis + Math.PI, role: 'elder' });
}

const cache = new Map<string, SettlementLayout>();

/** The layout of a settlement (cached). Bramblewick is hand-built and has none. */
export function layoutSettlement(s: Settlement): SettlementLayout {
  let l = cache.get(s.id);
  if (l) return l;
  const b = new Builder(s, rng(s.id));
  const entries = s.tier === 'home' ? [] : roadEntries(s);
  if (s.tier === 'small') smallVillage(b, entries);
  else if (s.tier === 'medium') mediumTown(b, entries);
  else if (s.tier === 'large') largeCity(b, entries);
  l = {
    id: s.id, placements: b.placements, streets: b.streets, plazas: b.plazas, npcs: b.npcs,
    entries: entries.map((a) => ({ x: s.x + Math.sin(a) * (s.r - 2), z: s.z + Math.cos(a) * (s.r - 2), angle: a })),
  };
  cache.set(s.id, l);
  return l;
}

/** Every settlement's layout (for tests and the map). */
export function allLayouts(): SettlementLayout[] {
  return SETTLEMENTS.filter((s) => s.tier !== 'home').map(layoutSettlement);
}

/**
 * Ground under a settlement for the terrain painter: how much path dirt, and whether a building
 * stands here (no grass). Cheap enough per terrain sample.
 */
export function settlementGround(s: Settlement, x: number, z: number): { dirt: number; built: boolean } {
  const l = layoutSettlement(s);
  let dirt = 0;
  for (const st of l.streets) {
    const d = distPoly(x, z, st.pts) - st.width;
    if (d < 1.5) dirt = Math.max(dirt, d < -0.6 ? 1 : 1 - (d + 0.6) / 2.1);
  }
  for (const p of l.plazas) {
    const d = Math.hypot(x - p.x, z - p.z) - p.r;
    if (d < 1.5) dirt = Math.max(dirt, d < -0.6 ? 1 : 1 - (d + 0.6) / 2.1);
  }
  let built = false;
  for (const p of l.placements) {
    if (p.role === 'fence' || p.role === 'lamp' || p.role === 'prop') continue;
    const f = footprint(p.asset);
    const dx = x - p.x, dz = z - p.z;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    const lx = dx * c - dz * sn - f.cx, lz = dx * sn + dz * c - f.cz;
    if (Math.abs(lx) < f.hw + 0.4 && Math.abs(lz) < f.hd + 0.4) {
      built = true;
      break;
    }
  }
  return { dirt, built };
}

/**
 * Where to stand at a settlement's service building (its door), without building the town: for
 * respawning at a Pokémon Center and for fast travel. Null if it has none.
 */
export function serviceSpot(s: Settlement, role: PlacementRole): { x: number; z: number; yaw: number } | null {
  if (s.tier === 'home') return null;
  const p = layoutSettlement(s).placements.find((q) => q.role === role);
  if (!p) return null;
  const meta = META[p.asset];
  const door = meta?.doors.find((d) => d.kind !== 'door') ?? meta?.doors[0];
  const [x, z] = door ? toWorld(p, door.x, -door.y) : toWorld(p, 0, footprint(p.asset).hd + 2);
  // Face away from the door, out into the town.
  return { x, z, yaw: p.yaw };
}
