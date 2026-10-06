import { describe, expect, it } from 'vitest';
import { createCreature, defaultMoves, evolve, gainXp, healCreature, maxHp, releaseBankedXp } from '../src/shared/battle/creature';
import { Rng } from '../src/shared/battle/rng';
import { xpForLevel } from '../src/shared/battle/stats';
import { STATS, TYPES } from '../src/shared/battle/types';
import { ABILITIES } from '../src/shared/data/abilities';
import { MOVES } from '../src/shared/data/moves';
import { SPECIES, SPECIES_IDS, STARTERS } from '../src/shared/data/species';

describe('species, moves and abilities data', () => {
  it('has about 20 species, 60+ moves and 20+ abilities', () => {
    expect(SPECIES_IDS.length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(MOVES).length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(ABILITIES).length).toBeGreaterThanOrEqual(20);
  });

  it('only references moves, abilities and species that exist', () => {
    for (const sp of Object.values(SPECIES)) {
      for (const a of [...sp.abilities, ...(sp.hiddenAbility ? [sp.hiddenAbility] : [])]) expect(ABILITIES[a], `${sp.id} ability ${a}`).toBeDefined();
      for (const e of sp.learnset) expect(MOVES[e.move], `${sp.id} learns ${e.move}`).toBeDefined();
      if (sp.evolution) expect(SPECIES[sp.evolution.into], `${sp.id} evolves`).toBeDefined();
      for (const t of sp.types) expect(TYPES).toContain(t);
      for (const s of STATS) expect(sp.baseStats[s]).toBeGreaterThan(0);
    }
  });

  it('keeps learnsets in level order and starts every species with a damaging move', () => {
    for (const sp of Object.values(SPECIES)) {
      const levels = sp.learnset.map((e) => e.level);
      expect([...levels].sort((a, b) => a - b), sp.id).toEqual(levels);
      // Abra is the one exception, as in the mainline games: it only knows Teleport.
      if (sp.id === 'abra') {
        expect(defaultMoves(sp.id, 15)).toEqual(['teleport']);
        continue;
      }
      expect(defaultMoves(sp.id, 2).some((m) => MOVES[m].category !== 'status'), sp.id).toBe(true);
    }
  });

  it('uses the canonical base stat totals', () => {
    const bst = (id: string) => STATS.reduce((a, s) => a + SPECIES[id].baseStats[s], 0);
    const lines: [string, number][][] = [
      [['fernfawn', 318], ['bramblebuck', 405], ['elkwarden', 525]],
      [['cindlet', 309], ['pyrolynx', 405], ['forgelynx', 534]],
      [['splashpup', 314], ['sealkin', 405], ['selkira', 530]],
    ];
    for (const [i, s] of STARTERS.entries()) {
      expect(lines[i][0][0]).toBe(s);
      for (const [id, total] of lines[i]) expect(bst(id), id).toBe(total);
      expect(SPECIES[s].evolution).toEqual({ into: lines[i][1][0], level: 16 });
      expect(SPECIES[lines[i][1][0]].evolution).toEqual({ into: lines[i][2][0], level: s === 'fernfawn' ? 32 : 36 });
    }
    expect(bst('skjaldhawk')).toBe(479);
    expect(bst('pikachu')).toBe(320);
    expect(bst('abra')).toBe(310);
    expect(SPECIES.nibblet.baseStats).toEqual({ hp: 30, atk: 56, def: 35, spa: 25, spd: 35, spe: 72 });
  });

  it('gives evolved forms everything their earlier form learns by then', () => {
    for (const sp of Object.values(SPECIES)) {
      if (!sp.evolution) continue;
      const next = SPECIES[sp.evolution.into];
      const before = sp.learnset.filter((e) => e.level < sp.evolution!.level).map((e) => e.move);
      const after = new Set(next.learnset.map((e) => e.move));
      for (const m of before) expect(after.has(m), `${next.id} keeps ${m}`).toBe(true);
    }
  });

  it('has valid numbers on every move', () => {
    // Fixed-damage and variable-power moves list no base power, as in the games.
    const noPower = new Set(['seismic-toss', 'super-fang', 'electro-ball']);
    for (const m of Object.values(MOVES)) {
      expect(m.pp).toBeGreaterThan(0);
      if (m.category === 'status' || noPower.has(m.special ?? '')) expect(m.power, m.id).toBe(0);
      else expect(m.power, m.id).toBeGreaterThan(0);
      if (m.accuracy !== true) expect(m.accuracy).toBeLessThanOrEqual(100);
    }
  });
});

describe('creatures', () => {
  it('creates a creature with the four latest moves and full HP', () => {
    const c = createCreature('fernfawn', 10, new Rng(1));
    expect(c.moves.map((m) => m.id)).toEqual(['growl', 'vine-whip', 'growth', 'leech-seed']);
    expect(c.hp).toBe(maxHp(c));
    expect(c.xp).toBe(xpForLevel('medium-slow', 10));
  });

  it('levels up, learns moves into free slots and queues the rest', () => {
    const c = createCreature('cindlet', 6, new Rng(2), { moves: ['scratch', 'growl'] });
    const res = gainXp(c, xpForLevel('medium-slow', 8) - c.xp, 15);
    expect(c.level).toBe(8);
    expect(res.levelsGained).toBe(2);
    expect(res.learned).toEqual(['smokescreen']);
    const full = createCreature('cindlet', 11, new Rng(3), { moves: ['scratch', 'growl', 'ember', 'smokescreen'] });
    const r2 = gainXp(full, xpForLevel('medium-slow', 12) - full.xp, 15);
    expect(r2.pendingMoves).toEqual(['dragon-breath']);
  });

  it('stops at the level cap and banks at most one level of experience', () => {
    const c = createCreature('nibblet', 14, new Rng(4));
    const res = gainXp(c, 100000, 15);
    expect(c.level).toBe(15);
    const levelWorth = xpForLevel('medium-fast', 16) - xpForLevel('medium-fast', 15);
    expect(c.bankedXp).toBe(levelWorth);
    expect(res.banked).toBe(levelWorth);
    expect(c.xp).toBe(xpForLevel('medium-fast', 15));
    // More experience at the cap changes nothing.
    gainXp(c, 5000, 15);
    expect(c.bankedXp).toBe(levelWorth);
    // When the cap rises the bank pays out.
    releaseBankedXp(c, 21);
    expect(c.level).toBe(16);
    expect(c.bankedXp).toBe(0);
  });

  it('flags and performs evolution', () => {
    const c = createCreature('dewmite', 6, new Rng(5));
    const res = gainXp(c, xpForLevel('medium-fast', 7) - c.xp, 15);
    expect(res.evolveInto).toBe('cocoonch');
    const hpBefore = c.hp;
    evolve(c, 'cocoonch');
    expect(c.species).toBe('cocoonch');
    expect(c.hp).toBeGreaterThanOrEqual(hpBefore);
    expect(SPECIES[c.species].abilities).toContain(c.ability);
  });

  it('heals fully', () => {
    const c = createCreature('splashpup', 5, new Rng(6));
    c.hp = 1;
    c.status = 'brn';
    c.moves[0].pp = 0;
    healCreature(c);
    expect(c.hp).toBe(maxHp(c));
    expect(c.status).toBeUndefined();
    expect(c.moves[0].pp).toBe(MOVES[c.moves[0].id].pp);
  });
});
