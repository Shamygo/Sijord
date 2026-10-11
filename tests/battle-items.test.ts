import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/shared/battle/ai';
import { createCreature, type CreateOptions } from '../src/shared/battle/creature';
import { Battle, disobeyChance, TYPE_BOOSTERS, type BattleEvent, type Choice, type Pos } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { statTable, type Creature } from '../src/shared/battle/types';
import { ITEMS } from '../src/shared/items';

/** Held items for bosses and players, and over-cap disobedience (DESIGN §3.5). */

const P0: Pos = { side: 0, slot: 0 };
const F0: Pos = { side: 1, slot: 0 };

let uid = 0;
function mon(species: string, level: number, moves: string[], opts: CreateOptions = {}): Creature {
  return createCreature(species, level, new Rng(99), { nature: 'hardy', ivs: statTable(20), moves, uid: `h${uid++}`, ...opts });
}

function battle(player: Creature[], foes: Creature[], opts: { seed?: number; cap?: number } = {}): Battle {
  const b = new Battle({
    seed: opts.seed ?? 5,
    kind: 'trainer',
    sides: [
      { teams: [{ owner: 'p1', name: 'Ash', creatures: player, levelCap: opts.cap ?? 100 }], slots: ['p1', 'p1'] },
      { teams: [{ owner: 'foe', name: 'Rival', creatures: foes, ai: 't1' }], slots: ['foe', 'foe'] },
    ],
  });
  b.start();
  return b;
}

const scripted = (choices: Record<string, Choice> = {}) => (b: Battle, pos: Pos, kind: 'move' | 'replace'): Choice =>
  kind === 'replace' ? chooseAction(b, pos, kind) : choices[`${pos.side}:${pos.slot}`] ?? { kind: 'move', move: 0, target: P0 };

function turn(b: Battle, mine: Choice, foe: Record<string, Choice> = {}): BattleEvent[] {
  if (b.at(P0)) b.choose(P0, mine);
  return b.resolve(scripted(foe));
}

/** Damage the first player creature deals to the first foe with one move, same seed. */
function hitFor(attacker: Creature, defender: Creature, seed = 5): number {
  const b = battle([attacker], [defender], { seed });
  const before = b.at(F0)!.hp;
  turn(b, { kind: 'move', move: 0, target: F0 }, { '1:0': { kind: 'move', move: 0, target: P0 } });
  return before - b.at(F0)!.hp;
}

