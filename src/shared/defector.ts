import { DISCOVERIES, type Discovery } from './discoveries';

/**
 * The Tether Defector (DESIGN §12.4): Sten, a Team Tether grunt who walked out on them and has
 * been hiding in a hay bale west of Route 1 ever since. He's starving. Bring him something
 * cooked and he pays in what he knows: where the lab's supply crates are (Tether had its grunts
 * map them to raid; he marks one you haven't found on your map) and, a little at a time, what
 * Team Tether is really up to (DESIGN §14). Each player feeds him from their own bag.
 */
export const DEFECTOR = {
  name: 'Sten',
  /** Where his hay bale sits (world metres), and which way he peeks out. */
  x: 40,
  z: -60,
  yaw: -1.2,
  /** The only fee he takes: cooked food. */
  fee: 'mushroom-skewer',
  /** He notices a trainer this close and the bale starts to rustle. */
  notice: 9,
};

/** Before you know who he is, the bale has no name. */
export const BALE_NAME = 'Suspicious hay bale';

/** What he says the first time you talk to him. */
export const DEFECTOR_INTRO: string[] = [
  "Psst! Don't look at me. Look at the grass. Act natural.",
  "...Fine. I'm Sten. I used to work for Krane Industries, out of Jernhamn. Now I live in a hay bale. It's a long story.",
  "I haven't eaten anything that wasn't raw in a week. Bring me something cooked, a Mushroom Skewer, and I'll tell you where to find the supply crates my old crew was sent to raid.",
];

/** Lore, one piece per meal, in order (DESIGN §14). */
export const DEFECTOR_LORE: string[] = [
  "Krane Industries makes machines that do the work for you. 'No more winters', the posters say. Everyone in Jernhamn loves them.",
  "There's a wing of the company nobody talks about. Team Tether. They catch Pokémon by the cartload and chain them to machines.",
  "The big machines are called Tether Engines. They drink something out of the ground, and the land around them goes grey.",
  "Three admins run the field teams: Ottar, Ylva and Brann. If you ever meet Ylva, run.",
  "The Director, Halvard Krane, lost his family in a winter storm. He wants to bind whatever brings the winter. Solvyrn, he calls it.",
  "That's all I know. If Tether asks, you never saw a talking hay bale.",
];

/** Crates he knows about, best first: the lab hid the good stuff up high, where Tether couldn't easily get it. */
const PRIORITY = ['great-ball', 'poke-ball', 'bandage', 'treat', 'water-flask', 'bramble-berry'];

function haul(d: Discovery): number {
  let score = 0;
  for (const [item, n] of Object.entries(d.loot ?? {})) score += n * (PRIORITY.length - Math.max(0, PRIORITY.indexOf(item))) ** 2;
  return score;
}

/** The next cache he'll point you to: the best one you haven't found and he hasn't told you about (closer first on a tie). */
export function nextTip(found: readonly string[], told: readonly string[]): Discovery | undefined {
  const dist = (d: Discovery) => Math.hypot(d.x - DEFECTOR.x, d.z - DEFECTOR.z);
  return DISCOVERIES.filter((d) => d.kind === 'cache' && !found.includes(d.id) && !told.includes(d.id)).sort((a, b) => haul(b) - haul(a) || dist(a) - dist(b))[0];
}

/** The last cache he told you about that you still haven't found: he'll remind you for free. */
export function pendingTip(found: readonly string[], told: readonly string[]): Discovery | undefined {
  for (let i = told.length - 1; i >= 0; i--) {
    const d = DISCOVERIES.find((c) => c.id === told[i] && c.kind === 'cache');
    if (d && !found.includes(d.id)) return d;
  }
  return undefined;
}

/** What you've had from him: meals eaten (one lore line each) and caches he's pointed you to. */
export interface DefectorSave {
  fed: number;
  told: string[];
}

/** His part of a save, tolerant of saves from before him and of hand-edited ones. */
export function defectorState(raw: unknown): DefectorSave {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fed = typeof o.fed === 'number' && Number.isFinite(o.fed) ? Math.max(0, Math.floor(o.fed)) : 0;
  const told = Array.isArray(o.told) ? o.told.filter((x): x is string => typeof x === 'string') : [];
  return { fed, told };
}

/** What the next Mushroom Skewer buys: a piece of lore, a cache, both, or nothing once he's told you everything. */
export function nextMeal(state: DefectorSave, found: readonly string[]): { lore?: string; tip?: Discovery } | null {
  const lore = DEFECTOR_LORE[state.fed];
  const tip = nextTip(found, state.told);
  return lore || tip ? { lore, tip } : null;
}

/** "about 300 m north-west of here, up high. You'll have to climb" */
export function tipDirections(d: Discovery): string {
  const dx = d.x - DEFECTOR.x, dz = d.z - DEFECTOR.z;
  // North is +Z and east is -X.
  const bearing = (Math.atan2(-dx, dz) * 180) / Math.PI;
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const dir = names[((Math.round(bearing / 45) % 8) + 8) % 8];
  const m = Math.max(50, Math.round(Math.hypot(dx, dz) / 50) * 50);
  return `about ${m} m ${dir} of here${d.onTop ? ', up high. You\'ll have to climb' : ''}`;
}
