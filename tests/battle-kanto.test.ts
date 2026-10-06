import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/shared/battle/ai';
import { createCreature, type CreateOptions } from '../src/shared/battle/creature';
import { calcDamage } from '../src/shared/battle/damage';
import { Battle, type BattleEvent, type Choice, type Pos, type TeamSetup } from '../src/shared/battle/engine';
import { Rng } from '../src/shared/battle/rng';
import { statTable, type Creature } from '../src/shared/battle/types';

/** Moves and abilities added with the canonical Kanto species. */

const P0: Pos = { side: 0, slot: 0 };
const P1: Pos = { side: 0, slot: 1 };
const F0: Pos = { side: 1, slot: 0 };

let uid = 0;
function mon(species: string, level: number, moves: string[], opts: CreateOptions = {}): Creature {
  return createCreature(species, level, new Rng(99), { nature: 'hardy', ivs: statTable(20), moves, uid: `k${uid++}`, ...opts });
}

function battle(player: Creature[], foes: Creature[], opts: { seed?: number; kind?: 'wild' | 'trainer'; foeAi?: TeamSetup['ai'] } = {}): Battle {
  const b = new Battle({
    seed: opts.seed ?? 11,
    kind: opts.kind ?? 'trainer',
    sides: [
      { teams: [{ owner: 'p1', name: 'Ash', creatures: player }], slots: ['p1', 'p1'] },
      { teams: [{ owner: 'foe', name: 'Rival', creatures: foes, ai: opts.foeAi ?? 't1' }], slots: ['foe', 'foe'] },
    ],
  });
  b.start();
  return b;
}

const scripted = (choices: Record<string, Choice> = {}) => (b: Battle, pos: Pos, kind: 'move' | 'replace'): Choice =>
  kind === 'replace' ? chooseAction(b, pos, kind) : choices[`${pos.side}:${pos.slot}`] ?? { kind: 'move', move: 0, target: P0 };

function turn(b: Battle, mine: [Choice?, Choice?], foe: Record<string, Choice> = {}): BattleEvent[] {
  if (mine[0] && b.at(P0)) b.choose(P0, mine[0]);
  if (mine[1] && b.at(P1)) b.choose(P1, mine[1]);
  return b.resolve(scripted(foe));
}

const use = (move = 0, target: Pos = F0): Choice => ({ kind: 'move', move, target });
const of = <T extends BattleEvent['t']>(ev: BattleEvent[], t: T) => ev.filter((e): e is Extract<BattleEvent, { t: T }> => e.t === t);
const said = (ev: BattleEvent[], text: string) => ev.some((e) => e.text?.includes(text));
const moveDamage = (ev: BattleEvent[], pos: Pos) => of(ev, 'damage').filter((d) => d.cause === 'move' && d.pos.side === pos.side && d.pos.slot === pos.slot);

describe('Teleport', () => {
  it('lets a lone wild creature slip away, ending the battle with nobody winning', () => {
    const abra = mon('abra', 8, ['teleport']);
    const b = battle([mon('splashpup', 10, ['growl'])], [abra], { kind: 'wild', foeAi: 'wild' });
    const ev = turn(b, [use()], { '1:0': { kind: 'move', move: 0 } });
    expect(b.phase).toBe('ended');
    expect(b.winner).toBeNull();
    expect(b.escaped).toBe(false);
    expect(said(ev, 'teleported away')).toBe(true);
    expect(of(ev, 'end')[0].reason).toBe('run');
    b.commit();
    // The overworld reads the spent PP to make the wild Abra vanish.
    expect(abra.moves[0].pp).toBe(19);
  });

  it("gets the player out of a wild battle, but fails against a trainer", () => {
    const wild = battle([mon('abra', 10, ['teleport'])], [mon('nibblet', 5, ['growl'])], { kind: 'wild', foeAi: 'wild' });
    turn(wild, [use()]);
    expect(wild.phase).toBe('ended');
    expect(wild.escaped).toBe(true);
    const trainer = battle([mon('abra', 10, ['teleport'])], [mon('nibblet', 5, ['growl'])]);
    const ev = turn(trainer, [use()]);
    expect(of(ev, 'fail')).toHaveLength(1);
    expect(trainer.phase).not.toBe('ended');
  });

  it('is what a wild Abra picks', () => {
    const b = battle([mon('splashpup', 10, ['tackle'])], [mon('abra', 8, ['teleport'])], { kind: 'wild', foeAi: 'wild' });
    expect(chooseAction(b, F0, 'move')).toMatchObject({ kind: 'move', move: 0 });
  });
});

