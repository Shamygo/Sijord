/**
 * Gathering (DESIGN §6.3): what each kind of resource node gives, what it takes, and how long
 * it takes to grow back. Nodes are per player, like discoveries: a node one friend has emptied
 * is still full for the other. Regrowth runs on real time, so it carries on while the game is
 * closed.
 */
export type NodeKind = 'tree' | 'stones' | 'bush' | 'boulder' | 'berry' | 'apricorn' | 'copper';
export type ToolId = 'stone-hatchet' | 'stone-pick';
/** Which of Rei's clips plays while gathering: kneel at the ground, reach and pick, or swing a tool. */
export type GatherAnim = 'gather' | 'pick' | 'chop';

export interface GatherWay {
  prompt: string;
  /** Shown while it's happening. */
  doing: string;
  /** Item id to [min, max]. */
  gives: Record<string, [number, number]>;
  /** Seconds the trainer is busy. */
  seconds: number;
  anim: GatherAnim;
  /** Wears this tool by one use. */
  tool?: ToolId;
}

export interface NodeRule {
  /** By hand; missing when the node needs a tool. */
  hand?: GatherWay;
  /** With a tool, which beats the hand when you carry it. */
  withTool?: GatherWay;
  /** Shown (without a key) next to a node you can't work yet. Missing: no prompt at all. */
  needs?: string;
  /** Seconds until an emptied node is full again. */
  regrow: number;
}

/** One chop or pick swing of the tool clip. */
export const SWING_SECONDS = 0.9;

export const NODE_RULES: Record<NodeKind, NodeRule> = {
  tree: {
    hand: { prompt: 'Gather fallen branches', doing: 'Gathering branches', gives: { wood: [1, 1] }, seconds: 1.7, anim: 'gather' },
    withTool: { prompt: 'Chop wood', doing: 'Chopping wood', gives: { wood: [2, 3] }, seconds: SWING_SECONDS * 3, anim: 'chop', tool: 'stone-hatchet' },
    regrow: 600,
  },
  stones: {
    hand: { prompt: 'Pick up stones', doing: 'Picking up stones', gives: { stone: [1, 2] }, seconds: 1.7, anim: 'gather' },
    regrow: 900,
  },
  bush: {
    hand: { prompt: 'Pull plant fibre', doing: 'Pulling fibre', gives: { fiber: [1, 2] }, seconds: 1.7, anim: 'gather' },
    regrow: 600,
  },
  boulder: {
    withTool: { prompt: 'Break off stone', doing: 'Breaking off stone', gives: { stone: [2, 3] }, seconds: SWING_SECONDS * 3, anim: 'chop', tool: 'stone-pick' },
    regrow: 1200,
  },
  berry: {
    hand: { prompt: 'Pick Oran Berries', doing: 'Picking berries', gives: { 'bramble-berry': [1, 2] }, seconds: 1.1, anim: 'pick' },
    regrow: 1200,
  },
  apricorn: {
    hand: { prompt: 'Pick a Red Apricorn', doing: 'Picking an apricorn', gives: { 'red-apricorn': [1, 1] }, seconds: 1.1, anim: 'pick' },
    regrow: 1500,
  },
  copper: {
    withTool: { prompt: 'Mine copper ore', doing: 'Mining copper', gives: { 'copper-ore': [1, 1], stone: [0, 1] }, seconds: SWING_SECONDS * 3, anim: 'chop', tool: 'stone-pick' },
    needs: 'A copper vein · you need a Stone Pick to mine it',
    regrow: 1800,
  },
};

/** Uses a tool lasts before it breaks. */
export const TOOL_USES: Record<ToolId, number> = { 'stone-hatchet': 30, 'stone-pick': 30 };

/** How a node can be worked right now: with a tool you carry, by hand, or not at all. */
export function gatherWay(kind: NodeKind, has: (tool: ToolId) => boolean): GatherWay | null {
  const r = NODE_RULES[kind];
  if (r.withTool?.tool && has(r.withTool.tool)) return r.withTool;
  return r.hand ?? null;
}

/** Roll what a node gives. `rand` returns [0, 1). Zero counts are left out. */
export function rollYield(way: GatherWay, rand: () => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, [lo, hi]] of Object.entries(way.gives)) {
    const n = lo + Math.floor(rand() * (hi - lo + 1));
    if (n > 0) out[id] = n;
  }
  return out;
}

/** Emptied nodes: key to the time (ms since epoch) it grows back. Drops the ones that have. */
export function pruneDepleted(depleted: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, t] of Object.entries(depleted)) if (t > now) out[k] = t;
  return out;
}

/** Take one use off the tool in hand; a worn-out tool leaves the bag and the next one starts fresh. */
export function wearTool(bag: Record<string, number>, wear: Record<string, number>, tool: ToolId): { broke: boolean } {
  if (!bag[tool]) return { broke: false };
  const left = (wear[tool] ?? TOOL_USES[tool]) - 1;
  if (left > 0) {
    wear[tool] = left;
    return { broke: false };
  }
  bag[tool]--;
  if (!bag[tool]) delete bag[tool];
  delete wear[tool];
  return { broke: true };
}