describe('held items', () => {
  it('are all listed in the bag as battle items', () => {
    for (const id of [...Object.keys(TYPE_BOOSTERS), 'leftovers', 'life-orb', 'focus-sash', 'expert-belt', 'assault-vest', 'lum-berry', 'rocky-helmet', 'eviolite']) {
      expect(ITEMS[id]?.held, id).toBe(true);
      expect(ITEMS[id].category).toBe('battle');
    }
  });

  it('Leftovers heal 1/16 at the end of the turn', () => {
    const me = mon('nibblet', 30, ['growl'], { item: 'leftovers' });
    const b = battle([me], [mon('nibblet', 30, ['tackle'])]);
    const ev = turn(b, { kind: 'move', move: 0, target: F0 }).filter((e) => e.t === 'heal');
    const m = b.at(P0)!;
    expect(ev.length).toBe(1);
    expect(m.hp).toBeLessThan(m.maxHp);
  });

  it('Life Orb hits 30% harder and costs a tenth of max HP', () => {
    const plain = hitFor(mon('nibblet', 50, ['tackle']), mon('nibblet', 50, ['growl']));
    const orb = mon('nibblet', 50, ['tackle'], { item: 'life-orb' });
    const b = battle([orb], [mon('nibblet', 50, ['growl'])]);
    const before = b.at(F0)!.hp;
    turn(b, { kind: 'move', move: 0, target: F0 }, { '1:0': { kind: 'move', move: 0, target: P0 } });
    expect(before - b.at(F0)!.hp).toBeGreaterThan(plain * 1.2);
    expect(b.at(P0)!.maxHp - b.at(P0)!.hp).toBe(Math.floor(b.at(P0)!.maxHp / 10));
  });

  it('a type booster powers only its own type', () => {
    const plain = hitFor(mon('cindlet', 30, ['ember']), mon('nibblet', 30, ['growl']));
    const boosted = hitFor(mon('cindlet', 30, ['ember'], { item: 'charcoal' }), mon('nibblet', 30, ['growl']));
    const wrong = hitFor(mon('cindlet', 30, ['ember'], { item: 'mystic-water' }), mon('nibblet', 30, ['growl']));
    expect(boosted).toBeGreaterThan(plain);
    expect(wrong).toBe(plain);
  });

  it('Focus Sash leaves a full-health holder on 1 HP, once', () => {
    const b = battle([mon('alakazam', 80, ['psychic'])], [mon('nibblet', 10, ['growl'], { item: 'focus-sash' }), mon('nibblet', 10, ['growl'])]);
    turn(b, { kind: 'move', move: 0, target: F0 });
    const foe = b.at(F0)!;
    expect(foe.hp).toBe(1);
    expect(foe.item).toBeUndefined();
  });

  it('Rocky Helmet hurts whoever makes contact', () => {
    const b = battle([mon('nibblet', 30, ['tackle'])], [mon('geodude', 30, ['defense-curl'], { item: 'rocky-helmet' })]);
    turn(b, { kind: 'move', move: 0, target: F0 });
    const m = b.at(P0)!;
    expect(m.maxHp - m.hp).toBe(Math.floor(m.maxHp / 6));
  });

  it('Lum Berry cures a status the moment it lands', () => {
    const b = battle([mon('pikachu', 30, ['thunder-wave'])], [mon('nibblet', 30, ['growl'], { item: 'lum-berry' })]);
    turn(b, { kind: 'move', move: 0, target: F0 });
    const foe = b.at(F0)!;
    expect(foe.status).toBeUndefined();
    expect(foe.item).toBeUndefined();
  });

  it('Assault Vest softens special hits only', () => {
    const special = hitFor(mon('cindlet', 30, ['ember']), mon('nibblet', 30, ['growl']));
    const vest = hitFor(mon('cindlet', 30, ['ember']), mon('nibblet', 30, ['growl'], { item: 'assault-vest' }));
    expect(vest).toBeLessThan(special);
    const phys = hitFor(mon('nibblet', 30, ['tackle']), mon('nibblet', 30, ['growl']));
    const physVest = hitFor(mon('nibblet', 30, ['tackle']), mon('nibblet', 30, ['growl'], { item: 'assault-vest' }));
    expect(physVest).toBe(phys);
  });
});

describe('disobedience', () => {
  it('starts above the cap and climbs to 85%', () => {
    const team = { owner: 'p1', name: 'Ash', creatures: [], levelCap: 20 };
    expect(disobeyChance(20, team)).toBe(0);
    expect(disobeyChance(21, team)).toBeCloseTo(0.16);
    expect(disobeyChance(25, team)).toBeCloseTo(0.4);
    expect(disobeyChance(60, team)).toBe(0.85);
    expect(disobeyChance(22, { ...team, obedienceBonus: 3 })).toBe(0);
    expect(disobeyChance(80, { ...team, ai: 't1' })).toBe(0);
  });

  it('makes a far over-cap Pokémon ignore orders some of the time', () => {
    let ignored = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = battle([mon('nibblet', 70, ['tackle'])], [mon('geodude', 70, ['defense-curl'])], { seed, cap: 15 });
      const ev = turn(b, { kind: 'move', move: 0, target: F0 });
      if (!ev.some((e) => e.t === 'move' && e.pos.side === 0)) ignored++;
    }
    expect(ignored).toBeGreaterThan(15);
    expect(ignored).toBeLessThan(40);
  });
});
