import { moveData } from '../data/moves';
import type { Battle, Choice, Pos } from './engine';
import type { MoveData } from './types';

/**
 * Computer opponents (DESIGN §4.5). Two tiers so far:
 *
 * - `wild`: instinct. Prefers its strongest attack but often just does something.
 * - `t1`: early trainers and the first rival. One-ply greedy: scores every move and target by
 *   expected damage (with a big bonus for knock-outs) and sensible value for status moves, then
 *   picks the best, with a 15% chance of a human-like mistake.
 *
 * The AI never sees what the player has chosen this turn.
 */
export function chooseAction(b: Battle, pos: Pos, kind: 'move' | 'replace'): Choice {
  const mon = b.at(pos);
  const owner = b.slotOwner(pos);
  if (kind === 'replace') {
    const team = b.team(owner);
    const bench = b.bench(owner);
    if (!bench.length) return { kind: 'pass' };
    // Send in whatever hits the current foes hardest.
    let best = bench[0];
    let bestScore = -Infinity;
    for (const m of bench) {
      const score = m.moves.reduce((acc, s) => Math.max(acc, moveData(s.id).power), 0) + m.hp / m.maxHp * 20;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return { kind: 'switch', team: team.indexOf(best) };
  }
  if (!mon) return { kind: 'pass' };
  const tier = b.teamSetup(owner)?.ai ?? 'wild';
  const options = scoreOptions(b, pos);
  if (!options.length) return { kind: 'move', move: -1 };
  const mistake = tier === 'wild' ? 0.35 : 0.15;
  if (b.rng.next() < mistake) return b.rng.pick(options).choice;
  // Small jitter so equal options don't always resolve the same way.
  let best = options[0];
  let bestScore = -Infinity;
  for (const o of options) {
    const s = o.score * (0.95 + b.rng.next() * 0.1);
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return best.choice;
}

interface Option {
  choice: Choice;
  score: number;
}

function scoreOptions(b: Battle, pos: Pos): Option[] {
  const mon = b.at(pos)!;
  const out: Option[] = [];
  mon.moves.forEach((slot, i) => {
    if (slot.pp <= 0) return;
    const move = moveData(slot.id);
    if (move.target === 'normal' || move.target === 'adjacent-foe') {
      for (const t of b.foesOf(pos)) out.push({ choice: { kind: 'move', move: i, target: t }, score: scoreMove(b, pos, move, [t]) });
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
