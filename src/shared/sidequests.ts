import type { Appearance } from './types';

/**
 * Hearthmeadow's side quests (DESIGN §12.3: 3-4 starts per km²). Each one has a giver standing
 * somewhere in the vale who asks for something: items from your bag, a Pokémon to see in your
 * party, or wild Pokémon knocked out in battle. Each player takes and finishes their own. Save
 * keys are the quest ids: never rename one.
 */
export type QuestGoal =
  /** Hand over items from the bag. */
  | { kind: 'bring'; items: Record<string, number> }
  /** Have these species in your party when you talk to them. */
  | { kind: 'show'; species: string[] }
  /** Knock out wild Pokémon of a species in battles you win. */
  | { kind: 'defeat'; species: string; count: number };

export interface SideQuestDef {
  id: string;
  /** Quest log title. */
  title: string;
  giver: string;
  /** Where the giver stands (world metres) and which way they face. */
  x: number;
  z: number;
  yaw: number;
  look: Appearance;
  /** Height against a grown-up's (Pelle is a child). */
  size?: number;
  /** The first time you talk to them. */
  intro: string[];
  /** The request, asked with "accept / not now" choices. */
  ask: string;
  accepted: string;
  /** While you're on it (the goal not met yet). */
  waiting: string;
  /** When you hand it in. */
  done: string[];
  /** Small talk once it's done. */
  after: string;
  goal: QuestGoal;
  reward: { money?: number; items?: Record<string, number>; xp: number };
  /** What the quest log says while it's open. */
  log: string;
}

const look = (skinTone: string, hairColor: string, hairStyle: number, jacketColor: string, pantsColor: string, build: number): Appearance => ({ trainerModel: 'custom', skinTone, hairColor, hairStyle, jacketColor, pantsColor, build });

export const SIDE_QUESTS: SideQuestDef[] = [
  {
    id: 'pelle-pikachu',
    title: 'A Pikachu for Pelle',
    giver: 'Pelle',
    // By the well in Bramblewick's plaza.
    x: 3.4,
    z: -332.8,
    yaw: 0.3,
    look: look('#f2c9a0', '#d8a24a', 0, '#4f86c6', '#3d4a5c', 0),
    size: 0.72,
    intro: [
      'Are you a real trainer? With real Pokémon?',
      "Grandpa says there are Pikachu out on the meadow. Yellow ones, with red cheeks that go zap. I've never seen one. Not even once.",
    ],
    ask: 'Will you catch one and show me? You can keep it! I just want to see it.',
    accepted: "Yes! Bring it here in your party. I'll wait right here by the well.",
    waiting: "Did you find a Pikachu yet? Grandpa says they're shy, and you hardly ever see more than two.",
    done: ['Is that... it IS! Look at its cheeks!', "Here. It's my lucky Great Ball. I was saving it for my own Pikachu, but you should have it."],
    after: "When I'm big I'm going to have a Pikachu too. Two Pikachu.",
    goal: { kind: 'show', species: ['pikachu'] },
    reward: { items: { 'great-ball': 1 }, xp: 40 },
    log: 'Show Pelle a Pikachu in your party',
  },
  {
    id: 'arne-rattata',
    title: 'Rattata in the turnips',
    giver: 'Farmer Arne',
    // By his vegetable patch on the east side of Bramblewick.
    x: -26,
    z: -341,
    yaw: 1.2,
    look: look('#d9a77e', '#8b8b8b', 0, '#6b7f3a', '#5a4632', 1),
    intro: ['Look at this. Look at it! Every turnip nibbled to the root.', "Rattata. They come in off the meadow at night, and I've never once caught one in the act."],
    ask: "You've got Pokémon. Knock out six of the little pests out on the meadow and the rest will think twice about my garden. I'll pay.",
    accepted: "Six. And I'll be counting the nibbles.",
    waiting: 'Keep at it. The garden is still getting nibbled.',
    done: ["Six! Not a nibble last night. You've earned this.", "And take a Treat. My wife bakes them for the Growlithe, but he's had plenty."],
    after: "Not a nibble since. Come by for a turnip some time. When they grow back.",
    goal: { kind: 'defeat', species: 'nibblet', count: 6 },
    reward: { money: 450, items: { treat: 1 }, xp: 40 },
    log: 'Knock out wild Rattata for Farmer Arne',
  },
  {
    id: 'bodil-supper',
    title: 'Supper at the Wayfarer Inn',
    giver: 'Innkeeper Bodil',
    // On the street by the Wayfarer Inn's porch.
    x: -13.8,
    z: -354.6,
    yaw: Math.PI / 2,
    look: look('#e8bf98', '#7a3b22', 3, '#8c3b4a', '#e9dcc0', 1),
    intro: ["Full house tonight, and the supply cart's stuck somewhere on Route 1. Typical."],
    ask: "Could you bring me four Wild Mushrooms and four Oran Berries for the pot? I'll pay fair, and there's fresh water in it for you.",
    accepted: "Mushrooms grow on fallen logs, berries on the bushes. And don't eat them on the way.",
    waiting: 'Four Wild Mushrooms and four Oran Berries, love. The pot is waiting.',
    done: ["Oh, you're a lifesaver. Into the pot they go.", 'There you are: your pay, and two flasks of the good water.'],
    after: 'The stew went down a treat. Come back when you are hungry. And bring money.',
    goal: { kind: 'bring', items: { 'wild-mushroom': 4, 'bramble-berry': 4 } },
    reward: { money: 300, items: { 'water-flask': 2 }, xp: 30 },
    log: 'Bring Bodil 4 Wild Mushrooms and 4 Oran Berries',
  },
  {
    id: 'kari-pond',
    title: "Kari's pond survey",
    giver: 'Kari',
    // At the fishing spot on the pond, north-east of the Route 1 junction.
    x: -118.6,
    z: 146.2,
    yaw: 2.66,
    look: look('#c99a6e', '#2d2a26', 2, '#3f8f8a', '#6b5a3e', 0),
    intro: ["Shh. You'll scare the tadpoles.", "I'm Kari. I'm counting the Water types in this pond for Professor Hazel's survey. Poliwag and Psyduck live here, but they never come close enough to check."],
    ask: 'If you caught a Poliwag and a Psyduck and brought them here, I could finish my notes. Would you?',
    accepted: 'Both in your party, please. They stay near the water, here or down by the river and the lake.',
    waiting: "They don't stray far from water: try the pond here, the river or the lake.",
    done: ["Look at that swirl! And this one has a headache already. Perfect.", 'Thank you. Take these: the survey has a budget. A small one.'],
    after: "The Poliwag here have swirls that turn clockwise. Down by the river they turn the other way. Don't tell anyone: it's my discovery.",
    goal: { kind: 'show', species: ['poliwag', 'psyduck'] },
    reward: { money: 200, items: { 'poke-ball': 2 }, xp: 40 },
    log: 'Show Kari a Poliwag and a Psyduck in your party',
  },
];