describe('fixed and variable damage', () => {
  it("Seismic Toss deals the user's level, whatever the matchup", () => {
    const b = battle([mon('mankey', 13, ['seismic-toss'])], [mon('geodude', 20, ['defense-curl'], { ability: 'rock-head' })]);
    const ev = turn(b, [use()]);
    expect(moveDamage(ev, F0)[0].amount).toBe(13);
    expect(said(ev, 'super effective')).toBe(false);
  });

  it("Super Fang halves the target's current HP", () => {
    const b = battle([mon('nibblet', 20, ['super-fang'], { ability: 'run-away' })], [mon('selkira', 40, ['withdraw'])]);
    let hits = 0;
    for (let i = 0; i < 6; i++) {
      const before = b.at(F0)!.hp;
      const d = moveDamage(turn(b, [use()]), F0)[0];
      if (!d) continue;
      hits++;
      expect(d.amount).toBe(Math.max(1, Math.floor(before / 2)));
    }
    expect(hits).toBeGreaterThan(2);
  });

  it('powers Electro Ball by speed, Stored Power by boosts, Venoshock by poison and Assurance by earlier damage', () => {
    const b = battle([mon('pikachu', 20, ['electro-ball', 'stored-power', 'venoshock', 'assurance'], { ability: 'static' })], [mon('selkira', 20, ['withdraw'])]);
    const est = (id: string) => b.estimateDamage(P0, id, F0).max;
    const foe = b.at(F0)!;
    const ball = est('electro-ball');
    foe.boosts.spe = -6;
    expect(est('electro-ball')).toBeGreaterThan(ball * 2);
    const stored = est('stored-power');
    b.at(P0)!.boosts.spa = 2;
    expect(est('stored-power')).toBeGreaterThan(stored * 2);
    b.at(P0)!.boosts.spa = 0;
    const veno = est('venoshock');
    foe.status = 'psn';
    expect(est('venoshock')).toBeGreaterThanOrEqual(veno * 2 - 2);
    const assurance = est('assurance');
    foe.hurtThisTurn = true;
    expect(est('assurance')).toBeGreaterThanOrEqual(assurance * 2 - 2);
  });
});

describe('binding, Rapid Spin and Rest', () => {
  it('Wrap chips 1/8 every turn until Rapid Spin frees the target', () => {
    const b = battle([mon('ekans', 20, ['wrap', 'leer'], { ability: 'shed-skin' })], [mon('nibblet', 20, ['growl', 'rapid-spin'], { ability: 'run-away' })]);
    let bound = false;
    for (let i = 0; i < 6 && !bound; i++) {
      const ev = turn(b, [use(0)], { '1:0': { kind: 'move', move: 0 } });
      bound = said(ev, 'trapped by Wrap');
      if (bound) {
        const chip = of(ev, 'damage').find((d) => d.text?.includes('hurt by Wrap'));
        expect(chip?.amount).toBe(Math.floor(b.at(F0)!.maxHp / 8));
      }
    }
    expect(bound).toBe(true);
    const ev = turn(b, [use(1)], { '1:0': { kind: 'move', move: 1, target: P0 } });
    expect(said(ev, 'spun itself free')).toBe(true);
    expect(b.at(F0)!.bound).toBe(0);
    expect(of(ev, 'damage').some((d) => d.text?.includes('hurt by Wrap'))).toBe(false);
  });

  it('Rest restores all HP, cures status and sleeps for two turns', () => {
    const b = battle([mon('jigglypuff', 15, ['rest'], { ability: 'friend-guard' })], [mon('nibblet', 10, ['growl'], { ability: 'run-away' })]);
    const m = b.at(P0)!;
    expect(of(turn(b, [use()]), 'fail')).toHaveLength(1); // full HP
    m.hp = 1;
    m.status = 'psn';
    turn(b, [use()]);
    expect(m.hp).toBe(m.maxHp);
    expect(m.status).toBe('slp');
    expect(of(turn(b, [use()]), 'cant')).toHaveLength(1);
    expect(of(turn(b, [use()]), 'cant')).toHaveLength(1);
    const ev = turn(b, [use()]);
    expect(said(ev, 'woke up')).toBe(true);
    expect(m.status).toBeUndefined();
  });
});

