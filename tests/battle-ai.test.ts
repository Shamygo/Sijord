import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/shared/battle/ai';
import { createCreature, type CreateOptions } from '../src/shared/battle/creature';
import { Battle, type AiKind, type Choice, type Pos } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { statTable, type Creature } from '../src/shared/battle/types';

/** Boss tiers (DESIGN §4.5): joint planning, threat reading and switching. */

const P0: Pos = { side: 0, slot: 0 };
const P1: Pos = { side: 0, slot: 1 };
const F0: Pos = { side: 1, slot: 0 };
const F1: Pos = { side: 1, slot: 1 };

let uid = 0;
function mon(species: string, level: number, moves: string[], opts: CreateOptions = {}): Creature {
  return createCreature(species, level, new Rng(99), { nature: 'hardy', ivs: statTable(20), moves, uid: `a${uid++}`, ...opts });
}

function battle(player: Creature[], foes: Creature[], ai: AiKind, seed: number): Battle {
  const b = new Battle({
    seed,
    kind: 'trainer',
    sides: [
      { teams: [{ owner: 'p1', name: 'Ash', creatures: player, levelCap: 100 }], slots: ['p1', 'p1'] },
      { teams: [{ owner: 'boss', name: 'Leader', creatures: foes, ai }], slots: ['boss', 'boss'] },
    ],
  });
  b.start();
  return b;
}

const targetOf = (c: Choice) => (c.kind === 'move' && c.target ? `${c.target.side}:${c.target.slot}` : c.kind);

/** Run the boss's choice for both slots over many seeds and count what happened. */
function tally(make: (seed: number) => Battle, judge: (a: Choice, b: Choice, battle: Battle) => boolean, runs = 40): number {
  let n = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const b = make(seed);
    if (judge(chooseAction(b, F0, 'move'), chooseAction(b, F1, 'move'), b)) n++;
  }
  return n;
}

describe('boss AI', () => {
  it('focuses fire when only both attacks together knock a target out', () => {
    const n = tally((seed) => {
      const b = battle([mon('nibblet', 50, ['growl']), mon('nibblet', 50, ['growl'])], [mon('nibblet', 50, ['tackle']), mon('nibblet', 50, ['tackle'])], 't4', seed);
      const est = b.estimateDamage(F0, 'tackle', P0);
      b.at(P0)!.hp = est.max + 1;
      return b;
    }, (a, c) => targetOf(a) === '0:0' && targetOf(c) === '0:0');
    expect(n).toBeGreaterThan(32);
  });

  it("doesn't pile a second attack onto a sure knock-out", () => {
    const n = tally((seed) => {
      const b = battle([mon('nibblet', 50, ['growl']), mon('nibblet', 50, ['growl'])], [mon('nibblet', 50, ['tackle']), mon('nibblet', 50, ['tackle'])], 't4', seed);
      b.at(P0)!.hp = 1;
      return b;
    }, (a, c) => targetOf(a) !== targetOf(c));
    expect(n).toBeGreaterThan(32);
  });

  it('protects when a faster foe can knock it out', () => {
    const n = tally((seed) => battle(
      [mon('alakazam', 60, ['psychic']), mon('nibblet', 60, ['growl'])],
      [mon('nibblet', 20, ['tackle', 'protect']), mon('nibblet', 20, ['tackle'])],
      't2', seed,
    ), (a) => a.kind === 'move' && a.move === 1);
    expect(n).toBeGreaterThan(30);
  });

  it('t3 switches out of a losing matchup, t2 does not', () => {
    const make = (ai: AiKind) => (seed: number) => battle(
      [mon('poliwhirl', 50, ['water-gun']), mon('nibblet', 50, ['growl'])],
      [mon('geodude', 30, ['tackle']), mon('nibblet', 30, ['tackle']), mon('gloom', 30, ['absorb'])],
      ai, seed,
    );
    const switched = (a: Choice) => a.kind === 'switch' && a.team === 2;
    expect(tally(make('t3'), switched)).toBeGreaterThan(30);
    expect(tally(make('t2'), switched)).toBe(0);
  });

  it('sends in the best matchup after a faint', () => {
    const b = battle(
      [mon('poliwhirl', 50, ['water-gun']), mon('poliwhirl', 50, ['water-gun'])],
      [mon('nibblet', 30, ['tackle']), mon('nibblet', 30, ['tackle']), mon('geodude', 30, ['tackle']), mon('gloom', 30, ['absorb'])],
      't3', 3,
    );
    b.at(F0)!.hp = 0;
    const c = chooseAction(b, F0, 'replace');
    expect(c).toEqual({ kind: 'switch', team: 3 });
  });
});

void P1;
