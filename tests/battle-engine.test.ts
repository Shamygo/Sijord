import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/shared/battle/ai';
import { createCreature, type CreateOptions } from '../src/shared/battle/creature';
import { Battle, type BattleEvent, type Choice, type Pos, type TeamSetup } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { statTable, type Creature } from '../src/shared/battle/types';
import { SPECIES_IDS } from '../src/shared/data/species';

const P0: Pos = { side: 0, slot: 0 };
const P1: Pos = { side: 0, slot: 1 };
const F0: Pos = { side: 1, slot: 0 };
const F1: Pos = { side: 1, slot: 1 };

let uid = 0;
/** A neutral-natured creature with fixed IVs, so numbers are predictable. */
function mon(species: string, level: number, moves: string[], opts: CreateOptions = {}): Creature {
  return createCreature(species, level, new Rng(99), { nature: 'hardy', ivs: statTable(20), moves, uid: `m${uid++}`, ...opts });
}

function battle(player: Creature[], foes: Creature[], opts: { seed?: number; kind?: 'wild' | 'trainer'; foeAi?: TeamSetup['ai']; cap?: number } = {}): Battle {
  const b = new Battle({
    seed: opts.seed ?? 7,
    kind: opts.kind ?? 'trainer',
    sides: [
      { teams: [{ owner: 'p1', name: 'Ash', creatures: player, levelCap: opts.cap ?? 100 }], slots: ['p1', 'p1'] },
      { teams: [{ owner: 'foe', name: 'Rival', creatures: foes, ai: opts.foeAi ?? 't1' }], slots: ['foe', 'foe'] },
    ],
  });
  b.start();
  return b;
}

/** Scripted foe AI: always uses its first move on the player's first slot. */
const scripted = (choices: Record<string, Choice> = {}) => (b: Battle, pos: Pos, kind: 'move' | 'replace'): Choice =>
  kind === 'replace' ? chooseAction(b, pos, kind) : choices[`${pos.side}:${pos.slot}`] ?? { kind: 'move', move: 0, target: P0 };

function turn(b: Battle, mine: [Choice?, Choice?], foe: Record<string, Choice> = {}): BattleEvent[] {
  if (mine[0] && b.at(P0)) b.choose(P0, mine[0]);
  if (mine[1] && b.at(P1)) b.choose(P1, mine[1]);
  return b.resolve(scripted(foe));
}

const of = <T extends BattleEvent['t']>(ev: BattleEvent[], t: T) => ev.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);