describe('item moves', () => {
  it('Knock Off hits harder against an item and knocks it away until the battle ends', () => {
    const foe = mon('selkira', 40, ['withdraw'], { item: 'oran-berry' });
    const b = battle([mon('meowth', 15, ['knock-off'], { ability: 'pickup' })], [foe]);
    const withItem = b.estimateDamage(P0, 'knock-off', F0).max;
    const ev = turn(b, [use()]);
    expect(said(ev, 'knocked off')).toBe(true);
    expect(b.at(F0)!.item).toBeUndefined();
    expect(b.estimateDamage(P0, 'knock-off', F0).max).toBeLessThan(withItem);
    b.commit();
    expect(foe.item).toBe('oran-berry');
  });

  it('Incinerate burns up a berry for good', () => {
    const foe = mon('selkira', 40, ['withdraw'], { item: 'oran-berry' });
    const b = battle([mon('vulpix', 15, ['incinerate'], { ability: 'flash-fire' })], [foe]);
    const ev = turn(b, [use()]);
    expect(said(ev, 'burnt up')).toBe(true);
    b.commit();
    expect(foe.item).toBeUndefined();
  });
});

describe('conditional moves', () => {
  it('Sucker Punch only works against an attack', () => {
    const b = battle([mon('meowth', 20, ['sucker-punch'], { ability: 'pickup' })], [mon('selkira', 30, ['withdraw', 'tackle'])]);
    expect(of(turn(b, [use()], { '1:0': { kind: 'move', move: 0 } }), 'fail')).toHaveLength(1);
    expect(moveDamage(turn(b, [use()], { '1:0': { kind: 'move', move: 1, target: P0 } }), F0)).toHaveLength(1);
  });

  it('Feint hits through Protect', () => {
    const b = battle([mon('nibblet', 20, ['feint'], { ability: 'run-away' })], [mon('selkira', 30, ['protect'])]);
    const ev = turn(b, [use()], { '1:0': { kind: 'move', move: 0 } });
    expect(said(ev, 'fell for the feint')).toBe(true);
    expect(moveDamage(ev, F0)).toHaveLength(1);
  });

  it('Self-Destruct knocks out the user unless Damp is on the field', () => {
    const boom = battle([mon('geodude', 15, ['self-destruct'], { ability: 'rock-head' }), mon('splashpup', 15, ['tackle'])], [mon('selkira', 40, ['withdraw'])]);
    const ev = turn(boom, [use(), use()]);
    expect(of(ev, 'faint').some((f) => f.pos.side === 0 && f.pos.slot === 0)).toBe(true);
    // It hits the ally too.
    expect(moveDamage(ev, P1).length).toBeGreaterThan(0);
    const damp = battle([mon('geodude', 15, ['self-destruct'], { ability: 'rock-head' })], [mon('psyduck', 40, ['tail-whip'], { ability: 'damp' })]);
    const ev2 = turn(damp, [use()]);
    expect(said(ev2, 'Damp')).toBe(true);
    expect(damp.at(P0)!.fainted).toBe(false);
  });

  it('Focus Energy raises the critical-hit stage once, and Soak makes the target pure Water', () => {
    const b = battle([mon('nibblet', 20, ['focus-energy', 'soak'], { ability: 'run-away' })], [mon('fernfawn', 20, ['growl'])]);
    expect(said(turn(b, [use(0)]), 'getting pumped')).toBe(true);
    expect(b.at(P0)!.focusEnergy).toBe(true);
    expect(of(turn(b, [use(0)]), 'fail')).toHaveLength(1);
    turn(b, [use(1)]);
    expect(b.at(F0)!.types).toEqual(['water']);
  });

  it('Life Dew heals both partners and Howl raises both their Attack', () => {
    const b = battle([mon('splashpup', 20, ['life-dew']), mon('hjordpup', 20, ['howl'], { ability: 'flash-fire' })], [mon('nibblet', 5, ['growl'], { ability: 'run-away' })]);
    const a = b.at(P0)!, c = b.at(P1)!;
    a.hp = 10;
    c.hp = 10;
    turn(b, [use(0), use(0)]);
    expect(a.hp).toBe(10 + Math.ceil(a.maxHp / 4));
    expect(c.hp).toBe(10 + Math.ceil(c.maxHp / 4));
    // Growl took one stage off each; Howl put one back on each.
    expect(a.boosts.atk).toBe(0);
    expect(c.boosts.atk).toBe(0);
  });
});

