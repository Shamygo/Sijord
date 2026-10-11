/**
 * The Sijord region (DESIGN §2): the whole island around Hearthmeadow Vale. Pure data and
 * geometry, shared by the terrain generator (main thread and workers), the game logic and tests.
 *
 * Axes as everywhere else: 1 unit = 1 m, north = +Z, east = -X (so west is +X). The hand-built
 * vale (src/client/world/layout.ts) sits in the middle of the south, about ±600 m round the
 * origin, with Bramblewick at (0, -330). Everything here lies around it; nothing in this file
 * moves or changes anything inside the vale.
 */

export type BiomeId = 'meadow' | 'elderwood' | 'fjord' | 'skerry' | 'mirefen' | 'heath' | 'peaks' | 'tundra' | 'ashen' | 'badlands';

export interface BiomeDef {
  id: BiomeId;
  /** Name shown on the HUD when you walk in. */
  name: string;
  /** Wild level band (DESIGN §3.2: wild creatures do not scale). */
  levels: [number, number];
  /** Body temperature pull: -2 freezing .. +2 scorching. */
  temp: number;
  /** One line for the map. */
  blurb: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  meadow: { id: 'meadow', name: 'Hearthmeadow', levels: [3, 16], temp: 0, blurb: 'Rolling green hills, wildflowers and stone walls.' },
  mirefen: { id: 'mirefen', name: 'Mirefen', levels: [14, 26], temp: 0, blurb: 'A misty bog of stilt walkways and sunken ruins.' },
  elderwood: { id: 'elderwood', name: 'Elderwood', levels: [11, 23], temp: 0, blurb: 'Old-growth forest under giant mossy trunks.' },
  heath: { id: 'heath', name: 'Runestone Heath', levels: [18, 30], temp: 0, blurb: 'A purple heather plateau scattered with Lysfolk megaliths.' },
  fjord: { id: 'fjord', name: 'Fjordlands', levels: [22, 34], temp: -1, blurb: 'Sheer cliffs, waterfalls and deep blue inlets.' },
  badlands: { id: 'badlands', name: 'Sunscar Badlands', levels: [20, 34], temp: 2, blurb: 'Red canyons, mesas and dry riverbeds.' },
  skerry: { id: 'skerry', name: 'Skerry Archipelago', levels: [30, 45], temp: 0, blurb: 'White beaches and kelp-ringed islands.' },
  ashen: { id: 'ashen', name: 'Ashen Highlands', levels: [35, 50], temp: 2, blurb: 'Black rock, lava channels and hot springs.' },
  tundra: { id: 'tundra', name: 'Rimefrost Tundra', levels: [40, 55], temp: -2, blurb: 'Wide snowfields and frozen lakes.' },
  peaks: { id: 'peaks', name: 'Stormcrown Peaks', levels: [55, 75], temp: -2, blurb: 'Snow-capped mountains round the League summit.' },
};

export const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];

/** The region's square (sea beyond the coast), aligned to the 160 m terrain chunk lattice. */
export const REGION = { minX: -3200, maxX: 3200, minZ: -1600, maxZ: 4800 } as const;

/** The core landmass before the coastline noise: a rounded rectangle. */
const LAND = { minX: -2880, maxX: 2600, minZ: -1240, maxZ: 4360, round: 420 } as const;

// ---------------------------------------------------------------------------------------------
// Small deterministic noise (a copy of client/world/noise so shared code has no client imports)
// ---------------------------------------------------------------------------------------------

