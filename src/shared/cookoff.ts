/**
 * The Competitive Picnicker (DESIGN §12.4): Gudrun, undefeated picnic champion of Hearthmeadow,
 * has her blanket and grill under the lone tree. Bring three Wild Mushrooms and she challenges
 * you to a cook-off: three timed steps (chop, stir, season), each judged Burnt, Edible, Tasty or
 * Perfect. Beat her score and she teaches you her Hearty Stew. On later days a rematch win earns
 * a bowl of it. Each player cooks with their own mushrooms and keeps their own record.
 */
export const PICNICKER = {
  name: 'Gudrun',
  /** Her picnic blanket, south-east of the lone tree, and where she stands at her grill. */
  x: 208.5,
  z: -131.5,
  yaw: -2.4,
  /** What each attempt costs: the mushrooms go in the pot whether you win or not. */
  fee: { 'wild-mushroom': 3 } as Record<string, number>,
  /** The recipe she teaches the first time you beat her (`RECIPES`), and the dish you win after. */
  prize: 'hearty-stew',
};

/** What she says the first time you walk up. */
export const PICNICKER_INTRO: string[] = [
  "You there! You look like someone who eats. But can you cook?",
  "I'm Gudrun, picnic champion of Hearthmeadow. Fourteen summers unbeaten, and this hill has seen every one of them.",
  "Here's my challenge: bring three Wild Mushrooms and we cook side by side. Chop, stir, season. Beat my dish and I'll teach you my Hearty Stew.",
];

/** One step of the cook-off: a marker sweeps across a bar and you stop it on the sweet spot. */
export interface CookStep {
  label: string;
  /** Bar widths per second. */
  speed: number;
  /** Half-widths of the Perfect, Tasty and Edible zones round the sweet spot, in bar widths. */
  perfect: number;
  good: number;
  ok: number;
}

export const COOK_STEPS: CookStep[] = [
  { label: 'Chop the mushrooms', speed: 0.8, perfect: 0.035, good: 0.1, ok: 0.19 },
  { label: 'Stir the pot', speed: 1.05, perfect: 0.03, good: 0.085, ok: 0.17 },
  { label: 'Season it', speed: 1.3, perfect: 0.025, good: 0.07, ok: 0.15 },
];

/** What a step scored (0-3) is called. */
export const COOK_GRADES = ['Burnt', 'Edible', 'Tasty', 'Perfect'] as const;

/** The best total: Perfect on every step. */
export const COOK_MAX = COOK_STEPS.length * 3;

/** Where the marker is (0 to 1 across the bar) `t` seconds into a step: it sweeps there and back. */
export function markerAt(step: CookStep, t: number): number {
  const u = (Math.max(0, t) * step.speed) % 2;
  return u <= 1 ? u : 2 - u;
}

/** Where a step's sweet spot sits: somewhere in the middle half of the bar, different each try. */
export function sweetSpot(seed: number, step: number): number {
  const s = Math.sin((seed + 1) * 12.9898 + step * 78.233) * 43758.5453;
  return 0.25 + (s - Math.floor(s)) * 0.5;
}

/** Score for stopping the marker at `x` with the sweet spot at `spot`. */
export function judge(step: CookStep, x: number, spot: number): 0 | 1 | 2 | 3 {
  const d = Math.abs(x - spot);
  return d <= step.perfect ? 3 : d <= step.good ? 2 : d <= step.ok ? 1 : 0;
}

/** Gudrun's own score: Tasty on every step, and she's practised by the time you come back. */
export function rivalScore(wins: number): number {
  return wins > 0 ? 7 : 6;
}

/** You have to beat her outright: a tie goes to the champion. */
export function cookoffWon(scores: readonly number[], rival: number): boolean {
  return scores.reduce((a, b) => a + b, 0) > rival;
}

/** What you've done against her: cook-offs won, and the (UTC) day of the last win. */
export interface PicnickerSave {
  wins: number;
  day?: number;
}

/** Her part of a save, tolerant of saves from before her and of hand-edited ones. */
export function picnickerState(raw: unknown): PicnickerSave {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const wins = typeof o.wins === 'number' && Number.isFinite(o.wins) ? Math.max(0, Math.floor(o.wins)) : 0;
  const day = typeof o.day === 'number' && Number.isFinite(o.day) ? Math.floor(o.day) : undefined;
  return day === undefined ? { wins } : { wins, day };
}
