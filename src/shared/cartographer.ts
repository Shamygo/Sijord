import type { Appearance } from './types';

/**
 * The Overconfident Cartographer (DESIGN §12.4): Edvin sits at his easel on a rise west of
 * Route 1, drawing maps of Hearthmeadow that are wrong on purpose. He hands you three pages to
 * check against the land. Go to each place, see what's really there, and come back and tell him.
 * Correct all three and he admits it, and gives you a real treasure map: an old chest buried far
 * to the west, which takes a Stone Pick to dig up. Each player checks and digs for themselves.
 */
export const CARTOGRAPHER = {
  id: 'edvin',
  giver: 'Edvin',
  /** Where he stands at his easel (world metres), facing the mesas he's drawing. */
  x: 100,
  z: 130,
  yaw: 1.3,
  look: { trainerModel: 'custom', skinTone: '#e6b994', hairColor: '#cfc6b4', hairStyle: 0, jacketColor: '#b8862e', pantsColor: '#4a3b2a', build: 1 } as Appearance,
};

/** One of his pages and what's wrong with it. */
export interface MapError {
  /** Save key: never rename one. */
  id: string;
  /** What the quest log and the toasts call the place. */
  place: string;
  /** Where it is, and how close you need to come to see it properly (world metres). */
  x: number;
  z: number;
  r: number;
  /** What his map says is there. */
  claim: string;
  /** What he asks when you come back. */
  ask: string;
  /** What you can tell him: exactly one is what's really there. */
  options: string[];
  answer: number;
  /** What he says when you get it right. */
  right: string;
}

export const MAP_ERRORS: MapError[] = [
  {
    id: 'arch',
    place: 'the Old Arch',
    // The meadow arch west of Route 1, between Bramblewick and the junction.
    x: 62,
    z: -128,
    r: 14,
    claim: 'The Old Gate, west of Route 1 below the junction: three great arches in a row, every one still standing.',
    ask: 'The Old Gate. Three great arches, standing proud. Correct?',
    options: ['Three arches, just as you drew them', 'Just the one arch, with its pillars fallen around it', 'No arch at all, only rubble'],
    answer: 1,
    right: 'One? ONE? ...Hm. The other two must have fallen down since. Recently. Very recently.',
  },
  {
    id: 'stones',
    place: 'the standing stones',
    // The ring far to the north-east, past the pond.
    x: -300,
    z: 300,
    r: 16,
    claim: 'The Stone Ring, far to the north-east past the pond: twelve standing stones around a golden statue.',
    ask: 'The Stone Ring. Twelve stones and a golden statue, yes?',
    options: ['Seven stones around a well', 'Twelve stones and a golden statue', 'Nine stones around a plain stone block'],
    answer: 2,
    right: 'Nine. And a block. I had the statue drawn so nicely, too.',
  },
  {
    id: 'jetty',
    place: 'the lake jetty',
    // The start of the jetty on the lake east of Bramblewick.
    x: -112,
    z: -272,
    r: 14,
    claim: 'The jetty on the lake, east of Bramblewick: a grand stone pier with a blue sailing ship moored at the end.',
    ask: 'And the lake. My stone pier, my blue sailing ship. Magnificent, was she not?',
    options: ['A wooden jetty with a little red rowing boat', 'A stone pier and a blue sailing ship', 'A wooden jetty and nothing else'],
    answer: 0,
    right: 'A rowing boat. Well. It is a ship, in a sense. A small sense.',
  },
];

/** The real treasure: an old chest buried far to the west, past the lone tree. */
export const TREASURE = {
  x: 480,
  z: -180,
  /** Dig within this far of the spot. */
  r: 2.2,
  /** The ground is hard: you need this to dig. */
  tool: 'stone-pick' as const,
  seconds: 3.2,
  money: 600,
  items: { 'ultra-ball': 1 } as Record<string, number>,
};

/** What he says the first time you talk to him. */
export const CARTOGRAPHER_INTRO: string[] = [
  "Ah, a traveller! Mind the easel. Edvin Brask, cartographer. The finest in the vale. Also the only one.",
  'Every rock, every pond, every blade of grass, all drawn to perfection. From memory, mostly. And from what I hear at the inn.',
];

export const CARTOGRAPHER_ASK = "You doubt me? Then go and look for yourself. Take these three pages and check them against the land. Then come back and tell me how right I am.";

/** Once all three are corrected: the confession, and the real map. */
export const CARTOGRAPHER_REVEAL: string[] = [
  "That's all three. ...Oh, fine. I'll tell you a secret. I draw them wrong on purpose.",
  'Treasure hunters buy my maps and dig in all the wrong places, far from anything worth finding. It keeps the vale peaceful.',
  "But you actually went and looked. So here: my grandmother's map, the real one. A chest, far to the west past the lone tree, where the meadow meets the mountains. Bring a pick. The ground there is hard.",
];

/** Your progress with him. */
export interface CartographerSave {
  /** He gave you his three pages. */
  taken: boolean;
  /** Places you've been to since, that you haven't told him about yet. */
  seen: string[];
  /** Places you've told him the truth about. */
  fixed: string[];
  /** You dug up the chest. */
  dug: boolean;
}

/** His progress in a save, keeping only known places and sane values. */
export function cartographerState(raw: unknown): CartographerSave {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && MAP_ERRORS.some((e) => e.id === id)))] : []);
  const fixed = ids(r.fixed);
  return { taken: r.taken === true, seen: ids(r.seen).filter((id) => !fixed.includes(id)), fixed, dug: r.dug === true && fixed.length === MAP_ERRORS.length };
}

/** "the Old Arch, the standing stones and the lake jetty". */
export function placeList(list: readonly MapError[]): string {
  const names = list.map((e) => e.place);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
}

/** Places you've seen and can tell him about. */
export function toReport(st: CartographerSave): MapError[] {
  return MAP_ERRORS.filter((e) => st.seen.includes(e.id));
}

/** Places still to go and look at. */
export function toCheck(st: CartographerSave): MapError[] {
  return MAP_ERRORS.filter((e) => !st.seen.includes(e.id) && !st.fixed.includes(e.id));
}

/** All three corrected: you have the real treasure map. */
export function hasTreasureMap(st: CartographerSave): boolean {
  return st.fixed.length >= MAP_ERRORS.length;
}

/** A page you're checking whose place you're standing at now, if any. */
export function surveyAt(st: CartographerSave, x: number, z: number): MapError | undefined {
  return st.taken ? toCheck(st).find((e) => Math.hypot(x - e.x, z - e.z) < e.r) : undefined;
}

/** Your answer about a place: right corrects his map; wrong sends you back to look again. */
export function answerFor(st: CartographerSave, e: MapError, pick: number): boolean {
  st.seen = st.seen.filter((id) => id !== e.id);
  if (pick !== e.answer) return false;
  if (!st.fixed.includes(e.id)) st.fixed.push(e.id);
  return true;
}