/** A quest by id, or undefined (safe for ids from a save or the wire). */
export function sideQuestById(id: unknown): SideQuestDef | undefined {
  return typeof id === 'string' ? SIDE_QUESTS.find((q) => q.id === id) : undefined;
}

export interface SideQuestEntry {
  state: 'active' | 'done';
  /** Knocked out so far, for a defeat goal. */
  n?: number;
}

/** The side quests in a save, keeping only known ids and sane values. */
export function sideQuestState(raw: unknown): Record<string, SideQuestEntry> {
  const out: Record<string, SideQuestEntry> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = sideQuestById(id);
    if (!def || !v || typeof v !== 'object') continue;
    const e = v as Record<string, unknown>;
    if (e.state !== 'active' && e.state !== 'done') continue;
    const entry: SideQuestEntry = { state: e.state };
    if (def.goal.kind === 'defeat') entry.n = typeof e.n === 'number' && Number.isFinite(e.n) ? Math.max(0, Math.min(def.goal.count, Math.floor(e.n))) : 0;
    out[id] = entry;
  }
  return out;
}

/** What you have that a goal looks at. */
export interface QuestContext {
  bag: Record<string, number>;
  /** Species in your party. */
  party: readonly string[];
}

/** Whether you can hand the quest in now. */
export function goalMet(def: SideQuestDef, entry: SideQuestEntry | undefined, ctx: QuestContext): boolean {
  const g = def.goal;
  if (g.kind === 'bring') return Object.entries(g.items).every(([id, n]) => (ctx.bag[id] ?? 0) >= n);
  if (g.kind === 'show') return g.species.every((s) => ctx.party.includes(s));
  return (entry?.n ?? 0) >= g.count;
}

/** The quest log line, with a count for a defeat goal. */
export function questLogText(def: SideQuestDef, entry: SideQuestEntry | undefined): string {
  return def.goal.kind === 'defeat' ? `${def.log} (${Math.min(entry?.n ?? 0, def.goal.count)} of ${def.goal.count})` : def.log;
}

/**
 * Wild Pokémon you just knocked out count towards open defeat goals. Returns the quests that
 * moved on, with their new count.
 */
export function creditDefeats(state: Record<string, SideQuestEntry>, species: readonly string[]): { def: SideQuestDef; n: number }[] {
  const moved: { def: SideQuestDef; n: number }[] = [];
  for (const def of SIDE_QUESTS) {
    const e = state[def.id], g = def.goal;
    if (e?.state !== 'active' || g.kind !== 'defeat') continue;
    const k = species.filter((s) => s === g.species).length;
    if (!k || (e.n ?? 0) >= g.count) continue;
    e.n = Math.min(g.count, (e.n ?? 0) + k);
    moved.push({ def, n: e.n });
  }
  return moved;
}
