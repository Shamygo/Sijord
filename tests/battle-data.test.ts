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
      expect(defaultMoves(sp.id, 2).some((m) => MOVES[m].category !== 'status'), sp.id).toBe(true);
    }
  });

  it('follows the dex plan stat totals for the starters (318 / 405 / 530)', () => {
    const bst = (id: string) => STATS.reduce((a, s) => a + SPECIES[id].baseStats[s], 0);
    for (const s of STARTERS) {
      expect(bst(s)).toBe(318);
      const mid = SPECIES[s].evolution!.into;
      expect(bst(mid)).toBe(405);
      expect(bst(SPECIES[mid].evolution!.into)).toBe(530);
    }
    expect(bst('skjaldhawk')).toBe(490);
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
    for (const m of Object.values(MOVES)) {
      expect(m.pp).toBeGreaterThan(0);
      if (m.category === 'status') expect(m.power).toBe(0);
      else expect(m.power, m.id).toBeGreaterThan(0);
      if (m.accuracy !== true) expect(m.accuracy).toBeLessThanOrEqual(100);
    }
  });
});

describe('creatures', () => {
  it('creates a creature with the four latest moves and full HP', () => {
    const c = createCreature('fernfawn', 10, new Rng(1));
    expect(c.moves.map((m) => m.id)).toEqual(['growl', 'leafage', 'leech-seed', 'quick-attack']);
    expect(c.hp).toBe(maxHp(c));
    expect(c.xp).toBe(xpForLevel('medium-slow', 10));
  });

  it('levels up, learns moves into free slots and queues the rest', () => {
    const c = createCreature('cindlet', 5, new Rng(2), { moves: ['scratch', 'leer'] });
    const res = gainXp(c, xpForLevel('medium-slow', 7) - c.xp, 15);
    expect(c.level).toBe(7);
    expect(res.levelsGained).toBe(2);
    expect(res.learned).toEqual(['quick-attack']);
    const full = createCreature('cindlet', 8, new Rng(3), { moves: ['scratch', 'leer', 'ember', 'quick-attack'] });
    const r2 = gainXp(full, xpForLevel('medium-slow', 9) - full.xp, 15);
    expect(r2.pendingMoves).toEqual(['bite']);
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
    const c = createCreature('dewmite', 7, new Rng(5));
    const res = gainXp(c, xpForLevel('medium-fast', 8) - c.xp, 15);
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