describe('abilities', () => {
  it('Magic Guard ignores poison and Rock Head ignores recoil', () => {
    const b = battle([mon('cloveret', 20, ['growl'], { ability: 'magic-guard' }), mon('geodude', 20, ['take-down'], { ability: 'rock-head' })], [mon('selkira', 40, ['withdraw'])]);
    b.at(P0)!.status = 'psn';
    let landed = 0;
    for (let i = 0; i < 4; i++) {
      const ev = turn(b, [use(), use()]);
      landed += moveDamage(ev, F0).length;
      expect(of(ev, 'damage').filter((d) => d.pos.side === 0 && d.cause !== 'move')).toHaveLength(0);
    }
    expect(landed).toBeGreaterThan(0);
    // Without Rock Head, Take Down hurts the user.
    const s = battle([mon('geodude', 20, ['take-down'], { ability: 'sturdy' })], [mon('selkira', 40, ['withdraw'])]);
    let recoil = 0;
    for (let i = 0; i < 4; i++) recoil += of(turn(s, [use()]), 'damage').filter((d) => d.cause === 'recoil').length;
    expect(recoil).toBeGreaterThan(0);
  });

  it('Adaptability makes same-type moves 2x and Tinted Lens doubles resisted hits', () => {
    const adapt = battle([mon('eevee', 20, ['tackle'], { ability: 'adaptability' })], [mon('selkira', 20, ['withdraw'])]);
    const plain = battle([mon('eevee', 20, ['tackle'], { ability: 'run-away' })], [mon('selkira', 20, ['withdraw'])]);
    const a = adapt.estimateDamage(P0, 'tackle', F0).max, p = plain.estimateDamage(P0, 'tackle', F0).max;
    expect(a / p).toBeGreaterThan(1.25);
    expect(a / p).toBeLessThan(1.45);
    expect(calcDamage({ level: 50, power: 80, attack: 100, defense: 100, random: 100, effectiveness: 1, stab: 2 })).toBeGreaterThan(calcDamage({ level: 50, power: 80, attack: 100, defense: 100, random: 100, effectiveness: 1, stab: true }));
    const tinted = battle([mon('auroramoth', 20, ['bug-bite'], { ability: 'tinted-lens' })], [mon('cindlet', 20, ['growl'])]);
    const eyes = battle([mon('auroramoth', 20, ['bug-bite'], { ability: 'compound-eyes' })], [mon('cindlet', 20, ['growl'])]);
    expect(tinted.estimateDamage(P0, 'bug-bite', F0).max).toBeGreaterThanOrEqual(eyes.estimateDamage(P0, 'bug-bite', F0).max * 2 - 1);
  });

  it('Lightning Rod soaks up Electric moves and raises Sp. Atk', () => {
    const b = battle([mon('pikachu', 20, ['thunder-shock'], { ability: 'static' })], [mon('pikachu', 20, ['growl'], { ability: 'lightning-rod' })]);
    const ev = turn(b, [use()]);
    expect(moveDamage(ev, F0)).toHaveLength(0);
    expect(b.at(F0)!.boosts.spa).toBe(1);
    expect(b.estimateDamage(P0, 'thunder-shock', F0).max).toBe(0);
  });

  it('Defiant and Competitive answer Intimidate', () => {
    const b = battle([mon('mankey', 20, ['leer'], { ability: 'defiant' }), mon('jigglypuff', 20, ['growl'], { ability: 'competitive' })], [mon('ekans', 20, ['leer'], { ability: 'intimidate' })]);
    expect(b.at(P0)!.boosts.atk).toBe(1);
    expect(b.at(P1)!.boosts.atk).toBe(-1);
    expect(b.at(P1)!.boosts.spa).toBe(2);
  });

  it('Vital Spirit stays awake', () => {
    const b = battle([mon('mankey', 20, ['leer'], { ability: 'vital-spirit' })], [mon('jigglypuff', 20, ['sing'], { ability: 'friend-guard' })]);
    let blocked = false;
    for (let i = 0; i < 8; i++) {
      blocked = said(turn(b, [use()]), 'Vital Spirit') || blocked;
      expect(b.at(P0)!.status).toBeUndefined();
    }
    expect(blocked).toBe(true);
  });

  it('Poison Point poisons attackers that touch it', () => {
    const b = battle([mon('nibblet', 20, ['tackle'], { ability: 'run-away' })], [mon('nidoran-f', 40, ['growl'], { ability: 'poison-point' })]);
    let poisoned = false;
    for (let i = 0; i < 15 && !poisoned; i++) {
      turn(b, [use()]);
      poisoned = b.at(P0)!.status === 'psn';
    }
    expect(poisoned).toBe(true);
  });

  it('Anger Point maxes Attack after a critical hit; Justified raises it after a Dark move', () => {
    const b = battle([mon('fernfawn', 20, ['focus-energy', 'razor-leaf'])], [mon('mankey', 40, ['leer'], { ability: 'anger-point' })]);
    turn(b, [use(0)]);
    // Focus Energy (+2) and Razor Leaf (+1) always land a critical hit.
    let ev: BattleEvent[] = [];
    for (let i = 0; i < 4 && !moveDamage(ev, F0).length; i++) ev = turn(b, [use(1)]);
    expect(said(ev, 'A critical hit')).toBe(true);
    expect(b.at(F0)!.boosts.atk).toBe(6);
    const j = battle([mon('nibblet', 20, ['bite'], { ability: 'run-away' })], [mon('hjordpup', 40, ['leer'], { ability: 'justified' })]);
    turn(j, [use()]);
    expect(j.at(F0)!.boosts.atk).toBe(1);
  });

  it('Unnerve stops foes eating berries', () => {
    const run = (ability: string) => {
      const b = battle([mon('splashpup', 20, ['withdraw'], { item: 'oran-berry' })], [mon('meowth', 25, ['scratch'], { ability })]);
      b.at(P0)!.hp = Math.floor(b.at(P0)!.maxHp / 2) + 3;
      return of(turn(b, [use()]), 'item').length;
    };
    expect(run('unnerve')).toBe(0);
    expect(run('pickup')).toBe(1);
  });
});