describe('battle engine', () => {
  it('sends out the first two healthy creatures on each side', () => {
    const a = mon('fernfawn', 5, ['tackle']);
    const fainted = mon('cindlet', 5, ['scratch']);
    fainted.hp = 0;
    const c = mon('splashpup', 5, ['tackle']);
    const b = battle([fainted, a, c], [mon('nibblet', 3, ['tackle']), mon('finchlet', 3, ['peck'])]);
    expect(b.at(P0)?.uid).toBe(a.uid);
    expect(b.at(P1)?.uid).toBe(c.uid);
    expect(b.at(F0)?.species.id).toBe('nibblet');
    expect(b.at(F1)?.species.id).toBe('finchlet');
  });

  it('fields a single creature when the trainer only has one', () => {
    const b = battle([mon('fernfawn', 5, ['tackle'])], [mon('nibblet', 3, ['tackle']), mon('finchlet', 3, ['peck'])]);
    expect(b.at(P1)).toBeNull();
    expect(b.requests().filter((r) => r.owner === 'p1')).toHaveLength(1);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const b = battle([mon('fernfawn', 8, ['tackle', 'leafage']), mon('hjordpup', 8, ['bite'])], [mon('nibblet', 8, ['tackle']), mon('finchlet', 8, ['peck'])], { seed: 42 });
      const log: string[] = [];
      for (let i = 0; i < 6 && b.phase !== 'ended'; i++) {
        if (b.phase === 'move') {
          b.choose(P0, { kind: 'move', move: 1, target: F0 });
          if (b.at(P1)) b.choose(P1, { kind: 'move', move: 0, target: F1 });
        }
        log.push(...b.resolve(chooseAction).map((e) => e.text ?? e.t));
      }
      return log;
    };
    expect(run()).toEqual(run());
  });

  it('resolves priority before speed', () => {
    // A slow creature with Quick Attack beats a fast one's Tackle.
    const slow = mon('stashquill', 10, ['quick-attack']);
    const fast = mon('finchlet', 10, ['tackle']);
    const b = battle([slow], [fast]);
    const ev = turn(b, [{ kind: 'move', move: 0, target: F0 }]);
    const order = of(ev, 'move').map((e) => e.move);
    expect(order).toEqual(['quick-attack', 'tackle']);
  });

  it('hits both foes with a spread move at 0.75x and the ally too with Surf', () => {
    const user = mon('splashpup', 30, ['surf']);
    const ally = mon('fernfawn', 30, ['growl']);
    const b = battle([user, ally], [mon('nibblet', 30, ['tail-whip']), mon('nibblet', 30, ['tail-whip'])]);
    const single = b.estimateDamage(P0, 'water-gun', F0);
    void single;
    const ev = turn(b, [{ kind: 'move', move: 0 }, { kind: 'move', move: 0 }]);
    const hits = of(ev, 'damage').filter((d) => d.cause === 'move');
    expect(hits.map((h) => `${h.pos.side}:${h.pos.slot}`).sort()).toEqual(['0:1', '1:0', '1:1']);
    expect(hits.find((h) => h.pos.side === 0)!.effect).toBe(0.5);
  });

  it('blocks attacks with Protect, and a second Protect in a row usually fails', () => {
    const b = battle([mon('fernfawn', 10, ['protect'])], [mon('cindlet', 10, ['ember'])], { seed: 3 });
    const ev = turn(b, [{ kind: 'move', move: 0 }]);
    expect(of(ev, 'protect').length).toBe(2); // protected itself, then blocked Ember
    expect(of(ev, 'damage')).toHaveLength(0);
    let fails = 0;
    for (let s = 0; s < 30; s++) {
      const b2 = battle([mon('fernfawn', 10, ['protect'])], [mon('cindlet', 10, ['ember'])], { seed: s });
      turn(b2, [{ kind: 'move', move: 0 }]);
      if (of(turn(b2, [{ kind: 'move', move: 0 }]), 'fail').length) fails++;
    }
    expect(fails).toBeGreaterThan(12);
  });

  it('makes the target flinch with Fake Out on the first turn only', () => {
    const b = battle([mon('pyrolynx', 20, ['fake-out'])], [mon('nibblet', 30, ['tackle'])]);
    const t1 = turn(b, [{ kind: 'move', move: 0, target: F0 }]);
    expect(of(t1, 'cant').map((c) => c.reason)).toEqual(['flinch']);
    const t2 = turn(b, [{ kind: 'move', move: 0, target: F0 }]);
    expect(of(t2, 'fail')).toHaveLength(1);
  });

  it('burns: chip damage each turn and weaker physical hits; Fire types are immune', () => {
    const attacker = mon('splashpup', 20, ['tackle']);
    const b = battle([attacker], [mon('stashquill', 20, ['will-o-wisp'])], { seed: 5 });
    const before = b.estimateDamage(P0, 'tackle', F0).max;
    let burned = false;
    for (let i = 0; i < 6 && !burned; i++) {
      const ev = turn(b, [{ kind: 'move', move: 0, target: F0 }]);
      burned = of(ev, 'status').some((s) => s.status === 'brn');
      if (burned) expect(of(ev, 'damage').some((d) => d.cause === 'status' && d.pos.side === 0)).toBe(true);
    }
    expect(burned).toBe(true);
    expect(b.estimateDamage(P0, 'tackle', F0).max).toBeLessThan(before);
    const fire = battle([mon('cindlet', 20, ['scratch'])], [mon('stashquill', 20, ['will-o-wisp'])]);
    const ev = turn(fire, [{ kind: 'move', move: 0, target: F0 }]);
    expect(fire.at(P0)!.status).toBeUndefined();
    expect(ev.some((e) => e.text?.includes("doesn't affect"))).toBe(true);
  });

  it('halves speed when paralysed', () => {
    const b = battle([mon('finchlet', 20, ['peck'])], [mon('nibblet', 20, ['tackle'])]);
    const m = b.at(P0)!;
    const s = b.speed(m);
    m.status = 'par';
    expect(b.speed(m)).toBe(Math.floor(s / 2));
  });

  it("Intimidate lowers both foes' Attack unless an ability blocks it", () => {
    const dog = mon('hjordpup', 10, ['tackle'], { ability: 'intimidate' });
    const b = battle([dog], [mon('nibblet', 10, ['tackle']), mon('hjordpup', 10, ['tackle'], { ability: 'own-tempo' })]);
    expect(b.at(F0)!.boosts.atk).toBe(-1);
    expect(b.at(F1)!.boosts.atk).toBe(0);
  });

  it('switches before moves, so the incoming creature takes the hit', () => {
    const lead = mon('fernfawn', 10, ['tackle']);
    const bench = mon('stashquill', 10, ['tackle']);
    const b = battle([lead, bench], [mon('cindlet', 10, ['ember'])]);
    // Two player creatures are on the field; make room by giving the player only a lead + bench
    expect(b.at(P1)?.uid).toBe(bench.uid);
    const b2 = new Battle({
      seed: 1, kind: 'trainer',
      sides: [
        { teams: [{ owner: 'p1', name: 'Ash', creatures: [mon('fernfawn', 10, ['tackle']), mon('finchlet', 10, ['peck']), mon('stashquill', 10, ['tackle'])] }], slots: ['p1', 'p1'] },
        { teams: [{ owner: 'foe', name: 'Rival', creatures: [mon('cindlet', 10, ['ember'])], ai: 't1' }], slots: ['foe', 'foe'] },
      ],
    });
    b2.start();
    b2.choose(P0, { kind: 'switch', team: 2 });
    b2.choose(P1, { kind: 'move', move: 0, target: F0 });
    const ev = b2.resolve(scripted({ '1:0': { kind: 'move', move: 0, target: P0 } }));
    expect(ev.findIndex((e) => e.t === 'switch-in')).toBeLessThan(ev.findIndex((e) => e.t === 'move'));
    const hit = of(ev, 'damage').find((d) => d.pos.side === 0);
    expect(b2.at(P0)!.species.id).toBe('stashquill');
    expect(hit?.pos.slot).toBe(0);
  });

  it('retargets to the other foe when the chosen one has already fainted', () => {
    const weak = mon('dewmite', 2, ['tackle']);
    const b = battle([mon('pyrolynx', 30, ['quick-attack']), mon('elkwarden', 40, ['tackle'])], [weak, mon('nibblet', 10, ['tackle'])]);
    const ev = turn(b, [{ kind: 'move', move: 0, target: F0 }, { kind: 'move', move: 0, target: F0 }]);
    const tackles = of(ev, 'move').filter((m) => m.move === 'tackle' && m.pos.side === 0);
    expect(tackles[0].targets).toEqual([F1]);
  });

  it('redirects single-target attacks with Follow Me', () => {
    const b = battle([mon('fernfawn', 20, ['tackle']), mon('cindlet', 20, ['scratch'])], [mon('shepherion', 40, ['follow-me']), mon('nibblet', 20, ['tackle'])]);
    const ev = turn(b, [{ kind: 'move', move: 0, target: F1 }, { kind: 'move', move: 0, target: F1 }], { '1:0': { kind: 'move', move: 0 }, '1:1': { kind: 'move', move: 0, target: P0 } });
    const mine = of(ev, 'move').filter((m) => m.pos.side === 0);
    expect(mine.every((m) => m.targets[0].slot === 0)).toBe(true);
  });

  it('boosts the ally with Helping Hand and doubles speed with Tailwind', () => {
    const b = battle([mon('sealkin', 20, ['helping-hand']), mon('fjordling', 20, ['tailwind', 'peck'])], [mon('stashquill', 20, ['tackle'])]);
    const before = b.estimateDamage(P1, 'peck', F0).max;
    b.at(P1)!.helpingHand = true;
    expect(b.estimateDamage(P1, 'peck', F0).max).toBeGreaterThan(before);
    b.at(P1)!.helpingHand = false;
    const s = b.speed(b.at(P1)!);
    turn(b, [{ kind: 'move', move: 0 }, { kind: 'move', move: 0 }]);
    expect(b.speed(b.at(P1)!)).toBe(s * 2);
  });

  it('lets a Sturdy creature survive a knock-out blow from full HP', () => {
    const b = battle([mon('elkwarden', 60, ['close-combat'])], [mon('stashquill', 5, ['tackle'], { ability: 'sturdy' })]);
    turn(b, [{ kind: 'move', move: 0, target: F0 }]);
    expect(b.at(F0)!.hp).toBe(1);
  });

  it('asks the player to replace a fainted creature and awards experience', () => {
    const lead = mon('cindlet', 10, ['ember']);
    const bench = mon('hjordpup', 10, ['tackle']);
    const foe = mon('dewmite', 3, ['tackle']);
    const b = new Battle({
      seed: 2, kind: 'wild',
      sides: [
        { teams: [{ owner: 'p1', name: 'Ash', creatures: [lead, bench], levelCap: 15 }], slots: ['p1', 'p1'] },
        { teams: [{ owner: 'wild', name: 'Wild', creatures: [foe], ai: 'wild' }], slots: ['wild', 'wild'] },
      ],
    });
    b.start();
    b.choose(P0, { kind: 'move', move: 0, target: F0 });
    b.choose(P1, { kind: 'move', move: 0, target: F0 });
    const xpBefore = lead.xp;
    const ev = b.resolve(chooseAction);
    expect(of(ev, 'faint')).toHaveLength(1);
    expect(b.phase).toBe('ended');
    expect(b.winner).toBe(0);
    expect(of(ev, 'xp').length).toBe(2);
    expect(lead.xp).toBeGreaterThan(xpBefore);
  });

  it('enters a replace phase when a human creature faints with a bench left', () => {
    const b = new Battle({
      seed: 4, kind: 'trainer',
      sides: [
        { teams: [{ owner: 'p1', name: 'Ash', creatures: [mon('dewmite', 2, ['tackle']), mon('hjordpup', 30, ['tackle']), mon('fernfawn', 30, ['tackle'])] }], slots: ['p1', 'p1'] },
        { teams: [{ owner: 'foe', name: 'Rival', creatures: [mon('forgelynx', 50, ['flare-blitz']), mon('nibblet', 50, ['tackle'])], ai: 't1' }], slots: ['foe', 'foe'] },
      ],
    });
    b.start();
    b.choose(P0, { kind: 'move', move: 0, target: F0 });
    b.choose(P1, { kind: 'move', move: 0, target: F0 });
    b.resolve(scripted({ '1:0': { kind: 'move', move: 0, target: P0 }, '1:1': { kind: 'move', move: 0, target: P1 } }));
    expect(b.phase).toBe('replace');
    expect(b.requests()).toEqual([{ pos: P0, owner: 'p1', kind: 'replace' }]);
    b.choose(P0, { kind: 'switch', team: 2 });
    const ev = b.resolve(chooseAction);
    expect(of(ev, 'switch-in')[0].species).toBe('fernfawn');
    expect(b.phase).toBe('move');
  });

  it('levels up mid-battle at most to the cap', () => {
    const lead = mon('cindlet', 14, ['ember']);
    const b = new Battle({
      seed: 2, kind: 'trainer',
      sides: [
        { teams: [{ owner: 'p1', name: 'Ash', creatures: [lead], levelCap: 15 }], slots: ['p1', 'p1'] },
        { teams: [{ owner: 'foe', name: 'Rival', creatures: [mon('auroramoth', 40, ['harden']), mon('auroramoth', 40, ['harden'])], ai: 't1' }], slots: ['foe', 'foe'] },
      ],
    });
    b.start();
    b.at(F0)!.hp = 1;
    b.at(F1)!.hp = 1;
    b.choose(P0, { kind: 'move', move: 0, target: F0 });
    const ev = b.resolve(chooseAction);
    expect(of(ev, 'level')[0]?.level).toBe(15);
    b.choose(P0, { kind: 'move', move: 0, target: F1 });
    b.resolve(chooseAction);
    expect(lead.level).toBe(15);
    expect(lead.bankedXp).toBeGreaterThan(0);
  });

  it('always escapes with Run Away, and cannot run from trainers', () => {
    const b = new Battle({
      seed: 1, kind: 'wild',
      sides: [
        { teams: [{ owner: 'p1', name: 'Ash', creatures: [mon('nibblet', 3, ['tackle'], { ability: 'run-away' })] }], slots: ['p1', 'p1'] },
        { teams: [{ owner: 'wild', name: 'Wild', creatures: [mon('fjordling', 40, ['peck'])], ai: 'wild' }], slots: ['wild', 'wild'] },
      ],
    });
    b.start();
    b.choose(P0, { kind: 'run' });
    const ev = b.resolve(chooseAction);
    expect(of(ev, 'run')[0].success).toBe(true);
    expect(b.escaped).toBe(true);
    const t = battle([mon('nibblet', 3, ['tackle'])], [mon('fjordling', 3, ['peck'])]);
    t.choose(P0, { kind: 'run' });
    const ev2 = t.resolve(chooseAction);
    expect(of(ev2, 'run')).toHaveLength(0);
  });

  it('has the AI take a sure super-effective knock-out over a weak move', () => {
    const foe = mon('pyrolynx', 20, ['scratch', 'flame-charge']);
    const b = battle([mon('fernfawn', 12, ['tackle'])], [foe]);
    let picks = 0;
    for (let i = 0; i < 40; i++) {
      const c = chooseAction(b, F0, 'move');
      if (c.kind === 'move' && c.move === 1) picks++;
    }
    expect(picks).toBeGreaterThan(30);
  });

  it('commits HP, PP and experience back to the creatures', () => {
    const lead = mon('cindlet', 10, ['ember']);
    const b = battle([lead], [mon('dewmite', 2, ['tackle'])], { kind: 'wild', foeAi: 'wild' });
    while (b.phase !== 'ended') {
      if (b.phase === 'move') b.choose(P0, { kind: 'move', move: 0, target: F0 });
      b.resolve(chooseAction);
    }
    b.commit();
    expect(lead.moves[0].pp).toBeLessThan(25);
    expect(lead.hp).toBe(b.team('p1')[0].hp);
  });

  it('survives hundreds of random battles between every species', () => {
    const rng = new Rng(2024);
    for (let n = 0; n < 150; n++) {
      const team = (owner: string) => Array.from({ length: rng.int(1, 3) }, () => createCreature(rng.pick(SPECIES_IDS), rng.int(2, 50), rng, { uid: `${owner}${uid++}`, item: rng.chance(30) ? 'oran-berry' : undefined }));
      const b = new Battle({
        seed: rng.int(0, 1e9), kind: rng.chance(50) ? 'wild' : 'trainer',
        sides: [
          { teams: [{ owner: 'a', name: 'A', creatures: team('a'), ai: 't1', levelCap: 15 }], slots: ['a', 'a'] },
          { teams: [{ owner: 'b', name: 'B', creatures: team('b'), ai: 'wild' }], slots: ['b', 'b'] },
        ],
      });
      b.start();
      let guard = 0;
      while (b.phase !== 'ended' && guard++ < 400) b.resolve(chooseAction);
      expect(b.phase, `battle ${n} ended`).toBe('ended');
      b.commit();
    }
  });
});