function hash2i(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rvalue(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2i(ix, iz, seed), b = hash2i(ix + 1, iz, seed), c = hash2i(ix, iz + 1, seed), d = hash2i(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function rfbm(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * rvalue(x, z, seed + o * 31);
    norm += amp;
    amp *= 0.5;
    const nx = (x * 0.8253 - z * 0.5646) * 2.03 + 17.1;
    const nz = (x * 0.5646 + z * 0.8253) * 2.03 - 9.7;
    x = nx;
    z = nz;
  }
  return sum / norm;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------------------------
// Biomes: a soft Voronoi over hand-placed seeds, with warped borders
// ---------------------------------------------------------------------------------------------

/** Seed points per biome (x, z). Laid out after the DESIGN §2.6 map sketch. */
const BIOME_SEEDS: [BiomeId, number, number][] = [
  ['meadow', 0, 0], ['meadow', -650, 350], ['meadow', 600, -350], ['meadow', -850, -700], ['meadow', 350, 800],
  ['meadow', 0, -950], ['meadow', 950, -100], ['meadow', -1150, 250], ['meadow', 700, -950],
  ['mirefen', 1800, 600], ['mirefen', 1400, 250], ['mirefen', 2150, 150], ['mirefen', 1500, -600], ['mirefen', 1950, -300],
  ['elderwood', 1450, 2050], ['elderwood', 900, 2250], ['elderwood', 1900, 1650], ['elderwood', 1250, 2650], ['elderwood', 1150, 1550],
  ['heath', 250, 1500], ['heath', -450, 1450], ['heath', -950, 1700], ['heath', 600, 1800], ['heath', -300, 1950], ['heath', -1250, 1250],
  ['peaks', 500, 2950], ['peaks', -250, 2800], ['peaks', -950, 2950], ['peaks', -600, 3300], ['peaks', 200, 3350], ['peaks', -1400, 3200], ['peaks', 900, 3300],
  ['tundra', 2000, 4050], ['tundra', 600, 4150], ['tundra', -800, 4100], ['tundra', -2200, 3950], ['tundra', 1300, 3900], ['tundra', -1600, 4150],
  ['fjord', 2500, 3150], ['fjord', 2450, 2350], ['fjord', 2500, 1450], ['fjord', 2050, 2900],
  ['ashen', -2000, 2450], ['ashen', -2550, 2050], ['ashen', -1650, 2100], ['ashen', -2500, 2850], ['ashen', -2050, 3050],
  ['badlands', -2100, 450], ['badlands', -2450, -150], ['badlands', -1650, -550], ['badlands', -2050, 1000], ['badlands', -1500, -1000],
  ['skerry', 2850, -200], ['skerry', 2650, -900], ['skerry', 3000, 550], ['skerry', 2350, -1100],
];

/** Index of each biome, for compact weight arrays. */
export const BIOME_INDEX: Record<BiomeId, number> = Object.fromEntries(BIOME_IDS.map((b, i) => [b, i])) as Record<BiomeId, number>;

/** How sharp biome borders are: a larger softness blends over a wider band. */
const BIOME_SOFT = 85;

/**
 * Biome weights at a point (summing to 1), written into `out` by BIOME_INDEX. Borders are
 * warped by noise so they wander instead of running straight.
 */
export function biomeWeights(x: number, z: number, out: Float32Array = new Float32Array(BIOME_IDS.length)): Float32Array {
  const wx = x + (rfbm(x / 520, z / 520, 2, 811) - 0.5) * 360;
  const wz = z + (rfbm(x / 520 + 9.3, z / 520 - 4.1, 2, 812) - 0.5) * 360;
  out.fill(0);
  let dmin = Infinity;
  const d: number[] = BIOME_SEEDS.map(([, sx, sz]) => {
    const v = Math.hypot(wx - sx, wz - sz);
    if (v < dmin) dmin = v;
    return v;
  });
  let total = 0;
  for (let i = 0; i < BIOME_SEEDS.length; i++) {
    const k = d[i] - dmin;
    if (k > BIOME_SOFT * 6) continue;
    const w = Math.exp(-k / BIOME_SOFT);
    out[BIOME_INDEX[BIOME_SEEDS[i][0]]] += w;
    total += w;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

const tmpW = new Float32Array(BIOME_IDS.length);

/** The dominant biome at a point. */
export function biomeAt(x: number, z: number): BiomeId {
  const w = biomeWeights(x, z, tmpW);
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
  return BIOME_IDS[best];
}

// ---------------------------------------------------------------------------------------------
// Coast, fjords and islands
// ---------------------------------------------------------------------------------------------

/** Signed distance to the landmass rectangle's edge: positive inside (metres, approximate). */
function landRectDist(x: number, z: number): number {
  const cx = (LAND.minX + LAND.maxX) / 2, cz = (LAND.minZ + LAND.maxZ) / 2;
  const hx = (LAND.maxX - LAND.minX) / 2 - LAND.round, hz = (LAND.maxZ - LAND.minZ) / 2 - LAND.round;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  return LAND.round - outside;
}

export type P2 = [number, number];

/** Sea inlets cut into the west coast (DESIGN §2.2 B3). Each runs from open sea inland. */
export const FJORDS: { pts: P2[]; width: number }[] = [
  { pts: [[3150, 3520], [2780, 3470], [2420, 3420], [2120, 3330], [1960, 3230]], width: 46 },
  { pts: [[3150, 2560], [2800, 2600], [2520, 2640], [2370, 2620]], width: 58 },
  { pts: [[3150, 1980], [2830, 1930], [2560, 1990], [2330, 2100]], width: 38 },
];

/** Islands of the Skerry Archipelago and Tornhavn (x, z, radius). */
export const ISLANDS: [number, number, number][] = [
  [2850, 320, 230], [2700, -800, 150], [3020, -320, 110], [2480, -1150, 120], [3060, 1060, 90], [2620, -420, 80], [2350, -1450, 70],
];

/**
 * Signed coast distance: positive on land, negative at sea (metres, approximate). Includes
 * the fjords (sea) and the islands (land).
 */
export function coastDist(x: number, z: number): number {
  // Warp the rectangle so the coast wanders into bays and headlands.
  const wx = x + (rfbm(x / 900, z / 900, 2, 906) - 0.5) * 700;
  const wz = z + (rfbm(x / 900 + 3.7, z / 900 - 1.3, 2, 907) - 0.5) * 700;
  let d = landRectDist(wx, wz);
  d += (rfbm(x / 520, z / 520, 3, 901) - 0.5) * 520 + (rfbm(x / 160, z / 160, 2, 908) - 0.5) * 150 + (rfbm(x / 60, z / 60, 2, 902) - 0.5) * 40;
  // Roads keep a strip of dry land under them (a causeway where they hug the coast).
  const rd = roadIndex.edgeDist(x, z).d;
  if (rd < 40) d = Math.max(d, 26 - rd * 0.65);

  // The south-west breaks up into the archipelago: the mainland ends further east there.
  if (x > 1900 && z < 760) d = Math.min(d, 2350 - x + (z - 760) * -0.1 + (rfbm(x / 200, z / 200, 2, 905) - 0.5) * 160);
  for (const f of FJORDS) {
    const fd = distToPolyline(x, z, f.pts) - f.width - (rfbm(x / 70, z / 70, 2, 903) - 0.5) * 30;
    if (fd < 0) d = Math.min(d, fd);
    else d = Math.min(d, fd * 1.0 + 0.0001);
  }
  for (const [ix, iz, r] of ISLANDS) {
    const id = r - Math.hypot(x - ix, z - iz) + (rfbm(x / 60, z / 60, 2, 904) - 0.5) * r * 0.5;
    if (id > d) d = id;
  }
  // Every settlement stands on dry land: harbours reach the water's edge, the rest stay well back.
  for (const s of SETTLEMENTS) {
    const k = s.r + (s.style === 'harbour' ? 24 : 160) - Math.hypot(x - s.x, z - s.z);
    if (k > d) d = k;
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Rivers (sea level), lava channels and lakes
// ---------------------------------------------------------------------------------------------

export interface River {
  id: string;
  name: string;
  pts: P2[];
  /** Half width of the water. */
  width: number;
}

/**
 * Rivers outside the vale. The Hearth River's middle stretch is the vale's own river
 * (layout.ts RIVER_IN / RIVER_OUT); these continue it upstream and down to the sea.
 */
export const RIVERS: River[] = [
  { id: 'hearth-upper', name: 'Hearth River', pts: [[-720, 1120], [-650, 920], [-590, 760], [-560, 700]], width: 6 },
  { id: 'hearth-lower', name: 'Hearth River', pts: [[-470, -700], [-540, -900], [-600, -1080], [-640, -1260], [-660, -1500]], width: 9 },
  { id: 'elder', name: 'Elder River', pts: [[1150, 2380], [1580, 2100], [1790, 1700], [1720, 1010], [2050, 700], [2420, 480], [2600, 620], [2800, 690], [3150, 700]], width: 8 },
  { id: 'rime', name: 'Rime River', pts: [[-420, 3620], [-480, 3860], [-430, 4120], [-380, 4500]], width: 7 },
  { id: 'kettle', name: 'Kettle Water', pts: [[1520, 3060], [1680, 3110], [1840, 3160], [1960, 3230]], width: 6 },
];

/** Lava channels in the Ashen Highlands (painted and hot, not water). */
export const LAVA: { pts: P2[]; width: number }[] = [
  { pts: [[-2380, 2620], [-2250, 2420], [-2120, 2250], [-2180, 2020], [-2420, 1880]], width: 5 },
  { pts: [[-2380, 2620], [-2600, 2480], [-2720, 2300]], width: 4 },
];

/** The volcano whose crater feeds the lava (x, z, base radius, height). */
export const VOLCANO = { x: -2400, z: 2650, r: 520, h: 360, crater: 70 };

export interface Lake {
  name: string;
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Frozen over (drawn as ice, walkable). */
  frozen?: boolean;
}

/** Lakes at sea level outside the vale. */
export const LAKES: Lake[] = [
  { name: 'Hollowmere', x: 1000, z: -570, rx: 95, rz: 62 },
  { name: 'Stillwater', x: 1520, z: -760, rx: 70, rz: 50 },
  { name: 'Rimeglass', x: 650, z: 3950, rx: 120, rz: 70, frozen: true },
  { name: 'Frostmirror', x: -1050, z: 4120, rx: 95, rz: 60, frozen: true },
  { name: 'Whitewater', x: 1650, z: 4200, rx: 80, rz: 55, frozen: true },
  { name: 'Brightwater Tarn', x: -470, z: 1100, rx: 55, rz: 40 },
];

/** Signed distance to the nearest region lake (negative inside). */
export function lakeDistRegion(x: number, z: number): { d: number; lake: Lake | null } {
  let best = Infinity;
  let lake: Lake | null = null;
  for (const l of LAKES) {
    const nx = (x - l.x) / l.rx, nz = (z - l.z) / l.rz;
    if (Math.abs(nx) > 4 || Math.abs(nz) > 4) continue;
    const d = (Math.hypot(nx, nz) - 1) * Math.min(l.rx, l.rz);
    if (d < best) {
      best = d;
      lake = l;
    }
  }
  return { d: best, lake };
}

// ---------------------------------------------------------------------------------------------
// Settlements (DESIGN §2.3-2.5)
// ---------------------------------------------------------------------------------------------

export type SettlementTier = 'home' | 'small' | 'medium' | 'large';
export type SettlementStyle = 'meadow' | 'timber' | 'stilt' | 'stone' | 'ice' | 'adobe' | 'basalt' | 'harbour' | 'castle';
export type GymType = 'bug' | 'water' | 'fire' | 'electric' | 'ground' | 'ice' | 'psychic' | 'ghost' | 'fairy' | 'steel';

export interface GymDef {
  type: GymType;
  leader: string;
  /** Leader's title line. */
  title: string;
  /** The co-op puzzle's name (DESIGN §13.2). */
  puzzle: string;
}

export interface Settlement {
  id: string;
  name: string;
  tier: SettlementTier;
  x: number;
  z: number;
  /** Boundary radius: no building inside, no wild spawns, name shown on entry. */
  r: number;
  style: SettlementStyle;
  /** Shown under the name on entry. */
  tagline: string;
  gym?: GymDef;
  /** Hard progression lock (DESIGN §1.1): only Tornhavn and Crownspire have one. */
  lock?: { badges: number; what: string };
  /** The village's one memorable quirk (DESIGN §2.5, §12). */
  quirk?: string;
}

const L = (id: string, name: string, x: number, z: number, r: number, style: SettlementStyle, tagline: string, extra: Partial<Settlement> = {}): Settlement =>
  ({ id, name, tier: 'large', x, z, r, style, tagline, ...extra });
const M = (id: string, name: string, x: number, z: number, style: SettlementStyle, tagline: string, quirk?: string): Settlement =>
  ({ id, name, tier: 'medium', x, z, r: 92, style, tagline, quirk });
const S = (id: string, name: string, x: number, z: number, style: SettlementStyle, quirk: string): Settlement =>
  ({ id, name, tier: 'small', x, z, r: 50, style, tagline: 'A small village', quirk });

export const SETTLEMENTS: Settlement[] = [
  { id: 'bramblewick', name: 'Bramblewick', tier: 'home', x: 0, z: -330, r: 55, style: 'meadow', tagline: 'Your hometown' },
  // ---- the twelve large cities ----
  L('verdhavn', 'Verdhavn', 1350, 1700, 165, 'timber', 'City of hives and greenhouses', { gym: { type: 'bug', leader: 'Siv', title: 'Beekeeper-botanist', puzzle: 'Hive Signals' } }),
  L('skarsund', 'Skarsund', 2240, 2600, 170, 'harbour', 'The great fjord port', { gym: { type: 'water', leader: 'Bjorn', title: 'Ferry captain', puzzle: 'Lock and Sluice' } }),
  L('emberholt', 'Emberholt', -1850, 2250, 165, 'basalt', 'Smithing city under the volcano', { gym: { type: 'fire', leader: 'Ingrid', title: 'Master smith', puzzle: 'Bellows and Vents' } }),
  L('voltavik', 'Voltavik', -1950, 3380, 160, 'stone', 'Wind-and-water power city', { gym: { type: 'electric', leader: 'Teo', title: 'Turbine engineer', puzzle: 'Split Circuit' } }),
  L('grusdal', 'Grusdal', -1800, -250, 165, 'adobe', 'Canyon mining city', { gym: { type: 'ground', leader: 'Asta', title: 'Canyon guide', puzzle: 'Counterweight Canyon' } }),
  L('isfjell', 'Isfjell', 2150, 3950, 160, 'ice', 'Ice-harbour city of the far north', { gym: { type: 'ice', leader: 'Eira', title: 'Figure skater', puzzle: 'Human Stopper' } }),
  L('runeby', 'Runeby', 250, 1350, 170, 'stone', 'University town of the Lysfolk scholars', { gym: { type: 'psychic', leader: 'Odd', title: 'Ruin linguist', puzzle: 'Mirror Minds' } }),
  L('myrkvald', 'Myrkvald', 1750, 330, 160, 'stilt', 'Lantern-lit stilt city', { gym: { type: 'ghost', leader: 'Vesla', title: 'Lantern-keeper', puzzle: 'Lantern and Shade' } }),
  L('blomstad', 'Blomstad', -1050, 320, 160, 'meadow', 'Flower-terrace spa city', { gym: { type: 'fairy', leader: 'Liv', title: 'Garden designer', puzzle: 'Two-Part Melody' } }),
  L('jernhamn', 'Jernhamn', -2350, 1150, 175, 'basalt', 'Industrial city, home of Krane Industries', { gym: { type: 'steel', leader: 'Magnus', title: 'Automation engineer', puzzle: 'Conveyor Foundry' } }),
  L('tornhavn', 'Tornhavn', 2850, 320, 130, 'harbour', 'Island city of the Battle Tower', { lock: { badges: 5, what: 'the Battle Tower' } }),
  L('crownspire', 'Crownspire', -250, 2850, 140, 'castle', 'Seat of the Sijord League', { lock: { badges: 10, what: 'the Victory Gate' } }),
  // ---- sixteen medium towns ----
  M('lyngmark', 'Lyngmark', 150, 900, 'meadow', 'Market town on the north road'),
  M('saltvik', 'Saltvik', 700, -1060, 'harbour', 'Fishing town on the southern sea'),
  M('hollowmere', 'Hollowmere', 1150, -380, 'timber', 'Lakeside town of boatwrights'),
  M('fernbrook', 'Fernbrook', 800, 2250, 'timber', 'Woodcutters\' town in the Elderwood'),
  M('kettlefoss', 'Kettlefoss', 1760, 3420, 'stone', 'Town at the foot of the great waterfall'),
  M('coppergill', 'Coppergill', -1350, 1550, 'stone', 'Copper-mining town'),
  M('ravnsby', 'Ravnsby', -650, 1950, 'stone', 'Town of ravens and standing stones'),
  M('stillwater', 'Stillwater Landing', 1650, -880, 'stilt', 'Landing on the quiet lakes'),
  M('mossbridge', 'Mossbridge', 1960, 1180, 'stilt', 'Town of mossy footbridges'),
  M('thornfield', 'Thornfield', -800, -650, 'meadow', 'Farming town of hedgerows'),
  M('gullhaven', 'Gullhaven', 2480, 1650, 'harbour', 'Cliff-top harbour of the gulls'),
  M('cinderbank', 'Cinderbank', -2500, 700, 'adobe', 'Town on the cinder flats'),
  M('duneholt', 'Duneholt', -1450, -950, 'adobe', 'Oasis town in the dunes'),
  M('frostgate', 'Frostgate', -1400, 4000, 'ice', 'Gate town of the tundra'),
  M('lanternwell', 'Lanternwell', 450, 2050, 'stone', 'Town of the ever-lit well'),
  M('oldharbour', 'Old Harbour', -800, -1100, 'harbour', 'The oldest port in Sijord'),
  // ---- small villages (Bramblewick is the 28th) ----
  S('pinecrest', 'Pinecrest', -220, -1010, 'meadow', 'Everyone here speaks only in rhymes.'),
  S('mudsock', 'Mudsock', 2250, 760, 'stilt', 'Its fence keeps getting eaten, and no one knows by what.'),
  S('hearthsend', "Hearth's End", 950, 150, 'meadow', 'The villagers worship a very ordinary Wooloo.'),
  S('wrensrest', "Wren's Rest", 1250, 2560, 'timber', 'Every roof has a birdhouse, and every birdhouse has a tenant.'),
  S('tallowfen', 'Tallowfen', 1450, -150, 'stilt', 'Candle-makers who will not light a candle.'),
  S('sheepcross', 'Sheepcross', -750, 850, 'meadow', 'The sheep outnumber the people forty to one.'),
  S('glimmerhollow', 'Glimmerhollow', 1950, 2060, 'timber', 'Glowing mushrooms light the lanes at night.'),
  S('barrowfield', 'Barrowfield', -200, 1850, 'stone', 'Built among old barrows, very politely.'),
  S('owlgate', 'Owlgate', 800, 1600, 'timber', 'Nobody sleeps before dawn.'),
  S('sorrel', 'Sorrel', -1350, -250, 'adobe', 'A village that holds a soup contest every single day.'),
  S('kelpstrand', 'Kelpstrand', 2500, 950, 'harbour', 'They dry kelp on every railing.'),
  S('emberstead', 'Emberstead', -2600, 2750, 'basalt', 'Cooks everything on the warm ground.'),
  S('ridgehut', 'Ridge Hut', 650, 3150, 'stone', 'A mountain hut that insists it is a village.'),
  S('lastlight', 'Last Light', 100, 4200, 'ice', 'The last lamp before the edge of the world.'),
  S('cairnstead', 'Cairnstead', -1200, 1100, 'stone', 'Adds one stone to a cairn for every visitor.'),
  S('frostmoor', 'Frostmoor', 1000, 3950, 'ice', 'Ice fishers who have never caught a fish.'),
  S('skyrest', 'Skyrest', -1350, 3150, 'stone', 'Everyone keeps a bird for sending messages.'),
  S('saltmarsh', 'Saltmarsh', 1700, -1150, 'harbour', 'Salt pans and very salty opinions.'),
  S('driftwood', 'Driftwood', 2700, -800, 'harbour', 'Every house is built from shipwrecks.'),
  S('redrock', 'Redrock', -2550, -650, 'adobe', 'The village paints itself a new colour each year.'),
  S('ashfall', 'Ashfall', -1450, 2650, 'basalt', 'Sweeps the ash off its roofs every morning, cheerfully.'),
  S('fjordhook', 'Fjordhook', 2560, 3660, 'harbour', 'Hangs off the cliff on ropes and pegs.'),
  S('glaciergate', 'Glacier Gate', -2300, 4150, 'ice', 'Guards a glacier that nobody wants to cross.'),
  S('brightwater', 'Brightwater', -480, 1250, 'meadow', 'Swims in the tarn every morning, even in winter.'),
  S('hollowstone', 'Hollowstone', -650, 2350, 'stone', 'Lives inside a hollow standing stone.'),
  S('ironfold', 'Ironfold', -2700, 1650, 'basalt', 'Sheepdogs in iron collars herd the goats.'),
  S('willowmere', 'Willowmere', 1050, 700, 'meadow', 'The willows here are said to whisper gossip.'),
];

export const SETTLEMENT_BY_ID: Record<string, Settlement> = Object.fromEntries(SETTLEMENTS.map((s) => [s.id, s]));

/** The plateau a settlement's ground is levelled to, and how far the levelling reaches. */
export function settlementBlendR(s: Settlement): number {
  return s.tier === 'large' ? s.r * 1.45 + 30 : s.tier === 'medium' ? s.r * 1.6 + 25 : s.r * 1.8 + 20;
}

/** The settlement whose boundary contains a point, if any. */
export function settlementAt(x: number, z: number, pad = 0): Settlement | null {
  for (const s of SETTLEMENTS) {
    const dx = x - s.x, dz = z - s.z;
    const r = s.r + pad;
    if (dx * dx + dz * dz < r * r) return s;
  }
  return null;
}

/** Nearest settlement and its distance (to the centre). */
export function nearestSettlement(x: number, z: number, filter?: (s: Settlement) => boolean): { s: Settlement; d: number } {
  let best = SETTLEMENTS[0];
  let bd = Infinity;
  for (const s of SETTLEMENTS) {
    if (filter && !filter(s)) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return { s: best, d: bd };
}

/** True where building is forbidden (DESIGN §6.5): inside any settlement boundary. */
export function inNoBuildZone(x: number, z: number): boolean {
  return settlementAt(x, z, 4) !== null;
}

// ---------------------------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------------------------

export interface Road {
  id: string;
  pts: P2[];
  width: number;
}

/**
 * The region's road network. Roads start at the vale's own roads (or the vale edge) and run
 * between settlements; they end at each settlement's edge, where its own streets take over.
 * Waypoints are hand-placed to skirt rivers, lakes and the vale's mesas.
 */
const ROAD_DEFS: [string, P2[], number?][] = [
  // From the vale: north out of Route 1, east past the bridge, and south-west from the campsite.
  ['north-road', [[45, 120], [26, 300], [16, 470], [55, 640], [120, 820]], 2.6],
  ['lyngmark-runeby', [[170, 990], [205, 1100], [235, 1180]]],
  ['east-road', [[-520, 60], [-700, 190], [-890, 270]], 2.4],
  ['south-road', [[-330, -4], [-410, -250], [-520, -520], [-700, -620]], 2.2],
  ['thornfield-oldharbour', [[-790, -742], [-790, -900], [-800, -1008]]],
  ['west-road', [[126, -258], [300, -400], [500, -560], [760, -500], [1060, -390]], 2.2],
  ['saltvik-road', [[500, -560], [600, -760], [690, -968]]],
  ['pinecrest-road', [[600, -760], [300, -900], [40, -980], [-170, -1005]]],
  ['hollowmere-tallowfen', [[1240, -360], [1350, -260], [1410, -190]]],
  ['tallowfen-myrkvald', [[1480, -110], [1600, 80], [1700, 175]]],
  ['hollowmere-stillwater', [[1200, -470], [1400, -650], [1580, -810]]],
  ['stillwater-saltmarsh', [[1660, -972], [1690, -1100]]],
  ['hearthsend-road', [[760, -500], [880, -250], [940, 100]]],
  ['willowmere-road', [[940, 200], [1000, 450], [1040, 650]]],
  // Mirefen and the west coast.
  ['myrkvald-mudsock', [[1880, 470], [2080, 600], [2205, 725]]],
  ['mudsock-kelpstrand', [[2295, 790], [2420, 880], [2470, 910]]],
  ['kelpstrand-gullhaven', [[2510, 1000], [2520, 1250], [2495, 1558]]],
  ['mudsock-mossbridge', [[2230, 810], [2120, 960], [2010, 1100]]],
  ['mossbridge-verdhavn', [[1910, 1260], [1700, 1450], [1500, 1600]]],
  // Heath, Elderwood and the north-west.
  ['runeby-owlgate', [[400, 1450], [600, 1530], [755, 1585]]],
  ['owlgate-verdhavn', [[850, 1615], [1050, 1650], [1188, 1675]]],
  ['verdhavn-glimmer', [[1510, 1760], [1750, 1900], [1905, 2030]]],
  ['glimmer-skarsund', [[1985, 2110], [2080, 2300], [2160, 2445]]],
  ['runeby-lanternwell', [[300, 1515], [380, 1750], [430, 1958]]],
  ['lanternwell-fernbrook', [[540, 2070], [680, 2160], [715, 2205]]],
  ['fernbrook-wrensrest', [[885, 2300], [1050, 2430], [1205, 2530]]],
  ['wrensrest-verdhavn', [[1260, 2510], [1300, 2150], [1330, 1865]]],
  ['skarsund-kettlefoss', [[2180, 2765], [2020, 3000], [1880, 3200], [1790, 3330]]],
  ['kettlefoss-fjordhook', [[1850, 3460], [2200, 3600], [2510, 3655]]],
  ['kettlefoss-isfjell', [[1810, 3500], [1990, 3680], [2110, 3792]]],
  ['isfjell-frostmoor', [[1990, 3960], [1500, 3990], [1050, 3955]]],
  ['frostmoor-lastlight', [[950, 3970], [500, 4100], [150, 4190]]],
  ['lastlight-frostgate', [[50, 4200], [-500, 4100], [-1305, 4010]]],
  ['frostgate-glaciergate', [[-1495, 4020], [-1900, 4100], [-2250, 4140]]],
  ['fernbrook-ridgehut', [[790, 2340], [720, 2700], [660, 3105]]],
  ['ridgehut-frostmoor', [[680, 3195], [850, 3550], [985, 3900]]],
  // League road: Runeby, Barrowfield, Ravnsby, Hollowstone, then Victory Road up to Crownspire.
  ['runeby-barrowfield', [[150, 1490], [0, 1700], [-160, 1820]]],
  ['barrowfield-ravnsby', [[-250, 1860], [-450, 1910], [-560, 1930]]],
  ['ravnsby-hollowstone', [[-650, 2040], [-660, 2200], [-650, 2305]]],
  ['victory-road', [[-620, 2390], [-520, 2560], [-400, 2690], [-320, 2730]], 2.8],
  // East: Blomstad, the badlands and the highlands.
  ['blomstad-sorrel', [[-1120, 175], [-1250, -50], [-1325, -205]]],
  ['sorrel-grusdal', [[-1400, -250], [-1550, -250], [-1635, -250]]],
  ['grusdal-duneholt', [[-1720, -395], [-1580, -700], [-1490, -862]]],
  ['grusdal-redrock', [[-1930, -350], [-2250, -520], [-2510, -630]]],
  ['grusdal-cinderbank', [[-1880, -105], [-2200, 300], [-2440, 620]]],
  ['cinderbank-jernhamn', [[-2480, 792], [-2420, 900], [-2380, 978]]],
  ['jernhamn-ironfold', [[-2450, 1290], [-2600, 1500], [-2680, 1605]]],
  ['ironfold-emberholt', [[-2650, 1700], [-2300, 1950], [-1985, 2150]]],
  ['blomstad-cairnstead', [[-1080, 480], [-1150, 800], [-1190, 1052]]],
  ['cairnstead-coppergill', [[-1230, 1145], [-1300, 1350], [-1340, 1460]]],
  ['coppergill-emberholt', [[-1410, 1625], [-1600, 1900], [-1730, 2125]]],
  ['emberholt-ashfall', [[-1760, 2385], [-1600, 2550], [-1495, 2615]]],
  ['ashfall-skyrest', [[-1430, 2700], [-1390, 2900], [-1360, 3105]]],
  ['skyrest-voltavik', [[-1395, 3165], [-1650, 3270], [-1800, 3320]]],
  ['voltavik-frostgate', [[-1880, 3525], [-1650, 3800], [-1460, 3920]]],
  ['emberholt-emberstead', [[-1990, 2340], [-2300, 2600], [-2565, 2725]]],
  ['runeby-brightwater', [[85, 1310], [-200, 1260], [-430, 1250]]],
  ['brightwater-cairnstead', [[-530, 1240], [-850, 1170], [-1150, 1110]]],
  ['blomstad-sheepcross', [[-960, 455], [-850, 650], [-770, 805]]],
  ['sheepcross-cairnstead', [[-790, 890], [-1000, 1000], [-1155, 1080]]],
  ['oldharbour-duneholt', [[-890, -1080], [-1150, -1020], [-1405, -965]]],
  ['thornfield-sorrel', [[-885, -605], [-1150, -430], [-1310, -290]]],
];

export const REGION_ROADS: Road[] = ROAD_DEFS.map(([id, pts, w]) => ({ id, pts: wiggle(pts, id), width: w ?? 2.0 }));

/** Roads bend a little between waypoints so they don't look ruled (deterministic per road). */
function wiggle(pts: P2[], id: string): P2[] {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
  const out: P2[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 45));
    const px = -(bz - az) / len, pz = (bx - ax) / len;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const env = Math.sin(t * Math.PI);
      const off = (rfbm(t * len / 140, i * 7.1, 2, seed & 0xffff) - 0.5) * 2 * Math.min(18, len * 0.08) * env;
      out.push([ax + (bx - ax) * t + px * off, az + (bz - az) * t + pz * off]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Geometry helpers and spatial indexes
// ---------------------------------------------------------------------------------------------

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

export function distToPolyline(px: number, pz: number, pts: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

interface Seg { ax: number; az: number; bx: number; bz: number; w: number; tag: number }

/** A uniform grid of line segments, each stored in every cell within `reach` of it. */
class SegIndex {
  private cells = new Map<number, Seg[]>();
  constructor(readonly cell: number, readonly reach: number) {}
  add(pts: readonly P2[], w: number, tag: number): void {
    for (let i = 0; i < pts.length - 1; i++) {
      const s: Seg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], w, tag };
      const r = this.reach + w;
      const x0 = Math.floor((Math.min(s.ax, s.bx) - r) / this.cell), x1 = Math.floor((Math.max(s.ax, s.bx) + r) / this.cell);
      const z0 = Math.floor((Math.min(s.az, s.bz) - r) / this.cell), z1 = Math.floor((Math.max(s.az, s.bz) + r) / this.cell);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const k = (cx + 4096) * 8192 + (cz + 4096);
        const list = this.cells.get(k);
        if (list) list.push(s);
        else this.cells.set(k, [s]);
      }
    }
  }
  /** Distance to the nearest segment's edge (centre distance minus its half width), or Infinity past `reach`. */
  edgeDist(x: number, z: number): { d: number; tag: number } {
    const k = (Math.floor(x / this.cell) + 4096) * 8192 + (Math.floor(z / this.cell) + 4096);
    const list = this.cells.get(k);
    let best = Infinity, tag = -1;
    if (!list) return { d: best, tag };
    for (const s of list) {
      const d = distToSegment(x, z, s.ax, s.az, s.bx, s.bz) - s.w;
      if (d < best) {
        best = d;
        tag = s.tag;
      }
    }
    return { d: best, tag };
  }
}

/** Roads reach 40 m (the flattening band), rivers 70 m (the valley they cut). */
const roadIndex = new SegIndex(48, 40);
REGION_ROADS.forEach((r, i) => roadIndex.add(r.pts, r.width, i));
const riverIndex = new SegIndex(64, 75);
RIVERS.forEach((r, i) => riverIndex.add(r.pts, r.width, i));
const lavaIndex = new SegIndex(64, 30);
LAVA.forEach((r, i) => lavaIndex.add(r.pts, r.width, i));

/** Distance from a point to the nearest region road's edge (Infinity beyond 40 m). */
export function roadDist(x: number, z: number): number {
  return roadIndex.edgeDist(x, z).d;
}

/** Distance to the nearest region river's water edge (Infinity beyond 75 m), with a wandering bank. */
export function riverDist(x: number, z: number): number {
  const d = riverIndex.edgeDist(x, z).d;
  if (d === Infinity) return d;
  return d - (rvalue(x / 40, z / 40, 1937) - 0.5) * 5;
}

/** Distance to the nearest lava channel's edge (Infinity beyond 30 m). */
export function lavaDist(x: number, z: number): number {
  return lavaIndex.edgeDist(x, z).d;
}

/** Settlements whose levelling reaches a cell, for quick per-sample lookups. */
const SET_CELL = 128;
const settlementCells = new Map<number, Settlement[]>();
for (const s of SETTLEMENTS) {
  if (s.tier === 'home') continue;
  const R = settlementBlendR(s);
  for (let cz = Math.floor((s.z - R) / SET_CELL); cz <= Math.floor((s.z + R) / SET_CELL); cz++) {
    for (let cx = Math.floor((s.x - R) / SET_CELL); cx <= Math.floor((s.x + R) / SET_CELL); cx++) {
      const k = (cx + 4096) * 8192 + (cz + 4096);
      const list = settlementCells.get(k);
      if (list) list.push(s);
      else settlementCells.set(k, [s]);
    }
  }
}

/** Settlements (not Bramblewick) whose levelled ground might reach this point. */
export function settlementsNear(x: number, z: number): readonly Settlement[] {
  return settlementCells.get((Math.floor(x / SET_CELL) + 4096) * 8192 + (Math.floor(z / SET_CELL) + 4096)) ?? EMPTY;
}
const EMPTY: Settlement[] = [];

/** Where two polylines cross (for bridges): every crossing of a road with a river. */
export function roadRiverCrossings(): { x: number; z: number; dirX: number; dirZ: number; road: string; river: string; span: number }[] {
  const out: { x: number; z: number; dirX: number; dirZ: number; road: string; river: string; span: number }[] = [];
  for (const road of REGION_ROADS) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
      for (const river of RIVERS) {
        for (let j = 0; j < river.pts.length - 1; j++) {
          const [cx, cz] = river.pts[j], [dx, dz] = river.pts[j + 1];
          const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz;
          const den = r1x * r2z - r1z * r2x;
          if (Math.abs(den) < 1e-9) continue;
          const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
          const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const l = Math.hypot(r1x, r1z);
          out.push({ x: ax + r1x * t, z: az + r1z * t, dirX: r1x / l, dirZ: r1z / l, road: road.id, river: river.id, span: river.width * 2 + 16 });
        }
      }
    }
  }
  return out;
}

/** The name of the place at a point, for the HUD: a settlement, else the biome. */
export function placeName(x: number, z: number): { name: string; sub: string; settlement: Settlement | null; biome: BiomeId } {
  const s = settlementAt(x, z);
  const biome = biomeAt(x, z);
  if (s) return { name: s.name, sub: s.tagline, settlement: s, biome };
  return { name: BIOMES[biome].name, sub: BIOMES[biome].blurb, settlement: null, biome };
}

/** Whether a point is inside the hand-built vale (the old 1.2 km world). */
export function inVale(x: number, z: number, margin = 0): boolean {
  return Math.abs(x) < 600 - margin && Math.abs(z) < 600 - margin;
}

/** Smooth 0..1 weight for how much "vale" terrain applies (1 inside, 0 beyond the blend band). */
export function valeWeight(x: number, z: number): number {
  const e = Math.max(Math.abs(x), Math.abs(z)) + (rfbm(x / 110, z / 110, 3, 1337 + 300) - 0.5) * 80;
  return 1 - smooth(470, 620, e);
}
