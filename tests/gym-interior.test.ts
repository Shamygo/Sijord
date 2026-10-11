import { describe, expect, it } from 'vitest';
import { GYMS } from '../src/shared/gyms';
import { blockers, gymInterior, gymState, hitsRect, interiorAt, newlySolved, toWorld, unsafeAt, type Chamber, type GymInterior, type GymProgress } from '../src/shared/gym-interior';

type P = { x: number; z: number };
const STEP = 0.5;
const PAD = 0.35;

/**
 * Can someone walk from `from` to any point matching `goal`, with `others` standing still?
 * Plates under the walker count only where the walker is at that moment.
 */
function reach(it: GymInterior, c: Chamber, from: P, others: P[], goal: (p: P) => boolean, progress: GymProgress = { solved: [] }): P | null {
  const key = (p: P) => `${Math.round(p.x / STEP)},${Math.round(p.z / STEP)}`;
  const seen = new Set([key(from)]);
  const queue: P[] = [from];
  while (queue.length) {
    const p = queue.shift()!;
    if (goal(p)) return p;
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const q = { x: p.x + dx, z: p.z + dz };
      if (q.z < c.z0 + 0.5 || q.z > c.z1 - 0.5 || Math.abs(q.x) > 17.5) continue;
      const k = key(q);
      if (seen.has(k)) continue;
      const people = [q, ...others];
      const state = gymState(it, people, progress);
      if (hitsRect(blockers(it, state), q.x, q.z, PAD) || unsafeAt(it, state, progress, q.x, q.z)) continue;
      seen.add(k);
      queue.push(q);
    }
  }
  return null;
}

const inGoal = (c: Chamber) => (p: P) => p.x >= c.goal.x0 && p.x <= c.goal.x1 && p.z >= c.goal.z0 + 0.6 && p.z <= c.goal.z1 - 0.6;
const onPlate = (c: Chamber, i: number) => (p: P) => Math.hypot(p.x - c.plates[i].x, p.z - c.plates[i].z) < c.plates[i].r - 0.2;

describe('gym interiors', () => {
  it('give every gym its own slot over the northern sea', () => {
    const seen = new Set<string>();
    for (const g of GYMS) {
      const it2 = gymInterior(g);
      expect(it2.chambers.map((c) => c.kind).sort()).toEqual(['hazard', 'mirror', 'relay']);
      const w = toWorld(it2, it2.spawn);
      expect(interiorAt(w.x, w.z)?.interior.gym.id).toBe(g.id);
      seen.add(`${it2.ox}`);
    }
    expect(seen.size).toBe(GYMS.length);
    expect(interiorAt(0, 0)).toBeNull();
  });

  for (const g of GYMS.slice(0, 6)) {
    const it2 = gymInterior(g);
    for (const c of it2.chambers) {
      it(`${g.id} chamber ${c.index} (${c.kind}) can't be solved alone`, () => {
        expect(reach(it2, c, c.reset, [], inGoal(c))).toBeNull();
      });

      it(`${g.id} chamber ${c.index} (${c.kind}) can be solved by two`, () => {
        // One holds the first plate; the other gets to the second plate; then both reach the goal.
        const holder = reach(it2, c, c.reset, [], onPlate(c, 0));
        expect(holder).not.toBeNull();
        const runner = reach(it2, c, c.reset, [holder!], onPlate(c, 1));
        expect(runner).not.toBeNull();
        const holderDone = reach(it2, c, holder!, [runner!], inGoal(c));
        expect(holderDone).not.toBeNull();
        const runnerDone = reach(it2, c, runner!, [holderDone!], inGoal(c));
        expect(runnerDone).not.toBeNull();
        expect(newlySolved(it2, [holderDone!, runnerDone!], { solved: [] })).toContain(c.index);
      });
    }
  }

  it('keeps solved chambers open and the hall shut until the trainers are beaten', () => {
    const it2 = gymInterior(GYMS[0]);
    const closed = gymState(it2, [], { solved: [] });
    expect(closed.open.has('exit-0')).toBe(false);
    const solved = gymState(it2, [], { solved: [0, 1], trainers: false });
    expect(solved.open.has('exit-0')).toBe(true);
    expect(solved.open.has('exit-1')).toBe(true);
    expect(solved.open.has('hall')).toBe(false);
    expect(gymState(it2, [], { solved: [0, 1], trainers: true }).open.has('hall')).toBe(true);
  });
});
