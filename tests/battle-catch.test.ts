import { describe, expect, it } from 'vitest';
import { catchChance, levelMod, rollCatch, type CatchInput } from '../src/shared/battle/catch';
import { createCreature } from '../src/shared/battle/creature';
import { Battle, type BattleEvent, type Choice, type Pos } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { statTable, type Creature } from '../src/shared/battle/types';

const P0: Pos = { side: 0, slot: 0 };
const P1: Pos = { side: 0, slot: 1 };
const F0: Pos = { side: 1, slot: 0 };
const F1: Pos = { side: 1, slot: 1 };

let uid = 0;
function mon(species: string, level: number, moves: string[]): Creature {
  return createCreature(species, level, new Rng(99), { nature: 'hardy', ivs: statTable(20), moves, uid: `c${uid++}` });
}

function wild(player: Creature[], foes: Creature[], seed = 3, kind: 'wild' | 'trainer' = 'wild'): Battle {
  const b = new Battle({
    seed,
    kind,
    sides: [
      { teams: [{ owner: 'p1', name: 'Robin', creatures: player, levelCap: 15 }], slots: ['p1', 'p1'] },
      { teams: [{ owner: 'wild', name: 'Wild', creatures: foes, ai: kind === 'wild' ? 'wild' : 't1' }], slots: ['wild', 'wild'] },
    ],
  });
  b.start();
  return b;
}

/** Foes always pass, so only our throws matter. */
const idle = (): Choice => ({ kind: 'pass' });
const of = <T extends BattleEvent['t']>(ev: BattleEvent[], t: T) => ev.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);

const base: CatchInput = { maxHp: 20, hp: 20, catchRate: 255, ball: 'poke-ball', level: 5, partyLevel: 5, cap: 15, throw: 'battle' };

describe('catch formula', () => {
  it('matches the DESIGN §5.2 level table', () => {
    expect(levelMod(-10)).toBeCloseTo(1.2, 2);
    expect(levelMod(0)).toBe(1);
    // The design table rounds this one up (the formula gives 0.613).
    expect(levelMod(3)).toBeCloseTo(0.61, 2);
    expect(levelMod(5)).toBeCloseTo(0.44, 2);
    expect(levelMod(10)).toBeCloseTo(0.22, 2);
    expect(levelMod(-40)).toBe(1.25);
  });

  it('gets easier as HP drops and with status, harder with level and in the overworld', () => {
    const full = catchChance({ ...base, catchRate: 45 });
    const weak = catchChance({ ...base, catchRate: 45, hp: 1 });
    const asleep = catchChance({ ...base, catchRate: 45, hp: 1, status: 'slp' });
    const higher = catchChance({ ...base, catchRate: 45, hp: 1, level: 10 });
    const overworld = catchChance({ ...base, catchRate: 45, throw: 'overworld' });
    const unaware = catchChance({ ...base, catchRate: 45, throw: 'unaware' });
    expect(weak).toBeGreaterThan(full);
    expect(asleep).toBeGreaterThan(weak);
    expect(higher).toBeLessThan(weak);
    expect(overworld).toBeLessThan(full);
    expect(unaware).toBeGreaterThan(full);
  });

  it('a full-HP starter-rate creature at your level is a long shot, a weakened common one is likely', () => {
    expect(catchChance({ ...base, catchRate: 45 })).toBeLessThan(0.3);
    expect(catchChance({ ...base, hp: 2 })).toBeGreaterThan(0.9);
  });

  it('halves the odds over the level cap and uses your cap as the reference level', () => {
    const atCap = catchChance({ ...base, catchRate: 45, hp: 1, level: 15, partyLevel: 30 });
    const overCap = catchChance({ ...base, catchRate: 45, hp: 1, level: 16, partyLevel: 30 });
    expect(overCap).toBeLessThan(atCap * 0.6);
  });

  it('rolls shakes whose success rate matches the chance', () => {
    const rng = new Rng(11);
    let caught = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const r = rollCatch(0.3, rng);
      if (r.caught) {
        caught++;
        expect(r.shakes).toBe(3);
      } else expect(r.shakes).toBeLessThanOrEqual(3);
    }
    expect(caught / n).toBeGreaterThan(0.27);
    expect(caught / n).toBeLessThan(0.33);
  });
});

describe('catching in battle', () => {
  it('a ball goes before moves, and a catch takes the creature off the field', () => {
    const b = wild([mon('cindlet', 5, ['scratch']), mon('hjordpup', 5, ['tackle'])], [mon('nibblet', 2, ['tackle']), mon('dewmite', 2, ['tackle'])]);
    b.at(F0)!.hp = 1;
    let ev: BattleEvent[] = [];
    let tries = 0;
    while (b.at(F0) && tries++ < 20) {
      b.choose(P0, { kind: 'ball', ball: 'poke-ball', target: F0 });
      b.choose(P1, { kind: 'pass' });
      ev = b.resolve(idle);
      expect(ev.findIndex((e) => e.t === 'throw')).toBeLessThan(Math.max(0, ev.findIndex((e) => e.t === 'move')) || 99);
    }
    expect(b.at(F0)).toBeNull();
    expect(b.caught.map((c) => c.species)).toEqual(['nibblet']);
    expect(of(ev, 'catch').at(-1)?.caught).toBe(true);
    // Catching gives experience, as in the mainline games.
    expect(of(ev, 'xp').length).toBeGreaterThan(0);
    // The other wild one is still there.
    expect(b.phase).toBe('move');
    expect(b.at(F1)?.species.id).toBe('dewmite');
  });

  it('catching the last wild creature ends the battle on the catch', () => {
    const b = wild([mon('cindlet', 5, ['scratch'])], [mon('nibblet', 2, ['tackle'])]);
    b.at(F0)!.hp = 1;
    let ev: BattleEvent[] = [];
    for (let i = 0; i < 20 && b.phase !== 'ended'; i++) {
      b.choose(P0, { kind: 'ball', ball: 'poke-ball', target: F0 });
      ev = b.resolve(idle);
    }
    expect(b.phase).toBe('ended');
    expect(b.winner).toBe(0);
    expect(of(ev, 'end')[0].reason).toBe('catch');
  });

  it('enrages a territorial creature that breaks free', () => {
    const b = wild([mon('cindlet', 5, ['scratch'])], [mon('stashquill', 15, ['tackle'])], 5);
    let enraged = false;
    for (let i = 0; i < 10 && !enraged; i++) {
      b.choose(P0, { kind: 'ball', ball: 'poke-ball', target: F0 });
      const ev = b.resolve(idle);
      if (of(ev, 'catch').some((c) => !c.caught)) enraged = of(ev, 'boost').some((x) => x.stat === 'atk' && x.amount === 1);
    }
    expect(enraged).toBe(true);
    expect(b.at(F0)!.boosts.atk).toBeGreaterThan(0);
  });

  it("refuses balls in trainer battles and at your own side", () => {
    const t = wild([mon('cindlet', 5, ['scratch'])], [mon('nibblet', 2, ['tackle'])], 3, 'trainer');
    t.choose(P0, { kind: 'ball', ball: 'poke-ball', target: F0 });
    expect(of(t.resolve(idle), 'throw')).toHaveLength(0);
    const w = wild([mon('cindlet', 5, ['scratch']), mon('hjordpup', 5, ['tackle'])], [mon('nibblet', 2, ['tackle'])]);
    w.choose(P0, { kind: 'ball', ball: 'poke-ball', target: P1 });
    expect(of(w.resolve(idle), 'throw')).toHaveLength(0);
  });
});
