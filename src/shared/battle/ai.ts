import { moveData } from '../data/moves';
import type { AiKind, Battle, BattleMon, Choice, Pos } from './engine';
import { effectiveness } from './typechart';
import type { MoveData } from './types';

/**
 * Computer opponents (DESIGN §4.5):
 *
 * - `wild`: instinct. Prefers its strongest attack but often just does something.
 * - `t1`: early trainers and the first rival. One-ply greedy: scores every move and target by
 *   expected damage (with a big bonus for knock-outs) and sensible value for status moves, then
 *   picks the best, with a 15% chance of a human-like mistake.
 * - `t2`: gym trainers and early leaders. Plans both of its slots together: two attacks that only
 *   knock a target out between them are worth more, two attacks into a sure knock-out are not. It
 *   reads threats: Protect when a foe can knock it out, and status on whatever outspeeds it.
 * - `t3`: later leaders and the Battle Tower. As t2, and it switches out of a losing matchup into
 *   whatever on its bench takes the hit best (at most once every three turns).
 * - `t4`: the League. The same brain, almost never makes a mistake.
 *
 * The AI never sees what the player has chosen this turn. Bosses do read the player's moves,
 * the way a leader would have watched them come through the gym.
 */
const MISTAKE: Record<AiKind, number> = { wild: 0.35, t1: 0.15, t2: 0.07, t3: 0.04, t4: 0.015 };
const JITTER: Record<AiKind, number> = { wild: 0.1, t1: 0.1, t2: 0.06, t3: 0.04, t4: 0.02 };
const RANK: Record<AiKind, number> = { wild: 0, t1: 1, t2: 2, t3: 3, t4: 4 };

/** A plan for both of one trainer's slots, made once per turn. */
const plans = new WeakMap<Battle, { key: string; choices: Map<number, Choice> }>();
/** The turn each trainer last switched by choice (t3+ switch at most once every three turns). */
const lastSwitch = new WeakMap<Battle, Map<string, number>>();

export function chooseAction(b: Battle, pos: Pos, kind: 'move' | 'replace'): Choice {
  const mon = b.at(pos);
  const owner = b.slotOwner(pos);
  const tier = b.teamSetup(owner)?.ai ?? 'wild';
  if (kind === 'replace') {
    const team = b.team(owner);
    const bench = b.bench(owner);
    if (!bench.length) return { kind: 'pass' };
    // Bosses send in the best matchup; everyone else whatever hits hardest.
    let best = bench[0];
    let bestScore = -Infinity;
    for (const m of bench) {
      const score = RANK[tier] >= 2 ? matchup(b, m, b.foesOf(pos)) : m.moves.reduce((acc, s) => Math.max(acc, moveData(s.id).power), 0) + m.hp / m.maxHp * 20;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return { kind: 'switch', team: team.indexOf(best) };
  }
  if (!mon) return { kind: 'pass' };
  if (RANK[tier] >= 2) return planned(b, pos, owner, tier);
  const options = scoreOptions(b, pos);
  if (!options.length) return { kind: 'move', move: -1 };
  if (b.rng.next() < MISTAKE[tier]) return b.rng.pick(options).choice;
  return pickBest(b, options, JITTER[tier]).choice;
}

/** The best option after a little jitter, so equal options don't always resolve the same way. */
function pickBest(b: Battle, options: Option[], jitter: number): Option {
  let best = options[0];
  let bestScore = -Infinity;
  for (const o of options) {
    const s = o.score * (1 - jitter / 2 + b.rng.next() * jitter);
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return best;
}

interface Option {
  choice: Choice;
  score: number;
  /** For single-target attacks: where it lands and how hard. */
  hit?: { target: Pos; min: number; max: number };
  protect?: boolean;
}

/** Boss tiers: plan this trainer's slots together, then hand each slot its part of the plan. */
function planned(b: Battle, pos: Pos, owner: string, tier: AiKind): Choice {
  const key = `${b.turn}:${owner}`;
  const cached = plans.get(b);
  if (cached?.key === key && cached.choices.has(pos.slot)) {
    const c = cached.choices.get(pos.slot)!;
    cached.choices.delete(pos.slot);
    return c;
  }
  const mine = [0, 1].map((slot) => ({ side: pos.side, slot }) as Pos).filter((p) => b.at(p) && b.slotOwner(p) === owner);
  const opts = mine.map((p) => bossOptions(b, p, owner, tier));
  const choices = new Map<number, Choice>();
  mine.forEach((p, i) => {
    if (!opts[i].length) choices.set(p.slot, { kind: 'move', move: -1 });
  });
  const live = mine.map((p, i) => ({ p, o: opts[i] })).filter((x) => x.o.length);
  if (live.length === 1) choices.set(live[0].p.slot, pickOrSlip(b, live[0].o, tier).choice);
  else if (live.length === 2) {
    const [a, c] = live;
    let best: [Option, Option] = [a.o[0], c.o[0]];
    let bestScore = -Infinity;
    for (const x of a.o) {
      for (const y of c.o) {
        const s = (pairScore(b, x, y, a.o, c.o)) * (1 - JITTER[tier] / 2 + b.rng.next() * JITTER[tier]);
        if (s > bestScore) {
          bestScore = s;
          best = [x, y];
        }
      }
    }
    // A slip: one slot does something else.
    if (b.rng.next() < MISTAKE[tier]) {
      const i = b.rng.int(0, 1);
      best[i] = b.rng.pick(i === 0 ? a.o : c.o);
    }
    choices.set(a.p.slot, best[0].choice);
    choices.set(c.p.slot, best[1].choice);
  }
  for (const [slot, c] of choices) {
    if (c.kind === 'switch') {
      const m = lastSwitch.get(b) ?? new Map<string, number>();
      m.set(owner, b.turn);
      lastSwitch.set(b, m);
      // Never send the same creature in twice.
      for (const [other, oc] of choices) if (other !== slot && oc.kind === 'switch' && oc.team === c.team) choices.set(other, fallback(b, { side: pos.side, slot: other as 0 | 1 }));
    }
  }
  const mineNow = choices.get(pos.slot) ?? { kind: 'move', move: -1 };
  choices.delete(pos.slot);
  plans.set(b, { key, choices });
  return mineNow;
}

function fallback(b: Battle, pos: Pos): Choice {
  const o = scoreOptions(b, pos);
  return o.length ? pickBest(b, o, 0).choice : { kind: 'move', move: -1 };
}

function pickOrSlip(b: Battle, options: Option[], tier: AiKind): Option {
  return b.rng.next() < MISTAKE[tier] ? b.rng.pick(options) : pickBest(b, options, JITTER[tier]);
}

/** Two slots' options together: focus fire that knocks out, no wasted overkill, no double Protect. */
function pairScore(b: Battle, x: Option, y: Option, xs: Option[], ys: Option[]): number {
  let s = x.score + y.score;
  if (x.choice.kind === 'switch' && y.choice.kind === 'switch' && x.choice.team === y.choice.team) return -Infinity;
  if (x.hit && y.hit && x.hit.target.side === y.hit.target.side && x.hit.target.slot === y.hit.target.slot) {
    const t = b.at(x.hit.target)!;
    const xKo = x.hit.min >= t.hp;
    const yKo = y.hit.min >= t.hp;
    if (xKo || yKo) {
      // One of them knocks it out alone: the other's attack rolls over to the other foe (if any).
      const [, extra] = xKo && (!yKo || x.hit.min >= y.hit.min) ? [x, y] : [y, x];
      const list = extra === x ? xs : ys;
      const redirect = list.find((o) => o.choice.kind === 'move' && extra.choice.kind === 'move' && o.choice.move === extra.choice.move && o.hit && (o.hit.target.slot !== extra.hit!.target.slot));
      s -= extra.score - (redirect ? redirect.score * 0.8 : 0);
    } else if (x.hit.min + y.hit.min >= t.hp) s += 0.7;
    else if (x.hit.max + y.hit.max >= t.hp) s += 0.3;
  }
  const isProtect = (o: Option) => o.choice.kind === 'move' && !o.hit && o.score > 0 && o.protect;
  if (isProtect(x) && isProtect(y)) s -= 0.4;
  return s;
}

/** How hard each foe can hit this position, as a share of its HP, and whether that foe is faster. */
function threats(b: Battle, pos: Pos): { worst: number; fasterKo: boolean; ko: boolean } {
  const mon = b.at(pos)!;
  let worst = 0;
  let fasterKo = false;
  for (const f of b.foesOf(pos)) {
    const foe = b.at(f);
    if (!foe) continue;
    for (const slot of foe.moves) {
      if (slot.pp <= 0) continue;
      const mv = moveData(slot.id);
      if (mv.category === 'status') continue;
      const est = b.estimateDamage(f, mv.id, pos);
      const frac = est.max / Math.max(1, mon.hp);
      worst = Math.max(worst, frac);
      if (est.max >= mon.hp && (b.speed(foe) > b.speed(mon) || mv.priority > 0)) fasterKo = true;
    }
  }
  return { worst, fasterKo, ko: worst >= 1 };
}

/** How well a creature on the bench would do against the current foes (higher is better). */
function matchup(b: Battle, m: BattleMon, foes: Pos[]): number {
  let offence = 0;
  let defence = 0;
  for (const f of foes) {
    const foe = b.at(f);
    if (!foe) continue;
    for (const s of m.moves) {
      const mv = moveData(s.id);
      if (mv.category === 'status' || s.pp <= 0) continue;
      const stab = m.types.includes(mv.type) ? 1.5 : 1;
      offence = Math.max(offence, (mv.power * stab * effectiveness(mv.type, foe.types)) / 100);
    }
    for (const s of foe.moves) {
      const mv = moveData(s.id);
      if (mv.category === 'status') continue;
      const stab = foe.types.includes(mv.type) ? 1.5 : 1;
      defence = Math.max(defence, (mv.power * stab * effectiveness(mv.type, m.types)) / 100);
    }
  }
  return offence - defence * 0.8 + (m.hp / m.maxHp) * 0.6;
}

/** Every option a boss considers: moves scored with threats in mind, and (t3+) switches. */
function bossOptions(b: Battle, pos: Pos, owner: string, tier: AiKind): Option[] {
  const mon = b.at(pos)!;
  const threat = threats(b, pos);
  const out = scoreOptions(b, pos).map((o) => {
    if (o.choice.kind !== 'move') return o;
    const move = moveData(mon.moves[o.choice.move].id);
    let score = o.score;
    if (move.special === 'protect') {
      score = mon.protectChain ? 0 : threat.fasterKo ? 0.75 : threat.ko ? 0.4 : 0.05;
      o.protect = true;
    } else if (move.status === 'par' || move.status === 'slp') {
      const t = o.choice.target ? b.at(o.choice.target) : null;
      if (t && b.speed(t) > b.speed(mon) && score > 0) score += 0.2;
    } else if (move.selfBoosts && move.category === 'status' && threat.ko) score *= 0.2;
    else if (move.heal && threat.fasterKo) score *= 0.4;
    // A faster foe can knock it out first: an attack may never land.
    if (threat.fasterKo && move.category !== 'status') score *= 0.6;
    return { ...o, score };
  });
  if (RANK[tier] >= 3) {
    const since = b.turn - (lastSwitch.get(b)?.get(owner) ?? -99);
    const bestHere = Math.max(0, ...out.map((o) => o.score));
    if (since >= 3 && threat.fasterKo && bestHere < 0.45) {
      const team = b.team(owner);
      const here = matchup(b, mon, b.foesOf(pos));
      for (const m of b.bench(owner)) {
        const gain = matchup(b, m, b.foesOf(pos)) - here;
        if (gain > 0.6) out.push({ choice: { kind: 'switch', team: team.indexOf(m) }, score: 0.35 + Math.min(0.4, gain * 0.2) });
      }
    }
  }
  return out;
}

function scoreOptions(b: Battle, pos: Pos): Option[] {
  const mon = b.at(pos)!;
  const out: Option[] = [];
  mon.moves.forEach((slot, i) => {
    if (slot.pp <= 0) return;
    const move = moveData(slot.id);
    if (move.target === 'normal' || move.target === 'adjacent-foe') {
      for (const t of b.foesOf(pos)) {
        const est = move.category === 'status' ? null : b.estimateDamage(pos, move.id, t);
        out.push({ choice: { kind: 'move', move: i, target: t }, score: scoreMove(b, pos, move, [t]), hit: est ? { target: t, min: est.min, max: est.max } : undefined });
      }
    } else {
      const targets = move.target === 'all-adjacent-foes' ? b.foesOf(pos) : move.target === 'all-adjacent' ? [...b.foesOf(pos), ...(b.allyOf(pos) ? [b.allyOf(pos)!] : [])] : [];
      out.push({ choice: { kind: 'move', move: i }, score: scoreMove(b, pos, move, targets) });
    }
  });
  return out;
}

function scoreMove(b: Battle, pos: Pos, move: MoveData, targets: Pos[]): number {
  const mon = b.at(pos)!;
  if (move.category !== 'status') {
    if (move.special === 'fake-out' && mon.turnsOut > 1) return 0;
    let score = 0;
    for (const t of targets) {
      const target = b.at(t)!;
      const est = b.estimateDamage(pos, move.id, t);
      const avg = (est.min + est.max) / 2;
      const acc = move.accuracy === true ? 1 : move.accuracy / 100;
      const frac = Math.min(1, avg / Math.max(1, target.hp));
      let s = frac * acc;
      if (est.min >= target.hp) s += 0.6 * acc; // a sure knock-out
      else if (est.max >= target.hp) s += 0.3 * acc;
      if (move.special === 'fake-out') s += 0.35;
      // Hitting your own partner is bad.
      s *= t.side === pos.side ? -1.5 : 1;
      score += s;
    }
    if (move.recoil) score *= 0.9;
    if (move.selfBoosts && Object.values(move.selfBoosts).some((v) => v < 0)) score *= 0.9;
    // Exploding is a last resort.
    if (move.special === 'self-destruct') score *= mon.hp / mon.maxHp < 0.25 ? 1 : 0.05;
    if (move.special === 'sucker-punch') score *= 0.8;
    return score;
  }
  // Status moves.
  const hpFrac = mon.hp / mon.maxHp;
  switch (move.special) {
    case 'teleport':
      // A wild creature alone on its side slips away; elsewhere Teleport does nothing.
      return b.kind === 'wild' && b.teamSetup(b.slotOwner(pos))?.ai === 'wild' && !b.allyOf(pos) ? 0.5 : 0;
    case 'focus-energy':
      return !mon.focusEnergy && hpFrac > 0.6 ? 0.15 : 0;
    case 'rest':
      return hpFrac < 0.35 && mon.status !== 'slp' ? 0.6 : 0;
    case 'soak':
      return 0.03;
    case 'protect':
      return mon.protectChain ? 0 : 0.12;
    case 'helping-hand':
      return b.allyOf(pos) ? 0.22 : 0;
    case 'follow-me':
      return b.allyOf(pos) && hpFrac > 0.5 ? 0.18 : 0;
    case 'tailwind':
      return 0.35;
    case 'leech-seed': {
      const t = targets[0] ? b.at(targets[0]) : null;
      return t && !t.seededBy && !t.types.includes('grass') ? 0.35 : 0;
    }
    default:
      break;
  }
  if (move.heal) return hpFrac < 0.5 ? (1 - hpFrac) * 0.8 : 0;
  if (move.status || move.confuse) {
    const t = targets[0] ? b.at(targets[0]) : null;
    if (!t || t.status || (move.powder && t.types.includes('grass'))) return 0;
    const acc = move.accuracy === true ? 1 : move.accuracy / 100;
    return (move.status === 'slp' ? 0.5 : 0.35) * acc;
  }
  if (move.selfBoosts && (move.target === 'self' || move.target === 'ally-side')) {
    const total = Object.values(mon.boosts).reduce((a, v) => a + Math.max(0, v), 0);
    return hpFrac > 0.6 && total < 2 ? 0.25 : 0.02;
  }
  if (move.boosts) {
    const stats = Object.keys(move.boosts) as (keyof typeof mon.boosts)[];
    let s = 0;
    for (const t of targets) {
      const target = b.at(t);
      if (!target) continue;
      if (stats.every((st) => target.boosts[st] > -2)) s += 0.1;
    }
    return s;
  }
  return 0.01;
}
